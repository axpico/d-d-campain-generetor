// Hybrid mode: the tables build the skeleton; the LLM rewrites it into prose and weaves
// connections between villain, NPCs, factions and places. Structure/ids never change.
//
// Robustness for small/free models:
//  - no JSON: answers use "@@ KEY" labelled blocks (see parseBlocks)
//  - short aliases (N3, L2, A1) instead of random ids, which models tend to mangle
//  - small batches, so replies don't get cut off
//  - missing items are retried once, and partial results are kept
import type { Campaign } from '../lib/types';
import { chat, parseBlocks, type ChatMessage, type LlmSettings } from './llm';
import { writeSession } from './session';

export const SYSTEM = `You are a veteran Dungeon Master and adventure writer for D&D 5e (2024 rules).
You receive a procedurally generated campaign skeleton. Your job:
- Turn terse table results into vivid, usable prose for a DM.
- TIE THINGS TOGETHER: reference other NPCs, factions, places, player characters and the villain BY NAME.
- Keep every name and fact from the skeleton. You may add small details, never contradict it.
- Be concrete and gameable: sensory details, what an NPC wants from the party, what a scene is for. No filler.
- If player characters are listed, weave their backstory hooks in where it fits naturally.`;

export const FORMAT = `OUTPUT FORMAT (important):
Write each item as a block. A block starts with a line containing only "@@" and the item's key, followed by the text on the next lines.
Do not use JSON. Do not add a preamble or closing remarks. Example:
@@N1
Text about the first item…

@@N2
Text about the second item…`;

export interface Aliases { toId: Map<string, string>; toAlias: Map<string, string> }

export function aliases(c: Campaign): Aliases {
  const toId = new Map<string, string>();
  const toAlias = new Map<string, string>();
  const add = (prefix: string, ids: string[]) => ids.forEach((id, i) => { toId.set(`${prefix}${i + 1}`, id); toAlias.set(id, `${prefix}${i + 1}`); });
  add('N', c.npcs.map((n) => n.id));
  add('F', c.factions.map((f) => f.id));
  add('L', c.locations.map((l) => l.id));
  add('A', c.acts.map((a) => a.id));
  return { toId, toAlias };
}

/** Compact, alias-keyed view of the campaign used as shared context in every call. */
export function skeleton(c: Campaign, al: Aliases = aliases(c)) {
  const loc = (id?: string) => c.locations.find((l) => l.id === id)?.name;
  const fac = (id?: string) => c.factions.find((f) => f.id === id)?.name;
  const npc = (id?: string) => c.npcs.find((n) => n.id === id)?.name;
  return {
    title: c.title,
    tones: c.tones,
    themes: c.themes,
    region: c.region.name,
    levels: `${c.options.startLevel}-${c.options.endLevel}`,
    dm_notes: c.options.notes || undefined,
    player_characters: c.options.party?.length ? c.options.party.map((p) => `${p.name} (${p.species} ${p.cls}): ${p.hook}`) : undefined,
    villain: { name: c.villain.name, archetype: c.villain.archetype, species: c.villain.species, motivation: c.villain.motivation, plan: c.villain.plan, weakness: c.villain.weakness, lair: c.villain.lair, lieutenants: c.villain.lieutenants.map(npc) },
    factions: c.factions.map((f) => ({ key: al.toAlias.get(f.id), name: f.name, kind: f.kind, goal: f.goal, method: f.method, attitude: f.attitude, leader: npc(f.leaderId) })),
    npcs: c.npcs.map((n) => ({ key: al.toAlias.get(n.id), name: n.name, who: `${n.species} ${n.role}`, personality: `${n.personality}; ${n.quirk}`, secret: n.secret, want: n.want, looks: n.appearance, attitude: n.attitude, at: loc(n.locationId), faction: fac(n.factionId) })),
    locations: c.locations.map((l) => ({ key: al.toAlias.get(l.id), name: l.name, kind: `${l.kind} (${l.terrain})`, summary: l.summary, features: l.features.join('; '), history: l.dungeon?.history })),
    acts: c.acts.map((a) => ({
      key: al.toAlias.get(a.id), number: a.number, title: a.title, levels: a.levels.join('-'), summary: a.summary, hook: a.hook, goals: a.goals,
      climax: a.climax, locations: a.locationIds.map(loc), npcs: a.npcIds.map(npc), side_quests: a.sideQuests.map((q) => `${q.title}: ${q.summary}`), spotlight: a.spotlight,
    })),
  };
}

export type Section = 'overview' | 'factions' | 'npcs' | 'locations' | 'acts';
export const SECTIONS: Section[] = ['overview', 'factions', 'npcs', 'locations', 'acts'];

const BATCH: Record<Exclude<Section, 'overview'>, number> = { factions: 3, npcs: 4, locations: 3, acts: 1 };

const WHAT: Record<Exclude<Section, 'overview'>, string> = {
  npcs: '60-100 words each: how they look and sound, what they want from the party, how they connect to at least one other named NPC, faction, PC or the villain, and one line of sample dialogue in quotes',
  factions: '80-120 words each: who they are, their leader, what they offer and demand from the party, and their stance toward the villain and the other factions (by name)',
  locations: '70-110 words each: a read-aloud style first impression, then what is happening there now, and which NPCs/factions/villain agents are involved',
  acts: '200-300 words: how the act opens (using its hook), the main beats in order, where the party goes, who they meet, the side quests and PC spotlight woven in, clues toward the next act, and how the climax plays out',
};

export interface ExpandCallbacks {
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
  onProgress?: (label: string) => void;
  onUpdate?: (c: Campaign) => void;
}

function msgs(c: Campaign, al: Aliases, task: string): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM}\n\n${FORMAT}` },
    { role: 'user', content: `Campaign skeleton:\n${JSON.stringify(skeleton(c, al))}\n\nTASK: ${task}\n\nRemember: "@@KEY" blocks only, no JSON.` },
  ];
}

function nameOf(c: Campaign, id: string): string {
  return c.npcs.find((x) => x.id === id)?.name ?? c.factions.find((x) => x.id === id)?.name ?? c.locations.find((x) => x.id === id)?.name
    ?? c.acts.find((x) => x.id === id)?.title ?? id;
}

function apply(c: Campaign, section: Exclude<Section, 'overview'>, texts: Map<string, string>): Campaign {
  const d = <T extends { id: string; description?: string }>(x: T) => (texts.has(x.id) ? { ...x, description: texts.get(x.id) } : x);
  switch (section) {
    case 'npcs': return { ...c, npcs: c.npcs.map(d) };
    case 'factions': return { ...c, factions: c.factions.map(d) };
    case 'locations': return { ...c, locations: c.locations.map(d) };
    case 'acts': return { ...c, acts: c.acts.map(d) };
  }
}

/** Expand one batch of items; returns the texts it got, keyed by real id. */
async function batch(s: LlmSettings, c: Campaign, al: Aliases, section: Exclude<Section, 'overview'>, ids: string[], cb: ExpandCallbacks) {
  const list = ids.map((id) => `@@${al.toAlias.get(id)} = ${nameOf(c, id)}`).join('\n');
  const text = await chat(s, msgs(c, al, `Write descriptions for these ${section} (${WHAT[section]}). Use exactly these keys:\n${list}`), {
    maxTokens: 6000, signal: cb.signal, onDelta: cb.onDelta,
  });
  const blocks = parseBlocks(text);
  const got = new Map<string, string>();
  for (const [k, v] of Object.entries(blocks)) {
    const id = al.toId.get(k.toUpperCase()) ?? (ids.includes(k) ? k : undefined);
    if (id && ids.includes(id) && v.length > 20) got.set(id, v.replace(/^=\s*[^\n]*\n/, '').trim());
  }
  // A single-item batch with no recognisable key: take the whole reply.
  if (!got.size && ids.length === 1 && text.trim().length > 40 && !text.includes('@@')) got.set(ids[0], text.trim());
  return got;
}

export async function expandSection(s: LlmSettings, c: Campaign, section: Section, cb: ExpandCallbacks = {}): Promise<{ campaign: Campaign; failed: string[] }> {
  const al = aliases(c);
  if (section === 'overview') {
    cb.onProgress?.('Writing pitch and villain…');
    const text = await chat(s, msgs(c, al, 'Write two blocks.\n@@PITCH: a 120-180 word campaign pitch for the DM — the central conflict and why the party matters.\n@@VILLAIN: 180-250 words — the villain\'s history, how they became this, their methods, how they escalate across the acts, and how their weakness can be discovered.'), {
      maxTokens: 5000, signal: cb.signal, onDelta: cb.onDelta,
    });
    const b = Object.fromEntries(Object.entries(parseBlocks(text)).map(([k, v]) => [k.toUpperCase(), v]));
    const campaign = { ...c, pitch: b.PITCH || c.pitch, villain: { ...c.villain, description: b.VILLAIN || c.villain.description } };
    cb.onUpdate?.(campaign);
    return { campaign, failed: [!b.PITCH && 'pitch', !b.VILLAIN && 'villain'].filter(Boolean) as string[] };
  }

  const all = { npcs: c.npcs, factions: c.factions, locations: c.locations, acts: c.acts }[section].map((x) => x.id);
  let cur = c;
  const failed: string[] = [];
  for (let i = 0; i < all.length; i += BATCH[section]) {
    const ids = all.slice(i, i + BATCH[section]);
    cb.onProgress?.(`Writing ${section} ${i + 1}–${Math.min(all.length, i + ids.length)} of ${all.length}…`);
    let got = new Map<string, string>();
    try {
      got = await batch(s, cur, al, section, ids, cb);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      cb.onDelta?.(`\n[batch failed: ${(e as Error).message.slice(0, 120)} — retrying items one by one]\n`);
    }
    // Retry anything missing one at a time (small requests succeed far more often).
    for (const id of ids.filter((x) => !got.has(x))) {
      try {
        const one = await batch(s, cur, al, section, [id], cb);
        one.forEach((v, k) => got.set(k, v));
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
      if (!got.has(id)) failed.push(nameOf(c, id));
    }
    cur = apply(cur, section, got);
    cb.onUpdate?.(cur);
  }
  return { campaign: cur, failed };
}

/**
 * Expand the whole campaign: pitch, villain, factions, NPCs, locations, acts — and then every
 * session that hasn't been played yet (recap, read-aloud text, NPC lines, clues).
 */
export async function expandAll(s: LlmSettings, c: Campaign, cb: ExpandCallbacks = {}, opts: { sessions?: boolean } = { sessions: true }) {
  let cur = c;
  const failed: string[] = [];
  for (const sec of SECTIONS) {
    const r = await expandSection(s, cur, sec, cb);
    cur = { ...r.campaign, aiExpanded: true };
    failed.push(...r.failed);
  }
  if (opts.sessions !== false) {
    const todo = cur.sessions.filter((x) => x.status !== 'played');
    for (let i = 0; i < todo.length; i++) {
      const target = cur.sessions.find((x) => x.id === todo[i].id)!;
      cb.onProgress?.(`Writing session ${target.number} (${i + 1} of ${todo.length})…`);
      try {
        const written = await writeSession(s, cur, target, cb);
        cur = { ...cur, sessions: cur.sessions.map((x) => (x.id === written.id ? written : x)) };
        cb.onUpdate?.(cur);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        failed.push(`Session ${target.number}`);
      }
    }
  }
  return { campaign: cur, failed };
}

export type EntityKind = 'npc' | 'faction' | 'location' | 'act' | 'villain';

/** Expand a single entity (used after re-rolling one part). */
export async function expandOne(s: LlmSettings, c: Campaign, kind: EntityKind, id: string, cb: ExpandCallbacks = {}): Promise<string> {
  const al = aliases(c);
  const lengths: Record<EntityKind, string> = {
    npc: WHAT.npcs.replace(' each', ''), faction: WHAT.factions.replace(' each', ''), location: WHAT.locations.replace(' each', ''),
    act: WHAT.acts, villain: '180-250 words: history, methods, escalation across the acts, how the weakness can be discovered',
  };
  const key = kind === 'villain' ? 'VILLAIN' : al.toAlias.get(id) ?? 'TEXT';
  const text = await chat(s, msgs(c, al, `Write a fresh description for ${kind === 'villain' ? 'the villain' : `${key} (${nameOf(c, id)})`}: ${lengths[kind]}. Output one block: @@${key}`), {
    maxTokens: 5000, signal: cb.signal, onDelta: cb.onDelta,
  });
  const b = parseBlocks(text);
  const v = Object.entries(b).find(([k]) => k.toUpperCase() === key)?.[1] ?? Object.values(b)[0] ?? (text.includes('@@') ? '' : text.trim());
  if (!v) throw new Error('The model reply had no usable text. Try again or pick another model.');
  return v;
}

/**
 * Merge AI-written text from `result` onto the user's newest campaign `latest`, so edits made while
 * the AI was working (renames, notes, re-rolls, play logs) are never overwritten.
 */
export function mergeAi(latest: Campaign, result: Campaign): Campaign {
  const desc = <T extends { id: string; description?: string }>(mine: T[], theirs: T[]) =>
    mine.map((x) => { const t = theirs.find((y) => y.id === x.id); return t?.description && t.description !== x.description ? { ...x, description: t.description } : x; });
  return {
    ...latest,
    pitch: result.pitch !== latest.pitch && result.pitch ? result.pitch : latest.pitch,
    villain: result.villain.id === latest.villain.id && result.villain.description ? { ...latest.villain, description: result.villain.description } : latest.villain,
    npcs: desc(latest.npcs, result.npcs),
    factions: desc(latest.factions, result.factions),
    locations: desc(latest.locations, result.locations),
    acts: desc(latest.acts, result.acts),
    sessions: latest.sessions.map((x) => {
      const t = result.sessions.find((y) => y.id === x.id);
      if (!t || !t.recap || (t.recap === x.recap && t.strongStart === x.strongStart)) return x;
      // take the AI's writing, keep the user's play state
      return { ...t, status: x.status, playLog: x.playLog, gameId: x.gameId, number: x.number };
    }),
    aiExpanded: result.aiExpanded || latest.aiExpanded,
    updatedAt: Date.now(),
  };
}
