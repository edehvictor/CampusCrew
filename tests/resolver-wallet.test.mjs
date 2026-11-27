import assert from "node:assert/strict";
import test from "node:test";
import {
  connectResolverVarial,
  resolverSignInAddress,
  resolverWalletError,
} from "../src/features/book-one/auth/resolver-wallet.ts";

test("admin connect selects Varial and requests a fresh extension address rather than a cached account", async () => {
  const calls = [];
  const kit = {
    selectedModule: { productId: "varial" },
    setWallet: (id) => calls.push(id),
    fetchAddress: async () => {
      calls.push("request-access");
      return { address: "resolver" };
    },
    getAddress: async () =>
      assert.fail("Do not use cached account for connection"),
  };
  assert.deepEqual(await connectResolverVarial(kit), { address: "resolver" });
  assert.deepEqual(calls, ["varial", "request-access"]);
});
test("sign-in rechecks Varial's imported account and rejects an account switch before asking for a challenge", async () => {
  const kit = {
    selectedModule: { productId: "varial" },
    setWallet: () => {},
    fetchAddress: async () => ({ address: "other" }),
    getAddress: async () => ({ address: "cached-resolver" }),
  };
  await assert.rejects(
    resolverSignInAddress(kit, "resolver"),
    /Select the resolver account/,
  );
  kit.fetchAddress = async () => ({ address: "resolver" });
  assert.deepEqual(await resolverSignInAddress(kit, "resolver"), {
    address: "resolver",
  });
});
test("xBull sign-in uses the established connection without opening a second connect popup", async () => {
  const kit = {
    selectedModule: { productId: "xbull" },
    setWallet: () => {},
    fetchAddress: async () => assert.fail("Avoid duplicate xBull popup"),
    getAddress: async () => ({ address: "resolver" }),
  };
  assert.deepEqual(await resolverSignInAddress(kit, "resolver"), {
    address: "resolver",
  });
});
test("connector errors carried as objects stay visible and missing extensions have actionable guidance", () => {
  assert.match(
    resolverWalletError({ code: -1, message: "Permission prompt failed" }),
    /Permission prompt failed/,
  );
  assert.match(
    resolverWalletError({ message: "Varial is not connected" }),
    /this browser profile/,
  );
  assert.match(
    resolverWalletError({ message: "User rejected access" }),
    /cancelled/,
  );
});
