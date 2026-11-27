import assert from "node:assert/strict";
import test from "node:test";
import { Address, Account, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { verifyProviderPayout } from "../src/features/book-one/services/provider-payout.ts";

const owner = Keypair.random().publicKey(), provider = Keypair.random().publicKey(), resolver = Keypair.random().publicKey();
const terms = { chain_id:"ab".repeat(32), contract_id:Address.contract(Buffer.alloc(32,1)).toString(),
  token_id:Address.contract(Buffer.alloc(32,2)).toString(), organizer:owner, provider, resolver };
const booking = { funded:10000000n, total:10000000n, refund_pool:4000000n, state:["Refundable"] };
function receipt(method="resolve", overrides={}) {
  const args = [nativeToScVal(Buffer.from(terms.chain_id,"hex"))];
  if(method==="resolve") args.push(nativeToScVal(6000000n,{type:"i128"}));
  const tx = new TransactionBuilder(new Account(resolver,"0"), {fee:"100",networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(terms.contract_id).call(method,...args)).setTimeout(180).build();
  return { hash:Buffer.from(tx.hash()).toString("hex"), value:{status:"SUCCESS",envelopeXdr:tx.toXDR(),createdAt:1795791829,
    events:{contractEventsXdr:[[{contract_id:terms.token_id,body:{v0:{topics:[{symbol:"transfer"},{address:terms.contract_id},{address:provider}],data:{i128:"6000000"}}}}]]}, ...overrides} };
}

test("a split award is confirmed from the exact successful resolver invocation and token transfer", () => {
  const tx=receipt();
  const payout=verifyProviderPayout(terms,booking,tx.hash,tx.value);
  assert.equal(payout.amount,0.6);
  assert.equal(payout.hash,tx.hash);
  assert.equal(payout.at,"2026-11-27T15:03:49.000Z");
});
test("refund, unrelated booking, wrong asset, missing transfer, failure, and changed award cannot become provider income", () => {
  const tx=receipt();
  assert.equal(verifyProviderPayout(terms,booking,tx.hash,{...tx.value,status:"FAILED"}),null);
  assert.equal(verifyProviderPayout({...terms,chain_id:"cd".repeat(32)},booking,tx.hash,tx.value),null);
  assert.equal(verifyProviderPayout({...terms,provider:owner},booking,tx.hash,tx.value),null);
  assert.equal(verifyProviderPayout({...terms,resolver:owner},booking,tx.hash,tx.value),null);
  assert.equal(verifyProviderPayout({...terms,token_id:terms.contract_id},booking,tx.hash,tx.value),null);
  assert.equal(verifyProviderPayout(terms,booking,tx.hash,{...tx.value,events:{}}),null);
  assert.equal(verifyProviderPayout(terms,{...booking,refund_pool:3000000n},tx.hash,tx.value),null);
  assert.equal(verifyProviderPayout(terms,booking,"00".repeat(32),tx.value),null);
  const refund=receipt("refund");
  assert.equal(verifyProviderPayout(terms,booking,refund.hash,refund.value),null);
});
