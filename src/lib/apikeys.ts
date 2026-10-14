import 'server-only';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, newId, now } from './db';
import { accountStatus, freeLocalCopy } from './plans';
import type { RawPage } from '../modules/gate/parse';
import { parseWebflowEvent, verifyWebflowSignature, webflowItemToPage } from '../modules/gate/webflow';

/**
 * Account API keys and CMS webhook connections.
 *
 * Keys look like `rk_live_<43 base62 chars>` (32 random bytes). Only the SHA-256 of the key and its last four
 * characters are stored; the full key is shown once, when it is created. Webflow webhook secrets have to be
 * readable to check HMAC signatures, so they are stored encrypted (AES-256-GCM, key derived from APP_SECRET).
 */

// ---------- scopes ----------

export const SCOPES = {
  'gate:check': 'Score pages with the Quality gate',
  'sites:read': 'List the account’s sites',
} as const;
export type Scope = keyof typeof SCOPES;
export const isScope = (s: string): s is Scope => s in SCOPES;
/** Scopes every key gets regardless of what was chosen (listing sites reveals nothing the key cannot already score). */
const IMPLIED: Scope[] = ['sites:read'];

// ---------- key material ----------

export const KEY_PREFIX = 'rk_live_';
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KEY_RE = /^rk_live_[0-9A-Za-z]{43}$/;

function base62(buf: Buffer, width: number): string {
  let n = BigInt(`0x${buf.toString('hex')}`);
  let out = '';
  const zero = BigInt(0);
  const base = BigInt(62);
  while (n > zero) { out = B62[Number(n % base)] + out; n /= base; }
  return out.padStart(width, '0');
}

/** A new key: 32 random bytes in base62 (always 43 characters) after the prefix. */
export function generateApiKey(): string {
  return KEY_PREFIX + base62(randomBytes(32), 43);
}

export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const looksLikeApiKey = (s: string) => KEY_RE.test(s);

/** The key from `Authorization: Bearer rk_live_…`, or null. Keys are never read from the query string. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return m ? m[1] : null;
}

/** True when the URL carries something that looks like a credential, which is refused rather than ignored. */
export function keyInQuery(url: string): boolean {
  const u = new URL(url, 'http://x');
  for (const [k, v] of u.searchParams) if (/^(api[_-]?key|key|token|access[_-]?token)$/i.test(k) || v.startsWith(KEY_PREFIX)) return true;
  return false;
}

// ---------- secret encryption (Webflow signing secrets) ----------

export class MissingAppSecretError extends Error {
  constructor() { super('APP_SECRET is not set, so webhook secrets cannot be stored or checked.'); }
}

function encKey(): Buffer {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new MissingAppSecretError();
  return Buffer.from(hkdfSync('sha256', s, 'rankcall', 'webhook-secret-v1', 32));
}

export const appSecretConfigured = () => Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 16);

/** `v1.<iv>.<tag>.<ciphertext>` in base64url. Throws MissingAppSecretError when APP_SECRET is unset (fail closed). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, ct] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || ct == null) throw new Error('Unreadable secret');
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// ---------- rate limiting (per key, in memory) ----------

export const RATE_LIMIT = { requests: 60, windowMs: 60_000 };

/** Sliding-window limiter. One instance per process; good enough for a single server. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit = RATE_LIMIT.requests, private windowMs = RATE_LIMIT.windowMs) {}
  /** Records a hit when allowed. `retryAfter` is in whole seconds. */
  take(id: string, nowMs = Date.now()): { ok: true; remaining: number } | { ok: false; retryAfter: number } {
    const arr = (this.hits.get(id) ?? []).filter((t) => t > nowMs - this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(id, arr);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((arr[0] + this.windowMs - nowMs) / 1000)) };
    }
    arr.push(nowMs);
    this.hits.set(id, arr);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some((t) => t > nowMs - this.windowMs)) this.hits.delete(k);
    return { ok: true, remaining: this.limit - arr.length };
  }
}

const g = globalThis as unknown as { __rkLimiter?: RateLimiter };
export const limiter = () => (g.__rkLimiter ??= new RateLimiter());

// ---------- storage ----------

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists apikeys_keys (
      id text primary key,
      account_id text not null references accounts(id) on delete cascade,
      name text not null,
      key_hash text not null unique,
      last4 text not null,
      scopes text not null default '[]',
      created_by text,
      created_at text not null,
      expires_at text,
      last_used_at text,
      revoked_at text
    );
    create index if not exists apikeys_keys_account on apikeys_keys(account_id, created_at);
    create table if not exists apikeys_usage (
      id integer primary key autoincrement,
      key_id text not null references apikeys_keys(id) on delete cascade,
      account_id text not null,
      route text not null,
      status integer not null,
      created_at text not null
    );
    create index if not exists apikeys_usage_key on apikeys_usage(key_id, created_at);
    create table if not exists apikeys_webflow (
      id text primary key,
      site_id text not null references sites(id) on delete cascade,
      name text not null,
      collection_id text,
      collection_name text,
      body_field text not null,
      meta_field text,
      secret_enc text not null,
      secret_last4 text not null,
      created_at text not null,
      last_event_at text,
      last_status text,
      events integer not null default 0
    );
    create index if not exists apikeys_webflow_site on apikeys_webflow(site_id);
    create table if not exists apikeys_webflow_events (
      id integer primary key autoincrement,
      connection_id text not null references apikeys_webflow(id) on delete cascade,
      signature text not null unique,
      trigger text not null,
      item_id text,
      batch_id text,
      status text not null,
      created_at text not null
    );
  `);
  ready = true;
}

export interface ApiKeyRow {
  id: string; account_id: string; name: string; last4: string; scopes: Scope[]; created_by: string | null;
  created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null;
}

const parseKey = (r: Record<string, unknown>): ApiKeyRow => {
  const { key_hash: _h, ...rest } = r;
  void _h;
  return { ...(rest as unknown as ApiKeyRow), scopes: JSON.parse((r.scopes as string) || '[]') };
};

/** Create a key. The returned `token` is the only time the full key exists outside the caller's hands. */
export function createApiKey(input: { accountId: string; userId?: string | null; name: string; scopes: string[]; expiresInDays?: number | null }): { key: ApiKeyRow; token: string } {
  ensureSchema();
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error('Give the key a name, such as “WordPress production”.');
  const scopes = [...new Set(input.scopes)].filter(isScope);
  if (!scopes.length) throw new Error('Choose at least one scope.');
  const token = generateApiKey();
  const id = newId();
  const expires = input.expiresInDays && input.expiresInDays > 0 ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null;
  db().prepare('insert into apikeys_keys (id, account_id, name, key_hash, last4, scopes, created_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.accountId, name, hashApiKey(token), token.slice(-4), JSON.stringify(scopes), input.userId ?? null, now(), expires);
  return { key: getApiKey(input.accountId, id)!, token };
}

export function getApiKey(accountId: string, id: string): ApiKeyRow | null {
  ensureSchema();
  const r = db().prepare('select * from apikeys_keys where id = ? and account_id = ?').get(id, accountId) as Record<string, unknown> | undefined;
  return r ? parseKey(r) : null;
}

export function listApiKeys(accountId: string, nowMs = Date.now()): (ApiKeyRow & { uses_30d: number; expired: boolean })[] {
  ensureSchema();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  return (db().prepare(`select k.*, (select count(*) from apikeys_usage u where u.key_id = k.id and u.created_at >= ?) uses_30d
    from apikeys_keys k where k.account_id = ? order by k.revoked_at is not null, k.created_at desc`).all(since, accountId) as Record<string, unknown>[])
    .map((r) => ({ ...parseKey(r), uses_30d: r.uses_30d as number, expired: r.expires_at != null && Date.parse(r.expires_at as string) <= nowMs }));
}

/** Revoke a key in the given account. Returns false when no such active key exists there. */
export function revokeApiKey(accountId: string, id: string): boolean {
  ensureSchema();
  return db().prepare('update apikeys_keys set revoked_at = ? where id = ? and account_id = ? and revoked_at is null').run(now(), id, accountId).changes > 0;
}

export function recentUsage(accountId: string, limit = 20): { key_id: string; key_name: string; route: string; status: number; created_at: string }[] {
  ensureSchema();
  return db().prepare(`select u.key_id, k.name key_name, u.route, u.status, u.created_at from apikeys_usage u join apikeys_keys k on k.id = u.key_id
    where u.account_id = ? order by u.id desc limit ?`).all(accountId, limit) as { key_id: string; key_name: string; route: string; status: number; created_at: string }[];
}

/**
 * Find an active key by its value. The lookup is by SHA-256 (an indexed equality on a hash of a 256-bit secret,
 * so timing reveals nothing useful) and the stored hash is then compared in constant time.
 */
export function findActiveKey(token: string, nowMs = Date.now()): ApiKeyRow | null {
  ensureSchema();
  if (!looksLikeApiKey(token)) return null;
  const h = hashApiKey(token);
  const r = db().prepare('select * from apikeys_keys where key_hash = ?').get(h) as (Record<string, unknown> & { key_hash: string }) | undefined;
  if (!r) return null;
  const a = Buffer.from(r.key_hash, 'hex');
  const b = Buffer.from(h, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (r.revoked_at) return null;
  if (r.expires_at && Date.parse(r.expires_at as string) <= nowMs) return null;
  return parseKey(r);
}

export function logKeyUsage(keyId: string, accountId: string, route: string, status: number) {
  ensureSchema();
  const t = now();
  const d = db();
  d.prepare('insert into apikeys_usage (key_id, account_id, route, status, created_at) values (?, ?, ?, ?, ?)').run(keyId, accountId, route.slice(0, 200), status, t);
  d.prepare('update apikeys_keys set last_used_at = ? where id = ?').run(t, keyId);
  // Keep 90 days of usage.
  if (Math.random() < 0.01) d.prepare('delete from apikeys_usage where created_at < ?').run(new Date(Date.now() - 90 * 86_400_000).toISOString());
}

// ---------- request authentication ----------

export type ApiErrorCode =
  | 'missing_api_key' | 'invalid_api_key' | 'key_in_query' | 'insufficient_scope' | 'account_inactive' | 'rate_limited'
  | 'site_not_found' | 'invalid_json' | 'invalid_request' | 'no_usable_pages' | 'scoring_failed' | 'not_found'
  | 'not_configured' | 'invalid_signature' | 'stale_timestamp' | 'connection_not_found';

/** Every API error has the same shape: a stable `code` for programs and a sentence for people. */
export function apiError(status: number, code: ApiErrorCode, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return Response.json({ error: message, code, ...extra }, { status, headers });
}

export interface KeyAuth { key: ApiKeyRow; accountId: string; status: ReturnType<typeof accountStatus> }

/**
 * Authenticate a request by API key: Bearer header only, valid and unrevoked key, the scope, rate limit,
 * then an active account (402 otherwise). On failure returns the Response to send (already logged when a key was found).
 */
export function authenticateKey(request: Request, scope: Scope, route: string): KeyAuth | Response {
  if (keyInQuery(request.url)) return apiError(400, 'key_in_query', 'Send the API key in the Authorization header (Bearer), never in the URL. Revoke any key that has appeared in a URL.');
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return apiError(401, 'missing_api_key', 'Add the header Authorization: Bearer rk_live_… with a key from Settings → API keys.', {}, { 'WWW-Authenticate': 'Bearer' });
  const key = findActiveKey(token);
  if (!key) return apiError(401, 'invalid_api_key', 'This API key is not valid. It may have been revoked or expired.', {}, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
  const fail = (res: Response) => { logKeyUsage(key.id, key.account_id, route, res.status); return res; };
  const rl = limiter().take(key.id);
  if (!rl.ok) return fail(apiError(429, 'rate_limited', `Too many requests: ${RATE_LIMIT.requests} a minute per key. Try again in ${rl.retryAfter} s.`, { retry_after: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) }));
  if (!key.scopes.includes(scope) && !IMPLIED.includes(scope)) return fail(apiError(403, 'insufficient_scope', `This key does not have the ${scope} scope.`, { required_scope: scope }));
  const account = db().prepare('select plan, trial_ends_at, subscription_status from accounts where id = ?').get(key.account_id) as { plan: string; trial_ends_at: string; subscription_status: string | null } | undefined;
  if (!account) return fail(apiError(401, 'invalid_api_key', 'This API key is not valid.'));
  const status = accountStatus(account, Date.now(), { billingOn: !freeLocalCopy() });
  if (!status.active) return fail(apiError(402, 'account_inactive', status.onTrial ? 'The free trial on this account has ended. Choose a plan in Rankcall to keep scoring pages.' : 'The subscription on this account is not active. Update billing in Rankcall to keep scoring pages.'));
  return { key, accountId: key.account_id, status };
}

// ---------- Webflow connections ----------

export interface WebflowConnection {
  id: string; site_id: string; name: string; collection_id: string | null; collection_name: string | null; body_field: string; meta_field: string | null;
  secret_last4: string; created_at: string; last_event_at: string | null; last_status: string | null; events: number;
}

const FIELD_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function createWebflowConnection(siteId: string, input: { name?: string; secret: string; bodyField: string; metaField?: string; collectionId?: string; collectionName?: string }): WebflowConnection {
  ensureSchema();
  const secret = input.secret.trim();
  if (secret.length < 16 || /\s/.test(secret)) throw new Error('Paste the webhook’s signing secret from Webflow (it is at least 16 characters, with no spaces).');
  const body = input.bodyField.trim();
  if (!FIELD_RE.test(body)) throw new Error('Enter the slug of the rich-text field to score, for example post-body.');
  const meta = (input.metaField ?? '').trim();
  if (meta && !FIELD_RE.test(meta)) throw new Error('The summary field must be a field slug, for example post-summary.');
  const collId = (input.collectionId ?? '').trim();
  if (collId && !/^[a-f0-9]{24}$/i.test(collId)) throw new Error('A Webflow collection id is 24 hexadecimal characters; leave it empty to accept every collection.');
  const enc = encryptSecret(secret); // throws MissingAppSecretError when APP_SECRET is unset
  const id = `wf_${randomBytes(12).toString('base64url')}`;
  const collName = (input.collectionName ?? '').trim().slice(0, 60);
  db().prepare(`insert into apikeys_webflow (id, site_id, name, collection_id, collection_name, body_field, meta_field, secret_enc, secret_last4, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, siteId, (input.name ?? '').trim().slice(0, 80) || collName || 'Webflow', collId || null, collName || null, body, meta || null, enc, secret.slice(-4), now());
  return getWebflowConnection(id)!;
}

export function getWebflowConnection(id: string): WebflowConnection | null {
  ensureSchema();
  const r = db().prepare('select * from apikeys_webflow where id = ?').get(id) as (WebflowConnection & { secret_enc?: string }) | undefined;
  if (!r) return null;
  delete r.secret_enc;
  return r;
}

export function listWebflowConnections(siteId: string): WebflowConnection[] {
  ensureSchema();
  return (db().prepare('select * from apikeys_webflow where site_id = ? order by created_at desc').all(siteId) as (WebflowConnection & { secret_enc?: string })[])
    .map((r) => { delete r.secret_enc; return r; });
}

export function deleteWebflowConnection(siteId: string, id: string): boolean {
  ensureSchema();
  return db().prepare('delete from apikeys_webflow where id = ? and site_id = ?').run(id, siteId).changes > 0;
}

/** The decrypted signing secret. Throws MissingAppSecretError when APP_SECRET is unset. */
export function webflowSecret(id: string): string | null {
  ensureSchema();
  const r = db().prepare('select secret_enc from apikeys_webflow where id = ?').get(id) as { secret_enc: string } | undefined;
  return r ? decryptSecret(r.secret_enc) : null;
}

/** Record a delivery. Returns false when this exact signed delivery was already seen (a retry or a replay). */
export function recordWebflowEvent(connectionId: string, signature: string, trigger: string, itemId: string | null, batchId: string | null, status: string): boolean {
  ensureSchema();
  const d = db();
  const res = d.prepare('insert or ignore into apikeys_webflow_events (connection_id, signature, trigger, item_id, batch_id, status, created_at) values (?, ?, ?, ?, ?, ?, ?)')
    .run(connectionId, signature.toLowerCase(), trigger, itemId, batchId, status, now());
  if (!res.changes) return false;
  d.prepare('update apikeys_webflow set last_event_at = ?, last_status = ?, events = events + 1 where id = ?').run(now(), status, connectionId);
  return true;
}

/** Attach the outcome (and the gate batch, if any) to a recorded delivery. */
export function setWebflowEventResult(connectionId: string, signature: string, batchId: string | null, status: string) {
  ensureSchema();
  const d = db();
  d.prepare('update apikeys_webflow_events set batch_id = ?, status = ? where connection_id = ? and signature = ?').run(batchId, status, connectionId, signature.toLowerCase());
  d.prepare('update apikeys_webflow set last_status = ? where id = ?').run(status, connectionId);
}

// ---------- route handlers (kept here, with injected scoring, so they are unit-tested without Next) ----------

export type GateRunner = (siteId: string, body: unknown, source: 'api' | 'wordpress') => Promise<{ status: number; json: Record<string, unknown> }>;

/** POST /api/v1/gate/check: { site, pages, name?, source? } with a gate:check key. */
export async function handleV1GateCheck(request: Request, run: GateRunner, route = '/api/v1/gate/check'): Promise<Response> {
  const auth = authenticateKey(request, 'gate:check', route);
  if (auth instanceof Response) return auth;
  const send = (res: Response) => { logKeyUsage(auth.key.id, auth.accountId, route, res.status); return res; };
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return send(apiError(400, 'invalid_json', 'Send a JSON object: { "site": "<site id>", "pages": [...] }'));
  }
  if (typeof body.site !== 'string' || !body.site.trim()) return send(apiError(400, 'invalid_request', '`site` must be the id of one of your sites (GET /api/v1/sites lists them).'));
  const site = db().prepare('select id from sites where id = ? and account_id = ?').get(body.site.trim(), auth.accountId) as { id: string } | undefined;
  if (!site) return send(apiError(404, 'site_not_found', 'No site with this id in the API key’s account. GET /api/v1/sites lists them.'));
  const res = await run(site.id, body, body.source === 'wordpress' ? 'wordpress' : 'api');
  return send(Response.json(res.json, { status: res.status }));
}

/** GET /api/v1/sites: the key account's sites. */
export function handleV1Sites(request: Request, route = '/api/v1/sites'): Response {
  const auth = authenticateKey(request, 'sites:read', route);
  if (auth instanceof Response) return auth;
  const sites = db().prepare('select id, name, domain from sites where account_id = ? order by name').all(auth.accountId) as { id: string; name: string; domain: string }[];
  logKeyUsage(auth.key.id, auth.accountId, route, 200);
  return Response.json({ sites });
}

/** Starts scoring one page in the background; returns the batch, or a reason the page is unusable. */
export type WebhookScorer = (siteId: string, name: string, page: RawPage, notes: string[]) => { id: string } | string;

const MAX_WEBHOOK_BODY = 1_000_000;

/**
 * POST /api/v1/webhooks/webflow/<connectionId>: verify the x-webflow-signature HMAC with the connection's
 * secret, then score the CMS item as a batch named "Webflow · <collection>". Answers 200 quickly (Webflow
 * retries anything else); each signed delivery is processed once.
 */
export async function handleWebflowWebhook(request: Request, connectionId: string, score: WebhookScorer): Promise<Response> {
  if (!appSecretConfigured()) return apiError(503, 'not_configured', 'Webhooks are not configured on this server (APP_SECRET is not set).');
  const conn = /^wf_[A-Za-z0-9_-]{16}$/.test(connectionId) ? getWebflowConnection(connectionId) : null;
  if (!conn) return apiError(404, 'connection_not_found', 'No Webflow connection at this URL. Copy the webhook URL again from the Quality gate page.');

  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BODY) return apiError(400, 'invalid_request', 'The webhook body is too large.');
  let secret: string | null;
  try { secret = webflowSecret(conn.id); } catch (e) {
    return apiError(503, 'not_configured', e instanceof MissingAppSecretError ? e.message : 'The stored webhook secret cannot be read. Delete the connection and create it again.');
  }
  const sig = request.headers.get('x-webflow-signature') ?? '';
  const check = verifyWebflowSignature(raw, request.headers.get('x-webflow-timestamp'), sig, secret ?? '');
  if (check === 'missing') return apiError(401, 'invalid_signature', 'Missing x-webflow-signature or x-webflow-timestamp. Webhooks created in the Webflow dashboard are unsigned; create the webhook with a site token or app so it is signed.');
  if (check === 'invalid') return apiError(401, 'invalid_signature', 'The signature does not match this connection’s secret.');
  if (check === 'stale') return apiError(401, 'stale_timestamp', 'The request is more than 5 minutes old.');

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return apiError(400, 'invalid_json', 'The webhook body is not JSON.'); }
  const event = parseWebflowEvent(body);
  if (!event) return apiError(400, 'invalid_request', 'Not a Webflow webhook event (no triggerType).');

  // A retry, or a captured request replayed within the 5-minute window, never scores twice.
  if (!recordWebflowEvent(conn.id, sig, event.triggerType, event.item?.id ?? null, null, 'received')) return Response.json({ ok: true, duplicate: true });
  const done = (status: string, extra: Record<string, unknown> = {}, batchId: string | null = null) => {
    setWebflowEventResult(conn.id, sig, batchId, status);
    return Response.json({ ok: true, status, ...extra });
  };

  const account = db().prepare('select a.plan, a.trial_ends_at, a.subscription_status from sites s join accounts a on a.id = s.account_id where s.id = ?').get(conn.site_id) as { plan: string; trial_ends_at: string; subscription_status: string | null } | undefined;
  if (!account || !accountStatus(account, Date.now(), { billingOn: !freeLocalCopy() }).active) {
    setWebflowEventResult(conn.id, sig, null, 'account_inactive');
    return apiError(402, 'account_inactive', 'The Rankcall account for this connection has no active plan, so the item was not scored.');
  }
  if (!event.item) return done('ignored', { reason: `${event.triggerType} carries no CMS item to score.` });
  if (event.item.isArchived) return done('ignored', { reason: 'Archived items are not scored.' });
  if (conn.collection_id && event.item.collectionId !== conn.collection_id) return done('ignored', { reason: 'The item is from a collection this connection does not watch.' });

  const { page, template, notes } = webflowItemToPage(event.item, { bodyField: conn.body_field, metaField: conn.meta_field, collectionName: conn.collection_name });
  const batch = score(conn.site_id, `Webflow · ${template}`, page, notes);
  if (typeof batch === 'string') return done('unusable', { reason: batch });
  return done('scoring', { batch_id: batch.id }, batch.id);
}
