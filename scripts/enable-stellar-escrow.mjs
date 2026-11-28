import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  Contract,
  Networks,
  rpc,
  scValToNative,
  contract,
} from "@stellar/stellar-sdk";
import { stellarTestnetRpc, testUsdcContract } from "../src/features/book-one/services/stellar-escrow.ts";

process.loadEnvFile(".env.local");
const funded = process.argv.includes("--funded");
const prefix = funded ? "STELLAR_FUNDED_" : "STELLAR_ESCROW_";
const deployment = JSON.parse(
  await readFile(
    funded
      ? "deployments/stellar-funded-testnet.json"
      : "deployments/stellar-testnet.json",
    "utf8",
  ),
);
if (
  funded &&
  (process.env.STELLAR_ESCROW_ENABLED !== "true" ||
    process.env.STELLAR_ESCROW_RESOLVER !== deployment.resolver)
)
  throw new Error(
    "Keep the existing escrow enabled with the same resolver for older bookings.",
  );
if (deployment.verified !== true || deployment.network !== "stellar-testnet" || deployment.token !== testUsdcContract)
  throw new Error("Deploy and verify the contract first.");
const client = new rpc.Server(stellarTestnetRpc, { timeout: 12_000 });
if ((await client.getNetwork()).passphrase !== Networks.TESTNET)
  throw new Error("Unexpected network.");
const entry = (
  await client.getLedgerEntries(
    new Contract(deployment.contract).getFootprint(),
  )
).entries[0];
if (
  !entry ||
  entry.val.type !== "contractData" ||
  entry.val.contractData.val.type !== "scvContractInstance"
)
  throw new Error("Contract unavailable.");
const instance = entry.val.contractData.val.instance;
const settings = new Map(
  (instance.storage ?? []).map((i) => [
    JSON.stringify(scValToNative(i.key)),
    scValToNative(i.val),
  ]),
);
if (
  settings.get('["Token"]') !== deployment.token ||
  settings.get('["Resolver"]') !== deployment.resolver
)
  throw new Error("Contract token or resolver mismatch.");
const executable = instance.executable;
if (
  executable.type !== "contractExecutableWasm" ||
  Buffer.from(executable.wasmHash.toXdrObject()).toString("hex") !==
    deployment.wasmHash
)
  throw new Error("Contract code mismatch.");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
for (const table of funded
  ? ["campuscrew_task_publications", "campuscrew_publication_intents"]
  : ["campuscrew_stellar_escrows", "campuscrew_stellar_payment_intents"]) {
  const { error } = await db
    .from(table)
    .select("request_id", { head: true, count: "exact" });
  if (error)
    throw new Error(
      "Apply the " +
        (funded
          ? "20261128000200_funded_task_lifecycle.sql"
          : "20261121000100_stellar_escrow.sql") +
        " migration before enabling payments.",
    );
}
if (funded) {
  const spec = contract.Spec.fromWasm(
    await client.getContractWasmByContractId(deployment.contract),
  );
  for (const name of [
    "publish",
    "assign",
    "cancel_publication",
    "get_publication",
  ])
    spec.getFunc(name);
}
let environment = await readFile(".env.local", "utf8");
const values = {
  [prefix + "CONTRACT"]: deployment.contract,
  [prefix + "WASM_HASH"]: deployment.wasmHash,
  [prefix + "RESOLVER"]: deployment.resolver,
  [prefix + "ENABLED"]: "true",
};
for (const [key, value] of Object.entries(values)) {
  environment = new RegExp(`^${key}=.*$`, "m").test(environment)
    ? environment.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : environment.trimEnd() + `\n${key}=${value}\n`;
}
await writeFile(".env.local", environment);
console.log(
  "Stellar Testnet escrow enabled. Restart Next.js if the payment controls do not appear.",
);
