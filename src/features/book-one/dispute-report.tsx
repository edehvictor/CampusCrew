"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { disputeReasons } from "./types/disputes";
import { clientApi } from "./services/client-api";
import "./disputes.css";

export function DisputeReportButton({
  id,
  disabled,
  onPause,
}: {
  id: string;
  disabled: boolean;
  onPause: () => void;
}) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  async function report(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await clientApi("/api/disputes", {
        action: "report",
        requestId: id,
        reason: data.get("reason"),
        summary: data.get("summary"),
      });
      ref.current?.close();
      setOpen(false);
      onPause();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button
        className="button button-secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Report a problem
      </button>
      <dialog
        ref={ref}
        className="request-dialog"
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setOpen(false);
        }}
        aria-labelledby={"report-title-" + id}
      >
        <header>
          <h2 id={"report-title-" + id}>Tell us what happened</h2>
          <button
            type="button"
            className="button button-icon"
            aria-label="Close report"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </header>
        <form
          onSubmit={report}
          style={{ padding: 24, display: "grid", gap: 16 }}
        >
          <p>
            Saving the report creates a case. Your wallet must then approve the
            dispute transaction to pause payout.
          </p>
          <label>
            Problem
            <select name="reason" required>
              {disputeReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            What happened?
            <textarea
              name="summary"
              required
              minLength={20}
              maxLength={2000}
              rows={5}
              placeholder="Explain what was agreed, what happened, and the outcome you are asking for."
            />
          </label>
          <p>
            Your report and booking evidence will be shared with the other party
            and the configured resolver.
          </p>
          {error && <p role="alert">{error}</p>}
          <button className="button button-primary" disabled={saving}>
            {saving ? "Saving report…" : "Save report & open wallet"}
          </button>
        </form>
      </dialog>
    </>
  );
}
