import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ResearchAssistant from "@/components/assistant/ResearchAssistant";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ResearchGram",
  description:
    "Publish research notes, control who reads your full papers, find collaborators and mentors, and search 250 million published works.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}

        {/*
          Mounted here rather than inside AppNav on purpose. A layout survives
          navigation; a component inside a page does not, so from AppNav the
          panel was torn down and the whole conversation thrown away every time
          the user clicked Discover. It renders nothing until there is a session.
        */}
        <ResearchAssistant />
      </body>
    </html>
  );
}
