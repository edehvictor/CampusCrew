import { ExternalLink, RotateCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { WalletBalance } from "./stellar-balance";
import { getStellarWallet } from "./pilot-wallet";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

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
  const [settingUp, setSettingUp] = useState(false);
  const [notice, setNotice] = useState("");

  async function setup(action: "fund_xlm" | "prepare_usdc") {
    setSettingUp(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stellar/wallet", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === "prepare_usdc") {
        const kit = getStellarWallet();
        if ((await kit.fetchAddress()).address !== wallet || data.wallet !== wallet) throw new Error("Reconnect the wallet you signed in with.");
        if ((await kit.getNetwork()).networkPassphrase !== Networks.TESTNET || data.networkPassphrase !== Networks.TESTNET) throw new Error("Switch your wallet to Stellar Testnet first.");
        const signed = await kit.signTransaction(data.xdr, { address: wallet, networkPassphrase: Networks.TESTNET });
        if (signed.signerAddress && signed.signerAddress !== wallet) throw new Error("The wallet account changed. Refresh your balance.");
        // This classic trustline transaction goes directly to Horizon; it never changes a booking's payment status.
        const submitted = await fetch("https://horizon-testnet.stellar.org/transactions", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ tx: signed.signedTxXdr }), signal: AbortSignal.timeout(20_000),
        });
        if (!submitted.ok) throw new Error("The USDC asset could not be added. Refresh your balance before retrying.");
        setNotice("Test USDC added. You can now receive it from the faucet.");
      } else setNotice(data.message);
      setLoading(true);
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet setup could not finish.");
    } finally { setSettingUp(false); }
  }

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
        <button className="text-button" type="button" disabled={loading || settingUp} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>
          <RotateCw size={14} aria-hidden="true" /> Refresh balance
        </button>
      </div>
      <small>Stellar Testnet · Test funds</small>
      {loading && <p role="status">Loading your balance…</p>}
      {error && <p className="form-error" role="alert">{error}{result && " The balances below were last loaded successfully."}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && <>
        <dl className="profile-balance-amounts">
          <div><dt>Test USDC</dt><dd>{amount(result.usdc)}</dd></div>
          <div><dt>Test XLM</dt><dd>{amount(result.xlm)}</dd></div>
        </dl>
        {!result.accountExists ? <p>Activate this wallet on Stellar Testnet with test XLM first.</p>
          : !result.hasUsdcTrustline && <p>Add Circle’s test USDC asset in your wallet before receiving it.</p>}
        <small>Updated {new Date(result.checkedAt).toLocaleTimeString()}</small>
      </>}
      {result && <div className="profile-balance-links">
        {(!result.accountExists || Number(result.xlm) < 100) && <button className="button button-secondary" type="button" disabled={settingUp || loading} onClick={() => { void setup("fund_xlm"); }}>Get test XLM</button>}
        {result.accountExists && !result.hasUsdcTrustline && <button className="button button-secondary" type="button" disabled={settingUp || loading} onClick={() => { void setup("prepare_usdc"); }}>Add test USDC to wallet</button>}
      </div>}
      <div className="profile-balance-links">
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC <ExternalLink size={13} aria-hidden="true" /></a>
        <a href={`https://stellar.expert/explorer/testnet/account/${wallet}`} target="_blank" rel="noreferrer">View wallet <ExternalLink size={13} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
