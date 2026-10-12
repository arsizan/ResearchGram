import NotificationsClient from "./NotificationsClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Notifications");

export default function NotificationsPage() {
  return <NotificationsClient />;
}