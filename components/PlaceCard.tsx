"use client";

import { memo } from "react";
import clsx from "clsx";

import type { RankedPlace } from "@/shared/types";
import { clamp, mixHex, rgbaFromHex } from "@/shared/utils";

interface PlaceCardProps {
  place: RankedPlace;
  timeValue: number;
  active: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function accentForTime(timeValue: number): string {
  const hour = clamp(timeValue, 6, 30);

  if (hour <= 14) {
    return mixHex("#F5B971", "#FF8A4C", (hour - 6) / 8);
  }
  if (hour <= 18) {
    return mixHex("#FF8A4C", "#F472B6", (hour - 14) / 4);
  }
  return mixHex("#F472B6", "#22D3EE", (hour - 18) / 12);
}

function PlaceCardInner({ place, timeValue, active, onHover, onSelect }: PlaceCardProps) {
  // Use the same darkness curve as page.tsx so dark mode kicks in fully at dusk.
  // Simple hour-of-day uiT hits a contrast dead-zone around 7pm where text and
  // background converge to similar mid-greys.
  let darkness = 0;
  if (timeValue <= 7) {
    darkness = clamp(1 - (timeValue - 5) / 2, 0, 1);
  } else if (timeValue >= 16.5) {
    darkness = clamp((timeValue - 16.5) / 2, 0, 1);
  }
  const dark = darkness > 0.4;
  const accent = accentForTime(timeValue);

  const textPrimary = dark ? "#E2E8F0" : "#0F172A";
  const textSecondary = dark ? "#94A3B8" : "#475569";
  const inactiveBg = dark ? "rgba(12, 14, 32, 0.88)" : "rgba(255, 255, 255, 0.86)";
  const activeBg = dark ? "rgba(16, 20, 44, 0.94)" : "rgba(255, 255, 255, 0.94)";
  const border = dark ? "rgba(255, 255, 255, 0.10)" : "rgba(51, 65, 85, 0.14)";

  return (
    <article
      onMouseEnter={() => onHover(place.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(place.id)}
      onBlur={() => onHover(null)}
      className={clsx(
        "rounded-xl border p-3 transition-[transform,background-color,border-color,box-shadow,color] duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)]",
        active ? "scale-[1.01]" : "hover:translate-y-[-1px]",
      )}
      style={{
        borderColor: active ? accent : border,
        backgroundColor:
          active ? activeBg : inactiveBg,
        boxShadow: active
          ? "0 0 20px " + accent + "44"
          : "0 8px 24px rgba(3,7,18,0.22)",
      }}
    >
      <button type="button" onClick={() => onSelect(place.id)} className="w-full text-left">
        <p className="text-[15px] font-semibold leading-tight" style={{ color: textPrimary }}>
          {place.name}
        </p>
        <p className="mt-1 truncate text-xs" style={{ color: textSecondary }}>
          {place.vibe}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="truncate text-[10px] uppercase tracking-[0.14em]" style={{ color: textSecondary }}>
            {place.neighborhood}
          </p>
          <p
            className={clsx("shrink-0 text-[11px] font-medium", place.openNow ? "text-cyan-400" : "")}
            style={!place.openNow ? { color: textSecondary } : undefined}
          >
            {place.openNow ? "Open" : "Closed"}
          </p>
        </div>
      </button>
    </article>
  );
}

export const PlaceCard = memo(PlaceCardInner, (prev, next) => {
  // Quantize timeValue to whole hours — visual difference is negligible
  // but prevents 18 card re-renders on every slider tick
  return (
    prev.place.id === next.place.id &&
    prev.active === next.active &&
    Math.floor(prev.timeValue) === Math.floor(next.timeValue) &&
    prev.onHover === next.onHover &&
    prev.onSelect === next.onSelect
  );
});
