"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Star, MapPin, Bell } from "lucide-react";
import { PwaControls } from "@/components/pwa-controls";
import { ProfileBalance } from "./profile-balance";
import { WalletAddress } from "./wallet-address";
import { categories, type Job, type Page } from "./model";
import { EarningsPage } from "./earnings-page";
import type {
  ActivityNotification,
  PublicProvider,
  Reputation,
} from "./experience-types";
export function ReputationLine({ stats }: { stats?: Reputation }) {
  return (
    <div className="reputation-line">
      {stats?.reviewCount ? (
        <span>
          <Star size={13} />
          {Number(stats.rating).toFixed(1)} / {stats.reviewCount} reviews
        </span>
      ) : (
        <span>No reviews yet</span>
      )}
      <span>{stats?.completed ?? 0} completed</span>
      <small>Testnet activity</small>
    </div>
  );
}
export function ExperiencePage({
  page,
  id,
  wallet,
  notifications,
  onEdit,
  onRead,
  onPost,
  jobs,
}: {
  page: Page;
  id?: string;
  wallet?: string;
  notifications: ActivityNotification[];
  onEdit: () => void;
  onRead: (id?: string) => void;
  onPost: () => void;
  jobs: Job[];
}) {
  const [providers, setProviders] = useState<PublicProvider[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  useEffect(() => {
    let active = true;
    if (["Find providers", "Provider profile", "My profile"].includes(page)) {
      const target =
        page === "My profile"
          ? "me"
          : "providers" + (id ? "&id=" + encodeURIComponent(id) : "");
      void fetch("/api/experience?view=" + target, { cache: "no-store" })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          if (active) {
            setProviders(data);
            setLoading(false);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setLoading(false);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [page, id]);
  if (page === "Notifications")
    return (
      <div className="experience-page">
        <div className="experience-heading">
          <div>
            <p className="discovery-eyebrow">Your activity</p>
            <h1>Notifications</h1>
          </div>
          <button className="text-button" onClick={() => onRead()}>
            Mark all read
          </button>
        </div>
        <PwaControls signedIn={Boolean(wallet)} />
        {!notifications.length && (
          <div className="experience-empty">
            <Bell />
            <h2>You&apos;re all caught up</h2>
            <p>Applications, messages and payment updates will appear here.</p>
          </div>
        )}
        <div className="notification-list">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.path ?? "/me/notifications"}
              data-unread={!n.read_at}
              onClick={() => onRead(n.id)}
            >
              <span className="notification-dot" />
              <div>
                <strong>{n.title}</strong>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  if (page === "Earnings") return <EarningsPage jobs={jobs} />;
  const profile = providers[0];
  const list = providers.filter(
    (p) =>
      (!category || p.skills.includes(category)) &&
      [p.name, p.bio, ...p.skills, p.area]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="experience-page">
      <div className="experience-heading">
        <div>
          <p className="discovery-eyebrow">UNN / Nsukka</p>
          <h1>
            {page === "Find providers"
              ? "Find local help"
              : page === "My profile"
                ? "My profile"
                : "Provider profile"}
          </h1>
        </div>
        {page === "My profile" && (
          <button className="button button-secondary" onClick={onEdit}>
            Edit profile
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Getting profiles...</p>}
      {page === "Find providers" ? (
        <>
          <div className="provider-search">
            <input
              aria-label="Search providers"
              placeholder="Search skills or names"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter provider service"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All services</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="provider-grid">
            {list.map((p) => (
              <Link
                className="provider-card"
                href={"/providers/" + p.id}
                key={p.id}
              >
                <span className="avatar">
                  {p.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <h2>{p.name}</h2>
                <p>
                  <MapPin size={13} />
                  {p.area}
                </p>
                <p>{p.skills.join(" / ")}</p>
                <ReputationLine stats={p.stats} />
                <span className="text-button">View profile</span>
              </Link>
            ))}
          </div>
          {!loading && !list.length && <p>No matching providers yet.</p>}
        </>
      ) : profile ? (
        <>
          <section className="provider-profile">
            <div>
              <span className="avatar">{profile.name[0]}</span>
              <h2>{profile.name}</h2>
              <p>{profile.area} / University of Nigeria, Nsukka</p>
            </div>
            <p>{profile.bio || "This person has not added a bio yet."}</p>
            <div className="account-service-tags">
              {profile.skills.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <p>
              Coverage: {profile.coverage.join(", ") || "Not offering services"}
            </p>
            <ReputationLine stats={profile.stats} />
            <div className="profile-metrics">
              <span>
                <strong>{profile.stats.clients}</strong>Different clients
              </span>
              <span>
                <strong>{profile.stats.repeatClients}</strong>Repeat clients
              </span>
            </div>
            <p className="privacy-note">
              Wallet ownership proven. Campus affiliation and professional
              skills have not been independently verified. All displayed
              activity is from Testnet.
            </p>
            {page === "Provider profile" && (
              <button className="button button-primary" onClick={onPost}>
                Post a task
              </button>
            )}
          </section>
          <section className="profile-reviews">
            <h2>Booking reviews</h2>
            {!profile.reviews.length && (
              <p>
                No published reviews yet. Feedback appears after both people
                review or the 14-day window closes.
              </p>
            )}
            {profile.reviews.map((r) => (
              <article key={r.id}>
                <strong>{"★".repeat(r.stars)} / Testnet booking</strong>
                <p>{r.comment || "No written comment."}</p>
                <small>{new Date(r.createdAt).toLocaleDateString()}</small>
              </article>
            ))}
          </section>
          {page === "My profile" && wallet && (
            <>
              <WalletAddress address={wallet} />
              <ProfileBalance wallet={wallet} />
              <PwaControls signedIn />
            </>
          )}
        </>
      ) : (
        !loading && (
          <p>
            Profile unavailable.{" "}
            {page === "My profile" && (
              <button className="text-button" onClick={onEdit}>
                Complete your profile
              </button>
            )}
          </p>
        )
      )}
    </div>
  );
}
