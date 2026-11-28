import "server-only";
import { notificationPath } from "./notification-path";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkStellarDatabase } from "@/features/book-one/auth/stellar-session";
import { PilotError } from "@/features/book-one/pilot-error";
import type { Job } from "@/features/book-one/model";
import type {
  PublicProvider,
  ActivityNotification,
  BookingExperience,
} from "@/features/book-one/types/experience";
export function experienceError(
  error: { code: string; message: string } | null,
) {
  if (
    error &&
    ["42P01", "42703", "42883", "PGRST202", "PGRST205"].includes(error.code)
  )
    throw new PilotError(
      "Apply the CampusCrew experience database updates (20261123000100 and 20261123000200).",
      503,
    );
  checkStellarDatabase(error);
}
export async function participant(wallet: string, id: string) {
  const r = await getSupabaseAdmin().rpc("campuscrew_experience_participant", {
    p_wallet: wallet,
    p_request_id: id,
  });
  experienceError(r.error);
  if (!r.data) throw new PilotError("This booking is private.", 403);
}
export async function profiles(id?: string): Promise<PublicProvider[]> {
  const r = await getSupabaseAdmin().rpc("campuscrew_experience_profiles", {
    p_id: id ?? null,
  });
  experienceError(r.error);
  return r.data ?? [];
}
export async function notifications(
  wallet: string,
): Promise<ActivityNotification[]> {
  const r = await getSupabaseAdmin()
    .from("campuscrew_notifications")
    .select("id,event_key,request_id,title,created_at,read_at")
    .eq("wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(100);
  experienceError(r.error);
  return (r.data ?? []).map((n) => ({
    id: n.id,
    request_id: n.request_id,
    created_at: n.created_at,
    read_at: n.read_at,
    title: n.title.replace(/ \? /g, " - "),
    path: notificationPath(n.request_id, n.event_key),
  }));
}
export async function enrichExperience(jobs: Job[], wallet?: string) {
  if (!jobs.length) {
    await profiles();
    return jobs;
  }
  const db = getSupabaseAdmin();
  const tasks = await db
    .from("campuscrew_stellar_tasks")
    .select("id,evidence_required")
    .in(
      "id",
      jobs.map((j) => j.id),
    );
  experienceError(tasks.error);
  const quoteIds = jobs.flatMap((j) => j.quotes.map((q) => q.id));
  const applications = quoteIds.length
    ? await db
        .from("campuscrew_stellar_applications")
        .select("id,provider_wallet")
        .in("id", quoteIds)
    : null;
  experienceError(applications?.error ?? null);
  const providers = await profiles();
  const wallets = applications?.data?.map((a) => a.provider_wallet) ?? [];
  const identities = wallets.length
    ? await db
        .from("campuscrew_stellar_profiles")
        .select("wallet,public_id")
        .in("wallet", wallets)
    : null;
  experienceError(identities?.error ?? null);
  const mine = wallet
    ? await db
        .from("campuscrew_reviews")
        .select("request_id")
        .eq("reviewer", wallet)
    : null;
  experienceError(mine?.error ?? null);
  return jobs.map((j) => ({
    ...j,
    evidenceRequired:
      tasks.data?.find((t) => t.id === j.id)?.evidence_required ?? false,
    reviewed: mine?.data?.some((r) => r.request_id === j.id) ?? false,
    quotes: j.quotes.map((q) => {
      const address = applications?.data?.find(
        (a) => a.id === q.id,
      )?.provider_wallet;
      const id = identities?.data?.find((p) => p.wallet === address)?.public_id;
      const profile = providers.find((p) => p.id === id);
      return { ...q, profileId: id, reputation: profile?.stats };
    }),
  }));
}
export async function bookingExperience(
  wallet: string,
  id: string,
): Promise<BookingExperience> {
  await participant(wallet, id);
  const db = getSupabaseAdmin();
  const [events, messages, evidence, reviews, escrow] = await Promise.all([
    db
      .from("campuscrew_booking_events")
      .select("id,label,created_at")
      .eq("request_id", id)
      .order("created_at")
      .limit(200),
    db
      .from("campuscrew_booking_messages")
      .select("id,sender,body,created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("campuscrew_booking_evidence")
      .select("id,name,mime,bytes,uploader,created_at")
      .is("removed_at", null)
      .eq("request_id", id)
      .order("created_at"),
    db
      .from("campuscrew_reviews")
      .select("reviewer,stars,comment")
      .eq("request_id", id),
    db
      .from("campuscrew_stellar_escrows")
      .select("chain_state,settlement_tx,settled_at")
      .eq("request_id", id)
      .maybeSingle(),
  ]);
  for (const r of [events, messages, evidence, reviews, escrow])
    experienceError(r.error);
  const own = reviews.data?.find((r) => r.reviewer === wallet);
  return {
    events: (events.data ?? []).map((event) => ({
      ...event,
      label: event.label.replace(/ \? /g, " - "),
    })),
    messages: (messages.data ?? []).reverse().map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.sender === wallet,
      name: m.sender === wallet ? "You" : "Booking partner",
      created_at: m.created_at,
    })),
    evidence: (evidence.data ?? []).map(({ uploader, ...file }) => ({
      ...file,
      mine: uploader === wallet,
    })),
    canReview:
      escrow.data?.chain_state === "Paid" &&
      Boolean(escrow.data.settlement_tx) &&
      Boolean(escrow.data.settled_at) &&
      Date.parse(escrow.data.settled_at) > Date.now() - 14 * 86400000 &&
      !own,
    ownReview: own ? { stars: own.stars, comment: own.comment } : null,
  };
}
