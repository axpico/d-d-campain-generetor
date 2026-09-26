import { uid } from '../lib/rng';
import { mod } from '../lib/dice';
import { ABILITIES, type Ability, type Attack, type Creature, type PcSheet, type SheetAttack, type Side } from './types';
import { findSpell } from './spells';

// ---------- SRD monster data (lazy-loaded: ~430 KB, only needed in play mode) ----------

interface SrdAction { n: string; t: string; hit?: number; dmg?: [string, string][]; reach?: number; range?: [number, number]; dc?: number; save?: Ability; half?: number; recharge?: number; area?: [string, number]; cond?: string }
export interface SrdMonster {
  name: string; cr: number; type: string; size: string; ac: number; hp: number; hpDice: string; speed: number; fly?: number;
  ab: Record<Ability, number>; saves?: Partial<Record<Ability, number>>; init: number; res?: string[]; imm?: string[]; vul?: string[]; cimm?: string[];
  multi?: number; multiText?: string; actions: SrdAction[]; traits: [string, string][]; legendary?: [string, string, number][]; reactions: [string, string][];
}

let srd: Map<string, SrdMonster> | undefined;
export let SRD_ATTRIBUTION = '';

export async function loadSrd(): Promise<Map<string, SrdMonster>> {
  if (srd) return srd;
  const data = (await import('../data/srd/monsters.json')).default as { attribution: string; monsters: SrdMonster[] };
  SRD_ATTRIBUTION = data.attribution;
  srd = new Map(data.monsters.map((m) => [m.name.toLowerCase(), m]));
  return srd;
}

/** 2024 names used by the campaign generator → closest SRD 5.1 stat block. */
const ALIASES: Record<string, string> = {
  'goblin warrior': 'goblin', 'kobold warrior': 'kobold', 'hobgoblin warrior': 'hobgoblin', 'gnoll warrior': 'gnoll',
  'sahuagin warrior': 'sahuagin', 'warrior infantry': 'guard', 'bugbear warrior': 'bugbear', 'priest acolyte': 'acolyte',
  'cultist fanatic': 'cult fanatic', 'minotaur of baphomet': 'minotaur', 'veteran warrior': 'veteran', 'warrior veteran': 'veteran',
  banshee: 'specter', flameskull: 'specter', succubus: 'imp', 'young remorhaz': 'young white dragon', 'death knight': 'vampire',
};

export function findMonster(name: string): { m?: SrdMonster; note?: string } {
  if (!srd) return {};
  const n = name.toLowerCase().trim().replace(/s$/, '');
  const exact = srd.get(name.toLowerCase().trim()) ?? srd.get(n);
  if (exact) return { m: exact };
  const alias = ALIASES[name.toLowerCase().trim()] ?? ALIASES[n];
  if (alias && srd.get(alias)) return { m: srd.get(alias), note: `${name} uses the ${srd.get(alias)!.name} stat block (reskinned)` };
  const partial = [...srd.values()].find((m) => m.name.toLowerCase().includes(n) || n.includes(m.name.toLowerCase()));
  if (partial) return { m: partial, note: `${name} uses the ${partial.name} stat block` };
  return {};
}

export function monsterNames(): string[] {
  return srd ? [...srd.values()].map((m) => m.name) : [];
}

const SIZE: Record<string, number> = { Tiny: 1, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };

function parseSpellcasting(m: SrdMonster): Creature['spell'] {
  const t = m.traits.find(([n]) => /spellcasting/i.test(n))?.[1];
  if (!t) return undefined;
  const dc = Number(t.match(/spell save DC (\d+)/i)?.[1] ?? 0);
  const hit = Number(t.match(/([+-]\d+) to hit with spell attacks/i)?.[1] ?? 0);
  const abilityWord = t.match(/spellcasting ability is (\w+)/i)?.[1]?.toLowerCase().slice(0, 3) as Ability | undefined;
  const slots = Array(10).fill(0);
  const known: string[] = [];
  for (const line of t.split(/\n|(?=\d(?:st|nd|rd|th) level)|(?=Cantrips)/)) {
    const lv = line.match(/(\d)(?:st|nd|rd|th) level \((\d+) slots?\)/i);
    if (lv) slots[Number(lv[1])] = Number(lv[2]);
    const list = line.split(':')[1];
    if (list && /level|cantrips|at will|\/day/i.test(line)) known.push(...list.split(',').map((x) => x.replace(/\*|\./g, '').trim()).filter(Boolean));
  }
  return { dc, hit, ability: abilityWord && ABILITIES.includes(abilityWord) ? abilityWord : 'int', known, slots };
}

export function creatureFromMonster(m: SrdMonster, side: Side = 'enemy', label?: string): Creature {
  const attacks: Attack[] = m.actions.map((a) => ({
    name: a.n, hit: a.hit, dmg: a.dmg, reach: a.reach ?? (a.hit !== undefined && !a.range ? 5 : undefined), range: a.range,
    dc: a.dc, save: a.save, half: !!a.half, area: a.area, cond: a.cond, recharge: a.recharge, text: a.t,
  }));
  const saves = Object.fromEntries(ABILITIES.map((ab) => [ab, m.saves?.[ab] ?? mod(m.ab[ab])])) as Record<Ability, number>;
  return {
    id: uid(), name: label ?? m.name, side, kind: 'monster', monster: m.name,
    ac: m.ac, hp: m.hp, maxHp: m.hp, tempHp: 0, speed: Math.max(m.speed, m.fly ?? 0) || 30,
    abilities: m.ab, saves, initMod: m.init ?? mod(m.ab.dex),
    attacks, multi: m.multi, multiText: m.multiText, spell: parseSpellcasting(m),
    res: m.res ?? [], imm: m.imm ?? [], vul: m.vul ?? [], condImm: (m.cimm ?? []).map((c) => c.toLowerCase()),
    conditions: [], pos: { x: 0, y: 0 }, size: SIZE[m.size] ?? 1,
    dead: false, deathSaves: { ok: 0, fail: 0 }, stable: false,
    legendary: m.legendary?.length ? { max: 3, left: 3, actions: m.legendary } : undefined,
    used: {}, potions: 0, traits: m.traits,
  };
}

export function creatureFromSheet(sh: PcSheet): Creature {
  const saves = Object.fromEntries(ABILITIES.map((ab) => [ab, mod(sh.abilities[ab]) + (sh.saveProfs.includes(ab) ? sh.profBonus : 0)])) as Record<Ability, number>;
  return {
    id: uid(), name: sh.name, side: 'party', kind: 'pc', sheetId: sh.id,
    ac: sh.ac, hp: sh.maxHp, maxHp: sh.maxHp, tempHp: 0, speed: sh.speed,
    abilities: sh.abilities, saves, initMod: mod(sh.abilities.dex),
    attacks: sh.attacks.map((a) => ({ name: a.name, hit: a.bonus, dmg: [[a.damage, a.type]], reach: a.range ? undefined : a.reach ?? 5, range: a.range })),
    multi: Math.max(1, sh.attacksPerAction),
    spell: sh.spellcasting ? {
      dc: sh.spellcasting.saveDc, hit: sh.spellcasting.attackBonus, ability: sh.spellcasting.ability,
      known: [...sh.spellcasting.cantrips, ...sh.spellcasting.spells], slots: [...sh.spellcasting.slots],
    } : undefined,
    res: [], imm: [], vul: [], condImm: [], conditions: [], pos: { x: 0, y: 0 }, size: 1,
    dead: false, deathSaves: { ok: 0, fail: 0 }, stable: false, used: {}, potions: sh.potions, traits: [],
  };
}

// ---------- Sheet templates (starting point for the sheet editor; the user edits everything) ----------

const HIT_DIE: Record<string, number> = { Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Sorcerer: 6, Wizard: 6 };
const PRIMARY: Record<string, [Ability, Ability]> = {
  Barbarian: ['str', 'con'], Fighter: ['str', 'con'], Paladin: ['str', 'cha'], Ranger: ['dex', 'wis'], Bard: ['cha', 'dex'], Cleric: ['wis', 'con'],
  Druid: ['wis', 'con'], Monk: ['dex', 'wis'], Rogue: ['dex', 'int'], Warlock: ['cha', 'con'], Sorcerer: ['cha', 'con'], Wizard: ['int', 'dex'],
};
const SAVES: Record<string, Ability[]> = {
  Barbarian: ['str', 'con'], Fighter: ['str', 'con'], Paladin: ['wis', 'cha'], Ranger: ['str', 'dex'], Bard: ['dex', 'cha'], Cleric: ['wis', 'cha'],
  Druid: ['int', 'wis'], Monk: ['str', 'dex'], Rogue: ['dex', 'int'], Warlock: ['wis', 'cha'], Sorcerer: ['con', 'cha'], Wizard: ['int', 'wis'],
};
const CASTER: Record<string, 'full' | 'half' | 'pact'> = { Bard: 'full', Cleric: 'full', Druid: 'full', Sorcerer: 'full', Wizard: 'full', Paladin: 'half', Ranger: 'half', Warlock: 'pact' };
const FULL_SLOTS = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const SPELL_PICKS: Record<string, { cantrips: string[]; spells: string[] }> = {
  Wizard: { cantrips: ['Fire Bolt', 'Ray of Frost'], spells: ['Magic Missile', 'Shield', 'Sleep', 'Scorching Ray', 'Misty Step', 'Fireball', 'Lightning Bolt', 'Ice Storm', 'Cone of Cold', 'Chain Lightning', 'Disintegrate', 'Finger of Death', 'Meteor Swarm'] },
  Sorcerer: { cantrips: ['Fire Bolt', 'Shocking Grasp'], spells: ['Chromatic Orb', 'Shield', 'Scorching Ray', 'Fireball', 'Haste', 'Greater Invisibility', 'Cone of Cold', 'Chain Lightning', 'Disintegrate'] },
  Cleric: { cantrips: ['Sacred Flame', 'Toll the Dead'], spells: ['Cure Wounds', 'Healing Word', 'Bless', 'Guiding Bolt', 'Shield of Faith', 'Spiritual Weapon', 'Hold Person', 'Spirit Guardians', 'Mass Healing Word', 'Revivify', 'Banishment', 'Flame Strike', 'Mass Cure Wounds', 'Heal', 'Harm'] },
  Druid: { cantrips: ['Produce Flame', 'Thorn Whip'], spells: ['Cure Wounds', 'Healing Word', 'Entangle', 'Faerie Fire', 'Moonbeam', 'Call Lightning', 'Ice Storm', 'Blight', 'Mass Cure Wounds'] },
  Bard: { cantrips: ['Vicious Mockery'], spells: ['Healing Word', 'Faerie Fire', 'Command', 'Shatter', 'Invisibility', 'Hypnotic Pattern', 'Fear', 'Greater Invisibility', 'Hold Monster', 'Mass Cure Wounds'] },
  Warlock: { cantrips: ['Eldritch Blast'], spells: ['Hex', 'Hellish Rebuke', 'Misty Step', 'Hold Person', 'Fear', 'Hypnotic Pattern', 'Banishment', 'Hold Monster', 'Finger of Death'] },
  Paladin: { cantrips: [], spells: ['Divine Smite', 'Bless', 'Cure Wounds', 'Shield of Faith', 'Heroism', 'Aid', 'Revivify'] },
  Ranger: { cantrips: [], spells: ['Hunter\'s Mark', 'Cure Wounds', 'Entangle'] },
};

export function profBonusFor(level: number) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

/** A reasonable level-appropriate sheet to start from. Every field is editable afterwards. */
export function templateSheet(name: string, species: string, cls: string, level: number, hook = ''): PcSheet {
  const [p1, p2] = PRIMARY[cls] ?? ['str', 'con'];
  const base = [15, 14, 13, 12, 10, 8];
  const order: Ability[] = [p1, p2, ...ABILITIES.filter((a) => a !== p1 && a !== p2 && a !== 'con'), 'con'].filter((a, i, arr) => arr.indexOf(a) === i) as Ability[];
  if (!order.includes('con')) order.push('con');
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, 10])) as Record<Ability, number>;
  order.slice(0, 6).forEach((a, i) => { abilities[a] = base[i]; });
  abilities[p1] += 2;
  abilities[p2] += 1;
  const asi = [4, 8, 12, 16, 19].filter((l) => l <= level).length; // put ASIs into the primary stat
  abilities[p1] = Math.min(20, abilities[p1] + asi * 2);
  const pb = profBonusFor(level);
  const hd = HIT_DIE[cls] ?? 8;
  const conM = mod(abilities.con);
  const maxHp = hd + conM + (level - 1) * (Math.floor(hd / 2) + 1 + conM);
  const dexM = mod(abilities.dex);
  const strM = mod(abilities.str);
  const heavy = ['Fighter', 'Paladin'].includes(cls);
  const medium = ['Cleric', 'Ranger', 'Barbarian', 'Druid'].includes(cls);
  const ac = cls === 'Barbarian' ? 10 + dexM + conM : cls === 'Monk' ? 10 + dexM + mod(abilities.wis) : heavy ? 18 : medium ? 14 + Math.min(2, dexM) + (cls === 'Cleric' ? 2 : 0) : 11 + dexM;
  const finesse = dexM > strM;
  const wMod = finesse ? dexM : strM;
  const attacks: SheetAttack[] = [
    finesse
      ? { name: cls === 'Monk' ? 'Unarmed Strike' : 'Rapier', bonus: wMod + pb, damage: `1d${cls === 'Monk' ? (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6) : 8}+${wMod}`, type: cls === 'Monk' ? 'bludgeoning' : 'piercing', reach: 5 }
      : { name: cls === 'Barbarian' ? 'Greataxe' : heavy ? 'Longsword' : 'Mace', bonus: wMod + pb, damage: `${cls === 'Barbarian' ? '1d12' : heavy ? '1d8' : '1d6'}+${wMod}`, type: cls === 'Barbarian' ? 'slashing' : heavy ? 'slashing' : 'bludgeoning', reach: 5 },
  ];
  if (['Ranger', 'Rogue', 'Fighter'].includes(cls)) attacks.push({ name: cls === 'Rogue' ? 'Shortbow' : 'Longbow', bonus: dexM + pb, damage: `1d${cls === 'Rogue' ? 6 : 8}+${dexM}`, type: 'piercing', range: [cls === 'Rogue' ? 80 : 150, cls === 'Rogue' ? 320 : 600] });

  const caster = CASTER[cls];
  let spellcasting: PcSheet['spellcasting'];
  if (caster) {
    const ab = p1 === 'str' || p1 === 'dex' ? p2 : p1;
    const castLevel = caster === 'half' ? Math.ceil(level / 2) : level;
    let slots = [0, ...(FULL_SLOTS[caster === 'half' && level < 2 ? 0 : castLevel] ?? [])];
    if (caster === 'pact') {
      const n = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
      const lv = Math.min(5, Math.ceil(level / 2));
      slots = Array(10).fill(0);
      slots[lv] = n;
    }
    while (slots.length < 10) slots.push(0);
    const maxLevel = slots.reduce((m, v, i) => (v > 0 ? i : m), 0);
    const picks = SPELL_PICKS[cls] ?? { cantrips: [], spells: [] };
    const known = picks.spells.filter((n) => {
      const lvl = spellLevelOf(n);
      return lvl <= Math.max(1, maxLevel);
    });
    spellcasting = { ability: ab, saveDc: 8 + pb + mod(abilities[ab]), attackBonus: pb + mod(abilities[ab]), slots, cantrips: picks.cantrips, spells: known };
  }
  const features: Record<string, string> = {
    Barbarian: `Rage (${level >= 9 ? 3 : 2}/long rest): +${level >= 9 ? 3 : 2} damage on Strength attacks, resistance to bludgeoning/piercing/slashing. Reckless Attack.`,
    Rogue: `Sneak Attack: +${Math.ceil(level / 2)}d6 once per turn (with advantage or an ally adjacent). Cunning Action (Dash/Disengage/Hide as a bonus action).`,
    Fighter: `Second Wind (bonus action, heal 1d10+${level}). Action Surge${level >= 2 ? '' : ' (from level 2)'}.`,
    Paladin: `Lay on Hands (${level * 5} HP pool). Divine Smite (spell). Aura of Protection${level >= 6 ? ` (+${Math.max(1, mod(abilities.cha))} saves)` : ' (level 6)'}.`,
    Monk: `Martial Arts (bonus unarmed strike). Focus points: ${level}. Flurry of Blows.`,
    Ranger: 'Hunter\'s Mark (free casts). Favored Enemy.',
    Cleric: 'Channel Divinity. Divine Spark.',
    Druid: 'Wild Shape. Wild Companion.',
    Bard: `Bardic Inspiration (d${level >= 15 ? 12 : level >= 10 ? 10 : level >= 5 ? 8 : 6}).`,
    Warlock: 'Eldritch Invocations: Agonizing Blast (+CHA to Eldritch Blast damage).',
    Sorcerer: 'Sorcery Points. Metamagic.',
    Wizard: 'Arcane Recovery.',
  };
  return {
    id: uid(), name, species, cls, level, abilities, ac, maxHp, speed: species === 'Dwarf' || species === 'Halfling' || species === 'Gnome' ? 30 : species === 'Goliath' ? 35 : 30,
    profBonus: pb, saveProfs: SAVES[cls] ?? [], skillProfs: [], expertise: [],
    attacksPerAction: level >= 5 && ['Fighter', 'Barbarian', 'Paladin', 'Ranger', 'Monk'].includes(cls) ? (cls === 'Fighter' && level >= 20 ? 4 : cls === 'Fighter' && level >= 11 ? 3 : 2) : 1,
    attacks, spellcasting, features: features[cls] ?? '', inventory: '', potions: 2, personality: '', hook,
  };
}

function spellLevelOf(name: string) {
  return findSpell(name)?.level ?? 1;
}
