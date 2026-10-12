"use client";

import { useState, type ReactNode } from "react";

type ProfileHoverCardProps = {
  profileId: string | null;
  fullName: string | null | undefined;
  email: string | null | undefined;
  department: string | null | undefined;
  profilePicUrl: string | null | undefined;
  subtitle?: string;
  children: ReactNode;
  onViewProfile: (profileId: string) => void;
};

function getDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  return fullName || email?.split("@")[0] || "ResearchGram User";
}

export default function ProfileHoverCard({
  profileId,
  fullName,
  email,
  department,
  profilePicUrl,
  subtitle,
  children,
  onViewProfile,
}: ProfileHoverCardProps) {
  const [open, setOpen] = useState(false);

  const displayName = getDisplayName(fullName, email);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}

      {open && profileId && (
        <div className="absolute left-0 top-full z-40 mt-3 w-80 rounded-3xl border border-gray-100 bg-white p-5 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100">
              {profilePicUrl ? (
                // Avatar from Supabase Storage: a plain <img> so it does not use
                // Vercel's image-optimization quota.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePicUrl}
                  alt={displayName}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-blue-700">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-bold text-gray-950">
                {displayName}
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {department || "Research community"}
              </p>

              {email && (
                <p className="mt-1 truncate text-xs text-gray-500">{email}</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-gray-50 p-3">
            <p className="text-sm leading-6 text-gray-600">
              {subtitle ||
                "View this researcher's profile to see bio, skills, interests, and recent research activity."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onViewProfile(profileId)}
            className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            View Profile
          </button>
        </div>
      )}
    </div>
  );
}