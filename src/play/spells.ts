// Automated core spells (2024 values where they changed). Anything not listed is resolved
// by the DM through the generic resolver (it states attack/save, damage and condition; code rolls).
import type { Ability } from './types';

export interface SpellDef {
  name: string;
  level: number; // 0 = cantrip
  time: 'action' | 'bonus' | 'reaction';
  range: number; // ft; 0 = self, 5 = touch
  kind: 'attack' | 'save' | 'heal' | 'auto' | 'buff';
  attack?: 'melee' | 'ranged';
  save?: Ability;
  dmg?: [string, string][];
  half?: boolean; // half damage on a successful save
  upcast?: string; // extra dice per slot level above the spell's level
  scale?: boolean; // cantrip damage grows at levels 5/11/17
  targets?: number; // max targets (area spells hit whoever is listed and in the area)
  area?: [string, number];
  heal?: string; // + spellcasting modifier is added
  cond?: string; // condition on failed save / hit
  saveEnds?: boolean; // target repeats the save at the end of each of its turns
  conc?: boolean;
  rays?: number; // separate attack rolls (Scorching Ray, Eldritch Blast beams)
  darts?: number; // auto-hit missiles (Magic Missile)
  buff?: { ac?: number; bless?: boolean; bane?: boolean; tempHp?: string; maxHp?: number; extraDmg?: [string, string]; adv?: boolean };
  note?: string;
}

const s = (d: SpellDef) => d;

export const SPELLS: SpellDef[] = [
  // ---- Cantrips
  s({ name: 'Fire Bolt', level: 0, time: 'action', range: 120, kind: 'attack', attack: 'ranged', dmg: [['1d10', 'fire']], scale: true }),
  s({ name: 'Ray of Frost', level: 0, time: 'action', range: 60, kind: 'attack', attack: 'ranged', dmg: [['1d8', 'cold']], scale: true, note: 'speed −10 ft' }),
  s({ name: 'Sacred Flame', level: 0, time: 'action', range: 60, kind: 'save', save: 'dex', dmg: [['1d8', 'radiant']], scale: true }),
  s({ name: 'Toll the Dead', level: 0, time: 'action', range: 60, kind: 'save', save: 'wis', dmg: [['1d8', 'necrotic']], scale: true, note: 'd12 if the target is wounded' }),
  s({ name: 'Eldritch Blast', level: 0, time: 'action', range: 120, kind: 'attack', attack: 'ranged', dmg: [['1d10', 'force']], rays: 1, note: 'extra beams at levels 5/11/17' }),
  s({ name: 'Shocking Grasp', level: 0, time: 'action', range: 5, kind: 'attack', attack: 'melee', dmg: [['1d8', 'lightning']], scale: true, note: 'target can\'t take reactions' }),
  s({ name: 'Chill Touch', level: 0, time: 'action', range: 5, kind: 'attack', attack: 'melee', dmg: [['1d10', 'necrotic']], scale: true }),
  s({ name: 'Vicious Mockery', level: 0, time: 'action', range: 60, kind: 'save', save: 'wis', dmg: [['1d6', 'psychic']], scale: true }),
  s({ name: 'Poison Spray', level: 0, time: 'action', range: 30, kind: 'attack', attack: 'ranged', dmg: [['1d12', 'poison']], scale: true }),
  s({ name: 'Acid Splash', level: 0, time: 'action', range: 60, kind: 'save', save: 'dex', dmg: [['1d6', 'acid']], scale: true, targets: 2, area: ['sphere', 5] }),
  s({ name: 'Produce Flame', level: 0, time: 'bonus', range: 60, kind: 'attack', attack: 'ranged', dmg: [['1d8', 'fire']], scale: true }),
  s({ name: 'Thorn Whip', level: 0, time: 'action', range: 30, kind: 'attack', attack: 'melee', dmg: [['1d6', 'piercing']], scale: true }),
  s({ name: 'Mind Sliver', level: 0, time: 'action', range: 60, kind: 'save', save: 'int', dmg: [['1d6', 'psychic']], scale: true }),
  s({ name: 'Starry Wisp', level: 0, time: 'action', range: 60, kind: 'attack', attack: 'ranged', dmg: [['1d8', 'radiant']], scale: true }),
  s({ name: 'Word of Radiance', level: 0, time: 'action', range: 5, kind: 'save', save: 'con', dmg: [['1d6', 'radiant']], scale: true, targets: 8, area: ['emanation', 5] }),
  // ---- 1st level
  s({ name: 'Magic Missile', level: 1, time: 'action', range: 120, kind: 'auto', dmg: [['1d4+1', 'force']], darts: 3 }),
  s({ name: 'Cure Wounds', level: 1, time: 'action', range: 5, kind: 'heal', heal: '2d8', upcast: '2d8' }),
  s({ name: 'Healing Word', level: 1, time: 'bonus', range: 60, kind: 'heal', heal: '2d4', upcast: '2d4' }),
  s({ name: 'Guiding Bolt', level: 1, time: 'action', range: 120, kind: 'attack', attack: 'ranged', dmg: [['4d6', 'radiant']], upcast: '1d6', note: 'next attack against the target has advantage' }),
  s({ name: 'Burning Hands', level: 1, time: 'action', range: 0, kind: 'save', save: 'dex', dmg: [['3d6', 'fire']], half: true, upcast: '1d6', targets: 6, area: ['cone', 15] }),
  s({ name: 'Thunderwave', level: 1, time: 'action', range: 0, kind: 'save', save: 'con', dmg: [['2d8', 'thunder']], half: true, upcast: '1d8', targets: 6, area: ['cube', 15], note: 'pushed 10 ft on a failed save' }),
  s({ name: 'Inflict Wounds', level: 1, time: 'action', range: 5, kind: 'save', save: 'con', dmg: [['2d10', 'necrotic']], half: true, upcast: '1d10' }),
  s({ name: 'Chromatic Orb', level: 1, time: 'action', range: 90, kind: 'attack', attack: 'ranged', dmg: [['3d8', 'fire']], upcast: '1d8', note: 'choose acid/cold/fire/lightning/poison/thunder' }),
  s({ name: 'Ice Knife', level: 1, time: 'action', range: 60, kind: 'save', save: 'dex', dmg: [['2d6', 'cold']], upcast: '1d6', targets: 4, area: ['sphere', 5] }),
  s({ name: 'Hellish Rebuke', level: 1, time: 'reaction', range: 60, kind: 'save', save: 'dex', dmg: [['2d10', 'fire']], half: true, upcast: '1d10' }),
  s({ name: 'Shield', level: 1, time: 'reaction', range: 0, kind: 'buff', buff: { ac: 5 }, note: '+5 AC until the start of your next turn' }),
  s({ name: 'Bless', level: 1, time: 'action', range: 30, kind: 'buff', targets: 3, conc: true, buff: { bless: true } }),
  s({ name: 'Bane', level: 1, time: 'action', range: 30, kind: 'save', save: 'cha', targets: 3, conc: true, cond: 'baned' }),
  s({ name: 'Shield of Faith', level: 1, time: 'bonus', range: 60, kind: 'buff', conc: true, buff: { ac: 2 } }),
  s({ name: 'Faerie Fire', level: 1, time: 'action', range: 60, kind: 'save', save: 'dex', targets: 6, area: ['cube', 20], conc: true, cond: 'outlined' }),
  s({ name: 'Command', level: 1, time: 'action', range: 60, kind: 'save', save: 'wis', cond: 'prone', note: '"Grovel": falls prone' }),
  s({ name: 'Entangle', level: 1, time: 'action', range: 90, kind: 'save', save: 'str', targets: 6, area: ['square', 20], conc: true, cond: 'restrained', saveEnds: true }),
  s({ name: 'Sleep', level: 1, time: 'action', range: 60, kind: 'save', save: 'wis', targets: 6, area: ['sphere', 5], conc: true, cond: 'unconscious', saveEnds: true }),
  s({ name: 'Hunter\'s Mark', level: 1, time: 'bonus', range: 90, kind: 'buff', conc: true, buff: { extraDmg: ['1d6', 'force'] }, note: 'caster deals +1d6 force on weapon hits' }),
  s({ name: 'Hex', level: 1, time: 'bonus', range: 90, kind: 'buff', conc: true, buff: { extraDmg: ['1d6', 'necrotic'] }, note: 'caster deals +1d6 necrotic on hits' }),
  s({ name: 'Divine Smite', level: 1, time: 'bonus', range: 5, kind: 'auto', dmg: [['2d8', 'radiant']], upcast: '1d8', note: 'cast right after hitting with a melee weapon' }),
  s({ name: 'False Life', level: 1, time: 'action', range: 0, kind: 'buff', buff: { tempHp: '2d4+4' } }),
  s({ name: 'Heroism', level: 1, time: 'action', range: 5, kind: 'buff', conc: true, buff: { tempHp: '5' }, note: 'immune to frightened' }),
  // ---- 2nd level
  s({ name: 'Scorching Ray', level: 2, time: 'action', range: 120, kind: 'attack', attack: 'ranged', dmg: [['2d6', 'fire']], rays: 3 }),
  s({ name: 'Hold Person', level: 2, time: 'action', range: 60, kind: 'save', save: 'wis', conc: true, cond: 'paralyzed', saveEnds: true, note: 'humanoids only' }),
  s({ name: 'Shatter', level: 2, time: 'action', range: 60, kind: 'save', save: 'con', dmg: [['3d8', 'thunder']], half: true, upcast: '1d8', targets: 8, area: ['sphere', 10] }),
  s({ name: 'Moonbeam', level: 2, time: 'action', range: 120, kind: 'save', save: 'con', dmg: [['2d10', 'radiant']], half: true, upcast: '1d10', conc: true, targets: 3, area: ['cylinder', 5] }),
  s({ name: 'Spiritual Weapon', level: 2, time: 'bonus', range: 60, kind: 'attack', attack: 'melee', dmg: [['1d8', 'force']], upcast: '1d8', note: '+ spellcasting modifier' }),
  s({ name: 'Misty Step', level: 2, time: 'bonus', range: 0, kind: 'buff', note: 'teleport up to 30 ft' }),
  s({ name: 'Invisibility', level: 2, time: 'action', range: 5, kind: 'buff', conc: true, cond: 'invisible' }),
  s({ name: 'Blindness/Deafness', level: 2, time: 'action', range: 120, kind: 'save', save: 'con', cond: 'blinded', saveEnds: true }),
  s({ name: 'Web', level: 2, time: 'action', range: 60, kind: 'save', save: 'dex', targets: 6, area: ['cube', 20], conc: true, cond: 'restrained' }),
  s({ name: 'Aid', level: 2, time: 'action', range: 30, kind: 'buff', targets: 3, buff: { maxHp: 5 } }),
  s({ name: 'Prayer of Healing', level: 2, time: 'action', range: 30, kind: 'heal', heal: '2d8', upcast: '1d8', targets: 5 }),
  // ---- 3rd level
  s({ name: 'Fireball', level: 3, time: 'action', range: 150, kind: 'save', save: 'dex', dmg: [['8d6', 'fire']], half: true, upcast: '1d6', targets: 12, area: ['sphere', 20] }),
  s({ name: 'Lightning Bolt', level: 3, time: 'action', range: 0, kind: 'save', save: 'dex', dmg: [['8d6', 'lightning']], half: true, upcast: '1d6', targets: 6, area: ['line', 100] }),
  s({ name: 'Spirit Guardians', level: 3, time: 'action', range: 0, kind: 'save', save: 'wis', dmg: [['3d8', 'radiant']], half: true, upcast: '1d8', conc: true, targets: 8, area: ['emanation', 15] }),
  s({ name: 'Mass Healing Word', level: 3, time: 'bonus', range: 60, kind: 'heal', heal: '2d4', upcast: '1d4', targets: 6 }),
  s({ name: 'Revivify', level: 3, time: 'action', range: 5, kind: 'heal', heal: '0', note: 'returns a creature dead less than a minute to 1 HP' }),
  s({ name: 'Hypnotic Pattern', level: 3, time: 'action', range: 120, kind: 'save', save: 'wis', targets: 8, area: ['cube', 30], conc: true, cond: 'charmed' }),
  s({ name: 'Fear', level: 3, time: 'action', range: 0, kind: 'save', save: 'wis', targets: 6, area: ['cone', 30], conc: true, cond: 'frightened', saveEnds: true }),
  s({ name: 'Haste', level: 3, time: 'action', range: 30, kind: 'buff', conc: true, buff: { ac: 2 }, note: '+2 AC, double speed, one extra limited action' }),
  s({ name: 'Call Lightning', level: 3, time: 'action', range: 120, kind: 'save', save: 'dex', dmg: [['3d10', 'lightning']], half: true, upcast: '1d10', conc: true, targets: 4, area: ['cylinder', 5] }),
  // ---- 4th–5th
  s({ name: 'Ice Storm', level: 4, time: 'action', range: 300, kind: 'save', save: 'dex', dmg: [['2d10', 'bludgeoning'], ['4d6', 'cold']], half: true, upcast: '1d10', targets: 10, area: ['cylinder', 20] }),
  s({ name: 'Blight', level: 4, time: 'action', range: 30, kind: 'save', save: 'con', dmg: [['8d8', 'necrotic']], half: true, upcast: '1d8' }),
  s({ name: 'Banishment', level: 4, time: 'action', range: 30, kind: 'save', save: 'cha', conc: true, cond: 'incapacitated', note: 'banished to a harmless demiplane' }),
  s({ name: 'Greater Invisibility', level: 4, time: 'action', range: 5, kind: 'buff', conc: true, cond: 'invisible' }),
  s({ name: 'Cone of Cold', level: 5, time: 'action', range: 0, kind: 'save', save: 'con', dmg: [['8d8', 'cold']], half: true, upcast: '1d8', targets: 10, area: ['cone', 60] }),
  s({ name: 'Flame Strike', level: 5, time: 'action', range: 60, kind: 'save', save: 'dex', dmg: [['5d6', 'fire'], ['5d6', 'radiant']], half: true, upcast: '1d6', targets: 4, area: ['cylinder', 10] }),
  s({ name: 'Mass Cure Wounds', level: 5, time: 'action', range: 60, kind: 'heal', heal: '5d8', upcast: '1d8', targets: 6 }),
  s({ name: 'Hold Monster', level: 5, time: 'action', range: 90, kind: 'save', save: 'wis', conc: true, cond: 'paralyzed', saveEnds: true }),
  // ---- 6th+
  s({ name: 'Chain Lightning', level: 6, time: 'action', range: 150, kind: 'save', save: 'dex', dmg: [['10d8', 'lightning']], half: true, targets: 4 }),
  s({ name: 'Disintegrate', level: 6, time: 'action', range: 60, kind: 'save', save: 'dex', dmg: [['10d6+40', 'force']], upcast: '3d6' }),
  s({ name: 'Harm', level: 6, time: 'action', range: 60, kind: 'save', save: 'con', dmg: [['14d6', 'necrotic']], half: true }),
  s({ name: 'Heal', level: 6, time: 'action', range: 60, kind: 'heal', heal: '70', note: 'fixed 70 HP (+10 per slot above 6th)' }),
  s({ name: 'Finger of Death', level: 7, time: 'action', range: 60, kind: 'save', save: 'con', dmg: [['7d8+30', 'necrotic']], half: true }),
  s({ name: 'Meteor Swarm', level: 9, time: 'action', range: 5280, kind: 'save', save: 'dex', dmg: [['20d6', 'fire'], ['20d6', 'bludgeoning']], half: true, targets: 20, area: ['sphere', 40] }),
];

const byName = new Map(SPELLS.map((sp) => [sp.name.toLowerCase(), sp]));

export function findSpell(name: string): SpellDef | undefined {
  const n = name.toLowerCase().trim().replace(/[’`]/g, "'");
  return byName.get(n) ?? SPELLS.find((sp) => n.startsWith(sp.name.toLowerCase()) || sp.name.toLowerCase().startsWith(n));
}

/** Cantrip dice multiplier at a character (or monster CR-derived) level. */
export function cantripTier(level: number) {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}
