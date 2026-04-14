"use client";

import { LocateFixed } from "lucide-react";

export function LocateButton({ onLocate }: { onLocate: () => void }) {
  return (
    <button
      type="button"
      onClick={onLocate}
      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-white/70 shadow-lg backdrop-blur-xl transition hover:text-white/90"
      aria-label="Locate me"
    >
      <LocateFixed className="h-4 w-4" />
    </button>
  );
}
