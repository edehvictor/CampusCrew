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

import type {
  PublicationRecovery,
  PublicationResult,
} from "./types/publication";
export type LiveBoardActions = {
  fundedPostingEnabled: boolean;
  publications: PublicationRecovery[];
  publish: (
    draft: Extract<PilotMutation, { action: "post" }>,
  ) => Promise<PublicationResult>;
  cancelTask: (id: string) => Promise<PublicationResult>;
  checkPublication: (id: string) => Promise<PublicationResult>;
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
  // Capture what was reviewed when the form opened, not a later background snapshot.
  const [draftJob, setDraftJob] = useState<Job | null>(null);

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
        setDraftJob(
          intent.kind === "quote"
            ? (live.jobs.find((job) => job.id === intent.requestId) ?? null)
            : null,
        );
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
            ? ["Cancelled", "Refunded", "Refund available", "Removed"].includes(
                job.status,
              )
            : ![
                "Paid",
                "Cancelled",
                "Refunded",
                "Refund available",
                "Removed",
              ].includes(job.status))) &&
      (view !== "Sent applications" ||
        statusFilter === "all" ||
        (statusFilter === "selected"
          ? job.quotes.some((q) => q.own && q.id === job.accepted)
          : statusFilter === "pending"
            ? job.status === "Open" &&
              job.quotes.some((q) => q.own && !q.withdrawnAt)
            : statusFilter === "withdrawn"
              ? job.quotes.some((q) => q.own && Boolean(q.withdrawnAt))
              : Boolean(
                  job.status !== "Open" &&
                  !job.quotes.some((q) => q.own && q.withdrawnAt) &&
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
    if (
      kind === "edit-task" &&
      (!selected?.own || selected.status !== "Open" || !selected.revision)
    )
      return;
    if (
      kind === "edit-application" &&
      (selected?.status !== "Open" ||
        !selected.revision ||
        !selected.quotes.some((q) => q.own && q.revision))
    )
      return;
    draftId.current = crypto.randomUUID();
    setDraftJob(kind === "post" ? null : (selected ?? null));
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
        taskRevision: job.revision,
        applicationRevision: quote.revision,
      });
      navigate("Bookings", job.id);
      setNotice(
        job.publication
          ? "Provider selected. Confirm the assignment to return any unused budget, then the provider accepts."
          : "Provider selected. Review the booking before funding.",
      );
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const amount = Number(field("amount"));
    const task = draftJob;
    if (
      dialog !== "complete" &&
      (!Number.isFinite(amount) || amount < 0.01 || amount > 1000000)
    )
      return;

    void run(async () => {
      if (dialog === "post" || dialog === "edit-task") {
        const title = field("title");
        const scope = field("scope");
        const timing = field("timing");
        const category = categories.find((item) => item === field("category"));
        const area = pilotAreas.find((item) => item === field("area"));
        if (!title || !scope || !timing || !category || !area)
          throw new Error("Fill in the task details.");
        const id =
          dialog === "edit-task"
            ? task?.id
            : (draftId.current ?? crypto.randomUUID());
        if (!id) throw new Error("Close the editor and open the task again.");
        const values = {
          requestId: id,
          title,
          scope,
          timing,
          category,
          area,
          budget: amount,
          evidenceRequired: form.get("evidenceRequired") === "on",
        };
        if (dialog === "edit-task") {
          if (!task?.revision)
            throw new Error("Refresh the task before editing.");
          await live.mutate({
            action: "edit-task",
            revision: task.revision,
            ...values,
          });
        } else {
          const result = await live.publish({ action: "post", ...values });
          if (!result.confirmed) {
            setDialog(null);
            navigate("Posted tasks");
            setNotice(result.message);
            return;
          }
        }
        navigate("Posted tasks", id);
        setNotice(
          dialog === "edit-task"
            ? "Task updated. Existing applicants must review the changes before selection."
            : "Task funded and published.",
        );
      } else if (
        (dialog === "quote" || dialog === "edit-application") &&
        task
      ) {
        if (task.publication && amount > task.budget)
          throw new Error("Your quote cannot exceed the funded budget.");
        const availability = field("availability");
        const note = field("note");
        if (!availability || !note)
          throw new Error("Add your availability and what you can do.");
        const values = {
          requestId: task.id,
          taskRevision: task.revision,
          amount,
          availability,
          note,
        };
        if (dialog === "edit-application") {
          const quote = task.quotes.find((q) => q.own);
          if (!quote?.revision || !task.revision)
            throw new Error("Refresh the task before editing.");
          await live.mutate({
            ...values,
            action: "edit-application",
            applicationId: quote.id,
            revision: quote.revision,
            taskRevision: task.revision,
          });
        } else await live.mutate({ ...values, action: "apply" });
        navigate("Sent applications", task.id);
        setNotice(
          dialog === "edit-application"
            ? "Application updated for the current task."
            : "Application sent.",
        );
      } else if (dialog === "complete" && task) {
        const note = field("note");
        if (!note) throw new Error("Add your completion note.");
        setNotice(await live.pay(task.id, "submit", note));
      }
      setDialog(null);
    });
  }

  function removeTask(job: Job) {
    if (
      !window.confirm(
        job.publication
          ? "Remove this task and return its full reserved budget? Approve the refund in your wallet. The task stays in private history."
          : "Remove this task? It will close applications and remain in your private history.",
      )
    )
      return;
    void run(async () => {
      if (job.publication) {
        const result = await live.cancelTask(job.id);
        setNotice(result.message);
      } else {
        await live.mutate({ action: "remove-task", requestId: job.id });
        setNotice("Task removed.");
      }
    });
  }
  function withdraw(job: Job) {
    const q = job.quotes.find((q) => q.own);
    if (
      !q?.revision ||
      !window.confirm(
        "Withdraw your application? The task owner will no longer be able to select it.",
      )
    )
      return;
    void run(async () => {
      await live.mutate({
        action: "withdraw",
        requestId: job.id,
        applicationId: q.id,
        revision: q.revision!,
      });
      setNotice("Application withdrawn.");
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
          {!!live.publications.length && (
            <section
              className="publication-recovery"
              aria-label="Pending funding approvals"
            >
              <h2>Funding approvals</h2>
              <p>
                Check an approval before trying again. An unconfirmed deposit
                does not publish a task.
              </p>
              {live.publications.map((intent) => (
                <div key={intent.id}>
                  <span>
                    <strong>{intent.title}</strong>
                    <small>
                      {intent.status === "prepared"
                        ? "Wallet approval prepared; no confirmation yet"
                        : intent.operation === "cancel"
                          ? "Refund awaiting confirmation"
                          : "Publication awaiting confirmation"}
                    </small>
                  </span>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const r = await live.checkPublication(intent.id);
                        setNotice(r.message);
                      });
                    }}
                  >
                    Check {intent.operation === "cancel" ? "refund" : "funding"}
                  </button>
                </div>
              ))}
            </section>
          )}
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
                    ["withdrawn", "Withdrawn"],
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
                key={selected.id}
                job={selected}
                onBack={returnToList}
                onAccept={(quote) => acceptQuote(selected, quote)}
                onQuote={() => openDialog("quote", selected.id)}
                onComplete={() => openDialog("complete")}
                onRemoveTask={() => removeTask(selected)}
                onWithdraw={() => withdraw(selected)}
                onEditTask={() => openDialog("edit-task")}
                onEditApplication={() => openDialog("edit-application")}
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
          fundedPostingEnabled={live.fundedPostingEnabled}
          evidenceRequired={draftJob?.evidenceRequired}
          initialJob={draftJob ?? undefined}
          initialQuote={
            dialog === "edit-application"
              ? draftJob?.quotes.find((q) => q.own)
              : undefined
          }
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
