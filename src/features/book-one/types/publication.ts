import { z } from "zod";
import { postTaskSchema } from "./pilot.ts";
export const publishDraftSchema = postTaskSchema;
export const publicationInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), draft: publishDraftSchema }),
  z.object({ action: z.literal("prepare-cancel"), requestId: z.uuid() }),
  z.object({
    action: z.literal("submit"),
    intentId: z.uuid(),
    xdr: z.string().min(1).max(100000),
  }),
  z.object({ action: z.literal("sync"), intentId: z.uuid() }),
]);
export type PublicationRecovery = {
  id: string;
  requestId: string;
  title: string;
  operation: "publish" | "cancel";
  status: string;
};
export type PublicationResult = {
  confirmed: boolean;
  requestId: string;
  message: string;
  intentId: string;
};
