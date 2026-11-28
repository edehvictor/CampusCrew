import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair, Address } from "@stellar/stellar-sdk";
import { mutationSchema } from "../src/features/book-one/types/pilot.ts";
import { notificationPath } from "../src/features/book-one/services/notification-path.ts";
const db = new PGlite();
test("edit alerts lead to the appropriate task or application independently of user-written names", () => {
  assert.equal(
    notificationPath("task-id", "task-edited:task-id:2"),
    "/me/applications/task-id",
  );
  assert.equal(
    notificationPath("task-id", "application-edited:app-id:2"),
    "/me/tasks/task-id",
  );
  assert.equal(
    notificationPath("task-id", "application:app-id"),
    "/me/tasks/task-id",
  );
  assert.equal(
    notificationPath("task-id", "chain:task-id:Funded"),
    "/me/bookings/task-id",
  );
  assert.equal(notificationPath(null, "general"), "/me/notifications");
});
const owner = Keypair.random().publicKey(),
  provider = Keypair.random().publicKey(),
  other = Keypair.random().publicKey();
let id, app;
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;",
  );
  for (const name of [
    "20261119000100_stellar_onboarding.sql",
    "20261121000100_stellar_escrow.sql",
    "20261123000100_marketplace_experience.sql",
    "20261123000200_reputation_queries.sql",
    "20261128000100_task_application_editing.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
});
after(() => db.close());
beforeEach(async () => {
  await db.exec("truncate campuscrew_stellar_profiles cascade");
  id = randomUUID();
  for (const [wallet, name] of [
    [owner, "Task owner"],
    [provider, "Campus provider"],
    [other, "Other student"],
  ])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,$2,'On campus',array['Errands'],array['On campus'])",
      [wallet, name],
    );
  await db.query(
    "insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values($1,$2,'Deliver a document','Errands','On campus','Tomorrow',1,'Collect from the main gate')",
    [id, owner],
  );
  await apply();
  app = (
    await db.query(
      "select id from campuscrew_stellar_applications where request_id=$1",
      [id],
    )
  ).rows[0].id;
});
const apply = (taskRevision = 1, wallet = provider) =>
  db.query(
    "select campuscrew_stellar_apply_v2($1,$2,$3,1,'Tomorrow','I can deliver it')",
    [wallet, id, taskRevision],
  );
const editTask = (
  revision = 1,
  wallet = owner,
  scope = "Collect from the lodge",
  budget = 2,
) =>
  db.query(
    "select campuscrew_stellar_edit_task($1,$2,$3,'Deliver a document','Errands','On campus','Tomorrow',$4,$5,true)",
    [wallet, id, revision, budget, scope],
  );
const editApplication = (
  revision = 1,
  taskRevision = 1,
  wallet = provider,
  amount = 1.5,
  application = app,
) =>
  db.query(
    "select campuscrew_stellar_edit_application($1,$2,$3,$4,$5,$6,'Afternoon','I can deliver after class')",
    [wallet, id, application, revision, taskRevision, amount],
  );
const select = (taskRevision = 1, applicationRevision = 1, wallet = owner) =>
  db.query("select campuscrew_stellar_select_provider_v2($1,$2,$3,$4,$5)", [
    wallet,
    id,
    app,
    taskRevision,
    applicationRevision,
  ]);
const board = async (wallet) =>
  (await db.query("select campuscrew_stellar_board($1) jobs", [wallet])).rows[0]
    .jobs;

test("only the owner can edit an open task; revisions and prefilled fields survive reload", async () => {
  await assert.rejects(editTask(1, provider), /Only the task owner/);
  await editTask();
  const task = (await board(owner))[0];
  assert.equal(task.scope, "Collect from the lodge");
  assert.equal(task.budget, 2);
  assert.equal(task.revision, 2);
  assert.ok(task.updatedAt);
  assert.equal(task.quotes[0].taskRevision, 1);
  assert.equal(
    (
      await db.query(
        "select evidence_required from campuscrew_stellar_tasks where id=$1",
        [id],
      )
    ).rows[0].evidence_required,
    true,
  );
});
test("only the applicant can edit their offer and an edit never creates duplicate applications", async () => {
  await assert.rejects(editApplication(1, 1, other), /Only the applicant/);
  await assert.rejects(editApplication(1, 1, owner), /Only the applicant/);
  await editApplication();
  const task = (await board(provider))[0];
  assert.equal(task.quotes.length, 1);
  assert.equal(task.quotes[0].id, app);
  assert.equal(task.quotes[0].amount, 1.5);
  assert.equal(task.quotes[0].revision, 2);
  assert.ok(task.quotes[0].updatedAt);
  assert.equal(task.quotes[0].availability, "Afternoon");
});
test("task changes block old quotes until applicants explicitly confirm against the latest revision", async () => {
  await editTask();
  await assert.rejects(select(1, 1), /task changed/);
  await assert.rejects(select(2, 1), /must review/);
  await assert.rejects(editApplication(1, 1), /task changed/);
  await editApplication(1, 2);
  await select(2, 2);
  const booking = (
    await db.query(
      "select * from campuscrew_stellar_bookings where request_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(Number(booking.amount), 1.5);
});
test("selection rejects a stale price after an applicant edits, and captures the reviewed price", async () => {
  await editApplication();
  await assert.rejects(select(1, 1), /application changed/);
  await select(1, 2);
  await select(1, 2);
  assert.equal(
    (await db.query("select count(*)::int n from campuscrew_stellar_bookings"))
      .rows[0].n,
    1,
  );
  assert.equal(
    Number(
      (await db.query("select amount from campuscrew_stellar_bookings")).rows[0]
        .amount,
    ),
    1.5,
  );
});
test("selection freezes task and applications before escrow exists; direct updates cannot bypass the lock", async () => {
  await select();
  await assert.rejects(editTask(), /locked/);
  await assert.rejects(editApplication(), /locked/);
  await assert.rejects(
    db.query("update campuscrew_stellar_tasks set budget=0.01 where id=$1", [
      id,
    ]),
    /locked/,
  );
  await assert.rejects(
    db.query(
      "update campuscrew_stellar_applications set amount=0.01 where id=$1",
      [app],
    ),
    /locked/,
  );
});
test("escrow continues to use the locked selected price after editing", async () => {
  await editApplication();
  await select(1, 2);
  const { rows } = await db.query(
    "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6) terms",
    [
      owner,
      id,
      "ab".repeat(32),
      Address.contract(Buffer.alloc(32, 1)).toString(),
      Address.contract(Buffer.alloc(32, 2)).toString(),
      other,
    ],
  );
  assert.equal(rows[0].terms.amount, 1.5);
  await assert.rejects(editApplication(2), /locked/);
});
test("old editors cannot silently overwrite newer changes", async () => {
  await editTask();
  await assert.rejects(
    editTask(1, owner, "Old browser tab", 3),
    /task changed/,
  );
  await editApplication(1, 2);
  await assert.rejects(
    editApplication(1, 2, provider, 0.01),
    /application changed/,
  );
  const task = (await board(owner))[0];
  assert.equal(task.budget, 2);
  assert.equal(task.quotes[0].amount, 1.5);
});
test("application and task edits notify the other person once per actual revision", async () => {
  await editTask();
  await editTask(2); // exact duplicate is a no-op
  await editApplication(1, 2);
  await editApplication(2, 2);
  const notices = (
    await db.query(
      "select wallet,title from campuscrew_notifications where event_key like '%-edited:%' order by title",
    )
  ).rows;
  assert.equal(notices.length, 2);
  assert.ok(
    notices.some(
      (n) =>
        n.wallet === provider &&
        n.title.startsWith("Task owner updated the task"),
    ),
  );
  assert.ok(
    notices.some(
      (n) =>
        n.wallet === owner &&
        n.title.startsWith("Campus provider updated their application"),
    ),
  );
});
test("changed service coverage requires a matching profile when the provider confirms", async () => {
  await db.query(
    "update campuscrew_stellar_profiles set skills=array['Cleaning'],coverage=array['On campus'] where wallet=$1",
    [provider],
  );
  await assert.rejects(editApplication(), /service and coverage/);
  await assert.rejects(apply(1, owner), /Task unavailable/);
});
test("new applications and legacy clients cannot skip task-version checks", async () => {
  await editTask();
  await assert.rejects(apply(1, other), /task changed/);
  await apply(2, other);
  assert.equal((await board(other))[0].quotes[0].taskRevision, 2);
  await assert.rejects(
    db.query(
      "select campuscrew_stellar_apply($1,$2,1,'Tomorrow','Old client')",
      [other, id],
    ),
    /Refresh CampusCrew/,
  );
  await assert.rejects(
    db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [
      owner,
      id,
      app,
    ]),
    /Refresh CampusCrew/,
  );
});
test("editing validates amounts and ownership fields at both API and database boundaries", async () => {
  const task = {
    action: "edit-task",
    requestId: id,
    revision: 1,
    title: "A task",
    category: "Errands",
    area: "On campus",
    timing: "Tomorrow",
    budget: 1,
    scope: "Deliver it",
    evidenceRequired: false,
  };
  assert.equal(
    mutationSchema.parse({ ...task, wallet: other }).wallet,
    undefined,
  );
  for (const fields of [
    { budget: -1 },
    { revision: 0 },
    { scope: " " },
    { category: "Anything" },
  ])
    assert.equal(
      mutationSchema.safeParse({ ...task, ...fields }).success,
      false,
    );
  await assert.rejects(editApplication(1, 1, provider, -1), /check constraint/);
  await assert.rejects(editTask(1, owner, "", 2), /Fill in/);
  await assert.rejects(
    db.query(
      "update campuscrew_stellar_tasks set requester_wallet=$1 where id=$2",
      [other, id],
    ),
    /identity cannot change/,
  );
  await assert.rejects(
    db.query(
      "update campuscrew_stellar_applications set provider_wallet=$1 where id=$2",
      [other, app],
    ),
    /identity cannot change/,
  );
});
test("browser roles cannot bypass the server to edit or select", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(editTask(), /permission denied/);
      await assert.rejects(editApplication(), /permission denied/);
      await assert.rejects(select(), /permission denied/);
      await assert.rejects(
        db.query("update public.campuscrew_stellar_tasks set budget=0.01"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
test("interleaved edit and selection requests cannot accept a silently changed quote", async () => {
  const outcomes = await Promise.allSettled([editApplication(), select(1, 1)]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  const task = (await board(owner))[0];
  if (task.accepted)
    assert.equal(
      Number(
        (await db.query("select amount from campuscrew_stellar_bookings"))
          .rows[0].amount,
      ),
      1,
    );
  else assert.equal(task.quotes[0].amount, 1.5);
});
