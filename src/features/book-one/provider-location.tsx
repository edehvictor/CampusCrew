"use client";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPinOff, RefreshCw } from "lucide-react";
import { clientApi } from "./services/client-api";
import { requestNearbyPosition } from "./services/browser-location";
import type { LocationSharing } from "./types/nearby";
import "./nearby.css";

export function ProviderLocation({ eligible }: { eligible: boolean }) {
  const [status, setStatus] = useState<LocationSharing | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const active = useRef(true),
    working = useRef(false),
    version = useRef(0);
  async function load() {
    if (working.current) return;
    const current = ++version.current;
    try {
      const result = await clientApi<LocationSharing>("/api/nearby");
      if (active.current && current === version.current) {
        setStatus(result);
        setError("");
      }
    } catch (e) {
      if (active.current && current === version.current)
        setError(
          e instanceof Error ? e.message : "Could not load nearby visibility.",
        );
    } finally {
      if (active.current && current === version.current) setLoaded(true);
    }
  }
  useEffect(() => {
    active.current = true;
    const current = ++version.current;
    void clientApi<LocationSharing>("/api/nearby")
      .then((result) => {
        if (active.current && current === version.current) {
          setStatus(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active.current && current === version.current)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load nearby visibility.",
          );
      })
      .finally(() => {
        if (active.current && current === version.current) setLoaded(true);
      });
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active.current = false;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (!status?.sharing || !status.expiresAt) return;
    const delay = Math.max(0, Date.parse(status.expiresAt) - Date.now());
    const timer = setTimeout(() => setStatus({ sharing: false }), delay);
    return () => clearTimeout(timer);
  }, [status]);
  async function toggle() {
    if (working.current) return;
    working.current = true;
    ++version.current;
    setBusy(true);
    setError("");
    try {
      let result: LocationSharing;
      if (status?.sharing) {
        result = await clientApi<LocationSharing>("/api/nearby", {
          action: "stop",
        });
      } else {
        const point = await requestNearbyPosition();
        if (!active.current) return;
        result = await clientApi<LocationSharing>("/api/nearby", {
          action: "publish",
          ...point,
        });
      }
      if (active.current) setStatus(result);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not change nearby visibility.",
        );
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section
      className="provider-location"
      aria-labelledby="provider-location-title"
    >
      <div className="provider-location-heading">
        <LocateFixed size={21} aria-hidden="true" />
        <div>
          <h2 id="provider-location-title">Be discoverable nearby</h2>
          <p>Let people close to you find your services.</p>
        </div>
        <span
          className="status"
          data-tone={status?.sharing ? "positive" : "neutral"}
        >
          {status?.sharing ? "Sharing" : "Off"}
        </span>
      </div>
      <p>
        Share an approximate area for 30 minutes. Your exact GPS coordinates are
        discarded; others see an estimated distance. This does not track your
        movement.
      </p>
      {!eligible && (
        <p>
          Add a local service and coverage area to your profile to enable this.
        </p>
      )}
      {status?.sharing && status.expiresAt && (
        <p role="status">
          Visible until{" "}
          {new Date(status.expiresAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Switch off at any time.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="provider-location-actions">
        <button
          type="button"
          className={
            "button " +
            (status?.sharing ? "button-secondary" : "button-primary")
          }
          disabled={busy || !loaded || (!eligible && !status?.sharing)}
          onClick={() => void toggle()}
        >
          {status?.sharing ? (
            <MapPinOff size={16} aria-hidden="true" />
          ) : (
            <LocateFixed size={16} aria-hidden="true" />
          )}
          {busy
            ? "Updating…"
            : status?.sharing
              ? "Stop sharing"
              : "Share my approximate location"}
        </button>
        {error && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Check again
          </button>
        )}
      </div>
    </section>
  );
}
