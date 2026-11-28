import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkStellarDatabase } from "../auth/stellar-session";
import { PilotError } from "../pilot-error";
import type { PilotMutation } from "../types/pilot";

export async function editMarketplace(
  wallet: string,
  input: Extract<PilotMutation, { action: "edit-task" | "edit-application" }>,
) {
  const db = getSupabaseAdmin();
  const { error } =
    input.action === "edit-task"
      ? await db.rpc("campuscrew_stellar_edit_task", {
          p_wallet: wallet,
          p_request_id: input.requestId,
          p_revision: input.revision,
          p_title: input.title,
          p_category: input.category,
          p_area: input.area,
          p_timing: input.timing,
          p_budget: input.budget,
          p_scope: input.scope,
          p_evidence_required: input.evidenceRequired,
        })
      : await db.rpc("campuscrew_stellar_edit_application", {
          p_wallet: wallet,
          p_request_id: input.requestId,
          p_application_id: input.applicationId,
          p_revision: input.revision,
          p_task_revision: input.taskRevision,
          p_amount: input.amount,
          p_availability: input.availability,
          p_note: input.note,
        });
  if (error && ["42883", "42703", "PGRST202"].includes(error.code))
    throw new PilotError(
      "Task editing needs the 20261128000100_task_application_editing.sql database update.",
      503,
    );
  checkStellarDatabase(error);
}
