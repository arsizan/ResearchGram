/**
 * Finds ResearchGram members working on a topic.
 *
 * This is the part no external tool can do. Elicit and Consensus can both list
 * papers on federated learning; only this platform can say "and three people in
 * your department are working on it, one of whom mentors students."
 *
 * Two ways in: the member's own profile text, and the papers they have posted
 * here. Someone who posted a paper on the topic is a stronger match than someone
 * who merely listed the keyword, so posts are weighted higher.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberMatch } from "@/lib/ai/types";

/**
 * Reduce a free-text query to safe search tokens.
 *
 * Everything except letters, digits and spaces is stripped, so nothing that
 * reaches the PostgREST filter below can be read as filter syntax. This is the
 * fix for the injection pattern in the audit (RG-16), applied up front rather
 * than bolted on later.
 */
function toSearchTokens(query: string, max = 5): string[] {
  const stopWords = new Set([
    "the", "and", "for", "with", "what", "which", "how", "why", "who",
    "are", "was", "were", "has", "have", "does", "did", "can", "using",
    "use", "used", "research", "paper", "papers", "study", "studies",
    "about", "into", "from", "that", "this", "these", "those", "best",
    "latest", "recent", "new", "work", "works",
  ]);

  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopWords.has(token)),
    ),
  ).slice(0, max);
}

const PROFILE_FIELDS =
  "id, full_name, department, user_role, academic_level, profile_pic_url, skills, interests, research_area, expertise, bio, mentorship_available";

type ProfileRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  user_role: string | null;
  academic_level: string | null;
  profile_pic_url: string | null;
  skills: string | null;
  interests: string | null;
  research_area: string | null;
  expertise: string | null;
  bio: string | null;
  mentorship_available: boolean | null;
};

/** Which of a member's fields a token hit — becomes the human-readable reason. */
function describeMatch(profile: ProfileRow, tokens: string[]): string[] {
  const haystacks: Array<[string, string | null]> = [
    ["research area", profile.research_area],
    ["expertise", profile.expertise],
    ["skills", profile.skills],
    ["interests", profile.interests],
  ];

  const hits: string[] = [];

  for (const [label, value] of haystacks) {
    if (!value) continue;
    const lower = value.toLowerCase();
    if (tokens.some((token) => lower.includes(token))) hits.push(label);
  }

  return hits;
}

export async function findMembersForTopic({
  supabase,
  query,
  excludeUserId,
  viewerDepartment,
  limit = 4,
}: {
  /** Must be a client scoped to the signed-in user, so RLS applies as them. */
  supabase: SupabaseClient;
  query: string;
  excludeUserId: string;
  viewerDepartment?: string | null;
  limit?: number;
}): Promise<MemberMatch[]> {
  const tokens = toSearchTokens(query);
  if (tokens.length === 0) return [];

  // Tokens are alphanumeric only by construction, so this filter string cannot
  // be broken out of.
  const profileFilter = tokens
    .flatMap((token) => [
      `skills.ilike.%${token}%`,
      `interests.ilike.%${token}%`,
      `research_area.ilike.%${token}%`,
      `expertise.ilike.%${token}%`,
    ])
    .join(",");

  const contentFilter = tokens
    .flatMap((token) => [
      `title.ilike.%${token}%`,
      `keywords.ilike.%${token}%`,
      `abstract.ilike.%${token}%`,
    ])
    .join(",");

  const [profileResult, contentResult] = await Promise.allSettled([
    supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .neq("id", excludeUserId)
      .or(profileFilter)
      .limit(40),
    supabase
      .from("contents")
      .select("user_id")
      .neq("user_id", excludeUserId)
      .or(contentFilter)
      .limit(120),
  ]);

  const profiles: ProfileRow[] =
    profileResult.status === "fulfilled" && !profileResult.value.error
      ? ((profileResult.value.data || []) as ProfileRow[])
      : [];

  // How many matching papers each member has posted here.
  const postCounts = new Map<string, number>();
  if (contentResult.status === "fulfilled" && !contentResult.value.error) {
    for (const row of (contentResult.value.data || []) as { user_id: string | null }[]) {
      if (!row.user_id) continue;
      postCounts.set(row.user_id, (postCounts.get(row.user_id) || 0) + 1);
    }
  }

  // Members who posted on the topic but whose profile text did not match are
  // still relevant, so pull their profiles in too.
  const missingIds = Array.from(postCounts.keys()).filter(
    (id) => !profiles.some((profile) => profile.id === id),
  );

  if (missingIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .in("id", missingIds.slice(0, 20));

    profiles.push(...((data || []) as ProfileRow[]));
  }

  const scored = profiles.map((profile) => {
    const fieldHits = describeMatch(profile, tokens);
    const posts = postCounts.get(profile.id) || 0;

    // A posted paper is the strongest signal; a listed keyword is weaker; being
    // in the reader's own department is a small nudge, because a collaborator
    // you can walk to is worth more than one you cannot.
    let score = posts * 10 + fieldHits.length * 4;
    if (profile.mentorship_available) score += 3;
    if (
      viewerDepartment &&
      profile.department &&
      profile.department.toLowerCase() === viewerDepartment.toLowerCase()
    ) {
      score += 5;
    }

    const reasonParts: string[] = [];
    if (posts > 0) {
      reasonParts.push(`posted ${posts} related ${posts === 1 ? "paper" : "papers"}`);
    }
    if (fieldHits.length > 0) {
      reasonParts.push(`lists it under ${fieldHits.slice(0, 2).join(" and ")}`);
    }
    if (profile.mentorship_available) reasonParts.push("open to mentoring");

    const match: MemberMatch = {
      id: profile.id,
      fullName: profile.full_name || "ResearchGram member",
      department: profile.department,
      userRole: profile.user_role,
      academicLevel: profile.academic_level,
      profilePicUrl: profile.profile_pic_url,
      reason: reasonParts.join(" · ") || "active research profile",
      matchingPostCount: posts,
      mentorshipAvailable: Boolean(profile.mentorship_available),
    };

    return { match, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.match);
}
