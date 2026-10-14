import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { db, newId, now } from './db';
import { accountStatus, TRIAL_DAYS } from './plans';
import type { Site } from './repo';

export const SESSION_COOKIE = 'sdp_session';
const SESSION_DAYS = 30;

export interface Account { id: string; name: string; plan: string; trial_ends_at: string; subscription_status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; created_at: string }
export interface User { id: string; account_id: string; email: string; name: string; role: string; created_at: string }
export interface Viewer { user: User; account: Account; status: ReturnType<typeof accountStatus> }

const normEmail = (e: string) => e.trim().toLowerCase();

export function findUserByEmail(email: string): (User & { password_hash: string }) | null {
  return (db().prepare('select * from users where email = ?').get(normEmail(email)) as (User & { password_hash: string }) | undefined) ?? null;
}

export function getAccount(id: string): Account | null {
  return (db().prepare('select * from accounts where id = ?').get(id) as Account | undefined) ?? null;
}

/** Create an account on the free trial with its owner. The very first account claims sites made before sign-in existed. */
export function createAccountWithOwner(input: { company: string; name: string; email: string; password: string }): User {
  const d = db();
  const firstEver = (d.prepare('select count(*) n from accounts').get() as { n: number }).n === 0;
  const account = { id: newId(), name: input.company, plan: 'trial', trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(), created_at: now() };
  const user = { id: newId(), account_id: account.id, email: normEmail(input.email), name: input.name, password_hash: hashPassword(input.password), role: 'owner', created_at: now() };
  d.transaction(() => {
    d.prepare('insert into accounts (id, name, plan, trial_ends_at, created_at) values (@id, @name, @plan, @trial_ends_at, @created_at)').run(account);
    d.prepare('insert into users (id, account_id, email, name, password_hash, role, created_at) values (@id, @account_id, @email, @name, @password_hash, @role, @created_at)').run(user);
    if (firstEver) d.prepare('update sites set account_id = ? where account_id is null').run(account.id);
  })();
  const { password_hash: _ph, ...safe } = user;
  void _ph;
  return safe;
}

export function checkCredentials(email: string, password: string): User | null {
  const u = findUserByEmail(email);
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = verifyPassword(password, u?.password_hash ?? 'scrypt$00$00');
  if (!u || !ok) return null;
  const { password_hash: _ph, ...safe } = u;
  void _ph;
  return safe;
}

/** Start a session. Only callable from a Server Action or Route Handler, where cookies can be set. */
export async function startSession(userId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db().prepare('insert into sessions (token_hash, user_id, expires_at, created_at) values (?, ?, ?, ?)').run(sha256(token), userId, expires.toISOString(), now());
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db().prepare('delete from sessions where token_hash = ?').run(sha256(token));
  store.delete(SESSION_COOKIE);
}

/** The signed-in viewer for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db().prepare(`select u.id, u.account_id, u.email, u.name, u.role, u.created_at, s.expires_at
    from sessions s join users u on u.id = s.user_id where s.token_hash = ?`).get(sha256(token)) as (User & { expires_at: string }) | undefined;
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  const { expires_at: _e, ...user } = row;
  void _e;
  const account = getAccount(user.account_id);
  if (!account) return null;
  return { user, account, status: accountStatus(account) };
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect('/login');
  return v;
}

/** The site, if it belongs to the viewer's account. Anyone else gets a 404, so ids cannot be probed. */
export async function requireSite(siteId: string): Promise<{ viewer: Viewer; site: Site }> {
  const viewer = await requireViewer();
  const site = db().prepare('select * from sites where id = ? and account_id = ?').get(siteId, viewer.account.id) as Site | undefined;
  if (!site) notFound();
  return { viewer, site };
}

/** For Route Handlers: the site or null, without redirects. */
export async function siteForRequest(siteId: string): Promise<Site | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (db().prepare('select * from sites where id = ? and account_id = ?').get(siteId, viewer.account.id) as Site | undefined) ?? null;
}
