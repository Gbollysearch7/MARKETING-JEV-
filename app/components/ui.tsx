import type { ReactNode } from "react";

export type Tone = "teal" | "blue" | "purple" | "red" | "amber" | "gray";
const tones: Record<Tone, string> = {
  teal: "bg-teal-soft text-teal-ink",
  blue: "bg-blue-soft text-blue-ink",
  purple: "bg-purple-soft text-purple-ink",
  red: "bg-red-soft text-red-ink",
  amber: "bg-amber-soft text-amber-ink",
  gray: "bg-soft text-muted",
};

export function Chip({ tone = "gray", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
}

export function Bar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <span className="inline-flex items-center gap-2 min-w-[120px]">
      <span className="grow h-1.5 rounded-full bg-soft overflow-hidden">
        <span className="block h-1.5 rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs w-9 text-right">{label ?? value.toFixed(2)}</span>
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bg-surface border border-line rounded-[10px] ${className}`}>{children}</section>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-2xl font-medium mt-1">{value}</div>
      {note ? <div className="text-xs text-muted mt-1">{note}</div> : null}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 px-7 py-4 bg-surface border-b border-line">
      <div className="grow min-w-[240px]">
        <h1 className="text-[22px] font-semibold m-0">{title}</h1>
        {subtitle ? <div className="text-[13px] text-muted mt-0.5">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex gap-2 flex-wrap">{actions}</div> : null}
    </header>
  );
}

export const btn = {
  primary: "inline-flex items-center justify-center min-h-10 px-4 rounded-lg bg-teal text-white font-medium hover:bg-teal-ink disabled:opacity-50 cursor-pointer",
  secondary: "inline-flex items-center justify-center min-h-10 px-4 rounded-lg bg-surface border border-[#d5d2cb] font-medium hover:bg-paper cursor-pointer",
  small: "inline-flex items-center justify-center min-h-8 px-3 rounded-md bg-surface border border-[#d5d2cb] text-[13px] hover:bg-paper cursor-pointer",
  smallPrimary: "inline-flex items-center justify-center min-h-8 px-3 rounded-md bg-teal text-white text-[13px] font-medium hover:bg-teal-ink cursor-pointer",
  danger: "inline-flex items-center justify-center min-h-8 px-3 rounded-md bg-surface border border-[#d5d2cb] text-[13px] text-red-ink hover:bg-red-soft cursor-pointer",
};

export function pill(active: boolean): string {
  return active
    ? "inline-flex items-center justify-center min-h-8 px-3 rounded-md bg-ink text-white border border-ink text-[13px] cursor-default"
    : "inline-flex items-center justify-center min-h-8 px-3 rounded-md bg-surface border border-[#d5d2cb] text-[13px] hover:bg-paper cursor-pointer";
}

export const field = "w-full min-h-10 px-3 rounded-lg border border-[#d5d2cb] bg-surface font-sans text-[14px]";
export const label = "block text-xs text-muted mb-1";

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || u.hostname;
  } catch {
    return url;
  }
}

export function Empty({ children }: { children: ReactNode }) {
  return <Card className="p-8 text-center text-muted">{children}</Card>;
}
