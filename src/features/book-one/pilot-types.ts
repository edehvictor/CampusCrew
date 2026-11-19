import { z } from "zod";
import { categories, type Job } from "./model";

export const pilotAreas = ["On campus", "Around Nsukka", "Online"] as const;
export type PilotArea = typeof pilotAreas[number];

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  area: z.enum(pilotAreas),
  skills: z.array(z.enum(categories)).max(categories.length),
  coverage: z.array(z.enum(pilotAreas)).max(pilotAreas.length),
  bio: z.string().trim().max(300),
}).refine(profile => Boolean(profile.skills.length) === Boolean(profile.coverage.length), {
  message: "Choose both services and areas, or leave both empty.",
});

export type PilotProfile = z.infer<typeof profileSchema>;
export type PilotSnapshot = {
  jobs: Job[];
  account: { wallet: string; profile: PilotProfile | null } | null;
  paymentsEnabled: boolean;
};
export type EntryIntent = { kind: "post" } | { kind: "quote"; requestId: string };

const amount = z.number().positive().max(1000000).multipleOf(0.01);
const requestId = z.uuid();
const note = z.string().trim().min(1).max(750);
const timing = z.string().trim().min(1).max(80);

export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), profile: profileSchema }),
  z.object({
    action: z.literal("post"), requestId,
    title: z.string().trim().min(1).max(100),
    category: z.enum(categories), area: z.enum(pilotAreas), timing, budget: amount, scope: note,
  }),
  z.object({ action: z.literal("apply"), requestId, amount, availability: timing, note }),
  z.object({ action: z.literal("select"), requestId, applicationId: z.uuid() }),
  z.object({ action: z.literal("complete"), requestId, note }),
  z.object({
    action: z.literal("payment"), requestId,
    operation: z.enum(["fund", "release", "refund", "sync"]),
    hash: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  }),
]);

export type PilotMutation = z.infer<typeof mutationSchema>;
export type PaymentOperation = "fund" | "release" | "refund" | "sync";
