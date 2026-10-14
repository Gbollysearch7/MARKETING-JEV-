import { describe, expect, it } from 'vitest';
import { clientIp, hit, reset } from '../src/lib/ratelimit';

describe('rate limiter', () => {
  it('allows up to the limit in a window, then blocks with a retry time', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(hit('t:a', 10, 60_000, t0 + i).ok).toBe(true);
    const blocked = hit('t:a', 10, 60_000, t0 + 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });
  it('lets attempts through again once the oldest leaves the window', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) hit('t:b', 3, 1_000, t0);
    expect(hit('t:b', 3, 1_000, t0 + 500).ok).toBe(false);
    expect(hit('t:b', 3, 1_000, t0 + 1_001).ok).toBe(true);
  });
  it('reset clears a key', () => {
    for (let i = 0; i < 2; i++) hit('t:c', 2, 60_000);
    expect(hit('t:c', 2, 60_000).ok).toBe(false);
    reset('t:c');
    expect(hit('t:c', 2, 60_000).ok).toBe(true);
  });
  it('reads the client IP from proxy headers', () => {
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(clientIp(h({ 'fly-client-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
    expect(clientIp(h({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
    expect(clientIp(h({}))).toBe('unknown');
  });
});
