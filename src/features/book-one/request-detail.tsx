import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
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
  busy: boolean;
  payment: { enabled: boolean; submit: (operation: PaymentOperation) => void };
};
const statusTone: Record<Status, string> = {
  Open: "open",
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
  busy,
  payment,
}: Props) {
  const accepted = job.quotes.find((quote) => quote.id === job.accepted);
  const ownQuote = job.quotes.find((quote) => quote.own);
  const booking = job.own || accepted?.own ? accepted : undefined;
  const customerInitials = job.customer
    .split(" ")
    .map((name) => name[0])
    .join("");
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
        <span className="avatar avatar-small" aria-hidden="true">
          {customerInitials}
        </span>
        Posted by <strong>{job.customer}</strong>
      </div>
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
            {job.quotes.length})<ChevronDown size={15} aria-hidden="true" />
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
            />
          ))}
        </details>
      )}

      {!job.own && ownQuote && !booking && (
        <section className="request-next">
          <h3>
            Your application
            <span className="status" data-tone="neutral">
              {job.status === "Open" ? "Sent" : "Another provider selected"}
            </span>
          </h3>
          <ApplicationCard quote={ownQuote} showReputation={false} />
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
            <BookingExperiencePanel key={job.id} job={job} wallet={wallet} />
          )}
        </section>
      )}
    </section>
  );
}
