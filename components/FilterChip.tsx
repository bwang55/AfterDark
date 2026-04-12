"use client";

import clsx from "clsx";

import { TIME_THEME_META } from "@/shared/time-theme";
import type { PlaceTag, TimeTheme } from "@/shared/types";

interface FilterChipProps {
  tag: PlaceTag;
  theme: TimeTheme;
  active: boolean;
  onToggle: (tag: PlaceTag) => void;
}

export function FilterChip({
  tag,
  theme,
  active,
  onToggle,
}: FilterChipProps) {
  const meta = TIME_THEME_META[theme];
  const lightTheme = theme === "morning" || theme === "afternoon";

  return (
    <button
      type="button"
      onClick={() => onToggle(tag)}
      className={clsx(
        "rounded-full px-3 py-1.5 text-xs font-medium tracking-wide transition duration-300",
        active
          ? "shadow-[0_0_20px_rgba(255,255,255,0.24)]"
          : "hover:-translate-y-0.5",
      )}
      style={{
        backgroundColor: active ? "rgba(255,255,255,0.2)" : "rgba(12,16,30,0.28)",
        ...(lightTheme && !active ? { backgroundColor: "rgba(255,255,255,0.35)" } : {}),
        color: active ? meta.textPrimary : meta.textSecondary,
      }}
    >
      {tag}
    </button>
  );
}
