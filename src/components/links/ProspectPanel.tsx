import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { fmt, fmtDate, fmtDateTime } from '@/components/ui';
import { isChoice, isNoul, isScore } from '@/engine/jev/confidence';
import type { Prospect } from '@/lib/modules/links';
import { addNoteAction, claimProspectAction, setStatusAction, verifyLinkAction } from '@/lib/modules/links-actions';
import { AUTHORITY_TEXT, LINK_ATTR_TEXT, TRAFFIC_TEXT } from '@/modules/links/features';
import { ANGLE_LABEL, PROSPECT_TYPE_LABEL, SITE_TYPE_LABEL, STATUS_LABEL, STATUSES, TOXIC_KEYS, type Angle, type OutreachStatus, type ProspectType, type SiteType } from '@/modules/links/types';
import { LevelBadge, OutreachBadge, pathOf, VERDICT_TONE, VerdictPill } from './bits';

const ROUTER: Record<string, { label: string; cls: string }> = {
  auto: { label: 'Confident', cls: 'border-solid text-accent-strong border-accent' },
  review: { label: 'Needs review', cls: 'border-solid text-warn border-warn' },
  uncertain: { label: 'Uncertain', cls: 'border-dashed text-leave border-line-strong' },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const FOOTPRINT: Record<string, string> = {
  many_hyphens_in_domain: 'Many hyphens in the domain', many_digits_in_domain: 'Many digits in the domain', write_for_us_page: '"Write for us" page',
  paid_placement_terms: 'Prices or paid placement', link_selling_terms: 'Offers links for sale', paid_write_for_us: 'Paid "write for us" page',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className="text-right text-[13px]">{children}</span>
    </div>
  );
}

/** Everything about one prospect: verdict, reasons, every Jev answer, and the outreach controls. */
export function ProspectPanel({ p, me, today, back, closeHref, events }: {
  p: Prospect; me: string; today: string; back: string; closeHref: string;
  events: { kind: string; value: string | null; by_name: string | null; at: string }[];
}) {
  const a = p.answers ?? {};
  const toxic = p.verdict === 'toxic';
  const tone = p.verdict ? VERDICT_TONE[p.verdict] : null;
  const stProbs = isChoice(a.site_type) ? a.site_type.probabilities : null;
  return (
    <section aria-label="Prospect detail" className="card enter flex min-w-0 flex-col">
      <Link href={closeHref} className="border-b border-line px-5 py-3 font-medium text-accent xl:hidden">← Back to the queue</Link>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictPill v={p.verdict} />
          {p.router && <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${ROUTER[p.router]?.cls ?? ''}`}>{ROUTER[p.router]?.label}</span>}
          {p.alreadyLinking && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-accent-strong">Already links to you</span>}
          <span className="ml-auto"><OutreachBadge s={p.status} /></span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="mono break-all text-[13px] text-muted">{p.domain}</span>
          <h2 className="break-words text-[18px] font-semibold leading-snug">{p.title || pathOf(p.url)}</h2>
          <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="mono break-all text-[12.5px] text-accent underline-offset-2 hover:underline">{p.url}</a>
        </div>
        {p.snippet && <p className="rounded-xl bg-bg px-3.5 py-2.5 text-[13.5px] text-ink-2">{p.snippet}</p>}
        {p.verdict && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Priority</span><span className="num display text-[32px] leading-none">{p.priority ?? '—'}</span></div>
            <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Confidence</span><span className="num display text-[32px] leading-none">{p.confidence != null ? pct(p.confidence) : '—'}</span></div>
            <div className="flex flex-col gap-0.5"><span className="text-[12px] text-muted">Reply chance</span><span className="display text-[28px] capitalize leading-none">{p.verdict === 'pursue' ? p.likelihood : '—'}</span></div>
          </div>
        )}
      </div>

      {toxic && (
        <div className="mx-5 mt-5 rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad sm:mx-6">
          <strong className="font-semibold">Never contact this site.</strong> Toxic prospects are kept out of the outreach queue.
          {p.alreadyLinking ? ' It already links to you, so it is listed in the disavow review below.' : ''}
        </div>
      )}

      {p.reasons.length > 0 && (
        <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
          <h3 className="text-[13px] font-semibold text-muted">Why</h3>
          {p.reasons.map((r) => (
            <div key={r} className="flex items-start gap-2.5"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: tone?.mark }} /><span className="text-[14px]">{r}</span></div>
          ))}
        </div>
      )}

      {!toxic && p.verdict && (
        <div className="flex flex-col gap-3 border-t border-line px-5 py-5 sm:px-6">
          <h3 className="text-[13px] font-semibold text-muted">Outreach</h3>
          <form action={claimProspectAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="prospectId" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label">Owner</span>
              <input name="owner" className="input w-full min-w-0" defaultValue={p.owner ?? me} maxLength={60} aria-label="Owner name" />
            </label>
            <SubmitButton className="btn" name="intent" value="claim" pending="Saving…">{p.owner ? 'Reassign' : 'Claim'}</SubmitButton>
            {p.owner && <SubmitButton className="btn btn-ghost" name="intent" value="release" pending="Releasing…">Release</SubmitButton>}
          </form>
          <form action={setStatusAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="prospectId" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <label className="flex flex-col gap-1">
              <span className="label">Status</span>
              <select name="status" defaultValue={p.status} className="select" aria-label="Outreach status">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Date</span>
              <input type="date" name="date" defaultValue={today} max={today} className="input" aria-label="Status date" />
            </label>
            <SubmitButton className="btn btn-primary" pending="Saving…">Log status</SubmitButton>
          </form>
          <form action={addNoteAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="prospectId" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor={`note-${p.id}`} className="label">Note</label>
            <textarea id={`note-${p.id}`} name="note" rows={2} maxLength={2000} required className="input text-[13.5px]" placeholder="Who you emailed, what they said, when to follow up" />
            <div><SubmitButton className="btn btn-sm" pending="Saving…">Add note</SubmitButton></div>
          </form>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
            <span>Contacted {fmtDate(p.contacted_at)}</span><span>Replied {fmtDate(p.replied_at)}</span><span>Closed {fmtDate(p.closed_at)}</span>
          </div>
          <div className={`flex flex-col gap-2 rounded-xl border px-3.5 py-3 ${p.status === 'won' ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] font-medium">{p.status === 'won' ? 'Check the won link is live' : 'Link check'}</span>
              <form action={verifyLinkAction}>
                <input type="hidden" name="prospectId" value={p.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton className="btn btn-sm" pending="Fetching page…">Verify link</SubmitButton>
              </form>
            </div>
            <p className="text-[12.5px] text-muted">Fetches the page (10-second limit, first 1.5 MB) and looks for a link to your domain.</p>
            {p.verify_status && (
              <div className="text-[13px]">
                {p.verify_status === 'found' && (() => {
                  const links = p.verifyDetail?.links ?? [];
                  const followed = links.filter((l) => !/\b(nofollow|sponsored|ugc)\b/.test(l.rel));
                  return (
                    <div className="flex flex-col gap-1">
                      <p className={followed.length ? 'text-ok' : 'text-warn'}>{followed.length ? 'Followed link found' : 'Link found, but it is nofollow, sponsored or UGC, so it passes little authority'} {fmtDateTime(p.verify_at)}.</p>
                      <ul className="flex flex-col gap-0.5 text-[12.5px] text-ink-2">
                        {links.slice(0, 3).map((l, i) => <li key={i} className="break-all"><span className="mono">{l.href}</span>{l.anchor ? ` · “${l.anchor}”` : ''}{l.rel ? <span className="text-muted"> · rel {l.rel}</span> : null}</li>)}
                      </ul>
                    </div>
                  );
                })()}
                {p.verify_status === 'not_found' && <p className="text-warn">No link to your site found {fmtDateTime(p.verify_at)}.</p>}
                {p.verify_status === 'error' && <p className="text-bad">Could not check {fmtDateTime(p.verify_at)}: {p.verifyDetail?.error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {p.answers && (
        <div className="flex flex-col border-t border-line px-5 py-5 sm:px-6">
          <h3 className="mb-1 text-[13px] font-semibold text-muted">Jev&apos;s answers</h3>
          {isNoul(a.relevant) && <Row label="Topically relevant to your site">{pct(a.relevant.noul)}</Row>}
          {isChoice(a.site_type) && <Row label="Kind of site">{SITE_TYPE_LABEL[a.site_type.choice as SiteType] ?? a.site_type.choice} <span className="text-muted">· {pct(stProbs?.[a.site_type.choice] ?? 0)}</span></Row>}
          {isScore(a.quality) && <Row label="Quality as a link source"><LevelBadge level={p.quality} /> <span className="text-muted">· {pct(a.quality.confidence)}</span></Row>}
          {TOXIC_KEYS.map((k) => {
            const ans = a[k];
            return isNoul(ans) ? <Row key={k} label={k === 'sells_links' ? 'Sells links' : k === 'pbn_footprint' ? 'Private blog network footprint' : 'Spam content'}><span className={ans.noul >= 0.7 ? 'font-semibold text-bad' : ''}>{pct(ans.noul)}</span></Row> : null;
          })}
          {isChoice(a.prospect_type) && <Row label="Link opening">{PROSPECT_TYPE_LABEL[a.prospect_type.choice as ProspectType] ?? a.prospect_type.choice} <span className="text-muted">· {pct(a.prospect_type.probabilities[a.prospect_type.choice] ?? 0)}</span></Row>}
          {isChoice(a.angle) && <Row label="Pitch angle">{ANGLE_LABEL[a.angle.choice as Angle] ?? a.angle.choice} <span className="text-muted">· {pct(a.angle.probabilities[a.angle.choice] ?? 0)}</span></Row>}
          <p className="mt-2 text-[12px] text-muted">{p.model === 'mock' ? 'Offline mock answers (no API key set); not calibrated.' : `Model ${p.model ?? '—'}`} · criteria {p.criteria_version ?? '—'} · scored {fmtDateTime(p.scored_at)}</p>
        </div>
      )}

      <div className="flex flex-col border-t border-line px-5 py-5 sm:px-6">
        <h3 className="mb-1 text-[13px] font-semibold text-muted">Signals computed in code</h3>
        <Row label="Authority">{p.dr != null ? `DR ${fmt(p.dr)} · ` : ''}{AUTHORITY_TEXT[p.features?.authority ?? 'unknown'].split(' (')[0]}</Row>
        <Row label="Traffic">{p.traffic != null ? `${fmt(p.traffic)} · ` : ''}{TRAFFIC_TEXT[p.features?.traffic ?? 'unknown'].split(' (')[0]}</Row>
        <Row label="Link attribute">{LINK_ATTR_TEXT[p.link_attr]}</Row>
        <Row label="Spam topics">{p.features?.spamTerms.length ? <span className="text-bad">{p.features.spamTerms.join(', ')}</span> : 'None found'}</Row>
        <Row label="Footprints">{p.features?.footprints.length ? p.features.footprints.map((f) => FOOTPRINT[f] ?? f).join(', ') : 'None found'}</Row>
        <Row label="Mentions your brand">{p.features?.mentionsBrand ? 'Yes' : 'No'}</Row>
        <Row label="Source">{p.source}</Row>
      </div>

      {events.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line px-5 py-5 sm:px-6">
          <h3 className="text-[13px] font-semibold text-muted">History</h3>
          {events.map((e, i) => e.kind === 'note' ? (
            <div key={i} className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
              <span className="whitespace-pre-wrap break-words">{e.value}</span>
              <span className="text-[12px] text-muted">{e.by_name ? `${e.by_name} · ` : ''}{fmtDateTime(e.at)}</span>
            </div>
          ) : (
            <div key={i} className="flex flex-wrap justify-between gap-2 text-[13px]">
              <span>{e.kind === 'status' ? `Marked ${(STATUS_LABEL[e.value as OutreachStatus] ?? e.value ?? '').toLowerCase()}` : e.kind === 'claim' ? `Claimed by ${e.value}` : e.kind === 'release' ? 'Released' : `Link check: ${e.value === 'found' ? 'found' : e.value === 'not_found' ? 'not found' : 'failed'}`}{e.by_name ? <span className="text-muted"> · {e.by_name}</span> : null}</span>
              <span className="text-muted">{fmtDateTime(e.at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
