import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { Contract, Networks, rpc } from "@stellar/stellar-sdk";
import { stellarTestnetRpc } from "../src/features/book-one/services/stellar-escrow.ts";

process.loadEnvFile(".env.local");
const deployment = JSON.parse(await readFile("deployments/stellar-testnet.json", "utf8"));
if (deployment.verified !== true || deployment.network !== "stellar-testnet") throw new Error("Deploy and verify the contract first.");
const client = new rpc.Server(stellarTestnetRpc, { timeout: 12_000 });
if ((await client.getNetwork()).passphrase !== Networks.TESTNET) throw new Error("Unexpected network.");
const entry = (await client.getLedgerEntries(new Contract(deployment.contract).getFootprint())).entries[0];
if (!entry || entry.val.type !== "contractData" || entry.val.contractData.val.type !== "scvContractInstance") throw new Error("Contract unavailable.");
const executable = entry.val.contractData.val.instance.executable;
if (executable.type !== "contractExecutableWasm" || Buffer.from(executable.wasmHash.toXdrObject()).toString("hex") !== deployment.wasmHash) throw new Error("Contract code mismatch.");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const table of ["campuscrew_stellar_escrows", "campuscrew_stellar_payment_intents"]) {
  const { error } = await db.from(table).select("request_id", { head: true, count: "exact" });
  if (error) throw new Error("Apply supabase/migrations/20261121000100_stellar_escrow.sql in Supabase before enabling payments.");
}
let environment = await readFile(".env.local", "utf8");
const values = { STELLAR_ESCROW_CONTRACT: deployment.contract, STELLAR_ESCROW_WASM_HASH: deployment.wasmHash, STELLAR_ESCROW_RESOLVER: deployment.resolver, STELLAR_ESCROW_ENABLED: "true" };
for (const [key, value] of Object.entries(values)) {
  environment = new RegExp(`^${key}=.*$`, "m").test(environment) ? environment.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) : environment.trimEnd() + `\n${key}=${value}\n`;
}
await writeFile(".env.local", environment);
console.log("Stellar Testnet escrow enabled. Restart Next.js if the payment controls do not appear.");
