import { useState } from 'react';
import { chat, isLocal, listModels, LLM_PROVIDERS, type LlmProviderId, type LlmSettings } from '../ai/llm';
import { generateImage, IMAGE_PROVIDERS, type ImageProviderId, type ImageSettings } from '../ai/image';
import { useImageUrl } from './ImageSlot';

export function Settings({ llm, img, onLlm, onImg }: {
  llm: LlmSettings; img: ImageSettings; onLlm: (s: LlmSettings) => void; onImg: (s: ImageSettings) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [llmStatus, setLlmStatus] = useState<string>();
  const [imgStatus, setImgStatus] = useState<string>();
  const [testImg, setTestImg] = useState<string>();
  const testUrl = useImageUrl(testImg);
  const lp = LLM_PROVIDERS[llm.provider];
  const ip = IMAGE_PROVIDERS[img.provider];
  const httpsLocal = (url: string) => location.protocol === 'https:' && isLocal(url);

  return (
    <div className="settings">
      <section className="card">
        <h2>✨ Text AI</h2>
        <p className="muted">Used to expand the table-generated skeleton into connected prose. Keys are stored only in this browser (localStorage) and sent only to the provider you pick. Anyone with access to this browser profile can read them.</p>
        <label className="check">
          <input type="checkbox" checked={llm.enabled} onChange={(e) => onLlm({ ...llm, enabled: e.target.checked })} />
          <span>Enable AI text</span>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Provider</span>
            <select value={llm.provider} onChange={(e) => {
              const p = e.target.value as LlmProviderId;
              setModels([]);
              onLlm({ ...llm, provider: p, baseUrl: LLM_PROVIDERS[p].baseUrl, model: LLM_PROVIDERS[p].model });
            }}>
              {Object.entries(LLM_PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Base URL</span>
            <input value={llm.baseUrl} onChange={(e) => onLlm({ ...llm, baseUrl: e.target.value })} placeholder="https://…/v1" />
          </label>
          <label className="field">
            <span>API key {!lp.needsKey && <span className="muted">(optional)</span>}</span>
            <input type="password" autoComplete="off" value={llm.apiKey} onChange={(e) => onLlm({ ...llm, apiKey: e.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <div className="input-row">
              <input value={llm.model} onChange={(e) => onLlm({ ...llm, model: e.target.value })} list="model-list" />
              <button className="btn ghost" onClick={async () => {
                setLlmStatus('Loading models…');
                try { const m = await listModels(llm); setModels(m); setLlmStatus(`${m.length} models loaded, pick one from the dropdown.`); } catch (e) { setLlmStatus(`✗ ${(e as Error).message}`); }
              }}>Load models</button>
            </div>
            <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field">
            <span>Creativity (temperature): {llm.temperature.toFixed(1)}</span>
            <input type="range" min={0} max={1.5} step={0.1} value={llm.temperature} onChange={(e) => onLlm({ ...llm, temperature: +e.target.value })} />
          </label>
        </div>
        {lp.note && <p className="note">ℹ {lp.note}</p>}
        {httpsLocal(llm.baseUrl) && <p className="note warn">⚠ This page is on HTTPS and the provider is a local http:// address. Most browsers block that. Run the app locally with <code>npm run dev</code> to use local models.</p>}
        <div className="form-actions">
          <button className="btn" onClick={async () => {
            setLlmStatus('Testing…');
            try {
              const r = await chat(llm, [{ role: 'user', content: 'Reply with exactly: "The dice are ready."' }], { maxTokens: 30 });
              setLlmStatus(`✓ ${r.trim().slice(0, 120)}`);
            } catch (e) { setLlmStatus(`✗ ${(e as Error).message}`); }
          }}>Test connection</button>
          {llmStatus && <span className={`status ${llmStatus.startsWith('✗') ? 'bad' : ''}`}>{llmStatus}</span>}
        </div>
      </section>

      <section className="card">
        <h2>🎨 Images</h2>
        <p className="muted">Portraits, emblems, scenes and illustrated maps are generated on demand with the 🎨 buttons. Anthropic and Groq don't generate images, so this is configured separately.</p>
        <div className="grid-2">
          <label className="field">
            <span>Provider</span>
            <select value={img.provider} onChange={(e) => {
              const p = e.target.value as ImageProviderId;
              onImg({ ...img, provider: p, baseUrl: IMAGE_PROVIDERS[p].baseUrl, model: IMAGE_PROVIDERS[p].model });
            }}>
              {Object.entries(IMAGE_PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Base URL</span>
            <input value={img.baseUrl} onChange={(e) => onImg({ ...img, baseUrl: e.target.value })} />
          </label>
          {ip.needsKey && (
            <label className="field">
              <span>API key</span>
              <input type="password" autoComplete="off" value={img.apiKey} onChange={(e) => onImg({ ...img, apiKey: e.target.value })} />
            </label>
          )}
          {(img.provider === 'openai' || img.provider === 'openrouter' || img.provider === 'pollinations') && (
            <label className="field">
              <span>Model</span>
              <input value={img.model} onChange={(e) => onImg({ ...img, model: e.target.value })} />
            </label>
          )}
          {img.provider === 'comfyui' && (
            <label className="field">
              <span>Checkpoint file name</span>
              <input value={img.checkpoint} onChange={(e) => onImg({ ...img, checkpoint: e.target.value })} />
            </label>
          )}
          {(img.provider === 'a1111' || img.provider === 'comfyui' || img.provider === 'pollinations') && (
            <label className="field">
              <span>Size (px)</span>
              <select value={img.size} onChange={(e) => onImg({ ...img, size: +e.target.value })}>
                {[512, 768, 1024].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          {(img.provider === 'a1111' || img.provider === 'comfyui') && (
            <label className="field">
              <span>Negative prompt</span>
              <input value={img.negative} onChange={(e) => onImg({ ...img, negative: e.target.value })} />
            </label>
          )}
        </div>
        <p className="note">ℹ {ip.note}</p>
        {httpsLocal(img.baseUrl) && <p className="note warn">⚠ Local image servers can't be reached from the HTTPS-hosted site in most browsers. Run the app locally with <code>npm run dev</code>.</p>}
        <div className="form-actions">
          <button className="btn" onClick={async () => {
            setImgStatus('Generating a test image…');
            try {
              const r = await generateImage(img, 'a d20 die made of glowing amber resting on an old map, fantasy painting');
              setTestImg(r.id);
              setImgStatus('✓ Works');
            } catch (e) { setImgStatus(`✗ ${(e as Error).message}`); }
          }}>Test image</button>
          {imgStatus && <span className={`status ${imgStatus.startsWith('✗') ? 'bad' : ''}`}>{imgStatus}</span>}
        </div>
        {testUrl && <img className="test-image" src={testUrl} alt="Test result" />}
      </section>

      <section className="card">
        <h2>About</h2>
        <p className="muted">Campaigns and images are stored in this browser (IndexedDB). Use JSON export for backups. Monster and magic item names reference the <em>System Reference Document 5.2</em> by Wizards of the Coast LLC, licensed under CC-BY-4.0. Everything else is original or generated.</p>
      </section>
    </div>
  );
}
