'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type J = { status: string; progress: number; total: number; message: string | null; error: string | null };

/** Polls a running job and refreshes the page when it finishes. */
export function JobProgress({ jobId, initial, label }: { jobId: string; initial: J; label: string }) {
  const router = useRouter();
  const [job, setJob] = useState<J>(initial);
  useEffect(() => {
    if (job.status !== 'running') return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as J;
      setJob(next);
      if (next.status !== 'running') {
        clearInterval(t);
        router.refresh();
      }
    }, 700);
    return () => clearInterval(t);
  }, [jobId, job.status, router]);

  const pct = job.total ? Math.round((job.progress / job.total) * 100) : 0;
  return (
    <div className="card border-warn/30 px-5 py-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">{label}</div>
        <div className="num text-[13px] text-muted">{job.total ? `${pct}%` : ''}</div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${job.total ? Math.max(2, pct) : 2}%` }} />
      </div>
      <div className="mt-2 text-[13px] text-muted">{job.status === 'failed' ? <span className="text-bad">{job.error}</span> : job.message}</div>
    </div>
  );
}
