import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDate } from '@/components/ui';
import { captureAnswersAction } from '@/lib/modules/visibility-actions';
import { CAPTURE_ENGINES, ENGINE_LABEL, type Engine } from '@/modules/visibility/types';

export interface CapturePrompt { id: string; text: string; grp: string | null }

/**
 * The fastest way to log answers by hand: pick a prompt, paste what each engine said, save. After saving,
 * the form moves on to the next prompt with nothing captured this week, keeping the chosen date.
 */
export function CaptureForm({ siteId, prompts, selectedId, date, today, weekOf, captured, from, fixedPrompt }: {
  siteId: string;
  prompts: CapturePrompt[];
  selectedId: string | null;
  date: string;
  today: string;
  /** Monday of the week being captured. */
  weekOf: string;
  /** Engines captured this week, per prompt id. */
  captured: Map<string, Set<Engine>>;
  /** Set on the prompt page: return there after saving. */
  from?: string;
  /** Set on the prompt page: the prompt is fixed, no picker. */
  fixedPrompt?: CapturePrompt;
}) {
  const base = `/sites/${siteId}/visibility`;
  const sel = fixedPrompt ?? prompts.find((p) => p.id === selectedId) ?? prompts.find((p) => !captured.has(p.id)) ?? prompts[0] ?? null;
  const have = sel ? captured.get(sel.id) ?? new Set<Engine>() : new Set<Engine>();
  const remaining = prompts.filter((p) => !captured.has(p.id));
  const doneCount = prompts.length - remaining.length;
  const groups = [...new Set(prompts.map((p) => p.grp ?? ''))];
  return (
    <form action={captureAnswersAction} className="flex flex-col gap-5 px-4 py-5 sm:px-6">
      <input type="hidden" name="siteId" value={siteId} />
      {from && <input type="hidden" name="from" value={from} />}
      {fixedPrompt ? <input type="hidden" name="promptId" value={fixedPrompt.id} /> : (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px] md:items-end">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-medium">Prompt</span>
            <select key={sel?.id ?? 'none'} name="promptId" defaultValue={sel?.id ?? ''} className="select w-full min-w-0">
              {!prompts.length && <option value="">No prompts yet: type one</option>}
              {groups.map((g) => {
                const opts = prompts.filter((p) => (p.grp ?? '') === g).map((p) => (
                  <option key={p.id} value={p.id}>{captured.has(p.id) ? '✓ ' : ''}{p.text}</option>
                ));
                return g ? <optgroup key={g} label={g}>{opts}</optgroup> : opts;
              })}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-medium">Or a new prompt <span className="font-normal text-muted">optional</span></span>
            <input name="newPrompt" className="input w-full min-w-0" maxLength={500} placeholder="best waterproof jacket for hillwalking" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Captured on</span>
            <input type="date" name="date" defaultValue={date} max={today} className="input" required />
          </label>
        </div>
      )}
      {fixedPrompt && (
        <label className="flex w-[170px] flex-col gap-1.5">
          <span className="text-[13px] font-medium">Captured on</span>
          <input type="date" name="date" defaultValue={date} max={today} className="input" required />
        </label>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {CAPTURE_ENGINES.map((e) => (
          <div key={e} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`cap-${e}`} className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              {ENGINE_LABEL[e]}
              {have.has(e) && <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-medium text-ok">Captured this week</span>}
            </label>
            <textarea id={`cap-${e}`} name={`ans_${e}`} rows={5} className="input text-[13px] leading-relaxed" placeholder={`Paste the full ${ENGINE_LABEL[e]} answer, markdown and links included`} />
            <input name={`src_${e}`} className="input mono h-9 text-[12px]" aria-label={`${ENGINE_LABEL[e]} sources`} placeholder="Sources it listed (optional): URLs or domains" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pending="Saving…">Save answers</SubmitButton>
        <span className="text-[12.5px] text-muted">Empty boxes are skipped. Links inside an answer are picked up automatically; pasting the same answer twice is ignored.</span>
      </div>

      {!fixedPrompt && prompts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-sunken px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span><strong className="font-semibold">{doneCount} of {prompts.length}</strong> prompts captured in the week of {fmtDate(weekOf)}</span>
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${doneCount} of ${prompts.length} captured`}>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((doneCount / prompts.length) * 100)}%` }} />
            </span>
          </div>
          {remaining.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted">{remaining.length} still to capture</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {remaining.map((p) => (
                  <li key={p.id}><Link href={`${base}/answers?cap=${p.id}&date=${date}#capture`} className="inline-block rounded-full border border-line bg-surface px-2.5 py-1 text-[12.5px] hover:border-line-strong">{p.text}</Link></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
