import { Star } from "lucide-react";
import type { Reputation } from "./types/experience";

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
