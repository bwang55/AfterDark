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

/** Search radius in km from the user's current center. */
const SEARCH_RADIUS_KM = 2;

/** Bbox inflate factor — Mapbox returns edge candidates; we re-filter via `withinRadius`. */
const BBOX_INFLATE = 1.25;

function withinRadius(
  centerLng: number,
  centerLat: number,
  lng: number,
  lat: number,
): boolean {
  return haversineKm(centerLat, centerLng, lat, lng) <= SEARCH_RADIUS_KM;
}

/**
 * Bbox enclosing the search circle. Recomputed whenever the user center moves
 * (after geolocation resolves, or if we ever allow manual recentering).
 */
function bboxAround(
  lng: number,
  lat: number,
): [number, number, number, number] {
  const latDelta = (SEARCH_RADIUS_KM * BBOX_INFLATE) / 111;
  const lngDelta =
    (SEARCH_RADIUS_KM * BBOX_INFLATE) /
    (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

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
  const userLocation = useAppStore((s) => s.userLocation);

  const hour = ((timeValue % 24) + 24) % 24;

  // Resolve search center from user location. While `userLocation` is null we
  // hold off all network calls — avoids a wasted Providence-centered fetch
  // that would then be discarded once geolocation resolves.
  const ready = userLocation !== null;
  const centerLng = userLocation?.lng ?? PROVIDENCE_CENTER.lng;
  const centerLat = userLocation?.lat ?? PROVIDENCE_CENTER.lat;

  // ── API mode: fetch from backend ──
  const [apiPlaces, setApiPlaces] = useState<RankedPlace[]>([]);
  const apiFetchId = useRef(0);

  useEffect(() => {
    if (!HAS_API || !ready) return;

    const id = ++apiFetchId.current;
    const controller = new AbortController();

    fetchPlaces({
      hour,
      tags: filterTags,
      query: query || undefined,
      lng: centerLng,
      lat: centerLat,
      bbox: bboxAround(centerLng, centerLat),
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
  }, [hour, query, filterTags, ready, centerLng, centerLat]);

  // ── Direct Mapbox mode: client-side discovery when no backend ──
  //
  // Fires once the user's location is resolved, and again if the center
  // moves (e.g. re-permission). Hour/query/tags are still client-side filters
  // over the pulled base set — no re-fetch needed for those.
  const [mapboxPlaces, setMapboxPlaces] = useState<Place[]>([]);

  useEffect(() => {
    if (HAS_API || !MAPBOX_TOKEN || !ready) return;

    const controller = new AbortController();

    discoverPlaces({
      accessToken: MAPBOX_TOKEN,
      hour: 12, // arbitrary — not used in cache key, local rankPlaces will re-rank
      bbox: bboxAround(centerLng, centerLat),
      limit: 80,
      proximity: { lng: centerLng, lat: centerLat },
      // Intentionally NO query — query is a client-side filter on the pulled set.
      signal: controller.signal,
    })
      .then((result) => setMapboxPlaces(result))
      .catch(() => {
        // Network / Mapbox error — keep previous results
      });

    return () => controller.abort();
  }, [ready, centerLng, centerLat]);

  // ── Local ranking: merge (seed + mapbox) or just seed ──
  const localPlaces = useMemo(() => {
    if (HAS_API) return [];

    // Merge seed places with any mapbox-discovered places, deduped by id.
    // SEED_PLACES cover multiple cities — the radius filter below keeps only
    // those actually near the user's center.
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
      lng: centerLng,
      lat: centerLat,
      bbox: bboxAround(centerLng, centerLat),
    });
  }, [hour, query, filterTags, mapboxPlaces, centerLng, centerLat]);

  // ── Unified post-filter: 2km radius + category ──
  const base = HAS_API ? apiPlaces : localPlaces;
  return useMemo(() => {
    return base.filter((p) => {
      if (!withinRadius(centerLng, centerLat, p.coordinates.lng, p.coordinates.lat))
        return false;
      if (selectedCategory && p.category !== selectedCategory) return false;
      return true;
    });
  }, [base, selectedCategory, centerLng, centerLat]);
}
