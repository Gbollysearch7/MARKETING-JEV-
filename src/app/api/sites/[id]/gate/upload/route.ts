import { getViewer, siteForRequest } from '@/lib/auth';
import { batchFromCsv, startGateJob } from '@/lib/modules/gate';

const MAX_BYTES = 25 * 1024 * 1024;

/** Multipart form: `file` (CSV) or `csv` (pasted text), optional `name`. Creates a batch and starts scoring it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer?.status.active) return Response.json({ error: 'Your plan is not active. Choose a plan to keep scoring pages.', billing: true }, { status: 402 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: 'Send the CSV as a form upload.' }, { status: 400 }); }
  const file = form.get('file');
  let text = String(form.get('csv') ?? '');
  let name = String(form.get('name') ?? '').trim();
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return Response.json({ error: 'The file is over 25 MB. Split it into batches of up to 500 pages.' }, { status: 413 });
    text = await file.text();
    if (!name) name = file.name.replace(/\.(csv|tsv|txt)$/i, '');
  }
  if (!text.trim()) return Response.json({ error: 'Choose a CSV file or paste CSV text.' }, { status: 400 });
  try {
    const batch = batchFromCsv(site.id, name || 'CSV batch', text);
    startGateJob(site.id, batch.id);
    return Response.json({ batchId: batch.id, pages: batch.page_count, notes: batch.notes });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
}
