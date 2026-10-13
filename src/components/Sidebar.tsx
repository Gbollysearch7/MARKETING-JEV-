'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './Brand';

type Item = { href: string; label: string; count?: number; strong?: boolean; tag?: string };

/** The site's sidebar: one entry per feature of the platform (PRD modules), with the active page highlighted. */
export function Sidebar({ site, counts, live, model }: {
  site: { id: string; name: string; domain: string };
  counts: { review: number; pairs: number; tasks: number };
  live: boolean;
  model: string;
}) {
  const path = usePathname();
  const base = `/sites/${site.id}`;
  const groups: { title?: string; items: Item[] }[] = [
    {
      title: 'Content decisions',
      items: [
        { href: base, label: 'Overview' },
        { href: `${base}/inbox`, label: 'Decision inbox', count: counts.review, strong: true },
        { href: `${base}/cannibalisation`, label: 'Cannibalisation', count: counts.pairs },
        { href: `${base}/queue`, label: 'Work queue', count: counts.tasks },
        { href: `${base}/outcomes`, label: 'Outcomes' },
        { href: `${base}/report`, label: 'Monthly report' },
        { href: `${base}/decisions`, label: 'Decision log' },
      ],
    },
    {
      title: 'More features',
      items: [
        { href: `${base}/gate`, label: 'Quality gate', tag: 'M6' },
        { href: `${base}/keywords`, label: 'Keyword clusters', tag: 'M7' },
        { href: `${base}/briefs`, label: 'Brief desk', tag: 'M8' },
        { href: `${base}/visibility`, label: 'AI visibility', tag: 'Year 2' },
        { href: `${base}/links`, label: 'Link prospects', tag: 'Year 2' },
        { href: `${base}/local`, label: 'Local SEO', tag: 'Year 2' },
      ],
    },
    {
      items: [
        { href: `${base}/data`, label: 'Data sources' },
        { href: `${base}/settings`, label: 'Settings' },
      ],
    },
  ];
  const isActive = (href: string) => (href === base ? path === base : path === href || path.startsWith(`${href}/`));

  return (
    <aside className="no-print flex w-full flex-col gap-6 border-b border-line bg-surface px-4 py-5 md:sticky md:top-0 md:h-screen md:w-[248px] md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <Link href="/" className="flex items-center gap-2.5 px-2 text-[14px] font-bold leading-tight tracking-tight">
        <BrandMark />
        <span>SEO Decision<br />Platform</span>
      </Link>
      <Link href="/" className="flex min-h-12 items-center justify-between gap-2 rounded-[10px] border border-line bg-[#f9fafb] px-3 py-2 hover:border-line-strong" title="Switch site">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{site.name}</span>
          <span className="mono truncate text-[11.5px] text-muted">{site.domain}</span>
        </span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6l3-3 3 3M5 10l3 3 3-3" /></svg>
      </Link>
      <nav aria-label="Features" className="flex flex-col gap-[18px]">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {g.title && <div className="px-3 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted">{g.title}</div>}
            {g.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-[14px] ${active ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}
                >
                  <span className="flex-1">{it.label}</span>
                  {it.count ? (
                    <span className={`mono rounded-full px-[7px] text-[11.5px] ${it.strong ? 'bg-ink text-white' : 'text-muted'}`}>{it.count.toLocaleString('en-GB')}</span>
                  ) : null}
                  {it.tag && <span className={`text-[11px] ${active ? '' : 'text-muted'}`}>{it.tag}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1.5 rounded-[10px] bg-bg p-3">
        {live ? (
          <>
            <div className="flex items-center gap-2 text-[12.5px] font-semibold"><span className="h-2 w-2 rounded-full bg-ok" />Jev live</div>
            <div className="mono text-[11.5px] text-muted">{model} · pinned</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-warn"><span className="h-2 w-2 rounded-full bg-warn" />Mock decisions</div>
            <Link href={`${base}/settings`} className="text-[11.5px] text-muted underline">Add your Jev key</Link>
          </>
        )}
      </div>
    </aside>
  );
}
