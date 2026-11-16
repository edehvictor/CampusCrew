"use client";

import dynamic from "next/dynamic";
import type { WalletConfig } from "./pilot-wallet";

const PilotWallet = dynamic(() => import("./pilot-wallet").then(module => module.PilotWallet), {
  ssr: false,
  loading: () => <main className="book-one" role="status">Loading Campuscrew…</main>,
});

export function PilotLoader({ config }: { config: WalletConfig }) {
  return <PilotWallet config={config} />;
}
