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

/** The file as it should be stored: known safe types keep theirs, the rest become downloads. */
export function asUploadBody(file: File) {
  const type = (file.type || "").toLowerCase();
  if (SAFE.has(type)) return file;
  return new File([file], file.name, { type: "application/octet-stream" });
}
