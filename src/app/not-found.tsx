import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-xl flex-col items-start gap-4 px-5 py-16">
      <h1 className="display text-[40px] leading-tight">Page not found</h1>
      <p className="text-muted">This page may have moved, or you may not have access to this site.</p>
      <Link href="/sites" className="btn btn-primary">Back to sites</Link>
    </main>
  );
}
