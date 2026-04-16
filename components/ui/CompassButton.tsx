"use client";

import { Compass } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";
import { HoverLabel } from "@/components/ui/HoverLabel";

export function CompassButton() {
  const resetNorth = useAppStore((s) => s.resetNorth);
  const isLight = useThemeMode();

  return (
    <button
      type="button"
      onClick={resetNorth}
      aria-label="Reset North"
      className={`group relative pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        isLight
          ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
          : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
      }`}
    >
      <Compass className="h-4 w-4" />
      <HoverLabel side="left">Reset North</HoverLabel>
    </button>
  );
}
