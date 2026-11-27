import { NextResponse } from "next/server";
import { z } from "zod";
import { escrowOperations } from "@/features/book-one/services/stellar-escrow";
import { prepareEscrow, submitEscrow, syncEscrow } from "@/features/book-one/services/stellar-escrow-server";
import { readStellarSession, requireSameOrigin } from "@/features/book-one/auth/stellar-session";
import { PilotError } from "@/features/book-one/pilot-error";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), requestId: z.uuid(), operation: z.enum(escrowOperations), note: z.string().trim().min(1).max(750).optional() }),
  z.object({ action: z.literal("submit"), intentId: z.uuid(), xdr: z.string().min(1).max(100_000) }),
  z.object({ action: z.literal("sync"), requestId: z.uuid() }),
]);

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in before using booking payments.", 401);
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PilotError("Check the booking payment details.", 400);
    const value = input.data;
    const result = value.action === "prepare" ? await prepareEscrow(user.wallet, value.requestId, value.operation, value.note)
      : value.action === "submit" ? await submitEscrow(user.wallet, value.intentId, value.xdr) : await syncEscrow(user.wallet, value.requestId);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof PilotError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("Stellar booking check failed", error instanceof Error ? error.name : "Unknown");
    return NextResponse.json({ error: "Stellar could not finish this check. If you approved a transaction, use Refresh payment before trying again." }, { status: 503, headers });
  }
}
