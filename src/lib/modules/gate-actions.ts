'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { normalisePage, parseUrlList, MAX_BATCH_PAGES } from '@/modules/gate/parse';
import { batchFromCsv, createBatch, deleteBatch, getBatch, sampleCsv, startGateJob } from './gate';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const back = (siteId: string, params: Record<string, string>) => `/sites/${siteId}/gate?${new URLSearchParams(params).toString()}`;

async function activeSite(siteId: string) {
  const { site, viewer } = await requireSite(siteId);
  if (!viewer.status.active) redirect('/billing');
  return site;
}

/** Load the Sample Outdoors programmatic batch and score it. */
export async function loadGateSampleAction(formData: FormData) {
  const site = await activeSite(str(formData.get('siteId')));
  const batch = batchFromCsv(site.id, 'Sample: /walks/ location pages', sampleCsv(), 'sample');
  startGateJob(site.id, batch.id);
  redirect(`/sites/${site.id}/gate/${batch.id}`);
}

/** A sitemap URL or a list of URLs; pages are fetched inside the job. */
export async function checkUrlsAction(formData: FormData) {
  const site = await activeSite(str(formData.get('siteId')));
  const sitemap = str(formData.get('sitemap'));
  const list = parseUrlList(str(formData.get('urls')));
  const name = str(formData.get('name'));
  if (sitemap) {
    if (!/^https?:\/\/\S+$/i.test(sitemap)) redirect(back(site.id, { in: 'urls', error: 'The sitemap URL must start with https:// or http://.' }));
    const batch = createBatch(site.id, name || `Sitemap ${new URL(sitemap).hostname}`, 'sitemap', [], [], { sitemap });
    startGateJob(site.id, batch.id);
    redirect(`/sites/${site.id}/gate/${batch.id}`);
  }
  if (!list.length) redirect(back(site.id, { in: 'urls', error: 'Enter a sitemap URL or at least one page URL starting with https://.' }));
  const notes = list.length > MAX_BATCH_PAGES ? [`Only the first ${MAX_BATCH_PAGES} of ${list.length} URLs were kept.`] : [];
  const batch = createBatch(site.id, name || `${list.length} URL${list.length === 1 ? '' : 's'}`, 'urls', [], notes, { urls: list.slice(0, MAX_BATCH_PAGES) });
  startGateJob(site.id, batch.id);
  redirect(`/sites/${site.id}/gate/${batch.id}`);
}

/** One pasted page for a quick check. */
export async function checkOnePageAction(formData: FormData) {
  const site = await activeSite(str(formData.get('siteId')));
  const title = str(formData.get('title'));
  const body = str(formData.get('body'));
  if (!title || !body) redirect(back(site.id, { in: 'paste', error: 'Enter a title and the page body to check.' }));
  const p = normalisePage({ url: str(formData.get('url')), title, h1: str(formData.get('h1')) || title, body, query: str(formData.get('query')) }, 0);
  if (typeof p === 'string') redirect(back(site.id, { in: 'paste', error: p }));
  const batch = createBatch(site.id, title, 'paste', [p]);
  startGateJob(site.id, batch.id);
  redirect(`/sites/${site.id}/gate/${batch.id}`);
}

export async function deleteBatchAction(formData: FormData) {
  const batch = getBatch(str(formData.get('batchId')));
  if (!batch) redirect('/sites');
  await requireSite(batch.site_id);
  deleteBatch(batch.id);
  revalidatePath(`/sites/${batch.site_id}/gate`);
  redirect(`/sites/${batch.site_id}/gate?deleted=1`);
}

/** Score an existing batch again (for example after the site's Search Console data changed). */
export async function rescoreBatchAction(formData: FormData) {
  const batch = getBatch(str(formData.get('batchId')));
  if (!batch) redirect('/sites');
  await activeSite(batch.site_id);
  if (batch.status !== 'running') startGateJob(batch.site_id, batch.id);
  redirect(`/sites/${batch.site_id}/gate/${batch.id}`);
}
