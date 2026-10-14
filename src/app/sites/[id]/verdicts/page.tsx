import { requireSite } from '@/lib/auth';
import { redirect } from 'next/navigation';

/** Old route: the verdict list is now the decision inbox. */
export default async function OldVerdicts({ params }: PageProps<'/sites/[id]/verdicts'>) {
  const { id } = await params;
  await requireSite(id);
  redirect(`/sites/${id}/inbox?show=all`);
}
