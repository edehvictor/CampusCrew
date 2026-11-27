"use client";
import { Download, Bell } from "lucide-react";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export async function disablePhonePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "unsubscribe",
        endpoint: subscription.endpoint,
      }),
    });
    await subscription.unsubscribe();
  }
}
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext)
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
  }, []);
  return null;
}
export function PwaControls({ signedIn }: { signedIn: boolean }) {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const listen = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listen);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration("/")
        .then((r) => r?.pushManager?.getSubscription())
        .then((s) => setEnabled(Boolean(s)))
        .catch(() => setEnabled(false));
    return () => window.removeEventListener("beforeinstallprompt", listen);
  }, []);
  async function enable() {
    setBusy(true);
    setNotice("");
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !window.isSecureContext ||
        !("Notification" in window)
      )
        throw new Error(
          "Phone alerts need a supported browser and HTTPS. On iPhone, add CampusCrew to your Home Screen first.",
        );
      const config = await (await fetch("/api/push")).json();
      if (!config.publicKey)
        throw new Error(
          "Phone alerts are not configured on this deployment. In-app alerts still work.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications were not enabled. You can still use the in-app inbox.",
        );
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setEnabled(true);
      setNotice("Phone alerts enabled for this device.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not enable alerts.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pwa-controls">
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          if (install) void install.prompt();
          else
            setNotice(
              "On iPhone: Share / Add to Home Screen. On Android: browser menu / Install app or Add to Home screen.",
            );
        }}
      >
        <Download size={16} />
        Install CampusCrew
      </button>
      {signedIn && (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            if (enabled) {
              setBusy(true);
              void disablePhonePush()
                .then(() => {
                  setEnabled(false);
                  setNotice("Phone alerts disabled on this device.");
                })
                .catch(() => setNotice("Could not disable alerts. Try again."))
                .finally(() => setBusy(false));
            } else void enable();
          }}
        >
          <Bell size={16} />
          {enabled ? "Disable phone alerts" : "Enable phone alerts"}
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
