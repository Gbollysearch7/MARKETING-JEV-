import { SubmitButton } from '@/components/SubmitButton';
import { uploadLocalAction } from '@/lib/modules/local-actions';
import { KIND_LABEL, UPLOAD_KINDS } from '@/modules/local/types';

const COLUMNS: Record<string, string> = {
  locations: 'location id, name, address, postcode, phone, website, primary category, additional categories, hours, description, photo count, last post date, rating, review count',
  reviews: 'location id, author, rating (1 to 5), text, date, replied (yes/no), reply text',
  questions: 'location id, question, date, answered (yes/no)',
  citations: 'location id, directory, listed name, address, phone, URL',
};

/** Upload a CSV file or paste CSV text for one of the four local exports. */
export function UploadForm({ siteId }: { siteId: string }) {
  return (
    <form action={uploadLocalAction} className="flex flex-col gap-4 p-4 sm:p-6">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">What is in the file?</span>
          <select name="kind" className="select h-10" defaultValue="locations">
            {UPLOAD_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="label mb-1.5">How to load it</legend>
          <div className="flex flex-wrap gap-4 text-[13.5px]">
            <label className="inline-flex items-center gap-2"><input type="radio" name="mode" value="replace" defaultChecked /> Replace this type</label>
            <label className="inline-flex items-center gap-2"><input type="radio" name="mode" value="append" /> Add to existing</label>
          </div>
        </fieldset>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="label">CSV file (up to 900 KB)</span>
        <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv" className="input h-auto py-2 text-[13px]" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Or paste CSV text</span>
        <textarea name="text" rows={4} className="input mono py-2 text-[12px]" placeholder={'Location ID,Author,Rating,Text,Date,Replied\nSO-KES,Hannah W.,5,Great shop,2026-10-11,no'} />
      </label>
      <details className="text-[12.5px] text-muted">
        <summary className="cursor-pointer font-medium text-ink-2">Which columns are read?</summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {UPLOAD_KINDS.map((k) => <li key={k}><span className="font-medium text-ink-2">{KIND_LABEL[k]}:</span> {COLUMNS[k]}. Header names are matched loosely, so Google Business Profile, Yext and BrightLocal exports work as they are.</li>)}
        </ul>
        <p className="mt-2">“Replace” swaps out every row of that type. “Add to existing” adds new rows and updates matching ones (by location id, or by review and question content). Every locations upload is kept, so rating and review volume can be compared over time.</p>
      </details>
      <div><SubmitButton className="btn btn-primary" pending="Reading…">Upload</SubmitButton></div>
    </form>
  );
}
