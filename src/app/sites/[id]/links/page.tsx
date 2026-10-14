import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDateTime, Pager, qs, Section } from '@/components/ui';
import { ImportForm } from '@/components/links/ImportForm';
import { LevelBadge, OutreachBadge, pathOf, VerdictPill } from '@/components/links/bits';
import { ProspectPanel } from '@/components/links/ProspectPanel';
import {
  calibration, disavowCandidates, getProspect, latestLinksJob, listImports, listProspects, ownDomainCount, prospectEvents, summary, unscoredCount,
} from '@/lib/modules/links';
import { loadLinkSamplesAction, scoreLinksAction } from '@/lib/modules/links-actions';
import { AUTO_SCORE_LIMIT, ANGLE_LABEL, PROSPECT_TYPE_LABEL, PROSPECT_TYPES, SITE_TYPE_LABEL, STATUS_LABEL, STATUSES } from '@/modules/links/types';

const SIZE = 30;
const VIEWS = [
  { key: 'pursue', label: 'Pursue' },
  { key: 'skip', label: 'Skip' },
  { key: 'toxic', label: 'Toxic' },
  { key: 'all', label: 'All' },
] as const;

export default async function Links({ params, searchParams }: PageProps<'/sites/[id]/links'>) {
  const { id } = await params;
  const { viewer } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const base = `/sites/${id}/links`;
  const s = summary(id);
  const job = latestLinksJob(id);
  const running = job?.status === 'running' ? job : null;
  const unscored = unscoredCount(id);
  const today = new Date().toISOString().slice(0, 10);
  const toast = sp.done ? <Toast key={`d-${sp.done}-${sp.p}`} message={sp.done.slice(0, 120)} /> : sp.err ? <Toast key={`e-${sp.err}-${sp.p}`} message={sp.err.slice(0, 120)} tone="bad" /> : null;

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-[760px] flex-col gap-1">
        <h1 className="display text-[40px] leading-[1.05]">Link prospects</h1>
        <p className="text-muted">Every prospect, unlinked mention and competitor backlink scored Pursue, Skip or Toxic, with a pitch angle and a reply chance from your own outcomes, so outreach time goes where links are likely.</p>
      </div>
      {s.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <a className="btn h-11" href={`/api/sites/${id}/links/export`}>Export CSV</a>
          {unscored > 0 && unscored <= AUTO_SCORE_LIMIT && !running && (
            <form action={scoreLinksAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn btn-primary h-11" pending="Starting…">Score {fmt(unscored)} new</SubmitButton></form>
          )}
        </div>
      )}
    </header>
  );

  const bigWait = !running && unscored > AUTO_SCORE_LIMIT ? (
    <section role="status" className="card flex flex-wrap items-center justify-between gap-4 border-[var(--warn-bg)] px-5 py-4">
      <div className="flex max-w-[640px] flex-col gap-1">
        <span className="font-semibold">{fmt(unscored)} prospects imported and waiting to be scored</span>
        <span className="text-[13.5px] text-ink-2">Scoring them all will use about {fmt(unscored)} Jev decisions, one per prospect. Big imports are never scored automatically, so you choose how many.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={scoreLinksAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn" name="scope" value="all" pending="Starting…">Score all {fmt(unscored)}</SubmitButton></form>
        <form action={scoreLinksAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn btn-primary" name="scope" value="top" pending="Starting…">Score the top {AUTO_SCORE_LIMIT} by authority</SubmitButton></form>
      </div>
    </section>
  ) : null;

  const jobBar = running ? <JobProgress jobId={running.id} initial={running} label="Scoring link prospects" /> : job?.status === 'failed' ? (
    <div className="card border-[var(--bad-bg)] px-5 py-3 text-[13.5px] text-bad">The last scoring run failed: {job.error}. Use “Score new” to retry.</div>
  ) : null;

  if (s.total === 0) {
    return (
      <div className="flex flex-col gap-6">
        {toast}
        {header}
        {bigWait}
        {jobBar}
        <section className="card">
          <Empty title="No prospects yet">
            Import a competitor&apos;s backlinks export from Ahrefs or Semrush, or your own prospect list. Every page is scored Pursue, Skip or Toxic.
            <form action={loadLinkSamplesAction} className="mt-4 flex justify-center">
              <input type="hidden" name="siteId" value={id} />
              <SubmitButton className="btn btn-primary" pending="Loading…">Load sample data</SubmitButton>
            </form>
            <span className="mt-2 block text-[12.5px]">About 80 fictional prospects for Sample Outdoors, plus a small link profile.</span>
          </Empty>
        </section>
        <Section title="Import prospects" sub="Ahrefs “Backlinks”, Semrush backlinks, or any CSV with a URL column. Up to 2,000 rows per upload.">
          <ImportForm siteId={id} />
        </Section>
        <OutOfScope />
      </div>
    );
  }

  const view = VIEWS.some((v) => v.key === sp.v) ? sp.v! : 'pursue';
  const filter = { verdict: view, type: sp.type, claim: sp.claim, status: sp.status, q: sp.q, me: viewer.user.name };
  const total = listProspects(id, filter, 0, 0).total;
  const page = Math.min(Math.max(1, Math.floor(Number(sp.page)) || 1), Math.max(1, Math.ceil(total / SIZE)));
  const { rows } = listProspects(id, filter, SIZE, (page - 1) * SIZE);
  const keep = { v: view === 'pursue' ? undefined : view, type: sp.type, claim: sp.claim, status: sp.status, q: sp.q, page: page > 1 ? String(page) : undefined };
  const filtered = Boolean(sp.type || sp.claim || sp.status || sp.q);
  const requested = sp.p ? getProspect(sp.p) : null;
  const fromUrl = requested?.site_id === id ? requested : null;
  const selected = fromUrl ?? rows[0] ?? null;
  const back = `${base}${qs(keep, { p: selected?.id })}`;
  const cal = calibration(id);
  const disavow = disavowCandidates(id);
  const ownDomains = ownDomainCount(id);
  const imports = listImports(id, 5);
  const counts: Record<string, number> = { pursue: s.pursue, skip: s.skip, toxic: s.toxic, all: s.total };

  return (
    <div className="flex flex-col gap-6">
      {toast}
      {header}
      {bigWait}
      {jobBar}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Pursue', value: s.pursue, sub: 'in the outreach queue', href: `${base}` },
          { label: 'Skip', value: s.skip, sub: 'not worth the time', href: `${base}?v=skip` },
          { label: 'Toxic', value: s.toxic, sub: 'never contact', href: `${base}?v=toxic` },
          { label: 'In outreach', value: s.active, sub: `${s.claimed} claimed`, href: `${base}?v=all&status=contacted` },
          { label: 'Won links', value: s.won, sub: `${s.verified} verified by crawl`, href: `${base}?v=all&status=won` },
        ].map((t) => (
          <Link key={t.label} href={t.href} className={`card px-5 py-4 transition-shadow hover:shadow-[var(--shadow-lg)] ${t.label === 'Won links' ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className="label">{t.label}</div>
            <div className="num display mt-1 text-[38px] leading-none">{fmt(t.value)}</div>
            <div className="mt-1 text-[12.5px] text-muted">{t.sub}</div>
          </Link>
        ))}
      </div>
      {s.unscored > 0 && s.unscored <= AUTO_SCORE_LIMIT && !running && <p className="-mt-3 text-[13px] text-muted">{fmt(s.unscored)} imported {s.unscored === 1 ? 'prospect is' : 'prospects are'} waiting to be scored.</p>}

      <div className={`${fromUrl ? 'hidden xl:flex' : 'flex'} flex-col gap-3`}>
        <nav aria-label="Verdict" className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => {
            const on = v.key === view;
            return (
              <Link key={v.key} href={`${base}${qs({ type: sp.type, claim: sp.claim, status: sp.status, q: sp.q, v: v.key === 'pursue' ? undefined : v.key })}`} aria-current={on ? 'true' : undefined}
                className={`flex min-h-9 items-center rounded-full border px-3.5 ${on ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line-strong bg-surface hover:border-ink-2'}`}>
                {v.label} · {fmt(on && filtered ? total : counts[v.key])}
              </Link>
            );
          })}
        </nav>
        <form key={JSON.stringify(keep)} className="flex flex-wrap items-center gap-2">
          {view !== 'pursue' && <input type="hidden" name="v" value={view} />}
          <input name="q" defaultValue={sp.q} placeholder="URL or title contains" className="input w-full sm:w-56" aria-label="URL or title contains" />
          <select name="type" defaultValue={sp.type ?? ''} className="select" aria-label="Prospect type">
            <option value="">Any type</option>
            {PROSPECT_TYPES.map((t) => <option key={t} value={t}>{PROSPECT_TYPE_LABEL[t]}</option>)}
          </select>
          <select name="claim" defaultValue={sp.claim ?? ''} className="select" aria-label="Claimed by">
            <option value="">Claimed or not</option><option value="me">Claimed by me</option><option value="anyone">Claimed by anyone</option><option value="unclaimed">Unclaimed</option>
          </select>
          <select name="status" defaultValue={sp.status ?? ''} className="select" aria-label="Outreach status">
            <option value="">Any status</option>
            {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
          <button className="btn">Apply</button>
          {filtered && <Link href={`${base}${qs({ v: keep.v })}`} className="text-[13px] text-muted underline">Clear filters</Link>}
        </form>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section aria-label="Prospect queue" className={`${fromUrl ? 'hidden xl:flex' : 'flex'} min-w-0 flex-col gap-2.5`}>
          {view === 'toxic' && <p className="text-[13px] text-muted">Toxic prospects are never queued for outreach. Ones that already link to you are listed in the disavow review below.</p>}
          {rows.length === 0 ? (
            <div className="card"><Empty title={filtered ? 'No matching prospects' : view === 'pursue' ? 'Nothing to pursue yet' : 'Nothing here'}>{filtered ? <Link className="underline" href={`${base}${qs({ v: keep.v })}`}>Clear your filters</Link> : running ? 'Scoring is still running.' : 'Import more prospects below.'}</Empty></div>
          ) : rows.map((p) => {
            const on = p.id === selected?.id;
            return (
              <Link key={p.id} href={`${base}${qs(keep, { p: p.id })}`} aria-current={on ? 'true' : undefined}
                className={`grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)] sm:px-5 ${on ? 'border-2 border-accent' : 'border border-line hover:border-[var(--hover-border)]'}`}>
                <div className="flex flex-col items-center">
                  <span className="num display text-[30px] leading-none">{p.verdict === 'pursue' ? p.priority : p.verdict === 'toxic' ? '—' : p.relevance != null ? Math.round(p.relevance * 100) : '—'}</span>
                  <span className="text-[11px] text-muted">{p.verdict === 'pursue' ? 'priority' : p.verdict === 'toxic' ? 'never' : 'relevance'}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictPill v={p.verdict} size="sm" />
                    <span className="mono truncate text-[13px]">{p.domain}<span className="text-muted">{pathOf(p.url) === '/' ? '' : pathOf(p.url)}</span></span>
                  </div>
                  <span className="truncate text-[14px] font-medium">{p.title || '(no title in the export)'}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                    {p.verdict === 'pursue' && p.prospect_type && <span>{PROSPECT_TYPE_LABEL[p.prospect_type]}</span>}
                    {p.verdict === 'pursue' && p.angle && <span className="text-muted">· {ANGLE_LABEL[p.angle]}</span>}
                    {p.verdict !== 'pursue' && p.site_type && <span>{SITE_TYPE_LABEL[p.site_type]}</span>}
                    {p.verdict !== 'pursue' && p.reasons[0] && <span className="min-w-0 truncate text-muted">· {p.reasons[0]}</span>}
                    {p.verdict === 'pursue' && <LevelBadge level={p.likelihood} prefix="Reply" />}
                    {p.alreadyLinking && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] text-accent-strong">Links to you</span>}
                    {p.owner && <span className="text-muted">· {p.owner}</span>}
                    {p.status !== 'new' && <OutreachBadge s={p.status} />}
                    {p.verify_status === 'found' && <span className="text-ok">· verified</span>}
                  </span>
                </div>
              </Link>
            );
          })}
          {rows.length > 0 && <div className="card overflow-hidden"><Pager total={total} page={page} size={SIZE} href={(n) => `${base}${qs(keep, { page: n > 1 ? n : undefined })}`} /></div>}
        </section>

        {selected ? (
          <div className={`${fromUrl ? 'block' : 'hidden xl:block'} min-w-0 xl:sticky xl:top-6`}>
            <ProspectPanel key={selected.id} p={selected} me={viewer.user.name} today={today} back={back} closeHref={`${base}${qs(keep)}`} events={prospectEvents(selected.id)} />
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Section title="Reply chance by site type" sub={`Recomputed from ${fmt(cal.outcomes)} logged ${cal.outcomes === 1 ? 'outcome' : 'outcomes'} on this site`}>
          <table className="tbl min-w-[520px]">
            <thead><tr><th>Site type</th><th className="r">Contacted</th><th className="r">Reply rate</th><th className="r">Won / lost</th><th className="r">Win rate used</th><th>Reply chance</th></tr></thead>
            <tbody>
              {cal.rows.map((r) => (
                <tr key={r.siteType}>
                  <td>{SITE_TYPE_LABEL[r.siteType]}</td>
                  <td className="r num">{fmt(r.contacted)}</td>
                  <td className="r num">{r.contacted ? `${Math.round((r.replied / r.contacted) * 100)}%` : '—'}</td>
                  <td className="r num">{r.won} / {r.lost}</td>
                  <td className="r num">{Math.round(r.blended * 100)}%</td>
                  <td><LevelBadge level={r.level} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-6">
            Win rate used = (won + starting rate × {cal.priorWeight}) ÷ (won + lost + {cal.priorWeight}), so a few outcomes nudge it and many outcomes take over. Under 15% is low, 15 to 35% medium, above that high. It is recomputed every time you log a won or lost link, and feeds each prospect&apos;s priority (relevance × authority × reply chance).
          </p>
        </Section>

        <Section title="Disavow review" sub="Toxic domains that already link to you"
          actions={disavow.length > 0 ? <a className="btn btn-sm" href={`/api/sites/${id}/links/disavow`}>Download disavow file</a> : undefined}>
          <div className="mx-4 my-4 rounded-xl bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn sm:mx-6"><strong className="font-semibold">Review before uploading to Google.</strong> Disavowing good links can hurt rankings; most sites never need a disavow file. Check each domain yourself first.</div>
          {disavow.length === 0 ? (
            <p className="px-4 pb-5 text-[13.5px] text-muted sm:px-6">{ownDomains === 0 ? 'Import your own link profile (a backlinks or referring-domains export of your site) to check the domains that already link to you.' : `None of the ${fmt(ownDomains)} domains that link to you is flagged toxic.`}</p>
          ) : (
            <table className="tbl min-w-[420px]">
              <thead><tr><th>Domain</th><th className="r">DR</th><th className="r">Confidence</th><th></th></tr></thead>
              <tbody>
                {disavow.map((d) => (
                  <tr key={d.domain}>
                    <td className="mono break-all">{d.domain}</td>
                    <td className="r num">{fmt(d.dr)}</td>
                    <td className="r num">{Math.round(d.confidence * 100)}%</td>
                    <td className="r"><Link className="text-[13px] text-accent underline" href={`${base}${qs({ v: 'toxic', q: d.domain })}`}>Why</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Import prospects" sub="Ahrefs “Backlinks”, Semrush backlinks, a prospect list, or your own link profile. Up to 2,000 rows per upload; new rows are scored straight away.">
        <ImportForm siteId={id} />
        {imports.length > 0 && (
          <div className="border-t border-line px-4 py-4 sm:px-6">
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Recent imports</h3>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {imports.map((im) => (
                <li key={im.id} className="flex flex-wrap justify-between gap-2">
                  <span><span className="font-medium">{im.source}</span>{im.purpose === 'own_profile' ? ' · link profile' : ''}: {fmt(im.added)} added{im.duplicates ? `, ${fmt(im.duplicates)} duplicates skipped` : ''}{im.already_linking && im.purpose !== 'own_profile' ? `, ${fmt(im.already_linking)} already linking` : ''}</span>
                  <span className="text-muted">{fmtDateTime(im.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      <OutOfScope />
    </div>
  );
}

function OutOfScope() {
  return (
    <p className="text-[12.5px] text-muted">
      Not included yet: finding contact emails, sending outreach email, and brand-mention alerts from news or web search. Authority and traffic come only from the exports you upload; there is no live Ahrefs, Semrush or Majestic connection.
    </p>
  );
}
