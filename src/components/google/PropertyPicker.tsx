'use client';

import { useEffect, useState } from 'react';

type Lists = {
  gsc: { siteUrl: string; permissionLevel: string; matches: boolean }[];
  ga4: { property: string; displayName: string; account: string }[];
  selected: { gsc: string | null; ga4: string | null };
  errors: string[];
};

const PERMISSION: Record<string, string> = { siteOwner: 'owner', siteFullUser: 'full', siteRestrictedUser: 'restricted' };

/** Loads the Search Console and GA4 properties this Google account can read, and saves one of each for the site. */
export function PropertyPicker({ siteId, domain, hasGsc, hasGa4 }: { siteId: string; domain: string; hasGsc: boolean; hasGa4: boolean }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gsc, setGsc] = useState('');
  const [ga4, setGa4] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/google/properties?site=${encodeURIComponent(siteId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Could not load your Google properties.');
        const l = j as Lists;
        setLists(l);
        setGsc(l.selected.gsc ?? l.gsc.find((s) => s.matches)?.siteUrl ?? '');
        setGa4(l.selected.ga4 ?? '');
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [siteId]);

  if (error) return <p role="alert" className="text-[13px] text-bad">{error}</p>;
  if (!lists) return <p className="text-[13px] text-muted" aria-live="polite">Loading your Search Console and GA4 properties…</p>;

  const chosen = lists.gsc.find((s) => s.siteUrl === gsc);
  const unchanged = gsc === (lists.selected.gsc ?? '') && ga4 === (lists.selected.ga4 ?? '');
  return (
    <form method="post" action="/api/google/properties" onSubmit={() => setBusy(true)} className="flex flex-col gap-3">
      <input type="hidden" name="site" value={siteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-[13px]">
          <span className="label">Search Console property</span>
          <select name="gsc" className="select w-full" value={gsc} onChange={(e) => setGsc(e.target.value)} disabled={!hasGsc}>
            <option value="">{hasGsc ? (lists.gsc.length ? 'None' : 'No properties on this Google account') : 'Search Console access not granted'}</option>
            {lists.gsc.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}{s.matches ? ' · matches this site' : ''} ({PERMISSION[s.permissionLevel] ?? s.permissionLevel})</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[13px]">
          <span className="label">GA4 property</span>
          <select name="ga4" className="select w-full" value={ga4} onChange={(e) => setGa4(e.target.value)} disabled={!hasGa4}>
            <option value="">{hasGa4 ? (lists.ga4.length ? 'None' : 'No GA4 properties on this Google account') : 'GA4 access not granted'}</option>
            {lists.ga4.map((p) => <option key={p.property} value={p.property}>{p.displayName}{p.account ? ` · ${p.account}` : ''}</option>)}
          </select>
        </label>
      </div>
      {chosen && !chosen.matches && (
        <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
          {chosen.siteUrl} does not look like {domain}. Check it is the right property before syncing, or the URLs will not join with your crawl.
        </p>
      )}
      {lists.errors.map((e) => <p key={e} role="alert" className="text-[12.5px] text-bad">{e}</p>)}
      <div><button className="btn btn-sm" disabled={busy || unchanged} aria-busy={busy}>{busy ? 'Saving…' : 'Save properties'}</button></div>
    </form>
  );
}
