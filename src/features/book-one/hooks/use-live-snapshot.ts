"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { PilotSnapshot } from "@/features/book-one/types/pilot";

/** Keep the signed-in board fresh while the page is open. */
export function useLiveSnapshot(
  wallet: string | undefined,
  load: () => Promise<PilotSnapshot>,
  setSnapshot: Dispatch<SetStateAction<PilotSnapshot>>,
  setConnected: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    let active = true;
    let stream: EventSource | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    if (wallet) {
      stream = new EventSource("/api/updates");
      stream.addEventListener("snapshot", (event) => {
        if (!active) return;
        setSnapshot(JSON.parse((event as MessageEvent).data) as PilotSnapshot);
        setConnected(true);
      });
      stream.addEventListener("delayed", () => {
        if (active) setConnected(false);
      });
      stream.onerror = () => {
        if (active) setConnected(false);
      };
    }

    const check = async () => {
      if (!active) return;
      if (document.visibilityState === "visible" && (!stream || stream.readyState !== EventSource.OPEN)) {
        try {
          await load();
        } catch {
          /* The next retry handles transient connection failures. */
        }
      }
      if (active) fallback = setTimeout(() => void check(), 7000);
    };
    const wake = () => {
      if (active && document.visibilityState === "visible") void load().catch(() => {});
    };
    fallback = setTimeout(() => void check(), 3000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      stream?.close();
      clearTimeout(fallback);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [wallet, load, setSnapshot, setConnected]);
}
