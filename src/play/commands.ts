// Parses what players/DM write into engine calls, and enforces the action economy.
//
// Combat commands (one per line):
//   SAY: "words"                     MOVE: toward <target> [N ft] | away from <target>
//   ATTACK: <target> [with <weapon>] [+ <feature>]      CAST: <spell> [at level N] [on <t1>, <t2>]
//   USE: <monster action> [on <targets>]                MULTIATTACK: <target>
//   DASH | DODGE | DISENGAGE | HIDE | HELP: <ally> | POTION [: <ally>] | SHOVE: <t> | GRAPPLE: <t>
//   FEATURE: <name> [on <target>] | DO: <anything else, the DM adjudicates> | END
//   Prefix with "BONUS:" to use the bonus action (e.g. "BONUS: CAST Healing Word on Mira").
//
// DM tags (anywhere in DM text):
//   [CHECK <name> <skill> DC n (adv|dis)] [GROUP <skill> DC n] [SAVE <name|party> <ability> DC n (dmg <dice> <type>) (half) (cond <c>)]
//   [DAMAGE <name> <dice> <type>] [HEAL <name> <dice>] [CONDITION <name> <cond>] [REMOVE <name> <cond>]
//   [COMBAT <monster> xN, ...; ally <monster>] [MOOD <mood>] [SCENE next|n] [REST short|long] [END]
import { mod, roll } from '../lib/dice';
import type { Mood } from '../lib/types';
import { ABILITIES, ABILITY_NAME, SKILLS, type Ability, type Attack, type Creature, type GameState } from './types';
import {
  abilityCheck, addCondition, applyDamage, bestMelee, castSpell, distance, findCreature, findSpell, has, heal, incapacitated, isDown,
  log, makeAttack, move, removeCondition, rest, savingThrow, sheetOf, startCombat,
} from './engine';

const clean = (line: string) => line.replace(/^[\s>*\-•]+/, '').replace(/\*\*/g, '').trim();

function parseAbility(word: string): Ability | undefined {
  const w = word.toLowerCase();
  return ABILITIES.find((a) => w.startsWith(a)) ?? (Object.entries(ABILITY_NAME).find(([, n]) => n.toLowerCase() === w)?.[0] as Ability | undefined);
}

function findAttack(c: Creature, name?: string): Attack | undefined {
  const list = c.attacks.filter((a) => a.hit !== undefined || a.dc !== undefined);
  if (!name) return list.find((a) => a.hit !== undefined) ?? list[0];
  const n = name.toLowerCase().replace(/^(my|its|his|her|their|the) /, '').trim();
  return list.find((a) => a.name.toLowerCase() === n)
    ?? list.find((a) => a.name.toLowerCase().includes(n) || n.includes(a.name.toLowerCase().replace(/ \(.*\)/, '')))
    ?? undefined;
}

function targetsFrom(g: GameState, list: string | undefined, actor: Creature, hostileDefault = true): Creature[] {
  if (!list) {
    if (!hostileDefault) return [actor];
    const foes = g.creatures.filter((c) => c.side !== actor.side && c.side !== (actor.side === 'party' ? 'ally' : 'x') && !isDown(c));
    return foes.sort((a, b) => distance(actor, a) - distance(actor, b)).slice(0, 1);
  }
  if (/^(me|myself|self)$/i.test(list.trim())) return [actor];
  const out: Creature[] = [];
  for (const part of list.split(/,| and /).map((x) => x.trim()).filter(Boolean)) {
    const c = findCreature(g, part, { alive: true }) ?? findCreature(g, part);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Extra damage from a named feature on the sheet, e.g. "Sneak Attack: +3d6 …" (once per turn). */
function featureExtra(g: GameState, c: Creature, name: string): { dice?: string; type: string; note?: string } {
  const sh = sheetOf(g, c);
  const feats = sh?.features ?? '';
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.\\n]*?\\+?(\\d+d\\d+)`, 'i');
  const m = feats.match(re);
  if (!m) return { type: '', note: `${c.name} has no "${name}" feature with extra dice on their sheet.` };
  if (/sneak/i.test(name)) {
    if (c.used.sneak) return { type: '', note: 'Sneak Attack already used this turn.' };
    c.used.sneak = true;
  }
  return { dice: m[1], type: /radiant|smite/i.test(name) ? 'radiant' : 'weapon' };
}

export interface CommandResult { lines: string[]; endTurn: boolean; freeform: string[]; said: string[] }

/** Execute a creature's turn text. Only valid in combat on that creature's turn. */
export function runCombatCommands(g: GameState, actor: Creature, text: string): CommandResult {
  const e = g.combat!.economy;
  const res: CommandResult = { lines: [], endTurn: false, freeform: [], said: [] };
  const out = (s: string) => { if (s) res.lines.push(s); };
  const needAction = (what: string) => { if (!e.action) { out(`(${actor.name} has already used their action — can't ${what}.)`); return false; } e.action = false; return true; };
  const needBonus = (what: string) => { if (!e.bonus) { out(`(${actor.name} has already used their bonus action — can't ${what}.)`); return false; } e.bonus = false; return true; };

  for (const raw of text.split('\n')) {
    if (isDown(actor) || incapacitated(actor)) break;
    let line = clean(raw);
    if (!line) continue;
    let bonus = false;
    const bm = line.match(/^BONUS(?: ACTION)?\s*:\s*(.*)$/i);
    if (bm) { bonus = true; line = bm[1].trim(); }
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^SAY\s*:\s*(.+)$/i))) { res.said.push(m[1].trim()); continue; }
    if (/^END(\s+TURN)?\.?$/i.test(line)) { res.endTurn = true; break; }

    if ((m = line.match(/^MOVE\s*:?\s*(toward|towards|to|closer to|next to|adjacent to|away from)?\s*(.+?)(?:\s+(\d+)\s*(?:ft|feet))?\.?$/i))) {
      const away = /away/i.test(m[1] ?? '');
      const t = findCreature(g, m[2], { alive: true });
      if (!t) { out(`(${actor.name} can't find "${m[2]}" to move ${away ? 'away from' : 'toward'}.)`); continue; }
      const want = m[3] ? Number(m[3]) : e.move;
      const ft = Math.min(e.move, want);
      if (ft <= 0) { out(`(${actor.name} has no movement left.)`); continue; }
      const before = { ...actor.pos };
      out(move(g, actor, t, ft, away));
      const used = Math.max(Math.abs(actor.pos.x - before.x), Math.abs(actor.pos.y - before.y)) * 5;
      e.move -= Math.max(used, 0);
      continue;
    }

    if ((m = line.match(/^ATTACK\s*:?\s*(.+?)(?:\s+with\s+(?:my |its |a |an |the )?(.+?))?(?:\s*\+\s*(.+))?\.?$/i))) {
      const t = targetsFrom(g, m[1], actor)[0];
      if (!t) { out(`(No valid target "${m[1]}".)`); continue; }
      const a = (m[2] ? findAttack(actor, m[2]) : undefined) ?? defaultWeapon(actor, t, e.move);
      if (!a || a.hit === undefined) { out(`(${actor.name} has no weapon attack "${m[2] ?? ''}".)`); continue; }
      if (bonus) {
        if (!needBonus('make a bonus attack')) continue;
      } else if (e.attacksLeft <= 0) {
        if (!needAction('attack')) continue;
        e.attacksLeft = Math.max(1, actor.multi ?? 1);
      }
      if (!bonus) e.attacksLeft--;
      const extra: [string, string][] = [];
      let sneak = false;
      if (m[3]) {
        const isSneak = /sneak/i.test(m[3]);
        const allyNear = g.creatures.some((o) => o !== actor && o.side === actor.side && !incapacitated(o) && distance(o, t) <= 5);
        const advantage = ['hidden', 'invisible', 'helped'].some((x) => has(actor, x)) || ['paralyzed', 'stunned', 'unconscious', 'restrained', 'prone', 'blinded'].some((x) => has(t, x));
        if (isSneak && !allyNear && !advantage) {
          out(`(Sneak Attack needs advantage or an ally next to ${t.name}; attacking without it.)`);
        } else {
          const f = featureExtra(g, actor, m[3].trim());
          if (f.dice) { extra.push([f.dice, f.type === 'weapon' ? (a.dmg?.[0]?.[1] ?? 'piercing') : f.type]); sneak = isSneak; }
          else if (f.note) out(`(${f.note})`);
        }
      }
      // Auto-approach for melee if close enough to reach this turn
      if (a.reach && !a.range && distance(actor, t) > a.reach && e.move > 0 && distance(actor, t) - a.reach <= e.move) {
        const before = { ...actor.pos };
        out(move(g, actor, t, e.move));
        e.move -= Math.max(Math.abs(actor.pos.x - before.x), Math.abs(actor.pos.y - before.y)) * 5;
      }
      const result = makeAttack(g, actor, t, a, { extra });
      if (sneak && !/→ (hit|CRITICAL)/.test(result)) actor.used.sneak = false; // only spent on a hit
      out(result);
      continue;
    }

    if ((m = line.match(/^CAST\s*:?\s*(.+?)(?:\s+(?:at|using a)\s+(?:level\s*|slot\s*)?(\d)(?:st|nd|rd|th)?(?:[- ]level)?(?:\s+slot)?)?(?:\s+(?:on|at|targeting)\s+(.+?))?\.?$/i))) {
      const sp = findSpell(m[1]);
      const known = actor.spell?.known.some((k) => k.toLowerCase() === (sp?.name ?? m![1]).toLowerCase() || k.toLowerCase().startsWith(m![1].toLowerCase()));
      if (!actor.spell) { out(`(${actor.name} can't cast spells.)`); continue; }
      if (!sp) {
        // Not automated: consume the action and let the DM adjudicate with tags.
        if (!(bonus ? needBonus('cast') : needAction('cast'))) continue;
        res.freeform.push(`${actor.name} casts ${m[1]}${m[3] ? ` on ${m[3]}` : ''}${m[2] ? ` (level ${m[2]} slot)` : ''}. Spell save DC ${actor.spell.dc}, spell attack +${actor.spell.hit}.`);
        continue;
      }
      if (!known && actor.kind === 'pc') out(`(Note: ${sp.name} isn't on ${actor.name}'s spell list; allowing it.)`);
      const isBonus = sp.time === 'bonus' || bonus;
      if (sp.time !== 'reaction' && !(isBonus ? needBonus(`cast ${sp.name}`) : needAction(`cast ${sp.name}`))) continue;
      const hostile = sp.kind === 'attack' || sp.kind === 'save' || sp.kind === 'auto';
      const tg = targetsFrom(g, m[3], actor, hostile);
      if (sp.name === 'Divine Smite' && tg[0]) {
        out(castSpell(g, actor, sp, tg, Number(m[2] ?? 1)));
        continue;
      }
      out(castSpell(g, actor, sp, tg, Number(m[2] ?? sp.level)));
      continue;
    }

    if ((m = line.match(/^MULTIATTACK\s*:?\s*(?:on\s+)?(.+?)\.?$/i))) {
      if (!needAction('multiattack')) continue;
      const tg = targetsFrom(g, m[1], actor);
      const seq = multiSequence(actor);
      seq.forEach((a, i) => {
        const t = tg[i % Math.max(1, tg.length)] ?? targetsFrom(g, undefined, actor)[0];
        if (!t || t.dead) return;
        if (a.reach && distance(actor, t) > a.reach && e.move > 0) {
          const before = { ...actor.pos };
          out(move(g, actor, t, e.move));
          e.move -= Math.max(Math.abs(actor.pos.x - before.x), Math.abs(actor.pos.y - before.y)) * 5;
        }
        out(makeAttack(g, actor, t, a));
      });
      continue;
    }

    if ((m = line.match(/^USE\s*:?\s*(.+?)(?:\s+(?:on|against|at|targeting)\s+(.+?))?\.?$/i))) {
      const a = findAttack(actor, m[1]);
      if (!a) {
        // Not a stat-block action: maybe a trait/feature; the DM adjudicates.
        if (!(bonus ? needBonus('use that') : needAction('use that'))) continue;
        res.freeform.push(`${actor.name} uses ${m[1]}${m[2] ? ` on ${m[2]}` : ''}.`);
        continue;
      }
      if (a.recharge && actor.used[a.name]) { out(`(${a.name} hasn't recharged yet.)`); continue; }
      if (!(bonus ? needBonus(`use ${a.name}`) : needAction(`use ${a.name}`))) continue;
      if (a.recharge) actor.used[a.name] = true;
      const tg = targetsFrom(g, m[2], actor);
      if (a.hit !== undefined) {
        for (const t of tg.slice(0, 1)) out(makeAttack(g, actor, t, a));
      } else if (a.dc && a.save) {
        const lines = [`${actor.name} uses ${a.name}!`];
        const dmg = (a.dmg ?? []).map(([dice, type]) => [roll(dice).total, type] as [number, string]);
        if (dmg.length) lines.push(`Damage roll: ${dmg.map(([n, t]) => `${n} ${t}`).join(' + ')}.`);
        const area = a.area?.[1] ?? 0;
        for (const t of tg.filter((t2, i) => i === 0 || !area || distance(tg[0], t2) <= area)) {
          const s = savingThrow(g, t, a.save, a.dc);
          let l = s.text;
          if (dmg.length) l += '. ' + (s.ok ? (a.half ? applyDamage(g, t, dmg.map(([n, ty]) => [Math.floor(n / 2), ty])) : 'No damage.') : applyDamage(g, t, dmg));
          if (!s.ok && a.cond) l += ' ' + addCondition(t, { name: a.cond, save: { ability: a.save, dc: a.dc }, sourceId: actor.id });
          lines.push(l);
        }
        out(lines.join('\n'));
      } else {
        res.freeform.push(`${actor.name} uses ${a.name}: ${a.text ?? ''}`);
      }
      continue;
    }

    if ((m = line.match(/^(DASH|DODGE|DISENGAGE|HIDE)\b/i))) {
      const what = m[1].toUpperCase();
      const cunning = bonus && /cunning action/i.test(sheetOf(g, actor)?.features ?? '');
      if (bonus && !cunning) { out(`(${actor.name} doesn't have Cunning Action; ${what.toLowerCase()} takes an action.)`); bonus = false; }
      if (!(bonus ? needBonus(what.toLowerCase()) : needAction(what.toLowerCase()))) continue;
      if (what === 'DASH') { e.move += actor.speed; out(`${actor.name} dashes (+${actor.speed} ft of movement).`); }
      if (what === 'DODGE') { addCondition(actor, { name: 'dodging' }); out(`${actor.name} takes the Dodge action.`); }
      if (what === 'DISENGAGE') { addCondition(actor, { name: 'disengaged' }); out(`${actor.name} disengages.`); }
      if (what === 'HIDE') {
        const r = abilityCheck(g, actor, 'Stealth', 15);
        out(r.text);
        if (r.ok) addCondition(actor, { name: 'hidden' });
      }
      continue;
    }

    if ((m = line.match(/^HELP\s*:?\s*(.+?)\.?$/i))) {
      const t = findCreature(g, m[1], { alive: true });
      if (!t || !needAction('help')) continue;
      addCondition(t, { name: 'helped', rounds: 1 });
      out(`${actor.name} helps ${t.name} (advantage on their next attack).`);
      continue;
    }

    if ((m = line.match(/^(?:POTION|DRINK(?: POTION)?|USE POTION)\s*:?\s*(.*?)\.?$/i))) {
      if (actor.potions <= 0) { out(`(${actor.name} has no Potions of Healing.)`); continue; }
      const t = m[1] ? findCreature(g, m[1]) ?? actor : actor;
      if (t !== actor && distance(actor, t) > 5) { out(`(${t.name} is too far away to give a potion.)`); continue; }
      if (!needBonus('drink a potion')) continue; // 2024: bonus action
      actor.potions--;
      out(`${actor.name} uses a Potion of Healing. ${heal(t, roll('2d4+2').total)}`);
      continue;
    }

    if ((m = line.match(/^(SHOVE|GRAPPLE)\s*:?\s*(.+?)\.?$/i))) {
      const t = findCreature(g, m[2], { alive: true });
      if (!t) continue;
      if (distance(actor, t) > 5) { out(`(${t.name} is out of reach.)`); continue; }
      if (e.attacksLeft <= 0) { if (!needAction(m[1].toLowerCase())) continue; e.attacksLeft = Math.max(1, actor.multi ?? 1); }
      e.attacksLeft--;
      const pb = sheetOf(g, actor)?.profBonus ?? 2;
      const dc = 8 + mod(actor.abilities.str) + pb;
      const ab: Ability = t.saves.str >= t.saves.dex ? 'str' : 'dex';
      const s = savingThrow(g, t, ab, dc);
      out(`${actor.name} tries to ${m[1].toLowerCase()} ${t.name}. ${s.text}${s.ok ? '.' : ' ' + addCondition(t, { name: /shove/i.test(m[1]) ? 'prone' : 'grappled', sourceId: actor.id })}`);
      continue;
    }

    if ((m = line.match(/^FEATURE\s*:?\s*(.+?)(?:\s+on\s+(.+?))?\.?$/i))) {
      out(useFeature(g, actor, m[1].trim(), m[2], bonus, needAction, needBonus, res));
      continue;
    }

    if ((m = line.match(/^(?:DO|ACTION)\s*:\s*(.+)$/i))) { res.freeform.push(`${actor.name}: ${m[1]}`); continue; }
    // Unrecognised lines are treated as in-character speech/flavor.
    if (line.length > 3 && !/^(TURN|STATUS|THINK|PLAN)\b/i.test(line)) res.said.push(line);
  }
  return res;
}

/** No weapon named: melee if the target is (or can be) in reach this turn, otherwise the best ranged attack in range. */
function defaultWeapon(c: Creature, t: Creature, moveLeft: number): Attack | undefined {
  const d = distance(c, t);
  const melee = bestMelee(c);
  const ranged = c.attacks.filter((a) => a.hit !== undefined && a.range && d <= a.range[1]).sort((a, b) => (b.hit ?? 0) - (a.hit ?? 0))[0];
  if (melee && d - (melee.reach ?? 5) <= moveLeft) return melee;
  return ranged ?? melee;
}

function multiSequence(c: Creature): Attack[] {
  const weapons = c.attacks.filter((a) => a.hit !== undefined);
  if (!weapons.length) return [];
  const text = c.multiText ?? '';
  const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  const seq: Attack[] = [];
  for (const m of text.matchAll(/(one|two|three|four) (?:with its |attacks? with its |)([a-z ]+?)(?:s\b|,|\.| and)/gi)) {
    const a = weapons.find((w) => w.name.toLowerCase().startsWith(m[2].trim().toLowerCase()));
    if (a) for (let i = 0; i < NUM[m[1].toLowerCase()]; i++) seq.push(a);
  }
  if (seq.length) return seq;
  const best = [...weapons].sort((a, b) => (b.hit ?? 0) - (a.hit ?? 0))[0];
  return Array(Math.max(1, c.multi ?? 1)).fill(best);
}

function useFeature(
  g: GameState, c: Creature, name: string, target: string | undefined, bonus: boolean,
  needAction: (w: string) => boolean, needBonus: (w: string) => boolean, res: CommandResult,
): string {
  const sh = sheetOf(g, c);
  const e = g.combat!.economy;
  const n = name.toLowerCase();
  const lvl = sh?.level ?? 1;
  if (n.startsWith('second wind')) {
    if (c.used.secondWind) return '(Second Wind already used.)';
    if (!needBonus('use Second Wind')) return '';
    c.used.secondWind = true;
    return `${c.name} uses Second Wind. ${heal(c, roll(`1d10+${lvl}`).total)}`;
  }
  if (n.startsWith('rage')) {
    if (!needBonus('rage')) return '';
    addCondition(c, { name: 'raging' });
    return `${c.name} flies into a Rage! (resistance to bludgeoning/piercing/slashing, bonus melee damage)`;
  }
  if (n.startsWith('reckless')) { addCondition(c, { name: 'reckless' }); return `${c.name} attacks recklessly (advantage on attacks; attacks against them have advantage).`; }
  if (n.startsWith('action surge')) {
    if (c.used.actionSurge) return '(Action Surge already used.)';
    c.used.actionSurge = true;
    e.action = true;
    e.attacksLeft = 0;
    return `${c.name} uses Action Surge — one more action!`;
  }
  if (n.startsWith('lay on hands')) {
    if (!needBonus('use Lay on Hands')) return '';
    const amount = Number(name.match(/(\d+)/)?.[1] ?? 5);
    const t = target ? findCreature(g, target) ?? c : c;
    return `${c.name} uses Lay on Hands. ${heal(t, amount)}`;
  }
  if (n.startsWith('flurry')) {
    if (!needBonus('use Flurry of Blows')) return '';
    const t = targetsFrom(g, target, c)[0];
    const a = findAttack(c, 'unarmed') ?? bestMelee(c);
    if (!t || !a) return '';
    return [makeAttack(g, c, t, a), makeAttack(g, c, t, a)].join('\n');
  }
  if (bonus) { if (!needBonus(`use ${name}`)) return ''; } else if (!needAction(`use ${name}`)) return '';
  res.freeform.push(`${c.name} uses ${name}${target ? ` on ${target}` : ''}. (Feature text: ${(sh?.features ?? '').slice(0, 200)})`);
  return '';
}

// ---------- DM tags ----------

const SKILL_RE = Object.keys(SKILLS).sort((a, b) => b.length - a.length).join('|');
const ABIL_RE = 'str(?:ength)?|dex(?:terity)?|con(?:stitution)?|int(?:elligence)?|wis(?:dom)?|cha(?:risma)?';

export interface TagEffects { combat?: boolean; mood?: Mood; scene?: 'next' | number; end?: boolean; images: string[] }

export function applyDmTags(g: GameState, text: string): { narration: string; results: string[]; fx: TagEffects } {
  const results: string[] = [];
  const fx: TagEffects = { images: [] };
  const narration = text.replace(/\[(CHECK|GROUP|SAVE|DAMAGE|HEAL|CONDITION|REMOVE|COMBAT|MOOD|SCENE|REST|END|IMAGE)\b([^\]]*)\]/gi, (_, tagRaw: string, argRaw: string) => {
    const tag = tagRaw.toUpperCase();
    const arg = argRaw.trim().replace(/^:\s*/, '');
    let m: RegExpMatchArray | null;
    try {
      switch (tag) {
        case 'CHECK':
          if ((m = arg.match(new RegExp(`^(.+?)\\s+(${SKILL_RE}|${ABIL_RE})(?:\\s+check)?\\s+DC\\s*(\\d+)(?:\\s+(adv|dis)\\w*)?`, 'i')))) {
            const who = /^(party|everyone|all)$/i.test(m[1]) ? g.creatures.filter((c) => c.kind === 'pc' && !c.dead) : [findCreature(g, m[1])].filter(Boolean) as Creature[];
            for (const c of who) results.push(abilityCheck(g, c, m[2], Number(m[3]), m[4]?.toLowerCase().startsWith('a') ? 'adv' : m[4] ? 'dis' : undefined).text);
            if (!who.length) results.push(`(DM asked for a check from unknown "${m[1]}")`);
          }
          break;
        case 'GROUP':
          if ((m = arg.match(new RegExp(`^(?:check\\s+)?(${SKILL_RE}|${ABIL_RE})(?:\\s+check)?\\s+DC\\s*(\\d+)`, 'i')))) {
            const pcs = g.creatures.filter((c) => c.kind === 'pc' && !c.dead);
            const rolls = pcs.map((c) => abilityCheck(g, c, m![1], Number(m![2])));
            const ok = rolls.filter((r) => r.ok).length >= Math.ceil(pcs.length / 2);
            results.push(`Group ${m[1]} check DC ${m[2]}:\n${rolls.map((r) => r.text).join('\n')}\n→ group ${ok ? 'SUCCEEDS' : 'FAILS'}`);
          }
          break;
        case 'SAVE':
          if ((m = arg.match(new RegExp(`^(.+?)\\s+(${ABIL_RE})(?:\\s+sav\\w*)?\\s+DC\\s*(\\d+)(.*)$`, 'i')))) {
            const ab = parseAbility(m[2])!;
            const dc = Number(m[3]);
            const rest2 = m[4] ?? '';
            const dmg = rest2.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+([a-z]+)/i);
            const half = /half/i.test(rest2);
            const cond = rest2.match(/cond(?:ition)?\s+([a-z]+)/i)?.[1]?.toLowerCase();
            const who = /^(party|everyone|all)$/i.test(m[1]) ? g.creatures.filter((c) => c.kind === 'pc' && !c.dead) : m[1].split(/,| and /).map((x) => findCreature(g, x.trim())).filter(Boolean) as Creature[];
            const rolled = dmg ? roll(dmg[1].replace(/\s/g, '')).total : 0;
            for (const c of who) {
              const s = savingThrow(g, c, ab, dc);
              let l = s.text;
              if (dmg) l += '. ' + (!s.ok ? applyDamage(g, c, [[rolled, dmg[2]]]) : half ? applyDamage(g, c, [[Math.floor(rolled / 2), dmg[2]]]) : 'No damage.');
              if (!s.ok && cond) l += ' ' + addCondition(c, { name: cond });
              results.push(l);
            }
          }
          break;
        case 'DAMAGE':
          if ((m = arg.match(/^(.+?)\s+(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*([a-z]+)?/i))) {
            const c = findCreature(g, m[1]);
            if (c) results.push(applyDamage(g, c, [[roll(m[2].replace(/\s/g, '')).total, m[3] ?? 'bludgeoning']]));
          }
          break;
        case 'HEAL':
          if ((m = arg.match(/^(.+?)\s+(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)/i))) {
            const c = findCreature(g, m[1]);
            if (c) results.push(heal(c, roll(m[2].replace(/\s/g, '')).total));
          }
          break;
        case 'CONDITION':
          if ((m = arg.match(/^(.+?)\s+([a-z]+)$/i))) { const c = findCreature(g, m[1]); if (c) results.push(addCondition(c, { name: m[2].toLowerCase() })); }
          break;
        case 'REMOVE':
          if ((m = arg.match(/^(.+?)\s+([a-z]+)$/i))) { const c = findCreature(g, m[1]); if (c) { removeCondition(c, m[2].toLowerCase()); results.push(`${c.name} is no longer ${m[2].toLowerCase()}.`); } }
          break;
        case 'COMBAT':
          if (!g.combat && arg) { results.push(startCombat(g, arg)); fx.combat = true; }
          break;
        case 'MOOD': fx.mood = arg.toLowerCase() as Mood; break;
        case 'SCENE': fx.scene = /next/i.test(arg) ? 'next' : Number(arg) || 'next'; break;
        case 'REST': results.push(rest(g, /long/i.test(arg) ? 'long' : 'short')); break;
        case 'END': fx.end = true; break;
        case 'IMAGE': if (arg) fx.images.push(arg); break;
      }
    } catch (e) {
      results.push(`(Couldn't apply [${tag} ${arg}]: ${(e as Error).message})`);
    }
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { narration, results, fx };
}

/** Automatic legendary action after another creature's turn: the first attack-like option on the nearest foe. */
export function legendaryReactions(g: GameState, justActed: Creature): string[] {
  const out: string[] = [];
  for (const c of g.creatures.filter((x) => x.legendary && x.legendary.left > 0 && !isDown(x) && x !== justActed && x.side === 'enemy' && !incapacitated(x))) {
    const opt = c.legendary!.actions.find(([name, , cost]) => cost <= c.legendary!.left && c.attacks.some((a) => a.hit !== undefined && name.toLowerCase().includes(a.name.toLowerCase().split(' ')[0])));
    if (!opt) continue;
    const a = c.attacks.find((x) => x.hit !== undefined && opt[0].toLowerCase().includes(x.name.toLowerCase().split(' ')[0]))!;
    const t = g.creatures.filter((x) => x.side !== c.side && !isDown(x)).sort((p, q) => distance(c, p) - distance(c, q))[0];
    if (!t || (a.reach && distance(c, t) > a.reach)) continue;
    c.legendary!.left -= opt[2];
    out.push(`Legendary action — ${opt[0]}! ${makeAttack(g, c, t, a)}`);
  }
  return out;
}

export { log, has };
