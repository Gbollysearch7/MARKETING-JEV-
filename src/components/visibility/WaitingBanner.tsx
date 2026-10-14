import { SubmitButton } from '@/components/SubmitButton';
import { fmt } from '@/components/ui';
import { analyseAction } from '@/lib/modules/visibility-actions';
import { AUTO_ANALYSE_LIMIT } from '@/modules/visibility/types';

/**
 * Shown when more Jev work is waiting than is ever started automatically. The founder chooses between the
 * lost prompts plus the newest mentions (capped) and everything.
 */
export function WaitingBanner({ siteId, mentions, losses, back }: { siteId: string; mentions: number; losses: number; back?: 'answers' }) {
  const total = mentions + losses;
  if (total <= AUTO_ANALYSE_LIMIT) return null;
  return (
    <section role="status" className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex max-w-[640px] flex-col gap-1">
        <span className="font-semibold">{fmt(total)} answers and lost prompts waiting for Jev</span>
        <span className="text-[13.5px] text-ink-2">{fmt(mentions)} mention{mentions === 1 ? '' : 's'} to score for sentiment and {fmt(losses)} lost prompt{losses === 1 ? '' : 's'} to explain: about {fmt(total)} Jev decisions. Big batches are never started automatically, so you choose how much to run.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={analyseAction}>
          <input type="hidden" name="siteId" value={siteId} />{back && <input type="hidden" name="back" value={back} />}
          <SubmitButton className="btn" name="scope" value="all" pending="Starting…">Score all {fmt(total)}</SubmitButton>
        </form>
        <form action={analyseAction}>
          <input type="hidden" name="siteId" value={siteId} />{back && <input type="hidden" name="back" value={back} />}
          <SubmitButton className="btn btn-primary" name="scope" value="top" pending="Starting…">Explain losses and the newest {AUTO_ANALYSE_LIMIT - Math.min(losses, AUTO_ANALYSE_LIMIT) > 0 ? `${fmt(AUTO_ANALYSE_LIMIT - Math.min(losses, AUTO_ANALYSE_LIMIT))} mentions` : `${AUTO_ANALYSE_LIMIT}`}</SubmitButton>
        </form>
      </div>
    </section>
  );
}
