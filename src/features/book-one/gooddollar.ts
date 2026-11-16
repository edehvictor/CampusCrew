import { chainConfigs } from "@goodsdks/citizen-sdk";
import { createPublicClient, http, parseAbi } from "viem";
import { celo } from "viem/chains";

export const goodDollarEnvironment = process.env.NEXT_PUBLIC_GOODDOLLAR_ENV === "production" ? "production" : "development";
const addresses = chainConfigs[celo.id].contracts[goodDollarEnvironment];
if (!addresses) throw new Error("GoodDollar contracts are unavailable for the selected Celo environment.");
export const goodDollar = addresses;

export const goodDollarTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transferAndCall(address to, uint256 value, bytes data) returns (bool)",
]);

export const escrowAbi = parseAbi([
  "function token() view returns (address)",
  "function payments(bytes32 key) view returns (address payer, address provider, uint64 refundAfter, uint8 state, uint256 amount)",
  "function release(bytes32 key)",
  "function refund(bytes32 key)",
  "event Funded(bytes32 indexed key)",
  "event Released(bytes32 indexed key)",
  "event Refunded(bytes32 indexed key)",
]);

export function createCeloClient(rpcUrl?: string) {
  return createPublicClient({ chain: { ...celo, formatters: undefined }, transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }) });
}
