import { Banknote, RotateCw, Wallet } from "lucide-react";
import type { Job } from "./model";
import type { PaymentOperation } from "./pilot-types";

type Props = {
  job: Job;
  busy: boolean;
  enabled: boolean;
  submit: (operation: PaymentOperation) => void;
  onComplete: () => void;
};

export function BookingPayment({ job, busy, enabled, submit, onComplete }: Props) {
  const active = job.status === "Funded" || job.status === "Ready for review";
  const settled = job.status === "Paid" || job.status === "Refunded";
  const refundAfter = job.payment?.refundAfter;
  const canRefund = !job.own || job.payment?.requesterRefundAvailable;

  return (
    <>
      <div className="booking-actions">
        {enabled && job.status === "Awaiting funding" && job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={() => submit("fund")}>
            <Wallet size={16} aria-hidden="true" /> Fund with G$
          </button>
        )}
        {job.status === "Awaiting funding" && !job.own && <span className="status" data-tone="waiting">Waiting for the task owner to fund</span>}
        {job.status === "Funded" && !job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={onComplete}>Submit completion</button>
        )}
        {job.status === "Ready for review" && job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={() => submit("release")}>
            <Banknote size={16} aria-hidden="true" /> Approve and release G$
          </button>
        )}
        {active && canRefund && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => submit("refund")}>Refund G$</button>
        )}
        {enabled && (!settled || !job.payment?.settlementTx) && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => submit("sync")}>
            <RotateCw size={15} aria-hidden="true" /> Refresh payment
          </button>
        )}
      </div>
      {active && job.own && refundAfter && !canRefund && (
        <p className="quote-note">Task owner refund available {new Date(refundAfter * 1000).toLocaleString()} if the booking is still active.</p>
      )}
      {!enabled && !settled && <p className="quote-note">G$ booking payments are awaiting pilot configuration.</p>}
      <div className="booking-receipts">
        {job.payment?.fundingTx && <a href={`https://celoscan.io/tx/${job.payment.fundingTx}`} target="_blank" rel="noreferrer">Funding receipt on Celo</a>}
        {job.payment?.settlementTx && <a href={`https://celoscan.io/tx/${job.payment.settlementTx}`} target="_blank" rel="noreferrer">Settlement receipt on Celo</a>}
      </div>
    </>
  );
}
