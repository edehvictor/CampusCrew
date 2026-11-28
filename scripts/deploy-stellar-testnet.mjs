import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
  contract,
} from "@stellar/stellar-sdk";
import {
  stellarTestnetRpc,
  testUsdcContract,
} from "../src/features/book-one/services/stellar-escrow.ts";

const funded = process.argv[2] === "--funded";
const prefix = funded ? "STELLAR_FUNDED_" : "STELLAR_ESCROW_";
const wasmPath =
  process.argv[funded ? 3 : 2] ?? "target/verified/campuscrew_escrow.wasm";
const wasm = await readFile(wasmPath);
if (wasm.subarray(0, 4).toString("hex") !== "0061736d")
  throw new Error("Expected the verified contract WebAssembly file.");
await WebAssembly.compile(wasm);
if (funded) {
  const spec = contract.Spec.fromWasm(wasm);
  for (const name of [
    "publish",
    "assign",
    "cancel_publication",
    "get_publication",
  ])
    spec.getFunc(name);
}
const wasmHash = createHash("sha256").update(wasm).digest("hex");
const server = new rpc.Server(stellarTestnetRpc, { timeout: 15_000 });
const network = await server.getNetwork();
if (network.passphrase !== Networks.TESTNET)
  throw new Error("Deployment is allowed only on Stellar Testnet.");

const keysPath = ".env.stellar-testnet.local";
try {
  await access(keysPath);
} catch {
  if(funded)throw new Error("The original private Testnet deployment key file is required. Restore it privately; do not generate a replacement resolver.");
  await writeFile(
    keysPath,
    [
      "# Testnet deployment and resolver keys. Never commit or share this file.",
      `STELLAR_DEPLOYER_SECRET=${Keypair.random().secret()}`,
      `STELLAR_RESOLVER_SECRET=${Keypair.random().secret()}`,
      `STELLAR_DEPLOY_SALT=${randomBytes(32).toString("hex")}`,
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
}
process.loadEnvFile(keysPath);
const deployer = Keypair.fromSecret(process.env.STELLAR_DEPLOYER_SECRET);
const resolver = Keypair.fromSecret(process.env.STELLAR_RESOLVER_SECRET);
if (deployer.publicKey() === resolver.publicKey())
  throw new Error("The resolver must use a separate account.");
await mkdir("deployments", { recursive: true });
const metadataPath = funded
  ? "deployments/stellar-funded-testnet.json"
  : "deployments/stellar-testnet.json";
if (funded) {
  const legacy = JSON.parse(
    await readFile("deployments/stellar-testnet.json", "utf8"),
  );
  if (!legacy.verified || legacy.resolver !== resolver.publicKey())
    throw new Error(
      "Funded tasks must retain the existing resolver. The legacy deployment is preserved.",
    );
  // A different deterministic salt creates a separate deployment. Never replace
  // the contract that holds existing bookings and their funds.
  process.env.STELLAR_DEPLOY_SALT = createHash("sha256")
    .update(process.env.STELLAR_DEPLOY_SALT + ":funded-publication-v1")
    .digest("hex");
}
let metadata = {};
try {
  metadata = JSON.parse(await readFile(metadataPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (metadata.wasmHash && metadata.wasmHash !== wasmHash)
  throw new Error(
    "A different deployment already exists. Review it before deploying another version.",
  );

for (const wallet of [deployer.publicKey(), resolver.publicKey()]) {
  try {
    await server.getAccount(wallet);
  } catch {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${wallet}`,
      { signal: AbortSignal.timeout(25_000) },
    );
    if (!response.ok)
      throw new Error(
        "Testnet Friendbot could not fund a deployment account. Retry later.",
      );
  }
}

async function waitFor(hash) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") return result;
    if (result.status === "FAILED")
      throw new Error(`Testnet transaction failed: ${hash}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    `Transaction is still pending: ${hash}. Check it before retrying.`,
  );
}

async function transact(operation, stage) {
  const account = await server.getAccount(deployer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (
    !rpc.Api.isSimulationSuccess(simulation) ||
    rpc.Api.isSimulationRestore(simulation)
  ) {
    throw new Error(
      `Could not simulate ${stage}: ${simulation.error ?? "Restore required"}`,
    );
  }
  const prepared = rpc.assembleTransaction(tx, simulation).build();
  prepared.sign(deployer);
  const hash = Buffer.from(prepared.hash()).toString("hex");
  metadata = {
    ...metadata,
    network: "stellar-testnet",
    wasmHash,
    token: testUsdcContract,
    resolver: resolver.publicKey(),
    deployer: deployer.publicKey(),
    [stage + "Tx"]: hash,
  };
  if (stage === "deploy")
    metadata.contract = scValToNative(simulation.result.retval);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR")
    throw new Error(`Stellar rejected ${stage}: ${hash}`);
  console.log(`${stage} submitted: ${hash}`);
  return waitFor(hash);
}

if (
  !(
    await server.getLedgerEntries(new Contract(testUsdcContract).getFootprint())
  ).entries.length
) {
  await transact(
    Operation.createStellarAssetContract({
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    }),
    "asset",
  );
}
let deployed =
  metadata.contract &&
  (
    await server.getLedgerEntries(
      new Contract(metadata.contract).getFootprint(),
    )
  ).entries[0];
if (!deployed) {
  if (metadata.uploadTx) {
    const prior = await server.getTransaction(metadata.uploadTx);
    if (
      prior.status === "NOT_FOUND" &&
      prior.latestLedgerCloseTime - prior.oldestLedgerCloseTime > 0
    ) {
      // Uploading the same code again is idempotent at the WASM hash; it does not move user funds.
      await transact(Operation.uploadContractWasm({ wasm }), "upload");
    } else if (prior.status === "FAILED")
      await transact(Operation.uploadContractWasm({ wasm }), "upload");
    else if (prior.status !== "SUCCESS") await waitFor(metadata.uploadTx);
  } else await transact(Operation.uploadContractWasm({ wasm }), "upload");
  await transact(
    Operation.createCustomContract({
      address: Address.fromString(deployer.publicKey()),
      wasmHash: Buffer.from(wasmHash, "hex"),
      salt: Buffer.from(process.env.STELLAR_DEPLOY_SALT, "hex"),
      constructorArgs: [
        Address.fromString(testUsdcContract).toScVal(),
        Address.fromString(resolver.publicKey()).toScVal(),
      ],
    }),
    "deploy",
  );
  deployed = (
    await server.getLedgerEntries(
      new Contract(metadata.contract).getFootprint(),
    )
  ).entries[0];
}
if (
  !deployed ||
  deployed.val.type !== "contractData" ||
  deployed.val.contractData.val.type !== "scvContractInstance"
)
  throw new Error("Deployed contract could not be verified.");
const instance = deployed.val.contractData.val.instance;
const settings = new Map(
  (instance.storage ?? []).map((item) => [
    JSON.stringify(scValToNative(item.key)),
    scValToNative(item.val),
  ]),
);
if (
  instance.executable.type !== "contractExecutableWasm" ||
  Buffer.from(instance.executable.wasmHash.toXdrObject()).toString("hex") !==
    wasmHash ||
  settings.get('["Token"]') !== testUsdcContract ||
  settings.get('["Resolver"]') !== resolver.publicKey()
)
  throw new Error("Deployment code or constructor values did not match.");
metadata.verified = true;
metadata.verifiedAt = new Date().toISOString();
await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
let environment = "";
try {
  environment = await readFile(".env.local", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const values = {
  [prefix + "CONTRACT"]: metadata.contract,
  [prefix + "WASM_HASH"]: wasmHash,
  [prefix + "RESOLVER"]: resolver.publicKey(),
  [prefix + "ENABLED"]: "false",
};
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  environment = new RegExp(`^${key}=.*$`, "m").test(environment)
    ? environment.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : environment.trimEnd() + "\n" + line + "\n";
}
await writeFile(".env.local", environment);
console.log(`Verified Testnet escrow: ${metadata.contract}`);
console.log(
  "Deployment saved. Apply its database migration and run the enable script. " +
    prefix +
    "ENABLED remains false.",
);
