import AdminClient from "./AdminClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Admin");

export default function AdminPage() {
  return <AdminClient />;
}
