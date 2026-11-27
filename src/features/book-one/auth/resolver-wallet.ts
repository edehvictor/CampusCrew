type ResolverKit = {
  setWallet: (id: string) => void;
  selectedModule: { productId: string };
  fetchAddress: () => Promise<{ address: string }>;
  getAddress: () => Promise<{ address: string }>;
};

/** Request Varial access directly rather than routing through the kit chooser. */
export async function connectResolverVarial(kit: ResolverKit) {
  kit.setWallet("varial");
  const result = await kit.fetchAddress();
  if (!result.address)
    throw new Error("Varial did not return a wallet address.");
  return result;
}

export async function resolverSignInAddress(
  kit: ResolverKit,
  expected: string,
) {
  // Varial's active account may change after importing the resolver account.
  // xBull must retain its existing connection to avoid an extra popup.
  const result = await (kit.selectedModule.productId === "varial"
    ? kit.fetchAddress()
    : kit.getAddress());
  if (result.address !== expected)
    throw new Error(
      "Select the resolver account in your wallet, then reconnect. Its address must match the authorized resolver shown here.",
    );
  return result;
}

export function resolverWalletError(error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : typeof error === "string"
          ? error
          : "";
  if (/reject|declin|cancel|closed the modal/i.test(detail))
    return "The wallet request was cancelled. You can connect again when ready.";
  if (
    /varial is not connected|not installed|not detected|not available/i.test(
      detail,
    )
  )
    return "Varial was not detected in this browser profile. Open and unlock the extension here, then reload CampusCrew and try again.";
  return (
    detail || "The wallet could not connect. Open your extension and try again."
  );
}
