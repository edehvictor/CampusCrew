import Link from "next/link";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Pencil,
  MapPin,
  Send,
  Wallet,
} from "lucide-react";
import { ApplicationCard } from "./application-card";
import { BookingExperiencePanel } from "./booking-experience";
import { BookingPayment } from "./booking-payment";
import type { PaymentOperation } from "./types/pilot";
import { CategoryIcon } from "./category-icon";
import { price, type Job, type Quote, type Status } from "./model";

type Props = {
  job: Job;
  wallet?: string;
  experienceReady?: boolean;
  onBack: () => void;
  onAccept: (quote: Quote) => void;
  onQuote: () => void;
  onComplete: () => void;
  onRemoveTask: () => void;
  onWithdraw: () => void;
  onEditTask: () => void;
  onEditApplication: () => void;
  busy: boolean;
  payment: { enabled: boolean; submit: (operation: PaymentOperation) => void };
};
const statusTone: Record<Status, string> = {
  Open: "open",
  "Funding required": "waiting",
  Removed: "neutral",
  Expired: "neutral",
  Closing: "waiting",
  "Awaiting assignment": "waiting",
  "Awaiting acceptance": "waiting",
  "Awaiting funding": "waiting",
  Funded: "positive",
  "Ready for review": "waiting",
  Paid: "positive",
  Refunded: "neutral",
  Disputed: "waiting",
  "Refund available": "waiting",
  Cancelled: "neutral",
};

export function RequestDetail({
  job,
  wallet,
  experienceReady,
  onBack,
  onAccept,
  onQuote,
  onComplete,
  onRemoveTask,
  onWithdraw,
  onEditTask,
  onEditApplication,
  busy,
  payment,
}: Props) {
  const [evidencePending, setEvidencePending] = useState(
    Boolean(job.evidenceRequired && !job.own && job.status === "Funded"),
  );
  const accepted = job.quotes.find((quote) => quote.id === job.accepted);
  const ownQuote = job.quotes.find((quote) => quote.own);
  const booking = job.own || accepted?.own ? accepted : undefined;
  return (
    <section className="request-detail" aria-labelledby="request-title">
      <button
        type="button"
        className="text-button back-button"
        onClick={onBack}
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to tasks
      </button>
      <div className="request-detail-top">
        <div className="detail-category">
          <CategoryIcon category={job.category} />
          {job.category}
        </div>
        <span className="status" data-tone={statusTone[job.status]}>
          <span aria-hidden="true" />
          {job.status}
        </span>
      </div>
      <h2 id="request-title" tabIndex={-1}>
        {job.title}
      </h2>
      <div className="request-byline">
        <UserAvatar className="avatar-small" />
        Posted by <strong>{job.customer}</strong>
      </div>
      {job.own && job.status === "Open" && job.revision && (
        <button
          className="text-button edit-task-button"
          type="button"
          disabled={busy}
          onClick={onEditTask}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit task
        </button>
      )}
      {job.own &&
        job.lifecycleReady &&
        !["Removed", "Closing"].includes(job.status) &&
        (!job.accepted ||
          (job.publication &&
            (!job.payment?.state || job.payment.state === "Uncreated"))) && (
          <button
            type="button"
            className="text-button edit-task-button"
            disabled={busy}
            onClick={onRemoveTask}
          >
            {job.publication ? "Remove task & refund budget" : "Remove task"}
          </button>
        )}
      {job.publication && !job.accepted && (
        <p className="funded-task-note">
          {job.status === "Removed"
            ? "Budget refunded. This task is closed."
            : job.status === "Expired"
              ? "Applications closed. Remove this task to reclaim your reserved budget."
              : job.status === "Closing"
                ? "Refund awaiting confirmation. Applications are paused."
                : "Budget held in escrow. Quotes cannot exceed the funded amount."}{" "}
          <a
            href={
              "https://stellar.expert/explorer/testnet/tx/" +
              (job.publication.cancellationTx ?? job.publication.fundingTx)
            }
            target="_blank"
            rel="noreferrer"
          >
            View receipt
          </a>
        </p>
      )}
      {job.status === "Funding required" && (
        <p className="task-changed-notice">
          This older task has no publication deposit and is hidden from Browse
          tasks. Remove it and post a funded task.
        </p>
      )}
      {job.updatedAt && (
        <p className="task-edit-time">
          Updated {new Date(job.updatedAt).toLocaleString()}
        </p>
      )}
      <dl className="request-facts">
        <div>
          <dt>
            <Wallet size={16} aria-hidden="true" />
            {booking ? "Agreed payout" : "Budget"}
          </dt>
          <dd>{price(booking?.amount ?? job.budget)}</dd>
        </div>
        <div>
          <dt>
            <MapPin size={16} aria-hidden="true" />
            Service area
          </dt>
          <dd>{job.area}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={16} aria-hidden="true" />
            When
          </dt>
          <dd>{booking?.availability ?? job.timing}</dd>
        </div>
      </dl>

      {booking && (
        <section className="booking-overview" aria-label="Your booking">
          <div className="booking-person">
            <div>
              <span className="booking-person-label">
                {job.own ? "Selected provider" : "Task owner"}
              </span>
              {job.own && booking.profileId ? (
                <Link href={"/providers/" + booking.profileId}>
                  {booking.provider}
                </Link>
              ) : (
                <strong>{job.own ? booking.provider : job.customer}</strong>
              )}
            </div>
            <span className="application-selected">
              <Check size={14} aria-hidden="true" />
              {job.own ? "Selected" : "You're selected"}
            </span>
          </div>
          <BookingPayment
            job={job}
            busy={busy}
            enabled={payment.enabled}
            submit={payment.submit}
            onComplete={onComplete}
            completionBlocked={evidencePending}
          />
        </section>
      )}

      <details
        className="request-scope task-scope-details"
        open={!booking}
        key={job.id + Boolean(booking)}
      >
        <summary>
          <ClipboardList size={17} aria-hidden="true" />
          Task details
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <p>{job.scope}</p>
        {job.evidenceRequired && (
          <p className="evidence-requirement">
            A photo or document is required as completion evidence.
          </p>
        )}
      </details>

      {job.own && (
        <details className="request-next applications" key={job.id}>
          <summary className="button button-secondary applications-toggle">
            {booking ? "Applications" : "View applications"} (
            {job.quotes.filter((q) => !q.withdrawnAt).length})
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          {job.quotes.length === 0 && (
            <p className="empty-message">
              Applications will appear here as providers respond.
            </p>
          )}
          {job.quotes.map((quote) => (
            <ApplicationCard
              key={quote.id}
              quote={quote}
              selected={quote.id === job.accepted}
              busy={busy}
              showReputation={experienceReady}
              onSelect={
                job.status === "Open" && !job.accepted ? onAccept : undefined
              }
              needsReview={Boolean(
                job.revision && quote.taskRevision !== job.revision,
              )}
            />
          ))}
        </details>
      )}

      {!job.own && ownQuote && !booking && (
        <section className="request-next">
          <h3>
            Your application
            <span className="status" data-tone="neutral">
              {ownQuote.withdrawnAt
                ? "Withdrawn"
                : job.status === "Open"
                  ? "Sent"
                  : job.accepted
                    ? "Another provider selected"
                    : "Task closed"}
            </span>
          </h3>
          <ApplicationCard quote={ownQuote} showReputation={false} />
          {job.status === "Open" && job.revision && ownQuote.revision && (
            <div className="application-edit-actions">
              {!ownQuote.withdrawnAt &&
                ownQuote.taskRevision !== job.revision && (
                  <p className="task-changed-notice">
                    The task has changed since you applied. Review the details
                    and confirm your offer before the owner can select you.
                  </p>
                )}
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={onEditApplication}
              >
                <Pencil size={15} aria-hidden="true" />
                {ownQuote.withdrawnAt
                  ? "Apply again"
                  : ownQuote.taskRevision !== job.revision
                    ? "Review & update application"
                    : "Edit application"}
              </button>
              {job.lifecycleReady && !ownQuote.withdrawnAt && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={onWithdraw}
                >
                  Withdraw application
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {job.status === "Open" && !job.own && !ownQuote && (
        <div className="request-next">
          <button
            className="button button-primary"
            type="button"
            onClick={onQuote}
          >
            <Send size={16} aria-hidden="true" />
            Apply for this task
          </button>
        </div>
      )}

      {booking && (
        <section className="booking-workspace" aria-label="Booking workspace">
          {!job.own && (
            <details className="accepted-application">
              <summary>Your selected application</summary>
              <ApplicationCard
                quote={booking}
                selected
                showReputation={false}
              />
            </details>
          )}
          {experienceReady && (
            <BookingExperiencePanel
              key={job.id}
              job={job}
              wallet={wallet}
              onEvidencePendingChange={setEvidencePending}
            />
          )}
        </section>
      )}
    </section>
  );
}
