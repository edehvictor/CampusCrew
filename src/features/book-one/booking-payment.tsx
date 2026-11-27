import {
  Banknote,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Job } from "./model";
import type { PaymentOperation } from "@/features/book-one/types/pilot";
type Props = {
  job: Job;
  busy: boolean;
  enabled: boolean;
  submit: (operation: PaymentOperation) => void;
  onComplete: () => void;
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
}: Props) {
  const operations = job.payment?.operations ?? [],
    settled = ["Paid", "Refunded", "Cancelled"].includes(job.status),
    state = job.payment?.state;
  const index =
    state === "Paid"
      ? 4
      : state === "Submitted"
        ? 3
        : state === "Funded"
          ? 2
          : state === "Funding"
            ? 1
            : 0;
  const instructions =
    job.status === "Cancelled"
      ? "Booking cancelled. No payment is due."
      : job.status === "Refunded"
        ? "Your contribution has been returned."
        : job.status === "Refund available"
          ? "A refund is available. Reclaim your contribution below."
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
                        ? "Create the booking escrow so your provider can accept."
                        : "Waiting for the task owner to prepare the booking escrow.";
  function act(operation: PaymentOperation) {
    if (
      operation === "cancel" &&
      !window.confirm(
        "Cancel this booking? Deposited contributions become refundable.",
      )
    )
      return;
    if (
      operation === "dispute" &&
      !window.confirm(
        "Open a dispute? Payout pauses until the resolver decides how to split the funds.",
      )
    )
      return;
    submit(operation);
  }
  return (
    <div className="booking-payment-panel">
      <div className="payment-status">
        <ShieldCheck size={19} />
        <strong>
          {job.status === "Cancelled"
            ? "Booking cancelled"
            : job.status === "Refunded"
              ? "Contribution refunded"
              : job.status === "Refund available"
                ? "Refund available"
                : job.status === "Paid"
                  ? "Payment sent"
                  : ["Funded", "Ready for review", "Disputed"].includes(
                        job.status,
                      )
                    ? "Payment secured"
                    : "Payment not yet secured"}
        </strong>
        <small>Test USDC / Stellar Testnet</small>
      </div>
      <ol className="booking-progress" aria-label="Booking progress">
        {progress.map((label, i) => (
          <li key={label} data-done={i <= index}>
            {i < index ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>
      <p className="booking-next-action">{instructions}</p>
      {state === "Submitted" && job.payment?.reviewDeadline ? (
        <p className="review-deadline">
          <Clock3 size={14} />
          The provider can claim payment from{" "}
          {new Date(job.payment.reviewDeadline * 1000).toLocaleString()} unless
          a dispute is opened.
        </p>
      ) : null}
      {enabled && !settled && (
        <details className="payment-terms">
          <summary>
            Payment terms & deadlines / review before accepting or funding
          </summary>
          <p>
            Each on-chain action needs your wallet approval and test XLM for
            fees. The agreed payment is held in escrow until released or
            resolved.
          </p>
          {job.payment?.fundingDeadline && (
            <p>
              Fund by{" "}
              {new Date(job.payment.fundingDeadline * 1000).toLocaleString()}.
              Complete by{" "}
              {new Date(job.payment.workDeadline! * 1000).toLocaleString()}.
            </p>
          )}
          <p>
            The task owner approves completion. After submission, the provider
            can claim payment after two days unless a dispute is opened.
          </p>
          {job.payment?.reviewDeadline ? (
            <p>
              <Clock3 size={14} />
              The provider can claim from{" "}
              {new Date(
                job.payment.reviewDeadline * 1000,
              ).toLocaleString()}{" "}
              unless disputed.
            </p>
          ) : null}
          <p>
            A dispute pauses payout. The named resolver can award all, part or
            none of the deposit to the provider. The remainder becomes
            refundable.
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
      <div className="booking-actions">
        {enabled &&
          operations.map((operation) =>
            operation === "submit" ? (
              <button
                key={operation}
                className="button button-primary"
                disabled={busy}
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
                {labels[operation]}
              </button>
            ),
          )}
      </div>
      {!enabled && !settled && (
        <p role="status">
          Testnet payment controls are not configured on this deployment.
        </p>
      )}
      <details className="payment-receipts">
        <summary>Receipts & payment help</summary>
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
          {job.payment?.fundingTx && (
            <a
              href={
                "https://stellar.expert/explorer/testnet/tx/" +
                job.payment.fundingTx
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
    </div>
  );
}
