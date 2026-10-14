import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/auth';
import { Toast } from '@/components/Toast';
import { Empty, fmt, fmtDateTime, Section } from '@/components/ui';
import { Bar, Tag, TEXT_TONE, healthTone, healthWord } from '@/components/local/bits';
import { PostCard, QuestionCard, ReviewCard } from '@/components/local/Cards';
import { locationView, readLog } from '@/lib/modules/local';
import { displayPhone, NAP_FIELD_LABEL } from '@/modules/local/nap';

export default async function LocationPage({ params, searchParams }: { params: Promise<{ id: string; loc: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, loc: rawLoc } = await params;
  await requireSite(id);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const locId = decodeURIComponent(rawLoc);
  const v = locationView(id, locId);
  if (!v) notFound();
  const base = `/sites/${id}/local`;
  const back = `${base}/${encodeURIComponent(locId)}`;
  const { loc, health } = v;
  const tone = healthTone(health.score);
  const isOpen = (s?: string) => !s || ['proposed', 'approved', 'escalated'].includes(s);
  const toHandle = v.reviews.filter((r) => (!r.review.replied && isOpen(r.decision?.status)) || r.decision?.status === 'escalated');
  const handled = v.reviews.filter((r) => !toHandle.includes(r));
  const order = (r: (typeof toHandle)[number]) => (r.decision?.status === 'escalated' ? 0 : r.review.rating <= 2 ? 1 : r.decision?.status === 'approved' ? 4 : r.review.rating === 3 ? 2 : 3);
  toHandle.sort((a, b) => order(a) - order(b) || (b.review.date ?? '').localeCompare(a.review.date ?? ''));
  const openQs = v.questions.filter((q) => !q.question.answered && isOpen(q.decision?.status));
  const doneQs = v.questions.filter((q) => !openQs.includes(q));
  const fixes = health.checks.filter((c) => c.lost > 0 && (c.area === 'profile' || c.area === 'posts'));
  const log = readLog(id, locId, 25);
  const maxCount = Math.max(1, ...v.periods.map((x) => x.count));

  return (
    <div className="flex flex-col gap-6">
      {sp.msg && <Toast key={sp.msg} message={sp.msg} />}
      {sp.err && <Toast key={sp.err} message={sp.err} tone="bad" />}
      <div>
        <Link href={base} className="text-[13px] font-medium text-accent">← All locations</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display text-[40px] leading-[1.05]">{loc.name}</h1>
            <p className="mt-2 text-[14px] text-muted">
              {[loc.address, loc.postcode].filter(Boolean).join(', ') || 'No address'}{loc.phone ? ` · ${displayPhone(loc.phone)}` : ''}{loc.primaryCategory ? ` · ${loc.primaryCategory}` : ''}
            </p>
            {loc.website && <a href={loc.website} target="_blank" rel="noopener noreferrer" className="mono mt-1 block truncate text-[12.5px] text-accent">{loc.website.replace(/^https?:\/\//, '')}</a>}
          </div>
          <span className="mono text-[12px] text-muted">id {loc.locId}</span>
        </div>
      </div>

      <section aria-label="At a glance" className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        <div className="card px-5 py-4"><div className="label">Health</div><div className={`num display mt-1 text-[38px] leading-none ${TEXT_TONE[tone]}`}>{health.score}</div><div className="mt-1 text-[12.5px] text-muted">{healthWord(health.score)}, out of 100</div></div>
        <div className="card px-5 py-4"><div className="label">Rating</div><div className="num display mt-1 text-[38px] leading-none">{loc.rating != null ? loc.rating.toFixed(1) : v.avgRating != null ? v.avgRating.toFixed(1) : '—'}</div><div className="mt-1 text-[12.5px] text-muted">{loc.reviewCount != null ? `${fmt(loc.reviewCount)} reviews on the profile` : 'from uploaded reviews'}</div></div>
        <div className="card px-5 py-4"><div className="label">Reviews to handle</div><div className="num display mt-1 text-[38px] leading-none">{toHandle.length}</div><div className="mt-1 text-[12.5px] text-muted">{v.unrepliedLow} at 1 to 2 stars</div></div>
        <div className="card px-5 py-4"><div className="label">Open questions</div><div className="num display mt-1 text-[38px] leading-none">{openQs.length}</div><div className="mt-1 text-[12.5px] text-muted">{v.daysSincePost == null ? 'no post on record' : `last post ${v.daysSincePost} days ago`}</div></div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <Section title="Health breakdown" sub="Starts at 100. Each check takes off a fixed number of points.">
          <ul className="flex flex-col">
            {health.checks.map((c) => (
              <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 sm:px-6">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${c.lost === 0 ? 'bg-ok-bg ring-2 ring-[var(--ok)]' : c.lost >= c.max * 0.75 ? 'bg-[var(--bad)]' : 'bg-[var(--warn)]'}`} />{c.label}</span>
                  <span className="block text-[12.5px] text-muted">{c.detail}</span>
                  <span className="mt-1 block max-w-[220px]"><Bar value={((c.max - c.lost) / c.max) * 100} tone={c.lost === 0 ? 'ok' : c.lost >= c.max * 0.75 ? 'bad' : 'warn'} /></span>
                </span>
                <span className={`num text-right text-[13px] ${c.lost ? 'font-semibold text-bad' : 'text-muted'}`}>{c.lost ? `−${c.lost}` : '0'}<span className="text-faint"> /{c.max}</span></span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-5">
          <section id="profile" className="card scroll-mt-24 overflow-hidden">
            <div className="border-b border-line px-4 py-4 sm:px-6"><h2 className="text-[15px] font-semibold">Profile fixes</h2><p className="text-[13px] text-muted">Make these in Google Business Profile, then upload the locations export again.</p></div>
            {fixes.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-muted sm:px-6">The profile fields are complete.</p> : (
              <ul className="flex flex-col">
                {fixes.map((c) => (
                  <li key={c.key} className="border-b border-line px-4 py-3 last:border-0 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{c.label}</span><Tag tone={c.lost >= 10 ? 'bad' : 'warn'}>−{c.lost} points</Tag></div>
                    <p className="text-[13px] text-muted">{c.detail} {c.fix}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section id="post" className="card scroll-mt-24 overflow-hidden">
            <div className="border-b border-line px-4 py-4 sm:px-6"><h2 className="text-[15px] font-semibold">This week’s post</h2><p className="text-[13px] text-muted">Jev picks the type from how long since the last post, recent review themes and the season.</p></div>
            <PostCard post={v.post} back={back} daysSincePost={v.daysSincePost} />
          </section>
        </div>
      </div>

      <Section title="Reviews to handle" sub="Escalations and low ratings first. Drafts come from the reply templates; edit anything before posting.">
        {toHandle.length === 0 ? <Empty title="All caught up">Every review has a reply or has been dealt with.</Empty> : toHandle.map((r) => <ReviewCard key={r.review.key} item={r} back={back} />)}
      </Section>

      <div id="questions" className="scroll-mt-24">
        <Section title="Questions" sub="Answered from the profile where possible, otherwise sent to the shop team.">
          {openQs.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-muted sm:px-6">No open questions.</p> : openQs.map((q) => <QuestionCard key={q.question.key} item={q} back={back} />)}
          {doneQs.length > 0 && (
            <details className="border-t border-line px-4 py-3 text-[13px] sm:px-6">
              <summary className="cursor-pointer font-medium text-ink-2">{doneQs.length} answered or closed</summary>
              <ul className="mt-2 flex flex-col gap-1 text-muted">{doneQs.map((q) => <li key={q.question.key}>“{q.question.question}” · {q.question.answered ? 'answered' : q.decision?.status === 'spam' ? 'spam' : 'dismissed'}</li>)}</ul>
            </details>
          )}
        </Section>
      </div>

      <div id="citations" className="scroll-mt-24">
        <Section title="Citation inconsistencies" sub="Each directory compared with the profile after normalising case, punctuation, Street/St, postcode spacing and +44/0 phone formats. Most important directories first.">
          {v.issues.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-muted sm:px-6">Every uploaded listing matches the profile.</p> : (
            <div className="min-w-[720px]">
              <table className="tbl text-[13px]">
                <thead><tr><th>Directory</th><th>Field</th><th>Listed as</th><th>Should be</th><th>How to fix</th></tr></thead>
                <tbody>
                  {v.issues.map((c, i) => {
                    const rows = c.mismatches.length ? c.mismatches : [null];
                    return rows.map((m, j) => (
                      <tr key={`${c.directory}-${i}-${j}`}>
                        {j === 0 && <td rowSpan={rows.length} className="whitespace-nowrap"><span className="font-semibold">{c.directory}</span><span className="mt-1 block"><Tag tone={c.tier === 1 ? 'bad' : c.tier === 2 ? 'warn' : 'leave'}>{c.tier === 1 ? 'Major' : c.tier === 2 ? 'Important' : 'Minor'}</Tag></span></td>}
                        <td className="whitespace-nowrap">{m ? NAP_FIELD_LABEL[m.field] : 'Duplicate'}</td>
                        <td className="mono max-w-[200px] break-words text-[12px] text-bad">{m ? m.listed : `${c.directory} has more than one listing for this shop`}</td>
                        <td className="mono max-w-[200px] break-words text-[12px]">{m ? m.expected : 'One listing'}</td>
                        {j === 0 && <td rowSpan={rows.length} className="max-w-[260px] text-[12.5px] text-muted">{c.duplicate && c.mismatches.length === 0 ? `Ask ${c.directory} to merge or close the duplicate. ` : ''}{c.fixPath}</td>}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <Section title="Review velocity" sub="New reviews and average rating per 30 days.">
          <ul className="flex flex-col gap-3 px-4 py-4 sm:px-6">
            {v.periods.map((x) => (
              <li key={x.label} className="grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                <span className="text-muted">{x.label}</span>
                <Bar value={(x.count / maxCount) * 100} label={`${x.count} reviews`} />
                <span className="num w-[96px] text-right"><span className="font-semibold">{x.count}</span> <span className="text-muted">· {x.avgRating != null ? `${x.avgRating.toFixed(1)}★` : '—'}</span></span>
              </li>
            ))}
          </ul>
          {handled.length > 0 && (
            <details className="border-t border-line px-4 py-3 text-[13px] sm:px-6">
              <summary className="cursor-pointer font-medium text-ink-2">{handled.length} replied or closed reviews</summary>
              <div className="-mx-4 sm:-mx-6">{handled.slice(0, 30).map((r) => <ReviewCard key={r.review.key} item={r} back={back} />)}</div>
            </details>
          )}
        </Section>

        <Section title="Action log" sub="Everything actioned for this location.">
          {log.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-muted sm:px-6">Nothing actioned yet.</p> : (
            <ul className="flex flex-col">
              {log.map((e) => (
                <li key={e.id} className="border-b border-line px-4 py-2.5 text-[13px] last:border-0 sm:px-6">
                  <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{e.action}</span><span className="text-muted">{fmtDateTime(e.created_at)}</span></div>
                  {e.detail && <div className="text-[12px] text-muted">{e.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <p className="text-[12.5px] text-muted">Profile fields and the last post date come from the latest locations upload. Rankcall cannot read from or publish to Google Business Profile directly.</p>
    </div>
  );
}
