// The rules engine. Pure game logic over a GameState draft: every die is rolled here,
// every number is computed here. Language models only name what they want to do.
import { d20, mod, roll, rollDamage } from '../lib/dice';
import { uid } from '../lib/rng';
import { ABILITY_NAME, SKILLS, type Ability, type Attack, type Condition, type Creature, type Economy, type GameState, type Msg, type PcSheet, type Side } from './types';
import { cantripTier, findSpell, type SpellDef } from './spells';
import { creatureFromMonster, findMonster } from './creatures';

// ---------- log ----------

export function log(g: GameState, kind: Msg['kind'], text: string, extra: Partial<Msg> = {}) {
  g.log.push({ id: uid(), kind, text, at: Date.now(), ...extra });
}

// ---------- lookup ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Fuzzy creature lookup by name ("goblin 2", "the goblin", "Mira"). */
export function findCreature(g: GameState, name: string, opts: { alive?: boolean; side?: Side | 'not-party' } = {}): Creature | undefined {
  const n = norm(name).replace(/^(the|a|an) /, '');
  if (!n) return undefined;
  let pool = g.creatures;
  if (opts.alive) pool = pool.filter((c) => !c.dead);
  if (opts.side === 'not-party') pool = pool.filter((c) => c.side !== 'party');
  else if (opts.side) pool = pool.filter((c) => c.side === opts.side);
  return pool.find((c) => norm(c.name) === n)
    ?? pool.find((c) => norm(c.name).startsWith(n) || n.startsWith(norm(c.name)))
    ?? pool.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)))
    ?? pool.find((c) => n.split(' ').some((w) => w.length > 2 && norm(c.name).split(' ').includes(w)));
}

export const sheetOf = (g: GameState, c: Creature): PcSheet | undefined => g.sheets.find((s) => s.id === c.sheetId);
export const has = (c: Creature, cond: string) => c.conditions.some((x) => x.name === cond);
export const isDown = (c: Creature) => c.dead || c.hp <= 0;
const INCAP = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];
export const incapacitated = (c: Creature) => isDown(c) || c.conditions.some((x) => INCAP.includes(x.name));

// ---------- geometry (5-ft squares; Chebyshev distance, as in the 2024 grid rules) ----------

export function distance(a: Creature, b: Creature): number {
  const dx = Math.max(0, Math.abs(a.pos.x - b.pos.x) - (a.pos.x < b.pos.x ? a.size - 1 : b.size - 1));
  const dy = Math.max(0, Math.abs(a.pos.y - b.pos.y) - (a.pos.y < b.pos.y ? a.size - 1 : b.size - 1));
  return Math.max(dx, dy) * 5;
}

const occupied = (g: GameState, x: number, y: number, except?: Creature) =>
  g.creatures.some((c) => c !== except && !c.dead && x >= c.pos.x && x < c.pos.x + c.size && y >= c.pos.y && y < c.pos.y + c.size);

// ---------- checks and saves ----------

function rollMode(adv: boolean, dis: boolean): 'adv' | 'dis' | undefined {
  return adv && !dis ? 'adv' : dis && !adv ? 'dis' : undefined;
}

export function abilityCheck(g: GameState, c: Creature, what: string, dc: number, forced?: 'adv' | 'dis'): { ok: boolean; text: string } {
  const sh = sheetOf(g, c);
  const skill = Object.keys(SKILLS).find((k) => norm(k) === norm(what)) ?? Object.keys(SKILLS).find((k) => norm(what).includes(norm(k)));
  const ability: Ability = skill ? SKILLS[skill] : (Object.keys(ABILITY_NAME).find((k) => norm(what).startsWith(k) || norm(ABILITY_NAME[k as Ability]) === norm(what)) as Ability) ?? 'wis';
  let bonus = mod(c.abilities[ability]);
  if (sh && skill) {
    if (sh.expertise.includes(skill)) bonus += sh.profBonus * 2;
    else if (sh.skillProfs.includes(skill)) bonus += sh.profBonus;
  } else if (!sh && skill) {
    // monsters: use the higher of raw modifier and a CR-ish proficiency guess for listed skills
    bonus += 0;
  }
  const dis = has(c, 'poisoned') || has(c, 'frightened') || forced === 'dis';
  const adv = forced === 'adv';
  const r = d20(bonus, rollMode(adv, dis));
  const ok = r.total >= dc;
  return { ok, text: `${c.name} — ${skill ?? ABILITY_NAME[ability]} check DC ${dc}: ${r.text} → ${ok ? 'success' : 'failure'}` };
}

export function savingThrow(g: GameState, c: Creature, ability: Ability, dc: number): { ok: boolean; text: string } {
  if ((ability === 'str' || ability === 'dex') && c.conditions.some((x) => ['paralyzed', 'stunned', 'unconscious', 'petrified'].includes(x.name))) {
    return { ok: false, text: `${c.name} — ${ABILITY_NAME[ability]} save DC ${dc}: automatic failure (${c.conditions.map((x) => x.name).join(', ')})` };
  }
  let bonus = c.saves[ability];
  let extra = '';
  if (has(c, 'blessed')) { const b = roll('1d4').total; bonus += b; extra += ` +${b} bless`; }
  if (has(c, 'baned')) { const b = roll('1d4').total; bonus -= b; extra += ` −${b} bane`; }
  const dis = (ability === 'dex' && has(c, 'restrained'));
  const adv = (ability === 'dex' && g.combat && g.combat.order[g.combat.index] !== c.id && has(c, 'dodging'));
  const r = d20(bonus, rollMode(!!adv, dis));
  const ok = r.total >= dc;
  return { ok, text: `${c.name} — ${ABILITY_NAME[ability]} save DC ${dc}: ${r.text}${extra} → ${ok ? 'success' : 'failure'}` };
}

// ---------- damage, healing, conditions ----------

function adjustForType(c: Creature, amount: number, type: string): [number, string] {
  const t = type.toLowerCase();
  const matches = (list: string[]) => list.some((x) => {
    const l = x.toLowerCase();
    if (!l.includes(t)) return false;
    // "bludgeoning, piercing, and slashing from nonmagical attacks": treat as applying (most monster attacks are nonmagical)
    return true;
  });
  if (matches(c.imm)) return [0, ' (immune)'];
  if (has(c, 'raging') && ['bludgeoning', 'piercing', 'slashing'].includes(t)) return [Math.floor(amount / 2), ' (resisted: rage)'];
  if (matches(c.res)) return [Math.floor(amount / 2), ' (resisted)'];
  if (matches(c.vul)) return [amount * 2, ' (vulnerable)'];
  return [amount, ''];
}

export function applyDamage(g: GameState, c: Creature, parts: [number, string][], opts: { crit?: boolean; source?: string } = {}): string {
  if (c.dead) return `${c.name} is already dead.`;
  let total = 0;
  const notes: string[] = [];
  for (const [amt, type] of parts) {
    const [a, note] = adjustForType(c, amt, type);
    total += a;
    notes.push(`${a} ${type}${note}`);
  }
  let text = `${c.name} takes ${total} damage (${notes.join(', ')})`;
  if (c.hp <= 0 && c.kind === 'pc' && total > 0) {
    // damage while dying
    c.deathSaves.fail += opts.crit ? 2 : 1;
    c.stable = false;
    text += ` while dying: ${Math.min(3, c.deathSaves.fail)}/3 death save failures`;
    if (c.deathSaves.fail >= 3) { c.dead = true; text += `. ${c.name} dies.`; }
    return text;
  }
  const absorbed = Math.min(c.tempHp, total);
  c.tempHp -= absorbed;
  const rest = total - absorbed;
  if (absorbed) text += ` (${absorbed} absorbed by temp HP)`;
  const before = c.hp;
  c.hp -= rest;
  if (c.hp <= 0) {
    const overflow = -c.hp;
    c.hp = 0;
    if (c.kind === 'monster') {
      c.dead = true;
      text += `. ${c.name} falls!`;
      endConcentration(g, c);
    } else if (overflow >= c.maxHp) {
      c.dead = true;
      text += `. Massive damage — ${c.name} is killed outright.`;
    } else {
      addCondition(c, { name: 'unconscious' });
      c.deathSaves = { ok: 0, fail: 0 };
      text += `. ${c.name} drops to 0 HP and falls unconscious!`;
      endConcentration(g, c);
    }
  } else {
    text += ` (${c.hp}/${c.maxHp} HP)`;
    if (c.concentration && rest > 0 && before > 0) {
      const dc = Math.min(30, Math.max(10, Math.floor(rest / 2)));
      const s = savingThrow(g, c, 'con', dc);
      text += `. Concentration: ${s.text}`;
      if (!s.ok) text += ` — ${endConcentration(g, c)}`;
    }
  }
  return text;
}

export function heal(c: Creature, amount: number): string {
  if (c.dead) return `${c.name} is dead and can't be healed this way.`;
  const wasDown = c.hp <= 0;
  c.hp = Math.min(c.maxHp, c.hp + amount);
  if (wasDown && c.hp > 0) {
    removeCondition(c, 'unconscious');
    c.deathSaves = { ok: 0, fail: 0 };
    c.stable = false;
    return `${c.name} regains ${amount} HP and gets back up (${c.hp}/${c.maxHp}).`;
  }
  return `${c.name} regains ${amount} HP (${c.hp}/${c.maxHp}).`;
}

export function addCondition(c: Creature, cond: Condition): string {
  if (c.condImm.includes(cond.name)) return `${c.name} is immune to ${cond.name}.`;
  if (cond.name === 'frightened' && has(c, 'heroism')) return `${c.name} is immune to fear (Heroism).`;
  c.conditions = c.conditions.filter((x) => x.name !== cond.name);
  c.conditions.push(cond);
  if (cond.name === 'paralyzed' || cond.name === 'stunned' || cond.name === 'unconscious') {
    // incapacitated creatures lose concentration
  }
  return `${c.name} is ${cond.name}.`;
}

export function removeCondition(c: Creature, name: string) {
  c.conditions = c.conditions.filter((x) => x.name !== name);
}

export function endConcentration(g: GameState, c: Creature): string {
  if (!c.concentration) return '';
  const { spell, targets, condition } = c.concentration;
  c.concentration = undefined;
  for (const id of targets) {
    const t = g.creatures.find((x) => x.id === id);
    if (!t) continue;
    t.conditions = t.conditions.filter((x) => !(x.sourceId === c.id && (!condition || x.name === condition || x.name === 'blessed' || x.name === 'baned' || x.name === 'outlined' || x.name === 'marked')));
    if (spell === 'Shield of Faith' || spell === 'Haste') t.ac -= 2;
  }
  return `${c.name} loses concentration on ${spell}.`;
}

// ---------- attacks ----------

function attackRollMode(g: GameState, att: Creature, tgt: Creature, ranged: boolean, d: number, longRange: boolean) {
  const reasons: string[] = [];
  let adv = false;
  let dis = false;
  const A = (why: string) => { adv = true; reasons.push(`adv: ${why}`); };
  const D = (why: string) => { dis = true; reasons.push(`dis: ${why}`); };
  if (has(att, 'poisoned')) D('poisoned');
  if (has(att, 'blinded')) D('blinded');
  if (has(att, 'frightened')) D('frightened');
  if (has(att, 'restrained')) D('restrained');
  if (has(att, 'prone')) D('prone');
  if (has(att, 'invisible')) A('invisible');
  if (has(att, 'hidden')) A('hidden');
  if (has(att, 'helped')) { A('helped'); removeCondition(att, 'helped'); }
  if (has(att, 'reckless')) A('reckless');
  if (has(tgt, 'reckless')) A('target reckless');
  if (has(tgt, 'invisible') && !has(att, 'invisible')) D('target invisible');
  if (has(tgt, 'dodging')) D('target dodging');
  if (['restrained', 'paralyzed', 'stunned', 'unconscious', 'blinded', 'petrified'].some((x) => has(tgt, x))) A('target helpless');
  if (has(tgt, 'outlined')) A('faerie fire');
  if (has(tgt, 'guided')) { A('guiding bolt'); removeCondition(tgt, 'guided'); }
  if (has(tgt, 'prone')) (d <= 5 && !ranged ? A('target prone') : D('target prone'));
  if (ranged && longRange) D('long range');
  if (ranged && g.creatures.some((o) => o.side !== att.side && !isDown(o) && !incapacitated(o) && distance(o, att) <= 5)) D('enemy adjacent');
  return { mode: rollMode(adv, dis), reasons };
}

export interface AttackOpts { extra?: [string, string][]; label?: string; noEconomy?: boolean }

export function makeAttack(g: GameState, att: Creature, tgt: Creature, a: Attack, opts: AttackOpts = {}): string {
  if (tgt.dead) return `${tgt.name} is already dead.`;
  const d = distance(att, tgt);
  const ranged = !!a.range && (!a.reach || d > (a.reach ?? 5));
  const reach = a.reach ?? 5;
  if (!ranged && d > reach) return `${att.name} can't reach ${tgt.name} with ${a.name} (${d} ft away, reach ${reach} ft). Move closer first.`;
  if (ranged && a.range && d > a.range[1]) return `${tgt.name} is out of range for ${a.name} (${d} ft, max ${a.range[1]} ft).`;
  const longRange = ranged && !!a.range && d > a.range[0];
  const { mode, reasons } = attackRollMode(g, att, tgt, ranged, d, longRange);
  let bonus = a.hit ?? 0;
  let blessTxt = '';
  if (has(att, 'blessed')) { const b = roll('1d4').total; bonus += b; blessTxt = ` (+${b} bless)`; }
  if (has(att, 'baned')) { const b = roll('1d4').total; bonus -= b; blessTxt += ` (−${b} bane)`; }
  const r = d20(bonus, mode);
  const autoCrit = d <= 5 && ['paralyzed', 'unconscious'].some((x) => has(tgt, x));
  const hit = !r.fumble && (r.crit || r.total >= tgt.ac);
  const crit = hit && (r.crit || autoCrit);
  let text = `${att.name} attacks ${tgt.name} with ${opts.label ?? a.name}: ${r.text}${blessTxt} vs AC ${tgt.ac}${reasons.length ? ` [${reasons.join('; ')}]` : ''} → ${crit ? 'CRITICAL HIT' : hit ? 'hit' : 'miss'}`;
  if (has(att, 'hidden')) removeCondition(att, 'hidden');
  if (!hit) return text + '.';
  const parts: [number, string][] = [];
  for (const [dice, type] of a.dmg ?? []) parts.push([Math.max(0, rollDamage(dice, crit).total), type]);
  if (has(att, 'raging') && !ranged && parts.length) parts[0][0] += att.kind === 'pc' ? (sheetOf(g, att)?.level ?? 1) >= 9 ? 3 : 2 : 2;
  for (const [dice, type] of opts.extra ?? []) parts.push([rollDamage(dice, crit).total, type]);
  // Hunter's Mark / Hex on this target
  const mark = tgt.conditions.find((x) => x.name === 'marked' && x.sourceId === att.id);
  if (mark) parts.push([rollDamage('1d6', crit).total, att.concentration?.spell === 'Hex' ? 'necrotic' : 'force']);
  if (a.cond && a.dc && a.save) {
    // attacks with a rider save (e.g. poison bite)
  }
  text += '. ' + applyDamage(g, tgt, parts, { crit });
  if (a.dc && a.save && !tgt.dead && tgt.hp > 0) {
    const s = savingThrow(g, tgt, a.save, a.dc);
    text += ` ${s.text}`;
    if (!s.ok && a.cond) text += ' ' + addCondition(tgt, { name: a.cond, save: { ability: a.save, dc: a.dc }, sourceId: att.id });
  }
  return text;
}

// ---------- spells ----------

export function castSpell(g: GameState, caster: Creature, sp: SpellDef, targets: Creature[], slotLevel: number): string {
  const sc = caster.spell;
  if (!sc) return `${caster.name} can't cast spells.`;
  const level = Math.max(sp.level, slotLevel || sp.level);
  if (sp.level > 0) {
    if (!sc.slots[level]) {
      const higher = sc.slots.findIndex((n, i) => i > level && n > 0);
      if (higher < 0) return `${caster.name} has no level ${level}+ spell slots left for ${sp.name}.`;
      return castSpell(g, caster, sp, targets, higher);
    }
    sc.slots[level]--;
  }
  const up = Math.max(0, level - sp.level);
  const casterLevel = caster.kind === 'pc' ? sheetOf(g, caster)?.level ?? 1 : 5;
  const scaleDice = (dice: string) => {
    let d = dice;
    if (sp.scale && sp.level === 0) {
      const tier = cantripTier(casterLevel);
      d = d.replace(/^(\d+)d(\d+)/, (_, n, s2) => `${Number(n) * tier}d${s2}`);
    }
    if (up && sp.upcast) {
      const [un, us] = sp.upcast.split('d').map(Number);
      const m = d.match(/^(\d+)d(\d+)(.*)$/);
      if (m && Number(m[2]) === us) d = `${Number(m[1]) + un * up}d${m[2]}${m[3]}`;
      else d = `${d}+${un * up}d${us}`;
    }
    return d;
  };
  const castMod = mod(caster.abilities[sc.ability]);
  const lines: string[] = [`${caster.name} casts ${sp.name}${sp.level ? ` (level ${level} slot)` : ''}.`];
  if (sp.conc) {
    if (caster.concentration) lines.push(endConcentration(g, caster));
    caster.concentration = { spell: sp.name, targets: [], condition: sp.cond };
  }
  const maxT = sp.targets ?? 1;
  let tg = targets.slice(0, Math.max(1, maxT + (sp.name === 'Hold Person' || sp.name === 'Hold Monster' || sp.name === 'Banishment' ? up : 0)));
  if (sp.range === 0 && !sp.area && tg.length === 0) tg = [caster];
  // range and area checks
  const first = tg[0];
  if (first && sp.range > 0 && first !== caster && distance(caster, first) > sp.range) {
    if (sp.level > 0) sc.slots[level]++;
    if (sp.conc) caster.concentration = undefined;
    return `${first.name} is out of range for ${sp.name} (${distance(caster, first)} ft, range ${sp.range} ft).`;
  }
  if (sp.area && tg.length > 1) {
    const center = sp.range === 0 ? caster : first;
    const size = sp.area[1];
    const inArea = tg.filter((t) => t === center || distance(center, t) <= size);
    const out = tg.filter((t) => !inArea.includes(t));
    if (out.length) lines.push(`(Not in the ${size}-ft ${sp.area[0]}: ${out.map((t) => t.name).join(', ')})`);
    tg = inArea;
  }

  switch (sp.kind) {
    case 'attack': {
      let rays = sp.rays ?? 1;
      if (sp.name === 'Scorching Ray') rays += up;
      if (sp.name === 'Eldritch Blast') rays = cantripTier(casterLevel);
      const agonizing = sp.name === 'Eldritch Blast' && /agonizing/i.test(sheetOf(g, caster)?.features ?? '');
      for (let i = 0; i < rays; i++) {
        const t = tg[i % tg.length];
        if (!t) break;
        const dmg = (sp.dmg ?? []).map(([dice, type]) => [sp.scale && sp.name !== 'Eldritch Blast' ? scaleDice(dice) : up && sp.upcast ? scaleDice(dice) : dice, type] as [string, string]);
        if (sp.name === 'Spiritual Weapon') dmg[0][0] += `+${castMod}`;
        if (agonizing) dmg[0][0] += `+${castMod}`;
        lines.push(makeAttack(g, caster, t, { name: sp.name, hit: sc.hit, dmg, reach: sp.attack === 'melee' ? Math.max(5, sp.range) : undefined, range: sp.attack === 'ranged' ? [sp.range, sp.range] : undefined }, { label: sp.name }));
        if (sp.name === 'Guiding Bolt' && t.hp > 0 && lines[lines.length - 1].includes('hit')) addCondition(t, { name: 'guided', rounds: 1 });
      }
      break;
    }
    case 'save': {
      const dmgDice = (sp.dmg ?? []).map(([dice, type]) => [scaleDice(dice), type] as [string, string]);
      // one damage roll shared by all targets, as in the rules
      const rolled = dmgDice.map(([dice, type]) => [rollDamage(dice).total, type] as [number, string]);
      if (rolled.length) lines.push(`Damage roll: ${rolled.map(([n, t]) => `${n} ${t}`).join(' + ')}.`);
      for (const t of tg) {
        const s = savingThrow(g, t, sp.save!, sc.dc);
        let line = s.text;
        if (rolled.length) {
          if (!s.ok) line += '. ' + applyDamage(g, t, rolled);
          else if (sp.half) line += '. ' + applyDamage(g, t, rolled.map(([n, ty]) => [Math.floor(n / 2), ty]));
          else line += '. No damage.';
        }
        if (!s.ok && sp.cond) {
          line += ' ' + addCondition(t, { name: sp.cond, sourceId: caster.id, save: sp.saveEnds ? { ability: sp.save!, dc: sc.dc } : undefined });
          if (sp.conc && caster.concentration) caster.concentration.targets.push(t.id);
        }
        lines.push(line);
      }
      break;
    }
    case 'auto': {
      if (sp.darts) {
        const darts = sp.darts + up;
        const per: Record<string, number> = {};
        for (let i = 0; i < darts; i++) { const t = tg[i % tg.length]; if (t) per[t.id] = (per[t.id] ?? 0) + roll('1d4+1').total; }
        for (const [id, n] of Object.entries(per)) { const t = g.creatures.find((x) => x.id === id)!; lines.push(applyDamage(g, t, [[n, 'force']])); }
      } else {
        for (const t of tg) lines.push(applyDamage(g, t, (sp.dmg ?? []).map(([dice, type]) => [rollDamage(scaleDice(dice)).total, type])));
      }
      break;
    }
    case 'heal': {
      for (const t of tg.length ? tg : [caster]) {
        if (sp.name === 'Revivify') {
          if (t.dead) { t.dead = false; t.hp = 1; removeCondition(t, 'unconscious'); t.deathSaves = { ok: 0, fail: 0 }; lines.push(`${t.name} returns to life with 1 HP!`); }
          else lines.push(`${t.name} isn't dead.`);
          continue;
        }
        const amount = sp.name === 'Heal' ? 70 + 10 * up : Math.max(0, roll(`${scaleDice(sp.heal!)}+${castMod}`).total);
        lines.push(heal(t, amount));
      }
      break;
    }
    case 'buff': {
      for (const t of tg.length ? tg : [caster]) {
        const b = sp.buff ?? {};
        if (b.ac) { t.ac += b.ac; lines.push(`${t.name}'s AC is now ${t.ac}.`); if (sp.name === 'Shield') addCondition(t, { name: 'shielded', rounds: 1 }); }
        if (b.bless) { addCondition(t, { name: 'blessed', sourceId: caster.id }); lines.push(`${t.name} is blessed (+1d4 to attacks and saves).`); }
        if (b.tempHp) { const n = roll(b.tempHp).total; t.tempHp = Math.max(t.tempHp, n); lines.push(`${t.name} gains ${n} temporary HP.`); }
        if (b.maxHp) { const n = b.maxHp * (1 + up); t.maxHp += n; t.hp += n; lines.push(`${t.name}'s HP max rises by ${n}.`); }
        if (b.extraDmg) { addCondition(t, { name: 'marked', sourceId: caster.id }); lines.push(`${t.name} is marked by ${caster.name}.`); }
        if (sp.cond) lines.push(addCondition(t, { name: sp.cond, sourceId: caster.id }));
        if (sp.name === 'Heroism') addCondition(t, { name: 'heroism', sourceId: caster.id });
        if (sp.name === 'Misty Step') lines.push(`${caster.name} vanishes in silver mist and reappears up to 30 ft away.`);
        if (caster.concentration) caster.concentration.targets.push(t.id);
      }
      break;
    }
  }
  if (sp.note && !['Shield', 'Misty Step'].includes(sp.name)) lines.push(`(${sp.note})`);
  return lines.join('\n');
}

// ---------- movement ----------

/** Move up to `ft` toward (or away from) a target. Leaving an enemy's reach provokes opportunity attacks. */
export function move(g: GameState, c: Creature, target: Creature | undefined, ft: number, away = false): string {
  if (has(c, 'grappled') || has(c, 'restrained')) return `${c.name} can't move (${has(c, 'grappled') ? 'grappled' : 'restrained'}).`;
  let steps = Math.floor(ft / 5);
  if (has(c, 'prone')) { removeCondition(c, 'prone'); steps = Math.max(0, steps - Math.ceil(c.speed / 10)); }
  if (!target || steps <= 0) return `${c.name} stays put.`;
  if (!away && distance(c, target) <= 5) return `${c.name} is already next to ${target.name}.`;
  const start = { ...c.pos };
  const threatenedBefore = g.creatures.filter((o) => o.side !== c.side && !incapacitated(o) && distance(o, c) <= reachOf(o));
  let moved = 0;
  const sq = (x: number, y: number) => Math.max(Math.abs(x - target.pos.x), Math.abs(y - target.pos.y));
  for (let i = 0; i < steps; i++) {
    if (!away && distance(c, target) <= 5) break;
    const here = sq(c.pos.x, c.pos.y);
    let best: { x: number; y: number } | undefined;
    let bestScore = here;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const nx = c.pos.x + dx;
      const ny = c.pos.y + dy;
      if (occupied(g, nx, ny, c)) continue;
      const score = sq(nx, ny);
      if (away ? score > bestScore : score < bestScore) { bestScore = score; best = { x: nx, y: ny }; }
    }
    if (!best) break;
    c.pos = best;
    moved += 5;
  }
  const d2 = distance(c, target);
  let text = `${c.name} moves ${moved} ft ${away ? 'away from' : 'toward'} ${target.name} (now ${d2} ft away).`;
  if (!has(c, 'disengaged')) {
    for (const o of threatenedBefore) {
      if (distance(o, c) > reachOf(o) && !o.used.reaction && !isDown(c)) {
        const a = bestMelee(o);
        if (!a) continue;
        o.used.reaction = true;
        const saved = { ...c.pos };
        c.pos = start; // the attack happens as the target leaves reach
        text += `\nOpportunity attack! ${makeAttack(g, o, c, a)}`;
        c.pos = saved;
      }
    }
  }
  return text;
}

const reachOf = (c: Creature) => Math.max(5, ...c.attacks.filter((a) => a.reach).map((a) => a.reach!));
export const bestMelee = (c: Creature) => c.attacks.filter((a) => a.hit !== undefined && a.reach).sort((a, b) => (b.hit ?? 0) - (a.hit ?? 0))[0];

// ---------- combat flow ----------

export function freshEconomy(c: Creature): Economy {
  return { action: true, bonus: true, reaction: true, move: has(c, 'grappled') || has(c, 'restrained') ? 0 : c.speed, attacksLeft: 0, dodging: false, disengaged: false };
}

/** Spawn monsters ("Goblin x3, Hobgoblin; ally Guard x2") and roll initiative. */
export function startCombat(g: GameState, spec: string): string {
  const lines: string[] = [];
  const [enemySpec, allySpec] = spec.split(/;\s*all(?:y|ies)\s*:?/i);
  const spawn = (part: string, side: Side) => {
    for (const chunk of part.split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = chunk.match(/^(.*?)(?:\s*[x×]\s*(\d+)|\s+\((\d+)\))?$/i);
      const name = (m?.[1] ?? chunk).trim();
      const count = Math.min(12, Number(m?.[2] ?? m?.[3] ?? 1));
      const found = findMonster(name);
      if (!found.m) { lines.push(`(No stat block found for "${name}"; skipped.)`); continue; }
      if (found.note) lines.push(`(${found.note})`);
      for (let i = 0; i < count; i++) {
        const label = count > 1 ? `${name} ${i + 1}` : name;
        g.creatures.push(creatureFromMonster(found.m, side, label));
      }
    }
  };
  spawn(enemySpec ?? '', 'enemy');
  if (allySpec) spawn(allySpec, 'ally');
  // Formation: party on the left, enemies ~30 ft away on the right.
  const party = g.creatures.filter((c) => c.side !== 'enemy' && !c.dead);
  const foes = g.creatures.filter((c) => c.side === 'enemy' && !c.dead);
  party.forEach((c, i) => { c.pos = { x: 2 + (i % 2), y: 2 + Math.floor(i / 2) * 2 + (i % 2) }; });
  let y = 1;
  foes.forEach((c, i) => { c.pos = { x: 9 + (i % 3) * 2, y }; y += c.size + (i % 3 === 2 ? 0 : 0); if (i % 3 === 2) y += 1; });
  const init = g.creatures.filter((c) => !c.dead).map((c) => {
    const r = d20(c.initMod);
    return { c, total: r.total, text: `${c.name} ${r.text}` };
  }).sort((a, b) => b.total - a.total || b.c.initMod - a.c.initMod);
  g.combat = { round: 1, order: init.map((x) => x.c.id), index: 0, economy: freshEconomy(init[0].c) };
  g.creatures.forEach((c) => { c.used.reaction = false; });
  lines.push(`Roll for initiative! ${init.map((x) => x.text).join(' · ')}`);
  lines.push(`Order: ${init.map((x) => `${x.c.name} (${x.total})`).join(' → ')}`);
  return lines.join('\n');
}

export function currentCreature(g: GameState): Creature | undefined {
  if (!g.combat) return undefined;
  return g.creatures.find((c) => c.id === g.combat!.order[g.combat!.index]);
}

/** Start-of-turn upkeep. Returns log text; sets `skip` if the creature can't act. */
export function startTurn(_g: GameState, c: Creature): { text: string; skip: boolean } {
  const lines: string[] = [];
  c.used.reaction = false;
  removeCondition(c, 'dodging');
  removeCondition(c, 'disengaged');
  removeCondition(c, 'reckless');
  if (has(c, 'shielded')) { c.ac -= 5; removeCondition(c, 'shielded'); }
  if (c.legendary) c.legendary.left = c.legendary.max;
  // recharge abilities
  for (const a of c.attacks.filter((x) => x.recharge && c.used[x.name])) {
    const r = roll('1d6').total;
    if (r >= a.recharge!) { c.used[a.name] = false; lines.push(`${c.name}'s ${a.name} recharges (rolled ${r}).`); }
  }
  if (c.dead) return { text: lines.join('\n'), skip: true };
  if (c.kind === 'pc' && c.hp <= 0) {
    if (c.stable) return { text: `${c.name} is unconscious but stable.`, skip: true };
    const r = d20(0);
    if (r.natural === 20) { c.hp = 1; removeCondition(c, 'unconscious'); c.deathSaves = { ok: 0, fail: 0 }; lines.push(`${c.name} death save: natural 20! Regains 1 HP and wakes up.`); return { text: lines.join('\n'), skip: false }; }
    if (r.natural === 1) c.deathSaves.fail += 2;
    else if (r.natural >= 10) c.deathSaves.ok++;
    else c.deathSaves.fail++;
    lines.push(`${c.name} death save: ${r.natural} → ${c.deathSaves.ok} successes / ${c.deathSaves.fail} failures.`);
    if (c.deathSaves.fail >= 3) { c.dead = true; lines.push(`${c.name} has died.`); }
    else if (c.deathSaves.ok >= 3) { c.stable = true; lines.push(`${c.name} is stable.`); }
    return { text: lines.join('\n'), skip: true };
  }
  if (incapacitated(c)) {
    lines.push(`${c.name} is ${c.conditions.map((x) => x.name).filter((x) => INCAP.includes(x)).join(', ')} and can't act.`);
    return { text: lines.join('\n'), skip: true };
  }
  return { text: lines.join('\n'), skip: false };
}

/** End-of-turn upkeep: repeat saves against save-ends conditions, expire timed ones. */
export function endTurn(g: GameState, c: Creature): string {
  const lines: string[] = [];
  for (const cond of [...c.conditions]) {
    if (cond.save && !c.dead && c.hp > 0) {
      const s = savingThrow(g, c, cond.save.ability, cond.save.dc);
      if (s.ok) { removeCondition(c, cond.name); lines.push(`${s.text} — no longer ${cond.name}.`); }
    }
    if (cond.rounds !== undefined) {
      cond.rounds--;
      if (cond.rounds <= 0 && cond.name !== 'shielded') removeCondition(c, cond.name);
    }
  }
  return lines.join('\n');
}

export function combatOver(g: GameState): 'party' | 'enemy' | undefined {
  const foes = g.creatures.filter((c) => c.side === 'enemy' && !c.dead && c.hp > 0);
  const friends = g.creatures.filter((c) => c.side !== 'enemy' && !c.dead && c.hp > 0);
  if (!foes.length) return 'party';
  if (!friends.length) return 'enemy';
  return undefined;
}

/** Advance to the next living creature. Returns log lines for turn transitions. */
export function advanceTurn(g: GameState): string {
  const cb = g.combat!;
  const lines: string[] = [];
  const cur = currentCreature(g);
  if (cur) { const e = endTurn(g, cur); if (e) lines.push(e); }
  for (let guard = 0; guard < cb.order.length + 1; guard++) {
    cb.index++;
    if (cb.index >= cb.order.length) { cb.index = 0; cb.round++; lines.push(`— Round ${cb.round} —`); }
    const next = currentCreature(g);
    if (next && !(next.dead && next.kind === 'monster')) break;
  }
  const next = currentCreature(g)!;
  cb.economy = freshEconomy(next);
  cb.economy.attacksLeft = 0;
  return lines.join('\n');
}

export function endCombat(g: GameState, winner: 'party' | 'enemy'): string {
  const fallen = g.creatures.filter((c) => c.side === 'enemy' && c.dead).map((c) => c.name);
  g.combat = undefined;
  g.creatures = g.creatures.filter((c) => c.kind === 'pc' || (!c.dead && c.side === 'ally'));
  g.creatures.forEach((c) => {
    c.conditions = c.conditions.filter((x) => !['dodging', 'disengaged', 'hidden', 'reckless', 'raging', 'marked', 'blessed', 'baned', 'outlined', 'guided', 'shielded', 'helped'].includes(x.name));
    c.concentration = undefined;
  });
  return winner === 'party'
    ? `Combat over — the party wins.${fallen.length ? ` Defeated: ${fallen.join(', ')}.` : ''}`
    : 'Combat over — the party has fallen.';
}

// ---------- rests ----------

export function rest(g: GameState, kind: 'short' | 'long'): string {
  const lines: string[] = [];
  for (const c of g.creatures.filter((x) => x.kind === 'pc' && !x.dead)) {
    const sh = sheetOf(g, c);
    if (kind === 'long') {
      c.hp = c.maxHp;
      c.conditions = [];
      c.deathSaves = { ok: 0, fail: 0 };
      if (c.spell && sh?.spellcasting) c.spell.slots = [...sh.spellcasting.slots];
      c.used = {};
      lines.push(`${c.name}: full HP, spell slots and abilities restored.`);
    } else {
      const lvl = sh?.level ?? 1;
      const dice = Math.max(1, Math.ceil(lvl / 2));
      const hd = /barbarian/i.test(sh?.cls ?? '') ? 12 : /fighter|paladin|ranger/i.test(sh?.cls ?? '') ? 10 : /sorcerer|wizard/i.test(sh?.cls ?? '') ? 6 : 8;
      const r = roll(`${dice}d${hd}+${dice * mod(c.abilities.con)}`);
      const before = c.hp;
      c.hp = Math.min(c.maxHp, Math.max(c.hp, 0) + Math.max(0, r.total));
      if (before <= 0 && c.hp > 0) removeCondition(c, 'unconscious');
      if (/warlock/i.test(sh?.cls ?? '') && c.spell && sh?.spellcasting) c.spell.slots = [...sh.spellcasting.slots];
      lines.push(`${c.name} spends ${dice} Hit Dice: +${c.hp - before} HP (${c.hp}/${c.maxHp}).`);
    }
  }
  return `${kind === 'long' ? 'Long' : 'Short'} rest.\n${lines.join('\n')}`;
}

export { findSpell };
