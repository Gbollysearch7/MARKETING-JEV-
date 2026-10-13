"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteTabs({ siteId, counts }: { siteId: string; counts?: { links?: number; cannibal?: number; gate?: number } }) {
  const pathname = usePathname();
  const base = `/sites/${siteId}`;
  const tabs = [
    { href: base, name: "Overview" },
    { href: `${base}/links`, name: "Link plan", count: counts?.links },
    { href: `${base}/cannibalisation`, name: "Cannibalisation", count: counts?.cannibal },
    { href: `${base}/gate`, name: "Publish gate", count: counts?.gate },
    { href: `${base}/decisions`, name: "Decisions" },
  ];
  return (
    <nav aria-label="Site sections" className="flex gap-1 px-7 bg-surface border-b border-line overflow-x-auto">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`min-h-11 flex items-center gap-2 px-3 border-b-2 whitespace-nowrap ${active ? "border-teal text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.name}
            {t.count !== undefined ? <span className="font-mono text-xs text-faint">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
