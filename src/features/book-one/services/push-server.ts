import "server-only";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { experienceError } from "@/features/book-one/services/experience-server";
export function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject
    ? { publicKey, privateKey, subject }
    : null;
}
export async function sendPendingPush() {
  const config = pushConfig();
  if (!config) return { enabled: false, sent: 0 };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const db = getSupabaseAdmin();
  const pending = await db
    .from("campuscrew_notifications")
    .select("id,wallet,request_id,push_attempts")
    .is("push_sent_at", null)
    .lt("push_attempts", 5)
    .or(
      "push_claimed_at.is.null,push_claimed_at.lt." +
        new Date(Date.now() - 60000).toISOString(),
    )
    .order("created_at")
    .limit(30);
  experienceError(pending.error);
  let sent = 0;
  const deadline = Date.now() + 35000;
  for (const notice of pending.data ?? []) {
    if (Date.now() > deadline) break;
    const claim = await db
      .from("campuscrew_notifications")
      .update({
        push_claimed_at: new Date().toISOString(),
        push_attempts: notice.push_attempts + 1,
      })
      .eq("id", notice.id)
      .eq("push_attempts", notice.push_attempts)
      .select("id");
    experienceError(claim.error);
    if (!claim.data?.length) continue;
    const devices = await db
      .from("campuscrew_push_subscriptions")
      .select("endpoint,subscription")
      .eq("wallet", notice.wallet);
    experienceError(devices.error);
    let failed = false;
    for (const device of devices.data ?? []) {
      if (Date.now() > deadline) {
        failed = true;
        break;
      }
      try {
        await webpush.sendNotification(
          device.subscription,
          JSON.stringify({
            id: notice.id,
            title: "CampusCrew update",
            body: "There is an update to your campus activity. Open CampusCrew to view it.",
            url: "/me/notifications",
          }),
          { TTL: 3600, timeout: 5000 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db
            .from("campuscrew_push_subscriptions")
            .delete()
            .eq("endpoint", device.endpoint);
        else failed = true;
      }
    }
    if (!failed) {
      const done = await db
        .from("campuscrew_notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", notice.id);
      experienceError(done.error);
      sent++;
    }
  }
  return { enabled: true, sent };
}
