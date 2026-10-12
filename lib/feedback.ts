/*
 * Messages and questions for the user, shown by <FeedbackHost /> (mounted once
 * in the root layout) instead of the browser's alert(), confirm() and prompt()
 * (audit RG-27). Works from any file without hooks:
 *
 *   notify("Post link copied.", "success");
 *   notify(friendlyError(error, "Could not save the post."), "error");
 *   if (!(await confirmAction({ message: "Hide this post?" }))) return;
 */

export type NoticeKind = "success" | "error" | "info";

export type Notice = {
  id: number;
  kind: NoticeKind;
  message: string;
};

export type DialogRequest = {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  /** Text shown in a read-only box the user can copy (copy dialogs only). */
  copyText?: string;
  /** Where focus was when the dialog opened; it goes back there afterwards. */
  returnFocus: HTMLElement | null;
  resolve: (confirmed: boolean) => void;
};

type NoticeListener = (notice: Notice) => void;
type DialogListener = (dialog: DialogRequest) => void;

const noticeListeners = new Set<NoticeListener>();
const dialogListeners = new Set<DialogListener>();
const pendingNotices: Notice[] = [];
const pendingDialogs: DialogRequest[] = [];
let nextId = 1;

export function notify(message: string, kind: NoticeKind = "info") {
  const notice: Notice = { id: nextId++, kind, message };

  if (noticeListeners.size === 0) {
    // The host has not mounted yet; show it as soon as it does.
    pendingNotices.push(notice);
    if (pendingNotices.length > 5) pendingNotices.shift();
    return;
  }

  noticeListeners.forEach((listener) => listener(notice));
}

export function subscribeToNotices(listener: NoticeListener) {
  noticeListeners.add(listener);
  pendingNotices.splice(0).forEach((notice) => listener(notice));
  return () => {
    noticeListeners.delete(listener);
  };
}

function openDialog(options: Omit<DialogRequest, "id" | "resolve" | "returnFocus">) {
  return new Promise<boolean>((resolve) => {
    const focused = typeof document === "undefined" ? null : document.activeElement;
    const dialog: DialogRequest = {
      ...options,
      id: nextId++,
      returnFocus: focused instanceof HTMLElement ? focused : null,
      resolve,
    };

    if (dialogListeners.size === 0) {
      pendingDialogs.push(dialog);
      return;
    }

    dialogListeners.forEach((listener) => listener(dialog));
  });
}

export function subscribeToDialogs(listener: DialogListener) {
  dialogListeners.add(listener);
  pendingDialogs.splice(0).forEach((dialog) => listener(dialog));
  return () => {
    dialogListeners.delete(listener);
  };
}

/** Asks a yes/no question. Resolves true when the user confirms. */
export function confirmAction({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}) {
  return openDialog({ title, message, confirmLabel, cancelLabel, tone });
}

/** Shows text in a box the user can select and copy (when the clipboard is blocked). */
export function showCopyDialog(title: string, text: string) {
  return openDialog({
    title,
    message: "Select the text below and copy it.",
    confirmLabel: "Done",
    cancelLabel: "",
    tone: "default",
    copyText: text,
  });
}

type ErrorLike = {
  code?: string | number;
  message?: string;
  status?: number;
  statusCode?: string | number;
  name?: string;
};

/**
 * Turns a Supabase, Postgres, storage or network error into a sentence a user
 * can act on. Raw database messages (table names, constraint names, SQL) are
 * never shown; the fallback describes what failed instead.
 */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (!error) return fallback;

  const e = (typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const code = e.code === undefined || e.code === null ? "" : String(e.code);
  const message = (e.message || "").toLowerCase();
  const status = Number(e.status ?? e.statusCode ?? 0);

  // Messages our own database functions raise are written for users.
  if (code === "P0001" || code === "P0002") {
    return e.message || fallback;
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("fetch failed")
  ) {
    return "Network problem. Check your internet connection and try again.";
  }

  if (
    code === "PGRST301" ||
    code === "PGRST303" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("refresh token")
  ) {
    return "Your session has expired. Please log in again.";
  }

  if (code === "23505" || message.includes("duplicate key")) {
    return "This already exists.";
  }

  if (
    code === "42501" ||
    status === 401 ||
    status === 403 ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return "You don't have permission to do that.";
  }

  if (code === "23503") {
    return "This item no longer exists, or something else depends on it.";
  }

  if (code === "22001") {
    return "Some of the text is too long.";
  }

  if (code === "23502" || code === "23514" || code === "22P02" || code === "22023" || code === "22007") {
    return "Some of the information is missing or not valid.";
  }

  if (code === "PGRST116") {
    return "This item was not found.";
  }

  if (code === "57014" || message.includes("timeout") || message.includes("timed out")) {
    return "This took too long. Please try again.";
  }

  if (status === 413 || message.includes("exceeded the maximum allowed size") || message.includes("payload too large")) {
    return "The file is too large.";
  }

  if (message.includes("mime type") || message.includes("invalid_mime_type")) {
    return "This file type is not allowed.";
  }

  if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return fallback;
}

/**
 * Sign-in, sign-up and password errors from Supabase Auth. Their messages are
 * written for users, so unknown ones are shown as they are; the common ones get
 * clearer wording.
 */
export function friendlyAuthError(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;

  const e = (typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const code = e.code === undefined || e.code === null ? "" : String(e.code);
  const message = (e.message || "").toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email first. Check your inbox for the link.";
  }

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "An account with this email already exists. Log in instead.";
  }

  if (code === "same_password") {
    return "Choose a password different from your current one.";
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    Number(e.status) === 429 ||
    message.includes("rate limit")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Network problem. Check your internet connection and try again.";
  }

  return e.message || fallback;
}
