import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { readWalletBalance, testUsdcIssuer, testnetHorizon } from "../src/features/book-one/stellar-balance.ts";

test("balances match the network, wallet, and Circle issuer rather than token name alone", async () => {
  const wallet = Keypair.random().publicKey();
  const balance = await readWalletBalance(wallet, async (url, options) => {
    assert.equal(url, `${testnetHorizon}/accounts/${wallet}`);
    assert.equal(options.cache, "no-store");
    return Response.json({ account_id: wallet, balances: [
      { asset_type: "native", balance: "42.0000001" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: Keypair.random().publicKey(), balance: "9999.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: testUsdcIssuer, balance: "12.3400001" },
    ] });
  });
  assert.equal(balance.usdc, "12.3400001");
  assert.equal(balance.xlm, "42.0000001");
  assert.equal(balance.hasUsdcTrustline, true);
  assert.equal(balance.accountExists, true);
  assert.equal(balance.network, "stellar-testnet");
});

test("unactivated wallets and missing trustlines are distinguished", async () => {
  const wallet = Keypair.random().publicKey();
  const missing = await readWalletBalance(wallet, async () => new Response(null, { status: 404 }));
  assert.equal(missing.accountExists, false);
  assert.equal(missing.usdc, "0.0000000");
  const existing = await readWalletBalance(wallet, async () => Response.json({ account_id: wallet, balances: [
    { asset_type: "native", balance: "100.0000000" },
  ] }));
  assert.equal(existing.accountExists, true);
  assert.equal(existing.hasUsdcTrustline, false);
});

test("lookup failures, malformed data and another account cannot become a zero balance", async () => {
  const wallet = Keypair.random().publicKey();
  await assert.rejects(readWalletBalance(wallet, async () => new Response(null, { status: 503 })));
  await assert.rejects(readWalletBalance(wallet, async () => { throw new Error("Offline"); }));
  await assert.rejects(readWalletBalance(wallet, async () => Response.json({ account_id: wallet, balances: [
    { asset_type: "native", balance: "invalid" },
  ] })));
  await assert.rejects(readWalletBalance(wallet, async () => Response.json({ account_id: Keypair.random().publicKey(), balances: [] })));
});

test("invalid addresses are rejected before making a network request", async () => {
  await assert.rejects(readWalletBalance("../../accounts", async () => assert.fail("Must not make a request")));
});
