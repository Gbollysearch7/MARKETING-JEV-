'use client';

import { useActionState, useState } from 'react';
import { createSiteFormAction, deleteSiteFormAction, startCrawlFormAction, type FormState } from '@/lib/actions';
import { SubmitButton } from './SubmitButton';

export function CreateSiteForm() {
  const [state, action] = useActionState<FormState, FormData>(createSiteFormAction, {});
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1 text-[13px] font-semibold">Site name<input name="name" required placeholder="Acme blog" className="input font-normal" /></label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">Domain<input name="domain" required autoCapitalize="none" spellCheck={false} placeholder="www.acme.co.uk" className="input font-normal" /></label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">Sitemap URL (optional)<input name="sitemap" type="url" placeholder="https://www.acme.co.uk/sitemap.xml" className="input font-normal" /></label>
      <label className="flex items-start gap-2.5 text-[13px] text-ink-2"><input type="checkbox" name="sample" className="mt-0.5 h-4 w-4" />Try sample exports from a fictional outdoor shop</label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{state.error}</p>}
      <SubmitButton className="btn btn-primary h-12 justify-center" pending="Adding site…">Add site and continue</SubmitButton>
    </form>
  );
}

export function CrawlForm({ siteId, sitemap, limit, running, active }: { siteId: string; sitemap: string; limit: number; running: boolean; active: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(startCrawlFormAction, {});
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-[12px] text-muted">Sitemap URL<input name="sitemap" type="url" required defaultValue={sitemap} className="input w-full" /></label>
      <label className="flex w-24 flex-col gap-1 text-[12px] text-muted">Page limit<input name="limit" type="number" min={1} max={limit} defaultValue={Math.min(500, limit)} className="input w-full" /></label>
      <SubmitButton pending="Starting…" disabled={running || !active}>Crawl</SubmitButton>
      {state.error && <p role="alert" className="w-full rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{state.error}</p>}
      {state.success && <p role="status" className="w-full text-[13px] text-ok">{state.success}</p>}
      {!active && <p className="w-full text-[12px] text-muted">Choose an active plan in Billing to start a crawl.</p>}
    </form>
  );
}

export function DeleteSiteForm({ siteId, name }: { siteId: string; name: string }) {
  const [state, action] = useActionState<FormState, FormData>(deleteSiteFormAction, {});
  const [confirmation, setConfirmation] = useState('');
  return (
    <details className="rounded-xl border border-line p-4">
      <summary className="cursor-pointer text-[13px] text-bad">Delete this site</summary>
      <form action={action} onReset={(e) => e.preventDefault()} className="mt-3 flex max-w-lg flex-col items-start gap-3">
        <input type="hidden" name="siteId" value={siteId} />
        <p className="text-[13px] text-muted">Permanently delete {name}, including its uploads, decisions, tasks and outcomes. This cannot be undone.</p>
        <label className="flex w-full flex-col gap-1 text-[13px]">Type <strong>{name}</strong> to confirm<input name="confirmation" required autoComplete="off" className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
        {state.error && <p role="alert" className="text-[13px] text-bad">{state.error}</p>}
        <SubmitButton className="btn btn-danger" pending="Deleting…" disabled={confirmation !== name}>Delete permanently</SubmitButton>
      </form>
    </details>
  );
}
