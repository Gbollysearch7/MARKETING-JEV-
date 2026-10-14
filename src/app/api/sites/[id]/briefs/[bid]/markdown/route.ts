import { siteForRequest } from '@/lib/auth';
import { getBrief, getTarget } from '@/lib/modules/briefs';
import { briefMarkdown } from '@/modules/briefs/assemble';

/** The brief as a Markdown file download. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; bid: string }> }) {
  const { id, bid } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const b = getBrief(bid);
  const t = b ? getTarget(b.target_id) : null;
  if (!b || !t || b.site_id !== site.id) return Response.json({ error: 'Not found' }, { status: 404 });
  const md = briefMarkdown(b.content, { primary: t.primary, go: t.decision?.go.choice ?? 'create', status: b.status, site: site.domain, publishedUrl: b.published_url });
  const slug = t.primary.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brief';
  return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="brief-${slug}.md"`, 'cache-control': 'no-store' } });
}
