// Optional isolated browser check: npm's ordinary tests do not launch Chrome.
// Every /api request is intercepted; fixtures never reach Supabase or a wallet.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  editingSnapshot,
  editingTaskId,
} from "../tests/fixtures/marketplace-editing.mts";

const base = process.env.CAMPUSCREW_UI_ORIGIN ?? "http://localhost:3000";
if (new URL(base).hostname !== "localhost")
  throw Error("This check is restricted to localhost.");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "campuscrew-editing-ui-"));
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
  let snapshot = editingSnapshot();
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
      if (url.pathname === "/api/book-one") {
        if (request.method === "POST") {
          mutation = JSON.parse(request.postData);
          const task = snapshot.jobs[0];
          if (mutation.action === "edit-task") {
            assert.equal(mutation.revision, task.revision);
            Object.assign(task, {
              title: mutation.title,
              scope: mutation.scope,
              timing: mutation.timing,
              category: mutation.category,
              area: mutation.area,
              budget: mutation.budget,
              evidenceRequired: mutation.evidenceRequired,
              revision: task.revision + 1,
              updatedAt: new Date().toISOString(),
            });
          } else if (mutation.action === "edit-application") {
            assert.equal(mutation.revision, task.quotes[0].revision);
            assert.equal(mutation.taskRevision, task.revision);
            Object.assign(task.quotes[0], {
              amount: mutation.amount,
              availability: mutation.availability,
              note: mutation.note,
              revision: task.quotes[0].revision + 1,
              taskRevision: task.revision,
              updatedAt: new Date().toISOString(),
            });
          } else if (mutation.action === "withdraw") {
            task.quotes[0].withdrawnAt = new Date().toISOString();
            task.quotes[0].revision++;
            task.applicationCount = 0;
          } else throw Error("Unexpected fixture mutation: " + mutation.action);
        } else response = snapshot;
      } else if (url.pathname === "/api/stellar/balance") {
        response = {
          wallet: snapshot.account.wallet,
          network: "stellar-testnet",
          accountExists: true,
          hasUsdcTrustline: false,
          usdc: "12.5000000",
          xlm: "10010.0000000",
          checkedAt: new Date().toISOString(),
        };
      } else if (url.pathname === "/api/updates") status = 204;
      else {
        status = 503;
        response = { error: "Disabled in isolated UI fixture check" };
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
  await navigate("/me/tasks/" + editingTaskId);
  await clickText("Edit task");
  assert.deepEqual(
    await evalPage(
      `(()=>{const d=document.querySelector('dialog[open]');return {title:d.querySelector('[name=title]').value,amount:d.querySelector('[name=amount]').value,scope:d.querySelector('[name=scope]').value}})()`,
    ),
    {
      title: snapshot.jobs[0].title,
      amount: "1",
      scope: snapshot.jobs[0].scope,
    },
  );
  await capture("owner-edit-desktop.png");
  // A background snapshot may change while the user writes. Keep the opened
  // revision in the submitted command, so the database can reject stale edits.
  await evalPage(
    `(()=>{const d=document.querySelector('dialog[open]');d.querySelector('[name=scope]').value='Collect from the lodge reception';d.querySelector('[name=amount]').value='2.50';d.querySelector('form').requestSubmit()})()`,
  );
  await sleep(1200);
  assert.equal(mutation.action, "edit-task");
  assert.equal(mutation.budget, 2.5);
  assert.equal(mutation.revision, 1);
  await evalPage(`document.querySelector('details.applications').open=true`);
  assert.equal(
    await evalPage(
      `document.querySelector('.application-card-footer button').disabled`,
    ),
    true,
  );
  await capture("owner-awaiting-confirmation.png");
  snapshot = editingSnapshot("provider", true);
  mutation = undefined;
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate("/me/applications/" + editingTaskId);
  await clickText("Review & update application");
  assert.equal(
    await evalPage(
      `document.querySelector('dialog[open] [name=amount]').value`,
    ),
    "1",
  );
  assert.equal(
    await evalPage(`document.querySelector('.edit-task-context').open`),
    true,
  );
  assert.equal(
    await evalPage(`document.documentElement.scrollWidth<=innerWidth`),
    true,
  );
  await capture("provider-confirm-mobile.png");
  await clickText("Confirm updated application");
  await sleep(1200);
  assert.equal(mutation.action, "edit-application");
  assert.equal(mutation.taskRevision, 2);
  assert.equal(mutation.revision, 1);
  // Cancellation must leave the application intact and issue no mutation.
  mutation = undefined;
  await clickText("Edit application");
  await clickText("Cancel");
  assert.equal(mutation, undefined);
  assert.equal(
    await evalPage(`Boolean(document.querySelector('dialog[open]'))`),
    false,
  );
  // Funded-posting UI checks still intercept all APIs and never open a wallet.
  snapshot = editingSnapshot("owner");
  Object.assign(snapshot.jobs[0], {
    lifecycleReady: true,
    publication: {
      fundingTx: "a".repeat(64),
      budget: 1,
      expiresAt: 2000000000,
      cancellationTx: null,
    },
  });
  await navigate("/me/tasks/" + editingTaskId);
  await clickText("Edit task");
  assert.equal(
    await evalPage(
      `document.querySelector('dialog[open] [name=amount]').readOnly`,
    ),
    true,
  );
  await clickText("Cancel");
  await evalPage(
    `document.querySelector('button[aria-label="Post a task"]').click()`,
  );
  assert.equal(
    await evalPage(
      `document.querySelector('dialog[open] [type=submit]').disabled`,
    ),
    true,
  );
  assert.match(
    await evalPage(`document.querySelector('dialog[open]').innerText`),
    /Fund.*publish/,
  );
  await evalPage(
    `document.querySelector('button[aria-label="Close dialog"]').click()`,
  );
  snapshot = editingSnapshot("provider");
  Object.assign(snapshot.jobs[0], {
    lifecycleReady: true,
    publication: {
      fundingTx: "a".repeat(64),
      budget: 1,
      expiresAt: 2000000000,
      cancellationTx: null,
    },
  });
  await navigate("/me/applications/" + editingTaskId);
  await evalPage(`window.confirm=()=>true`);
  await clickText("Withdraw application");
  await sleep(1000);
  assert.equal(mutation.action, "withdraw");
  assert.equal(
    await evalPage(`document.body.innerText.includes('Withdrawn')`),
    true,
  );
  await clickText("Apply again");
  assert.equal(
    await evalPage(`document.querySelector('dialog[open] [name=amount]').max`),
    "1",
  );
  await capture("withdrawn-reapply-mobile.png");
  await evalPage(
    `document.querySelector('button[aria-label="Close dialog"]').click()`,
  );
  await evalPage(`document.querySelector('.pilot-profile-button').click()`);
  for (let i = 0; i < 80; i++) {
    if (
      await evalPage(
        `document.querySelector('.balance-value')?.textContent==='12.50' && [...document.querySelectorAll('.account-menu .user-avatar img')].every(i=>i.complete&&i.naturalWidth>0)`,
      )
    )
      break;
    await sleep(250);
  }
  assert.deepEqual(
    await evalPage(
      `(()=>{const d=document.querySelector('.account-menu'),r=d.getBoundingClientRect();return {amount:d.querySelector('.balance-value').textContent,balances:d.querySelectorAll('.profile-balance-amounts dd').length,folded:!d.querySelector('.account-wallet-details').open,short:r.height<420,fits:r.left>=0&&r.right<=innerWidth,portrait:d.querySelector('.user-avatar img').naturalWidth>0}})()`,
    ),
    {
      amount: "12.50",
      balances: 1,
      folded: true,
      short: true,
      fits: true,
      portrait: true,
    },
  );
  await capture("profile-menu-mobile.png");
  await evalPage(`document.querySelector('.account-wallet-details').open=true`);
  assert.equal(
    await evalPage(
      `document.querySelector('button[aria-label="Copy wallet address"]').getClientRects().length>0`,
    ),
    true,
  );
  await evalPage(
    `document.querySelector('.account-wallet-details .wallet-tools').open=true`,
  );
  assert.equal(
    await evalPage(
      `document.querySelector('.wallet-setup-step button').getClientRects().length>0`,
    ),
    true,
  );
  await capture("profile-wallet-tools-mobile.png");
  await evalPage(
    `document.querySelector('.account-wallet-details').open=false`,
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await capture("profile-menu-desktop.png");
  if (fixtureError) throw fixtureError;
  console.log(
    JSON.stringify(
      {
        status: "passed",
        screenshots: root,
        checks: [
          "prefilled task",
          "saved task payload",
          "stale application cannot be selected",
          "mobile confirmation form",
          "application revision payload",
          "cancel sends no mutation",
          "funded budget cannot be edited",
          "unconfigured funded publishing is disabled",
          "withdrawal sends the current revision",
          "reapplication respects the funded cap",
          "compact profile fits on mobile with one balance",
          "exact shared portrait loads",
          "copy and test-wallet setup remain accessible behind Wallet details",
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
