"use client";
import { useState } from "react";
import { LocateFixed, RefreshCw, X } from "lucide-react";
import { categories } from "./model";
import { ProviderCard } from "./provider-card";
import { useNearbyProviders } from "./hooks/use-nearby-providers";
import type { PublicProvider } from "./types/experience";
import type { NearbyProvider } from "./types/nearby";
import "./nearby.css";

export function ProviderDiscovery({
  providers,
  wallet,
  loading,
}: {
  providers: PublicProvider[];
  wallet?: string;
  loading: boolean;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [area, setArea] = useState(""),
    [radius, setRadius] = useState(5);
  const nearby = useNearbyProviders(category, radius);
  const source = nearby.active ? nearby.providers : providers;
  const list = source.filter(
    (p) =>
      (!category || p.skills.includes(category)) &&
      (!area || p.area === area || p.coverage.includes(area)) &&
      [p.name, p.bio, ...p.skills, p.area]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const working = nearby.loading || nearby.locating;
  return (
    <section className="provider-discovery" aria-label="Find providers">
      <div className="nearby-discovery-controls">
        <button
          type="button"
          className="button button-secondary"
          disabled={!wallet || working}
          aria-pressed={nearby.active}
          onClick={() => {
            setArea("");
            void nearby.locate();
          }}
        >
          <LocateFixed size={16} aria-hidden="true" />
          {nearby.locating
            ? "Getting location…"
            : nearby.active
              ? "Update my location"
              : "Find nearby help"}
        </button>
        {nearby.active && (
          <button type="button" className="text-button" onClick={nearby.clear}>
            <X size={15} aria-hidden="true" />
            Show all providers
          </button>
        )}
        {!wallet && <small>Sign in to use nearby search.</small>}
      </div>
      {nearby.active && (
        <p className="nearby-explanation">
          Sorted by approximate distance from your shared location. Distance is
          not travel time.
        </p>
      )}
      {nearby.error && (
        <p className="form-error" role="alert">
          {nearby.error}
        </p>
      )}
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
        {nearby.active ? (
          <select
            aria-label="Nearby search distance"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          >
            {[1, 3, 5, 10, 20].map((r) => (
              <option key={r} value={r}>
                Within about {r} km
              </option>
            ))}
          </select>
        ) : (
          <select
            aria-label="Filter provider area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">All areas</option>
            {["On campus", "Around Nsukka", "Online"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        )}
      </div>
      {nearby.active && nearby.loading && (
        <p className="nearby-explanation" role="status">
          <RefreshCw size={14} aria-hidden="true" />
          Updating nearby providers…
        </p>
      )}
      <div className="provider-grid">
        {list.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            nearby={nearby.active ? (p as NearbyProvider) : undefined}
          />
        ))}
      </div>
      {!loading && !working && !list.length && (
        <div className="nearby-empty">
          <LocateFixed size={23} aria-hidden="true" />
          <h2>
            {nearby.active
              ? "No nearby matches right now"
              : "No matching providers yet"}
          </h2>
          <p>
            {nearby.active
              ? "Try a wider distance or show all providers. Only people who recently enabled nearby visibility appear here."
              : "Try another service, area or search term."}
          </p>
        </div>
      )}
    </section>
  );
}
