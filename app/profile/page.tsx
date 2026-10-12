import ProfileCompletionPrompt from "@/components/ProfileCompletionPrompt";
import ProfileClient from "./ProfileClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Your profile");

export default function ProfilePage() {
  return (
    <>
      <ProfileClient />
      <ProfileCompletionPrompt />
    </>
  );
}