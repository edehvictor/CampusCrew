import { NextResponse } from "next/server";
import { getPilotConfig } from "@/features/book-one/pilot-config";
import { authenticate, readSnapshot, runPilotMutation } from "@/features/book-one/pilot-server";
import { PilotError } from "@/features/book-one/pilot-error";
import { mutationSchema } from "@/features/book-one/pilot-types";
import { requireSameOrigin } from "@/features/book-one/stellar-session";

const headers = { "Cache-Control": "private, no-store" };

function respond(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}

function fail(error: unknown) {
  if (error instanceof PilotError) return respond({ error: error.message }, error.status);
  console.error("Campuscrew booking request failed", error instanceof Error ? error.name : "Unknown");
  return respond({ error: "Campuscrew could not complete that action. Try again shortly." }, 503);
}

export async function GET(request: Request) {
  if (!getPilotConfig()) return respond({ error: "The connected pilot is not configured." }, 503);
  try {
    return respond(await readSnapshot(await authenticate(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  if (!getPilotConfig()) return respond({ error: "The connected pilot is not configured." }, 503);
  try {
    requireSameOrigin(request);
    const user = await authenticate(request);
    if (!user) return respond({ error: "Connect a wallet and sign in first." }, 401);
    const input = mutationSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return respond({ error: "Check the details and try again." }, 400);
    return respond(await runPilotMutation(user, input.data));
  } catch (error) {
    return fail(error);
  }
}
