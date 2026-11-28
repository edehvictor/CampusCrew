import { randomUUID, createHash } from "node:crypto";
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
import {
  getEscrowConfig,
  syncEscrow,
} from "@/features/book-one/services/stellar-escrow-server";
import { isResolverWallet } from "@/features/book-one/auth/resolver-access";
import { readEvidenceAsResolver } from "@/features/book-one/services/dispute-server";
import {
  evidenceDatabase,
  removeEvidence,
} from "@/features/book-one/services/evidence-server";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
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
      .select("request_id,object_path,mime,removed_at")
      .eq("id", id!)
      .maybeSingle();
    evidenceDatabase(r.error);
    if (!r.data || r.data.removed_at)
      throw new PilotError("File unavailable.", 404);
    if (isResolverWallet(user.wallet, getEscrowConfig()?.resolver))
      await readEvidenceAsResolver(user.wallet, r.data.request_id);
    else await participant(user.wallet, r.data.request_id);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    if (preview && !r.data.mime.startsWith("image/"))
      throw new PilotError("Download this document to view it.", 400);
    const signed = await db.storage
      .from("campuscrew-evidence")
      .createSignedUrl(r.data.object_path, 60, { download: !preview });
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
        throw new PilotError("Choose a file smaller than 4 MB.", 413);
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
        "Choose a JPG, PNG, WebP or PDF smaller than 4 MB.",
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
    await syncEscrow(user.wallet, id!);
    const escrow = await db
      .from("campuscrew_stellar_escrows")
      .select("organizer,provider,chain_state")
      .eq("request_id", id!)
      .maybeSingle();
    experienceError(escrow.error);
    const supplied = form.get("uploadId");
    if (supplied !== null && !z.uuid().safeParse(supplied).success)
      throw new PilotError("Invalid upload identifier.", 400);
    const evidenceId = typeof supplied === "string" ? supplied : randomUUID(),
      objectPath =
        id +
        "/" +
        evidenceId +
        "-" +
        createHash("sha256").update(bytes).digest("hex");
    const name = file.name.replace(/[\/<>]/g, "_").slice(0, 120) || "Evidence";
    const existing = await db
      .from("campuscrew_booking_evidence")
      .select("id,request_id,uploader,object_path,removed_at")
      .eq("id", evidenceId)
      .maybeSingle();
    evidenceDatabase(existing.error);
    if (existing.data) {
      if (
        existing.data.request_id !== id ||
        existing.data.uploader !== user.wallet ||
        existing.data.object_path !== objectPath ||
        existing.data.removed_at
      )
        throw new PilotError(
          "This upload belongs to another or removed attachment. Select the file again.",
          409,
        );
      return NextResponse.json({ id: evidenceId }, { headers });
    }
    if (
      !escrow.data ||
      !(
        (escrow.data.provider === user.wallet &&
          escrow.data.chain_state === "Funded") ||
        ([escrow.data.organizer, escrow.data.provider].includes(user.wallet) &&
          escrow.data.chain_state === "Disputed")
      )
    )
      throw new PilotError(
        "Upload as the selected provider before completion, or as either participant during a dispute.",
        403,
      );
    const upload = await db.storage
      .from("campuscrew-evidence")
      .upload(objectPath, bytes, {
        contentType: mime,
        upsert: false,
        cacheControl: "0",
      });
    if (upload.error) {
      // Retry an interrupted upload using the same ID and content; never overwrite.
      const previous = await db.storage
        .from("campuscrew-evidence")
        .download(objectPath);
      if (
        previous.error ||
        !previous.data ||
        createHash("sha256")
          .update(Buffer.from(await previous.data.arrayBuffer()))
          .digest("hex") !== createHash("sha256").update(bytes).digest("hex")
      )
        throw new PilotError(
          "Evidence storage is unavailable. Try again shortly.",
          503,
        );
    }
    const saved = await db.rpc("campuscrew_experience_evidence", {
      p_wallet: user.wallet,
      p_request_id: id,
      p_id: evidenceId,
      p_name: name,
      p_path: objectPath,
      p_mime: mime,
      p_bytes: file.size,
    });
    if (saved.error) {
      const linked = await db
        .from("campuscrew_booking_evidence")
        .select("id")
        .eq("id", evidenceId)
        .is("removed_at", null)
        .maybeSingle();
      if (!linked.error && !linked.data)
        await db.storage.from("campuscrew-evidence").remove([objectPath]);
      evidenceDatabase(saved.error);
    }
    return NextResponse.json({ id: evidenceId }, { headers });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user)
      throw new PilotError("Sign in before removing an attachment.", 401);
    const input = z
      .object({ booking: z.uuid(), id: z.uuid() })
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PilotError("Attachment unavailable.", 400);
    return NextResponse.json(
      await removeEvidence(user.wallet, input.data.booking, input.data.id),
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
