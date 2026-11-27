"use client";

import { Clock3, ShieldCheck } from "lucide-react";
import { useReviewCountdown } from "./hooks/use-review-countdown";
import { formatReviewTime } from "./services/review-countdown";

export function BookingReviewCountdown({
  state,
  deadline,
  owner,
}: {
  state: string | undefined;
  deadline: number | undefined;
  owner: boolean;
}) {
  const remaining = useReviewCountdown(
    state === "Submitted" ? deadline : undefined,
  );
  if (state === "Disputed")
    return (
      <div className="review-countdown" data-paused="true">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Payout paused for dispute</strong>
          <p>
            The two-day fallback cannot release payment while this dispute is open.
          </p>
        </div>
      </div>
    );
  if (state !== "Submitted" || !deadline || !Number.isFinite(deadline))
    return null;
  const expired = remaining === 0;
  return (
    <div className="review-countdown">
      <Clock3 size={18} aria-hidden="true" />
      <div>
        <span>{expired ? "Review deadline reached" : "Provider can claim in"}</span>
        <strong
          role="timer"
          aria-label="Time until provider may claim payout"
          aria-live="off"
        >
          {remaining === null
            ? "Calculating time…"
            : expired
              ? "Review period ended"
              : formatReviewTime(remaining)}
        </strong>
        <p>
          {owner
            ? expired
              ? "The provider may now claim. Approve payment or report a problem before funds are released."
              : "Review now: approve payment immediately, or report a problem to pause payout."
            : expired
              ? "Use Claim payout when available. Stellar confirms eligibility; payment still needs your wallet approval."
              : "The owner can pay you now. After the deadline, you can claim unless a dispute is opened."}
        </p>
        <small>
          Claim available from:{" "}
          <time dateTime={new Date(deadline * 1000).toISOString()}>
            {new Date(deadline * 1000).toLocaleString()}
          </time>
          . No automatic transfer.
        </small>
      </div>
    </div>
  );
}
