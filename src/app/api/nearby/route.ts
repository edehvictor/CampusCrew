import { NextResponse } from "next/server";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import { nearbySchema } from "@/features/book-one/types/nearby";
import {
  readNearbySharing,
  changeNearby,
} from "@/features/book-one/services/nearby-server";
import { PilotError } from "@/features/book-one/pilot-error";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof PilotError
          ? error.message
          : "Nearby discovery is unavailable. Try again or browse by area.",
    },
    { status: error instanceof PilotError ? error.status : 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const user = await readStellarSession(request);
    if (!user)
      throw new PilotError("Sign in to manage nearby visibility.", 401);
    return NextResponse.json(await readNearbySharing(user.wallet), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to use nearby discovery.", 401);
    const parsed = nearbySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new PilotError(
        "Choose a valid location, service and distance. If your location is inaccurate, try on a phone.",
        400,
      );
    return NextResponse.json(await changeNearby(user.wallet, parsed.data), {
      headers,
    });
  } catch (error) {
    return failure(error);
  }
}
