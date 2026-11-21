import { NextResponse } from "next/server";
import { BASE_FEE, Networks, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { z } from "zod";
import { readStellarSession, requireSameOrigin } from "@/features/book-one/stellar-session";
import { readWalletBalance } from "@/features/book-one/stellar-balance";
import { stellarTestnetRpc, testUsdc } from "@/features/book-one/stellar-escrow";
import { PilotError } from "@/features/book-one/pilot-error";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ action: z.enum(["fund_xlm", "prepare_usdc"]) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await readStellarSession(request);
    if (!user) throw new PilotError("Sign in before setting up your test wallet.", 401);
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new PilotError("Choose a wallet setup action.", 400);
    if (input.data.action === "fund_xlm") {
      const balance = await readWalletBalance(user.wallet);
      if (Number(balance.xlm) >= 100) return NextResponse.json({ message: "Your wallet already has enough test XLM for the pilot." }, { headers });
      const response = await fetch(`https://friendbot.stellar.org?addr=${user.wallet}`, { signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new PilotError("The test XLM faucet is unavailable or has already funded this wallet recently. Try again later.", 409);
      return NextResponse.json({ message: "Test XLM received. Refresh your balance." }, { headers });
    }
    const client = new rpc.Server(stellarTestnetRpc, { timeout: 12_000 });
    const account = await client.getAccount(user.wallet).catch(() => { throw new PilotError("Get test XLM to activate your wallet first.", 409); });
    const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: testUsdc, limit: "1000000" })).setTimeout(180).build();
    return NextResponse.json({ wallet: user.wallet, networkPassphrase: Networks.TESTNET, xdr: transaction.toXDR() }, { headers });
  } catch (error) {
    if (error instanceof PilotError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Your test wallet could not be set up right now. Refresh your balance and try again." }, { status: 503, headers });
  }
}
