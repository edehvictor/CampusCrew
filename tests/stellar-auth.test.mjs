import assert from "node:assert/strict";
import test from "node:test";
import { hash, Keypair } from "@stellar/stellar-sdk";
import {
  challengeMatches, createSignInChallenge, isStellarWallet, newSessionToken, tokenHash, verifySignInSignature,
} from "../src/features/book-one/stellar-auth.ts";

test("Stellar login verifies the published SEP-53 signature vector", () => {
  const address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
  const signature = "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==";
  assert.equal(verifySignInSignature(address, "Hello, World!", signature), true);
  assert.equal(verifySignInSignature(address, "Different message", signature), false);
});

test("login challenges contain the wallet, origin, network, nonce, and expiry", () => {
  const wallet = Keypair.random().publicKey();
  const issued = new Date("2026-11-19T10:00:00.000Z");
  const first = createSignInChallenge(wallet, "http://localhost:3000", issued);
  const second = createSignInChallenge(wallet, "http://localhost:3000", issued);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.message, second.message);
  assert.equal(first.expiresAt, "2026-11-19T10:05:00.000Z");
  for (const required of [wallet, "URI: http://localhost:3000", "Network: Stellar Testnet", first.id, "Nonce:", first.expiresAt]) {
    assert.ok(first.message.includes(required));
  }
});

test("message signatures reject a different wallet and raw transaction signatures", () => {
  const signer = Keypair.random();
  const message = createSignInChallenge(signer.publicKey(), "http://localhost:3000").message;
  const signed = Buffer.from(signer.sign(hash(Buffer.from(`Stellar Signed Message:\n${message}`)))).toString("base64");
  assert.equal(verifySignInSignature(signer.publicKey(), message, signed), true);
  assert.equal(verifySignInSignature(Keypair.random().publicKey(), message, signed), false);
  assert.equal(verifySignInSignature(signer.publicKey(), message, Buffer.from(signer.sign(Buffer.from(message))).toString("base64")), false);
  assert.equal(verifySignInSignature(signer.publicKey(), message, "invalid"), false);
});

test("browser binding, wallet, origin, consumption and expiry all restrict login", () => {
  const wallet = Keypair.random().publicKey();
  const binding = newSessionToken();
  const now = Date.parse("2026-11-19T10:00:00Z");
  const challenge = {
    wallet, origin: "http://localhost:3000", binding_hash: tokenHash(binding),
    expires_at: new Date(now + 300_000).toISOString(), consumed_at: null,
  };
  assert.equal(challengeMatches(challenge, wallet, challenge.origin, binding, now), true);
  assert.equal(challengeMatches(challenge, wallet, "http://localhost:3001", binding, now), false);
  assert.equal(challengeMatches(challenge, wallet, challenge.origin, newSessionToken(), now), false);
  assert.equal(challengeMatches(challenge, Keypair.random().publicKey(), challenge.origin, binding, now), false);
  assert.equal(challengeMatches(challenge, wallet, challenge.origin, binding, now + 300_000), false);
  assert.equal(challengeMatches({ ...challenge, consumed_at: new Date(now).toISOString() }, wallet, challenge.origin, binding, now), false);
});

test("Ethereum addresses and malformed Stellar addresses cannot start a login", () => {
  for (const value of ["0x1234567890123456789012345678901234567890", "G".repeat(56), "", null]) {
    assert.equal(isStellarWallet(value), false);
    assert.throws(() => createSignInChallenge(value, "http://localhost:3000"));
  }
});
