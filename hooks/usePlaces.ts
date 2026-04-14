"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MOCK_PLACES, isPlaceOpen } from "@/data/mockPlaces";
import { fetchPlaces } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import type { PlaceTag, RankedPlace, TimeTheme } from "@/shared/types";

// ── MockPlace → RankedPlace conversion (offline mode) ───────────────────

const CATEGORY_TAGS: Record<string, PlaceTag[]> = {
  bars: ["Late Night"],
  food: ["Cafe"],
  music: ["Late Night"],
  clubs: ["Late Night"],
};

const CATEGORY_BEST_FOR: Record<string, TimeTheme[]> = {
  bars: ["dusk", "night"],
  food: ["afternoon", "dusk"],
  music: ["night"],
  clubs: ["night"],
};

function mockToRanked(
  p: (typeof MOCK_PLACES)[number],
  hour: number,
): RankedPlace {
  const open = isPlaceOpen(p, hour);
  return {
    id: p.id,
    name: p.name,
    vibe: p.description,
    neighborhood: p.address + ", Providence RI",
    tags: CATEGORY_TAGS[p.category] ?? [],
    statuses: open ? ["Open"] : ["Closed"],
    coordinates: p.coordinates,
    bestFor: CATEGORY_BEST_FOR[p.category] ?? [],
    openHour: p.openHours.open,
    closeHour: p.openHours.close,
    score: open ? 5 : 0,
    openNow: open,
    visibility: open ? 1 : 0.3,
  };
}

// ── Env-based mode detection ────────────────────────────────────────────

const HAS_API = !!process.env.NEXT_PUBLIC_PLACES_API_URL;

// ── Hook ────────────────────────────────────────────────────────────────

/**
 * Unified data source for places.
 *
 * - When NEXT_PUBLIC_PLACES_API_URL is set → fetches from backend API
 * - When not set → uses local MOCK_PLACES with client-side filtering
 *
 * Returns RankedPlace[] in both modes.
 */
export function usePlaces(): RankedPlace[] {
  const timeValue = useAppStore((s) => s.timeValue);
  const query = useAppStore((s) => s.query);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const hiddenCategories = useAppStore((s) => s.hiddenCategories);
  const filterOpenNow = useAppStore((s) => s.filterOpenNow);
  const filterTags = useAppStore((s) => s.filterTags);

  const hour = ((timeValue % 24) + 24) % 24;

  // ── Online mode: fetch from API ──
  const [apiPlaces, setApiPlaces] = useState<RankedPlace[]>([]);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!HAS_API) return;

    const id = ++fetchIdRef.current;
    const controller = new AbortController();

    fetchPlaces({
      hour,
      tags: filterTags as PlaceTag[],
      query: query || undefined,
      signal: controller.signal,
    })
      .then((result) => {
        if (id === fetchIdRef.current) setApiPlaces(result);
      })
      .catch(() => {
        // Network error — keep previous results
      });

    return () => controller.abort();
  }, [hour, query, filterTags]);

  // ── Offline mode: local MOCK_PLACES filtering ──
  const localPlaces = useMemo(() => {
    if (HAS_API) return [];

    let list = MOCK_PLACES;
    if (hiddenCategories.length > 0) {
      list = list.filter((p) => !hiddenCategories.includes(p.category));
    }
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
    return list
      .filter((p) => isPlaceOpen(p, hour))
      .map((p) => mockToRanked(p, hour));
  }, [selectedCategory, hiddenCategories, query, filterOpenNow, filterTags, hour]);

  return HAS_API ? apiPlaces : localPlaces;
}
