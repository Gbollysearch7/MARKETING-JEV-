import type { ReactNode } from 'react';

/** Frame for a feature that arrives in a later milestone: a clear banner, then a preview of how it works. */
export function ModulePage({ milestone, title, sub, actions, children }: { milestone: string; title: string; sub: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-[13px] text-[#6b3400]"><strong>{milestone}.</strong> This page previews how the feature will work. Content in brackets and example rows are placeholders until it is built.</div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[760px] flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          <p className="text-muted">{sub}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Pill({ fg, bg, children }: { fg: string; bg: string; children: ReactNode }) {
  return <span className="self-start whitespace-nowrap rounded-md px-2.5 py-0.5 text-[12px] font-bold" style={{ color: fg, background: bg }}>{children}</span>;
}
