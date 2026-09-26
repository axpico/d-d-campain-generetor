// Session-by-session planning. Tables build a playable skeleton for each 3–4 hour session;
// the AI (ai/session.ts) writes recap, read-aloud text and dialogue, and adapts to the play log.
import { Rng, uid } from '../lib/rng';
import type { Act, Campaign, Encounter, Location, Mood, Scene, SceneKind, Session } from '../lib/types';
import { CLUES, PASSWORDS, PREP_ITEMS, SCENE_TEMPLATES, STRONG_STARTS } from '../data/story';
import { fill, type FillCtx } from './fill';
import { buildEncounter, rollLoot } from './encounter';
import { TERRAIN_ENV } from '../data/monsters';
import { ctxOf, VILLAIN_MINION_TYPES } from './campaign';

export const MOOD_LABEL: Record<Mood, string> = {
  tavern: 'Tavern', town: 'Town', travel: 'Travel', forest: 'Forest', dungeon: 'Dungeon', battle: 'Battle', boss: 'Boss fight',
  horror: 'Horror', mystery: 'Mystery', sea: 'Sea', sacred: 'Sacred', calm: 'Calm',
};

function moodFor(kind: SceneKind, loc: Location | undefined, c: Campaign, climax = false): Mood {
  if (kind === 'combat') return climax ? 'boss' : 'battle';
  if (kind === 'rest') return loc && ['town', 'city', 'village'].includes(loc.kind) ? 'tavern' : 'calm';
  if (kind === 'travel') return loc?.terrain === 'coast' && c.tones.includes('nautical') ? 'sea' : 'travel';
  if (c.tones.includes('dark') && (kind === 'exploration' || kind === 'infiltration') && loc?.kind === 'dungeon') return 'horror';
  if (loc?.kind === 'dungeon') return 'dungeon';
  if (c.tones.includes('mystery') && (kind === 'exploration' || kind === 'social')) return 'mystery';
  if (loc?.terrain === 'forest' && loc.kind === 'wilderness') return 'forest';
  if (loc?.terrain === 'coast' && c.tones.includes('nautical')) return 'sea';
  if (loc && ['town', 'city', 'village', 'fortress'].includes(loc.kind)) return kind === 'social' ? 'tavern' : 'town';
  if (loc?.kind === 'landmark') return 'sacred';
  return 'travel';
}

function sessionsForAct(a: Act): number {
  return Math.max(2, Math.min(4, a.levels[1] - a.levels[0] + 2));
}

function makeScene(rng: Rng, c: Campaign, kind: SceneKind, loc: Location | undefined, npcIds: string[], ctx: FillCtx, extra: Partial<Scene> = {}): Scene {
  const t = SCENE_TEMPLATES[kind];
  const npc = c.npcs.find((n) => n.id === npcIds[0]);
  const sctx = { ...ctx, place: loc?.name ?? ctx.place, npc: npc?.name ?? ctx.npc };
  return {
    id: uid(),
    kind,
    title: fill(rng.pick(t.title), sctx, rng),
    locationId: loc?.id,
    npcIds,
    purpose: fill(rng.pick(t.purpose), sctx, rng),
    outcome: fill(rng.pick(t.outcome), sctx, rng),
    mood: moodFor(kind, loc, c, extra.title?.startsWith('Climax')),
    ...extra,
  };
}

export function buildSession(rng: Rng, c: Campaign, act: Act, indexInAct: number, total: number, number: number, level: number): Session {
  const locs = act.locationIds.map((id) => c.locations.find((l) => l.id === id)).filter((l): l is Location => !!l);
  const isFirst = indexInAct === 0;
  const isLast = indexInAct === total - 1;
  const loc = locs[indexInAct % Math.max(1, locs.length)];
  const dungeon = locs.find((l) => l.dungeon);
  const actNpcs = act.npcIds.length ? act.npcIds : c.npcs.filter((n) => n.attitude !== 'enemy').slice(0, 3).map((n) => n.id);
  const friendly = c.npcs.filter((n) => n.attitude !== 'enemy');
  const ctx: FillCtx = { ...ctxOf(c, rng), place: loc?.name, npc: friendly.length ? rng.pick(friendly).name : undefined };
  const minion = VILLAIN_MINION_TYPES[c.villain.statBlock];
  const enc = (l?: Location, difficulty?: Encounter['difficulty']) => buildEncounter(rng, {
    level, partySize: c.options.partySize, difficulty, preferTypes: minion,
    env: l?.kind === 'dungeon' ? 'dungeon' : l && ['town', 'city', 'village', 'fortress'].includes(l.kind) ? 'urban' : TERRAIN_ENV[l?.terrain ?? ''],
  });

  const scenes: Scene[] = [];
  // 1. Strong start
  scenes.push(makeScene(rng, c, isFirst ? 'social' : rng.pick(['combat', 'social', 'exploration'] as SceneKind[]), loc, rng.pickN(actNpcs, 1), ctx, isFirst ? { title: 'The Hook', purpose: `Get the party invested: ${ctx.npc ?? 'a local'} explains what is at stake and why it has to be them.` } : {}));
  // 2. Investigation / social
  scenes.push(makeScene(rng, c, rng.pick(['social', 'exploration', 'infiltration'] as SceneKind[]), loc, rng.pickN(actNpcs, 2), ctx));
  // 3. Side quest or travel
  const sq = act.sideQuests[indexInAct];
  if (sq) {
    const sqLoc = c.locations.find((l) => l.id === sq.locationId);
    scenes.push(makeScene(rng, c, 'social', sqLoc, sq.giverId ? [sq.giverId] : [], ctx, { title: `Side quest: ${sq.title}`, purpose: sq.summary, outcome: 'Accept, refuse, or bargain; completing it later earns the listed reward.' }));
  } else {
    const next = locs[(indexInAct + 1) % Math.max(1, locs.length)];
    scenes.push(makeScene(rng, c, 'travel', next, [], { ...ctx, place: next?.name }));
  }
  // 4. Main challenge
  const mainLoc = isLast && dungeon ? dungeon : loc;
  if (isLast) {
    const final = act.encounters[act.encounters.length - 1];
    scenes.push(makeScene(rng, c, 'exploration', mainLoc, [], ctx, mainLoc?.dungeon ? { title: `Into ${mainLoc.name}`, purpose: `Delve through the dungeon (see the room key in Locations). ${mainLoc.dungeon.history}` } : {}));
    scenes.push(makeScene(rng, c, 'combat', mainLoc, act.boss ? [act.boss] : [], ctx, { title: 'Climax', purpose: act.climax, outcome: 'The act\'s goal is won or lost; the next act\'s hook appears.', encounter: final, mood: 'boss' }));
  } else {
    scenes.push(makeScene(rng, c, 'combat', mainLoc, [], ctx, { encounter: act.encounters[indexInAct] ?? enc(mainLoc) }));
    // 5. Breather / spotlight
    scenes.push(makeScene(rng, c, 'rest', loc, [], ctx, act.spotlight && indexInAct === 1 ? { title: 'Spotlight', purpose: act.spotlight, outcome: 'A personal thread for one PC moves forward.' } : {}));
  }
  scenes.forEach((s) => { if (s.kind === 'combat' && !s.encounter) s.encounter = enc(c.locations.find((l) => l.id === s.locationId)); });

  const npc = rng.pick(c.npcs);
  const secrets = rng.pickN(CLUES, 8).map((t) => fill(t, {
    ...ctxOf(c, rng), secret: npc.secret, weakness: c.villain.weakness, password: rng.pick(PASSWORDS), rumor: rng.pick(c.rumors),
    npc: npc.name,
  }, rng));

  const treasure = rollLoot(rng, level, isLast ? 2 : 1);
  const monsters = [...new Set(scenes.flatMap((s) => s.encounter?.monsters.map((m) => m.name) ?? []))].join(', ');
  const moods = [...new Set(scenes.map((s) => MOOD_LABEL[s.mood]))].join(', ');
  const prep = rng.pickN(PREP_ITEMS, 5).map((t) => fill(t, { ...ctx, npc: c.npcs.find((n) => n.id === actNpcs[0])?.name, monsters: monsters || 'none', moods, treasure: treasure.map((x) => x.name).join(', ') }, rng));

  const main = scenes[3] ?? scenes[scenes.length - 1];
  return {
    id: uid(),
    number,
    actId: act.id,
    title: isFirst ? act.title : isLast ? `${act.title}: Climax` : main.title,
    level,
    status: 'planned',
    strongStart: isFirst ? fill(act.hook, ctx, rng) : fill(rng.pick(STRONG_STARTS), ctx, rng),
    scenes,
    secrets,
    npcLines: {},
    treasure,
    prep,
  };
}

export function planSessions(rng: Rng, c: Campaign): Session[] {
  const out: Session[] = [];
  for (const act of c.acts) {
    const n = sessionsForAct(act);
    for (let i = 0; i < n; i++) {
      const level = Math.round(act.levels[0] + ((act.levels[1] - act.levels[0]) * i) / Math.max(1, n - 1));
      out.push(buildSession(rng.fork(`s${act.number}-${i}`), c, act, i, n, out.length + 1, level));
    }
  }
  return out;
}

const renumber = (list: Session[]) => list.map((s, i) => ({ ...s, number: i + 1 }));

export function rerollSession(c: Campaign, id: string): Campaign {
  const old = c.sessions.find((s) => s.id === id);
  const act = c.acts.find((a) => a.id === old?.actId);
  if (!old || !act) return c;
  const inAct = c.sessions.filter((s) => s.actId === act.id);
  const idx = inAct.findIndex((s) => s.id === id);
  const fresh = { ...buildSession(new Rng(Math.random() * 1e9), c, act, idx, inAct.length, old.number, old.level), id };
  return { ...c, sessions: c.sessions.map((s) => (s.id === id ? fresh : s)), updatedAt: Date.now() };
}

/** Insert an extra planned session right after `afterId` (same act). */
export function insertSession(c: Campaign, afterId: string): Campaign {
  const i = c.sessions.findIndex((s) => s.id === afterId);
  const prev = c.sessions[i];
  const act = c.acts.find((a) => a.id === prev?.actId);
  if (!prev || !act) return c;
  const s = buildSession(new Rng(Math.random() * 1e9), c, act, 1, 3, prev.number + 1, prev.level);
  const list = [...c.sessions];
  list.splice(i + 1, 0, s);
  return { ...c, sessions: renumber(list), updatedAt: Date.now() };
}

export function deleteSession(c: Campaign, id: string): Campaign {
  return { ...c, sessions: renumber(c.sessions.filter((s) => s.id !== id)), updatedAt: Date.now() };
}
