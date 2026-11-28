import { purgeRemovedEvidence } from "@/features/book-one/services/evidence-server";
import { reconcilePublications } from "@/features/book-one/services/publication-server";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcilePending } from "@/features/book-one/services/stellar-escrow-server";
import { sendPendingPush } from "@/features/book-one/services/push-server";
import { reconcileDecisions } from "@/features/book-one/services/dispute-resolution-server";
import { purgeNearbyLocations } from "@/features/book-one/services/nearby-server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.EXPERIENCE_WORKER_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = "Bearer " + secret;
  if (
    !secret ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  let delayed = false;
  try {
    await reconcilePending();
    await reconcileDecisions();
  } catch {
    delayed = true;
  }
  try {
    await reconcilePublications();
  } catch {
    delayed = true;
  }
  const push = await sendPendingPush();
  for (const cleanup of [purgeNearbyLocations, purgeRemovedEvidence]) {
    try {
      await cleanup();
    } catch {
      delayed = true;
    }
  }
  return NextResponse.json(
    { delayed, push },
    { headers: { "Cache-Control": "no-store" } },
  );
}
