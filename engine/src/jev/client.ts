import { choiceConfidence, scoreConfidence } from './confidence.js';
import type {
  Answer, ChoiceQuestion, Question, Questions, ScoreQuestion, State, SystemOneRequest, SystemOneResponse,
} from './types.js';

export const DEFAULT_MODEL = 'jev-1.13.0';
export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';

export interface DecideInput {
  state: State;
  questions: Questions;
  model?: string;
}

/**
 * The one interface the rest of the engine depends on.
 * Implementations: TypeSafeClient (live), MockClient (offline, deterministic).
 * Swap the base URL to route through a gateway that speaks the same contract.
 */
export interface DecisionClient {
  readonly model: string;
  decide(input: DecideInput): Promise<SystemOneResponse>;
}

export class TypeSafeApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`TypeSafe API ${status}: ${body.slice(0, 300)}`);
    this.name = 'TypeSafeApiError';
  }
}

export interface TypeSafeClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Optional sleep override for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number): number {
  const base = Math.min(8000, 300 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

export class TypeSafeClient implements DecisionClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: TypeSafeClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('TYPESAFE_API_KEY is not set. Set it, or use JEV_MOCK=1 / MockClient for offline runs.');
    }
    this.model = opts.model ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? process.env.JEV_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.maxRetries = opts.maxRetries ?? 5;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleepImpl ?? defaultSleep;
  }

  async decide(input: DecideInput): Promise<SystemOneResponse> {
    const body: SystemOneRequest = {
      model: input.model ?? this.model,
      state: input.state,
      questions: input.questions,
    };
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: payload,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await this.sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return (await res.json()) as SystemOneResponse;

      const text = await res.text();
      const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        continue;
      }
      throw new TypeSafeApiError(res.status, text);
    }
  }
}

/** FNV-1a 32-bit hash mapped to [0, 1). Deterministic, dependency free. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function normalise(raw: number[]): number[] {
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const out = raw.map((x) => round3(x / total));
  // Make them sum to exactly 1 after rounding.
  const drift = round3(1 - out.reduce((a, b) => a + b, 0));
  let maxI = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[maxI]) maxI = i;
  out[maxI] = round3(out[maxI] + drift);
  return out;
}

export type MockOverride = (key: string, question: Question, state: State) => Answer | undefined;

/**
 * Deterministic offline stand-in. Same state + question => same answer every time.
 * Use it to develop the pipeline, write tests and estimate token volume without a key.
 * Override specific questions to script scenarios.
 */
export class MockClient implements DecisionClient {
  readonly model = 'mock-jev';
  constructor(private readonly override: MockOverride = () => undefined) {}

  async decide(input: DecideInput): Promise<SystemOneResponse> {
    const stateJson = JSON.stringify(input.state);
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(input.questions)) {
      const scripted = this.override(key, q, input.state);
      answers[key] = scripted ?? mockAnswer(stateJson, key, q);
    }
    const inputTokens = Math.ceil((stateJson.length + JSON.stringify(input.questions).length) / 4);
    return { model: this.model, answers, usage: { input_tokens: inputTokens, output_tokens: 0 } };
  }
}

function mockAnswer(stateJson: string, key: string, q: Question): Answer {
  const seed = `${stateJson}|${key}|${JSON.stringify(q.instructions)}`;
  switch (q.type) {
    case 'noul':
      return { type: 'noul', noul: round3(hash01(seed)) };
    case 'choice': {
      const options = Object.keys((q as ChoiceQuestion).criteria);
      const probs = normalise(options.map((o) => hash01(`${seed}|${o}`) ** 2 + 0.02));
      let maxI = 0;
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[maxI]) maxI = i;
      const probabilities: Record<string, number> = {};
      options.forEach((o, i) => (probabilities[o] = probs[i]));
      return { type: 'choice', choice: options[maxI], probabilities, confidence: round3(choiceConfidence(probs)) };
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

export interface CreateClientOptions extends TypeSafeClientOptions {
  mock?: boolean;
}

/** Reads JEV_MOCK, TYPESAFE_API_KEY, JEV_MODEL and JEV_BASE_URL from the environment. */
export function createClient(opts: CreateClientOptions = {}): DecisionClient {
  if (opts.mock || process.env.JEV_MOCK === '1') return new MockClient();
  return new TypeSafeClient(opts);
}
