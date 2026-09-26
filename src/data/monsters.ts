// Monster references by name/CR for encounter building. Stat blocks live in the
// D&D 2024 System Reference Document (SRD 5.2, CC-BY-4.0) — we only reference them.

export type Env =
  | 'urban' | 'forest' | 'mountain' | 'swamp' | 'underdark' | 'desert'
  | 'arctic' | 'coast' | 'grassland' | 'dungeon' | 'planar' | 'any';

export type Tag = 'humanoid' | 'undead' | 'beast' | 'fiend' | 'aberration' | 'construct'
  | 'dragon' | 'elemental' | 'fey' | 'giant' | 'monstrosity' | 'ooze' | 'plant' | 'celestial';

export interface MonsterRef {
  name: string;
  cr: number; // 0.125 = 1/8
  type: Tag;
  env: Env[];
}

export const CR_XP: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100, '1': 200, '2': 450, '3': 700, '4': 1100,
  '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400,
  '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000,
  '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '30': 155000,
};

export function crLabel(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

// 2024 DMG XP budget per character: [Low, Moderate, High], indexed by level 1..20.
export const XP_BUDGET: [number, number, number][] = [
  [0, 0, 0],
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
  [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
  [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
  [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

const m = (name: string, cr: number, type: Tag, ...env: Env[]): MonsterRef => ({ name, cr, type, env });

export const MONSTERS: MonsterRef[] = [
  // CR 0 – 1/2
  m('Bandit', 0.125, 'humanoid', 'urban', 'forest', 'grassland', 'coast', 'desert'),
  m('Cultist', 0.125, 'humanoid', 'urban', 'dungeon', 'any'),
  m('Guard', 0.125, 'humanoid', 'urban'),
  m('Kobold Warrior', 0.125, 'dragon', 'dungeon', 'mountain', 'underdark'),
  m('Giant Rat', 0.125, 'beast', 'urban', 'dungeon'),
  m('Stirge', 0.125, 'monstrosity', 'swamp', 'forest', 'dungeon'),
  m('Goblin Warrior', 0.25, 'fey', 'forest', 'dungeon', 'mountain', 'underdark'),
  m('Skeleton', 0.25, 'undead', 'dungeon', 'any'),
  m('Zombie', 0.25, 'undead', 'dungeon', 'swamp', 'any'),
  m('Wolf', 0.25, 'beast', 'forest', 'grassland', 'arctic', 'mountain'),
  m('Pseudodragon', 0.25, 'dragon', 'forest'),
  m('Giant Wolf Spider', 0.25, 'beast', 'forest', 'underdark', 'dungeon'),
  m('Swarm of Bats', 0.25, 'beast', 'dungeon', 'underdark'),
  m('Hobgoblin Warrior', 0.5, 'fey', 'forest', 'grassland', 'mountain'),
  m('Shadow', 0.5, 'undead', 'dungeon', 'underdark', 'urban'),
  m('Gnoll Warrior', 0.5, 'fiend', 'grassland', 'desert', 'forest'),
  m('Sahuagin Warrior', 0.5, 'fiend', 'coast'),
  m('Worg', 0.5, 'fey', 'forest', 'grassland', 'arctic'),
  m('Thug', 0.5, 'humanoid', 'urban'),
  m('Rust Monster', 0.5, 'monstrosity', 'dungeon', 'underdark'),
  m('Warrior Infantry', 0.125, 'humanoid', 'grassland', 'urban'),
  // CR 1–4
  m('Bugbear Warrior', 1, 'fey', 'forest', 'dungeon', 'mountain'),
  m('Ghoul', 1, 'undead', 'dungeon', 'swamp', 'urban'),
  m('Dire Wolf', 1, 'beast', 'forest', 'arctic', 'mountain'),
  m('Harpy', 1, 'monstrosity', 'mountain', 'coast'),
  m('Specter', 1, 'undead', 'dungeon', 'urban'),
  m('Spy', 1, 'humanoid', 'urban'),
  m('Giant Spider', 1, 'beast', 'forest', 'underdark', 'dungeon'),
  m('Animated Armor', 1, 'construct', 'dungeon', 'urban'),
  m('Imp', 1, 'fiend', 'planar', 'urban', 'dungeon'),
  m('Priest Acolyte', 0.25, 'humanoid', 'urban'),
  m('Bandit Captain', 2, 'humanoid', 'urban', 'forest', 'coast', 'grassland', 'desert'),
  m('Cultist Fanatic', 2, 'humanoid', 'urban', 'dungeon', 'any'),
  m('Ogre', 2, 'giant', 'mountain', 'forest', 'grassland', 'swamp'),
  m('Gargoyle', 2, 'elemental', 'dungeon', 'mountain', 'urban'),
  m('Ghast', 2, 'undead', 'dungeon', 'swamp'),
  m('Gibbering Mouther', 2, 'aberration', 'underdark', 'dungeon'),
  m('Mimic', 2, 'monstrosity', 'dungeon', 'urban'),
  m('Ochre Jelly', 2, 'ooze', 'dungeon', 'underdark'),
  m('Priest', 2, 'humanoid', 'urban'),
  m('Will-o\'-Wisp', 2, 'undead', 'swamp', 'forest'),
  m('Sea Hag', 2, 'fey', 'coast', 'swamp'),
  m('Griffon', 2, 'monstrosity', 'mountain', 'grassland'),
  m('Merrow', 2, 'monstrosity', 'coast'),
  m('Basilisk', 3, 'monstrosity', 'mountain', 'desert', 'dungeon'),
  m('Doppelganger', 3, 'monstrosity', 'urban'),
  m('Green Hag', 3, 'fey', 'swamp', 'forest'),
  m('Knight', 3, 'humanoid', 'urban', 'grassland'),
  m('Minotaur of Baphomet', 3, 'monstrosity', 'dungeon', 'underdark'),
  m('Mummy', 3, 'undead', 'desert', 'dungeon'),
  m('Owlbear', 3, 'monstrosity', 'forest'),
  m('Wight', 3, 'undead', 'dungeon', 'swamp', 'arctic'),
  m('Werewolf', 3, 'monstrosity', 'forest', 'urban'),
  m('Winter Wolf', 3, 'monstrosity', 'arctic'),
  m('Hell Hound', 3, 'fiend', 'planar', 'mountain'),
  m('Veteran Warrior', 3, 'humanoid', 'urban', 'grassland'),
  m('Banshee', 4, 'undead', 'forest', 'swamp', 'dungeon'),
  m('Ghost', 4, 'undead', 'urban', 'dungeon'),
  m('Flameskull', 4, 'undead', 'dungeon'),
  m('Succubus', 4, 'fiend', 'urban', 'planar'),
  m('Black Pudding', 4, 'ooze', 'dungeon', 'underdark'),
  // CR 5–10
  m('Troll', 5, 'giant', 'swamp', 'forest', 'mountain', 'arctic'),
  m('Hill Giant', 5, 'giant', 'grassland', 'mountain'),
  m('Wraith', 5, 'undead', 'dungeon', 'urban'),
  m('Air Elemental', 5, 'elemental', 'mountain', 'planar'),
  m('Fire Elemental', 5, 'elemental', 'desert', 'planar'),
  m('Water Elemental', 5, 'elemental', 'coast', 'planar'),
  m('Earth Elemental', 5, 'elemental', 'mountain', 'underdark', 'planar'),
  m('Gladiator', 5, 'humanoid', 'urban'),
  m('Vampire Spawn', 5, 'undead', 'urban', 'dungeon'),
  m('Young Remorhaz', 5, 'monstrosity', 'arctic'),
  m('Chuul', 4, 'aberration', 'swamp', 'underdark', 'coast'),
  m('Mage', 6, 'humanoid', 'urban', 'dungeon'),
  m('Chimera', 6, 'monstrosity', 'mountain', 'grassland'),
  m('Wyvern', 6, 'dragon', 'mountain'),
  m('Medusa', 6, 'monstrosity', 'desert', 'dungeon'),
  m('Young Brass Dragon', 6, 'dragon', 'desert'),
  m('Stone Giant', 7, 'giant', 'mountain', 'underdark'),
  m('Oni', 7, 'fiend', 'urban', 'forest'),
  m('Young Black Dragon', 7, 'dragon', 'swamp'),
  m('Young Green Dragon', 8, 'dragon', 'forest'),
  m('Frost Giant', 8, 'giant', 'arctic', 'mountain'),
  m('Hydra', 8, 'monstrosity', 'swamp', 'coast'),
  m('Assassin', 8, 'humanoid', 'urban'),
  m('Young White Dragon', 6, 'dragon', 'arctic'),
  m('Fire Giant', 9, 'giant', 'mountain', 'underdark'),
  m('Young Blue Dragon', 9, 'dragon', 'desert', 'coast'),
  m('Bone Devil', 9, 'fiend', 'planar'),
  m('Clay Golem', 9, 'construct', 'dungeon'),
  m('Young Red Dragon', 10, 'dragon', 'mountain'),
  m('Aboleth', 10, 'aberration', 'underdark', 'coast'),
  m('Stone Golem', 10, 'construct', 'dungeon'),
  m('Deva', 10, 'celestial', 'planar'),
  // CR 11+
  m('Horned Devil', 11, 'fiend', 'planar'),
  m('Behir', 11, 'monstrosity', 'underdark', 'mountain'),
  m('Remorhaz', 11, 'monstrosity', 'arctic'),
  m('Roc', 11, 'monstrosity', 'mountain', 'coast'),
  m('Archmage', 12, 'humanoid', 'urban', 'dungeon'),
  m('Erinyes', 12, 'fiend', 'planar'),
  m('Adult Brass Dragon', 13, 'dragon', 'desert'),
  m('Adult White Dragon', 13, 'dragon', 'arctic'),
  m('Storm Giant', 13, 'giant', 'coast', 'mountain'),
  m('Vampire', 13, 'undead', 'urban', 'dungeon'),
  m('Adult Black Dragon', 14, 'dragon', 'swamp'),
  m('Ice Devil', 14, 'fiend', 'planar', 'arctic'),
  m('Adult Green Dragon', 15, 'dragon', 'forest'),
  m('Purple Worm', 15, 'monstrosity', 'underdark', 'desert'),
  m('Mummy Lord', 15, 'undead', 'desert', 'dungeon'),
  m('Adult Blue Dragon', 16, 'dragon', 'desert', 'coast'),
  m('Iron Golem', 16, 'construct', 'dungeon'),
  m('Marilith', 16, 'fiend', 'planar'),
  m('Planetar', 16, 'celestial', 'planar'),
  m('Adult Red Dragon', 17, 'dragon', 'mountain'),
  m('Dragon Turtle', 17, 'dragon', 'coast'),
  m('Death Knight', 17, 'undead', 'dungeon'),
  m('Lich', 21, 'undead', 'dungeon'),
  m('Balor', 19, 'fiend', 'planar'),
  m('Pit Fiend', 20, 'fiend', 'planar'),
  m('Ancient Black Dragon', 21, 'dragon', 'swamp'),
  m('Ancient Green Dragon', 22, 'dragon', 'forest'),
  m('Ancient Blue Dragon', 23, 'dragon', 'desert'),
  m('Ancient Red Dragon', 24, 'dragon', 'mountain'),
  m('Solar', 21, 'celestial', 'planar'),
  m('Kraken', 23, 'monstrosity', 'coast'),
  m('Tarrasque', 30, 'monstrosity', 'any'),
];

export const TERRAIN_ENV: Record<string, Env> = {
  forest: 'forest', mountains: 'mountain', hills: 'mountain', swamp: 'swamp', coast: 'coast',
  desert: 'desert', tundra: 'arctic', plains: 'grassland', underdark: 'underdark', city: 'urban',
  ruins: 'dungeon', planar: 'planar',
};
