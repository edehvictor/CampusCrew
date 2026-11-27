import { usdcUnits } from "./usdc-units.ts";
export function awardUnits(value: string, funded: bigint) {
  if (value.length > 24) throw new Error("The award is too large.");
  const amount = /^0(?:\.0{1,7})?$/.test(value) ? 0n : usdcUnits(value);
  if (amount > funded)
    throw new Error("The provider award cannot exceed the funded deposit.");
  return amount;
}
