import { getViewer, siteForRequest } from '@/lib/auth';
import { importProspects, startLinksJob, unscoredCount } from '@/lib/modules/links';
import { shouldAutoScore, type ImportPurpose } from '@/modules/links/types';

const MAX_BYTES = 20 * 1024 * 1024;

/** Import a backlinks export or prospect list (file or pasted CSV), then start scoring the new rows. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const viewer = await getViewer();
  const form = await request.formData();
  const purpose: ImportPurpose = String(form.get('purpose')) === 'own_profile' ? 'own_profile' : 'prospects';
  const source = String(form.get('source') ?? '').trim();
  const file = form.get('file');
  const text = String(form.get('text') ?? '');
  let input: Uint8Array | string;
  let filename: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return Response.json({ error: 'That file is over 20 MB. Export fewer rows or split it.' }, { status: 413 });
    input = new Uint8Array(await file.arrayBuffer());
    filename = file.name;
  } else if (text.trim()) {
    if (text.length > MAX_BYTES) return Response.json({ error: 'That paste is too large. Upload a file instead.' }, { status: 413 });
    input = text;
  } else {
    return Response.json({ error: 'Choose a CSV file or paste CSV text.' }, { status: 400 });
  }
  try {
    const res = importProspects(site.id, input, { source, purpose, filename });
    const waiting = unscoredCount(site.id);
    let scoring = false;
    // Big imports wait for the founder to choose how many to score (each prospect is one Jev decision).
    if (viewer?.status.active && shouldAutoScore(waiting)) { startLinksJob(site); scoring = true; }
    return Response.json({ ...res, scoring, waiting: scoring ? 0 : waiting, inactive: !viewer?.status.active });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
}
