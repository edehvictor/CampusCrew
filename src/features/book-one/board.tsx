"use client";

import { CheckCircle2, ClipboardList } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MarketplaceShell } from "@/components/marketplace-shell";
import { areas, categories, isInView, type Job, type Quote, type Status, type View } from "./model";
import { pilotAreas, type EntryIntent, type PaymentOperation, type PilotArea, type PilotMutation } from "./pilot-types";
import { RequestDetail } from "./request-detail";
import { RequestDialog, type DialogKind } from "./request-dialog";
import { emptyFilters, RequestList } from "./request-list";
import { useDemoRequests } from "./use-demo-requests";
import "./book-one.css";

const viewCopy: Record<View, { title: string; introduction: string }> = {
  "Browse tasks": { title: "Campus tasks", introduction: "Book local services on your own or with neighbours and pay with G$." },
  "Posted tasks": { title: "Posted tasks", introduction: "Review applications and choose a provider for your task." },
  "Sent applications": { title: "Sent applications", introduction: "Track the tasks you’ve applied for." },
  Bookings: { title: "Bookings", introduction: "Track funding, completion, and payouts for your bookings." },
};

export type LiveBoardActions = {
  jobs: Job[];
  accountControl: ReactNode;
  banner: ReactNode;
  paymentsEnabled: boolean;
  prepare: (intent: EntryIntent) => boolean;
  resume: EntryIntent | null;
  onResumed: () => void;
  mutate: (mutation: PilotMutation) => Promise<{ requestId?: string }>;
  pay: (requestId: string, operation: PaymentOperation) => Promise<void>;
};

export function BookOneBoard({ live }: { live?: LiveBoardActions }) {
  const demo = useDemoRequests(!live);
  const jobs = live?.jobs ?? demo.jobs;
  const serviceAreas = live ? pilotAreas : areas;
  const [view, setView] = useState<View>("Browse tasks");
  const [selectedId, setSelectedId] = useState("cleaning");
  const [filters, setFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const writeInProgress = useRef(false);
  const draftId = useRef<string | null>(null);

  useEffect(() => {
    if (!live?.resume) return;
    const intent = live.resume;
    const frame = requestAnimationFrame(() => {
      if (intent.kind === "quote") {
        setFilters(emptyFilters);
        setSelectedId(intent.requestId);
        setView("Browse tasks");
        setMobileDetails(true);
      }
      if (intent.kind === "post" || live.jobs.some(job => job.id === intent.requestId && job.status === "Open")) {
        draftId.current = crypto.randomUUID();
        setDialog(intent.kind);
      } else {
        setError("This task is no longer accepting applications.");
      }
      live.onResumed();
    });
    return () => cancelAnimationFrame(frame);
  }, [live]);

  const search = filters.search.trim().toLowerCase();
  const matches = jobs.filter(job =>
    isInView(job, view) &&
    (!filters.category || job.category === filters.category) &&
    (!filters.area || job.area === filters.area) &&
    [job.title, job.scope, job.category].join(" ").toLowerCase().includes(search),
  );
  const selected = matches.find(job => job.id === selectedId) ?? matches[0];

  function navigate(next: View, jobId?: string) {
    setView(next);
    setFilters(emptyFilters);
    setMobileDetails(Boolean(jobId));
    setNotice("");
    setError("");
    if (jobId) setSelectedId(jobId);
  }

  function select(job: Job) {
    setSelectedId(job.id);
    setMobileDetails(true);
    setNotice("");
    setError("");
    requestAnimationFrame(() => {
      const back = boardRef.current?.querySelector<HTMLButtonElement>(".back-button");
      if (back?.getClientRects().length) back.focus();
    });
  }

  function returnToList() {
    setMobileDetails(false);
    requestAnimationFrame(() => {
      boardRef.current?.querySelector<HTMLButtonElement>('.request-item[aria-pressed="true"]')?.focus();
    });
  }

  function openDialog(kind: DialogKind, requestId?: string) {
    setError("");
    if (live && kind === "post" && !live.prepare({ kind })) return;
    if (live && kind === "quote" && (!requestId || !live.prepare({ kind, requestId }))) return;
    draftId.current = crypto.randomUUID();
    setDialog(kind);
  }

  async function run(work: () => Promise<void>) {
    if (writeInProgress.current) return;
    writeInProgress.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campuscrew could not complete that action.");
    } finally {
      writeInProgress.current = false;
      setBusy(false);
    }
  }

  function updateJob(id: string, update: (job: Job) => Job) {
    demo.updateRequests(current => current.map(job => job.id === id ? update(job) : job));
  }

  function acceptQuote(job: Job, quote: Quote) {
    void run(async () => {
      if (live) await live.mutate({ action: "select", requestId: job.id, applicationId: quote.id });
      else updateJob(job.id, current => current.own && current.status === "Open" && current.quotes.some(item => item.id === quote.id)
        ? { ...current, accepted: quote.id, status: "Awaiting funding" }
        : current);
      navigate("Bookings", job.id);
      setNotice("Provider selected. Review the booking before funding.");
    });
  }

  function changeDemoStatus(job: Job, from: Status, to: Status, message: string) {
    updateJob(job.id, current => current.status === from ? { ...current, status: to } : current);
    setNotice(message);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const amount = Number(field("amount"));
    if (dialog !== "complete" && (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000)) return;

    void run(async () => {
      if (dialog === "post") {
        const title = field("title");
        const scope = field("scope");
        const timing = field("timing");
        const category = categories.find(item => item === field("category"));
        const area = serviceAreas.find(item => item === field("area"));
        if (!title || !scope || !timing || !category || !area) throw new Error("Fill in the task details.");
        const id = draftId.current ?? crypto.randomUUID();
        if (live) {
          await live.mutate({ action: "post", requestId: id, title, scope, timing, category, area: area as PilotArea, budget: amount });
        } else {
          const job: Job = { id, title, scope, category, area, timing, budget: amount, customer: "You", own: true, quotes: [], status: "Open" };
          demo.updateRequests(current => [job, ...current]);
        }
        navigate("Posted tasks", id);
        setNotice(live ? "Task posted." : "Task posted in this demo.");
      } else if (dialog === "quote" && selected) {
        const availability = field("availability");
        const note = field("note");
        if (!availability || !note) throw new Error("Add your availability and what you can do.");
        if (live) {
          await live.mutate({ action: "apply", requestId: selected.id, amount, availability, note });
        } else {
          const quote: Quote = { id: crypto.randomUUID(), provider: "You", amount, availability, note, own: true };
          updateJob(selected.id, current => current.status === "Open" && !current.own && !current.quotes.some(item => item.own)
            ? { ...current, quotes: [...current.quotes, quote] }
            : current);
        }
        navigate("Sent applications", selected.id);
        setNotice(live ? "Application sent." : "Application sent in this demo.");
      } else if (dialog === "complete" && selected) {
        const note = field("note");
        if (!note) throw new Error("Add your completion note.");
        if (live) await live.mutate({ action: "complete", requestId: selected.id, note });
        else updateJob(selected.id, current => current.status === "Funded"
          ? { ...current, completion: note, status: "Ready for review" }
          : current);
        setNotice("Completion submitted for review.");
      }
      setDialog(null);
    });
  }

  function dismissDialog() {
    if (!writeInProgress.current) {
      setError("");
      setDialog(null);
    }
  }

  return (
    <MarketplaceShell view={view} onNavigate={navigate} onPost={() => openDialog("post")} accountControl={live?.accountControl}>
      <div className="book-one">
        <header className="board-intro">
          <div>
            {live && <p className="pilot-campus">UNN · Nsukka</p>}
            <h1>{viewCopy[view].title}</h1>
            <p>{viewCopy[view].introduction}</p>
          </div>
        </header>
        {live?.banner}
        <div className="board-notice" role="status">
          {notice && <><CheckCircle2 size={17} aria-hidden="true" /> {notice}</>}
        </div>
        {!dialog && error && <p className="form-error board-error" role="alert">{error}</p>}
        <div className="booking-board" data-show-details={Boolean(mobileDetails && selected)} ref={boardRef}>
          <RequestList view={view} areas={serviceAreas} filters={filters} onFilter={setFilters} jobs={matches} selectedId={selected?.id} onSelect={select} />
          {selected ? (
            <RequestDetail
              job={selected}
              onBack={returnToList}
              onAccept={quote => acceptQuote(selected, quote)}
              onQuote={() => openDialog("quote", selected.id)}
              onComplete={() => openDialog("complete")}
              onChangeStatus={(from, to, message) => changeDemoStatus(selected, from, to, message)}
              busy={busy}
              payment={live ? {
                enabled: live.paymentsEnabled,
                submit: operation => { void run(async () => { await live.pay(selected.id, operation); setNotice("G$ booking status refreshed."); }); },
              } : undefined}
            />
          ) : (
            <div className="request-detail-empty">
              <ClipboardList size={26} aria-hidden="true" />
              <p>Choose a task to see its details.</p>
            </div>
          )}
        </div>
      </div>
      {dialog && <RequestDialog key={dialog} kind={dialog} areas={serviceAreas} demo={!live} busy={busy} error={error} onDismiss={dismissDialog} onSubmit={submit} />}
    </MarketplaceShell>
  );
}
