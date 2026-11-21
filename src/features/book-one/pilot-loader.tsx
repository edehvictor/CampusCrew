"use client";

import dynamic from "next/dynamic";
import { BrandLoader } from "@/components/brand-loader";

const StellarBoard = dynamic(() => import("./pilot-board").then(module => module.PilotBoard), {
  ssr: false,
  loading: () => <BrandLoader />,
});

export function PilotLoader() {
  return <StellarBoard />;
}
