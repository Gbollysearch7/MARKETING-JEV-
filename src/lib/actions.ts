'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { loadSamples } from './ingest';
import { startCrawlJob, startVerdictJob } from './jobs';
import { addLabel, createSite, deleteSite, deleteUpload, getSite, getTask, getVerdict, runningJob, setVerdictReview, updateTask } from './repo';
import { measureOutcomes, taskFromVerdict } from './tasks';

// Single-user local app until accounts arrive in milestone A5. Every action still checks the site exists.
function site(id: FormDataEntryValue | null) {
  const s = getSite(String(id ?? ''));
  if (!s) throw new Error('Site not found');
  return s;
}

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());

export async function createSiteAction(formData: FormData) {
  const name = str(formData.get('name'));
  const domain = str(formData.get('domain'));
  if (!name || !domain) throw new Error('Name and domain are required');
  const sitemap = str(formData.get('sitemap')) || null;
  const s = createSite(name, domain, sitemap);
  if (formData.get('sample') === 'on') loadSamples(s.id);
  redirect(`/sites/${s.id}/data`);
}

export async function deleteSiteAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  deleteSite(s.id);
  redirect('/');
}

export async function loadSamplesAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  loadSamples(s.id);
  revalidatePath(`/sites/${s.id}`, 'layout');
}

export async function deleteUploadAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  deleteUpload(s.id, str(formData.get('uploadId')));
  revalidatePath(`/sites/${s.id}`, 'layout');
}

export async function startCrawlAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  if (runningJob(s.id)) throw new Error('A job is already running for this site');
  const url = str(formData.get('sitemap'));
  if (!/^https?:\/\//.test(url)) throw new Error('Enter the full sitemap URL, starting with https://');
  const limit = Math.min(10_000, Math.max(1, Number(formData.get('limit')) || 500));
  startCrawlJob(s.id, url, limit);
  revalidatePath(`/sites/${s.id}`, 'layout');
}

export async function runVerdictsAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  if (runningJob(s.id)) throw new Error('A job is already running for this site');
  startVerdictJob(s.id);
  redirect(`/sites/${s.id}`);
}

/** Approve as proposed, change to another verdict, or reject. Every human change is saved as a labelled example. */
export async function reviewVerdictAction(formData: FormData) {
  const v = getVerdict(str(formData.get('verdictId')));
  if (!v || !v.verdict) throw new Error('Verdict not found');
  const decision = str(formData.get('decision'));
  const reason = str(formData.get('reason')) || null;
  if (decision === 'approve') {
    setVerdictReview(v.id, { status: 'approved', reviewed_by: 'user', final_target: v.target });
    taskFromVerdict({ ...v, status: 'approved', final_target: v.target });
  } else if (decision === 'reject') {
    setVerdictReview(v.id, { status: 'rejected', reviewed_by: 'user' });
    addLabel(v, 'rejected', reason);
  } else if (decision === 'change') {
    const to = str(formData.get('verdict')) as Verdict;
    if (!VERDICTS.includes(to)) throw new Error('Choose a verdict');
    const target = str(formData.get('target')) || null;
    if ((to === 'merge' || to === 'redirect') && !target) throw new Error('Merge and Redirect need a target URL path');
    setVerdictReview(v.id, { status: 'approved', reviewed_by: 'user', final_verdict: to, final_target: target });
    if (to !== v.verdict || target !== v.target) addLabel(v, to, reason);
    taskFromVerdict({ ...v, status: 'approved', final_verdict: to, final_target: target });
  }
  revalidatePath(`/sites/${v.site_id}`, 'layout');
  const back = str(formData.get('back'));
  if (back) redirect(back);
}

/** Approve every selected verdict on the review screen in one go. Prune and Redirect still need one-by-one review. */
export async function bulkApproveAction(formData: FormData) {
  const ids = formData.getAll('ids').map(String);
  let siteId = '';
  for (const id of ids) {
    const v = getVerdict(id);
    if (!v || !v.verdict || v.status !== 'proposed' || v.verdict === 'prune' || v.verdict === 'redirect') continue;
    siteId = v.site_id;
    setVerdictReview(v.id, { status: 'approved', reviewed_by: 'user', final_target: v.target });
    taskFromVerdict({ ...v, status: 'approved', final_target: v.target });
  }
  if (siteId) revalidatePath(`/sites/${siteId}`, 'layout');
}

export async function updateTaskAction(formData: FormData) {
  const t = getTask(str(formData.get('taskId')));
  if (!t) throw new Error('Task not found');
  const status = str(formData.get('status')) as typeof t.status;
  const patch: Parameters<typeof updateTask>[1] = {
    owner: str(formData.get('owner')) || null,
    due_date: str(formData.get('due_date')) || null,
  };
  if (['todo', 'in_progress', 'done', 'cancelled'].includes(status) && status !== t.status) {
    patch.status = status;
    patch.done_at = status === 'done' ? (str(formData.get('done_at')) || new Date().toISOString().slice(0, 10)) : null;
  }
  updateTask(t.id, patch);
  if (patch.status === 'done') measureOutcomes(t.site_id);
  revalidatePath(`/sites/${t.site_id}`, 'layout');
}

export async function measureOutcomesAction(formData: FormData) {
  const s = site(formData.get('siteId'));
  measureOutcomes(s.id);
  revalidatePath(`/sites/${s.id}`, 'layout');
}
