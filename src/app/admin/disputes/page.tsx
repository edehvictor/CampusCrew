import { AdminDisputesLoader } from "@/features/book-one/admin-disputes-loader";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Resolution desk | CampusCrew",
  robots: { index: false, follow: false },
};
export default function DisputesPage() {
  return <AdminDisputesLoader />;
}
