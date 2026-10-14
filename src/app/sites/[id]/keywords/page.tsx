import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDateTime, PageTitle, Pager, qs } from '@/components/ui';
import { CannibalPill, GapPill, IntentBadge, StageText } from '@/components/keywords/badges';
import { ImportPanel } from '@/components/keywords/ImportPanel';
import { clusterViews, getInput, latestRun, runningRun, searchConsoleKeywords, type ClusterView } from '@/lib/modules/keywords';
import { rerunKeywordsAction } from '@/lib/modules/keywords-actions';
import { briefFromClusterAction } from '@/lib/modules/briefs-actions';
import { INTENT_LABEL, INTENTS } from '@/modules/keywords/battery';
import type { KeywordIntent } from '@/lib/modules/contracts';

const SIZE = 50;
const SHOWS = [
  { key: 'all', label: 'All clusters' },
  { key: 'gaps', label: 'Gaps' },
  { key: 'cannibalised', label: 'Cannibalised' },
  { key: 'mapped', label: 'Mapped' },
] as const;
const SORTS: Record<string, (a: ClusterView, b: ClusterView) => number> = {
  volume: (a, b) => b.totalVolume - a.totalVolume,
  keywords: (a, b) => b.keywords.length - a.keywords.length || b.totalVolume - a.totalVolume,
  name: (a, b) => a.name.localeCompare(b.name),
};

export default async function Keywords({ params, searchParams }: PageProps<'/sites/[id]/keywords'>) {
  const { id } = await params;
  const { site } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const running = runningRun(id);
  const job = latestRun(id);
  const all = job ? clusterViews(id, job.id) : [];
  const input = job?.meta.inputId ? getInput(String(job.meta.inputId)) : null;
  const gscCount = searchConsoleKeywords(id)?.rows.length ?? null;
  const base = `/sites/${id}/keywords`;
  const impressions = input?.volume_source === 'impressions';
  const volLabel = impressions ? 'Impressions' : 'Volume';

  const topics = all.filter((c) => c.kind === 'topic');
  const keywordsN = all.reduce((s, c) => s + c.keywords.length, 0);
  const gaps = topics.filter((c) => c.gap);
  const cannibal = topics.filter((c) => c.cannibalised);
  const junk = all.find((c) => c.kind === 'junk');

  const show = SHOWS.some((s) => s.key === sp.show) ? sp.show! : 'all';
  const intent = (INTENTS as string[]).includes(sp.intent ?? '') ? (sp.intent as KeywordIntent) : undefined;
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : 'volume';
  const q = (sp.q ?? '').trim().toLowerCase();
  let rows = all.filter((c) => {
    if (show === 'gaps' && !c.gap) return false;
    if (show === 'cannibalised' && !c.cannibalised) return false;
    if (show === 'mapped' && (c.gap || !c.mappedPath)) return false;
    if (intent && c.intent !== intent) return false;
    if (q && !c.name.toLowerCase().includes(q) && !c.keywords.some((k) => k.keyword.includes(q))) return false;
    return true;
  });
  rows = [...rows].sort((a, b) => (a.kind === 'junk' ? 1 : 0) - (b.kind === 'junk' ? 1 : 0) || SORTS[sort](a, b));
  const pages = Math.max(1, Math.ceil(rows.length / SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(sp.page)) || 1), pages);
  const keep = { show: show === 'all' ? undefined : show, intent, sort: sort === 'volume' ? undefined : sort, q: sp.q || undefined };
  const shown = rows.slice((page - 1) * SIZE, page * SIZE);

  const actions = job ? (
    <>
      <a className="btn h-11" href={`/api/sites/${id}/keywords/export?type=clusters`} download>Export clusters</a>
      <a className="btn h-11" href={`/api/sites/${id}/keywords/export?type=keywords`} download>Export keywords</a>
      <form action={rerunKeywordsAction}>
        <input type="hidden" name="siteId" value={id} />
        <SubmitButton className="btn btn-primary h-11" pending="Starting…" disabled={Boolean(running)}>Re-run</SubmitButton>
      </form>
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {sp.done && <Toast message={sp.done} />}
      <PageTitle
        title="Keyword clusters"
        sub="Every keyword gets an intent, a buying stage and a home page from Jev; code groups them into topics, picks each cluster's owning page and flags gaps and cannibalisation."
        actions={actions}
      />
      {sp.error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[14px] text-bad">{sp.error}</div>}
      {running && <JobProgress key={running.id} jobId={running.id} initial={running} label="Scoring and clustering keywords" />}

      {!job ? (
        <>
          <section className="card">
            <Empty title={running ? 'Your first run is under way' : 'Bring a keyword list'}>
              {running ? 'Clusters appear here as soon as scoring finishes.' : 'Upload a CSV, paste keywords or import your Search Console queries. Or load the Sample Outdoors list to see how it works.'}
            </Empty>
          </section>
          <ImportPanel siteId={id} gscQueries={gscCount} busy={Boolean(running)} />
        </>
      ) : (
        <>
          <div className="text-[13px] text-muted">
            Last run {fmtDateTime(job.finished_at)} · {fmt(keywordsN)} keywords{input ? ` from ${input.source === 'gsc' ? 'Search Console' : input.source === 'sample' ? 'the sample list' : input.filename ?? 'a pasted list'}` : ''} · {job.provider === 'mock' ? 'offline mock decisions (no API key)' : job.model}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Keywords" value={keywordsN} sub={junk ? `${fmt(junk.keywords.length)} junk or off-topic` : undefined} />
            <Tile label="Clusters" value={topics.length} sub={`${fmt(topics.filter((c) => c.keywords.length === 1).length)} single-keyword${all.length > topics.length ? `, plus ${fmt(all.length - topics.length)} junk group` : ''}`} />
            <Tile label="Gaps" value={gaps.length} sub="Need a new page" href={`${base}${qs({ show: 'gaps' })}`} />
            <Tile label="Cannibalised" value={cannibal.length} sub="Claimed by several pages" href={`${base}${qs({ show: 'cannibalised' })}`} />
          </div>

          <section className="card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-6">
              <nav aria-label="Filter clusters" className="flex flex-wrap gap-1.5">
                {SHOWS.map((s) => {
                  const n = s.key === 'all' ? all.length : s.key === 'gaps' ? gaps.length : s.key === 'cannibalised' ? cannibal.length : topics.filter((c) => !c.gap && c.mappedPath).length;
                  const active = show === s.key;
                  return (
                    <Link key={s.key} href={`${base}${qs(keep, { show: s.key === 'all' ? undefined : s.key, page: undefined })}`} aria-current={active ? 'page' : undefined}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] ${active ? 'font-medium' : 'text-ink-2 hover:bg-sunken'}`}
                      style={active ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : undefined}>
                      {s.label} <span className="num opacity-70">{fmt(n)}</span>
                    </Link>
                  );
                })}
              </nav>
              <form method="get" action={base} className="flex flex-wrap items-center gap-2">
                {keep.show && <input type="hidden" name="show" value={keep.show} />}
                {keep.sort && <input type="hidden" name="sort" value={keep.sort} />}
                <label className="sr-only" htmlFor="kw-q">Search clusters and keywords</label>
                <input id="kw-q" name="q" defaultValue={sp.q ?? ''} placeholder="Search clusters or keywords" className="input h-9 min-w-0 flex-[1_1_200px]" />
                <label className="sr-only" htmlFor="kw-intent">Intent</label>
                <select id="kw-intent" name="intent" defaultValue={intent ?? ''} className="select h-9">
                  <option value="">Any intent</option>
                  {INTENTS.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}
                </select>
                <button className="btn btn-sm h-9">Apply</button>
                {(q || intent) && <Link className="btn btn-sm btn-ghost h-9" href={`${base}${qs({ show: keep.show, sort: keep.sort })}`}>Clear</Link>}
              </form>
            </div>
            {shown.length === 0 ? (
              <Empty title="No clusters match">Try another filter or clear the search.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl min-w-[860px]">
                  <thead>
                    <tr>
                      <th><SortLink label="Cluster" k="name" sort={sort} href={(s) => `${base}${qs(keep, { sort: s === 'volume' ? undefined : s, page: undefined })}`} /></th>
                      <th className="r"><SortLink label="Keywords" k="keywords" sort={sort} href={(s) => `${base}${qs(keep, { sort: s === 'volume' ? undefined : s, page: undefined })}`} /></th>
                      <th className="r"><SortLink label={volLabel} k="volume" sort={sort} href={(s) => `${base}${qs(keep, { sort: s === 'volume' ? undefined : s, page: undefined })}`} /></th>
                      <th>Intent</th>
                      <th>Stage</th>
                      <th>Owning page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.id}>
                        <td className="max-w-[280px]">
                          <Link href={`${base}/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                          <div className="truncate text-[12.5px] text-muted">{c.keywords.slice(0, 3).map((k) => k.keyword).join(' · ')}{c.keywords.length > 3 ? ' …' : ''}</div>
                        </td>
                        <td className="r num">{fmt(c.keywords.length)}</td>
                        <td className="r num">{fmt(c.totalVolume)}</td>
                        <td><IntentBadge intent={c.intent} size="sm" /></td>
                        <td className="text-[13.5px]"><StageText stage={c.stage} /></td>
                        <td className="max-w-[320px]">
                          {c.kind === 'junk' ? <span className="text-[13px] text-muted">Not worth targeting</span>
                            : c.gap ? <span className="flex flex-wrap items-center gap-2"><GapPill /><form action={briefFromClusterAction} className="relative"><input type="hidden" name="siteId" value={id} /><input type="hidden" name="clusterId" value={c.id} /><SubmitButton className="btn btn-sm h-7" pending="…">Brief<span className="sr-only"> for {c.name}</span></SubmitButton></form></span>
                            : c.mappedPath ? <span className="mono break-all text-[13px]">{c.mappedPath}</span>
                            : <span className="text-faint">—</span>}
                          {c.cannibalised && <div className="mt-1"><Link href={`${base}/${c.id}#cannibalisation`}><CannibalPill n={c.alsoClaimedBy.length} /></Link></div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager total={rows.length} page={page} size={SIZE} href={(p) => `${base}${qs(keep, { page: p > 1 ? p : undefined })}`} />
          </section>

          <details className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-6">
              <span>
                <span className="block text-[15px] font-semibold">Import a new keyword list</span>
                <span className="block text-[13px] text-muted">Replaces the current list. Cluster names and your renames, moves and merges carry over to the new run.</span>
              </span>
              <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="border-t border-line bg-bg p-4 sm:p-6">
              <ImportPanel siteId={id} gscQueries={gscCount} busy={Boolean(running)} />
            </div>
          </details>

          {input?.notes.length ? (
            <section className="card px-5 py-4 text-[13px] text-muted">
              <div className="label mb-1">Notes on this list</div>
              <ul className="list-disc pl-5">{input.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </section>
          ) : null}
        </>
      )}
      <p className="text-[12.5px] text-faint">
        Not in this release: SERP-shape checks (needs a SERP data key), embedding-based clustering, and runs above 5,000 keywords. The PRD targets of 50,000 keywords in 10 minutes and 90% intent agreement with a labelled benchmark are not yet measured. {site.name} · {site.domain}
      </p>
    </div>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: number; sub?: string; href?: string }) {
  const body = (
    <div className="card h-full px-5 py-4 transition-shadow hover:shadow-[var(--shadow-lg)]">
      <div className="label">{label}</div>
      <div className="display num mt-1 text-[38px] leading-none">{fmt(value)}</div>
      {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function SortLink({ label, k, sort, href }: { label: string; k: string; sort: string; href: (s: string) => string }) {
  const active = sort === k;
  return (
    <Link href={href(k)} className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}>
      {label}{active && <><span aria-hidden>{k === 'name' ? '↑' : '↓'}</span><span className="sr-only"> (sorted)</span></>}
    </Link>
  );
}
