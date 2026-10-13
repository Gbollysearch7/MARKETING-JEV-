import { ModulePage, Pill } from '@/components/ModulePage';

const LOCATIONS = [['[Location A]', '4 actions this week', '[41]', 'var(--prune)'], ['[Location B]', '2 actions this week', '[67]', 'var(--warn)'], ['[Location C]', 'Healthy', '[88]', 'var(--ok)']];

export default function Local() {
  return (
    <ModulePage milestone="Year 2" title="Local SEO"
      sub="Each week, every location gets an attention list across reviews, posts, questions, profile fields and citations. Replies are drafted and wait for your approval rules.">
      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[1_1_300px] overflow-hidden">
          <div className="border-b border-line px-5 py-3.5 font-semibold">Locations, weakest first</div>
          {LOCATIONS.map(([n, s, score, color], i) => (
            <div key={n} className={`flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-0 ${i === 0 ? 'border-l-[3px] border-l-accent bg-[#f4f5ff]' : ''}`}>
              <span><span className="block font-semibold">{n}</span><span className="text-[12.5px] text-muted">{s}</span></span>
              <span className="text-[22px] font-bold" style={{ color }}>{score}</span>
            </div>
          ))}
        </section>
        <section className="card flex min-w-0 flex-[999_1_480px] flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-6 py-5"><h2 className="text-[18px] font-bold">[Location A] this week</h2><span className="text-[13px] text-muted">Health score out of 100</span></div>
          <div className="flex flex-col gap-3.5 border-b border-line px-6 py-5">
            <div className="flex items-center justify-between gap-3"><Pill fg="var(--prune)" bg="var(--prune-bg)">Review · 2 stars</Pill><span className="text-[12.5px] text-muted">Always reviewed by a person</span></div>
            <p className="rounded-[10px] bg-bg p-3 text-[13.5px]">[The customer&apos;s review text appears here.]</p>
            <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">Drafted reply<textarea rows={3} className="input" defaultValue="[A drafted reply appears here for you to edit.]" /></label>
            <div className="flex flex-wrap gap-2"><button className="btn btn-primary h-11" disabled>Approve and post</button><button className="btn h-11" disabled>Escalate to manager</button></div>
          </div>
          <ul className="flex flex-col px-6 pb-3 pt-1">
            {[['Profile', 'opening hours differ from the website', 'Fix'], ['Citations', 'phone number mismatch on 2 directories', 'See list'], ['Posts', 'post an offer this week', 'Draft']].map(([a, t, cta]) => (
              <li key={a} className="flex justify-between gap-3 border-b border-line py-3 last:border-0"><span><strong>{a}:</strong> {t}</span><span className="font-semibold text-accent">{cta}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </ModulePage>
  );
}
