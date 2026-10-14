'use client';

import Link from 'next/link';

export function ErrorNotice({ retry }: { retry: () => void }) {
  return (
    <section role="alert" className="card mx-auto flex max-w-xl flex-col gap-4 p-6 sm:p-8">
      <h1 className="display text-[32px] leading-tight">We couldn’t load this page</h1>
      <p className="text-muted">Try again. If you just submitted a change, reload the page to check its status before submitting it again.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={retry}>Try again</button><Link href="/sites" className="btn">Back to sites</Link></div>
    </section>
  );
}
