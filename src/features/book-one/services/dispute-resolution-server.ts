import "server-only";
import { randomUUID } from "node:crypto";
import {
  Networks,
  Transaction,
  TransactionBuilder,
  rpc,
} from "@stellar/stellar-sdk";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "../pilot-error";
import { resolverTerms, requireResolver, disputeError } from "./dispute-server";
import {
  chainSnapshot,
  syncEscrow,
  getEscrowConfig,
} from "./stellar-escrow-server";
import { verifySignedTransaction, stellarTestnetRpc } from "./stellar-escrow";
import { awardUnits, buildResolverTransaction } from "./resolver-transaction";
import type { PreparedDecision } from "../types/disputes";

const server = () => new rpc.Server(stellarTestnetRpc, { timeout: 12000 });
type Intent = {
  id: string;
  request_id: string;
  wallet: string;
  provider_units: string | number;
  rationale: string;
  tx_hash: string;
  unsigned_xdr: string;
  status: string;
  expires_at: string;
  created_at: string;
};
const prepared = (d: Intent): PreparedDecision => ({
  intentId: d.id,
  xdr: d.unsigned_xdr,
  wallet: d.wallet,
  networkPassphrase: Networks.TESTNET,
  expiresAt: d.expires_at,
});

async function readIntent(wallet: string, id: string) {
  requireResolver(wallet);
  const r = await getSupabaseAdmin()
    .from("campuscrew_dispute_decisions")
    .select("*")
    .eq("id", id)
    .eq("wallet", wallet)
    .single();
  disputeError(r.error);
  if (!r.data) throw new PilotError("Decision unavailable.", 404);
  return r.data as Intent;
}

export async function syncDecision(wallet: string, id: string) {
  const intent = await readIntent(wallet, id);
  if (intent.status === "confirmed" || intent.status === "failed")
    return { pending: false };
  if (intent.status === "prepared") return { pending: false };
  const terms = await resolverTerms(wallet, intent.request_id);
  const client = server(),
    result = await client.getTransaction(intent.tx_hash),
    db = getSupabaseAdmin();
  if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const tx = TransactionBuilder.fromXDR(result.envelopeXdr, Networks.TESTNET);
    if (
      !(tx instanceof Transaction) ||
      tx.source !== wallet ||
      Buffer.from(tx.hash()).toString("hex") !== intent.tx_hash
    )
      throw new PilotError(
        "Stellar returned a different transaction than the approved decision.",
        409,
      );
    await syncEscrow(terms.organizer, intent.request_id);
    const snapshot = await chainSnapshot(terms),
      booking = snapshot.booking;
    if (
      !booking ||
      snapshot.ledger < result.ledger ||
      !["Paid", "Refundable"].includes(booking.state[0]) ||
      booking.funded - booking.refund_pool !== BigInt(intent.provider_units)
    )
      throw new PilotError(
        "The settlement is not yet consistent with this decision. Check again shortly.",
        409,
      );
    const r = await db.rpc("campuscrew_dispute_confirm", {
      p_id: intent.id,
      p_ledger: result.ledger,
      p_at: new Date(Number(result.createdAt) * 1000).toISOString(),
    });
    disputeError(r.error);
    return { pending: false };
  }
  if (
    result.status === rpc.Api.GetTransactionStatus.FAILED ||
    (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
      Date.parse(intent.expires_at) / 1000 < result.latestLedgerCloseTime &&
      Date.parse(intent.created_at) / 1000 >= result.oldestLedgerCloseTime)
  ) {
    const r = await db
      .from("campuscrew_dispute_decisions")
      .update({ status: "failed" })
      .eq("id", id)
      .eq("status", "submitted");
    disputeError(r.error);
    return { pending: false };
  }
  return { pending: true };
}

export async function reconcileDecisions(wallet?: string) {
  const config = getEscrowConfig();
  if (!config) return;
  const actor = wallet ?? config.resolver;
  requireResolver(actor);
  const r = await getSupabaseAdmin()
    .from("campuscrew_dispute_decisions")
    .select("id")
    .eq("wallet", actor)
    .eq("status", "submitted")
    .order("created_at")
    .limit(8);
  disputeError(r.error);
  const results = await Promise.allSettled(
    (r.data ?? []).map((d) => syncDecision(actor, d.id)),
  );
  if (results.some((r) => r.status === "rejected"))
    throw new PilotError(
      "Some decisions are waiting for a confirmation check.",
      503,
    );
}

export async function resumeDecision(wallet: string, id: string) {
  const d = await readIntent(wallet, id);
  const terms = await resolverTerms(wallet, d.request_id);
  if (d.status !== "prepared" || Date.parse(d.expires_at) <= Date.now())
    throw new PilotError(
      "Prepare a fresh decision; this approval has expired or was already submitted.",
      409,
    );
  if ((await chainSnapshot(terms)).booking?.state[0] !== "Disputed")
    throw new PilotError("This dispute has already been settled. Refresh the case.", 409);
  return prepared(d);
}

export async function prepareDecision(
  wallet: string,
  requestId: string,
  amount: string,
  rationale: string,
) {
  const terms = await resolverTerms(wallet, requestId);
  await reconcileDecisions(wallet);
  await syncEscrow(terms.organizer, requestId);
  const snapshot = await chainSnapshot(terms),
    booking = snapshot.booking;
  if (!booking || booking.state[0] !== "Disputed")
    throw new PilotError(
      "Only a confirmed, open on-chain dispute can be settled.",
      409,
    );
  let units: bigint;
  try {
    units = awardUnits(amount, booking.funded);
  } catch {
    throw new PilotError(
      "Enter an award from zero up to the funded deposit, with at most seven decimals.",
      400,
    );
  }
  const db = getSupabaseAdmin();
  const existing = await db
    .from("campuscrew_dispute_decisions")
    .select("*")
    .eq("request_id", requestId)
    .eq("wallet", wallet)
    .in("status", ["prepared", "submitted"])
    .order("created_at", { ascending: false })
    .limit(8);
  disputeError(existing.error);
  for (const d of (existing.data ?? []) as Intent[]) {
    if (d.status === "submitted")
      throw new PilotError(
        "A decision is pending. Check its confirmation before preparing another.",
        409,
      );
    if (Date.parse(d.expires_at) > Date.now()) {
      if (BigInt(d.provider_units) === units && d.rationale === rationale)
        return prepared(d);
      throw new PilotError(
        "An earlier decision is awaiting signature. Resume it or wait for its approval to expire before changing it.",
        409,
      );
    }
  }
  const client = server(),
    account = await client.getAccount(wallet);
  const tx = buildResolverTransaction(account, terms, booking, units);
  const simulation = await client.simulateTransaction(tx);
  if (
    !rpc.Api.isSimulationSuccess(simulation) ||
    rpc.Api.isSimulationRestore(simulation)
  )
    throw new PilotError(
      "Stellar could not prepare this decision. Check test XLM and the dispute state.",
      409,
    );
  const ready = rpc.assembleTransaction(tx, simulation).build();
  if (Number(ready.fee) > 100_000_000)
    throw new PilotError(
      "The estimated fee is unusually high. Try again later.",
      409,
    );
  const intent = {
    id: randomUUID(),
    request_id: requestId,
    wallet,
    provider_units: units.toString(),
    rationale,
    tx_hash: Buffer.from(ready.hash()).toString("hex"),
    unsigned_xdr: ready.toXDR(),
    expires_at: new Date(
      Number(ready.timeBounds?.maxTime) * 1000,
    ).toISOString(),
  };
  const inserted = await db
    .from("campuscrew_dispute_decisions")
    .upsert(intent, { onConflict: "tx_hash", ignoreDuplicates: true });
  disputeError(inserted.error);
  const saved = await db
    .from("campuscrew_dispute_decisions")
    .select("*")
    .eq("tx_hash", intent.tx_hash)
    .single();
  disputeError(saved.error);
  const d = saved.data as Intent;
  if (
    d.wallet !== wallet ||
    d.request_id !== requestId ||
    d.rationale !== rationale ||
    BigInt(d.provider_units) !== units
  )
    throw new PilotError(
      "The prepared decision does not match this case. Refresh and try again.",
      409,
    );
  return prepared(d);
}

export async function submitDecision(wallet: string, id: string, xdr: string) {
  const d = await readIntent(wallet, id);
  await resolverTerms(wallet, d.request_id);
  if (d.status === "confirmed" || d.status === "submitted")
    return syncDecision(wallet, id);
  if (d.status === "failed" || Date.parse(d.expires_at) <= Date.now())
    throw new PilotError(
      "This decision approval expired. Prepare it again.",
      409,
    );
  let tx: Transaction;
  try {
    tx = verifySignedTransaction(xdr, d.tx_hash, wallet);
  } catch {
    throw new PilotError(
      "The signed transaction does not match this resolver decision.",
      400,
    );
  }
  const marked = await getSupabaseAdmin()
    .from("campuscrew_dispute_decisions")
    .update({ status: "submitted" })
    .eq("id", id)
    .eq("status", "prepared");
  disputeError(marked.error);
  const sent = await server().sendTransaction(tx);
  if (sent.status === "ERROR") {
    const failed = await getSupabaseAdmin()
      .from("campuscrew_dispute_decisions")
      .update({ status: "failed" })
      .eq("id", id)
      .eq("status", "submitted");
    disputeError(failed.error);
    throw new PilotError(
      "Stellar rejected this decision. Check its status before retrying.",
      409,
    );
  }
  return syncDecision(wallet, id);
}
