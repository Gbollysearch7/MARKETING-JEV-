'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** A brief confirmation that slides in after an action and fades away. Announced to screen readers. */
export function Toast({ message, tone = 'ok', link }: { message: string; tone?: 'ok' | 'bad'; link?: { href: string; label: string } }) {
  const [show, setShow] = useState(true);
  const hasLink = Boolean(link);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), hasLink ? 7000 : 3200);
    return () => clearTimeout(t);
  }, [hasLink]);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 w-max max-w-[calc(100vw-32px)] -translate-x-1/2">
      <div className="toast-in flex items-center gap-2.5 rounded-full bg-inverse px-4 py-2.5 text-[13.5px] text-[#f4f1ea] shadow-[var(--shadow-lg)]">
        <span className={`h-2 w-2 rounded-full ${tone === 'ok' ? 'bg-[#b9e3c6]' : 'bg-[#ffb4ab]'}`} />
        {message}
        {link && <Link href={link.href} className="pointer-events-auto font-semibold text-[#f4f1ea] underline underline-offset-2">{link.label}</Link>}
      </div>
    </div>
  );
}
