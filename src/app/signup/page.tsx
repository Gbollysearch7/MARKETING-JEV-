import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';
import { getViewer } from '@/lib/auth';

export default async function Signup() {
  if (await getViewer()) redirect('/sites');
  return (
    <AuthShell title="Start your free trial" sub="14 days, full verdicts on up to 1,000 URLs. No card needed.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
