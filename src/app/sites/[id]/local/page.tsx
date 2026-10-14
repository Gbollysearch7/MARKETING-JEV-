import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { JobProgress } from '@/components/JobProgress';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDate, fmtDateTime, PageTitle, Section } from '@/components/ui';
import { Bar, Delta, Tag, TEXT_TONE, healthTone, healthWord, type Tone } from '@/components/local/bits';
import { UploadForm } from '@/components/local/UploadForm';
import { providerInfo } from '@/lib/provider';
import { clearLocalAction, loadLocalSamplesAction, runLocalAction, saveLocalSettingsAction } from '@/lib/modules/local-actions';
import { actionsSince, pendingDecisionCount, getSettings, KIND_LABEL, latestLocalJob, listUploads, portfolio, readLog, runningLocalJob, snapshots, summarise } from '@/lib/modules/local';
import { reviewPeriods } from '@/modules/local/health';
import { CRITERIA_VERSION } from '@/modules/local/battery';

const KIND_ICON: Record<string, string> = { review: 'Review', question: 'Question', post: 'Post', profile: 'Profile', citation: 'Citation' };

export default async function LocalPage({ params, searchParams }: PageProps<'/sites/[id]/local'>) {
  const { id } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const base = `/sites/${id}/local`;
  const p = portfolio(id);
  const running = runningLocalJob(id);
  const job = latestLocalJob(id);
  const uploads = listUploads(id);
  const settings = getSettings(id);
  const snaps = snapshots(id);
  const log = readLog(id, undefined, 12);
  const live = providerInfo().live;
  const has = p.locations.length > 0;
  const showAll = sp.all === '1';
  // The weekly run is never automatic; the button says how many Jev decisions it will use.
  const pending = has && !running ? pendingDecisionCount(id) : 0;

  const avgHealth = has ? Math.round(p.locations.reduce((s, l) => s + l.health.score, 0) / p.locations.length) : 0;
  const awaiting = p.locations.reduce((s, l) => s + l.unreplied, 0);
  const awaitingLow = p.locations.reduce((s, l) => s + l.unrepliedLow, 0);
  const issues = p.locations.reduce((s, l) => s + l.issues.length, 0);
  const tier1 = p.locations.reduce((s, l) => s + l.issues.filter((i) => i.tier === 1).length, 0);
  const openQs = p.locations.reduce((s, l) => s + l.openQuestions, 0);
  const weakest = [...p.locations].sort((a, b) => a.health.score - b.health.score);
  const kinds = ['review', 'question', 'post', 'profile', 'citation'] as const;
  const kind = sp.k && (kinds as readonly string[]).includes(sp.k) ? sp.k : null;
  const kindCount = Object.fromEntries(kinds.map((k) => [k, p.attention.filter((a) => a.kind === k).length])) as Record<string, number>;
  const pool = kind ? p.attention.filter((a) => a.kind === kind) : p.attention;
  const attention = showAll ? pool : pool.slice(0, 12);
  const todayIso = new Date().toISOString().slice(0, 10);
  const monday = new Date(Date.parse(todayIso) - ((new Date(todayIso).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  const doneThisWeek = has ? actionsSince(id, monday) : 0;
  const kq = (k: string | null, all = showAll) => { const q = new URLSearchParams(); if (k) q.set('k', k); if (all) q.set('all', '1'); const s2 = q.toString(); return `${base}${s2 ? `?${s2}` : ''}`; };
  const allReviews = p.locations.flatMap((l) => l.reviews.map((r) => r.review));
  const periods = reviewPeriods(allReviews, new Date().toISOString().slice(0, 10));
  const maxCount = Math.max(1, ...periods.map((x) => x.count));
  const [prev, cur] = snaps.length >= 2 ? [snaps[snaps.length - 2], snaps[snaps.length - 1]] : [null, snaps[snaps.length - 1] ?? null];
  const ps = prev ? summarise(prev) : null;
  const cs = cur ? summarise(cur) : null;

  return (
    <div className="flex flex-col gap-6">
      {sp.msg && <Toast key={sp.msg} message={sp.msg} />}
      {sp.err && <Toast key={sp.err} message={sp.err} tone="bad" />}
      <PageTitle
        title="Local SEO"
        sub="Every week, each shop gets an attention list across reviews, questions, posts, profile fields and citations. Jev makes the calls, replies are drafted from templates, and nothing is published without you."
        actions={has ? (
          <>
            <a href="#data" className="btn h-11">Update data</a>
            <form action={runLocalAction} className="flex items-center gap-2">
              <input type="hidden" name="siteId" value={id} />
              <SubmitButton className="btn btn-primary h-11" pending="Starting…" disabled={Boolean(running)}>{job ? 'Run this week again' : 'Run this week’s decisions'}{pending > 200 ? ` (about ${fmt(pending)} Jev decisions)` : ''}</SubmitButton>
            </form>
          </>
        ) : (
          <form action={loadLocalSamplesAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn h-11" pending="Loading…">Load sample data</SubmitButton></form>
        )}
      />

      <div className="-mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {pending > 0 && <span>Next run: about {fmt(pending)} Jev decision{pending === 1 ? '' : 's'}</span>}
        {job ? <span>Last run {fmtDateTime(job.finished_at)} · {job.provider === 'mock' ? 'mock decisions (no API key)' : job.model} · {job.message}</span> : <span>Not run yet{has ? '' : ' · no locations uploaded'}</span>}
        <span className="mono">criteria {CRITERIA_VERSION}</span>
        {!live && <span className="text-warn">Offline mock in use: set TYPESAFE_API_KEY for live Jev.</span>}
      </div>

      {running && <JobProgress key={running.id} jobId={running.id} initial={running} label="Deciding this week’s reviews, questions and posts" />}

      {!has ? (
        <section className="card">
          <Empty title="Add your locations to start">
            Upload a locations export below (from Google Business Profile, Yext, BrightLocal or a spreadsheet), then reviews, questions and citations. Or try it with six fictional Sample Outdoors shops.
            <form action={loadLocalSamplesAction} className="mt-4"><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn btn-primary" pending="Loading…">Load sample data</SubmitButton></form>
          </Empty>
        </section>
      ) : (
        <>
          <section aria-label="Portfolio at a glance" className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
            <Tile label="Locations" value={fmt(p.locations.length)} sub={p.orphanReviews ? `${fmt(p.orphanReviews)} review${p.orphanReviews === 1 ? ' matches' : 's match'} no location id` : `${fmt(p.counts.reviews)} reviews on file`} />
            <Tile label="Average health" value={<span className={TEXT_TONE[healthTone(avgHealth)]}>{avgHealth}</span>} sub={`${weakest.filter((l) => l.health.score < 60).length} at risk, out of 100`} />
            <Tile label="Reviews awaiting reply" value={fmt(awaiting)} sub={awaitingLow ? `${awaitingLow} at 1 to 2 stars` : 'none at 1 to 2 stars'} />
            <Tile label="Citation issues" value={fmt(issues)} sub={`${tier1} on Google, Apple or Bing`} />
            <Tile label="Open questions" value={fmt(openQs)} sub="on the profiles" />
          </section>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-5">
            <Section title="This week’s attention list" sub={`Across every shop, most urgent first. ${doneThisWeek ? `${fmt(doneThisWeek)} action${doneThisWeek === 1 ? '' : 's'} done since Monday.` : 'Nothing actioned yet this week.'}`} actions={pool.length > 12 ? <Link className="text-[13px] font-semibold text-accent" href={kq(kind, !showAll)}>{showAll ? 'Show top 12' : `Show all ${fmt(pool.length)}`}</Link> : null}>
              {p.attention.length > 0 && (
                <nav aria-label="Filter the attention list" className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3 sm:px-6">
                  {[null, ...kinds].filter((k) => !k || kindCount[k]).map((k) => (
                    <Link key={k ?? 'all'} href={kq(k, false)} aria-current={kind === k ? 'true' : undefined}
                      className={`rounded-full border px-3 py-1 text-[12.5px] ${kind === k ? 'border-[var(--primary)] bg-[var(--primary)] font-semibold text-[var(--primary-fg)]' : 'border-line bg-surface text-ink-2 hover:border-line-strong'}`}>
                      {k ? `${KIND_ICON[k]}s` : 'Everything'} · {fmt(k ? kindCount[k] : p.attention.length)}
                    </Link>
                  ))}
                </nav>
              )}
              {attention.length === 0 ? <Empty title="Nothing needs attention">Every review, question and listing is in order.</Empty> : (
                <ol className="flex flex-col">
                  {attention.map((a, i) => (
                    <li key={`${a.locId}-${a.anchor}-${i}`} className="border-b border-line last:border-0">
                      <Link href={`${base}/${encodeURIComponent(a.locId)}#${a.anchor}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 px-4 py-3 hover:bg-surface-2 sm:px-6">
                        <span className="num pt-0.5 text-[12.5px] text-faint">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <Tag tone={a.tone as Tone}>{KIND_ICON[a.kind]}</Tag>
                            <span className="font-medium">{a.title}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-muted">{a.locName} · {a.detail}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title="Locations, weakest first" sub="Health score out of 100, with the change in rating and reviews since the previous upload.">
              <ul className="flex flex-col">
                {weakest.map((l) => {
                  const pr = prev?.byLoc[l.loc.locId];
                  const cr = cur?.byLoc[l.loc.locId];
                  const tone = healthTone(l.health.score);
                  return (
                    <li key={l.loc.locId} className="border-b border-line last:border-0">
                      <Link href={`${base}/${encodeURIComponent(l.loc.locId)}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-6">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{l.loc.name}</span>
                          <span className="block text-[12.5px] text-muted">
                            {l.attention.length} action{l.attention.length === 1 ? '' : 's'} · {l.loc.rating != null ? `${l.loc.rating.toFixed(1)}★` : 'no rating'}
                            {pr && cr && pr.rating != null && cr.rating != null ? <> (<Delta v={cr.rating - pr.rating} digits={1} />)</> : null}
                            {pr && cr && cr.reviews != null && pr.reviews != null ? <> · <Delta v={cr.reviews - pr.reviews} /> reviews</> : null}
                          </span>
                        </span>
                        <span className="flex flex-col items-end">
                          <span className={`num display text-[30px] leading-none ${TEXT_TONE[tone]}`}>{l.health.score}</span>
                          <span className="text-[11.5px] text-muted">{healthWord(l.health.score)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-5">
            <Section title="Rating and review volume" sub={prev && cur ? `Between the two latest locations uploads: ${fmtDate(prev.at)} and ${fmtDate(cur.at)}.` : 'Upload the locations export again next week to see the change.'}>
              <div className="min-w-[460px]">
                <table className="tbl text-[13.5px]">
                  <thead><tr><th>Location</th><th className="r">Rating</th><th className="r">Change</th><th className="r">Reviews</th><th className="r">New</th></tr></thead>
                  <tbody>
                    {p.locations.map((l) => {
                      const pr = prev?.byLoc[l.loc.locId];
                      const cr = cur?.byLoc[l.loc.locId];
                      return (
                        <tr key={l.loc.locId}>
                          <td className="font-medium">{l.loc.name}</td>
                          <td className="r num">{cr?.rating != null ? cr.rating.toFixed(1) : '—'}</td>
                          <td className="r">{pr?.rating != null && cr?.rating != null ? <Delta v={cr.rating - pr.rating} digits={1} /> : <span className="text-faint">—</span>}</td>
                          <td className="r num">{fmt(cr?.reviews)}</td>
                          <td className="r">{pr?.reviews != null && cr?.reviews != null ? <Delta v={cr.reviews - pr.reviews} /> : <span className="text-faint">—</span>}</td>
                        </tr>
                      );
                    })}
                    {cs && (
                      <tr className="font-semibold">
                        <td>All locations</td>
                        <td className="r num">{cs.avgRating != null ? cs.avgRating.toFixed(2) : '—'}</td>
                        <td className="r">{ps?.avgRating != null && cs.avgRating != null ? <Delta v={cs.avgRating - ps.avgRating} digits={2} /> : <span className="text-faint">—</span>}</td>
                        <td className="r num">{fmt(cs.reviews)}</td>
                        <td className="r">{ps ? <Delta v={cs.reviews - ps.reviews} /> : <span className="text-faint">—</span>}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {snaps.length > 2 && <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-6">{snaps.length} locations uploads on file, the oldest from {fmtDate(snaps[0].at)}.</p>}
            </Section>

            <Section title="Review velocity" sub="New reviews and their average rating in each 30-day period, from the uploaded reviews.">
              <ul className="flex flex-col gap-3 px-4 py-4 sm:px-6">
                {periods.map((x) => (
                  <li key={x.label} className="grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                    <span className="text-muted">{x.label}</span>
                    <Bar value={(x.count / maxCount) * 100} label={`${x.count} reviews`} />
                    <span className="num w-[108px] text-right"><span className="font-semibold">{x.count}</span> <span className="text-muted">· {x.avgRating != null ? `${x.avgRating.toFixed(1)}★` : '—'}</span></span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-5">
            <section id="settings" className="card scroll-mt-24 overflow-hidden">
              <div className="border-b border-line px-4 py-4 sm:px-6"><h2 className="text-[15px] font-semibold">Reply approval rules</h2><p className="text-[13px] text-muted">For this site. Saving re-applies them to replies nobody has acted on yet.</p></div>
              <form action={saveLocalSettingsAction} className="flex flex-col gap-3 px-4 py-4 text-[13.5px] sm:px-6">
                <input type="hidden" name="siteId" value={id} />
                <label className="flex items-start gap-3"><input type="checkbox" name="five" defaultChecked={settings.autoApproveFiveStar} className="mt-1" /><span><span className="font-medium">Auto-approve templated replies to 5-star reviews</span><span className="block text-[12.5px] text-muted">Only when Jev chose a template reply with 0.85 confidence or more.</span></span></label>
                <label className="flex items-start gap-3"><input type="checkbox" name="four" defaultChecked={settings.autoApproveFourStar} className="mt-1" /><span><span className="font-medium">Auto-approve templated replies to 4-star reviews</span><span className="block text-[12.5px] text-muted">Off by default.</span></span></label>
                <label className="flex items-start gap-3 text-muted"><input type="checkbox" checked disabled className="mt-1" /><span><span className="font-medium text-ink-2">Always review replies to 1 to 2-star reviews</span><span className="block text-[12.5px]">Always on. Removal requests and escalations also always need a person.</span></span></label>
                <p className="rounded-[10px] bg-sunken px-3 py-2 text-[12.5px] text-ink-2">Approved means ready to post. Rankcall has no Google Business Profile access, so you copy each reply into the profile and mark it as posted.</p>
                <div><SubmitButton className="btn btn-sm" pending="Saving…">Save rules</SubmitButton></div>
              </form>
            </section>

            <Section title="Recent actions" sub="Everything actioned, logged against its location.">
              {log.length === 0 ? <p className="px-4 py-6 text-[13.5px] text-muted sm:px-6">Nothing actioned yet.</p> : (
                <ul className="flex flex-col">
                  {log.map((e) => {
                    const name = p.locations.find((l) => l.loc.locId === e.loc_id)?.loc.name ?? e.loc_id;
                    return (
                      <li key={e.id} className="border-b border-line px-4 py-2.5 text-[13px] last:border-0 sm:px-6">
                        <div className="flex flex-wrap justify-between gap-2"><span><span className="font-medium">{e.action}</span> · <Link className="text-accent" href={`${base}/${encodeURIComponent(e.loc_id)}`}>{name}</Link></span><span className="text-muted">{fmtDateTime(e.created_at)}</span></div>
                        {e.detail && <div className="truncate text-[12px] text-muted">{e.detail}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}

      <section id="data" className="card scroll-mt-24 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div><h2 className="text-[15px] font-semibold">Data</h2><p className="text-[13px] text-muted">Exports from Google Business Profile, Apple Business Connect, Bing Places, Yext, BrightLocal or a spreadsheet.</p></div>
          {has && <form action={loadLocalSamplesAction}><input type="hidden" name="siteId" value={id} /><SubmitButton className="btn btn-sm" pending="Loading…">Reload sample data</SubmitButton></form>}
        </div>
        <UploadForm siteId={id} />
        {uploads.length > 0 && (
          <div className="overflow-x-auto border-t border-line">
            <table className="tbl min-w-[560px] text-[13px]">
              <thead><tr><th>Upload history</th><th>Type</th><th className="r">Rows</th><th>Added</th></tr></thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id}>
                    <td className="max-w-[260px]"><span className="block truncate" title={u.filename}>{u.filename}</span>{u.warnings.length > 0 && <details className="text-[12px] text-warn"><summary className="cursor-pointer">{u.warnings.length} row{u.warnings.length === 1 ? '' : 's'} to check</summary>{u.warnings.slice(0, 8).map((w) => <div key={w}>{w}</div>)}</details>}</td>
                    <td>{KIND_LABEL[u.kind]} <span className="text-muted">· {u.mode === 'replace' ? 'replaced' : 'added'}</span>{u.source === 'sample' && <span className="ml-2 rounded bg-sunken px-1.5 text-[11px] text-muted">sample</span>}</td>
                    <td className="r num">{fmt(u.row_count)}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {has && (
          <form action={clearLocalAction} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[13px] sm:px-6">
            <input type="hidden" name="siteId" value={id} />
            <label className="inline-flex items-center gap-2 text-muted"><input type="checkbox" name="confirm" value="yes" /> Delete all Local SEO data for this site, including decisions and the action log</label>
            <SubmitButton className="btn btn-sm btn-danger" pending="Clearing…">Clear</SubmitButton>
          </form>
        )}
      </section>

      <section aria-label="Not included yet" className="rounded-[16px] border border-dashed border-line-strong px-5 py-4 text-[13px] text-ink-2">
        <p className="font-semibold text-ink">Not included yet</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-muted">
          <li>· Live Google Business Profile sync and publishing replies or posts automatically: both need Google’s API approval. Until then everything comes from uploaded exports, and you post by copying.</li>
          <li>· Local pack rank tracking for your search terms: needs a SERP data provider.</li>
          <li>· Photo quality analysis: only the photo count is checked.</li>
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="label">{label}</div>
      <div className="num display mt-1 text-[38px] leading-none">{value}</div>
      {sub && <div className="mt-1 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}
