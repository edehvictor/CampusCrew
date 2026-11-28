import { z } from "zod";

export const disputeReasons = [
  "Not delivered",
  "Incomplete work",
  "Quality issue",
  "Missed deadline",
  "Payment issue",
  "Other",
] as const;
export const reportSchema = z.object({
  action: z.literal("report"),
  requestId: z.uuid(),
  reason: z.enum(disputeReasons),
  summary: z.string().trim().min(20).max(2000),
});
export const statementSchema = z.object({
  action: z.literal("statement"),
  requestId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
  clientId: z.uuid(),
});
export const decisionSchema = z.object({
  action: z.literal("prepare"),
  requestId: z.uuid(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/)
    .max(24),
  rationale: z.string().trim().min(20).max(2000),
});

export type DisputeStatement = {
  id: string;
  body: string;
  role: string;
  createdAt: string;
};
export type DisputeDecision = {
  id: string;
  amount: string;
  rationale: string;
  hash: string;
  status: string;
  expiresAt: string;
  confirmedAt: string | null;
  canResume: boolean;
};
export type DisputeCase = {
  id: string;
  title: string;
  owner: string;
  provider: string;
  ownerWallet: string;
  providerWallet: string;
  amount: number;
  funded: number;
  refund: number;
  state: string;
  reason: string;
  summary: string;
  status: string;
  createdAt: string;
  scope: string;
  completion: string | null;
  statements: DisputeStatement[];
  decisions: DisputeDecision[];
  evidence: {
    id: string;
    name: string;
    uploader: string;
    mime?: string;
    bytes?: number;
    created_at: string;
  }[];
  messages: { id: string; body: string; role: string; createdAt: string }[];
  events: { id: string; label: string; created_at: string }[];
};
export type PreparedDecision = {
  intentId: string;
  xdr: string;
  wallet: string;
  networkPassphrase: string;
  expiresAt: string;
};
