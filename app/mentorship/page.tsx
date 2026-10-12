import MentorshipClient from "./MentorshipClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Mentorship");

export default function MentorshipPage() {
  return <MentorshipClient />;
}