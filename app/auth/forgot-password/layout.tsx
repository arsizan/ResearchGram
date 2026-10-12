import { privatePage } from "@/lib/site";

// The page itself is a client component, so its title lives here (RG-34).
export const metadata = privatePage("Forgot password");

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
