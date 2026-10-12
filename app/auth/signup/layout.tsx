import type { Metadata } from "next";

// The page itself is a client component, so its title lives here (RG-34).
export const metadata: Metadata = {
  title: "Sign up",
  description:
    "Create a ResearchGram account to publish research, find collaborators and mentors, and control who reads your full papers.",
  alternates: { canonical: "/auth/signup" },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
