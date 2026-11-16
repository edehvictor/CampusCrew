import "server-only";

import { identityV2ABI } from "@goodsdks/citizen-sdk";
import { isAddress, zeroAddress, type Address } from "viem";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createCeloClient, escrowAbi, goodDollar, goodDollarTokenAbi } from "./gooddollar";
import { syncBooking, type PilotUser } from "./payment-server";
import type { Job } from "./model";
import type { PilotMutation, PilotProfile, PilotSnapshot } from "./pilot-types";

import { PilotError } from "./pilot-error";

export async function authenticate(request: Request): Promise<PilotUser | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  const identity = data.user?.identities?.find(item =>
    item.provider === "web3" && item.identity_data?.chain === "ethereum",
  );
  const wallet = identity?.identity_data?.address;
  if (error || !data.user || typeof wallet !== "string" || !isAddress(wallet, { strict: false })) {
    throw new PilotError("Sign in again with your wallet.", 401);
  }
  return { id: data.user.id, wallet: wallet.toLowerCase() as Address };
}

const celo = createCeloClient(process.env.CELO_RPC_URL);

async function readVerifiedRoot(wallet: Address): Promise<Address | null> {
  const contract = { address: goodDollar.identityContract, abi: identityV2ABI };
  try {
    const root = await celo.readContract({ ...contract, functionName: "getWhitelistedRoot", args: [wallet] });
    if (root === zeroAddress) return null;
    const [last, period] = await Promise.all([
      celo.readContract({ ...contract, functionName: "lastAuthenticated", args: [root] }),
      celo.readContract({ ...contract, functionName: "authenticationPeriod" }),
    ]);
    return last > 0n && last + period * 86400n > BigInt(Math.floor(Date.now() / 1000))
      ? root.toLowerCase() as Address
      : null;
  } catch {
    throw new PilotError("GoodDollar verification is temporarily unavailable. Try again shortly.", 503);
  }
}

async function requireVerified(user: PilotUser) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("campuscrew_profiles").select("identity_root").eq("id", user.id).maybeSingle();
  if (error) throw new PilotError("Could not load your profile.", 500);
  if (!data) throw new PilotError("Complete your profile first.", 409);
  const root = await readVerifiedRoot(user.wallet);
  if (!root) throw new PilotError("Verify your wallet with GoodDollar to continue.", 403);
  if (data.identity_root !== root) {
    const { error: updateError } = await db.from("campuscrew_profiles").update({ identity_root: root }).eq("id", user.id);
    if (updateError?.code === "23505") throw new PilotError("This GoodDollar identity is linked to another Campuscrew account.", 409);
    if (updateError) throw new PilotError("Could not save your verification.", 500);
  }
  return root;
}

function getEscrow(): Address | null {
  const address = process.env.BOOK_ONE_ESCROW_ADDRESS;
  return address && isAddress(address, { strict: false }) ? address.toLowerCase() as Address : null;
}

export async function readSnapshot(user: PilotUser | null): Promise<PilotSnapshot> {
  const db = getSupabaseAdmin();
  const [board, profile] = await Promise.all([
    db.rpc("campuscrew_board", { p_user_id: user?.id ?? null }),
    user ? db.from("campuscrew_profiles").select("display_name, area, skills, coverage, bio, identity_root").eq("id", user.id).maybeSingle() : null,
  ]);
  if (board.error || profile?.error) throw new PilotError("Could not load Campuscrew. Check the Supabase setup.", 503);
  const row = profile?.data;
  const details = row ? {
    displayName: row.display_name, area: row.area, skills: row.skills, coverage: row.coverage, bio: row.bio,
  } as PilotProfile : null;
  return {
    jobs: (board.data ?? []) as Job[],
    account: user ? { wallet: user.wallet, profile: details, verified: Boolean(row?.identity_root && await readVerifiedRoot(user.wallet).catch(() => null) === row.identity_root) } : null,
    paymentsEnabled: Boolean(getEscrow()),
  };
}

type DbError = { code: string; message: string } | null;

function checkWrite(error: DbError, message: string) {
  if (error?.code === "23505") throw new PilotError("This action has already been recorded.", 409);
  if (error?.code === "P0001") {
    const taskMessage = error.message.replace(/\b[Rr]equest\b/g, word => word === "Request" ? "Task" : "task");
    throw new PilotError(taskMessage, 409);
  }
  if (error) throw new PilotError(message, 500);
}

export async function runPilotMutation(user: PilotUser, mutation: PilotMutation) {
  const db = getSupabaseAdmin();
  if (mutation.action === "payment") return syncBooking(db, celo, user, mutation);
  if (mutation.action === "profile") {
    const { displayName, area, skills, coverage, bio } = mutation.profile;
    const { error } = await db.from("campuscrew_profiles").upsert({
      id: user.id, wallet: user.wallet, display_name: displayName, area,
      skills: [...new Set(skills)], coverage: [...new Set(coverage)], bio,
    }, { onConflict: "id" });
    checkWrite(error, "Could not save your profile.");
    return {};
  }

  if (mutation.action === "complete") {
    const { error } = await db.rpc("campuscrew_complete", {
      p_user_id: user.id, p_request_id: mutation.requestId, p_completion: mutation.note,
    });
    checkWrite(error, "Could not submit completion.");
    return {};
  }

  const verifiedRoot = await requireVerified(user);

  switch (mutation.action) {
    case "verify":
      return {};
    case "post": {
      const { requestId, title, category, area, timing, budget, scope } = mutation;
      const { data, error } = await db.from("campuscrew_requests")
        .insert({ id: requestId, requester_id: user.id, title, category, area, timing, budget, scope }).select("id").single();
      if (error?.code === "23505") {
        const existing = await db.from("campuscrew_requests").select("id").eq("id", requestId).eq("requester_id", user.id).maybeSingle();
        if (existing.data) return { requestId };
      }
      checkWrite(error, "Could not post the task.");
      return { requestId: data?.id as string };
    }
    case "apply": {
      const { error } = await db.rpc("campuscrew_apply", {
        p_user_id: user.id, p_request_id: mutation.requestId, p_amount: mutation.amount,
        p_availability: mutation.availability, p_note: mutation.note,
      });
      checkWrite(error, "Could not send the application.");
      return {};
    }
    case "select": {
      const escrow = getEscrow();
      if (!escrow) throw new PilotError("G$ booking payments have not been configured yet.", 503);
      const { data: application, error: matchError } = await db.from("campuscrew_applications")
        .select("provider_id").eq("id", mutation.applicationId).eq("request_id", mutation.requestId).maybeSingle();
      if (matchError) throw new PilotError("Could not load the application.", 500);
      if (!application) throw new PilotError("Application unavailable.", 404);
      const { data: provider, error: providerError } = await db.from("campuscrew_profiles")
        .select("wallet, identity_root").eq("id", application.provider_id).single();
      if (providerError) throw new PilotError("Could not load the provider.", 500);
      const providerRoot = await readVerifiedRoot(provider.wallet as Address);
      if (providerRoot === verifiedRoot) throw new PilotError("A booking needs two different GoodDollar identities.", 409);
      if (!providerRoot || providerRoot !== provider.identity_root) {
        throw new PilotError("The provider needs to renew GoodDollar verification before being selected.", 409);
      }
      const [decimals, token] = await Promise.all([
        celo.readContract({ address: goodDollar.g$Contract, abi: goodDollarTokenAbi, functionName: "decimals" }),
        celo.readContract({ address: escrow, abi: escrowAbi, functionName: "token" }),
      ]);
      if (token.toLowerCase() !== goodDollar.g$Contract.toLowerCase()) {
        throw new PilotError("The booking contract uses a different G$ environment.", 503);
      }
      const { error } = await db.rpc("campuscrew_select_provider", {
        p_user_id: user.id, p_request_id: mutation.requestId, p_application_id: mutation.applicationId,
        p_escrow_address: escrow, p_token_address: token.toLowerCase(), p_decimals: decimals,
      });
      checkWrite(error, "Could not select the provider.");
      return {};
    }
  }
}
