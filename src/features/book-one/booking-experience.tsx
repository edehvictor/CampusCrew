"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MessageCircle, Paperclip, Star, X } from "lucide-react";
import type { Job } from "./model";
import type { BookingExperience } from "@/features/book-one/types/experience";
export function BookingExperiencePanel({
  job,
  wallet,
  onReviewed,
}: {
  job: Job;
  wallet?: string;
  onReviewed?: () => void;
}) {
  const [data, setData] = useState<BookingExperience | null>(null),
    [tab, setTab] = useState("work"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewOpen, setReviewOpen] = useState(false),
    [notice, setNotice] = useState("");
  const reviewShown = useRef(false);
  const clientId = useRef<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/experience?view=booking&id=" + job.id, {
      cache: "no-store",
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    return value as BookingExperience;
  }, [job.id]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await load();
        if (active) {
          setData(next);
          setError("");
          if (next.canReview && !reviewShown.current) {
            reviewShown.current = true;
            const key = "campuscrew-review-prompt:" + wallet + ":" + job.id;
            try {
              if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, "seen");
                setReviewOpen(true);
              }
            } catch {
              setReviewOpen(true);
            }
          }
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Booking updates are delayed.",
          );
      }
      if (active)
        timer = setTimeout(() => {
          if (document.visibilityState === "visible") void tick();
          else timer = setTimeout(() => void tick(), 5000);
        }, 4000);
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job.id, job.status, wallet, load]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("body") ?? "").trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    clientId.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          requestId: job.id,
          body: text,
          clientId: clientId.current,
        }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      clientId.current = null;
      form.reset();
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message not sent.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await fetch("/api/evidence?booking=" + job.id, {
        method: "POST",
        body: form,
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setData(await load());
      setNotice("Evidence saved privately to this booking.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="booking-experience">
      <div
        className="experience-tabs"
        role="group"
        aria-label="Booking information"
      >
        {[
          ["work", "Work & evidence"],
          ["messages", "Messages"],
          ["activity", "Activity"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === "work" && (
        <>
          <div className="evidence-heading">
            <h4>
              <Paperclip size={16} />
              Completion evidence
            </h4>
            <span>
              {job.evidenceRequired ? "Required by task owner" : "Optional"}
            </span>
          </div>
          <p className="privacy-note">
            {job.evidenceRequired
              ? "This task requires a photo or document before completion can be submitted."
              : "Upload evidence when useful or requested. A completion note is still required."}{" "}
            Only booking participants can access these files.
          </p>
          {job.completion && (
            <div className="completion-note">
              <strong>Provider&apos;s completion note</strong>
              <p>{job.completion}</p>
            </div>
          )}
          <ul className="evidence-list">
            {data?.evidence.map((file) => (
              <li key={file.id}>
                <a
                  href={"/api/evidence?id=" + file.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  {file.name} /
                </a>
              </li>
            ))}
          </ul>
          {!job.own && job.status === "Funded" && (
            <label className="evidence-upload">
              {busy ? "Uploading..." : "Add photo or document"}
              <input
                aria-label="Upload completion evidence"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={busy || (data?.evidence.length ?? 0) >= 3}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
              <small>JPG, PNG, WebP or PDF / 5 MB each / up to 3 files</small>
            </label>
          )}
          {job.status === "Paid" && (
            <div className="review-action">
              {data?.ownReview ? (
                <p>
                  <Star size={15} />
                  Your review: {data.ownReview.stars}/5. It becomes public after
                  both people review or the 14-day window closes.
                </p>
              ) : data?.canReview ? (
                <button
                  className="button button-primary"
                  onClick={() => setReviewOpen(true)}
                >
                  <Star size={16} />
                  Review this booking
                </button>
              ) : (
                <p className="privacy-note">
                  The review window is closed or the booking is still being
                  confirmed.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {tab === "messages" && (
        <>
          <div className="booking-messages" aria-label="Booking messages">
            {!data?.messages.length && (
              <p className="privacy-note">
                Agree on pickup details here. Keep private documents and phone
                numbers out of public task descriptions.
              </p>
            )}
            {data?.messages.map((m) => (
              <article data-mine={m.mine} key={m.id}>
                <small>
                  {m.name} / {new Date(m.created_at).toLocaleString()}
                </small>
                <p>{m.body}</p>
              </article>
            ))}
          </div>
          <form className="message-form" onSubmit={send}>
            <label>
              Message your booking partner
              <textarea name="body" maxLength={2000} required rows={2} />
            </label>
            <button className="button button-primary" disabled={busy}>
              <MessageCircle size={16} />
              Send message
            </button>
          </form>
        </>
      )}
      {tab === "activity" && (
        <ol className="booking-timeline">
          {data?.events.map((e) => (
            <li key={e.id}>
              <strong>{e.label}</strong>
              <small>{new Date(e.created_at).toLocaleString()}</small>
            </li>
          ))}
          {!data?.events.length && (
            <p>No activity recorded since this feature was enabled.</p>
          )}
        </ol>
      )}
      {reviewOpen && (
        <ReviewDialog
          job={job}
          onClose={() => setReviewOpen(false)}
          onSaved={() => {
            setReviewOpen(false);
            void load().then(setData);
            onReviewed?.();
          }}
        />
      )}
    </section>
  );
}
function ReviewDialog({
  job,
  onClose,
  onSaved,
}: {
  job: Job;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [stars, setStars] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stars) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          requestId: job.id,
          stars,
          comment: String(form.get("comment") ?? ""),
        }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="request-dialog review-dialog"
      aria-labelledby="review-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="review-title">How did it go?</h2>
        <button
          type="button"
          className="button button-icon"
          aria-label="Close review"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p>{job.title}</p>
      <form onSubmit={submit}>
        <fieldset className="review-stars">
          <legend>Overall rating</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="stars"
                required
                value={n}
                checked={stars === n}
                onChange={() => setStars(n)}
              />
              <Star
                aria-hidden="true"
                fill={n <= stars ? "currentColor" : "none"}
              />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Your experience (optional)
          <textarea name="comment" maxLength={1000} rows={3} />
        </label>
        <p className="privacy-note">
          Testnet booking feedback. Reviews publish after both people respond or
          14 days after payout. Payment never depends on leaving a review.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy || !stars}>
          {busy ? "Saving..." : "Submit review"}
        </button>
        <button className="text-button" type="button" onClick={onClose}>
          Maybe later
        </button>
      </form>
    </dialog>
  );
}
