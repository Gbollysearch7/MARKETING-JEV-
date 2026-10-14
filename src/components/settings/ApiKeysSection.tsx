import { SubmitButton } from '@/components/SubmitButton';
import { fmtDate, fmtDateTime } from '@/components/ui';
import { listApiKeys, RATE_LIMIT, recentUsage, SCOPES } from '@/lib/apikeys';
import type { Viewer } from '@/lib/auth';
import { revokeApiKeyAction } from './actions';
import { CreateKeyForm } from './CreateKeyForm';

const IMPLIED = new Set(['sites:read']);

/** Account API keys: create (shown once), list with last use, revoke. Only the owner can change them. */
export function ApiKeysSection({ viewer, notice }: { viewer: Viewer; notice?: string }) {
  const keys = listApiKeys(viewer.account.id);
  const usage = recentUsage(viewer.account.id, 8);
  const owner = viewer.user.role === 'owner';
  const scopes = Object.entries(SCOPES).map(([key, label]) => ({ key, label, implied: IMPLIED.has(key) }));

  return (
    <section id="api-keys" className="card flex scroll-mt-24 flex-col gap-4 px-6 py-5">
      <div>
        <h2 className="font-semibold">API keys</h2>
        <p className="text-[13px] text-muted">
          For the Quality gate API, the WordPress plugin and build pipelines. Keys belong to the account, work for all its sites, and are limited to {RATE_LIMIT.requests} requests a minute each. Scoring stops when the plan is not active. See <span className="mono">docs/API.md</span>.
        </p>
      </div>
      {notice && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-[13.5px] text-ok">{notice}</p>}

      {keys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th className="r"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {keys.map((k) => {
                const expired = k.expired;
                const off = Boolean(k.revoked_at) || expired;
                return (
                  <tr key={k.id} className={off ? 'text-muted' : undefined}>
                    <td>
                      <div className="font-medium">{k.name}</div>
                      {k.revoked_at ? <div className="text-[12px] text-bad">Revoked {fmtDate(k.revoked_at)}</div>
                        : expired ? <div className="text-[12px] text-bad">Expired {fmtDate(k.expires_at)}</div>
                        : k.expires_at ? <div className="text-[12px] text-muted">Expires {fmtDate(k.expires_at)}</div> : null}
                    </td>
                    <td className="mono text-[12.5px]">rk_live_…{k.last4}</td>
                    <td className="mono text-[12px]">{k.scopes.join(', ')}</td>
                    <td className="text-[13px]">{fmtDate(k.created_at)}</td>
                    <td className="text-[13px]">{k.last_used_at ? <>{fmtDateTime(k.last_used_at)}<div className="num text-[12px] text-muted">{k.uses_30d} call{k.uses_30d === 1 ? '' : 's'} in 30 days</div></> : <span className="text-faint">Never</span>}</td>
                    <td className="r">
                      {owner && !off && (
                        <form action={revokeApiKeyAction}>
                          <input type="hidden" name="keyId" value={k.id} />
                          <SubmitButton className="btn btn-sm btn-ghost text-bad" pending="Revoking…">Revoke</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {owner ? (
        <details className="rounded-xl border border-line px-4 py-3" open={keys.length === 0}>
          <summary className="cursor-pointer text-[14px] font-medium">Create an API key</summary>
          <div className="mt-4"><CreateKeyForm scopes={scopes} /></div>
        </details>
      ) : (
        <p className="text-[13px] text-muted">Only the account owner can create or revoke keys.</p>
      )}

      {usage.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-medium">Recent API calls</summary>
          <ul className="mt-2 flex flex-col">
            {usage.map((u, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-line py-1.5 last:border-0">
                <span><span className="font-medium">{u.key_name}</span> <span className="mono text-[12px] text-muted">{u.route}</span></span>
                <span className="flex gap-3"><span className={`num ${u.status < 300 ? 'text-ok' : u.status < 500 ? 'text-warn' : 'text-bad'}`}>{u.status}</span><span className="text-muted">{fmtDateTime(u.created_at)}</span></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
