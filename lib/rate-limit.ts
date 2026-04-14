/**
 * Rate limiter with pluggable backends.
 *
 * - Default: in-memory sliding window (dev / single-instance)
 * - Production: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   for distributed fixed-window limiting via Upstash Redis REST API.
 *   (DynamoDB is another viable option — swap createRedisBackend for a
 *   DynamoDB UpdateItem-based counter if your infra prefers it.)
 *
 * All backends expose an async interface so callers use `await limiter.check(ip)`.
 */

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per key per window */
  max: number;
  /** Key prefix to namespace different limiters in Redis (default "rl") */
  prefix?: string;
}

export interface RateLimiter {
  /** Returns `true` if the request is allowed, `false` if rate-limited. */
  check(key: string): Promise<boolean>;
  /** How many requests remain for this key in the current window */
  remaining(key: string): Promise<number>;
}

// ── In-memory backend (dev / single-instance fallback) ─────────────────

function createMemoryBackend({ windowMs, max }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, number[]>();
  const SWEEP_INTERVAL = 60_000;
  let lastSweep = Date.now();

  function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL) return;
    lastSweep = now;
    for (const [key, timestamps] of buckets) {
      if (
        timestamps.length === 0 ||
        now - timestamps[timestamps.length - 1] > windowMs
      ) {
        buckets.delete(key);
      }
    }
  }

  return {
    async check(key: string): Promise<boolean> {
      const now = Date.now();
      sweep(now);

      let ts = buckets.get(key);
      if (!ts) {
        ts = [];
        buckets.set(key, ts);
      }

      const cutoff = now - windowMs;
      while (ts.length > 0 && ts[0] <= cutoff) ts.shift();

      if (ts.length >= max) return false;
      ts.push(now);
      return true;
    },

    async remaining(key: string): Promise<number> {
      const now = Date.now();
      const ts = buckets.get(key);
      if (!ts) return max;
      const active = ts.filter((t) => t > now - windowMs).length;
      return Math.max(0, max - active);
    },
  };
}

// ── Upstash Redis backend (distributed / multi-instance) ───────────────

function createRedisBackend({
  windowMs,
  max,
  prefix = "rl",
}: RateLimiterOptions): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  async function pipeline(
    commands: string[][],
  ): Promise<{ result: number | string | null }[]> {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Redis pipeline error: ${res.status}`);
    return res.json();
  }

  return {
    async check(key: string): Promise<boolean> {
      // Fixed-window counter: windowId = floor(now / windowMs)
      const windowId = Math.floor(Date.now() / windowMs);
      const rKey = `${prefix}:${key}:${windowId}`;
      const ttlSec = Math.ceil(windowMs / 1000);

      try {
        const results = await pipeline([
          ["INCR", rKey],
          ["EXPIRE", rKey, String(ttlSec)],
        ]);
        const count =
          typeof results[0]?.result === "number" ? results[0].result : 1;
        return count <= max;
      } catch {
        // Redis unavailable → fail open (allow the request)
        console.warn("Rate limiter: Redis unavailable, allowing request");
        return true;
      }
    },

    async remaining(key: string): Promise<number> {
      const windowId = Math.floor(Date.now() / windowMs);
      const rKey = `${prefix}:${key}:${windowId}`;

      try {
        const res = await fetch(
          `${url}/get/${encodeURIComponent(rKey)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        const count = parseInt(String(data.result ?? "0"), 10);
        return Math.max(0, max - count);
      } catch {
        return max;
      }
    },
  };
}

// ── Factory ────────────────────────────────────────────────────────────

const HAS_REDIS = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  if (HAS_REDIS) return createRedisBackend(opts);
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "Rate limiter using in-memory backend in production. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed limiting.",
    );
  }
  return createMemoryBackend(opts);
}

/** Extract client IP from Next.js request headers */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
