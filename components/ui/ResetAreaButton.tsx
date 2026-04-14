"use client";

import { RotateCcw } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export function ResetAreaButton() {
  const resetArea = useAppStore((s) => s.resetArea);

  return (
    <button
      type="button"
      onClick={resetArea}
      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-white/70 shadow-lg backdrop-blur-xl transition hover:text-white/90"
      aria-label="Reset area"
    >
      <RotateCcw className="h-4 w-4" />
    </button>
  );
}
