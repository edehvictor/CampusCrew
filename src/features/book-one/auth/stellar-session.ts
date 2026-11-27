import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "@/features/book-one/pilot-error";
import { isStellarWallet, stellarSessionCookie, tokenHash } from "@/features/book-one/auth/stellar-auth";

export type StellarUser = { wallet: string };

export function requireSameOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) {
    throw new PilotError("Open CampusCrew in this browser and try again.", 403);
  }
  return origin;
}

export function checkStellarDatabase(error: { code: string; message: string } | null) {
  if (!error) return;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) {
    throw new PilotError("Stellar setup needs the database update. Apply 20261119000100_stellar_onboarding.sql in Supabase.", 503);
  }
  if (error.code === "P0001") throw new PilotError(error.message, 409);
  if (error.code === "23505") throw new PilotError("This action has already been recorded.", 409);
  throw new PilotError("CampusCrew could not save or load that information. Try again shortly.", 503);
}

export async function readStellarSession(request: Request): Promise<StellarUser | null> {
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${stellarSessionCookie}=`));
  const token = cookie?.slice(stellarSessionCookie.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { data, error } = await getSupabaseAdmin().from("campuscrew_stellar_sessions")
    .select("wallet").eq("token_hash", tokenHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  checkStellarDatabase(error);
  return data && isStellarWallet(data.wallet) ? { wallet: data.wallet } : null;
}
