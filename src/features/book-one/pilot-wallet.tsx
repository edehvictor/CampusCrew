"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { VarialModule } from "@creit.tech/stellar-wallets-kit/modules/varial";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { Networks, SwkAppLightTheme } from "@creit.tech/stellar-wallets-kit/types";

let initialized = false;

export function getStellarWallet() {
  if (!initialized) {
    const freighter = new VarialModule();
    freighter.productName = "Freighter / Varial";
    StellarWalletsKit.init({
      modules: [freighter, new xBullModule()], network: Networks.TESTNET,
      theme: {
        ...SwkAppLightTheme,
        primary: "#6659DF",
        "primary-foreground": "#ffffff",
        "background-secondary": "#E3E1EF",
        "font-family": '"Plus Jakarta Sans Variable", sans-serif',
      },
    });
    initialized = true;
  }
  return StellarWalletsKit;
}
