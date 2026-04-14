"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Returns whether UI should use light or dark styling based on current time.
 * 5–15h → light (map is bright)
 * 15–5h → dark (map dims earlier than theme system's dusk at 18h)
 *
 * Defaults to dark on server/first render to avoid React hydration mismatch
 * (Zustand persist loads a different timeValue from localStorage on the client).
 */
export function useThemeMode() {
  const timeValue = useAppStore((s) => s.timeValue);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const hour = ((timeValue % 24) + 24) % 24;
    setIsLight(hour >= 5 && hour < 15);
  }, [timeValue]);

  return isLight;
}
