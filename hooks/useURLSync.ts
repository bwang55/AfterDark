"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { PlaceCategory } from "@/data/mockPlaces";

const DEBOUNCE_MS = 400;

/**
 * Sync app state ↔ URL query params.
 *
 * Params: t (time), q (query), place, cat, lat, lng, z (zoom)
 *
 * - On mount: read URL → store
 * - On state change: debounced write → URL (replaceState)
 * - On popstate: re-read URL → store
 */
export function useURLSync() {
  const mapCenterRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Read URL → store (on mount + popstate) ──
  const applyURLToStore = () => {
    const sp = new URLSearchParams(window.location.search);

    const t = sp.get("t");
    if (t !== null) {
      const tv = parseFloat(t);
      if (!isNaN(tv)) useAppStore.setState({ timeValue: tv });
    }

    const q = sp.get("q");
    if (q !== null) useAppStore.setState({ query: q });

    const place = sp.get("place");
    if (place !== null) useAppStore.setState({ selectedPlaceId: place });

    const cat = sp.get("cat");
    if (cat !== null)
      useAppStore.setState({ selectedCategory: cat as PlaceCategory });

    const lat = sp.get("lat");
    const lng = sp.get("lng");
    const z = sp.get("z");
    if (lat !== null && lng !== null) {
      mapCenterRef.current = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        zoom: z ? parseFloat(z) : 14,
      };
    }
  };

  // Mount: apply URL params, then start watching
  useEffect(() => {
    applyURLToStore();
    initializedRef.current = true;

    const onPop = () => applyURLToStore();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Write store → URL (debounced) ──
  useEffect(() => {
    if (!initializedRef.current) return;

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // Only update URL when relevant state changes
      if (
        state.timeValue === prevState.timeValue &&
        state.query === prevState.query &&
        state.selectedPlaceId === prevState.selectedPlaceId &&
        state.selectedCategory === prevState.selectedCategory
      ) {
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => writeURL(), DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const writeURL = () => {
    const s = useAppStore.getState();
    const sp = new URLSearchParams();

    // Always write time (rounded to 1 decimal)
    sp.set("t", s.timeValue.toFixed(1));

    if (s.query) sp.set("q", s.query);
    if (s.selectedPlaceId) sp.set("place", s.selectedPlaceId);
    if (s.selectedCategory) sp.set("cat", s.selectedCategory);

    if (mapCenterRef.current) {
      sp.set("lat", mapCenterRef.current.lat.toFixed(4));
      sp.set("lng", mapCenterRef.current.lng.toFixed(4));
      sp.set("z", mapCenterRef.current.zoom.toFixed(1));
    }

    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;

    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", url);
    }
  };

  /** Call from MapCanvas onViewportChange to keep lat/lng/z in sync. */
  const handleViewportChange = (payload: {
    center: { lng: number; lat: number };
    zoom: number;
  }) => {
    mapCenterRef.current = {
      lat: payload.center.lat,
      lng: payload.center.lng,
      zoom: payload.zoom,
    };
    // Debounce URL write
    if (initializedRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => writeURL(), DEBOUNCE_MS);
    }
  };

  return {
    /** Initial map center from URL, or null if not in URL. */
    urlCenter: mapCenterRef.current,
    /** Pass to MapCanvas onViewportChange. */
    handleViewportChange,
  };
}
