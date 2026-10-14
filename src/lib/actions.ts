'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { checkCredentials, createAccountWithOwner, endSession, findUserByEmail, requireSite, requireViewer, startSession } from './auth';
import { loadSamples } from './ingest';
import { startCrawlJob, startVerdictJob } from './jobs';
import { addLabel, createSite, deleteSite, deleteUpload, getTask, getVerdict, reopenVerdict, runningJob, setVerdictReview, updateTask } from './repo';
import { db } from './db';
import { measureOutcomes, taskFromVerdict } from './tasks';
import { reviewInputError, taskInputError } from './form-validation';
import { hostOf } from '@/engine/ingest/url';
import { clientIp, hit, reset } from './ratelimit';

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const tooMany = (seconds: number) => ({ error: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.` });

/** Ten attempts per 15 minutes per IP and per email, so passwords cannot be guessed at speed. */
async function authLimit(email: string) {
  const { headers } = await import('next/headers');
  const ip = clientIp(await headers());
  const byIp = hit(`auth:ip:${ip}`, 10, AUTH_WINDOW_MS);
  if (!byIp.ok) return byIp;
  return email ? hit(`auth:email:${email.toLowerCase()}`, 10, AUTH_WINDOW_MS) : byIp;
}

/** The public origin for links sent to Stripe: APP_URL in production, the request host in development. */
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const { headers } = await import('next/headers');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());

/** Only same-site relative paths, so a crafted "next" or "back" value cannot send people elsewhere. */
const safePath = (p: string, fallback: string) => (p.startsWith('/') && !p.startsWith('//') ? p : fallback);

export type FormState = { error?: string; success?: string };

// ---------- sign-in ----------

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = str(formData.get('name'));
  const company = str(formData.get('company')) || name;
  const email = str(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  if (!name || !email) return { error: 'Enter your name and email.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 10) return { error: 'Use a password of at least 10 characters.' };
  const limited = await authLimit(email);
  if (!limited.ok) return tooMany(limited.retryAfterSeconds);
  if (findUserByEmail(email)) return { error: 'An account with this email already exists. Sign in instead.' };
  const user = createAccountWithOwner({ company, name, email, password });
  await startSession(user.id);
  redirect('/sites');
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData.get('email'));
  const limited = await authLimit(email);
  if (!limited.ok) return tooMany(limited.retryAfterSeconds);
  const user = checkCredentials(email, String(formData.get('password') ?? ''));
  if (!user) return { error: 'That email and password do not match.' };
  reset(`auth:email:${email.toLowerCase()}`);
  await startSession(user.id);
  redirect(safePath(str(formData.get('next')), '/sites'));
}

export async function signOutAction() {
  await endSession();
  redirect('/login');
}

// ---------- sites and data ----------

export async function createSiteAction(formData: FormData) {
  const viewer = await requireViewer();
  const name = str(formData.get('name'));
  const domain = str(formData.get('domain'));
  if (!name || !domain) throw new Error('Name and domain are required');
  const s = createSite(viewer.account.id, name, domain, str(formData.get('sitemap')) || null);
  if (formData.get('sample') === 'on') loadSamples(s.id);
  redirect(`/sites/${s.id}/data`);
}

export async function createSiteFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireViewer();
  if (!str(formData.get('name'))) return { error: 'Enter a name for your site.' };
  const domain = str(formData.get('domain'));
  const host = hostOf(domain);
  if (!host || !host.includes('.') || /\s/.test(domain)) return { error: 'Enter a domain such as acme.co.uk.' };
  const sitemap = str(formData.get('sitemap'));
  if (sitemap && !/^https?:\/\//i.test(sitemap)) return { error: 'The sitemap URL must start with https:// or http://.' };
  await createSiteAction(formData);
  return {};
}

export async function deleteSiteAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  if (String(formData.get('confirmation') ?? '') !== site.name) throw new Error('Type the site name to confirm deletion.');
  // Give the Google grant back before the site and its stored tokens disappear.
  const { revokeGoogleForSite } = await import('./google/server');
  await revokeGoogleForSite(site.id);
  deleteSite(site.id);
  redirect('/sites');
}

export async function deleteSiteFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { site } = await requireSite(str(formData.get('siteId')));
  if (String(formData.get('confirmation') ?? '') !== site.name) return { error: 'The site name does not match. Nothing was deleted.' };
  await deleteSiteAction(formData);
  return {};
}

export async function loadSamplesAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  loadSamples(site.id);
  revalidatePath(`/sites/${site.id}`, 'layout');
}

export async function deleteUploadAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  deleteUpload(site.id, str(formData.get('uploadId')));
  revalidatePath(`/sites/${site.id}`, 'layout');
}

export async function startCrawlAction(formData: FormData) {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  if (!viewer.status.active) throw new Error('Your trial has ended. Choose a plan to keep crawling.');
  if (runningJob(site.id)) throw new Error('A job is already running for this site');
  const url = str(formData.get('sitemap'));
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter the full sitemap URL, starting with https://');
  const cap = Math.min(10_000, viewer.status.urlLimit);
  const limit = Math.min(cap, Math.max(1, Number(formData.get('limit')) || 500));
  startCrawlJob(site.id, url, limit);
  revalidatePath(`/sites/${site.id}`, 'layout');
}

export async function startCrawlFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  if (!viewer.status.active) return { error: 'Choose an active plan in Billing to start a crawl.' };
  if (runningJob(site.id)) return { error: 'A job is already running. Wait for it to finish before starting another.' };
  const url = str(formData.get('sitemap'));
  try { if (!['http:', 'https:'].includes(new URL(url).protocol)) return { error: 'Enter a sitemap URL starting with https:// or http://.' }; }
  catch { return { error: 'Enter a valid sitemap URL.' }; }
  await startCrawlAction(formData);
  return { success: 'Crawl started. Progress appears above.' };
}

export async function runVerdictsAction(formData: FormData) {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  if (!viewer.status.active) redirect('/billing');
  // A second click, a second tab or the back button: the run in progress is already shown on the Overview.
  if (runningJob(site.id)) redirect(`/sites/${site.id}`);
  try { startVerdictJob(site.id, viewer.status.urlLimit); } catch { redirect(`/sites/${site.id}/data`); }
  redirect(`/sites/${site.id}`);
}

// ---------- decisions ----------

/** Approve as proposed, change to another verdict, or reject. Every human change is saved as a labelled example. */
export async function reviewVerdictAction(formData: FormData) {
  const v = getVerdict(str(formData.get('verdictId')));
  if (!v || !v.verdict) throw new Error('Verdict not found');
  await requireSite(v.site_id);
  const decision = str(formData.get('decision'));
  const reason = str(formData.get('reason')) || null;
  if (v.status !== 'proposed') throw new Error('This decision has already been reviewed. Reload the inbox.');
  const error = reviewInputError({ decision, verdict: decision === 'change' ? str(formData.get('verdict')) : v.verdict, target: decision === 'change' ? str(formData.get('target')) : v.target ?? '', path: v.path });
  if (error) throw new Error(error);
  if (decision === 'approve') {
    setVerdictReview(v.id, { status: 'approved', reviewed_by: 'user', final_target: v.target });
    taskFromVerdict({ ...v, status: 'approved', final_target: v.target });
  } else if (decision === 'reject') {
    setVerdictReview(v.id, { status: 'rejected', reviewed_by: 'user' });
    addLabel(v, 'rejected', reason);
  } else if (decision === 'change') {
    const to = str(formData.get('verdict')) as Verdict;
    if (!VERDICTS.includes(to)) throw new Error('Choose a verdict');
    const target = to === 'merge' || to === 'redirect' ? str(formData.get('target')) || null : null;
    if ((to === 'merge' || to === 'redirect') && !target) throw new Error('Merge and Redirect need a target URL path');
    setVerdictReview(v.id, { status: 'approved', reviewed_by: 'user', final_verdict: to, final_target: target });
    if (to !== v.verdict || target !== v.target) addLabel(v, to, reason);
    taskFromVerdict({ ...v, status: 'approved', final_verdict: to, final_target: target });
  }
  revalidatePath(`/sites/${v.site_id}`, 'layout');
  const back = str(formData.get('back'));
  if (back) {
    const target = safePath(back, `/sites/${v.site_id}/inbox`);
    const verdict = decision === 'change' ? str(formData.get('verdict')) : v.verdict;
    redirect(`${target}${target.includes('?') ? '&' : '?'}done=${decision}&dv=${encodeURIComponent(verdict ?? '')}&rv=${v.id}`);
  }
}

/** Expected review errors stay beside the form, preserving the user's correction. */
export async function reviewVerdictFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = getVerdict(str(formData.get('verdictId')));
  if (!v || !v.verdict) return { error: 'This decision is no longer available. Reload the inbox.' };
  await requireSite(v.site_id);
  if (v.status !== 'proposed') return { error: 'This decision has already been reviewed. Reload the inbox.' };
  const decision = str(formData.get('decision'));
  const error = reviewInputError({ decision, verdict: decision === 'change' ? str(formData.get('verdict')) : v.verdict, target: decision === 'change' ? str(formData.get('target')) : v.target ?? '', path: v.path });
  if (error) return { error };
  await reviewVerdictAction(formData);
  return { success: 'Decision saved.' };
}

/**
 * Undo a review (for example an accidental "A"). The task it created is removed if work has not started on it,
 * and a correction it saved to the decision log is withdrawn.
 */
export async function reopenVerdictFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const v = getVerdict(str(formData.get('verdictId')));
  if (!v) return { error: 'This decision is no longer available. Reload the inbox.' };
  await requireSite(v.site_id);
  if (v.status === 'proposed') return { error: 'This decision is already waiting for review.' };
  const d = db();
  const started = d.prepare(`select status from tasks where verdict_id = ? and status in ('in_progress', 'done') limit 1`).get(v.id) as { status: string } | undefined;
  if (started) return { error: `Its task is already ${started.status === 'done' ? 'done' : 'in progress'}. Change or cancel it in the work queue instead.` };
  d.transaction(() => {
    d.prepare(`delete from tasks where verdict_id = ? and status = 'todo'`).run(v.id);
    d.prepare('delete from labels where verdict_id = ?').run(v.id);
    reopenVerdict(v.id);
  })();
  revalidatePath(`/sites/${v.site_id}`, 'layout');
  return { success: 'Review undone. The decision is waiting for you again.' };
}

// ---------- tasks and outcomes ----------

export async function updateTaskAction(formData: FormData) {
  const t = getTask(str(formData.get('taskId')));
  if (!t) throw new Error('Task not found');
  await requireSite(t.site_id);
  const status = str(formData.get('status')) as typeof t.status;
  const error = taskInputError({ status, dueDate: str(formData.get('due_date')), doneAt: str(formData.get('done_at')) || t.done_at?.slice(0, 10) || '', today: new Date().toISOString().slice(0, 10) });
  if (error) throw new Error(error);
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

export async function updateTaskFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const task = getTask(str(formData.get('taskId')));
  if (!task) return { error: 'This task is no longer available. Reload the work queue.' };
  await requireSite(task.site_id);
  const error = taskInputError({ status: str(formData.get('status')), dueDate: str(formData.get('due_date')), doneAt: str(formData.get('done_at')) || task.done_at?.slice(0, 10) || '', today: new Date().toISOString().slice(0, 10) });
  if (error) return { error };
  await updateTaskAction(formData);
  // Keep the saved task open (it may have moved column) and confirm with a toast.
  const back = str(formData.get('back'));
  if (back) redirect(safePath(back, `/sites/${task.site_id}/queue`));
  return { success: 'Task saved.' };
}

export async function measureOutcomesAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  measureOutcomes(site.id);
  revalidatePath(`/sites/${site.id}`, 'layout');
}

// ---------- billing ----------

export async function checkoutAction(formData: FormData) {
  const { billingConfigured, checkoutUrl } = await import('./billing');
  const viewer = await requireViewer();
  if (viewer.user.role !== 'owner') throw new Error('Only the account owner can change the plan');
  if (!billingConfigured()) throw new Error('Billing is not switched on yet');
  const plan = str(formData.get('plan'));
  if (!['starter', 'growth', 'scale'].includes(plan)) throw new Error('Choose a plan');
  redirect(await checkoutUrl(viewer.account, viewer.user.email, plan as 'starter' | 'growth' | 'scale', await appOrigin()));
}

export async function portalAction() {
  const { portalUrl } = await import('./billing');
  const viewer = await requireViewer();
  if (!viewer.account.stripe_customer_id) throw new Error('No subscription yet');
  redirect(await portalUrl(viewer.account.stripe_customer_id, await appOrigin()));
}
