import { createHash } from "node:crypto";
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { z } from "zod";
import { usdcUnits } from "./usdc-units.ts";
export { usdcUnits } from "./usdc-units.ts";

export const escrowOperations = [
  "create",
  "accept",
  "fund",
  "submit",
  "release",
  "claim",
  "cancel",
  "refund",
  "dispute",
] as const;
export type EscrowOperation = (typeof escrowOperations)[number];
export const testUsdc = new Asset(
  "USDC",
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
);
export const testUsdcContract = testUsdc.contractId(Networks.TESTNET);
export const stellarTestnetRpc = "https://soroban-testnet.stellar.org";

export type EscrowTerms = {
  request_id: string;
  chain_id: string;
  contract_id: string;
  token_id: string;
  resolver: string;
  organizer: string;
  provider: string;
  amount: number;
  funding_deadline: number;
  work_deadline: number;
  prefunded?: boolean;
};

export function buildEscrowTransaction(
  account: Account,
  terms: EscrowTerms,
  operation: EscrowOperation,
  actor: string,
) {
  // Soroban transactions require MEMO_NONE. Intent IDs belong in the database.
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(escrowCall(terms, operation, actor))
    .setTimeout(180)
    .build();
}
const wallet = z
  .string()
  .refine((value) => StrKey.isValidEd25519PublicKey(value));
const units = z.bigint().nonnegative();
export const chainBookingSchema = z.object({
  organizer: wallet,
  provider: wallet,
  participants: z
    .array(
      z.object({
        wallet,
        amount: units,
        paid: z.boolean(),
        refunded: z.boolean(),
      }),
    )
    .length(1),
  total: units,
  funded: units,
  funding_deadline: units,
  work_deadline: units,
  review_deadline: units,
  refund_pool: units,
  state: z.tuple([
    z.enum([
      "Proposed",
      "Funding",
      "Funded",
      "Submitted",
      "Disputed",
      "Paid",
      "Refundable",
    ]),
  ]),
});
export type ChainBooking = z.infer<typeof chainBookingSchema>;

export function bookingChainId(requestId: string) {
  if (!z.uuid().safeParse(requestId).success)
    throw new Error("Invalid booking ID.");
  return createHash("sha256")
    .update(`campuscrew:stellar-testnet:${requestId}`)
    .digest("hex");
}

export function assertBookingTerms(
  terms: EscrowTerms,
  value: unknown,
): ChainBooking {
  const booking = chainBookingSchema.parse(value);
  const amount = usdcUnits(terms.amount.toFixed(2));
  const share = booking.participants[0];
  if (
    booking.organizer !== terms.organizer ||
    booking.provider !== terms.provider ||
    share.wallet !== terms.organizer ||
    share.amount !== amount ||
    booking.total !== amount ||
    booking.funding_deadline !== BigInt(terms.funding_deadline) ||
    booking.work_deadline !== BigInt(terms.work_deadline) ||
    booking.funded > amount ||
    booking.refund_pool > booking.funded ||
    (share.paid ? booking.funded !== amount : booking.funded !== BigInt(0))
  ) {
    throw new Error("On-chain booking terms do not match this booking.");
  }
  return booking;
}

export function permittedOperations(
  terms: EscrowTerms,
  booking: ChainBooking | null,
  actor: string,
  now: number,
): EscrowOperation[] {
  const owner = actor === terms.organizer;
  const provider = actor === terms.provider;
  if (!owner && !provider) return [];
  const state = booking?.state[0];
  if (!state) return owner && now < terms.funding_deadline ? ["create"] : [];
  const operations: EscrowOperation[] = [];
  if (state === "Proposed" || state === "Funding") operations.push("cancel");
  if (state === "Proposed" && provider && now < terms.funding_deadline)
    operations.push("accept");
  if (
    state === "Funding" &&
    owner &&
    now < terms.funding_deadline &&
    !booking?.participants[0].paid
  )
    operations.push("fund");
  if (state === "Funded" && provider && now < terms.work_deadline)
    operations.push("submit");
  if (state === "Submitted" && owner) operations.push("release");
  if (
    state === "Submitted" &&
    provider &&
    now >= Number(booking?.review_deadline)
  )
    operations.push("claim");
  if (state === "Funded" || state === "Submitted") operations.push("dispute");
  if (
    owner &&
    booking?.participants[0].paid &&
    !booking.participants[0].refunded &&
    (state === "Refundable" ||
      ((state === "Proposed" || state === "Funding") &&
        now >= terms.funding_deadline))
  )
    operations.push("refund");
  return operations;
}

export function bookingLedgerKey(contract: string, chainId: string) {
  if (!StrKey.isValidContract(contract) || !/^[a-f0-9]{64}$/.test(chainId))
    throw new Error("Invalid escrow address or booking ID.");
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contract).toScAddress(),
      key: xdr.ScVal.scvVec([
        nativeToScVal("Booking", { type: "symbol" }),
        nativeToScVal(Buffer.from(chainId, "hex")),
      ]),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

export function escrowCall(
  terms: EscrowTerms,
  operation: EscrowOperation,
  actor: string,
) {
  const id = nativeToScVal(Buffer.from(terms.chain_id, "hex"));
  const address = (value: string) => Address.fromString(value).toScVal();
  const contract = new Contract(terms.contract_id);
  if (operation === "create" && terms.prefunded)
    return contract.call(
      "assign",
      id,
      address(terms.provider),
      nativeToScVal(usdcUnits(terms.amount.toFixed(2)), { type: "i128" }),
      nativeToScVal(BigInt(terms.work_deadline), { type: "u64" }),
    );
  if (operation === "create")
    return contract.call(
      "create",
      id,
      address(terms.organizer),
      address(terms.provider),
      xdr.ScVal.scvVec([
        xdr.ScVal.scvVec([
          address(terms.organizer),
          nativeToScVal(usdcUnits(terms.amount.toFixed(2)), { type: "i128" }),
        ]),
      ]),
      nativeToScVal(BigInt(terms.funding_deadline), { type: "u64" }),
      nativeToScVal(BigInt(terms.work_deadline), { type: "u64" }),
    );
  if (
    operation === "fund" ||
    operation === "refund" ||
    operation === "cancel" ||
    operation === "dispute"
  ) {
    const method = operation === "fund" ? "contribute" : operation;
    return contract.call(method, id, address(actor));
  }
  return contract.call(operation === "claim" ? "claim_payout" : operation, id);
}

export function verifySignedTransaction(
  envelope: string,
  expectedHash: string,
  wallet: string,
): Transaction {
  const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  if (
    !(tx instanceof Transaction) ||
    tx.source !== wallet ||
    Buffer.from(tx.hash()).toString("hex") !== expectedHash
  ) {
    throw new Error(
      "The signed transaction does not match the prepared booking action.",
    );
  }
  const key = Keypair.fromPublicKey(wallet);
  if (
    !tx.signatures.some((signature) =>
      key.verify(tx.hash(), signature.signature.toXdrObject()),
    )
  ) {
    throw new Error(
      "The selected wallet did not sign this booking transaction.",
    );
  }
  return tx;
}
