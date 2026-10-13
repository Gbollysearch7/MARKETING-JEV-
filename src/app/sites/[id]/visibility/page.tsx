import { ModulePage } from '@/components/ModulePage';

const ENGINES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'AI Overviews'];
const LOSSES = [
  ['best walking boots for wide feet uk', 'Competitor has review-site and Reddit coverage; we have none', 'Pitch to review sites', 'PR'],
  ['is via ferrata safe for beginners', 'No page covers the question', 'Brief a new guide', 'Content'],
  ['which down jacket is warmest', 'Page exists but AI crawlers are blocked', 'Allow AI crawlers in robots.txt', 'Technical'],
];

export default function Visibility() {
  return (
    <ModulePage milestone="Year 2" title="AI visibility" sub="Whether the brand is mentioned or cited in AI answers for its buyer prompts, why a competitor won each one, and the fix.">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        {ENGINES.map((e) => <div key={e} className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5"><span className="font-semibold">{e}</span><span className="text-[26px] font-bold">[x%]</span><span className="text-[12.5px] text-muted">prompts mentioning you</span></div>)}
      </section>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap justify-between gap-3 border-b border-line px-5 py-4"><h2 className="font-semibold">Prompts you lose, and why</h2><span className="text-[13px] text-muted">Each prompt runs 3 times per engine</span></div>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[860px]">
            <thead><tr><th>Prompt</th><th>Won by</th><th>Most likely reason</th><th>Fix and owner</th><th className="r">Confidence</th></tr></thead>
            <tbody>{LOSSES.map(([p, why, fix, owner]) => <tr key={p}><td>{p}</td><td>[Competitor]</td><td className="text-ink-2">{why}</td><td><strong>{fix}</strong> · {owner}</td><td className="r mono">[0.00]</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </ModulePage>
  );
}
