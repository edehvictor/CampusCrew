import { NextResponse } from "next/server";
import { readStellarSession } from "@/features/book-one/auth/stellar-session";
import { readWalletBalance } from "@/features/book-one/services/stellar-balance";
import { PilotError } from "@/features/book-one/pilot-error";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await readStellarSession(request);
    if (!user) return NextResponse.json({ error: "Sign in to see your wallet balance." }, { status: 401, headers });
    return NextResponse.json(await readWalletBalance(user.wallet), { headers });
  } catch (error) {
    if (error instanceof PilotError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ error: "Your balance is unavailable right now. Try refreshing it." }, { status: 503, headers });
  }
}
