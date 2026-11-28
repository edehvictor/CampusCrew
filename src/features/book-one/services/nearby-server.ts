import "server-only";
import type { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkStellarDatabase } from "../auth/stellar-session";
import { PilotError } from "../pilot-error";
import type { LocationSharing, nearbySchema } from "../types/nearby";

const missing = ["42P01", "42883", "PGRST202", "PGRST205"];
function check(error: { code: string; message: string } | null) {
  if (error && missing.includes(error.code))
    throw new PilotError(
      "Nearby discovery is being set up. You can still browse providers by service and area.",
      503,
    );
  checkStellarDatabase(error);
}

// Visibility expires in SQL regardless of worker uptime. Remove expired rows
// during nearby requests and on worker ticks, without retaining a history.
export async function purgeNearbyLocations() {
  const r = await getSupabaseAdmin()
    .from("campuscrew_provider_locations")
    .delete()
    .lte("expires_at", new Date().toISOString());
  if (r.error && missing.includes(r.error.code)) return;
  check(r.error);
}
export async function readNearbySharing(
  wallet: string,
): Promise<LocationSharing> {
  await purgeNearbyLocations();
  const r = await getSupabaseAdmin()
    .from("campuscrew_provider_locations")
    .select("updated_at,expires_at")
    .eq("wallet", wallet)
    .maybeSingle();
  check(r.error);
  return r.data && Date.parse(r.data.expires_at) > Date.now()
    ? {
        sharing: true,
        updatedAt: r.data.updated_at,
        expiresAt: r.data.expires_at,
      }
    : { sharing: false };
}
export async function changeNearby(
  wallet: string,
  v: z.infer<typeof nearbySchema>,
) {
  const db = getSupabaseAdmin();
  if (v.action === "stop") {
    const r = await db
      .from("campuscrew_provider_locations")
      .delete()
      .eq("wallet", wallet);
    check(r.error);
    return { sharing: false };
  }
  await purgeNearbyLocations();
  const args = {
    p_wallet: wallet,
    p_lat: Math.round(v.latitude * 100) / 100,
    p_lng: Math.round(v.longitude * 100) / 100,
  };
  const r =
    v.action === "publish"
      ? await db.rpc("campuscrew_nearby_publish", {
          ...args,
          p_accuracy: v.accuracy,
        })
      : await db.rpc("campuscrew_nearby_search", {
          ...args,
          p_radius: v.radius,
          p_category: v.category ?? null,
        });
  check(r.error);
  return r.data;
}
