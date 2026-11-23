import assert from "node:assert/strict";
import { test } from "node:test";
import {
  paymentRecords,
  paymentTotal,
  paymentCsv,
} from "../src/features/book-one/payment-history.ts";
import { createSnapshotLoader } from "../src/features/book-one/snapshot-loader.ts";
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
