/**
 * What may be uploaded (audit RG-21).
 *
 * The storage buckets enforce the same types and sizes on the server
 * (supabase/migrations/20261013000000_upload_limits.sql). These checks exist so
 * people get a clear message before a long upload, not a raw storage error.
 *
 * A file whose type is not on the list is still accepted, but stored as a plain
 * download (application/octet-stream). That keeps odd research formats (.R, .tex,
 * .ipynb …) working while making sure nothing uploaded can open as a web page,
 * which is what an HTML or SVG file served from our storage would do.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // Supabase Free plan per-file limit
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "text/csv",
  "text/plain",
  "text/markdown",
  ...IMAGE_TYPES,
  "application/octet-stream",
];

/** Voice messages, as browsers record them (chat attachments only). */
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"];

/** Chat attachments (the chat-attachments bucket allows 25 MB). */
export const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;

const SAFE = new Set(FILE_TYPES);

function megabytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Returns what is wrong with the file, or "" when it can be uploaded. */
export function uploadProblem(file: File, options: { imagesOnly?: boolean } = {}) {
  if (file.size === 0) return `"${file.name}" is empty.`;

  if (options.imagesOnly) {
    if (!IMAGE_TYPES.includes(file.type)) {
      return `"${file.name}" is not a PNG, JPG, GIF or WebP image.`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `"${file.name}" is larger than ${megabytes(MAX_IMAGE_BYTES)}.`;
    }
    return "";
  }

  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is larger than ${megabytes(MAX_FILE_BYTES)}.`;
  }
  return "";
}

/** Returns what is wrong with a file for a chat message, or "" when it can be sent. */
export function chatUploadProblem(file: File) {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_CHAT_FILE_BYTES) {
    return `"${file.name}" is larger than ${megabytes(MAX_CHAT_FILE_BYTES)}. Share bigger files in a workspace.`;
  }
  return "";
}

// Other names browsers use for the same audio formats.
const AUDIO_ALIASES: Record<string, string> = {
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-aac": "audio/aac",
};

/**
 * The file as it should be stored: known safe types keep theirs, the rest
 * become downloads. In chats (`allowAudio`) audio files keep an audio type, so
 * they play in the browser instead of downloading.
 */
export function asUploadBody(file: File, options: { allowAudio?: boolean } = {}) {
  const type = (file.type || "").toLowerCase();
  if (SAFE.has(type)) return file;

  if (options.allowAudio) {
    const audio = AUDIO_ALIASES[type] || type;
    if (AUDIO_TYPES.includes(audio)) {
      return audio === type ? file : new File([file], file.name, { type: audio });
    }
  }

  return new File([file], file.name, { type: "application/octet-stream" });
}
