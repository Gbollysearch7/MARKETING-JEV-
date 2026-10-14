'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sub-navigation for the AI visibility module. */
export function VisTabs({ siteId }: { siteId: string }) {
  const path = usePathname();
  const base = `/sites/${siteId}/visibility`;
  const tabs = [
    { href: base, label: 'Overview', active: path === base || path.startsWith(`${base}/prompts`) },
    { href: `${base}/answers`, label: 'Answers', active: path.startsWith(`${base}/answers`) },
    { href: `${base}/setup`, label: 'Brand and prompts', active: path.startsWith(`${base}/setup`) },
  ];
  return (
    <nav aria-label="AI visibility sections" className="mb-6 flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 sm:w-fit">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? 'page' : undefined}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${t.active ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-ink-2 hover:bg-sunken'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
