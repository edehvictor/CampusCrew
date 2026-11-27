import { Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import type { EscrowTerms, ChainBooking } from "./stellar-escrow";

type Receipt = {
  status: string;
  envelopeXdr?: Parameters<typeof TransactionBuilder.fromXDR>[0];
  createdAt?: string | number;
  events?: unknown;
};

// Use the successful invocation AND its asset transfer, never the UI status,
// a local receipt file, or the original quote as evidence of earnings.
export function verifyProviderPayout(
  terms: EscrowTerms,
  booking: ChainBooking,
  hash: string,
  receipt: Receipt,
) {
  if (receipt.status !== "SUCCESS" || !receipt.envelopeXdr
    || !["Paid", "Refundable"].includes(booking.state[0])) return null;
  const award = booking.funded - booking.refund_pool;
  if (award <= 0n) return null;
  try {
    const tx = TransactionBuilder.fromXDR(receipt.envelopeXdr, Networks.TESTNET);
    if (!(tx instanceof Transaction) || tx.operations.length !== 1
      || Buffer.from(tx.hash()).toString("hex") !== hash) return null;
    const operation = JSON.parse(JSON.stringify(tx.operations[0]));
    const call = operation.func?.invoke_contract;
    if (operation.type !== "invokeHostFunction" || !call
      || call.contract_address !== terms.contract_id
      || call.args?.[0]?.bytes !== terms.chain_id) return null;
    const method = call.function_name;
    if (method === "resolve") {
      if (tx.source !== terms.resolver || call.args.length !== 2
        || BigInt(call.args[1].i128) !== award) return null;
    } else if (method === "release" || method === "claim_payout") {
      if (call.args.length !== 1 || award !== booking.total
        || tx.source !== (method === "release" ? terms.organizer : terms.provider)) return null;
    } else return null; // A refund receipt must never become a provider payout.
    const events = JSON.parse(JSON.stringify(receipt.events ?? {}));
    const transferred = (events.contractEventsXdr ?? []).flat().some((event: {
      contract_id?: string;
      body?: { v0?: { topics?: { symbol?: string; address?: string }[]; data?: { i128?: string } } };
    }) => {
      const body = event.body?.v0;
      return event.contract_id === terms.token_id
        && body?.topics?.[0]?.symbol === "transfer"
        && body.topics[1]?.address === terms.contract_id
        && body.topics[2]?.address === terms.provider
        && body.data?.i128 === award.toString();
    });
    const seconds = Number(receipt.createdAt);
    if (!transferred || !Number.isFinite(seconds) || seconds <= 0) return null;
    return { hash, amount: Number(award) / 10_000_000, at: new Date(seconds * 1000).toISOString() };
  } catch {
    return null;
  }
}
