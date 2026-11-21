import { Check, ChevronDown, GraduationCap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CampusSelector() {
  const details = useRef<HTMLDetailsElement>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) {
        details.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function choose(comingSoon: boolean) {
    setNotice(comingSoon ? "More campuses are coming soon. You’re browsing UNN, Nsukka." : "");
    if (details.current) {
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    }
  }

  return (
    <div className="campus-control">
      <details className="campus-selector" ref={details} onKeyDown={event => {
        if (event.key === "Escape" && details.current) {
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Choose campus: UNN, Nsukka">
          <GraduationCap size={17} aria-hidden="true" />
          <span>UNN · Nsukka</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="campus-options" role="group" aria-label="Campuses">
          <p>Your campus</p>
          <button type="button" onClick={() => choose(false)}>
            <span>University of Nigeria, Nsukka<small>Active</small></span>
            <Check size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => choose(true)}>
            <span>Other campuses<small>Coming soon</small></span>
          </button>
        </div>
      </details>
      <span className="campus-notice" role="status">{notice}</span>
    </div>
  );
}
