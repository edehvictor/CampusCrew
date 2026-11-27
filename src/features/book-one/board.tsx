"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pageFromPath, pageHref, routeId } from "./navigation";
import { ExperiencePage } from "./experience-pages";
import type { ActivityNotification } from "@/features/book-one/types/experience";
import "./experience.css";
import { CheckCircle2, ClipboardList } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MarketplaceShell } from "@/components/marketplace-shell";
import {
  categories,
  isInView,
  type Job,
  type Quote,
  type View,
  type Page,
} from "./model";
import {
  pilotAreas,
  type EntryIntent,
  type PaymentOperation,
  type PilotMutation,
} from "@/features/book-one/types/pilot";
import { RequestDetail } from "./request-detail";
import { RequestDialog, type DialogKind } from "./request-dialog";
import { emptyFilters, RequestList } from "./request-list";
import { CampusSelector } from "./campus-selector";
import { Home, ExploreCampuses } from "./discovery-pages";
import "./book-one.css";
import "./pilot.css";

const viewCopy: Record<View, { title: string; introduction: string }> = {
  "Browse tasks": {
    title: "Campus tasks",
    introduction:
      "Book local services on your own or with neighbours. Built on Stellar.",
  },
  "Posted tasks": {
    title: "Posted tasks",
    introduction: "Review applications and choose a provider for your task.",
  },
  "Sent applications": {
    title: "Sent applications",
    introduction: "Track the tasks you’ve applied for.",
  },
  Bookings: {
    title: "Bookings",
    introduction: "Track funding, completion, and payouts for your bookings.",
  },
};

export type LiveBoardActions = {
  jobs: Job[];
  sessionReady: boolean;
  wallet?: string;
  notifications: ActivityNotification[];
  experienceReady: boolean;
  signIn: () => void;
  editProfile: () => void;
  accountControl: ReactNode;
  logout?: { run: () => void; pending: boolean };
  banner: ReactNode;
  paymentsEnabled: boolean;
  prepare: (intent: EntryIntent) => boolean;
  resume: EntryIntent | null;
  onResumed: () => void;
  mutate: (mutation: PilotMutation) => Promise<{ requestId?: string }>;
  pay: (
    requestId: string,
    operation: PaymentOperation,
    note?: string,
  ) => Promise<string>;
};

export function BookOneBoard({ live }: { live: LiveBoardActions }) {
  const { jobs } = live;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = pageFromPath(pathname);
  const view: View = [
    "Browse tasks",
    "Posted tasks",
    "Sent applications",
    "Bookings",
  ].includes(page)
    ? (page as View)
    : "Browse tasks";
  const selectedId = routeId(pathname);
  const statusFilter = params.get("status") ?? "all";
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
    if (!live.resume) return;
    const intent = live.resume;
    const frame = requestAnimationFrame(() => {
      if (intent.kind === "quote") {
        setFilters(emptyFilters);
        router.push(pageHref("Browse tasks", intent.requestId));
        setMobileDetails(true);
      }
      if (
        intent.kind === "post" ||
        live.jobs.some(
          (job) => job.id === intent.requestId && job.status === "Open",
        )
      ) {
        draftId.current = crypto.randomUUID();
        setDialog(intent.kind);
      } else {
        setError("This task is no longer accepting applications.");
      }
      live.onResumed();
    });
    return () => cancelAnimationFrame(frame);
  }, [live, router]);

  const search = filters.search.trim().toLowerCase();
  const matches = jobs.filter(
    (job) =>
      isInView(job, view) &&
      (view !== "Bookings" ||
        statusFilter === "all" ||
        (statusFilter === "completed"
          ? job.status === "Paid"
          : statusFilter === "closed"
            ? ["Cancelled", "Refunded", "Refund available"].includes(job.status)
            : !["Paid", "Cancelled", "Refunded", "Refund available"].includes(
                job.status,
              ))) &&
      (view !== "Sent applications" ||
        statusFilter === "all" ||
        (statusFilter === "selected"
          ? job.quotes.some((q) => q.own && q.id === job.accepted)
          : statusFilter === "pending"
            ? job.status === "Open"
            : Boolean(
                job.status !== "Open" &&
                  !job.quotes.some((q) => q.own && q.id === job.accepted),
              ))) &&
      (!filters.category || job.category === filters.category) &&
      (!filters.area || job.area === filters.area) &&
      [job.title, job.scope, job.category]
        .join(" ")
        .toLowerCase()
        .includes(search),
  );
  const selected = selectedId
    ? matches.find((job) => job.id === selectedId)
    : matches[0];

  function navigate(next: Page, jobId?: string) {
    router.push(pageHref(next, jobId));
    setFilters(emptyFilters);
    setMobileDetails(Boolean(jobId));
    setNotice("");
    setError("");
  }

  function select(job: Job) {
    router.push(
      pageHref(page, job.id) +
        (statusFilter !== "all" ? "?status=" + statusFilter : ""),
    );
    setMobileDetails(true);
    setNotice("");
    setError("");
    requestAnimationFrame(() => {
      const back =
        boardRef.current?.querySelector<HTMLButtonElement>(".back-button");
      if (back?.getClientRects().length) back.focus();
    });
  }

  function returnToList() {
    router.push(
      pageHref(page) +
        (statusFilter !== "all" ? "?status=" + statusFilter : ""),
    );
    setMobileDetails(false);
    requestAnimationFrame(() => {
      boardRef.current
        ?.querySelector<HTMLButtonElement>('.request-item[aria-pressed="true"]')
        ?.focus();
    });
  }

  function openDialog(kind: DialogKind, requestId?: string) {
    setError("");
    if (kind === "post" && !live.prepare({ kind })) return;
    if (kind === "quote" && (!requestId || !live.prepare({ kind, requestId })))
      return;
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Campuscrew could not complete that action.",
      );
    } finally {
      writeInProgress.current = false;
      setBusy(false);
    }
  }

  function acceptQuote(job: Job, quote: Quote) {
    void run(async () => {
      await live.mutate({
        action: "select",
        requestId: job.id,
        applicationId: quote.id,
      });
      navigate("Bookings", job.id);
      setNotice("Provider selected. Review the booking before funding.");
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const amount = Number(field("amount"));
    if (
      dialog !== "complete" &&
      (!Number.isFinite(amount) || amount < 0.01 || amount > 1000000)
    )
      return;

    void run(async () => {
      if (dialog === "post") {
        const title = field("title");
        const scope = field("scope");
        const timing = field("timing");
        const category = categories.find((item) => item === field("category"));
        const area = pilotAreas.find((item) => item === field("area"));
        if (!title || !scope || !timing || !category || !area)
          throw new Error("Fill in the task details.");
        const id = draftId.current ?? crypto.randomUUID();
        await live.mutate({
          action: "post",
          requestId: id,
          title,
          scope,
          timing,
          category,
          area,
          budget: amount,
          evidenceRequired: form.get("evidenceRequired") === "on",
        });
        navigate("Posted tasks", id);
        setNotice("Task posted.");
      } else if (dialog === "quote" && selected) {
        const availability = field("availability");
        const note = field("note");
        if (!availability || !note)
          throw new Error("Add your availability and what you can do.");
        await live.mutate({
          action: "apply",
          requestId: selected.id,
          amount,
          availability,
          note,
        });
        navigate("Sent applications", selected.id);
        setNotice("Application sent.");
      } else if (dialog === "complete" && selected) {
        const note = field("note");
        if (!note) throw new Error("Add your completion note.");
        setNotice(await live.pay(selected.id, "submit", note));
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

  const privatePage = pathname.startsWith("/me/");
  const extraPage = [
    "Find providers",
    "Provider profile",
    "My profile",
    "Earnings",
    "Notifications",
  ].includes(page);
  async function markRead(id?: string) {
    await fetch("/api/experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
  }
  return (
    <MarketplaceShell
      view={page}
      onNavigate={navigate}
      onPost={() => openDialog("post")}
      accountControl={live.accountControl}
      logout={live.logout}
    >
      {privatePage && !live.wallet ? (
        <div className="experience-page experience-empty">
          <h1>Your campus activity</h1>
          <p>
            {live.sessionReady
              ? "Sign in with your wallet to see your tasks, bookings and earnings."
              : "Your activity will appear here shortly. If loading fails, use Retry connection above."}
          </p>
          {live.sessionReady && (
            <button className="button button-primary" onClick={live.signIn}>
              Connect wallet
            </button>
          )}
        </div>
      ) : extraPage ? (
        <ExperiencePage
          key={pathname}
          page={page}
          id={selectedId}
          wallet={live.wallet}
          jobs={jobs}
          notifications={live.notifications}
          onRead={(id) => {
            void markRead(id);
          }}
          onEdit={live.editProfile}
          onPost={() => openDialog("post")}
        />
      ) : page === "Home" ? (
        <Home
          jobs={jobs}
          onPost={() => openDialog("post")}
          onBrowse={(category) => {
            navigate("Browse tasks");
            if (category) setFilters({ ...emptyFilters, category });
          }}
          onTask={(job) => navigate("Browse tasks", job.id)}
        />
      ) : page === "Explore campuses" ? (
        <ExploreCampuses onOpen={() => navigate("Browse tasks")} />
      ) : (
        <div className="book-one">
          <header className="board-intro">
            <div>
              <p className="pilot-campus">UNN · Nsukka</p>
              <h1>{viewCopy[view].title}</h1>
              <p>{viewCopy[view].introduction}</p>
            </div>
          </header>
          {live.banner}
          <CampusSelector />
          {(view === "Bookings" || view === "Sent applications") && (
            <div
              className="experience-tabs"
              role="group"
              aria-label={
                view === "Bookings" ? "Booking status" : "Application status"
              }
            >
              {(view === "Bookings"
                ? [
                    ["all", "All"],
                    ["active", "Active"],
                    ["completed", "Completed"],
                    ["closed", "Cancelled & refunds"],
                  ]
                : [
                    ["all", "All"],
                    ["pending", "Pending"],
                    ["selected", "Selected"],
                    ["not-selected", "Not selected"],
                  ]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value}
                  onClick={() => {
                    router.push(
                      pageHref(page) +
                        (value === "all" ? "" : "?status=" + value),
                    );
                    setMobileDetails(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="board-notice" role="status">
            {notice && (
              <>
                <CheckCircle2 size={17} aria-hidden="true" /> {notice}
              </>
            )}
          </div>
          {!dialog && error && (
            <p className="form-error board-error" role="alert">
              {error}
            </p>
          )}
          <div
            className="booking-board"
            data-show-details={Boolean(
              (mobileDetails || selectedId) && selected,
            )}
            ref={boardRef}
          >
            <RequestList
              view={view}
              areas={pilotAreas}
              filters={filters}
              onFilter={setFilters}
              jobs={matches}
              selectedId={selected?.id}
              onSelect={select}
            />
            {selected ? (
              <RequestDetail
                job={selected}
                onBack={returnToList}
                onAccept={(quote) => acceptQuote(selected, quote)}
                onQuote={() => openDialog("quote", selected.id)}
                onComplete={() => openDialog("complete")}
                busy={busy}
                wallet={live.wallet}
                experienceReady={live.experienceReady}
                payment={{
                  enabled: live.paymentsEnabled,
                  submit: (operation) => {
                    void run(async () => {
                      setNotice(await live.pay(selected.id, operation));
                    });
                  },
                }}
              />
            ) : (
              <div className="request-detail-empty">
                <ClipboardList size={26} aria-hidden="true" />
                <p>Choose a task to see its details.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {(page === "Home" || page === "Explore campuses") && error && (
        <div className="discovery-connection">
          <p className="form-error" role="alert">
            {error}
          </p>
        </div>
      )}
      {dialog && (
        <RequestDialog
          key={dialog}
          kind={dialog}
          evidenceRequired={selected?.evidenceRequired}
          areas={pilotAreas}
          busy={busy}
          error={error}
          onDismiss={dismissDialog}
          onSubmit={submit}
        />
      )}
    </MarketplaceShell>
  );
}
