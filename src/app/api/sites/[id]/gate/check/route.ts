import { getViewer, siteForRequest } from '@/lib/auth';
import { createBatch, getBatch, indexedWithoutImpressions, listGatePages, pageJson, startGateJob } from '@/lib/modules/gate';
import { finishBatch, normalisePage, type RawPage } from '@/modules/gate/parse';
import type { GatePageInput } from '@/modules/gate/types';

/**
 * POST { pages: [{ url | slug, title, h1, meta_description, body | html, target_query, template }], name? }
 * Scores the pages and answers with one verdict per page. Session-authenticated for now.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = await siteForRequest(id);
  if (!site) return Response.json({ error: 'Not found' }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer?.status.active) return Response.json({ error: 'Your plan is not active. Choose a plan to keep scoring pages.' }, { status: 402 });

  let body: { pages?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Send a JSON body: { "pages": [...] }' }, { status: 400 }); }
  if (!Array.isArray(body.pages) || !body.pages.length) return Response.json({ error: '`pages` must be a non-empty array.' }, { status: 400 });

  const pages: GatePageInput[] = [];
  const errors: string[] = [];
  body.pages.forEach((raw, i) => {
    const p = raw && typeof raw === 'object' ? normalisePage(raw as RawPage, i) : `Row ${i + 1}: must be an object.`;
    if (typeof p === 'string') errors.push(p);
    else pages.push(p);
  });
  if (!pages.length) return Response.json({ error: 'No usable pages.', details: errors }, { status: 422 });
  const { pages: kept, notes } = finishBatch(pages, errors);

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `API batch of ${kept.length}`;
  const batch = createBatch(site.id, name, 'api', kept, notes);
  const started = Date.now();
  const { finished } = startGateJob(site.id, batch.id);
  await finished;
  const done = getBatch(batch.id)!;
  if (done.status === 'failed') return Response.json({ error: done.error ?? 'Scoring failed', batch_id: done.id }, { status: 502 });
  const flagged = indexedWithoutImpressions(site.id, done);
  return Response.json({
    batch_id: done.id,
    url: `/sites/${site.id}/gate/${done.id}`,
    model: done.model,
    criteria_version: 'gate.v1',
    elapsed_ms: Date.now() - started,
    counts: done.counts,
    templates: done.templates.map((t) => ({ template: t.template, pages: t.pages, counts: t.counts, most_common_failure: t.topFailureLabel, pause_template: t.pause })),
    notes: done.notes,
    pages: listGatePages(done.id).sort((a, b) => a.idx - b.idx).map((r) => pageJson(r, flagged)),
  });
}
