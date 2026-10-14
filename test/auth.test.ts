import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, verifyStripeSignature } from '../src/lib/crypto';
import { accountStatus } from '../src/lib/plans';

describe('passwords', () => {
  it('verifies the right password and rejects others', () => {
    const h = hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('anything', 'scrypt$00$00')).toBe(false);
  });
  it('salts every hash', () => expect(hashPassword('same')).not.toBe(hashPassword('same')));
});

describe('stripe webhook signatures', () => {
  const secret = 'whsec_test';
  const payload = '{"type":"checkout.session.completed"}';
  const sign = (t: number, body = payload, key = secret) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${body}`).digest('hex')}`;
  const now = 1_800_000_000;
  it('accepts a fresh, correct signature', () => expect(verifyStripeSignature(payload, sign(now), secret, 300, now)).toBe(true));
  it('rejects a tampered payload', () => expect(verifyStripeSignature(payload + ' ', sign(now), secret, 300, now)).toBe(false));
  it('rejects the wrong secret', () => expect(verifyStripeSignature(payload, sign(now, payload, 'other'), secret, 300, now)).toBe(false));
  it('rejects an old event (replay)', () => expect(verifyStripeSignature(payload, sign(now - 600), secret, 300, now)).toBe(false));
  it('rejects a missing header', () => expect(verifyStripeSignature(payload, null, secret, 300, now)).toBe(false));
});

describe('plans', () => {
  const day = 86_400_000;
  it('a fresh trial is active with 1,000 URLs', () => {
    const s = accountStatus({ plan: 'trial', trial_ends_at: new Date(Date.now() + 14 * day).toISOString(), subscription_status: null });
    expect(s).toMatchObject({ active: true, onTrial: true, urlLimit: 1000, trialDaysLeft: 14 });
  });
  it('an expired trial is inactive', () => {
    expect(accountStatus({ plan: 'trial', trial_ends_at: new Date(Date.now() - day).toISOString(), subscription_status: null }).active).toBe(false);
  });
  it('a paid plan needs an active subscription', () => {
    const past = new Date(Date.now() - day).toISOString();
    expect(accountStatus({ plan: 'growth', trial_ends_at: past, subscription_status: 'active' })).toMatchObject({ active: true, urlLimit: 50000 });
    expect(accountStatus({ plan: 'growth', trial_ends_at: past, subscription_status: 'canceled' }).active).toBe(false);
  });
});
