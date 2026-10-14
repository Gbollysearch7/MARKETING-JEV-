import { importBenchmark } from '@/lib/accuracy';
import { siteForRequest } from '@/lib/auth';

const MAX_BYTES = 2_000_000;

/** Import a filled-in labelling sheet, then go back to the accuracy page. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const back = (q: string) => Response.redirect(new URL(`/sites/${site.id}/accuracy?${q}#benchmark`, request.url), 303);
  let file: FormDataEntryValue | null = null;
  try { file = (await request.formData()).get('file'); } catch { return back(`err=${encodeURIComponent('Choose a CSV file to import.')}`); }
  if (!file || typeof file === 'string' || file.size === 0) return back(`err=${encodeURIComponent('Choose a CSV file to import.')}`);
  if (file.size > MAX_BYTES) return back(`err=${encodeURIComponent('That file is larger than 2 MB. A labelling sheet is much smaller; check you chose the right file.')}`);
  const res = importBenchmark(site.id, await file.text(), file.name || 'labels.csv');
  if (!res.ok) return back(`err=${encodeURIComponent(res.errors.join('\n').slice(0, 1500))}`);
  return back(`run=${res.id}&imported=${res.labelled}${res.unmatched ? `&unmatched=${res.unmatched}` : ''}`);
}
