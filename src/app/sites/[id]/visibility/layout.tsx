import { requireSite } from '@/lib/auth';
import { VisTabs } from '@/components/visibility/VisTabs';

export default async function VisibilityLayout({ children, params }: LayoutProps<'/sites/[id]/visibility'>) {
  const { id } = await params;
  await requireSite(id);
  return (
    <div className="flex min-w-0 flex-col">
      <VisTabs siteId={id} />
      {children}
    </div>
  );
}
