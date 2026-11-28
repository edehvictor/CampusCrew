import "server-only";
import { supportedEscrowContracts } from "./escrow-config";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "../pilot-error";
import { isResolverWallet } from "../auth/resolver-access";
import { getEscrowConfig, syncEscrow } from "./stellar-escrow-server";
import { experienceError, participant } from "./experience-server";
import type { DisputeCase } from "../types/disputes";

export function disputeError(error: { code: string; message: string } | null) {
  if (error && ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code))
    throw new PilotError(
      "Apply 20261127000200_dispute_dashboard.sql in Supabase to enable dispute cases.",
      503,
    );
  experienceError(error);
}

export function requireResolver(wallet: string | undefined) {
  const config = getEscrowConfig();
  if (!config)
    throw new PilotError("Dispute administration is not configured.", 503);
  if (!isResolverWallet(wallet, config.resolver))
    throw new PilotError(
      "Sign in with the configured resolver wallet to access dispute administration.",
      403,
    );
  return config;
}

export async function resolverTerms(wallet: string, id: string) {
  requireResolver(wallet);
  const r = await getSupabaseAdmin()
    .from("campuscrew_stellar_escrows")
    .select("*")
    .eq("request_id", id)
    .single();
  disputeError(r.error);
  if (
    !r.data ||
    r.data.resolver !== wallet ||
    !supportedEscrowContracts().includes(r.data.contract_id)
  )
    throw new PilotError("This case is not assigned to this resolver.", 403);
  return r.data;
}

export async function readDispute(
  wallet: string,
  id: string,
  admin = false,
): Promise<DisputeCase | null> {
  if (admin) await resolverTerms(wallet, id);
  else await participant(wallet, id);
  const db = getSupabaseAdmin();
  const report = await db
    .from("campuscrew_dispute_cases")
    .select("*")
    .eq("request_id", id)
    .maybeSingle();
  disputeError(report.error);
  if (!report.data) return null;
  const [escrow, task, statements, decisions, evidence, messages, events] =
    await Promise.all([
      db
        .from("campuscrew_stellar_escrows")
        .select("*")
        .eq("request_id", id)
        .single(),
      db
        .from("campuscrew_stellar_tasks")
        .select("title,scope")
        .eq("id", id)
        .single(),
      db
        .from("campuscrew_dispute_statements")
        .select("id,wallet,body,created_at")
        .eq("request_id", id)
        .order("created_at")
        .limit(100),
      admin
        ? db
            .from("campuscrew_dispute_decisions")
            .select(
              "id,provider_units,rationale,tx_hash,status,expires_at,confirmed_at",
            )
            .eq("request_id", id)
            .order("created_at", { ascending: false })
            .limit(10)
        : db
            .from("campuscrew_dispute_decisions")
            .select(
              "id,provider_units,rationale,tx_hash,status,expires_at,confirmed_at",
            )
            .eq("request_id", id)
            .eq("status", "confirmed")
            .order("created_at", { ascending: false })
            .limit(1),
      db
        .from("campuscrew_booking_evidence")
        .select("id,name,mime,bytes,uploader,created_at")
        .is("removed_at", null)
        .eq("request_id", id)
        .order("created_at"),
      db
        .from("campuscrew_booking_messages")
        .select("id,sender,body,created_at")
        .eq("request_id", id)
        .order("created_at")
        .limit(100),
      db
        .from("campuscrew_booking_events")
        .select("id,label,created_at")
        .eq("request_id", id)
        .order("created_at")
        .limit(100),
    ]);
  for (const r of [
    escrow,
    task,
    statements,
    decisions,
    evidence,
    messages,
    events,
  ])
    disputeError(r.error);
  const e = escrow.data!;
  const identities = await db
    .from("campuscrew_stellar_profiles")
    .select("wallet,display_name")
    .in("wallet", [e.organizer, e.provider]);
  disputeError(identities.error);
  const role = (address: string) =>
    address === e.organizer
      ? "Task owner"
      : address === e.provider
        ? "Provider"
        : "Resolver";
  const names = (address: string) =>
    identities.data?.find((p) => p.wallet === address)?.display_name ??
    role(address);
  return {
    id,
    title: task.data!.title,
    scope: task.data!.scope,
    owner: names(e.organizer),
    provider: names(e.provider),
    ownerWallet: e.organizer,
    providerWallet: e.provider,
    amount: e.amount,
    funded: Number(e.chain_data?.funded ?? 0) / 10_000_000,
    refund: Number(e.chain_data?.refund_pool ?? 0) / 10_000_000,
    state: e.chain_state ?? "Uncreated",
    status:
      e.chain_state === "Disputed"
        ? report.data.review_status
        : ["Paid", "Refundable"].includes(e.chain_state)
          ? "settled"
          : "awaiting_pause",
    reason: report.data.reason,
    summary: report.data.summary,
    createdAt: report.data.created_at,
    completion: e.completion_note,
    statements: (statements.data ?? []).map((s) => ({
      id: s.id,
      body: s.body,
      role: role(s.wallet),
      createdAt: s.created_at,
    })),
    decisions: (decisions.data ?? []).map((d) => ({
      id: d.id,
      amount: String(Number(d.provider_units) / 10_000_000),
      rationale: d.rationale,
      hash: d.tx_hash,
      status: d.status,
      expiresAt: d.expires_at,
      confirmedAt: d.confirmed_at,
      canResume:
        d.status === "prepared" && Date.parse(d.expires_at) > Date.now(),
    })),
    evidence: evidence.data ?? [],
    messages: (messages.data ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      role: role(m.sender),
      createdAt: m.created_at,
    })),
    events: (events.data ?? []).map((e) => ({
      ...e,
      label: e.label.replace(/ \? /g, " - "),
    })),
  };
}

export async function disputeQueue(wallet: string) {
  requireResolver(wallet);
  const db = getSupabaseAdmin();
  const active = await db
    .from("campuscrew_stellar_escrows")
    .select("request_id")
    .eq("resolver", wallet)
    .in("contract_id", supportedEscrowContracts())
    .eq("chain_state", "Disputed")
    .limit(50);
  disputeError(active.error);
  if (active.data?.length) {
    const imported = await db.from("campuscrew_dispute_cases").upsert(
      active.data.map((e) => ({
        request_id: e.request_id,
        reason: "Other",
        summary:
          "Dispute opened on-chain. Participant statements have not been provided.",
      })),
      { onConflict: "request_id", ignoreDuplicates: true },
    );
    disputeError(imported.error);
  }
  const cases = await db
    .from("campuscrew_dispute_cases")
    .select("request_id,reason,summary,created_at,review_status")
    .order("created_at", { ascending: false })
    .limit(50);
  disputeError(cases.error);
  if (!cases.data?.length) return [];
  const ids = cases.data.map((c) => c.request_id);
  const [escrows, tasks] = await Promise.all([
    db
      .from("campuscrew_stellar_escrows")
      .select("request_id,amount,chain_state")
      .in("request_id", ids)
      .eq("resolver", wallet)
      .in("contract_id", supportedEscrowContracts()),
    db.from("campuscrew_stellar_tasks").select("id,title").in("id", ids),
  ]);
  disputeError(escrows.error);
  disputeError(tasks.error);
  return cases.data.flatMap((c) => {
    const e = escrows.data?.find((e) => e.request_id === c.request_id);
    if (!e) return [];
    return [
      {
        id: c.request_id,
        title:
          tasks.data?.find((t) => t.id === c.request_id)?.title ?? "Booking",
        reason: c.reason,
        amount: e.amount,
        state: e.chain_state,
        status:
          e.chain_state === "Disputed"
            ? c.review_status
            : ["Paid", "Refundable"].includes(e.chain_state)
              ? "settled"
              : "awaiting_pause",
        createdAt: c.created_at,
      },
    ];
  });
}

export async function readEvidenceAsResolver(wallet: string, id: string) {
  await resolverTerms(wallet, id);
  const c = await getSupabaseAdmin()
    .from("campuscrew_dispute_cases")
    .select("request_id")
    .eq("request_id", id)
    .maybeSingle();
  disputeError(c.error);
  if (!c.data)
    throw new PilotError(
      "Evidence is available to the resolver only for a dispute case.",
      403,
    );
}

export async function reportDispute(
  wallet: string,
  id: string,
  reason: string,
  summary: string,
) {
  await participant(wallet, id);
  await syncEscrow(wallet, id);
  const result = await getSupabaseAdmin().rpc("campuscrew_dispute_report", {
    p_wallet: wallet,
    p_request_id: id,
    p_reason: reason,
    p_summary: summary,
  });
  disputeError(result.error);
}
