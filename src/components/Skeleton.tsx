/** Placeholder blocks shown while a page loads, shaped like the page so nothing jumps when data arrives. */
export function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-sunken ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3"><Bone className="h-3 w-52" /><Bone className="h-10 w-[420px] max-w-full" /></div>
      <div className="card flex flex-col gap-4 p-6"><Bone className="h-4 w-40" /><Bone className="h-10 w-full" /><div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Bone key={i} className="h-24" />)}</div></div>
      <div className="grid gap-5 md:grid-cols-2"><div className="card flex flex-col gap-3 p-6"><Bone className="h-4 w-32" />{Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-5" />)}</div><div className="card flex flex-col gap-3 p-6"><Bone className="h-4 w-32" />{Array.from({ length: 4 }, (_, i) => <Bone key={i} className="h-5" />)}</div></div>
    </div>
  );
}
