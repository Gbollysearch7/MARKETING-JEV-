import { getViewer, siteForRequest } from '@/lib/auth';
import { batchFromCsv, startGateJob } from '@/lib/modules/gate';
import { decodeBytes } from '@/modules/keywords/input';

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
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) return Response.json({ error: 'That looks like an Excel or zip file. Export the sheet as CSV and upload that.' }, { status: 415 });
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return Response.json({ error: 'That is a PDF. Upload the pages as a CSV file.' }, { status: 415 });
    text = decodeBytes(new Uint8Array(await file.arrayBuffer())); // UTF-8 or UTF-16 (Excel "Unicode text")
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
