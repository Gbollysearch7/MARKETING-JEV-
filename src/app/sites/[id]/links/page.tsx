import { ModulePage, Pill } from '@/components/ModulePage';

const PROSPECTS = [
  { score: '[92]', v: 'Pursue', site: '[outdoor-magazine.example]/gear-guides', note: 'Resource page · links to two competitors\' boot guides · Angle: resource suggestion · Reply chance: high' },
  { score: '[78]', v: 'Pursue', site: '[hiking-blog.example]/kit-list', note: 'Unlinked mention of the brand · Angle: ask for the link · Reply chance: medium' },
  { score: '—', v: 'Toxic', site: '[link-farm.example]/outdoor-deals', note: 'Sells links and shows network footprints. Already links to you: added to the disavow review.' },
];

export default function Links() {
  return (
    <ModulePage milestone="Year 2" title="Link prospects"
      sub="Every prospect, unlinked mention and competitor backlink scored Pursue, Skip or Toxic, with a pitch angle, so outreach time goes where replies are likely."
      actions={<button className="btn btn-primary h-11" disabled>Import prospects</button>}>
      <div className="flex flex-wrap gap-1.5">
        {['Pursue', 'Skip', 'Toxic', 'Claimed by me'].map((f, i) => <span key={f} className={`flex min-h-9 items-center rounded-full border px-3.5 ${i === 0 ? 'border-ink bg-ink font-semibold text-white' : 'border-line-strong bg-surface'}`}>{f}</span>)}
      </div>
      <section className="flex flex-col gap-3">
        {PROSPECTS.map((p) => (
          <article key={p.site} className={`card grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 ${p.v === 'Toxic' ? 'border-[#f4c8c3]' : ''}`}>
            <div className="flex flex-col items-center"><span className="text-[24px] font-bold">{p.score}</span><span className="text-[11.5px] text-muted">{p.v === 'Toxic' ? 'never contact' : 'priority'}</span></div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {p.v === 'Toxic' ? <Pill fg="var(--prune)" bg="var(--prune-bg)">Toxic</Pill> : <Pill fg="var(--expand)" bg="var(--expand-bg)">Pursue</Pill>}
                <span className="mono truncate">{p.site}</span>
              </div>
              <div className="text-[13px] text-ink-2">{p.note}</div>
            </div>
            <button className="btn h-11" disabled>{p.v === 'Toxic' ? 'Review' : 'Claim'}</button>
          </article>
        ))}
      </section>
    </ModulePage>
  );
}
