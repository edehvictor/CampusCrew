import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

// Circle's Stellar Testnet issuer: https://developers.circle.com/stablecoins/usdc-contract-addresses
export const testUsdcIssuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const testnetHorizon = "https://horizon-testnet.stellar.org";

export type WalletBalance = {
  wallet: string;
  network: "stellar-testnet";
  accountExists: boolean;
  hasUsdcTrustline: boolean;
  usdc: string;
  xlm: string;
  checkedAt: string;
};

const accountSchema = z.object({
  account_id: z.string(),
  balances: z.array(z.object({
    asset_type: z.string(),
    balance: z.string().regex(/^\d+\.\d{7}$/),
    asset_code: z.string().optional(),
    asset_issuer: z.string().optional(),
  })),
});

/** Read the signed-in wallet only. A failed network request must never appear as a zero balance. */
export async function readWalletBalance(wallet: string, request: typeof fetch = fetch): Promise<WalletBalance> {
  if (!StrKey.isValidEd25519PublicKey(wallet)) throw new Error("Invalid Stellar wallet.");
  const response = await request(`${testnetHorizon}/accounts/${wallet}`, {
    cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  const empty: WalletBalance = {
    wallet, network: "stellar-testnet", accountExists: false, hasUsdcTrustline: false,
    usdc: "0.0000000", xlm: "0.0000000", checkedAt: new Date().toISOString(),
  };
  if (response.status === 404) return empty;
  if (!response.ok) throw new Error("Stellar balance lookup failed.");
  const account = accountSchema.parse(await response.json());
  if (account.account_id !== wallet) throw new Error("Stellar account did not match.");
  const usdc = account.balances.find(item => item.asset_type === "credit_alphanum4"
    && item.asset_code === "USDC" && item.asset_issuer === testUsdcIssuer);
  const xlm = account.balances.find(item => item.asset_type === "native");
  return {
    ...empty, accountExists: true, hasUsdcTrustline: Boolean(usdc),
    usdc: usdc?.balance ?? empty.usdc, xlm: xlm?.balance ?? empty.xlm,
  };
}
