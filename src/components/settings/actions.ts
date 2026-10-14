'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { createApiKey, revokeApiKey } from '@/lib/apikeys';

export interface CreateKeyState { token?: string; name?: string; error?: string }

const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());

/** Owners only. Returns the full key once; it is never stored or shown again. */
export async function createApiKeyAction(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const viewer = await requireViewer();
  if (viewer.user.role !== 'owner') return { error: 'Only the account owner can create API keys.' };
  const days = Number(str(formData.get('expires')));
  try {
    const { key, token } = createApiKey({
      accountId: viewer.account.id,
      userId: viewer.user.id,
      name: str(formData.get('name')),
      scopes: formData.getAll('scope').map(String),
      expiresInDays: Number.isFinite(days) && days > 0 ? days : null,
    });
    revalidatePath('/settings');
    return { token, name: key.name };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The key could not be created.' };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const viewer = await requireViewer();
  if (viewer.user.role !== 'owner') redirect('/settings?keyerror=owner#api-keys');
  revokeApiKey(viewer.account.id, str(formData.get('keyId')));
  revalidatePath('/settings');
  redirect('/settings?revoked=1#api-keys');
}
