import assert from "node:assert/strict";
import { test } from "node:test";
import { isInView } from "../src/features/book-one/model.ts";
import { makeTaskFixtures } from "./fixtures/book-one.mts";

test("a task owner can compare applications before moving the task into bookings", () => {
  const [task] = makeTaskFixtures();
  assert.equal(task.quotes.length, 3);
  assert.equal(isInView(task, "Browse tasks"), true);
  assert.equal(isInView(task, "Posted tasks"), true);
  assert.equal(isInView(task, "Bookings"), false);

  const booked = { ...task, accepted: task.quotes[0].id, status: "Awaiting funding" };
  assert.equal(isInView(booked, "Browse tasks"), false);
  assert.equal(isInView(booked, "Bookings"), true);
});

test("only the provider who was selected sees the booking as their own", () => {
  const [task] = makeTaskFixtures();
  const [first, second, third] = task.quotes;
  const applied = { ...task, own: false, quotes: [first, { ...second, own: true }, third] };
  assert.equal(isInView(applied, "Sent applications"), true);
  assert.equal(isInView(applied, "Posted tasks"), false);

  const booked = { ...applied, status: "Funded" };
  assert.equal(isInView({ ...booked, accepted: first.id }, "Bookings"), false);
  assert.equal(isInView({ ...booked, accepted: second.id }, "Bookings"), true);
});

test("editing fixture objects in one test does not affect the next test", () => {
  const first = makeTaskFixtures();
  first[0].quotes.pop();
  assert.equal(first[0].quotes.length, 2);
  assert.equal(makeTaskFixtures()[0].quotes.length, 3);
});
