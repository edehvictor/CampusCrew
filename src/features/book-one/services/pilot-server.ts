import "server-only";
import { getFundedPostingConfig } from "./escrow-config";
import {
  reconcilePublications,
  publicationRecoveries,
} from "./publication-server";
import { editMarketplace } from "./marketplace-editing-server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Job } from "@/features/book-one/model";
import type {
  PilotMutation,
  PilotProfile,
  PilotSnapshot,
} from "@/features/book-one/types/pilot";
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
      await reconcilePublications(user.wallet);
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
  let alerts: import("@/features/book-one/types/experience").ActivityNotification[] =
    [];
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
    fundedPostingEnabled: Boolean(getFundedPostingConfig()),
    publications: user ? await publicationRecoveries(user.wallet) : [],
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
    case "edit-task":
    case "edit-application":
      await editMarketplace(user.wallet, mutation);
      return {};
    case "post":
      throw new PilotError(
        "Fund and publish your task using the wallet approval. Unfunded tasks cannot be published.",
        409,
      );
    case "withdraw": {
      const r = await db.rpc("campuscrew_withdraw_application", {
        p_wallet: user.wallet,
        p_id: mutation.requestId,
        p_application: mutation.applicationId,
        p_revision: mutation.revision,
      });
      checkStellarDatabase(r.error);
      return {};
    }
    case "remove-task": {
      const r = await db.rpc("campuscrew_remove_task", {
        p_wallet: user.wallet,
        p_id: mutation.requestId,
      });
      checkStellarDatabase(r.error);
      return {};
    }
    case "apply": {
      const { error } = await db.rpc(
        mutation.taskRevision
          ? "campuscrew_stellar_apply_v2"
          : "campuscrew_stellar_apply",
        {
          p_wallet: user.wallet,
          p_request_id: mutation.requestId,
          p_amount: mutation.amount,
          p_availability: mutation.availability,
          p_note: mutation.note,
          ...(mutation.taskRevision
            ? { p_task_revision: mutation.taskRevision }
            : {}),
        },
      );
      checkStellarDatabase(error);
      return {};
    }
    case "select": {
      const versioned = Boolean(
        mutation.taskRevision && mutation.applicationRevision,
      );
      const { error } = await db.rpc(
        versioned
          ? "campuscrew_stellar_select_provider_v2"
          : "campuscrew_stellar_select_provider",
        {
          p_wallet: user.wallet,
          p_request_id: mutation.requestId,
          p_application_id: mutation.applicationId,
          ...(versioned
            ? {
                p_task_revision: mutation.taskRevision,
                p_application_revision: mutation.applicationRevision,
              }
            : {}),
        },
      );
      checkStellarDatabase(error);
      return {};
    }
  }
}
