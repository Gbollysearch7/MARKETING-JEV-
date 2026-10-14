import { db } from '@/lib/db';
import pkg from '../../../../package.json';

// Must run on every request: it reports whether the database answers right now.
export const dynamic = 'force-dynamic';

/** Liveness and readiness for the load balancer: no secrets, no data, just whether SQLite answers. */
export function GET() {
  let ok = false;
  try {
    ok = (db().prepare('select 1 as one').get() as { one: number } | undefined)?.one === 1;
  } catch {
    ok = false;
  }
  return Response.json(
    { ok, db: ok, version: process.env.APP_VERSION || pkg.version },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
