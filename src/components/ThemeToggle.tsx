'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';

function read(): Theme {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

/** System / Light / Dark. The choice is saved in this browser and applied before paint by the script in the root layout. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);
  const set = (t: Theme) => {
    try {
      if (t === 'system') { localStorage.removeItem('theme'); document.documentElement.removeAttribute('data-theme'); }
      else { localStorage.setItem('theme', t); document.documentElement.setAttribute('data-theme', t); }
    } catch { /* storage blocked: still switch for this page */
      if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    }
  };
  const opts: { t: Theme; label: string; icon: React.ReactNode }[] = [
    { t: 'system', label: 'System', icon: <path d="M2.5 3.5h11v7h-11zM6 13.5h4" /> },
    { t: 'light', label: 'Light', icon: <><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></> },
    { t: 'dark', label: 'Dark', icon: <path d="M13 9.5A5.5 5.5 0 116.5 3a4.5 4.5 0 006.5 6.5z" /> },
  ];
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-[9px] border border-line bg-sunken p-0.5">
      {opts.map((o) => (
        <button key={o.t} type="button" role="radio" aria-checked={theme === o.t} title={o.label} onClick={() => set(o.t)}
          className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors ${theme === o.t ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-muted hover:text-ink'}`}>
          <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{o.icon}</svg>
          {!compact && o.label}
          {compact && <span className="sr-only">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
