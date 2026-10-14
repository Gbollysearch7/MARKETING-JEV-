'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOutAction } from '@/lib/actions';
import { Wordmark } from './Brand';
import { CommandTrigger } from './CommandBar';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

type Item = { href: string; label: string; icon: string; count?: number; strong?: boolean; tag?: string };

/** The site's sidebar: one entry per feature of the platform. On phones it collapses behind a menu button. */
export function Sidebar({ site, counts, live, model, account }: {
  site: { id: string; name: string; domain: string };
  counts: { review: number; pairs: number; tasks: number };
  live: boolean;
  model: string;
  account: { email: string; plan: string; trialDaysLeft: number; onTrial: boolean; active: boolean };
}) {
  const path = usePathname();
  // The phone menu is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenOn(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  const base = `/sites/${site.id}`;
  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { href: base, label: 'Overview', icon: 'overview' },
        { href: `${base}/inbox`, label: 'Decision inbox', icon: 'inbox', count: counts.review, strong: true },
        { href: `${base}/cannibalisation`, label: 'Cannibalisation', icon: 'overlap', count: counts.pairs },
        { href: `${base}/queue`, label: 'Work queue', icon: 'queue', count: counts.tasks },
        { href: `${base}/outcomes`, label: 'Outcomes', icon: 'outcomes' },
        { href: `${base}/accuracy`, label: 'Accuracy', icon: 'gate' },
        { href: `${base}/report`, label: 'Monthly report', icon: 'report' },
        { href: `${base}/decisions`, label: 'Decision log', icon: 'log' },
      ],
    },
    {
      title: 'More decisions',
      items: [
        { href: `${base}/gate`, label: 'Quality gate', icon: 'gate' },
        { href: `${base}/keywords`, label: 'Keyword clusters', icon: 'clusters' },
        { href: `${base}/briefs`, label: 'Brief desk', icon: 'briefs' },
        { href: `${base}/visibility`, label: 'AI visibility', icon: 'eye' },
        { href: `${base}/links`, label: 'Link prospects', icon: 'link' },
        { href: `${base}/local`, label: 'Local SEO', icon: 'pin' },
      ],
    },
    {
      items: [
        { href: `${base}/data`, label: 'Data sources', icon: 'data' },
        { href: `${base}/settings`, label: 'Settings', icon: 'settings' },
      ],
    },
  ];
  const isActive = (href: string) => (href === base ? path === base : path === href || path.startsWith(`${href}/`));

  return (
    <aside className="no-print sticky top-0 z-30 flex w-full flex-col border-b border-line bg-bg/90 backdrop-blur lg:h-screen lg:w-[252px] lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-bg">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:pb-2 lg:pt-5">
        <Wordmark href="/sites" size={22} />
        <span className="ml-auto max-w-[40%] truncate text-[12px] text-muted lg:hidden">{site.name}</span>
        <button type="button" className="btn btn-sm lg:hidden" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpenOn(open ? null : path)}>
          <Icon name="menu" />{open ? 'Close' : 'Menu'}
        </button>
      </div>

      <div id="site-nav" className={`${open ? 'flex' : 'hidden'} max-h-[80vh] flex-col gap-5 overflow-y-auto px-3 pb-4 lg:flex lg:max-h-none lg:flex-1`}>
        <Link href="/sites" className="mx-1 mt-1 flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow-sm)] hover:border-line-strong" title="Switch site">
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-accent-soft text-[12px] font-semibold text-accent-strong">{site.name.slice(0, 2).toUpperCase()}</span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13.5px] font-semibold">{site.name}</span>
              <span className="mono truncate text-[11px] text-muted">{site.domain}</span>
            </span>
          </span>
          <Icon name="chevrons" size={14} className="flex-none text-muted" />
        </Link>

        <CommandTrigger />
        <nav aria-label="Features" className="flex flex-col gap-4">
          {groups.map((g, i) => {
            const links = g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex min-h-9 items-center gap-2.5 rounded-[9px] px-3 text-[13.5px] transition-colors ${active ? 'bg-surface font-medium text-ink shadow-[var(--shadow)] ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}
                  >
                    <Icon name={it.icon} className={active ? 'text-accent' : 'text-muted group-hover:text-ink-2'} />
                    <span className="flex-1">{it.label}</span>
                    {it.count ? (
                      <span className={`mono rounded-full px-1.5 text-[11px] leading-5 ${it.strong ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-muted'}`} aria-label={`${it.count} items`}>{it.count.toLocaleString('en-GB')}</span>
                    ) : null}
                    {it.tag && <span className="rounded-md bg-sunken px-1.5 text-[10.5px] leading-5 text-muted">{it.tag}</span>}
                  </Link>
                );
            });
            return g.title ? (
              <details key={i} open={g.items.some((it) => isActive(it.href))}>
                <summary className="cursor-pointer rounded-lg px-3 py-2 text-[12px] font-medium text-muted">{g.title}</summary>
                <div className="mt-1 flex flex-col gap-px">{links}</div>
              </details>
            ) : <div key={i} className="flex flex-col gap-px">{links}</div>;
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-sm)]">
          <div className="truncate text-[12.5px] font-medium" title={account.email}>{account.email}</div>
          <Link href="/billing" className={`text-[12px] ${account.active ? 'text-muted hover:text-ink' : 'font-medium text-bad'}`}>
            {account.onTrial ? (account.active ? `Free trial · ${account.trialDaysLeft} ${account.trialDaysLeft === 1 ? 'day' : 'days'} left` : 'Trial ended · choose a plan') : `${account.plan} plan`}
          </Link>
          <ThemeToggle compact />
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-ok' : 'bg-warn'}`} />{live ? <span className="mono">{model}</span> : 'Offline mock'}</span>
            <form action={signOutAction}><button className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline">Sign out</button></form>
          </div>
        </div>
      </div>
    </aside>
  );
}
