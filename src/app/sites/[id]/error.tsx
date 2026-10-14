'use client';

import { ErrorNotice } from '@/components/ErrorNotice';

export default function SiteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorNotice retry={retry} />;
}
