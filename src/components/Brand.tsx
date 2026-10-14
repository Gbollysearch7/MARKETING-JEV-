import Link from 'next/link';
import { signOutAction } from '@/lib/actions';
import { BRAND } from '@/lib/brand';
import { ThemeToggle } from './ThemeToggle';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span aria-hidden className="grid place-items-center rounded-[9px] bg-inverse shadow-[inset_0_-2px_0_rgba(255,255,255,0.08)]" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none" stroke="#b9e3c6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
    </span>
  );
}

/** Mark plus the name set in the display serif. Pass href={null} for a non-link (e.g. inside another link). */
export function Wordmark({ href = '/', size = 24 }: { href?: string | null; size?: number }) {
  const inner = (
    <>
      <BrandMark size={size + 4} />
      <span className="display leading-none" style={{ fontSize: size }}>{BRAND.name}</span>
    </>
  );
  return href === null ? <span className="flex items-center gap-2.5">{inner}</span> : <Link href={href} className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>{inner}</Link>;
}

export function ModelStatus({ live, model }: { live: boolean; model: string }) {
  return live ? (
    <span className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Jev live <span className="mono">{model}</span></span>
  ) : (
    <Link href="/settings" className="flex items-center gap-2 text-[12.5px] font-medium text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn" />Offline mock · add your Jev key</Link>
  );
}

/** Header for signed-in pages outside a site: the sites list, settings and billing. */
export function TopBar({ live, model, viewer }: { live: boolean; model: string; viewer?: { email: string } }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Wordmark href="/sites" />
        <nav aria-label="Account" className="flex flex-wrap items-center gap-1">
          <Link href="/sites" className="btn btn-ghost btn-sm">Sites</Link>
          <Link href="/settings" className="btn btn-ghost btn-sm">Settings</Link>
          <Link href="/billing" className="btn btn-ghost btn-sm">Billing</Link>
          <span className="mx-1"><ThemeToggle compact /></span>
          <span className="mx-2 hidden md:inline"><ModelStatus live={live} model={model} /></span>
          {viewer && (
            <form action={signOutAction} className="flex items-center gap-2">
              <span className="hidden text-[13px] text-muted lg:inline">{viewer.email}</span>
              <button className="btn btn-sm">Sign out</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
