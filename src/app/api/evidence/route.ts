import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStellarSession,
  requireSameOrigin,
} from "@/features/book-one/auth/stellar-session";
import {
  participant,
  experienceError,
} from "@/features/book-one/services/experience-server";
import {
  evidenceLimit,
  evidenceMime,
} from "@/features/book-one/services/evidence-validation";
import { PilotError } from "@/features/book-one/pilot-error";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof PilotError
          ? e.message
          : "The evidence could not be saved. Try again.",
    },
    { status: e instanceof PilotError ? e.status : 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in to view private evidence.", 401);
    const id = new URL(request.url).searchParams.get("id");
    if (!z.uuid().safeParse(id).success)
      throw new PilotError("File unavailable.", 404);
    const db = getSupabaseAdmin();
    const r = await db
      .from("campuscrew_booking_evidence")
      .select("request_id,object_path")
      .eq("id", id!)
      .maybeSingle();
    experienceError(r.error);
    if (!r.data) throw new PilotError("File unavailable.", 404);
    await participant(user.wallet, r.data.request_id);
    const signed = await db.storage
      .from("campuscrew-evidence")
      .createSignedUrl(r.data.object_path, 60, { download: true });
    if (signed.error || !signed.data)
      throw new PilotError("File unavailable.", 503);
    return NextResponse.redirect(signed.data.signedUrl, {
      status: 303,
      headers,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in before uploading evidence.", 401);
    const id = new URL(request.url).searchParams.get("booking");
    if (!z.uuid().safeParse(id).success)
      throw new PilotError("Booking unavailable.", 404);
    await participant(user.wallet, id!);
    const reader = request.body?.getReader();
    if (!reader) throw new PilotError("Choose a file.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > evidenceLimit + 65536) {
        await reader.cancel();
        throw new PilotError("Choose a file smaller than 5 MB.", 413);
      }
      chunks.push(next.value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > evidenceLimit)
      throw new PilotError(
        "Choose a JPG, PNG, WebP or PDF smaller than 5 MB.",
        400,
      );
    const bytes = Buffer.from(await file.arrayBuffer()),
      mime = evidenceMime(bytes);
    if (!mime)
      throw new PilotError(
        "Only JPG, PNG, WebP and PDF files are supported.",
        400,
      );
    const db = getSupabaseAdmin();
    const escrow = await db
      .from("campuscrew_stellar_escrows")
      .select("provider,chain_state")
      .eq("request_id", id!)
      .maybeSingle();
    experienceError(escrow.error);
    if (
      escrow.data?.provider !== user.wallet ||
      escrow.data.chain_state !== "Funded"
    )
      throw new PilotError(
        "Only the selected provider can upload before submitting completion.",
        403,
      );
    const evidenceId = randomUUID(),
      objectPath = id + "/" + evidenceId;
    const upload = await db.storage
      .from("campuscrew-evidence")
      .upload(objectPath, bytes, { contentType: mime, upsert: false });
    if (upload.error)
      throw new PilotError(
        "Evidence storage is unavailable. Apply the experience database update.",
        503,
      );
    const saved = await db.rpc("campuscrew_experience_evidence", {
      p_wallet: user.wallet,
      p_request_id: id,
      p_id: evidenceId,
      p_name: file.name.replace(/[\/<>]/g, "_").slice(0, 120) || "Evidence",
      p_path: objectPath,
      p_mime: mime,
      p_bytes: file.size,
    });
    if (saved.error) {
      await db.storage.from("campuscrew-evidence").remove([objectPath]);
      experienceError(saved.error);
    }
    return NextResponse.json({ id: evidenceId }, { headers });
  } catch (e) {
    return fail(e);
  }
}
