import { useState } from 'react';
import { ABILITIES, SKILLS, type Ability, type PcSheet, type SheetAttack } from '../../play/types';
import { profBonusFor, templateSheet } from '../../play/creatures';
import { PC_CLASSES } from '../../data/story';
import { SPECIES } from '../../data/names';
import { SPELLS } from '../../play/spells';
import { fmtMod, mod } from '../../lib/dice';

const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export function SheetEditor({ sheet, onChange, onRemove }: { sheet: PcSheet; onChange: (s: PcSheet) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof PcSheet>(k: K, v: PcSheet[K]) => onChange({ ...sheet, [k]: v });
  const setAtk = (i: number, p: Partial<SheetAttack>) => set('attacks', sheet.attacks.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const sc = sheet.spellcasting;

  return (
    <div className="sheet card">
      <div className="card-head">
        <strong>{sheet.name || 'Unnamed'}</strong>
        <span className="muted small">{sheet.species} {sheet.cls} {sheet.level} · AC {sheet.ac} · HP {sheet.maxHp}{sc ? ` · spell DC ${sc.saveDc}` : ''}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => setOpen((o) => !o)}>{open ? 'Close sheet' : 'Edit sheet'}</button>
        {onRemove && <button className="btn icon ghost" onClick={onRemove} aria-label="Remove character">✕</button>}
      </div>
      {open && (
        <div className="sheet-body">
          <div className="grid-4">
            <label className="field"><span>Name</span><input value={sheet.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label className="field"><span>Species</span>
              <select value={sheet.species} onChange={(e) => set('species', e.target.value)}>{[...new Set(SPECIES)].map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="field"><span>Class</span>
              <select value={sheet.cls} onChange={(e) => set('cls', e.target.value)}>{PC_CLASSES.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="field"><span>Level</span><input type="number" min={1} max={20} value={sheet.level} onChange={(e) => onChange({ ...sheet, level: num(e.target.value, 1), profBonus: profBonusFor(num(e.target.value, 1)) })} /></label>
          </div>
          <div className="form-actions">
            <button className="btn small" onClick={() => {
              if (!confirm('Replace stats, attacks and spells with a template for this class and level? Name, personality and hook are kept.')) return;
              const t = templateSheet(sheet.name, sheet.species, sheet.cls, sheet.level, sheet.hook);
              onChange({ ...t, id: sheet.id, personality: sheet.personality, inventory: sheet.inventory || t.inventory });
            }}>Fill from class &amp; level</button>
            <span className="muted small">A starting point. Adjust everything to match your real sheet.</span>
          </div>

          <h4>Ability scores</h4>
          <div className="abilities">
            {ABILITIES.map((a) => (
              <label key={a} className="ability">
                <span>{a.toUpperCase()}</span>
                <input type="number" min={1} max={30} value={sheet.abilities[a]} onChange={(e) => set('abilities', { ...sheet.abilities, [a]: num(e.target.value, 10) })} />
                <span className="muted small">{fmtMod(mod(sheet.abilities[a]))}</span>
                <label className="save-prof" title="Saving throw proficiency">
                  <input type="checkbox" checked={sheet.saveProfs.includes(a)} onChange={(e) => set('saveProfs', e.target.checked ? [...sheet.saveProfs, a] : sheet.saveProfs.filter((x) => x !== a))} /> save
                </label>
              </label>
            ))}
          </div>

          <div className="grid-4">
            <label className="field"><span>AC</span><input type="number" value={sheet.ac} onChange={(e) => set('ac', num(e.target.value, 10))} /></label>
            <label className="field"><span>Max HP</span><input type="number" value={sheet.maxHp} onChange={(e) => set('maxHp', num(e.target.value, 1))} /></label>
            <label className="field"><span>Speed (ft)</span><input type="number" value={sheet.speed} onChange={(e) => set('speed', num(e.target.value, 30))} /></label>
            <label className="field"><span>Proficiency bonus</span><input type="number" value={sheet.profBonus} onChange={(e) => set('profBonus', num(e.target.value, 2))} /></label>
            <label className="field"><span>Attacks per Attack action</span><input type="number" min={1} max={4} value={sheet.attacksPerAction} onChange={(e) => set('attacksPerAction', num(e.target.value, 1))} /></label>
            <label className="field"><span>Potions of Healing</span><input type="number" min={0} value={sheet.potions} onChange={(e) => set('potions', num(e.target.value, 0))} /></label>
          </div>

          <h4>Skills <span className="muted small">(click once: proficient · twice: expertise)</span></h4>
          <div className="chips">
            {Object.keys(SKILLS).map((sk) => {
              const exp = sheet.expertise.includes(sk);
              const prof = sheet.skillProfs.includes(sk);
              return (
                <button key={sk} type="button" className={`chip ${exp ? 'on exp' : prof ? 'on' : ''}`} onClick={() => {
                  if (exp) onChange({ ...sheet, expertise: sheet.expertise.filter((x) => x !== sk), skillProfs: sheet.skillProfs.filter((x) => x !== sk) });
                  else if (prof) onChange({ ...sheet, expertise: [...sheet.expertise, sk], skillProfs: sheet.skillProfs.filter((x) => x !== sk) });
                  else onChange({ ...sheet, skillProfs: [...sheet.skillProfs, sk] });
                }}>
                  {sk} <span className="muted">({(SKILLS[sk] as Ability).toUpperCase()}){exp ? ' ★★' : prof ? ' ★' : ''}</span>
                </button>
              );
            })}
          </div>

          <h4>Attacks</h4>
          <table className="atk-table">
            <thead><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Type</th><th>Reach</th><th>Range</th><th /></tr></thead>
            <tbody>
              {sheet.attacks.map((a, i) => (
                <tr key={i}>
                  <td><input value={a.name} onChange={(e) => setAtk(i, { name: e.target.value })} aria-label="Attack name" /></td>
                  <td><input type="number" value={a.bonus} onChange={(e) => setAtk(i, { bonus: num(e.target.value) })} aria-label="To hit" /></td>
                  <td><input value={a.damage} onChange={(e) => setAtk(i, { damage: e.target.value })} aria-label="Damage dice" /></td>
                  <td><input value={a.type} onChange={(e) => setAtk(i, { type: e.target.value })} aria-label="Damage type" /></td>
                  <td><input type="number" value={a.reach ?? ''} placeholder="—" onChange={(e) => setAtk(i, { reach: e.target.value ? num(e.target.value) : undefined })} aria-label="Reach" /></td>
                  <td><input value={a.range ? a.range.join('/') : ''} placeholder="e.g. 80/320" onChange={(e) => { const [n, l] = e.target.value.split('/').map(Number); setAtk(i, { range: n ? [n, l || n] : undefined }); }} aria-label="Range" /></td>
                  <td><button className="btn icon ghost" onClick={() => set('attacks', sheet.attacks.filter((_, j) => j !== i))} aria-label="Remove attack">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn small" onClick={() => set('attacks', [...sheet.attacks, { name: 'Dagger', bonus: sheet.profBonus + mod(sheet.abilities.dex), damage: `1d4+${mod(sheet.abilities.dex)}`, type: 'piercing', reach: 5, range: [20, 60] }])}>＋ Attack</button>

          <h4>Spellcasting <label className="check small inline-check"><input type="checkbox" checked={!!sc} onChange={(e) => set('spellcasting', e.target.checked ? { ability: 'int', saveDc: 8 + sheet.profBonus + mod(sheet.abilities.int), attackBonus: sheet.profBonus + mod(sheet.abilities.int), slots: Array(10).fill(0), cantrips: [], spells: [] } : undefined)} /> caster</label></h4>
          {sc && (
            <>
              <div className="grid-4">
                <label className="field"><span>Ability</span>
                  <select value={sc.ability} onChange={(e) => set('spellcasting', { ...sc, ability: e.target.value as Ability })}>{ABILITIES.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}</select>
                </label>
                <label className="field"><span>Save DC</span><input type="number" value={sc.saveDc} onChange={(e) => set('spellcasting', { ...sc, saveDc: num(e.target.value, 10) })} /></label>
                <label className="field"><span>Spell attack</span><input type="number" value={sc.attackBonus} onChange={(e) => set('spellcasting', { ...sc, attackBonus: num(e.target.value) })} /></label>
              </div>
              <div className="slots">
                <span className="field-label">Slots</span>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <label key={l} className="slot"><span>{l}</span><input type="number" min={0} max={4} value={sc.slots[l] ?? 0} onChange={(e) => { const s2 = [...sc.slots]; s2[l] = num(e.target.value); set('spellcasting', { ...sc, slots: s2 }); }} aria-label={`Level ${l} slots`} /></label>
                ))}
              </div>
              <label className="field"><span>Cantrips (comma-separated)</span><input value={sc.cantrips.join(', ')} onChange={(e) => set('spellcasting', { ...sc, cantrips: list(e.target.value) })} /></label>
              <label className="field"><span>Prepared spells (comma-separated)</span><input value={sc.spells.join(', ')} onChange={(e) => set('spellcasting', { ...sc, spells: list(e.target.value) })} list="spell-names" /></label>
              <datalist id="spell-names">{SPELLS.map((s) => <option key={s.name} value={s.name} />)}</datalist>
              <p className="muted small">
                Automated: {[...sc.cantrips, ...sc.spells].filter((n) => SPELLS.some((s) => s.name.toLowerCase() === n.toLowerCase())).join(', ') || 'none'}.
                {' '}Other spells work too: the DM adjudicates them and the engine rolls.
              </p>
            </>
          )}

          <label className="field"><span>Features &amp; traits <span className="muted">(write extra damage as "Sneak Attack: +3d6" so the engine can apply it)</span></span>
            <textarea rows={3} value={sheet.features} onChange={(e) => set('features', e.target.value)} />
          </label>
          <label className="field"><span>Inventory</span><textarea rows={2} value={sheet.inventory} onChange={(e) => set('inventory', e.target.value)} /></label>
          <div className="grid-2">
            <label className="field"><span>Personality <span className="muted">(how the AI plays them)</span></span><textarea rows={2} value={sheet.personality} onChange={(e) => set('personality', e.target.value)} placeholder="e.g. reckless, loyal, cracks jokes when scared" /></label>
            <label className="field"><span>Backstory hook</span><textarea rows={2} value={sheet.hook} onChange={(e) => set('hook', e.target.value)} /></label>
          </div>
        </div>
      )}
    </div>
  );
}
