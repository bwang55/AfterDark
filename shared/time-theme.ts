import type { TimeTheme } from "./types";
import { clamp, mixRgb } from "./utils";

export interface TimeThemeMeta {
  id: TimeTheme;
  name: string;
  subtitle: string;
  gradient: string;
  cardTint: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  glow: string;
  mapPoint: string;
  mapGlow: string;
  lightPreset: "dawn" | "day" | "dusk" | "night";
}

export const TIME_THEME_META: Record<TimeTheme, TimeThemeMeta> = {
  morning: {
    id: "morning",
    name: "Morning",
    subtitle: "Quiet corners for a slow start",
    gradient:
      "linear-gradient(135deg, rgba(212,165,116,0.92) 0%, rgba(240,216,168,0.9) 100%)",
    cardTint: "rgba(255,248,240,0.6)",
    cardBorder: "rgba(255,235,210,0.4)",
    textPrimary: "#0F172A",
    textSecondary: "#6B5540",
    glow: "#E8A040",
    mapPoint: "#E8A040",
    mapGlow: "#F5D090",
    lightPreset: "dawn",
  },
  afternoon: {
    id: "afternoon",
    name: "Afternoon",
    subtitle: "Warm spaces for long afternoons",
    gradient:
      "linear-gradient(135deg, rgba(232,180,104,0.90) 0%, rgba(232,144,96,0.88) 50%, rgba(216,112,78,0.86) 100%)",
    cardTint: "rgba(255,245,235,0.55)",
    cardBorder: "rgba(255,210,180,0.45)",
    textPrimary: "#1F2937",
    textSecondary: "#6B4F3A",
    glow: "#E86030",
    mapPoint: "#E86030",
    mapGlow: "#FF9570",
    lightPreset: "day",
  },
  dusk: {
    id: "dusk",
    name: "Dusk",
    subtitle: "The city starts to glow",
    gradient:
      "linear-gradient(135deg, rgba(139,124,246,0.9) 0%, rgba(192,132,252,0.86) 50%, rgba(244,114,182,0.82) 100%)",
    cardTint: "rgba(38,29,70,0.42)",
    cardBorder: "rgba(224,195,255,0.22)",
    textPrimary: "#F8FAFC",
    textSecondary: "#E2E8F0",
    glow: "#F472B6",
    mapPoint: "#FBCFE8",
    mapGlow: "#C084FC",
    lightPreset: "dusk",
  },
  night: {
    id: "night",
    name: "Night",
    subtitle: "Still open after dark",
    gradient:
      "linear-gradient(135deg, rgba(11,16,32,0.94) 0%, rgba(23,37,84,0.92) 48%, rgba(49,46,129,0.9) 100%)",
    cardTint: "rgba(12,18,36,0.55)",
    cardBorder: "rgba(103,130,255,0.24)",
    textPrimary: "#E2E8F0",
    textSecondary: "#94A3B8",
    glow: "#22D3EE",
    mapPoint: "#22D3EE",
    mapGlow: "#8B5CF6",
    lightPreset: "night",
  },
};

export function to24HourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const value = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${value}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export function resolveThemeByHour(rawHour: number): TimeTheme {
  const hour = ((rawHour % 24) + 24) % 24;

  if (hour >= 5 && hour < 11) {
    return "morning";
  }

  if (hour >= 11 && hour < 18) {
    return "afternoon";
  }

  if (hour >= 18 && hour < 21) {
    return "dusk";
  }

  return "night";
}

export const TIME_RANGE_START = 6;
export const TIME_RANGE_END = 30;
export const TIME_MARKERS = [6, 10, 14, 18, 22, 26, 30];

interface ThemeKeyframe {
  hour: number;
  colors: [string, string, string];
}

const THEME_KEYFRAMES: ThemeKeyframe[] = [
  {
    hour: 6,
    colors: ["#D4A574", "#E8C9A0", "#F5D5A0"],
  },
  {
    hour: 10,
    colors: ["#C9B896", "#E2D4B8", "#F0D8A8"],
  },
  {
    hour: 12,
    colors: ["#C8D5E8", "#DDE5F0", "#F0DDB8"],
  },
  {
    hour: 14,
    colors: ["#E8B468", "#E89060", "#D8704E"],
  },
  {
    hour: 18,
    colors: ["#8B7CF6", "#C084FC", "#F472B6"],
  },
  {
    hour: 22,
    colors: ["#0B1020", "#172554", "#312E81"],
  },
  {
    hour: 30,
    colors: ["#0B1020", "#172554", "#312E81"],
  },
];

export interface InterpolatedThemeVisual {
  gradient: string;
}

export function interpolateThemeVisual(hour: number): InterpolatedThemeVisual {
  const clamped = clamp(hour, TIME_RANGE_START, TIME_RANGE_END);

  let previous = THEME_KEYFRAMES[0];
  let next = THEME_KEYFRAMES[THEME_KEYFRAMES.length - 1];

  for (let index = 1; index < THEME_KEYFRAMES.length; index += 1) {
    if (clamped <= THEME_KEYFRAMES[index].hour) {
      previous = THEME_KEYFRAMES[index - 1];
      next = THEME_KEYFRAMES[index];
      break;
    }
  }

  const span = Math.max(0.0001, next.hour - previous.hour);
  const progress = (clamped - previous.hour) / span;

  const start = mixRgb(previous.colors[0], next.colors[0], progress);
  const middle = mixRgb(previous.colors[1], next.colors[1], progress);
  const end = mixRgb(previous.colors[2], next.colors[2], progress);

  return {
    gradient: `linear-gradient(132deg, ${start} 0%, ${middle} 52%, ${end} 100%)`,
  };
}
