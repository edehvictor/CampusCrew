import { Banknote, RotateCw, Wallet } from "lucide-react";
import type { Job } from "./model";
import type { PaymentOperation } from "./pilot-types";

type Props = { job: Job; busy: boolean; enabled: boolean; submit: (operation: PaymentOperation) => void; onComplete: () => void };
const labels = {
  create: "Create Testnet escrow", accept: "Accept booking terms", fund: "Fund with test USDC",
  release: "Approve and release test USDC", claim: "Claim payout", cancel: "Cancel booking",
  refund: "Reclaim contribution", dispute: "Open dispute",
} as const;

export function BookingPayment({ job, busy, enabled, submit, onComplete }: Props) {
  const operations = job.payment?.operations ?? [];
  const settled = ["Paid", "Refunded", "Cancelled"].includes(job.status);
  const state = job.payment?.state;
  function act(operation: PaymentOperation) {
    if (operation === "cancel" && !window.confirm("Cancel this booking? Any deposited contribution will become refundable.")) return;
    if (operation === "dispute" && !window.confirm("Open a dispute? Payout will pause until the named resolver decides how the funds should be split.")) return;
    submit(operation);
  }
  return <>
    {enabled && !settled && <div className="escrow-terms">
      <p>Payments use Circle test USDC on Stellar Testnet. Each action needs your wallet approval and test XLM for fees.</p>
      <p>The provider accepts before funding. The task owner approves completion; after submission, the provider can claim payment after two days unless a dispute is opened.</p>
      {job.payment?.fundingDeadline && <p>Fund by {new Date(job.payment.fundingDeadline * 1000).toLocaleString()}. Complete work by {new Date(job.payment.workDeadline! * 1000).toLocaleString()}.</p>}
      {job.payment?.reviewDeadline ? <p>Automatic payout becomes available {new Date(job.payment.reviewDeadline * 1000).toLocaleString()}.</p> : null}
      {job.payment?.resolver && <p>A dispute pauses payout. The resolver can award the provider all, part, or none of the deposit; the rest becomes refundable. <a href={`https://stellar.expert/explorer/testnet/account/${job.payment.resolver}`} target="_blank" rel="noreferrer">View resolver</a></p>}
      {(state === "Proposed" && job.own) && <p>Waiting for your provider to accept the booking terms.</p>}
      {(!state || state === "Uncreated") && !job.own && <p>Waiting for the task owner to create the escrow.</p>}
      {state === "Funding" && !job.own && <p>Booking accepted. Waiting for the task owner to fund.</p>}
      {state === "Disputed" && <p>Payout is paused while the resolver reviews the dispute.</p>}
    </div>}
    <div className="booking-actions">
      {enabled && operations.map(operation => operation === "submit"
        ? <button key={operation} type="button" className="button button-primary" disabled={busy} onClick={onComplete}>Submit completion</button>
        : <button key={operation} type="button" className={`button ${["cancel", "dispute"].includes(operation) ? "button-secondary" : "button-primary"}`} disabled={busy} onClick={() => act(operation)}>
          {operation === "fund" && <Wallet size={16} aria-hidden="true" />}
          {operation === "release" && <Banknote size={16} aria-hidden="true" />}
          {labels[operation]}
        </button>)}
      {enabled && <button type="button" className="button button-secondary" disabled={busy} onClick={() => submit("sync")}>
        <RotateCw size={15} aria-hidden="true" /> Refresh payment
      </button>}
    </div>
    {!enabled && !settled && <p className="quote-note">Stellar Testnet escrow is not configured yet. This booking has not been paid.</p>}
    <div className="booking-receipts">
      {job.payment?.contract && <a href={`https://stellar.expert/explorer/testnet/contract/${job.payment.contract}`} target="_blank" rel="noreferrer">Escrow contract</a>}
      {job.payment?.fundingTx && <a href={`https://stellar.expert/explorer/testnet/tx/${job.payment.fundingTx}`} target="_blank" rel="noreferrer">Funding receipt</a>}
      {job.payment?.settlementTx && <a href={`https://stellar.expert/explorer/testnet/tx/${job.payment.settlementTx}`} target="_blank" rel="noreferrer">Settlement receipt</a>}
    </div>
  </>;
}
