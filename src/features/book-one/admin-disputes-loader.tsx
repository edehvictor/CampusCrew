"use client";
import dynamic from "next/dynamic";
import { BrandLoader } from "@/components/shared/brand-loader";
const Dashboard = dynamic(
  () => import("./admin-disputes").then((m) => m.AdminDisputes),
  { ssr: false, loading: () => <BrandLoader /> },
);
export function AdminDisputesLoader() {
  return <Dashboard />;
}
