/*
 * Addresses that must stay inside this app: "next" after logging in, and
 * notification links. A plain "starts with /" test is not enough: browsers
 * drop tabs and line breaks inside an address and read "\" as "/", so
 * "/\t/evil.example" is really "//evil.example", which is another site. The
 * value is read here the way a browser reads it, and kept only when it stays
 * on this site.
 */
const BASE = "https://researchgram.invalid";

const staysHere = (value: string) => {
  try {
    return new URL(value, BASE).origin === BASE;
  } catch {
    return false;
  }
};

/** The path, query and #part of `value` when it is an address on this site; otherwise null. */
export function sameSitePath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || !staysHere(value)) return null;

  const url = new URL(value, BASE);
  const path = `${url.pathname}${url.search}${url.hash}`;

  // "/.//evil.example" stays here but resolves to the path "//evil.example".
  if (path.startsWith("//") || !staysHere(path)) return null;
  return path;
}
