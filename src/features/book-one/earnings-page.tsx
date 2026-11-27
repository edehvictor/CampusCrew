"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import type { Job } from "./model";
import {
  paymentCsv,
  paymentRecords,
  paymentTotal,
  type PaymentRecord,
} from "@/features/book-one/services/payment-history";
import "./earnings.css";

const amount = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  }).format(value);
const receiptUrl = (hash: string) =>
  "https://stellar.expert/explorer/testnet/tx/" + hash;
const short = (hash: string) => hash.slice(0, 6) + "..." + hash.slice(-6);
const recorded = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function EarningsPage({ jobs }: { jobs: Job[] }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const records = paymentRecords(jobs);
  const earned = records.filter((r) => r.kind === "received");
  const held = records.filter((r) => r.kind === "escrow" && r.provider);
  const spent = records.filter((r) => r.kind === "sent");
  const query = search.trim().toLowerCase();
  const filtered = records.filter(
    (r) =>
      (filter === "all" || r.kind === filter) &&
      [r.title, r.person, r.category, r.receipt]
        .join(" ")
        .toLowerCase()
        .includes(query),
  );
  const selected = records.find((r) => r.id === selectedId);
  function download() {
    const url = URL.createObjectURL(
      new Blob([paymentCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "campuscrew-testnet-payments.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="earnings-page experience-page">
      <header className="money-page-heading">
        <div>
          <p className="discovery-eyebrow">Your work, accounted for</p>
          <h1>Earnings & payments</h1>
          <p>Every paid task. Every payment receipt.</p>
        </div>
        <span className="money-network">
          <span />
          Stellar Testnet <span className="sr-only">Test funds only</span>
        </span>
      </header>
      <div className="money-overview">
        <section className="money-earned" aria-label="Total earnings">
          <div className="money-card-top">
            <span className="money-icon">
              <ArrowDownLeft size={19} />
            </span>
            <span>Confirmed earnings</span>
          </div>
          <p className="money-amount">
            {amount(paymentTotal(earned))}
            <small>USDC</small>
          </p>
          <div className="money-earned-footer">
            <span>
              {earned.length} paid {earned.length === 1 ? "task" : "tasks"}
            </span>
            <ShieldCheck size={17} />
            <span>Receipt-backed</span>
          </div>
        </section>
        <section
          className="money-stat"
          aria-label="Expected earnings held in escrow"
        >
          <span className="money-stat-icon">
            <Wallet size={19} />
          </span>
          <h2>In escrow</h2>
          <p>
            {amount(paymentTotal(held))}
            <small>USDC</small>
          </p>
          <span>
            {held.length
              ? held.length +
                " " +
                (held.length === 1 ? "booking" : "bookings") +
                " awaiting settlement"
              : "No earnings held right now"}
          </span>
        </section>
        <section className="money-stat" aria-label="Payments made for tasks">
          <span className="money-stat-icon">
            <ArrowUpRight size={19} />
          </span>
          <h2>Paid for tasks</h2>
          <p>
            {amount(paymentTotal(spent))}
            <small>USDC</small>
          </p>
          <span>
            {spent.length} completed{" "}
            {spent.length === 1 ? "booking" : "bookings"}
          </span>
        </section>
      </div>
      <section
        className="payment-ledger"
        aria-labelledby="payment-history-title"
      >
        <header className="ledger-heading">
          <div>
            <h2 id="payment-history-title">
              Payment history <span>{records.length}</span>
            </h2>
            <p>Your CampusCrew payments, in one place.</p>
          </div>
          <button
            type="button"
            className="button button-secondary ledger-export"
            disabled={!filtered.length}
            onClick={download}
          >
            <Download size={15} />
            Export CSV
          </button>
        </header>
        <div className="ledger-toolbar">
          <div
            className="ledger-filters"
            role="group"
            aria-label="Filter payments"
          >
            {[
              ["all", "All activity"],
              ["received", "Received"],
              ["sent", "Paid"],
              ["escrow", "In escrow"],
              ["refund", "Refunds"],
            ].map(([id, label]) => (
              <button
                type="button"
                aria-pressed={filter === id}
                key={id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="ledger-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search payment history"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Task, name or receipt"
            />
          </label>
        </div>
        <div className="ledger-column-labels" aria-hidden="true">
          <span>Task / person</span>
          <span>Amount & status</span>
          <span>Receipt</span>
        </div>
        <div className="ledger-records">
          {filtered.map((r) => (
            <article className="ledger-row" key={r.id}>
              <button
                type="button"
                className="ledger-row-main"
                onClick={() => setSelectedId(r.id)}
                aria-label={
                  r.title +
                  ", " +
                  r.label +
                  ", " +
                  amount(r.amount) +
                  " USDC. View details"
                }
              >
                <span className="transfer-symbol" data-kind={r.kind}>
                  {r.kind === "escrow" ? (
                    <ShieldCheck size={19} />
                  ) : r.kind === "sent" ? (
                    <ArrowUpRight size={20} />
                  ) : (
                    <ArrowDownLeft size={20} />
                  )}
                </span>
                <span className="transfer-description">
                  <strong>{r.title}</strong>
                  <span>
                    {r.person} <span aria-hidden="true">/</span> {r.category}
                  </span>
                  {r.recordedAt && (
                    <small title="Date first recorded by CampusCrew. Older pilot bookings may show their migration date.">
                      Recorded {recorded(r.recordedAt)}
                    </small>
                  )}
                </span>
                <span className="transfer-value" data-kind={r.kind}>
                  <strong>
                    {r.kind === "received" || r.kind === "refund"
                      ? "+"
                      : r.kind === "sent"
                        ? "-"
                        : ""}
                    {amount(r.amount)}
                    <small> USDC</small>
                  </strong>
                  <span className="transfer-status" data-kind={r.kind}>
                    {r.kind !== "escrow" && <Check size={11} />}
                    {r.label}
                  </span>
                </span>
              </button>
              <a
                className="ledger-receipt"
                href={receiptUrl(r.receipt)}
                target="_blank"
                rel="noreferrer"
                aria-label={"Open verified receipt for " + r.title}
              >
                <ExternalLink size={15} />
                <span className="sr-only">Open receipt</span>
              </a>
            </article>
          ))}
          {!filtered.length && (
            <div className="ledger-empty">
              <span>
                <FileText size={28} strokeWidth={1.4} />
              </span>
              <h3>
                {records.length
                  ? "No matching payments"
                  : "Your first payment starts here"}
              </h3>
              <p>
                {records.length
                  ? "Try another name, task or payment filter."
                  : "After a booking is funded, its payment and receipt will appear here."}
              </p>
              {records.length ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link className="button button-secondary" href="/tasks">
                  Find your next task
                  <ChevronRight size={15} />
                </Link>
              )}
            </div>
          )}
        </div>
        <footer className="ledger-footer">
          <ShieldCheck size={14} />
          <p>
            Test funds only. Earnings show completed provider payouts, not your
            wallet balance. Each receipt opens on Stellar.
          </p>
        </footer>
      </section>
      {selected && (
        <PaymentReceipt
          key={selected.id}
          record={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function PaymentReceipt({
  record: r,
  onClose,
}: {
  record: PaymentRecord;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className="request-dialog payment-receipt-dialog"
      ref={ref}
      aria-labelledby="receipt-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="receipt-title">Payment details</h2>
        <button
          type="button"
          className="button button-icon"
          aria-label="Close payment details"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="receipt-amount">
        <span className="transfer-status" data-kind={r.kind}>
          {r.label}
        </span>
        <strong>
          {amount(r.amount)}
          <small>USDC</small>
        </strong>
        <span>Stellar Testnet</span>
      </div>
      <dl className="receipt-details">
        <div>
          <dt>Task</dt>
          <dd>{r.title}</dd>
        </div>
        <div>
          <dt>{r.provider ? "Task owner" : "Provider"}</dt>
          <dd>{r.person}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {r.kind === "escrow"
              ? "Secured in escrow"
              : r.kind === "refund"
                ? "Contribution returned"
                : "Confirmed payout"}
          </dd>
        </div>
        {r.recordedAt && (
          <div>
            <dt>Recorded by CampusCrew</dt>
            <dd>{new Date(r.recordedAt).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Receipt</dt>
          <dd>
            <code>{short(r.receipt)}</code>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(r.receipt)
                  .then(() => {
                    setCopied(true);
                    setCopyError(false);
                  })
                  .catch(() => setCopyError(true));
              }}
              aria-label="Copy transaction hash"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </dd>
        </div>
      </dl>
      {copied && (
        <p role="status" className="privacy-note">
          Transaction hash copied.
        </p>
      )}
      {copyError && (
        <label className="receipt-copy-fallback">
          Select the receipt to copy
          <input
            readOnly
            value={r.receipt}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      <a
        href={receiptUrl(r.receipt)}
        className="button button-primary"
        target="_blank"
        rel="noreferrer"
      >
        View on Stellar
        <ExternalLink size={15} />
      </a>
      <Link
        href={"/me/bookings/" + r.id}
        className="button button-secondary"
        onClick={onClose}
      >
        Open booking
        <ChevronRight size={15} />
      </Link>
    </dialog>
  );
}
