// ── Math utilities ──────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start: number, end: number, progress: number): number {
  const t = clamp(progress, 0, 1);
  return start + (end - start) * t;
}

// ── Color utilities ─────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
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

export function mixHex(start: string, end: string, progress: number): string {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  const t = clamp(progress, 0, 1);
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Time utilities ──────────────────────────────────────────────────────

export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/**
 * Pure open-hours check. Works with overnight spans (e.g. open=22, close=3).
 * Equal open/close is treated as 24h open.
 */
export function isOpenAtHour(
  hour: number,
  openHour: number,
  closeHour: number,
): boolean {
  const h = normalizeHour(hour);
  const open = normalizeHour(openHour);
  const close = normalizeHour(closeHour);

  if (open === close) return true;
  if (open < close) return h >= open && h < close;
  return h >= open || h < close;
}
