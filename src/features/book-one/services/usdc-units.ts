export function usdcUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw new Error("Invalid USDC amount.");
  const [whole, decimals = ""] = value.split(".");
  const amount = BigInt(whole) * 10_000_000n + BigInt(decimals.padEnd(7, "0"));
  if (amount <= 0n || amount > 10_000_000_000_000n)
    throw new Error("USDC amount is out of range.");
  return amount;
}
