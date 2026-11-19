"use client";

import dynamic from "next/dynamic";

const StellarBoard = dynamic(() => import("./pilot-board").then(module => module.PilotBoard), {
  ssr: false,
  loading: () => <main className="book-one" role="status">Loading CampusCrew…</main>,
});

export function PilotLoader() {
  return <StellarBoard />;
}
