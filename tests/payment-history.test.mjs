import assert from "node:assert/strict";
import { test } from "node:test";
import {
  paymentRecords,
  paymentTotal,
  paymentCsv,
} from "../src/features/book-one/services/payment-history.ts";
import { createSnapshotLoader } from "../src/features/book-one/services/snapshot-loader.ts";
const base = {
  id: "booking-1",
  title: "Deliver assignment",
  category: "Errands",
  customer: "Task owner",
  own: true,
  accepted: "selected",
  quotes: [{ id: "selected", provider: "Provider", amount: 1.25 }],
  status: "Paid",
  payment: {
    fundingTx: "a".repeat(64),
    settlementTx: "b".repeat(64),
    settledAt: "2026-11-23T10:00:00Z",
  },
};
test("payment history distinguishes a payment made from earnings and ignores unselected applicants", () => {
  assert.equal(paymentRecords([base])[0].kind, "sent");
  assert.equal(
    paymentRecords([
      { ...base, own: false, quotes: [{ ...base.quotes[0], own: true }] },
    ])[0].kind,
    "received",
  );
  assert.deepEqual(
    paymentRecords([
      {
        ...base,
        own: false,
        quotes: [...base.quotes, { id: "not-selected", own: true, amount: 9 }],
      },
    ]),
    [],
  );
});
test("selection and unconfirmed settlement cannot become earned money; funding remains in escrow", () => {
  assert.deepEqual(
    paymentRecords([{ ...base, status: "Awaiting funding", payment: null }]),
    [],
  );
  assert.deepEqual(
    paymentRecords([
      { ...base, payment: { fundingTx: base.payment.fundingTx } },
    ]),
    [],
  );
  const held = paymentRecords([
    {
      ...base,
      status: "Funded",
      payment: { fundingTx: base.payment.fundingTx },
    },
  ]);
  assert.equal(held[0].kind, "escrow");
  assert.equal(held[0].receipt, base.payment.fundingTx);
  assert.equal(held[0].recordedAt, null);
});
test("a refund uses the actual refundable amount rather than the full booking price", () => {
  const records = paymentRecords([
    {
      ...base,
      status: "Refunded",
      payment: { ...base.payment, refundAmount: 0.35 },
    },
  ]);
  assert.equal(records[0].kind, "refund");
  assert.equal(records[0].amount, 0.35);
  assert.deepEqual(paymentRecords([{ ...base, status: "Refunded" }]), []);
});

test("provider earnings include the verified award after a split settlement and owner refund", () => {
  const job = {
    ...base, status: "Refunded", own: false,
    quotes: [{ ...base.quotes[0], own: true }],
    payment: { ...base.payment, providerPayoutTx: "c".repeat(64), providerPayoutAmount: 0.6,
      providerPayoutAt: "2026-11-27T15:03:49Z", refundAmount: 0.65 },
  };
  const records = paymentRecords([job]);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "received");
  assert.equal(records[0].amount, 0.6);
  assert.equal(records[0].receipt, "c".repeat(64));
  assert.equal(records[0].bookingId, base.id);
  assert.equal(records[0].recordedAt, job.payment.providerPayoutAt);
  assert.equal(paymentTotal(records), 0.6);
  const awaitingRefund = paymentRecords([{ ...job, status: "Refund available" }]);
  assert.equal(awaitingRefund[0].amount, 0.6);
});

test("owner sees the provider award and refund separately with distinct receipts and IDs", () => {
  const records = paymentRecords([{
    ...base, status: "Refunded",
    payment: { ...base.payment, providerPayoutTx: "c".repeat(64), providerPayoutAmount: 0.6, refundAmount: 0.65 },
  }]);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(r => [r.kind,r.amount,r.receipt]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))), [
    ["refund",0.65,base.payment.settlementTx], ["sent",0.6,"c".repeat(64)],
  ]);
  assert.notEqual(records[0].id, records[1].id);
  assert.equal(records[0].bookingId, records[1].bookingId);
});

test("a full-refund booking creates no provider income and a receiptless award is not earnings", () => {
  const job = { ...base, status: "Refunded", own:false, quotes:[{...base.quotes[0],own:true}],
    payment: { ...base.payment, refundAmount:1.25, providerPayoutAmount:0 } };
  assert.deepEqual(paymentRecords([job]), []);
  assert.deepEqual(paymentRecords([{...job,payment:{...job.payment,providerPayoutAmount:0.6}}]), []);
});
test("payment totals preserve USDC precision and CSV export neutralizes spreadsheet formulas", () => {
  assert.equal(
    paymentTotal([{ amount: 0.1 }, { amount: 0.2 }, { amount: 0.0000001 }]),
    0.3000001,
  );
  const csv = paymentCsv(
    paymentRecords([{ ...base, title: ' =HYPERLINK("https://example.com")' }]),
  );
  assert.match(csv, /"' =HYPERLINK/);
  assert.match(csv, /""https:\/\/example.com""/);
  assert.match(csv, /Stellar Testnet/);
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
test("overlapping session refreshes reuse the same read without delaying the displayed account", async () => {
  const request = deferred();
  let calls = 0;
  const updates = [];
  const load = createSnapshotLoader(
    () => {
      calls++;
      return request.promise;
    },
    (value) => updates.push(value),
  );
  const first = load(),
    second = load();
  assert.equal(first, second);
  assert.equal(calls, 1);
  request.resolve({ wallet: "A" });
  await Promise.all([first, second]);
  assert.deepEqual(updates, [{ wallet: "A" }]);
});
test("an older session response cannot restore an account after a fresh signed-out snapshot", async () => {
  const requests = [deferred(), deferred()];
  let calls = 0;
  const updates = [];
  const load = createSnapshotLoader(
    () => requests[calls++].promise,
    (value) => updates.push(value),
  );
  const old = load(),
    signedOut = load(true);
  requests[1].resolve({ account: null });
  await signedOut;
  requests[0].resolve({ account: { wallet: "A" } });
  await old;
  assert.deepEqual(updates, [{ account: null }]);
});
test("failed session reads release the pending request so the connection can be retried", async () => {
  let calls = 0;
  const updates = [];
  const load = createSnapshotLoader(
    () =>
      ++calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ wallet: "A" }),
    (value) => updates.push(value),
  );
  await assert.rejects(load(), /offline/);
  await load();
  assert.equal(calls, 2);
  assert.deepEqual(updates, [{ wallet: "A" }]);
});
