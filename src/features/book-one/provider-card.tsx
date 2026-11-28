import Link from "next/link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MapPin } from "lucide-react";
import type { PublicProvider } from "./types/experience";
import type { NearbyProvider } from "./types/nearby";
import { ReputationLine } from "./reputation-line";

export function ProviderCard({
  provider: p,
  nearby,
}: {
  provider: PublicProvider;
  nearby?: NearbyProvider;
}) {
  return (
    <Link className="provider-card" href={"/providers/" + p.id}>
      <UserAvatar />
      <h2>{p.name}</h2>
      <p>
        <MapPin size={13} aria-hidden="true" />
        {p.area}
      </p>
      {nearby && (
        <div className="provider-distance">
          <strong>
            {nearby.distanceKm <= 1
              ? "Within about 1 km"
              : `About ${nearby.distanceKm} km away`}
          </strong>
          <small>
            Location updated{" "}
            {new Date(nearby.locationUpdatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>
      )}
      <p>{p.skills.join(" / ")}</p>
      <ReputationLine stats={p.stats} />
      <span className="text-button">View profile</span>
    </Link>
  );
}
