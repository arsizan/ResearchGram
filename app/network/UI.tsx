"use client";

import { useState } from "react";
import AppNav from "@/components/AppNav";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  Grid3X3,
  Mail,
  MessageCircle,
  Search,
  Sparkles,
  Tags,
  UserPlus,
  Users,
  X,
} from "lucide-react";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  skills: string | null;
  interests: string | null;
  bio: string | null;
  profile_pic_url: string | null;
};

export type UserConnection = {
  id: string;
  user_one_id: string;
  user_two_id: string;
  created_at: string | null;
};

export type NetworkPerson = {
  connection: UserConnection;
  profile: Profile | null;
};

type NetworkUIProps = {
  loading: boolean;
  connections: NetworkPerson[];
  filteredConnections: NetworkPerson[];
  searchQuery: string;
  startingConversationId: string | null;

  setSearchQuery: (value: string) => void;
  handleStartDirectMessage: (targetUserId: string) => void;
  handleGoToResearchers: () => void;
  handleGoToProfile: (profileId: string) => void;
};

type ViewMode = "grid" | "compact";

function splitTags(value: string | null) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function formatTime(dateString: string | null) {
  if (!dateString) return "Unknown time";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(dateString));
  } catch {
    return "Unknown time";
  }
}

function getProfileName(profile: Profile | null) {
  return (
    profile?.full_name || profile?.email?.split("@")[0] || "ResearchGram User"
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "RG";
}

function colorFromString(value: string) {
  const palette = [
    "#4f46e5",
    "#7c3aed",
    "#0891b2",
    "#059669",
    "#dc2626",
    "#d97706",
  ];

  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return palette[Math.abs(hash) % palette.length];
}

function Avatar({
  profile,
  size = "lg",
}: {
  profile: Profile | null;
  size?: "md" | "lg";
}) {
  const name = getProfileName(profile);
  const sizeClass = size === "lg" ? "h-16 w-16 text-lg" : "h-12 w-12 text-sm";

  if (profile?.profile_pic_url) {
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-4 ring-white`}
      >
        <img
          src={profile.profile_pic_url}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-2xl font-black text-white shadow-sm ring-4 ring-white`}
      style={{ backgroundColor: colorFromString(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

function TagPill({
  children,
  tone = "indigo",
}: {
  children: React.ReactNode;
  tone?: "indigo" | "emerald" | "slate";
}) {
  const className =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "slate"
        ? "bg-slate-100 text-slate-600"
        : "bg-indigo-50 text-indigo-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function EmptyState({
  hasConnections,
  searchQuery,
  handleGoToResearchers,
}: {
  hasConnections: boolean;
  searchQuery: string;
  handleGoToResearchers: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
        <Users className="h-8 w-8" />
      </div>

      <h2 className="mt-5 text-xl font-black text-slate-950">
        {hasConnections ? "No matching researchers" : "Your network is empty"}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasConnections
          ? `No one in your network matched “${searchQuery}”. Try searching by another name, department, skill, or interest.`
          : "Start connecting with researchers from the Discover Researchers page. Accepted connections will appear here."}
      </p>

      {!hasConnections && (
        <button
          type="button"
          onClick={handleGoToResearchers}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700"
        >
          Discover Researchers
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function NetworkCard({
  item,
  startingConversationId,
  handleStartDirectMessage,
  handleGoToProfile,
  viewMode,
}: {
  item: NetworkPerson;
  startingConversationId: string | null;
  handleStartDirectMessage: (targetUserId: string) => void;
  handleGoToProfile: (profileId: string) => void;
  viewMode: ViewMode;
}) {
  const profile = item.profile;
  const name = getProfileName(profile);
  const skillTags = splitTags(profile?.skills || null);
  const interestTags = splitTags(profile?.interests || null);
  const isOpening = Boolean(profile && startingConversationId === profile.id);

  if (viewMode === "compact") {
    return (
      <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar profile={profile} size="md" />

            <div className="min-w-0">
              <button
                type="button"
                onClick={() => profile && handleGoToProfile(profile.id)}
                disabled={!profile}
                className="line-clamp-1 text-left text-base font-black text-slate-950 transition hover:text-indigo-700 disabled:cursor-not-allowed"
              >
                {name}
              </button>

              <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">
                {profile?.department || "Research community"}
              </p>

              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" />
                Connected since {formatTime(item.connection.created_at)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => profile && handleGoToProfile(profile.id)}
              disabled={!profile}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              View Profile
            </button>

            <button
              type="button"
              onClick={() => profile && handleStartDirectMessage(profile.id)}
              disabled={!profile || isOpening}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MessageCircle className="h-4 w-4" />
              {isOpening ? "Opening..." : "Message"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="h-20 bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-600" />

      <div className="-mt-9 px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <Avatar profile={profile} />

          <div className="mt-10 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
            Connected
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => profile && handleGoToProfile(profile.id)}
            disabled={!profile}
            className="line-clamp-1 text-left text-xl font-black text-slate-950 transition hover:text-indigo-700 disabled:cursor-not-allowed"
          >
            {name}
          </button>

          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Briefcase className="h-4 w-4 text-slate-400" />
            <span className="line-clamp-1">
              {profile?.department || "Research community"}
            </span>
          </p>

          {profile?.email && (
            <p className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{profile.email}</span>
            </p>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" />
            Connected since {formatTime(item.connection.created_at)}
          </p>
        </div>

        <p className="mt-4 line-clamp-3 min-h-[72px] text-sm leading-6 text-slate-600">
          {profile?.bio ||
            "No bio added yet. This researcher has not completed their academic introduction."}
        </p>

        {skillTags.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <Tags className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Skills
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {skillTags.map((skill) => (
                <TagPill key={skill}>{skill}</TagPill>
              ))}
            </div>
          </div>
        )}

        {interestTags.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Research Interests
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {interestTags.map((interest) => (
                <TagPill key={interest} tone="emerald">
                  {interest}
                </TagPill>
              ))}
            </div>
          </div>
        )}

        {skillTags.length === 0 && interestTags.length === 0 && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">
              No skills or interests added yet.
            </p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => profile && handleGoToProfile(profile.id)}
            disabled={!profile}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            View Profile
          </button>

          <button
            type="button"
            onClick={() => profile && handleStartDirectMessage(profile.id)}
            disabled={!profile || isOpening}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MessageCircle className="h-4 w-4" />
            {isOpening ? "Opening..." : "Message"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function NetworkUI({
  loading,
  connections,
  filteredConnections,
  searchQuery,
  startingConversationId,
  setSearchQuery,
  handleStartDirectMessage,
  handleGoToResearchers,
  handleGoToProfile,
}: NetworkUIProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  if (loading) {
    return <ResearchGramSkeleton activePage="network" variant="network" />;
  }

  const hasConnections = connections.length > 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <AppNav activePage="network" />

      <section className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:px-6 lg:pb-8">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-600 p-6 text-white sm:p-8">
            <div className="absolute -right-8 top-4 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute bottom-0 left-1/2 h-24 w-24 rounded-full bg-white/10 blur-xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black ring-1 ring-white/20">
                  <Users className="h-3.5 w-3.5" />
                  Academic Network
                </div>

                <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                  My Network
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-50">
                  View your accepted academic connections, explore their skills
                  and interests, and start focused research conversations.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoToResearchers}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-indigo-700 shadow-sm transition hover:bg-indigo-50"
              >
                <UserPlus className="h-4 w-4" />
                Discover Researchers
              </button>
            </div>
          </div>

          {/* <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
            <StatCard
              label="Connections"
              value={stats.total}
              helper="Accepted researchers"
              Icon={Users}
              tone="indigo"
            />

            <StatCard
              label="Departments"
              value={stats.departments}
              helper="Across your network"
              Icon={Briefcase}
              tone="emerald"
            />

            <StatCard
              label="With Skills"
              value={stats.withSkills}
              helper="Profiles with research data"
              Icon={Sparkles}
              tone="amber"
            />
          </div> */}

          <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, department, skill, or interest..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-11 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition sm:flex-none ${
                  viewMode === "grid"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-950"
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
                Grid
              </button>

              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition sm:flex-none ${
                  viewMode === "compact"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-950"
                }`}
              >
                <Users className="h-4 w-4" />
                Compact
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          {filteredConnections.length === 0 ? (
            <EmptyState
              hasConnections={hasConnections}
              searchQuery={searchQuery}
              handleGoToResearchers={handleGoToResearchers}
            />
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3"
                  : "space-y-3"
              }
            >
              {filteredConnections.map((item) => (
                <NetworkCard
                  key={item.connection.id}
                  item={item}
                  startingConversationId={startingConversationId}
                  handleStartDirectMessage={handleStartDirectMessage}
                  handleGoToProfile={handleGoToProfile}
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
