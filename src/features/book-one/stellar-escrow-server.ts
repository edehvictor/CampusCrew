import "server-only";
import { randomUUID } from "node:crypto";
import { Contract, Networks, StrKey, rpc, scValToNative } from "@stellar/stellar-sdk";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "./pilot-error";
import { checkStellarDatabase } from "./stellar-session";
import {
  assertBookingTerms, bookingChainId, bookingLedgerKey, buildEscrowTransaction, permittedOperations,
  stellarTestnetRpc, testUsdcContract, verifySignedTransaction,
  type ChainBooking, type EscrowOperation, type EscrowTerms,
} from "./stellar-escrow";
import type { Job } from "./model";
import { readWalletBalance } from "./stellar-balance";

type EscrowRow = EscrowTerms & {
  chain_state: string | null; chain_data: unknown; checked_ledger: number;
  funding_tx: string | null; settlement_tx: string | null; completion_note: string | null;
};
type PaymentIntent = {
  id: string; request_id: string; wallet: string; operation: EscrowOperation; tx_hash: string;
  status: string; expires_at: string; created_at: string;
};

export function getEscrowConfig() {
  if (process.env.STELLAR_ESCROW_ENABLED !== "true") return null;
  const contract = process.env.STELLAR_ESCROW_CONTRACT;
  const wasmHash = process.env.STELLAR_ESCROW_WASM_HASH;
  const resolver = process.env.STELLAR_ESCROW_RESOLVER;
  if (!contract || !StrKey.isValidContract(contract) || !wasmHash || !/^[a-f0-9]{64}$/.test(wasmHash)
    || !resolver || !StrKey.isValidEd25519PublicKey(resolver)) return null;
  return { contract, wasmHash, resolver };
}

function configured() {
  const config = getEscrowConfig();
  if (!config) throw new PilotError("Stellar escrow is not configured yet. No payment has been made.", 503);
  return config;
}

function database(error: { code: string; message: string } | null) {
  if (error && ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) {
    throw new PilotError("Apply the Stellar escrow database update (20261121000100_stellar_escrow.sql).", 503);
  }
  checkStellarDatabase(error);
}

function server() { return new rpc.Server(stellarTestnetRpc, { timeout: 12_000 }); }
const jsonData = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));

async function termsFor(wallet: string, requestId: string): Promise<EscrowRow | null> {
  const { data, error } = await getSupabaseAdmin().from("campuscrew_stellar_escrows").select("*").eq("request_id", requestId).maybeSingle();
  database(error);
  if (!data) return null;
  if (data.organizer !== wallet && data.provider !== wallet) throw new PilotError("This booking is not available to this wallet.", 403);
  const config = configured();
  if (data.contract_id !== config.contract || data.token_id !== testUsdcContract || data.resolver !== config.resolver
    || data.chain_id !== bookingChainId(requestId)) throw new PilotError("This booking uses a different escrow deployment.", 409);
  return data as EscrowRow;
}

async function chainSnapshot(terms: EscrowTerms) {
  const config = configured();
  const client = server();
  const instanceKey = new Contract(config.contract).getFootprint();
  const bookingKey = bookingLedgerKey(config.contract, terms.chain_id);
  const [network, result] = await Promise.all([client.getNetwork(), client.getLedgerEntries(instanceKey, bookingKey)]);
  if (network.passphrase !== Networks.TESTNET) throw new Error("Unexpected Stellar network.");
  const instanceEntry = result.entries.find(entry => entry.key.toXDR("base64") === instanceKey.toXDR("base64"));
  if (!instanceEntry || instanceEntry.val.type !== "contractData") throw new PilotError("The escrow contract is unavailable on Stellar Testnet.", 503);
  const instanceValue = instanceEntry.val.contractData.val;
  if (instanceValue.type !== "scvContractInstance") throw new Error("Unexpected contract instance.");
  const instance = instanceValue.instance;
  if (instance.executable.type !== "contractExecutableWasm"
    || Buffer.from(instance.executable.wasmHash.toXdrObject()).toString("hex") !== config.wasmHash) {
    throw new PilotError("The deployed escrow code does not match the verified contract.", 503);
  }
  const storage = new Map((instance.storage ?? []).map(entry => [JSON.stringify(scValToNative(entry.key)), scValToNative(entry.val)]));
  if (storage.get('["Token"]') !== testUsdcContract || storage.get('["Resolver"]') !== config.resolver) {
    throw new PilotError("The escrow token or dispute resolver does not match the deployment settings.", 503);
  }
  const entry = result.entries.find(item => item.key.toXDR("base64") === bookingKey.toXDR("base64"));
  if (entry && entry.val.type !== "contractData") throw new Error("Unexpected booking ledger data.");
  const booking = entry?.val.type === "contractData" ? assertBookingTerms(terms, scValToNative(entry.val.contractData.val)) : null;
  return { booking, ledger: result.latestLedger };
}

async function recordSnapshot(terms: EscrowTerms, snapshot: { booking: ChainBooking | null; ledger: number }, intent?: PaymentIntent) {
  if (!snapshot.booking) return;
  const { error } = await getSupabaseAdmin().rpc("campuscrew_stellar_record_escrow", {
    p_request_id: terms.request_id, p_ledger: snapshot.ledger, p_state: snapshot.booking.state[0], p_data: jsonData(snapshot.booking),
    p_intent_id: intent?.id ?? null, p_tx_hash: intent?.tx_hash ?? null,
  });
  database(error);
}

export async function syncEscrow(wallet: string, requestId: string) {
  const terms = await termsFor(wallet, requestId);
  if (!terms) throw new PilotError("The task owner needs to create the escrow first.", 409);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("campuscrew_stellar_payment_intents").select("*")
    .eq("request_id", requestId).eq("status", "submitted").order("created_at").limit(10);
  database(error);
  let pending = false;
  let failed = false;
  let snapshot = await chainSnapshot(terms);
  for (const intent of (data ?? []) as PaymentIntent[]) {
    const result = await server().getTransaction(intent.tx_hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      if (!snapshot.booking || snapshot.ledger < result.ledger) snapshot = await chainSnapshot(terms);
      if (!snapshot.booking || snapshot.ledger < result.ledger) { pending = true; continue; }
      await recordSnapshot(terms, snapshot, intent);
    } else if (result.status === rpc.Api.GetTransactionStatus.FAILED
      || (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND
        && Date.parse(intent.expires_at) / 1000 < result.latestLedgerCloseTime
        && Date.parse(intent.created_at) / 1000 >= result.oldestLedgerCloseTime)) {
      const update = await db.from("campuscrew_stellar_payment_intents").update({ status: "failed" }).eq("id", intent.id).eq("status", "submitted");
      database(update.error);
      failed = true;
    } else pending = true;
  }
  await recordSnapshot(terms, snapshot);
  return { pending, message: pending ? "Transaction submitted. Waiting for Stellar confirmation; use Refresh payment shortly."
    : failed ? "The transaction did not complete. Booking state has been checked; you can retry the available action."
    : "Booking confirmed against Stellar Testnet." };
}

export async function prepareEscrow(wallet: string, requestId: string, operation: EscrowOperation, note?: string) {
  const config = configured();
  const db = getSupabaseAdmin();
  let terms = await termsFor(wallet, requestId);
  if (!terms && operation === "create") {
    const { data, error } = await db.rpc("campuscrew_stellar_prepare_escrow", {
      p_wallet: wallet, p_request_id: requestId, p_chain_id: bookingChainId(requestId),
      p_contract: config.contract, p_token: testUsdcContract, p_resolver: config.resolver,
    });
    database(error);
    terms = data as EscrowRow;
  }
  if (!terms) throw new PilotError("The task owner needs to create the escrow first.", 409);
  const synced = await syncEscrow(wallet, requestId);
  if (synced.pending) throw new PilotError(synced.message, 409);
  const snapshot = await chainSnapshot(terms);
  if (!permittedOperations(terms, snapshot.booking, wallet, Math.floor(Date.now() / 1000)).includes(operation)) {
    throw new PilotError("That action is not available to this wallet in the current booking state. Refresh payment.", 409);
  }
  if (operation === "submit" && !note?.trim()) throw new PilotError("Add a completion note first.", 400);
  if (operation === "accept" && !(await readWalletBalance(wallet)).hasUsdcTrustline) {
    throw new PilotError("Add Circle's test USDC asset to your wallet before accepting this booking, so you can receive the payout.", 409);
  }
  const client = server();
  let account;
  try { account = await client.getAccount(wallet); }
  catch { throw new PilotError("Activate this wallet on Stellar Testnet with test XLM before signing a booking transaction.", 409); }
  const intentId = randomUUID();
  const transaction = buildEscrowTransaction(account, terms, operation, wallet);
  const simulation = await client.simulateTransaction(transaction);
  if (rpc.Api.isSimulationRestore(simulation)) throw new PilotError("This booking's chain data needs restoration before it can be used. Contact CampusCrew support.", 409);
  if (!rpc.Api.isSimulationSuccess(simulation)) throw new PilotError("Stellar could not prepare this action. Check your test XLM, test USDC and trustline, then refresh payment.", 409);
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  if (Number(prepared.fee) > 100_000_000) throw new PilotError("The estimated transaction fee is unusually high. Try again later.", 409);
  const txHash = Buffer.from(prepared.hash()).toString("hex");
  const expires = new Date(Number(prepared.timeBounds?.maxTime) * 1000).toISOString();
  const inserted = await db.from("campuscrew_stellar_payment_intents").upsert({
    id: intentId, request_id: requestId, wallet, operation, tx_hash: txHash,
    expires_at: expires, completion_note: operation === "submit" ? note!.trim() : null,
  }, { onConflict: "tx_hash", ignoreDuplicates: true });
  database(inserted.error);
  const saved = await db.from("campuscrew_stellar_payment_intents").select("id,wallet,request_id,operation,completion_note")
    .eq("tx_hash", txHash).single();
  database(saved.error);
  if (!saved.data || saved.data.wallet !== wallet || saved.data.request_id !== requestId || saved.data.operation !== operation) {
    throw new PilotError("The prepared transaction did not match this booking.", 409);
  }
  if (operation === "submit" && saved.data.completion_note !== note!.trim()) {
    throw new PilotError("A different completion note was just prepared. Try again shortly.", 409);
  }
  return { intentId: saved.data.id, xdr: prepared.toXDR(), wallet, networkPassphrase: Networks.TESTNET, fee: prepared.fee, expiresAt: expires };
}

export async function submitEscrow(wallet: string, intentId: string, envelope: string) {
  configured();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("campuscrew_stellar_payment_intents").select("*").eq("id", intentId).eq("wallet", wallet).maybeSingle();
  database(error);
  if (!data) throw new PilotError("This payment approval is unavailable to this wallet.", 404);
  const intent = data as PaymentIntent;
  await termsFor(wallet, intent.request_id);
  if (intent.status === "confirmed" || intent.status === "submitted") return syncEscrow(wallet, intent.request_id);
  if (intent.status === "failed" || Date.parse(intent.expires_at) <= Date.now()) throw new PilotError("This transaction expired. Prepare the booking action again.", 409);
  let transaction;
  try { transaction = verifySignedTransaction(envelope, intent.tx_hash, wallet); }
  catch { throw new PilotError("The wallet signature or transaction did not match this booking approval.", 400); }
  // Save the expected hash before submission so a lost response can be recovered safely.
  const marked = await db.from("campuscrew_stellar_payment_intents").update({ status: "submitted" }).eq("id", intent.id).eq("status", "prepared");
  database(marked.error);
  const sent = await server().sendTransaction(transaction);
  if (sent.status === "ERROR") {
    const failed = await db.from("campuscrew_stellar_payment_intents").update({ status: "failed" }).eq("id", intent.id).eq("status", "submitted");
    database(failed.error);
    throw new PilotError("Stellar rejected this transaction. Refresh payment before trying again.", 409);
  }
  return syncEscrow(wallet, intent.request_id);
}

function cachedBooking(row: EscrowRow): ChainBooking | null {
  if (!row.chain_data) return null;
  const value = row.chain_data as Record<string, unknown>;
  const converted = { ...value };
  for (const field of ["total", "funded", "funding_deadline", "work_deadline", "review_deadline", "refund_pool"]) converted[field] = BigInt(String(value[field]));
  converted.participants = (value.participants as Record<string, unknown>[]).map(share => ({ ...share, amount: BigInt(String(share.amount)) }));
  return assertBookingTerms(row, converted);
}

export async function enrichEscrowJobs(jobs: Job[], wallet: string | undefined) {
  if (!getEscrowConfig() || !wallet) return jobs;
  const ids = jobs.filter(job => job.accepted).map(job => job.id);
  if (!ids.length) return jobs;
  const { data, error } = await getSupabaseAdmin().from("campuscrew_stellar_escrows").select("*").in("request_id", ids);
  database(error);
  return jobs.map(job => {
    if (!job.accepted) return job;
    const row = data?.find(item => item.request_id === job.id) as EscrowRow | undefined;
    if (!row) return { ...job, payment: { fundingTx: null, settlementTx: null, refundAfter: null, operations: job.own ? ["create"] : [] } } as Job;
    if (row.organizer !== wallet && row.provider !== wallet) return job;
    const chain = cachedBooking(row);
    const state = chain?.state[0];
    const status: Job["status"] = state === "Funded" ? "Funded" : state === "Submitted" ? "Ready for review"
      : state === "Paid" ? "Paid" : state === "Disputed" ? "Disputed"
      : state === "Refundable" ? chain!.funded === BigInt(0) ? "Cancelled" : chain!.participants[0].refunded ? "Refunded" : "Refund available"
      : "Awaiting funding";
    return { ...job, status, completion: row.completion_note ?? undefined, payment: {
      fundingTx: row.funding_tx, settlementTx: row.settlement_tx, refundAfter: null,
      state: state ?? "Uncreated", operations: permittedOperations(row, chain, wallet, Math.floor(Date.now() / 1000)),
      contract: row.contract_id, resolver: row.resolver, fundingDeadline: row.funding_deadline,
      workDeadline: row.work_deadline, reviewDeadline: Number(chain?.review_deadline ?? 0),
    } } as Job;
  });
}
