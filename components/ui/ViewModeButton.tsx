"use client";

import { useAppStore } from "@/store/useAppStore";

export function ViewModeButton() {
  const viewMode = useAppStore((s) => s.viewMode);
  const toggle = useAppStore((s) => s.toggleViewMode);
  const is3d = viewMode === "3d";

  return (
    <button
      type="button"
      onClick={toggle}
      className="pointer-events-auto flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-slate-900/60 px-2.5 shadow-lg backdrop-blur-xl transition hover:border-white/20"
    >
      <span
        className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition ${
          !is3d
            ? "bg-sky-400/20 text-sky-300"
            : "text-white/30"
        }`}
      >
        2D
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition ${
          is3d
            ? "bg-sky-400/20 text-sky-300"
            : "text-white/30"
        }`}
      >
        3D
      </span>
    </button>
  );
}
