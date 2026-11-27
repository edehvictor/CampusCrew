import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash, Keypair, StrKey } from "@stellar/stellar-sdk";

export const stellarSessionCookie = "campuscrew_stellar_session";
export const stellarChallengeCookie = "campuscrew_stellar_challenge";

export function isStellarWallet(wallet: unknown): wallet is string {
  return typeof wallet === "string" && StrKey.isValidEd25519PublicKey(wallet);
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export function createSignInChallenge(wallet: string, origin: string, now = new Date()) {
  if (!isStellarWallet(wallet)) throw new Error("Choose a valid Stellar wallet.");
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  const message = [
    `${new URL(origin).host} wants you to sign in to CampusCrew.`,
    "",
    `Wallet: ${wallet}`,
    "Sign in to post tasks, apply for work, and manage your CampusCrew profile.",
    "This signature authorizes sign-in only. It does not send a payment.",
    "",
    `URI: ${origin}`,
    "Network: Stellar Testnet",
    `Challenge: ${id}`,
    `Nonce: ${randomBytes(32).toString("hex")}`,
    `Issued at: ${now.toISOString()}`,
    `Expires at: ${expiresAt}`,
  ].join("\n");
  return { id, wallet, message, expiresAt };
}

/** Verify the domain-separated SEP-53 signature, never a raw transaction signature. */
export function verifySignInSignature(wallet: string, message: string, signature: string) {
  if (!isStellarWallet(wallet) || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64) return false;
  try {
    const digest = hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n"), Buffer.from(message, "utf8")]));
    return Keypair.fromPublicKey(wallet).verify(digest, bytes);
  } catch {
    return false;
  }
}

export function challengeMatches(
  challenge: { wallet: string; origin: string; binding_hash: string; expires_at: string; consumed_at: string | null },
  wallet: string,
  origin: string,
  bindingToken: string,
  now = Date.now(),
) {
  return isStellarWallet(wallet) && challenge.wallet === wallet && challenge.origin === origin
    && /^[a-f0-9]{64}$/.test(bindingToken) && challenge.binding_hash === tokenHash(bindingToken)
    && challenge.consumed_at === null && Date.parse(challenge.expires_at) > now;
}
