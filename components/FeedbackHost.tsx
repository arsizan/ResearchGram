"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, Info, X } from "lucide-react";
import {
  subscribeToDialogs,
  subscribeToNotices,
  type DialogRequest,
  type Notice,
} from "@/lib/feedback";

const NOTICE_STYLE: Record<Notice["kind"], { box: string; icon: string }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-600" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "text-red-600" },
  info: { box: "border-border bg-card text-foreground", icon: "text-primary" },
};

function NoticeIcon({ kind, className }: { kind: Notice["kind"]; className: string }) {
  if (kind === "success") return <CheckCircle2 className={className} aria-hidden="true" />;
  if (kind === "error") return <AlertCircle className={className} aria-hidden="true" />;
  return <Info className={className} aria-hidden="true" />;
}

type HostedDialog = DialogRequest & {
  /** The page the dialog was opened on. */
  path: string;
};

/**
 * Shows the messages and questions sent through lib/feedback.ts. Mounted once
 * in the root layout so it survives page changes. Its layers sit above
 * everything else (the assistant panel is z-90, the file viewer z-100).
 */
export default function FeedbackHost() {
  const pathname = usePathname();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dialogs, setDialogs] = useState<HostedDialog[]>([]);
  const timers = useRef(new Map<number, number>());
  const pathRef = useRef(pathname);

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  useEffect(() => {
    const unsubscribeNotices = subscribeToNotices((notice) => {
      setNotices((current) => [...current.slice(-3), notice]);
    });

    const unsubscribeDialogs = subscribeToDialogs((dialog) => {
      setDialogs((current) => [...current, { ...dialog, path: pathRef.current }]);
    });

    return () => {
      unsubscribeNotices();
      unsubscribeDialogs();
    };
  }, []);

  // Every message on screen disappears by itself after a few seconds.
  useEffect(() => {
    const timerMap = timers.current;
    notices.forEach((notice) => {
      if (timerMap.has(notice.id)) return;
      timerMap.set(
        notice.id,
        window.setTimeout(() => dismissNotice(notice.id), notice.kind === "error" ? 7000 : 4500),
      );
    });
  }, [notices, dismissNotice]);

  useEffect(() => {
    const timerMap = timers.current;
    return () => {
      timerMap.forEach((timeout) => window.clearTimeout(timeout));
      timerMap.clear();
    };
  }, []);

  // A question belongs to the page that asked it. When the page changes (for
  // example with the browser's Back button), it counts as "Cancel", so an
  // action can never run from a page that is no longer open.
  useEffect(() => {
    pathRef.current = pathname;
    dialogs.forEach((dialog) => {
      if (dialog.path !== pathname) dialog.resolve(false);
    });
  }, [pathname, dialogs]);

  const activeDialog = dialogs.find((dialog) => dialog.path === pathname) || null;

  const closeDialog = (dialog: HostedDialog, confirmed: boolean) => {
    dialog.resolve(confirmed);
    setDialogs((current) =>
      current.filter((item) => item.id !== dialog.id && item.path === pathname),
    );
  };

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-[72px] z-[110] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {notices.map((notice) => {
          const style = NOTICE_STYLE[notice.kind];
          return (
            <div
              key={notice.id}
              role={notice.kind === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${style.box}`}
            >
              <NoticeIcon kind={notice.kind} className={`mt-0.5 h-4 w-4 flex-shrink-0 ${style.icon}`} />
              <p className="flex-1 leading-relaxed">{notice.message}</p>
              <button
                type="button"
                onClick={() => dismissNotice(notice.id)}
                className="-mr-1 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Dismiss message"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {activeDialog && (
        <FeedbackDialog
          key={activeDialog.id}
          dialog={activeDialog}
          onClose={(confirmed) => closeDialog(activeDialog, confirmed)}
        />
      )}
    </>
  );
}

function FeedbackDialog({
  dialog,
  onClose,
}: {
  dialog: DialogRequest;
  onClose: (confirmed: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const titleId = `feedback-dialog-title-${dialog.id}`;
  const messageId = `feedback-dialog-message-${dialog.id}`;

  // Focus goes into the dialog, and back to where it was when it closes.
  useEffect(() => {
    if (dialog.copyText !== undefined) {
      copyRef.current?.focus();
      copyRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }

    const returnFocus = dialog.returnFocus;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [dialog.copyText, dialog.returnFocus]);

  const cancelWithEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") onClose(false);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => cancelWithEscape(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Tab and Shift+Tab stay inside the dialog while it is open.
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>("button, input"),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleCopy = async () => {
    if (dialog.copyText === undefined) return;
    try {
      await navigator.clipboard.writeText(dialog.copyText);
      setCopied(true);
    } catch {
      copyRef.current?.select();
    }
  };

  const danger = dialog.tone === "danger";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onClose(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={keepFocusInside}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-base font-bold text-foreground">
          {dialog.title}
        </h2>
        <p id={messageId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {dialog.message}
        </p>

        {dialog.copyText !== undefined && (
          <div className="mt-4 flex items-center gap-2">
            <input
              ref={copyRef}
              readOnly
              value={dialog.copyText}
              aria-label="Text to copy"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {dialog.cancelLabel && (
            <button
              type="button"
              onClick={() => onClose(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {dialog.cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
