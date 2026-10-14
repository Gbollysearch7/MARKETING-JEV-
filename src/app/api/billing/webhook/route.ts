import { applyStripeEvent } from '@/lib/billing';
import { verifyStripeSignature } from '@/lib/crypto';

/** Stripe calls this after checkout and on every subscription change. Only signed events are applied. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Billing is not configured', { status: 503 });
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret)) return new Response('Bad signature', { status: 400 });
  applyStripeEvent(JSON.parse(payload));
  return Response.json({ received: true });
}
