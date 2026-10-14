'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { createApiKeyAction, type CreateKeyState } from './actions';

/** Create a key; the full key is shown once in this form's state and never again. */
export function CreateKeyForm({ scopes }: { scopes: { key: string; label: string; implied?: boolean }[] }) {
  const [state, action] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const [copied, setCopied] = useState(false);

  if (state.token) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-accent bg-accent-soft px-4 py-4" role="status">
        <p className="text-[14px] font-semibold">Copy “{state.name}” now. It will not be shown again.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="mono min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 text-[12.5px]">{state.token}</code>
          <button type="button" className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(state.token!).then(() => setCopied(true)); }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[12.5px] text-muted">Send it as <span className="mono">Authorization: Bearer …</span>. Store it in your CMS or secret manager, never in a URL or in code you commit.</p>
        <div><a href="/settings#api-keys" className="btn btn-sm">Done</a></div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1.5">
          <span className="label">Name</span>
          <input name="name" required maxLength={80} className="input" placeholder="WordPress production" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Expires</span>
          <select name="expires" className="select" defaultValue="">
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label mb-1.5">Scopes</legend>
        {scopes.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="scope" value={s.key} defaultChecked={!s.implied} disabled={s.implied} />
            <span className="mono text-[12.5px]">{s.key}</span>
            <span className="text-muted">{s.label}{s.implied ? ' (every key)' : ''}</span>
          </label>
        ))}
      </fieldset>
      {state.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <div><SubmitButton className="btn btn-primary h-11" pending="Creating…">Create key</SubmitButton></div>
    </form>
  );
}
