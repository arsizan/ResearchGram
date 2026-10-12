import type { Metadata } from "next";

// The page itself is a client component, so its title lives here (RG-34).
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to ResearchGram to see your feed, messages and research requests.",
  alternates: { canonical: "/auth/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
