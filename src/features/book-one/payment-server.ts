import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeEventLog, encodeAbiParameters, keccak256, pad, type Address, type Hex } from "viem";
import { escrowAbi, type createCeloClient } from "./gooddollar";
import { PilotError } from "./pilot-error";
import type { PaymentInstruction, PilotMutation } from "./pilot-types";

export type PilotUser = { id: string; wallet: Address };
type PaymentMutation = Extract<PilotMutation, { action: "payment" }>;

export async function syncBooking(
  db: SupabaseClient, celo: ReturnType<typeof createCeloClient>, user: PilotUser, mutation: PaymentMutation,
): Promise<{ instruction?: PaymentInstruction }> {
  const { data: booking, error } = await db.from("campuscrew_bookings")
    .select("payer_wallet, provider_wallet, escrow_address, token_address, amount_atomic, payment_state, completion")
    .eq("request_id", mutation.requestId).or(`payer_wallet.eq.${user.wallet},provider_wallet.eq.${user.wallet}`).maybeSingle();
  if (error) throw new PilotError("Could not load the booking.", 500);
  if (!booking) throw new PilotError("Booking unavailable.", 404);

  const escrow = booking.escrow_address as Address;
  const token = booking.token_address as Address;
  const payer = booking.payer_wallet as Address;
  const provider = booking.provider_wallet as Address;
  const amount = BigInt(booking.amount_atomic);
  const id = pad(`0x${mutation.requestId.replaceAll("-", "")}`, { size: 32 });
  const data = encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [id, provider]);
  const key = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
    [id, payer, provider, amount],
  ));

  const tip = await celo.getBlockNumber();
  const confirmedBlock = tip - 1n;
  const [, , refundAfter, state] = await celo.readContract({
    address: escrow, abi: escrowAbi, functionName: "payments", args: [key], blockNumber: confirmedBlock,
  });

  if (state > booking.payment_state) {
    const { error: syncError } = await db.from("campuscrew_bookings")
      .update({ payment_state: state, refund_after: Number(refundAfter) })
      .eq("request_id", mutation.requestId).lt("payment_state", state);
    if (syncError) throw new PilotError("Could not save the confirmed booking status.", 500);
  }

  if (mutation.hash) {
    const hash = mutation.hash.toLowerCase() as Hex;
    const receipt = await celo.getTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new PilotError("The G$ transaction reverted.", 422);
    if (receipt.blockNumber > confirmedBlock) {
      throw new PilotError("The transaction has not been confirmed yet. Check again shortly.", 409);
    }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== escrow) continue;
      try {
        const event = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
        if (!("key" in event.args) || event.args.key !== key) continue;
        const field = event.eventName === "Funded" ? "funding_tx" : "settlement_tx";
        const { error: receiptError } = await db.from("campuscrew_bookings")
          .update({ [field]: hash }).eq("request_id", mutation.requestId).is(field, null);
        if (receiptError) throw new PilotError("Could not save the transaction receipt.", 500);
        return {};
      } catch (err) {
        if (err instanceof PilotError) throw err;
      }
    }
    throw new PilotError("This transaction does not match the booking.", 400);
  }

  if (mutation.operation === "sync") return {};
  if (mutation.operation === "fund" && (state !== 0 || user.wallet !== payer)) {
    throw new PilotError("Only the task owner can fund an unfunded booking.", 409);
  }
  if (mutation.operation === "release" && (state !== 1 || user.wallet !== payer || !booking.completion)) {
    throw new PilotError("The task owner can approve payment after completion is submitted.", 409);
  }
  if (mutation.operation === "refund" && (state !== 1 ||
    (user.wallet === payer && BigInt(Math.floor(Date.now() / 1000)) < refundAfter))) {
    throw new PilotError("The provider can refund now. The task owner can refund after the waiting period.", 409);
  }
  return { instruction: { operation: mutation.operation, escrow, token, amount: amount.toString(), key, data } };
}
