'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/** A submit button that disables itself and shows progress while its form's server action runs. */
export function SubmitButton({ children, pending: pendingLabel, className = 'btn', name, value, disabled, dataKey }: {
  children: ReactNode; pending?: string; className?: string; name?: string; value?: string; disabled?: boolean; dataKey?: string;
}) {
  const { pending, data } = useFormStatus();
  const submitting = pending && (!name || data?.get(name) === value);
  return (
    <button className={className} name={name} value={value} disabled={disabled || pending} aria-busy={submitting} data-key={dataKey}>
      {submitting ? (
        <>
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
          {pendingLabel ?? 'Working…'}
        </>
      ) : children}
    </button>
  );
}
