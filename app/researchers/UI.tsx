"use client";

import AppNav from "@/components/AppNav";
export type ResearcherProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  department: string | null;
  skills: string | null;
  interests: string | null;
  bio: string | null;
  profile_pic_url: string | null;
};

export type ConnectionStatus =
  | "self"
  | "connected"
  | "requested"
  | "received"
  | "none";

type ResearchersUIProps = {
  loading: boolean;
  currentUserId: string;
  searchQuery: string;
  filteredProfiles: ResearcherProfile[];
  connectionStatusMap: Record<string, ConnectionStatus>;
  connectingId: string | null;
  /** "Load more" (audit RG-06): the list comes 30 at a time. */
  hasMore?: boolean;
  loadingMore?: boolean;
  handleLoadMore?: () => void;

  setSearchQuery: (value: string) => void;
  handleSendConnectionRequest: (receiverId: string) => void;
  handleGoToProfile: () => void;
  handleGoToResearcher: (profileId: string) => void;
};

function splitTags(value: string | null) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export default function ResearchersUI({
  loading,
  currentUserId,
  searchQuery,
  filteredProfiles,
  connectionStatusMap,
  connectingId,
  hasMore = false,
  loadingMore = false,
  handleLoadMore,
  setSearchQuery,
  handleSendConnectionRequest,
  handleGoToProfile,
  handleGoToResearcher,
}: ResearchersUIProps) {
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg text-gray-600">Loading researchers...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <AppNav activePage="researchers" />

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 border-b border-gray-100 pb-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-950">
                Discover Researchers
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Find students, faculty, alumni, and researchers by department,
                skills, interests, and academic background.
              </p>
            </div>

            <div className="w-full lg:max-w-md">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, department, AI, NLP, Java..."
                aria-label="Search researchers"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredProfiles.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-2xl">
                  🔎
                </div>

                <h2 className="text-lg font-bold text-gray-900">
                  No researchers found
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  Try searching by another department, skill, or research topic.
                </p>
              </div>
            ) : (
              filteredProfiles.map((profile) => {
                const skillTags = splitTags(profile.skills);
                const interestTags = splitTags(profile.interests);
                const isCurrentUser = profile.id === currentUserId;
                const connectionStatus =
                  connectionStatusMap[profile.id] || "none";

                return (
                  <div
                    key={profile.id}
                    className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100">
                        {profile.profile_pic_url ? (
                          // Profile photos are user uploads from Supabase Storage.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.profile_pic_url}
                            alt={profile.full_name || "Researcher profile"}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-blue-700">
                            {(profile.full_name || "R").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="truncate text-lg font-bold text-gray-950">
                              {profile.full_name || "ResearchGram User"}
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                              {profile.department || "Research community"}
                            </p>
                          </div>

                          {isCurrentUser && (
                            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                              You
                            </span>
                          )}
                        </div>

                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">
                          {profile.bio ||
                            "No bio added yet. This researcher has not completed their academic introduction."}
                        </p>
                      </div>
                    </div>

                    {skillTags.length > 0 && (
                      <div className="mt-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Skills
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {skillTags.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {interestTags.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Research interests
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {interestTags.map((interest) => (
                            <span
                              key={interest}
                              className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                      {isCurrentUser ? (
                        <button
                          onClick={handleGoToProfile}
                          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleGoToResearcher(profile.id)}
                            className="rounded-full bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            View Profile
                          </button>

                          <button
                            onClick={() =>
                              handleSendConnectionRequest(profile.id)
                            }
                            disabled={
                              connectingId === profile.id ||
                              connectionStatus === "requested" ||
                              connectionStatus === "connected" ||
                              connectionStatus === "received"
                            }
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                              connectionStatus === "connected"
                                ? "bg-green-50 text-green-700"
                                : connectionStatus === "requested"
                                  ? "bg-yellow-50 text-yellow-700"
                                  : connectionStatus === "received"
                                    ? "bg-purple-50 text-purple-700"
                                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            {connectingId === profile.id
                              ? "Sending..."
                              : connectionStatus === "connected"
                                ? "Connected"
                                : connectionStatus === "requested"
                                  ? "Requested"
                                  : connectionStatus === "received"
                                    ? "Respond in Requests"
                                    : "Connect"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {hasMore && handleLoadMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-full bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? "Loading..." : "Load more researchers"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}