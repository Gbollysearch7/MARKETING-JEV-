/**
 * Google connection core: configuration, token encryption, signed OAuth state, PKCE and the consent URL.
 * Pure Node (no Next or database imports) so it can be unit-tested directly. Relative imports only.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { hostOf } from '../../engine/ingest/url';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const SCOPE_GSC = 'https://www.googleapis.com/auth/webmasters.readonly';
export const SCOPE_GA4 = 'https://www.googleapis.com/auth/analytics.readonly';
/**
 * `openid email` are non-sensitive and only used to show which Google account is connected
 * (the email comes from the id_token). Search Console and GA4 are read-only scopes.
 */
export const SCOPES = ['openid', 'email', SCOPE_GSC, SCOPE_GA4] as const;

export const STATE_TTL_MS = 10 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

export type Env = Record<string, string | undefined>;

export interface GoogleConfig { clientId: string; clientSecret: string; appUrl: string; redirectUri: string }

/** Names of the variables still missing before Google connections can switch on (names only, never values). */
export function missingGoogleEnv(env: Env = process.env): string[] {
  const missing: string[] = [];
  if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.APP_SECRET || env.APP_SECRET.length < MIN_SECRET_LENGTH) missing.push('APP_SECRET');
  if (!env.APP_URL && env.NODE_ENV === 'production') missing.push('APP_URL');
  return missing;
}

export const googleConfigured = (env: Env = process.env) => missingGoogleEnv(env).length === 0;

/**
 * The OAuth client config, or null when not configured. The redirect URI is built from APP_URL.
 * Outside production a missing APP_URL falls back to the request origin so local testing works.
 */
export function googleConfig(env: Env = process.env, requestOrigin?: string): GoogleConfig | null {
  if (!googleConfigured(env)) return null;
  const appUrl = (env.APP_URL || requestOrigin || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(appUrl)) return null;
  return { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, appUrl, redirectUri: `${appUrl}/api/google/callback` };
}

// ---------- secrets ----------

/** APP_SECRET, or throw. Encryption and state signing fail closed when it is missing or short. */
export function appSecret(env: Env = process.env): string {
  const s = env.APP_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) throw new Error(`APP_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters.`);
  return s;
}

const deriveKey = (secret: string, purpose: string) => Buffer.from(hkdfSync('sha256', secret, 'rankcall.google.v1', purpose, 32));

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

/** AES-256-GCM with a key derived from APP_SECRET. Output: v1.<iv>.<tag>.<ciphertext>, base64url parts. */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, 'token-encryption'), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${b64u(iv)}.${b64u(cipher.getAuthTag())}.${b64u(ct)}`;
}

/** Decrypt, or throw when the secret is wrong or the blob was tampered with. */
export function decryptSecret(blob: string, secret: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unreadable encrypted token.');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, 'token-encryption'), unb64u(iv));
  decipher.setAuthTag(unb64u(tag));
  return Buffer.concat([decipher.update(unb64u(ct)), decipher.final()]).toString('utf8');
}

// ---------- PKCE ----------

/** RFC 7636 S256: a 43-character verifier and its SHA-256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64u(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}
export const pkceChallenge = (verifier: string) => b64u(createHash('sha256').update(verifier).digest());

// ---------- signed state ----------

export interface StatePayload { n: string; s: string; u: string; e: number }

/** state = base64url(JSON payload).base64url(HMAC-SHA256). Binds the nonce to the user and site and expires. */
export function signState(p: { nonce: string; siteId: string; userId: string; expiresAt: number }, secret: string): string {
  const body = b64u(Buffer.from(JSON.stringify({ n: p.nonce, s: p.siteId, u: p.userId, e: p.expiresAt } satisfies StatePayload)));
  return `${body}.${b64u(createHmac('sha256', deriveKey(secret, 'oauth-state')).update(body).digest())}`;
}

/** The payload when the signature is valid, it has not expired and it belongs to `userId`; otherwise null. */
export function verifyState(token: string | null | undefined, secret: string, userId: string, nowMs = Date.now()): StatePayload | null {
  if (!token || token.length > 1024) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', deriveKey(secret, 'oauth-state')).update(body).digest();
  const got = unb64u(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  let p: StatePayload;
  try {
    p = JSON.parse(unb64u(body).toString('utf8')) as StatePayload;
  } catch {
    return null;
  }
  if (typeof p.n !== 'string' || typeof p.s !== 'string' || typeof p.u !== 'string' || typeof p.e !== 'number') return null;
  if (p.e < nowMs) return null;
  const a = Buffer.from(p.u);
  const b = Buffer.from(userId);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return p;
}

export const newNonce = () => b64u(randomBytes(24));

// ---------- consent URL ----------

export function buildAuthUrl(cfg: Pick<GoogleConfig, 'clientId' | 'redirectUri'>, state: string, challenge: string, loginHint?: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (loginHint) u.searchParams.set('login_hint', loginHint);
  return u.toString();
}

// ---------- dates and properties ----------

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The last 28 days and the 28 days before. Search Console data lags about two days, so the
 * current window ends three days before today to use only final data.
 */
export function syncPeriods(today: Date = new Date()): { current: { start: string; end: string }; previous: { start: string; end: string } } {
  const day = 86_400_000;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = t - 3 * day;
  const start = end - 27 * day;
  return { current: { start: iso(start), end: iso(end) }, previous: { start: iso(start - 28 * day), end: iso(start - day) } };
}

/** Does a Search Console property (sc-domain:example.com or https://www.example.com/) cover this site's domain? */
export function gscPropertyMatches(siteUrl: string, domain: string): boolean {
  const d = (hostOf(domain) ?? domain).toLowerCase();
  if (siteUrl.startsWith('sc-domain:')) {
    const prop = siteUrl.slice('sc-domain:'.length).toLowerCase().replace(/^www\./, '');
    return d === prop || d.endsWith(`.${prop}`);
  }
  const h = hostOf(siteUrl);
  return Boolean(h && h.toLowerCase() === d);
}

/** Granted scopes, from the space-separated `scope` string Google returns. */
export const scopeList = (scope: string | null | undefined) => (scope ?? '').split(/\s+/).filter(Boolean);
