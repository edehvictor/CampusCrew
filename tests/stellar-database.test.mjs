import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { Address, Keypair } from "@stellar/stellar-sdk";

const db = new PGlite();
const owner = Keypair.random().publicKey();
const provider = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
const taskId = randomUUID();

before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const sql = await readFile(new URL("../supabase/migrations/20261119000100_stellar_onboarding.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(await readFile(new URL("../supabase/migrations/20261121000100_stellar_escrow.sql", import.meta.url), "utf8"));
});

beforeEach(async () => {
  await db.exec("truncate campuscrew_stellar_challenges, campuscrew_stellar_sessions, campuscrew_stellar_profiles cascade;");
  for (const wallet of [owner, provider, other]) {
    await db.query("insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values ($1,'Test student','On campus',array['Cleaning'],array['On campus'])", [wallet]);
  }
  await db.query("insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values ($1,$2,'Clean my room','Cleaning','On campus','Tomorrow',12.50,'Sweep and mop the room')", [taskId, owner]);
});

after(async () => { await db.close(); });

async function apply(wallet = provider) {
  await db.query("select campuscrew_stellar_apply($1,$2,10.25,'Tomorrow morning','I can clean the room')", [wallet, taskId]);
  const { rows } = await db.query("select id from campuscrew_stellar_applications where request_id=$1 and provider_wallet=$2", [taskId, wallet]);
  return rows[0].id;
}

async function board(wallet) {
  const { rows } = await db.query("select campuscrew_stellar_board($1) as jobs", [wallet]);
  return rows[0].jobs;
}

test("Stellar tasks and applications work without a GoodDollar identity", async () => {
  const application = await apply();
  const ownerBoard = await board(owner);
  assert.equal(ownerBoard[0].budget, 12.5);
  assert.equal(ownerBoard[0].quotes[0].amount, 10.25);
  assert.equal(ownerBoard[0].quotes[0].id, application);
  assert.equal(ownerBoard[0].applicationCount, 1);
  assert.equal(ownerBoard[0].own, true);
});

test("public browsing hides application details and owners cannot apply to themselves", async () => {
  await apply();
  assert.deepEqual((await board(null))[0].quotes, []);
  assert.equal((await board(null))[0].applicationCount, 1);
  await assert.rejects(apply(owner), /Task unavailable/);
  await db.query("update campuscrew_stellar_profiles set skills='{}',coverage='{}' where wallet=$1", [other]);
  await assert.rejects(apply(other), /Add this service and coverage area/);
});

test("only the task owner can select one matching application, and retrying is safe", async () => {
  const application = await apply();
  const second = await apply(other);
  await assert.rejects(db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [provider, taskId, application]), /Task unavailable/);
  await db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [owner, taskId, application]);
  await db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [owner, taskId, application]);
  await assert.rejects(db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [owner, taskId, second]), /already been selected/);
  assert.equal((await board(owner))[0].status, "Awaiting funding");
  assert.equal((await board(provider))[0].accepted, application);
  assert.equal((await board(other))[0].accepted, null);
  assert.equal((await board(null)).length, 0);
});

test("repeated applications do not create duplicate quotes", async () => {
  assert.equal(await apply(), await apply());
  assert.equal((await board(owner))[0].applicationCount, 1);
});

test("a login challenge can create only one session even with simultaneous retries", async () => {
  const challenge = randomUUID();
  const binding = "a".repeat(64);
  await db.query("select campuscrew_stellar_issue_challenge($1,$2,$3,'Sign in','http://localhost:3000')", [challenge, owner, binding]);
  const attempts = await Promise.allSettled(["b", "c"].map(letter => db.query(
    "select campuscrew_stellar_consume_challenge($1,$2,$3,'http://localhost:3000',$4)",
    [challenge, owner, binding, letter.repeat(64)],
  )));
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await db.query("select count(*)::int as total from campuscrew_stellar_sessions")).rows[0].total, 1);
});

test("expired and wrong-origin challenges cannot create a session", async () => {
  const challenge = randomUUID();
  const binding = "a".repeat(64);
  await db.query("select campuscrew_stellar_issue_challenge($1,$2,$3,'Sign in','http://localhost:3000')", [challenge, owner, binding]);
  await assert.rejects(db.query("select campuscrew_stellar_consume_challenge($1,$2,$3,'https://other.example',$4)", [challenge, owner, binding, "b".repeat(64)]), /expired or already used/);
  await db.query("update campuscrew_stellar_challenges set expires_at=now()-interval '1 second' where id=$1", [challenge]);
  await assert.rejects(db.query("select campuscrew_stellar_consume_challenge($1,$2,$3,'http://localhost:3000',$4)", [challenge, owner, binding, "b".repeat(64)]), /expired or already used/);
  assert.equal((await db.query("select count(*)::int as total from campuscrew_stellar_sessions")).rows[0].total, 0);
});

test("browser roles cannot read sessions or execute protected mutation functions", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select * from campuscrew_stellar_sessions"), /permission denied/);
    await assert.rejects(db.query("select campuscrew_stellar_board(null)"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

async function escrow() {
  const application = await apply();
  await db.query("select campuscrew_stellar_select_provider($1,$2,$3)", [owner, taskId, application]);
  const contract = Address.contract(Buffer.alloc(32, 1)).toString();
  const token = Address.contract(Buffer.alloc(32, 2)).toString();
  const result = await db.query("select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6) as terms", [owner,taskId,'ab'.repeat(32),contract,token,other]);
  return {terms:result.rows[0].terms, contract, token};
}

test("escrow preparation locks the selected price and is owner-only and idempotent", async () => {
  const {terms,contract,token} = await escrow();
  assert.equal(terms.organizer, owner);
  assert.equal(terms.provider, provider);
  assert.equal(terms.amount, 10.25);
  await assert.rejects(db.query("select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)", [provider,taskId,'ab'.repeat(32),contract,token,other]), /Only the task owner/);
  const retry = await db.query("select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6) as terms", [owner,taskId,'ab'.repeat(32),contract,token,other]);
  assert.deepEqual(retry.rows[0].terms, terms);
  await assert.rejects(db.query("select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)", [owner,taskId,'ab'.repeat(32),token,token,other]), /different escrow/);
});

test("verified receipts are booking-bound and older responses cannot regress chain state", async () => {
  await escrow();
  const intentId = randomUUID();
  const hash = 'cd'.repeat(32);
  await db.query("insert into campuscrew_stellar_payment_intents(id,request_id,wallet,operation,tx_hash,expires_at,status) values ($1,$2,$3,'fund',$4,now()+interval '3 minutes','submitted')", [intentId,taskId,owner,hash]);
  await assert.rejects(db.query("select campuscrew_stellar_record_escrow($1,10,'Funded','{}',$2,$3)", [taskId,intentId,'ef'.repeat(32)]), /does not match/);
  await db.query("select campuscrew_stellar_record_escrow($1,20,'Paid','{}')", [taskId]);
  await db.query("select campuscrew_stellar_record_escrow($1,10,'Funded','{}',$2,$3)", [taskId,intentId,hash]);
  await db.query("select campuscrew_stellar_record_escrow($1,10,'Funded','{}',$2,$3)", [taskId,intentId,hash]);
  const result = await db.query("select chain_state,checked_ledger,funding_tx from campuscrew_stellar_escrows where request_id=$1", [taskId]);
  assert.equal(result.rows[0].chain_state, 'Paid');
  assert.equal(Number(result.rows[0].checked_ledger), 20);
  assert.equal(result.rows[0].funding_tx, hash);
  assert.equal((await db.query("select status from campuscrew_stellar_payment_intents where id=$1",[intentId])).rows[0].status, 'confirmed');
});

test("browser roles cannot read payment intents or overwrite escrow snapshots", async () => {
  await escrow();
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query('select * from campuscrew_stellar_payment_intents'), /permission denied/);
    await assert.rejects(db.query("select campuscrew_stellar_record_escrow($1,999,'Paid','{}')", [taskId]), /permission denied/);
    await assert.rejects(db.query('select * from campuscrew_stellar_escrows'), /permission denied/);
  } finally { await db.exec('reset role'); }
});
