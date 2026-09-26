import { useState } from 'react';
import type { Mood } from '../lib/types';
import { music } from '../lib/music';
import { MOOD_LABEL } from '../gen/session';

const MOOD_ICON: Record<Mood, string> = {
  tavern: '🍺', town: '🏘', travel: '🧭', forest: '🌲', dungeon: '🕯', battle: '⚔', boss: '🐉',
  horror: '💀', mystery: '🔍', sea: '🌊', sacred: '✨', calm: '🔥',
};

export function MusicPlayer({ mood, onMood, onStop }: { mood?: Mood; onMood: (m: Mood) => void; onStop: () => void }) {
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(music.volume);
  return (
    <div className={`music no-print ${open ? 'open' : ''}`}>
      {open && (
        <div className="music-panel">
          <div className="card-head">
            <strong>Ambient music</strong>
            <span className="spacer" />
            <button className="btn icon ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <div className="mood-grid">
            {(Object.keys(MOOD_LABEL) as Mood[]).map((m) => (
              <button key={m} className={`mood-tile ${mood === m ? 'on' : ''}`} onClick={() => onMood(m)}>
                <span aria-hidden="true">{MOOD_ICON[m]}</span>{MOOD_LABEL[m]}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="small">Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => { const v = +e.target.value; setVol(v); music.setVolume(v); }} />
          </label>
          <div className="form-actions">
            <button className="btn" onClick={onStop} disabled={!mood}>■ Stop</button>
            <span className="muted small">Generated live in your browser. Scenes have ♪ buttons that switch mood.</span>
          </div>
        </div>
      )}
      <button className={`music-fab ${mood ? 'playing' : ''}`} onClick={() => setOpen((o) => !o)} title="Ambient music" aria-label="Ambient music">
        {mood ? <><span className="eq"><i /><i /><i /></span> {MOOD_LABEL[mood]}</> : '♪'}
      </button>
    </div>
  );
}
