import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Account, Address, Keypair, Networks, Operation, TransactionBuilder, scValToNative } from "@stellar/stellar-sdk";
import { assertBookingTerms, bookingChainId, bookingLedgerKey, escrowCall, permittedOperations, testUsdcContract, usdcUnits, verifySignedTransaction } from "../src/features/book-one/stellar-escrow.ts";

const owner = Keypair.random();
const provider = Keypair.random();
const outsider = Keypair.random();
const terms = {
  request_id: randomUUID(), chain_id: "ab".repeat(32), contract_id: Address.contract(Buffer.alloc(32, 2)).toString(),
  token_id: testUsdcContract, resolver: outsider.publicKey(), organizer: owner.publicKey(), provider: provider.publicKey(),
  amount: 10.25, funding_deadline: 2000, work_deadline: 10000,
};
function booking(state = "Proposed", paid = false) {
  return {
    organizer: terms.organizer, provider: terms.provider,
    participants: [{ wallet: terms.organizer, amount: BigInt(102500000), paid, refunded: false }],
    total: BigInt(102500000), funded: paid ? BigInt(102500000) : BigInt(0),
    funding_deadline: BigInt(2000), work_deadline: BigInt(10000), review_deadline: BigInt(5000),
    refund_pool: BigInt(0), state: [state],
  };
}

test("USDC conversion uses seven decimal places without floating-point rounding", () => {
  assert.equal(usdcUnits("10.25"), BigInt(102500000));
  assert.equal(usdcUnits("0.0000001"), BigInt(1));
  assert.equal(usdcUnits("1000000"), BigInt(10000000000000));
  for (const value of ["0", "-1", "1e2", "0.00000001", "1000000.01", "NaN"]) assert.throws(() => usdcUnits(value));
});

test("booking IDs and ledger keys are deterministic and bound to this Testnet deployment", () => {
  const id = randomUUID();
  assert.equal(bookingChainId(id), bookingChainId(id));
  assert.notEqual(bookingChainId(id), bookingChainId(randomUUID()));
  assert.throws(() => bookingChainId("invalid"));
  const key = bookingLedgerKey(terms.contract_id, terms.chain_id);
  assert.equal(key.type, "contractData");
  assert.equal(key.contractData.durability.name, "persistent");
  const decoded = scValToNative(key.contractData.key);
  assert.equal(decoded[0], "Booking");
  assert.equal(Buffer.from(decoded[1]).toString("hex"), terms.chain_id);
});

test("on-chain state must match the selected provider, price, owner, deadlines and contribution plan", () => {
  assert.equal(assertBookingTerms(terms, booking()).total, BigInt(102500000));
  for (const changed of [
    { provider: outsider.publicKey() }, { total: BigInt(1) }, { funded: BigInt(1) },
    { funding_deadline: BigInt(3000) }, { participants: [{ ...booking().participants[0], wallet: outsider.publicKey() }] },
  ]) assert.throws(() => assertBookingTerms(terms, { ...booking(), ...changed }));
});

test("roles and deadlines constrain every payment operation", () => {
  assert.deepEqual(permittedOperations(terms, null, terms.organizer, 1000), ["create"]);
  assert.deepEqual(permittedOperations(terms, null, terms.provider, 1000), []);
  assert.deepEqual(permittedOperations(terms, booking(), outsider.publicKey(), 1000), []);
  assert.ok(permittedOperations(terms, booking(), terms.provider, 1000).includes("accept"));
  assert.ok(!permittedOperations(terms, booking(), terms.organizer, 1000).includes("accept"));
  assert.ok(permittedOperations(terms, booking("Funding"), terms.organizer, 1000).includes("fund"));
  assert.ok(!permittedOperations(terms, booking("Funding"), terms.organizer, 2000).includes("fund"));
  assert.ok(permittedOperations(terms, booking("Funded", true), terms.provider, 1000).includes("submit"));
  assert.ok(!permittedOperations(terms, booking("Funded", true), terms.organizer, 1000).includes("release"));
  assert.ok(permittedOperations(terms, booking("Submitted", true), terms.organizer, 1000).includes("release"));
  assert.ok(!permittedOperations(terms, booking("Submitted", true), terms.provider, 4999).includes("claim"));
  assert.ok(permittedOperations(terms, booking("Submitted", true), terms.provider, 5000).includes("claim"));
  assert.deepEqual(permittedOperations(terms, booking("Disputed", true), terms.organizer, 1000), []);
  assert.ok(permittedOperations(terms, booking("Refundable", true), terms.organizer, 1000).includes("refund"));
  assert.deepEqual(permittedOperations(terms, booking("Paid", true), terms.organizer, 1000), []);
});

test("prepared calls encode the agreed amount and fixed contribution wallet", () => {
  const operation = escrowCall(terms, "create", owner.publicKey());
  assert.equal(operation.body.type, "invokeHostFunction");
  const fn = operation.body.invokeHostFunctionOp.hostFunction;
  assert.equal(fn.type, "hostFunctionTypeInvokeContract");
  assert.equal(fn.invokeContract.functionName.toString(), "create");
  const contributionPlan = scValToNative(fn.invokeContract.args[3]);
  assert.equal(contributionPlan[0][0], terms.organizer);
  assert.equal(contributionPlan[0][1], BigInt(102500000));
});

test("signed envelopes reject another wallet, altered amounts, and Mainnet signatures", () => {
  function build(network = Networks.TESTNET, value = "one") {
    return new TransactionBuilder(new Account(owner.publicKey(), "0"), { fee: "100", networkPassphrase: network })
      .addOperation(Operation.manageData({ name: "test", value })).setTimeout(180).build();
  }
  const tx = build();
  const unsignedXdr = tx.toXDR();
  const expectedHash = Buffer.from(tx.hash()).toString("hex");
  tx.sign(owner);
  assert.equal(verifySignedTransaction(tx.toXDR(), expectedHash, owner.publicKey()).source, owner.publicKey());
  assert.throws(() => verifySignedTransaction(tx.toXDR(), expectedHash, provider.publicKey()));
  const altered = build(Networks.TESTNET, "two"); altered.sign(owner);
  assert.throws(() => verifySignedTransaction(altered.toXDR(), expectedHash, owner.publicKey()));
  const wrongSigner = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET); wrongSigner.sign(provider);
  assert.throws(() => verifySignedTransaction(wrongSigner.toXDR(), expectedHash, owner.publicKey()));
  const mainnet = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC); mainnet.sign(owner);
  assert.throws(() => verifySignedTransaction(mainnet.toXDR(), expectedHash, owner.publicKey()));
});
