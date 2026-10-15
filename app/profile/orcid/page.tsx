import OrcidCallbackClient from "./OrcidCallbackClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Verify ORCID iD");

export default function OrcidCallbackPage() {
  return <OrcidCallbackClient />;
}
