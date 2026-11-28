import Link from "next/link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Check, Clock3 } from "lucide-react";
import { ReputationLine } from "./reputation-line";
import { price, type Quote } from "./model";

export function ApplicationCard({
  quote,
  selected = false,
  busy,
  onSelect,
  showReputation = true,
  needsReview = false,
}: {
  quote: Quote;
  selected?: boolean;
  busy?: boolean;
  onSelect?: (quote: Quote) => void;
  showReputation?: boolean;
  needsReview?: boolean;
}) {
  return (
    <article
      className="application-card"
      data-selected={selected}
      aria-label={`${quote.provider}'s application`}
    >
      <header className="application-card-header">
        <div className="application-person">
          <UserAvatar className="avatar-small" />
          <div>
            {quote.profileId ? (
              <Link
                className="application-name"
                href={"/providers/" + quote.profileId}
              >
                {quote.provider}
              </Link>
            ) : (
              <strong className="application-name">{quote.provider}</strong>
            )}
            {quote.withdrawnAt && (
              <span className="status" data-tone="neutral">
                Withdrawn
              </span>
            )}
            {selected && (
              <span className="application-selected">
                <Check size={14} aria-hidden="true" /> Selected
              </span>
            )}
          </div>
        </div>
        <strong className="application-price">{price(quote.amount)}</strong>
      </header>
      {showReputation && <ReputationLine stats={quote.reputation} />}
      <p className="application-availability">
        <Clock3 size={14} aria-hidden="true" />
        {quote.availability}
      </p>
      <p className="quote-note application-message">{quote.note}</p>
      {needsReview && (
        <p className="task-changed-notice">
          Awaiting this applicant’s confirmation of the updated task.
        </p>
      )}
      {quote.updatedAt && (
        <small className="application-edit-time">
          Offer updated {new Date(quote.updatedAt).toLocaleString()}
        </small>
      )}
      {(quote.bio || quote.skills?.length || quote.coverage?.length) && (
        <details className="application-background">
          <summary>Services & coverage</summary>
          {quote.bio && <p>{quote.bio}</p>}
          {!!quote.skills?.length && <p>{quote.skills.join(" · ")}</p>}
          {!!quote.coverage?.length && (
            <p>Areas: {quote.coverage.join(", ")}</p>
          )}
        </details>
      )}
      {onSelect && !selected && !quote.withdrawnAt && (
        <footer className="application-card-footer">
          {quote.profileId && (
            <Link
              className="text-button"
              href={"/providers/" + quote.profileId}
            >
              View profile
            </Link>
          )}
          <button
            className="button button-primary"
            type="button"
            disabled={busy || needsReview}
            onClick={() => onSelect(quote)}
          >
            Select provider
          </button>
        </footer>
      )}
    </article>
  );
}
