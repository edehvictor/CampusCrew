import type { Job } from "../model";

// Presentation only: actions remain authorized by the server and escrow contract.
export function bookingProgress(
  job: Pick<Job, "accepted" | "payment" | "status">,
) {
  const state = job.payment?.state;
  const paused = state === "Disputed";
  const stopped = state === "Refundable";
  const submitted = Number(job.payment?.reviewDeadline ?? 0) > 0;
  const funded =
    Boolean(job.payment?.fundingTx) ||
    submitted ||
    ["Funded", "Submitted", "Disputed", "Paid"].includes(state ?? "");
  const lastReached =
    state === "Paid"
      ? 4
      : state === "Submitted" || submitted
        ? 3
        : funded
          ? 2
          : state === "Funding"
            ? 1
            : job.accepted
              ? 0
              : -1;
  return {
    lastReached,
    paused,
    stopped,
    current: paused || stopped || state === "Paid" ? -1 : lastReached,
    title: paused
      ? "Dispute under review"
      : job.status === "Cancelled"
        ? "Booking cancelled"
        : job.status === "Refunded"
          ? "Refund completed"
          : stopped
            ? "Refund available"
            : state === "Paid"
              ? "Payment released"
              : state === "Submitted"
                ? "Work ready for review"
                : state === "Funded"
                  ? "Funded · work in progress"
                  : state === "Funding"
                    ? "Accepted · awaiting funding"
                    : state === "Proposed"
                      ? "Awaiting provider acceptance"
                      : "Provider selected",
  };
}
