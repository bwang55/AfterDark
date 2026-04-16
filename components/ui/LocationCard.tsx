"use client";

import { motion } from "framer-motion";
import type { RankedPlace } from "@/shared/types";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

export function LocationCard({ place }: { place: RankedPlace }) {
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId);
  const hoveredPlaceId = useAppStore((s) => s.hoveredPlaceId);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const setHoveredPlaceId = useAppStore((s) => s.setHoveredPlaceId);
  const isLight = useThemeMode();

  const open = place.openNow;
  const isSelected = place.id === selectedPlaceId;
  const isHovered = place.id === hoveredPlaceId;
  const active = isSelected || isHovered;

  // Focus transfer: when another card is being hovered (and it's not us, and
  // we're not already selected), fall back into soft focus so the hovered
  // card becomes the scene's subject.
  const defocused =
    hoveredPlaceId !== null && !isHovered && !isSelected;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: defocused ? 0.55 : 1,
        y: 0,
        filter: defocused ? "blur(2.5px)" : "blur(0px)",
      }}
      exit={{ opacity: 0, y: -6 }}
      whileHover={open ? { scale: 1.025, y: -2 } : undefined}
      transition={{ duration: 0.22, ease: [0.22, 0.68, 0, 1] }}
      onClick={() => open && setSelectedPlaceId(place.id)}
      onMouseEnter={() => setHoveredPlaceId(place.id)}
      onMouseLeave={() => setHoveredPlaceId(null)}
      style={{
        boxShadow: active
          ? isLight
            ? "0 8px 24px -12px rgba(14,165,233,0.35), 0 0 0 1px rgba(14,165,233,0.18)"
            : "0 10px 28px -14px rgba(56,189,248,0.45), 0 0 24px -8px rgba(56,189,248,0.25)"
          : "none",
        willChange: defocused || active ? "filter, transform" : "auto",
      }}
      className={`rounded-xl border p-3 transition-colors duration-200 ${open ? "cursor-pointer" : "cursor-default opacity-60"} ${
        active
          ? isLight
            ? "border-sky-500/30 bg-sky-500/10"
            : "border-sky-400/30 bg-sky-400/10"
          : isLight
            ? "border-black/[0.04] bg-black/[0.02] hover:border-black/[0.08] hover:bg-black/[0.04]"
            : "border-white/[0.06] bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`text-sm font-semibold ${isLight ? "text-slate-800" : "text-white/90"}`}
        >
          {place.name}
        </h3>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              open ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span className={open ? "text-emerald-500" : "text-red-400"}>
            {open ? "Open" : "Closed"}
          </span>
        </span>
      </div>
      <p
        className={`mt-1 text-xs leading-relaxed ${isLight ? "text-slate-500" : "text-white/50"}`}
      >
        {place.vibe}
      </p>
      <p
        className={`mt-1.5 text-[10px] ${isLight ? "text-slate-400" : "text-white/30"}`}
      >
        {place.neighborhood}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {place.tags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full border px-2 py-0.5 text-[9px] ${
              isLight
                ? "border-black/[0.04] bg-black/[0.03] text-slate-400"
                : "border-white/[0.06] bg-white/[0.04] text-white/40"
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
