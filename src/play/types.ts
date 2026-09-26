// Play mode: an AI (or human) DM and any mix of human/AI players run a session.
// The code owns the rules and the dice; language models only choose what to do and describe it.
import type { LlmProviderId } from '../ai/llm';
import type { Mood } from '../lib/types';
import type { BattleMap } from './map';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAME: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export const SKILLS: Record<string, Ability> = {
  Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis',
  Intimidation: 'cha', Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha',
  Religion: 'int', 'Sleight of Hand': 'dex', Stealth: 'dex', Survival: 'wis',
};

/** A weapon or natural attack as written on a sheet. */
export interface SheetAttack {
  name: string;
  bonus: number; // to-hit
  damage: string; // e.g. "1d8+3"
  type: string; // slashing, fire…
  reach?: number; // ft, melee
  range?: [number, number]; // ft, ranged normal/long
}

/** A full player-character sheet, entered by the user. */
export interface PcSheet {
  id: string;
  name: string;
  species: string;
  cls: string;
  level: number;
  abilities: Record<Ability, number>;
  ac: number;
  maxHp: number;
  speed: number;
  profBonus: number;
  saveProfs: Ability[];
  skillProfs: string[];
  expertise: string[];
  attacksPerAction: number; // Extra Attack
  attacks: SheetAttack[];
  spellcasting?: {
    ability: Ability;
    saveDc: number;
    attackBonus: number;
    slots: number[]; // index 1..9 = max slots at that level (index 0 unused)
    cantrips: string[];
    spells: string[];
  };
  features: string; // class/species features, free text (the AI reads it; "extra damage" features are checked by name)
  inventory: string;
  potions: number; // Potions of Healing
  personality: string; // how the AI should play them
  hook: string;
}

export type Side = 'party' | 'enemy' | 'ally';

export interface Attack {
  name: string;
  hit?: number;
  dmg?: [string, string][]; // [dice, type]
  reach?: number;
  range?: [number, number];
  dc?: number;
  save?: Ability;
  half?: boolean;
  area?: [string, number];
  cond?: string;
  recharge?: number; // recharges on d6 >= n
  text?: string;
}

export interface Condition {
  name: string;
  save?: { ability: Ability; dc: number }; // repeat save at end of turn
  rounds?: number; // expires after N of the creature's turns
  sourceId?: string;
}

export interface Creature {
  id: string;
  name: string;
  side: Side;
  kind: 'pc' | 'monster';
  sheetId?: string;
  monster?: string; // SRD stat block name
  ac: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  speed: number;
  abilities: Record<Ability, number>;
  saves: Record<Ability, number>; // total save bonus
  initMod: number;
  attacks: Attack[];
  multi?: number; // attacks per Attack action (Extra Attack / Multiattack)
  multiText?: string; // monster Multiattack description
  spell?: { dc: number; hit: number; ability: Ability; known: string[]; slots: number[] }; // slots = remaining
  res: string[];
  imm: string[];
  vul: string[];
  condImm: string[];
  conditions: Condition[];
  concentration?: { spell: string; targets: string[]; condition?: string };
  pos: { x: number; y: number };
  size: number; // squares per side (1 = Medium)
  dead: boolean;
  deathSaves: { ok: number; fail: number };
  stable: boolean;
  legendary?: { max: number; left: number; actions: [string, string, number][] };
  used: Record<string, boolean>; // spent recharge abilities
  potions: number;
  traits: [string, string][];
}

export interface Economy { action: boolean; bonus: boolean; reaction: boolean; move: number; attacksLeft: number; dodging: boolean; disengaged: boolean }

export type MsgKind = 'narration' | 'dialogue' | 'action' | 'roll' | 'system' | 'director' | 'summary';

export interface Msg {
  id: string;
  kind: MsgKind;
  speaker?: string;
  side?: Side | 'dm';
  text: string;
  at: number;
  dmOnly?: boolean; // hidden from player prompts (director notes, DM-side secrets)
}

export interface SeatModel {
  useDefault: boolean;
  provider?: LlmProviderId;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface Seat {
  id: string;
  role: 'dm' | 'player';
  controller: 'human' | 'ai';
  sheetId?: string; // players
  model: SeatModel;
}

export type Phase = 'dm' | 'players' | 'combat';

export interface GameState {
  id: string;
  campaignId: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  seats: Seat[];
  sheets: PcSheet[];
  creatures: Creature[];
  phase: Phase;
  playerQueue: string[]; // seat ids still to act in the 'players' phase
  combat?: { round: number; order: string[]; index: number; economy: Economy; started?: boolean };
  log: Msg[];
  summary?: string; // rolling summary of the oldest part of the log (only when the transcript outgrows the budget)
  summarizedCount: number; // how many log entries the summary covers
  sceneIndex: number;
  mood?: Mood;
  status: 'running' | 'paused' | 'ended';
  waitingFor?: string; // seat id of a human who must act
  directorNotes: string[]; // private nudges to the DM, consumed on its next turn
  contextChars: number; // transcript budget before summarizing the oldest part
  map?: BattleMap; // tactical map during combat
  rules?: { flanking: boolean; autoShield: boolean };
  sceneTheme?: BattleMap['theme'];
}
