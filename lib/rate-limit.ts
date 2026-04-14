/**
 * Simple in-memory sliding-window rate limiter.
 * No external dependencies — suitable for single-instance deployments
 * (Vercel serverless, single Node process, etc.).
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
 *   // in route handler:
 *   const ip = req.headers.get("x-forwarded-for") ?? "unknown";
 *   if (!limiter.check(ip)) return NextResponse.json({error:"Too many requests"},{status:429});
 */

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per IP per window */
  max: number;
}

interface BucketEntry {
  timestamps: number[];
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions) {
  const buckets = new Map<string, BucketEntry>();

  // Sweep stale entries every 60s to prevent memory leak from many unique IPs
  const SWEEP_INTERVAL = 60_000;
  let lastSweep = Date.now();

  function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL) return;
    lastSweep = now;
    for (const [key, entry] of buckets) {
      if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > windowMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    /**
     * Returns `true` if the request is allowed, `false` if rate-limited.
     */
    check(key: string): boolean {
      const now = Date.now();
      sweep(now);

      let entry = buckets.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        buckets.set(key, entry);
      }

      // Remove timestamps outside the window
      const cutoff = now - windowMs;
      while (entry.timestamps.length > 0 && entry.timestamps[0] <= cutoff) {
        entry.timestamps.shift();
      }

      if (entry.timestamps.length >= max) {
        return false;
      }

      entry.timestamps.push(now);
      return true;
    },

    /** How many requests remain for this key in the current window */
    remaining(key: string): number {
      const now = Date.now();
      const entry = buckets.get(key);
      if (!entry) return max;
      const cutoff = now - windowMs;
      const active = entry.timestamps.filter((t) => t > cutoff).length;
      return Math.max(0, max - active);
    },
  };
}

/** Extract client IP from Next.js request headers */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
