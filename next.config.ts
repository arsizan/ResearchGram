import type { NextConfig } from "next";

/*
 * Security headers for every page (Phase 4).
 *
 * The Content-Security-Policy only lets the browser load scripts from this
 * site, talk to this site and the project's Supabase (HTTPS and the realtime
 * websocket), and embed Supabase file previews and Jitsi meetings. Inline
 * scripts stay allowed because Next.js needs them for static pages.
 */
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const socket = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    return { http: url.origin, socket, secure: url.protocol === "https:" };
  } catch {
    return { http: "", socket: "", secure: true };
  }
}

const isDev = process.env.NODE_ENV !== "production";
const supabase = supabaseOrigins();
const JITSI = "https://meet.jit.si";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' only for the development server's hot reload.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase.http} ${supabase.socket}`,
  `media-src 'self' blob: ${supabase.http}`,
  `frame-src 'self' blob: ${JITSI} ${supabase.http}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(supabase.secure && !isDev ? ["upgrade-insecure-requests"] : []),
]
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

// Camera, microphone and screen sharing: this site (voice messages, meeting
// recordings) and the embedded Jitsi meeting only.
const permissionsPolicy = [
  `camera=(self "${JITSI}")`,
  `microphone=(self "${JITSI}")`,
  `display-capture=(self "${JITSI}")`,
  `fullscreen=(self "${JITSI}")`,
  "geolocation=()",
  "payment=()",
  "usb=()",
].join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // The browser tests build into their own folder (tests/e2e/serve.mjs).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
