"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { AdminLogin } from "./admin-login";
import { useResolverSession } from "./hooks/use-resolver-session";
import { clientApi } from "./services/client-api";
import { awardUnits } from "./services/dispute-amount";
import { getStellarWallet } from "./auth/pilot-wallet";
import { signPreparedWalletTransaction } from "./auth/wallet-signing";
import type { DisputeCase, PreparedDecision } from "./types/disputes";
import "./admin-disputes.css";

type QueueItem = {
  id: string;
  title: string;
  reason: string;
  amount: number;
  state: string;
  status: string;
  createdAt: string;
};
const short = (address: string) =>
  address.slice(0, 7) + "…" + address.slice(-6);
const date = (value: string) => new Date(value).toLocaleString();
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 7 }).format(value);
const receipt = (hash: string) =>
  "https://stellar.expert/explorer/testnet/tx/" + hash;
const label = (status: string) =>
  ({
    open: "Open",
    reviewing: "In review",
    settled: "Settled",
    awaiting_pause: "Awaiting wallet pause",
  })[status] ?? status;

export function AdminDisputes() {
  const auth = useResolverSession(),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [selected, setSelected] = useState<string>(),
    [detail, setDetail] = useState<DisputeCase | null>(null);
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const working = useRef(false);
  async function load() {
    const list = await clientApi<QueueItem[]>("/api/admin/disputes");
    setQueue(list);
    if (selected)
      setDetail(
        await clientApi<DisputeCase>("/api/admin/disputes?id=" + selected),
      );
    else if (list[0]) setSelected(list[0].id);
  }
  useEffect(() => {
    if (!auth.session?.allowed) return;
    let active = true,
      inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const list = await clientApi<QueueItem[]>("/api/admin/disputes");
        const next = selected
          ? await clientApi<DisputeCase>("/api/admin/disputes?id=" + selected)
          : null;
        if (active) {
          setQueue(list);
          setDetail(next);
          setError("");
          if (!selected && list[0]) setSelected(list[0].id);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Case updates are delayed.",
          );
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auth.session?.allowed, auth.session?.wallet, selected]);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action could not finish. Check its status before retrying.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const allowed = auth.session?.allowed;
  const activeCase = detail?.id === selected ? detail : null;
  const items = queue.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      [c.title, c.reason, c.id]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main className="admin-disputes">
      <header className="admin-topbar">
        <Link href="/" className="admin-brand">
          <Image src="/icon.svg" width={33} height={33} alt="" />
          <strong>Campuscrew</strong>
          <span>Resolution desk</span>
        </Link>
        <nav aria-label="Admin navigation">
          <Link href="/">
            <ArrowLeft size={15} /> Marketplace
          </Link>
          {allowed && (
            <button
              type="button"
              className="button button-secondary"
              disabled={auth.busy}
              onClick={() => void auth.signOut()}
            >
              <LogOut size={15} /> Log out
            </button>
          )}
        </nav>
      </header>
      {!allowed ? (
        <AdminLogin auth={auth} />
      ) : (
        <>
          <section className="admin-intro">
            <div>
              <p className="admin-eyebrow">Operations / Disputes</p>
              <h1>Resolution desk</h1>
              <p>
                The agreement, the evidence, and a decision everyone can trace.
              </p>
            </div>
            <span className="admin-network">
              <ShieldCheck size={15} /> Resolver ·{" "}
              {short(auth.session!.wallet!)} · Testnet
            </span>
          </section>
          <div className="admin-overview">
            {[
              ["Open cases", queue.filter((c) => c.status === "open").length],
              [
                "In review",
                queue.filter((c) => c.status === "reviewing").length,
              ],
              ["Settled", queue.filter((c) => c.status === "settled").length],
            ].map(([title, value]) => (
              <section key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="admin-notice" role="status">
              {notice}
            </p>
          )}
          <div className="admin-workspace">
            <aside className="admin-queue">
              <div className="admin-queue-heading">
                <h2>Case inbox</h2>
                <button
                  className="button button-icon"
                  aria-label="Refresh cases"
                  disabled={busy}
                  onClick={() => void run(async () => {})}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <label className="admin-search">
                <Search size={16} />
                <input
                  aria-label="Search cases"
                  placeholder="Task, reason or case ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="admin-filter">
                Status
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    "all",
                    "open",
                    "reviewing",
                    "awaiting_pause",
                    "settled",
                  ].map((s) => (
                    <option value={s} key={s}>
                      {s === "all" ? "All cases" : label(s)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-case-list">
                {items.map((c) => (
                  <button
                    key={c.id}
                    className="admin-case-row"
                    aria-pressed={selected === c.id}
                    onClick={() => setSelected(c.id)}
                  >
                    <span className="admin-case-status" data-status={c.status}>
                      {label(c.status)}
                    </span>
                    <strong>{c.title}</strong>
                    <span>{c.reason}</span>
                    <small>
                      {money(c.amount)} test USDC ·{" "}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
                {!items.length && (
                  <div className="admin-empty">
                    <Scale size={30} />
                    <h3>No cases here</h3>
                    <p>
                      Dispute reports appear here when participants report a
                      problem.
                    </p>
                  </div>
                )}
              </div>
              <small className="admin-queue-foot">
                Latest 50 cases. Updates every 10 seconds while visible.
              </small>
            </aside>
            <section
              className="admin-case-detail"
              aria-label="Selected dispute"
            >
              {!activeCase ? (
                <div className="admin-empty">
                  <FileText size={36} />
                  <h2>
                    {selected ? "Loading case…" : "A clear view of every case"}
                  </h2>
                  <p>
                    Select a case to review the agreement and both sides of the
                    story.
                  </p>
                </div>
              ) : (
                <>
                  <div className="admin-detail-heading">
                    <div>
                      <span
                        className="admin-case-status"
                        data-status={activeCase.status}
                      >
                        {label(activeCase.status)}
                      </span>
                      <h2>{activeCase.title}</h2>
                      <small>
                        Case {activeCase.id} · {date(activeCase.createdAt)}
                      </small>
                    </div>
                    {activeCase.state === "Disputed" &&
                      activeCase.status !== "reviewing" && (
                        <button
                          className="button button-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await clientApi("/api/admin/disputes", {
                                action: "review",
                                requestId: activeCase.id,
                              });
                            })
                          }
                        >
                          Start review
                        </button>
                      )}
                  </div>
                  <div className="admin-people">
                    <div>
                      <span>Task owner</span>
                      <strong>{activeCase.owner}</strong>
                      <code>{short(activeCase.ownerWallet)}</code>
                    </div>
                    <div>
                      <span>Provider</span>
                      <strong>{activeCase.provider}</strong>
                      <code>{short(activeCase.providerWallet)}</code>
                    </div>
                    <div>
                      <span>Funded deposit</span>
                      <strong>{money(activeCase.funded)} USDC</strong>
                      <small>
                        {activeCase.state === "Disputed"
                          ? "Payout paused on-chain"
                          : activeCase.state}
                      </small>
                    </div>
                  </div>
                  {activeCase.status === "awaiting_pause" && (
                    <p className="admin-warning">
                      A report was saved, but the dispute transaction has not
                      confirmed. Payout is not paused. You cannot settle this
                      case yet.
                    </p>
                  )}
                  <section className="admin-section">
                    <h3>The agreement</h3>
                    <p>{activeCase.scope}</p>
                    {activeCase.completion && (
                      <>
                        <h4>Provider completion note</h4>
                        <p>{activeCase.completion}</p>
                      </>
                    )}
                  </section>
                  <section className="admin-section">
                    <h3>{activeCase.reason}</h3>
                    <p>{activeCase.summary}</p>
                    <h4>Case statements</h4>
                    {!activeCase.statements.length && (
                      <p>
                        No additional statements yet. Ask both parties to
                        explain their position before deciding.
                      </p>
                    )}
                    {activeCase.statements.map((s) => (
                      <article className="admin-statement" key={s.id}>
                        <strong>{s.role}</strong>
                        <p>{s.body}</p>
                        <small>{date(s.createdAt)}</small>
                      </article>
                    ))}
                    {activeCase.state === "Disputed" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget,
                            body = String(new FormData(form).get("body"));
                          void run(async () => {
                            await clientApi("/api/admin/disputes", {
                              action: "statement",
                              requestId: activeCase.id,
                              body,
                              clientId: crypto.randomUUID(),
                            });
                            form.reset();
                          });
                        }}
                      >
                        <label>
                          Ask for clarification or share a case update
                          <textarea
                            name="body"
                            required
                            maxLength={2000}
                            rows={3}
                          />
                        </label>
                        <small>Visible to both parties.</small>
                        <button
                          className="button button-secondary"
                          disabled={busy}
                        >
                          Send case update
                        </button>
                      </form>
                    )}
                  </section>
                  <section className="admin-section">
                    <h3>Evidence</h3>
                    {activeCase.evidence.length ? (
                      activeCase.evidence.map((f) => (
                        <a
                          className="admin-file"
                          href={"/api/evidence?id=" + f.id}
                          target="_blank"
                          rel="noreferrer"
                          key={f.id}
                        >
                          <FileText size={16} />
                          {f.name}
                          <ExternalLink size={13} />
                        </a>
                      ))
                    ) : (
                      <p>No evidence files have been uploaded.</p>
                    )}
                  </section>
                  <details className="admin-section">
                    <summary>
                      Booking messages ({activeCase.messages.length})
                    </summary>
                    {activeCase.messages.map((m) => (
                      <article className="admin-statement" key={m.id}>
                        <strong>{m.role}</strong>
                        <p>{m.body}</p>
                        <small>{date(m.createdAt)}</small>
                      </article>
                    ))}
                  </details>
                  {activeCase.state === "Disputed" && (
                    <DecisionForm
                      key={activeCase.id}
                      dispute={activeCase}
                      wallet={auth.session!.wallet!}
                      busy={busy}
                      run={run}
                      onSubmitted={() =>
                        setNotice(
                          "Decision submitted. Settlement is final only after Stellar confirms it.",
                        )
                      }
                    />
                  )}
                  <section className="admin-section">
                    <h3>Decision history</h3>
                    {!activeCase.decisions.length && (
                      <p>No dashboard decisions recorded.</p>
                    )}
                    {activeCase.decisions.map((d) => (
                      <article className="admin-statement" key={d.id}>
                        <strong>
                          {d.status === "confirmed"
                            ? "Confirmed settlement"
                            : d.status}
                        </strong>
                        <p>{d.rationale}</p>
                        <p>
                          Provider: {d.amount} USDC · Owner refund:{" "}
                          {money(activeCase.funded - Number(d.amount))} USDC
                        </p>
                        {d.status === "prepared" &&
                          d.canResume &&
                          activeCase.state === "Disputed" && (
                            <button
                              className="button button-secondary"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const p = await clientApi<PreparedDecision>(
                                    "/api/admin/disputes",
                                    { action: "resume", intentId: d.id },
                                  );
                                  const signed =
                                    await signPreparedWalletTransaction(
                                      getStellarWallet(),
                                      p,
                                      auth.session!.wallet!,
                                    );
                                  await clientApi("/api/admin/disputes", {
                                    action: "submit",
                                    intentId: p.intentId,
                                    xdr: signed.signedTxXdr,
                                  });
                                })
                              }
                            >
                              Resume & sign this decision
                            </button>
                          )}
                        {d.status === "submitted" && (
                          <button
                            className="button button-secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await clientApi("/api/admin/disputes", {
                                  action: "sync",
                                  intentId: d.id,
                                });
                              })
                            }
                          >
                            Check confirmation
                          </button>
                        )}
                        {d.status === "confirmed" && (
                          <a
                            href={receipt(d.hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View settlement receipt <ExternalLink size={12} />
                          </a>
                        )}
                      </article>
                    ))}
                  </section>
                  <details className="admin-section">
                    <summary>Case & booking timeline</summary>
                    {activeCase.events.map((e) => (
                      <article className="admin-statement" key={e.id}>
                        <p>{e.label}</p>
                        <small>{date(e.created_at)}</small>
                      </article>
                    ))}
                  </details>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function DecisionForm({
  dispute,
  wallet,
  busy,
  run,
  onSubmitted,
}: {
  dispute: DisputeCase;
  wallet: string;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onSubmitted: () => void;
}) {
  const [amount, setAmount] = useState(""),
    [rationale, setRationale] = useState(""),
    [preview, setPreview] = useState<PreparedDecision | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) ref.current?.showModal();
    else ref.current?.close();
  }, [preview]);
  let units: bigint | null = null;
  try {
    units = awardUnits(amount, BigInt(Math.round(dispute.funded * 10_000_000)));
  } catch {}
  const valid = units !== null && rationale.trim().length >= 20;
  async function prepare(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      setPreview(
        await clientApi<PreparedDecision>("/api/admin/disputes", {
          action: "prepare",
          requestId: dispute.id,
          amount,
          rationale: rationale.trim(),
        }),
      );
    });
  }
  async function approve() {
    if (!preview) return;
    const p = preview;
    ref.current?.close();
    setPreview(null);
    await run(async () => {
      const signed = await signPreparedWalletTransaction(
        getStellarWallet(),
        p,
        wallet,
      );
      await clientApi("/api/admin/disputes", {
        action: "submit",
        intentId: p.intentId,
        xdr: signed.signedTxXdr,
      });
      onSubmitted();
    });
  }
  return (
    <section className="admin-section admin-decision">
      <h3>Your decision</h3>
      <p>
        Hear both parties and explain the award. The remainder will be available
        for the owner to reclaim.
      </p>
      <form onSubmit={prepare}>
        <label>
          Provider award (test USDC)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            maxLength={24}
          />
        </label>
        <label>
          Decision explanation
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            rows={4}
            placeholder="What was agreed? What does the evidence show? Why is this award fair?"
          />
        </label>
        <div className="admin-split">
          <div>
            <span>Provider receives</span>
            <strong>
              {units === null ? "—" : money(Number(units) / 10_000_000)} USDC
            </strong>
          </div>
          <div>
            <span>Owner can reclaim</span>
            <strong>
              {units === null
                ? "—"
                : money(dispute.funded - Number(units) / 10_000_000)}{" "}
              USDC
            </strong>
          </div>
        </div>
        <p className="admin-warning">
          Once confirmed, this settlement cannot be reversed through the
          contract. Saving or signing a proposal does not itself confirm
          payment.
        </p>
        <button className="button button-primary" disabled={busy || !valid}>
          <Scale size={16} /> Review settlement
        </button>
      </form>
      <dialog
        className="admin-confirm"
        ref={ref}
        aria-labelledby="confirm-decision"
        onCancel={() => setPreview(null)}
      >
        <header>
          <h2 id="confirm-decision">Confirm this settlement</h2>
          <button
            className="button button-icon"
            type="button"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
          >
            <X size={18} />
          </button>
        </header>
        <p>{dispute.title}</p>
        <p>
          Provider: <strong>{amount} USDC</strong>
        </p>
        <p>
          Owner refund:{" "}
          <strong>
            {units === null
              ? "—"
              : money(dispute.funded - Number(units) / 10_000_000)}{" "}
            USDC
          </strong>
        </p>
        <blockquote>{rationale}</blockquote>
        <p>
          Stellar Testnet · A wallet signature is required. The confirmed
          decision is final.
        </p>
        <button
          className="button button-primary"
          disabled={busy || !preview}
          onClick={() => void approve()}
        >
          Open wallet & approve decision
        </button>
      </dialog>
    </section>
  );
}
