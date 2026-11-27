"use client";

import { useEffect, useState } from "react";
import { reviewTimeLeft } from "../services/review-countdown";

export function useReviewCountdown(deadline: number | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const update = () => setNow(Date.now());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [deadline]);
  return now === null ? null : reviewTimeLeft(deadline, now);
}
