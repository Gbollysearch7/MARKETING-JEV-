'use client';

import { useActionState, useId, useState } from 'react';
import { VERDICTS, type Verdict } from '@/engine/verdict/types';
import { reopenVerdictFormAction, reviewVerdictFormAction, type FormState } from '@/lib/actions';
import { SubmitButton } from './SubmitButton';
import { VERDICT_LABEL, VERDICT_MEANING } from './ui';

export function VerdictReviewControls({ id, verdict, alternative, target, back, uncertain }: {
  id: string; verdict: Verdict; alternative: Verdict; target: string | null; back: string; uncertain: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewVerdictFormAction, {});
  const [choice, setChoice] = useState(alternative);
  const errorId = useId();
  const needsTarget = (verdict === 'merge' || verdict === 'redirect') && !target;
  const changingTarget = choice === 'merge' || choice === 'redirect';

  return (
    <div className="flex flex-col gap-3 border-y border-line bg-surface-2 px-5 py-4 sm:px-7">
      {state.error && <p id={errorId} role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{state.error}</p>}
      {needsTarget && <p className="text-[13px] text-warn">Choose a destination in Change the verdict before approving.</p>}
      <form action={action} onReset={(e) => e.preventDefault()} aria-describedby={state.error ? errorId : undefined} className="flex flex-wrap items-center gap-2.5">
        <input type="hidden" name="verdictId" value={id} />
        <input type="hidden" name="back" value={back} />
        <SubmitButton name="decision" value="approve" className="btn btn-primary h-11" pending="Approving…" disabled={needsTarget || pending} dataKey="approve">Approve {VERDICT_LABEL[verdict]}</SubmitButton>
        <SubmitButton name="decision" value="reject" className="btn h-11 text-bad" pending="Rejecting…" disabled={pending} dataKey="reject">Reject</SubmitButton>
        <span className="text-[12px] text-muted">Approval creates a task; it does not change your website.</span>
      </form>
      <details data-key="change" className="rounded-xl border border-line bg-surface" open={uncertain || needsTarget}>
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">Change the verdict</summary>
        <form action={action} onReset={(e) => e.preventDefault()} aria-describedby={state.error ? errorId : undefined} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <input type="hidden" name="verdictId" value={id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="decision" value="change" />
          <label className="flex flex-col gap-1 text-[12px] text-muted">New verdict
            <select name="verdict" className="select" value={choice} onChange={(e) => setChoice(e.target.value as Verdict)} disabled={pending}>
              {VERDICTS.map((v) => <option key={v} value={v}>{VERDICT_LABEL[v]} · {VERDICT_MEANING[v]}</option>)}
            </select>
          </label>
          {changingTarget && <label className="flex flex-col gap-1 text-[12px] text-muted">Destination path
            <input name="target" className="input mono" defaultValue={target ?? ''} placeholder="/guides/best-tent" required disabled={pending} />
          </label>}
          <label className="flex flex-col gap-1 text-[12px] text-muted sm:col-span-2">Reason for your correction (optional)
            <input name="reason" className="input" placeholder="For example: seasonal page, traffic returns every spring" disabled={pending} />
          </label>
          <p className="text-[12px] text-muted sm:col-span-2">Your correction is saved in the decision log.</p>
          <div className="sm:col-span-2"><SubmitButton className="btn btn-dark" pending="Saving…" disabled={pending}>Save and approve</SubmitButton></div>
        </form>
      </details>
    </div>
  );
}

/** Undo a review so the decision waits in the inbox again. */
export function ReopenControl({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(reopenVerdictFormAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="verdictId" value={id} />
      <SubmitButton className="btn btn-sm" pending="Undoing…">Undo review</SubmitButton>
      {state.error && <span role="alert" className="text-[12.5px] text-bad">{state.error}</span>}
      {state.success && <span role="status" className="text-[12.5px] text-ok">{state.success}</span>}
    </form>
  );
}
