import { ModulePage, Pill } from '@/components/ModulePage';

const CLUSTERS = [
  { name: 'Hiking boots', n: '8 keywords', intent: 'Commercial', stage: 'Consideration', page: '/guides/best-hiking-boots', note: 'Also claimed by 1 other page' },
  { name: 'Trailmaster products', n: '4 keywords', intent: 'Transactional', stage: 'Decision', page: '/products/hiking-boots/trailmaster-0' },
  { name: 'Via ferrata', n: '8 keywords', intent: 'Informational', stage: 'Awareness', page: '/guides/best-via-ferrata' },
  { name: '[New topic]', n: '[n] keywords', intent: 'Informational', stage: 'Awareness', gap: true },
];

export default function Keywords() {
  return (
    <ModulePage milestone="Milestone M7" title="Keyword clusters"
      sub="Up to 50,000 keywords grouped by topic, intent and buying stage, each cluster mapped to the page that should own it."
      actions={<><button className="btn h-11" disabled>Import keywords</button><button className="btn btn-primary h-11" disabled>Send gaps to Brief desk</button></>}>
      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[999_1_520px] overflow-x-auto">
          <table className="tbl min-w-[720px]">
            <thead><tr><th>Cluster</th><th>Intent</th><th>Stage</th><th>Page that owns it</th></tr></thead>
            <tbody>
              {CLUSTERS.map((c) => (
                <tr key={c.name}>
                  <td><div className="font-semibold">{c.name}</div><div className="text-[12.5px] text-muted">{c.n}</div></td>
                  <td>{c.intent}</td><td>{c.stage}</td>
                  <td>{c.gap ? <Pill fg="var(--refresh)" bg="var(--refresh-bg)">Gap: new page needed</Pill> : <><div className="mono text-[13px]">{c.page}</div>{c.note && <div className="text-[12px] font-semibold text-merge" style={{ color: 'var(--merge)' }}>{c.note}</div>}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 p-6">
          <h2 className="text-[18px] font-bold">Hiking boots</h2>
          <div className="flex flex-wrap gap-2 text-[12.5px]">{['Commercial', 'Consideration', 'SERP: blog'].map((t) => <span key={t} className="rounded-full bg-sunken px-2.5 py-0.5">{t}</span>)}</div>
          <ul className="flex flex-col">{['best hiking boots', 'hiking boots', 'hiking boots uk', 'hiking boots review', 'cheap hiking boots', 'hiking boots for beginners'].map((k) => <li key={k} className="border-b border-line py-2 last:border-0">{k}</li>)}</ul>
          <div className="rounded-[10px] p-3 text-[13px]" style={{ background: 'var(--merge-bg)', color: '#4e1f94' }}>Two pages compete for this cluster. Keep /guides/best-hiking-boots; merge /guides/how-to-choose-hiking-boots into it.</div>
        </section>
      </div>
    </ModulePage>
  );
}
