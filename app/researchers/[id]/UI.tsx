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
  cover_photo_url: string | null;
};

export type ResearchPost = {
  id: string;
  title: string | null;
  /** Full text, or null when this reader may only see the abstract. */
  content: string | null;
  abstract: string | null;
  post_type: string | null;
  created_at: string | null;
};

export type ConnectionStatus =
  | "self"
  | "connected"
  | "requested"
  | "received"
  | "none";

type ResearcherDetailUIProps = {
  loading: boolean;
  currentUserId: string;
  profile: ResearcherProfile | null;
  posts: ResearchPost[];
  connectionStatus: ConnectionStatus;
  connecting: boolean;

  handleSendConnectionRequest: () => void;
  handleBackToResearchers: () => void;
  handleGoToProfile: () => void;
  handleGoToFeed: () => void;
};

function splitTags(value: string | null) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTime(dateString: string | null) {
  if (!dateString) return "Unknown time";

  try {
    const date = new Date(dateString);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return "Unknown time";
  }
}

export default function ResearcherDetailUI({
  loading,
  currentUserId,
  profile,
  posts,
  connectionStatus,
  connecting,
  handleSendConnectionRequest,
  handleBackToResearchers,
  handleGoToProfile,
  handleGoToFeed,
}: ResearcherDetailUIProps) {
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg text-gray-600">Loading researcher profile...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gray-100">
        <AppNav activePage="researchers" />

        <section className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-2xl">
              ⚠️
            </div>

            <h1 className="text-2xl font-bold text-gray-950">
              Researcher not found
            </h1>

            <p className="mt-2 text-gray-500">
              This profile may have been removed or is unavailable.
            </p>

            <button
              onClick={handleBackToResearchers}
              className="mt-6 rounded-full bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Back to Researchers
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isCurrentUser = profile.id === currentUserId;
  const skillTags = splitTags(profile.skills);
  const interestTags = splitTags(profile.interests);

  return (
    <main className="min-h-screen bg-gray-100">
      <AppNav activePage="researchers" />

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="relative h-64 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600">
            {profile.cover_photo_url && (
              // Cover photo from Supabase Storage: a plain <img> so it does not use
              // Vercel's image-optimization quota.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.cover_photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}

            <div className="absolute inset-0 bg-black/10" />
          </div>

          <div className="px-6 pb-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="-mt-20 h-36 w-36 overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-br from-blue-100 to-indigo-100 shadow-lg">
                  {profile.profile_pic_url ? (
                    // Avatar from Supabase Storage: a plain <img> so it does not use
                    // Vercel's image-optimization quota.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.profile_pic_url}
                      alt={profile.full_name || "Researcher profile"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-blue-700">
                      {(profile.full_name || "R").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold text-gray-950">
                      {profile.full_name || "ResearchGram User"}
                    </h1>

                    {isCurrentUser && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        You
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-lg text-gray-600">
                    {profile.department || "Research community"}
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-500">
                    {profile.email}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {isCurrentUser ? (
                  <button
                    onClick={handleGoToProfile}
                    className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleGoToFeed}
                      className="rounded-full bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                    >
                      View Activity
                    </button>

                    <button
                      onClick={handleSendConnectionRequest}
                      disabled={
                        connecting ||
                        connectionStatus === "requested" ||
                        connectionStatus === "connected" ||
                        connectionStatus === "received"
                      }
                      className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        connectionStatus === "connected"
                          ? "bg-green-600 text-white"
                          : connectionStatus === "requested"
                            ? "bg-yellow-500 text-white"
                            : connectionStatus === "received"
                              ? "bg-purple-600 text-white"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {connecting
                        ? "Sending..."
                        : connectionStatus === "connected"
                          ? "Connected"
                          : connectionStatus === "requested"
                            ? "Request Sent"
                            : connectionStatus === "received"
                              ? "Respond in Requests"
                              : "Connect"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section aria-label="About this researcher" className="space-y-6 lg:col-span-1">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">About</h2>

              <p className="mt-4 whitespace-pre-wrap leading-7 text-gray-700">
                {profile.bio ||
                  "No bio added yet. This researcher has not completed their academic introduction."}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">Expertise</h2>

              {skillTags.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No skills added yet.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {skillTags.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-950">
                Research Interests
              </h2>

              {interestTags.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No research interests added yet.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {interestTags.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-950">
                    Recent Research Activity
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Latest posts, papers, datasets, and research updates.
                  </p>
                </div>

                <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                  {posts.length} posts
                </span>
              </div>

              {posts.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-2xl">
                    📚
                  </div>

                  <h3 className="text-lg font-bold text-gray-900">
                    No research posts yet
                  </h3>

                  <p className="mt-2 text-sm text-gray-500">
                    This researcher has not shared any public research updates
                    yet.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                          {(post.post_type || "research_update").replaceAll(
                            "_",
                            " ",
                          )}
                        </span>

                        <span className="text-xs text-gray-500">
                          {formatTime(post.created_at)}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-gray-950">
                        {post.title || "Untitled research post"}
                      </h3>

                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                        {post.content || post.abstract || "No description provided."}
                      </p>

                      <button
                        onClick={handleGoToFeed}
                        className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                      >
                        View in Feed
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}