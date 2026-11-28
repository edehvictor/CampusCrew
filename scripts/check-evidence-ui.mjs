// Optional isolated browser check: npm's ordinary tests do not launch Chrome.
// Every /api request is intercepted; fixtures never reach Supabase or a wallet.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  evidenceSnapshot,
  evidenceBooking,
  evidenceTaskId,
} from "../tests/fixtures/evidence.mts";

const base = process.env.CAMPUSCREW_UI_ORIGIN ?? "http://localhost:3000";
if (new URL(base).hostname !== "localhost")
  throw Error("This check is restricted to localhost.");
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "campuscrew-evidence-ui-"),
);
const browser = spawn(
  process.env.CAMPUSCREW_CHROME ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-first-run",
    "--remote-debugging-port=0",
    "--user-data-dir=" + path.join(root, "profile"),
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await fs.readFile(
          path.join(root, "profile", "DevToolsActivePort"),
          "utf8",
        )
      ).split("\n")[0];
      break;
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw Error("Could not launch the isolated preview browser.");
  const tab = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  let snapshot = evidenceSnapshot(),
    experience = evidenceBooking(),
    uploadMode = "hold",
    pendingUpload;
  const uploads = [];
  const portrait = await fs.readFile(
    new URL("../public/avatars/default-profile.jpg", import.meta.url),
  );
  let mutation;
  let fixtureError;
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("Browser command timed out: " + method));
      }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evalPage = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  socket.addEventListener("message", async (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.reject(Error(m.error.message));
        else p.resolve(m.result);
      }
      return;
    }
    if (m.method !== "Fetch.requestPaused") return;
    try {
      const { requestId, request } = m.params,
        url = new URL(request.url);
      let response = {};
      let status = 200;
      if (url.pathname === "/api/book-one") response = snapshot;
      else if (url.pathname === "/api/experience") response = experience;
      else if (url.pathname === "/api/updates") status = 204;
      else if (url.pathname === "/api/evidence" && request.method === "POST") {
        const id = request.postData?.match(
          /name="uploadId"\r?\n\r?\n([^\r\n]+)/,
        )?.[1];
        assert.ok(id, "Multipart upload contains its stable identifier");
        uploads.push(id);
        if (uploadMode === "hold") {
          pendingUpload = requestId;
          return;
        }
        experience.evidence = [
          {
            id,
            name: "delivery.pdf",
            mime: "application/pdf",
            bytes: 100,
            mine: true,
            created_at: new Date().toISOString(),
          },
        ];
        response = { id };
      } else if (
        url.pathname === "/api/evidence" &&
        request.method === "DELETE"
      ) {
        mutation = JSON.parse(request.postData);
        assert.equal(mutation.booking, evidenceTaskId);
        experience.evidence = experience.evidence.filter(
          (f) => f.id !== mutation.id,
        );
        response = { removed: true };
      } else if (url.pathname === "/api/evidence" && request.method === "GET") {
        await call("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "image/jpeg" }],
          body: portrait.toString("base64"),
        });
        return;
      } else {
        status = 503;
        response = { error: "Disabled in isolated evidence check" };
      }
      await call("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(response)).toString("base64"),
      });
    } catch (error) {
      fixtureError = error;
      console.error(error.message);
    }
  });
  await call("Page.enable");
  await call("Fetch.enable", {
    patterns: [{ urlPattern: base + "/api/*", requestStage: "Request" }],
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const navigate = async (route) => {
    await call("Page.navigate", { url: base + route });
    await sleep(2500);
  };
  const clickText = async (text) => {
    for (let i = 0; i < 80; i++) {
      if (
        await evalPage(
          `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true})()`,
        )
      )
        return;
      await sleep(250);
    }
    await fs.writeFile(
      path.join(root, "failure.png"),
      Buffer.from(
        (await call("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
    console.log(await evalPage("document.body.innerText.slice(0,1400)"));
    assert.fail("Missing enabled button: " + text + ". Preview: " + root);
  };
  const capture = async (name) => {
    await fs.writeFile(
      path.join(root, name),
      Buffer.from(
        (await call("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
  };

  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate("/me/bookings/" + evidenceTaskId);
  const completionDisabled = () =>
    evalPage(
      `([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Submit completion')).disabled`,
    );
  const choose = async (image) => {
    const content = image
      ? "await (await fetch('/avatars/default-profile.jpg')).arrayBuffer()"
      : "new TextEncoder().encode('%PDF-1.7 fixture')";
    return evalPage(
      `(async()=>{const input=document.querySelector('input[aria-label="Choose completion evidence"]');const dt=new DataTransfer();const bytes=${content};dt.items.add(new File([bytes],${JSON.stringify(image ? "portrait.jpg" : "delivery.pdf")},{type:${JSON.stringify(image ? "image/jpeg" : "application/pdf")}}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  };

  await sleep(1200);
  assert.equal(await completionDisabled(), true);
  await evalPage(
    `(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(4*1024*1024+1)],'oversize.png',{type:'image/png'}));const i=document.querySelector('input[aria-label="Choose completion evidence"]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await sleep(200);
  assert.equal(
    await evalPage(
      `document.querySelector('.evidence-workflow').innerText.includes('4 MB')`,
    ),
    true,
  );
  assert.equal(uploads.length, 0);
  await choose(true);
  await sleep(600);
  assert.equal(uploads.length, 0);
  assert.equal(
    await evalPage(
      `Boolean(document.querySelector('.evidence-selection img')?.src.startsWith('blob:'))`,
    ),
    true,
  );
  await evalPage(
    `document.querySelector('.evidence-selection').scrollIntoView({block:"center"})`,
  );
  await capture("evidence-selected-mobile.png");
  await clickText("Messages");
  await clickText("Work & evidence");
  assert.equal(
    await evalPage(
      `document.querySelectorAll('.evidence-selection img').length`,
    ),
    1,
  );
  await evalPage(
    `document.querySelector('button[aria-label="Remove selected file portrait.jpg"]').click()`,
  );
  await sleep(200);
  assert.equal(
    await evalPage(`Boolean(document.querySelector('.evidence-selection'))`),
    false,
  );
  await choose(false);
  await sleep(400);
  assert.equal(
    await evalPage(
      `document.querySelector('.evidence-document-preview')?.href.startsWith('blob:')`,
    ),
    true,
  );
  await clickText("Upload");
  await sleep(500);
  await clickText("Cancel upload");
  await sleep(500);
  assert.equal(
    await evalPage(
      `document.querySelector('.evidence-file-status').textContent.includes('cancelled')`,
    ),
    true,
  );
  if (pendingUpload) {
    await call("Fetch.failRequest", {
      requestId: pendingUpload,
      errorReason: "Aborted",
    }).catch(() => {});
    pendingUpload = null;
  }
  uploadMode = "complete";
  await clickText("Retry");
  await sleep(1400);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0], uploads[1]);
  assert.equal(experience.evidence.length, 1);
  assert.equal(await completionDisabled(), false);
  assert.equal(
    await evalPage(
      `document.querySelector('.evidence-attached').innerText.includes('completion not submitted')`,
    ),
    true,
  );
  assert.equal(
    await evalPage(`document.documentElement.scrollWidth<=innerWidth`),
    true,
  );
  await evalPage(
    `document.querySelector('.evidence-workflow').scrollIntoView({block:"center"})`,
  );
  await capture("evidence-attached-mobile.png");
  await evalPage(
    `window.confirm=()=>true;document.querySelector('button[aria-label="Remove attachment delivery.pdf"]').click()`,
  );
  await sleep(900);
  assert.ok(mutation.id);
  assert.equal(experience.evidence.length, 0);
  assert.equal(await completionDisabled(), true);
  snapshot.jobs[0].status = "Ready for review";
  snapshot.jobs[0].completion = "Delivered to the office";
  snapshot.jobs[0].payment.state = "Submitted";
  snapshot.jobs[0].payment.reviewDeadline =
    Math.floor(Date.now() / 1000) + 2 * 86400;
  snapshot.jobs[0].payment.operations = ["dispute"];
  experience.evidence = [
    {
      id: "67031f48-9dda-4a62-8a8e-1f9d5705dff2",
      name: "delivery.jpg",
      mime: "image/jpeg",
      bytes: 100,
      mine: true,
      created_at: new Date().toISOString(),
    },
  ];
  await navigate("/me/bookings/" + evidenceTaskId);
  await sleep(600);
  assert.equal(
    await evalPage(
      `Boolean(document.querySelector('button[aria-label^="Remove attachment"]'))`,
    ),
    false,
  );
  assert.equal(
    await evalPage(`Boolean(document.querySelector('.evidence-picker'))`),
    false,
  );
  assert.equal(
    await evalPage(
      `document.querySelector('.evidence-attached').innerText.includes('Submitted evidence')`,
    ),
    true,
  );
  await evalPage(
    `document.querySelector('.evidence-workflow').scrollIntoView({block:"center"})`,
  );
  await capture("evidence-submitted-mobile.png");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evalPage(
    `document.querySelector('.booking-work-content').scrollIntoView({block:"center"})`,
  );
  await capture("evidence-submitted-desktop.png");
  if (fixtureError) throw fixtureError;
  console.log(
    JSON.stringify(
      {
        status: "passed",
        screenshots: root,
        checks: [
          "local image and PDF previews before upload",
          "oversized files are rejected before upload",
          "remove selection sends no upload",
          "draft survives tab changes",
          "cancel aborts transfer",
          "retry retains upload ID",
          "confirmed attachment unlocks required completion",
          "remove attached file re-enforces requirement",
          "submitted evidence is read-only",
          "no mobile overflow",
        ],
      },
      null,
      2,
    ),
  );
  await call("Browser.close");
} finally {
  socket?.close();
  browser.kill();
}
