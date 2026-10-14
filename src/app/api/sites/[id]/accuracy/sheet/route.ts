import { createSheet } from '@/lib/accuracy';
import { siteForRequest } from '@/lib/auth';

/** A blind labelling sheet: a stratified random sample of scored URLs without the model's verdicts. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const n = Number(new URL(request.url).searchParams.get('n')) || 100;
  try {
    const sheet = createSheet(site.id, n, site.domain);
    return new Response(sheet.csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${site.domain}-labelling-sheet-${sheet.id}.csv"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not make the sheet' }, { status: 400 });
  }
}
