// Testnet operator action: the independent resolver decides the provider's share.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import { bookingChainId, bookingLedgerKey, chainBookingSchema, stellarTestnetRpc, usdcUnits } from "../src/features/book-one/stellar-escrow.ts";

const [requestId, providerAmount] = process.argv.slice(2);
if (!requestId || providerAmount === undefined) throw new Error("Usage: npm run stellar:resolve -- TASK_UUID PROVIDER_USDC_AMOUNT (use 0 for a full refund)");
const chainId = bookingChainId(requestId);
const amount = /^0(?:\.0{1,7})?$/.test(providerAmount) ? BigInt(0) : usdcUnits(providerAmount);
const deployment = JSON.parse(await readFile("deployments/stellar-testnet.json", "utf8"));
if (!deployment.verified || deployment.network !== "stellar-testnet") throw new Error("Verified Testnet deployment required.");
process.loadEnvFile(".env.stellar-testnet.local");
const resolver = Keypair.fromSecret(process.env.STELLAR_RESOLVER_SECRET);
if (resolver.publicKey() !== deployment.resolver) throw new Error("Resolver account mismatch.");
const server = new rpc.Server(stellarTestnetRpc, { timeout: 15_000 });
if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw new Error("Unexpected network.");
const entry = (await server.getLedgerEntries(bookingLedgerKey(deployment.contract, chainId))).entries[0];
if (!entry || entry.val.type !== "contractData") throw new Error("Booking unavailable.");
const booking = chainBookingSchema.parse(scValToNative(entry.val.contractData.val));
if (booking.state[0] !== "Disputed" || amount > booking.funded) throw new Error("The booking must be disputed and the provider award cannot exceed its deposit.");
const tx = new TransactionBuilder(await server.getAccount(resolver.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(new Contract(deployment.contract).call("resolve", nativeToScVal(Buffer.from(chainId, "hex")), nativeToScVal(amount, { type: "i128" }))).setTimeout(180).build();
const simulation = await server.simulateTransaction(tx);
if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) throw new Error("Could not prepare the resolver decision.");
const prepared = rpc.assembleTransaction(tx, simulation).build();
prepared.sign(resolver);
const hash = Buffer.from(prepared.hash()).toString("hex");
const sent = await server.sendTransaction(prepared);
if (sent.status === "ERROR") throw new Error("Stellar rejected the resolver decision.");
for (let attempt = 0; attempt < 15; attempt++) {
  const result = await server.getTransaction(hash);
  if (result.status === "FAILED") throw new Error(`Resolver transaction failed: ${hash}`);
  if (result.status === "SUCCESS") {
    await mkdir("deployments/resolutions", { recursive: true });
    await writeFile(`deployments/resolutions/${chainId}.json`, JSON.stringify({ network: "stellar-testnet", requestId, contract: deployment.contract, hash, providerAmount, confirmedAt: new Date().toISOString() }, null, 2) + "\n");
    console.log(`Resolver decision confirmed: https://stellar.expert/explorer/testnet/tx/${hash}`);
    console.log("Participants can now use Refresh payment, then reclaim any refundable contribution.");
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
}
throw new Error(`Decision is still pending: ${hash}. Check its receipt before retrying.`);
