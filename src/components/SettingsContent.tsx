import { DEFAULT_THRESHOLDS } from '@/engine/verdict/types';
import { dataDir } from '@/lib/db';
import { providerInfo } from '@/lib/provider';

export function SettingsContent() {
  const p = providerInfo();
  const t = DEFAULT_THRESHOLDS;
  return (
    <div className="flex max-w-[920px] flex-col gap-5">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">Settings</h1>

      <section className="card flex flex-col gap-3.5 px-6 py-5">
        <h2 className="font-semibold">Decision model</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
          <div className={`flex flex-col gap-1 rounded-xl p-3.5 ${p.live ? 'border-[1.5px] border-accent' : 'border border-line'}`}>
            <span className="font-semibold">TypeSafe Jev</span>
            <span className="text-[13px] text-muted">{p.live ? 'Primary · key connected' : 'No key set · using the offline mock'}</span>
            <span className="mono text-[12px]">{p.model} pinned</span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-line p-3.5"><span className="font-semibold">OpenAI Decisions</span><span className="text-[13px] text-muted">Fallback · milestone A6</span><span className="mono text-[12px] text-muted">not connected</span></div>
          <div className="flex flex-col gap-1 rounded-xl border border-line p-3.5"><span className="font-semibold">Shadow mode</span><span className="text-[13px] text-muted">A new model runs beside the live one for 2 weeks before it takes over</span></div>
        </div>
        {!p.live && (
          <div className="rounded-xl bg-warn-bg px-4 py-3 text-[13px] text-warn">
            To use Jev, create a file called <code className="mono">.env.local</code> in the project folder with the line below, then restart the app.
            <pre className="mono mt-2 rounded-lg bg-surface px-3 py-2 text-[12px] text-ink">TYPESAFE_API_KEY=your-key-here</pre>
          </div>
        )}
        <div className="mono text-[12px] text-muted">{p.baseUrl}/v1/systemone</div>
      </section>

      <section className="card flex flex-col gap-4 px-6 py-5">
        <div><h2 className="font-semibold">Confidence routing</h2><p className="text-[13px] text-muted">Where each verdict goes. Per-site tuning unlocks once a site has 90 days of outcomes.</p></div>
        <div role="img" aria-label="Uncertain below 0.60, review from 0.60 to 0.84, auto at 0.85 and above" className="flex flex-col gap-2">
          <div className="flex h-3.5 overflow-hidden rounded-full">
            <div style={{ flex: 60, background: 'repeating-linear-gradient(135deg,#8a93a3 0 4px,#c4cad4 4px 8px)' }} />
            <div style={{ flex: 25, background: '#e0a93b' }} />
            <div style={{ flex: 15, background: 'var(--accent)' }} />
          </div>
          <div className="mono flex text-[12px] text-muted"><span style={{ flex: 60 }}>0</span><span style={{ flex: 25 }}>{t.review.toFixed(2)}</span><span style={{ flex: 15 }}>{t.auto.toFixed(2)}</span><span>1</span></div>
        </div>
        <ul className="flex flex-col text-[14px]">
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Auto-approved into the work queue</span><span className="mono">{t.auto.toFixed(2)} or above</span></li>
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Needs review</span><span className="mono">{t.review.toFixed(2)} to {(t.auto - 0.01).toFixed(2)}</span></li>
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Uncertain, with what would settle it</span><span className="mono">below {t.review.toFixed(2)}</span></li>
          <li className="flex justify-between gap-3 py-2.5"><span>Prune and Redirect</span><span className="font-semibold">Always need approval</span></li>
        </ul>
      </section>

      <section className="card flex flex-col gap-2 px-6 py-5">
        <h2 className="font-semibold">Hard rules</h2>
        <p className="text-[13px] text-muted">Checked before the model sees anything.</p>
        <ul className="flex flex-col text-[14px]">
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Home, legal and navigational pages</span><span className="font-semibold">Always Leave</span></li>
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Pages with {t.protectConversions} or more conversions</span><span className="font-semibold">Never pruned or redirected</span></li>
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Pages updated in the last {t.protectNewerThanDays} days</span><span className="font-semibold">Never pruned</span></li>
          <li className="flex justify-between gap-3 border-b border-line py-2.5"><span>Cannibalisation</span><span className="font-semibold">{t.cannibalSharedQueries} or more shared top-20 searches</span></li>
          <li className="flex justify-between gap-3 py-2.5"><span>Redirects, noindex pages and canonicalised duplicates</span><span className="font-semibold">Listed, not scored</span></li>
        </ul>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <div><h2 className="font-semibold">Team and billing</h2><p className="text-[13px] text-muted">Sign-in, seats and plans arrive in milestone A5. Data is stored locally at <span className="mono">{dataDir()}</span> until then.</p></div>
        <span className="rounded-full bg-sunken px-3 py-1 text-[12.5px] font-semibold text-ink-2">Coming in A5</span>
      </section>
    </div>
  );
}
