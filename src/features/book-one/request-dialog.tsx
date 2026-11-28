import { X } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { categories, price, type Job, type Quote } from "./model";

const dialogCopy = {
  post: {
    heading: "Post a task",
    submit: "Fund & publish task",
    description: "What needs to be done?",
  },
  quote: {
    heading: "Apply for this task",
    submit: "Send application",
    description: "What can you do for this task?",
  },
  "edit-task": {
    heading: "Edit task",
    submit: "Save task changes",
    description: "What needs to be done?",
  },
  "edit-application": {
    heading: "Edit application",
    submit: "Save application",
    description: "What can you do for this task?",
  },
  complete: {
    heading: "Submit completion",
    submit: "Submit for review",
    description: "What did you complete?",
  },
};

export type DialogKind = keyof typeof dialogCopy;

type Props = {
  kind: DialogKind;
  fundedPostingEnabled?: boolean;
  evidenceRequired?: boolean;
  initialJob?: Job;
  initialQuote?: Quote;
  areas: readonly string[];
  busy: boolean;
  error: string;
  onDismiss: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RequestDialog({
  kind,
  fundedPostingEnabled,
  evidenceRequired,
  initialJob,
  initialQuote,
  areas,
  busy,
  error,
  onDismiss,
  onSubmit,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const copy = dialogCopy[kind];
  const taskForm = kind === "post" || kind === "edit-task";
  const applicationForm = kind === "quote" || kind === "edit-application";
  const editing = kind === "edit-task" || kind === "edit-application";
  const reconfirm =
    kind === "edit-application" &&
    initialQuote?.taskRevision !== initialJob?.revision;

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      className="request-dialog"
      aria-labelledby="request-dialog-heading"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <header>
        <h2 id="request-dialog-heading">{copy.heading}</h2>
        <button
          type="button"
          className="button button-icon"
          aria-label="Close dialog"
          onClick={onDismiss}
          disabled={busy}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      <form onSubmit={onSubmit}>
        {kind === "post" && (
          <p className="edit-form-intro">
            Fund your budget in test USDC to publish. Providers can quote up to
            that amount. Any unused difference returns when you assign the
            booking. Applications and acceptance close after 24 hours;
            unassigned deposits remain refundable. Removing an unassigned task
            refunds its budget. Wallet approvals also use test XLM for network
            fees.
          </p>
        )}
        {kind === "post" && !fundedPostingEnabled && (
          <p className="form-error" role="status">
            Funded publishing is awaiting its verified Testnet deployment. No
            payment will be requested yet.
          </p>
        )}
        {kind === "edit-task" && initialJob?.publication && (
          <p className="edit-form-intro">
            Your funded budget stays fixed. To change it, remove and refund this
            task, then post a new one.
          </p>
        )}
        {editing && (
          <p className="edit-form-intro">
            {kind === "edit-task"
              ? "Changes are allowed until you select a provider. Existing applicants will be asked to review the updated task."
              : reconfirm
                ? "Review the updated task below. Saving confirms your offer for this version."
                : "Update your offer before a provider is selected. Your application stays in the same task."}
          </p>
        )}
        {applicationForm && initialJob && (
          <details className="edit-task-context" open={reconfirm}>
            <summary>Task you are applying for</summary>
            <strong>{initialJob.title}</strong>
            <p>{initialJob.scope}</p>
            <p>
              {initialJob.category} · {initialJob.area} · {initialJob.timing}
            </p>
            <p>Task budget: {price(initialJob.budget)}</p>
            {initialJob.evidenceRequired && (
              <p>A photo or document is required as completion evidence.</p>
            )}
          </details>
        )}
        <fieldset disabled={busy} className="request-form-fields">
          {taskForm && (
            <>
              <label>
                Task title
                <input
                  name="title"
                  defaultValue={initialJob?.title}
                  required
                  maxLength={100}
                  autoFocus
                />
              </label>
              <div className="form-row">
                <label>
                  Category
                  <select name="category" defaultValue={initialJob?.category}>
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Service area
                  <select name="area" defaultValue={initialJob?.area}>
                    {areas.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                When do you need it?
                <input
                  name="timing"
                  defaultValue={initialJob?.timing}
                  required
                  maxLength={80}
                />
              </label>
            </>
          )}
          {kind !== "complete" && (
            <label>
              {taskForm ? "Budget (test USDC)" : "Proposed price (test USDC)"}
              <input
                name="amount"
                type="number"
                min={0.01}
                max={
                  applicationForm && initialJob?.publication
                    ? initialJob.budget
                    : 1000000
                }
                readOnly={
                  kind === "edit-task" && Boolean(initialJob?.publication)
                }
                step={0.01}
                required
                defaultValue={
                  taskForm ? initialJob?.budget : initialQuote?.amount
                }
                autoFocus={applicationForm}
              />
            </label>
          )}
          {applicationForm && (
            <label>
              Availability
              <input
                name="availability"
                defaultValue={initialQuote?.availability}
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            {copy.description}
            <textarea
              name={taskForm ? "scope" : "note"}
              defaultValue={taskForm ? initialJob?.scope : initialQuote?.note}
              required
              maxLength={750}
              rows={3}
              autoFocus={kind === "complete"}
            />
          </label>
          {taskForm && (
            <label className="profile-check">
              <input
                type="checkbox"
                name="evidenceRequired"
                defaultChecked={initialJob?.evidenceRequired}
              />
              Require a photo or document as completion evidence
            </label>
          )}
        </fieldset>
        {kind === "complete" && (
          <p className="privacy-note">
            {evidenceRequired
              ? "This task requires an uploaded photo or document. Add it in Work & evidence first, then write your completion note here and approve submission in your wallet."
              : "Evidence is optional. Add any useful attachments in Work & evidence first. This note and your wallet approval submit the task for review."}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || (kind === "post" && !fundedPostingEnabled)}
        >
          {busy
            ? "Saving…"
            : reconfirm
              ? "Confirm updated application"
              : copy.submit}
        </button>
        {editing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onDismiss}
          >
            Cancel
          </button>
        )}
      </form>
    </dialog>
  );
}
