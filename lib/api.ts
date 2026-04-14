import type { PlaceTag, RankedPlace } from "@/shared/types";
import { matchesPlaceSearch, rankPlaces } from "@/shared/filter";
import { SEED_PLACES } from "@/shared/places";

export type Bbox = [number, number, number, number];

export interface FetchPlacesArgs {
  hour: number;
  tags: PlaceTag[];
  limit?: number;
  lng?: number;
  lat?: number;
  bbox?: Bbox;
  query?: string;
  signal?: AbortSignal;
}

export async function fetchPlaces({
  hour,
  tags,
  limit = 20,
  lng,
  lat,
  bbox,
  query: searchQuery,
  signal,
}: FetchPlacesArgs): Promise<RankedPlace[]> {
  const endpoint = process.env.NEXT_PUBLIC_PLACES_API_URL;

  if (!endpoint) {
    const source = searchQuery?.trim()
      ? SEED_PLACES.filter((place) => matchesPlaceSearch(place, searchQuery))
      : SEED_PLACES;

    return rankPlaces(source, {
      hour,
      tags,
      limit,
      lng,
      lat,
      bbox,
    });
  }

  const query = new URLSearchParams({
    time: String(hour),
    tags: tags.join(","),
    limit: String(limit),
  });
  if (typeof lng === "number") {
    query.set("lng", String(lng));
  }
  if (typeof lat === "number") {
    query.set("lat", String(lat));
  }
  if (bbox) {
    query.set("bbox", bbox.join(","));
  }
  if (searchQuery?.trim()) {
    query.set("q", searchQuery.trim());
  }

  const response = await fetch(`${endpoint}?${query.toString()}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load places (${response.status})`);
  }

  let payload: { places: RankedPlace[] };
  try {
    payload = (await response.json()) as { places: RankedPlace[] };
  } catch {
    throw new Error("Failed to parse places response");
  }
  return payload.places ?? [];
}
