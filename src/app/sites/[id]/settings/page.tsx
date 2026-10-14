import { requireSite } from '@/lib/auth';
import { SettingsContent } from '@/components/SettingsContent';

export default async function SiteSettings({ params }: { params: Promise<{ id: string }> }) {
  await requireSite((await params).id);
  return <SettingsContent />;
}
