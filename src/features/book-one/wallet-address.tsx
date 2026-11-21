import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setError(false);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
      setError(true);
    }
  }

  return <div className="wallet-address-block">
    <div className="wallet-address-row"><span><small>Stellar wallet</small><code title={address}>{address.slice(0, 8)}…{address.slice(-8)}</code></span>
      <button className="button button-icon" type="button" aria-label={copied ? "Wallet address copied" : "Copy wallet address"} onClick={() => { void copy(); }}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button>
    </div>
    <span className="wallet-copy-status" role="status">{copied ? "Address copied" : ""}</span>
    {error && <label className="wallet-copy-fallback">Select and copy your address<input readOnly value={address} onFocus={event => event.currentTarget.select()} /></label>}
  </div>;
}
