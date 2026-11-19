import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Job } from "./model";
import type { PilotMutation, PilotProfile, PilotSnapshot } from "./pilot-types";
import { PilotError } from "./pilot-error";
import { checkStellarDatabase, readStellarSession, type StellarUser } from "./stellar-session";

export const authenticate = readStellarSession;

export async function readSnapshot(user: StellarUser | null): Promise<PilotSnapshot> {
  const db = getSupabaseAdmin();
  const [board, profile] = await Promise.all([
    db.rpc("campuscrew_stellar_board", { p_wallet: user?.wallet ?? null }),
    user ? db.from("campuscrew_stellar_profiles").select("display_name, area, skills, coverage, bio")
      .eq("wallet", user.wallet).maybeSingle() : null,
  ]);
  checkStellarDatabase(board.error);
  checkStellarDatabase(profile?.error ?? null);
  const row = profile?.data;
  const details = row ? {
    displayName: row.display_name, area: row.area, skills: row.skills, coverage: row.coverage, bio: row.bio,
  } as PilotProfile : null;
  return {
    jobs: (board.data ?? []) as Job[],
    account: user ? { wallet: user.wallet, profile: details } : null,
    paymentsEnabled: false,
  };
}

export async function runPilotMutation(user: StellarUser, mutation: PilotMutation) {
  const db = getSupabaseAdmin();
  if (mutation.action === "payment" || mutation.action === "complete") {
    throw new PilotError("Stellar escrow funding and payouts are being connected. This booking has not been paid.", 503);
  }
  if (mutation.action === "profile") {
    const { displayName, area, skills, coverage, bio } = mutation.profile;
    const { error } = await db.from("campuscrew_stellar_profiles").upsert({
      wallet: user.wallet, display_name: displayName, area,
      skills: [...new Set(skills)], coverage: [...new Set(coverage)], bio,
    }, { onConflict: "wallet" });
    checkStellarDatabase(error);
    return {};
  }
  const { data: profile, error: profileError } = await db.from("campuscrew_stellar_profiles")
    .select("wallet").eq("wallet", user.wallet).maybeSingle();
  checkStellarDatabase(profileError);
  if (!profile) throw new PilotError("Complete your CampusCrew profile first.", 409);

  switch (mutation.action) {
    case "post": {
      const { requestId, title, category, area, timing, budget, scope } = mutation;
      const { error } = await db.from("campuscrew_stellar_tasks").insert({
        id: requestId, requester_wallet: user.wallet, title, category, area, timing, budget, scope,
      });
      if (error?.code === "23505") {
        const existing = await db.from("campuscrew_stellar_tasks").select("id")
          .eq("id", requestId).eq("requester_wallet", user.wallet).maybeSingle();
        checkStellarDatabase(existing.error);
        if (existing.data) return { requestId };
      }
      checkStellarDatabase(error);
      return { requestId };
    }
    case "apply": {
      const { error } = await db.rpc("campuscrew_stellar_apply", {
        p_wallet: user.wallet, p_request_id: mutation.requestId, p_amount: mutation.amount,
        p_availability: mutation.availability, p_note: mutation.note,
      });
      checkStellarDatabase(error);
      return {};
    }
    case "select": {
      const { error } = await db.rpc("campuscrew_stellar_select_provider", {
        p_wallet: user.wallet, p_request_id: mutation.requestId, p_application_id: mutation.applicationId,
      });
      checkStellarDatabase(error);
      return {};
    }
  }
}
