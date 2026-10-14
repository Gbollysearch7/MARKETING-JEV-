'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

type Item = { label: string; href: string; hint?: string; icon?: string; verdict?: string | null };

const PAGES: [string, string, string][] = [
  ['Overview', '', 'overview'], ['Decision inbox', '/inbox', 'inbox'], ['Cannibalisation', '/cannibalisation', 'overlap'], ['Work queue', '/queue', 'queue'],
  ['Outcomes', '/outcomes', 'outcomes'], ['Accuracy', '/accuracy', 'gate'], ['Monthly report', '/report', 'report'], ['Decision log', '/decisions', 'log'], ['Data sources', '/data', 'data'],
  ['Settings', '/settings', 'settings'], ['Quality gate', '/gate', 'gate'], ['Keyword clusters', '/keywords', 'clusters'], ['Brief desk', '/briefs', 'briefs'],
  ['AI visibility', '/visibility', 'eye'], ['Link prospects', '/links', 'link'], ['Local SEO', '/local', 'pin'],
];

/** ⌘K / Ctrl+K: jump to any page, or to any URL's decision. */
export function CommandBar({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [urls, setUrls] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const base = `/sites/${siteId}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-bar', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-command-bar', onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => input.current?.focus(), 10);
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => { clearTimeout(t); window.removeEventListener('keydown', trapFocus); previousFocus?.focus(); };
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const json = (await res.json()) as { results?: { id: string; path: string; verdict: string | null }[] };
        setUrls((json.results ?? []).map((r) => ({ label: r.path, href: `${base}/inbox?show=all&v=${r.id}`, verdict: r.verdict })));
      } catch { /* aborted */ }
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, siteId, base]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter(([l]) => !term || l.toLowerCase().includes(term)).map(([l, h, icon]) => ({ label: l, href: `${base}${h}`, icon, hint: 'Page' }));
    return [...pages, ...(term.length >= 2 ? urls : [])];
  }, [q, urls, base]);

  if (!open) return null;
  const go = (it: Item | undefined) => { if (!it) return; setOpen(false); setQ(''); router.push(it.href); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(29,27,23,0.28)] px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Jump to" className="enter w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); if (e.target.value.trim().length < 2) setUrls([]); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
            }}
            placeholder="Jump to a page or search URLs…"
            aria-label="Jump to a page or search URLs"
            aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <button type="button" className="btn btn-sm" aria-label="Close search" onClick={() => setOpen(false)}>Close</button>
        </div>
        <ul id="cmd-list" role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-muted">Nothing matches.</li>}
          {items.map((it, i) => (
            <li key={it.href} id={`cmd-${i}`} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(it)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? 'bg-sunken' : ''}`}>
                {it.icon ? <Icon name={it.icon} className="text-muted" /> : <span className="h-2 w-2 rounded-full" style={{ background: it.verdict ? `var(--${it.verdict}-mark)` : 'var(--line-strong)' }} />}
                <span className={`flex-1 truncate ${it.icon ? '' : 'mono text-[13px]'}`}>{it.label}</span>
                <span className="text-[12px] text-muted">{it.hint ?? (it.verdict ? it.verdict.charAt(0).toUpperCase() + it.verdict.slice(1) : 'URL')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Sidebar trigger that opens the command bar. */
export function CommandTrigger() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event('open-command-bar'))} className="mx-1 flex h-9 items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-[13px] text-muted shadow-[var(--shadow-sm)] hover:text-ink">
      <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
      <span className="flex-1 text-left">Search</span>
      <kbd className="mono text-[11px]">⌘K</kbd>
    </button>
  );
}
