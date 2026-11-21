"use client";

import { CircleUserRound, RotateCw, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { BookOneBoard } from "./board";
import { getStellarWallet } from "./pilot-wallet";
import { PilotDialog, type PilotPanel } from "./pilot-dialog";
import { PilotError } from "./pilot-error";
import type { EntryIntent, PilotMutation, PilotProfile, PilotSnapshot } from "./pilot-types";
import "./pilot.css";

const blank: PilotSnapshot = { jobs: [], account: null, paymentsEnabled: false };

function message(error: unknown) {
  if (error instanceof PilotError) return error.message;
  const detail = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/reject|denied|declined|cancel/i.test(detail)) return "The wallet request was cancelled. You can try again.";
  if (/network|passphrase/i.test(detail)) return "Switch your wallet to Stellar Testnet and try again.";
  if (/support.*signMessage|signMessage.*support/i.test(detail)) return "Choose Freighter / Varial or xBull to sign in with a Stellar message.";
  return "That action could not be completed. Check your wallet or connection and try again.";
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new PilotError(result?.error ?? "CampusCrew could not load. Try again shortly.", response.status);
  return result as T;
}

export function PilotBoard() {
  const [snapshot, setSnapshot] = useState(blank);
  const [connectedWallet, setConnectedWallet] = useState<string>();
  const [banner, setBanner] = useState("");
  const [panel, setPanel] = useState<PilotPanel | null>(null);
  const [resume, setResume] = useState<EntryIntent | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<EntryIntent | null>(null);
  const working = useRef(false);
  const version = useRef(0);
  const account = snapshot.account;
  const profile = account?.profile ?? null;

  const load = useCallback(async () => {
    const id = ++version.current;
    const data = await api<PilotSnapshot>("/api/book-one");
    if (id === version.current) setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch(cause => { if (active) setBanner(message(cause)); });
    return () => { active = false; };
  }, [load]);

  function finishSetup(data: PilotSnapshot) {
    const intent = pending.current;
    const details = data.account?.profile;
    const task = intent?.kind === "quote" ? data.jobs.find(job => job.id === intent.requestId) : undefined;
    if (!data.account) {
      setPanel("wallet");
      return;
    }
    if (!details || (task && (!details.skills.includes(task.category) || !details.coverage.some(area => area === task.area)))) {
      setPanel("profile");
      return;
    }
    setPanel(null);
    setError("");
    pending.current = null;
    setPendingRequestId(undefined);
    if (intent) setResume(intent);
  }

  async function handle(work: () => Promise<void>, showInBanner = false) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      if (showInBanner) setBanner(message(cause));
      else setError(message(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function prepare(intent: EntryIntent) {
    const task = intent.kind === "quote" ? snapshot.jobs.find(job => job.id === intent.requestId) : undefined;
    if (account && profile && (!task || (profile.skills.includes(task.category) && profile.coverage.some(area => area === task.area)))) return true;
    pending.current = intent;
    setPendingRequestId(intent.kind === "quote" ? intent.requestId : undefined);
    setError("");
    finishSetup(snapshot);
    return false;
  }

  async function chooseWallet() {
    setPanel(null);
    try {
      const { address } = await getStellarWallet().authModal();
      setConnectedWallet(address);
      setPanel("wallet");
    } catch (cause) {
      setPanel("wallet");
      throw cause;
    }
  }

  async function signIn() {
    const kit = getStellarWallet();
    const { address } = await kit.fetchAddress();
    setConnectedWallet(address);
    const challenge = await api<{ id: string; message: string; wallet: string }>("/api/stellar/auth", "POST", {
      action: "challenge", wallet: address,
    });
    const signed = await kit.signMessage(challenge.message, { address, networkPassphrase: Networks.TESTNET });
    if (signed.signerAddress && signed.signerAddress !== address) {
      throw new PilotError("The wallet account changed. Choose the wallet you want and sign in again.");
    }
    await api("/api/stellar/auth", "POST", {
      action: "signin", id: challenge.id, wallet: address, signature: signed.signedMessage,
    });
    setBanner("");
    finishSetup(await load());
  }

  async function mutate(mutation: PilotMutation) {
    const result = await api<{ requestId?: string }>("/api/book-one", "POST", mutation);
    await load();
    return result;
  }

  async function saveProfile(next: PilotProfile) {
    await api("/api/book-one", "POST", { action: "profile", profile: next });
    finishSetup(await load());
  }

  async function signOut() {
    await api("/api/stellar/auth", "DELETE");
    setSnapshot(blank);
    setConnectedWallet(undefined);
    pending.current = null;
    setPendingRequestId(undefined);
    setResume(null);
    setPanel(null);
    setBanner("");
    await getStellarWallet().disconnect();
    await load();
  }

  function close() {
    if (working.current) return;
    pending.current = null;
    setPendingRequestId(undefined);
    setPanel(null);
    setError("");
  }

  const name = profile?.displayName ?? "Complete profile";
  const initials = profile?.displayName.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  const accountControl = account ? (
    <button type="button" className="pilot-profile-button pilot-account" onClick={() => { setError(""); setPanel(profile ? "account" : "profile"); }}>
      <span className="avatar" aria-hidden="true">{initials || <CircleUserRound size={20} />}</span>
      <span>{name}</span>
    </button>
  ) : (
    <button type="button" className="button button-secondary pilot-connect" onClick={() => { setError(""); setPanel("wallet"); }}>
      <Wallet size={17} aria-hidden="true" /> <span>Connect wallet</span>
    </button>
  );
  const notice = (
    <div className="pilot-bar">
      <div className="pilot-funds">
        <strong>Stellar Testnet</strong><small>Prices in test USDC</small>
      </div>
      <button type="button" className="text-button" disabled={busy} onClick={() => { void handle(async () => { await load(); setBanner(""); }, true); }}>
        <RotateCw size={15} aria-hidden="true" /> Refresh tasks
      </button>
      {banner && <p role="status">{banner}</p>}
    </div>
  );
  const selected = snapshot.jobs.find(job => job.id === pendingRequestId);

  return (
    <>
      <BookOneBoard live={{
        jobs: snapshot.jobs, accountControl,
        logout: account ? { run: () => { void handle(signOut, true); }, pending: busy } : undefined,
        banner: notice, paymentsEnabled: snapshot.paymentsEnabled, prepare, resume,
        onResumed: () => setResume(null), mutate,
        pay: async () => { throw new PilotError("Stellar escrow payments are being connected. This booking has not been paid.", 503); },
      }} />
      {panel && <PilotDialog key={panel} panel={panel} profile={profile} request={selected}
        connectedAddress={connectedWallet} accountWallet={account?.wallet} busy={busy} error={error}
        onClose={close} onConnect={() => { void handle(chooseWallet); }} onSignIn={() => { void handle(signIn); }}
        onSave={value => { void handle(() => saveProfile(value)); }}
        onEdit={() => setPanel("profile")} onSignOut={() => { void handle(signOut); }}
      />}
    </>
  );
}
