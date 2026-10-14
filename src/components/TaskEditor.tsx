'use client';

import { useActionState, useState } from 'react';
import { updateTaskFormAction, type FormState } from '@/lib/actions';
import type { Task } from '@/lib/repo';
import { SubmitButton } from './SubmitButton';

export function TaskEditor({ task, today }: { task: Pick<Task, 'id' | 'owner' | 'due_date' | 'status' | 'done_at'>; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTaskFormAction, {});
  const [status, setStatus] = useState(task.status);
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 sm:px-6">
      <input type="hidden" name="taskId" value={task.id} />
      <label className="flex flex-col gap-1 text-[12px] text-muted">Owner<input name="owner" defaultValue={task.owner ?? ''} placeholder="Assign someone" className="input" disabled={pending} /></label>
      <label className="flex flex-col gap-1 text-[12px] text-muted">Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ''} className="input" disabled={pending} /></label>
      <label className="flex flex-col gap-1 text-[12px] text-muted">Status
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value as Task['status'])} className="select" disabled={pending}>
          <option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
        </select>
      </label>
      {status === 'done' && (task.status === 'done' ? <div className="text-[12px] text-muted"><input type="hidden" name="done_at" value={task.done_at?.slice(0, 10) ?? today} />Change went live on {task.done_at?.slice(0, 10)}. Measurements use this date.</div> : <label className="flex flex-col gap-1 text-[12px] text-muted">Change went live on<input name="done_at" type="date" defaultValue={today} max={today} required className="input" disabled={pending} /></label>)}
      {state.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad sm:col-span-2">{state.error}</p>}
      {state.success && <p role="status" className="text-[13px] text-ok sm:col-span-2">{state.success}</p>}
      <div className="sm:col-span-2"><SubmitButton className="btn btn-primary" pending="Saving…">Save task</SubmitButton></div>
    </form>
  );
}
