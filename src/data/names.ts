// Syllable-based name generation. Original content.
import type { Rng } from '../lib/rng';

export const SPECIES = [
  'Human', 'Human', 'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Dragonborn',
  'Tiefling', 'Orc', 'Goliath', 'Aasimar',
] as const;

const SYL: Record<string, { first: string[]; mid: string[]; last: string[] }> = {
  Human: {
    first: ['Al', 'Bran', 'Cor', 'Da', 'Ed', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Kel', 'Lia', 'Mar', 'Ne', 'Os', 'Per', 'Ros', 'Sel', 'Tam', 'Wil', 'Ysa', 'Ela', 'Bea'],
    mid: ['', '', 'a', 'e', 'ri', 'la', 'an', 'o', 'wen'],
    last: ['ric', 'wyn', 'na', 'mund', 'ton', 'ra', 'sa', 'ley', 'dric', 'ette', 'bert', 'is', 'ar', 'mira', 'rin'],
  },
  Elf: {
    first: ['Ae', 'Cae', 'Ela', 'Fae', 'Gal', 'Ith', 'Lae', 'Mi', 'Nai', 'Syl', 'Tha', 'Vae', 'Ara', 'Eil'],
    mid: ['la', 'ri', 'the', 'va', 'lin', 'ne', 'sa'],
    last: ['dris', 'riel', 'thil', 'wyn', 'lass', 'nor', 'mir', 'ion', 'eth', 'aen', 'ara'],
  },
  Dwarf: {
    first: ['Bal', 'Bor', 'Dur', 'Gim', 'Har', 'Kil', 'Mor', 'Rur', 'Thor', 'Vond', 'Ed', 'Gun', 'Hel', 'Dag'],
    mid: ['', '', 'a', 'i', 'e'],
    last: ['din', 'grim', 'ra', 'nar', 'dak', 'ren', 'gund', 'hild', 'rik', 'mek', 'vi'],
  },
  Halfling: {
    first: ['An', 'Bel', 'Cad', 'Eld', 'Gar', 'Lav', 'Mer', 'Pip', 'Ros', 'Tob', 'Wel', 'Cor'],
    mid: ['', '', 'a', 'o', 'i'],
    last: ['ric', 'la', 'do', 'sie', 'bo', 'wick', 'ly', 'rin', 'ella', 'ton'],
  },
  Gnome: {
    first: ['Al', 'Bim', 'Fon', 'Gim', 'Nim', 'Orr', 'Pog', 'Zook', 'Tink', 'Wren', 'Quil', 'Fizz'],
    mid: ['', 'ble', 'ni', 'to', 'wi'],
    last: ['ston', 'kin', 'nock', 'bo', 'dle', 'wick', 'ra', 'pip', 'sy'],
  },
  Dragonborn: {
    first: ['Ar', 'Bala', 'Dona', 'Ghe', 'Kri', 'Med', 'Nad', 'Pand', 'Rho', 'Sho', 'Tor', 'Kava'],
    mid: ['a', 'e', 'ar', 'ra', 'i'],
    last: ['jhan', 'sar', 'rash', 'nax', 'thys', 'vek', 'rinn', 'dar', 'kas', 'thra'],
  },
  Tiefling: {
    first: ['Ak', 'Bar', 'Cri', 'Dam', 'Kal', 'Lev', 'Mor', 'Nem', 'Ori', 'Ska', 'Zar', 'Vel'],
    mid: ['a', 'e', 'i', 'ra', 'ke'],
    last: ['menos', 'thys', 'lith', 'kos', 'vos', 'meia', 'ris', 'ael', 'zhar', 'ixa'],
  },
  Orc: {
    first: ['Dench', 'Feng', 'Gell', 'Hol', 'Krus', 'Mhur', 'Ront', 'Shump', 'Thok', 'Bag', 'Emen', 'Vol'],
    mid: ['', '', 'a', 'u', 'o'],
    last: ['ga', 'rash', 'gar', 'mak', 'ka', 'dush', 'uk', 'tha', 'rog'],
  },
  Goliath: {
    first: ['Aukan', 'Eglath', 'Gae', 'Ilikan', 'Keo', 'Kuori', 'Lo', 'Mane', 'Pau', 'Tha', 'Vim', 'Ora'],
    mid: ['', 'a', 'e', 'o'],
    last: ['al', 'thi', 'kan', 'ga', 'ath', 'ruk', 'lo', 'ni'],
  },
  Aasimar: {
    first: ['Ari', 'Cae', 'Eli', 'Iel', 'Lum', 'Ser', 'Ora', 'Val', 'Zer', 'Tha'],
    mid: ['a', 'e', 'i', 'ra'],
    last: ['iel', 'phine', 'on', 'ara', 'ius', 'ena', 'eth', 'is'],
  },
};

const SURNAME_A = ['Ash', 'Black', 'Bright', 'Copper', 'Dawn', 'Dusk', 'Ember', 'Frost', 'Gold', 'Grey', 'Hollow', 'Iron', 'Oak', 'Raven', 'Salt', 'Silver', 'Stone', 'Storm', 'Thorn', 'Wolf', 'Mist', 'Red', 'Wind', 'Bone'];
const SURNAME_B = ['bane', 'brook', 'crest', 'field', 'forge', 'hand', 'hart', 'helm', 'hill', 'mantle', 'more', 'shield', 'song', 'vale', 'ward', 'water', 'wood', 'whisper', 'blade', 'fall'];

const EPITHETS = [
  'the Pale', 'the Unbroken', 'the Hollow King', 'the Last Oracle', 'the Ashen', 'the Veiled',
  'the Deathless', 'Who Walks Twice', 'the Gilded', 'of the Thousand Eyes', 'the Drowned', 'the Crowned in Thorns',
  'the Bell-Ringer', 'the Patient', 'the Unforgiven', 'Mother of Moths', 'the Iron Saint', 'the Starved',
];


function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function givenName(rng: Rng, species: string): string {
  const s = SYL[species] ?? SYL.Human;
  return cap(rng.pick(s.first) + rng.pick(s.mid) + rng.pick(s.last));
}

export function fullName(rng: Rng, species: string): string {
  const first = givenName(rng, species);
  if (species === 'Goliath' || species === 'Orc') return first;
  return `${first} ${rng.pick(SURNAME_A)}${rng.pick(SURNAME_B)}`;
}

export function villainName(rng: Rng, species: string): string {
  return `${givenName(rng, species)} ${rng.pick(EPITHETS)}`;
}

const PLACE_A = ['Amber', 'Ash', 'Black', 'Bleak', 'Bright', 'Cinder', 'Cold', 'Crow', 'Deep', 'Dragon', 'Dusk', 'Elder', 'Fair', 'Fell', 'Frost', 'Glimmer', 'Gloom', 'Gold', 'Green', 'Grim', 'Hag', 'High', 'Iron', 'King', 'Low', 'Mire', 'Moon', 'North', 'Oak', 'Old', 'Raven', 'Red', 'Salt', 'Shadow', 'Silver', 'Stone', 'Storm', 'Sun', 'Thorn', 'Wolf', 'Wyrm', 'Witch'];
const PLACE_B = ['barrow', 'bridge', 'brook', 'burg', 'crag', 'crest', 'cross', 'dale', 'deep', 'fall', 'fell', 'ford', 'gate', 'haven', 'hold', 'hollow', 'keep', 'mere', 'moor', 'port', 'reach', 'rest', 'ridge', 'rock', 'shire', 'spire', 'stead', 'vale', 'watch', 'wick', 'wood'];

export function placeName(rng: Rng): string {
  return rng.pick(PLACE_A) + rng.pick(PLACE_B);
}

const REGION_A = ['The Shattered', 'The Sundered', 'The Verdant', 'The Ashen', 'The Drowned', 'The Howling', 'The Gilded', 'The Silent', 'The Burning', 'The Forgotten', 'The Twilight', 'The Frozen'];
const REGION_B = ['Marches', 'Reaches', 'Coast', 'Dominion', 'Expanse', 'Frontier', 'Isles', 'Vales', 'Wilds', 'Kingdoms', 'Baronies', 'Peaks'];

export function regionName(rng: Rng): string {
  return `${rng.pick(REGION_A)} ${rng.pick(REGION_B)}`;
}

const TAVERN_A = ['Prancing', 'Rusty', 'Sleeping', 'Drunken', 'Golden', 'Laughing', 'Crooked', 'Wandering', 'Silver', 'One-Eyed', 'Singing', 'Burnt'];
const TAVERN_B = ['Pony', 'Dragon', 'Goblet', 'Stag', 'Mermaid', 'Lantern', 'Anvil', 'Owl', 'Kettle', 'Boar', 'Griffon', 'Gnome', 'Barrel'];

export function tavernName(rng: Rng): string {
  return `The ${rng.pick(TAVERN_A)} ${rng.pick(TAVERN_B)}`;
}
