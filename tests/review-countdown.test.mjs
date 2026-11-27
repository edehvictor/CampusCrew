import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { reviewTimeLeft, formatReviewTime } from "../src/features/book-one/services/review-countdown.ts";

test("review countdown uses the saved deadline, rounds up, and never goes negative", () => {
  const deadline = 1800000000;
  assert.equal(reviewTimeLeft(deadline, deadline * 1000 - 172800000), 172800);
  assert.equal(reviewTimeLeft(deadline, deadline * 1000 - 1), 1);
  assert.equal(reviewTimeLeft(deadline, deadline * 1000), 0);
  assert.equal(reviewTimeLeft(deadline, deadline * 1000 + 90000), 0);
  for (const missing of [undefined, 0, -1, NaN, Infinity])
    assert.equal(reviewTimeLeft(missing, Date.now()), null);
  assert.equal(formatReviewTime(172800), "2d 00:00:00");
  assert.equal(formatReviewTime(90061), "1d 01:01:01");
  assert.equal(formatReviewTime(1), "00:00:01");
});

test("resolver help loads the refactored payment service without keys or sending transactions", () => {
  const output = execFileSync(process.execPath, ["scripts/resolve-stellar-dispute.mjs", "--help"], { encoding: "utf8" });
  assert.match(output, /TASK_UUID PROVIDER_USDC_AMOUNT/);
  assert.match(output, /Testnet only/);
});
