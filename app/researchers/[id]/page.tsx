import ResearcherDetailClient from "./ResearcherDetailClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Researcher");

export default function ResearcherDetailPage() {
  return <ResearcherDetailClient />;
}