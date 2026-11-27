import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Account, Address, Keypair } from "@stellar/stellar-sdk";
import { PGlite } from "@electric-sql/pglite";
import { isResolverWallet } from "../src/features/book-one/auth/resolver-access.ts";
import {
  awardUnits,
  buildResolverTransaction,
} from "../src/features/book-one/services/resolver-transaction.ts";
import { verifySignedTransaction } from "../src/features/book-one/services/stellar-escrow.ts";
const db = new PGlite(),
  owner = Keypair.random(),
  provider = Keypair.random(),
  resolver = Keypair.random(),
  stranger = Keypair.random();
let id;
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;",
  );
  for (const name of [
    "20261119000100_stellar_onboarding.sql",
    "20261121000100_stellar_escrow.sql",
    "20261123000100_marketplace_experience.sql",
    "20261123000200_reputation_queries.sql",
    "20261123000300_refund_notifications.sql",
    "20261127000100_provider_payout_receipts.sql",
    "20261127000200_dispute_dashboard.sql",
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
  for (const key of [owner, provider, stranger])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,'Test person','On campus',array['Errands'],array['On campus'])",
      [key.publicKey()],
    );
  await db.query(
    "insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values($1,$2,'Dispute test','Errands','On campus','Today',1,'Deliver the document')",
    [id, owner.publicKey()],
  );
  await db.query(
    "select campuscrew_stellar_apply($1,$2,1,'Today','I can deliver')",
    [provider.publicKey(), id],
  );
  const app = (
    await db.query(
      "select id from campuscrew_stellar_applications where request_id=$1",
      [id],
    )
  ).rows[0].id;
  await db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [
    owner.publicKey(),
    id,
    app,
  ]);
  await db.query(
    "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)",
    [
      owner.publicKey(),
      id,
      "ab".repeat(32),
      Address.contract(Buffer.alloc(32, 1)).toString(),
      Address.contract(Buffer.alloc(32, 2)).toString(),
      resolver.publicKey(),
    ],
  );
  await db.query("select campuscrew_stellar_record_escrow($1,10,'Funded',$2)", [
    id,
    JSON.stringify({ funded: "10000000", refund_pool: "0" }),
  ]);
});
const report = () =>
  db.query(
    "select campuscrew_dispute_report($1,$2,'Not delivered','The document did not reach the agreed recipient.')",
    [owner.publicKey(), id],
  );
test("saving a report never claims to pause payment, is participant-only, and retries create one case", async () => {
  await assert.rejects(
    db.query(
      "select campuscrew_dispute_report($1,$2,'Other','This is an unauthorized complaint.')",
      [stranger.publicKey(), id],
    ),
    /private/,
  );
  await report();
  await report();
  assert.equal(
    (await db.query("select count(*)::int n from campuscrew_dispute_cases"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select chain_state from campuscrew_stellar_escrows where request_id=$1",
        [id],
      )
    ).rows[0].chain_state,
    "Funded",
  );
  await assert.rejects(
    db.query("select campuscrew_dispute_review($1,$2)", [
      resolver.publicKey(),
      id,
    ]),
    /confirmed resolver|configured resolver/,
  );
});
test("both participants and the resolver can add immutable case statements; outsiders cannot", async () => {
  await report();
  const client = randomUUID();
  for (let n = 0; n < 2; n++)
    await db.query(
      "select campuscrew_dispute_statement($1,$2,'I submitted the document',$3)",
      [provider.publicKey(), id, client],
    );
  await db.query(
    "select campuscrew_dispute_statement($1,$2,'Please provide a delivery receipt',$3)",
    [resolver.publicKey(), id, randomUUID()],
  );
  await assert.rejects(
    db.query("select campuscrew_dispute_statement($1,$2,'Let me in',$3)", [
      stranger.publicKey(),
      id,
      randomUUID(),
    ]),
    /private/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from campuscrew_dispute_statements",
      )
    ).rows[0].n,
    2,
  );
});
test("only the named resolver can start review after the on-chain dispute confirms", async () => {
  await report();
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Disputed' where request_id=$1",
    [id],
  );
  for (const key of [owner, provider, stranger])
    await assert.rejects(
      db.query("select campuscrew_dispute_review($1,$2)", [
        key.publicKey(),
        id,
      ]),
      /configured resolver/,
    );
  await db.query("select campuscrew_dispute_review($1,$2)", [
    resolver.publicKey(),
    id,
  ]);
  assert.equal(
    (
      await db.query(
        "select review_status from campuscrew_dispute_cases where request_id=$1",
        [id],
      )
    ).rows[0].review_status,
    "reviewing",
  );
});
test("each party can upload its own dispute evidence without consuming the other's quota", async () => {
  await report();
  const upload = (wallet) =>
    db.query(
      "select campuscrew_experience_evidence($1,$2,$3,'receipt.png',$4,'image/png',100)",
      [wallet, id, randomUUID(), id + "/" + randomUUID()],
    );
  await assert.rejects(upload(owner.publicKey()), /permitted booking state/);
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Disputed' where request_id=$1",
    [id],
  );
  for (const key of [owner, provider]) {
    for (let i = 0; i < 3; i++) await upload(key.publicKey());
    await assert.rejects(upload(key.publicKey()), /three evidence/);
  }
  await assert.rejects(upload(stranger.publicKey()), /permitted booking state/);
  await assert.rejects(upload(resolver.publicKey()), /permitted booking state/);
});
test("decision confirmation requires a matching confirmed chain award and does not change on replay", async () => {
  await report();
  const intent = randomUUID();
  await db.query(
    "insert into campuscrew_dispute_decisions(id,request_id,wallet,provider_units,rationale,tx_hash,unsigned_xdr,expires_at,status) values($1,$2,$3,6000000,'Partial delivery was supported by the evidence.',$4,'test-envelope',now()+interval '3 minutes','submitted')",
    [intent, id, resolver.publicKey(), "ac".repeat(32)],
  );
  await assert.rejects(
    db.query("select campuscrew_dispute_confirm($1,20,now())", [intent]),
    /does not match/,
  );
  await db.query(
    "select campuscrew_stellar_record_escrow($1,20,'Refundable',$2)",
    [id, JSON.stringify({ funded: "10000000", refund_pool: "4000000" })],
  );
  await db.query(
    "select campuscrew_dispute_confirm($1,20,'2026-11-27T15:00:00Z')",
    [intent],
  );
  await db.query(
    "select campuscrew_dispute_confirm($1,20,'2026-11-28T15:00:00Z')",
    [intent],
  );
  const d = (
    await db.query(
      "select status,confirmed_at from campuscrew_dispute_decisions where id=$1",
      [intent],
    )
  ).rows[0];
  assert.equal(d.status, "confirmed");
  assert.equal(
    new Date(d.confirmed_at).toISOString(),
    "2026-11-27T15:00:00.000Z",
  );
  await assert.rejects(
    db.query(
      "select campuscrew_dispute_statement($1,$2,'Please change it',$3)",
      [owner.publicKey(), id, randomUUID()],
    ),
    /settled/,
  );
});
test("browser database roles cannot read case files or invoke privileged settlement functions", async () => {
  await report();
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      for (const table of [
        "campuscrew_dispute_cases",
        "campuscrew_dispute_statements",
        "campuscrew_dispute_decisions",
      ])
        await assert.rejects(
          db.query("select * from " + table),
          /permission denied/,
        );
      await assert.rejects(
        db.query("select campuscrew_dispute_confirm($1,20,now())", [
          randomUUID(),
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select campuscrew_dispute_review($1,$2)", [
          resolver.publicKey(),
          id,
        ]),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
test("admin access requires the exact configured wallet; resolution amounts and signed envelopes cannot be altered", () => {
  assert.equal(
    isResolverWallet(resolver.publicKey(), resolver.publicKey()),
    true,
  );
  for (const wallet of [
    undefined,
    "",
    owner.publicKey(),
    provider.publicKey(),
    "invalid",
  ])
    assert.equal(isResolverWallet(wallet, resolver.publicKey()), false);
  assert.equal(awardUnits("0", 10000000n), 0n);
  assert.equal(awardUnits("0.60", 10000000n), 6000000n);
  for (const amount of ["-1", "1.01", "1e0", "0.00000001", "NaN"])
    assert.throws(() => awardUnits(amount, 10000000n));
  const terms = {
    organizer: owner.publicKey(),
    provider: provider.publicKey(),
    resolver: resolver.publicKey(),
    contract_id: Address.contract(Buffer.alloc(32, 1)).toString(),
    chain_id: "ab".repeat(32),
  };
  const booking = { state: ["Disputed"], funded: 10000000n };
  assert.throws(() =>
    buildResolverTransaction(
      new Account(owner.publicKey(), "0"),
      terms,
      booking,
      6000000n,
    ),
  );
  assert.throws(() =>
    buildResolverTransaction(
      new Account(resolver.publicKey(), "0"),
      terms,
      { ...booking, state: ["Paid"] },
      6000000n,
    ),
  );
  const tx = buildResolverTransaction(
    new Account(resolver.publicKey(), "0"),
    terms,
    booking,
    6000000n,
  );
  const hash = Buffer.from(tx.hash()).toString("hex");
  tx.sign(resolver);
  assert.equal(
    verifySignedTransaction(tx.toXDR(), hash, resolver.publicKey()).source,
    resolver.publicKey(),
  );
  const changed = buildResolverTransaction(
    new Account(resolver.publicKey(), "0"),
    terms,
    booking,
    8000000n,
  );
  changed.sign(resolver);
  assert.throws(() =>
    verifySignedTransaction(changed.toXDR(), hash, resolver.publicKey()),
  );
});
