import 'server-only';
/**
 * Request handlers for the Google connection. Each route file is a one-line wrapper around one of
 * these, with the real session, ownership check and fetch passed in as `deps`, so tests can drive the
 * same code with a mocked fetch and fake sessions. Relative imports only (tests run without the @ alias).
 */
import type { GscImport } from '../../engine/ingest/gsc';
import type { Ga4Import } from '../../engine/ingest/ga4';
import { exchangeCode, emailFromIdToken, fetchEmail, ga4ReportAll, GoogleApiError, gscQueryAll, listGa4Properties, listGscSites, refreshAccessToken, revokeToken, type Fetch } from './api';
import { ga4Import, gscPagesImport, gscQueriesImport } from './convert';
import { appSecret, buildAuthUrl, googleConfig, gscPropertyMatches, newNonce, pkcePair, SCOPE_GA4, SCOPE_GSC, scopeList, signState, STATE_TTL_MS, syncPeriods, verifyState, type Env } from './core';
import { deleteConnection, getConnection, getTokens, markReconnect, saveAccessToken, saveConnection, savePendingState, setProperties, takePendingState, type SyncCounts } from './store';

export interface Deps {
  env: Env;
  fetch: Fetch;
  /** The signed-in user, from the session cookie. Never from the request body. */
  viewer: () => Promise<{ userId: string; accountId: string; email?: string } | null>;
  /** The site only if it belongs to the viewer's account. */
  siteFor: (siteId: string) => Promise<{ id: string; domain: string } | null>;
  /** Start a background sync and return its job id. */
  startSync: (siteId: string) => { id: string } | { error: string };
  now: () => number;
}

const SITE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function baseUrl(req: Request, env: Env): string {
  return (env.APP_URL || new URL(req.url).origin).replace(/\/+$/, '');
}
const redirect = (url: string, status = 302) => new Response(null, { status, headers: { location: url, 'cache-control': 'no-store' } });
const toData = (req: Request, env: Env, siteId: string, google: string, status = 302) => redirect(`${baseUrl(req, env)}/sites/${encodeURIComponent(siteId)}/data?google=${encodeURIComponent(google)}#google`, status);
const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

/** POSTs come from our own forms. Cross-site POSTs carry no session (SameSite=Lax), and a foreign Origin is refused too. */
function foreignOrigin(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(req.url).origin]);
  if (env.APP_URL) allowed.add(new URL(env.APP_URL).origin);
  return !allowed.has(origin);
}

async function formOf(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const f = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  f?.forEach((v, k) => { if (typeof v === 'string') out[k] = v; });
  return out;
}

// ---------- connect and callback ----------

/** GET /api/google/connect?site=<id>: send the user to Google's consent screen. */
export async function handleConnect(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('site') ?? '';
  const viewer = await deps.viewer();
  if (!viewer) return redirect(`${baseUrl(req, deps.env)}/login`);
  if (!SITE_ID.test(siteId)) return notFound();
  const site = await deps.siteFor(siteId);
  if (!site) return notFound();
  const cfg = googleConfig(deps.env, url.origin);
  if (!cfg) return toData(req, deps.env, siteId, 'not_configured');
  const secret = appSecret(deps.env);
  const { verifier, challenge } = pkcePair();
  const nonce = newNonce();
  const expiresAt = deps.now() + STATE_TTL_MS;
  savePendingState(nonce, viewer.userId, siteId, verifier, expiresAt, deps.env);
  const state = signState({ nonce, siteId, userId: viewer.userId, expiresAt }, secret);
  return redirect(buildAuthUrl(cfg, state, challenge));
}

/** GET /api/google/callback: check state, swap the code (with the PKCE verifier) for tokens, store them encrypted. */
export async function handleCallback(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const base = baseUrl(req, deps.env);
  const viewer = await deps.viewer();
  if (!viewer) return redirect(`${base}/login`);
  const cfg = googleConfig(deps.env, url.origin);
  if (!cfg) return redirect(`${base}/sites?google=not_configured`);
  const p = verifyState(url.searchParams.get('state'), appSecret(deps.env), viewer.userId, deps.now());
  if (!p) return redirect(`${base}/sites?google=state_invalid`);
  const site = await deps.siteFor(p.s);
  if (!site) return notFound();
  const verifier = takePendingState(p.n, viewer.userId, site.id, deps.now(), deps.env);
  if (!verifier) return toData(req, deps.env, site.id, 'state_invalid');
  if (url.searchParams.get('error')) return toData(req, deps.env, site.id, 'denied');
  const code = url.searchParams.get('code');
  if (!code) return toData(req, deps.env, site.id, 'denied');

  let tokens;
  try {
    tokens = await exchangeCode(deps.fetch, cfg, code, verifier);
  } catch {
    return toData(req, deps.env, site.id, 'exchange_failed');
  }
  if (!tokens.refresh_token) {
    await revokeToken(deps.fetch, tokens.access_token);
    return toData(req, deps.env, site.id, 'no_refresh_token');
  }
  const scopes = scopeList(tokens.scope);
  if (!scopes.includes(SCOPE_GSC) && !scopes.includes(SCOPE_GA4)) {
    await revokeToken(deps.fetch, tokens.refresh_token);
    return toData(req, deps.env, site.id, 'scopes_missing');
  }
  const email = emailFromIdToken(tokens.id_token, cfg.clientId) ?? (await fetchEmail(deps.fetch, tokens.access_token).catch(() => null));
  saveConnection({ siteId: site.id, accountId: viewer.accountId, userId: viewer.userId, email, scopes, refreshToken: tokens.refresh_token, accessToken: tokens.access_token, expiresAt: deps.now() + (tokens.expires_in ?? 3600) * 1000 }, deps.env);
  return toData(req, deps.env, site.id, scopes.includes(SCOPE_GSC) && scopes.includes(SCOPE_GA4) ? 'connected' : 'connected_partial');
}

// ---------- access tokens ----------

/** A valid access token, refreshed when it expires within a minute. Marks the connection for reconnecting if Google refuses. */
export async function accessTokenFor(siteId: string, deps: Pick<Deps, 'env' | 'fetch' | 'now'>): Promise<string> {
  const cfg = googleConfig(deps.env, deps.env.APP_URL || 'http://localhost');
  if (!cfg) throw new Error('Google is not configured on this server.');
  const t = getTokens(siteId, deps.env);
  if (!t) throw new Error('Google is not connected for this site.');
  if (t.accessToken && t.expiresAt - 60_000 > deps.now()) return t.accessToken;
  try {
    const r = await refreshAccessToken(deps.fetch, cfg, t.refreshToken);
    saveAccessToken(siteId, r.access_token, deps.now() + (r.expires_in ?? 3600) * 1000, r.refresh_token, deps.env);
    return r.access_token;
  } catch (err) {
    if (err instanceof GoogleApiError && (err.code === 'invalid_grant' || err.status === 400 || err.status === 401)) {
      markReconnect(siteId, 'Google access was revoked or expired. Connect Google again.');
      throw new Error('Google access was revoked or expired. Connect Google again.');
    }
    throw err;
  }
}

// ---------- disconnect ----------

/** POST /api/google/disconnect (site): revoke at Google, then delete the row and its tokens. */
export async function handleDisconnect(req: Request, deps: Deps): Promise<Response> {
  if (foreignOrigin(req, deps.env)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const viewer = await deps.viewer();
  if (!viewer) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const { site: siteId = '' } = await formOf(req);
  if (!SITE_ID.test(siteId)) return notFound();
  const site = await deps.siteFor(siteId);
  if (!site) return notFound();
  let revoked = false;
  try {
    const t = getTokens(site.id, deps.env);
    if (t) revoked = await revokeToken(deps.fetch, t.refreshToken);
  } catch { /* still delete locally */ }
  deleteConnection(site.id);
  return toData(req, deps.env, site.id, revoked ? 'disconnected' : 'disconnected_local', 303);
}

// ---------- properties ----------

export interface PropertyLists {
  gsc: { siteUrl: string; permissionLevel: string; matches: boolean }[];
  ga4: { property: string; displayName: string; account: string }[];
  selected: { gsc: string | null; ga4: string | null };
  errors: string[];
}

export async function propertyLists(site: { id: string; domain: string }, deps: Pick<Deps, 'env' | 'fetch' | 'now'>): Promise<PropertyLists> {
  const conn = getConnection(site.id);
  const token = await accessTokenFor(site.id, deps);
  const errors: string[] = [];
  const has = (s: string) => conn?.scopes.includes(s) ?? false;
  const [gsc, ga4] = await Promise.all([
    has(SCOPE_GSC) ? listGscSites(deps.fetch, token).catch((e: Error) => { errors.push(e.message); return []; }) : Promise.resolve([]),
    has(SCOPE_GA4) ? listGa4Properties(deps.fetch, token).catch((e: Error) => { errors.push(e.message); return []; }) : Promise.resolve([]),
  ]);
  return {
    gsc: gsc.map((s) => ({ ...s, matches: gscPropertyMatches(s.siteUrl, site.domain) })).sort((a, b) => Number(b.matches) - Number(a.matches)),
    ga4,
    selected: { gsc: conn?.gsc_property ?? null, ga4: conn?.ga4_property ?? null },
    errors,
  };
}

/** GET /api/google/properties?site=<id>: the properties this Google account can read. */
export async function handleListProperties(req: Request, deps: Deps): Promise<Response> {
  const viewer = await deps.viewer();
  if (!viewer) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get('site') ?? '';
  if (!SITE_ID.test(siteId)) return notFound();
  const site = await deps.siteFor(siteId);
  if (!site) return notFound();
  if (!getConnection(site.id)) return Response.json({ error: 'Google is not connected for this site.' }, { status: 409 });
  try {
    return Response.json(await propertyLists(site, deps), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not reach Google.' }, { status: 502 });
  }
}

/** POST /api/google/properties (site, gsc, ga4): choose one of each. Only properties the account can read are accepted. */
export async function handleSaveProperties(req: Request, deps: Deps): Promise<Response> {
  if (foreignOrigin(req, deps.env)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const viewer = await deps.viewer();
  if (!viewer) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const f = await formOf(req);
  const siteId = f.site ?? '';
  if (!SITE_ID.test(siteId)) return notFound();
  const site = await deps.siteFor(siteId);
  if (!site) return notFound();
  if (!getConnection(site.id)) return toData(req, deps.env, site.id, 'not_connected', 303);
  let lists: PropertyLists;
  try {
    lists = await propertyLists(site, deps);
  } catch {
    return toData(req, deps.env, site.id, 'google_unreachable', 303);
  }
  const gsc = f.gsc ? lists.gsc.find((s) => s.siteUrl === f.gsc) : undefined;
  const ga4 = f.ga4 ? lists.ga4.find((p) => p.property === f.ga4) : undefined;
  if ((f.gsc && !gsc) || (f.ga4 && !ga4)) return toData(req, deps.env, site.id, 'property_invalid', 303);
  setProperties(site.id, gsc?.siteUrl ?? null, ga4?.property ?? null, ga4 ? `${ga4.displayName}${ga4.account ? ` (${ga4.account})` : ''}` : null);
  return toData(req, deps.env, site.id, gsc && !gsc.matches ? 'saved_mismatch' : 'saved', 303);
}

// ---------- sync ----------

/** POST /api/google/sync (site): start a background sync. */
export async function handleSync(req: Request, deps: Deps): Promise<Response> {
  if (foreignOrigin(req, deps.env)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const viewer = await deps.viewer();
  if (!viewer) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const { site: siteId = '' } = await formOf(req);
  if (!SITE_ID.test(siteId)) return notFound();
  const site = await deps.siteFor(siteId);
  if (!site) return notFound();
  const conn = getConnection(site.id);
  if (!conn) return toData(req, deps.env, site.id, 'not_connected', 303);
  if (!conn.gsc_property && !conn.ga4_property) return toData(req, deps.env, site.id, 'choose_properties', 303);
  const r = deps.startSync(site.id);
  return toData(req, deps.env, site.id, 'id' in r ? 'sync_started' : 'sync_running', 303);
}

export const ROW_CAPS = { gscPages: 50_000, gscQueries: 100_000, ga4: 100_000 } as const;

export interface FetchedData { gscPages: GscImport | null; gscQueries: GscImport | null; ga4: Ga4Import | null; counts: SyncCounts }

/**
 * Pull the last 28 days (and the 28 before, for decay) from the chosen properties and convert them to
 * the CSV importer shapes. Saving is the caller's job.
 */
export async function fetchGoogleData(siteId: string, deps: Pick<Deps, 'env' | 'fetch' | 'now'>, progress: (done: number, total: number, msg: string) => void = () => {}): Promise<FetchedData> {
  const conn = getConnection(siteId);
  if (!conn) throw new Error('Google is not connected for this site.');
  if (conn.status === 'reconnect') throw new Error('Google access was revoked or expired. Connect Google again.');
  if (!conn.gsc_property && !conn.ga4_property) throw new Error('Choose a Search Console property or GA4 property first.');
  const total = 1 + (conn.gsc_property ? 3 : 0) + (conn.ga4_property ? 1 : 0);
  let step = 0;
  progress(step, total, 'Refreshing Google access');
  const token = await accessTokenFor(siteId, deps);
  progress(++step, total, 'Access ready');
  const { current, previous } = syncPeriods(new Date(deps.now()));
  const label = `${current.start} to ${current.end}`;
  const out: FetchedData = { gscPages: null, gscQueries: null, ga4: null, counts: { gscPages: 0, gscQueries: 0, ga4Pages: 0, period: current } };

  if (conn.gsc_property) {
    const prop = conn.gsc_property;
    progress(step, total, 'Search Console: pages, last 28 days');
    const cur = await gscQueryAll(deps.fetch, token, prop, { startDate: current.start, endDate: current.end, dimensions: ['page'] }, ROW_CAPS.gscPages, (n) => progress(step, total, `Search Console: ${n.toLocaleString('en-GB')} pages`));
    progress(++step, total, 'Search Console: pages, previous 28 days');
    const prev = await gscQueryAll(deps.fetch, token, prop, { startDate: previous.start, endDate: previous.end, dimensions: ['page'] }, ROW_CAPS.gscPages);
    progress(++step, total, 'Search Console: pages and queries');
    const pq = await gscQueryAll(deps.fetch, token, prop, { startDate: current.start, endDate: current.end, dimensions: ['page', 'query'] }, ROW_CAPS.gscQueries, (n) => progress(step, total, `Search Console: ${n.toLocaleString('en-GB')} page and query rows`));
    progress(++step, total, 'Search Console done');
    const src = `Synced from Search Console (${prop}), ${label}, compared with ${previous.start} to ${previous.end}.`;
    const pageNotes = [src, ...(cur.capped || prev.capped ? [`Stopped at ${ROW_CAPS.gscPages.toLocaleString('en-GB')} pages per period; pages beyond that are missing.`] : [])];
    out.gscPages = gscPagesImport(cur.rows, prev.rows, current, pageNotes);
    out.gscQueries = gscQueriesImport(pq.rows, current, pq.capped ? [`Stopped at ${ROW_CAPS.gscQueries.toLocaleString('en-GB')} page and query rows, ordered by clicks.`] : []);
    out.counts.gscPages = out.gscPages.pages.length;
    out.counts.gscQueries = out.gscQueries.pageQueries.length;
  }
  if (conn.ga4_property) {
    progress(step, total, 'GA4: landing pages');
    const r = await ga4ReportAll(deps.fetch, token, conn.ga4_property, current, ROW_CAPS.ga4);
    out.ga4 = ga4Import(r.rows, r.metrics, current, [`Synced from GA4 (${conn.ga4_property_name ?? conn.ga4_property}), ${label}.`, ...(r.capped ? [`Stopped at ${ROW_CAPS.ga4.toLocaleString('en-GB')} landing pages.`] : [])]);
    out.counts.ga4Pages = out.ga4.pages.length;
    progress(++step, total, 'GA4 done');
  }
  return out;
}
