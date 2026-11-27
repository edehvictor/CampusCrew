// A display clock only. Claim permission comes from the server and contract.
export function reviewTimeLeft(deadline: number | undefined, now: number) {
  if (!deadline || !Number.isFinite(deadline) || deadline <= 0) return null;
  return Math.max(0, Math.ceil((deadline * 1000 - now) / 1000));
}

export function formatReviewTime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const clock = [hours, minutes, remaining]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days ? `${days}d ${clock}` : clock;
}
