import { ExternalLink, RotateCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { WalletBalance } from "./stellar-balance";

const wholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

function amount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${wholeNumber.format(BigInt(whole))}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

export function ProfileBalance({ wallet }: { wallet: string }) {
  const [result, setResult] = useState<WalletBalance | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/stellar/balance", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Your balance is unavailable right now.");
        if (data.wallet !== wallet || data.network !== "stellar-testnet") throw new Error("Reconnect your wallet to refresh its balance.");
        if (active) { setResult(data); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Your balance is unavailable right now.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [wallet, refresh]);

  return (
    <section className="profile-balance" aria-label="Wallet balance" aria-busy={loading}>
      <div className="profile-balance-heading">
        <span><Wallet size={17} aria-hidden="true" /> Wallet balance</span>
        <button className="text-button" type="button" disabled={loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>
          <RotateCw size={14} aria-hidden="true" /> Refresh balance
        </button>
      </div>
      <small>Stellar Testnet · Test funds</small>
      {loading && <p role="status">Loading your balance…</p>}
      {error && <p className="form-error" role="alert">{error}{result && " The balances below were last loaded successfully."}</p>}
      {result && <>
        <dl className="profile-balance-amounts">
          <div><dt>Test USDC</dt><dd>{amount(result.usdc)}</dd></div>
          <div><dt>Test XLM</dt><dd>{amount(result.xlm)}</dd></div>
        </dl>
        {!result.accountExists ? <p>Activate this wallet on Stellar Testnet with test XLM first.</p>
          : !result.hasUsdcTrustline && <p>Add Circle’s test USDC asset in your wallet before receiving it.</p>}
        <small>Updated {new Date(result.checkedAt).toLocaleTimeString()}</small>
      </>}
      <div className="profile-balance-links">
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC <ExternalLink size={13} aria-hidden="true" /></a>
        <a href={`https://stellar.expert/explorer/testnet/account/${wallet}`} target="_blank" rel="noreferrer">View wallet <ExternalLink size={13} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
