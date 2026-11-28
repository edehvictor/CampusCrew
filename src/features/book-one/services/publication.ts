import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  xdr,
  type Account,
} from "@stellar/stellar-sdk";
import { z } from "zod";
import { usdcUnits } from "./usdc-units.ts";
import { bookingChainId } from "./stellar-escrow.ts";
export type PublicationTerms = {
  requestId: string;
  wallet: string;
  budget: number;
  deadline: number;
  contract: string;
};
export const publicationSchema = z.object({
  organizer: z.string(),
  budget: z.bigint().positive(),
  expires_at: z.bigint().positive(),
  state: z.tuple([z.enum(["Open", "Assigned", "Cancelled"])]),
});
export function assertPublication(terms: PublicationTerms, value: unknown) {
  const p = publicationSchema.parse(value);
  if (
    p.organizer !== terms.wallet ||
    p.budget !== usdcUnits(terms.budget.toFixed(2)) ||
    p.expires_at !== BigInt(terms.deadline)
  )
    throw new Error(
      "The funded task does not match its owner, budget or deadline.",
    );
  return p;
}
export function publicationLedgerKey(terms: PublicationTerms) {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(terms.contract).toScAddress(),
      key: xdr.ScVal.scvVec([
        nativeToScVal("Publication", { type: "symbol" }),
        nativeToScVal(Buffer.from(bookingChainId(terms.requestId), "hex")),
      ]),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}
export function buildPublicationTransaction(
  account: Account,
  terms: PublicationTerms,
  operation: "publish" | "cancel",
) {
  const id = nativeToScVal(Buffer.from(bookingChainId(terms.requestId), "hex")),
    contract = new Contract(terms.contract);
  const call =
    operation === "publish"
      ? contract.call(
          "publish",
          id,
          Address.fromString(terms.wallet).toScVal(),
          nativeToScVal(usdcUnits(terms.budget.toFixed(2)), { type: "i128" }),
          nativeToScVal(BigInt(terms.deadline), { type: "u64" }),
        )
      : contract.call("cancel_publication", id);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(call)
    .setTimeout(180)
    .build();
}

// An expired approval is safe to retry only while its entire lifetime remains
// inside RPC's transaction history. Older missing receipts stay recoverable.
export function canExpirePublication(
  intent: { created_at: string; expires_at: string },
  result: { oldestLedgerCloseTime: number; latestLedgerCloseTime: number },
  now: number,
) {
  return (
    Date.parse(intent.created_at) >= result.oldestLedgerCloseTime * 1000 &&
    now > Date.parse(intent.expires_at) + 30000 &&
    result.latestLedgerCloseTime * 1000 > Date.parse(intent.expires_at) + 15000
  );
}
