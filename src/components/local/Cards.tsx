import { SubmitButton } from '@/components/SubmitButton';
import { fmtDate, fmtDateTime, Prob } from '@/components/ui';
import { decisionAction } from '@/lib/modules/local-actions';
import type { PostRow, QuestionItem, ReviewItem } from '@/lib/modules/local';
import { REMOVAL_STEPS } from '@/modules/local/replies';
import { POST_LABEL, QA_LABEL, REVIEW_ACTION_LABEL, SENTIMENT_LABEL, THEME_LABEL, type PostType, type QaAction, type ReviewAction } from '@/modules/local/types';
import { CopyButton } from './CopyButton';
import { Stars, SureBadge, Tag, type Tone } from './bits';

const ACTION_TONE: Record<ReviewAction, Tone> = { reply_template: 'ok', reply_custom: 'accent', escalate_to_manager: 'warn', flag_for_removal: 'bad' };
const STATUS: Record<string, [string, Tone]> = {
  proposed: ['Waiting for you', 'leave'], approved: ['Approved, ready to post', 'ok'], escalated: ['With the manager', 'warn'],
  posted: ['Posted', 'ok'], removal_requested: ['Removal requested', 'bad'], dismissed: ['Dismissed', 'leave'], spam: ['Marked spam', 'bad'],
};

function StatusTag({ s }: { s: string }) {
  const [l, t] = STATUS[s] ?? [s, 'leave'];
  return <Tag tone={t}>{l}</Tag>;
}

function Hidden({ id, back }: { id: string; back: string }) {
  return <><input type="hidden" name="decisionId" value={id} /><input type="hidden" name="back" value={back} /></>;
}

const NO_API = 'Copy it, paste it into Google Business Profile, then mark it as posted. Rankcall cannot post to Google for you: that needs Google API approval.';

export function ReviewCard({ item, back }: { item: ReviewItem; back: string }) {
  const { review: r, decision: d } = item;
  const open = d && ['proposed', 'approved', 'escalated'].includes(d.status) && !(r.replied && d.status !== 'escalated');
  const taId = `reply-${d?.id ?? r.key}`;
  return (
    <article id={`review-${r.key}`} className="scroll-mt-24 border-b border-line px-4 py-5 last:border-0 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars n={r.rating} />
          <span className="font-semibold">{r.author}</span>
          <span className="text-[12.5px] text-muted">{fmtDate(r.date)}</span>
        </div>
        {d ? <StatusTag s={r.replied && d.status !== 'posted' && d.status !== 'escalated' ? 'posted' : d.status} /> : r.replied ? <Tag tone="ok">Replied</Tag> : <Tag>Not decided yet</Tag>}
      </div>
      <p className="mt-2.5 whitespace-pre-line rounded-[10px] bg-bg p-3 text-[14px] leading-relaxed">{r.text || <span className="text-muted">No text, star rating only.</span>}</p>

      {d && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">Jev:</span>
          <Tag tone={ACTION_TONE[d.choice as ReviewAction] ?? 'leave'}>{REVIEW_ACTION_LABEL[d.choice as ReviewAction]}</Tag>
          <Tag>{THEME_LABEL[d.data.theme]}</Tag>
          <Tag tone={d.data.sentimentScore < 1.5 ? 'bad' : d.data.sentimentScore < 2.5 ? 'warn' : 'ok'}>{SENTIMENT_LABEL[d.data.sentiment]}</Tag>
          <span className="inline-flex items-center gap-1.5 text-muted">confidence <Prob p={d.confidence} /></span>
          <SureBadge r={d.router} />
          {d.choice !== d.jev_choice && <span className="text-muted">(Jev chose {REVIEW_ACTION_LABEL[d.jev_choice as ReviewAction].toLowerCase()})</span>}
        </div>
      )}
      {d && (d.data.rules.length > 0 || d.data.approval) && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[12.5px] text-muted">
          {d.data.rules.map((x) => <li key={x}>· {x}</li>)}
          {open && <li>· {d.data.approval}</li>}
        </ul>
      )}

      {r.replied && d?.status !== 'escalated' ? (
        r.replyText ? <div className="mt-3 rounded-[10px] border border-line p-3 text-[13px]"><div className="label mb-1">Reply</div><p className="whitespace-pre-line">{r.replyText}</p></div> : null
      ) : d && open ? (
        <form action={decisionAction} className="mt-3 flex flex-col gap-2.5">
          <Hidden id={d.id} back={back} />
          {d.choice === 'flag_for_removal' ? (
            <div className="rounded-[10px] border border-dashed border-line-strong p-3 text-[13px] text-ink-2">
              <div className="mb-1 font-semibold text-ink">How to request removal</div>{REMOVAL_STEPS}
            </div>
          ) : (
            <>
              <label htmlFor={taId} className="label">{d.status === 'escalated' ? 'Holding reply, for after the manager has looked into it' : d.choice === 'reply_custom' ? 'Draft reply: add the personal line, then edit freely' : 'Draft reply, edit freely'}</label>
              <textarea id={taId} name="text" rows={6} className="input min-h-[140px] py-2.5 leading-relaxed" defaultValue={d.final_text} />
              <p className="text-[12px] text-muted">{NO_API}</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {d.choice === 'flag_for_removal' ? (
              <>
                <SubmitButton className="btn btn-sm btn-primary" name="op" value="remove" pending="Saving…">I’ve reported it</SubmitButton>
                <SubmitButton className="btn btn-sm" name="op" value="escalate" pending="Saving…">Escalate instead</SubmitButton>
              </>
            ) : (
              <>
                <CopyButton targetId={taId} />
                {d.status === 'proposed' && <SubmitButton className="btn btn-sm" name="op" value="approve" pending="Saving…">Approve</SubmitButton>}
                <SubmitButton className="btn btn-sm btn-primary" name="op" value="post" pending="Saving…">Mark as posted</SubmitButton>
                {d.status !== 'escalated' && <SubmitButton className="btn btn-sm" name="op" value="escalate" pending="Saving…">Escalate to manager</SubmitButton>}
                {d.data.breaksRules >= 0.5 && <SubmitButton className="btn btn-sm btn-danger" name="op" value="remove" pending="Saving…">Request removal</SubmitButton>}
              </>
            )}
            <SubmitButton className="btn btn-sm btn-ghost" name="op" value="skip" pending="Saving…">Dismiss</SubmitButton>
          </div>
        </form>
      ) : d ? (
        <form action={decisionAction} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <Hidden id={d.id} back={back} />
          <span className="text-muted">{d.final_text && d.status === 'posted' ? <>Posted reply: <span className="text-ink-2">{d.final_text.split('\n').find((l) => l.length > 20)?.slice(0, 120)}…</span></> : `Updated ${fmtDateTime(d.updated_at)}`}</span>
          <SubmitButton className="btn btn-sm btn-ghost" name="op" value="reopen" pending="Reopening…">Reopen</SubmitButton>
        </form>
      ) : !r.replied ? (
        <p className="mt-3 text-[13px] text-muted">Run this week’s decisions to get Jev’s call and a drafted reply.</p>
      ) : null}
    </article>
  );
}

export function QuestionCard({ item, back }: { item: QuestionItem; back: string }) {
  const { question: q, decision: d } = item;
  const open = !q.answered && d && ['proposed', 'approved', 'escalated'].includes(d.status);
  const taId = `answer-${d?.id ?? q.key}`;
  return (
    <article id={`question-${q.key}`} className="scroll-mt-24 border-b border-line px-4 py-5 last:border-0 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">“{q.question}”</p>
        {q.answered ? <Tag tone="ok">Answered</Tag> : d ? <StatusTag s={d.status} /> : <Tag>Not decided yet</Tag>}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">Asked {fmtDate(q.date)}</div>
      {d && !q.answered && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">Jev:</span>
          <Tag tone={d.choice === 'spam' ? 'bad' : d.choice === 'escalate' ? 'warn' : 'ok'}>{QA_LABEL[d.choice as QaAction]}</Tag>
          {d.choice === 'answer_from_profile' && <Tag>from {d.data.source}</Tag>}
          <span className="inline-flex items-center gap-1.5 text-muted">confidence <Prob p={d.confidence} /></span>
          <SureBadge r={d.router} />
        </div>
      )}
      {d?.data.rules.map((x) => <p key={x} className="mt-1 text-[12.5px] text-muted">· {x}</p>)}
      {open && d && (
        <form action={decisionAction} className="mt-3 flex flex-col gap-2.5">
          <Hidden id={d.id} back={back} />
          {d.choice !== 'spam' && (
            <>
              <label htmlFor={taId} className="label">{d.choice === 'escalate' ? 'Answer for the shop team to complete' : 'Draft answer, edit freely'}</label>
              <textarea id={taId} name="text" rows={4} className="input min-h-[100px] py-2.5 leading-relaxed" defaultValue={d.final_text} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {d.choice !== 'spam' && <CopyButton targetId={taId} />}
            {d.choice !== 'spam' && <SubmitButton className="btn btn-sm btn-primary" name="op" value="post" pending="Saving…">Mark as answered</SubmitButton>}
            {d.choice !== 'escalate' && d.status !== 'escalated' && d.choice !== 'spam' && <SubmitButton className="btn btn-sm" name="op" value="escalate" pending="Saving…">Escalate</SubmitButton>}
            {d.choice === 'escalate' && d.status !== 'escalated' && <SubmitButton className="btn btn-sm" name="op" value="escalate" pending="Saving…">Send to shop team</SubmitButton>}
            <SubmitButton className={`btn btn-sm ${d.choice === 'spam' ? 'btn-primary' : 'btn-danger'}`} name="op" value="spam" pending="Saving…">{d.choice === 'spam' ? 'I’ve reported it as spam' : 'Mark as spam'}</SubmitButton>
            <SubmitButton className="btn btn-sm btn-ghost" name="op" value="skip" pending="Saving…">Dismiss</SubmitButton>
          </div>
        </form>
      )}
      {!q.answered && !d && <p className="mt-2 text-[13px] text-muted">Run this week’s decisions to get Jev’s call and a draft answer.</p>}
    </article>
  );
}

export function PostCard({ post, back, daysSincePost }: { post: PostRow | null; back: string; daysSincePost: number | null }) {
  const last = daysSincePost == null ? 'No post on record.' : daysSincePost === 0 ? 'Last post today.' : `Last post ${daysSincePost} day${daysSincePost === 1 ? '' : 's'} ago.`;
  if (!post) return <p className="px-4 py-5 text-[13.5px] text-muted sm:px-6">{last} Run this week’s decisions for Jev’s post plan.</p>;
  const taId = `post-${post.id}`;
  const open = post.status === 'proposed' || post.status === 'approved';
  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">Jev:</span>
        <Tag tone={post.choice === 'none_this_week' ? 'leave' : 'accent'}>{POST_LABEL[post.choice as PostType]}</Tag>
        <span className="inline-flex items-center gap-1.5 text-muted">confidence <Prob p={post.confidence} /></span>
        <SureBadge r={post.router} />
        <StatusTag s={post.status} />
        <span className="text-muted">{last}</span>
      </div>
      {post.data.rules.map((x) => <p key={x} className="mt-1 text-[12.5px] text-muted">· {x}</p>)}
      {open && post.choice !== 'none_this_week' ? (
        <form action={decisionAction} className="mt-3 flex flex-col gap-2.5">
          <Hidden id={post.id} back={back} />
          <label htmlFor={taId} className="label">Post outline: replace the [bracketed] parts, then publish it on the profile</label>
          <textarea id={taId} name="text" rows={4} className="input min-h-[100px] py-2.5 leading-relaxed" defaultValue={post.final_text} />
          <p className="text-[12px] text-muted">Offers and events need details only you know, so they are left in brackets. Publishing happens in Google Business Profile.</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton targetId={taId} />
            <SubmitButton className="btn btn-sm btn-primary" name="op" value="post" pending="Saving…">Mark as published</SubmitButton>
            <SubmitButton className="btn btn-sm btn-ghost" name="op" value="skip" pending="Saving…">Skip this week</SubmitButton>
          </div>
        </form>
      ) : post.choice === 'none_this_week' ? (
        <p className="mt-2 text-[13.5px] text-muted">Posted recently, so nothing is needed this week.</p>
      ) : (
        <form action={decisionAction} className="mt-2 flex items-center justify-between gap-2 text-[13px] text-muted">
          <Hidden id={post.id} back={back} />
          <span>{post.status === 'posted' ? 'Published this week.' : 'Skipped this week.'}</span>
          <SubmitButton className="btn btn-sm btn-ghost" name="op" value="reopen" pending="Reopening…">Reopen</SubmitButton>
        </form>
      )}
    </div>
  );
}
