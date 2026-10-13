import { ModulePage, Pill } from '@/components/ModulePage';

const ROWS = [
  { page: '/walks/[town-a]', v: 'Index', fg: 'var(--expand)', bg: 'var(--expand-bg)', why: 'Unique route data · answers the target query · clean canonical' },
  { page: '/walks/[town-b]', v: 'Improve', fg: 'var(--redirect)', bg: 'var(--redirect-bg)', why: 'Thin outside the template · no unique facts · duplicate title' },
  { page: '/walks/[town-c]', v: 'Kill', fg: 'var(--prune)', bg: 'var(--prune-bg)', why: 'Near-duplicate of /walks/[town-b] · placeholder text found · no search demand' },
];
const DIMS = [['Thinness', 'Useful content beyond the template'], ['Duplication', 'Against the batch and the live site'], ['Helpfulness', 'Would the searcher be satisfied'], ['Search demand', 'Is there a query this page can win'], ['Brand and legal risk', 'Claims, regulated terms, placeholders'], ['Technical', 'Canonical, titles, internal links']];

export default function Gate() {
  return (
    <ModulePage milestone="Milestone M6" title="Quality gate"
      sub="Every generated page is scored before it is published: Index, Improve or Kill, with the three strongest reasons. Send pages by API, CSV, sitemap or a CMS webhook."
      actions={<><button className="btn h-11" disabled>API and webhooks</button><button className="btn btn-primary h-11" disabled>Score a batch</button></>}>
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-ink px-7 py-6 text-white">
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <span className="mono text-[13px] text-[#b8c0cc]">Template /walks/* · batch of [N] pages</span>
          <h2 className="text-[22px] font-bold">Pause this template before it ships</h2>
          <p className="text-[#b8c0cc]">More than 40% of pages would be killed. Most common failure: near-duplicate of a sibling page.</p>
        </div>
        <div role="img" aria-label="Batch split: Index, Improve, Kill" className="flex min-w-[260px] flex-1 flex-col gap-2">
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full"><span style={{ flex: 32, background: '#8fe3c9' }} /><span style={{ flex: 22, background: '#f2c46b' }} /><span style={{ flex: 46, background: '#ff8a80' }} /></div>
          <div className="flex gap-4 text-[12.5px] text-[#b8c0cc]"><span>Index</span><span>Improve</span><span>Kill</span></div>
        </div>
      </section>
      <section className="card overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead><tr><th>Page</th><th>Verdict</th><th>Strongest reasons</th><th className="r">Confidence</th></tr></thead>
          <tbody>{ROWS.map((r) => <tr key={r.page}><td className="mono">{r.page}</td><td><Pill fg={r.fg} bg={r.bg}>{r.v}</Pill></td><td className="text-ink-2">{r.why}</td><td className="r mono">[0.00]</td></tr>)}</tbody>
        </table>
      </section>
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        {DIMS.map(([t, d]) => <div key={t} className="rounded-xl border border-line bg-surface px-4 py-3.5"><div className="font-semibold">{t}</div><div className="text-[13px] text-muted">{d}</div></div>)}
      </section>
    </ModulePage>
  );
}
