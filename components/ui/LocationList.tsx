"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CATEGORIES,
  MOCK_PLACES,
  isPlaceOpen,
} from "@/data/mockPlaces";
import { useAppStore } from "@/store/useAppStore";
import { LocationCard } from "./LocationCard";

/** All unique vibe tags across mock data, sorted alphabetically. */
const ALL_TAGS = Array.from(
  new Set(MOCK_PLACES.flatMap((p) => p.vibeTags)),
).sort();

export function LocationList() {
  const open = useAppStore((s) => s.locationListOpen);
  const toggle = useAppStore((s) => s.toggleLocationList);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);
  const timeValue = useAppStore((s) => s.timeValue);
  const query = useAppStore((s) => s.query);
  const filterOpenNow = useAppStore((s) => s.filterOpenNow);
  const toggleFilterOpenNow = useAppStore((s) => s.toggleFilterOpenNow);
  const filterTags = useAppStore((s) => s.filterTags);
  const toggleFilterTag = useAppStore((s) => s.toggleFilterTag);
  const clearFilters = useAppStore((s) => s.clearFilters);

  const [filterOpen, setFilterOpen] = useState(false);

  const hour = ((timeValue % 24) + 24) % 24;

  const hasActiveFilters = filterOpenNow || filterTags.length > 0;

  const filtered = useMemo(() => {
    let list = MOCK_PLACES;
    if (selectedCategory) {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.vibeTags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterOpenNow) {
      list = list.filter((p) => isPlaceOpen(p, hour));
    }
    if (filterTags.length > 0) {
      list = list.filter((p) =>
        filterTags.some((tag) => p.vibeTags.includes(tag)),
      );
    }
    return list;
  }, [selectedCategory, query, filterOpenNow, filterTags, hour]);

  const openCount = useMemo(
    () => filtered.filter((p) => isPlaceOpen(p, hour)).length,
    [filtered, hour],
  );

  return (
    <>
      {/* ── Collapse handle ── */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Collapse list" : "Expand list"}
        className="pointer-events-auto absolute top-1/2 z-10 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-slate-900/60 text-white/50 backdrop-blur-xl transition-all hover:w-6 hover:text-white/80"
        style={{
          left: open ? 340 : 0,
          transition: "left 300ms cubic-bezier(0.22,0.68,0,1)",
        }}
      >
        {open ? (
          <ChevronLeft className="h-3.5 w-3.5" />
        ) : (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="absolute inset-0 animate-pulse rounded-r-lg bg-sky-400/10" />
          </>
        )}
      </button>

      {/* ── Drawer ── */}
      <motion.div
        initial={false}
        animate={{
          x: open ? 0 : -340,
          opacity: open ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: [0.22, 0.68, 0, 1] }}
        className="pointer-events-auto absolute inset-y-0 left-0 z-10 flex w-[340px] flex-col"
      >
        <div className="flex h-full flex-col rounded-r-2xl border border-l-0 border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-xl">
          {/* ── Category tabs ── */}
          <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 pt-3 pb-2">
            <div className="flex flex-1 gap-1">
              <TabButton
                active={selectedCategory === null}
                onClick={() => setSelectedCategory(null)}
                label="All"
              />
              {CATEGORIES.map((c) => (
                <TabButton
                  key={c.key}
                  active={selectedCategory === c.key}
                  onClick={() => setSelectedCategory(c.key)}
                  label={c.label}
                />
              ))}
            </div>
            {/* Filter toggle button */}
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
                filterOpen || hasActiveFilters
                  ? "bg-sky-400/15 text-sky-300"
                  : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {hasActiveFilters && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-sky-400" />
              )}
            </button>
          </div>

          {/* ── Filter panel ── */}
          <AnimatePresence>
            {filterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1] }}
                className="overflow-hidden border-b border-white/[0.06]"
              >
                <div className="space-y-2.5 px-3 py-2.5">
                  {/* Open now toggle */}
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-[11px] font-medium text-white/60">
                      Open now only
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={filterOpenNow}
                      onClick={toggleFilterOpenNow}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        filterOpenNow ? "bg-emerald-400/40" : "bg-white/10"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          filterOpenNow ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </label>

                  {/* Vibe tags */}
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                      Vibe
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ALL_TAGS.map((tag) => {
                        const active = filterTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleFilterTag(tag)}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                              active
                                ? "border-sky-400/30 bg-sky-400/15 text-sky-300"
                                : "border-white/[0.06] bg-white/[0.03] text-white/40 hover:border-white/10 hover:text-white/60"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Clear all */}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-[10px] text-white/30 transition hover:text-white/60"
                    >
                      <X className="h-3 w-3" />
                      Clear filters
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Count ── */}
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/30">
              {filtered.length} places
            </span>
            <span className="text-[10px] text-emerald-400/70">
              {openCount} open now
            </span>
          </div>

          {/* ── Scrollable card list ── */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-2">
              <AnimatePresence initial={false} mode="popLayout">
                {filtered.map((place) => (
                  <LocationCard key={place.id} place={place} hour={hour} />
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <p className="py-8 text-center text-xs text-white/30">
                  No places match your filter.
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-sky-400/15 text-sky-300"
          : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
      }`}
    >
      {label}
    </button>
  );
}
