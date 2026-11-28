import "server-only";
import { rpc } from "@stellar/stellar-sdk";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "../pilot-error";
import { experienceError, participant } from "./experience-server";
import { syncEscrow, chainSnapshot } from "./stellar-escrow-server";
import { stellarTestnetRpc, type EscrowTerms } from "./stellar-escrow";

export function evidenceDatabase(
  error: { code: string; message: string } | null,
) {
  if (error && ["42703", "42883", "PGRST202", "PGRST204"].includes(error.code))
    throw new PilotError(
      "Attachment editing is temporarily unavailable. Please try again after the service update.",
      503,
    );
  experienceError(error);
}
export async function removeEvidence(
  wallet: string,
  booking: string,
  id: string,
) {
  await participant(wallet, booking);
  const db = getSupabaseAdmin();
  // Observe the chain first: a confirmed completion cannot be made editable by
  // stale browser/DB state. Prepared-but-expired approvals need ledger proof.
  await syncEscrow(wallet, booking);
  const pending = await db
    .from("campuscrew_stellar_payment_intents")
    .select("id,tx_hash,created_at,expires_at")
    .eq("request_id", booking)
    .eq("wallet", wallet)
    .eq("operation", "submit")
    .eq("status", "prepared");
  evidenceDatabase(pending.error);
  for (const intent of pending.data ?? []) {
    if (Date.parse(intent.expires_at) > Date.now())
      throw new PilotError(
        "A completion approval is still active. If you cancelled it, wait for its three-minute expiry, then try Remove again.",
        409,
      );
    const result = await new rpc.Server(stellarTestnetRpc, {
      timeout: 12000,
    }).getTransaction(intent.tx_hash);
    if (result.status === "SUCCESS") {
      const r = await db
        .from("campuscrew_stellar_payment_intents")
        .update({ status: "submitted" })
        .eq("id", intent.id)
        .eq("status", "prepared");
      evidenceDatabase(r.error);
      await syncEscrow(wallet, booking);
    } else {
      let expired =
        result.status === "NOT_FOUND" &&
        Date.parse(intent.created_at) >= result.oldestLedgerCloseTime * 1000 &&
        Date.parse(intent.expires_at) + 15000 <
          result.latestLedgerCloseTime * 1000;
      if (
        result.status === "NOT_FOUND" &&
        !expired &&
        Date.parse(intent.expires_at) + 15000 <
          result.latestLedgerCloseTime * 1000
      ) {
        // RPC may have forgotten the receipt. A fresh Funded state at or after
        // its latest closed ledger proves this monotonic contract never submitted
        // completion; the expired approval cannot execute in a future ledger.
        const terms = await db
          .from("campuscrew_stellar_escrows")
          .select("*")
          .eq("request_id", booking)
          .single();
        evidenceDatabase(terms.error);
        const live = await chainSnapshot(terms.data as EscrowTerms);
        expired =
          live.ledger >= result.latestLedger &&
          live.booking?.state[0] === "Funded";
      }
      if (result.status !== "FAILED" && !expired) continue;
      const r = await db
        .from("campuscrew_stellar_payment_intents")
        .update({ status: "failed" })
        .eq("id", intent.id)
        .eq("status", "prepared");
      evidenceDatabase(r.error);
    }
  }
  const removed = await db.rpc("campuscrew_remove_evidence", {
    p_wallet: wallet,
    p_request_id: booking,
    p_id: id,
  });
  evidenceDatabase(removed.error);
  const deletion = await db.storage
    .from("campuscrew-evidence")
    .remove([removed.data]);
  if (!deletion.error) {
    const r = await db
      .from("campuscrew_booking_evidence")
      .update({ object_deleted_at: new Date().toISOString() })
      .eq("id", id)
      .not("removed_at", "is", null);
    evidenceDatabase(r.error);
  }
  // The authenticated read route denies removed files immediately. Failed object
  // deletion is retried by the worker; evidence metadata and audit history remain.
  return { removed: true };
}
export async function purgeRemovedEvidence() {
  const db = getSupabaseAdmin();
  const pending = await db
    .from("campuscrew_booking_evidence")
    .select("id,object_path")
    .not("removed_at", "is", null)
    .is("object_deleted_at", null)
    .order("removed_at")
    .limit(12);
  if (pending.error?.code === "42703") return;
  evidenceDatabase(pending.error);
  for (const file of pending.data ?? []) {
    const r = await db.storage
      .from("campuscrew-evidence")
      .remove([file.object_path]);
    if (!r.error) {
      const saved = await db
        .from("campuscrew_booking_evidence")
        .update({ object_deleted_at: new Date().toISOString() })
        .eq("id", file.id);
      evidenceDatabase(saved.error);
    }
  }
}
