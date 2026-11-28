"use client";

import { useEffect, useRef, useState } from "react";

// A deliberate edge hover toggles the desktop sidebar without a visible control.
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreHoverUntil = useRef(0);

  function cancelHover() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    },
    [],
  );

  function hoverEdge(pointerType: string) {
    cancelHover();
    if (
      Date.now() < ignoreHoverUntil.current ||
      pointerType !== "mouse" ||
      !window.matchMedia("(min-width: 761px) and (hover: hover)").matches
    )
      return;
    hoverTimer.current = setTimeout(() => {
      ignoreHoverUntil.current = Date.now() + 500;
      setCollapsed((value) => !value);
      hoverTimer.current = null;
    }, 600);
  }

  function toggle() {
    cancelHover();
    ignoreHoverUntil.current = Date.now() + 500;
    setCollapsed((value) => !value);
  }

  return { collapsed, hoverEdge, cancelHover, toggle };
}
