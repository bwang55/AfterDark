"use client";

import { Film } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";
import { HoverLabel } from "@/components/ui/HoverLabel";

export function CinemaModeButton() {
  const cinemaMode = useAppStore((s) => s.cinemaMode);
  const toggleCinemaMode = useAppStore((s) => s.toggleCinemaMode);
  const isLight = useThemeMode();

  const active = cinemaMode;

  return (
    <button
      type="button"
      onClick={toggleCinemaMode}
      data-cinema-exit
      aria-label={active ? "Exit cinema mode" : "Enter cinema mode"}
      aria-pressed={active}
      className={`group relative pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        active
          ? "border-amber-200/40 bg-amber-500/25 text-amber-50"
          : isLight
            ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
            : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
      }`}
    >
      <Film className="h-4 w-4" />
      <HoverLabel side="left">{active ? "Exit Cinema" : "Cinema Mode"}</HoverLabel>
    </button>
  );
}
