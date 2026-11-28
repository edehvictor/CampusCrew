"use client";
import { useEffect, useRef, useState } from "react";
import { requestNearbyPosition } from "../services/browser-location";
import type { NearbyPosition, NearbyProvider } from "../types/nearby";

export function useNearbyProviders(category: string, radius: number) {
  const [origin, setOrigin] = useState<NearbyPosition | null>(null),
    [providers, setProviders] = useState<NearbyProvider[]>([]),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now);
  const mounted = useRef(true),
    locatingRef = useRef(false),
    locationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!origin) return;
    let active = true,
      inFlight = false;
    const controller = new AbortController();
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const r = await fetch("/api/nearby", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "search",
            ...origin,
            radius,
            ...(category ? { category } : {}),
          }),
        });
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (active) {
          setProviders(value);
          setError("");
          setNow(Date.now());
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Nearby search is unavailable.",
          );
          setProviders([]);
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      controller.abort();
    };
  }, [origin, category, radius]);
  async function locate() {
    if (locatingRef.current) return;
    locatingRef.current = true;
    const current = ++locationVersion.current;
    setLocating(true);
    setError("");
    try {
      const point = await requestNearbyPosition();
      if (mounted.current && current === locationVersion.current)
        setOrigin(point);
    } catch (e) {
      if (mounted.current && current === locationVersion.current)
        setError(e instanceof Error ? e.message : "Location is unavailable.");
    } finally {
      if (current === locationVersion.current) {
        locatingRef.current = false;
        if (mounted.current) setLocating(false);
      }
    }
  }
  return {
    active: Boolean(origin),
    providers: providers.filter((p) => Date.parse(p.locationExpiresAt) > now),
    loading,
    locating,
    error,
    locate,
    clear: () => {
      ++locationVersion.current;
      locatingRef.current = false;
      setLocating(false);
      setLoading(false);
      setOrigin(null);
      setProviders([]);
      setError("");
    },
  };
}
