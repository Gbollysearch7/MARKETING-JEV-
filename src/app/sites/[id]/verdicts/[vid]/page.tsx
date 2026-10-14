import { requireSite } from '@/lib/auth';
import { redirect } from 'next/navigation';

/** Old route: a single verdict now opens inside the decision inbox. */
export default async function OldVerdict({ params }: PageProps<'/sites/[id]/verdicts/[vid]'>) {
  const { id, vid } = await params;
  await requireSite(id);
  redirect(`/sites/${id}/inbox?show=all&v=${vid}`);
}
