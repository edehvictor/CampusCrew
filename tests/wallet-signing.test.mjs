import test from "node:test";
import assert from "node:assert/strict";
import { Networks } from "@stellar/stellar-sdk";
import { signPreparedWalletTransaction, walletTestnetPassphrase } from "../src/features/book-one/auth/wallet-signing.ts";

const prepared = { wallet: "expected-wallet", xdr: "prepared-transaction", networkPassphrase: Networks.TESTNET };
function kit(productId = "varial") {
  return {
    selectedModule: { productId },
    getAddress: async () => ({ address: prepared.wallet }),
    fetchAddress: async () => ({ address: prepared.wallet }),
    getNetwork: async () => ({ networkPassphrase: Networks.TESTNET }),
    signTransaction: async () => ({ signedTxXdr: "signed-transaction", signerAddress: prepared.wallet }),
  };
}

test("xBull signing skips unsupported network lookup and avoids a second connect popup", async () => {
  assert.equal(walletTestnetPassphrase, Networks.TESTNET);
  const wallet = kit("xbull");
  wallet.getNetwork = async () => assert.fail("xBull does not support getNetwork");
  wallet.fetchAddress = async () => assert.fail("Do not open a second xBull connection popup");
  wallet.signTransaction = async (xdr, options) => {
    assert.equal(xdr, prepared.xdr);
    assert.deepEqual(options, { address: prepared.wallet, networkPassphrase: Networks.TESTNET });
    return { signedTxXdr: "signed-transaction", signerAddress: prepared.wallet };
  };
  assert.equal((await signPreparedWalletTransaction(wallet, prepared, prepared.wallet)).signedTxXdr, "signed-transaction");
});

test("wallets that support network lookup still reject Mainnet before signing", async () => {
  const wallet = kit();
  wallet.getNetwork = async () => ({ networkPassphrase: Networks.PUBLIC });
  wallet.signTransaction = async () => assert.fail("Do not sign on the wrong network");
  await assert.rejects(signPreparedWalletTransaction(wallet, prepared, prepared.wallet), /Testnet/);
});

test("prepared wallet and network mismatches are rejected before wallet access", async () => {
  const wallet = kit("xbull");
  wallet.getAddress = async () => assert.fail("Do not access a wallet for mismatched input");
  await assert.rejects(signPreparedWalletTransaction(wallet, { ...prepared, networkPassphrase: Networks.PUBLIC }, prepared.wallet));
  await assert.rejects(signPreparedWalletTransaction(wallet, { ...prepared, wallet: "another" }, prepared.wallet));
});

test("changed wallet accounts and wrong signing accounts are rejected", async () => {
  const wallet = kit("xbull");
  wallet.getAddress = async () => ({ address: "another-wallet" });
  await assert.rejects(signPreparedWalletTransaction(wallet, prepared, prepared.wallet), /Reconnect/);
  wallet.getAddress = async () => ({ address: prepared.wallet });
  wallet.signTransaction = async () => ({ signedTxXdr: "signed", signerAddress: "another-wallet" });
  await assert.rejects(signPreparedWalletTransaction(wallet, prepared, prepared.wallet), /did not match/);
  wallet.signTransaction = async () => ({ signedTxXdr: "" });
  await assert.rejects(signPreparedWalletTransaction(wallet, prepared, prepared.wallet));
});
