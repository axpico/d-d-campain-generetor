import { useEffect, useRef, useState } from 'react';
import type { Campaign } from '../lib/types';
import { campaignsDb } from '../lib/storage';
import { TONES } from '../data/story';
import { useApp } from './context';

export function Library({ onOpen, currentId, onDeleted }: { onOpen: (c: Campaign) => void; currentId?: string; onDeleted: (id: string) => void }) {
  const { toast } = useApp();
  const [list, setList] = useState<Campaign[]>();
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => campaignsDb.list().then(setList).catch((e) => toast(`Could not read saved campaigns: ${e.message}`, 'error'));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function importJson(f: File) {
    try {
      const c = JSON.parse(await f.text()) as Campaign;
      if (!c.id || !c.villain || !c.acts) throw new Error('Not a campaign file.');
      await campaignsDb.put({ ...c, updatedAt: Date.now() });
      refresh();
      toast(`Imported “${c.title}”.`, 'info');
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, 'error');
    }
  }

  return (
    <div>
      <div className="section-actions">
        <h2>Saved campaigns</h2>
        <span className="spacer" />
        <button className="btn" onClick={() => file.current?.click()}>⬆ Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
      </div>
      {!list ? <p className="muted">Loading…</p> : list.length === 0 ? (
        <div className="card empty"><p>No saved campaigns yet. Generate one and hit 💾 Save.</p></div>
      ) : (
        <div className="cards">
          {list.map((c) => (
            <article key={c.id} className={`card library-item ${c.id === currentId ? 'focused' : ''}`}>
              <h3>{c.title}</h3>
              <div className="muted small">{c.tones.map((t) => TONES.find((x) => x.id === t)?.label).join(' · ')} · Lv {c.options.startLevel}–{c.options.endLevel} · {c.acts.length} acts</div>
              <p className="small clamp">{c.pitch}</p>
              <div className="muted small">Updated {new Date(c.updatedAt).toLocaleString()}</div>
              <div className="form-actions">
                <button className="btn primary" onClick={() => onOpen(c)}>Open</button>
                <button className="btn ghost" onClick={async () => {
                  if (!confirm(`Delete “${c.title}”? This cannot be undone.`)) return;
                  await campaignsDb.delete(c.id);
                  onDeleted(c.id);
                  refresh();
                }}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
