import { headers } from 'next/headers';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDateTime } from '@/components/ui';
import { appSecretConfigured, listWebflowConnections } from '@/lib/apikeys';
import { createWebflowConnectionAction, deleteWebflowConnectionAction } from './integration-actions';

/** Public base URL for webhook addresses: APP_URL when set, otherwise the host this request came in on. */
async function baseUrl(): Promise<string> {
  const env = process.env.APP_URL?.replace(/\/+$/, '');
  if (env) return env;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const STATUS_LABEL: Record<string, string> = { scoring: 'Scored', received: 'Received', ignored: 'Ignored (not a CMS item)', unusable: 'Unusable item', account_inactive: 'Plan not active' };

export async function Integrations({ siteId, sp }: { siteId: string; sp: Record<string, string | undefined> }) {
  const base = await baseUrl();
  const conns = listWebflowConnections(siteId);
  const secretReady = appSecretConfigured();
  const step = 'flex gap-2.5 text-[13.5px]';
  const n = (i: number) => <span aria-hidden className="num flex h-5 w-5 flex-none items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{i}</span>;

  return (
    <section id="integrations" className="card scroll-mt-24 overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold">Integrations</h2>
        <p className="text-[13px] text-muted">Send pages from your CMS or build as they are published. Results land in the batch list above.</p>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-3">
        <div className="flex flex-col gap-3 bg-surface px-4 py-5 sm:px-6">
          <h3 className="font-semibold">API key</h3>
          <p className="text-[13.5px] text-muted">Every integration authenticates with an account API key in the <span className="mono">Authorization</span> header.</p>
          <div className="flex flex-col gap-1 text-[13px]">
            <span className="label">This site’s id</span>
            <code className="mono break-all rounded-lg bg-sunken px-2.5 py-1.5 text-[12.5px]">{siteId}</code>
          </div>
          <div className="mt-auto"><Link href="/settings#api-keys" className="btn btn-sm">Manage API keys</Link></div>
        </div>

        <div className="flex flex-col gap-3 bg-surface px-4 py-5 sm:px-6">
          <h3 className="font-semibold">WordPress</h3>
          <ol className="flex flex-col gap-2">
            <li className={step}>{n(1)}<span>Download the plugin and upload it under Plugins → Add New → Upload Plugin.</span></li>
            <li className={step}>{n(2)}<span>In Settings → Rankcall Gate, enter <span className="mono text-[12.5px]">{base}</span>, an API key and the site id.</span></li>
            <li className={step}>{n(3)}<span>Posts are scored when they are published. Turn on “Block publishing on Kill” to hold Kill posts as pending.</span></li>
          </ol>
          <div className="mt-auto"><a href={`/api/sites/${siteId}/gate/wordpress-plugin`} className="btn btn-sm" download>Download plugin (.zip)</a></div>
        </div>

        <div className="flex flex-col gap-3 bg-surface px-4 py-5 sm:px-6">
          <h3 className="font-semibold">Webflow</h3>
          <p className="text-[13.5px] text-muted">Webflow sends a signed webhook when a CMS item is created or changed. Webflow cannot hold a publish, so items are scored after the fact: each one appears as a “Webflow · collection” batch.</p>
          {!secretReady && <p className="rounded-lg bg-warn-bg px-3 py-2 text-[12.5px] text-warn">Webflow connections need APP_SECRET set on the server.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6">
        {sp.wferror && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13.5px] text-bad">{sp.wferror}</p>}
        {sp.wfcreated && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-[13.5px] text-ok">Connection saved. Paste its webhook URL into Webflow.</p>}
        {conns.length > 0 && (
          <ul className="flex flex-col gap-3">
            {conns.map((c) => (
              <li key={c.id} className={`flex flex-col gap-2 rounded-xl border px-4 py-3 ${sp.wfcreated === c.id ? 'border-accent' : 'border-line'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-[12.5px] text-muted">body field <span className="mono">{c.body_field}</span>{c.meta_field ? <> · summary <span className="mono">{c.meta_field}</span></> : null}{c.collection_id ? <> · collection <span className="mono">{c.collection_id}</span></> : ' · all collections'} · secret …{c.secret_last4}</span>
                  </div>
                  <form action={deleteWebflowConnectionAction}>
                    <input type="hidden" name="siteId" value={siteId} />
                    <input type="hidden" name="connectionId" value={c.id} />
                    <SubmitButton className="btn btn-sm btn-ghost text-bad" pending="Removing…">Remove</SubmitButton>
                  </form>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="label">Webhook URL</span>
                  <input readOnly value={`${base}/api/v1/webhooks/webflow/${c.id}`} className="input mono text-[12.5px]" aria-label={`Webhook URL for ${c.name}`} />
                </label>
                <p className="text-[12.5px] text-muted">{c.last_event_at ? <>Last delivery {fmtDateTime(c.last_event_at)}: {STATUS_LABEL[c.last_status ?? ''] ?? c.last_status} · <span className="num">{c.events}</span> in total</> : 'No deliveries yet.'}</p>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-xl border border-line px-4 py-3" open={conns.length === 0 && Boolean(sp.wferror)}>
          <summary className="cursor-pointer text-[14px] font-medium">Add a Webflow connection</summary>
          <ol className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
            <li>1. In Webflow, create a webhook for <span className="mono">collection_item_created</span> and <span className="mono">collection_item_changed</span> (with a site token or app, so requests are signed; webhooks made in the Webflow dashboard are unsigned and are refused).</li>
            <li>2. Paste its signing secret below, save, and set the webhook’s URL to the address shown for the connection.</li>
          </ol>
          <form action={createWebflowConnectionAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="siteId" value={siteId} />
            <label className="flex flex-col gap-1.5"><span className="label">Collection name (used as the template)</span><input name="collectionName" className="input" placeholder="Blog posts" maxLength={60} /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Body field slug</span><input name="bodyField" required className="input mono" placeholder="post-body" pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,63}" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Summary field slug (optional)</span><input name="metaField" className="input mono" placeholder="post-summary" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Collection id (optional, to watch one collection)</span><input name="collectionId" className="input mono" placeholder="24 hexadecimal characters" /></label>
            <label className="flex flex-col gap-1.5 md:col-span-2"><span className="label">Webhook signing secret</span><input name="secret" type="password" required autoComplete="off" className="input mono" /></label>
            <p className="text-[12.5px] text-muted md:col-span-1">The secret is stored encrypted and used only to check each request’s <span className="mono">x-webflow-signature</span>.</p>
            <div className="flex items-end justify-end"><SubmitButton className="btn btn-primary h-11" pending="Saving…" disabled={!secretReady}>Save connection</SubmitButton></div>
          </form>
        </details>
      </div>
    </section>
  );
}
