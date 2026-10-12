"use client";

import AppNav from "@/components/AppNav";

export type ProfileSearchResult = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  profile_pic_url: string | null;
  bio: string | null;
  skills: string | null;
  interests: string | null;
  user_role: string | null;
  academic_level: string | null;
  batch: string | null;
  session: string | null;
  graduation_year: number | null;
  current_position: string | null;
  company_or_institution: string | null;
  research_area: string | null;
  expertise: string | null;
  mentorship_available: boolean | null;
  profile_completion_score: number | null;
};

export type SuggestedResearcher = ProfileSearchResult & {
  suggestion_score: number;
  suggestion_reason: string;
};

export type ContentSearchResult = {
  id: string;
  user_id: string | null;
  title: string | null;
  content: string | null;
  abstract: string | null;
  post_type: string | null;
  content_category: string | null;
  keywords: string | null;
  created_at: string | null;
  owner: ProfileSearchResult | null;
};

type SearchUIProps = {
  loading: boolean;
  query: string;
  profiles: ProfileSearchResult[];
  contents: ContentSearchResult[];
  suggestions: SuggestedResearcher[];
  recentSearches: string[];
  setQuery: (value: string) => void;
  handleSearchSubmit: () => void;
  handleOpenProfile: (profileId: string, source?: string) => void;
  handleOpenPost: (postId: string) => void;
};

function displayName(profile: ProfileSearchResult | null | undefined) {
  return (
    profile?.full_name ||
    profile?.email?.split("@")[0] ||
    "ResearchGram User"
  );
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ");
}

function formatTime(dateString: string | null) {
  if (!dateString) return "Unknown time";

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "Unknown time";
  }
}

function ProfileAvatar({
  profile,
  size = "md",
}: {
  profile: ProfileSearchResult;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "h-16 w-16 text-2xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-lg";

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100`}
    >
      {profile.profile_pic_url ? (
        // Avatar from Supabase Storage: a plain <img> so it does not use
        // Vercel's image-optimization quota.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.profile_pic_url}
          alt={displayName(profile)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-bold text-blue-700">
          {displayName(profile).charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  onOpen,
  source,
}: {
  profile: ProfileSearchResult;
  onOpen: (profileId: string, source?: string) => void;
  source: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <ProfileAvatar profile={profile} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold text-gray-950">
              {displayName(profile)}
            </h3>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-700">
              {formatLabel(profile.user_role)}
            </span>

            {profile.mentorship_available && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                Mentor
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-500">
            {profile.department || "Research community"}
            {profile.academic_level ? ` · ${profile.academic_level}` : ""}
          </p>

          {(profile.current_position || profile.company_or_institution) && (
            <p className="mt-1 text-sm text-gray-600">
              {profile.current_position || "Researcher"}
              {profile.company_or_institution
                ? ` at ${profile.company_or_institution}`
                : ""}
            </p>
          )}

          {profile.bio && (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">
              {profile.bio}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {profile.skills && (
              <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                Skills: {profile.skills}
              </span>
            )}

            {profile.interests && (
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                Interests: {profile.interests}
              </span>
            )}
          </div>

          <button
            onClick={() => onOpen(profile.id, source)}
            className="mt-4 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            View Profile
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({
  profile,
  onOpen,
}: {
  profile: SuggestedResearcher;
  onOpen: (profileId: string, source?: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(profile.id, "suggestion")}
      className="w-full rounded-3xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <ProfileAvatar profile={profile} size="md" />

        <div className="min-w-0">
          <p className="truncate font-bold text-gray-950">
            {displayName(profile)}
          </p>

          <p className="mt-1 text-xs capitalize text-gray-500">
            {formatLabel(profile.user_role)} ·{" "}
            {profile.department || "Research community"}
          </p>

          <p className="mt-2 text-xs leading-5 text-blue-700">
            {profile.suggestion_reason}
          </p>
        </div>
      </div>
    </button>
  );
}

function ContentCard({
  content,
  onOpen,
}: {
  content: ContentSearchResult;
  onOpen: (postId: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold capitalize text-indigo-700">
          {formatLabel(content.content_category)}
        </span>

        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-700">
          {formatLabel(content.post_type)}
        </span>

        <span className="text-xs text-gray-500">
          {formatTime(content.created_at)}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold text-gray-950">
        {content.title || "Untitled research post"}
      </h3>

      <p className="mt-2 text-sm text-gray-500">
        By {displayName(content.owner)}
        {content.owner?.department ? ` · ${content.owner.department}` : ""}
      </p>

      {content.abstract ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">
          {content.abstract}
        </p>
      ) : (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">
          {content.content || "No preview available."}
        </p>
      )}

      {content.keywords && (
        <p className="mt-3 text-xs font-semibold text-purple-700">
          Keywords: {content.keywords}
        </p>
      )}

      <button
        onClick={() => onOpen(content.id)}
        className="mt-4 rounded-full bg-gray-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
      >
        Open Post
      </button>
    </div>
  );
}

export default function SearchUI({
  loading,
  query,
  profiles,
  contents,
  suggestions,
  recentSearches,
  setQuery,
  handleSearchSubmit,
  handleOpenProfile,
  handleOpenPost,
}: SearchUIProps) {
  const hasQuery = query.trim().length > 0;

  return (
    <main className="min-h-screen bg-gray-100">
      <AppNav activePage="researchers" />

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-950">Global Search</h1>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            Search researchers, alumni, faculty, mentors, papers, posts,
            datasets, and research content.
          </p>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <input
              aria-label="Search ResearchGram"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchSubmit();
              }}
              placeholder="Search AI, alumni, machine learning, professor, paper title..."
              className="flex-1 rounded-2xl border border-gray-200 px-5 py-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
            />

            <button
              onClick={handleSearchSubmit}
              className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Search
            </button>
          </div>

          {recentSearches.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                Recent:
              </span>

              {recentSearches.slice(0, 6).map((item, index) => (
                <button
                  key={`${item}-${index}`}
                  onClick={() => {
                    setQuery(item);
                  }}
                  className="rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-blue-50 hover:text-blue-700"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <section aria-label="Smart suggestions" className="space-y-4 lg:col-span-4">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">
                Smart Suggestions
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Based on your department, skills, interests, profile type, and
                recent search activity.
              </p>
            </div>

            {suggestions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
                <p className="text-sm text-gray-500">
                  Complete your profile and search more to improve suggestions.
                </p>
              </div>
            ) : (
              suggestions.map((profile) => (
                <SuggestionCard
                  key={profile.id}
                  profile={profile}
                  onOpen={handleOpenProfile}
                />
              ))
            )}
          </section>

          <section className="space-y-6 lg:col-span-8">
            {loading ? (
              <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
                <p className="text-gray-500">Searching...</p>
              </div>
            ) : !hasQuery ? (
              <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-2xl">
                  🔎
                </div>

                <h2 className="text-xl font-bold text-gray-950">
                  Start searching
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  Try searching by research area, skill, alumni role, faculty
                  name, paper title, or department.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-bold text-gray-950">
                    Researchers ({profiles.length})
                  </h2>

                  <div className="mt-4 space-y-4">
                    {profiles.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
                        <p className="text-sm text-gray-500">
                          No matching researchers found.
                        </p>
                      </div>
                    ) : (
                      profiles.map((profile) => (
                        <ProfileCard
                          key={profile.id}
                          profile={profile}
                          source="search"
                          onOpen={handleOpenProfile}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-950">
                    Research Content ({contents.length})
                  </h2>

                  <div className="mt-4 space-y-4">
                    {contents.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
                        <p className="text-sm text-gray-500">
                          No matching posts or papers found.
                        </p>
                      </div>
                    ) : (
                      contents.map((content) => (
                        <ContentCard
                          key={content.id}
                          content={content}
                          onOpen={handleOpenPost}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}