import 'server-only';
import { getViewer, siteForRequest } from '@/lib/auth';
import { ingestApiData } from '@/lib/ingest';
import { createJob, getJob, updateJob, type Job } from '@/lib/repo';
import { db, now } from '@/lib/db';
import { fetchGoogleData, type Deps } from './flow';
import { revokeToken } from './api';
import { deleteConnection, getConnection, getTokens, recordSync, type SyncCounts } from './store';

export const GOOGLE_SYNC_JOB = 'google_sync';

/** Real dependencies for the route handlers: the session cookie, the account ownership check and global fetch. */
export function realDeps(): Deps {
  return {
    env: process.env,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(60_000) }),
    viewer: async () => {
      const v = await getViewer();
      return v ? { userId: v.user.id, accountId: v.account.id, email: v.user.email } : null;
    },
    siteFor: async (id) => siteForRequest(id),
    startSync: (siteId) => {
      const running = runningGoogleSync(siteId);
      if (running) return { error: 'A Google sync is already running.' };
      return startGoogleSyncJob(siteId);
    },
    now: () => Date.now(),
  };
}

/**
 * Fetch the last 28 days from the site's chosen Search Console and GA4 properties and store them as
 * uploads (source google_api) of the usual kinds, so scoring works unchanged. Safe for the weekly
 * scheduler to call: it never throws for a missing connection, it returns `{ ok: false, error }`.
 */
export async function syncGoogleForSite(siteId: string, progress?: (done: number, total: number, msg: string) => void): Promise<{ ok: true; counts: SyncCounts } | { ok: false; error: string }> {
  if (!getConnection(siteId)) return { ok: false, error: 'Google is not connected for this site.' };
  const deps = realDeps();
  try {
    const data = await fetchGoogleData(siteId, deps, progress);
    const p = data.counts.period;
    const label = (what: string) => `Google API: ${what}${p ? `, ${p.start} to ${p.end}` : ''}`;
    if (data.gscPages) ingestApiData(siteId, { kind: 'gsc_pages', data: data.gscPages, label: label('Search Console pages') });
    if (data.gscQueries) ingestApiData(siteId, { kind: 'gsc_queries', data: data.gscQueries, label: label('Search Console page and query') });
    if (data.ga4) ingestApiData(siteId, { kind: 'ga4', data: data.ga4, label: label('GA4 landing pages') });
    recordSync(siteId, { ok: true, counts: data.counts });
    return { ok: true, counts: data.counts };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordSync(siteId, { ok: false, error });
    return { ok: false, error };
  }
}

/** Run syncGoogleForSite as a background job with progress (shown by JobProgress on the data page). */
export function startGoogleSyncJob(siteId: string): Job {
  const job = createJob(siteId, GOOGLE_SYNC_JOB);
  updateJob(job.id, { provider: 'google', message: 'Connecting to Google' });
  let last = 0;
  void (async () => {
    const res = await syncGoogleForSite(siteId, (done, total, message) => {
      if (Date.now() - last > 250 || done >= total) { last = Date.now(); updateJob(job.id, { progress: done, total, message }); }
    });
    if (res.ok) {
      const c = res.counts;
      updateJob(job.id, { status: 'done', message: `Synced ${c.gscPages.toLocaleString('en-GB')} pages, ${c.gscQueries.toLocaleString('en-GB')} page and query rows and ${c.ga4Pages.toLocaleString('en-GB')} GA4 landing pages`, finished_at: now() });
    } else {
      updateJob(job.id, { status: 'failed', error: res.error, finished_at: now() });
    }
  })();
  return getJob(job.id) ?? job;
}

export function runningGoogleSync(siteId: string): Job | null {
  const j = db().prepare(`select id from jobs where site_id = ? and type = ? and status = 'running' order by created_at desc limit 1`).get(siteId, GOOGLE_SYNC_JOB) as { id: string } | undefined;
  return j ? getJob(j.id) : null;
}

/** Before a site is deleted: revoke its Google grant at Google (best effort), then remove the stored tokens. */
export async function revokeGoogleForSite(siteId: string): Promise<void> {
  if (!getConnection(siteId)) return;
  try {
    const t = getTokens(siteId);
    if (t) await revokeToken(realDeps().fetch, t.refreshToken);
  } catch { /* the local tokens are deleted either way */ }
  deleteConnection(siteId);
}
