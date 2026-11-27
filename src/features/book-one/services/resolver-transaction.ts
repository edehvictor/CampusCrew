import {
  Account,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import type { EscrowTerms, ChainBooking } from "./stellar-escrow";
export { awardUnits } from "./dispute-amount.ts";

export function buildResolverTransaction(
  account: Account,
  terms: EscrowTerms,
  booking: ChainBooking,
  amount: bigint,
) {
  if (
    account.accountId() !== terms.resolver ||
    booking.state[0] !== "Disputed" ||
    amount < 0n ||
    amount > booking.funded
  )
    throw new Error(
      "Only the resolver can settle a disputed booking within its deposit.",
    );
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(terms.contract_id).call(
        "resolve",
        nativeToScVal(Buffer.from(terms.chain_id, "hex")),
        nativeToScVal(amount, { type: "i128" }),
      ),
    )
    .setTimeout(180)
    .build();
}
