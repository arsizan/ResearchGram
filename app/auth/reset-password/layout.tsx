import { privatePage } from "@/lib/site";

// The page itself is a client component, so its title lives here (RG-34).
export const metadata = privatePage("Reset password");

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
