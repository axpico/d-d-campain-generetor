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

export async function chat(s: LlmSettings, messages: ChatMessage[], opts: { maxTokens?: number; json?: boolean; signal?: AbortSignal } = {}): Promise<string> {
  const base = s.baseUrl.replace(/\/+$/, '');
  const maxTokens = opts.maxTokens ?? 4000;

  if (s.provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const url = `${base}/messages`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: opts.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: s.model,
          max_tokens: maxTokens,
          temperature: s.temperature,
          system: system || undefined,
          messages: messages.filter((m) => m.role !== 'system'),
        }),
      });
    } catch (e) {
      throw explainFetchError(e, url);
    }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    return (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  }

  const url = `${base}/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`;
  if (s.provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'D&D Campaign Generator';
  }
  const body: Record<string, unknown> = { model: s.model, messages, temperature: s.temperature, max_tokens: maxTokens };
  // JSON mode is widely but not universally supported; the prompt asks for JSON anyway.
  if (opts.json && ['openai', 'groq', 'openrouter'].includes(s.provider)) body.response_format = { type: 'json_object' };
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    throw explainFetchError(e, url);
  }
  if (!res.ok) {
    const text = await res.text();
    // Retry once without response_format if the model rejects it.
    if (body.response_format && res.status === 400 && /response_format|json/i.test(text)) {
      delete body.response_format;
      const retry = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
      if (retry.ok) return (await retry.json()).choices?.[0]?.message?.content ?? '';
    }
    throw new Error(`${LLM_PROVIDERS[s.provider].label} ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
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
