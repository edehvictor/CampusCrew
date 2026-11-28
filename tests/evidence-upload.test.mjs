import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { uploadEvidence } from "../src/features/book-one/services/evidence-upload.ts";
const original = globalThis.XMLHttpRequest;
class FakeXHR {
  static last;
  upload = {};
  constructor() {
    FakeXHR.last = this;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  send(body) {
    this.body = body;
  }
  abort() {
    this.onabort();
  }
}
beforeEach(() => {
  globalThis.XMLHttpRequest = FakeXHR;
});
after(() => {
  globalThis.XMLHttpRequest = original;
});
test("upload sends a stable file identifier and never displays completion before the server confirms", async () => {
  const id = randomUUID(),
    progress = [],
    file = new File(["%PDF-1.7"], "receipt.pdf", { type: "application/pdf" });
  const task = uploadEvidence(randomUUID(), id, file, (p) => progress.push(p)),
    xhr = FakeXHR.last;
  assert.equal(xhr.body.get("uploadId"), id);
  assert.equal(xhr.body.get("file").name, "receipt.pdf");
  xhr.upload.onprogress({ lengthComputable: true, loaded: 10, total: 10 });
  assert.deepEqual(progress, [99]);
  xhr.status = 200;
  xhr.response = { id };
  xhr.onload();
  assert.deepEqual(await task.promise, { id });
});
test("cancellation aborts the actual request and cannot be mistaken for a confirmed upload", async () => {
  const task = uploadEvidence(
    randomUUID(),
    randomUUID(),
    new File(["x"], "x.pdf"),
    () => {},
  );
  task.cancel();
  await assert.rejects(task.promise, (e) => e.name === "AbortError");
});
test("a server error or mismatched receipt stays unconfirmed", async () => {
  const task = uploadEvidence(
    randomUUID(),
    randomUUID(),
    new File(["x"], "x.pdf"),
    () => {},
  );
  FakeXHR.last.status = 403;
  FakeXHR.last.response = { error: "Evidence is locked" };
  FakeXHR.last.onload();
  await assert.rejects(task.promise, /locked/);
  const other = uploadEvidence(
    randomUUID(),
    randomUUID(),
    new File(["x"], "x.pdf"),
    () => {},
  );
  FakeXHR.last.status = 200;
  FakeXHR.last.response = { id: randomUUID() };
  FakeXHR.last.onload();
  await assert.rejects(other.promise, /not confirmed/);
});
