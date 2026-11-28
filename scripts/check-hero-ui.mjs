// Optional isolated browser check: npm's ordinary tests do not launch Chrome.
// Every /api request is intercepted; fixtures never reach Supabase or a wallet.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { editingSnapshot } from "../tests/fixtures/marketplace-editing.mts";

const base = process.env.CAMPUSCREW_UI_ORIGIN ?? "http://localhost:3000";
if (new URL(base).hostname !== "localhost")
  throw Error("This check is restricted to localhost.");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "campuscrew-hero-ui-"));
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
  const snapshot = editingSnapshot();
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
  const capture = async (name) => {
    await fs.writeFile(
      path.join(root, name),
      Buffer.from(
        (await call("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
  };

  await navigate("/");
  for (let i = 0; i < 120; i++) {
    if (await evalPage(`Boolean(document.querySelector('.hero-sky-panel'))`))
      break;
    await sleep(250);
  }
  await sleep(800);
  await capture("hero-initial.png");
  assert.equal(
    await evalPage(
      `document.querySelector('#home-title').innerText.split(String.fromCharCode(10)).join(' ')`,
    ),
    "Campus task marketplace.",
  );
  assert.equal(
    await evalPage(
      `document.querySelector('.home-hero-copy > p:nth-of-type(2)').textContent`,
    ),
    "Book a service, get an errand done, or find paid work around campus.",
  );
  assert.equal(
    await evalPage(`document.querySelectorAll('.crew-flow-node').length`),
    6,
  );
  assert.equal(
    await evalPage(`Boolean(document.querySelector('.home-hero-art img'))`),
    false,
  );
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-sky-panel')).backgroundImage.includes('campus-sky.png')`,
    ),
    true,
  );
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-sky')).animationDuration`,
    ),
    "160s",
  );
  assert.equal(
    await evalPage(
      `document.querySelectorAll('.sidebar-edge svg,.sidebar-edge-handle').length`,
    ),
    0,
    "No visible collapse icon",
  );
  assert.ok(
    await evalPage(
      `getComputedStyle(document.querySelector('.home-title-lead')).fontFamily.includes('Plus Jakarta Sans')`,
    ),
    "Campus task uses Plus Jakarta Sans",
  );
  assert.ok(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-atmosphere'),'::after').backgroundImage.includes('linear-gradient')`,
    ),
    "Text-side wash keeps the sky around the pulses",
  );
  assert.equal(
    await evalPage(
      `Math.round(document.querySelector('.workspace-sidebar').getBoundingClientRect().width)`,
    ),
    220,
    "Slightly narrower desktop sidebar",
  );
  assert.ok(
    await evalPage(
      `(()=>{const a=document.querySelector('.hero-atmosphere').getBoundingClientRect(),b=document.querySelector('.home-hero').getBoundingClientRect();return a.width===b.width&&a.height===b.height})()`,
    ),
    "Sky covers the full hero",
  );
  const hoverSidebarEdge = async () => {
    const r = await evalPage(
      `(()=>{const r=document.querySelector('.sidebar-edge').getBoundingClientRect();return {x:r.x+r.width/2,y:200}})()`,
    );
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 600,
      y: 200,
    });
    await sleep(600);
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...r });
    await sleep(1000);
  };
  await hoverSidebarEdge();
  assert.equal(
    await evalPage(
      `document.querySelector('.marketplace-shell').dataset.sidebar`,
    ),
    "collapsed",
    "Border hover collapses",
  );
  await hoverSidebarEdge();
  assert.equal(
    await evalPage(
      `document.querySelector('.marketplace-shell').dataset.sidebar`,
    ),
    "expanded",
    "Border hover expands",
  );
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 600,
    y: 200,
  });
  const motionSample = () =>
    evalPage(
      `JSON.stringify([getComputedStyle(document.querySelector('.hero-sky')).transform,getComputedStyle(document.querySelector('.crew-flow-signal')).strokeDashoffset])`,
    );
  const initialMotion = await motionSample();
  await sleep(500);
  assert.notEqual(
    await motionSample(),
    initialMotion,
    "Sky and connector animation progress",
  );
  for (const width of [1920, 1440, 1280, 1100, 1024, 800]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(200);
    assert.equal(
      await evalPage(`document.documentElement.scrollWidth<=innerWidth`),
      true,
      "No overflow at " + width,
    );
    const alignment = await evalPage(
      `(()=>{const center=s=>{const r=document.querySelector(s).getBoundingClientRect();return r.y+r.height/2};return {logo:center('.workspace-sidebar .brand-mark'),header:center('.workspace-header'),crumb:center('.workspace-crumb'),profile:center('.pilot-profile-button')}})()`,
    );
    assert.ok(
      Math.abs(alignment.logo - alignment.header) < 1,
      "Logo is centered in header at " +
        width +
        ": " +
        JSON.stringify(alignment),
    );
    assert.ok(
      Math.abs(alignment.logo - alignment.crumb) < 1,
      "Logo and breadcrumb align at " + width,
    );
    assert.ok(
      Math.abs(alignment.logo - alignment.profile) < 1,
      "Logo and profile align at " + width,
    );
    if (width >= 1280) {
      assert.ok(
        await evalPage(
          `[...document.querySelectorAll('.crew-flow-hub,.crew-flow-outcome')].every(e=>{const r=e.getBoundingClientRect();return [...e.children].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left+2&&b.right<=r.right-2})})`,
        ),
        "Diagram text and icons fit inside cards at " + width,
      );
    } else {
      assert.equal(
        await evalPage(
          `getComputedStyle(document.querySelector('.home-hero-art')).display`,
        ),
        "none",
        "Diagram hidden before labels get cramped",
      );
    }
    if ([1920, 1440, 1280, 1100].includes(width)) {
      await capture(`hero-${width}.png`);
      await sleep(1600);
      await capture(`hero-${width}-motion.png`);
    }
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evalPage(`document.getAnimations().forEach(a=>a.pause())`);
  await evalPage(
    `document.querySelector('.hero-sky').getAnimations()[0].currentTime=159999`,
  );
  const beforeWrap = (await call("Page.captureScreenshot", { format: "png" }))
    .data;
  await evalPage(
    `document.querySelector('.hero-sky').getAnimations()[0].currentTime=160000`,
  );
  const afterWrap = (await call("Page.captureScreenshot", { format: "png" }))
    .data;
  const wrapDelta = await evalPage(
    `(async()=>{const load=async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};const a=await load(${JSON.stringify(beforeWrap)}),b=await load(${JSON.stringify(afterWrap)});let delta=0;for(let i=0;i<a.length;i++)delta+=Math.abs(a[i]-b[i]);return delta/a.length;})()`,
  );
  assert.ok(
    wrapDelta < 0.5,
    "No visible jump at sky loop boundary: " + wrapDelta,
  );
  await evalPage(`document.getAnimations().forEach(a=>a.play())`);
  await evalPage(
    `document.querySelector('button[aria-label="Pause hero animation"]').click()`,
  );
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-sky')).animationPlayState`,
    ),
    "paused",
  );
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.crew-flow-signal')).animationPlayState`,
    ),
    "paused",
  );
  await evalPage(
    `document.querySelector('button[aria-label="Play hero animation"]').click()`,
  );
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-sky')).animationName`,
    ),
    "none",
  );
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.hero-motion-control')).display`,
    ),
    "none",
  );
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(200);
  assert.equal(
    await evalPage(
      `getComputedStyle(document.querySelector('.home-hero-art')).display`,
    ),
    "none",
  );
  assert.equal(
    await evalPage(
      `document.querySelector('.home-hero').getBoundingClientRect().height>=innerHeight-document.querySelector('.workspace-header').getBoundingClientRect().height`,
    ),
    true,
  );
  assert.equal(
    await evalPage(`document.documentElement.scrollWidth<=innerWidth`),
    true,
  );
  await capture("hero-mobile.png");
  // Sidebar must fit even on short laptop/landscape screens, with logout reserved.
  for (const collapsed of [false, true]) {
    for (const height of [900, 700, 600, 500, 400]) {
      await call("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evalPage(
        `(()=>{const b=document.querySelector('.sidebar-edge');if(b.getAttribute('aria-expanded')!==${JSON.stringify(collapsed ? "false" : "true")})b.click()})()`,
      );
      await sleep(300);
      assert.ok(
        await evalPage(
          `(()=>{const a=document.querySelector('.workspace-sidebar .brand-mark').getBoundingClientRect(),b=document.querySelector('.workspace-header').getBoundingClientRect();return Math.abs(a.y+a.height/2-(b.y+b.height/2))<1})()`,
        ),
        "Brand alignment holds in compact/icon sidebar",
      );
      const geometry = await evalPage(
        `(()=>{const s=document.querySelector('.sidebar-content'),f=document.querySelector('.sidebar-footer'),links=[...document.querySelectorAll('.workspace-sidebar nav a')],last=links.at(-1).getBoundingClientRect();return {height:innerHeight,scroll:s.scrollHeight,client:s.clientHeight,footer:f.getBoundingClientRect().top,logoutBottom:f.querySelector('button').getBoundingClientRect().bottom,lastBottom:last.bottom,overflow:getComputedStyle(s).overflowY}})()`,
      );
      assert.ok(
        geometry.logoutBottom <= height - 23,
        "Logout has bottom clearance: " +
          JSON.stringify({ height, collapsed, ...geometry }),
      );
      assert.ok(
        geometry.lastBottom <= geometry.footer - 5,
        "Navigation does not overlap footer: " +
          JSON.stringify({ height, collapsed, ...geometry }),
      );
      assert.ok(
        geometry.scroll <= geometry.client + 1,
        "No sidebar overflow: " +
          JSON.stringify({ height, collapsed, ...geometry }),
      );
      assert.notEqual(geometry.overflow, "auto");
      if (height === 600)
        await capture(`sidebar-${collapsed ? "icons" : "expanded"}-600.png`);
    }
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 667,
    height: 375,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(250);
  await evalPage(`document.querySelector('.menu-button').click()`);
  assert.ok(
    await evalPage(
      `document.querySelector('.sidebar-footer button').getBoundingClientRect().bottom<=innerHeight-23`,
    ),
    "Mobile landscape logout fits",
  );
  assert.ok(
    await evalPage(
      `document.querySelector('.sidebar-content').scrollHeight<=document.querySelector('.sidebar-content').clientHeight+1`,
    ),
    "Mobile landscape menu fits",
  );
  await capture("sidebar-mobile-landscape.png");
  assert.equal(mutation, undefined);
  if (fixtureError) throw fixtureError;
  console.log(
    JSON.stringify(
      {
        status: "passed",
        screenshots: root,
        checks: [
          "original headline and copy preserved",
          "Plus Jakarta Sans heading",
          "logo, breadcrumb and profile share one horizontal centre",
          "sky concentrated around the pulse diagram",
          "220px expanded sidebar",
          "invisible border hover collapses and expands",
          "six service nodes replace the girl",
          "exact supplied sky loads",
          "animation progresses over time",
          "sky loop boundary has no visible jump",
          "diagram cards fit at desktop widths",
          "pause/play controls stop both motions",
          "reduced-motion preference respected",
          "no overflow from mobile through desktop",
          "full-height mobile hero",
          "sidebar fits without scrolling down to 400px height",
          "logout bottom padding",
          "landscape menu fits",
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
