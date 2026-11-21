// Explicit technical Testnet check. Never runs as part of npm test and creates no Supabase tasks.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { BASE_FEE, Keypair, Networks, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { assertBookingTerms, bookingChainId, bookingLedgerKey, escrowCall, stellarTestnetRpc, testUsdcContract } from "../src/features/book-one/stellar-escrow.ts";

const deployment = JSON.parse(await readFile("deployments/stellar-testnet.json", "utf8"));
if (!deployment.verified || deployment.network !== "stellar-testnet") throw new Error("A verified Testnet deployment is required.");
const server = new rpc.Server(stellarTestnetRpc, { timeout: 15_000 });
if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw new Error("Unexpected network.");
const owner = Keypair.random();
const provider = Keypair.random();
const requestId = randomUUID();
const now = Math.floor(Date.now() / 1000);
const terms = {
  request_id: requestId, chain_id: bookingChainId(requestId), contract_id: deployment.contract,
  token_id: testUsdcContract, resolver: deployment.resolver, organizer: owner.publicKey(), provider: provider.publicKey(),
  amount: 1, funding_deadline: now + 1800, work_deadline: now + 3600,
};
for (const key of [owner, provider]) {
  const response = await fetch(`https://friendbot.stellar.org?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("The technical test could not obtain test XLM.");
}
const receipts = [];
for (const [operation, signer, expected] of [["create", owner, "Proposed"], ["accept", provider, "Funding"], ["cancel", owner, "Refundable"]]) {
  const tx = new TransactionBuilder(await server.getAccount(signer.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(escrowCall(terms, operation, signer.publicKey())).setTimeout(180).build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) throw new Error(`Could not simulate ${operation}: ${simulation.error ?? "restoration required"}`);
  const prepared = rpc.assembleTransaction(tx, simulation).build();
  prepared.sign(signer);
  const hash = Buffer.from(prepared.hash()).toString("hex");
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`Rejected ${operation}: ${hash}`);
  let confirmed = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") { confirmed = true; break; }
    if (result.status === "FAILED") throw new Error(`Failed ${operation}: ${hash}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (!confirmed) throw new Error(`Still pending: ${hash}`);
  const ledger = await server.getLedgerEntries(bookingLedgerKey(deployment.contract, terms.chain_id));
  const entry = ledger.entries[0];
  if (!entry || entry.val.type !== "contractData") throw new Error("Booking storage unavailable.");
  const booking = assertBookingTerms(terms, scValToNative(entry.val.contractData.val));
  assert.equal(booking.state[0], expected);
  assert.equal(booking.funded, BigInt(0));
  receipts.push({ operation, hash, ledger: ledger.latestLedger, confirmedState: expected });
  console.log(`${operation} confirmed: ${hash} (${expected})`);
}
await mkdir("tests/receipts", { recursive: true });
await writeFile("tests/receipts/stellar-testnet-smoke.json", JSON.stringify({
  kind: "technical-test", network: "stellar-testnet", contract: deployment.contract,
  chainId: terms.chain_id, testUsdcTransferred: "0", receipts, checkedAt: new Date().toISOString(),
}, null, 2) + "\n");
console.log("Technical create/accept/cancel check passed. No USDC was funded or paid; this is not a completed service booking.");
