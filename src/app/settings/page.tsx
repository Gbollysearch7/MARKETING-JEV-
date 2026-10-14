import { requireViewer } from '@/lib/auth';
import { TopBar } from '@/components/Brand';
import { SettingsContent } from '@/components/SettingsContent';
import { ApiKeysSection } from '@/components/settings/ApiKeysSection';
import { providerInfo } from '@/lib/provider';

export default async function Settings({ searchParams }: PageProps<'/settings'>) {
  const viewer = await requireViewer();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const p = providerInfo();
  const notice = sp.revoked ? 'Key revoked. Requests using it now get 401.' : undefined;
  return (
    <>
      <TopBar live={p.live} model={p.model} viewer={{ email: viewer.user.email }} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1120px] px-6 pb-16 pt-10">
        <SettingsContent />
        <div className="mt-5 max-w-[920px]"><ApiKeysSection viewer={viewer} notice={notice} /></div>
      </main>
    </>
  );
}
