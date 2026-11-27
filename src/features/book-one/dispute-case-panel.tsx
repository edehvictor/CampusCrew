"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Paperclip } from "lucide-react";
import type { DisputeCase } from "./types/disputes";
import type { Job } from "./model";
import { clientApi } from "./services/client-api";
import "./disputes.css";
export function DisputeCasePanel({ job }: { job: Job }) {
  const [data, setData] = useState<DisputeCase | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const load = () =>
    clientApi<DisputeCase | null>("/api/disputes?id=" + job.id);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const d = await clientApi<DisputeCase | null>(
          "/api/disputes?id=" + job.id,
        );
        if (active) {
          setData(d);
          setLoaded(true);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Case unavailable.");
      }
    };
    void tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job.id]);
  async function statement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      body = String(new FormData(form).get("body"));
    setBusy(true);
    setError("");
    try {
      await clientApi("/api/disputes", {
        action: "statement",
        requestId: job.id,
        body,
        clientId: crypto.randomUUID(),
      });
      form.reset();
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Statement not saved.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const r = await fetch("/api/evidence?booking=" + job.id, {
        method: "POST",
        body,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dispute-case-panel">
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>
          {loaded
            ? "No dispute report for this booking. Use Report a problem in the payment section when needed."
            : "Loading case…"}
        </p>
      ) : (
        <>
          <h4>{data.reason}</h4>
          <p>{data.summary}</p>
          <p>
            <strong>
              {data.state === "Disputed"
                ? "Payout is paused on Stellar."
                : data.status === "awaiting_pause"
                  ? "Report saved. Payout is NOT paused yet: approve the Report a problem transaction in your wallet."
                  : "The payment has been settled."}
            </strong>
          </p>
          <h4>Both sides of the case</h4>
          {!data.statements.length && (
            <p>Add your explanation so the resolver can hear both sides.</p>
          )}
          {data.statements.map((s) => (
            <article key={s.id}>
              <strong>{s.role}</strong>
              <p>{s.body}</p>
              <small>{new Date(s.createdAt).toLocaleString()}</small>
            </article>
          ))}
          {data.status !== "settled" && (
            <form onSubmit={statement}>
              <label>
                Your statement
                <textarea name="body" required maxLength={2000} rows={4} />
              </label>
              <button className="button button-secondary" disabled={busy}>
                Add statement
              </button>
            </form>
          )}
          <h4>Case evidence</h4>
          <p>
            Private to the booking participants and the authorized resolver. Up
            to three files per person.
          </p>
          {data.evidence.map((f) => (
            <p key={f.id}>
              <a
                href={"/api/evidence?id=" + f.id}
                target="_blank"
                rel="noreferrer"
              >
                {f.name}
              </a>
            </p>
          ))}
          {data.state === "Disputed" && (
            <label>
              <Paperclip size={14} /> Add photo or document
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {data.decisions.map((d) => (
            <article key={d.id}>
              <h4>Resolver decision</h4>
              <p>{d.rationale}</p>
              <p>
                Provider award: {d.amount} test USDC. Owner refund:{" "}
                {data.refund} test USDC.
              </p>
              <a
                href={"https://stellar.expert/explorer/testnet/tx/" + d.hash}
                target="_blank"
                rel="noreferrer"
              >
                Confirmed settlement receipt
              </a>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
