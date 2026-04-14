import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

import { matchesPlaceSearch, parseBbox, parseTags, rankPlaces } from "../../shared/filter";
import { SEED_PLACES } from "../../shared/places";
import type { Place } from "../../shared/types";
import { discoverPlaces } from "../../lib/discovery";

const allowOrigin = process.env.ALLOW_ORIGIN || "";
const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

function numberOrUndefined(
  value: string | undefined,
  min?: number,
  max?: number,
): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...(allowOrigin && {
        "access-control-allow-origin": allowOrigin,
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      }),
    },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // REST API handles OPTIONS/CORS preflight at the gateway level — no need here.
  const query = event.queryStringParameters ?? {};

  const hour = numberOrUndefined(query.time, 0, 24) ?? 22;
  const tags = parseTags(query.tags);
  const limit = numberOrUndefined(query.limit, 1, 100) ?? 40;
  const lng = numberOrUndefined(query.lng, -180, 180);
  const lat = numberOrUndefined(query.lat, -90, 90);
  const bbox = parseBbox(query.bbox);
  const searchQuery = (query.q ?? query.query ?? "").trim();

  const places = SEED_PLACES;
  let discoverResults: Place[] = [];

  // Search mapbox if token and bbox supplied
  if (mapboxToken && bbox) {
    const proximity = (typeof lng === "number" && typeof lat === "number") ? { lng, lat } : undefined;
    
    // We try/catch in case mapbox limits are reached so lambda doesn't crash completely
    try {
      discoverResults = await discoverPlaces({
        accessToken: mapboxToken,
        hour,
        bbox,
        limit,
        proximity,
        query: searchQuery || "entertainment", // Default to entertainment if empty
      });
    } catch (e) {
      console.error("Mapbox search failed", e);
    }
  }

  const merged = new Map<string, Place>();
  places.forEach((p) => merged.set(p.id, p));
  discoverResults.forEach((p) => merged.set(p.id, p));

  const allPlaces = Array.from(merged.values());

  const filteredPlaces = searchQuery
    ? allPlaces.filter((place) => matchesPlaceSearch(place, searchQuery))
    : allPlaces;

  const ranked = rankPlaces(filteredPlaces, {
    hour,
    tags,
    limit,
    lng,
    lat,
    bbox,
  });

  return jsonResponse(200, {
    places: ranked,
    query: searchQuery || undefined,
    count: ranked.length,
  });
}
