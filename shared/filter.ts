import { resolveThemeByHour } from "./time-theme";
import type { Place, PlaceTag, PlacesQuery, RankedPlace } from "./types";

function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function circularDistanceHours(a: number, b: number): number {
  const distance = Math.abs(a - b);
  return Math.min(distance, 24 - distance);
}

function distanceToOpenWindow(
  hour: number,
  openHour: number,
  closeHour: number,
): number {
  const open = normalizeHour(openHour);
  const close = normalizeHour(closeHour);

  if (open === close) {
    return 0;
  }

  if (open < close) {
    if (hour >= open && hour < close) {
      return 0;
    }
    return Math.min(circularDistanceHours(hour, open), circularDistanceHours(hour, close));
  }

  if (hour >= open || hour < close) {
    return 0;
  }

  return Math.min(hour - close, open - hour);
}

export function isOpenAtHour(place: Place, rawHour: number): boolean {
  const hour = normalizeHour(rawHour);
  const open = normalizeHour(place.openHour);
  const close = normalizeHour(place.closeHour);

  if (open === close) {
    return true;
  }

  if (open < close) {
    return hour >= open && hour < close;
  }

  return hour >= open || hour < close;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function insideBbox(
  place: Place,
  bbox?: [number, number, number, number],
): boolean {
  if (!bbox) {
    return true;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const { lng, lat } = place.coordinates;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function hasAllTags(place: Place, tags: PlaceTag[]): boolean {
  if (tags.length === 0) {
    return true;
  }

  return tags.every((tag) => place.tags.includes(tag));
}

function placeVisibility(place: Place, hour: number): number {
  const theme = resolveThemeByHour(hour);
  const openDistance = distanceToOpenWindow(hour, place.openHour, place.closeHour);
  const openNow = isOpenAtHour(place, hour);
  const openProximity = clamp(1 - openDistance / 2.5, 0, 1);
  const themeMatch = place.bestFor.includes(theme);

  const visibility =
    (openNow ? 0.78 : 0.32) +
    (themeMatch ? 0.16 : 0) +
    openProximity * 0.18;

  return clamp(visibility, 0.22, 1);
}

export function rankPlaces(places: Place[], query: PlacesQuery): RankedPlace[] {
  const theme = resolveThemeByHour(query.hour);

  const ranked = places
    .filter((place) => insideBbox(place, query.bbox))
    .filter((place) => hasAllTags(place, query.tags))
    .map((place) => {
      const openNow = isOpenAtHour(place, query.hour);
      const visibility = placeVisibility(place, query.hour);
      let score = 0;

      if (place.bestFor.includes(theme)) {
        score += 4;
      }

      if (openNow) {
        score += 3;
      }

      score += query.tags.reduce(
        (sum, tag) => sum + (place.tags.includes(tag) ? 2 : 0),
        0,
      );
      score += visibility * 2;

      let distanceKm: number | undefined;
      if (typeof query.lng === "number" && typeof query.lat === "number") {
        distanceKm = haversineKm(
          query.lat,
          query.lng,
          place.coordinates.lat,
          place.coordinates.lng,
        );
        score += Math.max(0, 3 - Math.min(distanceKm, 3));
      }

      return {
        ...place,
        score,
        distanceKm,
        openNow,
        visibility,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm;
      }

      return a.name.localeCompare(b.name);
    });

  if (query.limit && query.limit > 0) {
    return ranked.slice(0, query.limit);
  }

  return ranked;
}

export function parseTags(value?: string | null): PlaceTag[] {
  if (!value) {
    return [];
  }

  const allowed = new Set<PlaceTag>([
    "Quiet",
    "Solo",
    "Late Night",
    "Weekend",
    "Cafe",
    "Walkable",
  ]);

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is PlaceTag => allowed.has(item as PlaceTag));
}

export function matchesPlaceSearch(
  place: Pick<Place, "name" | "neighborhood" | "vibe" | "tags" | "statuses">,
  search: string,
): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    place.name,
    place.neighborhood,
    place.vibe,
    ...place.tags,
    ...place.statuses,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function parseBbox(value?: string | null):
  | [number, number, number, number]
  | undefined {
  if (!value) {
    return undefined;
  }

  const numbers = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  if (numbers.length !== 4) {
    return undefined;
  }

  const [minLng, minLat, maxLng, maxLat] = numbers;

  if (minLng >= maxLng || minLat >= maxLat) {
    return undefined;
  }

  return [minLng, minLat, maxLng, maxLat];
}
