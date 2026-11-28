import { StrKey } from "@stellar/stellar-sdk";
export type EscrowConfig = {
  contract: string;
  wasmHash: string;
  resolver: string;
};
function config(prefix: string): EscrowConfig | null {
  if (process.env[prefix + "ENABLED"] !== "true") return null;
  const contract = process.env[prefix + "CONTRACT"],
    wasmHash = process.env[prefix + "WASM_HASH"],
    resolver = process.env[prefix + "RESOLVER"];
  return contract &&
    StrKey.isValidContract(contract) &&
    wasmHash &&
    /^[a-f0-9]{64}$/.test(wasmHash) &&
    resolver &&
    StrKey.isValidEd25519PublicKey(resolver)
    ? { contract, wasmHash, resolver }
    : null;
}
export const getEscrowConfig = () => config("STELLAR_ESCROW_");
export function getFundedPostingConfig() {
  const legacy = getEscrowConfig(),
    funded = config("STELLAR_FUNDED_");
  return legacy &&
    funded &&
    legacy.contract !== funded.contract &&
    legacy.resolver === funded.resolver
    ? funded
    : null;
}
export function escrowConfigFor(contract: string) {
  return (
    [getEscrowConfig(), getFundedPostingConfig()].find(
      (c) => c?.contract === contract,
    ) ?? null
  );
}
export function supportedEscrowContracts() {
  return [
    ...new Set(
      [getEscrowConfig()?.contract, getFundedPostingConfig()?.contract].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
}
