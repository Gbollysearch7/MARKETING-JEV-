import { requireViewer } from '@/lib/auth';
import { TopBar } from '@/components/Brand';
import { SettingsContent } from '@/components/SettingsContent';
import { providerInfo } from '@/lib/provider';

export default async function Settings() {
  const viewer = await requireViewer();
  const p = providerInfo();
  return (
    <>
      <TopBar live={p.live} model={p.model} viewer={{ email: viewer.user.email }} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1120px] px-6 pb-16 pt-10"><SettingsContent /></main>
    </>
  );
}
