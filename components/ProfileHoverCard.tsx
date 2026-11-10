"use client";

// 10 Nov 2026: hover card fix (stays open while the pointer is on the card)
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  // 9 Nov 2026: AcademicOrbit rename
  return fullName || email?.split("@")[0] || "AcademicOrbit User";
}

// 10 Nov 2026: hover card fix. Before, the card closed as soon as the pointer
// left the name, so it could never be reached, and the post's rounded edges
// cut it off. Now, like Facebook, it opens after a short pause, stays open
// while the pointer is on the name or on the card (an invisible bridge
// covers the gap between them), and closes a moment after the pointer has
// left both, so a small slip does not close it. Escape closes it too. It is
// drawn at the end of the page's main area (a portal, outside the post),
// below the name, or above it when there is no room below, inside the window.
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 300;
const GAP_PX = 8; // between the name and the card
const EDGE_PX = 8; // kept free along the window's edges
const TOP_BAR_PX = 60; // the sticky top bar (components/AppNav.tsx)

// 10 Nov 2026: hover card fix. Focus from the keyboard opens the card at
// once; a click or tap on the name opens the profile page anyway.
function focusedByKeyboard(target: EventTarget) {
  try {
    return target instanceof HTMLElement && target.matches(":focus-visible");
  } catch {
    return true; // a browser without :focus-visible: open as before
  }
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
  // 10 Nov 2026: hover card fix (the name, the card, and the waiting timer)
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const displayName = getDisplayName(fullName, email);

  // 10 Nov 2026: hover card fix. Opening and closing wait a moment; the
  // pointer coming back (to the name or the card) cancels a pending close.
  const openOrCloseSoon = (next: boolean) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setOpen(next),
      next ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    );
  };
  const stayAsIs = () => window.clearTimeout(timerRef.current);
  const openNow = (next: boolean) => {
    window.clearTimeout(timerRef.current);
    setOpen(next);
  };
  // A finger has no hover: a tap on the name just opens the profile.
  const isMouse = (event: React.PointerEvent) => event.pointerType !== "touch";

  // 10 Nov 2026: hover card fix (no timer left running once the post is gone)
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // 10 Nov 2026: hover card fix (Escape closes the card)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      window.clearTimeout(timerRef.current);
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // 10 Nov 2026: hover card fix. Puts the card next to the name as soon as it
  // is on the page (before it is shown), and again when the window is resized.
  // Page coordinates, so the card moves with the page when it scrolls.
  const placeCard = useCallback((card: HTMLDivElement | null) => {
    cardRef.current = card;
    if (!card) return;

    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const name = trigger.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const roomBelow = window.innerHeight - name.bottom - GAP_PX - EDGE_PX;
      const roomAbove = name.top - TOP_BAR_PX - GAP_PX - EDGE_PX;
      const below = roomBelow >= height || roomBelow >= roomAbove;
      const top = below ? name.bottom + GAP_PX : name.top - GAP_PX - height;
      const maxLeft = document.documentElement.clientWidth - width - EDGE_PX;
      const left = Math.max(EDGE_PX, Math.min(name.left, maxLeft));
      // Measured from the page, or from a positioned box the card is in.
      const frame = card.offsetParent;
      let originTop = -window.scrollY;
      let originLeft = -window.scrollX;
      if (frame && frame !== document.body && frame !== document.documentElement) {
        const box = frame.getBoundingClientRect();
        originTop = box.top + frame.clientTop;
        originLeft = box.left + frame.clientLeft;
      }
      card.style.top = `${Math.round(top - originTop)}px`;
      card.style.left = `${Math.round(left - originLeft)}px`;
      // Which side faces the name (for the bridge over the gap, below).
      card.dataset.side = below ? "below" : "above";
    };

    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      cardRef.current = null;
    };
  }, []);

  return (
    // 10 Nov 2026: hover card fix (the name here; the card at the end of the main area)
    <>
      <div
        ref={triggerRef}
        className="relative inline-flex"
        // 10 Nov 2026: hover card fix (pointer events with a short wait)
        onPointerEnter={(event) => {
          if (isMouse(event)) openOrCloseSoon(true);
        }}
        onPointerLeave={(event) => {
          if (isMouse(event)) openOrCloseSoon(false);
        }}
        onFocus={(event) => {
          if (focusedByKeyboard(event.target)) openNow(true);
        }}
        onBlur={(event) => {
          // Focus moving into the card keeps it open.
          if (cardRef.current?.contains(event.relatedTarget as Node | null)) return;
          openNow(false);
        }}
      >
        {children}
      </div>

      {/* 10 Nov 2026: hover card fix (drawn on top of the page, stays open while the pointer is on it) */}
      {open && profileId && createPortal(
        <div
          ref={placeCard}
          onPointerEnter={stayAsIs}
          onPointerLeave={(event) => {
            if (isMouse(event)) openOrCloseSoon(false);
          }}
          // Below the top bar (z-50) when the page scrolls, above the phone bottom bar (z-40).
          className="group absolute left-0 top-0 z-[45] w-80 max-w-[calc(100vw-16px)] rounded-3xl border border-gray-100 bg-white p-5 shadow-xl"
        >
          {/* 10 Nov 2026: an invisible bridge over the 8 px gap between the
              name and the card (10 px, so no sliver is left), so the pointer
              is on the card as soon as it leaves the name. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 h-[10px] group-data-[side=below]:bottom-full group-data-[side=above]:top-full"
          />
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
        </div>,
        // 10 Nov 2026: hover card fix (portal target: the end of the page's
        // main area, so the card stays inside the page's landmarks)
        document.querySelector("main") ?? document.body,
      )}
    </>
  );
}