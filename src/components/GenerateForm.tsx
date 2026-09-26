import { useState } from 'react';
import type { CampaignOptions, Length, Tone } from '../lib/types';
import { ART_STYLES, TONES } from '../data/story';
import { randomSeed } from '../lib/rng';
import { useApp } from './context';

export const DEFAULT_OPTIONS: CampaignOptions = {
  seed: '', title: '', tones: [], startLevel: 1, endLevel: 10, partySize: 4, length: 'medium', artStyle: 'painterly', notes: '',
};

export function GenerateForm({ initial, onGenerate }: { initial: CampaignOptions; onGenerate: (o: CampaignOptions, expand: boolean) => void }) {
  const { llm } = useApp();
  const [o, setO] = useState<CampaignOptions>({ ...initial, seed: initial.seed || randomSeed() });
  const [expand, setExpand] = useState(llm.enabled);
  const set = <K extends keyof CampaignOptions>(k: K, v: CampaignOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  const toggleTone = (t: Tone) => set('tones', o.tones.includes(t) ? o.tones.filter((x) => x !== t) : [...o.tones, t]);

  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); onGenerate(o, expand && llm.enabled); }}>
      <h2>New campaign</h2>

      <label className="field">
        <span>Title <span className="muted">(leave empty to generate one)</span></span>
        <input value={o.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. The Drowned Crown" />
      </label>

      <fieldset className="field">
        <legend>Tone <span className="muted">(none selected = surprise me)</span></legend>
        <div className="chips">
          {TONES.map((t) => (
            <button type="button" key={t.id} className={`chip ${o.tones.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTone(t.id)} title={t.blurb} aria-pressed={o.tones.includes(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid-3">
        <label className="field">
          <span>Start level</span>
          <input type="number" min={1} max={20} value={o.startLevel} onChange={(e) => {
            const v = Math.max(1, Math.min(20, +e.target.value || 1));
            setO((p) => ({ ...p, startLevel: v, endLevel: Math.max(v, p.endLevel) }));
          }} />
        </label>
        <label className="field">
          <span>End level</span>
          <input type="number" min={1} max={20} value={o.endLevel} onChange={(e) => {
            const v = Math.max(1, Math.min(20, +e.target.value || 1));
            setO((p) => ({ ...p, endLevel: v, startLevel: Math.min(v, p.startLevel) }));
          }} />
        </label>
        <label className="field">
          <span>Players</span>
          <input type="number" min={1} max={8} value={o.partySize} onChange={(e) => set('partySize', Math.max(1, Math.min(8, +e.target.value || 4)))} />
        </label>
      </div>

      <fieldset className="field">
        <legend>Length</legend>
        <div className="chips">
          {([['short', '3 acts'], ['medium', '4 acts'], ['long', '5 acts']] as [Length, string][]).map(([v, l]) => (
            <button type="button" key={v} className={`chip ${o.length === v ? 'on' : ''}`} onClick={() => set('length', v)} aria-pressed={o.length === v}>
              {v[0].toUpperCase() + v.slice(1)} <span className="muted">· {l}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid-2">
        <label className="field">
          <span>Art style (for images)</span>
          <select value={o.artStyle} onChange={(e) => set('artStyle', e.target.value)}>
            {ART_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Seed <span className="muted">(same seed + options = same skeleton)</span></span>
          <div className="input-row">
            <input value={o.seed} onChange={(e) => set('seed', e.target.value)} />
            <button type="button" className="btn ghost" onClick={() => set('seed', randomSeed())} title="New random seed">🎲</button>
          </div>
        </label>
      </div>

      <label className="field">
        <span>Notes for the AI <span className="muted">(optional: themes, house rules, player backstories…)</span></span>
        <textarea rows={3} value={o.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. One PC is a runaway noble; avoid spiders; lean into sea shanties." />
      </label>

      <label className={`check ${llm.enabled ? '' : 'disabled'}`}>
        <input type="checkbox" checked={expand && llm.enabled} disabled={!llm.enabled} onChange={(e) => setExpand(e.target.checked)} />
        <span>Expand with AI after generating {llm.enabled ? <span className="muted">({llm.model})</span> : <span className="muted">(set up a provider in Settings)</span>}</span>
      </label>

      <div className="form-actions">
        <button type="submit" className="btn primary big">⚔ Generate campaign</button>
      </div>
    </form>
  );
}
