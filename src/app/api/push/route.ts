import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { pushConfig } from "@/features/book-one/services/push-server";
import { experienceError } from "@/features/book-one/services/experience-server";
import { PilotError } from "@/features/book-one/pilot-error";
const headers = { "Cache-Control": "private,no-store" };
export function GET() {
  const config = pushConfig();
  return NextResponse.json(
    { publicKey: config?.publicKey ?? null },
    { headers },
  );
}
const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .min(20)
      .max(256),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .min(10)
      .max(128),
  }),
});
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to manage phone alerts.", 401);
    const body = await request.json();
    const db = getSupabaseAdmin();
    if (body.action === "unsubscribe") {
      const parsed = z.string().max(2000).safeParse(body.endpoint);
      if (!parsed.success)
        throw new PilotError("Subscription unavailable.", 400);
      const r = await db
        .from("campuscrew_push_subscriptions")
        .delete()
        .eq("wallet", user.wallet)
        .eq("endpoint", parsed.data);
      experienceError(r.error);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (!pushConfig())
      throw new PilotError(
        "Phone notifications are not configured on this deployment.",
        503,
      );
    const parsed = subscription.safeParse(body.subscription);
    if (!parsed.success)
      throw new PilotError("Notification subscription is invalid.", 400);
    const url = new URL(parsed.data.endpoint);
    if (
      url.protocol !== "https:" ||
      (![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
      ].includes(url.hostname) &&
        !url.hostname.endsWith(".push.apple.com") &&
        !url.hostname.endsWith(".notify.windows.com"))
    )
      throw new PilotError("This push provider is not supported.", 400);
    const existing = await db
      .from("campuscrew_push_subscriptions")
      .select("endpoint")
      .eq("wallet", user.wallet);
    experienceError(existing.error);
    if (
      (existing.data?.length ?? 0) >= 5 &&
      !existing.data?.some((d) => d.endpoint === parsed.data.endpoint)
    )
      throw new PilotError("You already have five devices enabled.", 409);
    const r = await db
      .from("campuscrew_push_subscriptions")
      .upsert({
        endpoint: parsed.data.endpoint,
        wallet: user.wallet,
        subscription: parsed.data,
      });
    experienceError(r.error);
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof PilotError
            ? e.message
            : "Phone notifications could not be saved.",
      },
      { status: e instanceof PilotError ? e.status : 503, headers },
    );
  }
}
