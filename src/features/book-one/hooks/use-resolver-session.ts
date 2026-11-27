"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { getStellarWallet } from "../auth/pilot-wallet";
import { clientApi } from "../services/client-api";
import {
  connectResolverVarial,
  resolverSignInAddress,
  resolverWalletError,
} from "../auth/resolver-wallet";
type Session = {
  wallet: string | null;
  resolver: string | null;
  allowed: boolean;
};
export function useResolverSession() {
  const [session, setSession] = useState<Session | null>(null),
    [connected, setConnected] = useState<string>(),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [phase, setPhase] = useState<
      "connect" | "signin" | "signout" | "configuration" | null
    >(null);
  const working = useRef(false);
  const refresh = useCallback(async () => {
    const value = await clientApi<Session>("/api/admin/disputes?view=session");
    setSession(value);
    return value;
  }, []);
  useEffect(() => {
    let active = true;
    clientApi<Session>("/api/admin/disputes?view=session")
      .then((v) => {
        if (active) setSession(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(
    work: () => Promise<void>,
    action: "connect" | "signin" | "signout" | "configuration",
  ) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setPhase(action);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(resolverWalletError(e));
    } finally {
      working.current = false;
      setBusy(false);
      setPhase(null);
    }
  }
  const connect = () =>
    run(async () => {
      setConnected(undefined);
      const { address } = await connectResolverVarial(getStellarWallet());
      setConnected(address);
    }, "connect");
  const chooseWallet = () =>
    run(async () => {
      setConnected(undefined);
      const { address } = await getStellarWallet().authModal();
      setConnected(address);
    }, "connect");
  const signIn = () =>
    run(async () => {
      const kit = getStellarWallet(),
        { address } = await resolverSignInAddress(kit, session?.resolver ?? "");
      const challenge = await clientApi<{ id: string; message: string }>(
        "/api/stellar/auth",
        { action: "challenge", wallet: address, scope: "admin" },
      );
      const signed = await kit.signMessage(challenge.message, {
        address,
        networkPassphrase: Networks.TESTNET,
      });
      if (signed.signerAddress && signed.signerAddress !== address)
        throw new Error("The wallet changed during sign-in.");
      await clientApi("/api/stellar/auth", {
        action: "signin",
        id: challenge.id,
        wallet: address,
        signature: signed.signedMessage,
      });
      await refresh();
    }, "signin");
  const signOut = () =>
    run(async () => {
      const r = await fetch("/api/stellar/auth", { method: "DELETE" });
      if (!r.ok) throw new Error("Sign-out failed.");
      await getStellarWallet().disconnect();
      setConnected(undefined);
      await refresh();
    }, "signout");
  return {
    session,
    connected,
    busy,
    phase,
    loading,
    error,
    connect,
    chooseWallet,
    signIn,
    signOut,
    retry: () =>
      run(async () => {
        await refresh();
      }, "configuration"),
  };
}
