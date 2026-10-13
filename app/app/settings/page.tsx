import { Card, PageHeader } from "@/components/ui";
import { hasLiveKey, pinnedModel } from "@/lib/engine";
import { DATA_DIR } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Settings() {
  const live = hasLiveKey();
  return (
    <>
      <PageHeader title="Settings" subtitle="Keys and the model pin come from environment variables; nothing is stored in the app." />
      <div className="p-7 flex flex-col gap-4 max-w-3xl">
        <Card className="p-5 flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between"><span>TypeSafe API key</span><span className={live ? "text-teal-ink font-medium" : "text-amber-ink font-medium"}>{live ? "configured" : "not set, runs use the mock"}</span></div>
          <div className="flex justify-between"><span>Pinned model</span><span className="font-mono">{pinnedModel()}</span></div>
          <div className="flex justify-between"><span>Data directory</span><span className="font-mono text-xs">{DATA_DIR}</span></div>
        </Card>
        <Card className="p-5 text-[14px] flex flex-col gap-2">
          <h2 className="font-semibold text-[15px] m-0">Go live</h2>
          <p className="m-0">Create a key at <a href="https://console.typesafe.ai/keys" className="underline" target="_blank" rel="noreferrer">console.typesafe.ai/keys</a>, then add it to <span className="font-mono">app/.env.local</span>:</p>
          <pre className="bg-paper rounded-lg p-3 text-xs font-mono">TYPESAFE_API_KEY=ts_...{"\n"}JEV_MODEL=jev-1.13.0</pre>
          <p className="m-0 text-muted">Restart the dev server. Sites set to “auto” then use Jev; sites set to “mock” keep using the deterministic stand-in. At list price a 40-page run with 10 candidates per page costs under a cent.</p>
        </Card>
        <Card className="p-5 text-[14px] flex flex-col gap-2">
          <h2 className="font-semibold text-[15px] m-0">Thresholds</h2>
          <p className="m-0 text-muted">Link suggestion: reader benefit above 0.70 and same intent below 0.50. Cannibalisation: same intent above 0.80. Placement: paragraph and anchor need confidence 0.50. Gate: thin below 0.5, partial below 1.2, duplicate kill above 0.85 with template feel above 0.7. These live in the engine’s rules and move to per-site settings once calibration data exists.</p>
        </Card>
      </div>
    </>
  );
}
