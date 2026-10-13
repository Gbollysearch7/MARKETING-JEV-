import { choiceConfidence, scoreConfidence } from './confidence';
import type {
  Answer, ChoiceQuestion, Question, Questions, ScoreQuestion, State, SystemOneRequest, SystemOneResponse,
} from './types';

export const DEFAULT_MODEL = 'jev-1.13.0';
export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';

export interface DecideInput {
  state: State;
  questions: Questions;
}

export interface DecideResult extends SystemOneResponse {
  latencyMs: number;
}

/**
 * The one interface the platform depends on (PRD section 12, provider abstraction).
 * Implementations: TypeSafe Jev (live) and a deterministic mock. OpenAI Decisions slots in here later
 * without changing the request format.
 */
export interface DecisionProvider {
  readonly name: 'typesafe' | 'mock';
  readonly model: string;
  decide(input: DecideInput): Promise<DecideResult>;
}

export class DecisionApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Decision API ${status}: ${body.slice(0, 300)}`);
    this.name = 'DecisionApiError';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function backoffMs(attempt: number): number {
  const base = Math.min(8000, 300 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

export interface TypeSafeOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class TypeSafeProvider implements DecisionProvider {
  readonly name = 'typesafe' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TypeSafeOptions) {
    if (!opts.apiKey) throw new Error('TYPESAFE_API_KEY is not set.');
    this.model = opts.model ?? DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.maxRetries = opts.maxRetries ?? 5;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async decide(input: DecideInput): Promise<DecideResult> {
    const body: SystemOneRequest = { model: this.model, state: input.state, questions: input.questions };
    const payload = JSON.stringify(body);
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await sleep(backoffMs(attempt));
        continue;
      }
      if (res.ok) {
        const json = (await res.json()) as SystemOneResponse;
        return { ...json, latencyMs: Date.now() - started };
      }
      const text = await res.text();
      const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        continue;
      }
      throw new DecisionApiError(res.status, text);
    }
  }
}

/** FNV-1a 32-bit hash mapped to [0, 1). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function normalise(raw: number[]): number[] {
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const out = raw.map((x) => round3(x / total));
  const drift = round3(1 - out.reduce((a, b) => a + b, 0));
  let maxI = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[maxI]) maxI = i;
  out[maxI] = round3(out[maxI] + drift);
  return out;
}

export function choiceFromWeights(options: string[], weights: number[]): Answer {
  const probs = normalise(weights.map((w) => Math.max(w, 0.001)));
  let maxI = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[maxI]) maxI = i;
  const probabilities: Record<string, number> = {};
  options.forEach((o, i) => (probabilities[o] = probs[i]));
  return { type: 'choice', choice: options[maxI], probabilities, confidence: round3(choiceConfidence(probs)) };
}

/** Lets a caller script realistic mock answers for specific questions. */
export type MockAnswerer = (key: string, question: Question, state: State) => Answer | undefined;

/**
 * Deterministic offline stand-in. Same state and question give the same answer every time.
 * Used in tests and whenever no TYPESAFE_API_KEY is set. Every screen says when it is in use.
 */
export class MockProvider implements DecisionProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock';
  constructor(private readonly answerer: MockAnswerer = () => undefined) {}

  async decide(input: DecideInput): Promise<DecideResult> {
    const stateJson = JSON.stringify(input.state);
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(input.questions)) {
      answers[key] = this.answerer(key, q, input.state) ?? hashAnswer(stateJson, key, q);
    }
    const inputTokens = Math.ceil((stateJson.length + JSON.stringify(input.questions).length) / 4);
    return { model: this.model, answers, usage: { input_tokens: inputTokens, output_tokens: 0 }, latencyMs: 0 };
  }
}

function hashAnswer(stateJson: string, key: string, q: Question): Answer {
  const seed = `${stateJson}|${key}|${JSON.stringify(q.instructions)}`;
  switch (q.type) {
    case 'noul':
      return { type: 'noul', noul: round3(hash01(seed)) };
    case 'choice': {
      const options = Object.keys((q as ChoiceQuestion).criteria);
      return choiceFromWeights(options, options.map((o) => hash01(`${seed}|${o}`) ** 2 + 0.02));
    }
    case 'score': {
      const levels = (q as ScoreQuestion).criteria;
      const probs = normalise(levels.map((_l, i) => hash01(`${seed}|${i}`) ** 2 + 0.02));
      const probabilities: Record<string, number> = {};
      const legend: Record<string, ScoreQuestion['criteria'][number]> = {};
      levels.forEach((l, i) => {
        probabilities[String(i)] = probs[i];
        legend[String(i)] = l;
      });
      const score = round3(probs.reduce((s, pr, i) => s + pr * i, 0));
      return { type: 'score', score, legend, probabilities, confidence: round3(scoreConfidence(probs)) };
    }
  }
}
