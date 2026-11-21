export const categories = ["Cleaning", "Hair & beauty", "Tutoring", "Repairs", "Tech & design", "Errands"] as const;

export type Category = (typeof categories)[number];
export type View = "Browse tasks" | "Posted tasks" | "Sent applications" | "Bookings";
export type Status = "Open" | "Awaiting funding" | "Funded" | "Ready for review" | "Paid" | "Refunded" | "Disputed" | "Refund available" | "Cancelled";
export type Quote = {
  id: string;
  provider: string;
  amount: number;
  availability: string;
  note: string;
  own?: boolean;
  bio?: string;
  skills?: Category[];
  coverage?: string[];
};
export type Job = {
  id: string;
  title: string;
  category: Category;
  area: string;
  timing: string;
  budget: number;
  scope: string;
  customer: string;
  own?: boolean;
  quotes: Quote[];
  accepted?: string;
  status: Status;
  completion?: string;
  applicationCount?: number;
  payment?: {
    fundingTx: string | null; settlementTx: string | null; refundAfter: number | null;
    operations?: ("create" | "accept" | "fund" | "submit" | "release" | "claim" | "cancel" | "refund" | "dispute")[];
    state?: string; contract?: string; resolver?: string;
    fundingDeadline?: number; workDeadline?: number; reviewDeadline?: number;
  } | null;
};

const number = new Intl.NumberFormat("en-NG");
export const price = (value: number) => `${number.format(value)} USDC`;

export function isInView(job: Job, view: View) {
  switch (view) {
    case "Browse tasks":
      return job.status === "Open";
    case "Posted tasks":
      return Boolean(job.own);
    case "Sent applications":
      return job.quotes.some(quote => quote.own);
    case "Bookings":
      return Boolean(job.accepted && (job.own || job.quotes.some(quote => quote.id === job.accepted && quote.own)));
  }
}
