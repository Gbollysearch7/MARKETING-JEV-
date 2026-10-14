'use server';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { loadSamples } from '@/lib/ingest';
import { latestUploads } from '@/lib/repo';
import { parsePasted, parseKeywordCsv } from '@/modules/keywords/input';
import { clusterOwner, latestInput, mergeClusters, moveKeyword, renameCluster, runningRun, saveInput, searchConsoleKeywords, startKeywordsRun } from './keywords';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const base = (siteId: string) => `/sites/${siteId}/keywords`;
const back = (siteId: string, params: Record<string, string>) => `${base(siteId)}?${new URLSearchParams(params).toString()}`;

/** Auth, an active plan (runs cost money) and no run already going. */
async function guard(siteId: string) {
  const { site, viewer } = await requireSite(siteId);
  if (!viewer.status.active) redirect('/billing');
  if (runningRun(site.id)) redirect(back(site.id, { error: 'A keyword run is already in progress. Wait for it to finish.' }));
  return site;
}

export async function pasteKeywordsAction(formData: FormData) {
  const site = await guard(str(formData.get('siteId')));
  let input;
  try { input = parsePasted(String(formData.get('text') ?? '')); } catch (e) { redirect(back(site.id, { error: e instanceof Error ? e.message : 'Could not read the pasted text.' })); }
  if (!input.rows.length) redirect(back(site.id, { error: 'Paste at least one keyword.' }));
  const inp = saveInput(site.id, 'paste', null, input);
  startKeywordsRun(site.id, inp.id);
  redirect(back(site.id, { done: `${inp.count.toLocaleString('en-GB')} keywords imported. Scoring has started.` }));
}

export async function importSearchConsoleAction(formData: FormData) {
  const site = await guard(str(formData.get('siteId')));
  const input = searchConsoleKeywords(site.id);
  if (!input || !input.rows.length) redirect(back(site.id, { error: 'Upload a Search Console page and query export on Data sources first.' }));
  const inp = saveInput(site.id, 'gsc', latestUploads(site.id).gsc_queries?.filename ?? null, input);
  startKeywordsRun(site.id, inp.id);
  redirect(back(site.id, { done: `${inp.count.toLocaleString('en-GB')} Search Console queries imported. Scoring has started.` }));
}

/** The Sample Outdoors keyword list. If the site has no page data yet, the Sample Outdoors exports are loaded too so keywords have pages to map to. */
export async function loadSampleKeywordsAction(formData: FormData) {
  const site = await guard(str(formData.get('siteId')));
  const uploads = latestUploads(site.id);
  if (!uploads.gsc_pages && !uploads.gsc_queries && !uploads.crawl) loadSamples(site.id);
  const text = readFileSync(path.join(process.cwd(), 'samples', 'keywords-sample-outdoors.csv'), 'utf8');
  const inp = saveInput(site.id, 'sample', 'keywords-sample-outdoors.csv', parseKeywordCsv(text));
  startKeywordsRun(site.id, inp.id);
  redirect(back(site.id, { done: `Sample list of ${inp.count} keywords loaded. Scoring has started.` }));
}

export async function rerunKeywordsAction(formData: FormData) {
  const site = await guard(str(formData.get('siteId')));
  const inp = latestInput(site.id);
  if (!inp) redirect(back(site.id, { error: 'Import a keyword list first.' }));
  startKeywordsRun(site.id, inp.id);
  redirect(back(site.id, { done: 'Re-run started. Cluster names and your edits carry over.' }));
}

async function ownCluster(clusterId: string) {
  const siteId = clusterOwner(clusterId);
  if (!siteId) throw new Error('Cluster not found');
  await requireSite(siteId);
  return siteId;
}

export async function renameClusterAction(formData: FormData) {
  const id = str(formData.get('clusterId'));
  const siteId = await ownCluster(id);
  const name = str(formData.get('name')).replace(/\s+/g, ' ').slice(0, 120);
  if (!name) redirect(`${base(siteId)}/${id}?error=${encodeURIComponent('Enter a name for the cluster.')}`);
  renameCluster(siteId, id, name);
  revalidatePath(base(siteId), 'layout');
  redirect(`${base(siteId)}/${id}?done=${encodeURIComponent('Cluster renamed. The name is kept on re-runs.')}`);
}

export async function moveKeywordAction(formData: FormData) {
  const from = str(formData.get('clusterId'));
  const siteId = await ownCluster(from);
  const target = str(formData.get('target'));
  const keyword = str(formData.get('keyword'));
  if (!target || target === from) redirect(`${base(siteId)}/${from}`);
  if (target !== 'new') await ownCluster(target);
  const to = moveKeyword(siteId, keyword, target === 'new' ? 'new' : target);
  revalidatePath(base(siteId), 'layout');
  redirect(`${base(siteId)}/${from}?done=${encodeURIComponent(`Moved "${keyword}".`)}&to=${to}`);
}

export async function mergeClustersAction(formData: FormData) {
  const from = str(formData.get('clusterId'));
  const siteId = await ownCluster(from);
  const into = str(formData.get('into'));
  if (!into || into === from) redirect(`${base(siteId)}/${from}?error=${encodeURIComponent('Choose another cluster to merge into.')}`);
  if ((await ownCluster(into)) !== siteId) throw new Error('Cluster not found');
  mergeClusters(siteId, from, into);
  revalidatePath(base(siteId), 'layout');
  redirect(`${base(siteId)}/${into}?done=${encodeURIComponent('Clusters merged. Later runs keep them together.')}`);
}
