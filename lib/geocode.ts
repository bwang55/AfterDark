const GEOCODE_CACHE = new Map<string, GeocodeResult | null>();
const MAX_CACHE_ENTRIES = 200;

export interface GeocodeResult {
  placeName: string;
  center: {
    lng: number;
    lat: number;
  };
}

interface GeocodeOptions {
  retries?: number;
  timeoutMs?: number;
}

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function setCacheValue(key: string, value: GeocodeResult | null): void {
  GEOCODE_CACHE.set(key, value);

  if (GEOCODE_CACHE.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldest = GEOCODE_CACHE.keys().next().value;
  if (typeof oldest === "string") {
    GEOCODE_CACHE.delete(oldest);
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abortHandler = () => controller.abort();

  if (signal) {
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export async function geocodeLocation(
  query: string,
  accessToken: string,
  signal?: AbortSignal,
  options: GeocodeOptions = {},
): Promise<GeocodeResult | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !accessToken) {
    return null;
  }

  const key = cacheKey(normalizedQuery);
  if (GEOCODE_CACHE.has(key)) {
    return GEOCODE_CACHE.get(key) ?? null;
  }

  const encoded = encodeURIComponent(normalizedQuery);
  const endpoint =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encoded +
    ".json?types=country,region,place,locality,neighborhood&limit=1&autocomplete=false&language=en&access_token=" +
    encodeURIComponent(accessToken);

  const retries = options.retries ?? 1;
  const timeoutMs = options.timeoutMs ?? 4500;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(endpoint, timeoutMs, signal);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        features?: Array<{
          place_name?: string;
          center?: [number, number];
        }>;
      };

      const first = payload.features?.[0];
      if (!first || !Array.isArray(first.center) || first.center.length < 2) {
        setCacheValue(key, null);
        return null;
      }

      const result: GeocodeResult = {
        placeName: first.place_name ?? normalizedQuery,
        center: {
          lng: first.center[0],
          lat: first.center[1],
        },
      };

      setCacheValue(key, result);
      return result;
    } catch {
      if (signal?.aborted) {
        return null;
      }
      if (attempt === retries) {
        setCacheValue(key, null);
        return null;
      }
    }
  }

  setCacheValue(key, null);
  return null;
}
