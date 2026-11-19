import "server-only";

export function getPilotConfig() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return { network: "stellar-testnet" as const };
}
