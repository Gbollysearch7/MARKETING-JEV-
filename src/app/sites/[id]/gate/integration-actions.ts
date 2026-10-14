'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSite } from '@/lib/auth';
import { createWebflowConnection, deleteWebflowConnection, MissingAppSecretError } from '@/lib/apikeys';

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const back = (siteId: string, params: Record<string, string>) => `/sites/${siteId}/gate?${new URLSearchParams(params).toString()}#integrations`;

/** Create a Webflow connection; the pasted signing secret is stored encrypted with APP_SECRET. */
export async function createWebflowConnectionAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  let id: string;
  try {
    id = createWebflowConnection(site.id, {
      name: str(formData.get('name')), secret: str(formData.get('secret')), bodyField: str(formData.get('bodyField')),
      metaField: str(formData.get('metaField')), collectionId: str(formData.get('collectionId')), collectionName: str(formData.get('collectionName')),
    }).id;
  } catch (e) {
    const msg = e instanceof MissingAppSecretError ? 'Webflow connections need APP_SECRET set on the server. Ask the administrator to set it, then try again.' : e instanceof Error ? e.message : 'The connection could not be saved.';
    redirect(back(site.id, { wferror: msg }));
  }
  revalidatePath(`/sites/${site.id}/gate`);
  redirect(back(site.id, { wfcreated: id }));
}

export async function deleteWebflowConnectionAction(formData: FormData) {
  const { site } = await requireSite(str(formData.get('siteId')));
  deleteWebflowConnection(site.id, str(formData.get('connectionId')));
  revalidatePath(`/sites/${site.id}/gate`);
  redirect(back(site.id, { wfdeleted: '1' }));
}
