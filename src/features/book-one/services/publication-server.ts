import "server-only";
import { randomUUID } from "node:crypto";
import { Contract, Networks, rpc, scValToNative } from "@stellar/stellar-sdk";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkStellarDatabase } from "../auth/stellar-session";
import { PilotError } from "../pilot-error";
import { getFundedPostingConfig } from "./escrow-config";
import { readWalletBalance } from "./stellar-balance";
import {
  stellarTestnetRpc,
  testUsdcContract,
  verifySignedTransaction,
} from "./stellar-escrow";
import {
  canExpirePublication,
  assertPublication,
  buildPublicationTransaction,
  publicationLedgerKey,
  type PublicationTerms,
} from "./publication";
import type { PilotMutation } from "../types/pilot";
import type {
  PublicationRecovery,
  PublicationResult,
} from "../types/publication";

type Intent = {
  id: string;
  request_id: string;
  wallet: string;
  operation: "publish" | "cancel";
  contract_id: string;
  tx_hash: string;
  draft: Extract<PilotMutation, { action: "post" }>;
  publication_deadline: number;
  created_at: string;
  expires_at: string;
  status: string;
};
const client = () => new rpc.Server(stellarTestnetRpc, { timeout: 12000 });
function configured() {
  const c = getFundedPostingConfig();
  if (!c)
    throw new PilotError(
      "Funded publishing is not available yet. No payment has been taken.",
      503,
    );
  return c;
}
function database(error: { code: string; message: string } | null) {
  if (
    error &&
    ["42P01", "42883", "PGRST202", "PGRST205", "42703"].includes(error.code)
  )
    throw new PilotError(
      "Funded tasks need the 20261128000200_funded_task_lifecycle.sql database update.",
      503,
    );
  checkStellarDatabase(error);
}
const terms = (intent: Intent): PublicationTerms => ({
  requestId: intent.request_id,
  wallet: intent.wallet,
  budget: intent.draft.budget,
  deadline: intent.publication_deadline,
  contract: intent.contract_id,
});

async function publicationState(t: PublicationTerms) {
  const config = configured();
  if (config.contract !== t.contract)
    throw new PilotError("This task uses a different funding deployment.", 409);
  const instanceKey = new Contract(t.contract).getFootprint(),
    key = publicationLedgerKey(t),
    server = client();
  const [network, ledger] = await Promise.all([
    server.getNetwork(),
    server.getLedgerEntries(instanceKey, key),
  ]);
  if (network.passphrase !== Networks.TESTNET)
    throw new Error("Unexpected network");
  const entry = ledger.entries.find(
    (e) => e.key.toXDR("base64") === instanceKey.toXDR("base64"),
  );
  if (
    !entry ||
    entry.val.type !== "contractData" ||
    entry.val.contractData.val.type !== "scvContractInstance"
  )
    throw new PilotError("The funded task contract is unavailable.", 503);
  const instance = entry.val.contractData.val.instance;
  const values = new Map(
    (instance.storage ?? []).map((e) => [
      JSON.stringify(scValToNative(e.key)),
      scValToNative(e.val),
    ]),
  );
  if (
    instance.executable.type !== "contractExecutableWasm" ||
    Buffer.from(instance.executable.wasmHash.toXdrObject()).toString("hex") !==
      config.wasmHash ||
    values.get('["Token"]') !== testUsdcContract ||
    values.get('["Resolver"]') !== config.resolver
  )
    throw new PilotError(
      "The funding contract does not match its verified deployment.",
      503,
    );
  const reserve = ledger.entries.find(
    (e) => e.key.toXDR("base64") === key.toXDR("base64"),
  );
  return {
    value:
      reserve?.val.type === "contractData"
        ? assertPublication(t, scValToNative(reserve.val.contractData.val))
        : null,
    ledger: ledger.latestLedger,
  };
}

async function readIntent(wallet: string, id: string) {
  const r = await getSupabaseAdmin()
    .from("campuscrew_publication_intents")
    .select("*")
    .eq("id", id)
    .eq("wallet", wallet)
    .maybeSingle();
  database(r.error);
  if (!r.data)
    throw new PilotError(
      "This funding approval is not available to your wallet.",
      404,
    );
  return r.data as Intent;
}
export async function preparePublication(
  wallet: string,
  draft: Extract<PilotMutation, { action: "post" }>,
) {
  const config = configured(),
    db = getSupabaseAdmin();
  await reconcilePublications(wallet);
  const profile = await db
    .from("campuscrew_stellar_profiles")
    .select("wallet")
    .eq("wallet", wallet)
    .maybeSingle();
  database(profile.error);
  if (!profile.data)
    throw new PilotError(
      "Complete your profile before publishing a task.",
      409,
    );
  const existing = await db
    .from("campuscrew_stellar_tasks")
    .select("id")
    .eq("id", draft.requestId)
    .maybeSingle();
  database(existing.error);
  if (existing.data)
    throw new PilotError(
      "This task already exists. Refresh before posting again.",
      409,
    );
  const pending = await db
    .from("campuscrew_publication_intents")
    .select("id")
    .eq("request_id", draft.requestId)
    .eq("wallet", wallet)
    .in("status", ["prepared", "submitted"]);
  database(pending.error);
  if (pending.data?.length)
    throw new PilotError(
      "A funding approval already exists for this task. Use Check funding before retrying.",
      409,
    );
  const balance = await readWalletBalance(wallet);
  if (
    !balance.accountExists ||
    !balance.hasUsdcTrustline ||
    Number(balance.usdc) < draft.budget
  )
    throw new PilotError(
      "Add test XLM and enough Circle test USDC to fund this budget before publishing.",
      409,
    );
  const t: PublicationTerms = {
    requestId: draft.requestId,
    wallet,
    budget: draft.budget,
    deadline: Math.floor(Date.now() / 1000) + 86400,
    contract: config.contract,
  };
  return prepare(wallet, t, "publish", draft);
}
export async function preparePublicationCancellation(
  wallet: string,
  requestId: string,
) {
  configured();
  await reconcilePublications(wallet);
  const db = getSupabaseAdmin();
  const r = await db
    .from("campuscrew_task_publications")
    .select("*")
    .eq("request_id", requestId)
    .eq("organizer", wallet)
    .single();
  database(r.error);
  if (!r.data || r.data.status !== "active")
    throw new PilotError("Funded task unavailable.", 404);
  const t: PublicationTerms = {
    requestId,
    wallet,
    budget: r.data.budget,
    deadline: r.data.expires_at,
    contract: r.data.contract_id,
  };
  const state = await publicationState(t);
  if (state.value?.state[0] !== "Open")
    throw new PilotError(
      "This task has already been assigned or refunded. Open its booking to continue.",
      409,
    );
  return prepare(wallet, t, "cancel", {
    action: "post",
    requestId,
    title: "Task cancellation",
    category: "Errands",
    area: "On campus",
    timing: "",
    budget: t.budget,
    scope: "",
    evidenceRequired: false,
  });
}
async function prepare(
  wallet: string,
  t: PublicationTerms,
  operation: "publish" | "cancel",
  draft: Extract<PilotMutation, { action: "post" }>,
) {
  const server = client(),
    account = await server.getAccount(wallet),
    transaction = buildPublicationTransaction(account, t, operation);
  // Verify code/token/resolver before even requesting a wallet signature.
  await publicationState(t);
  const simulation = await server.simulateTransaction(transaction);
  if (
    !rpc.Api.isSimulationSuccess(simulation) ||
    rpc.Api.isSimulationRestore(simulation)
  )
    throw new PilotError(
      "Stellar could not prepare this funding action. Check your test funds and wallet.",
      409,
    );
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  if (Number(prepared.fee) > 100000000)
    throw new PilotError(
      "The estimated network fee is unusually high. Try again later.",
      409,
    );
  const id = randomUUID(),
    hash = Buffer.from(prepared.hash()).toString("hex"),
    expires = new Date(
      Number(prepared.timeBounds?.maxTime) * 1000,
    ).toISOString(),
    db = getSupabaseAdmin();
  if (operation === "cancel") {
    const r = await db.rpc("campuscrew_prepare_publication_cancel", {
      p_intent: id,
      p_id: t.requestId,
      p_wallet: wallet,
      p_contract: t.contract,
      p_hash: hash,
      p_expires: expires,
      p_deadline: t.deadline,
    });
    database(r.error);
  } else {
    const r = await db.from("campuscrew_publication_intents").insert({
      id,
      request_id: t.requestId,
      wallet,
      operation,
      contract_id: t.contract,
      tx_hash: hash,
      draft,
      publication_deadline: t.deadline,
      expires_at: expires,
    });
    database(r.error);
  }
  return {
    intentId: id,
    xdr: prepared.toXDR(),
    wallet,
    networkPassphrase: Networks.TESTNET,
    fee: prepared.fee,
  };
}

export async function syncPublication(
  wallet: string,
  id: string,
): Promise<PublicationResult> {
  const intent = await readIntent(wallet, id),
    db = getSupabaseAdmin();
  const confirmed = (message: string) => ({
    confirmed: true,
    intentId: id,
    requestId: intent.request_id,
    message,
  });
  if (intent.status === "confirmed")
    return confirmed(
      intent.operation === "publish"
        ? "Task funded and published."
        : "Task removed and deposit returned.",
    );
  if (intent.status === "failed")
    throw new PilotError(
      "This funding approval did not complete. No task was published by it. Check the receipt before retrying.",
      409,
    );
  const result = await client().getTransaction(intent.tx_hash);
  if (result.status === "FAILED") {
    const r = await db
      .from("campuscrew_publication_intents")
      .update({ status: "failed" })
      .eq("id", id);
    database(r.error);
    throw new PilotError(
      "Stellar rejected this action. Its deposit was not transferred by this transaction.",
      409,
    );
  }
  let receipt =
    result.status === "SUCCESS"
      ? { envelope: result.envelopeXdr.toXDR("base64"), ledger: result.ledger }
      : null;
  if (
    result.status === "NOT_FOUND" &&
    Date.parse(intent.created_at) < result.oldestLedgerCloseTime * 1000
  ) {
    // Horizon retains receipts beyond the short RPC history. The saved hash,
    // Testnet signature and live contract reserve still have to match below.
    const archive = await fetch(
      "https://horizon-testnet.stellar.org/transactions/" + intent.tx_hash,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (archive.ok) {
      const value = await archive.json();
      if (
        value.successful === true &&
        Number.isInteger(value.ledger) &&
        typeof value.envelope_xdr === "string"
      )
        receipt = { envelope: value.envelope_xdr, ledger: value.ledger };
    }
  }
  if (!receipt) {
    if (canExpirePublication(intent, result, Date.now())) {
      const r = await db
        .from("campuscrew_publication_intents")
        .update({ status: "failed" })
        .eq("id", id);
      database(r.error);
      throw new PilotError(
        "The unsigned or unconfirmed approval expired. You can try again.",
        409,
      );
    }
    return {
      confirmed: false,
      intentId: id,
      requestId: intent.request_id,
      message:
        intent.operation === "cancel"
          ? "Waiting for Stellar refund confirmation. Applications remain paused."
          : "Waiting for Stellar confirmation. The task is not published yet.",
    };
  }
  verifySignedTransaction(receipt.envelope, intent.tx_hash, wallet);
  const snapshot = await publicationState(terms(intent));
  if (snapshot.ledger < receipt.ledger || !snapshot.value)
    throw new PilotError(
      "Funding confirmed; its ledger state is still catching up. Use Check funding shortly.",
      409,
    );
  const expected = intent.operation === "publish" ? "Open" : "Cancelled";
  if (snapshot.value.state[0] !== expected)
    throw new PilotError(
      "The task funding state has changed. Contact support with the transaction receipt.",
      409,
    );
  const submitted = await db
    .from("campuscrew_publication_intents")
    .update({ status: "submitted" })
    .eq("id", id)
    .in("status", ["prepared", "submitted"]);
  database(submitted.error);
  const record =
    intent.operation === "publish"
      ? await db.rpc("campuscrew_record_publication", {
          p_intent: id,
          p_hash: intent.tx_hash,
          p_ledger: receipt.ledger,
        })
      : await db.rpc("campuscrew_remove_task", {
          p_wallet: wallet,
          p_id: intent.request_id,
          p_intent: id,
          p_hash: intent.tx_hash,
        });
  database(record.error);
  return confirmed(
    intent.operation === "publish"
      ? "Task funded and published."
      : "Task removed and deposit returned.",
  );
}
export async function submitPublication(
  wallet: string,
  id: string,
  envelope: string,
) {
  const intent = await readIntent(wallet, id);
  if (intent.status !== "prepared") return syncPublication(wallet, id);
  if (Date.parse(intent.expires_at) <= Date.now())
    return syncPublication(wallet, id);
  let transaction;
  try {
    transaction = verifySignedTransaction(envelope, intent.tx_hash, wallet);
  } catch {
    throw new PilotError(
      "The signed transaction does not match this funding approval.",
      400,
    );
  }
  const r = await getSupabaseAdmin()
    .from("campuscrew_publication_intents")
    .update({ status: "submitted" })
    .eq("id", id)
    .eq("status", "prepared");
  database(r.error);
  await client().sendTransaction(transaction);
  return syncPublication(wallet, id);
}
export async function publicationRecoveries(
  wallet: string,
): Promise<PublicationRecovery[]> {
  const r = await getSupabaseAdmin()
    .from("campuscrew_publication_intents")
    .select("id,request_id,draft,status,operation")
    .eq("wallet", wallet)
    .in("status", ["prepared", "submitted"])
    .order("created_at", { ascending: false })
    .limit(12);
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return [];
  database(r.error);
  return (r.data ?? []).map((i) => ({
    id: i.id,
    requestId: i.request_id,
    title: i.draft.title,
    operation: i.operation,
    status: i.status,
  }));
}
export async function reconcilePublications(wallet?: string) {
  if (!getFundedPostingConfig()) return;
  let query = getSupabaseAdmin()
    .from("campuscrew_publication_intents")
    .select("id,wallet")
    .in("status", ["prepared", "submitted"])
    .order("checked_at", { nullsFirst: true })
    .limit(wallet ? 2 : 4);
  if (wallet) query = query.eq("wallet", wallet);
  const r = await query;
  database(r.error);
  await Promise.allSettled(
    (r.data ?? []).map(async (intent) => {
      try {
        await syncPublication(intent.wallet, intent.id);
      } finally {
        await getSupabaseAdmin()
          .from("campuscrew_publication_intents")
          .update({ checked_at: new Date().toISOString() })
          .eq("id", intent.id);
      }
    }),
  );
}
