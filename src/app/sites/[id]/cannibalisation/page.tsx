import Link from 'next/link';
import { Empty, fmt, PageTitle, Section, VerdictBadge } from '@/components/ui';
import { cannibalPairs, latestUploads, latestVerdictJob, verdictForPath } from '@/lib/repo';

export default async function Cannibalisation({ params }: PageProps<'/sites/[id]/cannibalisation'>) {
  const { id } = await params;
  const job = latestVerdictJob(id);
  const hasQueries = Boolean(latestUploads(id).gsc_queries);
  const pairs = job ? cannibalPairs(job.id) : [];
  return (
    <div className="space-y-5">
      <PageTitle title="Cannibalisation" sub="URL pairs that both rank in the top 20 for three or more of the same queries. The primary is the page earning more clicks on those queries." />
      <Section>
        {!hasQueries ? (
          <Empty title="Needs page and query data">Upload a page and query CSV on the <Link className="underline" href={`/sites/${id}/data`}>Data</Link> tab. The Search Console website export does not link queries to pages.</Empty>
        ) : !job ? (
          <Empty title="Score the site first" />
        ) : pairs.length === 0 ? (
          <Empty title="No cannibalisation found" />
        ) : (
          <table className="tbl">
            <thead><tr><th>Primary (keep)</th><th>Competing page</th><th className="r">Shared queries</th><th>Top shared queries</th></tr></thead>
            <tbody>
              {pairs.map((p) => {
                const other = p.primary === p.a ? p.b : p.a;
                const vp = verdictForPath(job.id, p.primary);
                const vo = verdictForPath(job.id, other);
                const posP = (q: (typeof p.shared)[number]) => (p.primary === p.a ? q.posA : q.posB);
                const posO = (q: (typeof p.shared)[number]) => (p.primary === p.a ? q.posB : q.posA);
                return (
                  <tr key={`${p.a}|${p.b}`}>
                    <td className="max-w-[260px]">
                      <div className="truncate font-medium" title={p.primary}>{p.primary}</div>
                      {vp && <Link href={`/sites/${id}/inbox?show=all&v=${vp.id}`} className="mt-1 inline-block"><VerdictBadge v={vp.final_verdict ?? vp.verdict} size="sm" /></Link>}
                    </td>
                    <td className="max-w-[260px]">
                      <div className="truncate" title={other}>{other}</div>
                      {vo && <Link href={`/sites/${id}/inbox?show=all&v=${vo.id}`} className="mt-1 inline-block"><VerdictBadge v={vo.final_verdict ?? vo.verdict} size="sm" /></Link>}
                    </td>
                    <td className="r num">{fmt(p.shared.length)}</td>
                    <td>
                      <ul className="space-y-0.5 text-[12.5px]">
                        {p.shared.slice(0, 4).map((q) => (
                          <li key={q.query}><span className="font-medium">{q.query}</span> <span className="num text-muted">positions {posP(q).toFixed(1)} and {posO(q).toFixed(1)}</span></li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
