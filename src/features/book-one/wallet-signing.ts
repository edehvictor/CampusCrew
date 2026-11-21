// xBull cannot report its active network. Bind signing to Testnet explicitly;
// booking signatures are checked by the server and classic transactions by Testnet Horizon.
export const walletTestnetPassphrase = "Test SDF Network ; September 2015";

type SigningKit = {
  readonly selectedModule: { productId: string };
  getAddress: () => Promise<{ address: string }>;
  fetchAddress: () => Promise<{ address: string }>;
  getNetwork: () => Promise<{ networkPassphrase: string }>;
  signTransaction: (xdr: string, options: { address: string; networkPassphrase: string }) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
};

export async function signPreparedWalletTransaction(kit: SigningKit, prepared: { xdr: string; wallet: string; networkPassphrase: string }, expectedWallet: string) {
  if (prepared.wallet !== expectedWallet || prepared.networkPassphrase !== walletTestnetPassphrase) {
    throw new Error("The prepared wallet or network did not match Stellar Testnet.");
  }
  const xbull = kit.selectedModule.productId === "xbull";
  // fetchAddress opens a separate xBull connection popup; use the already-connected address.
  const { address } = await (xbull ? kit.getAddress() : kit.fetchAddress());
  if (address !== expectedWallet) throw new Error("Reconnect the wallet you signed in with.");
  if (!xbull && (await kit.getNetwork()).networkPassphrase !== walletTestnetPassphrase) {
    throw new Error("Switch your wallet to Stellar Testnet first.");
  }
  const signed = await kit.signTransaction(prepared.xdr, { address: expectedWallet, networkPassphrase: walletTestnetPassphrase });
  if (!signed.signedTxXdr || (signed.signerAddress && signed.signerAddress !== expectedWallet)) {
    throw new Error("The signing wallet did not match. Reconnect your wallet and try again.");
  }
  return signed;
}
