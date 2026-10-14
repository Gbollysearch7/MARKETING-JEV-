/**
 * Thin Google REST client using fetch only (no googleapis package). Every function takes the fetch to
 * use, so tests pass a mock. Endpoints and fields, from Google's public reference docs:
 * - OAuth 2.0 web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
 * - Search Console sites.list: https://developers.google.com/webmaster-tools/v1/sites/list
 * - Search Console searchanalytics.query (rowLimit 1 to 25,000, startRow paging):
 *   https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 * - GA4 Admin accountSummaries.list (pageSize max 200, pageToken):
 *   https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list
 * - GA4 Data runReport (limit up to 250,000, offset paging):
 *   https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 * - GA4 dimension and metric names (landingPage, sessions, engagedSessions, keyEvents, totalRevenue):
 *   https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL, type GoogleConfig } from './core';

export type Fetch = typeof fetch;

export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/** Google's error body, reduced to a safe message. Never includes request bodies or tokens. */
async function fail(res: Response, what: string): Promise<never> {
  let code: string | undefined;
  let detail = '';
  try {
    const j = (await res.json()) as { error?: string | { message?: string; status?: string }; error_description?: string };
    if (typeof j.error === 'string') { code = j.error; detail = j.error_description ?? j.error; }
    else if (j.error) { code = j.error.status; detail = j.error.message ?? ''; }
  } catch { /* not JSON */ }
  throw new GoogleApiError(`${what} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`, res.status, code);
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

export interface TokenResponse { access_token: string; expires_in: number; refresh_token?: string; scope?: string; token_type?: string; id_token?: string }

export async function exchangeCode(f: Fetch, cfg: GoogleConfig, code: string, verifier: string): Promise<TokenResponse> {
  const res = await f(GOOGLE_TOKEN_URL, { method: 'POST', headers: FORM, body: form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) });
  if (!res.ok) return fail(res, 'Google sign-in');
  const t = (await res.json()) as TokenResponse;
  if (!t.access_token) throw new GoogleApiError('Google sign-in returned no access token', 502);
  return t;
}

export async function refreshAccessToken(f: Fetch, cfg: Pick<GoogleConfig, 'clientId' | 'clientSecret'>, refreshToken: string): Promise<TokenResponse> {
  const res = await f(GOOGLE_TOKEN_URL, { method: 'POST', headers: FORM, body: form({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  if (!res.ok) return fail(res, 'Refreshing Google access');
  return (await res.json()) as TokenResponse;
}

/** Revoke at Google. Revoking the refresh token also revokes its access tokens. */
export async function revokeToken(f: Fetch, token: string): Promise<boolean> {
  try {
    const res = await f(GOOGLE_REVOKE_URL, { method: 'POST', headers: FORM, body: form({ token }) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The account email from the id_token. The token came straight from Google's token endpoint over TLS,
 * so per OpenID Connect its signature need not be re-checked; issuer and audience still are.
 */
export function emailFromIdToken(idToken: string | undefined, clientId: string): string | null {
  if (!idToken) return null;
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string; aud?: string; iss?: string };
    if (p.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss ?? '')) return null;
    return typeof p.email === 'string' ? p.email : null;
  } catch {
    return null;
  }
}

export async function fetchEmail(f: Fetch, accessToken: string): Promise<string | null> {
  const res = await f(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string };
  return j.email ?? null;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

// ---------- Search Console ----------

export interface GscSite { siteUrl: string; permissionLevel: string }

/** Properties the user can read. Unverified entries are left out. */
export async function listGscSites(f: Fetch, token: string): Promise<GscSite[]> {
  const res = await f('https://www.googleapis.com/webmasters/v3/sites', { headers: bearer(token) });
  if (!res.ok) return fail(res, 'Listing Search Console properties');
  const j = (await res.json()) as { siteEntry?: GscSite[] };
  return (j.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

export const GSC_PAGE_SIZE = 25_000;

/** searchanalytics.query, paging with startRow until a short page or `maxRows`. Returns rows and whether the cap cut it short. */
export async function gscQueryAll(f: Fetch, token: string, siteUrl: string, body: { startDate: string; endDate: string; dimensions: string[] }, maxRows: number, onPage?: (rows: number) => void): Promise<{ rows: GscRow[]; capped: boolean }> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows: GscRow[] = [];
  for (let startRow = 0; startRow < maxRows; startRow += GSC_PAGE_SIZE) {
    const rowLimit = Math.min(GSC_PAGE_SIZE, maxRows - startRow);
    const res = await f(url, { method: 'POST', headers: bearer(token), body: JSON.stringify({ ...body, type: 'web', rowLimit, startRow }) });
    if (!res.ok) return fail(res, 'Search Console query');
    const page = ((await res.json()) as { rows?: GscRow[] }).rows ?? [];
    rows.push(...page);
    onPage?.(rows.length);
    if (page.length < rowLimit) return { rows, capped: false };
  }
  return { rows, capped: rows.length >= maxRows };
}

// ---------- GA4 ----------

export interface Ga4Property { property: string; displayName: string; account: string }

/** Every GA4 property the user can read, flattened from accountSummaries. */
export async function listGa4Properties(f: Fetch, token: string): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
    u.searchParams.set('pageSize', '200');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const res = await f(u.toString(), { headers: bearer(token) });
    if (!res.ok) return fail(res, 'Listing GA4 properties');
    const j = (await res.json()) as { accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[]; nextPageToken?: string };
    for (const a of j.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) out.push({ property: p.property, displayName: p.displayName ?? p.property, account: a.displayName ?? '' });
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

export interface Ga4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }
export const GA4_METRICS = ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'] as const;
export const GA4_PAGE_SIZE = 100_000;

/** runReport by landing page, paging with offset. `property` is "properties/123". */
export async function ga4ReportAll(f: Fetch, token: string, property: string, range: { start: string; end: string }, maxRows: number): Promise<{ rows: Ga4Row[]; metrics: string[]; capped: boolean }> {
  if (!/^properties\/\d+$/.test(property)) throw new GoogleApiError('Invalid GA4 property', 400);
  const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;
  const rows: Ga4Row[] = [];
  let metrics: string[] = [...GA4_METRICS];
  for (let offset = 0; offset < maxRows; offset += GA4_PAGE_SIZE) {
    const limit = Math.min(GA4_PAGE_SIZE, maxRows - offset);
    const res = await f(url, {
      method: 'POST', headers: bearer(token),
      body: JSON.stringify({ dateRanges: [{ startDate: range.start, endDate: range.end }], dimensions: [{ name: 'landingPage' }], metrics: GA4_METRICS.map((name) => ({ name })), limit: String(limit), offset: String(offset) }),
    });
    if (!res.ok) return fail(res, 'GA4 report');
    const j = (await res.json()) as { rows?: Ga4Row[]; rowCount?: number; metricHeaders?: { name: string }[] };
    if (j.metricHeaders?.length) metrics = j.metricHeaders.map((m) => m.name);
    const page = j.rows ?? [];
    rows.push(...page);
    const total = j.rowCount ?? rows.length;
    if (page.length < limit || rows.length >= total) return { rows, metrics, capped: false };
  }
  return { rows, metrics, capped: rows.length >= maxRows };
}
