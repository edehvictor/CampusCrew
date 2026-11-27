import type { Job } from "@/features/book-one/model";

export type PaymentRecord = {
  id: string;
  title: string;
  category: Job["category"];
  person: string;
  amount: number;
  kind: "received" | "sent" | "escrow" | "refund";
  provider: boolean;
  label: string;
  receipt: string;
  recordedAt: string | null;
};

// One financial outcome per booking. Selection alone is never a payment.
export function paymentRecords(jobs: Job[]): PaymentRecord[] {
  return jobs
    .flatMap((job) => {
      const quote = job.quotes.find((q) => q.id === job.accepted);
      if (!quote || (!job.own && !quote.own)) return [];
      const provider = !job.own && Boolean(quote.own);
      const base = {
        id: job.id,
        title: job.title,
        category: job.category,
        person: provider ? job.customer : quote.provider,
        amount: quote.amount,
        provider,
        recordedAt: job.payment?.settledAt ?? null,
      };
      if (job.status === "Paid" && job.payment?.settlementTx)
        return [
          {
            ...base,
            kind: provider ? "received" : "sent",
            label: provider ? "Received" : "Paid",
            receipt: job.payment.settlementTx,
          } as PaymentRecord,
        ];
      if (
        job.own &&
        job.status === "Refunded" &&
        job.payment?.settlementTx &&
        job.payment.refundAmount !== undefined
      )
        return [
          {
            ...base,
            amount: job.payment.refundAmount,
            kind: "refund",
            label: "Refunded",
            receipt: job.payment.settlementTx,
          } as PaymentRecord,
        ];
      if (
        ["Funded", "Ready for review", "Disputed"].includes(job.status) &&
        job.payment?.fundingTx
      )
        return [
          {
            ...base,
            recordedAt: null,
            kind: "escrow",
            label:
              job.status === "Disputed"
                ? "Disputed"
                : job.status === "Ready for review"
                  ? "In review"
                  : "In escrow",
            receipt: job.payment.fundingTx,
          } as PaymentRecord,
        ];
      return [];
    })
    .sort(
      (a, b) =>
        (b.recordedAt ? Date.parse(b.recordedAt) : 0) -
        (a.recordedAt ? Date.parse(a.recordedAt) : 0),
    );
}

export function paymentTotal(records: PaymentRecord[]): number {
  return (
    Number(
      records.reduce(
        (sum, r) => sum + BigInt(Math.round(r.amount * 10_000_000)),
        BigInt(0),
      ),
    ) / 10_000_000
  );
}

export function paymentCsv(records: PaymentRecord[]) {
  const escape = (value: string) =>
    '"' +
    (/^(?:\s*[=+@-]|[\t\r\n])/.test(value) ? "'" : "") +
    value.replaceAll('"', '""') +
    '"';
  return [
    [
      "Task",
      "Person",
      "Status",
      "Amount",
      "Currency",
      "Network",
      "Recorded at",
      "Transaction",
    ],
    ...records.map((r) => [
      r.title,
      r.person,
      r.label,
      String(r.amount),
      "USDC",
      "Stellar Testnet",
      r.recordedAt ?? "",
      r.receipt,
    ]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
