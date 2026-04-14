"use client";

import { motion } from "framer-motion";
import type { MockPlace } from "@/data/mockPlaces";
import { isPlaceOpen } from "@/data/mockPlaces";
import { useAppStore } from "@/store/useAppStore";

export function LocationCard({
  place,
  hour,
}: {
  place: MockPlace;
  hour: number;
}) {
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId);
  const hoveredPlaceId = useAppStore((s) => s.hoveredPlaceId);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);
  const setHoveredPlaceId = useAppStore((s) => s.setHoveredPlaceId);

  const open = isPlaceOpen(place, hour);
  const active = place.id === selectedPlaceId || place.id === hoveredPlaceId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.22, 0.68, 0, 1] }}
      onClick={() => setSelectedPlaceId(place.id)}
      onMouseEnter={() => setHoveredPlaceId(place.id)}
      onMouseLeave={() => setHoveredPlaceId(null)}
      className={`cursor-pointer rounded-xl border p-3 transition-colors duration-200 ${
        active
          ? "border-sky-400/30 bg-sky-400/10"
          : "border-white/[0.06] bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/90">{place.name}</h3>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              open ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span className={open ? "text-emerald-400" : "text-red-400"}>
            {open ? "Open" : "Closed"}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-white/50">
        {place.description}
      </p>
      <p className="mt-1.5 text-[10px] text-white/30">{place.address}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {place.vibeTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[9px] text-white/40"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
