"use client";

import { RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

export function ResetAreaButton() {
  const resetArea = useAppStore((s) => s.resetArea);
  const isLight = useThemeMode();

  return (
    <button
      type="button"
      onClick={resetArea}
      className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        isLight
          ? "border-black/[0.06] bg-white/70 text-slate-600 hover:text-slate-800"
          : "border-white/10 bg-slate-900/60 text-white/70 hover:text-white/90"
      }`}
      aria-label="Reset area"
    >
      <RotateCcw className="h-4 w-4" />
    </button>
  );
}
