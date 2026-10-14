import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RawPage } from './parse';

/**
 * Webflow site webhooks (Data API v2). Each request carries `x-webflow-timestamp` (Unix epoch, milliseconds)
 * and `x-webflow-signature` = hex HMAC-SHA256 of `${timestamp}:${body}` keyed with the webhook's secret.
 * Requests older than 5 minutes are treated as replays.
 * Source: https://developers.webflow.com/data/docs/working-with-webhooks#validating-request-signatures
 */
export const WEBFLOW_TOLERANCE_MS = 5 * 60_000;

/** Events that carry a CMS item we can score. */
export const WEBFLOW_ITEM_EVENTS = ['collection_item_created', 'collection_item_changed', 'collection_item_published'] as const;

export type WebflowSignatureResult = 'ok' | 'missing' | 'stale' | 'invalid';

/** Timestamps are documented in milliseconds; accept seconds too, in case a sender uses them. */
function toMs(ts: string): number {
  if (!/^\d{9,14}$/.test(ts.trim())) return NaN;
  const n = Number(ts);
  return n < 1e12 ? n * 1000 : n;
}

function hmacHex(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest();
}

/**
 * Verify a Webflow webhook. `rawBody` is the request body exactly as received. Webflow's reference code signs
 * `JSON.stringify(body)`, which equals the raw body for compact JSON; the re-serialised form is tried as a fallback.
 */
export function verifyWebflowSignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string, nowMs = Date.now(), toleranceMs = WEBFLOW_TOLERANCE_MS): WebflowSignatureResult {
  if (!timestamp || !signature || !secret) return 'missing';
  const t = toMs(timestamp);
  if (!Number.isFinite(t)) return 'invalid';
  const got = /^[0-9a-f]{64}$/i.test(signature.trim()) ? Buffer.from(signature.trim(), 'hex') : null;
  if (!got) return 'invalid';
  const bodies = [rawBody];
  try {
    const re = JSON.stringify(JSON.parse(rawBody));
    if (re !== rawBody) bodies.push(re);
  } catch { /* not JSON: only the raw form can match */ }
  const match = bodies.some((b) => {
    const expected = hmacHex(secret, `${timestamp.trim()}:${b}`);
    return expected.length === got.length && timingSafeEqual(expected, got);
  });
  if (!match) return 'invalid';
  // Check age after the signature so a forged timestamp cannot be used to probe the clock window.
  if (Math.abs(nowMs - t) > toleranceMs) return 'stale';
  return 'ok';
}

export interface WebflowItem {
  id: string; collectionId: string; siteId?: string; isDraft?: boolean; isArchived?: boolean;
  fieldData: Record<string, unknown>;
}

export interface WebflowEvent { triggerType: string; item: WebflowItem | null }

/** Parse a webhook body into its trigger and (for item events) the CMS item. Returns null when it is not a Webflow event. */
export function parseWebflowEvent(body: unknown): WebflowEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { triggerType?: unknown; payload?: unknown };
  if (typeof b.triggerType !== 'string') return null;
  const p = b.payload as Partial<WebflowItem> | undefined;
  const isItem = (WEBFLOW_ITEM_EVENTS as readonly string[]).includes(b.triggerType);
  if (!isItem) return { triggerType: b.triggerType, item: null };
  if (!p || typeof p !== 'object' || !p.fieldData || typeof p.fieldData !== 'object') return { triggerType: b.triggerType, item: null };
  return {
    triggerType: b.triggerType,
    item: {
      id: String(p.id ?? ''), collectionId: String(p.collectionId ?? ''), siteId: p.siteId ? String(p.siteId) : undefined,
      isDraft: Boolean(p.isDraft), isArchived: Boolean(p.isArchived), fieldData: p.fieldData as Record<string, unknown>,
    },
  };
}

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);

export interface WebflowMapping {
  /** Field slug of the rich-text body, e.g. `post-body`. */
  bodyField: string;
  /** Optional field slug used as the meta description, e.g. `post-summary`. */
  metaField?: string | null;
  /** Human collection name; becomes the template and the batch name. Falls back to the collection id. */
  collectionName?: string | null;
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * Map a Webflow CMS item to a gate page: name → title and H1, slug → `/<collection>/<slug>`,
 * the chosen rich-text field → body, the optional summary field → meta description, collection → template.
 * When the chosen body field is missing the longest text field is used, with a note.
 */
export function webflowItemToPage(item: WebflowItem, m: WebflowMapping): { page: RawPage; template: string; notes: string[] } {
  const f = item.fieldData;
  const notes: string[] = [];
  const template = (m.collectionName ?? '').trim() || `collection-${item.collectionId.slice(-6) || 'unknown'}`;
  let body = text(f[m.bodyField]);
  if (!body) {
    const longest = Object.entries(f).filter(([k, v]) => typeof v === 'string' && !['name', 'slug'].includes(k)).sort((a, b) => (b[1] as string).length - (a[1] as string).length)[0];
    if (longest) { body = longest[1] as string; notes.push(`Field “${m.bodyField}” was empty or missing, so “${longest[0]}” was scored as the body.`); }
    else notes.push(`Field “${m.bodyField}” was empty or missing, and the item has no other text field.`);
  }
  const name = text(f.name);
  const slug = text(f.slug) || slugify(name);
  return {
    template,
    notes,
    page: {
      slug: `${slugify(template) || 'cms'}/${slug || item.id}`,
      title: name,
      h1: name,
      body,
      meta_description: m.metaField ? text(f[m.metaField]) : '',
      template,
    },
  };
}
