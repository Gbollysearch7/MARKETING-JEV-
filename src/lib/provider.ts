import 'server-only';
import { DEFAULT_MODEL, MockProvider, TypeSafeProvider, type DecisionProvider } from '@/engine/jev/client';
import { mockVerdictAnswer } from '@/engine/verdict/mock-verdict';

export function providerInfo(): { live: boolean; model: string; baseUrl: string } {
  return {
    live: Boolean(process.env.TYPESAFE_API_KEY),
    model: process.env.JEV_MODEL || DEFAULT_MODEL,
    baseUrl: process.env.JEV_BASE_URL || 'https://api.typesafe.ai',
  };
}

/** Live Jev when TYPESAFE_API_KEY is set, otherwise the labelled offline mock. */
export function getProvider(): DecisionProvider {
  const key = process.env.TYPESAFE_API_KEY;
  if (key) return new TypeSafeProvider({ apiKey: key, model: process.env.JEV_MODEL || DEFAULT_MODEL, baseUrl: process.env.JEV_BASE_URL || undefined });
  return new MockProvider(mockVerdictAnswer);
}
