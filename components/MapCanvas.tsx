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
import { interpolateThemeVisual, resolveThemeByHour, TIME_THEME_META } from "@/shared/time-theme";
import type { RankedPlace, TimeTheme } from "@/shared/types";

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

function lerp(start: number, end: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return start + (end - start) * t;
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
      paint: {
        "circle-radius": pulseRadiusExpression(0.8),
        "circle-color": "#A5F3FC",
        "circle-opacity": pulseOpacityExpression(0.2),
        "circle-blur": 0.86,
        "circle-emissive-strength": 1,
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
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 7.8, 14, 17.5],
        "circle-color": "#22D3EE",
        // Minimum 0.38 so glow is always seen against dark map
        "circle-opacity": ["max", 0.38, ["*", 0.55, ["coalesce", ["get", "visibility"], 0.8]]],
        "circle-blur": 0.9,
        "circle-emissive-strength": 1,
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
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 16],
        "circle-color": "#8B5CF6",
        "circle-blur": 0.7,
        "circle-opacity": 0.36,
        "circle-emissive-strength": 1,
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
  // Extended dawn range (6–10) for a warm, cozy morning atmosphere.
  if (timeValue < 10) return "dawn";
  if (timeValue < 17.5) return "day";
  if (timeValue < 19) return "dusk";
  return "night";
}

let _lastLightPreset: string | null = null;
let _lastPointColors: { pointColor: string; glowColor: string; activeColor: string } | null = null;

function applyTheme(map: Map, timeValue: number): void {
  // Quantize to nearest 0.5 so paint property updates fire less frequently
  const quantizedTime = Math.round(timeValue * 2) / 2;
  const pointPaint = pointPaintForTime(quantizedTime);

  // Only update lightPreset when it actually changes — this triggers expensive
  // 3D shadow recalculations inside Mapbox GL and is the main source of jank.
  const lightPreset = resolveLightPreset(timeValue);
  if (lightPreset !== _lastLightPreset) {
    _lastLightPreset = lightPreset;
    try {
      map.setConfigProperty("basemap", "lightPreset", lightPreset);
    } catch {
      // Older styles
    }
  }

  // Skip point color updates if nothing changed — avoids redundant GL calls.
  if (
    _lastPointColors &&
    _lastPointColors.pointColor === pointPaint.pointColor &&
    _lastPointColors.glowColor === pointPaint.glowColor &&
    _lastPointColors.activeColor === pointPaint.activeColor
  ) {
    return;
  }
  _lastPointColors = { ...pointPaint };

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
  onRecenter,
  onViewportChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const placesRef = useRef<RankedPlace[]>(places);
  const timeValueRef = useRef<number>(timeValue);
  const hoveredRef = useRef<string | null>(hoveredPlaceId);
  const selectedRef = useRef<string | null>(selectedPlaceId);
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
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({
    roadLabels: true,
    placeLabels: true,
    poiLabels: false,
    transitLabels: false,
    buildings3d: true,
  });
  const prevLayersRef = useRef(mapLayers);
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

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-98.5795, 39.8283],
      zoom: 3.4,
      pitch: 45,
      bearing: -8,
      attributionControl: false,
      antialias: true,
      fadeDuration: 0,
    });

    mapRef.current = map;

    const emitViewport = () => {
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

      const source = map.getSource(PLACE_SOURCE_ID) as GeoJSONSource | undefined;
      if (source) {
        source.setData(placesToGeoJson(placesRef.current));
      }

      applyTheme(map, timeValueRef.current);
      applyActiveFilter(map, hoveredRef.current, selectedRef.current);
      emitViewport();
    };

    // One-time setup: set label visibility config. These setConfigProperty calls
    // trigger style.load once — that's expected and handled below.
    map.once("load", () => {
      try {
        map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
        map.setConfigProperty("basemap", "showTransitLabels", false);
        map.setConfigProperty("basemap", "showRoadLabels", true);
        map.setConfigProperty("basemap", "showPlaceLabels", true);
        map.setConfigProperty("basemap", "show3dObjects", true);
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

    setMapEnabled(true);

    return () => {
      if (pulseFrameRef.current !== null) {
        clearTimeout(pulseFrameRef.current);
        pulseFrameRef.current = null;
      }
      map.off("moveend", emitViewport);
      map.remove();
      mapRef.current = null;
      setMapEnabled(false);
    };
  }, [onSelectPlace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapEnabled || !map) {
      return;
    }

    let cancelled = false;

    const animate = () => {
      if (cancelled) {
        return;
      }

      const timestamp = performance.now();
      const wave = (Math.sin(timestamp / 620) + 1) / 2;
      const radiusBoost = 0.8 + wave * 1.9;
      const opacity = 0.09 + (1 - wave) * 0.12;

      if (map.getLayer(PLACE_PULSE_LAYER_ID)) {
        map.setPaintProperty(PLACE_PULSE_LAYER_ID, "circle-radius", pulseRadiusExpression(radiusBoost));
        map.setPaintProperty(PLACE_PULSE_LAYER_ID, "circle-opacity", pulseOpacityExpression(opacity));
      }

      pulseFrameRef.current = window.setTimeout(animate, 200);
    };

    pulseFrameRef.current = window.setTimeout(animate, 200);

    return () => {
      cancelled = true;
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
      maxWidth: "260px",
      offset: 16,
    })
      .setLngLat([lng, lat])
      .setDOMContent(root)
      .addTo(map);

    popupRef.current.on("close", popupCloseHandler);
  }, [selectedPlaceId, mapLoaded, popupCloseHandler]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !mapLoaded) {
      return;
    }

    applyTheme(map, timeValue);
  }, [theme, timeValue, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
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

    if (focusCoordinates) {
      // Place selected → tight fly, stay close so user can see the pin
      if (selectedPlaceId) {
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 17,
          pitch: 55,
          bearing: -8,
          duration: 1400,
          essential: true,
          curve: 1.2,
        });
      } else {
        // Search / recenter → fly to roughly match the 2km loading area
        map.flyTo({
          center: [focusCoordinates.lng, focusCoordinates.lat] as LngLatLike,
          zoom: 15.5,
          pitch: 50,
          bearing: -12,
          duration: 2200,
          essential: true,
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
  }, [focusCoordinates, places, viewportKey, mapLoaded]);

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

      {mapEnabled && (
        <div className="pointer-events-auto absolute bottom-6 left-4 z-30 md:bottom-8 md:left-6">
          {legendOpen && (
            <div className="mb-2 min-w-[148px] rounded-xl border border-white/[0.12] bg-black/60 p-3 shadow-lg backdrop-blur-md">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                Map Layers
              </p>
              {([
                ["roadLabels", "Roads"],
                ["placeLabels", "Places"],
                ["poiLabels", "POI"],
                ["transitLabels", "Transit"],
                ["buildings3d", "3D Buildings"],
              ] as const).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-[3px] transition-colors hover:bg-white/[0.06]"
                  onClick={() => {
                    setMapLayers((prev) => {
                      const next = { ...prev };
                      next[key] = !next[key];
                      return next;
                    });
                  }}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                      mapLayers[key]
                        ? "border-cyan-400/60 bg-cyan-400/80"
                        : "border-white/25 bg-white/10"
                    }`}
                  >
                    {mapLayers[key] && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 6 5 9 10 3" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[11px] text-white/75">{label}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-label={legendOpen ? "Close map layers" : "Open map layers"}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors active:scale-95 ${
              legendOpen
                ? "border-cyan-400/30 bg-black/65 text-cyan-300"
                : "border-white/20 bg-black/50 text-white/90 hover:bg-black/70"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </button>
        </div>
      )}

      {mapEnabled && userLocation ? (
        <button
          type="button"
          aria-label="Return to current location"
          onClick={onRecenter}
          className="pointer-events-auto absolute bottom-6 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/90 shadow-lg backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95 md:bottom-8 md:right-6"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
          </svg>
        </button>
      ) : null}

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
