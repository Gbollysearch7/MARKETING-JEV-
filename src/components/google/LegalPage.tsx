import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BRAND } from '@/lib/brand';

const LINKS = [['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/security', 'Security']] as const;

/**
 * Public legal page in the landing page's look: header, a draft notice, readable long-form text, footer.
 * Used by /privacy, /terms and /security (pages Google's OAuth verification checks).
 */
export function LegalPage({ title, sub, updated, current, children }: { title: string; sub: string; updated: string; current: string; children: ReactNode }) {
  return (
    <div className="overflow-x-clip bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Wordmark href="/" />
          <nav aria-label="Legal" className="flex items-center gap-1">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} aria-current={href === current ? 'page' : undefined} className={`btn btn-ghost btn-sm ${href === current ? 'bg-sunken' : ''}`}>{label}</Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[760px] px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div role="note" className="mb-8 rounded-xl border border-line bg-warn-bg px-4 py-3 text-[13.5px] text-warn">
          <b className="font-semibold">Draft — to be reviewed by a lawyer before launch.</b> Text in [square brackets] is a placeholder to fill in.
        </div>
        <h1 className="display text-[44px] leading-[1.05] sm:text-[56px]">{title}</h1>
        <p className="mt-3 text-[16px] text-ink-2">{sub}</p>
        <p className="mt-2 text-[13px] text-muted">Last updated: {updated}</p>
        <article className="mt-10 text-[15px] leading-relaxed text-ink-2 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_b]:font-semibold [&_b]:text-ink [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-semibold [&_h2]:text-[19px] [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:px-8">
          <span className="flex items-center gap-3"><Wordmark href={null} size={20} /><span>{BRAND.tagline}</span></span>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-5">
            <Link href="/" className="hover:text-ink">Home</Link>
            {LINKS.map(([href, label]) => <Link key={href} href={href} className="hover:text-ink">{label}</Link>)}
            <ThemeToggle compact />
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A table that scrolls inside itself on narrow screens. */
export function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="tbl min-w-[560px]">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
