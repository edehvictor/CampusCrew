"use client";
import { useEffect, useRef, useState } from "react";
import { evidenceLimit, evidenceMime } from "../services/evidence-validation";
import { uploadEvidence } from "../services/evidence-upload";
import type { EvidenceDraft } from "../types/evidence";

export function useEvidenceUploads(
  booking: string,
  existingIds: string[],
  existingCount: number,
  onRefresh: () => Promise<void>,
) {
  const [drafts, setDrafts] = useState<EvidenceDraft[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const active = useRef(new Map<string, { cancel: () => void }>()),
    urls = useRef(new Map<string, string>()),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const transfers = active.current,
      previews = urls.current;
    return () => {
      alive.current = false;
      for (const task of transfers.values()) task.cancel();
      for (const url of previews.values()) URL.revokeObjectURL(url);
    };
  }, []);
  const visible = drafts.filter((d) => !existingIds.includes(d.id));
  const patch = (id: string, value: Partial<EvidenceDraft>) => {
    if (alive.current)
      setDrafts((items) =>
        items.map((d) => (d.id === id ? { ...d, ...value } : d)),
      );
  };
  async function add(files: File[]) {
    setError("");
    setNotice("");
    const selected: EvidenceDraft[] = [];
    for (const file of files) {
      if (!file.size || file.size > evidenceLimit) {
        setError("Choose non-empty files up to 4 MB each.");
        continue;
      }
      let mime: string | null;
      try {
        mime = evidenceMime(
          new Uint8Array(await file.slice(0, 12).arrayBuffer()),
        );
      } catch {
        setError("That file could not be read. Choose it again.");
        continue;
      }
      if (!mime) {
        setError("Only JPG, PNG, WebP and PDF files are supported.");
        continue;
      }
      if (!alive.current) return;
      selected.push({
        id: crypto.randomUUID(),
        file,
        mime,
        state: "selected",
        progress: null,
      });
    }
    const slots = Math.max(0, 3 - existingCount - visible.length);
    if (selected.length > slots)
      setError(
        "You can attach up to three files. Remove a selected file or attachment to make room.",
      );
    const accepted = selected.slice(0, slots);
    for (const d of accepted) {
      d.preview = URL.createObjectURL(new Blob([d.file], { type: d.mime }));
      urls.current.set(d.id, d.preview);
    }
    if (alive.current) setDrafts((items) => [...items, ...accepted]);
  }
  function remove(id: string) {
    if (active.current.has(id)) return;
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    setDrafts((items) => items.filter((d) => d.id !== id));
  }
  async function start(draft: EvidenceDraft) {
    if (active.current.has(draft.id) || draft.state === "saved") return;
    setError("");
    setNotice("");
    patch(draft.id, { state: "uploading", progress: 0, error: undefined });
    const transfer = uploadEvidence(booking, draft.id, draft.file, (p) =>
      patch(draft.id, { progress: p }),
    );
    active.current.set(draft.id, transfer);
    let saved = false;
    try {
      await transfer.promise;
      saved = true;
      patch(draft.id, { state: "saved", progress: 100 });
      if (alive.current)
        setNotice(
          "Attachment uploaded. Submit completion separately when the task is finished.",
        );
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        patch(draft.id, { state: "cancelled", progress: null });
        if (alive.current)
          setNotice(
            "Transfer stopped. If the server already received the file, it will appear in Attached files below.",
          );
      } else
        patch(draft.id, {
          state: "error",
          error:
            cause instanceof Error ? cause.message : "Upload not confirmed.",
        });
    } finally {
      active.current.delete(draft.id);
      if (alive.current) {
        try {
          await onRefresh();
          if (saved) remove(draft.id);
        } catch {
          setError(
            "Attachments could not be refreshed. Check the booking before retrying.",
          );
        }
      }
    }
  }
  return {
    drafts: visible,
    error,
    notice,
    add,
    remove,
    start,
    cancel: (id: string) => active.current.get(id)?.cancel(),
  };
}
