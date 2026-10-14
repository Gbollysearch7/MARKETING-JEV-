'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setLossStatusAction } from '@/lib/modules/visibility-actions';

/** Status menu for one loss register row. Saves on change; marking done records the date for the outcome loop. */
export function LossStatusSelect({ lossId, status, prompt }: { lossId: string; status: string; prompt: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="select h-8 min-w-[124px] py-0 text-[13px]"
        aria-label={`Status for “${prompt}”`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setError(null);
          start(async () => {
            const err = await setLossStatusAction(lossId, next);
            if (err) { setError(err); setValue(prev); } else router.refresh();
          });
        }}
      >
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
      </select>
      {error && <span role="alert" className="text-[11.5px] text-bad">{error}</span>}
    </span>
  );
}
