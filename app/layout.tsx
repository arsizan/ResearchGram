import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ResearchAssistant from "@/components/assistant/ResearchAssistant";
import FeedbackHost from "@/components/FeedbackHost";
import ErrorReporter from "@/components/ErrorReporter";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/*
 * Fonts are served from this app (app/fonts, SIL Open Font License 1.1)
 * instead of Google Fonts (audit RG-33): no render-blocking request to another
 * server, nothing sent to Google, and builds work without internet.
 *
 * They are variable fonts: one file covers every weight from 200 to 800.
 * Plus Jakarta Sans is split by alphabet the way Google Fonts does it. The
 * Latin file (regular and italic) is preloaded because every page needs it.
 * The Latin Extended and Vietnamese files are only downloaded when a page
 * contains such letters (names like "Łukasz" or "Nguyễn"). globals.css lists
 * them before the Latin font; their character ranges leave out a-z, A-Z,
 * digits and punctuation, so ordinary text never triggers those downloads.
 *
 * next/font only accepts written-out values in these calls (no constants),
 * so the character ranges are repeated.
 */
const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-wght-italic.woff2", weight: "200 800", style: "italic" },
  ],
  display: "swap",
  variable: "--font-jakarta",
  declarations: [
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

const jakartaLatinExt = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-ext-wght-italic.woff2", weight: "200 800", style: "italic" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-jakarta-latin-ext",
  declarations: [
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});

const jakartaVietnamese = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-vietnamese-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-vietnamese-wght-italic.woff2", weight: "200 800", style: "italic" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-jakarta-vietnamese",
  declarations: [
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});

// Only used for DOIs, file names and error codes, so it is not preloaded.
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-jetbrains",
  declarations: [
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

const fontVariables = [
  jakarta.variable,
  jakartaLatinExt.variable,
  jakartaVietnamese.variable,
  jetbrainsMono.variable,
].join(" ");

// Page titles become "Feed · ResearchGram" and so on; pages behind the login
// use privatePage() from lib/site.ts so search engines leave them out (RG-34).
// The link-preview image is app/opengraph-image.png.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · Research collaboration platform`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}

        {/*
          Mounted here rather than inside AppNav on purpose. A layout survives
          navigation; a component inside a page does not, so from AppNav the
          panel was torn down and the whole conversation thrown away every time
          the user clicked Discover. It renders nothing until there is a session.
        */}
        <ResearchAssistant />

        {/* Messages and questions from lib/feedback.ts (replaces alert/confirm, audit RG-27). */}
        <FeedbackHost />

        {/* Errors nothing else caught go to the error log in /admin (Phase 5). */}
        <ErrorReporter />
      </body>
    </html>
  );
}
