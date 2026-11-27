import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "@/features/book-one/pilot-error";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import { isResolverWallet } from "@/features/book-one/auth/resolver-access";
import {
  getEscrowConfig,
  syncEscrow,
  reconcilePending,
} from "@/features/book-one/services/stellar-escrow-server";
import {
  requireResolver,
  resolverTerms,
  disputeQueue,
  readDispute,
  disputeError,
} from "@/features/book-one/services/dispute-server";
import {
  prepareDecision,
  submitDecision,
  syncDecision,
  resumeDecision,
  reconcileDecisions,
} from "@/features/book-one/services/dispute-resolution-server";
import {
  decisionSchema,
  statementSchema,
} from "@/features/book-one/types/disputes";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("action", [
  decisionSchema,
  statementSchema,
  z.object({ action: z.literal("review"), requestId: z.uuid() }),
  z.object({
    action: z.literal("submit"),
    intentId: z.uuid(),
    xdr: z.string().min(1).max(100000),
  }),
  z.object({ action: z.literal("sync"), intentId: z.uuid() }),
  z.object({ action: z.literal("resume"), intentId: z.uuid() }),
]);
function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof PilotError
          ? e.message
          : "The dispute dashboard could not finish this check. Check the decision status before retrying.",
    },
    { status: e instanceof PilotError ? e.status : 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const user = await readStellarSession(request),
      url = new URL(request.url),
      config = getEscrowConfig();
    if (url.searchParams.get("view") === "session")
      return NextResponse.json(
        {
          wallet: user?.wallet ?? null,
          resolver: config?.resolver ?? null,
          allowed: isResolverWallet(user?.wallet, config?.resolver),
        },
        { headers },
      );
    if (!user) throw new PilotError("Sign in with your resolver wallet.", 401);
    requireResolver(user.wallet);
    await reconcileDecisions(user.wallet);
    const id = url.searchParams.get("id");
    if (id) {
      if (!z.uuid().safeParse(id).success)
        throw new PilotError("Case unavailable.", 400);
      const terms = await resolverTerms(user.wallet, id);
      await syncEscrow(terms.organizer, id);
      return NextResponse.json(await readDispute(user.wallet, id, true), {
        headers,
      });
    }
    await reconcilePending();
    return NextResponse.json(await disputeQueue(user.wallet), { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in with your resolver wallet.", 401);
    requireResolver(user.wallet);
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      throw new PilotError(
        "Check the amount and add a decision explanation of at least 20 characters.",
        400,
      );
    const v = input.data;
    if (v.action === "prepare")
      return NextResponse.json(
        await prepareDecision(user.wallet, v.requestId, v.amount, v.rationale),
        { headers },
      );
    if (v.action === "submit")
      return NextResponse.json(
        await submitDecision(user.wallet, v.intentId, v.xdr),
        { headers },
      );
    if (v.action === "sync")
      return NextResponse.json(await syncDecision(user.wallet, v.intentId), {
        headers,
      });
    if (v.action === "resume")
      return NextResponse.json(await resumeDecision(user.wallet, v.intentId), {
        headers,
      });
    await resolverTerms(user.wallet, v.requestId);
    const r =
      v.action === "review"
        ? await getSupabaseAdmin().rpc("campuscrew_dispute_review", {
            p_wallet: user.wallet,
            p_request_id: v.requestId,
          })
        : await getSupabaseAdmin().rpc("campuscrew_dispute_statement", {
            p_wallet: user.wallet,
            p_request_id: v.requestId,
            p_body: v.body,
            p_client_id: v.clientId,
          });
    disputeError(r.error);
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return fail(e);
  }
}
