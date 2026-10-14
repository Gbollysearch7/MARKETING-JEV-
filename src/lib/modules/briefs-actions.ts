'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { buildOutline, textToOutline, titleOptions } from '@/modules/briefs/assemble';
import { parseKeywordToken, parseTargets } from '@/modules/briefs/text';
import { STATUSES, type BriefStatus, type TargetKeyword } from '@/modules/briefs/types';
import {
  addTargets, deleteTarget, getBrief, getTarget, importClusters, loadSampleTargets, moveBrief, publishBrief, runningBriefJob,
  setRelevance, startDecideJob, targetData, targetsFromSearchConsole, updateBriefContent, targetFromCluster, briefForTarget,
} from './briefs';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const base = (siteId: string) => `/sites/${siteId}/briefs`;

async function siteFromForm(formData: FormData) {
  return requireSite(str(formData.get('siteId')));
}

function done(siteId: string, tab: string, key: string, n?: number): never {
  revalidatePath(base(siteId));
  redirect(`${base(siteId)}?tab=${tab}&done=${key}${n != null ? `&n=${n}` : ''}`);
}

/** One target from the form: a primary keyword plus related keywords, one per line (optional volume in brackets). */
export async function addTargetAction(formData: FormData) {
  const { site } = await siteFromForm(formData);
  const primary = parseKeywordToken(str(formData.get('primary')));
  if (!primary) done(site.id, 'targets', 'empty');
  const related = str(formData.get('related')).split(/\r?\n|;|\|/).map(parseKeywordToken).filter((k): k is TargetKeyword => Boolean(k) && k!.keyword !== primary.keyword);
  const r = addTargets(site.id, [{ primary: primary.keyword, keywords: [primary, ...related].slice(0, 30), relevance: Number(formData.get('relevance')) || 3 }], 'manual', 'user');
  done(site.id, 'targets', r.added ? 'added' : 'duplicate', r.added);
}

/** Many targets at once: one per line, keywords separated by ";" or "|". */
export async function pasteTargetsAction(formData: FormData) {
  const { site } = await siteFromForm(formData);
  const list = parseTargets(str(formData.get('text'))).slice(0, 200);
  if (!list.length) done(site.id, 'targets', 'empty');
  const relevance = Number(formData.get('relevance')) || 3;
  const r = addTargets(site.id, list.map((t) => ({ ...t, relevance })), 'manual', 'user');
  done(site.id, 'targets', 'added', r.added);
}

export async function targetsFromSearchConsoleAction(formData: FormData) {
  const { site } = await siteFromForm(formData);
  const r = targetsFromSearchConsole(site.id);
  done(site.id, 'targets', r.added ? 'added' : 'none_new', r.added);
}

export async function importClustersAction(formData: FormData) {
  const { site } = await siteFromForm(formData);
  const r = importClusters(site.id);
  done(site.id, 'targets', r.added ? 'added' : 'none_new', r.added);
}

/** Sample Outdoors targets, decided straight away so the desk has briefs to show. */
export async function loadSampleTargetsAction(formData: FormData) {
  const { site, viewer } = await siteFromForm(formData);
  loadSampleTargets(site.id);
  if (viewer.status.active && !runningBriefJob(site.id)) startDecideJob(site.id);
  revalidatePath(base(site.id));
  redirect(`${base(site.id)}?tab=targets&done=sample`);
}

/** Decide every new or changed target, or one target again when `targetId` is given. */
export async function decideTargetsAction(formData: FormData) {
  const { site, viewer } = await siteFromForm(formData);
  if (!viewer.status.active) redirect('/billing');
  if (runningBriefJob(site.id)) done(site.id, 'targets', 'busy');
  const one = str(formData.get('targetId'));
  if (one) {
    const t = getTarget(one);
    if (!t || t.site_id !== site.id) done(site.id, 'targets', 'missing');
  }
  const job = startDecideJob(site.id, one ? [one] : undefined);
  done(site.id, 'targets', job ? 'deciding' : 'nothing');
}

export async function setRelevanceAction(formData: FormData) {
  const t = getTarget(str(formData.get('targetId')));
  if (!t) throw new Error('Target not found');
  await requireSite(t.site_id);
  setRelevance(t.id, Number(formData.get('relevance')) || 3);
  done(t.site_id, 'targets', 'relevance');
}

export async function deleteTargetAction(formData: FormData) {
  const t = getTarget(str(formData.get('targetId')));
  if (!t) throw new Error('Target not found');
  await requireSite(t.site_id);
  deleteTarget(t.id);
  done(t.site_id, 'targets', 'deleted');
}

async function ownBrief(formData: FormData) {
  const b = getBrief(str(formData.get('briefId')));
  if (!b) throw new Error('Brief not found');
  await requireSite(b.site_id);
  return b;
}

const back = (formData: FormData, siteId: string, briefId: string) => (str(formData.get('from')) === 'board' ? `${base(siteId)}?tab=queue` : `${base(siteId)}/${briefId}?x=1`);

export async function moveBriefAction(formData: FormData) {
  const b = await ownBrief(formData);
  const status = str(formData.get('status')) as BriefStatus;
  // Measured is set by code from Search Console, never by hand; published needs a URL.
  if (!STATUSES.includes(status) || status === 'measured' || status === 'published') throw new Error('Invalid status');
  moveBrief(b.id, status);
  revalidatePath(base(b.site_id));
  redirect(`${back(formData, b.site_id, b.id)}&done=moved`);
}

export async function publishBriefAction(formData: FormData) {
  const b = await ownBrief(formData);
  const url = str(formData.get('url'));
  if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url) && !/^\/[^\s]*$/.test(url)) redirect(`${base(b.site_id)}/${b.id}?done=badurl`);
  publishBrief(b.id, url);
  revalidatePath(base(b.site_id));
  redirect(`${base(b.site_id)}/${b.id}?done=published`);
}

/** Edit title, angle and outline. Changing the angle can rebuild the title options and outline from templates. */
export async function editBriefAction(formData: FormData) {
  const b = await ownBrief(formData);
  const t = getTarget(b.target_id);
  const angle = str(formData.get('angle')) || b.content.angle;
  const angleOpt = t?.decision?.angles.find((a) => a.key === angle);
  const patch: Parameters<typeof updateBriefContent>[1] = {};
  if (angleOpt && angle !== b.content.angle) {
    patch.angle = angleOpt.key;
    patch.angleLabel = angleOpt.label;
    if (formData.get('rebuild') === 'on' && t) {
      patch.titleOptions = titleOptions(targetData(t), b.content.format, angle, new Date().getFullYear());
      patch.outline = buildOutline(targetData(t), b.content.format, angle);
    }
  }
  const custom = str(formData.get('customTitle'));
  const chosen = str(formData.get('title'));
  if (custom) patch.title = custom.slice(0, 200);
  else if (chosen && !patch.titleOptions) patch.title = chosen;
  else if (patch.titleOptions) patch.title = patch.titleOptions[0];
  const outlineText = formData.get('outline');
  if (outlineText != null && !patch.outline) {
    const o = textToOutline(String(outlineText));
    if (o.length) patch.outline = o;
  }
  updateBriefContent(b.id, patch);
  revalidatePath(base(b.site_id));
  redirect(`${base(b.site_id)}/${b.id}?done=saved`);
}

/**
 * From a keyword cluster straight to a brief: the cluster becomes a target (or the existing one is reused), and it is
 * decided at once. Opens the brief when one already exists, otherwise the target on the brief desk.
 */
export async function briefFromClusterAction(formData: FormData) {
  const { site, viewer } = await siteFromForm(formData);
  const t = targetFromCluster(site.id, str(formData.get('clusterId')));
  if (!t) redirect(`/sites/${site.id}/keywords?error=${encodeURIComponent('That cluster is no longer in the latest run. Refresh and try again.')}`);
  const existing = briefForTarget(t.id);
  if (existing) redirect(`${base(site.id)}/${existing.id}`);
  if (!viewer.status.active) redirect('/billing');
  let key = 'cluster_skip';
  if (!t.decision || t.stale) {
    if (runningBriefJob(site.id)) key = 'cluster_busy';
    else { startDecideJob(site.id, [t.id]); key = 'cluster_deciding'; }
  }
  revalidatePath(base(site.id));
  redirect(`${base(site.id)}?tab=targets&done=${key}&t=${t.id}#t-${t.id}`);
}
