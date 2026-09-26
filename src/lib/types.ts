export type Tone =
  | 'heroic'
  | 'dark'
  | 'intrigue'
  | 'exploration'
  | 'comedic'
  | 'mystery'
  | 'war'
  | 'nautical'
  | 'planar'
  | 'survival';

export type Length = 'short' | 'medium' | 'long' | 'epic';

export type Mood =
  | 'tavern' | 'town' | 'travel' | 'forest' | 'dungeon' | 'battle' | 'boss'
  | 'horror' | 'mystery' | 'sea' | 'sacred' | 'calm';

export interface PartyMember {
  id: string;
  name: string;
  species: string;
  cls: string;
  hook: string; // backstory hook the campaign can pull on
}

export interface CampaignOptions {
  seed: string;
  title: string; // empty = generate
  tones: Tone[]; // empty = random
  startLevel: number;
  endLevel: number;
  partySize: number;
  length: Length;
  artStyle: string;
  notes: string; // free text passed to the AI
  party: PartyMember[];
}

export interface Npc {
  id: string;
  name: string;
  species: string;
  role: string;
  personality: string;
  quirk: string;
  secret: string;
  want: string;
  appearance: string;
  attitude: 'ally' | 'neutral' | 'rival' | 'enemy';
  factionId?: string;
  locationId?: string;
  description?: string; // AI-expanded
  imageId?: string;
}

export interface Faction {
  id: string;
  name: string;
  kind: string;
  goal: string;
  method: string;
  symbol: string;
  attitude: 'ally' | 'neutral' | 'rival' | 'enemy';
  leaderId?: string;
  description?: string;
  imageId?: string;
}

export interface Villain {
  id: string;
  name: string;
  species: string;
  archetype: string;
  motivation: string;
  plan: string;
  weakness: string;
  lair: string;
  appearance: string;
  lieutenants: string[]; // npc ids
  statBlock: string; // SRD monster to reskin
  description?: string;
  imageId?: string;
}

export interface EncounterMonster {
  name: string;
  cr: string;
  xp: number;
  count: number;
}

export interface Encounter {
  id: string;
  title: string;
  difficulty: 'Low' | 'Moderate' | 'High';
  level: number;
  budget: number;
  xp: number;
  monsters: EncounterMonster[];
  twist: string;
  note?: string;
}

export interface LootItem {
  name: string;
  rarity: string;
  note?: string;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  contents: string;
  feature: string;
  encounter?: Encounter;
  treasure?: LootItem[];
  trap?: string;
  exits: number[];
}

export interface Corridor {
  a: number;
  b: number;
  path: [number, number][]; // grid cells
  door: 'open' | 'door' | 'locked' | 'secret';
}

export interface Dungeon {
  id: string;
  name: string;
  theme: string;
  level: number;
  width: number;
  height: number;
  rooms: Room[];
  corridors: Corridor[];
  history: string;
}

export interface TownBuilding {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  npcId?: string;
}

export interface TownMap {
  width: number;
  height: number;
  roads: [number, number][][];
  buildings: TownBuilding[];
  walls: boolean;
  river?: [number, number][];
}

export type LocationKind = 'town' | 'city' | 'village' | 'dungeon' | 'wilderness' | 'landmark' | 'fortress';

export interface Location {
  id: string;
  name: string;
  kind: LocationKind;
  terrain: string;
  summary: string;
  features: string[];
  x: number; // region-map coordinates 0..1
  y: number;
  dungeon?: Dungeon;
  town?: TownMap;
  description?: string;
  imageId?: string;
  mapImageId?: string; // AI-illustrated map
}

export interface Act {
  id: string;
  number: number;
  title: string;
  levels: [number, number];
  summary: string;
  hook: string;
  goals: string[];
  locationIds: string[];
  npcIds: string[];
  encounters: Encounter[];
  loot: LootItem[];
  climax: string;
  sideQuests: SideQuest[];
  spotlight?: string; // PC backstory beat
  boss?: string; // named mid-boss (lieutenant) for this act
  description?: string;
}

export interface SideQuest {
  id: string;
  title: string;
  giverId?: string;
  locationId?: string;
  summary: string;
  reward: LootItem[];
}

export type SceneKind = 'social' | 'exploration' | 'combat' | 'puzzle' | 'travel' | 'rest' | 'infiltration';

export interface Scene {
  id: string;
  title: string;
  kind: SceneKind;
  locationId?: string;
  npcIds: string[];
  purpose: string;
  outcome: string; // how it can end / what it leads to
  mood: Mood;
  encounter?: Encounter;
  readAloud?: string; // AI or hand-written boxed text
  notes?: string;
}

export interface Session {
  id: string;
  number: number;
  actId: string;
  title: string;
  level: number;
  status: 'planned' | 'played';
  recap?: string;
  strongStart: string;
  scenes: Scene[];
  secrets: string[]; // clues / secrets the party can discover
  npcLines: Record<string, string>; // npc id -> sample dialogue
  treasure: LootItem[];
  prep: string[];
  playLog?: string; // what actually happened at the table
  adapted?: boolean; // rewritten from the play log
  aiNotes?: string;
}

export interface RegionTerrainCell {
  h: number; // elevation 0..1
  m: number; // moisture 0..1
}

export interface Region {
  name: string;
  cols: number;
  rows: number;
  cells: RegionTerrainCell[];
  roads: [string, string][]; // location id pairs
}

export interface Campaign {
  id: string;
  createdAt: number;
  updatedAt: number;
  options: CampaignOptions;
  title: string;
  pitch: string;
  tones: Tone[];
  themes: string[];
  villain: Villain;
  factions: Faction[];
  npcs: Npc[];
  locations: Location[];
  acts: Act[];
  region: Region;
  rumors: string[];
  sessions: Session[];
  aiExpanded?: boolean;
  mapImageId?: string; // AI-illustrated region map
}
