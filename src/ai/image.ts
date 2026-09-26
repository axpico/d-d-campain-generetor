// Image generation across providers. Results are stored in IndexedDB and referenced by id.
import { dataUrlToBlob, imagesDb, loadSetting, saveSetting, type StoredImage } from '../lib/storage';
import { uid } from '../lib/rng';
import { isLocal } from './llm';
import type { Campaign, Faction, Location, Npc, Villain } from '../lib/types';

export type ImageProviderId = 'pollinations' | 'openai' | 'openrouter' | 'a1111' | 'comfyui';

export interface ImageSettings {
  provider: ImageProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  size: number;
  checkpoint: string; // ComfyUI only
  negative: string;
}

export const IMAGE_PROVIDERS: Record<ImageProviderId, { label: string; baseUrl: string; model: string; needsKey: boolean; note: string }> = {
  pollinations: {
    label: 'Pollinations.ai (free)', baseUrl: 'https://image.pollinations.ai/prompt', model: 'flux', needsKey: false,
    note: 'Free, no key. Can be slow or rate-limited. Images are stored as URLs, so they stay regenerable from the same seed.',
  },
  openai: {
    label: 'OpenAI-compatible /images', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', needsKey: true,
    note: 'Any server exposing /images/generations (OpenAI, Together, etc.). Paid per image.',
  },
  openrouter: {
    label: 'OpenRouter image models', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash-image', needsKey: true,
    note: 'Uses chat completions with image output. Only some models support it — check "output modalities: image" on OpenRouter.',
  },
  a1111: {
    label: 'Stable Diffusion WebUI (A1111 / Forge)', baseUrl: 'http://127.0.0.1:7860', model: '', needsKey: false,
    note: 'Launch with --api --cors-allow-origins=<this site\'s origin>. Uses the currently loaded checkpoint.',
  },
  comfyui: {
    label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188', model: '', needsKey: false,
    note: 'Launch with --enable-cors-header. Uses a basic txt2img workflow with the checkpoint named below.',
  },
};

const KEY = 'image-settings';
export const DEFAULT_IMAGE: ImageSettings = {
  provider: 'pollinations', baseUrl: IMAGE_PROVIDERS.pollinations.baseUrl, apiKey: '', model: 'flux', size: 768,
  checkpoint: 'sd_xl_base_1.0.safetensors', negative: 'text, watermark, signature, blurry, deformed, extra fingers, lowres',
};
export const loadImageSettings = () => loadSetting(KEY, DEFAULT_IMAGE);
export const saveImageSettings = (s: ImageSettings) => saveSetting(KEY, s);

function netError(e: unknown, url: string) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return new Error(isLocal(url) && location.protocol === 'https:'
      ? `Could not reach ${url}: an HTTPS page usually can't call a local http:// server. Run the app locally (npm run dev) and enable CORS on the server.`
      : `Network/CORS error calling ${url}.`);
  }
  return e instanceof Error ? e : new Error(msg);
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw netError(e, url);
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

function b64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function generateImage(s: ImageSettings, prompt: string, opts: { wide?: boolean } = {}): Promise<StoredImage> {
  const base = s.baseUrl.replace(/\/+$/, '');
  const w = opts.wide ? Math.round((s.size * 4) / 3 / 64) * 64 : s.size;
  const h = s.size;
  const img: StoredImage = { id: uid(), prompt, provider: s.provider, createdAt: Date.now() };

  switch (s.provider) {
    case 'pollinations': {
      const seed = Math.floor(Math.random() * 1e9);
      const url = `${base}/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true${s.model ? `&model=${encodeURIComponent(s.model)}` : ''}`;
      // Preload so the caller only gets the image once it actually exists.
      await new Promise<void>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('Pollinations did not return an image (rate limit or outage). Try again in a moment.'));
        el.src = url;
      });
      img.url = url;
      break;
    }
    case 'openai': {
      const size = opts.wide ? '1536x1024' : '1024x1024';
      const body: Record<string, unknown> = { model: s.model, prompt, n: 1, size };
      if (/dall-e/.test(s.model)) {
        body.response_format = 'b64_json';
        if (opts.wide) body.size = s.model === 'dall-e-3' ? '1792x1024' : '1024x1024';
      }
      const data = await post(`${base}/images/generations`, body, s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {});
      const d = data.data?.[0];
      if (d?.b64_json) img.blob = b64ToBlob(d.b64_json);
      else if (d?.url) img.url = d.url;
      else throw new Error('No image in response.');
      break;
    }
    case 'openrouter': {
      const data = await post(`${base}/chat/completions`, {
        model: s.model,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: `Generate an image${opts.wide ? ' in landscape format' : ''}: ${prompt}` }],
      }, { authorization: `Bearer ${s.apiKey}`, 'HTTP-Referer': location.origin, 'X-Title': 'D&D Campaign Generator' });
      const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error('This model returned no image. Pick a model with image output (e.g. a Gemini image model).');
      if (url.startsWith('data:')) img.blob = await dataUrlToBlob(url);
      else img.url = url;
      break;
    }
    case 'a1111': {
      const data = await post(`${base}/sdapi/v1/txt2img`, {
        prompt, negative_prompt: s.negative, width: w, height: h, steps: 28, cfg_scale: 6.5, sampler_name: 'DPM++ 2M',
      });
      if (!data.images?.[0]) throw new Error('No image in response.');
      img.blob = b64ToBlob(data.images[0]);
      break;
    }
    case 'comfyui': {
      img.blob = await comfy(base, s, prompt, w, h);
      break;
    }
  }
  await imagesDb.put(img);
  return img;
}

async function comfy(base: string, s: ImageSettings, prompt: string, w: number, h: number): Promise<Blob> {
  const workflow = {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: s.checkpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: s.negative, clip: ['4', 1] } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 1e12), steps: 25, cfg: 6.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'dnd', images: ['8', 0] } },
  };
  const { prompt_id } = await post(`${base}/prompt`, { prompt: workflow, client_id: 'dnd-gen' });
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const hist = await (await fetch(`${base}/history/${prompt_id}`)).json();
    const out = hist[prompt_id]?.outputs?.['9']?.images?.[0];
    if (out) {
      const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder ?? '', type: out.type ?? 'output' });
      return (await fetch(`${base}/view?${q}`)).blob();
    }
    if (hist[prompt_id]?.status?.status_str === 'error') throw new Error('ComfyUI reported an error. Check the checkpoint name.');
  }
  throw new Error('ComfyUI timed out after 5 minutes.');
}

// ---------- Prompt builders ----------


const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').slice(0, 300);

export function npcPrompt(n: Npc, style: string) {
  return `Fantasy character portrait, ${n.species.toLowerCase()} ${n.role}, ${n.appearance}, ${n.personality} expression. ${clean(n.description)} Head and shoulders, ${style}`;
}

export function villainPrompt(v: Villain, style: string) {
  return `Menacing fantasy villain portrait, ${v.species.toLowerCase()} ${v.archetype}, ${v.appearance}. ${clean(v.description)} Dramatic, imposing, ${style}`;
}

export function factionPrompt(f: Faction, style: string) {
  return `Heraldic emblem of a fantasy ${f.kind}: ${f.symbol}. Banner or crest design, centered, ${style}`;
}

export function locationPrompt(l: Location, style: string) {
  return `Fantasy landscape, ${l.kind} in ${l.terrain}: ${l.summary}. Featuring ${l.features.join(' and ')}. ${clean(l.description)} Wide establishing shot, ${style}`;
}

export function regionMapPrompt(c: Campaign, style: string) {
  const names = c.locations.slice(0, 6).map((l) => `${l.kind} in the ${l.terrain}`).join(', ');
  return `Hand-drawn fantasy world map of a region called ${c.region.name}, parchment, compass rose, mountains, forests, rivers, coastlines, ${names}. Top-down cartography, no readable text, ${style}`;
}

export function locationMapPrompt(l: Location, style: string) {
  if (l.dungeon) return `Top-down fantasy dungeon battle map of ${l.dungeon.theme}, stone rooms and corridors, grid, ${l.features.join(', ')}. No text, ${style}`;
  return `Top-down illustrated fantasy ${l.kind} map, roads, rooftops, ${l.terrain} surroundings, ${l.features.join(', ')}. No text, ${style}`;
}
