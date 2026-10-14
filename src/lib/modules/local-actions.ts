'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { hasPlaceholder } from '@/modules/local/replies';
import { UPLOAD_KINDS, type UploadKind } from '@/modules/local/types';
import {
  clearLocal, getDecision, ingestLocal, loadLocalSamples, logAction, runningLocalJob, saveSettings, setDecisionStatus, startLocalJob, type DecisionStatus,
} from './local';
import { REVIEW_ACTION_LABEL, QA_LABEL, POST_LABEL, type ReviewAction, type QaAction, type PostType } from '@/modules/local/types';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const safePath = (p: string, fallback: string) => (p.startsWith('/') && !p.startsWith('//') ? p : fallback);
const MAX_BYTES = 900_000;

function back(base: string, params: Record<string, string>, anchor = ''): never {
  const u = new URLSearchParams(params).toString();
  redirect(`${base.split('#')[0].split('?')[0]}${u ? `?${u}` : ''}${anchor ? `#${anchor}` : ''}`);
}

export async function uploadLocalAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  const base = `/sites/${site.id}/local`;
  const kind = str(formData.get('kind')) as UploadKind;
  if (!UPLOAD_KINDS.includes(kind)) back(base, { err: 'Choose what the file contains.' }, 'data');
  const mode = str(formData.get('mode')) === 'append' ? 'append' : 'replace';
  const file = formData.get('file');
  let text = str(formData.get('text'));
  let filename = 'pasted.csv';
  if (file && typeof file !== 'string' && file.size > 0) {
    if (file.size > MAX_BYTES) back(base, { err: 'That file is over 900 KB. Split it into smaller files and use "Add to existing".' }, 'data');
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder('utf-16le').decode(bytes) : new TextDecoder('utf-8').decode(bytes);
    filename = file.name || 'upload.csv';
  }
  if (!text) back(base, { err: 'Choose a CSV file or paste CSV text.' }, 'data');
  let msg: string;
  try {
    const r = ingestLocal(site.id, kind, mode, text, filename);
    msg = `${r.rows.toLocaleString('en-GB')} ${kind} ${mode === 'replace' ? 'loaded' : 'added'}${r.warnings.length ? `. ${r.warnings.length} row${r.warnings.length === 1 ? '' : 's'} to check in Upload history` : ''}`;
  } catch (e) {
    back(base, { err: e instanceof Error ? e.message : 'Could not read that file.' }, 'data');
  }
  revalidatePath(base, 'layout');
  back(base, { msg }, 'data');
}

export async function loadLocalSamplesAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  loadLocalSamples(site.id);
  revalidatePath(`/sites/${site.id}/local`, 'layout');
  back(`/sites/${site.id}/local`, { msg: 'Sample Outdoors loaded: 6 shops. Run this week’s decisions next.' });
}

export async function clearLocalAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  if (str(formData.get('confirm')) !== 'yes') back(`/sites/${site.id}/local`, { err: 'Tick the box to confirm.' }, 'data');
  clearLocal(site.id);
  revalidatePath(`/sites/${site.id}/local`, 'layout');
  back(`/sites/${site.id}/local`, { msg: 'Local SEO data cleared.' });
}

export async function runLocalAction(formData: FormData) {
  const { site, viewer } = await requireSite(str(formData.get('siteId')));
  if (!viewer.status.active) redirect('/billing');
  const base = `/sites/${site.id}/local`;
  if (runningLocalJob(site.id)) back(base, { err: 'Decisions are already running.' });
  startLocalJob(site.id, formData.get('redo') === 'on');
  revalidatePath(base, 'layout');
  back(base, {});
}

export async function saveLocalSettingsAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  const changed = saveSettings(site.id, { autoApproveFiveStar: formData.get('five') === 'on', autoApproveFourStar: formData.get('four') === 'on' });
  revalidatePath(`/sites/${site.id}/local`, 'layout');
  back(`/sites/${site.id}/local`, { msg: `Approval rules saved${changed ? `, ${changed} waiting repl${changed === 1 ? 'y' : 'ies'} updated` : ''}.` }, 'settings');
}

/** One handler for every review, question and post button. Every change is logged against the location. */
export async function decisionAction(formData: FormData) {
  const row = getDecision(str(formData.get('decisionId')));
  if (!row) throw new Error('Decision not found');
  const { site } = await requireSite(row.site_id);
  const backTo = safePath(str(formData.get('back')), `/sites/${site.id}/local/${encodeURIComponent(row.loc_id)}`);
  const anchor = row.kind === 'post' ? 'post' : `${row.kind}-${row.item_key}`;
  const op = str(formData.get('op'));
  const raw = formData.get('text');
  const text = raw == null ? null : String(raw).replace(/\r\n/g, '\n').trim().slice(0, 4000);
  const label = row.kind === 'review' ? REVIEW_ACTION_LABEL[row.jev_choice as ReviewAction] : row.kind === 'question' ? QA_LABEL[row.jev_choice as QaAction] : POST_LABEL[row.jev_choice as PostType];

  const map: Record<string, { status: DecisionStatus; log: string; human: string }> = {
    approve: { status: 'approved', log: 'Approved reply', human: row.kind === 'review' ? 'reply_template' : '' },
    post: { status: 'posted', log: row.kind === 'post' ? 'Marked post as published' : row.kind === 'question' ? 'Marked answer as posted' : 'Marked reply as posted', human: '' },
    escalate: { status: 'escalated', log: 'Escalated to manager', human: row.kind === 'review' ? 'escalate_to_manager' : 'escalate' },
    remove: { status: 'removal_requested', log: 'Removal requested', human: 'flag_for_removal' },
    spam: { status: 'spam', log: 'Marked as spam', human: 'spam' },
    skip: { status: 'dismissed', log: row.kind === 'post' ? 'Skipped this week’s post' : 'Dismissed', human: row.kind === 'post' ? 'none_this_week' : '' },
    reopen: { status: 'proposed', log: 'Reopened', human: '' },
  };
  const m = map[op];
  if (!m) throw new Error('Unknown action');
  if ((op === 'post' || op === 'approve') && row.kind !== 'post' && !text) back(backTo, { err: 'The reply is empty. Write a reply first.' }, anchor);
  if (op === 'post' && text && hasPlaceholder(text)) back(backTo, { err: 'Replace the [bracketed] parts before marking it as posted.' }, anchor);
  const overrideOf = m.human && m.human !== row.jev_choice ? row.jev_choice : undefined;
  setDecisionStatus(row.id, m.status, text, { overrideOf });
  const detail = [`Jev suggested: ${label} (${row.confidence.toFixed(2)})`, overrideOf ? 'overridden by a person' : '', text && op !== 'escalate' && op !== 'remove' && op !== 'spam' && op !== 'skip' ? `Text: ${text.slice(0, 240)}` : ''].filter(Boolean).join(' · ');
  logAction(site.id, row.loc_id, row.kind, row.item_key, m.log, detail);
  revalidatePath(`/sites/${site.id}/local`, 'layout');
  back(backTo, { msg: m.log }, anchor);
}
