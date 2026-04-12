"use client";

import { memo } from "react";
import { interpolateThemeVisual } from "@/shared/time-theme";

interface ThemeTransitionLayerProps {
  timeValue: number;
}

function lerp(start: number, end: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return start + (end - start) * t;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;

  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(start: string, end: string, progress: number): string {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  const t = clamp(progress, 0, 1);

  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
      data-theme-overlay
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        background: visual.gradient,
        opacity: overlayOpacity,
        mixBlendMode: "hard-light",
        transition: "background 1.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        contain: "strict",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_42%)]" />
      <div
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
  // Only re-render when timeValue changes by >= 1.0 hours
  return Math.abs(prev.timeValue - next.timeValue) < 1.0;
});
