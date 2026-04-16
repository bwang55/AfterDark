"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import mapboxgl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LngLatLike,
  type Map,
} from "mapbox-gl";

import {
  PLACE_ACTIVE_LAYER_ID,
  PLACE_GLOW_LAYER_ID,
  PLACE_LAYER_ID,
  PLACE_PULSE_LAYER_ID,
  PLACE_SOURCE_ID,
  placesToGeoJson,
} from "@/lib/map";
import { interpolateThemeVisual } from "@/shared/time-theme";
import type { RankedPlace, TimeTheme } from "@/shared/types";
import { clamp, lerp, mixHex } from "@/shared/utils";
import { useAppStore } from "@/store/useAppStore";

interface MapCanvasProps {
  theme: TimeTheme;
  timeValue: number;
  places: RankedPlace[];
  hoveredPlaceId: string | null;
  selectedPlaceId: string | null;
  focusCoordinates: { lng: number; lat: number } | null;
  userLocation: { lng: number; lat: number } | null;
  viewportKey: string;
  onSelectPlace: (id: string) => void;
  onDeselectPlace: () => void;
  onRecenter: () => void;
  onViewportChange?: (payload: {
    bbox: [number, number, number, number];
    center: { lng: number; lat: number };
    zoom: number;
  }) => void;
}

function pointPaintForTime(timeValue: number): {
  pointColor: string;
  glowColor: string;
  activeColor: string;
} {
  const clamped = clamp(timeValue, 6, 30);

  if (clamped <= 14) {
    const t = (clamped - 6) / 8;
    return {
      pointColor: mixHex("#F5B971", "#FF8A4C", t),
      glowColor: mixHex("#FDE6BA", "#FFD5B7", t),
      activeColor: mixHex("#F5B971", "#FF8A4C", t),
    };
  }

  if (clamped <= 18) {
    const t = (clamped - 14) / 4;
    return {
      pointColor: mixHex("#FF8A4C", "#FBCFE8", t),
      glowColor: mixHex("#FFD5B7", "#C084FC", t),
      activeColor: mixHex("#FF8A4C", "#F472B6", t),
    };
  }

  const t = (clamped - 18) / 12;
  return {
    // At night use bright near-white so pins pop against the dark basemap
    pointColor: mixHex("#FBCFE8", "#E8FBFF", t),
    glowColor: mixHex("#C084FC", "#22D3EE", t),
    activeColor: mixHex("#F472B6", "#67E8F9", t),
  };
}

function tintOpacityForTime(timeValue: number): number {
  const clamped = clamp(timeValue, 6, 30);

  // Stronger tint in early morning for cozy warmth
  if (clamped <= 10) {
    return lerp(0.20, 0.24, (clamped - 6) / 4);
  }
  if (clamped <= 14) {
    return lerp(0.24, 0.16, (clamped - 10) / 4);
  }
  if (clamped <= 18) {
    return lerp(0.18, 0.23, (clamped - 14) / 4);
  }
  if (clamped <= 22) {
    return lerp(0.23, 0.19, (clamped - 18) / 4);
  }
  return lerp(0.19, 0.16, (clamped - 22) / 8);
}

function getEmptyGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: [],
  };
}

function pulseRadiusExpression(radiusBoost: number): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    7 + radiusBoost,
    14,
    13.5 + radiusBoost,
  ] as ExpressionSpecification;
}

function pulseOpacityExpression(alpha: number): ExpressionSpecification {
  // Use a high minimum so pulses stay visible on dark basemap
  return ["max", alpha * 0.55, ["*", alpha, ["coalesce", ["get", "visibility"], 0.7]]] as ExpressionSpecification;
}

function ensurePlaceLayers(map: Map, mobile = false): void {
  if (!map.getSource(PLACE_SOURCE_ID)) {
    map.addSource(PLACE_SOURCE_ID, {
      type: "geojson",
      data: getEmptyGeoJson(),
    });
  }

  // Open-only filter — glow & pulse never touch closed venues, making the
  // open/closed distinction immediate at a glance.
  const openOnlyFilter: FilterSpecification = [
    "==",
    ["get", "openNow"],
    1,
  ];

  // Mobile: skip pulse layer entirely — saves one full circle layer of GPU work
  if (!mobile && !map.getLayer(PLACE_PULSE_LAYER_ID)) {
    map.addLayer({
      id: PLACE_PULSE_LAYER_ID,
      type: "circle",
      source: PLACE_SOURCE_ID,
      layout: { "circle-sort-key": 0 },
      filter: openOnlyFilter,
      paint: {
        "circle-radius": pulseRadiusExpression(0.8),
        "circle-color": "#A5F3FC",
        "circle-opacity": pulseOpacityExpression(0.2),
        "circle-blur": 0.86,
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "viewport",
        "circle-radius-transition": { duration: 260, delay: 0 },
        "circle-opacity-transition": { duration: 260, delay: 0 },
      },
    });
  }

  if (!map.getLayer(PLACE_GLOW_LAYER_ID)) {
    map.addLayer({
      id: PLACE_GLOW_LAYER_ID,
      type: "circle",
      source: PLACE_SOURCE_ID,
      layout: { "circle-sort-key": 0 },
      filter: openOnlyFilter,
      paint: {
        // Mobile: smaller radius + less blur = cheaper GPU fill
        "circle-radius": mobile
          ? ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10]
          : ["interpolate", ["linear"], ["zoom"], 8, 7.8, 14, 17.5],
        "circle-color": "#22D3EE",
        "circle-opacity": mobile
          ? 0.3
          : ["max", 0.38, ["*", 0.55, ["coalesce", ["get", "visibility"], 0.8]]],
        "circle-blur": mobile ? 0.5 : 0.9,
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "viewport",
        "circle-opacity-transition": { duration: 360, delay: 0 },
        "circle-color-transition": { duration: 380, delay: 0 },
      },
    });
  }

  if (!map.getLayer(PLACE_LAYER_ID)) {
    map.addLayer({
      id: PLACE_LAYER_ID,
      type: "circle",
      source: PLACE_SOURCE_ID,
      layout: { "circle-sort-key": 0 },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3.6, 14, 6.2],
        "circle-color": "#22D3EE",
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "rgba(255,255,255,0.96)",
        // Closed venues read as "still there, but quiet" — same dot, just faded.
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "openNow"], 1],
          ["max", 0.72, ["*", 0.92, ["coalesce", ["get", "visibility"], 0.8]]],
          0.35,
        ],
        "circle-opacity": [
          "case",
          ["==", ["get", "openNow"], 1],
          ["max", 0.68, ["coalesce", ["get", "visibility"], 0.8]],
          0.28,
        ],
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "viewport",
        "circle-opacity-transition": { duration: 360, delay: 0 },
        "circle-color-transition": { duration: 380, delay: 0 },
        "circle-stroke-opacity-transition": { duration: 360, delay: 0 },
      },
    });
  }

  if (!map.getLayer(PLACE_ACTIVE_LAYER_ID)) {
    map.addLayer({
      id: PLACE_ACTIVE_LAYER_ID,
      type: "circle",
      source: PLACE_SOURCE_ID,
      layout: { "circle-sort-key": 0 },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 16],
        "circle-color": "#8B5CF6",
        "circle-blur": 0.7,
        "circle-opacity": 0.36,
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "viewport",
        "circle-opacity-transition": { duration: 220, delay: 0 },
        "circle-blur-transition": { duration: 600, delay: 0 },
      },
      filter: ["==", ["get", "id"], "__none__"],
    });
  }
}

// A slow bloom on the active layer when a place is selected. The ring eases
// up to peak, then settles over ~1s — reads as "the frame breathing around
// the subject" rather than a hard flash. Pure paint-prop, no new layers.
function triggerBloomPulse(map: Map): void {
  if (!map.getLayer(PLACE_ACTIVE_LAYER_ID)) return;
  try {
    // Ensure long, gentle transitions both directions so the peak feels lifted,
    // not snapped. These are idempotent — set once per pulse.
    map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-opacity-transition", {
      duration: 420,
      delay: 0,
    });
    map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-blur-transition", {
      duration: 520,
      delay: 0,
    });
    map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-opacity", 0.86);
    map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-blur", 1.6);
    window.setTimeout(() => {
      if (!map.getLayer(PLACE_ACTIVE_LAYER_ID)) return;
      try {
        // Slightly slower release than attack — the hallmark of "premium" UI motion.
        map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-opacity-transition", {
          duration: 640,
          delay: 0,
        });
        map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-blur-transition", {
          duration: 780,
          delay: 0,
        });
        map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-opacity", 0.36);
        map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-blur", 0.7);
      } catch {
        /* map torn down mid-flight */
      }
    }, 460);
  } catch {
    /* layer missing / style still loading */
  }
}

function applyActiveFilter(
  map: Map,
  hoveredPlaceId: string | null,
  selectedPlaceId: string | null,
): void {
  if (!map.getLayer(PLACE_ACTIVE_LAYER_ID)) {
    return;
  }

  const ids = [hoveredPlaceId, selectedPlaceId].filter(
    (value): value is string => Boolean(value),
  );

  if (ids.length === 0) {
    const emptyFilter: FilterSpecification = ["==", ["get", "id"], "__none__"];
    map.setFilter(PLACE_ACTIVE_LAYER_ID, emptyFilter);
    return;
  }

  const activeFilter: FilterSpecification = [
    "in",
    ["get", "id"],
    ["literal", ids],
  ];
  map.setFilter(PLACE_ACTIVE_LAYER_ID, activeFilter);
}

function resolveLightPreset(timeValue: number): string {
  // Normalize: 0-5 is late night (same as 24-29)
  const t = timeValue < 6 ? timeValue + 24 : timeValue;
  if (t >= 22 || t < 6) return "night";
  if (t < 10) return "dawn";
  if (t < 17.5) return "day";
  if (t < 19) return "dusk";
  return "night";
}

// Debounced lightPreset updater — prevents rapid style.load events during
// time scrubbing which cause terrain to re-add and the map to "jump in place".
let _presetTimer: ReturnType<typeof setTimeout> | null = null;

function applyTheme(map: Map, timeValue: number): void {
  const quantizedTime = Math.round(timeValue * 2) / 2;
  const pointPaint = pointPaintForTime(quantizedTime);

  // Debounce lightPreset changes: only apply after 400ms of no time changes.
  // This prevents style.load spam during continuous scrolling.
  const desiredPreset = resolveLightPreset(timeValue);
  if (_presetTimer) clearTimeout(_presetTimer);
  _presetTimer = setTimeout(() => {
    try {
      const currentPreset = map.getConfigProperty("basemap", "lightPreset");
      if (currentPreset !== desiredPreset) {
        map.setConfigProperty("basemap", "lightPreset", desiredPreset);
      }
    } catch {
      // Style not ready or API unavailable
    }
  }, 400);

  // Always apply point colors immediately — setPaintProperty is cheap
  // and doesn't trigger style.load.
  if (map.getLayer(PLACE_PULSE_LAYER_ID)) {
    map.setPaintProperty(PLACE_PULSE_LAYER_ID, "circle-color", pointPaint.glowColor);
  }

  if (map.getLayer(PLACE_LAYER_ID)) {
    map.setPaintProperty(PLACE_LAYER_ID, "circle-color", pointPaint.pointColor);
  }

  if (map.getLayer(PLACE_GLOW_LAYER_ID)) {
    map.setPaintProperty(PLACE_GLOW_LAYER_ID, "circle-color", pointPaint.glowColor);
  }

  if (map.getLayer(PLACE_ACTIVE_LAYER_ID)) {
    map.setPaintProperty(PLACE_ACTIVE_LAYER_ID, "circle-color", pointPaint.activeColor);
  }
}

// ── 3D clip: only render detailed 3D models in a ~2km diameter around center ──
// Mapbox Standard style's show3dObjects renders ALL 3D landmarks + buildings
// across the entire viewport. We keep show3dObjects ON for full-fidelity models,
// but add a "clip" layer that restricts rendering to a small circle around the
// camera center. Features outside the clip are NOT rendered (real GPU savings,
// not just visual masking).
const CLIP_SOURCE = "clip-area-src";
const CLIP_LAYER = "center-3d-clip";
const CLIP_RADIUS_DEG = 0.005; // ~500m radius → 1km diameter at mid-latitudes

function clipCircleGeoJson(center: { lng: number; lat: number }) {
  // The clip layer REMOVES content inside its polygon.
  // To keep only the center area, we create a world-covering polygon
  // with a hole (donut) — everything outside the hole gets clipped away.
  const r = CLIP_RADIUS_DEG;
  const N = 16;

  // Outer ring: entire world (counterclockwise)
  const world: [number, number][] = [
    [-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85],
  ];

  // Inner ring (hole): center circle, clockwise winding
  const hole: [number, number][] = [];
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * 2 * Math.PI;
    hole.push([
      center.lng + r * Math.cos(a),
      center.lat + r * 0.82 * Math.sin(a),
    ]);
  }

  return {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [world, hole] },
      properties: {},
    }],
  };
}

// GeoJSON that clips EVERYTHING (no hole) → fully flat map
function clipFullWorldGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: [{
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]]],
      },
      properties: {},
    }],
  };
}

function ensureClipLayer(map: Map): void {
  if (!map.getSource(CLIP_SOURCE)) {
    // Start with full-world clip (flat) — will switch to donut at high zoom
    map.addSource(CLIP_SOURCE, {
      type: "geojson",
      data: clipFullWorldGeoJson(),
    });
  }
  if (!map.getLayer(CLIP_LAYER)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map.addLayer as any)({
      id: CLIP_LAYER,
      type: "clip",
      source: CLIP_SOURCE,
      layout: { "clip-layer-types": ["model", "symbol"] },
    });
  }
}

// Switch clip data based on zoom:
// zoom < 15.5 → full world clip → all 3D removed → flat
// zoom ≥ 15.5 → donut clip → only center ~1km has 3D
function updateClipForCamera(map: Map): void {
  const src = map.getSource(CLIP_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  if (map.getZoom() < 15.5) {
    src.setData(clipFullWorldGeoJson());
  } else {
    src.setData(clipCircleGeoJson(map.getCenter()));
  }
}


const USER_LOCATION_SOURCE = "user-location-source";
const USER_LOCATION_LAYER = "user-location-dot";
const USER_LOCATION_HALO_LAYER = "user-location-halo";

function ensureUserLocationLayers(map: Map): void {
  if (!map.getSource(USER_LOCATION_SOURCE)) {
    map.addSource(USER_LOCATION_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(USER_LOCATION_HALO_LAYER)) {
    map.addLayer({
      id: USER_LOCATION_HALO_LAYER,
      type: "circle",
      source: USER_LOCATION_SOURCE,
      paint: {
        "circle-radius": 14,
        "circle-color": "#4285F4",
        "circle-opacity": 0.18,
        "circle-blur": 0.6,
        "circle-emissive-strength": 1,
      },
    });
  }
  if (!map.getLayer(USER_LOCATION_LAYER)) {
    map.addLayer({
      id: USER_LOCATION_LAYER,
      type: "circle",
      source: USER_LOCATION_SOURCE,
      paint: {
        "circle-radius": 6,
        "circle-color": "#4285F4",
        "circle-opacity": 1,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-opacity": 1,
        "circle-emissive-strength": 1,
      },
    });
  }
}

function updateUserLocationDot(
  map: Map,
  location: { lng: number; lat: number } | null,
): void {
  const source = map.getSource(USER_LOCATION_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  if (!location) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [location.lng, location.lat] },
        properties: {},
      },
    ],
  });
}

const MapCanvasInner = function MapCanvas({
  theme,
  timeValue,
  places,
  hoveredPlaceId,
  selectedPlaceId,
  focusCoordinates,
  userLocation,
  viewportKey,
  onSelectPlace,
  onDeselectPlace,
  onViewportChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const placesRef = useRef<RankedPlace[]>(places);
  const timeValueRef = useRef<number>(timeValue);
  const hoveredRef = useRef<string | null>(hoveredPlaceId);
  const selectedRef = useRef<string | null>(selectedPlaceId);
  const userLocationRef = useRef(userLocation);
  const viewportChangeRef = useRef<MapCanvasProps["onViewportChange"]>(onViewportChange);
  const lastViewportKeyRef = useRef<string | null>(null);
  const mobileRef = useRef(false);
  const pulseFrameRef = useRef<number | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const popupCloseHandler = useCallback(() => {
    onDeselectPlaceRef.current();
  }, []);
  const onDeselectPlaceRef = useRef(onDeselectPlace);
  const [mapEnabled, setMapEnabled] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLayers] = useState({
    roadLabels: true,
    placeLabels: true,
    poiLabels: false,
    transitLabels: false,
    buildings3d: true,
  });
  const prevLayersRef = useRef(mapLayers);
  const mapLayersRef = useRef(mapLayers);
  const orbitFrameRef = useRef<number | null>(null);
  const orbitActiveRef = useRef(false);

  // ── Store-driven map controls ──
  const storeBuildings3d = useAppStore((s) => s.buildings3d);
  const storeShowPoiLabels = useAppStore((s) => s.showPoiLabels);
  const storeMapPitch = useAppStore((s) => s.mapPitch);
  const storeResetNorthCount = useAppStore((s) => s.resetNorthCount);
  const setStoreMapPitch = useAppStore((s) => s.setMapPitch);
  const storeWalkingCircles = useAppStore((s) => s.walkingCircles);
  const storeViewMode = useAppStore((s) => s.viewMode);
  const storeCinemaMode = useAppStore((s) => s.cinemaMode);

  // ── Cinema (immersive) mode orbit — separate from selection orbit ──
  const cinemaOrbitFrameRef = useRef<number | null>(null);
  const cinemaOrbitActiveRef = useRef(false);

  const stopCinemaOrbit = useCallback(() => {
    cinemaOrbitActiveRef.current = false;
    if (cinemaOrbitFrameRef.current !== null) {
      cancelAnimationFrame(cinemaOrbitFrameRef.current);
      cinemaOrbitFrameRef.current = null;
    }
  }, []);

  const startCinemaOrbit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    cinemaOrbitActiveRef.current = true;
    const startBearing = map.getBearing();
    const startTime = performance.now();
    const SPEED = 1.3; // deg/s — roughly 2.3× slower than selection orbit
    const tick = () => {
      const m = mapRef.current;
      if (!cinemaOrbitActiveRef.current || !m) return;
      const elapsed = (performance.now() - startTime) / 1000;
      m.setBearing(startBearing - elapsed * SPEED);
      cinemaOrbitFrameRef.current = requestAnimationFrame(tick);
    };
    cinemaOrbitFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopOrbit = useCallback(() => {
    orbitActiveRef.current = false;
    if (orbitFrameRef.current !== null) {
      cancelAnimationFrame(orbitFrameRef.current);
      orbitFrameRef.current = null;
    }
    // Unfreeze popup — restore Mapbox-managed positioning
    const popupEl = popupRef.current?.getElement();
    if (popupEl) {
      popupEl.style.position = "";
      popupEl.style.left = "";
      popupEl.style.top = "";
      popupEl.style.transform = "";
    }
  }, []);

  const startOrbit = useCallback(
    (center: [number, number], placeId: string) => {
      const map = mapRef.current;
      if (!map) return;
      stopOrbit();
      orbitActiveRef.current = true;

      // Freeze popup position during orbit to prevent terrain-induced jitter.
      // Snapshot its current screen rect and lock it with CSS.
      const popup = popupRef.current;
      const popupEl = popup?.getElement();
      if (popupEl) {
        const rect = popupEl.getBoundingClientRect();
        popupEl.style.position = "fixed";
        popupEl.style.left = `${rect.left}px`;
        popupEl.style.top = `${rect.top}px`;
        popupEl.style.transform = "none";
      }

      // Lock camera center once at orbit start, then only rotate bearing each
      // frame. setBearing is far lighter than jumpTo (no center re-projection,
      // no terrain resampling), which keeps the orbit smooth even with 3D
      // buildings + high pitch.
      map.setCenter(center);
      const startBearing = map.getBearing();
      const startTime = performance.now();
      const SPEED = 3;
      const tick = () => {
        const m = mapRef.current;
        if (!orbitActiveRef.current || !m) return;
        if (selectedRef.current !== placeId) {
          stopOrbit();
          return;
        }
        const elapsed = (performance.now() - startTime) / 1000;
        m.setBearing(startBearing - elapsed * SPEED);
        orbitFrameRef.current = requestAnimationFrame(tick);
      };
      orbitFrameRef.current = requestAnimationFrame(tick);
    },
    [stopOrbit],
  );

  const mapTint = interpolateThemeVisual(timeValue).gradient;
  const mapTintOpacity = tintOpacityForTime(timeValue);

  // Compute a "sun position" that sweeps across the map overlay as time changes.
  // Morning: top-left → Afternoon: top-center → Dusk: right → Night: below horizon.
  // Pure CSS radial gradient — runs entirely on the compositor, zero main-thread cost.
  const sunProgress = clamp((timeValue - 6) / 24, 0, 1); // 0=6AM, 1=6AM+24
  const sunX = lerp(15, 85, Math.min(sunProgress * 1.6, 1));      // left→right arc
  const sunY = Math.max(5, 30 - 25 * Math.sin(sunProgress * Math.PI)); // rises then sets
  const sunIntensity = (() => {
    // Stronger glow in morning for that cozy, lazy feel
    if (timeValue <= 7) return lerp(0.08, 0.22, (timeValue - 6) / 1);
    if (timeValue <= 10) return lerp(0.22, 0.20, (timeValue - 7) / 3);
    if (timeValue <= 16) return lerp(0.20, 0.14, (timeValue - 10) / 6);
    if (timeValue <= 19) return lerp(0.14, 0.06, (timeValue - 16) / 3);
    return lerp(0.06, 0.0, clamp((timeValue - 19) / 3, 0, 1));
  })();
  const sunColor = (() => {
    if (timeValue <= 7.5) return "255,195,110";  // deep amber dawn
    if (timeValue <= 10) return "255,210,145";   // warm honey morning
    if (timeValue <= 14) return "255,235,195";   // soft golden midday
    if (timeValue <= 16) return "255,225,175";   // warm afternoon
    if (timeValue <= 19) return "255,170,185";   // rosy dusk
    return "130,155,255";                        // cool moonlight
  })();
  
  // Perfectly smooth multi-hour blend between map overlay modes
  const nightBlendProgress = clamp((timeValue - 17.5) / 3.0, 0, 1);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    timeValueRef.current = timeValue;
  }, [timeValue]);

  useEffect(() => {
    hoveredRef.current = hoveredPlaceId;
    selectedRef.current = selectedPlaceId;
  }, [hoveredPlaceId, selectedPlaceId]);

  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    onDeselectPlaceRef.current = onDeselectPlace;
  }, [onDeselectPlace]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setMapEnabled(false);
      return;
    }

    mapboxgl.accessToken = token;

    // Detect mobile/low-power devices for aggressive perf tuning
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

    let map: Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: [-71.4128, 41.824],
        zoom: 15.5,
        pitch: isMobile ? 45 : 72,
        bearing: -8,
        maxPitch: isMobile ? 55 : 78,
        // Lower maxZoom = fewer detailed tiles = fewer 3D models loaded
        maxZoom: isMobile ? 17.5 : 20,
        attributionControl: false,
        antialias: !isMobile,
        fadeDuration: 0,
        maxTileCacheSize: isMobile ? 20 : 80,
        renderWorldCopies: false,
      });
      mobileRef.current = isMobile;
    } catch (err) {
      console.error("[MapCanvas] Failed to initialize map:", err);
      setMapEnabled(false);
      return;
    }

    mapRef.current = map;

    const emitViewport = () => {
      if (orbitActiveRef.current) return;
      const callback = viewportChangeRef.current;
      if (!callback) {
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) {
        return;
      }
      const center = map.getCenter();
      callback({
        bbox: [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ],
        center: { lng: center.lng, lat: center.lat },
        zoom: map.getZoom(),
      });
    };

    const syncCustomLayers = () => {
      const mobile = mobileRef.current;
      ensurePlaceLayers(map, mobile);
      ensureUserLocationLayers(map);
      ensureClipLayer(map);

      // Restore 3D terrain (lost on style.load).
      // Start with exaggeration 0 so there's no visual jump while DEM tiles load,
      // then ramp up once the map is idle.
      if (!map.getSource("mapbox-dem")) {
        try {
          map.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: mobile ? 256 : 512,
            maxzoom: mobile ? 11 : 14,
          });
          map.setTerrain({ source: "mapbox-dem", exaggeration: 0.01 });
          map.once("idle", () => {
            try {
              map.setTerrain({ source: "mapbox-dem", exaggeration: mobile ? 2.0 : 3.0 });
            } catch { /* noop */ }
          });
        } catch { /* noop */ }
      }

      const source = map.getSource(PLACE_SOURCE_ID) as GeoJSONSource | undefined;
      if (source) {
        source.setData(placesToGeoJson(placesRef.current));
      }

      // Restore user location blue dot (lost on style.load)
      updateUserLocationDot(map, userLocationRef.current);

      applyTheme(map, timeValueRef.current);
      applyActiveFilter(map, hoveredRef.current, selectedRef.current);
      emitViewport();
    };

    // One-time setup: set label visibility config. These setConfigProperty calls
    // trigger style.load once — that's expected and handled below.
    map.once("load", () => {
      try {
        map.setConfigProperty("basemap", "lightPreset", resolveLightPreset(timeValueRef.current));
        map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
        map.setConfigProperty("basemap", "showTransitLabels", false);
        map.setConfigProperty("basemap", "showRoadLabels", true);
        map.setConfigProperty("basemap", "showPlaceLabels", true);
        // Keep Standard style's full-fidelity 3D objects ON — the clip layer
        // (ensureClipLayer) limits rendering to a ~2km circle around camera center.
        map.setConfigProperty("basemap", "show3dObjects", true);

        // 3D terrain (hills/valleys)
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: isMobile ? 256 : 512,
          maxzoom: isMobile ? 11 : 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: isMobile ? 2.0 : 3.0 });
      } catch { /* noop */ }
      syncCustomLayers();
      setMapLoaded(true);
    });

    // style.load fires after the initial config above, and whenever lightPreset
    // changes. Re-sync custom layers (including our building layer).
    map.on("style.load", () => {
      syncCustomLayers();
      setMapLoaded(true);
    });
    map.on("moveend", emitViewport);

    // Update 3D clip on camera move/zoom — handles both center tracking
    // and early-flatten at low zoom.
    const updateClipArea = () => updateClipForCamera(map);
    map.on("moveend", updateClipArea);

    // Track whether the current click landed on a place pin.
    // Both the layer-specific handler and the generic handler fire
    // synchronously for the same click, so a simple closure flag is enough.
    let placeWasClicked = false;

    map.on("click", PLACE_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id === "string") {
        placeWasClicked = true;
        onSelectPlace(id);
      }
    });

    // Click on empty map → dismiss selection.
    // Guard with the flag so clicking one pin while flying to another
    // doesn't immediately deselect (queryRenderedFeatures is unreliable
    // during active camera animation).
    map.on("click", (event) => {
      if (placeWasClicked) {
        placeWasClicked = false;
        return;
      }
      const features = map.queryRenderedFeatures(event.point, { layers: [PLACE_LAYER_ID] });
      if (features.length === 0) {
        onDeselectPlaceRef.current();
      }
    });

    map.on("mouseenter", PLACE_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", PLACE_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    // Cancel orbit on direct user interaction
    const cancelOrbit = () => {
      if (orbitActiveRef.current) stopOrbit();
    };
    map.on("mousedown", cancelOrbit);
    map.on("touchstart", cancelOrbit);
    map.on("wheel", cancelOrbit);

    setMapEnabled(true);

    return () => {
      stopOrbit();
      if (pulseFrameRef.current !== null) {
        clearTimeout(pulseFrameRef.current);
        pulseFrameRef.current = null;
      }
      map.off("moveend", emitViewport);
      map.off("moveend", updateClipArea);
      map.off("mousedown", cancelOrbit);
      map.off("touchstart", cancelOrbit);
      map.off("wheel", cancelOrbit);
      map.remove();
      mapRef.current = null;
      setMapEnabled(false);
    };
  }, [onSelectPlace, stopOrbit]);

  // Pulse animation — skip entirely on mobile (pulse layer not added)
  useEffect(() => {
    const map = mapRef.current;
    if (!mapEnabled || !map) return;

    // Mobile has no pulse layer — skip the entire animation loop
    const mobile = mobileRef.current;
    if (mobile) return;

    let cancelled = false;
    let isMoving = false;

    const handleMoveStart = () => { isMoving = true; };
    const handleMoveEnd = () => { isMoving = false; };
    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('zoomstart', handleMoveStart);
    map.on('zoomend', handleMoveEnd);

    const animate = () => {
      if (cancelled) return;

      if (!isMoving) {
        const timestamp = performance.now();
        const wave = (Math.sin(timestamp / 620) + 1) / 2;
        const radiusBoost = 0.8 + wave * 1.9;
        const opacity = 0.09 + (1 - wave) * 0.12;

        if (map.getLayer(PLACE_PULSE_LAYER_ID)) {
          const zoom = map.getZoom();
          const zoomT = clamp((zoom - 8) / 6, 0, 1);
          const radius = lerp(7, 13.5, zoomT) + radiusBoost;
          map.setPaintProperty(PLACE_PULSE_LAYER_ID, "circle-radius", radius);
          map.setPaintProperty(PLACE_PULSE_LAYER_ID, "circle-opacity", opacity * 0.75);
        }
      }

      pulseFrameRef.current = window.setTimeout(() => {
        window.requestAnimationFrame(animate);
      }, 250);
    };

    pulseFrameRef.current = window.setTimeout(animate, 200);

    return () => {
      cancelled = true;
      map.off('movestart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      map.off('zoomstart', handleMoveStart);
      map.off('zoomend', handleMoveEnd);
      if (pulseFrameRef.current !== null) {
        clearTimeout(pulseFrameRef.current);
        pulseFrameRef.current = null;
      }
    };
  }, [mapEnabled]);

  // Mark body[data-map-moving] during drag/zoom/rotate/pitch so CSS can strip
  // expensive atmospheric passes (film grain, overlay transitions) during
  // camera motion and restore them on settle.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapEnabled || !map) return;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const markMoving = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      document.body.dataset.mapMoving = "1";
    };
    const markSettled = () => {
      // Small trailing delay so fingers-off-trackpad momentum still counts as moving.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        delete document.body.dataset.mapMoving;
      }, 120);
    };

    map.on("movestart", markMoving);
    map.on("zoomstart", markMoving);
    map.on("rotatestart", markMoving);
    map.on("pitchstart", markMoving);
    map.on("moveend", markSettled);
    map.on("zoomend", markSettled);
    map.on("rotateend", markSettled);
    map.on("pitchend", markSettled);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      map.off("movestart", markMoving);
      map.off("zoomstart", markMoving);
      map.off("rotatestart", markMoving);
      map.off("pitchstart", markMoving);
      map.off("moveend", markSettled);
      map.off("zoomend", markSettled);
      map.off("rotateend", markSettled);
      map.off("pitchend", markSettled);
      delete document.body.dataset.mapMoving;
    };
  }, [mapEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !mapLoaded) {
      return;
    }

    const source = map.getSource(PLACE_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(placesToGeoJson(places));
    }
  }, [places, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }
    updateUserLocationDot(map, userLocation);
  }, [userLocation, mapLoaded]);

  // Popup — show/update when a place is selected, close when deselected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!selectedPlaceId) {
      if (popupRef.current) {
        // Detach close handler before removing so it doesn't trigger deselect
        popupRef.current.off("close", popupCloseHandler);
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    const place = placesRef.current.find((p) => p.id === selectedPlaceId);
    if (!place) return;

    const { lng, lat } = place.coordinates;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&ll=${lat},${lng}`;

    // Build popup DOM — no innerHTML to avoid injection
    const root = document.createElement("div");
    root.className = "ad-popup";

    // Venue photo from Google Places (loaded on demand)
    const imgWrap = document.createElement("div");
    imgWrap.className = "ad-popup__img-wrap";
    const img = document.createElement("img");
    img.alt = place.name;
    img.className = "ad-popup__img";
    img.style.display = "none";
    imgWrap.appendChild(img);
    root.appendChild(imgWrap);

    const photoBase = process.env.NEXT_PUBLIC_PLACE_PHOTO_URL;
    if (photoBase) {
      img.onload = () => {
        img.style.display = "block";
        imgWrap.classList.add("ad-popup__img-wrap--loaded");
      };
      img.onerror = () => {
        imgWrap.remove();
      };
      img.src = `${photoBase}?name=${encodeURIComponent(place.name)}&lat=${lat}&lng=${lng}`;
    } else {
      // No photo backend configured — drop the image slot entirely.
      imgWrap.remove();
    }

    const name = document.createElement("p");
    name.className = "ad-popup__name";
    name.textContent = place.name;
    root.appendChild(name);

    const vibe = document.createElement("p");
    vibe.className = "ad-popup__vibe";
    vibe.textContent = place.vibe;
    root.appendChild(vibe);

    const meta = document.createElement("div");
    meta.className = "ad-popup__meta";

    const hood = document.createElement("span");
    hood.textContent = place.neighborhood;
    meta.appendChild(hood);

    const status = document.createElement("span");
    status.className = place.openNow ? "ad-popup__open" : "ad-popup__closed";
    status.textContent = place.openNow ? "Open" : "Closed";
    meta.appendChild(status);
    root.appendChild(meta);

    const btn = document.createElement("a");
    btn.href = mapsUrl;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.className = "ad-popup__gmaps";
    btn.textContent = "Open in Google Maps ↗";
    root.appendChild(btn);

    // Remove old popup WITHOUT triggering deselect (we're replacing, not closing)
    if (popupRef.current) {
      popupRef.current.off("close", popupCloseHandler);
      popupRef.current.remove();
    }
    popupRef.current = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      anchor: "bottom",
      className: "ad-popup-wrapper",
      maxWidth: "300px",
      offset: 16,
    })
      .setLngLat([lng, lat])
      .setDOMContent(root)
      .addTo(map);

    popupRef.current.on("close", popupCloseHandler);
  }, [selectedPlaceId, mapLoaded, popupCloseHandler]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    applyTheme(map, timeValue);
  }, [theme, timeValue, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    mapLayersRef.current = mapLayers;
    const prev = prevLayersRef.current;
    prevLayersRef.current = mapLayers;
    if (prev === mapLayers) return;
    try {
      if (prev.roadLabels !== mapLayers.roadLabels)
        map.setConfigProperty("basemap", "showRoadLabels", mapLayers.roadLabels);
      if (prev.placeLabels !== mapLayers.placeLabels)
        map.setConfigProperty("basemap", "showPlaceLabels", mapLayers.placeLabels);
      if (prev.poiLabels !== mapLayers.poiLabels)
        map.setConfigProperty("basemap", "showPointOfInterestLabels", mapLayers.poiLabels);
      if (prev.transitLabels !== mapLayers.transitLabels)
        map.setConfigProperty("basemap", "showTransitLabels", mapLayers.transitLabels);
      if (prev.buildings3d !== mapLayers.buildings3d)
        map.setConfigProperty("basemap", "show3dObjects", mapLayers.buildings3d);
    } catch { /* noop */ }
  }, [mapLayers, mapLoaded]);

  // ── 2D / 3D view mode ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const is2d = storeViewMode === "2d";

    if (is2d) {
      map.setMaxPitch(0);
      try { map.setConfigProperty("basemap", "show3dObjects", false); } catch { /* noop */ }
      mapLayersRef.current = { ...mapLayersRef.current, buildings3d: false };
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    } else {
      const mobile = mobileRef.current;
      map.setMaxPitch(mobile ? 55 : 78);
      const b3d = useAppStore.getState().buildings3d;
      try { map.setConfigProperty("basemap", "show3dObjects", b3d); } catch { /* noop */ }
      mapLayersRef.current = { ...mapLayersRef.current, buildings3d: b3d };
      map.flyTo({ pitch: mobile ? 45 : 72, duration: 600 });
    }
  }, [storeViewMode, mapLoaded]);

  // ── Sync store buildings3d → basemap config (3D mode only) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || storeViewMode === "2d") return;
    try {
      map.setConfigProperty("basemap", "show3dObjects", storeBuildings3d);
    } catch { /* noop */ }
    mapLayersRef.current = { ...mapLayersRef.current, buildings3d: storeBuildings3d };
  }, [storeBuildings3d, mapLoaded, storeViewMode]);

  // ── Sync store showPoiLabels → basemap config ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      map.setConfigProperty("basemap", "showPointOfInterestLabels", storeShowPoiLabels);
    } catch { /* noop */ }
    mapLayersRef.current = { ...mapLayersRef.current, poiLabels: storeShowPoiLabels };
  }, [storeShowPoiLabels, mapLoaded]);

  // ── Sync store pitch → map camera (3D mode only) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || storeViewMode === "2d") return;
    const diff = Math.abs(map.getPitch() - storeMapPitch);
    if (diff < 0.5) return;
    const duration = Math.min(diff * 8, 500);
    map.easeTo({ pitch: storeMapPitch, duration });
  }, [storeMapPitch, mapLoaded, storeViewMode]);

  // ── Feed map pitch back to store on user gesture ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onPitchEnd = () => {
      // Zustand no-ops if value unchanged, so no feedback loop
      setStoreMapPitch(Math.round(map.getPitch()));
    };
    map.on("pitchend", onPitchEnd);
    return () => { map.off("pitchend", onPitchEnd); };
  }, [mapLoaded, setStoreMapPitch]);

  // ── Reset North trigger ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || storeResetNorthCount === 0) return;
    map.easeTo({ bearing: 0, duration: 600 });
  }, [storeResetNorthCount, mapLoaded]);

  // ── Walking isochrone circles ──
  const ISOCHRONE_SOURCE = "isochrone-source";
  const ISOCHRONE_FILL_LAYER = "isochrone-fill";
  const ISOCHRONE_LINE_LAYER = "isochrone-line";
  // Cache: keyed by "lng,lat", persists across toggle on/off
  const isochroneCacheRef = useRef<{ key: string; data: GeoJSON.FeatureCollection } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const loc = userLocationRef.current;

    // Remove layers when disabled (but keep cache)
    if (!storeWalkingCircles || !loc) {
      if (map.getLayer(ISOCHRONE_LINE_LAYER)) map.removeLayer(ISOCHRONE_LINE_LAYER);
      if (map.getLayer(ISOCHRONE_FILL_LAYER)) map.removeLayer(ISOCHRONE_FILL_LAYER);
      if (map.getSource(ISOCHRONE_SOURCE)) map.removeSource(ISOCHRONE_SOURCE);
      return;
    }

    let cancelled = false;
    const locKey = `${loc.lng.toFixed(4)},${loc.lat.toFixed(4)}`;

    const addLayers = (m: Map, geojson: GeoJSON.FeatureCollection) => {
      if (!m.getSource(ISOCHRONE_SOURCE)) {
        m.addSource(ISOCHRONE_SOURCE, { type: "geojson", data: geojson });
      } else {
        (m.getSource(ISOCHRONE_SOURCE) as GeoJSONSource).setData(geojson);
      }
      if (!m.getLayer(ISOCHRONE_FILL_LAYER)) {
        m.addLayer(
          {
            id: ISOCHRONE_FILL_LAYER,
            type: "fill",
            source: ISOCHRONE_SOURCE,
            paint: {
              "fill-color": [
                "match", ["get", "contour"],
                5, "rgba(56, 189, 248, 0.30)",
                10, "rgba(129, 140, 248, 0.22)",
                15, "rgba(192, 132, 252, 0.16)",
                "rgba(148,163,184,0.12)",
              ],
              "fill-emissive-strength": 0.6,
            },
          },
          PLACE_PULSE_LAYER_ID,
        );
      }
      if (!m.getLayer(ISOCHRONE_LINE_LAYER)) {
        m.addLayer(
          {
            id: ISOCHRONE_LINE_LAYER,
            type: "line",
            source: ISOCHRONE_SOURCE,
            paint: {
              "line-color": [
                "match", ["get", "contour"],
                5, "rgba(56, 189, 248, 0.75)",
                10, "rgba(129, 140, 248, 0.65)",
                15, "rgba(192, 132, 252, 0.50)",
                "rgba(148,163,184,0.3)",
              ],
              "line-width": 2,
              "line-emissive-strength": 0.8,
            },
          },
          PLACE_PULSE_LAYER_ID,
        );
      }
    };

    // Rebuild layers after style.load (lightPreset changes wipe custom layers)
    const onStyleLoad = () => {
      if (isochroneCacheRef.current && mapRef.current) {
        addLayers(mapRef.current, isochroneCacheRef.current.data);
      }
    };
    map.on("style.load", onStyleLoad);

    // Use cached data if location hasn't changed — no API call
    if (isochroneCacheRef.current?.key === locKey) {
      addLayers(map, isochroneCacheRef.current.data);
    } else {
      // Fetch fresh isochrone data
      const token = mapboxgl.accessToken;
      const url =
        `https://api.mapbox.com/isochrone/v1/mapbox/walking/` +
        `${loc.lng},${loc.lat}?contours_minutes=5,10,15&polygons=true&denoise=1&access_token=${token}`;

      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Isochrone API ${r.status}`);
          return r.json();
        })
        .then((geojson) => {
          if (cancelled || !mapRef.current) return;
          isochroneCacheRef.current = { key: locKey, data: geojson };
          addLayers(mapRef.current, geojson);
        })
        .catch((err) => {
          console.error("[MapCanvas] Isochrone fetch failed:", err);
        });
    }

    return () => {
      cancelled = true;
      map.off("style.load", onStyleLoad);
    };
  }, [storeWalkingCircles, userLocation, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !mapLoaded) {
      return;
    }

    applyActiveFilter(map, hoveredPlaceId, selectedPlaceId);
  }, [hoveredPlaceId, selectedPlaceId, mapLoaded]);

  // Cinema / immersive mode: push the camera, start a slow orbit, and
  // drop back out cleanly on exit. User drag/wheel halts the orbit but
  // leaves the letterbox/mode alone.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapEnabled || !map || !mapLoaded) return;

    const cancelCinemaOrbit = () => stopCinemaOrbit();

    if (storeCinemaMode) {
      stopOrbit();

      const maxPitch =
        typeof map.getMaxPitch === "function" ? map.getMaxPitch() : 78;
      const maxZoom =
        typeof map.getMaxZoom === "function" ? map.getMaxZoom() : 20;
      const center = map.getCenter();

      map.flyTo({
        center: [center.lng, center.lat] as LngLatLike,
        pitch: Math.min(58, maxPitch),
        zoom: Math.min(16.8, maxZoom),
        duration: 1500,
        essential: true,
        curve: 1.2,
        easing: (t) => 1 - Math.pow(1 - t, 5),
      });

      const onArrival = () => {
        if (useAppStore.getState().cinemaMode) startCinemaOrbit();
      };
      map.once("moveend", onArrival);
      map.on("mousedown", cancelCinemaOrbit);
      map.on("touchstart", cancelCinemaOrbit);
      map.on("wheel", cancelCinemaOrbit);

      return () => {
        map.off("moveend", onArrival);
        map.off("mousedown", cancelCinemaOrbit);
        map.off("touchstart", cancelCinemaOrbit);
        map.off("wheel", cancelCinemaOrbit);
        stopCinemaOrbit();
      };
    }

    // Exiting cinema mode — settle back to the user's stored pitch.
    stopCinemaOrbit();
    const center = map.getCenter();
    map.flyTo({
      center: [center.lng, center.lat] as LngLatLike,
      pitch: storeMapPitch,
      zoom: Math.min(17.2, map.getZoom()),
      duration: 1000,
      essential: true,
      curve: 1,
      easing: (t) => 1 - Math.pow(1 - t, 4),
    });
  }, [
    storeCinemaMode,
    mapEnabled,
    mapLoaded,
    stopOrbit,
    startCinemaOrbit,
    stopCinemaOrbit,
    storeMapPitch,
  ]);

  // FlyTo / fitBounds — camera-only, no style dependency needed.
  // Removed isStyleLoaded() guard because setConfigProperty during
  // map.once('load') triggers a style reload, causing isStyleLoaded()
  // to return false right when this effect first runs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      return;
    }

    if (lastViewportKeyRef.current === viewportKey) {
      return;
    }
    // Do not override the camera while cinema mode holds the stage.
    if (useAppStore.getState().cinemaMode) {
      lastViewportKeyRef.current = viewportKey;
      return;
    }
    lastViewportKeyRef.current = viewportKey;

    // Only stop orbit when camera target actually changes
    stopOrbit();

    if (focusCoordinates) {
      // Move the 3D clip area to the destination NOW so buildings are visible
      // when the camera arrives, not after moveend fires.
      const clipSrc = map.getSource(CLIP_SOURCE) as GeoJSONSource | undefined;
      if (clipSrc) clipSrc.setData(clipCircleGeoJson(focusCoordinates));

      if (selectedPlaceId) {
        const flyDuration = 1900;
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 18.2,
          pitch: 60,
          bearing: map.getBearing() - 16,
          duration: flyDuration,
          essential: true,
          // Gentler arc — slight pullback, then a long deceleration into the subject.
          curve: 1.2,
          // easeOutQuint: long tail, no bounce. Reads as "controlled landing".
          easing: (t) => 1 - Math.pow(1 - t, 5),
        });

        const targetId = selectedPlaceId;
        const targetCenter: [number, number] = [
          focusCoordinates.lng,
          focusCoordinates.lat,
        ];
        // Pre-bloom: the frame "anticipates the landing" — the glow starts
        // swelling just before the camera stops, rather than lagging behind it.
        const preBloomTimer = window.setTimeout(() => {
          if (selectedRef.current === targetId) {
            triggerBloomPulse(map);
          }
        }, Math.max(0, flyDuration - 260));
        const onArrival = () => {
          if (selectedRef.current === targetId) {
            startOrbit(targetCenter, targetId);
          }
        };
        map.once("moveend", onArrival);

        return () => {
          clearTimeout(preBloomTimer);
          map.off("moveend", onArrival);
        };
      } else {
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 17.2,
          pitch: 55,
          bearing: -12,
          duration: 1600,
          essential: true,
          curve: 1.1,
          easing: (t) => 1 - Math.pow(1 - t, 5),
        });
      }
      return;
    }

    if (places.length === 0) {
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    places.forEach((place) => {
      bounds.extend([place.coordinates.lng, place.coordinates.lat]);
    });

    map.fitBounds(bounds, {
      padding: 90,
      maxZoom: 13.5,
      duration: 760,
      essential: true,
    });
  }, [focusCoordinates, places, viewportKey, mapLoaded, stopOrbit, startOrbit]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          opacity: timeValue > 21 || timeValue < 7 ? 0.96 : 1,
          transition: "opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <div
        aria-hidden
        suppressHydrationWarning
        data-theme-overlay
        className="pointer-events-none absolute inset-0"
        style={{
          background: mapTint,
          mixBlendMode: "color",
          opacity: mapTintOpacity * (1 - nightBlendProgress),
          transition: "opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1), background 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
          contain: "strict",
        }}
      />
      <div
        aria-hidden
        suppressHydrationWarning
        data-theme-overlay
        className="pointer-events-none absolute inset-0"
        style={{
          background: mapTint,
          mixBlendMode: "soft-light",
          opacity: mapTintOpacity * nightBlendProgress,
          transition: "opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1), background 1.8s cubic-bezier(0.22, 1, 0.36, 1)",
          contain: "strict",
        }}
      />
      <div
        aria-hidden
        suppressHydrationWarning
        data-theme-overlay
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at ${sunX.toFixed(1)}% ${sunY.toFixed(1)}%, rgba(${sunColor},${sunIntensity.toFixed(3)}) 0%, rgba(${sunColor},0) 100%)`,
          transition: "background 0.3s linear",
          contain: "strict",
        }}
      />


      {!mapEnabled ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0)_38%),linear-gradient(120deg,rgba(7,11,24,0.75)_0%,rgba(9,15,34,0.84)_100%)]">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2272%22 viewBox=%220 0 72 72%22%3E%3Cg fill=%22none%22 stroke=%22rgba(255,255,255,0.05)%22 stroke-width=%221%22%3E%3Cpath d=%22M0 36h72M36 0v72%22/%3E%3C/g%3E%3C/svg%3E')] opacity-35" />
          <div className="absolute left-6 top-6 max-w-sm rounded-2xl border border-white/20 bg-black/35 p-4 text-white/85 backdrop-blur-glass md:left-8 md:top-8">
            <p className="font-display text-xs uppercase tracking-[0.22em] text-white/70">
              MapCanvas
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/90">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to see live city layers. The time theme engine and place interactions are already active.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const MapCanvas = memo(MapCanvasInner, (prev, next) => {
  const timeChanged = Math.abs(prev.timeValue - next.timeValue) >= 0.15;
  if (
    prev.theme === next.theme &&
    !timeChanged &&
    prev.places === next.places &&
    prev.hoveredPlaceId === next.hoveredPlaceId &&
    prev.selectedPlaceId === next.selectedPlaceId &&
    prev.focusCoordinates === next.focusCoordinates &&
    prev.userLocation === next.userLocation &&
    prev.viewportKey === next.viewportKey &&
    prev.onSelectPlace === next.onSelectPlace &&
    prev.onDeselectPlace === next.onDeselectPlace &&
    prev.onRecenter === next.onRecenter &&
    prev.onViewportChange === next.onViewportChange
  ) {
    return true;
  }
  return false;
});
