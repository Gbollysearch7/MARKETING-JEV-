import { applyStripeEvent, type StripeEvent } from '@/lib/billing';
import { verifyStripeSignature } from '@/lib/crypto';

/**
 * Stripe calls this after checkout and on every subscription change. Only signed, fresh events are applied
 * (Stripe signature scheme, 5 minute tolerance); replays of the same event id are acknowledged and skipped.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Billing is not configured', { status: 503 });
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret)) return new Response('Bad signature', { status: 400 });
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return new Response('Bad payload', { status: 400 });
  }
  if (!event || typeof event.type !== 'string' || !event.data || typeof event.data.object !== 'object') return new Response('Bad payload', { status: 400 });
  // A thrown error returns 500, so Stripe retries the event later.
  const result = applyStripeEvent(event);
  return Response.json({ received: true, result });
}
