import { VERDICTS } from '../engine/verdict/types';

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reviewInputError(input: { decision: string; verdict: string; target: string; path: string }): string | null {
  if (!['approve', 'reject', 'change'].includes(input.decision)) return 'Choose approve, reject or change.';
  if (input.decision === 'reject') return null;
  if (!VERDICTS.some((v) => v === input.verdict)) return 'Choose a verdict.';
  if (input.verdict === 'merge' || input.verdict === 'redirect') {
    if (!input.target) return 'Merge and Redirect need a destination path.';
    if (!input.target.startsWith('/') || input.target.startsWith('//') || /[?#\s\\]/.test(input.target)) return 'Enter a destination path on this site, such as /guides/best-tent.';
    if (input.target === input.path) return 'Choose a different page as the destination.';
  }
  return null;
}

export function taskInputError(input: { status: string; dueDate: string; doneAt: string; today: string }): string | null {
  if (!['todo', 'in_progress', 'done', 'cancelled'].includes(input.status)) return 'Choose a valid task status.';
  if (input.dueDate && !isCalendarDate(input.dueDate)) return 'Enter a valid due date.';
  if (input.status === 'done' && (!isCalendarDate(input.doneAt) || input.doneAt > input.today)) return 'Enter the date the change went live, today or earlier.';
  return null;
}
