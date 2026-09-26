import { useEffect, useState } from 'react';
import type { Campaign, Scene, SceneKind, Session } from '../lib/types';
import { deleteSession, insertSession, MOOD_LABEL, rerollSession } from '../gen/session';
import { writeSession } from '../ai/session';
import { Editable } from './Editable';
import { EncounterCard, Loot, Pill, Reroll } from './bits';
import { useApp } from './context';

const KIND_ICON: Record<SceneKind, string> = {
  social: '🗣', exploration: '🔍', combat: '⚔', puzzle: '🧩', travel: '🧭', rest: '🔥', infiltration: '🗝',
};

export function SessionsView({ c, onChange, goLoc, onPlay }: { c: Campaign; onChange: (c: Campaign) => void; goLoc: (id: string) => void; onPlay: (sessionId: string) => void }) {
  const { llm, runAi, aiBusy, toast } = useApp();
  const firstOpen = c.sessions.find((s) => s.status !== 'played') ?? c.sessions[0];
  const [sel, setSel] = useState<string | undefined>(firstOpen?.id);
  useEffect(() => { if (!c.sessions.some((s) => s.id === sel)) setSel(firstOpen?.id); }, [c.sessions, sel, firstOpen]);
  const s = c.sessions.find((x) => x.id === sel);

  const setSession = (id: string, p: Partial<Session> | ((s: Session) => Partial<Session>)) =>
    onChange({ ...c, updatedAt: Date.now(), sessions: c.sessions.map((x) => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)) });

  async function aiWrite(target: Session, base: Campaign = c) {
    let result: Session | undefined;
    const ok = await runAi(`Writing session ${target.number}`, async (cb) => {
      result = await writeSession(llm, base, target, cb);
    });
    if (ok && result) {
      const r = result;
      onChange({ ...base, updatedAt: Date.now(), sessions: base.sessions.map((x) => (x.id === r.id ? r : x)) });
      setSel(r.id);
      if (r.adapted) toast(`Session ${r.number} adapted to your play log.`, 'info');
    }
  }

  async function planNext(cur: Session) {
    // Mark played, then rewrite the next session (inserting one if this was the last).
    let next: Campaign = { ...c, sessions: c.sessions.map((x) => (x.id === cur.id ? { ...x, status: 'played' as const } : x)) };
    let idx = next.sessions.findIndex((x) => x.id === cur.id);
    if (idx === next.sessions.length - 1) {
      next = insertSession(next, cur.id);
      idx = next.sessions.findIndex((x) => x.id === cur.id);
    }
    onChange(next);
    const target = next.sessions[idx + 1];
    setSel(target.id);
    if (!llm.enabled) {
      toast('Marked as played. Set up an AI provider in Settings to adapt the next session to your play log.', 'info');
      return;
    }
    await aiWrite(target, next);
  }

  function printSession() {
    document.body.classList.add('print-session');
    const done = () => { document.body.classList.remove('print-session'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  const acts = c.acts;
  const played = c.sessions.filter((x) => x.status === 'played').length;

  return (
    <div className="sessions">
      <aside className="session-list no-print">
        <div className="muted small">{played}/{c.sessions.length} sessions played</div>
        {acts.map((a) => (
          <div key={a.id} className="session-group">
            <div className="session-group-title">Act {a.number}: {a.title}</div>
            {c.sessions.filter((x) => x.actId === a.id).map((x) => (
              <button key={x.id} className={`session-item ${x.id === sel ? 'on' : ''} ${x.status}`} onClick={() => setSel(x.id)}>
                <span className="session-no">{x.status === 'played' ? '✓' : x.number}</span>
                <span className="session-name">{x.title}</span>
                {x.adapted && <span title="Adapted to play log">↻</span>}
                {x.recap && <span title="Written with AI">✨</span>}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {s && (
        <article className="session-detail card">
          <div className="card-head">
            <h2>Session {s.number}: <Editable inline value={s.title} onSave={(v) => setSession(s.id, { title: v || s.title })} /></h2>
            <span className="spacer" />
            <Pill>Level {s.level}</Pill>
            <Pill kind={s.status === 'played' ? 'ally' : undefined}>{s.status}</Pill>
            {s.adapted && <Pill kind="act">adapted</Pill>}
          </div>
          <div className="toolbar no-print">
            <button className="btn primary" disabled={!llm.enabled || aiBusy} onClick={() => aiWrite(s)} title={llm.enabled ? '' : 'Set up an AI provider in Settings'}>
              ✨ {s.recap ? 'Rewrite with AI' : 'Write with AI'}
            </button>
            <button className="btn" onClick={() => onPlay(s.id)} title="Play this session with an AI or human DM and players">▶ {s.gameId ? 'Continue game' : 'Play'}</button>
            <Reroll onClick={() => onChange(rerollSession(c, s.id))} title="Re-roll this session's skeleton" />
            <button className="btn ghost" onClick={() => { const n = insertSession(c, s.id); onChange(n); setSel(n.sessions[n.sessions.findIndex((x) => x.id === s.id) + 1].id); }}>＋ Insert session after</button>
            <button className="btn ghost" onClick={printSession}>🖨 Print session</button>
            <button className="btn ghost" onClick={() => { if (confirm(`Delete session ${s.number}?`)) onChange(deleteSession(c, s.id)); }}>🗑</button>
          </div>
          {!llm.enabled && <p className="note">ℹ Tables built the structure below. AI writes the recap, read-aloud text and NPC dialogue, and adapts sessions to your play log. Set it up in Settings.</p>}
          {s.aiNotes && <div className="note"><strong>What the AI changed:</strong><Editable value={s.aiNotes} onSave={(v) => setSession(s.id, { aiNotes: v })} /></div>}

          <section>
            <h3>Previously…</h3>
            <Editable className="read-aloud" value={s.recap} placeholder="Recap to read to the players (write it, or let the AI write it from your play logs)." onSave={(v) => setSession(s.id, { recap: v })} />
          </section>

          <section>
            <div className="card-head"><h3>Strong start</h3><MoodButton mood={s.scenes[0]?.mood} /></div>
            <Editable className="read-aloud" value={s.strongStart} onSave={(v) => setSession(s.id, { strongStart: v })} />
          </section>

          <section>
            <h3>Scenes <span className="muted small">(3–4 hour session)</span></h3>
            <ol className="scenes">
              {s.scenes.map((sc, i) => (
                <SceneCard key={sc.id} c={c} sc={sc} n={i + 1} goLoc={goLoc}
                  onPatch={(p) => setSession(s.id, (cur) => ({ scenes: cur.scenes.map((x) => (x.id === sc.id ? { ...x, ...p } : x)) }))} />
              ))}
            </ol>
          </section>

          <div className="grid-2 session-lower">
            <section>
              <h3>Secrets & clues</h3>
              <p className="muted small">Not tied to a scene: reveal them wherever the party looks. Tick them off as they come out.</p>
              <Checklist items={s.secrets} storageKey={`secrets-${s.id}`} />
              <details className="no-print">
                <summary>Edit list</summary>
                <Editable value={s.secrets.join('\n')} onSave={(v) => setSession(s.id, { secrets: v.split('\n').map((x) => x.trim()).filter(Boolean) })} />
              </details>
            </section>
            <section>
              <h3>NPC lines</h3>
              {[...new Set(s.scenes.flatMap((x) => x.npcIds))].map((id) => {
                const n = c.npcs.find((x) => x.id === id);
                if (!n) return null;
                return (
                  <div key={id} className="npc-line">
                    <strong>{n.name}</strong> <span className="muted small">{n.role} · {n.personality}</span>
                    <Editable value={s.npcLines[id]} placeholder="Sample dialogue (AI or your own)." onSave={(v) => setSession(s.id, (cur) => ({ npcLines: { ...cur.npcLines, [id]: v } }))} />
                  </div>
                );
              })}
              <h3>Treasure</h3>
              <Loot items={s.treasure} />
              <h3>Prep checklist</h3>
              <Checklist items={s.prep} storageKey={`prep-${s.id}`} />
            </section>
          </div>

          <section className="play-log no-print">
            <h3>After the game: what happened?</h3>
            <p className="muted small">Write what the players actually did: choices, surprises, who died, what they skipped. The next session is rewritten to follow from it.</p>
            <textarea rows={5} value={s.playLog ?? ''} placeholder="e.g. They sided with the smugglers, burned the mill, and let the lieutenant escape with the map…"
              onChange={(e) => setSession(s.id, { playLog: e.target.value })} />
            <div className="form-actions">
              <button className="btn primary" disabled={aiBusy} onClick={() => planNext(s)}>✓ Mark played & plan next session</button>
              {s.status === 'played' && <button className="btn ghost" onClick={() => setSession(s.id, { status: 'planned' })}>Mark as not played</button>}
            </div>
          </section>
        </article>
      )}
    </div>
  );
}

function SceneCard({ c, sc, n, onPatch, goLoc }: { c: Campaign; sc: Scene; n: number; onPatch: (p: Partial<Scene>) => void; goLoc: (id: string) => void }) {
  const loc = c.locations.find((l) => l.id === sc.locationId);
  return (
    <li className={`scene scene-${sc.kind}`}>
      <div className="card-head">
        <span className="scene-icon" aria-hidden="true">{KIND_ICON[sc.kind]}</span>
        <h4>{n}. <Editable inline value={sc.title} onSave={(v) => onPatch({ title: v || sc.title })} /></h4>
        <Pill>{sc.kind}</Pill>
        {loc && <button className="link small" onClick={() => goLoc(loc.id)}>{loc.name}</button>}
        <span className="spacer" />
        <MoodButton mood={sc.mood} />
      </div>
      <div className="field-row"><span className="field-label">Purpose</span><Editable inline value={sc.purpose} onSave={(v) => onPatch({ purpose: v })} /></div>
      <Editable className="read-aloud" value={sc.readAloud} placeholder="Read-aloud text (AI or your own)." onSave={(v) => onPatch({ readAloud: v })} />
      <div className="field-row"><span className="field-label">Could end</span><Editable inline value={sc.outcome} onSave={(v) => onPatch({ outcome: v })} /></div>
      {sc.npcIds.length > 0 && <div className="field-row"><span className="field-label">NPCs</span><span>{sc.npcIds.map((id) => c.npcs.find((x) => x.id === id)?.name).filter(Boolean).join(', ')}</span></div>}
      {sc.encounter && <EncounterCard e={sc.encounter} />}
      <Editable value={sc.notes} placeholder="Your notes…" onSave={(v) => onPatch({ notes: v })} rows={3} />
    </li>
  );
}

export function MoodButton({ mood }: { mood?: Scene['mood'] }) {
  const { playMood, mood: current } = useApp();
  if (!mood) return null;
  const on = current === mood;
  return (
    <button className={`btn small mood-btn no-print ${on ? 'on' : ''}`} onClick={() => playMood(mood)} title={`Play ${MOOD_LABEL[mood]} ambience`}>
      {on ? '♫' : '♪'} {MOOD_LABEL[mood]}
    </button>
  );
}

function Checklist({ items, storageKey }: { items: string[]; storageKey: string }) {
  const [done, setDone] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]'); } catch { return []; }
  });
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <ul className="checklist">
      {items.map((it, i) => (
        <li key={i} className={done.includes(i) ? 'done' : ''}>
          <label><input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} /> <span>{it}</span></label>
        </li>
      ))}
    </ul>
  );
}
