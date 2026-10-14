import { getViewer, siteForRequest } from '@/lib/auth';
import { runningRun, saveInput, startKeywordsRun } from '@/lib/modules/keywords';
import { decodeBytes, parseKeywordCsv } from '@/modules/keywords/input';

const MAX_BYTES = 50 * 1024 * 1024;

/** Plain form POST of a keyword CSV/TSV (own list, Ahrefs, Semrush, Keyword Planner). Redirects back to the page. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const back = (params: Record<string, string>) => Response.redirect(new URL(`/sites/${id}/keywords?${new URLSearchParams(params)}`, request.url), 303);
  const viewer = await getViewer();
  if (!viewer?.status.active) return Response.redirect(new URL('/billing', request.url), 303);
  if (runningRun(id)) return back({ error: 'A keyword run is already in progress. Wait for it to finish.' });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return back({ error: 'Choose a CSV file to upload.' });
  if (file.size > MAX_BYTES) return back({ error: 'That file is over 50 MB.' });
  try {
    const input = parseKeywordCsv(decodeBytes(new Uint8Array(await file.arrayBuffer())));
    if (!input.rows.length) return back({ error: 'No keywords found in that file.' });
    const inp = saveInput(id, 'csv', file.name, input);
    startKeywordsRun(id, inp.id);
    return back({ done: `${inp.count.toLocaleString('en-GB')} keywords imported from ${file.name}. Scoring has started.` });
  } catch (err) {
    return back({ error: err instanceof Error ? err.message : 'Could not read that file.' });
  }
}
