'use client';

import { useEffect, useState } from 'react';

type Row = { v: string; name: string; path: string; p: string; imp: string; why: string[]; stat: [string, string]; gain: string };

const ROWS: Row[] = [
  { v: 'expand', name: 'Expand', path: '/guides/best-via-ferrata', p: '1.00', imp: '+379 to +1,528', why: ['Ranks 8 to 20 for 8 high-volume searches', 'Thin for the topic: 650 words'], stat: ['Searches at 8–20', '8'], gain: '+1,528' },
  { v: 'merge', name: 'Merge', path: '/guides/how-to-choose-hiking-boots', p: '0.81', imp: '−7 to +270', why: ['Shares 8 top-20 searches with /guides/best-hiking-boots', 'The other page earns more clicks'], stat: ['Shared searches', '8'], gain: '+270' },
  { v: 'redirect', name: 'Redirect', path: '/blog/spring-sale-camping-stove', p: '1.00', imp: 'keeps 19 linking sites', why: ['No clicks and no search demand', '19 referring domains worth keeping'], stat: ['Linking sites', '19'], gain: 'links kept' },
  { v: 'prune', name: 'Prune', path: '/news/store-update-2019-0', p: '1.00', imp: 'no traffic lost', why: ['No clicks, links or sales', 'Thin: 140 words'], stat: ['Clicks a month', '0'], gain: '0 lost' },
];

/** The hero's product demo: reviews one decision after another, the way the real inbox works. */
export function LiveDemo() {
  const [sel, setSel] = useState(0);
  const [phase, setPhase] = useState<'read' | 'press' | 'gone'>('read');
  const [done, setDone] = useState<number[]>([]);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setStill(m.matches);
    apply();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (still) return;
    const t = setTimeout(() => {
      if (phase === 'read') setPhase('press');
      else if (phase === 'press') { setPhase('gone'); setDone((d) => [...d, sel]); }
      else {
        const next = (sel + 1) % ROWS.length;
        if (next === 0) setDone([]);
        setSel(next);
        setPhase('read');
      }
    }, phase === 'read' ? 2600 : phase === 'press' ? 450 : 1200);
    return () => clearTimeout(t);
  }, [phase, sel, still]);

  const r = ROWS[sel];
  const left = ROWS.length - done.length;
  return (
    <div className="relative mx-auto w-full max-w-[1040px] text-left">
      <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_30%,rgba(47,107,74,0.14),transparent_70%)]" />
      <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--shadow-lg)]" aria-label="Product demo: reviewing decisions in the inbox" role="img">
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="mono ml-3 text-[11.5px] text-muted">Decision inbox · Sample Outdoors</span>
          <span className="ml-auto rounded-full bg-[var(--primary)] px-2 text-[11px] leading-5 text-[var(--primary-fg)]">{left} waiting</span>
        </div>
        <div className="grid md:grid-cols-[1fr_1.15fr]">
          <ul className="divide-y divide-line border-line md:border-r">
            {ROWS.map((row, i) => {
              const gone = done.includes(i);
              const on = i === sel && !gone;
              return (
                <li key={row.path} className={`flex flex-col gap-2 overflow-hidden px-5 transition-all duration-500 ${gone ? 'max-h-0 py-0 opacity-0' : 'max-h-40 py-4 opacity-100'} ${on ? 'bg-selected shadow-[inset_2px_0_0_var(--accent)]' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ color: `var(--${row.v})`, background: `var(--${row.v}-bg)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${row.v}-mark)` }} />{row.name}</span>
                    <span className="mono text-[12px] text-muted">{row.p}</span>
                  </div>
                  <span className="mono truncate text-[12.5px]">{row.path}</span>
                  <span className="text-[12px] text-muted">{row.imp}</span>
                </li>
              );
            })}
            {left === 0 && <li className="px-5 py-10 text-center"><span className="display text-[26px]">Inbox zero.</span></li>}
          </ul>
          <div key={sel} className="enter hidden flex-col gap-5 p-6 md:flex">
            <div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ color: `var(--${r.v})`, background: `var(--${r.v}-bg)` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${r.v}-mark)` }} />{r.name}</span>{r.v === 'prune' || r.v === 'redirect' ? <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11.5px] font-medium text-warn">Always needs your approval</span> : Number(r.p) >= 0.85 ? <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11.5px] font-medium text-ok">Confident</span> : <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11.5px] font-medium text-warn">Needs review</span>}</div>
            <div className="mono text-[15px]">{r.path}</div>
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-[11.5px] text-muted">Probability</div><div className="display text-[34px] leading-none">{r.p}</div></div>
              <div><div className="text-[11.5px] text-muted">{r.stat[0]}</div><div className="display text-[34px] leading-none">{r.stat[1]}</div></div>
              <div><div className="text-[11.5px] text-muted">In 90 days</div><div className="display text-[34px] leading-none text-ok">{r.gain}</div></div>
            </div>
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="text-[12px] font-medium text-muted">Why</div>
              {r.why.map((w) => <div key={w} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: `var(--${r.v}-mark)` }} />{w}</div>)}
            </div>
            <div className="mt-auto flex items-center gap-2">
              <span className={`btn btn-primary btn-sm transition-transform ${phase === 'press' ? 'scale-95 opacity-80' : ''}`}>Approve {r.name}</span>
              <span className="btn btn-sm">Change</span>
              <span className="ml-auto flex items-center gap-1 text-[11.5px] text-muted">press <kbd className="mono rounded-md border border-line bg-surface px-1.5 shadow-[var(--shadow-sm)]">A</kbd></span>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden className={`pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 transition-all duration-300 ${phase === 'gone' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
        <div className="flex items-center gap-2 rounded-full bg-inverse px-4 py-2 text-[13px] text-[#f4f1ea] shadow-[var(--shadow-lg)]"><span className="h-2 w-2 rounded-full bg-[#b9e3c6]" />Approved {r.name} · {Math.max(0, left)} left</div>
      </div>
    </div>
  );
}
