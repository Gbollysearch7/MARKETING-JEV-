'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { AUTO_SCORE_LIMIT, shouldAutoScore, STATUS_LABEL, STATUSES, type OutreachStatus } from '@/modules/links/types';
import { addNote, claimProspect, getProspect, loadLinkSamples, setStatus, startLinksJob, unscoredCount, verifyProspectLink } from './links';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
/** Only same-site relative paths, so a crafted "back" value cannot send people elsewhere. */
const safeBack = (p: string, fallback: string) => (p.startsWith('/') && !p.startsWith('//') ? p : fallback);
const withParam = (url: string, k: string, v: string) => `${url}${url.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(v)}`;

export async function loadLinkSamplesAction(formData: FormData) {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  const res = loadLinkSamples(site.id);
  const added = res.reduce((n, r) => n + r.added, 0);
  if (viewer.status.active && shouldAutoScore(unscoredCount(site.id))) startLinksJob(site);
  revalidatePath(`/sites/${site.id}/links`);
  redirect(`/sites/${site.id}/links?done=${encodeURIComponent(`Loaded ${added} sample prospects`)}`);
}

export async function scoreLinksAction(formData: FormData) {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  if (!viewer.status.active) redirect('/billing');
  // "top" scores the 200 highest-authority waiting prospects; anything else scores everything waiting.
  startLinksJob(site, str(formData.get('scope')) === 'top' ? { limit: AUTO_SCORE_LIMIT } : {});
  revalidatePath(`/sites/${site.id}/links`);
  redirect(`/sites/${site.id}/links`);
}

async function prospectFor(formData: FormData) {
  const p = getProspect(str(formData.get('prospectId')));
  if (!p) throw new Error('Prospect not found');
  const { site, viewer } = await requireSite(p.site_id);
  const back = safeBack(str(formData.get('back')), `/sites/${site.id}/links?p=${p.id}`);
  return { p, site, viewer, back };
}

export async function claimProspectAction(formData: FormData) {
  const { p, viewer, back } = await prospectFor(formData);
  if (p.verdict === 'toxic') redirect(withParam(back, 'err', 'Toxic prospects are never contacted'));
  const release = str(formData.get('intent')) === 'release';
  const owner = release ? null : str(formData.get('owner')).slice(0, 60) || viewer.user.name;
  claimProspect(p, owner, viewer.user.name);
  revalidatePath(`/sites/${p.site_id}/links`);
  redirect(withParam(back, 'done', release ? 'Released' : `Claimed by ${owner}`));
}

export async function setStatusAction(formData: FormData) {
  const { p, viewer, back } = await prospectFor(formData);
  const status = str(formData.get('status')) as OutreachStatus;
  if (!(STATUSES as readonly string[]).includes(status)) redirect(withParam(back, 'err', 'Choose a status'));
  if (p.verdict === 'toxic' && status !== 'new') redirect(withParam(back, 'err', 'Toxic prospects are never contacted'));
  setStatus(p, status, str(formData.get('date')), viewer.user.name);
  revalidatePath(`/sites/${p.site_id}/links`);
  redirect(withParam(back, 'done', `Marked ${STATUS_LABEL[status].toLowerCase()}`));
}

export async function verifyLinkAction(formData: FormData) {
  const { p, site, viewer, back } = await prospectFor(formData);
  const r = await verifyProspectLink(p, site, viewer.user.name);
  revalidatePath(`/sites/${p.site_id}/links`);
  const msg = r === 'found' ? 'Link found on the page; details below' : r === 'not_found' ? 'No link to your site on the page' : 'Could not check the page';
  redirect(withParam(back, r === 'found' ? 'done' : 'err', msg));
}

export async function addNoteAction(formData: FormData) {
  const { p, viewer, back } = await prospectFor(formData);
  const text = str(formData.get('note')).replace(/\r\n/g, '\n');
  if (!text) redirect(withParam(back, 'err', 'Write a note first'));
  addNote(p, text, viewer.user.name);
  revalidatePath(`/sites/${p.site_id}/links`);
  redirect(withParam(back, 'done', 'Note added'));
}
