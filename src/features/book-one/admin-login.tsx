"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { useResolverSession } from "./hooks/use-resolver-session";

type Props = { auth: ReturnType<typeof useResolverSession> };
const shorten = (value: string) => value.slice(0, 8) + "…" + value.slice(-6);

export function AdminLogin({ auth }: Props) {
  const [copied, setCopied] = useState(false);
  const resolver = auth.session?.resolver;
  const matches = Boolean(resolver && auth.connected === resolver);
  const pending = auth.loading || auth.phase === "configuration";
  const unavailable = !pending && !resolver;
  async function copy() {
    if (!resolver) return;
    try {
      await navigator.clipboard.writeText(resolver);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section
      className="admin-login-shell"
      aria-labelledby="resolver-login-title"
    >
      <div className="admin-login-card">
        <div className="admin-login-card-top">
          <span className="admin-login-icon">
            <LockKeyhole size={24} aria-hidden="true" />
          </span>
          <span className="admin-login-network">Stellar Testnet</span>
        </div>
        <header className="admin-login-heading">
          <h1 id="resolver-login-title">Resolver sign-in</h1>
          <p>Review dispute cases and approve settlements.</p>
        </header>

        <ol className="admin-login-steps" aria-label="Admin sign-in steps">
          <li
            data-complete={matches}
            aria-current={!matches ? "step" : undefined}
          >
            <span>
              {matches ? <Check size={13} aria-hidden="true" /> : "1"}
            </span>
            Connect wallet
          </li>
          <li aria-current={matches ? "step" : undefined}>
            <span>2</span>Sign in
          </li>
        </ol>

        {auth.connected && (
          <div
            className="admin-connected-account"
            data-match={matches}
            role="status"
          >
            {matches ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Wallet size={18} aria-hidden="true" />
            )}
            <div>
              <strong>
                {matches
                  ? "Resolver wallet connected"
                  : "Different wallet connected"}
              </strong>
              <code>{shorten(auth.connected)}</code>
              {!matches && (
                <p>
                  Select the authorized account in your wallet, then reconnect.
                </p>
              )}
            </div>
          </div>
        )}

        {!auth.connected && auth.session?.wallet && (
          <p className="admin-login-session-note">
            Your marketplace account does not have admin access. Connect the
            resolver wallet to continue.
          </p>
        )}
        {unavailable && (
          <p className="admin-login-unavailable">
            {auth.session
              ? "No resolver wallet is configured for this deployment."
              : "Admin access could not be loaded. Try again."}
          </p>
        )}
        {auth.error && (
          <p className="admin-error" role="alert">
            {auth.error}
          </p>
        )}

        <div className="admin-login-controls">
          {unavailable ? (
            <button
              type="button"
              className="button button-primary"
              disabled={auth.busy}
              onClick={() => void auth.retry()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Try again
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={auth.busy || pending || !resolver}
              onClick={() => void (matches ? auth.signIn() : auth.connect())}
            >
              {auth.busy || pending ? (
                <LoaderCircle
                  className="admin-login-spinner"
                  size={18}
                  aria-hidden="true"
                />
              ) : matches ? (
                <ArrowRight size={18} aria-hidden="true" />
              ) : (
                <Wallet size={18} aria-hidden="true" />
              )}
              {auth.phase === "signin"
                ? "Approve sign-in in your wallet"
                : auth.phase === "connect"
                  ? "Connecting wallet…"
                  : matches
                    ? "Sign in securely"
                    : auth.connected
                      ? "Reconnect Varial"
                      : "Connect Varial"}
            </button>
          )}
          {!unavailable && (
            <div className="admin-login-alternatives">
              <button
                type="button"
                className="text-button"
                disabled={auth.busy || pending || !resolver}
                onClick={() => void auth.chooseWallet()}
              >
                Use another wallet
              </button>
              {matches && (
                <button
                  type="button"
                  className="text-button"
                  disabled={auth.busy}
                  onClick={() => void auth.connect()}
                >
                  Change account
                </button>
              )}
            </div>
          )}
        </div>

        <p className="admin-login-assurance">
          <LockKeyhole size={13} aria-hidden="true" />
          Sign-in does not move funds.
        </p>

        <details className="admin-login-help">
          <summary>
            Wallet details & help
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          {pending ? (
            <div
              className="admin-resolver-placeholder"
              aria-label="Loading authorized resolver"
            />
          ) : (
            resolver && (
              <div className="admin-resolver-details">
                <span>Authorized resolver</span>
                <code>{resolver}</code>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void copy()}
                >
                  {copied ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy address"}
                </button>
              </div>
            )
          )}
          <p>
            Use the browser profile where Varial is installed. If it already has
            permission, connection may finish without a popup; signing in still
            requires approval.
          </p>
        </details>
      </div>
      <p className="admin-login-caption">
        Private case access · Authorized resolver only
      </p>
    </section>
  );
}
