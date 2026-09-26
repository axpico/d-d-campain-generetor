import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, Session } from '../../lib/types';
import type { Creature, GameState, PcSheet, Seat, SeatModel } from '../../play/types';
import { templateSheet } from '../../play/creatures';
import { addDirectorNote, dmIntervene, dmSeat, newGame, step, submitHuman, writePlayLog, type Env } from '../../play/orchestrator';
import { currentCreature } from '../../play/engine';
import { LLM_PROVIDERS, type LlmProviderId } from '../../ai/llm';
import { gamesDb } from '../../lib/storage';
import { useApp } from '../context';
import { SheetEditor } from './SheetEditor';
import { HumanInput } from './HumanInput';

export function PlayView({ c, onChange, sessionId }: { c: Campaign; onChange: (c: Campaign) => void; sessionId?: string }) {
  const [selSession, setSelSession] = useState(sessionId ?? (c.sessions.find((s) => s.status !== 'played') ?? c.sessions[0])?.id);
  useEffect(() => { if (sessionId) setSelSession(sessionId); }, [sessionId]);
  const session = c.sessions.find((s) => s.id === selSession);
  const [g, setG] = useState<GameState>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setG(undefined);
    if (!session?.gameId) return;
    setLoading(true);
    gamesDb.get(session.gameId).then((x) => setG(x)).finally(() => setLoading(false));
  }, [session?.gameId]);

  if (!session) return <p className="muted">This campaign has no sessions.</p>;
  if (loading) return <p className="muted">Loading game…</p>;
  if (!g) {
    return <PlaySetup c={c} onChange={onChange} session={session} sessions={c.sessions} onSession={setSelSession}
      onStart={async (game) => {
        await gamesDb.put(game);
        onChange({ ...c, updatedAt: Date.now(), sessions: c.sessions.map((s) => (s.id === session.id ? { ...s, gameId: game.id } : s)) });
        setG(game);
      }} />;
  }
  return <GameScreen c={c} session={session} g={g} setG={(x) => { setG(x); gamesDb.put(x); }} onChange={onChange}
    onReset={async () => {
      if (!confirm('Delete this game and start over? The transcript will be lost.')) return;
      await gamesDb.delete(g.id);
      onChange({ ...c, updatedAt: Date.now(), sessions: c.sessions.map((s) => (s.id === session.id ? { ...s, gameId: undefined } : s)) });
      setG(undefined);
    }} />;
}

// ---------------- Setup ----------------

function defaultSheets(c: Campaign): PcSheet[] {
  const level = c.sessions[0]?.level ?? c.options.startLevel;
  if (c.options.party?.length) return c.options.party.map((p) => ({ ...templateSheet(p.name || p.cls, p.species, p.cls, level, p.hook) }));
  return [
    templateSheet('Kara', 'Human', 'Fighter', level), templateSheet('Ilya', 'Elf', 'Wizard', level),
    templateSheet('Brother Tam', 'Dwarf', 'Cleric', level), templateSheet('Vex', 'Halfling', 'Rogue', level),
  ];
}

function PlaySetup({ c, onChange, session, sessions, onSession, onStart }: {
  c: Campaign; onChange: (c: Campaign) => void; session: Session; sessions: Session[]; onSession: (id: string) => void; onStart: (g: GameState) => void;
}) {
  const { llm, toast } = useApp();
  const sheets = c.sheets ?? defaultSheets(c);
  const saveSheets = (s: PcSheet[]) => onChange({ ...c, sheets: s, updatedAt: Date.now() });
  useEffect(() => { if (!c.sheets) saveSheets(sheets); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dm, setDm] = useState<Seat>({ id: 'dm', role: 'dm', controller: 'ai', model: { useDefault: true } });
  const [seats, setSeats] = useState<Record<string, Seat>>({});
  const seatOf = (sh: PcSheet): Seat => seats[sh.id] ?? { id: `seat-${sh.id}`, role: 'player', controller: 'ai', sheetId: sh.id, model: { useDefault: true } };
  const [budget, setBudget] = useState(60000);
  const aiNeeded = dm.controller === 'ai' || sheets.some((sh) => seatOf(sh).controller === 'ai');

  return (
    <div className="play-setup">
      <section className="card">
        <h2>▶ Play a session</h2>
        <p className="muted">An AI or human DM runs the session plan. Each character is played by an AI or by a human at this screen. The code rolls every die and applies every rule; the AIs only decide what to do and describe it.</p>
        <label className="field"><span>Session</span>
          <select value={session.id} onChange={(e) => onSession(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>Session {s.number}: {s.title} (level {s.level}){s.status === 'played' ? ' ✓' : ''}{s.gameId ? ' — game in progress' : ''}</option>)}
          </select>
        </label>
        {!session.recap && <p className="note">ℹ Tip: "Write with AI" on this session first (Sessions tab) gives the AI DM read-aloud text and NPC lines to work from.</p>}
      </section>

      <section className="card">
        <h3>Seats</h3>
        <div className="seat-row">
          <strong>🎲 Dungeon Master</strong>
          <ControllerPick value={dm.controller} onChange={(v) => setDm({ ...dm, controller: v })} />
          {dm.controller === 'ai' && <ModelPick value={dm.model} onChange={(m) => setDm({ ...dm, model: m })} />}
        </div>
        {sheets.map((sh) => {
          const st = seatOf(sh);
          return (
            <div key={sh.id} className="seat-row">
              <strong>{sh.name}</strong> <span className="muted small">{sh.species} {sh.cls} {sh.level}</span>
              <ControllerPick value={st.controller} onChange={(v) => setSeats({ ...seats, [sh.id]: { ...st, controller: v } })} />
              {st.controller === 'ai' && <ModelPick value={st.model} onChange={(m) => setSeats({ ...seats, [sh.id]: { ...st, model: m } })} />}
            </div>
          );
        })}
        <p className="muted small">"Default" uses your Settings model ({llm.enabled ? llm.model : 'not configured'}). Each seat can use a different provider/model; leave the key empty to reuse the Settings key for the same provider.</p>
      </section>

      <section className="card">
        <div className="card-head"><h3>Characters</h3><span className="spacer" />
          <button className="btn small" onClick={() => saveSheets([...sheets, templateSheet('New hero', 'Human', 'Fighter', session.level)])}>＋ Add character</button>
        </div>
        {sheets.map((sh) => (
          <SheetEditor key={sh.id} sheet={sh} onChange={(s2) => saveSheets(sheets.map((x) => (x.id === sh.id ? s2 : x)))}
            onRemove={sheets.length > 1 ? () => saveSheets(sheets.filter((x) => x.id !== sh.id)) : undefined} />
        ))}
      </section>

      <section className="card">
        <label className="field"><span>Memory budget (characters of transcript sent each turn)</span>
          <input type="number" min={8000} step={4000} value={budget} onChange={(e) => setBudget(Math.max(8000, Number(e.target.value) || 60000))} />
        </label>
        <p className="muted small">The full transcript is sent every turn. Only if it grows past this size are the oldest events summarized, so small-context free models don't break. ~4 characters ≈ 1 token.</p>
        {aiNeeded && !llm.enabled && <p className="note warn">⚠ AI seats need a provider. Set one up in Settings, or make every seat human.</p>}
        <div className="form-actions">
          <button className="btn primary big" disabled={aiNeeded && !llm.enabled} onClick={async () => {
            try {
              const allSeats: Seat[] = [dm, ...sheets.map((sh) => seatOf(sh))];
              onStart(await newGame(c, session, allSeats, sheets, budget));
            } catch (e) { toast(`Couldn't start: ${(e as Error).message}`, 'error'); }
          }}>⚔ Start the game</button>
        </div>
      </section>
    </div>
  );
}

function ControllerPick({ value, onChange }: { value: Seat['controller']; onChange: (v: Seat['controller']) => void }) {
  return (
    <div className="seg" role="group">
      <button className={value === 'ai' ? 'on' : ''} onClick={() => onChange('ai')}>🤖 AI</button>
      <button className={value === 'human' ? 'on' : ''} onClick={() => onChange('human')}>🙋 Human</button>
    </div>
  );
}

function ModelPick({ value, onChange }: { value: SeatModel; onChange: (m: SeatModel) => void }) {
  return (
    <span className="model-pick">
      <select value={value.useDefault ? 'default' : value.provider} onChange={(e) => {
        const v = e.target.value;
        if (v === 'default') onChange({ useDefault: true });
        else onChange({ useDefault: false, provider: v as LlmProviderId, model: LLM_PROVIDERS[v as LlmProviderId].model, baseUrl: LLM_PROVIDERS[v as LlmProviderId].baseUrl });
      }} aria-label="Model provider">
        <option value="default">Default (Settings)</option>
        {Object.entries(LLM_PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
      </select>
      {!value.useDefault && <>
        <input value={value.model ?? ''} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="model id" aria-label="Model id" />
        <input type="password" value={value.apiKey ?? ''} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} placeholder="API key (optional)" aria-label="API key" />
      </>}
    </span>
  );
}

// ---------------- Game ----------------

const SPEEDS: [number, string][] = [[0, 'Fast'], [1500, 'Normal'], [4000, 'Slow']];

function GameScreen({ c, session, g, setG, onChange, onReset }: {
  c: Campaign; session: Session; g: GameState; setG: (g: GameState) => void; onChange: (c: Campaign) => void; onReset: () => void;
}) {
  const { llm, toast, playMood, runAi, aiBusy } = useApp();
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(1500);
  const [autoMusic, setAutoMusic] = useState(true);
  const [stream, setStream] = useState<{ who: string; text: string }>();
  const [kick, setKick] = useState(0);
  const [note, setNote] = useState('');
  const [tools, setTools] = useState('');
  const gRef = useRef(g);
  gRef.current = g;
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const env = (signal?: AbortSignal): Env => ({
    campaign: c, session, llm, signal,
    onDelta: (who, ch) => setStream((s) => ({ who, text: (s?.who === who ? s.text : '') + ch })),
    onMood: (m) => { if (autoMusic) playMood(m); },
  });

  async function doStep(signal?: AbortSignal) {
    setBusy(true);
    setStream(undefined);
    try {
      const next = await step(gRef.current, env(signal));
      gRef.current = next;
      setG(next);
      return true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Turn failed: ${(e as Error).message}`, 'error');
      return false;
    } finally {
      setBusy(false);
      setStream(undefined);
    }
  }

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      while (!cancelled) {
        const cur = gRef.current;
        if (cur.status !== 'running' || cur.waitingFor) break;
        const ok = await doStep(ac.signal);
        if (!ok || cancelled) { if (!cancelled) setRunning(false); break; }
        if (delay) await new Promise((r) => setTimeout(r, delay));
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [running, kick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [g.log.length, stream?.text]);
  useEffect(() => { if (g.status === 'ended') setRunning(false); }, [g.status]);

  const waitingSeat = g.seats.find((s) => s.id === g.waitingFor);
  const waitingName = waitingSeat ? (waitingSeat.role === 'dm' ? 'the DM' : g.sheets.find((x) => x.id === waitingSeat.sheetId)?.name) : undefined;
  const cur = currentCreature(g);
  const dm = dmSeat(g);

  async function submit(text: string) {
    setBusy(true);
    try {
      const next = await submitHuman(gRef.current, text, env());
      gRef.current = next;
      setG(next);
      setKick((k) => k + 1);
    } catch (e) {
      toast(`Couldn't apply that: ${(e as Error).message}`, 'error');
    } finally { setBusy(false); }
  }

  const byId = useMemo(() => new Map(g.creatures.map((x) => [x.id, x])), [g.creatures]);
  const order: Creature[] = g.combat ? g.combat.order.map((id) => byId.get(id)!).filter(Boolean) : g.creatures;

  return (
    <div className="game">
      <div className="game-main">
        <div className="game-controls">
          {running
            ? <button className="btn" onClick={() => { setRunning(false); abortRef.current?.abort(); }}>⏸ Pause</button>
            : <button className="btn primary" disabled={g.status !== 'running' || !!g.waitingFor} onClick={() => setRunning(true)}>▶ Auto-play</button>}
          <button className="btn" disabled={running || busy || g.status !== 'running' || !!g.waitingFor} onClick={() => doStep()}>⏭ One turn</button>
          <select value={delay} onChange={(e) => setDelay(Number(e.target.value))} aria-label="Speed">{SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="check small"><input type="checkbox" checked={autoMusic} onChange={(e) => setAutoMusic(e.target.checked)} /> auto music</label>
          <span className="spacer" />
          <span className="muted small">{g.combat ? `⚔ Round ${g.combat.round} · ${cur?.name}'s turn` : `Scene ${Math.min(g.sceneIndex + 1, session.scenes.length)}/${session.scenes.length}: ${session.scenes[g.sceneIndex]?.title ?? 'wrap-up'}`}</span>
        </div>

        <div className="chat" ref={logRef}>
          {g.log.map((m) => (
            <div key={m.id} className={`msg msg-${m.kind} ${m.side ? `side-${m.side}` : ''} ${m.dmOnly ? 'dm-only' : ''}`}>
              {m.speaker && m.kind !== 'action' && <div className="msg-who">{m.speaker}</div>}
              <div className="msg-text">{m.kind === 'action' ? <><strong>{m.speaker}</strong> {m.text}</> : m.kind === 'dialogue' ? `“${m.text.replace(/^["“]|["”]$/g, '')}”` : m.text}</div>
            </div>
          ))}
          {stream && (
            <div className="msg msg-stream">
              <div className="msg-who">{stream.who} <span className="typing">writing…</span></div>
              <div className="msg-text">{stream.text.slice(-1200)}</div>
            </div>
          )}
          {busy && !stream && <div className="msg msg-system"><span className="spinner small" /> thinking…</div>}
        </div>

        {g.waitingFor && waitingSeat && g.status === 'running' && (
          <HumanInput g={g} seat={waitingSeat} name={waitingName ?? ''} busy={busy} onSubmit={submit} />
        )}

        {g.status === 'ended' && (
          <div className="card end-card">
            <h3>Session over</h3>
            <p className="muted">Write a play log from the transcript and mark the session as played. The Sessions tab can then adapt the next session to what happened.</p>
            <div className="form-actions">
              <button className="btn primary" disabled={aiBusy || !llm.enabled} onClick={async () => {
                let text = '';
                const ok = await runAi('Writing the play log', async (cb) => { text = await writePlayLog(g, { ...env(cb.signal), onDelta: (_w, ch) => cb.onDelta?.(ch) }); });
                if (ok) {
                  onChange({ ...c, updatedAt: Date.now(), sessions: c.sessions.map((s) => (s.id === session.id ? { ...s, playLog: text, status: 'played' } : s)) });
                  toast('Play log saved to the session. Open the Sessions tab to plan the next one.', 'info');
                }
              }}>📝 Write play log &amp; mark played</button>
              <button className="btn ghost" onClick={() => setG({ ...g, status: 'running' })}>Keep playing</button>
            </div>
          </div>
        )}
      </div>

      <aside className="game-side">
        <section className="card">
          <h3>{g.combat ? 'Initiative' : 'Party'}</h3>
          <ul className="tracker">
            {order.filter((x) => !(x.dead && x.kind === 'monster')).map((x) => (
              <li key={x.id} className={`${x.side} ${cur?.id === x.id ? 'current' : ''} ${x.dead ? 'dead' : x.hp <= 0 ? 'down' : ''}`}>
                <div className="tracker-head"><strong>{x.name}</strong><span className="muted small">AC {x.ac}</span></div>
                <div className="hpbar"><div style={{ width: `${Math.max(0, (x.hp / x.maxHp) * 100)}%` }} /></div>
                <div className="small">{x.dead ? 'dead' : `${x.hp}/${x.maxHp} HP`}{x.tempHp ? ` +${x.tempHp}` : ''}{x.conditions.length ? ` · ${x.conditions.map((k) => k.name).join(', ')}` : ''}{x.concentration ? ` · ◎ ${x.concentration.spell}` : ''}</div>
                {x.spell && x.kind === 'pc' && <div className="muted small">slots {x.spell.slots.map((n, i) => (i && n ? `${i}:${n}` : '')).filter(Boolean).join(' ') || '—'}</div>}
                {x.kind === 'pc' && x.hp <= 0 && !x.dead && <div className="small warn">death saves ✓{x.deathSaves.ok} ✗{x.deathSaves.fail}</div>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Director</h3>
          <p className="muted small">Private note to the DM, used on its next turn: "introduce a rival", "go easier", "move to the heist".</p>
          <form className="input-row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { setG(addDirectorNote(g, note.trim())); setNote(''); } }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nudge the DM…" aria-label="Director note" />
            <button className="btn">Send</button>
          </form>
          <details>
            <summary>DM tools (apply now)</summary>
            <p className="muted small">Tags applied immediately, e.g. <code>[HEAL Vex 2d4+2]</code> <code>[COMBAT Goblin x2]</code> <code>[CONDITION Kara prone]</code> <code>[REST short]</code> <code>[END]</code>. Text outside tags is logged as DM narration.</p>
            <textarea rows={3} value={tools} onChange={(e) => setTools(e.target.value)} />
            <button className="btn small" onClick={() => { if (tools.trim()) { setG(dmIntervene(g, tools, env())); setTools(''); setKick((k) => k + 1); } }}>Apply</button>
          </details>
        </section>

        <section className="card small">
          <div className="muted">
            DM: {dm.controller === 'ai' ? `AI (${dm.model.useDefault ? llm.model : dm.model.model})` : 'human'} ·
            {' '}{g.seats.filter((s) => s.role === 'player').map((s) => `${g.sheets.find((x) => x.id === s.sheetId)?.name}: ${s.controller === 'ai' ? 'AI' : 'human'}`).join(' · ')}
          </div>
          <div className="muted">Transcript: {g.log.length} entries{g.summary ? ' (older part summarized)' : ''}</div>
          <div className="form-actions">
            <button className="btn small ghost" onClick={onReset}>Restart game</button>
            <button className="btn small ghost" onClick={() => {
              const txt = g.log.map((m) => `${m.speaker ? m.speaker + ': ' : m.kind === 'roll' ? '🎲 ' : ''}${m.text}`).join('\n\n');
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
              a.download = `session-${session.number}-transcript.txt`;
              a.click();
            }}>⬇ Transcript</button>
          </div>
        </section>
      </aside>
    </div>
  );
}

