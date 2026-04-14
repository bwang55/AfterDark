"use client";

import { useAppStore } from "@/store/useAppStore";

/**
 * Returns whether UI should use light or dark styling based on current time.
 * 5–15h → light (map is bright)
 * 15–5h → dark (map dims earlier than theme system's dusk at 18h)
 */
export function useThemeMode() {
  const timeValue = useAppStore((s) => s.timeValue);
  const hour = ((timeValue % 24) + 24) % 24;
  return hour >= 5 && hour < 15;
}
