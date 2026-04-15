"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

const DEBOUNCE_MS = 400;

/**
 * Sync app state ↔ URL query params.
 *
 * Params: t (time), q (query), place, open, view, pitch, lat, lng, z
 *
 * - On mount: read URL → store
 * - On state change: debounced write → URL (replaceState)
 * - On popstate: re-read URL → store
 */
export function useURLSync() {
  // Initial center from URL `?lat=&lng=&z=` params — set ONCE on mount and
  // never updated afterwards. Used by page.tsx to honor deep-links on the
  // first paint. Separating this from `mapCenterRef` prevents the first
  // camera `moveend` (which fires after the initial flyTo to Providence)
  // from polluting `urlCenter` and blocking the user-location auto-fly.
  const initialUrlCenterRef = useRef<
    { lat: number; lng: number; zoom: number } | null
  >(null);

  // Current camera center — updated on every `moveend` via
  // `handleViewportChange`. Used only when serializing state back to the URL.
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

    const open = sp.get("open");
    if (open === "1") useAppStore.setState({ filterOpenNow: true });

    const view = sp.get("view");
    if (view === "2d" || view === "3d")
      useAppStore.setState({ viewMode: view });

    const pitch = sp.get("pitch");
    if (pitch !== null) {
      const pv = parseFloat(pitch);
      if (!isNaN(pv)) useAppStore.setState({ mapPitch: Math.round(pv) });
    }

    const lat = sp.get("lat");
    const lng = sp.get("lng");
    const z = sp.get("z");
    if (lat !== null && lng !== null) {
      const parsed = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        zoom: z ? parseFloat(z) : 14,
      };
      // First apply only: seed the initial URL center. Later popstate events
      // also call this, but we deliberately don't overwrite — the map's
      // current view should win unless the user explicitly recenters.
      if (!initialUrlCenterRef.current) initialUrlCenterRef.current = parsed;
      mapCenterRef.current = parsed;
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
      if (
        state.timeValue === prevState.timeValue &&
        state.query === prevState.query &&
        state.selectedPlaceId === prevState.selectedPlaceId &&
        state.filterOpenNow === prevState.filterOpenNow &&
        state.viewMode === prevState.viewMode &&
        state.mapPitch === prevState.mapPitch
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
    if (s.filterOpenNow) sp.set("open", "1");
    if (s.viewMode !== "3d") sp.set("view", s.viewMode);
    if (s.mapPitch !== 72) sp.set("pitch", String(s.mapPitch));

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
    /** Initial map center from URL deep-link, or null if none. Stable across
     *  renders — does NOT track subsequent camera moves. */
    urlCenter: initialUrlCenterRef.current,
    /** Pass to MapCanvas onViewportChange. */
    handleViewportChange,
  };
}
