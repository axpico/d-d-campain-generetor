import { useState, type ReactNode } from 'react';
import type { Campaign } from '../lib/types';
import { Rng } from '../lib/rng';
import { SPECIES, fullName, placeName, tavernName } from '../data/names';
import { APPEARANCE, NPC_ROLES, PERSONALITIES, QUIRKS, RUMORS, TWISTS } from '../data/story';
import { buildEncounter, rollLoot } from '../gen/encounter';
import { loadSetting, saveSetting } from '../lib/storage';
import type { Env } from '../data/monsters';
import { EncounterCard, Loot } from './bits';
import { roll, type Roll } from '../lib/dice';

// ---------- Dice ----------
function Dice() {
  const [expr, setExpr] = useState('1d20');
  const [log, setLog] = useState<Roll[]>([]);
  const [err, setErr] = useState<string>();
  const doRoll = (e: string) => {
    try { setLog((l) => [roll(e), ...l].slice(0, 30)); setErr(undefined); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <section className="card">
      <h2>🎲 Dice</h2>
      <div className="chips">
        {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '1d20 adv', '1d20 dis', '4d6kh3', '2d6', '8d6'].map((d) => (
          <button key={d} className="chip" onClick={() => doRoll(d)}>{d}</button>
        ))}
      </div>
      <form className="input-row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); doRoll(expr); }}>
        <input value={expr} onChange={(e) => setExpr(e.target.value)} aria-label="Dice expression" placeholder="e.g. 2d6+3, 1d20 adv, 4d6kh3" />
        <button className="btn primary">Roll</button>
      </form>
      {err && <p className="status bad">{err}</p>}
      <ol className="roll-log">
        {log.map((r) => (
          <li key={r.at + r.detail}><span className="roll-total">{r.total}</span> <span className="muted small">{r.expr}: {r.detail}</span></li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Initiative ----------
interface Combatant { id: string; name: string; init: number; hp?: number; maxHp?: number; ac?: number; pc?: boolean; note?: string }

function Initiative({ c }: { c?: Campaign }) {
  const [list, setList] = useState<Combatant[]>(() => loadSetting('initiative', { list: [] as Combatant[] }).list);
  const [turn, setTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [name, setName] = useState('');
  const [init, setInit] = useState('');
  const [hp, setHp] = useState('');
  const save = (l: Combatant[]) => { setList(l); saveSetting('initiative', { list: l }); };
  const sorted = [...list].sort((a, b) => b.init - a.init);
  const withId = (cb: Omit<Combatant, 'id'>): Combatant => ({ ...cb, id: Math.random().toString(36).slice(2) });
  const add = (cb: Omit<Combatant, 'id'>) => save([...list, withId(cb)]);
  const d20 = () => 1 + Math.floor(Math.random() * 20);

  return (
    <section className="card">
      <h2>⚔ Initiative</h2>
      <form className="init-add" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        add({ name: name.trim(), init: init ? Number(init) : d20(), hp: hp ? Number(hp) : undefined, maxHp: hp ? Number(hp) : undefined });
        setName(''); setInit(''); setHp('');
      }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Init (blank = roll)" type="number" value={init} onChange={(e) => setInit(e.target.value)} />
        <input placeholder="HP" type="number" value={hp} onChange={(e) => setHp(e.target.value)} />
        <button className="btn primary">Add</button>
      </form>
      <div className="form-actions">
        {c?.options.party?.length ? <button className="btn small" onClick={() => save([...list, ...c.options.party.map((p) => withId({ name: p.name || p.cls, init: d20(), pc: true }))])}>+ Party</button> : null}
        <button className="btn small" onClick={() => { setTurn((t) => (sorted.length ? (t + 1) % sorted.length : 0)); if (sorted.length && turn === sorted.length - 1) setRound((r) => r + 1); }} disabled={!list.length}>Next turn ▶</button>
        <span className="muted small">Round {round}</span>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => { save([]); setTurn(0); setRound(1); }}>Clear</button>
      </div>
      <ol className="init-list">
        {sorted.map((x, i) => (
          <li key={x.id} className={`${i === turn ? 'on' : ''} ${x.hp !== undefined && x.hp <= 0 ? 'down' : ''}`}>
            <span className="init-val">{x.init}</span>
            <span className="init-name">{x.pc && '★ '}{x.name}</span>
            {x.hp !== undefined && (
              <span className="hp">
                <button className="btn icon ghost" onClick={() => save(list.map((y) => (y.id === x.id ? { ...y, hp: (y.hp ?? 0) - 1 } : y)))} aria-label="Damage 1">−</button>
                <input type="number" value={x.hp} onChange={(e) => save(list.map((y) => (y.id === x.id ? { ...y, hp: Number(e.target.value) } : y)))} aria-label={`${x.name} HP`} />
                <span className="muted small">/{x.maxHp}</span>
                <button className="btn icon ghost" onClick={() => save(list.map((y) => (y.id === x.id ? { ...y, hp: (y.hp ?? 0) + 1 } : y)))} aria-label="Heal 1">+</button>
              </span>
            )}
            <input className="init-note" placeholder="conditions…" value={x.note ?? ''} onChange={(e) => save(list.map((y) => (y.id === x.id ? { ...y, note: e.target.value } : y)))} />
            <button className="btn icon ghost" onClick={() => save(list.filter((y) => y.id !== x.id))} aria-label={`Remove ${x.name}`}>✕</button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Quick generators ----------
function Quick({ c }: { c?: Campaign }) {
  const [out, setOut] = useState<ReactNode>();
  const [level, setLevel] = useState(c?.sessions.find((s) => s.status !== 'played')?.level ?? 3);
  const [env, setEnv] = useState<Env>('forest');
  const rng = () => new Rng(Math.random() * 1e9);
  const npc = () => {
    const r = rng();
    const sp = r.pick(SPECIES);
    return <p><strong>{fullName(r, sp)}</strong>, {sp.toLowerCase()} {r.pick(NPC_ROLES).role}. {r.pick(PERSONALITIES)}, {r.pick(QUIRKS)}. Looks: {r.pick(APPEARANCE)}.</p>;
  };
  return (
    <section className="card">
      <h2>⚡ Improvise</h2>
      <div className="grid-2">
        <label className="field"><span>Party level</span><input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, +e.target.value || 1)))} /></label>
        <label className="field"><span>Environment</span>
          <select value={env} onChange={(e) => setEnv(e.target.value as Env)}>
            {['forest', 'mountain', 'swamp', 'underdark', 'desert', 'arctic', 'coast', 'grassland', 'urban', 'dungeon', 'planar'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <div className="chips">
        <button className="chip" onClick={() => setOut(npc())}>NPC</button>
        <button className="chip" onClick={() => setOut(<p><strong>{tavernName(rng())}</strong></p>)}>Tavern name</button>
        <button className="chip" onClick={() => setOut(<p><strong>{placeName(rng())}</strong></p>)}>Place name</button>
        <button className="chip" onClick={() => { const r = rng(); setOut(<EncounterCard e={buildEncounter(r, { level, partySize: c?.options.partySize ?? 4, env })} />); }}>Random encounter</button>
        <button className="chip" onClick={() => setOut(<Loot items={rollLoot(rng(), level, 2)} />)}>Loot</button>
        <button className="chip" onClick={() => { const r = rng(); setOut(<p>{r.pick(c?.rumors?.length ? c.rumors : RUMORS.filter((x) => !x.includes('{')))}</p>); }}>Rumor</button>
        <button className="chip" onClick={() => setOut(<p>{rng().pick(TWISTS)}</p>)}>Complication</button>
      </div>
      {out && <div className="quick-out">{out}</div>}
    </section>
  );
}

export function Tools({ c }: { c?: Campaign }) {
  return (
    <div className="tools">
      <Dice />
      <Initiative c={c} />
      <Quick c={c} />
    </div>
  );
}
