"use client";

import { memo } from "react";
import { clamp } from "@/shared/utils";

interface AtmosphereLayerProps {
  timeValue: number;
}

function leakColorsForTime(timeValue: number): { a: string; b: string } {
  const t = clamp(timeValue, 6, 30);
  if (t <= 10) return { a: "255,210,150", b: "255,180,120" };
  if (t <= 14) return { a: "255,230,185", b: "255,200,155" };
  if (t <= 18) return { a: "255,170,180", b: "210,145,230" };
  if (t <= 21) return { a: "190,170,255", b: "130,160,255" };
  return { a: "140,170,255", b: "100,140,255" };
}

function leakIntensityForTime(timeValue: number): number {
  const t = clamp(timeValue, 6, 30);
  if (t <= 10) return 0.2;
  if (t <= 14) return 0.12;
  if (t <= 18) return 0.24;
  if (t <= 21) return 0.28;
  return 0.16;
}

function AtmosphereLayerInner({ timeValue }: AtmosphereLayerProps) {
  const leak = leakColorsForTime(timeValue);
  const leakIntensity = leakIntensityForTime(timeValue);

  return (
    <div
      aria-hidden
      suppressHydrationWarning
      data-atmosphere
      className="pointer-events-none absolute inset-0 z-[11]"
      style={{ contain: "strict" }}
    >
      {/* Edge light leaks (painted, not blended, so map compositing stays cheap).
         Two opposing washes give the frame a subtle warm/cool bias. */}
      <div
        className="absolute inset-0"
        data-theme-overlay
        style={{
          background: `radial-gradient(ellipse 55% 40% at 88% -5%, rgba(${leak.a},${leakIntensity.toFixed(3)}) 0%, rgba(${leak.a},0) 65%), radial-gradient(ellipse 50% 40% at 8% 105%, rgba(${leak.b},${(leakIntensity * 0.7).toFixed(3)}) 0%, rgba(${leak.b},0) 65%)`,
          transition: "background 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Vignette — pure gradient, ~zero cost. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 92%, rgba(0,0,0,0.42) 100%)",
        }}
      />

      {/* Static film grain — single static PNG-like SVG, no animation.
         Hidden during map interaction via CSS for smooth drag/zoom. */}
      <div
        className="cinematic-grain absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>")`,
          opacity: 0.05,
        }}
      />
    </div>
  );
}

export const AtmosphereLayer = memo(AtmosphereLayerInner, (prev, next) => {
  // Only re-render when time crosses a meaningful threshold.
  return Math.abs(prev.timeValue - next.timeValue) < 1.0;
});
