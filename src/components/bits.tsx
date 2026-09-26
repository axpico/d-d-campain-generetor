import { useState, type ReactNode } from 'react';
import type { Encounter, LootItem } from '../lib/types';

export function Reroll({ onClick, title = 'Re-roll' }: { onClick: () => void; title?: string }) {
  return <button className="btn icon ghost no-print" onClick={onClick} title={title} aria-label={title}>🎲</button>;
}

export function AiButton({ onClick, disabled }: { onClick: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn icon ghost no-print" disabled={disabled || busy} title={disabled ? 'Configure an AI provider in Settings' : 'Write with AI'} aria-label="Write with AI"
      onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>
      {busy ? <span className="spinner small" /> : '✨'}
    </button>
  );
}

export function Pill({ children, kind }: { children: ReactNode; kind?: string }) {
  return <span className={`pill ${kind ?? ''}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field-row"><span className="field-label">{label}</span><span>{children}</span></div>;
}

export function Prose({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="prose">{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

export function EncounterCard({ e, onReroll }: { e: Encounter; onReroll?: () => void }) {
  const ratio = e.xp / e.budget;
  return (
    <div className="encounter">
      <div className="encounter-head">
        <strong>{e.title}</strong>
        <Pill kind={e.difficulty.toLowerCase()}>{e.difficulty}</Pill>
        {onReroll && <Reroll onClick={onReroll} title="Re-roll encounter" />}
      </div>
      <ul className="monsters">
        {e.monsters.map((m) => <li key={m.name}>{m.count} × {m.name} <span className="muted">CR {m.cr} · {m.xp} XP</span></li>)}
      </ul>
      <div className="xpbar" title={`${e.xp} of ${e.budget} XP budget`}>
        <div style={{ width: `${Math.min(100, ratio * 100)}%` }} className={ratio > 1 ? 'over' : ''} />
      </div>
      <div className="muted small">{e.xp.toLocaleString()} / {e.budget.toLocaleString()} XP · level {e.level}</div>
      <div className="small"><em>Twist:</em> {e.twist}</div>
      {e.note && <div className="small warn">⚠ {e.note}</div>}
    </div>
  );
}

export function Loot({ items }: { items: LootItem[] }) {
  return (
    <ul className="loot">
      {items.map((i, k) => (
        <li key={k}><span className={`rarity r-${i.rarity.toLowerCase().replace(' ', '-')}`}>{i.name}</span>{i.rarity !== 'Coins' && <span className="muted"> · {i.rarity}</span>}{i.note && <span className="muted"> {i.note}</span>}</li>
      ))}
    </ul>
  );
}
