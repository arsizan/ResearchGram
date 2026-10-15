/**
 * A random id (UUID v4) made in the browser.
 *
 * crypto.randomUUID() only exists on https pages (and localhost) and in
 * browsers from 2022 on; crypto.getRandomValues() works everywhere, so it is
 * the fallback (for example when testing the app from a phone over the
 * local network).
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Not allowed here: use the fallback.
    }
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
