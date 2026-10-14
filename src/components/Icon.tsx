/** Small stroke icons, drawn to one 16px grid so they read as one family. */
const PATHS: Record<string, React.ReactNode> = {
  overview: <><rect x="2" y="2" width="5" height="5" rx="1.5" /><rect x="9" y="2" width="5" height="5" rx="1.5" /><rect x="2" y="9" width="5" height="5" rx="1.5" /><rect x="9" y="9" width="5" height="5" rx="1.5" /></>,
  inbox: <><path d="M2 9.5l1.6-6A1 1 0 014.6 2.8h6.8a1 1 0 011 .7l1.6 6" /><path d="M2 9.5V13a1 1 0 001 1h10a1 1 0 001-1V9.5h-3.5l-1 1.5h-3l-1-1.5z" /></>,
  overlap: <><circle cx="6" cy="8" r="4" /><circle cx="10" cy="8" r="4" /></>,
  queue: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8l1.8 1.8L10.8 6.3" /></>,
  outcomes: <path d="M2 13l4-4 3 3 5-6" />,
  report: <><path d="M4 2h5.5L13 5.5V14H4z" /><path d="M6.5 8.5h4M6.5 11h4" /></>,
  log: <><path d="M3 4h10M3 8h10M3 12h6" /></>,
  gate: <path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z" />,
  clusters: <><circle cx="5" cy="5" r="2.3" /><circle cx="11" cy="5" r="2.3" /><circle cx="8" cy="11" r="2.3" /></>,
  briefs: <><path d="M4 2h5.5L13 5.5V14H4z" /><path d="M9 2v4h4" /></>,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>,
  link: <><path d="M7 9a3 3 0 004 0l2-2a3 3 0 00-4-4l-1 1" /><path d="M9 7a3 3 0 00-4 0L3 9a3 3 0 004 4l1-1" /></>,
  pin: <><path d="M8 14s5-4.2 5-8A5 5 0 003 6c0 3.8 5 8 5 8z" /><circle cx="8" cy="6" r="1.8" /></>,
  data: <><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" /><path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" /></>,
  settings: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /></>,
  chevrons: <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
};

export function Icon({ name, size = 16, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
