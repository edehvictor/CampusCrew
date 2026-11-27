import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePayments } from "../src/features/book-one/services/reconcile-payments.ts";

test("a signed-in snapshot observes a resolver decision with no pending browser transaction", async () => {
  const calls = [];
  const cached = { state: "Disputed", refund: false };
  const ok = await reconcilePayments({
    pending: async () => [],
    active: async () => [{ requestId: "booking", wallet: "owner" }],
    sync: async (wallet, id) => {
      calls.push([wallet, id]);
      cached.state = "Refundable";
      cached.refund = true;
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [["owner", "booking"]]);
  assert.deepEqual(cached, { state: "Refundable", refund: true });
});

test("pending and external observations sync each booking once and preserve the pending actor", async () => {
  const calls = [];
  await reconcilePayments({
    pending: async () => [{ requestId: "booking", wallet: "provider" }],
    active: async () => [{ requestId: "booking", wallet: "owner" }],
    sync: async (...args) => { calls.push(args); },
  });
  assert.deepEqual(calls, [["provider", "booking"]]);
});

test("a failed chain read is reported without preventing other bookings from syncing", async () => {
  const calls = [];
  const ok = await reconcilePayments({
    pending: async () => [],
    active: async () => ["failed", "healthy"].map((id) => ({ requestId: id, wallet: "owner" })),
    sync: async (_, id) => {
      calls.push(id);
      if (id === "failed") throw new Error("RPC unavailable");
    },
  });
  assert.equal(ok, false);
  assert.deepEqual(calls, ["failed", "healthy"]);
});
