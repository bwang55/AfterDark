"use client";

import { memo } from "react";
import { interpolateThemeVisual } from "@/shared/time-theme";
import { clamp, lerp, mixHex } from "@/shared/utils";

interface ThemeTransitionLayerProps {
  timeValue: number;
}

function overlayOpacityForTime(timeValue: number): number {
  const clamped = Math.min(30, Math.max(6, timeValue));

  // Stronger warm overlay in the morning for cozy lazy feel
  if (clamped <= 10) {
    return lerp(0.30, 0.34, (clamped - 6) / 4);
  }
  if (clamped <= 14) {
    return lerp(0.34, 0.26, (clamped - 10) / 4);
  }
  if (clamped <= 18) {
    return lerp(0.26, 0.4, (clamped - 14) / 4);
  }
  if (clamped <= 22) {
    return lerp(0.4, 0.5, (clamped - 18) / 4);
  }
  return lerp(0.5, 0.53, (clamped - 22) / 8);
}

function nightShadeOpacity(timeValue: number): number {
  const clamped = Math.min(30, Math.max(6, timeValue));
  if (clamped <= 18) {
    return lerp(0.08, 0.14, (clamped - 6) / 12);
  }
  if (clamped <= 22) {
    return lerp(0.14, 0.34, (clamped - 18) / 4);
  }
  return lerp(0.34, 0.46, (clamped - 22) / 8);
}

function glowForTime(timeValue: number): string {
  const clamped = clamp(timeValue, 6, 30);

  if (clamped <= 14) {
    return mixHex("#F5B971", "#FF8A4C", (clamped - 6) / 8);
  }
  if (clamped <= 18) {
    return mixHex("#FF8A4C", "#F472B6", (clamped - 14) / 4);
  }
  return mixHex("#F472B6", "#22D3EE", (clamped - 18) / 12);
}

function ThemeTransitionLayerInner({
  timeValue,
}: ThemeTransitionLayerProps) {
  const visual = interpolateThemeVisual(timeValue);
  const overlayOpacity = overlayOpacityForTime(timeValue);
  const shadeOpacity = nightShadeOpacity(timeValue);
  const glow = glowForTime(timeValue);

  return (
    <div
      aria-hidden
      suppressHydrationWarning
      data-theme-overlay
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        background: visual.gradient,
        opacity: overlayOpacity,
        // Removed mix-blend-mode to greatly improve map drag/zoom performance (WebGL composition)
        transition: "background 1.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        contain: "strict",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_42%)]" />
      <div
        suppressHydrationWarning
        data-theme-overlay
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 85% 80%, " +
            glow +
            "3a 0%, rgba(56,189,248,0) 46%)",
          transition: "background 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <div
        suppressHydrationWarning
        data-theme-overlay
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(3,6,18,${(shadeOpacity * 0.22).toFixed(3)}) 0%, rgba(3,6,18,${shadeOpacity.toFixed(3)}) 100%)`,
          transition: "background 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}

export const ThemeTransitionLayer = memo(ThemeTransitionLayerInner, (prev, next) => {
  // ~9 minutes. Tight enough that the overlay tracks the clock visibly,
  // loose enough to skip the per-second re-renders the live ticker emits.
  // Previously 1.0hr, which left the overlay up to an hour behind the HUD.
  return Math.abs(prev.timeValue - next.timeValue) < 0.15;
});
