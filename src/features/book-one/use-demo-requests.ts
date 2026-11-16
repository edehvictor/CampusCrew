import { useEffect, useState } from "react";
import { demoRequests } from "./demo-requests";
import type { Job } from "./model";

const storageKey = "campuscrew-book-one-v1";

export function useDemoRequests(enabled = true) {
  const [savedJobs, setSavedJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => {
      try {
        const data = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        setSavedJobs(Array.isArray(data) ? data : demoRequests);
      } catch {
        setSavedJobs(demoRequests);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || savedJobs === null) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedJobs));
    } catch {
      // The session can continue if browser storage is unavailable.
    }
  }, [enabled, savedJobs]);

  function updateRequests(change: (jobs: Job[]) => Job[]) {
    setSavedJobs(current => change(current ?? demoRequests));
  }

  return { jobs: savedJobs ?? demoRequests, updateRequests };
}
