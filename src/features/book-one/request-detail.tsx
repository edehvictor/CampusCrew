import { ArrowLeft, Banknote, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Info, MapPin, Send, Wallet } from "lucide-react";
import { BookingPayment } from "./booking-payment";
import type { PaymentOperation } from "./pilot-types";
import { CategoryIcon } from "./category-icon";
import { price, type Job, type Quote, type Status } from "./model";

type Props = {
  job: Job;
  onBack: () => void;
  onAccept: (quote: Quote) => void;
  onQuote: () => void;
  onComplete: () => void;
  busy: boolean;
  payment?: { enabled: boolean; submit: (operation: PaymentOperation) => void };
  onChangeStatus: (from: Status, to: Status, message: string) => void;
};

const statusTone: Record<Status, string> = {
  Open: "open",
  "Awaiting funding": "waiting",
  Funded: "positive",
  "Ready for review": "waiting",
  Paid: "positive",
  Refunded: "neutral",
};

export function RequestDetail({ job, onBack, onAccept, onQuote, onComplete, onChangeStatus, busy, payment }: Props) {
  const accepted = job.quotes.find(quote => quote.id === job.accepted);
  const ownQuote = job.quotes.find(quote => quote.own);
  const booking = job.own || accepted?.own ? accepted : undefined;
  const customerInitials = job.customer.split(" ").map(name => name[0]).join("");

  return (
    <section className="request-detail" aria-labelledby="request-title">
      <button type="button" className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> Back to tasks
      </button>
      <div className="request-detail-top">
        <div className="detail-category"><CategoryIcon category={job.category} /> {job.category}</div>
        <span className="status" data-tone={statusTone[job.status]}><span aria-hidden="true" />{job.status}</span>
      </div>
      <h2 id="request-title" tabIndex={-1}>{job.title}</h2>
      <div className="request-byline"><span className="avatar avatar-small" aria-hidden="true">{customerInitials}</span> Posted by <strong>{job.customer}</strong></div>

      <dl className="request-facts">
        <div><dt><Wallet size={16} aria-hidden="true" /> {booking ? "Agreed payout" : "Budget"}</dt><dd>{price(booking?.amount ?? job.budget)}</dd></div>
        <div><dt><MapPin size={16} aria-hidden="true" /> Service area</dt><dd>{job.area}</dd></div>
        <div><dt><CalendarDays size={16} aria-hidden="true" /> When</dt><dd>{booking?.availability ?? job.timing}</dd></div>
      </dl>

      <div className="request-scope">
        <h3><ClipboardList size={18} aria-hidden="true" /> What’s needed</h3>
        <p>{job.scope}</p>
      </div>

      {job.status === "Open" && job.own && (
        <details className="request-next applications" key={job.id}>
          <summary className="button button-secondary applications-toggle">
            View applications ({job.quotes.length}) <ChevronDown size={15} aria-hidden="true" />
          </summary>
          {job.quotes.length === 0 && <p className="empty-message">Applications will appear here as providers respond.</p>}
          {job.quotes.map(quote => (
            <article className="provider-quote" key={quote.id}>
              <div>
                <strong>{quote.provider}</strong>
                <p className="quote-availability">{quote.availability}</p>
                <p className="quote-note">{quote.note}</p>
                {quote.bio && <p className="quote-note">{quote.bio}</p>}
                {!!quote.skills?.length && <p className="quote-availability">{quote.skills.join(" · ")}</p>}
                {!!quote.coverage?.length && <p className="quote-availability">Areas: {quote.coverage.join(", ")}</p>}
              </div>
              <div className="quote-action">
                <strong>{price(quote.amount)}</strong>
                <button className="button button-primary" type="button" disabled={busy || (payment && !payment.enabled)} onClick={() => onAccept(quote)}>Select provider</button>
              </div>
            </article>
          ))}
        </details>
      )}

      {!job.own && ownQuote && !booking && (
        <section className="request-next">
          <h3>Your application <span className="status" data-tone="neutral">{job.status === "Open" ? "Sent" : "Another provider selected"}</span></h3>
          <article className="provider-quote">
            <div><p className="quote-availability">{ownQuote.availability}</p><p className="quote-note">{ownQuote.note}</p></div>
            <strong>{price(ownQuote.amount)}</strong>
          </article>
        </section>
      )}

      {job.status === "Open" && !job.own && !ownQuote && (
        <div className="request-next">
          <button className="button button-primary" type="button" onClick={onQuote}><Send size={16} aria-hidden="true" /> Apply for this task</button>
        </div>
      )}

      {booking && (
        <section className="request-next">
          <h3>Booking with {booking.provider}</h3>
          <p className="quote-note">{booking.note}</p>
          {job.completion && <div className="completion-note"><strong>Completion note</strong><p>{job.completion}</p></div>}
          {payment ? <BookingPayment job={job} busy={busy} enabled={payment.enabled} submit={payment.submit} onComplete={onComplete} /> : <div className="booking-actions">
            {job.status === "Awaiting funding" && (
              <button type="button" className="button button-primary" onClick={() => onChangeStatus("Awaiting funding", "Funded", "Demo funding confirmed.")}>
                <Wallet size={16} aria-hidden="true" /> Simulate funding
              </button>
            )}
            {job.status === "Funded" && (
              <>
                <button type="button" className="button button-primary" onClick={onComplete}>Submit completion</button>
                <button type="button" className="button button-secondary" onClick={() => onChangeStatus("Funded", "Refunded", "Demo refund recorded.")}>Simulate cancellation</button>
              </>
            )}
            {job.status === "Ready for review" && (
              <button type="button" className="button button-primary" onClick={() => onChangeStatus("Ready for review", "Paid", "Demo payout recorded.")}>
                <Banknote size={16} aria-hidden="true" /> Approve and simulate payout
              </button>
            )}
            {job.status === "Paid" && <span className="status" data-tone="positive"><CheckCircle2 size={14} aria-hidden="true" /> Demo payout recorded</span>}
            {job.status === "Refunded" && <span className="status" data-tone="neutral">Demo refund recorded</span>}
          </div>}
        </section>
      )}

      {payment ? (!payment.enabled && !booking && <p className="demo-note"><Info size={16} aria-hidden="true" /> Payment setup is required before selecting a provider.</p>) :
        <p className="demo-note"><Info size={16} aria-hidden="true" /> G$ payments are simulated. Bookings are saved in this browser.</p>}
    </section>
  );
}
