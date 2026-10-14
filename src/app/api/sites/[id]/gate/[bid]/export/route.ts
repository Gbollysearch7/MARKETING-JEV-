import { siteForRequest } from '@/lib/auth';
import { batchCsv, getBatch, indexedWithoutImpressions } from '@/lib/modules/gate';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; bid: string }> }) {
  const { id, bid } = await ctx.params;
  const site = await siteForRequest(id);
  const batch = site ? getBatch(bid) : null;
  if (!site || !batch || batch.site_id !== site.id) return new Response('Not found', { status: 404 });
  const slug = batch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'batch';
  return new Response(batchCsv(batch, indexedWithoutImpressions(site.id, batch)), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-gate-${slug}.csv"` },
  });
}
