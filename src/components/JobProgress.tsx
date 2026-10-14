'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type J = { status: string; progress: number; total: number; message: string | null; error: string | null };

/** Polls a running job and refreshes the page when it finishes. */
export function JobProgress({ jobId, initial, label }: { jobId: string; initial: J; label: string }) {
  const router = useRouter();
  const [job, setJob] = useState<J>(initial);
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    if (job.status !== 'running') return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const t = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error('Progress unavailable');
        const next = (await res.json()) as J;
        if (!active) return;
        setDisconnected(false);
        setJob(next);
        if (next.status !== 'running') {
          clearInterval(t);
          router.refresh();
        }
      } catch {
        if (active) setDisconnected(true);
      } finally { inFlight = false; }
    }, 1500);
    return () => { active = false; clearInterval(t); controller.abort(); };
  }, [jobId, job.status, router]);

  const pct = job.total ? Math.max(0, Math.min(100, Math.round((job.progress / job.total) * 100))) : 0;
  return (
    <div className="card border-warn/30 px-5 py-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">{label}</div>
        <div className="num text-[13px] text-muted">{job.total ? `${pct}%` : ''}</div>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.total ? pct : undefined} className="mt-2.5 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${job.total ? Math.max(2, pct) : 2}%` }} />
      </div>
      <div className="mt-2 text-[13px] text-muted">{job.status === 'failed' ? <span className="text-bad">{job.error}</span> : job.message}</div>
      {disconnected && <p role="status" className="mt-2 text-[13px] text-warn">Progress updates are unavailable. Reconnecting automatically…</p>}
    </div>
  );
}
