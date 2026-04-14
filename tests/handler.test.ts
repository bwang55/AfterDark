import { describe, expect, it, vi, beforeAll } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// Set env vars before handler module loads (vi.hoisted runs before imports)
vi.hoisted(() => {
  process.env.ALLOW_ORIGIN = "https://afterdark.test";
  process.env.MAPBOX_ACCESS_TOKEN = "";
});

// Mock discoverPlaces so we never call Mapbox
vi.mock("@/lib/discovery", () => ({
  discoverPlaces: vi.fn().mockResolvedValue([]),
}));

import { handler } from "@/services/api/handler";

// ── Helpers ────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<{
    method: string;
    query: Record<string, string>;
  }> = {},
): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method: overrides.method ?? "GET" },
    },
    queryStringParameters: overrides.query ?? {},
  } as unknown as APIGatewayProxyEventV2;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body ?? "{}");
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("handler", () => {
  describe("OPTIONS preflight", () => {
    it("returns 200", async () => {
      const result = await handler(makeEvent({ method: "OPTIONS" }));
      expect(result.statusCode).toBe(200);
    });
  });

  describe("CORS headers", () => {
    it("includes CORS headers when ALLOW_ORIGIN is set", async () => {
      const result = await handler(makeEvent());
      const headers = result.headers as Record<string, string>;
      expect(headers["access-control-allow-origin"]).toBe(
        "https://afterdark.test",
      );
      expect(headers["access-control-allow-methods"]).toBe("GET,OPTIONS");
    });
  });

  describe("default query parameters", () => {
    it("uses default hour=22 and limit=40 when not provided", async () => {
      const result = await handler(makeEvent());
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      expect(body.count).toBeGreaterThan(0);
      expect(Array.isArray(body.places)).toBe(true);
      expect(body.places.length).toBeLessThanOrEqual(40);
    });
  });

  describe("query parameter parsing", () => {
    it("respects time parameter", async () => {
      const result = await handler(makeEvent({ query: { time: "10" } }));
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      // At 10am, some places should be open
      expect(body.places.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", async () => {
      const result = await handler(makeEvent({ query: { limit: "3" } }));
      const body = parseBody(result);
      expect(body.places.length).toBeLessThanOrEqual(3);
    });

    it("filters by tags", async () => {
      const result = await handler(
        makeEvent({ query: { tags: "Late Night", time: "23" } }),
      );
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      // All returned places should have the tag
      for (const place of body.places) {
        expect(place.tags).toContain("Late Night");
      }
    });

    it("filters by search query (q)", async () => {
      const result = await handler(
        makeEvent({ query: { q: "Morning Rituals" } }),
      );
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      expect(body.query).toBe("Morning Rituals");
      if (body.places.length > 0) {
        expect(body.places[0].name).toBe("Morning Rituals");
      }
    });
  });

  describe("input validation / clamping", () => {
    it("clamps hour below 0 to 0", async () => {
      const result = await handler(makeEvent({ query: { time: "-5" } }));
      expect(result.statusCode).toBe(200);
    });

    it("clamps hour above 24 to 24", async () => {
      const result = await handler(makeEvent({ query: { time: "30" } }));
      expect(result.statusCode).toBe(200);
    });

    it("clamps limit to at least 1", async () => {
      const result = await handler(makeEvent({ query: { limit: "0" } }));
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      expect(body.places.length).toBeLessThanOrEqual(1);
    });

    it("ignores non-numeric time", async () => {
      const result = await handler(makeEvent({ query: { time: "abc" } }));
      const body = parseBody(result);
      // Falls back to default hour=22
      expect(result.statusCode).toBe(200);
      expect(body.count).toBeGreaterThan(0);
    });
  });

  describe("response shape", () => {
    it("returns places array, count, and optional query", async () => {
      const result = await handler(makeEvent());
      const body = parseBody(result);
      expect(body).toHaveProperty("places");
      expect(body).toHaveProperty("count");
      expect(Array.isArray(body.places)).toBe(true);
      expect(typeof body.count).toBe("number");
      expect(body.count).toBe(body.places.length);
    });

    it("each place has required fields", async () => {
      const result = await handler(makeEvent({ query: { limit: "1" } }));
      const body = parseBody(result);
      if (body.places.length > 0) {
        const place = body.places[0];
        expect(place).toHaveProperty("id");
        expect(place).toHaveProperty("name");
        expect(place).toHaveProperty("coordinates");
        expect(place).toHaveProperty("tags");
        expect(place).toHaveProperty("openNow");
        expect(place).toHaveProperty("score");
        expect(place).toHaveProperty("visibility");
      }
    });

    it("content-type is application/json", async () => {
      const result = await handler(makeEvent());
      const headers = result.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
    });
  });

  describe("bbox filtering", () => {
    it("filters places within bbox", async () => {
      // NYC area bbox that should contain SEED_PLACES
      const result = await handler(
        makeEvent({
          query: { bbox: "-74.1,40.7,-73.9,40.8", time: "14" },
        }),
      );
      const body = parseBody(result);
      expect(result.statusCode).toBe(200);
      for (const place of body.places) {
        expect(place.coordinates.lng).toBeGreaterThanOrEqual(-74.1);
        expect(place.coordinates.lng).toBeLessThanOrEqual(-73.9);
        expect(place.coordinates.lat).toBeGreaterThanOrEqual(40.7);
        expect(place.coordinates.lat).toBeLessThanOrEqual(40.8);
      }
    });

    it("returns empty for bbox with no places", async () => {
      const result = await handler(
        makeEvent({
          query: { bbox: "100,50,101,51" },
        }),
      );
      const body = parseBody(result);
      expect(body.places).toHaveLength(0);
    });

    it("ignores malformed bbox", async () => {
      const result = await handler(
        makeEvent({ query: { bbox: "not,a,valid,bbox" } }),
      );
      const body = parseBody(result);
      // Should fall back to no bbox filter → return some places
      expect(result.statusCode).toBe(200);
    });
  });
});
