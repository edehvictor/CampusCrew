"use client";

import Link from "next/link";
import { disablePhonePush } from "@/components/pwa-controls";
import { Bell, CircleUserRound, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { BookOneBoard } from "./board";
import { createSnapshotLoader } from "./snapshot-loader";
import { getStellarWallet } from "./pilot-wallet";
import { signPreparedWalletTransaction } from "./wallet-signing";
import { PilotDialog, type PilotPanel } from "./pilot-dialog";
import { PilotError } from "./pilot-error";
import type {
  EntryIntent,
  PaymentOperation,
  PilotMutation,
  PilotProfile,
  PilotSnapshot,
} from "./pilot-types";
import "./pilot.css";

const blank: PilotSnapshot = {
  jobs: [],
  account: null,
  paymentsEnabled: false,
};

function message(error: unknown) {
  if (error instanceof PilotError) return error.message;
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  if (/reject|denied|declined|cancel/i.test(detail))
    return "The wallet request was cancelled. You can try again.";
  if (/network|passphrase/i.test(detail))
    return "Switch your wallet to Stellar Testnet and try again.";
  if (/support.*signMessage|signMessage.*support/i.test(detail))
    return "Choose Freighter / Varial or xBull to sign in with a Stellar message.";
  return "That action could not be completed. Check your wallet or connection and try again.";
}

async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new PilotError(
      result?.error ?? "CampusCrew could not load. Try again shortly.",
      response.status,
    );
  return result as T;
}

export function PilotBoard() {
  const [snapshot, setSnapshot] = useState(blank);
  const [sessionState, setSessionState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [connectedWallet, setConnectedWallet] = useState<string>();
  const [banner, setBanner] = useState("");
  const [panel, setPanel] = useState<PilotPanel | null>(null);
  const [resume, setResume] = useState<EntryIntent | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const pending = useRef<EntryIntent | null>(null);
  const working = useRef(false);
  const account = snapshot.account;
  const profile = account?.profile ?? null;
  const accountWallet = account?.wallet;

  const [load] = useState(() =>
    createSnapshotLoader(
      () => api<PilotSnapshot>("/api/book-one"),
      (data) => {
        setSnapshot(data);
        setSessionState("ready");
      },
    ),
  );

  useEffect(() => {
    let active = true;
    void load().catch((cause) => {
      if (active) {
        setBanner(message(cause));
        setSessionState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    let stream: EventSource | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    if (accountWallet) {
      stream = new EventSource("/api/updates");
      stream.addEventListener("snapshot", (event) => {
        if (active) {
          setSnapshot(
            JSON.parse((event as MessageEvent).data) as PilotSnapshot,
          );
          setConnected(true);
        }
      });
      stream.addEventListener("delayed", () => {
        if (active) setConnected(false);
      });
      stream.onerror = () => {
        if (active) setConnected(false);
      };
    }
    const check = async () => {
      if (!active) return;
      if (
        document.visibilityState === "visible" &&
        (!stream || stream.readyState !== EventSource.OPEN)
      ) {
        try {
          await load();
        } catch {
          /* The connection banner and next retry handle transient failures. */
        }
      }
      if (active)
        fallback = setTimeout(() => {
          void check();
        }, 7000);
    };
    const wake = () => {
      if (active && document.visibilityState === "visible")
        void load().catch(() => {});
    };
    fallback = setTimeout(() => {
      void check();
    }, 3000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      stream?.close();
      clearTimeout(fallback);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [accountWallet, load]);

  function finishSetup(data: PilotSnapshot) {
    const intent = pending.current;
    const details = data.account?.profile;
    const task =
      intent?.kind === "quote"
        ? data.jobs.find((job) => job.id === intent.requestId)
        : undefined;
    if (!data.account) {
      setPanel("wallet");
      return;
    }
    if (
      !details ||
      (task &&
        (!details.skills.includes(task.category) ||
          !details.coverage.some((area) => area === task.area)))
    ) {
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
    if (sessionState !== "ready") {
      setBanner("Your account is loading. Please try again shortly.");
      return false;
    }
    const task =
      intent.kind === "quote"
        ? snapshot.jobs.find((job) => job.id === intent.requestId)
        : undefined;
    if (
      account &&
      profile &&
      (!task ||
        (profile.skills.includes(task.category) &&
          profile.coverage.some((area) => area === task.area)))
    )
      return true;
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
      setPanel(
        account?.wallet === address
          ? profile
            ? "account"
            : "profile"
          : "wallet",
      );
    } catch (cause) {
      setPanel("wallet");
      throw cause;
    }
  }

  async function signIn() {
    const kit = getStellarWallet();
    const { address } = await kit.fetchAddress();
    setConnectedWallet(address);
    const challenge = await api<{
      id: string;
      message: string;
      wallet: string;
    }>("/api/stellar/auth", "POST", {
      action: "challenge",
      wallet: address,
    });
    const signed = await kit.signMessage(challenge.message, {
      address,
      networkPassphrase: Networks.TESTNET,
    });
    if (signed.signerAddress && signed.signerAddress !== address) {
      throw new PilotError(
        "The wallet account changed. Choose the wallet you want and sign in again.",
      );
    }
    await api("/api/stellar/auth", "POST", {
      action: "signin",
      id: challenge.id,
      wallet: address,
      signature: signed.signedMessage,
    });
    setBanner("");
    finishSetup(await load(true));
  }

  async function mutate(mutation: PilotMutation) {
    const result = await api<{ requestId?: string }>(
      "/api/book-one",
      "POST",
      mutation,
    );
    await load(true);
    return result;
  }

  async function saveProfile(next: PilotProfile) {
    await api("/api/book-one", "POST", { action: "profile", profile: next });
    finishSetup(await load(true));
  }

  async function signOut() {
    await disablePhonePush().catch(() => {});
    await api("/api/stellar/auth", "DELETE");
    setSnapshot(blank);
    setConnectedWallet(undefined);
    pending.current = null;
    setPendingRequestId(undefined);
    setResume(null);
    setPanel(null);
    setBanner("");
    await getStellarWallet().disconnect();
    await load(true);
  }

  async function pay(
    requestId: string,
    operation: PaymentOperation,
    note?: string,
  ): Promise<string> {
    if (!account)
      throw new PilotError("Sign in before using booking payments.", 401);
    if (operation === "sync") {
      const result = await api<{ message: string }>(
        "/api/stellar/booking",
        "POST",
        { action: "sync", requestId },
      );
      await load(true);
      return result.message;
    }
    const kit = getStellarWallet();
    const { address } = await kit.getAddress();
    if (address !== account.wallet)
      throw new PilotError(
        "Your wallet account changed. Reconnect the wallet you signed in with.",
        409,
      );
    const prepared = await api<{
      intentId: string;
      xdr: string;
      wallet: string;
      networkPassphrase: string;
    }>("/api/stellar/booking", "POST", {
      action: "prepare",
      requestId,
      operation,
      note,
    });
    if (
      prepared.wallet !== address ||
      prepared.networkPassphrase !== Networks.TESTNET
    )
      throw new PilotError(
        "The prepared wallet or network did not match.",
        409,
      );
    const signed = await signPreparedWalletTransaction(kit, prepared, address);
    const result = await api<{ message: string }>(
      "/api/stellar/booking",
      "POST",
      {
        action: "submit",
        intentId: prepared.intentId,
        xdr: signed.signedTxXdr,
      },
    );
    await load(true);
    return result.message;
  }

  function close() {
    if (working.current) return;
    pending.current = null;
    setPendingRequestId(undefined);
    setPanel(null);
    setError("");
  }

  const name = profile?.displayName ?? "Complete profile";
  const initials = profile?.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const accountControl =
    sessionState !== "ready" ? (
      <button
        type="button"
        className="button button-secondary pilot-connect"
        disabled={sessionState === "loading"}
        aria-busy={sessionState === "loading"}
        onClick={() => {
          setSessionState("loading");
          void load()
            .then(() => setBanner(""))
            .catch((cause) => {
              setSessionState("error");
              setBanner(message(cause));
            });
        }}
      >
        <CircleUserRound size={17} aria-hidden="true" />
        <span>
          {sessionState === "loading" ? "Connect wallet" : "Retry connection"}
        </span>
      </button>
    ) : account ? (
      <button
        type="button"
        className="pilot-profile-button pilot-account"
        onClick={() => {
          setError("");
          setPanel(profile ? "account" : "profile");
        }}
      >
        <span className="avatar" aria-hidden="true">
          {initials || <CircleUserRound size={20} />}
        </span>
        <span>{name}</span>
      </button>
    ) : (
      <button
        type="button"
        className="button button-secondary pilot-connect"
        onClick={() => {
          setError("");
          setPanel("wallet");
        }}
      >
        <Wallet size={17} aria-hidden="true" /> <span>Connect wallet</span>
      </button>
    );
  const unread =
    snapshot.notifications?.filter((item) => !item.read_at).length ?? 0;
  const accountAndNotifications = (
    <>
      {account && (
        <Link
          className="notification-bell button button-icon"
          href="/me/notifications"
          aria-label={
            unread ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell size={18} />
          {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
        </Link>
      )}
      {accountControl}
    </>
  );
  const notice = (
    <div className="pilot-bar">
      <div className="pilot-funds">
        <strong>Stellar Testnet</strong>
        <small>Prices in test USDC</small>
      </div>
      <small className="connection-status">
        {account
          ? connected
            ? "Live booking updates"
            : "Updates reconnect automatically"
          : "Browse campus tasks"}
      </small>
      {snapshot.syncWarning && (
        <p role="status">
          Payment confirmation is delayed; we are checking again automatically.
        </p>
      )}
      {snapshot.experienceReady === false && (
        <p role="status">
          Apply the CampusCrew experience database updates to enable reviews and
          notifications.
        </p>
      )}
      {banner && <p role="status">{banner}</p>}
    </div>
  );
  const selected = snapshot.jobs.find((job) => job.id === pendingRequestId);

  return (
    <>
      <BookOneBoard
        live={{
          jobs: snapshot.jobs,
          sessionReady: sessionState === "ready",
          accountControl: accountAndNotifications,
          wallet: account?.wallet,
          notifications: snapshot.notifications ?? [],
          experienceReady: snapshot.experienceReady ?? false,
          signIn: () => {
            setPanel("wallet");
          },
          editProfile: () => setPanel("profile"),
          logout: account
            ? {
                run: () => {
                  void handle(signOut, true);
                },
                pending: busy,
              }
            : undefined,
          banner: notice,
          paymentsEnabled: snapshot.paymentsEnabled,
          prepare,
          resume,
          onResumed: () => setResume(null),
          mutate,
          pay,
        }}
      />
      {panel && (
        <PilotDialog
          key={panel}
          panel={panel}
          profile={profile}
          request={selected}
          connectedAddress={connectedWallet}
          accountWallet={account?.wallet}
          busy={busy}
          error={error}
          onClose={close}
          onConnect={() => {
            void handle(chooseWallet);
          }}
          onSignIn={() => {
            void handle(signIn);
          }}
          onSave={(value) => {
            void handle(() => saveProfile(value));
          }}
          onEdit={() => setPanel("profile")}
          onSignOut={() => {
            void handle(signOut);
          }}
        />
      )}
    </>
  );
}
