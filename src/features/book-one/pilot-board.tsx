import { ClaimSDK, IdentitySDK } from "@goodsdks/citizen-sdk";
import { useAppKit } from "@reown/appkit/react";
import type { EthereumWallet, SupabaseClient } from "@supabase/supabase-js";
import { CircleUserRound, RotateCw, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits, type Address, type Hash } from "viem";
import { celo } from "viem/chains";
import { useAccount, useConfig, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { BookOneBoard } from "./board";
import { createCeloClient, escrowAbi, goodDollar, goodDollarEnvironment, goodDollarTokenAbi } from "./gooddollar";
import { PilotDialog, type PilotPanel } from "./pilot-dialog";
import { PilotError } from "./pilot-error";
import type { EntryIntent, PaymentInstruction, PaymentOperation, PilotMutation, PilotProfile, PilotSnapshot } from "./pilot-types";
import "./pilot.css";

const publicClient = createCeloClient(process.env.NEXT_PUBLIC_CELO_RPC_URL);
const pendingKey = "campuscrew-pending-action";
const blank: PilotSnapshot = { jobs: [], account: null, paymentsEnabled: false };

function message(error: unknown) {
  if (error instanceof PilotError) return error.message;
  if (error instanceof Error && (/reject|denied/i).test(error.message)) return "The wallet request was declined.";
  return "That action could not be completed. Check your wallet or connection and try again.";
}

export function PilotBoard({ auth }: { auth: SupabaseClient }) {
  const { address, chainId, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const { open } = useAppKit();
  const [snapshot, setSnapshot] = useState(blank);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [banner, setBanner] = useState("");
  const [panel, setPanel] = useState<PilotPanel | null>(null);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [resume, setResume] = useState<EntryIntent | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<EntryIntent | null>(null);
  const returned = useRef(false);
  const version = useRef(0);
  const working = useRef(false);
  const account = snapshot.account;
  const profile = account?.profile ?? null;

  const balance = useReadContract({
    address: goodDollar.g$Contract, abi: goodDollarTokenAbi, functionName: "balanceOf",
    args: account ? [account.wallet] : undefined, chainId: celo.id,
    query: { enabled: Boolean(account), refetchInterval: 15000 },
  });
  const decimals = useReadContract({
    address: goodDollar.g$Contract, abi: goodDollarTokenAbi, functionName: "decimals", chainId: celo.id,
    query: { enabled: Boolean(account), staleTime: Infinity },
  });

  const request = useCallback(async <T,>(mutation?: PilotMutation, token?: string): Promise<T> => {
    const accessToken = token ?? (await auth.auth.getSession()).data.session?.access_token;
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (mutation) headers.set("Content-Type", "application/json");
    const response = await fetch("/api/book-one", {
      method: mutation ? "POST" : "GET", headers, cache: "no-store",
      body: mutation ? JSON.stringify(mutation) : undefined,
    });
    const body = await response.json();
    if (!response.ok) throw new PilotError(body.error ?? "Campuscrew could not load.", response.status);
    return body as T;
  }, [auth]);

  const load = useCallback(async (token?: string) => {
    const id = ++version.current;
    const data = await request<PilotSnapshot>(undefined, token);
    if (id === version.current) setSnapshot(data);
    return data;
  }, [request]);

  const finishSetup = useCallback((data: PilotSnapshot) => {
    const intent = pending.current;
    const activeAccount = data.account;
    const savedProfile = activeAccount?.profile;
    const job = intent?.kind === "quote" ? data.jobs.find(item => item.id === intent.requestId) : undefined;
    if (!activeAccount) {
      setPanel("wallet");
      return;
    }
    if (!savedProfile || (job && (!savedProfile.skills.includes(job.category) || !savedProfile.coverage.some(area => area === job.area)))) {
      setPanel("profile");
      return;
    }
    if (!activeAccount.verified) {
      setPanel("verify");
      return;
    }
    setPanel(null);
    setError("");
    pending.current = null;
    setPendingRequestId(undefined);
    sessionStorage.removeItem(pendingKey);
    if (intent) setResume(intent);
  }, []);

  const checkVerification = useCallback(async () => {
    await request({ action: "verify" });
    finishSetup(await load());
  }, [finishSetup, load, request]);

  useEffect(() => {
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, session) => {
      setSessionKey(session?.access_token ?? "");
    });
    return () => subscription.unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (sessionKey === null) return;
    let active = true;
    void load(sessionKey).then(async data => {
      if (!active) return;
      setBanner("");
      if (returned.current || !data.account || !new URLSearchParams(window.location.search).has("gooddollar-return")) return;
      returned.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      try {
        const saved = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
        if (saved?.wallet === data.account.wallet && (saved.intent?.kind === "post" ||
          (saved.intent?.kind === "quote" && typeof saved.intent.requestId === "string"))) {
          pending.current = saved.intent;
          setPendingRequestId(saved.intent.kind === "quote" ? saved.intent.requestId : undefined);
        }
      } catch { /* The user can restart the action from the board. */ }
      try {
        await checkVerification();
        if (active) setBanner("GoodDollar verification confirmed.");
      } catch (cause) {
        if (!active) return;
        setPanel(data.account.profile ? "verify" : "profile");
        setError(message(cause));
      }
    }).catch(cause => { if (active) setBanner(message(cause)); });
    return () => { active = false; };
  }, [checkVerification, load, sessionKey]);

  useEffect(() => {
    if (!awaitingWallet || !address) return;
    const frame = requestAnimationFrame(() => {
      setAwaitingWallet(false);
      setPanel("wallet");
    });
    return () => cancelAnimationFrame(frame);
  }, [address, awaitingWallet]);

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
    const job = intent.kind === "quote" ? snapshot.jobs.find(item => item.id === intent.requestId) : undefined;
    if (account?.verified && profile && (!job || (profile.skills.includes(job.category) && profile.coverage.some(area => area === job.area)))) return true;
    setError("");
    pending.current = intent;
    setPendingRequestId(intent.kind === "quote" ? intent.requestId : undefined);
    if (!account && !address) {
      void chooseWallet();
    } else {
      finishSetup(snapshot);
    }
    return false;
  }

  async function chooseWallet() {
    setPanel(null);
    try {
      if (address) await disconnectAsync();
      setAwaitingWallet(true);
      await open({ view: "Connect" });
    } catch (cause) {
      setAwaitingWallet(false);
      setPanel("wallet");
      setError(message(cause));
    }
  }

  async function ensureCeloWallet(wallet?: Address) {
    if (!address || (wallet && address.toLowerCase() !== wallet.toLowerCase())) {
      throw new PilotError("Reconnect the wallet linked to your Campuscrew account.");
    }
    if (chainId !== celo.id) await switchChainAsync({ chainId: celo.id });
    return getWalletClient(config, { chainId: celo.id, account: address });
  }

  async function signIn() {
    await ensureCeloWallet();
    const provider = await connector?.getProvider();
    if (!provider) throw new PilotError("Choose a wallet first.");
    // Supabase binds the signed message to this origin and issues the application session.
    const { data, error: signInError } = await auth.auth.signInWithWeb3({
      chain: "ethereum",
      wallet: provider as EthereumWallet,
      statement: "Sign in to Campuscrew.",
      options: { url: new URL("/", window.location.origin).href },
    });
    if (signInError || !data.session) throw new PilotError(signInError?.message ?? "Wallet sign-in did not complete.");
    const loaded = await load(data.session.access_token);
    await advance(loaded);
  }

  async function advance(data: PilotSnapshot) {
    if (data.account?.profile && !data.account.verified) {
      try {
        await checkVerification();
        return;
      } catch (cause) {
        if (!(cause instanceof PilotError) || cause.status !== 403) throw cause;
      }
    }
    finishSetup(data);
  }

  async function saveProfile(next: PilotProfile) {
    await request({ action: "profile", profile: next });
    await advance(await load());
  }

  async function startVerification() {
    if (!account) throw new PilotError("Connect a wallet first.");
    const walletClient = await ensureCeloWallet(account.wallet);
    const sdk = new IdentitySDK({ account: account.wallet, publicClient, walletClient, env: goodDollarEnvironment });
    const returnUrl = new URL("/", window.location.origin);
    returnUrl.searchParams.set("gooddollar-return", "1");
    sessionStorage.setItem(pendingKey, JSON.stringify({ wallet: account.wallet, intent: pending.current }));
    window.location.assign(await sdk.generateFVLink(false, returnUrl.href, celo.id));
  }

  async function claim() {
    if (!account?.verified) {
      setError("");
      finishSetup(snapshot);
      return;
    }
    const walletClient = await ensureCeloWallet(account.wallet);
    const identitySDK = new IdentitySDK({ account: account.wallet, publicClient, walletClient, env: goodDollarEnvironment });
    const claimSdk = new ClaimSDK({ account: account.wallet, publicClient, walletClient, identitySDK, env: goodDollarEnvironment });
    const availability = await claimSdk.checkEntitlement();
    if (availability.amount === 0n) throw new PilotError("There is no G$ claim available for this wallet right now.");
    await claimSdk.claim();
    await balance.refetch();
    setBanner("G$ claim confirmed.");
  }

  async function mutate(mutation: PilotMutation) {
    const outcome = await request<{ requestId?: string }>(mutation);
    await load();
    return outcome;
  }

  async function pay(requestId: string, operation: PaymentOperation) {
    if (!account) throw new PilotError("Connect a wallet first.");
    const hashKey = `campuscrew:payment:${account.wallet}:${requestId}`;
    if (operation === "sync") {
      try {
        await request({ action: "payment", operation, requestId, hash: sessionStorage.getItem(hashKey) ?? undefined });
        sessionStorage.removeItem(hashKey);
      } catch (cause) {
        if (cause instanceof PilotError && cause.status === 422) sessionStorage.removeItem(hashKey);
        throw cause;
      }
      await load();
      return;
    }
    if (sessionStorage.getItem(hashKey)) throw new PilotError("Refresh the previous G$ transaction before trying again.");
    const walletClient = await ensureCeloWallet(account.wallet);
    const { instruction } = await request<{ instruction?: PaymentInstruction }>({ action: "payment", operation, requestId });
    if (!instruction) throw new PilotError("Refresh this booking and try again.");
    let hash: Hash;
    if (instruction.operation === "fund") {
      const amount = BigInt(instruction.amount);
      const available = await publicClient.readContract({
        address: instruction.token, abi: goodDollarTokenAbi, functionName: "balanceOf", args: [walletClient.account.address],
      });
      if (available < amount) {
        const missing = formatUnits(amount - available, decimals.data ?? 18);
        throw new PilotError(`You need ${missing} more G$ to fund this booking.`);
      }
      const simulation = await publicClient.simulateContract({
        address: instruction.token, abi: goodDollarTokenAbi, functionName: "transferAndCall",
        args: [instruction.escrow, amount, instruction.data], account: walletClient.account,
      });
      hash = await walletClient.writeContract(simulation.request);
    } else {
      const simulation = await publicClient.simulateContract({
        address: instruction.escrow, abi: escrowAbi, functionName: instruction.operation,
        args: [instruction.key], account: walletClient.account,
      });
      hash = await walletClient.writeContract(simulation.request);
    }
    sessionStorage.setItem(hashKey, hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
    if (receipt.status !== "success") {
      sessionStorage.removeItem(hashKey);
      throw new PilotError("The G$ transaction reverted. The booking can be refreshed and tried again.");
    }
    sessionStorage.setItem(hashKey, receipt.transactionHash);
    await request({ action: "payment", operation: "sync", requestId, hash: receipt.transactionHash });
    sessionStorage.removeItem(hashKey);
    await load();
    await balance.refetch();
  }

  function close() {
    if (working.current) return;
    setPanel(null);
    pending.current = null;
    setPendingRequestId(undefined);
    sessionStorage.removeItem(pendingKey);
  }

  async function signOut() {
    const result = await auth.auth.signOut();
    if (result.error) throw new PilotError(result.error.message);
    setSnapshot(blank);
    setResume(null);
    setPanel(null);
    pending.current = null;
    setPendingRequestId(undefined);
    sessionStorage.removeItem(pendingKey);
    await disconnectAsync();
  }

  const name = profile?.displayName;
  const initials = name?.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const formatted = balance.data !== undefined && decimals.data !== undefined ? formatUnits(balance.data, decimals.data) : null;
  const [whole, fraction] = formatted?.split(".") ?? [];
  const balanceLabel = whole ? `${new Intl.NumberFormat("en-NG").format(BigInt(whole))}${fraction ? "." + fraction.slice(0, 2) : ""} G$` : "G$ balance";
  const accountControl = account ? (
    <div className="pilot-account">
      <button
        className="pilot-profile-button"
        type="button"
        aria-label={name ? `Open profile for ${name}` : "Complete profile"}
        onClick={() => { setError(""); setPanel(profile ? "account" : "profile"); }}
      >
        <span className="avatar" aria-hidden="true">{initials ?? <CircleUserRound size={18} />}</span>
        <span>{name ?? "Complete profile"}</span>
      </button>
    </div>
  ) : (
    <button className="button button-secondary pilot-connect" type="button" onClick={() => address ? setPanel("wallet") : void chooseWallet()}>
      <Wallet size={17} aria-hidden="true" /> <span>Connect wallet</span>
    </button>
  );
  const notice = (
    <div className="pilot-bar">
      {account && <div className="pilot-funds">
        <span><strong>{balanceLabel}</strong> <small>{formatted ? "on Celo" : ""}</small></span>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => { void handle(claim, true); }}>Claim G$</button>
        {address?.toLowerCase() !== account.wallet.toLowerCase() &&
          <button type="button" className="text-button" onClick={() => { void open({ view: "Connect" }); }}>Reconnect wallet</button>}
      </div>}
      <button type="button" className="text-button" onClick={() => { void load().then(() => setBanner("")).catch(cause => setBanner(message(cause))); }}>
        <RotateCw size={15} aria-hidden="true" /> Refresh tasks
      </button>
      {banner && <p role="status">{banner}</p>}
    </div>
  );
  const selected = snapshot.jobs.find(item => item.id === pendingRequestId);

  return (
    <>
      <BookOneBoard live={{
        jobs: snapshot.jobs,
        accountControl,
        logout: account ? { run: () => { void handle(signOut, true); }, pending: busy } : undefined,
        banner: notice,
        paymentsEnabled: snapshot.paymentsEnabled,
        prepare,
        resume,
        onResumed: () => setResume(null),
        mutate,
        pay,
      }} />
      {panel && <PilotDialog key={panel} panel={panel} profile={profile} request={selected} connectedAddress={address}
        accountWallet={account?.wallet} verified={Boolean(account?.verified)} busy={busy} error={error}
        onClose={close} onConnect={() => { void chooseWallet(); }} onSignIn={() => { void handle(signIn); }}
        onSave={value => { void handle(() => saveProfile(value)); }}
        onVerify={() => { void handle(startVerification); }} onCheck={() => { void handle(checkVerification); }}
        onEdit={() => setPanel("profile")} onSignOut={() => { void handle(signOut); }}
      />}
    </>
  );
}
