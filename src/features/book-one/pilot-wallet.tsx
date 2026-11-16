"use client";

import { createAppKit } from "@reown/appkit/react";
import { celo } from "viem/chains";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { WagmiProvider } from "wagmi";
import { PilotBoard } from "./pilot-board";

export type WalletConfig = { projectId: string; supabaseUrl: string; supabaseKey: string };

let walletRuntime: ReturnType<typeof initWallet>;

function initWallet(config: WalletConfig) {
  const networks = [celo] as [typeof celo];
  const adapter = new WagmiAdapter({ projectId: config.projectId, networks, ssr: false });
  createAppKit({
    adapters: [adapter], projectId: config.projectId, networks, defaultNetwork: celo,
    metadata: {
      name: "Campuscrew", description: "Book local services and pay with G$",
      url: window.location.origin, icons: [new URL("/icon.svg", window.location.origin).href],
    },
    features: { analytics: false, email: false, socials: false },
  });
  return {
    config: adapter.wagmiConfig,
    query: new QueryClient(),
    auth: createClient(config.supabaseUrl, config.supabaseKey),
  };
}

export function PilotWallet({ config }: { config: WalletConfig }) {
  const runtime = walletRuntime ??= initWallet(config);
  return (
    <WagmiProvider config={runtime.config}>
      <QueryClientProvider client={runtime.query}>
        <PilotBoard auth={runtime.auth} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
