import type { ReactNode } from 'react';
import { Wordmark } from './Brand';

export function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <Wordmark href="/" />
        <div className="flex flex-col gap-1.5">
          <h1 className="display text-[40px] leading-[1.05]">{title}</h1>
          <p className="text-muted">{sub}</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
