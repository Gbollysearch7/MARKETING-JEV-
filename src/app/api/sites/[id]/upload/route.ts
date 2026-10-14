import { ingestFile, type Slot } from '@/lib/ingest';
import { siteForRequest } from '@/lib/auth';

const SLOTS: Slot[] = ['gsc', 'ga4', 'crawl', 'backlinks'];
const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request, ctx: RouteContext<'/api/sites/[id]/upload'>) {
  const { id } = await ctx.params;
  if (!(await siteForRequest(id))) return Response.json({ error: 'Site not found' }, { status: 404 });
  const form = await request.formData();
  const slot = String(form.get('slot')) as Slot;
  if (!SLOTS.includes(slot)) return Response.json({ error: 'Unknown upload type' }, { status: 400 });
  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: 'Choose a file' }, { status: 400 });
  const results: { file: string; ok: boolean; message: string; notes?: string[] }[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) { results.push({ file: f.name, ok: false, message: 'File is over 200 MB' }); continue; }
    try {
      const u = ingestFile(id, slot, f.name, new Uint8Array(await f.arrayBuffer()));
      const what = u.kind === 'gsc_queries' ? 'page and query rows' : u.kind === 'gsc_pages' ? 'pages' : u.kind === 'ga4' ? 'landing pages' : 'URLs';
      results.push({ file: f.name, ok: true, message: `${u.row_count.toLocaleString('en-GB')} ${what} imported`, notes: u.notes });
    } catch (err) {
      results.push({ file: f.name, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return Response.json({ results }, { status: results.some((r) => r.ok) ? 200 : 422 });
}
