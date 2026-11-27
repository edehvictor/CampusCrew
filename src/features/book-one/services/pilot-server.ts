import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Job } from "@/features/book-one/model";
import type { PilotMutation, PilotProfile, PilotSnapshot } from "@/features/book-one/types/pilot";
import { PilotError } from "@/features/book-one/pilot-error";
import {
  checkStellarDatabase,
  readStellarSession,
  type StellarUser,
} from "@/features/book-one/auth/stellar-session";
import {
  enrichEscrowJobs,
  getEscrowConfig,
  reconcilePending,
} from "@/features/book-one/services/stellar-escrow-server";

import {
  enrichExperience,
  notifications,
  experienceError,
} from "@/features/book-one/services/experience-server";

export const authenticate = readStellarSession;

export async function readSnapshot(
  user: StellarUser | null,
): Promise<PilotSnapshot> {
  const db = getSupabaseAdmin();
  let syncWarning = false;
  if (user && getEscrowConfig()) {
    try {
      await reconcilePending(user.wallet);
    } catch {
      syncWarning = true;
    }
  }
  const [board, profile] = await Promise.all([
    db.rpc("campuscrew_stellar_board", { p_wallet: user?.wallet ?? null }),
    user
      ? db
          .from("campuscrew_stellar_profiles")
          .select("display_name, area, skills, coverage, bio")
          .eq("wallet", user.wallet)
          .maybeSingle()
      : null,
  ]);
  checkStellarDatabase(board.error);
  checkStellarDatabase(profile?.error ?? null);
  const row = profile?.data;
  const details = row
    ? ({
        displayName: row.display_name,
        area: row.area,
        skills: row.skills,
        coverage: row.coverage,
        bio: row.bio,
      } as PilotProfile)
    : null;
  let jobs = await enrichEscrowJobs((board.data ?? []) as Job[], user?.wallet);
  let experienceReady = true;
  let alerts: import("@/features/book-one/types/experience").ActivityNotification[] = [];
  let profileId: string | undefined;
  try {
    jobs = await enrichExperience(jobs, user?.wallet);
    if (user) {
      alerts = await notifications(user.wallet);
      const identity = await db
        .from("campuscrew_stellar_profiles")
        .select("public_id")
        .eq("wallet", user.wallet)
        .maybeSingle();
      experienceError(identity.error);
      profileId = identity.data?.public_id;
    }
  } catch (error) {
    if (error instanceof PilotError && error.status === 503)
      experienceReady = false;
    else throw error;
  }
  return {
    jobs,
    experienceReady,
    notifications: alerts,
    profileId,
    syncWarning,
    account: user ? { wallet: user.wallet, profile: details } : null,
    paymentsEnabled: Boolean(getEscrowConfig()),
  };
}

export async function runPilotMutation(
  user: StellarUser,
  mutation: PilotMutation,
) {
  const db = getSupabaseAdmin();
  if (mutation.action === "payment" || mutation.action === "complete") {
    throw new PilotError(
      "Stellar escrow funding and payouts are being connected. This booking has not been paid.",
      503,
    );
  }
  if (mutation.action === "profile") {
    const { displayName, area, skills, coverage, bio } = mutation.profile;
    const { error } = await db.from("campuscrew_stellar_profiles").upsert(
      {
        wallet: user.wallet,
        display_name: displayName,
        area,
        skills: [...new Set(skills)],
        coverage: [...new Set(coverage)],
        bio,
      },
      { onConflict: "wallet" },
    );
    checkStellarDatabase(error);
    return {};
  }
  const { data: profile, error: profileError } = await db
    .from("campuscrew_stellar_profiles")
    .select("wallet")
    .eq("wallet", user.wallet)
    .maybeSingle();
  checkStellarDatabase(profileError);
  if (!profile)
    throw new PilotError("Complete your CampusCrew profile first.", 409);

  switch (mutation.action) {
    case "post": {
      const { requestId, title, category, area, timing, budget, scope } =
        mutation;
      const { error } = await db.from("campuscrew_stellar_tasks").insert({
        id: requestId,
        requester_wallet: user.wallet,
        title,
        category,
        area,
        timing,
        budget,
        scope,
        evidence_required: mutation.evidenceRequired,
      });
      if (error?.code === "23505") {
        const existing = await db
          .from("campuscrew_stellar_tasks")
          .select("id")
          .eq("id", requestId)
          .eq("requester_wallet", user.wallet)
          .maybeSingle();
        checkStellarDatabase(existing.error);
        if (existing.data) return { requestId };
      }
      checkStellarDatabase(error);
      return { requestId };
    }
    case "apply": {
      const { error } = await db.rpc("campuscrew_stellar_apply", {
        p_wallet: user.wallet,
        p_request_id: mutation.requestId,
        p_amount: mutation.amount,
        p_availability: mutation.availability,
        p_note: mutation.note,
      });
      checkStellarDatabase(error);
      return {};
    }
    case "select": {
      const { error } = await db.rpc("campuscrew_stellar_select_provider", {
        p_wallet: user.wallet,
        p_request_id: mutation.requestId,
        p_application_id: mutation.applicationId,
      });
      checkStellarDatabase(error);
      return {};
    }
  }
}
