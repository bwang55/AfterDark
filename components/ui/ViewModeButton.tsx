"use client";

import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

export function ViewModeButton() {
  const viewMode = useAppStore((s) => s.viewMode);
  const toggle = useAppStore((s) => s.toggleViewMode);
  const isLight = useThemeMode();
  const is3d = viewMode === "3d";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`pointer-events-auto flex h-9 items-center gap-1 rounded-xl border px-2.5 shadow-lg backdrop-blur-xl transition-colors duration-500 ${
        isLight
          ? "border-black/[0.06] bg-white/70 hover:border-black/[0.10]"
          : "border-white/10 bg-slate-900/60 hover:border-white/20"
      }`}
    >
      <span
        className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition ${
          !is3d
            ? isLight ? "bg-sky-500/15 text-sky-600" : "bg-sky-400/20 text-sky-300"
            : isLight ? "text-slate-400" : "text-white/30"
        }`}
      >
        2D
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition ${
          is3d
            ? isLight ? "bg-sky-500/15 text-sky-600" : "bg-sky-400/20 text-sky-300"
            : isLight ? "text-slate-400" : "text-white/30"
        }`}
      >
        3D
      </span>
    </button>
  );
}
