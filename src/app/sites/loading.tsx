import { Bone } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 pt-24" aria-busy="true" aria-label="Loading">
      <Bone className="h-12 w-72" />
      <div className="grid gap-5 md:grid-cols-[1fr_320px]"><Bone className="h-36" /><Bone className="h-80" /></div>
    </main>
  );
}
