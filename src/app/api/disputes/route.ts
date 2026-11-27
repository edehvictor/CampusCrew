import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import {
  readDispute,
  reportDispute,
  disputeError,
} from "@/features/book-one/services/dispute-server";
import {
  reportSchema,
  statementSchema,
} from "@/features/book-one/types/disputes";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PilotError } from "@/features/book-one/pilot-error";
const headers = { "Cache-Control": "private, no-store" };
function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof PilotError
          ? e.message
          : "The dispute could not be updated.",
    },
    { status: e instanceof PilotError ? e.status : 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to view this case.", 401);
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return NextResponse.json(await readDispute(user.wallet, id), { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to report a problem.", 401);
    const parsed = z
      .discriminatedUnion("action", [reportSchema, statementSchema])
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new PilotError(
        "Check the report details. Descriptions need at least 20 characters.",
        400,
      );
    const v = parsed.data;
    if (v.action === "report")
      await reportDispute(user.wallet, v.requestId, v.reason, v.summary);
    else {
      const r = await getSupabaseAdmin().rpc("campuscrew_dispute_statement", {
        p_wallet: user.wallet,
        p_request_id: v.requestId,
        p_body: v.body,
        p_client_id: v.clientId,
      });
      disputeError(r.error);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return fail(e);
  }
}
