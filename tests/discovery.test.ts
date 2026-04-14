import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake Mapbox response builder ───────────────────────────────────────

function makeFeature(
  id: string,
  name: string,
  lng: number,
  lat: number,
  category = "restaurant",
) {
  return {
    type: "Feature" as const,
    id,
    text: name,
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
    properties: {
      name,
      mapbox_id: id,
      category,
      poi_category: [category],
      place_formatted: `${name}, Providence, RI`,
    },
  };
}

function mapboxResponse(features: ReturnType<typeof makeFeature>[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ type: "FeatureCollection", features }),
    text: async () => JSON.stringify({ type: "FeatureCollection", features }),
  };
}

// ── Test setup ─────────────────────────────────────────────────────────

let discoverPlaces: typeof import("@/lib/discovery").discoverPlaces;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();

  mockFetch = vi.fn().mockResolvedValue(mapboxResponse([]));
  vi.stubGlobal("fetch", mockFetch);

  // Fresh module each test → fresh cache
  const mod = await import("@/lib/discovery");
  discoverPlaces = mod.discoverPlaces;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Shared args builder ────────────────────────────────────────────────

function makeArgs(
  overrides: Partial<import("@/lib/discovery").DiscoverPlacesArgs> = {},
): import("@/lib/discovery").DiscoverPlacesArgs {
  return {
    accessToken: "pk.test-token",
    hour: 22,
    bbox: [-71.42, 41.81, -71.39, 41.84] as [number, number, number, number],
    limit: 20,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("discoverPlaces", () => {
  it("returns empty array when no access token", async () => {
    const result = await discoverPlaces(
      makeArgs({ accessToken: "" }),
    );
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls Mapbox API and returns ranked places", async () => {
    mockFetch.mockResolvedValue(
      mapboxResponse([
        makeFeature("f1", "Test Bar", -71.41, 41.82, "bar"),
        makeFeature("f2", "Test Cafe", -71.40, 41.83, "cafe"),
      ]),
    );

    const result = await discoverPlaces(makeArgs());
    expect(result.length).toBeGreaterThan(0);
    // Each result should be a RankedPlace with score and visibility
    for (const place of result) {
      expect(place).toHaveProperty("score");
      expect(place).toHaveProperty("visibility");
      expect(place).toHaveProperty("openNow");
    }
  });

  it("deduplicates places with same name and coordinates", async () => {
    mockFetch.mockResolvedValue(
      mapboxResponse([
        makeFeature("f1", "Duplicate Spot", -71.41, 41.82),
        makeFeature("f2", "Duplicate Spot", -71.41, 41.82),
        makeFeature("f3", "Duplicate Spot", -71.41, 41.82),
      ]),
    );

    const result = await discoverPlaces(makeArgs());
    const names = result.filter((p) => p.name === "Duplicate Spot");
    expect(names.length).toBe(1);
  });

  it("filters out features with missing coordinates", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "bad",
            text: "No Coords",
            geometry: { type: "Point", coordinates: [] },
            properties: { name: "No Coords" },
          },
          makeFeature("good", "Has Coords", -71.41, 41.82),
        ],
      }),
    });

    const result = await discoverPlaces(makeArgs());
    expect(result.every((p) => p.name !== "No Coords")).toBe(true);
  });
});

describe("discovery cache", () => {
  it("returns cached results on second call (no fetch)", async () => {
    mockFetch.mockResolvedValue(
      mapboxResponse([makeFeature("c1", "Cached Bar", -71.41, 41.82, "bar")]),
    );

    const args = makeArgs();
    const first = await discoverPlaces(args);
    const callsAfterFirst = mockFetch.mock.calls.length;

    const second = await discoverPlaces(args);
    // No new fetch calls
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
  });

  it("cache expires after TTL (5 minutes)", async () => {
    mockFetch.mockResolvedValue(
      mapboxResponse([makeFeature("t1", "TTL Bar", -71.41, 41.82, "bar")]),
    );

    const args = makeArgs();
    await discoverPlaces(args);
    const callsAfterFirst = mockFetch.mock.calls.length;

    // Advance past 10-minute TTL
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    await discoverPlaces(args);
    // Should have made new fetch calls
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("evicts oldest entry when cache exceeds max size (30)", async () => {
    // Fill cache with 30 unique entries
    for (let i = 0; i < 30; i++) {
      mockFetch.mockResolvedValue(
        mapboxResponse([
          makeFeature(`e${i}`, `Place ${i}`, -71.41 + i * 0.01, 41.82),
        ]),
      );
      await discoverPlaces(
        makeArgs({
          bbox: [-71.42 + i * 0.1, 41.81, -71.39 + i * 0.1, 41.84],
        }),
      );
    }

    const callsAfter30 = mockFetch.mock.calls.length;

    // Add 31st entry — should evict the first
    mockFetch.mockResolvedValue(
      mapboxResponse([makeFeature("e30", "Place 30", -71.0, 41.82)]),
    );
    await discoverPlaces(
      makeArgs({
        bbox: [-68.0, 41.81, -67.9, 41.84],
      }),
    );

    // Now re-request the first entry — should be evicted, triggering new fetch
    mockFetch.mockResolvedValue(
      mapboxResponse([makeFeature("e0", "Place 0", -71.41, 41.82)]),
    );
    const callsBefore = mockFetch.mock.calls.length;
    await discoverPlaces(makeArgs());
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("cache key excludes hour (same bbox+query = cache hit)", async () => {
    mockFetch.mockResolvedValue(
      mapboxResponse([makeFeature("h1", "Hour Bar", -71.41, 41.82, "bar")]),
    );

    const args = makeArgs({ hour: 10 });
    await discoverPlaces(args);
    const callsAfterFirst = mockFetch.mock.calls.length;

    // Same bbox, different hour → should be cache hit
    await discoverPlaces(makeArgs({ hour: 22 }));
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("discovery error handling", () => {
  it("returns empty array when Mapbox returns non-OK status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "Rate limited",
    });

    const result = await discoverPlaces(makeArgs());
    expect(result).toEqual([]);
  });

  it("returns empty array when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await discoverPlaces(makeArgs());
    expect(result).toEqual([]);
  });

  it("handles response with no features field", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ type: "FeatureCollection" }),
    });

    const result = await discoverPlaces(makeArgs());
    expect(result).toEqual([]);
  });
});
