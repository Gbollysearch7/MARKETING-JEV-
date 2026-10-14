import Link from 'next/link';
import { requireSite } from '@/lib/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Toast } from '@/components/Toast';
import { Empty, PageTitle, Section } from '@/components/ui';
import { getSettings, listPrompts, promptSuggestions } from '@/lib/modules/visibility';
import { addPromptsAction, addSuggestionsAction, deletePromptAction, saveSettingsAction, updatePromptAction } from '@/lib/modules/visibility-actions';

const DONE: Record<string, string> = { settings: 'Brand saved; answers re-read', prompts: 'Prompts added', prompt: 'Prompt updated', deleted: 'Prompt and its answers deleted' };

export default async function VisibilitySetup({ params, searchParams }: PageProps<'/sites/[id]/visibility/setup'>) {
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { site } = await requireSite(id);
  const cfg = getSettings(site);
  const prompts = listPrompts(id);
  const showSuggest = sp.suggest === '1';
  const suggestions = showSuggest ? promptSuggestions(site) : [];
  const groups = [...new Set(prompts.map((p) => p.grp).filter(Boolean))] as string[];
  const comps = Array.from({ length: 5 }, (_x, i) => cfg.competitors[i] ?? { name: '', domain: '' });
  const toast = sp.done && DONE[sp.done] ? `${DONE[sp.done]}${sp.n ? ` (${sp.n})` : ''}` : null;

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast key={`${sp.done}${sp.n}`} message={toast} />}
      <PageTitle title="Brand and prompts" sub="Who you are, who you compete with, and the buyer questions to track. Mentions are matched on the brand name, aliases and domain, ignoring case." />
      {sp.error && <div role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-[13.5px] text-bad">{sp.error}</div>}

      <Section title="Brand" sub={cfg.saved ? 'Saving re-reads every captured answer with the new names.' : 'Not saved yet: these defaults come from the site.'}>
        <form action={saveSettingsAction} className="flex flex-col gap-5 px-4 py-5 sm:px-6">
          <input type="hidden" name="siteId" value={id} />
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Brand name</span><input className="input" name="brand" defaultValue={cfg.name} required maxLength={120} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Aliases <span className="font-normal text-muted">comma separated</span></span><input className="input" name="aliases" defaultValue={cfg.aliases.join(', ')} placeholder="e.g. SampleOutdoors, Sample Outdoor Co" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Domain</span><input className="input mono" name="domain" defaultValue={cfg.domain} required placeholder="example.com" /></label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium">Competitors <span className="font-normal text-muted">up to five</span></legend>
            {comps.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <input className="input" name={`comp_name_${i}`} defaultValue={c.name} aria-label={`Competitor ${i + 1} name`} placeholder={`Competitor ${i + 1} name`} maxLength={120} />
                <input className="input mono" name={`comp_domain_${i}`} defaultValue={c.domain} aria-label={`Competitor ${i + 1} domain`} placeholder="competitor.com" />
              </div>
            ))}
          </fieldset>
          <div><SubmitButton className="btn btn-primary" pending="Saving…">Save brand</SubmitButton></div>
        </form>
      </Section>

      <Section title="Prompts" sub={`${prompts.length} tracked. Group tags let you compare topics on the overview.`} actions={<Link className="btn btn-sm" href={showSuggest ? `/sites/${id}/visibility/setup#prompts` : `?suggest=1#suggest`}>{showSuggest ? 'Hide suggestions' : 'Suggest prompts'}</Link>}>
        <div id="prompts" className="scroll-mt-6">
          <form action={addPromptsAction} className="grid gap-3 border-b border-line px-4 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
            <input type="hidden" name="siteId" value={id} />
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Add prompts <span className="font-normal text-muted">one per line</span></span><textarea className="input min-h-[44px]" name="text" rows={2} placeholder="best waterproof jacket for hillwalking" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Group</span><input className="input" name="group" list="vis-groups" placeholder="e.g. clothing" maxLength={60} /></label>
            <datalist id="vis-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            <SubmitButton className="btn btn-primary" pending="Adding…">Add</SubmitButton>
          </form>
          {prompts.length === 0 ? (
            <Empty title="No prompts yet">Add the questions buyers ask AI assistants, use “Suggest prompts”, or import answers and the prompts are added for you.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {prompts.map((p) => (
                <li key={p.id} className="px-4 py-2.5 sm:px-6">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 break-words text-[14px]">{p.text}</span>
                      {p.grp && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] text-ink-2">{p.grp}</span>}
                      <span className="num text-[12px] text-muted">{p.answers} answer{p.answers === 1 ? '' : 's'}</span>
                      <span className="text-[12.5px] text-accent group-open:hidden">Edit</span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-3 rounded-xl bg-sunken p-3 sm:flex-row sm:items-end">
                      <form action={updatePromptAction} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="promptId" value={p.id} />
                        <label className="flex flex-1 flex-col gap-1"><span className="text-[12px] text-muted">Prompt</span><input className="input" name="text" defaultValue={p.text} required maxLength={500} /></label>
                        <label className="flex flex-col gap-1 sm:w-40"><span className="text-[12px] text-muted">Group</span><input className="input" name="group" defaultValue={p.grp ?? ''} list="vis-groups" maxLength={60} /></label>
                        <SubmitButton className="btn btn-sm" pending="Saving…">Save</SubmitButton>
                      </form>
                      <form action={deletePromptAction}>
                        <input type="hidden" name="promptId" value={p.id} />
                        <SubmitButton className="btn btn-sm btn-ghost text-bad" pending="Deleting…">Delete{p.answers ? ` with ${p.answers} answers` : ''}</SubmitButton>
                      </form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {showSuggest && (
        <Section title="Suggested prompts" sub="Built from your top Search Console topics and page titles with buyer-style templates. Tick the ones worth tracking.">
          <div id="suggest" className="scroll-mt-6">
            {suggestions.length === 0 ? (
              <Empty title="Nothing to suggest">Upload a Search Console page and query export or a crawl on <Link className="underline" href={`/sites/${id}/data`}>Data sources</Link>; topics come from there.</Empty>
            ) : (
              <form action={addSuggestionsAction}>
                <input type="hidden" name="siteId" value={id} />
                <ul className="divide-y divide-line">
                  {suggestions.map((s) => (
                    <li key={s.text}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-sunken/60 sm:px-6">
                        <input type="checkbox" name="s" value={`${s.text}\u001f${s.group}`} defaultChecked className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                        <span className="min-w-0 flex-1"><span className="text-[14px]">{s.text}</span><span className="block text-[12px] text-muted">{s.why} · group “{s.group}”</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3 sm:px-6"><SubmitButton className="btn btn-primary" pending="Adding…">Add ticked prompts</SubmitButton></div>
              </form>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
