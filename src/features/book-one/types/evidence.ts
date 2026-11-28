export type EvidenceDraft = {
  id: string;
  file: File;
  mime: string;
  preview?: string;
  state: "selected" | "uploading" | "saved" | "cancelled" | "error";
  progress: number | null;
  error?: string;
};
