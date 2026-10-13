'use client';

/** Header checkbox that toggles every checkbox with the given name in the same form. */
export function CheckAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((c) => (c.checked = e.currentTarget.checked));
      }}
    />
  );
}
