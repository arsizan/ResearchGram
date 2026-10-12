import RequestsClient from "./RequestsClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Requests");

export default function RequestsPage() {
  return <RequestsClient />;
}