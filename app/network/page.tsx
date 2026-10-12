import NetworkClient from "./NetworkClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Network");

export default function NetworkPage() {
  return <NetworkClient />;
}