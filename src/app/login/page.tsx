import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';
import { getViewer } from '@/lib/auth';

export default async function Login({ searchParams }: PageProps<'/login'>) {
  if (await getViewer()) redirect('/sites');
  const sp = (await searchParams) as Record<string, string | undefined>;
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : undefined;
  return (
    <AuthShell title="Sign in" sub="Every URL gets a verdict, a reason, a confidence and an expected impact.">
      {sp.expired === '1' && <p role="status" className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">Your session has ended. Sign in again to carry on where you were.</p>}
      <AuthForm mode="login" next={next} />
    </AuthShell>
  );
}
