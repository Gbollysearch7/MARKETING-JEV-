import 'server-only';
import { createHash } from 'node:crypto';
import { db, now } from '../db';
import { appSecret, decryptSecret, encryptSecret, type Env } from './core';

/**
 * Google connections, one per Rankcall site. Refresh and access tokens are stored only encrypted
 * (AES-256-GCM, key derived from APP_SECRET). Pending OAuth starts are kept server side and used once.
 */

let ready = false;
function ensureSchema() {
  if (ready) return;
  db().exec(`
    create table if not exists google_connections (
      site_id text primary key references sites(id) on delete cascade,
      account_id text not null,
      user_id text not null,
      google_email text,
      scopes text not null default '',
      refresh_token_enc text not null,
      access_token_enc text,
      access_expires_at integer,
      gsc_property text,
      ga4_property text,
      ga4_property_name text,
      status text not null default 'connected',     -- connected | reconnect
      last_sync_at text,
      last_sync_status text,                         -- done | failed
      last_sync_error text,
      last_sync_counts text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists google_oauth_states (
      nonce_hash text primary key,
      user_id text not null,
      site_id text not null references sites(id) on delete cascade,
      verifier_enc text not null,
      expires_at integer not null,
      created_at text not null
    );
  `);
  ready = true;
}

export interface SyncCounts { gscPages: number; gscQueries: number; ga4Pages: number; period?: { start: string; end: string } }

export interface GoogleConnection {
  site_id: string; account_id: string; user_id: string; google_email: string | null; scopes: string[];
  gsc_property: string | null; ga4_property: string | null; ga4_property_name: string | null; status: 'connected' | 'reconnect';
  last_sync_at: string | null; last_sync_status: 'done' | 'failed' | null; last_sync_error: string | null; last_sync_counts: SyncCounts | null;
  created_at: string; updated_at: string;
}

type Row = Omit<GoogleConnection, 'scopes' | 'last_sync_counts'> & { scopes: string; last_sync_counts: string | null; refresh_token_enc: string; access_token_enc: string | null; access_expires_at: number | null };

const toConn = (r: Row): GoogleConnection => {
  const { refresh_token_enc: _r, access_token_enc: _a, access_expires_at: _e, ...rest } = r;
  void _r; void _a; void _e;
  return { ...rest, scopes: r.scopes.split(' ').filter(Boolean), last_sync_counts: r.last_sync_counts ? (JSON.parse(r.last_sync_counts) as SyncCounts) : null };
};

const nonceHash = (n: string) => createHash('sha256').update(n).digest('hex');

// ---------- pending OAuth starts ----------

export function savePendingState(nonce: string, userId: string, siteId: string, verifier: string, expiresAt: number, env: Env = process.env) {
  ensureSchema();
  const d = db();
  d.prepare('delete from google_oauth_states where expires_at < ?').run(Date.now());
  d.prepare('insert into google_oauth_states (nonce_hash, user_id, site_id, verifier_enc, expires_at, created_at) values (?, ?, ?, ?, ?, ?)')
    .run(nonceHash(nonce), userId, siteId, encryptSecret(verifier, appSecret(env)), expiresAt, now());
}

/** Take (and delete) a pending start. Returns the PKCE verifier only if it matches the user and site and has not expired. */
export function takePendingState(nonce: string, userId: string, siteId: string, nowMs = Date.now(), env: Env = process.env): string | null {
  ensureSchema();
  const d = db();
  const h = nonceHash(nonce);
  const row = d.prepare('select * from google_oauth_states where nonce_hash = ?').get(h) as { user_id: string; site_id: string; verifier_enc: string; expires_at: number } | undefined;
  if (!row) return null;
  d.prepare('delete from google_oauth_states where nonce_hash = ?').run(h);
  if (row.user_id !== userId || row.site_id !== siteId || row.expires_at < nowMs) return null;
  return decryptSecret(row.verifier_enc, appSecret(env));
}

// ---------- connections ----------

export function getConnection(siteId: string): GoogleConnection | null {
  ensureSchema();
  const r = db().prepare('select * from google_connections where site_id = ?').get(siteId) as Row | undefined;
  return r ? toConn(r) : null;
}

export function saveConnection(input: { siteId: string; accountId: string; userId: string; email: string | null; scopes: string[]; refreshToken: string; accessToken: string; expiresAt: number }, env: Env = process.env) {
  ensureSchema();
  const key = appSecret(env);
  const t = now();
  // Reconnecting keeps the chosen properties and sync history.
  db().prepare(`insert into google_connections (site_id, account_id, user_id, google_email, scopes, refresh_token_enc, access_token_enc, access_expires_at, status, created_at, updated_at)
    values (@site_id, @account_id, @user_id, @email, @scopes, @rt, @at, @exp, 'connected', @t, @t)
    on conflict(site_id) do update set account_id = excluded.account_id, user_id = excluded.user_id, google_email = excluded.google_email, scopes = excluded.scopes,
      refresh_token_enc = excluded.refresh_token_enc, access_token_enc = excluded.access_token_enc, access_expires_at = excluded.access_expires_at, status = 'connected', updated_at = excluded.updated_at`)
    .run({ site_id: input.siteId, account_id: input.accountId, user_id: input.userId, email: input.email, scopes: input.scopes.join(' '), rt: encryptSecret(input.refreshToken, key), at: encryptSecret(input.accessToken, key), exp: input.expiresAt, t });
}

/** Decrypted tokens for server-side use only. Never send these to a client. */
export function getTokens(siteId: string, env: Env = process.env): { refreshToken: string; accessToken: string | null; expiresAt: number } | null {
  ensureSchema();
  const r = db().prepare('select refresh_token_enc, access_token_enc, access_expires_at from google_connections where site_id = ?').get(siteId) as Pick<Row, 'refresh_token_enc' | 'access_token_enc' | 'access_expires_at'> | undefined;
  if (!r) return null;
  const key = appSecret(env);
  return { refreshToken: decryptSecret(r.refresh_token_enc, key), accessToken: r.access_token_enc ? decryptSecret(r.access_token_enc, key) : null, expiresAt: r.access_expires_at ?? 0 };
}

/** Raw encrypted columns, for tests that check nothing is stored in plain text. */
export function rawTokenColumns(siteId: string): { refresh_token_enc: string; access_token_enc: string | null } | null {
  ensureSchema();
  return (db().prepare('select refresh_token_enc, access_token_enc from google_connections where site_id = ?').get(siteId) as { refresh_token_enc: string; access_token_enc: string | null } | undefined) ?? null;
}

export function saveAccessToken(siteId: string, accessToken: string, expiresAt: number, refreshToken?: string, env: Env = process.env) {
  ensureSchema();
  const key = appSecret(env);
  db().prepare(`update google_connections set access_token_enc = ?, access_expires_at = ?, refresh_token_enc = coalesce(?, refresh_token_enc), updated_at = ? where site_id = ?`)
    .run(encryptSecret(accessToken, key), expiresAt, refreshToken ? encryptSecret(refreshToken, key) : null, now(), siteId);
}

export function markReconnect(siteId: string, error: string) {
  ensureSchema();
  db().prepare(`update google_connections set status = 'reconnect', access_token_enc = null, access_expires_at = null, last_sync_error = ?, updated_at = ? where site_id = ?`).run(error, now(), siteId);
}

export function setProperties(siteId: string, gsc: string | null, ga4: string | null, ga4Name: string | null) {
  ensureSchema();
  db().prepare('update google_connections set gsc_property = ?, ga4_property = ?, ga4_property_name = ?, updated_at = ? where site_id = ?').run(gsc, ga4, ga4Name, now(), siteId);
}

export function recordSync(siteId: string, result: { ok: true; counts: SyncCounts } | { ok: false; error: string }) {
  ensureSchema();
  const t = now();
  if (result.ok) db().prepare(`update google_connections set last_sync_at = ?, last_sync_status = 'done', last_sync_error = null, last_sync_counts = ?, updated_at = ? where site_id = ?`).run(t, JSON.stringify(result.counts), t, siteId);
  else db().prepare(`update google_connections set last_sync_at = ?, last_sync_status = 'failed', last_sync_error = ?, updated_at = ? where site_id = ?`).run(t, result.error.slice(0, 500), t, siteId);
}

export function deleteConnection(siteId: string) {
  ensureSchema();
  db().prepare('delete from google_connections where site_id = ?').run(siteId);
}

/** Sites with a usable connection and at least one chosen property, for the weekly scheduler. */
export function syncableSiteIds(): string[] {
  ensureSchema();
  return (db().prepare(`select site_id from google_connections where status = 'connected' and (gsc_property is not null or ga4_property is not null)`).all() as { site_id: string }[]).map((r) => r.site_id);
}
