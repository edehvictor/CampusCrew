// UI fixtures only. Never loaded by application routes or persisted in Supabase.
export const editingTaskId = "d6416f6e-e31b-4b79-9f90-6375abe06d2d";
export function editingSnapshot(role = "owner", changed = false) {
  return {
    account: {
      wallet: "G" + "A".repeat(55),
      profile: {
        displayName: role === "owner" ? "Task owner" : "Campus provider",
        area: "On campus",
        skills: ["Errands"],
        coverage: ["On campus"],
        bio: "UI test fixture",
      },
    },
    paymentsEnabled: true,
    experienceReady: false,
    notifications: [],
    jobs: [
      {
        id: editingTaskId,
        title: "Deliver a document to student affairs",
        category: "Errands",
        area: "On campus",
        timing: "Tomorrow before noon",
        budget: 1,
        scope: changed
          ? "Pick up the document from the lodge and deliver it before noon."
          : "Collect the document at the main gate and deliver it.",
        customer: "Task owner",
        own: role === "owner",
        status: "Open",
        revision: changed ? 2 : 1,
        updatedAt: changed ? "2026-11-28T09:00:00Z" : null,
        evidenceRequired: false,
        applicationCount: 1,
        quotes: [
          {
            id: "f8ef4ea7-ed3d-4f7b-b9a5-97c9ba6864e8",
            provider: "Campus provider",
            own: role !== "owner",
            amount: 1,
            availability: "Tomorrow morning",
            note: "I can collect and deliver your document before class.",
            revision: 1,
            taskRevision: 1,
          },
        ],
      },
    ],
  };
}
