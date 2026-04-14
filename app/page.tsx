"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { discoverPlaces } from "@/lib/discovery";
import { geocodeLocation } from "@/lib/geocode";
import { MapCanvas } from "@/components/MapCanvas";
import { PlaceCard } from "@/components/PlaceCard";
import { ThemeTransitionLayer } from "@/components/ThemeTransitionLayer";
import { haversineKm, isOpenAtHour, matchesPlaceSearch } from "@/shared/filter";
import {
  TIME_MARKERS,
  TIME_RANGE_END,
  TIME_RANGE_START,
  TIME_THEME_META,
  interpolateThemeVisual,
  resolveThemeByHour,
  to24HourLabel,
} from "@/shared/time-theme";
import type { RankedPlace } from "@/shared/types";

const DEFAULT_HOUR = 14;

/** Return current wall-clock time mapped to the slider's 6–30 range. */
function currentHourValue(): number {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  // The slider uses 6–30 where 24–30 represents midnight–6 AM (next day).
  // Map 0:00–5:59 → 24–30, and 6:00–23:59 → 6–24.
  return h < 6 ? h + 24 : h;
}
type SearchLookupState = "idle" | "searching" | "resolved" | "failed";
type PlacesLoadState = "idle" | "loading" | "ready" | "failed";
type Bbox = [number, number, number, number];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolvePlaceCity(place: RankedPlace): string {
  const parts = place.neighborhood.split(",");
  if (parts.length <= 1) {
    return "New York";
  }
  return parts[parts.length - 1].trim();
}

function interleaveByCity(places: RankedPlace[], limit: number): RankedPlace[] {
  const buckets = new Map<string, RankedPlace[]>();

  places.forEach((place) => {
    const city = resolvePlaceCity(place);
    const list = buckets.get(city) ?? [];
    list.push(place);
    buckets.set(city, list);
  });

  const cities = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
  const result: RankedPlace[] = [];

  while (result.length < limit) {
    let added = false;

    cities.forEach((city) => {
      if (result.length >= limit) {
        return;
      }

      const list = buckets.get(city);
      const next = list?.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    });

    if (!added) {
      break;
    }
  }

  return result;
}

function normalizeBbox(bbox: [number, number, number, number]): Bbox {
  const [minLngRaw, minLatRaw, maxLngRaw, maxLatRaw] = bbox;
  const minLng = Math.min(minLngRaw, maxLngRaw);
  const maxLng = Math.max(minLngRaw, maxLngRaw);
  const minLat = Math.min(minLatRaw, maxLatRaw);
  const maxLat = Math.max(minLatRaw, maxLatRaw);

  return [minLng, minLat, maxLng, maxLat];
}

function bboxToKey(bbox: Bbox | null): string {
  if (!bbox) {
    return "";
  }
  return bbox.map((value) => value.toFixed(4)).join(",");
}

function bboxAroundCenter(center: { lng: number; lat: number }, radiusKm: number): Bbox {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));

  return normalizeBbox([
    center.lng - lngDelta,
    center.lat - latDelta,
    center.lng + lngDelta,
    center.lat + latDelta,
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;

  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(start: string, end: string, progress: number): string {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  const t = clamp(progress, 0, 1);

  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbaFromHex(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type PlaceCategory = "Cafés" | "Restaurants" | "Bars & Nightlife" | "Entertainment";

function categoryForPlace(place: RankedPlace): PlaceCategory {
  const tags = place.tags;
  if (tags.includes("Cafe")) return "Cafés";
  if (tags.includes("Late Night")) return "Bars & Nightlife";
  const vibe = place.vibe.toLowerCase();
  if (
    vibe.includes("music") ||
    vibe.includes("film") ||
    vibe.includes("screen") ||
    vibe.includes("theater") ||
    vibe.includes("show")
  )
    return "Entertainment";
  return "Restaurants";
}

const CATEGORY_ORDER: PlaceCategory[] = ["Cafés", "Restaurants", "Bars & Nightlife", "Entertainment"];

function groupPlacesByCategory(places: RankedPlace[]): { category: PlaceCategory; places: RankedPlace[] }[] {
  const buckets = new Map<PlaceCategory, RankedPlace[]>();
  for (const place of places) {
    const cat = categoryForPlace(place);
    const list = buckets.get(cat) ?? [];
    list.push(place);
    buckets.set(cat, list);
  }
  return CATEGORY_ORDER
    .filter((cat) => buckets.has(cat))
    .map((cat) => ({ category: cat, places: buckets.get(cat)! }));
}

export default function HomePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [timeBarCollapsed, setTimeBarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [lastFetchedQuery, setLastFetchedQuery] = useState("");
  const [timeValue, setTimeValue] = useState<number>(() => currentHourValue());
  const pendingTimeRef = useRef<number>(timeValue);
  const mainRef = useRef<HTMLElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const isDragRef = useRef(false);
  const dragEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTimeChange = useCallback((value: number) => {
    pendingTimeRef.current = value;
    // Instant: update time display label via DOM (skip React re-render)
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = to24HourLabel(value);
    }
    // Mark dragging via data attribute so CSS can shorten overlay transitions
    if (!isDragRef.current && mainRef.current) {
      isDragRef.current = true;
      mainRef.current.setAttribute('data-time-dragging', '');
    }
    if (dragEndRef.current) clearTimeout(dragEndRef.current);
    dragEndRef.current = setTimeout(() => {
      isDragRef.current = false;
      mainRef.current?.removeAttribute('data-time-dragging');
    }, 250);
    // Throttle React state updates to ~20fps — the slider is uncontrolled
    // so the thumb follows the finger natively at full frame rate.
    if (throttleRef.current === null) {
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        setTimeValue(pendingTimeRef.current);
      }, 50);
    }
  }, []);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [recenterCount, setRecenterCount] = useState(0);
  const [places, setPlaces] = useState<RankedPlace[]>([]);
  const [placesLoadState, setPlacesLoadState] = useState<PlacesLoadState>("idle");
  const [pendingBbox, setPendingBbox] = useState<Bbox | null>(null);
  const [activeBbox, setActiveBbox] = useState<Bbox | null>(null);
  const [searchCenter, setSearchCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [searchPlaceName, setSearchPlaceName] = useState<string | null>(null);
  const [searchLookupState, setSearchLookupState] = useState<SearchLookupState>("idle");
  const [committedQuery, setCommittedQuery] = useState("");
  const [geoResolved, setGeoResolved] = useState(false);
  const latestGeocodeRequestRef = useRef(0);

  const hour = ((timeValue % 24) + 24) % 24;
  const theme = resolveThemeByHour(hour);
  const themeMeta = TIME_THEME_META[theme];
  const queryText = query.trim();
  const normalizedQuery = normalize(query);
  const activeBboxKey = bboxToKey(activeBbox);
  const pendingBboxKey = bboxToKey(pendingBbox);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
  const themeVisual = interpolateThemeVisual(timeValue);

  const canLoadHere = Boolean(
    pendingBboxKey && (pendingBboxKey !== activeBboxKey || queryText !== lastFetchedQuery)
  );

  // Submit search: geocode only fires on explicit Enter press
  const handleSearchSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setCommittedQuery(trimmed);
    // Only fire discovery immediately for POI/category terms.
    // City-name searches (e.g. "Providence") yield 0 discovery results —
    // let geocode resolve first; it will set activeBbox + lastFetchedQuery.
    const lower = trimmed.toLowerCase();
    const POI_KEYWORDS = ["restaurant", "bar", "cafe", "club", "music", "movie", "theater", "entertainment"];
    const isPoi = POI_KEYWORDS.some((term) => lower.includes(term));
    if (isPoi) {
      setLastFetchedQuery(trimmed);
      if (pendingBbox) {
        const [minLng, minLat, maxLng, maxLat] = pendingBbox;
        setActiveBbox(bboxAroundCenter({ lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 }, 2));
      }
    }
  }, [query, pendingBbox]);

  const handleViewportChange = useCallback((payload: { bbox: Bbox }) => {
    setPendingBbox(normalizeBbox(payload.bbox));
  }, []);

  const handleLoadHere = useCallback(() => {
    if (!pendingBbox) {
      return;
    }
    // If only the query changed, we can force a refetch by updating lastFetchedQuery.
    // Setting activeBbox triggers the map effect.
    setLastFetchedQuery(query.trim());
    
    // Instead of the whole viewport, only load a 2km radius from the screen center
    const [minLng, minLat, maxLng, maxLat] = pendingBbox;
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    setActiveBbox(bboxAroundCenter({ lng: centerLng, lat: centerLat }, 2));
    
    setSelectedPlaceId(null);
  }, [pendingBbox, query]);

  const handleClearArea = useCallback(() => {
    setActiveBbox(null);
  }, []);

  useEffect(() => {
    if (activeBbox || !pendingBbox || normalizedQuery || !geoResolved) {
      return;
    }
    // Initially fall back to fetching a small area around the initial map center
    const [minLng, minLat, maxLng, maxLat] = pendingBbox;
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    setActiveBbox(bboxAroundCenter({ lng: centerLng, lat: centerLat }, 2));
  }, [activeBbox, geoResolved, normalizedQuery, pendingBbox]);

  // Request user location on initial mount.
  // Always attempt geolocation — the success callback unconditionally
  // overrides whatever fallback bbox was set while waiting for the prompt.
  useEffect(() => {
    const applyLocation = (center: { lat: number; lng: number }, isUser: boolean) => {
      if (isUser) setUserLocation(center);
      setSearchCenter(center);
      const initialBbox = bboxAroundCenter(center, 2);
      setPendingBbox(initialBbox);
      setActiveBbox(initialBbox);
      setGeoResolved(true);
    };

    const fallbackToIpGeo = () => {
      // Try IP-based geolocation before falling back to hardcoded coordinates
      fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) })
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.latitude === "number" && typeof data.longitude === "number") {
            console.log("[Geolocation] IP-based location:", { lat: data.latitude, lng: data.longitude });
            applyLocation({ lat: data.latitude, lng: data.longitude }, false);
          } else {
            throw new Error("Invalid IP geo response");
          }
        })
        .catch((ipErr) => {
          console.warn("[Geolocation] IP geolocation also failed:", ipErr);
          applyLocation({ lat: 40.7128, lng: -73.9960 }, false);
        });
    };

    if (!navigator.geolocation) {
      fallbackToIpGeo();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        console.log("[Geolocation] Got position:", { lat, lng });
        applyLocation({ lat, lng }, true);
      },
      (error) => {
        console.warn("[Geolocation] Could not get user location:", error);
        fallbackToIpGeo();
      },
      { timeout: 12000, enableHighAccuracy: false, maximumAge: 300000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const directMatches = useMemo(
    () => places.filter((place) => matchesPlaceSearch(place, normalizedQuery)),
    [places, normalizedQuery],
  );
  
  // Predict if the search is likely a category/POI rather than a city
  const COMMON_POIS = ["restaurant", "bar", "cafe", "club", "music", "movie", "theater", "entertainment"];
  const isPoiSearch = COMMON_POIS.some(term => normalizedQuery.includes(term));
  const shouldGeocode = normalizedQuery.length >= 3 && directMatches.length === 0 && !isPoiSearch;
  
  // Now discoveryBbox is simply activeBbox. No background tracking!
  const discoveryBbox = activeBbox;
  const discoveryBboxKey = bboxToKey(discoveryBbox);

  useEffect(() => {
    const controller = new AbortController();
    if (!mapboxToken) {
      setPlaces([]);
      setPlacesLoadState("failed");
      return () => {
        controller.abort();
      };
    }
    if (!discoveryBbox) {
      setPlacesLoadState("idle");
      return () => {
        controller.abort();
      };
    }

    setPlacesLoadState((prev) => (prev === "ready" ? "ready" : "loading"));

    const [minLng, minLat, maxLng, maxLat] = discoveryBbox;
    const center = {
      lng: (minLng + maxLng) / 2,
      lat: (minLat + maxLat) / 2,
    };

    console.log("[Places] Fetching for bbox", discoveryBbox, "query:", lastFetchedQuery);
    // Use a fixed hour (14) for the initial fetch/ranking — we filter open/closed locally.
    // This avoids re-fetching when the user drags the time slider.
    discoverPlaces({
      accessToken: mapboxToken,
      hour: 14,
      limit: 180,
      bbox: discoveryBbox,
      proximity: center,
      signal: controller.signal,
      query: lastFetchedQuery
    })
      .then((nextPlaces) => {
        console.log("[Places] Received", nextPlaces.length, "places");
        if (controller.signal.aborted) {
          return;
        }
        setPlaces(nextPlaces);
        setPlacesLoadState("ready");
      })
      .catch((err) => {
        console.error("[Places] Failed context:", err);
        if (controller.signal.aborted) {
          return;
        }
        setPlaces([]);
        setPlacesLoadState("failed");
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoveryBboxKey, mapboxToken, lastFetchedQuery]);

  // Geocode only fires when user presses Enter (committedQuery changes)
  useEffect(() => {
    if (!committedQuery || committedQuery.length < 2) {
      setSearchCenter(null);
      setSearchPlaceName(null);
      setSearchLookupState("idle");
      return;
    }

    // Check if it's a POI/category search — skip geocoding
    const lower = committedQuery.toLowerCase();
    const POI_KEYWORDS = ["restaurant", "bar", "cafe", "club", "music", "movie", "theater", "entertainment"];
    if (POI_KEYWORDS.some(term => lower.includes(term))) {
      setSearchCenter(null);
      setSearchPlaceName(null);
      setSearchLookupState("resolved");
      return;
    }

    if (!mapboxToken) {
      setSearchLookupState("failed");
      return;
    }

    const requestId = latestGeocodeRequestRef.current + 1;
    latestGeocodeRequestRef.current = requestId;
    setSearchLookupState("searching");

    const controller = new AbortController();
    geocodeLocation(committedQuery, mapboxToken, controller.signal, {
      retries: 0,
      timeoutMs: 4500,
    }).then((result) => {
      if (requestId !== latestGeocodeRequestRef.current) return;

      if (!result) {
        setSearchCenter(null);
        setSearchPlaceName(null);
        setSearchLookupState("failed");
        return;
      }

      setSearchCenter(result.center);
      setSearchPlaceName(result.placeName);
      setSearchLookupState("resolved");

      // Fly to the geocoded location and load a 2km area
      setActiveBbox(bboxAroundCenter(result.center, 2));
      setLastFetchedQuery("");
    });

    return () => {
      controller.abort();
    };
  }, [committedQuery, mapboxToken]);

  const nearestPlacesFromSearch = useMemo(() => {
    if (!searchCenter) {
      return [] as RankedPlace[];
    }

    return [...places]
      .map((place) => ({
        place,
        distance: haversineKm(
          searchCenter.lat,
          searchCenter.lng,
          place.coordinates.lat,
          place.coordinates.lng,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.place);
  }, [places, searchCenter]);

  // ── Local open-hours filter ──────────────────────────────────────────
  // All places are fetched once; we filter locally so only currently-open
  // places appear in the sidebar + map. Updates instantly as the user
  // drags the time slider — no extra API calls.
  const openPlaces = useMemo(
    () =>
      places
        .filter((place) => isOpenAtHour(place, hour))
        .map((place) => ({
          ...place,
          openNow: true,
          visibility: 1,
        })),
    [places, hour],
  );

  const openDirectMatches = useMemo(
    () => openPlaces.filter((place) => matchesPlaceSearch(place, normalizedQuery)),
    [openPlaces, normalizedQuery],
  );

  const openNearestFromSearch = useMemo(() => {
    if (!searchCenter) return [] as RankedPlace[];
    return [...openPlaces]
      .map((place) => ({
        place,
        distance: haversineKm(
          searchCenter.lat,
          searchCenter.lng,
          place.coordinates.lat,
          place.coordinates.lng,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.place);
  }, [openPlaces, searchCenter]);

  const visiblePlaces = useMemo(() => {
    if (openDirectMatches.length > 0) {
      return interleaveByCity(openDirectMatches, 18);
    }

    if (searchCenter) {
      return openNearestFromSearch.slice(0, 18);
    }

    return interleaveByCity(openPlaces, 18);
  }, [openDirectMatches, openNearestFromSearch, openPlaces, searchCenter]);

  const mapPlaces = useMemo(() => {
    if (normalizedQuery) {
      return visiblePlaces;
    }
    return openPlaces;
  }, [normalizedQuery, openPlaces, visiblePlaces]);

  useEffect(() => {
    if (!selectedPlaceId) {
      return;
    }

    // Deselect if the place no longer exists in the loaded dataset
    // OR is no longer open at the current time.
    const place = places.find((p) => p.id === selectedPlaceId);
    if (!place || !isOpenAtHour(place, hour)) {
      setSelectedPlaceId(null);
    }
  }, [places, selectedPlaceId, hour]);

  const selectedPlace = useMemo(
    () => openPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [openPlaces, selectedPlaceId],
  );

  const focusCoordinates =
    selectedPlace?.coordinates ??
    searchCenter ??
    userLocation ??
    null;

  const viewportKey = selectedPlaceId
    ? "selected:" + selectedPlaceId
    : focusCoordinates
      ? "search:" + focusCoordinates.lng.toFixed(3) + ":" + focusCoordinates.lat.toFixed(3) + ":" + recenterCount
      : normalizedQuery
        ? "query:" + normalizedQuery
        : "explore";

  let rawDarkness = 0;
  if (timeValue <= 7) {
    rawDarkness = clamp(1 - (timeValue - 5) / 2, 0, 1);
  } else if (timeValue >= 16.5) {
    rawDarkness = clamp((timeValue - 16.5) / 2, 0, 1);
  }
  
  const uiDarkness = rawDarkness;
  const uiCurve = uiDarkness;

  // Memoize all color computations — these only depend on uiCurve which
  // changes slowly as timeValue moves across dawn/dusk boundaries.
  // Panel / surface backgrounds use a simple dark-or-light toggle so text
  // is always legible regardless of what the map looks like underneath.
  const uiColors = useMemo(() => {
    const c = uiCurve;
    const dark = c > 0.5;
    return {
      inputText: mixHex("#0F172A", "#FFFFFF", c),
      uiHeadingText: rgbaFromHex(mixHex("#0F172A", "#FFFFFF", c), 0.85),
      uiMutedText: rgbaFromHex(mixHex("#475569", "#A5B4FC", c), 0.85),
      inputPlaceholder: rgbaFromHex(mixHex("#334155", "#C7D2FE", c), 0.65),
      inputBorder: rgbaFromHex(mixHex("#334155", "#6366F1", c), dark ? 0.35 : 0.16),
      // Enough opacity so item cards are always readable
      inputSurface: dark ? "rgba(12, 14, 30, 0.82)" : "rgba(255, 255, 255, 0.86)",
      // Search / time header panels
      searchSurface: dark ? "rgba(10, 12, 28, 0.86)" : "rgba(255, 255, 255, 0.88)",
      timeSurface: dark ? "rgba(10, 12, 28, 0.86)" : "rgba(255, 255, 255, 0.88)",
      // Main place-list panel — solid enough to guarantee text contrast
      panelSurface: dark ? "rgba(8, 10, 24, 0.90)" : "rgba(248, 250, 255, 0.92)",
      disabledText: rgbaFromHex(mixHex("#475569", "#818CF8", c), 0.5),
    };
  }, [uiCurve]);
  const { inputText, uiHeadingText, uiMutedText, inputPlaceholder, inputBorder, inputSurface, searchSurface, timeSurface, panelSurface, disabledText } = uiColors;
  const searchHint =
    shouldGeocode && searchLookupState === "searching"
      ? `Searching "${queryText}"...`
      : shouldGeocode && searchPlaceName
        ? "Showing nearest places to " + searchPlaceName
        : shouldGeocode && searchLookupState === "failed"
          ? mapboxToken
            ? `Couldn't locate "${queryText}". Try another city or move the map and tap "Load here".`
            : "Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable city search."
          : null;
  const areaHint =
    !normalizedQuery && activeBbox
      ? "Showing places in the current map area."
      : null;
  const loadHint =
    placesLoadState === "loading" && places.length === 0
      ? "Searching restaurants and entertainment nearby..."
      : placesLoadState === "failed"
        ? mapboxToken
          ? "Move the map and tap \"Load here\" to discover venues."
          : "Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to discover places."
        : null;

  const handleRecenter = useCallback(() => {
    if (!userLocation) return;
    setSelectedPlaceId(null);
    setSearchCenter(userLocation);
    setActiveBbox(bboxAroundCenter(userLocation, 2));
    setRecenterCount((c) => c + 1);
  }, [userLocation]);

  return (
    <main ref={mainRef} className="relative h-screen w-full overflow-hidden font-body">
      <MapCanvas
        theme={theme}
        timeValue={timeValue}
        places={mapPlaces}
        hoveredPlaceId={hoveredPlaceId}
        selectedPlaceId={selectedPlaceId}
        focusCoordinates={focusCoordinates}
        userLocation={userLocation}
        viewportKey={viewportKey}
        onSelectPlace={setSelectedPlaceId}
        onDeselectPlace={useCallback(() => setSelectedPlaceId(null), [])}
        onRecenter={handleRecenter}
        onViewportChange={handleViewportChange}
      />
      <ThemeTransitionLayer timeValue={timeValue} />

      {/* ── UI panels: flex-col on mobile, 3-col grid on desktop ─────────────
          Grid columns: [search 26rem] [time flexible] [places 22rem]
          On mobile they stack vertically; aside gets a max-height cap + scroll.
          Nothing overlaps because absolute positioning is removed from children. */}
      <div className={`pointer-events-none absolute inset-0 z-20 flex flex-col gap-2 p-3 md:grid md:grid-rows-[auto_1fr] md:gap-3 md:p-6 transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] ${sidebarCollapsed ? 'md:grid-cols-[minmax(min-content,26rem)_1fr_1.25rem]' : 'md:grid-cols-[minmax(min-content,26rem)_1fr_22rem]'}`}>

        {/* ── Search ── col 1 / row 1 on desktop; first in flow on mobile ── */}
        <div className="pointer-events-auto md:col-start-1 md:row-start-1">
          <div
            className="rounded-xl border px-3 py-2 shadow-atmosphere backdrop-blur-md transition-[background,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.22,0.72,0.2,1)]"
            style={{
              borderColor: inputBorder,
              background: searchSurface,
            }}
          >
            <p
              className="font-display text-[10px] uppercase tracking-[0.2em] transition-colors duration-700"
              style={{ color: uiHeadingText }}
            >
              AfterDark
            </p>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                placeholder="Search city, neighborhood, or place"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{
                  color: inputText,
                  transition: "color 650ms cubic-bezier(0.22,0.72,0.2,1)",
                }}
              />
              <button
                type="button"
                onClick={handleLoadHere}
                disabled={!canLoadHere}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition disabled:cursor-not-allowed"
                style={{
                  borderColor: canLoadHere ? themeMeta.glow : inputBorder,
                  color: canLoadHere ? inputText : disabledText,
                  backgroundColor: canLoadHere ? inputSurface : "transparent",
                  boxShadow: canLoadHere ? "0 0 12px " + themeMeta.glow + "33" : "none",
                }}
              >
                Load here
              </button>
            </div>
            <style jsx>{`
              input::placeholder {
                color: ${inputPlaceholder};
              }
            `}</style>
          </div>
        </div>

        {/* ── Time ── col 2 / row 1 on desktop; second in flow on mobile ── */}
        <div className={`pointer-events-auto md:col-start-2 md:row-start-1 relative ${timeBarCollapsed ? '-mt-3 md:-mt-6' : ''}`}>
          <div
            className={`rounded-xl border px-3 py-2 shadow-atmosphere backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] md:max-w-[28rem] md:mx-auto origin-top ${timeBarCollapsed ? 'opacity-0 -translate-y-full scale-y-0 max-h-0 overflow-hidden pointer-events-none' : 'opacity-100 translate-y-0 scale-y-100 max-h-[500px]'}`}
            style={{
              borderColor: inputBorder,
              background: timeSurface,
            }}
          >
            <div className="flex items-center justify-between text-[11px] font-medium transition-colors duration-700" style={{ color: inputText, textShadow: uiCurve > 0.5 ? `0 0 8px ${themeMeta.glow}50` : 'none' }}>
              <span className="uppercase tracking-[0.1em]">Time</span>
              <span ref={timeDisplayRef} className="tracking-wider">{to24HourLabel(timeValue)}</span>
            </div>
            <input
              aria-label="Time of day"
              type="range"
              min={TIME_RANGE_START}
              max={TIME_RANGE_END}
              step={0.25}
              defaultValue={timeValue}
              onChange={(event) => handleTimeChange(Number(event.target.value))}
              className="mt-1.5 h-1.5 w-full cursor-ew-resize rounded-full appearance-none bg-black/20"
              style={{
                accentColor: themeMeta.glow,
                touchAction: "none",
              }}
            />
            <div className="mt-1 grid grid-cols-6 text-[9px] font-medium tracking-wider">
              {TIME_MARKERS.map((marker) => {
                const active = Math.abs(marker - timeValue) < 1;
                return (
                  <span key={marker} className="text-center transition-colors duration-300" style={{ 
                    color: active && uiCurve > 0.5 ? "#FFFFFF" : uiMutedText,
                    textShadow: active && uiCurve > 0.5 ? `0 0 6px ${themeMeta.glow}` : "none"
                  }}>
                    {to24HourLabel(marker).replace(":00 ", "")}
                  </span>
                );
               })}
            </div>
            {activeBbox ? (
              <div className="mt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleClearArea}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition hover:opacity-90"
                  style={{
                    borderColor: inputBorder,
                    color: inputText,
                    backgroundColor: inputSurface,
                  }}
                >
                  Reset area
                </button>
              </div>
            ) : null}
          </div>
          {/* ── Time bar collapse toggle (attached below the panel) ── */}
          <div className="flex justify-center md:max-w-[28rem] md:mx-auto">
            <button
              type="button"
              onClick={() => setTimeBarCollapsed((v) => !v)}
              aria-label={timeBarCollapsed ? "Expand time bar" : "Collapse time bar"}
              className="pointer-events-auto flex h-4 w-8 items-center justify-center rounded-b-md border border-t-0 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,0.72,0.2,1)] hover:h-5"
              style={{
                borderColor: inputBorder,
                background: panelSurface,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="none"
                stroke={inputText}
                strokeWidth="2"
                strokeLinecap="round"
                className={`h-3 w-3 transition-transform duration-300 ${timeBarCollapsed ? 'rotate-180' : ''}`}
              >
                <polyline points="4 6 8 10 12 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Places ── col 3 / rows 1-2 (full height) on desktop;
              last in flow on mobile with max-height cap so map stays visible ── */}
        <div className="md:col-start-3 md:row-start-1 md:row-span-2 flex min-h-0 md:-mr-6">
          {/* ── Sidebar collapse toggle (tab flush with panel's left edge) ── */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`pointer-events-auto shrink-0 flex w-5 items-center justify-center self-start mt-3 h-10 rounded-l-lg border border-r-0 backdrop-blur-md transition-[width] duration-300 ease-[cubic-bezier(0.22,0.72,0.2,1)] hover:w-6`}
            style={{
              borderColor: inputBorder,
              background: panelSurface,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="none"
              stroke={inputText}
              strokeWidth="2"
              strokeLinecap="round"
              className={`h-3 w-3 transition-transform duration-500 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            >
              <polyline points="10 4 6 8 10 12" />
            </svg>
          </button>
          <aside
            className={`min-h-0 min-w-0 flex-1 ease-[cubic-bezier(0.22,0.72,0.2,1)] ${
              sidebarCollapsed
                ? 'opacity-0 pointer-events-none max-h-0 overflow-hidden md:max-h-none md:translate-x-3 transition-[opacity,transform] duration-200'
                : 'pointer-events-auto opacity-100 max-h-[42vh] overflow-y-auto md:max-h-none md:translate-x-0 md:pr-6 transition-[opacity,transform] duration-500 delay-150'
            }`}
            style={{ contain: "content" }}
          >
            <div
              className="rounded-2xl border p-2 shadow-[0_14px_40px_rgba(4,8,18,0.44)] backdrop-blur-md transition-[background,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.22,0.72,0.2,1)]"
              style={{
                borderColor: inputBorder,
                background: panelSurface,
              }}
            >
            {searchHint ? (
              <p className="mb-2 px-1 text-[11px]" style={{ color: uiMutedText }}>
                {searchHint}
              </p>
            ) : null}
            {!searchHint && areaHint ? (
              <p className="mb-2 px-1 text-[11px]" style={{ color: uiMutedText }}>
                {areaHint}
              </p>
            ) : null}
            {loadHint ? (
              <p className="mb-2 px-1 text-[11px]" style={{ color: uiMutedText }}>
                {loadHint}
              </p>
            ) : null}

            <div className="space-y-1">
              {visiblePlaces.length === 0 ? (
                <AnimatePresence initial={false}>
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.24, ease: [0.22, 0.72, 0.2, 1] }}
                    className="rounded-xl border p-3 text-sm"
                    style={{
                      borderColor: inputBorder,
                      backgroundColor: inputSurface,
                      color: inputText,
                    }}
                  >
                    No places open at this time. Try adjusting the time slider.
                  </motion.div>
                </AnimatePresence>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {groupPlacesByCategory(visiblePlaces).map(({ category, places: catPlaces }) => (
                    <motion.div
                      key={category}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.3, ease: [0.22, 0.72, 0.2, 1] }}
                    >
                    <p
                      className="px-1 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.22em]"
                      style={{ color: uiMutedText }}
                    >
                      {category}
                    </p>
                    <div className="space-y-1.5">
                      <AnimatePresence initial={false} mode="popLayout">
                        {catPlaces.map((place, index) => (
                          <motion.div
                            key={place.id}
                            layout
                            initial={{ opacity: 0, scale: 0.92, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: -8 }}
                            transition={{
                              duration: 0.32,
                              delay: Math.min(index * 0.018, 0.12),
                              ease: [0.22, 0.72, 0.2, 1],
                              layout: { duration: 0.28, ease: [0.22, 0.72, 0.2, 1] },
                            }}
                          >
                            <PlaceCard
                              place={place}
                              timeValue={timeValue}
                              active={place.id === selectedPlaceId || place.id === hoveredPlaceId}
                              onHover={setHoveredPlaceId}
                              onSelect={setSelectedPlaceId}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
              )}
            </div>
            </div>
          </aside>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: themeVisual.gradient,
          mixBlendMode: "overlay",
          opacity: 0.14,
        }}
      />
    </main>
  );
}
