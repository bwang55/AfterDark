import type { Feature, FeatureCollection, Point } from "geojson";

import { rankPlaces } from "@/shared/filter";
import type { Place, PlaceTag, RankedPlace, TimeTheme } from "@/shared/types";
import { clamp } from "@/shared/utils";

const DISCOVERY_TERMS = [
  "restaurant",
  "bar",
  "cafe",
  "live music",
  "nightclub",
  "movie theater",
];

interface DiscoveryFeatureProperties {
  place_name?: string;
  name?: string;
  mapbox_id?: string;
  maki?: string;
  category?: string;
  poi_category?: string[];
  place_formatted?: string;
}

interface DiscoveryFeature extends Feature<Point, DiscoveryFeatureProperties> {
  id?: string | number;
  text?: string;
  place_name?: string;
}

interface DiscoveryPayload extends FeatureCollection<Point, DiscoveryFeatureProperties> {
  features: DiscoveryFeature[];
}

export interface DiscoverPlacesArgs {
  accessToken: string;
  hour: number;
  bbox: [number, number, number, number];
  limit?: number;
  proximity?: { lng: number; lat: number };
  signal?: AbortSignal;
  query?: string;
}

// ---------- Discovery-level cache ----------
const discoveryCache = new Map<string, { ts: number; data: RankedPlace[] }>();
const DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DISCOVERY_CACHE_MAX = 30;

function discoveryCacheKey(args: DiscoverPlacesArgs): string {
  const bbox = args.bbox.map((v) => v.toFixed(3)).join(",");
  // Exclude hour from cache key so we fetch all POIs once per bbox+query
  // and filter open/closed locally on the client.
  return `${args.query ?? ""}|${bbox}`;
}

function getDiscoveryCache(key: string): RankedPlace[] | null {
  const entry = discoveryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DISCOVERY_CACHE_TTL) {
    discoveryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setDiscoveryCache(key: string, data: RankedPlace[]): void {
  if (discoveryCache.size >= DISCOVERY_CACHE_MAX) {
    const oldest = discoveryCache.keys().next().value;
    if (oldest !== undefined) discoveryCache.delete(oldest);
  }
  discoveryCache.set(key, { ts: Date.now(), data });
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseVenueKind(source: string): "cafe" | "restaurant" | "bar" | "entertainment" {
  const value = source.toLowerCase();

  if (
    value.includes("bar") ||
    value.includes("pub") ||
    value.includes("club") ||
    value.includes("nightlife")
  ) {
    return "bar";
  }

  if (
    value.includes("theater") ||
    value.includes("cinema") ||
    value.includes("music") ||
    value.includes("concert") ||
    value.includes("arcade") ||
    value.includes("entertain")
  ) {
    return "entertainment";
  }

  if (value.includes("cafe") || value.includes("coffee") || value.includes("bakery")) {
    return "cafe";
  }

  return "restaurant";
}

function profileForKind(kind: "cafe" | "restaurant" | "bar" | "entertainment"): {
  tags: PlaceTag[];
  statuses: string[];
  bestFor: TimeTheme[];
  openHour: number;
  closeHour: number;
  vibe: string;
} {
  if (kind === "cafe") {
    return {
      tags: ["Cafe", "Solo", "Walkable"],
      statuses: ["Daylight Friendly", "Solo Friendly"],
      bestFor: ["morning", "afternoon"],
      openHour: 6,
      closeHour: 19,
      vibe: "Bright tables, calm traffic, and soft daytime energy.",
    };
  }

  if (kind === "bar") {
    return {
      tags: ["Late Night", "Weekend", "Walkable"],
      statuses: ["Open Late", "After Dark"],
      bestFor: ["dusk", "night"],
      openHour: 16,
      closeHour: 2,
      vibe: "Warm light, late hours, and city-after-dark momentum.",
    };
  }

  if (kind === "entertainment") {
    return {
      tags: ["Weekend", "Walkable", "Solo"],
      statuses: ["Evening Friendly", "Popular"],
      bestFor: ["afternoon", "dusk", "night"],
      openHour: 11,
      closeHour: 23,
      vibe: "Editorial spots for long evenings and shared city energy.",
    };
  }

  return {
    tags: ["Walkable", "Weekend", "Solo"],
    statuses: ["All Day", "Popular"],
    bestFor: ["afternoon", "dusk"],
    openHour: 10,
    closeHour: 23,
    vibe: "Comfort food and active streets through the day-to-night shift.",
  };
}

function toPlace(feature: DiscoveryFeature): Place | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const name =
    feature.properties?.name ??
    feature.text ??
    feature.properties?.place_name ??
    feature.properties?.mapbox_id ??
    "Untitled Place";
  
  const placeFormatted = feature.properties?.place_formatted || "";
  const placeName = feature.place_name ?? feature.properties?.place_name ?? placeFormatted ?? name;
  const placeParts = placeName.split(",").map((part) => part.trim()).filter(Boolean);
  const neighborhood = placeParts.slice(0, 2).join(", ") || "City Center";

  const kindSource = [
    feature.properties?.maki ?? "",
    feature.properties?.category ?? "",
    ...(feature.properties?.poi_category ?? []),
    feature.text ?? "",
    placeName,
  ].join(" ");
  const kind = parseVenueKind(kindSource);
  const profile = profileForKind(kind);
  const sourceId = String(feature.id ?? feature.properties?.mapbox_id ?? "");

  return {
    id: sourceId || `${slugify(name)}-${lng.toFixed(4)}-${lat.toFixed(4)}`,
    name,
    vibe: profile.vibe,
    neighborhood,
    tags: profile.tags,
    statuses: profile.statuses,
    coordinates: { lng, lat },
    bestFor: profile.bestFor,
    openHour: profile.openHour,
    closeHour: profile.closeHour,
  };
}

async function fetchTerm(
  term: string,
  args: DiscoverPlacesArgs,
  perTermLimit: number,
): Promise<Place[]> {
  // Mapbox Search Box API limits bbox longitude from -180 to +180 and latitude from -90 to +90.
  // Bboxes can cross the antimeridian, but for safety in this local demo we just clamp them:
  let [minLng, minLat, maxLng, maxLat] = args.bbox;
  minLng = clamp(minLng, -180, 180);
  maxLng = clamp(maxLng, -180, 180);
  minLat = clamp(minLat, -90, 90);
  maxLat = clamp(maxLat, -90, 90);

  // If minLng somehow became larger than maxLng after wrapping, swap them roughly
  if (minLng > maxLng) {
    const tmp = minLng;
    minLng = maxLng;
    maxLng = tmp;
  }
  
  const bboxClamp = [minLng, minLat, maxLng, maxLat];

  const bbox = bboxClamp.map((value) => value.toFixed(6)).join(",");
  const params = new URLSearchParams({
    limit: String(perTermLimit),
    bbox,
    language: "en",
    access_token: args.accessToken,
  });

  if (args.proximity) {
    params.set("proximity", `${args.proximity.lng.toFixed(6)},${args.proximity.lat.toFixed(6)}`);
  }

  const endpoint =
    "https://api.mapbox.com/search/searchbox/v1/category/" +
    encodeURIComponent(term) +
    "?" +
    params.toString();

  try {
    const response = await fetch(endpoint, {
      signal: args.signal,
    });
    
    if (!response.ok) {
      console.error(`[discovery] Mapbox API error: ${response.status} ${response.statusText} for url: ${endpoint}`);
      const text = await response.text();
      console.error(`[discovery] Mapbox API body: ${text}`);
      return [];
    }

    const payload = (await response.json()) as DiscoveryPayload;
    if (!payload.features) {
       console.log(`[discovery] No features returned for term: ${term}`);
    } else {
       console.log(`[discovery] Term "${term}" got ${payload.features.length} features`);
    }

    return (payload.features ?? [])
      .map((feature) => toPlace(feature))
      .filter((place): place is Place => Boolean(place));
  } catch (err) {
    console.error(`[discovery] Fetch failed for term "${term}":`, err);
    return [];
  }
}

export async function discoverPlaces(
  args: DiscoverPlacesArgs,
): Promise<RankedPlace[]> {
  if (!args.accessToken) {
    console.warn("[discovery] No Mapbox access token provided.");
    return [];
  }

  const cacheKey = discoveryCacheKey(args);
  const cached = getDiscoveryCache(cacheKey);
  if (cached) {
    console.log(`[discovery] Cache hit for key: ${cacheKey}`);
    return cached;
  }

  const requested = clamp(args.limit ?? 140, 24, 220);
  
  // If user provided a query, search for that query directly along with main terms.
  const termsToSearch = args.query && args.query.trim().length > 0 
    ? [args.query.trim(), ...DISCOVERY_TERMS.slice(0, 2)] 
    : DISCOVERY_TERMS.slice(0, 4);
    
  console.log(`[discovery] Searching terms: ${termsToSearch.join(", ")} inside bbox: ${args.bbox.join(",")}`);
    
  const perTermLimit = Math.min(25, Math.max(6, Math.ceil((requested * 1.4) / termsToSearch.length)));

  const results = await Promise.all(
    termsToSearch.map((term) => fetchTerm(term, args, perTermLimit)),
  );

  const flatResults = results.flat();
  console.log(`[discovery] Found ${flatResults.length} raw places`);

  const unique = new Map<string, Place>();
  flatResults.forEach((place) => {
    const key = `${place.name.toLowerCase()}|${place.coordinates.lng.toFixed(4)}|${place.coordinates.lat.toFixed(4)}`;
    if (!unique.has(key)) {
      unique.set(key, place);
    }
  });

  const finalPlaces = rankPlaces(Array.from(unique.values()), {
    hour: args.hour,
    tags: [],
    limit: requested,
    bbox: args.bbox,
    lng: args.proximity?.lng,
    lat: args.proximity?.lat,
  });
  
  console.log(`[discovery] Returning ${finalPlaces.length} ranked unique places`);
  setDiscoveryCache(cacheKey, finalPlaces);
  return finalPlaces;
}
