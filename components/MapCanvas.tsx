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

function ensurePlaceLayers(map: Map): void {
  if (!map.getSource(PLACE_SOURCE_ID)) {
    map.addSource(PLACE_SOURCE_ID, {
      type: "geojson",
      data: getEmptyGeoJson(),
    });
  }

  if (!map.getLayer(PLACE_PULSE_LAYER_ID)) {
    map.addLayer({
      id: PLACE_PULSE_LAYER_ID,
      type: "circle",
      source: PLACE_SOURCE_ID,
      layout: { "circle-sort-key": 0 },
      paint: {
        "circle-radius": pulseRadiusExpression(0.8),
        "circle-color": "#A5F3FC",
        "circle-opacity": pulseOpacityExpression(0.2),
        "circle-blur": 0.86,
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "map",
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
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 7.8, 14, 17.5],
        "circle-color": "#22D3EE",
        // Minimum 0.38 so glow is always seen against dark map
        "circle-opacity": ["max", 0.38, ["*", 0.55, ["coalesce", ["get", "visibility"], 0.8]]],
        "circle-blur": 0.9,
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "map",
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
        "circle-stroke-opacity": [
          "max",
          0.72,
          ["*", 0.92, ["coalesce", ["get", "visibility"], 0.8]],
        ],
        // Minimum 0.68 — closed places are still clearly visible dots
        "circle-opacity": ["max", 0.68, ["coalesce", ["get", "visibility"], 0.8]],
        "circle-emissive-strength": 1,
        "circle-pitch-alignment": "map",
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
        "circle-pitch-alignment": "map",
        "circle-opacity-transition": { duration: 220, delay: 0 },
      },
      filter: ["==", ["get", "id"], "__none__"],
    });
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

function applyTheme(map: Map, timeValue: number): void {
  const quantizedTime = Math.round(timeValue * 2) / 2;
  const pointPaint = pointPaintForTime(quantizedTime);

  // Read the ACTUAL current lightPreset from the map instead of relying on a
  // cache. This eliminates all stale-cache scenarios (style.load resets, HMR,
  // Error Boundary remount, synchronous re-entrancy from style.load handlers).
  const desiredPreset = resolveLightPreset(timeValue);
  try {
    const currentPreset = map.getConfigProperty("basemap", "lightPreset");
    if (currentPreset !== desiredPreset) {
      map.setConfigProperty("basemap", "lightPreset", desiredPreset);
    }
  } catch {
    // Style not ready or API unavailable — skip, will retry on next effect / style.load
  }

  // Always apply point colors. setPaintProperty is cheap, and style.load
  // recreates layers with default colors, so we must repaint every time.
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
  const storeMapPitch = useAppStore((s) => s.mapPitch);
  const storeResetNorthCount = useAppStore((s) => s.resetNorthCount);
  const setStoreMapPitch = useAppStore((s) => s.setMapPitch);
  const storeWalkingCircles = useAppStore((s) => s.walkingCircles);
  const storeViewMode = useAppStore((s) => s.viewMode);

  const stopOrbit = useCallback(() => {
    orbitActiveRef.current = false;
    if (orbitFrameRef.current !== null) {
      cancelAnimationFrame(orbitFrameRef.current);
      orbitFrameRef.current = null;
    }
  }, []);

  const startOrbit = useCallback(
    (center: [number, number], placeId: string) => {
      const map = mapRef.current;
      if (!map) return;
      stopOrbit();
      orbitActiveRef.current = true;
      const startBearing = map.getBearing();
      const startTime = performance.now();
      const SPEED = 3; // degrees per second — full rotation in ~120s
      const tick = () => {
        const m = mapRef.current;
        if (!orbitActiveRef.current || !m) return;
        if (selectedRef.current !== placeId) {
          stopOrbit();
          return;
        }
        const elapsed = (performance.now() - startTime) / 1000;
        m.jumpTo({ bearing: startBearing - elapsed * SPEED, center });
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

    let map: Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: [-71.4128, 41.824],
        zoom: 15.5,
        pitch: 72,
        bearing: -8,
        maxPitch: 78,
        attributionControl: false,
        antialias: true,
        fadeDuration: 0,
      });
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
      ensurePlaceLayers(map);
      ensureUserLocationLayers(map);

      // Restore 3D terrain (lost on style.load)
      if (!map.getSource("mapbox-dem")) {
        try {
          map.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          });
          map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
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
        // Set lightPreset FIRST so it batches with label configs into a single
        // style reload, avoiding a flash of wrong colors on initial load.
        map.setConfigProperty("basemap", "lightPreset", resolveLightPreset(timeValueRef.current));
        map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
        map.setConfigProperty("basemap", "showTransitLabels", false);
        map.setConfigProperty("basemap", "showRoadLabels", true);
        map.setConfigProperty("basemap", "showPlaceLabels", true);
        map.setConfigProperty("basemap", "show3dObjects", true);

        // 3D terrain — makes hills/mountains visible (e.g. SF, downtown valleys)
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      } catch { /* noop */ }
      syncCustomLayers();
      setMapLoaded(true);
    });

    // style.load fires after the initial config above, and whenever lightPreset
    // changes. Only re-sync custom layers here — no setConfigProperty calls that
    // would cascade into another style.load and cause label flickering.
    map.on("style.load", () => {
      syncCustomLayers();
      setMapLoaded(true);
    });
    map.on("moveend", emitViewport);

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
      map.off("mousedown", cancelOrbit);
      map.off("touchstart", cancelOrbit);
      map.off("wheel", cancelOrbit);
      map.remove();
      mapRef.current = null;
      setMapEnabled(false);
    };
  }, [onSelectPlace, stopOrbit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapEnabled || !map) {
      return;
    }

    let cancelled = false;
    let isMoving = false;

    const handleMoveStart = () => { isMoving = true; };
    const handleMoveEnd = () => { isMoving = false; };
    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('zoomstart', handleMoveStart);
    map.on('zoomend', handleMoveEnd);

    const animate = () => {
      if (cancelled) {
        return;
      }

      // Do not update paint properties while the user is actively panning/zooming
      // to maintain a smooth 60fps interaction on the map.
      if (!isMoving) {
        const timestamp = performance.now();
        const wave = (Math.sin(timestamp / 620) + 1) / 2;
        const radiusBoost = 0.8 + wave * 1.9;
        const opacity = 0.09 + (1 - wave) * 0.12;

        if (map.getLayer(PLACE_PULSE_LAYER_ID)) {
          // Use plain numbers instead of zoom-interpolation expressions.
          // Expression objects force Mapbox GL to recompile the evaluation
          // pipeline on every call, which disrupts symbol placement and
          // causes road/building labels to flicker at high zoom levels.
          // Plain numbers take the fast-path — no recompilation needed,
          // and the existing circle-radius-transition smooths the values.
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

    const photoUrl = `/api/place-photo?name=${encodeURIComponent(place.name)}&lat=${lat}&lng=${lng}`;
    img.onload = () => {
      img.style.display = "block";
      imgWrap.classList.add("ad-popup__img-wrap--loaded");
    };
    img.onerror = () => {
      imgWrap.remove();
    };
    img.src = photoUrl;

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
      map.setMaxPitch(78);
      const b3d = useAppStore.getState().buildings3d;
      try { map.setConfigProperty("basemap", "show3dObjects", b3d); } catch { /* noop */ }
      mapLayersRef.current = { ...mapLayersRef.current, buildings3d: b3d };
      // Hard-coded 72° — reliable default street-level tilt
      map.flyTo({ pitch: 72, duration: 600 });
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
    lastViewportKeyRef.current = viewportKey;

    // Only stop orbit when camera target actually changes
    stopOrbit();

    if (focusCoordinates) {
      // Hide 3D buildings during long-distance fly (> 500m) to cut GPU load
      // and tile fetching. Short hops (within a neighborhood) keep buildings.
      const cur = map.getCenter();
      const dx = focusCoordinates.lng - cur.lng;
      const dy = focusCoordinates.lat - cur.lat;
      const isLongFly = Math.sqrt(dx * dx + dy * dy) * 111 > 2;

      if (isLongFly) {
        try {
          map.setConfigProperty("basemap", "show3dObjects", false);
        } catch { /* noop */ }
      }

      if (selectedPlaceId) {
        // Selected place → low street-level fly, then orbit.
        // Low curve keeps camera close (no zoom-out mid-flight = fewer tiles).
        const flyDuration = 1600;
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 19.8,
          pitch: 74,
          bearing: map.getBearing() - 16,
          duration: flyDuration,
          essential: true,
          curve: 0.8,
        });

        // Start orbit the moment flyTo lands — camera is already at the
        // target so jumpTo won't snap/jump, just smoothly adds rotation.
        const targetId = selectedPlaceId;
        const targetCenter: [number, number] = [
          focusCoordinates.lng,
          focusCoordinates.lat,
        ];
        const onArrival = () => {
          if (selectedRef.current === targetId) {
            if (isLongFly) {
              try {
                map.setConfigProperty(
                  "basemap",
                  "show3dObjects",
                  mapLayersRef.current.buildings3d,
                );
              } catch { /* noop */ }
            }
            startOrbit(targetCenter, targetId);
          }
        };
        map.once("moveend", onArrival);

        // Clean up listener if effect re-runs before flyTo finishes
        return () => {
          map.off("moveend", onArrival);
        };
      } else {
        // Search / recenter
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 18.6,
          pitch: 68,
          bearing: -12,
          duration: 1400,
          essential: true,
          curve: 0.8,
        });

        if (isLongFly) {
          map.once("moveend", () => {
            try {
              map.setConfigProperty(
                "basemap",
                "show3dObjects",
                mapLayersRef.current.buildings3d,
              );
            } catch { /* noop */ }
          });
        }
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
