import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import { PilotError } from "@/features/book-one/pilot-error";
import {
  bookingExperience,
  experienceError,
  notifications,
  profiles,
} from "@/features/book-one/services/experience-server";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.uuid().optional() }),
  z.object({
    action: z.literal("message"),
    requestId: z.uuid(),
    body: z.string().trim().min(1).max(2000),
    clientId: z.uuid(),
  }),
  z.object({
    action: z.literal("review"),
    requestId: z.uuid(),
    stars: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000),
  }),
]);
function fail(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof PilotError
          ? error.message
          : "CampusCrew could not load that information. Try again.",
    },
    { status: error instanceof PilotError ? error.status : 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      view = url.searchParams.get("view"),
      id = url.searchParams.get("id");
    if (view === "providers") {
      if (id && !z.uuid().safeParse(id).success)
        throw new PilotError("Profile unavailable.", 404);
      return NextResponse.json(await profiles(id ?? undefined), { headers });
    }
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to see your activity.", 401);
    if (view === "notifications")
      return NextResponse.json(await notifications(user.wallet), { headers });
    if (view === "me") {
      const result = await getSupabaseAdmin()
        .from("campuscrew_stellar_profiles")
        .select("public_id")
        .eq("wallet", user.wallet)
        .maybeSingle();
      experienceError(result.error);
      return NextResponse.json(
        result.data ? await profiles(result.data.public_id) : [],
        { headers },
      );
    }
    if (view === "booking" && id && z.uuid().safeParse(id).success)
      return NextResponse.json(await bookingExperience(user.wallet, id), {
        headers,
      });
    throw new PilotError("Page unavailable.", 404);
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to continue.", 401);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new PilotError("Check the details and try again.", 400);
    const v = parsed.data;
    const db = getSupabaseAdmin();
    if (v.action === "read") {
      let query = db
        .from("campuscrew_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("wallet", user.wallet)
        .is("read_at", null);
      if (v.id) query = query.eq("id", v.id);
      const r = await query;
      experienceError(r.error);
    } else if (v.action === "message") {
      const r = await db.rpc("campuscrew_experience_message", {
        p_wallet: user.wallet,
        p_request_id: v.requestId,
        p_body: v.body,
        p_client_id: v.clientId,
      });
      experienceError(r.error);
    } else {
      const r = await db.rpc("campuscrew_experience_review", {
        p_wallet: user.wallet,
        p_request_id: v.requestId,
        p_stars: v.stars,
        p_comment: v.comment,
      });
      experienceError(r.error);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return fail(error);
  }
}
