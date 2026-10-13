import { TopBar } from '@/components/Brand';
import { SettingsContent } from '@/components/SettingsContent';
import { providerInfo } from '@/lib/provider';

export default function Settings() {
  const p = providerInfo();
  return (
    <>
      <TopBar live={p.live} model={p.model} />
      <main className="mx-auto max-w-[1120px] px-6 pb-16 pt-10"><SettingsContent /></main>
    </>
  );
}
