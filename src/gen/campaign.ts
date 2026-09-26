import { Rng, uid } from '../lib/rng';
import type { Act, Campaign, CampaignOptions, Faction, Location, LocationKind, Npc, PartyMember, SideQuest, Tone, Villain } from '../lib/types';
import { planSessions } from './session';
import {
  ACT_STRUCTURE, SIDE_QUESTS, SPOTLIGHTS, APPEARANCE, CLIMAXES, FACTION_ADJ, FACTION_GOALS, FACTION_KINDS, FACTION_METHODS, FACTION_NOUN,
  FACTION_PREFIX, FACTION_SYMBOLS, GOALS, HOOKS, LAIRS, LOCATION_FEATURES, LOCATION_SUMMARIES, MOTIVATIONS,
  NPC_ROLES, PERSONALITIES, PLANS, QUIRKS, RUMORS, SECRETS, TONE_THEMES, TONES, VILLAIN_ARCHETYPES, WANTS, WEAKNESSES,
} from '../data/story';
import { SPECIES, fullName, placeName, regionName, villainName } from '../data/names';
import { fill, type FillCtx } from './fill';
import { buildEncounter, rollLoot } from './encounter';
import { generateDungeon } from './dungeon';
import { assignNpcs, generateTown } from './town';
import { BIOME_TERRAIN, biomeOf, generateRegionTerrain, SEA_LEVEL } from './region';
import { TERRAIN_ENV, type Env } from '../data/monsters';

// Indexes into ACT_STRUCTURE's seven stages; 6 is always the finale, 2 the mid-campaign lieutenant showdown.
export const ACTS_BY_LENGTH = { short: [0, 3, 6], medium: [0, 1, 3, 6], long: [0, 1, 2, 3, 6], epic: [0, 1, 2, 3, 4, 5, 6] } as const;
const LOCS_BY_LENGTH = { short: 7, medium: 10, long: 14, epic: 18 } as const;
const FINALE = 6;
const MIDPOINT = 2;

// Villain creature types that fit each archetype, used to theme encounters.
export const VILLAIN_MINION_TYPES: Record<string, string[]> = {
  Lich: ['undead', 'construct'], Vampire: ['undead', 'humanoid'], 'Death Knight': ['undead', 'fiend'],
  'Adult Red Dragon': ['dragon', 'humanoid'], 'Green Hag': ['fey', 'plant', 'beast'], Archmage: ['humanoid', 'construct'],
  'Cultist Fanatic': ['humanoid', 'fiend', 'aberration'], Gladiator: ['humanoid', 'giant'], 'Bandit Captain': ['humanoid', 'monstrosity'],
  Aboleth: ['aberration', 'monstrosity'], 'Horned Devil': ['fiend', 'humanoid'], 'Iron Golem': ['construct'],
  Oni: ['fey', 'giant'], Doppelganger: ['monstrosity', 'humanoid'], 'Frost Giant': ['giant', 'beast'],
  'Mummy Lord': ['undead', 'construct'], Planetar: ['celestial', 'elemental'], Spy: ['humanoid'],
};

export function ctxOf(c: Pick<Campaign, 'villain' | 'factions' | 'locations' | 'region' | 'npcs'>, rng: Rng): FillCtx {
  const settlements = c.locations.filter((l) => l.kind !== 'dungeon');
  return {
    villain: c.villain?.name,
    faction: c.factions.length ? rng.pick(c.factions).name : undefined,
    place: settlements.length ? rng.pick(settlements).name : undefined,
    region: c.region?.name,
    npc: c.npcs.length ? rng.pick(c.npcs).name : undefined,
    lair: c.villain?.lair,
  };
}

export function makeVillain(rng: Rng, tones: Tone[], region: string, place: string): Villain {
  const fitting = VILLAIN_ARCHETYPES.filter((a) => a.tones.some((t) => tones.includes(t)));
  const arch = rng.pick(fitting.length ? fitting : VILLAIN_ARCHETYPES);
  const species = rng.pick(SPECIES);
  const ctx: FillCtx = { region, place, faction: 'the crown' };
  return {
    id: uid(),
    name: villainName(rng, species),
    species: arch.statBlock.includes('Dragon') ? 'Dragon' : species,
    archetype: arch.name,
    motivation: rng.pick(MOTIVATIONS),
    plan: fill(rng.pick(PLANS), ctx, rng),
    weakness: rng.pick(WEAKNESSES),
    lair: rng.pick(LAIRS),
    appearance: rng.pick(APPEARANCE),
    lieutenants: [],
    statBlock: arch.statBlock,
  };
}

export function makeFaction(rng: Rng, ctx: FillCtx, attitude?: Faction['attitude']): Faction {
  return {
    id: uid(),
    name: `${rng.pick(FACTION_PREFIX)} ${rng.pick(FACTION_ADJ)} ${rng.pick(FACTION_NOUN)}`,
    kind: rng.pick(FACTION_KINDS),
    goal: fill(rng.pick(FACTION_GOALS), ctx, rng),
    method: rng.pick(FACTION_METHODS),
    symbol: rng.pick(FACTION_SYMBOLS),
    attitude: attitude ?? rng.pick(['ally', 'neutral', 'rival'] as const),
  };
}

export function makeNpc(rng: Rng, ctx: FillCtx, opts: { location?: Location; attitude?: Npc['attitude']; role?: string; factionId?: string } = {}): Npc {
  const species = rng.pick(SPECIES);
  const wild = opts.location && ['wilderness', 'landmark', 'dungeon'].includes(opts.location.kind);
  const roles = NPC_ROLES.filter((r) => r.kind === 'any' || r.kind === (wild ? 'wild' : 'town'));
  return {
    id: uid(),
    name: fullName(rng, species),
    species,
    role: opts.role ?? rng.pick(roles).role,
    personality: rng.pick(PERSONALITIES),
    quirk: rng.pick(QUIRKS),
    secret: fill(rng.pick(SECRETS), ctx, rng),
    want: fill(rng.pick(WANTS), ctx, rng),
    appearance: rng.pick(APPEARANCE),
    attitude: opts.attitude ?? rng.weighted([
      { value: 'ally' as const, weight: 3 }, { value: 'neutral' as const, weight: 4 }, { value: 'rival' as const, weight: 2 },
    ]),
    locationId: opts.location?.id,
    factionId: opts.factionId,
  };
}

function envFor(loc: Location | undefined): Env | undefined {
  if (!loc) return undefined;
  if (loc.kind === 'dungeon') return 'dungeon';
  if (['city', 'town', 'village', 'fortress'].includes(loc.kind)) return 'urban';
  return TERRAIN_ENV[loc.terrain];
}

export function makeLocation(
  rng: Rng,
  kind: LocationKind,
  pos: { x: number; y: number; terrain: string },
  campaign: { level: number; partySize: number; minionTypes?: string[] },
): Location {
  const summaries = LOCATION_SUMMARIES[kind] ?? LOCATION_SUMMARIES.landmark;
  const loc: Location = {
    id: uid(),
    name: placeName(rng),
    kind,
    terrain: pos.terrain,
    summary: rng.pick(summaries),
    features: rng.pickN(LOCATION_FEATURES, kind === 'city' ? 3 : 2),
    x: pos.x,
    y: pos.y,
  };
  if (kind === 'dungeon') {
    const env = TERRAIN_ENV[pos.terrain];
    loc.dungeon = generateDungeon(rng.fork('dungeon'), {
      name: loc.name, level: campaign.level, partySize: campaign.partySize,
      env: env && env !== 'urban' && rng.chance(0.4) ? env : 'dungeon', preferTypes: campaign.minionTypes,
    });
  }
  if (kind === 'village' || kind === 'town' || kind === 'city') {
    loc.town = generateTown(rng.fork('town'), kind);
  }
  return loc;
}

function levelRanges(start: number, end: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  const span = Math.max(0, end - start);
  for (let i = 0; i < n; i++) {
    const a = Math.round(start + (span * i) / n);
    const b = Math.max(a, Math.round(start + (span * (i + 1)) / n) - (i === n - 1 ? 0 : 1));
    out.push([a, Math.min(end, b)]);
  }
  return out;
}

export function makeAct(
  rng: Rng,
  c: Pick<Campaign, 'villain' | 'factions' | 'locations' | 'region' | 'npcs'>,
  structIdx: number,
  number: number,
  levels: [number, number],
  partySize: number,
  locs: Location[],
  npcs: Npc[],
  used: Set<string> = new Set(),
  party: PartyMember[] = [],
): Act {
  // Draw without repeats across the campaign; the villain face-off only happens from the midpoint on.
  const draw = (list: readonly string[]) => {
    const ok = list.filter((x) => !used.has(x) && (structIdx >= 3 || !x.startsWith('Confronting {villain}')));
    const pick = rng.pick(ok.length ? ok : list);
    used.add(pick);
    return pick;
  };
  const struct = ACT_STRUCTURE[structIdx];
  const lts = c.villain.lieutenants.map((id) => c.npcs.find((n) => n.id === id)).filter((n): n is Npc => !!n);
  const boss = structIdx === MIDPOINT && lts.length ? lts[(number - 1) % lts.length] : undefined;
  const ctx: FillCtx = { ...ctxOf(c, rng), place: locs[0]?.name ?? ctxOf(c, rng).place, boss: boss?.name };
  const lvl = Math.round((levels[0] + levels[1]) / 2);
  const minionTypes = VILLAIN_MINION_TYPES[c.villain.statBlock];
  const encounters = locs.slice(0, 3).map((l, i) =>
    buildEncounter(rng, {
      level: lvl, partySize, env: envFor(l), preferTypes: i > 0 ? minionTypes : undefined,
      difficulty: i === locs.length - 1 || structIdx === FINALE ? 'High' : undefined,
    }),
  );
  if (encounters.length < 3) encounters.push(buildEncounter(rng, { level: lvl, partySize, preferTypes: minionTypes }));
  if (boss) {
    encounters.push(buildEncounter(rng, { level: levels[1], partySize, difficulty: 'High', title: `Showdown: ${boss.name}, ${boss.role}`, preferTypes: minionTypes }));
  }
  if (structIdx === FINALE) {
    encounters.push(buildEncounter(rng, { level: levels[1], partySize, difficulty: 'High', title: `Final battle: ${c.villain.name}`, preferTypes: minionTypes, boss: c.villain.statBlock }));
  }
  return {
    id: uid(),
    number,
    title: fill(rng.pick(struct.title), ctx, rng),
    levels,
    summary: fill(rng.pick(struct.summary), ctx, rng),
    hook: fill(draw(HOOKS), ctx, rng),
    goals: [draw(GOALS), draw(GOALS), draw(GOALS)].map((g) => fill(g, { ...ctxOf(c, rng), place: rng.pick(locs)?.name ?? ctx.place }, rng)),
    locationIds: locs.map((l) => l.id),
    npcIds: npcs.map((n) => n.id),
    encounters,
    loot: rollLoot(rng, levels[1], number === 1 ? 1 : 2),
    climax: boss ? `Showdown with ${boss.name} — and a clue that ${c.villain.name} let it happen.` : fill(draw(CLIMAXES), ctx, rng),
    sideQuests: makeSideQuests(rng, c, locs, npcs, levels[1], draw),
    spotlight: party.length ? makeSpotlight(rng, c, party[(number - 1) % party.length], ctx) : undefined,
    boss: boss?.id,
  };
}

function makeSideQuests(
  rng: Rng, c: Pick<Campaign, 'villain' | 'factions' | 'locations' | 'region' | 'npcs'>, locs: Location[], npcs: Npc[],
  level: number, draw: (l: readonly string[]) => string,
): SideQuest[] {
  const n = rng.int(1, 2);
  const titles = SIDE_QUESTS.map((q) => q.title);
  return Array.from({ length: n }, () => {
    const title = draw(titles);
    const q = SIDE_QUESTS.find((x) => x.title === title)!;
    const giver = npcs.length ? rng.pick(npcs) : rng.pick(c.npcs.filter((x) => x.attitude !== 'enemy'));
    const loc = rng.pick(locs.filter((l) => l.kind !== 'dungeon').length ? locs.filter((l) => l.kind !== 'dungeon') : locs);
    return {
      id: uid(),
      title: q.title,
      giverId: giver?.id,
      locationId: loc?.id,
      summary: fill(q.summary, { ...ctxOf(c, rng), npc: giver?.name, place: loc?.name }, rng),
      reward: rollLoot(rng, level, 1),
    };
  });
}

function makeSpotlight(rng: Rng, c: Pick<Campaign, 'villain' | 'factions' | 'locations' | 'region' | 'npcs'>, pc: PartyMember, ctx: FillCtx): string {
  const hook = pc.hook.trim() || `their past as a ${pc.species.toLowerCase()} ${pc.cls.toLowerCase()}`;
  return fill(rng.pick(SPOTLIGHTS), { ...ctx, pc: pc.name || 'a PC', hook: hook.replace(/\.$/, ''), npc: ctxOf(c, rng).npc }, rng);
}

function placeLocations(rng: Rng, region: Campaign['region'], kinds: LocationKind[]) {
  const land: { x: number; y: number; terrain: string }[] = [];
  const { cols, rows, cells } = region;
  for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) {
    const cell = cells[y * cols + x];
    if (cell.h < SEA_LEVEL + 0.01) continue;
    const biome = biomeOf(cell, y, rows);
    // Coastal flag: settlements next to water get 'coast' terrain.
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells[(y + dy) * cols + x + dx].h < SEA_LEVEL);
    land.push({ x: (x + 0.5) / cols, y: (y + 0.5) / rows, terrain: nearWater ? 'coast' : BIOME_TERRAIN[biome] });
  }
  const chosen: { x: number; y: number; terrain: string }[] = [];
  for (const kind of kinds) {
    let pick = land[0];
    for (let minD = 0.16; minD > 0.02; minD -= 0.02) {
      const ok = rng.shuffle(land).filter((p) => {
        // Cities/towns avoid mountain tops; dungeons like rough terrain.
        if ((kind === 'city' || kind === 'town') && p.terrain === 'mountains') return false;
        return chosen.every((q) => Math.hypot(p.x - q.x, (p.y - q.y) * 0.7) > minD);
      });
      if (ok.length) { pick = ok[0]; break; }
    }
    chosen.push(pick);
  }
  return chosen;
}

function roadNetwork(locs: Location[]): [string, string][] {
  const towns = locs.filter((l) => ['city', 'town', 'village', 'fortress'].includes(l.kind));
  if (towns.length < 2) return [];
  const inTree = [towns[0]];
  const rest = towns.slice(1);
  const roads: [string, string][] = [];
  while (rest.length) {
    let best = { d: Infinity, a: 0, b: 0 };
    inTree.forEach((a, ai) => rest.forEach((b, bi) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best.d) best = { d, a: ai, b: bi };
    }));
    roads.push([inTree[best.a].id, rest[best.b].id]);
    inTree.push(rest.splice(best.b, 1)[0]);
  }
  return roads;
}

export function generateCampaign(opts: CampaignOptions): Campaign {
  const rng = new Rng(`${opts.seed}|${opts.tones.join(',')}|${opts.startLevel}-${opts.endLevel}|${opts.partySize}|${opts.length}`);
  const tones: Tone[] = opts.tones.length ? opts.tones : rng.pickN(TONES.map((t) => t.id), rng.int(1, 2));
  const themes = tones.map((t) => rng.pick(TONE_THEMES[t]));

  const coastal = tones.includes('nautical') || rng.chance(0.6);
  const region = generateRegionTerrain(rng.fork('terrain'), regionName(rng), coastal);

  const actIdx = ACTS_BY_LENGTH[opts.length];
  const nLocs = LOCS_BY_LENGTH[opts.length];
  const kinds: LocationKind[] = ['city', 'town', 'village'];
  for (let i = 0; i < actIdx.length; i++) kinds.push('dungeon');
  const filler: LocationKind[] = ['wilderness', 'landmark', 'fortress', 'village', 'town', 'wilderness', 'landmark', 'dungeon'];
  while (kinds.length < nLocs) kinds.push(filler[(kinds.length - 3) % filler.length]);

  const positions = placeLocations(rng.fork('places'), region, kinds);
  const villain = makeVillain(rng.fork('villain'), tones, region.name, 'the capital');
  const minionTypes = VILLAIN_MINION_TYPES[villain.statBlock];
  const ranges = levelRanges(opts.startLevel, opts.endLevel, actIdx.length);

  // Dungeons are levelled to the act they'll appear in.
  let dungeonNo = 0;
  const locations: Location[] = kinds.map((kind, i) => {
    const lvl = kind === 'dungeon' ? ranges[Math.min(dungeonNo++, ranges.length - 1)][1] : opts.startLevel;
    return makeLocation(rng.fork(`loc${i}`), kind, positions[i], { level: lvl, partySize: opts.partySize, minionTypes });
  });
  villain.plan = fill(rng.pick(PLANS), { region: region.name, place: locations[0].name, faction: 'the crown' }, rng);

  const base = { villain, factions: [] as Faction[], locations, region, npcs: [] as Npc[] };

  const nFactions = { short: 3, medium: 4, long: 5, epic: 6 }[opts.length];
  const factionRng = rng.fork('factions');
  base.factions.push(makeFaction(factionRng, ctxOf(base, factionRng), 'enemy'));
  base.factions[0].goal = `serve ${villain.name} and see the plan through: ${villain.plan}`;
  for (let i = 1; i < nFactions; i++) base.factions.push(makeFaction(factionRng, ctxOf(base, factionRng)));

  // Lieutenants.
  const npcRng = rng.fork('npcs');
  const nLts = { short: 2, medium: 3, long: 3, epic: 4 }[opts.length];
  for (let i = 0; i < nLts; i++) {
    const lt = makeNpc(npcRng, ctxOf(base, npcRng), {
      attitude: 'enemy', role: npcRng.pick(['lieutenant', 'enforcer', 'spymaster', 'high priest', 'champion']),
      factionId: base.factions[0].id, location: npcRng.pick(locations.filter((l) => l.kind === 'dungeon')),
    });
    base.npcs.push(lt);
    villain.lieutenants.push(lt.id);
  }
  base.factions[0].leaderId = villain.lieutenants[0];

  // Settlement NPCs.
  for (const loc of locations) {
    const n = loc.kind === 'city' ? 3 : ['town', 'village', 'fortress'].includes(loc.kind) ? 2 : npcRng.chance(0.4) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const faction = npcRng.chance(0.35) ? npcRng.pick(base.factions.slice(1)) : undefined;
      base.npcs.push(makeNpc(npcRng, ctxOf(base, npcRng), { location: loc, factionId: faction?.id }));
    }
    if (loc.town) assignNpcs(loc.town, base.npcs.filter((n) => n.locationId === loc.id));
  }
  for (const f of base.factions.slice(1)) {
    const member = base.npcs.find((n) => n.factionId === f.id);
    if (member) f.leaderId = member.id;
  }

  // Acts: each gets a dungeon plus 1–2 other locations; last act gets the villain's lair.
  const actRng = rng.fork('acts');
  const dungeons = locations.filter((l) => l.kind === 'dungeon');
  const others = actRng.shuffle(locations.filter((l) => l.kind !== 'dungeon'));
  const used = new Set<string>();
  const acts: Act[] = actIdx.map((si, i) => {
    const locs = [others[i % others.length], others[(i + actIdx.length) % others.length], dungeons[i]].filter(
      (l, j, arr): l is Location => !!l && arr.indexOf(l) === j,
    );
    const npcs = base.npcs.filter((n) => locs.some((l) => l.id === n.locationId)).slice(0, 4);
    if (i === actIdx.length - 1) {
      const lair = dungeons[i];
      if (lair) lair.name = `${lair.name} (${villain.lair})`;
    }
    return makeAct(actRng, base, si, i + 1, ranges[i], opts.partySize, locs, npcs, used, opts.party ?? []);
  });

  const rumorRng = rng.fork('rumors');
  const rumors = rumorRng.pickN(RUMORS, 6).map((r) => fill(r, ctxOf(base, rumorRng), rumorRng));

  const title = opts.title.trim() || `${rng.pick(['The', 'Shadows of the', 'Rise of the', 'Fall of the', 'Curse of the', 'Legend of the'])} ${rng.pick(['Hollow Crown', 'Ashen Throne', 'Drowned Star', 'Ninth Bell', 'Iron Saint', 'Pale Tide', 'Broken Oath', 'Last Lantern', 'Sleeping Wyrm', 'Veiled Moon'])}`;
  const pitch = `In ${region.name}, ${villain.name} — a ${villain.archetype} — is driven ${villain.motivation.startsWith('to ') ? 'by the need ' + villain.motivation : 'by ' + villain.motivation}. Their plan: ${villain.plan}. A ${tones.map((t) => TONES.find((x) => x.id === t)!.label.toLowerCase()).join(' and ')} campaign about ${themes.join(' and ')}, for ${opts.party?.length ? opts.party.map((p) => p.name).filter(Boolean).join(', ') || `${opts.partySize} characters` : `${opts.partySize} characters`} from level ${opts.startLevel} to ${opts.endLevel}.`;

  const now = Date.now();
  const campaign: Campaign = {
    id: uid(), createdAt: now, updatedAt: now, options: opts, title, pitch, tones, themes,
    villain, factions: base.factions, npcs: base.npcs, locations, acts,
    region: { ...region, roads: roadNetwork(locations) }, rumors, sessions: [],
  };
  campaign.sessions = planSessions(rng.fork('sessions'), campaign);
  return campaign;
}

/** Fill in fields added in later versions so older saved campaigns keep working. */
export function migrate(c: Campaign): Campaign {
  const m: Campaign = {
    ...c,
    options: { ...c.options, party: c.options.party ?? [] },
    acts: c.acts.map((a) => ({ ...a, sideQuests: a.sideQuests ?? [] })),
    sessions: c.sessions ?? [],
  };
  if (!c.sessions) m.sessions = planSessions(new Rng(c.id), m);
  return m;
}

// ---------- Re-rolls (fresh randomness, keep ids/links stable) ----------

function freshRng(label: string) {
  return new Rng(`${label}:${Math.random()}`);
}

export function rerollNpc(c: Campaign, id: string): Campaign {
  const old = c.npcs.find((n) => n.id === id);
  if (!old) return c;
  const rng = freshRng('npc');
  const loc = c.locations.find((l) => l.id === old.locationId);
  const npc = { ...makeNpc(rng, ctxOf(c, rng), { location: loc, attitude: old.attitude, factionId: old.factionId, role: old.attitude === 'enemy' ? old.role : undefined }), id };
  return { ...c, npcs: c.npcs.map((n) => (n.id === id ? npc : n)), updatedAt: Date.now() };
}

export function rerollFaction(c: Campaign, id: string): Campaign {
  const old = c.factions.find((f) => f.id === id);
  if (!old) return c;
  const rng = freshRng('faction');
  const f = { ...makeFaction(rng, ctxOf(c, rng), old.attitude), id, leaderId: old.leaderId };
  return { ...c, factions: c.factions.map((x) => (x.id === id ? f : x)), updatedAt: Date.now() };
}

export function rerollVillain(c: Campaign): Campaign {
  const rng = freshRng('villain');
  const v = makeVillain(rng, c.tones, c.region.name, c.locations[0]?.name ?? 'the capital');
  return { ...c, villain: { ...v, id: c.villain.id, lieutenants: c.villain.lieutenants }, updatedAt: Date.now() };
}

export function rerollLocation(c: Campaign, id: string): Campaign {
  const old = c.locations.find((l) => l.id === id);
  if (!old) return c;
  const rng = freshRng('loc');
  const act = c.acts.find((a) => a.locationIds.includes(id));
  const level = act ? act.levels[1] : c.options.startLevel;
  const loc = { ...makeLocation(rng, old.kind, { x: old.x, y: old.y, terrain: old.terrain }, { level, partySize: c.options.partySize, minionTypes: VILLAIN_MINION_TYPES[c.villain.statBlock] }), id };
  return { ...c, locations: c.locations.map((l) => (l.id === id ? loc : l)), updatedAt: Date.now() };
}

export function rerollDungeon(c: Campaign, locId: string): Campaign {
  const loc = c.locations.find((l) => l.id === locId);
  if (!loc?.dungeon) return c;
  const rng = freshRng('dungeon');
  const d = generateDungeon(rng, { name: loc.name, level: loc.dungeon.level, partySize: c.options.partySize, preferTypes: VILLAIN_MINION_TYPES[c.villain.statBlock] });
  return { ...c, locations: c.locations.map((l) => (l.id === locId ? { ...l, dungeon: d } : l)), updatedAt: Date.now() };
}

export function rerollTown(c: Campaign, locId: string): Campaign {
  const loc = c.locations.find((l) => l.id === locId);
  if (!loc?.town) return c;
  const town = generateTown(freshRng('town'), loc.kind as 'village' | 'town' | 'city');
  assignNpcs(town, c.npcs.filter((n) => n.locationId === locId));
  return { ...c, locations: c.locations.map((l) => (l.id === locId ? { ...l, town } : l)), updatedAt: Date.now() };
}

export function rerollAct(c: Campaign, id: string): Campaign {
  const old = c.acts.find((a) => a.id === id);
  if (!old) return c;
  const rng = freshRng('act');
  const idxs = ACTS_BY_LENGTH[c.options.length];
  const locs = old.locationIds.map((lid) => c.locations.find((l) => l.id === lid)).filter((l): l is Location => !!l);
  const npcs = old.npcIds.map((nid) => c.npcs.find((n) => n.id === nid)).filter((n): n is Npc => !!n);
  const act = { ...makeAct(rng, c, idxs[old.number - 1], old.number, old.levels, c.options.partySize, locs, npcs, new Set([old.hook, old.climax]), c.options.party ?? []), id };
  return { ...c, acts: c.acts.map((a) => (a.id === id ? act : a)), updatedAt: Date.now() };
}

export function rerollEncounter(c: Campaign, actId: string, encId: string): Campaign {
  const rng = freshRng('enc');
  return {
    ...c,
    updatedAt: Date.now(),
    acts: c.acts.map((a) => a.id !== actId ? a : {
      ...a,
      encounters: a.encounters.map((e) => {
        if (e.id !== encId) return e;
        const final = e.title.startsWith('Final battle');
        const fresh = buildEncounter(rng, { level: e.level, partySize: c.options.partySize, difficulty: e.difficulty, preferTypes: VILLAIN_MINION_TYPES[c.villain.statBlock], boss: final ? c.villain.statBlock : undefined });
        return { ...fresh, id: e.id, title: final ? e.title : fresh.title };
      }),
    }),
  };
}

export function addNpc(c: Campaign, locationId?: string): Campaign {
  const rng = freshRng('newnpc');
  const npc = makeNpc(rng, ctxOf(c, rng), { location: c.locations.find((l) => l.id === locationId) });
  return { ...c, npcs: [...c.npcs, npc], updatedAt: Date.now() };
}
