import { ExternalLink, RotateCw, Wallet, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WalletAddress } from "./wallet-address";
import type { WalletBalance } from "@/features/book-one/services/stellar-balance";
import { getStellarWallet } from "@/features/book-one/auth/pilot-wallet";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { signPreparedWalletTransaction } from "@/features/book-one/auth/wallet-signing";

const wholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

function amount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${wholeNumber.format(BigInt(whole))}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

export function ProfileBalance({
  wallet,
  compact = false,
  onReconnect,
  busy = false,
}: {
  wallet: string;
  compact?: boolean;
  onReconnect?: () => void;
  busy?: boolean;
}) {
  const [result, setResult] = useState<WalletBalance | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [settingUp, setSettingUp] = useState(false);
  const [notice, setNotice] = useState("");
  const [setupStage, setSetupStage] = useState("");
  const setupInProgress = useRef(false);
  const balanceRef = useRef<HTMLElement>(null);
  const [preparedUsdc, setPreparedUsdc] = useState<{
    xdr: string;
    wallet: string;
    networkPassphrase: string;
    expiresAt: string;
  } | null>(null);

  function setupError(cause: unknown) {
    const detail =
      cause instanceof Error
        ? cause.message
        : cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Wallet setup could not finish.";
    return /set the wallet|selected module/i.test(detail)
      ? "Reconnect your wallet using the button below, then add test USDC again."
      : /cancel|reject|denied|declined/i.test(detail)
        ? "The wallet approval was cancelled. You can open the wallet again to retry."
        : detail;
  }

  async function setup(action: "fund_xlm" | "prepare_usdc") {
    if (setupInProgress.current) return;
    setupInProgress.current = true;
    setSettingUp(true);
    setSetupStage(
      action === "fund_xlm"
        ? "Requesting test XLM…"
        : "Preparing the USDC wallet approval…",
    );
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stellar/wallet", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === "prepare_usdc") {
        if (
          data.wallet !== wallet ||
          data.networkPassphrase !== Networks.TESTNET
        )
          throw new Error("The prepared wallet or network did not match.");
        setPreparedUsdc(data);
        setNotice("Approval is ready. Click Open wallet and approve below.");
        return;
      } else setNotice(data.message);
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(setupError(cause));
    } finally {
      setSettingUp(false);
      setSetupStage("");
      setupInProgress.current = false;
    }
  }

  async function approveUsdc() {
    if (setupInProgress.current || !preparedUsdc) return;
    setupInProgress.current = true;
    setSettingUp(true);
    setError("");
    setNotice("");
    setSetupStage(
      "Approve USDC in xBull or your selected wallet. Unlock it if prompted.",
    );
    // Native modal dialogs make external wallet overlays inert. Pause ours while the wallet is open.
    const dialog = balanceRef.current?.closest("dialog");
    const reopen = Boolean(dialog?.open);
    if (reopen) dialog?.close();
    try {
      if (Date.parse(preparedUsdc.expiresAt) <= Date.now()) {
        setPreparedUsdc(null);
        throw new Error(
          "This approval expired. Click Add test USDC to wallet to prepare it again.",
        );
      }
      // A separate user click opens the wallet without waiting on a network request first.
      const signed = await signPreparedWalletTransaction(
        getStellarWallet(),
        preparedUsdc,
        wallet,
      );
      setSetupStage("Adding USDC to your wallet on Stellar Testnet…");
      const submitted = await fetch(
        "https://horizon-testnet.stellar.org/transactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ tx: signed.signedTxXdr }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!submitted.ok)
        throw new Error(
          "The USDC asset could not be added. Refresh your balance before retrying.",
        );
      setPreparedUsdc(null);
      setNotice("Test USDC added. You can now receive it from the faucet.");
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(setupError(cause));
    } finally {
      if (reopen && dialog?.isConnected && !dialog.open) dialog.showModal();
      setSettingUp(false);
      setSetupStage("");
      setupInProgress.current = false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/stellar/balance", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ?? "Your balance is unavailable right now.",
          );
        if (data.wallet !== wallet || data.network !== "stellar-testnet")
          throw new Error("Reconnect your wallet to refresh its balance.");
        if (active) {
          setResult(data);
          setError("");
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your balance is unavailable right now.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [wallet, refresh]);

  const walletTools = result ? (
    <details
      className="wallet-tools"
      open={
        (!compact && (!result.accountExists || !result.hasUsdcTrustline)) ||
        Boolean(preparedUsdc)
      }
    >
      <summary>Test wallet tools</summary>
      <div className="wallet-setup-step">
        {!result.accountExists ? (
          <>
            <strong>Activate your wallet</strong>
            <p>Test XLM covers your transaction fees.</p>
            <button
              className="button button-primary"
              type="button"
              disabled={settingUp || loading}
              onClick={() => {
                void setup("fund_xlm");
              }}
            >
              {settingUp ? "Setting up…" : "Get test XLM"}
            </button>
          </>
        ) : !result.hasUsdcTrustline ? (
          <>
            <strong>Enable test USDC</strong>
            <p>
              Approve once in your wallet, then receive tokens from Circle’s
              faucet.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={settingUp || loading}
              onClick={() => {
                void (preparedUsdc ? approveUsdc() : setup("prepare_usdc"));
              }}
            >
              {settingUp
                ? "Waiting for wallet setup…"
                : preparedUsdc
                  ? "Open wallet and approve"
                  : "Add test USDC to wallet"}
            </button>
          </>
        ) : (
          <>
            <strong>Get test funds</strong>
            <p>
              Choose USDC and Stellar Testnet on Circle’s faucet. Paste your
              wallet address, then refresh here.
            </p>
            <a
              className="button button-primary"
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noreferrer"
            >
              Get test USDC <ExternalLink size={13} aria-hidden="true" />
            </a>
          </>
        )}
      </div>
    </details>
  ) : null;
  const walletLinks = (
    <div className="profile-balance-links">
      {result?.accountExists && Number(result.xlm) < 100 && (
        <button
          className="text-button"
          type="button"
          disabled={settingUp || loading}
          onClick={() => {
            void setup("fund_xlm");
          }}
        >
          Get test XLM
        </button>
      )}
      <a
        href={`https://stellar.expert/explorer/testnet/account/${wallet}`}
        target="_blank"
        rel="noreferrer"
      >
        View wallet <ExternalLink size={13} aria-hidden="true" />
      </a>
    </div>
  );
  return (
    <section
      className={
        compact ? "profile-balance profile-balance-compact" : "profile-balance"
      }
      aria-label="Wallet balance"
      aria-busy={loading}
      ref={balanceRef}
    >
      <div className="profile-balance-heading">
        <span>
          <Wallet size={17} aria-hidden="true" />{" "}
          {compact ? "Test USDC" : "Wallet balance"}
        </span>
        <button
          className="text-button"
          type="button"
          aria-label="Refresh balance"
          disabled={loading || settingUp}
          onClick={() => {
            setLoading(true);
            setRefresh((value) => value + 1);
          }}
        >
          <RotateCw size={14} aria-hidden="true" /> {!compact && "Refresh"}
        </button>
      </div>
      {!compact && <small>Stellar Testnet · Test funds</small>}
      {loading && <p role="status">Loading your balance…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
          {result && " The balances below were last loaded successfully."}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {setupStage && (
        <p className="wallet-setup-progress" role="status">
          {setupStage}
        </p>
      )}
      {result && (
        <>
          <dl className="profile-balance-amounts">
            <div>
              <dt className={compact ? "sr-only" : undefined}>Test USDC</dt>
              <dd>
                <span className="balance-value">{amount(result.usdc)}</span>
                {compact && <small>Stellar Testnet</small>}
              </dd>
            </div>
            {!compact && (
              <div>
                <dt>Test XLM</dt>
                <dd>{amount(result.xlm)}</dd>
              </div>
            )}
          </dl>

          {!compact && walletTools}
        </>
      )}
      {compact ? (
        <details className="account-wallet-details">
          <summary>
            Wallet details <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="account-wallet-content">
            <WalletAddress address={wallet} />
            {result && (
              <p className="account-gas-balance">
                <span>Test XLM for fees</span>
                <strong>{amount(result.xlm)}</strong>
              </p>
            )}
            {result && !result.hasUsdcTrustline && (
              <p className="wallet-setup-hint">
                Enable test USDC below before receiving payments.
              </p>
            )}
            {walletTools}
            {walletLinks}
            {onReconnect && (
              <button
                type="button"
                className="text-button"
                disabled={busy || settingUp}
                onClick={onReconnect}
              >
                Reconnect wallet
              </button>
            )}
          </div>
        </details>
      ) : (
        walletLinks
      )}
    </section>
  );
}
