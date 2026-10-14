import type { ReactNode } from 'react';
import { JobProgress } from '@/components/JobProgress';
import { fmt, fmtDate, fmtDateTime } from '@/components/ui';
import { missingGoogleEnv, SCOPE_GA4, SCOPE_GSC } from '@/lib/google/core';
import { runningGoogleSync } from '@/lib/google/server';
import { getConnection } from '@/lib/google/store';
import { PostButton } from './PostButton';
import { PropertyPicker } from './PropertyPicker';

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: string }) {
  const cls = tone === 'ok' ? 'bg-ok-bg text-ok' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-sunken text-muted';
  const dot = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-[var(--line-input)]';
  return <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${cls}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{children}</span>;
}

function GoogleMark() {
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" className="text-ink-2" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.33ZM12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.5c-.9.6-2.05.96-3.4.96-2.6 0-4.82-1.76-5.6-4.13H3.06v2.58A10 10 0 0 0 12 22Zm-5.6-8.1a6 6 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96L6.4 13.9ZM12 5.98c1.47 0 2.8.5 3.84 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.94 5.52L6.4 10.1C7.18 7.73 9.4 5.98 12 5.98Z" /></svg>
    </span>
  );
}

/** The "Connect Google" card above the upload cards: not configured, not connected, or connected. */
export function GoogleCard({ siteId, domain }: { siteId: string; domain: string }) {
  const missing = missingGoogleEnv();
  const conn = missing.length ? null : getConnection(siteId);
  const running = conn ? runningGoogleSync(siteId) : null;

  const head = (pill: ReactNode, sub: ReactNode) => (
    <div className="flex items-start gap-3">
      <GoogleMark />
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 font-semibold">Connect Google {pill}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{sub}</p>
      </div>
    </div>
  );

  if (missing.length) {
    return (
      <section id="google" aria-label="Google connection" className="card flex flex-col gap-3 p-5">
        {head(<Pill tone="muted">Not set up on this server</Pill>, 'Sync Search Console and GA4 straight from Google, read-only, instead of exporting files.')}
        <div className="rounded-xl bg-sunken px-4 py-3 text-[13px] text-ink-2">
          <p>Google connections switch on once the server has these environment variables: {missing.map((m, i) => <span key={m}>{i > 0 && ', '}<code className="mono text-[12.5px]">{m}</code></span>)}. Restart the app after setting them.</p>
          <p className="mt-1.5 text-muted">Until then, uploads below work exactly as before.</p>
        </div>
      </section>
    );
  }

  if (!conn) {
    return (
      <section id="google" aria-label="Google connection" className="card flex flex-wrap items-center justify-between gap-4 p-5">
        {head(<Pill tone="muted">Not connected</Pill>, 'Read-only access to Search Console and GA4. We fetch the last 28 days and the 28 before, and you can disconnect at any time.')}
        <a className="btn btn-primary" href={`/api/google/connect?site=${encodeURIComponent(siteId)}`}>Connect Google</a>
      </section>
    );
  }

  const hasGsc = conn.scopes.includes(SCOPE_GSC);
  const hasGa4 = conn.scopes.includes(SCOPE_GA4);
  const c = conn.last_sync_counts;
  const needsReconnect = conn.status === 'reconnect';
  return (
    <section id="google" aria-label="Google connection" className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {head(needsReconnect ? <Pill tone="warn">Reconnect needed</Pill> : <Pill tone="ok">Connected</Pill>,
          <>Signed in as <b className="font-medium text-ink">{conn.google_email ?? 'your Google account'}</b>. Read-only{!hasGsc || !hasGa4 ? `; ${!hasGsc ? 'Search Console' : 'GA4'} access was not granted` : ''}.</>)}
        <div className="flex flex-wrap items-center gap-2">
          {needsReconnect ? (
            <a className="btn btn-primary btn-sm" href={`/api/google/connect?site=${encodeURIComponent(siteId)}`}>Reconnect Google</a>
          ) : (
            <PostButton action="/api/google/sync" fields={{ site: siteId }} pending="Starting…" className="btn btn-primary btn-sm">Sync now</PostButton>
          )}
        </div>
      </div>

      {running && <JobProgress key={running.id} jobId={running.id} initial={running} label="Syncing from Google" />}

      {!needsReconnect && <PropertyPicker siteId={siteId} domain={domain} hasGsc={hasGsc} hasGa4={hasGa4} />}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3 text-[13px]">
        <div className="text-muted">
          {conn.last_sync_at ? (
            conn.last_sync_status === 'failed' ? (
              <span className="text-bad">Last sync failed {fmtDateTime(conn.last_sync_at)}: {conn.last_sync_error}</span>
            ) : (
              <>Last synced {fmtDateTime(conn.last_sync_at)}{c ? <> · <span className="num">{fmt(c.gscPages)}</span> pages · <span className="num">{fmt(c.gscQueries)}</span> page and query rows · <span className="num">{fmt(c.ga4Pages)}</span> GA4 landing pages{c.period ? ` · ${fmtDate(c.period.start)} to ${fmtDate(c.period.end)}` : ''}</> : null}</>
            )
          ) : needsReconnect ? <span className="text-warn">{conn.last_sync_error}</span> : 'Not synced yet. Choose your properties, save, then Sync now.'}
        </div>
        <details className="text-left">
          <summary className="cursor-pointer text-[12.5px] text-bad">Disconnect</summary>
          <div className="mt-2">
            <PostButton action="/api/google/disconnect" fields={{ site: siteId }} pending="Disconnecting…" className="btn btn-sm text-bad" confirm="Revoke Rankcall's access at Google and delete the stored tokens. Synced data stays in your upload history.">Disconnect Google</PostButton>
          </div>
        </details>
      </div>
    </section>
  );
}

export const GOOGLE_MESSAGES: Record<string, { text: string; tone: 'ok' | 'bad' }> = {
  connected: { text: 'Google connected. Choose your properties, then sync.', tone: 'ok' },
  connected_partial: { text: 'Google connected, but not every permission was granted.', tone: 'bad' },
  not_configured: { text: 'Google connections are not set up on this server yet.', tone: 'bad' },
  state_invalid: { text: 'That Google sign-in link expired or was not yours. Try connecting again.', tone: 'bad' },
  denied: { text: 'Google access was not granted.', tone: 'bad' },
  exchange_failed: { text: 'Google sign-in could not be completed. Try again.', tone: 'bad' },
  no_refresh_token: { text: 'Google did not grant offline access. Try connecting again.', tone: 'bad' },
  scopes_missing: { text: 'Search Console or GA4 access is needed to connect.', tone: 'bad' },
  disconnected: { text: 'Google disconnected and access revoked.', tone: 'ok' },
  disconnected_local: { text: 'Google disconnected here. Also remove Rankcall at myaccount.google.com/permissions.', tone: 'ok' },
  saved: { text: 'Properties saved.', tone: 'ok' },
  saved_mismatch: { text: 'Saved, but the Search Console property does not match this site.', tone: 'bad' },
  property_invalid: { text: 'That property is not available on this Google account.', tone: 'bad' },
  google_unreachable: { text: 'Could not reach Google. Try again.', tone: 'bad' },
  not_connected: { text: 'Connect Google first.', tone: 'bad' },
  choose_properties: { text: 'Choose a Search Console or GA4 property first.', tone: 'bad' },
  sync_started: { text: 'Sync started.', tone: 'ok' },
  sync_running: { text: 'A sync is already running.', tone: 'bad' },
};
