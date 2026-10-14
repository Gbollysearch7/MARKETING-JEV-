import { EXPORT_KINDS, exportCsv, type ExportKind } from '@/lib/accuracy';
import { siteForRequest } from '@/lib/auth';

/** CSV of any accuracy view: ?kind=reviews|summary|calibration|confusion|overrides|outcomes|benchmark (&run=). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const kind = (EXPORT_KINDS as readonly string[]).includes(sp.get('kind') ?? '') ? (sp.get('kind') as ExportKind) : 'reviews';
  const body = exportCsv(site.id, kind, sp.get('run'));
  if (body == null) return Response.json({ error: 'Not found' }, { status: 404 });
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-accuracy-${kind}.csv"`, 'Cache-Control': 'no-store' },
  });
}
