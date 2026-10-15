"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import MentorshipUI, {
  type ExistingMentorshipRequest,
  type MentorRecommendation,
  type Profile,
} from "./UI";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "we",
  "will",
  "research",
  "project",
  "paper",
  "study",
  "work",
]);

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[_/,-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(...values: Array<string | null | undefined>) {
  const text = values.map(normalizeText).join(" ");

  return Array.from(
    new Set(
      text
        .split(" ")
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
    ),
  );
}

function getSharedKeywords(a: string[], b: string[]) {
  const bSet = new Set(b);
  return a.filter((keyword) => bSet.has(keyword));
}

function getDisplayName(profile: Profile | null) {
  return (
    profile?.full_name ||
    profile?.email?.split("@")[0] ||
    "ResearchGram User"
  );
}

function calculateMentorMatch(
  currentProfile: Profile | null,
  mentor: Profile,
  searchQuery: string,
  existingRequest?: ExistingMentorshipRequest | null,
): MentorRecommendation {
  const studentKeywords = extractKeywords(
    currentProfile?.skills,
    currentProfile?.interests,
    currentProfile?.bio,
    currentProfile?.department,
    searchQuery,
  );

  const mentorKeywords = extractKeywords(
    mentor.skills,
    mentor.interests,
    mentor.expertise,
    mentor.bio,
    mentor.department,
    mentor.academic_level,
  );

  const matchedKeywords = getSharedKeywords(studentKeywords, mentorKeywords);

  let score = 25;
  const reasons: string[] = [];

  if (mentor.mentorship_available) {
    score += 20;
    reasons.push("Currently available for mentorship");
  }

  if (mentor.user_role === "faculty") {
    score += 18;
    reasons.push("Faculty-level academic mentor");
  }

  if (mentor.user_role === "alumni") {
    score += 15;
    reasons.push("Alumni mentor with practical experience");
  }

  if (matchedKeywords.length > 0) {
    score += Math.min(matchedKeywords.length * 10, 35);
    reasons.push(
      `Shared research areas: ${matchedKeywords.slice(0, 5).join(", ")}`,
    );
  }

  const sameDepartment =
    normalizeText(currentProfile?.department) &&
    normalizeText(currentProfile?.department) ===
      normalizeText(mentor.department);

  if (sameDepartment) {
    score += 8;
    reasons.push(`Same department: ${mentor.department}`);
  }

  if (mentor.expertise && mentor.expertise.trim().length > 0) {
    score += 7;
    reasons.push("Expertise details added");
  }

  if (mentor.office_hours && mentor.office_hours.trim().length > 0) {
    score += 5;
    reasons.push("Mentorship timing/office hours available");
  }

  if (reasons.length === 0) {
    reasons.push("General academic profile match");
  }

  return {
    profile: mentor,
    score: Math.min(score, 98),
    reasons,
    matchedKeywords,
    existingRequest,
  };
}

export default function MentorshipClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileCount, setProfileCount] = useState(0);
  const [existingRequests, setExistingRequests] = useState<
    ExistingMentorshipRequest[]
  >([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [myRole, setMyRole] = useState("student");
  const [myAcademicLevel, setMyAcademicLevel] = useState("");
  const [myExpertise, setMyExpertise] = useState("");
  const [myOfficeHours, setMyOfficeHours] = useState("");
  const [myMentorshipAvailable, setMyMentorshipAvailable] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const existingRequestMap = useMemo(() => {
    const map = new Map<string, ExistingMentorshipRequest>();

    existingRequests.forEach((request) => {
      map.set(request.receiver_id, request);
    });

    return map;
  }, [existingRequests]);

  const mentorCandidates = useMemo(() => {
    return profiles.filter((profile) => {
      if (profile.id === userId) return false;

      const isMentor =
        profile.mentorship_available ||
        profile.user_role === "faculty" ||
        profile.user_role === "alumni";

      if (!isMentor) return false;

      if (roleFilter !== "all" && profile.user_role !== roleFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;

      const searchableText = normalizeText(
        [
          profile.full_name,
          profile.department,
          profile.skills,
          profile.interests,
          profile.expertise,
          profile.bio,
          profile.academic_level,
        ].join(" "),
      );

      const searchWords = extractKeywords(searchQuery);

      return searchWords.some((word) => searchableText.includes(word));
    });
  }, [profiles, userId, roleFilter, searchQuery]);

  const mentorRecommendations = useMemo(() => {
    return mentorCandidates
      .map((profile) =>
        calculateMentorMatch(
          currentProfile,
          profile,
          searchQuery,
          existingRequestMap.get(profile.id) || null,
        ),
      )
      .sort((a, b) => b.score - a.score);
  }, [mentorCandidates, currentProfile, searchQuery, existingRequestMap]);

const loadPage = async () => {
  try {
    const authUser = await getCurrentUserSafe();

    if (!authUser) {
      router.push("/auth/login");
      return;
    }

    const activeUserId = authUser.id;
    setUserId(activeUserId);

    const { data: myProfileData, error: myProfileError } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, department, skills, interests, bio, profile_pic_url, user_role, academic_level, expertise, mentorship_available, office_hours",
      )
      .eq("id", activeUserId)
      .single();

    if (myProfileError) {
      logDev("MY PROFILE ERROR:", myProfileError);
    }

    const safeProfile = (myProfileData || null) as Profile | null;
    setCurrentProfile(safeProfile);

    if (safeProfile) {
      setMyRole(safeProfile.user_role || "student");
      setMyAcademicLevel(safeProfile.academic_level || "");
      setMyExpertise(safeProfile.expertise || "");
      setMyOfficeHours(safeProfile.office_hours || "");
      setMyMentorshipAvailable(Boolean(safeProfile.mentorship_available));
    }

    // Only possible mentors are loaded (audit RG-06): people who offer
    // mentorship, faculty and alumni. Before, every profile was downloaded and
    // filtered here. The total is counted in the database.
    const [mentorResult, countResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, full_name, department, skills, interests, bio, profile_pic_url, user_role, academic_level, expertise, mentorship_available, office_hours",
        )
        .neq("id", activeUserId)
        .or("mentorship_available.eq.true,user_role.in.(faculty,alumni)")
        .order("profile_completion_score", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("id", activeUserId),
    ]);

    if (mentorResult.error) {
      logDev("MENTOR PROFILES ERROR:", mentorResult.error);
      notify(friendlyError(mentorResult.error, "Could not load mentors."), "error");
      setProfiles([]);
    } else {
      setProfiles((mentorResult.data || []) as Profile[]);
    }

    setProfileCount(countResult.count || 0);

    const { data: requestData, error: requestError } = await supabase
      .from("profile_requests")
      .select("id, receiver_id, status")
      .eq("requester_id", activeUserId)
      .eq("request_type", "mentorship");

    if (requestError) {
      logDev("MENTORSHIP REQUESTS ERROR:", requestError);
    }

    setExistingRequests((requestData || []) as ExistingMentorshipRequest[]);
  } catch (error) {
    if (isAuthLockError(error)) {
      logDev("MENTORSHIP AUTH LOCK ERROR:", error);
      return;
    }

    logDev("MENTORSHIP LOAD ERROR:", error);
  } finally {
    setLoading(false);
  }
};

  const loadPageOnMount = useEffectEvent(() => {
    loadPage();
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an async load: its state changes come after its first await, which this rule does not follow
    loadPageOnMount();
  }, []);

  const handleSaveMentorProfile = async () => {
    if (!userId) {
      notify("You must be logged in.", "error");
      return;
    }

    setSavingProfile(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        user_role: myRole,
        academic_level: myAcademicLevel.trim() || null,
        expertise: myExpertise.trim() || null,
        office_hours: myOfficeHours.trim() || null,
        mentorship_available: myMentorshipAvailable,
      })
      .eq("id", userId);

    if (error) {
      logDev("SAVE MENTOR PROFILE ERROR:", error);
      notify(friendlyError(error, "Could not save your mentorship profile."), "error");
      setSavingProfile(false);
      return;
    }

    await loadPage();
    setSavingProfile(false);
    notify("Mentorship profile updated.", "success");
  };

  const handleSendMentorshipRequest = async (mentor: Profile) => {
    if (!userId) {
      notify("You must be logged in.", "error");
      return;
    }

    const existing = existingRequestMap.get(mentor.id);

    if (existing) {
      notify(`Mentorship request already ${existing.status}.`, "info");
      return;
    }

    setRequestingId(mentor.id);

    const message = `Hello ${getDisplayName(
      mentor,
    )}, I am interested in your mentorship guidance. My research interests are related to ${
      currentProfile?.interests || searchQuery || "your expertise"
    }. I would like to discuss research direction, resources, and possible supervision/support.`;

    const { error } = await supabase.from("profile_requests").insert({
      requester_id: userId,
      receiver_id: mentor.id,
      request_type: "mentorship",
      message,
      status: "pending",
    });

    if (error) {
      logDev("SEND MENTORSHIP REQUEST ERROR:", error);
      notify(friendlyError(error, "Could not send the mentorship request."), "error");
      setRequestingId(null);
      return;
    }

    const { data } = await supabase
      .from("profile_requests")
      .select("id, receiver_id, status")
      .eq("requester_id", userId)
      .eq("request_type", "mentorship");

    setExistingRequests((data || []) as ExistingMentorshipRequest[]);
    setRequestingId(null);
    notify("Mentorship request sent.", "success");
  };

  return (
    <MentorshipUI
      loading={loading}
      profiles={profiles}
      profileCount={profileCount}
      existingRequests={existingRequests}
      mentorCandidates={mentorCandidates}
      mentorRecommendations={mentorRecommendations}
      searchQuery={searchQuery}
      roleFilter={roleFilter}
      myRole={myRole}
      myAcademicLevel={myAcademicLevel}
      myExpertise={myExpertise}
      myOfficeHours={myOfficeHours}
      myMentorshipAvailable={myMentorshipAvailable}
      savingProfile={savingProfile}
      requestingId={requestingId}
      setSearchQuery={setSearchQuery}
      setRoleFilter={setRoleFilter}
      setMyRole={setMyRole}
      setMyAcademicLevel={setMyAcademicLevel}
      setMyExpertise={setMyExpertise}
      setMyOfficeHours={setMyOfficeHours}
      setMyMentorshipAvailable={setMyMentorshipAvailable}
      handleSaveMentorProfile={handleSaveMentorProfile}
      handleSendMentorshipRequest={handleSendMentorshipRequest}
      handleGoToRequests={() => router.push("/requests")}
      handleGoToProfile={(profileId) => router.push(`/researchers/${profileId}`)}
    />
  );
}