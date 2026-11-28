import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Keypair, Address, Account, scValToNative } from "@stellar/stellar-sdk";
import {
  canExpirePublication,
  assertPublication,
  buildPublicationTransaction,
} from "../src/features/book-one/services/publication.ts";
import {
  bookingChainId,
  buildEscrowTransaction,
  verifySignedTransaction,
} from "../src/features/book-one/services/stellar-escrow.ts";
const db = new PGlite(),
  owner = Keypair.random(),
  provider = Keypair.random(),
  other = Keypair.random();
const contract = Address.contract(randomBytes(32)).toString(),
  token = Address.contract(randomBytes(32)).toString();
let id, hash, intent;
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
    "20261127000300_nearby_providers.sql",
    "20261128000100_task_application_editing.sql",
    "20261128000200_funded_task_lifecycle.sql",
    "20261128000300_evidence_workflow.sql",
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
  intent = randomUUID();
  hash = randomBytes(32).toString("hex");
  for (const [key, name] of [
    [owner, "Task owner"],
    [provider, "Provider"],
    [other, "Other"],
  ])
    await db.query(
      "insert into campuscrew_stellar_profiles(wallet,display_name,area,skills,coverage) values($1,$2,'On campus',array['Errands'],array['On campus'])",
      [key.publicKey(), name],
    );
});
async function prepare(status = "submitted") {
  const draft = {
    action: "post",
    requestId: id,
    title: "Collect parcel",
    category: "Errands",
    area: "On campus",
    timing: "Tomorrow",
    budget: 5,
    scope: "Collect at the main gate",
    evidenceRequired: false,
  };
  await db.query(
    "insert into campuscrew_publication_intents(id,request_id,wallet,operation,contract_id,tx_hash,draft,publication_deadline,status,expires_at) values($1,$2,$3,'publish',$4,$5,$6,extract(epoch from now())::bigint+86400,$7,now()+interval '3 minutes')",
    [
      intent,
      id,
      owner.publicKey(),
      contract,
      hash,
      JSON.stringify(draft),
      status,
    ],
  );
}
const confirm = () =>
  db.query("select campuscrew_record_publication($1,$2,100)", [intent, hash]);
const publish = async () => {
  await prepare();
  await confirm();
};
const apply = async (amount = 4) => {
  await db.query(
    "select campuscrew_stellar_apply_v2($1,$2,1,$3,'Tomorrow','I can collect it')",
    [provider.publicKey(), id, amount],
  );
  return (
    await db.query(
      "select id,revision from campuscrew_stellar_applications where request_id=$1",
      [id],
    )
  ).rows[0];
};
const select = async (app) =>
  db.query("select campuscrew_stellar_select_provider_v2($1,$2,$3,1,$4)", [
    owner.publicKey(),
    id,
    app.id,
    app.revision,
  ]);
const board = async (wallet = null) =>
  (await db.query("select campuscrew_stellar_board($1) as data", [wallet]))
    .rows[0].data;
async function cancel(wallet = owner.publicKey()) {
  const cancelId = randomUUID(),
    cancelHash = randomBytes(32).toString("hex");
  const deadline = (
    await db.query(
      "select expires_at from campuscrew_task_publications where request_id=$1",
      [id],
    )
  ).rows[0].expires_at;
  await db.query(
    "select campuscrew_prepare_publication_cancel($1,$2,$3,$4,$5,now()+interval '3 minutes',$6)",
    [cancelId, id, wallet, contract, cancelHash, deadline],
  );
  return { cancelId, cancelHash };
}
test("a private preparation creates no public or saved task; only submitted matching funding publishes", async () => {
  await prepare("prepared");
  assert.equal((await board()).length, 0);
  assert.equal(
    (await db.query("select * from campuscrew_stellar_tasks")).rows.length,
    0,
  );
  await assert.rejects(confirm(), /Funding confirmation/);
  await db.query(
    "update campuscrew_publication_intents set status='submitted' where id=$1",
    [intent],
  );
  await assert.rejects(
    db.query("select campuscrew_record_publication($1,$2,100)", [
      intent,
      "0".repeat(64),
    ]),
    /Funding confirmation/,
  );
  await confirm();
  await confirm();
  assert.equal((await board()).length, 1);
  assert.equal((await board())[0].publication.budget, 5);
});
test("quotes cannot exceed funded budget even through SQL; below-budget selection prepares prefunded exact agreement", async () => {
  await publish();
  await assert.rejects(apply(5.01), /funded budget/);
  const app = await apply(4);
  await select(app);
  const terms = (
    await db.query(
      "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6) as data",
      [
        owner.publicKey(),
        id,
        bookingChainId(id),
        contract,
        token,
        other.publicKey(),
      ],
    )
  ).rows[0].data;
  assert.equal(terms.prefunded, true);
  assert.equal(terms.amount, 4);
  assert.equal(terms.funding_tx, hash);
  assert.equal((await board()).length, 0);
  assert.equal((await board(provider.publicKey()))[0].accepted, app.id);
  await assert.rejects(
    db.query("select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)", [
      provider.publicKey(),
      id,
      bookingChainId(id),
      contract,
      token,
      other.publicKey(),
    ]),
    /Only the task owner/,
  );
});
test("only the applicant can withdraw; idempotent withdrawal removes selectable/countable offer and reapplication reconfirms it", async () => {
  await publish();
  const app = await apply();
  const withdraw = (wallet = provider.publicKey(), revision = app.revision) =>
    db.query("select campuscrew_withdraw_application($1,$2,$3,$4)", [
      wallet,
      id,
      app.id,
      revision,
    ]);
  await assert.rejects(withdraw(other.publicKey()), /Only the applicant/);
  await assert.rejects(withdraw(provider.publicKey(), 9), /changed/);
  await withdraw();
  await withdraw();
  assert.equal((await board(owner.publicKey()))[0].applicationCount, 0);
  assert.ok((await board(provider.publicKey()))[0].quotes[0].withdrawnAt);
  await assert.rejects(select({ ...app, revision: 2 }), /withdrawn/);
  await db.query(
    "select campuscrew_stellar_edit_application($1,$2,$3,2,1,3,'Afternoon','I can deliver')",
    [provider.publicKey(), id, app.id],
  );
  assert.equal((await board(owner.publicKey()))[0].applicationCount, 1);
  assert.equal(
    (await board(provider.publicKey()))[0].quotes[0].withdrawnAt,
    null,
  );
  await select({ ...app, revision: 3 });
  await assert.rejects(
    withdraw(provider.publicKey(), 3),
    /Selection has closed/,
  );
});
test("funded task removal needs owner and confirmed refund; cancellation pauses applications and selection", async () => {
  await publish();
  const app = await apply();
  await assert.rejects(
    db.query("select campuscrew_remove_task($1,$2)", [other.publicKey(), id]),
    /Only the owner/,
  );
  await assert.rejects(
    db.query("select campuscrew_remove_task($1,$2)", [owner.publicKey(), id]),
    /on-chain refund/,
  );
  await assert.rejects(cancel(other.publicKey()), /Task unavailable/);
  const c = await cancel();
  assert.equal((await board()).length, 0);
  assert.equal((await board(owner.publicKey()))[0].status, "Closing");
  const draft = (
    await db.query(
      "select draft from campuscrew_publication_intents where id=$1",
      [c.cancelId],
    )
  ).rows[0].draft;
  assert.equal(draft.budget, 5);
  await assert.rejects(select(app), /active funded/);
  await assert.rejects(
    db.query("select campuscrew_remove_task($1,$2,$3,$4)", [
      owner.publicKey(),
      id,
      c.cancelId,
      c.cancelHash,
    ]),
    /on-chain refund/,
  );
  await db.query(
    "update campuscrew_publication_intents set status='submitted' where id=$1",
    [c.cancelId],
  );
  await db.query("select campuscrew_remove_task($1,$2,$3,$4)", [
    owner.publicKey(),
    id,
    c.cancelId,
    c.cancelHash,
  ]);
  assert.equal((await board(owner.publicKey()))[0].status, "Removed");
  assert.equal((await board()).length, 0);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from campuscrew_stellar_applications",
      )
    ).rows[0].n,
    1,
  );
});
test("a selected but never assigned deposit can still be refunded and retained in history", async () => {
  await publish();
  await select(await apply());
  const c = await cancel();
  await db.query(
    "update campuscrew_publication_intents set status='submitted' where id=$1",
    [c.cancelId],
  );
  await db.query("select campuscrew_remove_task($1,$2,$3,$4)", [
    owner.publicKey(),
    id,
    c.cancelId,
    c.cancelHash,
  ]);
  assert.equal((await board(owner.publicKey()))[0].status, "Removed");
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from campuscrew_stellar_bookings",
      )
    ).rows[0].n,
    1,
  );
});
test("assigned bookings cannot be removed; expiry closes applications without losing the refund route", async () => {
  await publish();
  await select(await apply());
  await db.query(
    "select campuscrew_stellar_prepare_escrow($1,$2,$3,$4,$5,$6)",
    [
      owner.publicKey(),
      id,
      bookingChainId(id),
      contract,
      token,
      other.publicKey(),
    ],
  );
  await db.query(
    "update campuscrew_stellar_escrows set chain_state='Proposed' where request_id=$1",
    [id],
  );
  await assert.rejects(cancel(), /Cancel the booking/);
});
test("funded budget is fixed but scope edits invalidate old quotes; expired tasks remain refundable", async () => {
  await publish();
  await apply();
  const edit = (budget, scope) =>
    db.query(
      "select campuscrew_stellar_edit_task($1,$2,1,'Collect parcel','Errands','On campus','Tomorrow',$3,$4,false)",
      [owner.publicKey(), id, budget, scope],
    );
  await assert.rejects(edit(6, "Collect at library"), /funded budget is fixed/);
  await edit(5, "Collect at library");
  const job = (await board(owner.publicKey()))[0];
  assert.equal(job.revision, 2);
  assert.equal(job.quotes[0].taskRevision, 1);
  await db.query(
    "update campuscrew_task_publications set expires_at=1 where request_id=$1",
    [id],
  );
  assert.equal((await board()).length, 0);
  assert.equal((await board(owner.publicKey()))[0].status, "Expired");
  await cancel();
});
test("old unfunded tasks are private and removable but not selectable", async () => {
  await db.query(
    "insert into campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope) values($1,$2,'Legacy task','Errands','On campus','Tomorrow',1,'Collect parcel')",
    [id, owner.publicKey()],
  );
  assert.equal((await board()).length, 0);
  assert.equal((await board(owner.publicKey()))[0].status, "Funding required");
  await assert.rejects(apply(), /not accepting/);
  await db.query("select campuscrew_remove_task($1,$2)", [
    owner.publicKey(),
    id,
  ]);
  assert.equal((await board(owner.publicKey()))[0].status, "Removed");
});
test("browser database roles cannot read funding drafts or confirm a payment", async () => {
  await prepare();
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("select * from campuscrew_publication_intents"),
      /permission denied/,
    );
    await assert.rejects(confirm(), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
test("funding envelopes bind owner, budget and deployment; assignment reuses reserve without contribute", () => {
  const t = {
    requestId: randomUUID(),
    wallet: owner.publicKey(),
    budget: 5,
    deadline: 2000,
    contract,
  };
  const value = {
    organizer: t.wallet,
    budget: 50000000n,
    expires_at: 2000n,
    state: ["Open"],
  };
  assertPublication(t, value);
  for (const changed of [
    { ...value, organizer: other.publicKey() },
    { ...value, budget: 40000000n },
    { ...value, expires_at: 3000n },
  ])
    assert.throws(() => assertPublication(t, changed));
  const tx = buildPublicationTransaction(
    new Account(t.wallet, "1"),
    t,
    "publish",
  );
  tx.sign(owner);
  verifySignedTransaction(
    tx.toXDR(),
    Buffer.from(tx.hash()).toString("hex"),
    t.wallet,
  );
  const altered = buildPublicationTransaction(
    new Account(t.wallet, "1"),
    { ...t, budget: 4 },
    "publish",
  );
  altered.sign(owner);
  assert.throws(() =>
    verifySignedTransaction(
      altered.toXDR(),
      Buffer.from(tx.hash()).toString("hex"),
      t.wallet,
    ),
  );
  const assignment = buildEscrowTransaction(
    new Account(t.wallet, "2"),
    {
      request_id: t.requestId,
      chain_id: bookingChainId(t.requestId),
      contract_id: contract,
      token_id: token,
      resolver: other.publicKey(),
      organizer: t.wallet,
      provider: provider.publicKey(),
      amount: 4,
      funding_deadline: 2000,
      work_deadline: 3000,
      prefunded: true,
    },
    "create",
    t.wallet,
  );
  const call = assignment.operations[0].func.invokeContract;
  assert.equal(call.functionName.toString(), "assign");
  assert.equal(scValToNative(call.args[2]), 40000000n);
});

test("an old missing receipt is never treated as unpaid merely because the RPC retention window moved", () => {
  const intent = {
    created_at: new Date(100000).toISOString(),
    expires_at: new Date(200000).toISOString(),
  };
  assert.equal(
    canExpirePublication(
      intent,
      { oldestLedgerCloseTime: 50, latestLedgerCloseTime: 300 },
      300000,
    ),
    true,
  );
  assert.equal(
    canExpirePublication(
      intent,
      { oldestLedgerCloseTime: 150, latestLedgerCloseTime: 300 },
      300000,
    ),
    false,
  );
  assert.equal(
    canExpirePublication(
      intent,
      { oldestLedgerCloseTime: 50, latestLedgerCloseTime: 210 },
      300000,
    ),
    false,
  );
});

test("the additional deployment cannot replace the existing contract or change the dispute resolver", async () => {
  const { getEscrowConfig, getFundedPostingConfig, escrowConfigFor } =
    await import("../src/features/book-one/services/escrow-config.ts");
  const values = {
    STELLAR_ESCROW_ENABLED: "true",
    STELLAR_ESCROW_CONTRACT: contract,
    STELLAR_ESCROW_WASM_HASH: "a".repeat(64),
    STELLAR_ESCROW_RESOLVER: other.publicKey(),
    STELLAR_FUNDED_ENABLED: "true",
    STELLAR_FUNDED_CONTRACT: token,
    STELLAR_FUNDED_WASM_HASH: "b".repeat(64),
    STELLAR_FUNDED_RESOLVER: other.publicKey(),
  };
  const saved = Object.fromEntries(
    Object.keys(values).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, values);
  try {
    assert.equal(escrowConfigFor(contract).contract, contract);
    assert.equal(getFundedPostingConfig().contract, token);
    process.env.STELLAR_FUNDED_RESOLVER = provider.publicKey();
    assert.equal(getFundedPostingConfig(), null);
    process.env.STELLAR_FUNDED_RESOLVER = other.publicKey();
    process.env.STELLAR_FUNDED_CONTRACT = contract;
    assert.equal(getFundedPostingConfig(), null);
    process.env.STELLAR_FUNDED_ENABLED = "false";
    assert.equal(getFundedPostingConfig(), null);
    assert.equal(getEscrowConfig().contract, contract);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
