import { ModulePage, Pill } from '@/components/ModulePage';

const COLS = ['Proposed', 'Approved', 'In writing', 'Published', 'Measured at 90 days'];

export default function Briefs() {
  return (
    <ModulePage milestone="Milestone M8" title="Brief desk" sub="For each keyword cluster: should we write at all, and if so the format, angle, length and outline. A writer-ready brief in under a minute.">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
        {COLS.map((c, i) => (
          <div key={c} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold text-ink-2">{c}</h2>
            {i === 0 ? (
              <>
                <div className="flex flex-col gap-1.5 rounded-xl border-2 border-accent bg-surface p-3"><span className="font-semibold">Via ferrata for beginners</span><span className="text-[12px] font-semibold text-ok">Create</span></div>
                <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3"><span className="font-semibold">Cheap hiking boots</span><span className="text-[12px] font-semibold text-muted">Skip</span></div>
              </>
            ) : <div className="rounded-xl border border-dashed border-line-strong p-3.5 text-[12.5px] text-muted">Empty</div>}
          </div>
        ))}
      </section>
      <article className="card flex flex-wrap">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 border-line p-6 md:border-r">
          <Pill fg="var(--expand)" bg="var(--expand-bg)">Create</Pill>
          <h2 className="text-[22px] font-bold tracking-[-0.01em]">Via ferrata for beginners</h2>
          <dl className="flex flex-col">
            {[['Format', 'Guide'], ['Angle', 'For first-timers in the UK'], ['Length', '1,800 to 2,500 words'], ['Link from', '/guides/best-via-ferrata']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line py-2.5 last:border-0"><dt className="text-muted">{k}</dt><dd className={`font-semibold ${k === 'Link from' ? 'mono text-[13px]' : ''}`}>{v}</dd></div>
            ))}
          </dl>
          <div className="rounded-[10px] bg-bg p-3 text-[13px]"><strong>Better than the top 3 because</strong> [one line the desk proposes for the writer]</div>
        </div>
        <div className="flex min-w-0 flex-[1.4_1_340px] flex-col gap-3 p-6">
          <h3 className="text-[13px] font-semibold text-muted">Outline</h3>
          <ol className="flex list-decimal flex-col gap-2.5 pl-5">
            {[['What a via ferrata is', 'what is a via ferrata, is it safe'], ['Grades, explained for beginners', 'how hard is a via ferrata'], ['Kit you need', 'what to wear, do I need a guide'], ['Where to start in the UK', 'via ferrata uk']].map(([h, q]) => (
              <li key={h}><strong>{h}</strong><div className="text-[13px] text-muted">Answers: {q}</div></li>
            ))}
          </ol>
          <div className="mt-auto flex flex-wrap gap-2 pt-2"><button className="btn btn-primary h-11" disabled>Approve brief</button><button className="btn h-11" disabled>Export to Google Docs</button></div>
        </div>
      </article>
    </ModulePage>
  );
}
