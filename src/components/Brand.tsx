import Link from 'next/link';

export function BrandMark() {
  return (
    <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-ink">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
    </span>
  );
}

export function ModelStatus({ live, model }: { live: boolean; model: string }) {
  return live ? (
    <span className="flex items-center gap-2 text-[12.5px] font-semibold"><span className="h-2 w-2 rounded-full bg-ok" />Jev live · <span className="mono font-normal text-muted">{model}</span></span>
  ) : (
    <Link href="/settings" className="flex items-center gap-2 text-[12.5px] font-semibold text-warn"><span className="h-2 w-2 rounded-full bg-warn" />Mock decisions · add your Jev key</Link>
  );
}

/** Header for pages outside a site: the sites list and global settings. */
export function TopBar({ live, model }: { live: boolean; model: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight"><BrandMark />SEO Decision Platform</Link>
        <div className="flex items-center gap-5">
          <Link href="/settings" className="text-[13.5px] text-ink-2 hover:text-ink">Settings</Link>
          <ModelStatus live={live} model={model} />
        </div>
      </div>
    </header>
  );
}
