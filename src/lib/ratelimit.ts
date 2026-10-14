/**
 * Small in-memory sliding-window limiter. Rankcall runs as one process on one machine (SQLite is a single
 * writer), so memory is the right place for it; move it to the database if the app ever runs on several machines.
 */
type Bucket = number[];
const store: Map<string, Bucket> = ((globalThis as { __rankcallLimits?: Map<string, Bucket> }).__rankcallLimits ??= new Map());

export interface LimitResult { ok: boolean; retryAfterSeconds: number; remaining: number }

/** Records one attempt for `key` and says whether it is within `limit` attempts per `windowMs`. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    store.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)), remaining: 0 };
  }
  recent.push(now);
  store.set(key, recent);
  if (store.size > 50_000) for (const [k, v] of store) if (!v.some((t) => now - t < windowMs)) store.delete(k);
  return { ok: true, retryAfterSeconds: 0, remaining: limit - recent.length };
}

/** Clears a key, for example after a successful sign-in. */
export function reset(key: string) {
  store.delete(key);
}

/** The caller's IP from the proxy headers set by Fly.io or a reverse proxy; "unknown" when absent. */
export function clientIp(h: { get(name: string): string | null }): string {
  return h.get('fly-client-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
}
