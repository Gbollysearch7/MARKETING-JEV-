import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { SettingsContent } from '@/components/SettingsContent';
import { StatusBadge, fmtDateTime } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { DAY_NAMES, runScheduledNow, saveSchedule, scheduleInputError, scheduleSummary, type ScheduleMode } from '@/lib/schedule';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
/** Times on this card are UK time, whatever the server's zone. */
const ukTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default async function SiteSettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { viewer } = await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const sum = scheduleSummary(id);
  const { setting } = sum;

  async function save(formData: FormData) {
    'use server';
    await requireSite(id);
    const input = { mode: String(formData.get('mode')) as ScheduleMode, dow: Number(formData.get('dow')), hour: Number(formData.get('hour')) };
    const err = scheduleInputError(input);
    if (err) redirect(`/sites/${id}/settings?serr=${encodeURIComponent(err)}#schedule`);
    saveSchedule(id, input);
    revalidatePath(`/sites/${id}/settings`);
    redirect(`/sites/${id}/settings?saved=1#schedule`);
  }

  async function runNow() {
    'use server';
    const { viewer: v } = await requireSite(id);
    if (!v.status.active) redirect('/billing');
    const res = await runScheduledNow(id);
    revalidatePath(`/sites/${id}`, 'layout');
    if (!res.ok) redirect(`/sites/${id}/settings?serr=${encodeURIComponent(res.error)}#schedule`);
    redirect(`/sites/${id}/settings?ran=1#schedule`);
  }

  const last = sum.runs[0] ?? null;
  return (
    <div className="flex max-w-[920px] flex-col gap-5">
      {sp.saved && <Toast key="saved" message="Schedule saved" />}
      {sp.ran && <Toast key="ran" message="Scoring started" />}
      <SettingsContent />

      <section id="schedule" className="card flex scroll-mt-6 flex-col gap-4 px-6 py-5">
        <div>
          <h2 className="font-semibold">Weekly re-scoring</h2>
          <p className="text-[13px] text-muted">Re-scores every URL on this site once a week with the latest data, within your plan’s limit of {viewer.status.urlLimit.toLocaleString('en-GB')} URLs. Times are UK time.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="label">Next run</div>
            <div className="display mt-1 text-[24px] leading-tight">{sum.next ? ukTime(sum.next) : 'Not scheduled'}</div>
            {sum.note && <div className="mt-0.5 text-[12.5px] text-muted">{sum.note}</div>}
          </div>
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="label">Last run</div>
            <div className="display mt-1 text-[24px] leading-tight">{last ? ukTime(last.created_at) : 'None yet'}</div>
            {last && <div className="mt-0.5 text-[12.5px] text-muted">{last.trigger === 'manual' ? 'Run now' : 'Scheduled'} · {last.outcome === 'started' ? (last.job_status ?? 'started') : last.outcome}</div>}
          </div>
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="label">Schedule</div>
            <div className="display mt-1 text-[24px] leading-tight">{setting.mode === 'off' ? 'Off' : `${DAY_NAMES[setting.dow]}s, ${hh(setting.hour)}`}</div>
            {setting.isDefault && <div className="mt-0.5 text-[12.5px] text-muted">Default</div>}
          </div>
        </div>

        {sp.serr && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[13px] text-bad">{sp.serr}</div>}

        <form action={save} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="label">Re-scoring</span>
            <select name="mode" className="select" defaultValue={setting.mode}><option value="weekly">Weekly</option><option value="off">Off</option></select>
          </label>
          <label className="flex flex-col gap-1"><span className="label">Day</span>
            <select name="dow" className="select" defaultValue={setting.dow}>{DAY_ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1"><span className="label">Time (UK)</span>
            <select name="hour" className="select" defaultValue={setting.hour}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
          </label>
          <SubmitButton pending="Saving…">Save schedule</SubmitButton>
        </form>
        <form action={runNow} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <SubmitButton className="btn btn-primary" pending="Starting…" disabled={!viewer.status.active}>Run now</SubmitButton>
          <span className="text-[13px] text-muted">{viewer.status.active ? 'Re-scores now with the same checks and plan limit as the schedule.' : 'Choose a plan in Billing to run scoring.'}</span>
        </form>

        {sum.runs.length > 0 && (
          <div className="-mx-6 overflow-x-auto border-t border-line">
            <table className="tbl min-w-[620px]">
              <thead><tr><th>When</th><th>Trigger</th><th>Due</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>
                {sum.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td>{r.trigger === 'manual' ? 'Run now' : 'Schedule'}</td>
                    <td className="whitespace-nowrap text-muted">{r.trigger === 'manual' ? '—' : ukTime(r.due_at)}</td>
                    <td>{r.outcome === 'skipped' ? <span className="inline-flex rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-muted">Skipped</span> : <StatusBadge s={r.outcome === 'started' ? (r.job_status ?? 'running') : 'failed'} />}</td>
                    <td className="max-w-[320px] text-[13px] text-muted">{[r.reason, r.error, r.job_error, r.job_status === 'done' ? r.job_message : null].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
