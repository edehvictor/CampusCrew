import { X } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { categories } from "./model";

const dialogCopy = {
  post: { heading: "Post a task", submit: "Post task", description: "What needs to be done?" },
  quote: { heading: "Apply for this task", submit: "Send application", description: "What can you do for this task?" },
  complete: { heading: "Submit completion", submit: "Submit for review", description: "What did you complete?" },
};

export type DialogKind = keyof typeof dialogCopy;

type Props = {
  kind: DialogKind;
  areas: readonly string[];
  demo: boolean;
  busy: boolean;
  error: string;
  onDismiss: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RequestDialog({ kind, areas, demo, busy, error, onDismiss, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const copy = dialogCopy[kind];

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
      onCancel={event => { event.preventDefault(); onDismiss(); }}
    >
      <header>
        <h2 id="request-dialog-heading">{copy.heading}</h2>
        <button type="button" className="button button-icon" aria-label="Close dialog" onClick={onDismiss}><X size={19} aria-hidden="true" /></button>
      </header>
      <form onSubmit={onSubmit}>
        {kind === "post" && (
          <>
            <label>Task title<input name="title" required maxLength={100} autoFocus /></label>
            <div className="form-row">
              <label>Category<select name="category">{categories.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Service area<select name="area">{areas.map(item => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label>When do you need it?<input name="timing" required maxLength={80} /></label>
          </>
        )}
        {kind !== "complete" && (
          <label>{kind === "post" ? `Budget (${demo ? "demo G$" : "G$"})` : `Proposed price (${demo ? "demo G$" : "G$"})`}
            <input name="amount" type="number" min={1} max={1000000000} step={1} required autoFocus={kind === "quote"} />
          </label>
        )}
        {kind === "quote" && <label>Availability<input name="availability" required maxLength={80} /></label>}
        <label>{copy.description}
          <textarea name={kind === "post" ? "scope" : "note"} required maxLength={750} rows={3} autoFocus={kind === "complete"} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : copy.submit}</button>
      </form>
    </dialog>
  );
}
