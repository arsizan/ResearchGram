import RecommendationsClient from "./RecommendationsClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Collaborator recommendations");

export default function RecommendationsPage() {
  return <RecommendationsClient />;
}