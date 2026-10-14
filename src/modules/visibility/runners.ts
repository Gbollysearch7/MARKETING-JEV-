/**
 * Live answer runners for the four engines with a public API. Plain fetch against each provider's REST
 * API, no SDKs. Each call has a timeout, retries on 429/5xx/network errors with backoff, and a token cap.
 *
 * These cannot be exercised in the build environment (no provider keys), so they are written against the
 * public API references and unit-tested only with a stubbed fetch. Models are overridable by env var.
 */
import type { Engine } from './types';

export type LiveEngine = 'chatgpt' | 'claude' | 'perplexity' | 'gemini';
export const LIVE_ENGINES: LiveEngine[] = ['chatgpt', 'claude', 'perplexity', 'gemini'];

export interface RunnerSpec { engine: LiveEngine; envKey: string; modelEnv: string; defaultModel: string; provider: string }

export const RUNNERS: Record<LiveEngine, RunnerSpec> = {
  chatgpt: { engine: 'chatgpt', envKey: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-4.1-mini', provider: 'OpenAI chat completions' },
  claude: { engine: 'claude', envKey: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', defaultModel: 'claude-opus-5-5', provider: 'Anthropic Messages API' },
  perplexity: { engine: 'perplexity', envKey: 'PERPLEXITY_API_KEY', modelEnv: 'PERPLEXITY_MODEL', defaultModel: 'sonar', provider: 'Perplexity chat completions' },
  gemini: { engine: 'gemini', envKey: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', defaultModel: 'gemini-2.5-flash', provider: 'Gemini generateContent with Google Search grounding' },
};

export const RUNS_PER_PROMPT = 3;
export const MAX_OUTPUT_TOKENS = 1200;

export interface RunResult { engine: Engine; model: string; text: string; citedUrls: string[] }

export class RunnerError extends Error {
  constructor(public readonly engine: LiveEngine, public readonly status: number, message: string) {
    super(`${engine}: ${message}`);
    this.name = 'RunnerError';
  }
}

export interface RunOptions { apiKey: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number; maxRetries?: number }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function postJson(engine: LiveEngine, url: string, headers: Record<string, string>, body: unknown, o: RunOptions): Promise<unknown> {
  const f = o.fetchImpl ?? fetch;
  const maxRetries = o.maxRetries ?? 2;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs ?? 60_000) });
    } catch (err) {
      if (attempt >= maxRetries) throw new RunnerError(engine, 0, err instanceof Error ? err.message : String(err));
      await sleep(800 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    const text = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 800 * 2 ** attempt);
      continue;
    }
    // Never echo request headers (they carry the key); the provider's error body is safe to show.
    throw new RunnerError(engine, res.status, `HTTP ${res.status} ${text}`);
  }
}

type Obj = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** OpenAI chat completions. URL citations come back as message annotations on search-enabled models. */
export async function runOpenAI(prompt: string, o: RunOptions): Promise<RunResult> {
  const model = o.model || RUNNERS.chatgpt.defaultModel;
  const json = obj(await postJson('chatgpt', 'https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${o.apiKey}` }, {
    model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: MAX_OUTPUT_TOKENS,
  }, o));
  const msg = obj(obj(arr(json.choices)[0]).message);
  const urls = arr(msg.annotations).map((a) => str(obj(obj(a).url_citation).url)).filter(Boolean);
  return { engine: 'chatgpt', model: str(json.model) || model, text: str(msg.content), citedUrls: urls };
}

/** Anthropic Messages API. Only text blocks are kept; a refusal is reported as an error. */
export async function runAnthropic(prompt: string, o: RunOptions): Promise<RunResult> {
  const model = o.model || RUNNERS.claude.defaultModel;
  const json = obj(await postJson('claude', 'https://api.anthropic.com/v1/messages', { 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' }, {
    model, max_tokens: MAX_OUTPUT_TOKENS, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }],
  }, o));
  if (json.stop_reason === 'refusal') throw new RunnerError('claude', 200, 'The model declined to answer this prompt.');
  const blocks = arr(json.content).map(obj);
  const text = blocks.filter((b) => b.type === 'text').map((b) => str(b.text)).join('\n');
  const urls = blocks.flatMap((b) => arr(b.citations).map((c) => str(obj(c).url))).filter(Boolean);
  return { engine: 'claude', model: str(json.model) || model, text, citedUrls: urls };
}

/** Perplexity chat completions. Sources come back as `citations` (URLs) and/or `search_results`. */
export async function runPerplexity(prompt: string, o: RunOptions): Promise<RunResult> {
  const model = o.model || RUNNERS.perplexity.defaultModel;
  const json = obj(await postJson('perplexity', 'https://api.perplexity.ai/chat/completions', { authorization: `Bearer ${o.apiKey}` }, {
    model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_OUTPUT_TOKENS,
  }, o));
  const text = str(obj(obj(arr(json.choices)[0]).message).content);
  const urls = [...arr(json.citations).map(str), ...arr(json.search_results).map((r) => str(obj(r).url))].filter(Boolean);
  return { engine: 'perplexity', model: str(json.model) || model, text, citedUrls: [...new Set(urls)] };
}

/**
 * Gemini generateContent with Google Search grounding. Grounding chunk URIs are Google redirect links,
 * so when a chunk's title is a bare domain we record that domain instead, which is what source typing needs.
 */
export async function runGemini(prompt: string, o: RunOptions): Promise<RunResult> {
  const model = o.model || RUNNERS.gemini.defaultModel;
  const json = obj(await postJson('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': o.apiKey }, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  }, o));
  const cand = obj(arr(json.candidates)[0]);
  const text = arr(obj(cand.content).parts).map((p) => str(obj(p).text)).join('');
  const urls = arr(obj(cand.groundingMetadata).groundingChunks).map((c) => {
    const web = obj(obj(c).web);
    const title = str(web.title);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title) ? `https://${title}` : str(web.uri);
  }).filter(Boolean);
  return { engine: 'gemini', model: str(json.modelVersion) || model, text, citedUrls: [...new Set(urls)] };
}

export function runEngine(engine: LiveEngine, prompt: string, o: RunOptions): Promise<RunResult> {
  switch (engine) {
    case 'chatgpt': return runOpenAI(prompt, o);
    case 'claude': return runAnthropic(prompt, o);
    case 'perplexity': return runPerplexity(prompt, o);
    case 'gemini': return runGemini(prompt, o);
  }
}
