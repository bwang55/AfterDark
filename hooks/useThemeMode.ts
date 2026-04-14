"use client";

import { useAppStore } from "@/store/useAppStore";
import { resolveThemeByHour } from "@/shared/time-theme";

/**
 * Returns whether UI should use light or dark styling based on current time.
 * morning + afternoon → light (map is bright)
 * dusk + night → dark (map is dark)
 */
export function useThemeMode() {
  const timeValue = useAppStore((s) => s.timeValue);
  const hour = ((timeValue % 24) + 24) % 24;
  const theme = resolveThemeByHour(hour);
  return theme === "morning" || theme === "afternoon";
}
