import Link from 'next/link';
import type { ReactNode } from 'react';
import { Prob } from '@/components/ui';
import type { GatePageRow } from '@/lib/modules/gate';
import { DEPTH_LEVELS } from '@/modules/gate/battery';
import { GATE_LABEL, GATE_MEANING, type GateVerdict } from '@/modules/gate/types';
import { GATE_BAR, GateBadge, RouterTag } from './bits';

const QUESTION_LABEL: Record<string, string> = {
  helpful_to_searcher: 'Helpful to the searcher',
  unverifiable_claim: 'Unsourced statistic or ranking',
  template_feel: 'Reads as a filled-in template',
  machine_filler: 'Mostly generic filler',
  brand_legal_risk: 'Brand or legal risk',
};
/** For these, yes is bad. */
const BAD_IF_YES = new Set(['unverifiable_claim', 'template_feel', 'machine_filler', 'brand_legal_risk']);

function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const dot = tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : tone === 'ok' ? 'bg-ok' : 'bg-[var(--line-input)]';
  return (
    <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-start gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="flex items-center gap-2 text-[13px] text-muted"><span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{label}</dt>
      <dd className="min-w-0 text-[13.5px]">{children}</dd>
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PageDetail({ p, siteId, batchId, closeHref, flagged }: { p: GatePageRow; siteId: string; batchId: string; closeHref: string; flagged: boolean }) {
  const c = p.checks;
  const b = p.bands;
  const a = p.answers as Record<string, { type: string; noul?: number; score?: number; probabilities?: Record<string, number> }> | null;
  const depth = a?.depth?.type === 'score' ? a.depth : null;
  const probs = (Object.entries(p.probabilities) as [GateVerdict, number][]).sort((x, y) => y[1] - x[1]);
  const dupHref = (path: string) => `/sites/${siteId}/gate/${batchId}?q=${encodeURIComponent(path)}`;

  return (
    <article className="card enter overflow-hidden" aria-labelledby="gate-detail-title">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono truncate text-[13px] text-muted" title={p.path}>{p.path}</p>
            <h2 id="gate-detail-title" className="mt-0.5 text-[16px] font-semibold leading-snug">{p.title || <span className="text-bad">No title</span>}</h2>
          </div>
          <Link href={closeHref} className="btn btn-ghost btn-sm shrink-0" aria-label="Close page detail">Close</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GateBadge v={p.verdict} />
          {p.verdict && <span className="num text-[13px] text-ink-2">{p.model === 'rules' ? 'Hard rule' : `Confidence ${p.confidence.toFixed(2)}`}</span>}
          <RouterTag r={p.verdict ? p.router : null} />
          {flagged && <span className="inline-flex rounded-full bg-warn-bg px-2 py-0.5 text-[11.5px] font-medium text-warn">Indexed but not earning impressions</span>}
        </div>
        {p.verdict && <p className="text-[13px] text-muted">{GATE_MEANING[p.verdict]}.</p>}
      </header>

      {p.verdict ? (
        <div className="flex flex-col gap-5 px-5 py-4">
          <section aria-labelledby="gate-why">
            <h3 id="gate-why" className="label mb-2">Three strongest reasons</h3>
            <ol className="flex flex-col gap-2">
              {p.reasons.map((r, i) => (
                <li key={r} className="flex gap-3 text-[14px] leading-snug"><span className="num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[11.5px] font-semibold text-ink-2">{i + 1}</span><span>{r}</span></li>
              ))}
            </ol>
          </section>

          {p.fixes.length > 0 && (
            <section aria-labelledby="gate-fixes" className="rounded-xl bg-surface-2 px-4 py-3">
              <h3 id="gate-fixes" className="label mb-2">{p.verdict === 'index' ? 'Small improvements' : p.verdict === 'kill' ? 'If you still want this page' : 'Fixes before it can be indexed'}</h3>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px]">{p.fixes.map((f) => <li key={f}>{f}</li>)}</ul>
            </section>
          )}

          {c && b && (
            <section aria-labelledby="gate-checks">
              <h3 id="gate-checks" className="label mb-1">Code checks</h3>
              <dl>
                <Row label="Words" tone={c.uniqueWords < 30 ? 'bad' : c.uniqueWords < 100 ? 'warn' : 'ok'}>
                  <span className="num">{c.uniqueWords.toLocaleString('en-GB')}</span> unique of <span className="num">{c.wordCount.toLocaleString('en-GB')}</span>
                  {c.templateShare >= 0 && <span className="text-muted"> · {pct(c.templateShare)} template text</span>}
                </Row>
                <Row label="Duplication" tone={c.duplicateRatio > 0.9 ? 'bad' : c.duplicateRatio >= 0.6 ? 'warn' : 'ok'}>
                  {c.duplicateOf ? <><span className="num">{pct(c.duplicateRatio)}</span> shared with {c.duplicateSource === 'batch' ? <Link className="mono underline" href={dupHref(c.duplicateOf)}>{c.duplicateOf}</Link> : <span className="mono">{c.duplicateOf}</span>}{c.duplicateSource === 'site' && <span className="text-muted"> (live page)</span>}</> : 'No other page to compare'}
                </Row>
                <Row label="Placeholders" tone={c.placeholders.length ? 'bad' : 'ok'}>{c.placeholders.length ? c.placeholders.join('; ') : 'None found'}</Row>
                <Row label="Title and H1" tone={c.missingTitle || c.missingH1 ? 'bad' : c.duplicateTitleWith || c.duplicateH1With ? 'warn' : 'ok'}>
                  {c.missingTitle || c.missingH1 ? `Missing ${c.missingTitle && c.missingH1 ? 'title and H1' : c.missingTitle ? 'title' : 'H1'}` : c.duplicateTitleWith || c.duplicateH1With ? `Shared with ${Math.max(c.duplicateTitleWith, c.duplicateH1With)} other page${Math.max(c.duplicateTitleWith, c.duplicateH1With) === 1 ? '' : 's'} in this batch` : 'Unique in this batch'}
                  {p.h1 && <span className="block text-muted">H1: {p.h1}</span>}
                </Row>
                <Row label="Search demand" tone={b.search_demand.startsWith('not_seen') ? 'warn' : b.search_demand.startsWith('unknown') ? undefined : 'ok'}>
                  {p.query ? <span className="mono">“{p.query}”</span> : <span className="text-muted">No target query</span>}
                  <span className="block text-muted">{c.queryImpressions != null ? `${c.queryImpressions.toLocaleString('en-GB')} impressions for the query · ${(c.headImpressions ?? 0).toLocaleString('en-GB')} for queries with ${c.headTerms.map((h) => `“${h}”`).join(' + ') || 'its head terms'}` : b.search_demand.replace(/^unknown \((.*)\)$/, (_m, s: string) => s.charAt(0).toUpperCase() + s.slice(1))}</span>
                </Row>
              </dl>
            </section>
          )}

          {a && (
            <section aria-labelledby="gate-answers">
              <h3 id="gate-answers" className="label mb-1">Jev’s answers</h3>
              <dl>
                {depth && (
                  <Row label="Depth vs title" tone={(depth.score ?? 0) < 0.8 ? 'bad' : (depth.score ?? 0) < 1.2 ? 'warn' : 'ok'}>
                    <span className="num">{(depth.score ?? 0).toFixed(2)}</span> of 2 · {DEPTH_LEVELS[Math.round(depth.score ?? 0)]?.split(':')[0]}
                  </Row>
                )}
                {Object.keys(QUESTION_LABEL).filter((k) => a[k]?.type === 'noul').map((k) => {
                  const v = a[k].noul ?? 0.5;
                  const bad = BAD_IF_YES.has(k) ? v >= 0.7 : v < 0.4;
                  const warn = BAD_IF_YES.has(k) ? v >= 0.5 : v < 0.6;
                  return (
                    <Row key={k} label={QUESTION_LABEL[k]} tone={bad ? 'bad' : warn ? 'warn' : 'ok'}>
                      <Prob p={v} color={bad ? 'var(--bad)' : warn ? 'var(--warn)' : 'var(--ok)'} />
                    </Row>
                  );
                })}
              </dl>
              {probs.length > 1 && (
                <div className="mt-3">
                  <p className="label mb-1.5">Verdict probabilities</p>
                  <div className="flex flex-col gap-1.5">
                    {probs.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[70px_minmax(0,1fr)_44px] items-center gap-2 text-[13px]">
                        <span>{GATE_LABEL[k]}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${Math.round(v * 100)}%`, background: GATE_BAR[k] }} /></span>
                        <span className="num text-right">{v.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {p.rules.length > 0 && (
            <section aria-labelledby="gate-rules">
              <h3 id="gate-rules" className="label mb-1.5">Rules applied in code</h3>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-2">{p.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}

          {c?.uniqueExcerpt && (
            <details className="rounded-xl border border-line px-4 py-2.5">
              <summary className="cursor-pointer text-[13px] font-medium">Text unique to this page</summary>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{c.uniqueExcerpt}</p>
            </details>
          )}
          <p className="text-[12px] text-faint">Decided by {p.model === 'rules' ? 'a hard rule in code, without a model call' : p.model === 'mock' ? 'the offline mock (no API key set)' : `${p.model}, criteria gate.v1`}.</p>
        </div>
      ) : (
        <p className="px-5 py-6 text-muted">This page has not been scored yet.</p>
      )}
    </article>
  );
}
