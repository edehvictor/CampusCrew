import { NextResponse } from "next/server";
import {
  requireSameOrigin,
  readStellarSession,
} from "@/features/book-one/auth/stellar-session";
import { publicationInputSchema } from "@/features/book-one/types/publication";
import {
  preparePublication,
  preparePublicationCancellation,
  submitPublication,
  syncPublication,
} from "@/features/book-one/services/publication-server";
import { PilotError } from "@/features/book-one/pilot-error";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in before funding a task.", 401);
    const parsed = publicationInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new PilotError("Check the task funding details.", 400);
    const v = parsed.data;
    const result =
      v.action === "prepare"
        ? await preparePublication(user.wallet, v.draft)
        : v.action === "prepare-cancel"
          ? await preparePublicationCancellation(user.wallet, v.requestId)
          : v.action === "submit"
            ? await submitPublication(user.wallet, v.intentId, v.xdr)
            : await syncPublication(user.wallet, v.intentId);
    return NextResponse.json(result, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof PilotError
            ? e.message
            : "Funding could not be checked. If you approved it, use Check funding before retrying.",
      },
      { status: e instanceof PilotError ? e.status : 503, headers },
    );
  }
}
