import { StrKey } from "@stellar/stellar-sdk";

export function isResolverWallet(
  wallet: string | undefined,
  resolver: string | undefined,
) {
  return Boolean(
    wallet &&
    resolver &&
    StrKey.isValidEd25519PublicKey(wallet) &&
    wallet === resolver,
  );
}
