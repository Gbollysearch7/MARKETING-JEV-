import { getViewer, siteForRequest } from '@/lib/auth';
import { autoAnalyse, importAnswersCsv } from '@/lib/modules/visibility';

const MAX_BYTES = 25 * 1024 * 1024;

/** Upload a CSV of captured AI answers. Plain form post; answers with a 303 back to the Answers screen. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const back = (q: string) => Response.redirect(new URL(`/sites/${id}/visibility/answers?${q}`, request.url), 303);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(`error=${encodeURIComponent('Could not read the upload.')}`);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return back(`error=${encodeURIComponent('Choose a CSV file first.')}`);
  if (file.size > MAX_BYTES) return back(`error=${encodeURIComponent('That file is over 25 MB. Split it and upload the parts.')}`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Excel "Unicode text" and some tools save UTF-16 with a byte order mark.
    const text = bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder('utf-16le').decode(bytes) : bytes[0] === 0xfe && bytes[1] === 0xff ? new TextDecoder('utf-16be').decode(bytes) : new TextDecoder('utf-8').decode(bytes);
    const res = importAnswersCsv(site, text);
    const viewer = await getViewer();
    if (res.added && viewer?.status.active) autoAnalyse(site);
    const notes = res.notes.length ? `&notes=${encodeURIComponent(res.notes.join(' '))}` : '';
    return back(`done=imported&n=${res.added}&dup=${res.duplicates}${notes}`);
  } catch (err) {
    return back(`error=${encodeURIComponent(err instanceof Error ? err.message : 'Could not read that CSV.')}`);
  }
}
