// Hybrid mode: the tables build the skeleton; the LLM rewrites it into prose and weaves
// connections between villain, NPCs, factions and places. Structure/ids never change.
import type { Campaign } from '../lib/types';
import { chat, parseJsonLoose, type LlmSettings } from './llm';

const SYSTEM = `You are a veteran Dungeon Master and adventure writer for D&D 5e (2024 rules).
You receive a procedurally generated campaign skeleton as JSON. Your job:
- Turn terse table results into vivid, usable prose for a DM.
- TIE THINGS TOGETHER: reference other NPCs, factions, places and the villain BY NAME so the campaign feels connected.
- Keep every name, id and fact from the skeleton. You may add small details, never contradict the skeleton.
- Be concrete and gameable (sensory details, what the NPC wants from the party, what a scene is for). No purple filler.
- Reply with ONLY a JSON object, no markdown fences, no commentary.`;

/** Compact view of the campaign used as shared context in every call. */
function skeleton(c: Campaign) {
  const loc = (id?: string) => c.locations.find((l) => l.id === id)?.name;
  const fac = (id?: string) => c.factions.find((f) => f.id === id)?.name;
  return {
    title: c.title,
    tones: c.tones,
    themes: c.themes,
    region: c.region.name,
    levels: `${c.options.startLevel}-${c.options.endLevel}`,
    dm_notes: c.options.notes || undefined,
    villain: { name: c.villain.name, archetype: c.villain.archetype, species: c.villain.species, motivation: c.villain.motivation, plan: c.villain.plan, weakness: c.villain.weakness, lair: c.villain.lair, lieutenants: c.villain.lieutenants.map((id) => c.npcs.find((n) => n.id === id)?.name) },
    factions: c.factions.map((f) => ({ id: f.id, name: f.name, kind: f.kind, goal: f.goal, method: f.method, symbol: f.symbol, attitude: f.attitude, leader: c.npcs.find((n) => n.id === f.leaderId)?.name })),
    npcs: c.npcs.map((n) => ({ id: n.id, name: n.name, species: n.species, role: n.role, personality: n.personality, quirk: n.quirk, secret: n.secret, want: n.want, appearance: n.appearance, attitude: n.attitude, location: loc(n.locationId), faction: fac(n.factionId) })),
    locations: c.locations.map((l) => ({ id: l.id, name: l.name, kind: l.kind, terrain: l.terrain, summary: l.summary, features: l.features, dungeon_history: l.dungeon?.history })),
    acts: c.acts.map((a) => ({ id: a.id, number: a.number, title: a.title, levels: a.levels, summary: a.summary, hook: a.hook, goals: a.goals, climax: a.climax, locations: a.locationIds.map(loc), npcs: a.npcIds.map((id) => c.npcs.find((n) => n.id === id)?.name) })),
  };
}

type Section = 'overview' | 'npcs' | 'factions' | 'locations' | 'acts';

const INSTRUCTIONS: Record<Section, string> = {
  overview: `Return {"pitch": string (a 120-180 word campaign pitch for the DM, with the central conflict and why the party matters), "villain": string (180-250 words: history, how the villain became this, their methods, how they escalate across the acts, and how the weakness can be discovered)}.`,
  npcs: `Return {"npcs": {"<npc id>": string}} with an entry for EVERY npc: 60-100 words each — how they look/sound, what they want from the party, how they connect to at least one other named NPC, faction or the villain, and one line of sample dialogue in quotes.`,
  factions: `Return {"factions": {"<faction id>": string}} with an entry for EVERY faction: 80-120 words — who they are, their leader, what they offer and demand from the party, and their stance toward the villain and the other factions (by name).`,
  locations: `Return {"locations": {"<location id>": string}} with an entry for EVERY location: 70-110 words — a read-aloud-style first impression, then what is going on there now, and which NPCs/factions/villain agents are involved.`,
  acts: `Return {"acts": {"<act id>": string}} with an entry for EVERY act: 180-260 words — how the act opens (using its hook), the main beats in order, where the party goes, who they meet, what clues point toward the next act, and how the climax plays out. Refer to NPCs/places by name.`,
};

async function run<T>(s: LlmSettings, c: Campaign, section: Section, signal?: AbortSignal): Promise<T> {
  const text = await chat(s, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Campaign skeleton:\n${JSON.stringify(skeleton(c))}\n\nTask: ${INSTRUCTIONS[section]}` },
  ], { json: true, maxTokens: section === 'npcs' || section === 'acts' ? 8000 : 4000, signal });
  return parseJsonLoose<T>(text);
}

export const SECTIONS: Section[] = ['overview', 'factions', 'npcs', 'locations', 'acts'];

/** Expand one section and merge it into a copy of the campaign. */
export async function expandSection(s: LlmSettings, c: Campaign, section: Section, signal?: AbortSignal): Promise<Campaign> {
  switch (section) {
    case 'overview': {
      const r = await run<{ pitch?: string; villain?: string }>(s, c, section, signal);
      return { ...c, pitch: r.pitch || c.pitch, villain: { ...c.villain, description: r.villain || c.villain.description } };
    }
    case 'npcs': {
      const r = await run<{ npcs?: Record<string, string> }>(s, c, section, signal);
      return { ...c, npcs: c.npcs.map((n) => ({ ...n, description: r.npcs?.[n.id] ?? n.description })) };
    }
    case 'factions': {
      const r = await run<{ factions?: Record<string, string> }>(s, c, section, signal);
      return { ...c, factions: c.factions.map((f) => ({ ...f, description: r.factions?.[f.id] ?? f.description })) };
    }
    case 'locations': {
      const r = await run<{ locations?: Record<string, string> }>(s, c, section, signal);
      return { ...c, locations: c.locations.map((l) => ({ ...l, description: r.locations?.[l.id] ?? l.description })) };
    }
    case 'acts': {
      const r = await run<{ acts?: Record<string, string> }>(s, c, section, signal);
      return { ...c, acts: c.acts.map((a) => ({ ...a, description: r.acts?.[a.id] ?? a.description })) };
    }
  }
}

export type EntityKind = 'npc' | 'faction' | 'location' | 'act' | 'villain';

/** Expand a single entity (used after re-rolling one part). */
export async function expandOne(s: LlmSettings, c: Campaign, kind: EntityKind, id: string, signal?: AbortSignal): Promise<string> {
  const lengths: Record<EntityKind, string> = {
    npc: '60-100 words incl. one line of sample dialogue', faction: '80-120 words', location: '70-110 words',
    act: '180-260 words covering opening, beats, clues and climax', villain: '180-250 words',
  };
  const text = await chat(s, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Campaign skeleton:\n${JSON.stringify(skeleton(c))}\n\nTask: write a fresh description for the ${kind}${kind === 'villain' ? '' : ` with id "${id}"`} (${lengths[kind]}), tied to the rest of the campaign by name. Return {"description": string}.` },
  ], { json: true, maxTokens: 2000, signal });
  return parseJsonLoose<{ description: string }>(text).description;
}
