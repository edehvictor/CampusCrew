import type { CSSProperties } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "./category-icon";
import type { Category } from "./model";
import "./hero-flow.css";

const services: { category: Category; x: number; y: number; route: string }[] =
  [
    {
      category: "Errands",
      x: 72,
      y: 80,
      route: "M72 158 V166 Q72 180 86 180 H150 Q164 180 164 194 V218",
    },
    { category: "Cleaning", x: 216, y: 80, route: "M216 158 V218" },
    {
      category: "Tutoring",
      x: 360,
      y: 80,
      route: "M360 158 V166 Q360 180 346 180 H282 Q268 180 268 194 V218",
    },
    {
      category: "Repairs",
      x: 72,
      y: 420,
      route: "M72 390 V334 Q72 320 86 320 H150 Q164 320 164 306 V282",
    },
    { category: "Tech & design", x: 216, y: 420, route: "M216 390 V282" },
    {
      category: "Hair & beauty",
      x: 360,
      y: 420,
      route: "M360 390 V334 Q360 320 346 320 H282 Q268 320 268 306 V282",
    },
  ];

// A conceptual illustration: no account, balance or booking activity is fabricated.
// Six service signals reach the hub in turn; each arrival continues through escrow.
export function HeroFlow() {
  return (
    <figure
      className="crew-flow"
      role="img"
      aria-label="Errands and local services connect through CampusCrew, with escrow protecting payment until completion is approved."
    >
      <svg
        className="crew-flow-lines"
        viewBox="0 0 680 500"
        fill="none"
        aria-hidden="true"
      >
        {services.map(({ category, route }, i) => (
          <g key={category}>
            <path d={route} className="crew-flow-track" />
            <path
              d={route}
              pathLength="100"
              className="crew-flow-signal crew-flow-input crew-flow-signal-glow"
              style={{ "--service-delay": `${i * 3 - 18}s` } as CSSProperties}
            />
            <path
              d={route}
              pathLength="100"
              className="crew-flow-signal crew-flow-input"
              style={{ "--service-delay": `${i * 3 - 18}s` } as CSSProperties}
            />
          </g>
        ))}
        <path
          d="M310 250 H470"
          className="crew-flow-track crew-flow-track-out"
        />
        <path
          d="M310 250 H470"
          pathLength="100"
          className="crew-flow-signal crew-flow-output crew-flow-signal-glow"
        />
        <path
          d="M310 250 H470"
          pathLength="100"
          className="crew-flow-signal crew-flow-output"
        />
      </svg>
      {services.map(({ category, x, y }, i) => (
        <div
          key={category}
          className="crew-flow-node"
          data-featured={category === "Errands"}
          aria-hidden="true"
          style={
            {
              "--node-x": `${x / 6.8}%`,
              "--node-y": `${y / 5}%`,
              "--service-delay": `${i * 3 - 18}s`,
            } as CSSProperties
          }
        >
          <span className="crew-flow-node-icon">
            <CategoryIcon category={category} />
          </span>
          <span className="crew-flow-node-label">{category}</span>
        </div>
      ))}
      <div className="crew-flow-hub" aria-hidden="true">
        <span className="brand-mark" />
        <div>
          <strong>CampusCrew</strong>
          <span>Find your crew</span>
        </div>
      </div>
      <div className="crew-flow-escrow" aria-hidden="true">
        <span className="crew-flow-shield">
          <ShieldCheck size={23} />
        </span>
        <span>USDC escrow</span>
      </div>
      <div className="crew-flow-outcome" aria-hidden="true">
        <span className="crew-flow-check">
          <Check size={19} strokeWidth={2.3} />
        </span>
        <div>
          <strong>Task complete.</strong>
          <span>A task off your list.</span>
        </div>
      </div>
    </figure>
  );
}
