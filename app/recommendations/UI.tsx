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
};

export type ResearchPost = {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  post_type: string | null;
  created_at: string | null;
};

export type ExistingRequest = {
  id: string;
  receiver_id: string;
  status: string;
};

export type Recommendation = {
  profile: Profile;
  score: number;
  reasons: string[];
  matchedKeywords: string[];
  existingRequest?: ExistingRequest | null;
};

type RecommendationsUIProps = {
  loading: boolean;
  myPosts: ResearchPost[];
  /** How many other profiles the database compared with the post. */
  profileCount: number;
  /** Results for the selected idea are on their way. */
  findingMatches?: boolean;
  selectedPostId: string;
  selectedPost: ResearchPost | null;
  recommendations: Recommendation[];
  requestingId: string | null;

  setSelectedPostId: (value: string) => void;
  handleSendCollaborationRequest: (receiver: Profile) => void;
  handleGoToFeed: () => void;
};

function formatPostType(value: string | null) {
  return (value || "research_post").replaceAll("_", " ");
}

export default function RecommendationsUI({
  loading,
  myPosts,
  profileCount,
  findingMatches = false,
  selectedPostId,
  selectedPost,
  recommendations,
  requestingId,
  setSelectedPostId,
  handleSendCollaborationRequest,
  handleGoToFeed,
}: RecommendationsUIProps) {
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <AppNav activePage="feed" />
        <div className="mx-auto max-w-6xl px-6 py-10 text-slate-600">
          Loading collaborator recommendations...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppNav activePage="feed" />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-8 text-white shadow-xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">
              AI-style collaborator matching
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Find the right collaborators for your research idea
            </h1>

            <p className="mt-4 text-sm leading-7 text-blue-100">
              ResearchGram compares your post topic with researcher profiles,
              skills, interests, bio, and department to suggest suitable
              collaborators.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{profileCount}</p>
              <p className="text-sm text-blue-100">
                Researcher profiles scanned
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{myPosts.length}</p>
              <p className="text-sm text-blue-100">Your research posts</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-2xl font-black">{recommendations.length}</p>
              <p className="text-sm text-blue-100">Top recommendations</p>
            </div>
          </div>
        </div>

        {myPosts.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-xl font-bold text-amber-900">
              Post a research idea first
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              The recommendation system needs one of your research posts to
              calculate collaborator matches.
            </p>

            <button
              onClick={handleGoToFeed}
              className="mt-4 rounded-xl bg-amber-900 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-800"
            >
              Go to Feed and Post Idea
            </button>
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <label htmlFor="recommendations-post" className="text-sm font-bold text-slate-800">
                Select your research idea
              </label>

              <select
                id="recommendations-post"
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {myPosts.map((post) => (
                  <option key={post.id} value={post.id}>
                    {post.title || "Untitled research post"} —{" "}
                    {formatPostType(post.post_type)}
                  </option>
                ))}
              </select>

              {selectedPost && (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                    Selected idea
                  </p>

                  <h2 className="mt-2 text-xl font-black text-slate-950">
                    {selectedPost.title || "Untitled research post"}
                  </h2>

                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                    {selectedPost.content || "No description provided."}
                  </p>
                </div>
              )}
            </div>

            {findingMatches && (
              <p role="status" className="mt-8 text-sm font-semibold text-slate-600">
                Finding researchers for this idea…
              </p>
            )}

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {recommendations.map((item, index) => {
                const profile = item.profile;
                const status = item.existingRequest?.status;
                const isRequested = Boolean(item.existingRequest);

                return (
                  <div
                    key={profile.id}
                    className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100">
                        {profile.profile_pic_url ? (
                          // Avatar from Supabase Storage: a plain <img> so it does not use
                          // Vercel's image-optimization quota.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.profile_pic_url}
                            alt={profile.full_name || "Researcher"}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl font-black text-blue-700">
                            {(profile.full_name || profile.email || "R")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="truncate text-lg font-black text-slate-950">
                              {profile.full_name || "ResearchGram User"}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                              {profile.department || "Research community"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-blue-600 px-3 py-2 text-center text-white">
                            <p className="text-lg font-black">{item.score}%</p>
                            <p className="text-[10px] font-bold uppercase">
                              Match
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.matchedKeywords.length > 0 ? (
                            item.matchedKeywords.slice(0, 6).map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
                              >
                                {keyword}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                              General match
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm font-bold text-slate-800">
                        Why recommended
                      </p>

                      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                        {item.reasons.map((reason) => (
                          <li key={reason}>• {reason}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs font-bold uppercase text-slate-500">
                          Skills
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-700">
                          {profile.skills || "Not added yet"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs font-bold uppercase text-slate-500">
                          Interests
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-700">
                          {profile.interests || "Not added yet"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-500">
                        Recommendation #{index + 1}
                      </p>

                      <button
                        onClick={() => handleSendCollaborationRequest(profile)}
                        disabled={isRequested || requestingId === profile.id}
                        className={`rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          isRequested
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-950 text-white hover:bg-slate-800"
                        }`}
                      >
                        {requestingId === profile.id
                          ? "Sending..."
                          : isRequested
                            ? `Request ${status}`
                            : "Send Request"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}