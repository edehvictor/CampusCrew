import { editingSnapshot, editingTaskId } from "./marketplace-editing.mts";
export const evidenceTaskId = editingTaskId;
export function evidenceSnapshot() {
  const base = editingSnapshot("provider");
  return {
    ...base,
    experienceReady: true,
    jobs: [
      {
        ...base.jobs[0],
        evidenceRequired: true,
        accepted: base.jobs[0].quotes[0].id,
        status: "Funded",
        payment: {
          state: "Funded",
          fundingTx: "a".repeat(64),
          settlementTx: null,
          refundAfter: null,
          operations: ["submit", "dispute"],
          reviewDeadline: 0,
        },
      },
    ],
  };
}
export function evidenceBooking() {
  return {
    events: [],
    messages: [],
    evidence: [],
    canReview: false,
    ownReview: null,
  };
}
