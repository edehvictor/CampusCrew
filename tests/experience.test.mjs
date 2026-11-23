import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Keypair, Address } from "@stellar/stellar-sdk";
import { evidenceMime } from "../src/features/book-one/evidence-validation.ts";
const db = new PGlite(),
  owner = Keypair.random().publicKey(),
  provider = Keypair.random().publicKey(),
  stranger = Keypair.random().publicKey();
let id, app;
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
  for (const wallet of [owner, provider, stranger])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,'Test student','On campus',array['Errands'],array['On campus'])",
      [wallet],
    );
  await db.query(
    "insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values($1,$2,'Test delivery','Errands','On campus','Tomorrow',1,'Deliver a document')",
    [id, owner],
  );
  await db.query(
    "select campuscrew_stellar_apply($1,$2,1,'Tomorrow','I can deliver')",
    [provider, id],
  );
  app = (
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
    "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)",
    [
      owner,
      id,
      "ab".repeat(32),
      Address.contract(Buffer.alloc(32, 1)).toString(),
      Address.contract(Buffer.alloc(32, 2)).toString(),
      stranger,
    ],
  );
});
test("booking messages are participant-only and retries create one message and notice", async () => {
  await assert.rejects(
    db.query("select campuscrew_experience_message($1,$2,'Hi',$3)", [
      stranger,
      id,
      randomUUID(),
    ]),
    /private/,
  );
  const client = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query(
      "select campuscrew_experience_message($1,$2,'On my way',$3)",
      [provider, id, client],
    );
  assert.equal(
    (await db.query("select count(*)::int n from campuscrew_booking_messages"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_notifications where event_key like 'message:%'",
      )
    ).rows[0].n,
    1,
  );
});
test("state notifications are deduplicated when payment is checked repeatedly", async () => {
  for (let i = 0; i < 3; i++)
    await db.query(
      "update campuscrew_stellar_escrows set chain_state='Funded',checked_ledger=checked_ledger+1 where request_id=$1",
      [id],
    );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_notifications where event_key like 'chain:%'",
      )
    ).rows[0].n,
    2,
  );
});
test("only paid booking participants can review once, and both reviews unlock publication", async () => {
  await assert.rejects(
    db.query("select campuscrew_experience_review($1,$2,5,'Good')", [
      owner,
      id,
    ]),
    /confirmed payout/,
  );
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Paid',settlement_tx=$2 where request_id=$1",
    [id, "cd".repeat(32)],
  );
  await assert.rejects(
    db.query("select campuscrew_experience_review($1,$2,5,'Good')", [
      stranger,
      id,
    ]),
    /private/,
  );
  await db.query("select campuscrew_experience_review($1,$2,5,'Good')", [
    owner,
    id,
  ]);
  await assert.rejects(
    db.query("select campuscrew_experience_review($1,$2,5,'Again')", [
      owner,
      id,
    ]),
    /duplicate key/,
  );
  let visible = (
    await db.query("select campuscrew_experience_review_visible($1,now()) v", [
      id,
    ])
  ).rows[0].v;
  assert.equal(visible, false);
  await db.query(
    "select campuscrew_experience_review($1,$2,4,'Clear instructions')",
    [provider, id],
  );
  visible = (
    await db.query("select campuscrew_experience_review_visible($1,now()) v", [
      id,
    ])
  ).rows[0].v;
  assert.equal(visible, true);
  const publicId = (
    await db.query(
      "select public_id from campuscrew_stellar_profiles where wallet=$1",
      [provider],
    )
  ).rows[0].public_id;
  const profile = (
    await db.query("select campuscrew_experience_profiles($1) p", [publicId])
  ).rows[0].p[0];
  assert.equal(profile.stats.completed, 1);
  assert.equal(profile.stats.reviewCount, 1);
  assert.equal(Number(profile.stats.rating), 5);
});
test("review window expires from settlement rather than review submission", async () => {
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Paid',settlement_tx=$2 where request_id=$1",
    [id, "ef".repeat(32)],
  );
  await db.query("select campuscrew_experience_review($1,$2,3,'Fine')", [
    owner,
    id,
  ]);
  await db.query(
    "update campuscrew_stellar_escrows set settled_at=now()-interval '15 days' where request_id=$1",
    [id],
  );
  assert.equal(
    (
      await db.query(
        "select campuscrew_experience_review_visible($1,now()) v",
        [id],
      )
    ).rows[0].v,
    true,
  );
  await assert.rejects(
    db.query("select campuscrew_experience_review($1,$2,5,'Late')", [
      provider,
      id,
    ]),
    /window has closed/,
  );
});
test("evidence is private, optional by default, and required evidence is enforced before submission", async () => {
  const eid = randomUUID();
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Funded' where request_id=$1",
    [id],
  );
  await assert.rejects(
    db.query(
      "select campuscrew_experience_evidence($1,$2,$3,'photo.png','path','image/png',100)",
      [owner, id, eid],
    ),
    /selected provider/,
  );
  await db.query(
    "update campuscrew_stellar_tasks set evidence_required=true where id=$1",
    [id],
  );
  const intent = randomUUID();
  await assert.rejects(
    db.query(
      "insert into campuscrew_stellar_payment_intents(id,request_id,wallet,operation,tx_hash,expires_at,completion_note) values($1,$2,$3,'submit',$4,now()+interval '5 minutes','Done')",
      [intent, id, provider, "aa".repeat(32)],
    ),
    /requires completion evidence/,
  );
  await db.query(
    "select campuscrew_experience_evidence($1,$2,$3,'photo.png','path','image/png',100)",
    [provider, id, eid],
  );
  await db.query(
    "insert into campuscrew_stellar_payment_intents(id,request_id,wallet,operation,tx_hash,expires_at,completion_note) values($1,$2,$3,'submit',$4,now()+interval '5 minutes','Done')",
    [intent, id, provider, "aa".repeat(32)],
  );
  assert.equal(
    (await db.query("select count(*)::int n from campuscrew_booking_evidence"))
      .rows[0].n,
    1,
  );
});
test("browser roles cannot read private activity or call privileged review functions", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      for (const table of [
        "campuscrew_notifications",
        "campuscrew_booking_messages",
        "campuscrew_booking_evidence",
        "campuscrew_reviews",
        "campuscrew_push_subscriptions",
      ])
        await assert.rejects(
          db.query("select * from " + table),
          /permission denied/,
        );
      await assert.rejects(
        db.query("select campuscrew_experience_review($1,$2,5,'Good')", [
          owner,
          id,
        ]),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
test("evidence upload rejects disguised executable content", () => {
  assert.equal(
    evidenceMime(new TextEncoder().encode("<svg onload=alert(1)>")),
    null,
  );
  assert.equal(
    evidenceMime(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(
    evidenceMime(new TextEncoder().encode("%PDF-1.7")),
    "application/pdf",
  );
});

test("confirmed refund receipts notify both people exactly once", async () => {
  const intent = randomUUID();
  await db.query(
    "insert into campuscrew_stellar_payment_intents(id,request_id,wallet,operation,tx_hash,expires_at) values($1,$2,$3,'refund',$4,now()+interval '5 minutes')",
    [intent, id, owner, "ee".repeat(32)],
  );
  for (let i = 0; i < 2; i++)
    await db.query(
      "update campuscrew_stellar_payment_intents set status='confirmed' where id=$1",
      [intent],
    );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_notifications where event_key like 'refund:%'",
      )
    ).rows[0].n,
    2,
  );
});
