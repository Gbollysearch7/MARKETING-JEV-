import { siteForRequest } from '@/lib/auth';
import { clustersCsv, keywordsCsv } from '@/lib/modules/keywords';

/** CSV export: ?type=clusters (default) or ?type=keywords. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const type = new URL(request.url).searchParams.get('type') === 'keywords' ? 'keywords' : 'clusters';
  const body = type === 'keywords' ? keywordsCsv(id) : clustersCsv(id);
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-keyword-${type}.csv"` },
  });
}
