"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPlaces } from "@/lib/api";
import { discoverPlaces } from "@/lib/discovery";
import { haversineKm, matchesPlaceSearch, rankPlaces } from "@/shared/filter";
import { PROVIDENCE_CENTER, SEED_PLACES } from "@/shared/places";
import { useAppStore } from "@/store/useAppStore";
import type { Place, RankedPlace } from "@/shared/types";

// ── Env-based mode detection ────────────────────────────────────────────

const HAS_API = !!process.env.NEXT_PUBLIC_PLACES_API_URL;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

/** Search radius in km from PROVIDENCE_CENTER. Keeps the map scoped to downtown. */
const SEARCH_RADIUS_KM = 2;

function withinRadius(lng: number, lat: number): boolean {
  return (
    haversineKm(PROVIDENCE_CENTER.lat, PROVIDENCE_CENTER.lng, lat, lng) <=
    SEARCH_RADIUS_KM
  );
}

/**
 * Bbox enclosing the search circle, sent to the backend / Mapbox so discovery
 * returns candidates covering the full radius. Slightly inflated (1.25×) so
 * Mapbox returns candidates near the edge; the client re-filters via
 * `withinRadius`.
 */
const BBOX_INFLATE = 1.25;
const LAT_DELTA = (SEARCH_RADIUS_KM * BBOX_INFLATE) / 111;
const LNG_DELTA =
  (SEARCH_RADIUS_KM * BBOX_INFLATE) /
  (111 * Math.cos((PROVIDENCE_CENTER.lat * Math.PI) / 180));
const SEARCH_BBOX: [number, number, number, number] = [
  PROVIDENCE_CENTER.lng - LNG_DELTA,
  PROVIDENCE_CENTER.lat - LAT_DELTA,
  PROVIDENCE_CENTER.lng + LNG_DELTA,
  PROVIDENCE_CENTER.lat + LAT_DELTA,
];

// ── Hook ────────────────────────────────────────────────────────────────

/**
 * Unified data source for places.
 *
 * Priority (first available wins):
 * 1. `NEXT_PUBLIC_PLACES_API_URL` set → fetch from backend API
 * 2. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` set → call Mapbox Search Box directly
 *    from the client, merged with Providence seed places
 * 3. Otherwise → rank SEED_PLACES locally
 *
 * Returns RankedPlace[] in all modes, with `query`, `filterTags`, the 2km
 * Providence radius, and `selectedCategory` applied.
 * `filterOpenNow` is UI-level and intentionally NOT applied here — MapCanvas
 * still renders closed markers at reduced visibility.
 */
export function usePlaces(): RankedPlace[] {
  const timeValue = useAppStore((s) => s.timeValue);
  const query = useAppStore((s) => s.query);
  const filterTags = useAppStore((s) => s.filterTags);
  const selectedCategory = useAppStore((s) => s.selectedCategory);

  const hour = ((timeValue % 24) + 24) % 24;

  // ── API mode: fetch from backend ──
  const [apiPlaces, setApiPlaces] = useState<RankedPlace[]>([]);
  const apiFetchId = useRef(0);

  useEffect(() => {
    if (!HAS_API) return;

    const id = ++apiFetchId.current;
    const controller = new AbortController();

    fetchPlaces({
      hour,
      tags: filterTags,
      query: query || undefined,
      lng: PROVIDENCE_CENTER.lng,
      lat: PROVIDENCE_CENTER.lat,
      bbox: SEARCH_BBOX,
      limit: 80,
      signal: controller.signal,
    })
      .then((result) => {
        if (id === apiFetchId.current) setApiPlaces(result);
      })
      .catch(() => {
        // Network error — keep previous results
      });

    return () => controller.abort();
  }, [hour, query, filterTags]);

  // ── Direct Mapbox mode: client-side discovery when no backend ──
  //
  // Fires ONCE per mount. Since the bbox is fixed (2.5km around Providence)
  // and we fetch the full base set (cafe/restaurant/bar), there's no need
  // to re-fetch when hour/query/tags change — they're all handled client-side
  // by `localPlaces` below. This keeps Mapbox API calls to 3 per mount
  // (one per term), dedup'd and cached further in lib/discovery.ts.
  const [mapboxPlaces, setMapboxPlaces] = useState<Place[]>([]);

  useEffect(() => {
    if (HAS_API || !MAPBOX_TOKEN) return;

    const controller = new AbortController();

    discoverPlaces({
      accessToken: MAPBOX_TOKEN,
      hour: 12, // arbitrary — not used in cache key, local rankPlaces will re-rank
      bbox: SEARCH_BBOX,
      limit: 80,
      proximity: { lng: PROVIDENCE_CENTER.lng, lat: PROVIDENCE_CENTER.lat },
      // Intentionally NO query — query is a client-side filter on the pulled set.
      signal: controller.signal,
    })
      .then((result) => setMapboxPlaces(result))
      .catch(() => {
        // Network / Mapbox error — keep previous results
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Local ranking: merge (seed + mapbox) or just seed ──
  const localPlaces = useMemo(() => {
    if (HAS_API) return [];

    // Merge Providence seeds with any mapbox-discovered places, deduped by id.
    const merged = new Map<string, Place>();
    for (const p of SEED_PLACES) merged.set(p.id, p);
    for (const p of mapboxPlaces) merged.set(p.id, p);

    const all = Array.from(merged.values());
    const source = query.trim()
      ? all.filter((p) => matchesPlaceSearch(p, query))
      : all;

    return rankPlaces(source, {
      hour,
      tags: filterTags,
      limit: 80,
      lng: PROVIDENCE_CENTER.lng,
      lat: PROVIDENCE_CENTER.lat,
      bbox: SEARCH_BBOX,
    });
  }, [hour, query, filterTags, mapboxPlaces]);

  // ── Unified post-filter: 2km radius + category ──
  const base = HAS_API ? apiPlaces : localPlaces;
  return useMemo(() => {
    return base.filter((p) => {
      if (!withinRadius(p.coordinates.lng, p.coordinates.lat)) return false;
      if (selectedCategory && p.category !== selectedCategory) return false;
      return true;
    });
  }, [base, selectedCategory]);
}
