"use client";

import type { ReactNode } from "react";

interface HoverLabelProps {
  children: ReactNode;
  /** Which side of the icon the label pops out from. Default "left". */
  side?: "left" | "right";
}

// Absolute-positioned tooltip pill. Parent must have `group relative`.
// Does NOT push siblings — the label floats outside the button's box.
export function HoverLabel({ children, side = "left" }: HoverLabelProps) {
  const anchor =
    side === "left"
      ? "right-full mr-2 translate-x-1"
      : "left-full ml-2 -translate-x-1";
  const hoverX =
    side === "left"
      ? "group-hover:translate-x-0 group-focus:translate-x-0"
      : "group-hover:translate-x-0 group-focus:translate-x-0";

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${anchor} ${hoverX} whitespace-nowrap rounded-full border border-white/10 bg-slate-950/85 px-2.5 py-1 text-[11px] font-medium text-white/90 opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus:opacity-100 z-50`}
    >
      {children}
    </span>
  );
}
