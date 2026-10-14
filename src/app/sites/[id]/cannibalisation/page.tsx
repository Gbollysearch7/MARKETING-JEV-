import { requireSite } from '@/lib/auth';
import Link from 'next/link';
import { Empty, fmt, Pager, PageTitle, qs, VerdictBadge } from '@/components/ui';
import { cannibalPairs, latestUploads, latestVerdictJob, verdictForPath } from '@/lib/repo';

const SIZE = 20;

export default async function Cannibalisation({ params, searchParams }: PageProps<'/sites/[id]/cannibalisation'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const job = latestVerdictJob(id);
  const hasQueries = Boolean(latestUploads(id).gsc_queries);
  // Most shared searches first: those pairs split the most demand.
  const pairs = job ? cannibalPairs(job.id).sort((x, y) => y.shared.length - x.shared.length) : [];
  const pages = Math.max(1, Math.ceil(pairs.length / SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(sp.page)) || 1));
  const shown = pairs.slice((page - 1) * SIZE, page * SIZE);
  const inbox = `/sites/${id}/inbox?show=all`;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Cannibalisation" sub="Pairs of pages that both rank in the top 20 for three or more of the same searches. Keep the one earning more clicks on them; the other is a merge candidate." />
      {!hasQueries ? (
        <section className="card"><Empty title="Needs page and query data">Upload a page and query export on <Link className="underline" href={`/sites/${id}/data`}>Data sources</Link>. The Search Console website export does not link searches to pages.</Empty></section>
      ) : !job ? (
        <section className="card"><Empty title="Score the site first">Pairs appear after the next scoring run. <Link className="underline" href={`/sites/${id}`}>Go to Overview</Link>.</Empty></section>
      ) : pairs.length === 0 ? (
        <section className="card"><Empty title="No pages are competing">Every page owns its own searches.</Empty></section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card px-5 py-4"><div className="label">Competing pairs</div><div className="display num mt-1 text-[38px] leading-none">{fmt(pairs.length)}</div></div>
            <div className="card px-5 py-4"><div className="label">Pages involved</div><div className="display num mt-1 text-[38px] leading-none">{fmt(new Set(pairs.flatMap((p) => [p.a, p.b])).size)}</div></div>
            <div className="card px-5 py-4"><div className="label">Searches split between them</div><div className="display num mt-1 text-[38px] leading-none">{fmt(pairs.reduce((s, p) => s + p.shared.length, 0))}</div></div>
          </div>
          <div className="flex flex-col gap-4">
            {shown.map((p) => {
              const other = p.primary === p.a ? p.b : p.a;
              const vp = verdictForPath(job.id, p.primary);
              const vo = verdictForPath(job.id, other);
              const posP = (q: (typeof p.shared)[number]) => (p.primary === p.a ? q.posA : q.posB);
              const posO = (q: (typeof p.shared)[number]) => (p.primary === p.a ? q.posB : q.posA);
              return (
                <article key={`${p.a}|${p.b}`} className="card flex flex-col gap-5 p-5 sm:p-6">
                  <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border-[1.5px] border-[var(--ok)] bg-ok-bg/40 p-4">
                      <span className="text-[12px] font-medium text-ok">Keep</span>
                      <span className="mono break-words text-[13.5px] [overflow-wrap:anywhere]">{p.primary}</span>
                      {vp && <Link href={`${inbox}&v=${vp.id}`} className="w-fit"><VerdictBadge v={vp.final_verdict ?? vp.verdict} size="sm" /></Link>}
                    </div>
                    <div aria-hidden className="hidden place-items-center text-[13px] text-muted md:grid">vs</div>
                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
                      <span className="text-[12px] font-medium" style={{ color: 'var(--merge)' }}>Competes</span>
                      <span className="mono break-words text-[13.5px] [overflow-wrap:anywhere]">{other}</span>
                      {vo && <Link href={`${inbox}&v=${vo.id}`} className="w-fit"><VerdictBadge v={vo.final_verdict ?? vo.verdict} size="sm" /></Link>}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="tbl min-w-[520px]">
                      <thead><tr><th>{p.shared.length} shared searches</th><th className="r">Keep page</th><th className="r">Competing page</th></tr></thead>
                      <tbody>
                        {p.shared.slice(0, 5).map((q) => (
                          <tr key={q.query}><td>{q.query}</td><td className="r mono">#{posP(q).toFixed(1)}</td><td className="r mono text-muted">#{posO(q).toFixed(1)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {vo && vo.status === 'proposed' && <Link href={`${inbox}&v=${vo.id}`} className="btn btn-primary w-fit">Review the competing page</Link>}
                </article>
              );
            })}
          </div>
          {pages > 1 && <div className="card overflow-hidden"><Pager total={pairs.length} page={page} size={SIZE} href={(n) => `/sites/${id}/cannibalisation${qs({}, { page: n > 1 ? n : undefined })}`} /></div>}
        </>
      )}
    </div>
  );
}
