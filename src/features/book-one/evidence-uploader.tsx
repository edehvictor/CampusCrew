"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Upload,
  Trash2,
  X,
  CheckCircle2,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import { useEvidenceUploads } from "./hooks/use-evidence-uploads";
import { evidenceSize } from "./services/evidence-upload";
import type { EvidenceAttachment } from "./types/experience";

export function EvidenceUploader({
  booking,
  files,
  editable,
  canRemove = false,
  lockedLabel = "Attached to booking",
  onRefresh,
  onPendingChange,
}: {
  booking: string;
  files: EvidenceAttachment[];
  editable: boolean;
  canRemove?: boolean;
  lockedLabel?: string;
  onRefresh: () => Promise<void>;
  onPendingChange?: (pending: boolean) => void;
}) {
  const uploads = useEvidenceUploads(
    booking,
    files.map((f) => f.id),
    files.filter((f) => f.mine).length,
    onRefresh,
  );
  const input = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<string | null>(null),
    [error, setError] = useState("");
  const pending = uploads.drafts.some((d) => d.state !== "saved");
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  async function remove(file: EvidenceAttachment) {
    if (
      removing ||
      !window.confirm("Remove this attachment before submitting completion?")
    )
      return;
    setRemoving(file.id);
    setError("");
    try {
      const r = await fetch("/api/evidence", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking, id: file.id }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      uploads.remove(file.id);
      await onRefresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Attachment could not be removed.",
      );
    } finally {
      setRemoving(null);
    }
  }
  return (
    <div className="evidence-workflow">
      {editable && (
        <div className="evidence-picker">
          <div>
            <Upload size={18} aria-hidden="true" />
            <strong>Add photos or documents</strong>
            <p>
              Preview first, then upload. JPG, PNG, WebP or PDF. Up to 3 files,
              4 MB each.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => input.current?.click()}
          >
            <Paperclip size={15} aria-hidden="true" />
            Choose files
          </button>
          <input
            ref={input}
            className="sr-only"
            aria-label="Choose completion evidence"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploads.add(chosen);
            }}
          />
        </div>
      )}
      {(error || uploads.error) && (
        <p className="form-error" role="alert">
          {error || uploads.error}
        </p>
      )}
      {uploads.notice && (
        <p className="evidence-upload-notice" role="status">
          {uploads.notice}
        </p>
      )}
      {!!uploads.drafts.length && (
        <section aria-label="Selected files" className="evidence-selection">
          <h5>Selected on this device</h5>
          <p className="evidence-hint">
            These files are not part of your completion until their upload
            confirms.
          </p>
          {uploads.drafts.map((d) => (
            <article className="evidence-file" key={d.id} data-state={d.state}>
              <div className="evidence-thumbnail">
                {d.preview && d.mime.startsWith("image/") ? (
                  <Image
                    src={d.preview}
                    width={64}
                    height={64}
                    alt={"Preview of " + d.file.name}
                    unoptimized
                  />
                ) : (
                  <FileText size={24} aria-hidden="true" />
                )}
              </div>
              <div className="evidence-file-body">
                <strong title={d.file.name}>{d.file.name}</strong>
                <small>
                  {evidenceSize(d.file.size)} ·{" "}
                  {d.mime === "application/pdf" ? "PDF document" : "Image"}
                </small>
                {d.mime === "application/pdf" && d.preview && (
                  <a
                    className="evidence-document-preview"
                    href={d.preview}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview PDF <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
                <span className="evidence-file-status">
                  {d.state === "selected"
                    ? "Not uploaded"
                    : d.state === "uploading"
                      ? d.progress === 99
                        ? "Processing attachment..."
                        : d.progress === null
                          ? "Uploading..."
                          : `Uploading ${d.progress}%`
                      : d.state === "saved"
                        ? "Upload confirmed. Updating the list..."
                        : d.state === "cancelled"
                          ? "Transfer cancelled. Check attached files."
                          : "Upload not confirmed"}
                </span>
                {d.state === "uploading" && (
                  <progress
                    max={100}
                    value={d.progress ?? undefined}
                    aria-label={"Upload progress for " + d.file.name}
                  />
                )}
                {d.error && (
                  <p className="form-error" role="alert">
                    {d.error}
                  </p>
                )}
              </div>
              <div className="evidence-file-actions">
                {d.state === "uploading" ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => uploads.cancel(d.id)}
                  >
                    <X size={14} aria-hidden="true" />
                    Cancel upload
                  </button>
                ) : (
                  d.state !== "saved" && (
                    <>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={!editable}
                        onClick={() => {
                          void uploads.start(d);
                        }}
                      >
                        {d.state === "selected" ? "Upload" : "Retry"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={"Remove selected file " + d.file.name}
                        onClick={() => uploads.remove(d.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </button>
                    </>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      <section className="evidence-attached" aria-label="Attached files">
        <div className="evidence-section-title">
          <h5>Attached files</h5>
          <span>{files.length}</span>
        </div>
        {!files.length ? (
          <p className="evidence-empty">No files attached yet.</p>
        ) : (
          files.map((file) => (
            <article className="evidence-file" key={file.id}>
              <a
                className="evidence-thumbnail"
                href={
                  "/api/evidence?id=" +
                  file.id +
                  (file.mime.startsWith("image/") ? "&preview=1" : "")
                }
                target="_blank"
                rel="noreferrer"
                aria-label={"Open " + file.name}
              >
                {file.mime.startsWith("image/") ? (
                  <Image
                    src={"/api/evidence?id=" + file.id + "&preview=1"}
                    alt={"Preview of " + file.name}
                    width={64}
                    height={64}
                    unoptimized
                  />
                ) : (
                  <FileText size={24} aria-hidden="true" />
                )}
              </a>
              <div className="evidence-file-body">
                <a
                  href={"/api/evidence?id=" + file.id}
                  target="_blank"
                  rel="noreferrer"
                  className="evidence-file-name"
                >
                  {file.name}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <small>
                  {file.bytes ? evidenceSize(file.bytes) + " · " : ""}
                  {file.mine ? "Added by you" : "Booking attachment"}
                </small>
                <span className="evidence-file-status">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {lockedLabel}
                </span>
              </div>
              {canRemove && file.mine && (
                <button
                  className="text-button evidence-remove"
                  type="button"
                  aria-label={"Remove attachment " + file.name}
                  disabled={Boolean(removing)}
                  onClick={() => {
                    void remove(file);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {removing === file.id ? "Removing..." : "Remove"}
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
