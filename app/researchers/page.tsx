import ResearchersClient from "./ResearchersClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Researchers");

export default function ResearchersPage() {
  return <ResearchersClient />;
}