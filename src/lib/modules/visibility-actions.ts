'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { normDomain } from '@/modules/visibility/parse';
import { LOSS_STATUSES, type LossStatus } from '@/modules/visibility/types';
import {
  clearAnswers, deletePrompt, getLoss, getPrompt, importAnswersCsv, loadSampleData, saveSettings, setLossStatus,
  startAnalysis, startLiveRun, updatePrompt, upsertPrompts,
} from './visibility';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const base = (id: string) => `/sites/${id}/visibility`;
const enc = encodeURIComponent;

async function site(formData: FormData) {
  return requireSite(str(formData.get('siteId')));
}

export async function saveSettingsAction(formData: FormData) {
  const { site: s } = await site(formData);
  const name = str(formData.get('brand')).slice(0, 120);
  const domain = normDomain(str(formData.get('domain')));
  if (!name || !domain) redirect(`${base(s.id)}/setup?error=${enc('Enter the brand name and its domain.')}`);
  const aliases = str(formData.get('aliases')).split(/[,\n]/).map((a) => a.trim()).filter((a) => a.length >= 2).slice(0, 10);
  const competitors: { name: string; domain: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const n = str(formData.get(`comp_name_${i}`)).slice(0, 120);
    const d = normDomain(str(formData.get(`comp_domain_${i}`)));
    if (n) competitors.push({ name: n, domain: d });
  }
  saveSettings(s, { name, aliases, domain, competitors });
  revalidatePath(base(s.id), 'layout');
  redirect(`${base(s.id)}/setup?done=settings`);
}

export async function addPromptsAction(formData: FormData) {
  const { site: s } = await site(formData);
  const grp = str(formData.get('group')).slice(0, 60) || null;
  const lines = str(formData.get('text')).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500);
  if (!lines.length) redirect(`${base(s.id)}/setup?error=${enc('Type at least one prompt.')}#prompts`);
  upsertPrompts(s.id, lines.map((text) => ({ text, grp })));
  redirect(`${base(s.id)}/setup?done=prompts&n=${lines.length}#prompts`);
}

export async function addSuggestionsAction(formData: FormData) {
  const { site: s } = await site(formData);
  const picked = formData.getAll('s').map(String).map((v) => { const [text, grp] = v.split('\u001f'); return { text, grp: grp || null }; }).filter((p) => p.text);
  if (!picked.length) redirect(`${base(s.id)}/setup?suggest=1&error=${enc('Tick at least one suggestion.')}#suggest`);
  upsertPrompts(s.id, picked);
  redirect(`${base(s.id)}/setup?done=prompts&n=${picked.length}#prompts`);
}

export async function updatePromptAction(formData: FormData) {
  const p = getPrompt(str(formData.get('promptId')));
  if (!p) redirect('/sites');
  await requireSite(p.site_id);
  const err = updatePrompt(p.id, str(formData.get('text')), str(formData.get('group')).slice(0, 60) || null);
  redirect(`${base(p.site_id)}/setup?${err ? `error=${enc(err)}` : 'done=prompt'}#prompts`);
}

export async function deletePromptAction(formData: FormData) {
  const p = getPrompt(str(formData.get('promptId')));
  if (!p) redirect('/sites');
  await requireSite(p.site_id);
  deletePrompt(p.id);
  redirect(`${base(p.site_id)}/setup?done=deleted#prompts`);
}

export async function pasteAnswersAction(formData: FormData) {
  const { site: s, viewer } = await site(formData);
  const text = str(formData.get('csv'));
  if (!text) redirect(`${base(s.id)}/answers?error=${enc('Paste CSV text first.')}`);
  let res: ReturnType<typeof importAnswersCsv>;
  try {
    res = importAnswersCsv(s, text);
  } catch (err) {
    redirect(`${base(s.id)}/answers?error=${enc(err instanceof Error ? err.message : 'Could not read that CSV.')}`);
  }
  if (res.added && viewer.status.active) startAnalysis(s);
  redirect(`${base(s.id)}/answers?done=imported&n=${res.added}&dup=${res.duplicates}${res.notes.length ? `&notes=${enc(res.notes.join(' '))}` : ''}`);
}

export async function loadSampleAction(formData: FormData) {
  const { site: s, viewer } = await site(formData);
  const res = loadSampleData(s);
  if (res.added && viewer.status.active) startAnalysis(s);
  redirect(`${base(s.id)}?done=sample&n=${res.added}`);
}

export async function analyseAction(formData: FormData) {
  const { site: s, viewer } = await site(formData);
  if (!viewer.status.active) redirect('/billing');
  startAnalysis(s);
  redirect(`${base(s.id)}${str(formData.get('back')) === 'answers' ? '/answers' : ''}`);
}

export async function liveRunAction(formData: FormData) {
  const { site: s, viewer } = await site(formData);
  if (!viewer.status.active) redirect('/billing');
  startLiveRun(s);
  redirect(`${base(s.id)}/answers`);
}

export async function clearAnswersAction(formData: FormData) {
  const { site: s } = await site(formData);
  if (str(formData.get('confirm')) !== 'yes') redirect(`${base(s.id)}/answers?error=${enc('Tick the box to confirm.')}`);
  clearAnswers(s.id);
  redirect(`${base(s.id)}/answers?done=cleared`);
}

/** Called from the loss register's status menu. Returns an error message or null. */
export async function setLossStatusAction(lossId: string, status: string): Promise<string | null> {
  const loss = getLoss(lossId);
  if (!loss) return 'That loss no longer exists.';
  const { site: s } = await requireSite(loss.site_id);
  if (!LOSS_STATUSES.includes(status as LossStatus)) return 'Unknown status.';
  setLossStatus(lossId, status as LossStatus);
  revalidatePath(base(s.id), 'layout');
  return null;
}
