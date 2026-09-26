import { useEffect, useState, type MutableRefObject } from 'react';
import type { GameState, Seat } from '../../play/types';
import { SKILLS } from '../../play/types';
import { currentCreature, distance, isDown } from '../../play/engine';
import { monsterNames } from '../../play/creatures';
import { MOOD_LABEL } from '../../gen/session';

type Act = 'ATTACK' | 'CAST' | 'MOVE toward' | 'MOVE away from' | 'MULTIATTACK' | 'USE' | 'DASH' | 'DODGE' | 'DISENGAGE' | 'HIDE' | 'HELP' | 'POTION' | 'SHOVE' | 'GRAPPLE' | 'FEATURE' | 'SAY';

export function HumanInput({ g, seat, name, busy, onSubmit, appendRef }: {
  g: GameState; seat: Seat; name: string; busy: boolean; onSubmit: (text: string) => void; appendRef?: MutableRefObject<((line: string) => void) | null>;
}) {
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [g.waitingFor, g.combat?.index, g.phase]);
  useEffect(() => {
    if (!appendRef) return;
    appendRef.current = (line) => setText((t) => (t ? `${t}\n${line}` : line));
    return () => { appendRef.current = null; };
  }, [appendRef]);
  const inCombat = g.phase === 'combat' && !!g.combat;
  const me = inCombat ? currentCreature(g) : undefined;

  return (
    <div className="human-input card">
      <div className="card-head">
        <strong>🙋 {name}'s turn{inCombat && me && seat.role === 'dm' ? ` (controlling ${me.name})` : ''}</strong>
        <span className="spacer" />
        {inCombat && g.combat && <span className="muted small">{g.combat.economy.action ? 'action ✓' : 'action ✗'} · {g.combat.economy.bonus ? 'bonus ✓' : 'bonus ✗'} · {g.combat.economy.move} ft</span>}
      </div>
      {inCombat && me ? <CombatBuilder g={g} onAdd={(l) => setText((t) => (t ? `${t}\n${l}` : l))} />
        : seat.role === 'dm' ? <DmBuilder g={g} onAdd={(l) => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${l}`)} />
          : <p className="muted small">Write what {name} says and does. Start lines with <code>SAY:</code> or <code>DO:</code> (plain text counts as speech). The DM decides if a roll is needed.</p>}
      <textarea rows={inCombat ? 4 : 3} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={inCombat ? 'Commands, one per line, e.g.\nMOVE: toward Goblin 2\nATTACK: Goblin 2 with Longsword' : seat.role === 'dm' ? 'Narrate, voice NPCs, and add tags like [CHECK Mira Perception DC 15]…' : 'SAY: "Who sent you?"\nDO: search the cart for a seal'}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { onSubmit(text); } }} />
      <div className="form-actions">
        <button className="btn primary" disabled={busy || (!text.trim() && !inCombat)} onClick={() => onSubmit(inCombat ? `${text}\nEND` : text)}>
          {inCombat ? 'End turn ▶' : 'Send ▶'}
        </button>
        {!inCombat && seat.role === 'player' && <button className="btn ghost" disabled={busy} onClick={() => onSubmit('DO: waits and watches.')}>Pass</button>}
        <span className="muted small">Ctrl+Enter to send</span>
      </div>
    </div>
  );
}

function CombatBuilder({ g, onAdd }: { g: GameState; onAdd: (line: string) => void }) {
  const me = currentCreature(g)!;
  const [act, setAct] = useState<Act>('ATTACK');
  const [bonus, setBonus] = useState(false);
  const living = g.creatures.filter((c) => !c.dead);
  const foes = living.filter((c) => c.side !== me.side && !isDown(c));
  const [target, setTarget] = useState(foes[0]?.name ?? '');
  const [weapon, setWeapon] = useState(me.attacks.find((a) => a.hit !== undefined)?.name ?? '');
  const [spell, setSpell] = useState(me.spell?.known[0] ?? '');
  const [level, setLevel] = useState('');
  const [extra, setExtra] = useState('');
  const [say, setSay] = useState('');
  const needsTarget = ['ATTACK', 'CAST', 'MOVE toward', 'MOVE away from', 'MULTIATTACK', 'USE', 'HELP', 'SHOVE', 'GRAPPLE', 'POTION', 'FEATURE'].includes(act);

  const build = () => {
    const pre = bonus ? 'BONUS: ' : '';
    switch (act) {
      case 'ATTACK': return `${pre}ATTACK: ${target} with ${weapon}${extra ? ` + ${extra}` : ''}`;
      case 'CAST': return `${pre}CAST: ${spell}${level ? ` at level ${level}` : ''}${target ? ` on ${target}` : ''}`;
      case 'MOVE toward': return `MOVE: toward ${target}`;
      case 'MOVE away from': return `MOVE: away from ${target}`;
      case 'MULTIATTACK': return `MULTIATTACK: ${target}`;
      case 'USE': return `${pre}USE: ${weapon} on ${target}`;
      case 'HELP': return `HELP: ${target}`;
      case 'POTION': return `POTION: ${target}`;
      case 'SHOVE': case 'GRAPPLE': return `${act}: ${target}`;
      case 'FEATURE': return `${pre}FEATURE: ${extra || 'Second Wind'}${target ? ` on ${target}` : ''}`;
      case 'SAY': return `SAY: "${say}"`;
      default: return `${pre}${act}`;
    }
  };
  const acts: Act[] = me.kind === 'pc'
    ? ['ATTACK', ...(me.spell ? ['CAST' as Act] : []), 'MOVE toward', 'MOVE away from', 'DASH', 'DODGE', 'DISENGAGE', 'HIDE', 'HELP', 'POTION', 'SHOVE', 'GRAPPLE', 'FEATURE', 'SAY']
    : ['MULTIATTACK', 'ATTACK', 'USE', ...(me.spell ? ['CAST' as Act] : []), 'MOVE toward', 'MOVE away from', 'DASH', 'DODGE', 'DISENGAGE', 'HIDE', 'SAY'];

  return (
    <div className="builder">
      <select value={act} onChange={(e) => setAct(e.target.value as Act)} aria-label="Action">{acts.map((a) => <option key={a}>{a}</option>)}</select>
      {needsTarget && (
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target">
          {(act === 'HELP' || act === 'POTION' ? living.filter((c) => c.side === me.side) : living).map((c) => <option key={c.id} value={c.name}>{c.name} ({distance(me, c)} ft{c.hp <= 0 ? ', down' : ''})</option>)}
        </select>
      )}
      {(act === 'ATTACK' || act === 'USE') && (
        <select value={weapon} onChange={(e) => setWeapon(e.target.value)} aria-label="Weapon or action">
          {me.attacks.filter((a) => (act === 'USE' ? true : a.hit !== undefined)).map((a) => <option key={a.name}>{a.name}</option>)}
        </select>
      )}
      {act === 'CAST' && me.spell && (
        <>
          <select value={spell} onChange={(e) => setSpell(e.target.value)} aria-label="Spell">{me.spell.known.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Slot level">
            <option value="">base level</option>
            {me.spell.slots.map((n, i) => (i && n ? <option key={i} value={i}>level {i} ({n} left)</option> : null))}
          </select>
        </>
      )}
      {(act === 'ATTACK' || act === 'FEATURE') && <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={act === 'ATTACK' ? 'feature, e.g. Sneak Attack' : 'feature name'} aria-label="Feature" />}
      {act === 'SAY' && <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="battle cry" aria-label="Say" />}
      {!['MOVE toward', 'MOVE away from', 'SAY', 'MULTIATTACK', 'HELP', 'SHOVE', 'GRAPPLE'].includes(act) && (
        <label className="check small"><input type="checkbox" checked={bonus} onChange={(e) => setBonus(e.target.checked)} /> bonus action</label>
      )}
      <button className="btn small" onClick={() => onAdd(build())}>＋ Add</button>
    </div>
  );
}

function DmBuilder({ g, onAdd }: { g: GameState; onAdd: (tag: string) => void }) {
  const pcs = g.creatures.filter((c) => c.kind === 'pc' && !c.dead);
  const [who, setWho] = useState(pcs[0]?.name ?? 'party');
  const [skill, setSkill] = useState('Perception');
  const [dc, setDc] = useState(13);
  const [monster, setMonster] = useState('Goblin');
  const [count, setCount] = useState(3);
  return (
    <div className="builder">
      <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Character">{[...pcs.map((c) => c.name), 'party'].map((n) => <option key={n}>{n}</option>)}</select>
      <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">{Object.keys(SKILLS).map((s) => <option key={s}>{s}</option>)}</select>
      <input type="number" value={dc} min={5} max={30} onChange={(e) => setDc(Number(e.target.value))} aria-label="DC" style={{ width: 64 }} />
      <button className="btn small" onClick={() => onAdd(who === 'party' ? `[GROUP ${skill} DC ${dc}]` : `[CHECK ${who} ${skill} DC ${dc}]`)}>＋ Check</button>
      <span className="builder-sep" />
      <input list="srd-monsters" value={monster} onChange={(e) => setMonster(e.target.value)} aria-label="Monster" style={{ width: 140 }} />
      <datalist id="srd-monsters">{monsterNames().map((n) => <option key={n} value={n} />)}</datalist>
      <input type="number" value={count} min={1} max={12} onChange={(e) => setCount(Number(e.target.value))} aria-label="Count" style={{ width: 56 }} />
      <button className="btn small" onClick={() => onAdd(`[COMBAT ${monster} x${count}]`)}>＋ Combat</button>
      <span className="builder-sep" />
      <select onChange={(e) => { if (e.target.value) onAdd(`[MOOD ${e.target.value}]`); e.target.value = ''; }} aria-label="Mood" defaultValue="">
        <option value="">Mood…</option>{Object.keys(MOOD_LABEL).map((m) => <option key={m}>{m}</option>)}
      </select>
      <button className="btn small" onClick={() => onAdd('[SCENE next]')}>Next scene</button>
      <button className="btn small" onClick={() => onAdd('[END]')}>End session</button>
    </div>
  );
}
