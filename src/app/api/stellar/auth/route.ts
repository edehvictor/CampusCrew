import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getPilotConfig } from "@/features/book-one/pilot-config";
import { PilotError } from "@/features/book-one/pilot-error";
import {
  challengeMatches, createSignInChallenge, isStellarWallet, newSessionToken,
  stellarChallengeCookie, stellarSessionCookie, tokenHash, verifySignInSignature,
} from "@/features/book-one/auth/stellar-auth";
import { checkStellarDatabase, requireSameOrigin } from "@/features/book-one/auth/stellar-session";
import { z } from "zod";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), wallet: z.string().refine(isStellarWallet) }),
  z.object({ action: z.literal("signin"), id: z.uuid(), wallet: z.string().refine(isStellarWallet), signature: z.string().max(128) }),
]);

function setCookie(response: NextResponse, request: Request, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge,
  });
}

function failed(error: unknown) {
  if (error instanceof PilotError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("Stellar sign-in failed", error instanceof Error ? error.name : "Unknown");
  return NextResponse.json({ error: "Wallet sign-in could not finish. Try again shortly." }, { status: 503, headers });
}

export async function POST(request: NextRequest) {
  if (!getPilotConfig()) return NextResponse.json({ error: "Configure Supabase before signing in." }, { status: 503, headers });
  try {
    const origin = requireSameOrigin(request);
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PilotError("Check the wallet sign-in details.", 400);
    const db = getSupabaseAdmin();
    if (input.data.action === "challenge") {
      const challenge = createSignInChallenge(input.data.wallet, origin);
      const previous = request.cookies.get(stellarChallengeCookie)?.value;
      const binding = previous && /^[a-f0-9]{64}$/.test(previous) ? previous : newSessionToken();
      const { error } = await db.rpc("campuscrew_stellar_issue_challenge", {
        p_id: challenge.id, p_wallet: challenge.wallet, p_binding_hash: tokenHash(binding),
        p_message: challenge.message, p_origin: origin,
      });
      checkStellarDatabase(error);
      const response = NextResponse.json(challenge, { headers });
      setCookie(response, request, stellarChallengeCookie, binding, 300);
      return response;
    }

    const { id, wallet, signature } = input.data;
    const { data: challenge, error } = await db.from("campuscrew_stellar_challenges")
      .select("wallet, message, origin, binding_hash, expires_at, consumed_at").eq("id", id).maybeSingle();
    checkStellarDatabase(error);
    const binding = request.cookies.get(stellarChallengeCookie)?.value ?? "";
    if (!challenge || !challengeMatches(challenge, wallet, origin, binding)
      || !verifySignInSignature(wallet, challenge.message, signature)) {
      throw new PilotError("The wallet signature could not be verified. Connect your wallet again.", 401);
    }
    const token = newSessionToken();
    const { error: consumeError } = await db.rpc("campuscrew_stellar_consume_challenge", {
      p_id: id, p_wallet: wallet, p_binding_hash: tokenHash(binding), p_origin: origin, p_token_hash: tokenHash(token),
    });
    checkStellarDatabase(consumeError);
    const previousSession = request.cookies.get(stellarSessionCookie)?.value;
    if (previousSession && /^[a-f0-9]{64}$/.test(previousSession)) {
      const { error: revokeError } = await db.from("campuscrew_stellar_sessions").delete().eq("token_hash", tokenHash(previousSession));
      checkStellarDatabase(revokeError);
    }
    const response = NextResponse.json({ wallet }, { headers });
    setCookie(response, request, stellarSessionCookie, token, 7 * 86_400);
    setCookie(response, request, stellarChallengeCookie, "", 0);
    return response;
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const token = request.cookies.get(stellarSessionCookie)?.value;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const { error } = await getSupabaseAdmin().from("campuscrew_stellar_sessions").delete().eq("token_hash", tokenHash(token));
      checkStellarDatabase(error);
    }
    const response = NextResponse.json({ signedOut: true }, { headers });
    setCookie(response, request, stellarSessionCookie, "", 0);
    setCookie(response, request, stellarChallengeCookie, "", 0);
    return response;
  } catch (error) {
    return failed(error);
  }
}
