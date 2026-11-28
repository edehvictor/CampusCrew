import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair, Address } from "@stellar/stellar-sdk";
const db = new PGlite(),
  owner = Keypair.random().publicKey(),
  provider = Keypair.random().publicKey(),
  other = Keypair.random().publicKey();
let id;
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;",
  );
  for (const file of [
    "20261119000100_stellar_onboarding.sql",
    "20261121000100_stellar_escrow.sql",
    "20261123000100_marketplace_experience.sql",
    "20261123000200_reputation_queries.sql",
    "20261123000300_refund_notifications.sql",
    "20261127000100_provider_payout_receipts.sql",
    "20261127000200_dispute_dashboard.sql",
    "20261128000300_evidence_workflow.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
});
after(() => db.close());
beforeEach(async () => {
  await db.exec("truncate campuscrew_stellar_profiles cascade");
  id = randomUUID();
  for (const wallet of [owner, provider, other])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,'Test person','On campus',array['Errands'],array['On campus'])",
      [wallet],
    );
  await db.query(
    "insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values($1,$2,'Delivery','Errands','On campus','Today',1,'Deliver parcel')",
    [id, owner],
  );
  await db.query(
    "select campuscrew_stellar_apply($1,$2,1,'Today','Available')",
    [provider, id],
  );
  const app = (
    await db.query(
      "select id from campuscrew_stellar_applications where request_id=$1",
      [id],
    )
  ).rows[0].id;
  await db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [
    owner,
    id,
    app,
  ]);
  await db.query(
    "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$4,$5)",
    [
      owner,
      id,
      "a".repeat(64),
      Address.contract(Buffer.alloc(32, 1)).toString(),
      other,
    ],
  );
  await state("Funded");
});
const state = (s) =>
  db.query(
    "update campuscrew_stellar_escrows set chain_state=$1 where request_id=$2",
    [s, id],
  );
const upload = (file = randomUUID(), wallet = provider, path = "path/sha256") =>
  db
    .query(
      "select campuscrew_experience_evidence($1,$2,$3,'photo.png',$4,'image/png',100)",
      [wallet, id, file, path],
    )
    .then(() => file);
const remove = (file, wallet = provider) =>
  db.query("select campuscrew_remove_evidence($1,$2,$3)", [wallet, id, file]);
const prepare = () =>
  db.query(
    "insert into campuscrew_stellar_payment_intents(id,request_id,wallet,operation,tx_hash,expires_at,completion_note) values($1,$2,$3,'submit',$4,now()+interval '3 minutes','Delivered to office')",
    [randomUUID(), id, provider, randomUUID().replaceAll("-", "").repeat(2)],
  );
test("only the uploader can remove pre-completion evidence; removal preserves metadata and is idempotent", async () => {
  const f = await upload();
  await assert.rejects(remove(f, owner), /Only the selected provider/);
  await assert.rejects(remove(f, other), /Only the selected provider/);
  await remove(f);
  await remove(f);
  assert.ok(
    (
      await db.query(
        "select removed_at from campuscrew_booking_evidence where id=$1",
        [f],
      )
    ).rows[0].removed_at,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_booking_events where event_key like 'evidence-removed:%'",
      )
    ).rows[0].n,
    1,
  );
});
test("required evidence cannot be removed between preparing and approving a completion transaction", async () => {
  await db.query(
    "update campuscrew_stellar_tasks set evidence_required=true where id=$1",
    [id],
  );
  const f = await upload();
  await prepare();
  await assert.rejects(remove(f), /locked/);
  await assert.rejects(upload(randomUUID(), provider, "new"), /locked/);
  await db.query(
    "update campuscrew_stellar_payment_intents set status='failed' where request_id=$1",
    [id],
  );
  await remove(f);
  await assert.rejects(prepare(), /requires completion evidence/);
});
test("optional evidence is also frozen by an in-progress completion approval", async () => {
  const f = await upload();
  await prepare();
  await assert.rejects(remove(f), /locked/);
});
test("submitted, disputed and paid attachments cannot be removed; new dispute evidence is append-only", async () => {
  const f = await upload();
  for (const value of ["Submitted", "Disputed", "Paid", "Refundable"]) {
    await state(value);
    await assert.rejects(remove(f), /locked/);
  }
  await state("Disputed");
  const caseFile = await upload(randomUUID(), owner, "owner-case");
  await assert.rejects(remove(caseFile, owner), /Only the selected provider/);
});
test("removing a draft frees its quota, and repeated uploads never overwrite the original attachment", async () => {
  const f = await upload();
  await upload(f);
  await assert.rejects(upload(f, provider, "other-content"), /identifier/);
  await upload(randomUUID(), provider, "two");
  await upload(randomUUID(), provider, "three");
  await assert.rejects(
    upload(randomUUID(), provider, "four"),
    /three evidence/,
  );
  await remove(f);
  await assert.rejects(upload(f), /removed/);
  await upload(randomUUID(), provider, "four");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_booking_evidence where removed_at is null",
      )
    ).rows[0].n,
    3,
  );
});
test("browser database roles cannot bypass evidence removal authorization", async () => {
  const f = await upload();
  await db.exec("set role authenticated");
  try {
    await assert.rejects(remove(f), /permission denied/);
    await assert.rejects(
      db.query("update campuscrew_booking_evidence set removed_at=now()"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
