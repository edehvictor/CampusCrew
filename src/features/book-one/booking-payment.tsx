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
  const canRefund = job.payment?.requesterRefundAvailable;

  return (
    <>
      <div className="booking-actions">
        {enabled && job.status === "Awaiting funding" && job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={() => submit("fund")}>
            <Wallet size={16} aria-hidden="true" /> Fund with test USDC
          </button>
        )}
        {enabled && job.status === "Awaiting funding" && !job.own && <span className="status" data-tone="waiting">Waiting for the task owner to fund</span>}
        {enabled && job.status === "Funded" && !job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={onComplete}>Submit completion</button>
        )}
        {enabled && job.status === "Ready for review" && job.own && (
          <button type="button" className="button button-primary" disabled={busy} onClick={() => submit("release")}>
            <Banknote size={16} aria-hidden="true" /> Approve and release test USDC
          </button>
        )}
        {enabled && active && canRefund && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => submit("refund")}>Reclaim contribution</button>
        )}
        {enabled && (!settled || !job.payment?.settlementTx) && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => submit("sync")}>
            <RotateCw size={15} aria-hidden="true" /> Refresh payment
          </button>
        )}
      </div>
      {enabled && active && job.own && refundAfter && !canRefund && (
        <p className="quote-note">Task owner refund available {new Date(refundAfter * 1000).toLocaleString()} if the booking is still active.</p>
      )}
      {!enabled && !settled && <p className="quote-note">Provider selected. Stellar Testnet escrow funding is being connected. No payment has been made for this booking.</p>}
      <div className="booking-receipts">
        {job.payment?.fundingTx && <a href={`https://stellar.expert/explorer/testnet/tx/${job.payment.fundingTx}`} target="_blank" rel="noreferrer">Funding receipt on Stellar Testnet</a>}
        {job.payment?.settlementTx && <a href={`https://stellar.expert/explorer/testnet/tx/${job.payment.settlementTx}`} target="_blank" rel="noreferrer">Settlement receipt on Stellar Testnet</a>}
      </div>
    </>
  );
}
