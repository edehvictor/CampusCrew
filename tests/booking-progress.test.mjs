import assert from "node:assert/strict";
import test from "node:test";
import { bookingProgress } from "../src/features/book-one/services/booking-progress.ts";

const booking = (state, payment = {}) => ({
  accepted: "application-1",
  status: "Awaiting funding",
  payment: { state, fundingTx: null, reviewDeadline: 0, ...payment },
});

test("selection and acceptance never imply that payment has been funded", () => {
  assert.equal(bookingProgress(booking(undefined)).lastReached, 0);
  assert.equal(bookingProgress(booking("Proposed")).lastReached, 0);
  assert.equal(bookingProgress(booking("Funding")).lastReached, 1);
  assert.equal(bookingProgress(booking("Funded")).lastReached, 2);
});

test("a dispute preserves funding progress without inventing a completion submission", () => {
  const beforeSubmission = bookingProgress(booking("Disputed"));
  assert.equal(beforeSubmission.lastReached, 2);
  assert.equal(beforeSubmission.paused, true);
  assert.equal(beforeSubmission.current, -1);
  const afterSubmission = bookingProgress(
    booking("Disputed", { reviewDeadline: 1800000000 }),
  );
  assert.equal(afterSubmission.lastReached, 3);
});

test("split settlement and refund do not claim the full booking was paid", () => {
  for (const status of ["Refund available", "Refunded"]) {
    const result = bookingProgress({
      ...booking("Refundable", {
        fundingTx: "receipt",
        reviewDeadline: 1800000000,
      }),
      status,
    });
    assert.equal(result.lastReached, 3);
    assert.equal(result.stopped, true);
    assert.equal(result.current, -1);
  }
  assert.equal(
    bookingProgress({ ...booking("Refundable"), status: "Cancelled" })
      .lastReached,
    0,
  );
});

test("only a confirmed Paid contract state reaches the final payment step", () => {
  assert.equal(
    bookingProgress(booking("Submitted", { reviewDeadline: 1800000000 }))
      .lastReached,
    3,
  );
  const paid = bookingProgress({ ...booking("Paid"), status: "Paid" });
  assert.equal(paid.lastReached, 4);
  assert.equal(paid.current, -1);
});
