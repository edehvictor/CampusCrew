import { Banknote, CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import type { Job } from "./model";
import type { PaymentOperation } from "@/features/book-one/types/pilot";
import { BookingReviewCountdown } from "./booking-review-countdown";
import { DisputeReportButton } from "./dispute-report";
import { bookingProgress } from "./services/booking-progress";
type Props = {
  job: Job;
  busy: boolean;
  enabled: boolean;
  submit: (operation: PaymentOperation) => void;
  onComplete: () => void;
  completionBlocked?: boolean;
};
const labels = {
  create: "Create booking escrow",
  accept: "Accept booking terms",
  fund: "Secure payment",
  release: "Approve & pay provider",
  claim: "Claim payout",
  cancel: "Cancel booking",
  refund: "Reclaim contribution",
  dispute: "Report a problem",
} as const;
const progress = ["Selected", "Accepted", "Funded", "Submitted", "Paid"];
export function BookingPayment({
  job,
  busy,
  enabled,
  submit,
  onComplete,
  completionBlocked = false,
}: Props) {
  const operations = job.payment?.operations ?? [],
    settled = ["Paid", "Refunded", "Cancelled", "Removed"].includes(job.status),
    state = job.payment?.state;
  const stage = bookingProgress(job);
  const prefunded = Boolean(job.publication);
  const steps = prefunded
    ? ["Selected", "Budget secured", "Accepted", "Submitted", "Paid"]
    : progress;
  const instructions =
    job.status === "Removed"
      ? "Task cancelled. The reserved budget was returned to its owner."
      : job.status === "Cancelled"
        ? "Booking cancelled. No payment is due."
        : job.status === "Refunded"
          ? job.own
            ? "Your refundable contribution has been returned."
            : "The task owner's refundable contribution has been returned."
          : job.status === "Refund available"
            ? job.own
              ? "A refund is available. Reclaim your contribution below."
              : "Settlement decided. The remaining contribution is refundable to the task owner."
            : job.status === "Paid"
              ? "Payment released. This booking is complete."
              : job.status === "Disputed"
                ? "Payout is paused while the resolver reviews the dispute."
                : state === "Submitted"
                  ? job.own
                    ? "Review the provider's completion before approving payment."
                    : "Your work is submitted. Waiting for the task owner to review it."
                  : state === "Funded"
                    ? "Payment is secured. The provider can carry out the task."
                    : state === "Funding"
                      ? job.own
                        ? "Your provider accepted. Secure the payment to start the work."
                        : "You accepted the terms. Wait for payment to be secured before starting."
                      : state === "Proposed"
                        ? job.own
                          ? "Waiting for the provider to accept."
                          : "Review the booking details and accept when you are ready."
                        : job.own
                          ? prefunded
                            ? "Your budget is already in escrow. Confirm this provider to return any unused difference, then they can accept. You will not be charged USDC again."
                            : "Create the booking escrow so your provider can accept."
                          : prefunded
                            ? "The task budget is secured. Waiting for the task owner to confirm this assignment."
                            : "Waiting for the task owner to prepare the booking escrow.";
  function act(operation: PaymentOperation) {
    if (
      operation === "cancel" &&
      !window.confirm(
        "Cancel this booking? Deposited contributions become refundable.",
      )
    )
      return;
    submit(operation);
  }
  return (
    <section
      className="booking-payment-panel"
      data-paused={stage.paused}
      aria-label="Booking status and payment"
    >
      <div className="payment-status">
        <ShieldCheck size={19} />
        <strong>{stage.title}</strong>
        <small>Test USDC · Stellar Testnet</small>
      </div>
      <ol className="booking-progress" aria-label="Booking progress">
        {steps.map((label, i) => (
          <li
            key={label}
            data-done={i <= stage.lastReached}
            aria-current={i === stage.current ? "step" : undefined}
          >
            <span className="progress-marker" aria-hidden="true">
              {i <= stage.lastReached ? <CheckCircle2 size={16} /> : i + 1}
            </span>
            <span className="progress-label">
              {label}
              <span className="sr-only">
                {i <= stage.lastReached ? " — reached" : " — not reached"}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="booking-action-focus">
        {prefunded &&
          job.own &&
          job.budget >
            (job.quotes.find((q) => q.id === job.accepted)?.amount ??
              job.budget) && (
            <p className="funded-task-note">
              Unused budget:{" "}
              {(
                job.budget -
                (job.quotes.find((q) => q.id === job.accepted)?.amount ??
                  job.budget)
              ).toFixed(2)}{" "}
              USDC. Returned automatically when the assignment confirms.
            </p>
          )}
        <p className="booking-next-action">{instructions}</p>
        {state === "Submitted" && (
          <BookingReviewCountdown
            state={state}
            deadline={job.payment?.reviewDeadline}
            owner={Boolean(job.own)}
          />
        )}
        <div className="booking-actions">
          {enabled &&
            operations.map((operation) =>
              operation === "dispute" ? (
                <DisputeReportButton
                  key={operation}
                  id={job.id}
                  disabled={busy}
                  onPause={() => submit("dispute")}
                />
              ) : operation === "submit" ? (
                <button
                  key={operation}
                  className="button button-primary"
                  disabled={busy || completionBlocked}
                  onClick={onComplete}
                >
                  Submit completion
                </button>
              ) : (
                <button
                  type="button"
                  key={operation}
                  className={
                    "button " +
                    (["cancel", "dispute"].includes(operation)
                      ? "button-secondary"
                      : "button-primary")
                  }
                  disabled={busy}
                  onClick={() => act(operation)}
                >
                  {operation === "fund" ? (
                    <Wallet size={16} />
                  ) : operation === "release" ? (
                    <Banknote size={16} />
                  ) : null}
                  {operation === "create" && prefunded
                    ? "Confirm provider & assign budget"
                    : labels[operation]}
                </button>
              ),
            )}
        </div>
        {completionBlocked && (
          <p className="evidence-submit-blocked" role="status">
            Finish the evidence step below before submitting completion.
          </p>
        )}
        {!enabled && !settled && (
          <p role="status">
            Testnet payment controls are not configured on this deployment.
          </p>
        )}
      </div>
      {enabled && !settled && (
        <details className="payment-terms">
          <summary>Payment terms & deadlines</summary>
          <p>
            Wallet approvals use test XLM for network fees. Accepting the terms
            does not transfer USDC.{" "}
            {prefunded
              ? "Your task deposit already holds the budget; confirming the assignment returns any difference to you."
              : "Funding locks the agreed payment in escrow."}
          </p>
          {job.payment?.fundingDeadline && (
            <p>
              {prefunded ? "Confirm assignment & accept by" : "Fund by"}{" "}
              {new Date(job.payment.fundingDeadline * 1000).toLocaleString()}.
            </p>
          )}
          {job.payment?.workDeadline && (
            <p>
              Complete by{" "}
              {new Date(job.payment.workDeadline * 1000).toLocaleString()}.
            </p>
          )}
          <p>
            The owner can approve payment as soon as work is submitted. After
            two days, the provider can claim unless a dispute is opened.
            Claiming requires a wallet approval.
          </p>
          <p>
            A dispute pauses payout. The resolver reviews booking messages and
            evidence, then awards all, part or none of the deposit. The
            remainder is refundable. Confirmed settlements are final on-chain.
          </p>
          {job.payment?.resolver && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/account/" +
                job.payment.resolver
              }
              target="_blank"
              rel="noreferrer"
            >
              View dispute resolver
            </a>
          )}
        </details>
      )}
      <details className="payment-receipts">
        <summary>Receipts & transaction details</summary>
        <p>
          Booking updates are checked automatically. If your connection was
          interrupted, you can check again here.
        </p>
        {enabled && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => submit("sync")}
          >
            Check payment status
          </button>
        )}
        <div className="booking-receipts">
          {job.publication?.cancellationTx && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/tx/" +
                job.publication.cancellationTx
              }
              target="_blank"
              rel="noreferrer"
            >
              Task budget refund receipt
            </a>
          )}
          {job.payment?.contract && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/contract/" +
                job.payment.contract
              }
              target="_blank"
              rel="noreferrer"
            >
              Escrow contract
            </a>
          )}
          {(job.payment?.fundingTx || job.publication?.fundingTx) && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/tx/" +
                (job.payment?.fundingTx ?? job.publication?.fundingTx)
              }
              target="_blank"
              rel="noreferrer"
            >
              Funding receipt
            </a>
          )}
          {job.payment?.settlementTx && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/tx/" +
                job.payment.settlementTx
              }
              target="_blank"
              rel="noreferrer"
            >
              Payment/refund receipt
            </a>
          )}
        </div>
      </details>
    </section>
  );
}
