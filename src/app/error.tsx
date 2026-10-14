'use client';

import { ErrorNotice } from '@/components/ErrorNotice';

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main id="main-content" tabIndex={-1} className="px-5 py-12"><ErrorNotice retry={retry} /></main>;
}
