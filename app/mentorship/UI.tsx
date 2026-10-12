"use client";
import AppNav from "@/components/AppNav";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  department: string | null;
  skills: string | null;
  interests: string | null;
  bio: string | null;
  profile_pic_url: string | null;
  user_role: string | null;
  academic_level: string | null;
  expertise: string | null;
  mentorship_available: boolean | null;
  office_hours: string | null;
};

export type ExistingMentorshipRequest = {
  id: string;
  receiver_id: string;
  status: string;
};

export type MentorRecommendation = {
  profile: Profile;
  score: number;
  reasons: string[];
  matchedKeywords: string[];
  existingRequest?: ExistingMentorshipRequest | null;
};

type MentorshipUIProps = {
  loading: boolean;

  /** Possible mentors (offer mentorship, faculty or alumni). */
  profiles: Profile[];
  /** All other profiles, counted in the database. */
  profileCount?: number;
  existingRequests: ExistingMentorshipRequest[];
  mentorCandidates: Profile[];
  mentorRecommendations: MentorRecommendation[];

  searchQuery: string;
  roleFilter: string;

  myRole: string;
  myAcademicLevel: string;
  myExpertise: string;
  myOfficeHours: string;
  myMentorshipAvailable: boolean;

  savingProfile: boolean;
  requestingId: string | null;

  setSearchQuery: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setMyRole: (value: string) => void;
  setMyAcademicLevel: (value: string) => void;
  setMyExpertise: (value: string) => void;
  setMyOfficeHours: (value: string) => void;
  setMyMentorshipAvailable: (value: boolean) => void;

  handleSaveMentorProfile: () => void;
  handleSendMentorshipRequest: (mentor: Profile) => void;
  handleGoToRequests: () => void;
  handleGoToProfile: (profileId: string) => void;
};

const ROLE_OPTIONS = [
  { value: "student", label: "Student" },
  { value: "faculty", label: "Faculty Mentor" },
  { value: "alumni", label: "Alumni Mentor" },
];

function getDisplayName(profile: Profile | null) {
  return (
    profile?.full_name ||
    profile?.email?.split("@")[0] ||
    "ResearchGram User"
  );
}

function getInitial(profile: Profile | null) {
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function roleLabel(role: string | null) {
  if (role === "faculty") return "Faculty Mentor";
  if (role === "alumni") return "Alumni Mentor";

  return "Student Researcher";
}

export default function MentorshipUI({
  loading,
  profiles,
  profileCount,
  existingRequests,
  mentorCandidates,
  mentorRecommendations,
  searchQuery,
  roleFilter,
  myRole,
  myAcademicLevel,
  myExpertise,
  myOfficeHours,
  myMentorshipAvailable,
  savingProfile,
  requestingId,
  setSearchQuery,
  setRoleFilter,
  setMyRole,
  setMyAcademicLevel,
  setMyExpertise,
  setMyOfficeHours,
  setMyMentorshipAvailable,
  handleSaveMentorProfile,
  handleSendMentorshipRequest,
  handleGoToRequests,
  handleGoToProfile,
}: MentorshipUIProps) {
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <AppNav activePage="researchers" />
        <div className="mx-auto max-w-7xl px-6 py-10 text-slate-600">
          Loading mentorship system...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppNav activePage="researchers" />

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-8 text-white shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-200">
            Mentorship matching
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Find faculty and alumni mentors for research guidance
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-100">
            ResearchGram compares research interests, skills, expertise,
            department, and mentor availability to help students request
            academic mentorship.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{profileCount ?? profiles.length}</p>
              <p className="text-sm text-blue-100">Profiles scanned</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{mentorCandidates.length}</p>
              <p className="text-sm text-blue-100">Mentor candidates</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">
                {
                  profiles.filter(
                    (profile) => profile.mentorship_available === true,
                  ).length
                }
              </p>
              <p className="text-sm text-blue-100">Available mentors</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{existingRequests.length}</p>
              <p className="text-sm text-blue-100">Requests sent</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <section aria-label="Your mentorship profile and mentor search" className="lg:col-span-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">
                My mentorship profile
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Set your role and expertise. Faculty and alumni who turn on
                mentorship appear in students&apos; mentor search.
              </p>

              <div className="mt-5 space-y-3">
                <select
                  aria-label="Your role"
                  value={myRole}
                  onChange={(e) => setMyRole(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>

                <input
                  aria-label="Academic level"
                  value={myAcademicLevel}
                  onChange={(e) => setMyAcademicLevel(e.target.value)}
                  placeholder="Academic level, e.g. Lecturer, Alumni, 3rd Year Student"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                />

                <textarea
                  aria-label="Expertise"
                  value={myExpertise}
                  onChange={(e) => setMyExpertise(e.target.value)}
                  placeholder="Expertise, e.g. Machine Learning, IoT, Data Mining, Cybersecurity"
                  className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                />

                <input
                  aria-label="Office hours or available time"
                  value={myOfficeHours}
                  onChange={(e) => setMyOfficeHours(e.target.value)}
                  placeholder="Office hours / available time"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                />

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={myMentorshipAvailable}
                    onChange={(e) => setMyMentorshipAvailable(e.target.checked)}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-bold text-slate-700">
                    Available for mentorship
                  </span>
                </label>

                <button
                  onClick={handleSaveMentorProfile}
                  disabled={savingProfile}
                  className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Update Mentorship Profile"}
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">
                Search mentors
              </h2>

              <div className="mt-5 space-y-3">
                <input
                  type="search"
                  aria-label="Search mentors by topic"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topic, e.g. AI, IoT, Networking"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                />

                <select
                  aria-label="Mentor type"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                >
                  <option value="all">All mentor types</option>
                  <option value="faculty">Faculty mentors</option>
                  <option value="alumni">Alumni mentors</option>
                </select>

                <button
                  onClick={() => {
                    setSearchQuery("");
                    setRoleFilter("all");
                  }}
                  className="w-full rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                >
                  Reset Filter
                </button>
              </div>
            </div>
          </section>

          <section className="lg:col-span-8">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-950">
                    Recommended mentors
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Sorted by mentorship match score.
                  </p>
                </div>

                <button
                  onClick={handleGoToRequests}
                  className="rounded-2xl bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  View Requests
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {mentorRecommendations.length === 0 ? (
                  <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
                    <h3 className="text-lg font-black text-amber-900">
                      No mentors found yet
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Use another account and update its role as Faculty Mentor
                      or Alumni Mentor, then enable mentorship availability.
                    </p>
                  </div>
                ) : (
                  mentorRecommendations.map((item) => {
                    const mentor = item.profile;
                    const existing = item.existingRequest;

                    return (
                      <div
                        key={mentor.id}
                        className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-blue-100">
                              {mentor.profile_pic_url ? (
                                // Avatar from Supabase Storage: a plain <img> so it does not use
                                // Vercel's image-optimization quota.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={mentor.profile_pic_url}
                                  alt={getDisplayName(mentor)}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xl font-black text-blue-700">
                                  {getInitial(mentor)}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-black text-slate-950">
                                  {getDisplayName(mentor)}
                                </h3>

                                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                                  {roleLabel(mentor.user_role)}
                                </span>

                                {mentor.mentorship_available && (
                                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700">
                                    Available
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 text-sm text-slate-500">
                                {mentor.department || "Research community"}
                                {mentor.academic_level
                                  ? ` · ${mentor.academic_level}`
                                  : ""}
                              </p>

                              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                                {mentor.bio ||
                                  mentor.expertise ||
                                  "No mentor bio added yet."}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-white">
                            <p className="text-2xl font-black">{item.score}%</p>
                            <p className="text-[10px] font-bold uppercase">
                              Mentor Match
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          {item.matchedKeywords.length > 0 ? (
                            item.matchedKeywords.slice(0, 8).map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
                              >
                                {keyword}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                              General mentorship match
                            </span>
                          )}
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase text-slate-500">
                              Expertise
                            </p>
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">
                              {mentor.expertise ||
                                mentor.skills ||
                                "Not added yet"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase text-slate-500">
                              Office Hours
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {mentor.office_hours || "Not specified"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-sm font-bold text-slate-800">
                            Why recommended
                          </p>

                          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                            {item.reasons.map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <button
                            onClick={() => handleGoToProfile(mentor.id)}
                            className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                          >
                            View Profile
                          </button>

                          <button
                            onClick={() => handleSendMentorshipRequest(mentor)}
                            disabled={
                              Boolean(existing) || requestingId === mentor.id
                            }
                            className={`rounded-2xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                              existing
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-950 text-white hover:bg-slate-800"
                            }`}
                          >
                            {requestingId === mentor.id
                              ? "Sending..."
                              : existing
                                ? `Request ${existing.status}`
                                : "Request Mentorship"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}