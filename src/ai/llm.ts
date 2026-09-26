// Text generation across providers. Everything except Anthropic speaks the OpenAI
// chat-completions format, so one client covers OpenRouter, Groq, OpenAI, Ollama, LM Studio and custom servers.
import { loadSetting, saveSetting } from '../lib/storage';

export type LlmProviderId = 'openrouter' | 'anthropic' | 'groq' | 'openai' | 'ollama' | 'lmstudio' | 'custom';

export interface LlmSettings {
  enabled: boolean;
  provider: LlmProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export const LLM_PROVIDERS: Record<LlmProviderId, { label: string; baseUrl: string; model: string; needsKey: boolean; note?: string }> = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-5', needsKey: true, note: 'One key, hundreds of models. Use "Load models" to browse them.' },
  anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5', needsKey: true, note: 'Called directly from the browser (uses the anthropic-dangerous-direct-browser-access header).' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true, note: 'Very fast. Free tier has tight rate limits — expanding a long campaign may hit them.' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', needsKey: true },
  ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false, note: 'Start Ollama with OLLAMA_ORIGINS="*" (or your site origin) so the browser may call it.' },
  lmstudio: { label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', model: 'local-model', needsKey: false, note: 'Enable CORS in LM Studio\'s server settings.' },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', needsKey: false, note: 'Any server exposing /chat/completions: vLLM, llama.cpp, Together, Mistral, DeepSeek…' },
};

const KEY = 'llm-settings';
export const DEFAULT_LLM: LlmSettings = {
  enabled: false, provider: 'openrouter', baseUrl: LLM_PROVIDERS.openrouter.baseUrl, apiKey: '', model: LLM_PROVIDERS.openrouter.model, temperature: 0.9,
};
export const loadLlm = () => loadSetting(KEY, DEFAULT_LLM);
export const saveLlm = (s: LlmSettings) => saveSetting(KEY, s);

export function isLocal(url: string) {
  return /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(url);
}

function explainFetchError(err: unknown, url: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    if (isLocal(url) && location.protocol === 'https:') {
      return new Error(`Could not reach ${url}. This page is served over HTTPS and your browser may block calls to a local http:// server (mixed content / private network access). Run the app locally (npm run dev) or allow insecure content for this site, and make sure CORS is enabled on the server.`);
    }
    return new Error(`Network/CORS error calling ${url}. Check the base URL, that the server is running, and that it allows browser (CORS) requests.`);
  }
  return err instanceof Error ? err : new Error(msg);
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatOpts {
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called with each streamed chunk of text. When set, the request streams (falls back to non-streaming if unsupported). */
  onDelta?: (chunk: string) => void;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

/** Remove chain-of-thought blocks some reasoning models put inline. */
export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** Read an SSE stream, calling onData for every `data:` payload. */
async function readSse(res: Response, onData: (data: string) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  }
}

async function once(s: LlmSettings, messages: ChatMessage[], opts: ChatOpts): Promise<string> {
  const base = s.baseUrl.replace(/\/+$/, '');
  const maxTokens = opts.maxTokens ?? 4000;
  const stream = !!opts.onDelta;
  const anthropic = s.provider === 'anthropic';

  const url = anthropic ? `${base}/messages` : `${base}/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: Record<string, unknown>;
  if (anthropic) {
    headers['x-api-key'] = s.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    body = { model: s.model, max_tokens: maxTokens, temperature: s.temperature, system: system || undefined, messages: messages.filter((m) => m.role !== 'system'), stream };
  } else {
    if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`;
    if (s.provider === 'openrouter') {
      headers['HTTP-Referer'] = location.origin;
      headers['X-Title'] = 'D&D Campaign Generator';
    }
    body = { model: s.model, messages, temperature: s.temperature, max_tokens: maxTokens, stream };
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw explainFetchError(e, url);
  }
  if (!res.ok) {
    const text = await res.text();
    const ra = Number(res.headers.get('retry-after'));
    throw new HttpError(res.status, `${LLM_PROVIDERS[s.provider].label} ${res.status}: ${text.slice(0, 300)}`, ra > 0 ? ra * 1000 : undefined);
  }

  let out = '';
  let finish = '';
  let reasoning = '';
  const isSse = (res.headers.get('content-type') ?? '').includes('event-stream');
  if (stream && isSse && res.body) {
    await readSse(res, (data) => {
      if (data === '[DONE]') return;
      let j: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(data); } catch { return; }
      if (j.error) throw new Error(j.error.message ?? JSON.stringify(j.error));
      const chunk: string = anthropic
        ? (j.type === 'content_block_delta' ? j.delta?.text ?? '' : '')
        : j.choices?.[0]?.delta?.content ?? '';
      if (!anthropic) {
        reasoning += j.choices?.[0]?.delta?.reasoning ?? '';
        finish = j.choices?.[0]?.finish_reason ?? finish;
      } else if (j.type === 'message_delta') finish = j.delta?.stop_reason ?? finish;
      if (chunk) { out += chunk; opts.onDelta!(chunk); }
    });
  } else {
    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
    if (anthropic) {
      out = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
      finish = data.stop_reason ?? '';
    } else {
      out = data.choices?.[0]?.message?.content ?? '';
      reasoning = data.choices?.[0]?.message?.reasoning ?? '';
      finish = data.choices?.[0]?.finish_reason ?? '';
    }
    if (opts.onDelta && out) opts.onDelta(out);
  }

  out = stripThink(out);
  if (!out) {
    if (reasoning && /length|max_tokens/.test(finish)) {
      throw new HttpError(0, 'The model spent its whole output budget "thinking" and wrote no answer. Try a non-reasoning model, or it will be retried.');
    }
    throw new HttpError(0, 'The model returned an empty reply.');
  }
  return out;
}

/**
 * Chat completion with retries on rate limits, server errors and empty replies —
 * all common on free OpenRouter models.
 */
export async function chat(s: LlmSettings, messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await once(s, messages, opts);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      const status = e instanceof HttpError ? e.status : -1;
      const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt === 3) break;
      const wait = (e as HttpError).retryAfter ?? Math.min(20000, 2000 * 2 ** attempt);
      opts.onDelta?.(`\n[retrying in ${Math.round(wait / 1000)}s: ${(e as Error).message.slice(0, 80)}]\n`);
      await sleep(wait, opts.signal);
    }
  }
  throw lastErr;
}

/**
 * Parse the labelled-block format used instead of JSON (far more robust with small/free models):
 *   @@ key
 *   free text…
 * Also tolerates "### @@key", "**@@ key**" and a JSON object reply as a fallback.
 */
export function parseBlocks(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^[#*\s>]*@@\s*([\w:.-]+)\**\s*:?\s*$/gm;
  const marks: { key: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push({ key: m[1], start: m.index, end: m.index + m[0].length });
  marks.forEach((mk, i) => {
    const body = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim();
    if (body) out[mk.key] = body.replace(/^```\w*\n?|```$/g, '').trim();
  });
  if (!marks.length) {
    try {
      const j = parseJsonLoose<Record<string, unknown>>(text);
      const flat = (o: Record<string, unknown>, prefix = '') => {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'string') out[prefix + k] = v;
          else if (v && typeof v === 'object') flat(v as Record<string, unknown>, '');
        }
      };
      flat(j);
    } catch { /* no blocks, no JSON: caller treats as missing */ }
  }
  return out;
}

export async function listModels(s: LlmSettings): Promise<string[]> {
  const base = s.baseUrl.replace(/\/+$/, '');
  const url = `${base}/models`;
  const headers: Record<string, string> = {};
  if (s.provider === 'anthropic') {
    headers['x-api-key'] = s.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`;
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    throw explainFetchError(e, url);
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const list: { id: string }[] = data.data ?? data.models ?? [];
  return list.map((m) => m.id).sort();
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The model did not return JSON.');
  return JSON.parse(src.slice(start, end + 1));
}
