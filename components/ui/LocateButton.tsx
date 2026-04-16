"use client";

import { LocateFixed } from "lucide-react";
import { useThemeMode } from "@/hooks/useThemeMode";
import { HoverLabel } from "@/components/ui/HoverLabel";

export function LocateButton({ onLocate }: { onLocate: () => void }) {
  const isLight = useThemeMode();

  return (
    <button
      type="button"
      onClick={onLocate}
      className={`group relative pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        isLight
          ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
          : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
      }`}
      aria-label="My Location"
    >
      <LocateFixed className="h-4 w-4" />
      <HoverLabel side="left">My Location</HoverLabel>
    </button>
  );
}
