import type { Rng } from '../lib/rng';
import { uid } from '../lib/rng';
import type { Corridor, Dungeon, Room } from '../lib/types';
import { ROOM_CONTENTS, ROOM_FEATURES, ROOM_NAMES, TRAPS, DUNGEON_HISTORY, DH_EVENT, DH_OCCUPANT, DH_PEOPLE, DH_PURPOSE, DUNGEON_THEMES } from '../data/story';
import { buildEncounter, rollLoot } from './encounter';
import type { Env } from '../data/monsters';

const W = 48;
const H = 36;

function overlaps(a: Room, b: Room, pad = 2) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

function center(r: Room): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}

function lPath(rng: Rng, a: [number, number], b: [number, number]): [number, number][] {
  const path: [number, number][] = [];
  const horizFirst = rng.chance(0.5);
  let [x, y] = a;
  const stepX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); path.push([x, y]); } };
  const stepY = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); path.push([x, y]); } };
  path.push([x, y]);
  if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  return path;
}

export function generateDungeon(
  rng: Rng,
  opts: { name: string; level: number; partySize: number; env?: Env; roomCount?: number; preferTypes?: string[] },
): Dungeon {
  const target = opts.roomCount ?? rng.int(7, 12);
  const raw: Room[] = [];
  for (let tries = 0; tries < 400 && raw.length < target; tries++) {
    const w = rng.int(4, 9);
    const h = rng.int(4, 7);
    const r: Room = {
      id: 0, x: rng.int(1, W - w - 1), y: rng.int(1, H - h - 1), w, h,
      name: '', contents: '', feature: '', exits: [],
    };
    if (!raw.some((o) => overlaps(o, r))) raw.push(r);
  }

  // Entrance = room closest to the bottom edge; number the rest by BFS distance.
  raw.sort((a, b) => b.y + b.h - (a.y + a.h));

  // Minimum spanning tree (Prim) over room centers + a few loops.
  const n = raw.length;
  const inTree = new Set<number>([0]);
  const edges: [number, number][] = [];
  const dist = (i: number, j: number) => {
    const [ax, ay] = center(raw[i]);
    const [bx, by] = center(raw[j]);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };
  while (inTree.size < n) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of inTree) for (let j = 0; j < n; j++) {
      if (inTree.has(j)) continue;
      const d = dist(i, j);
      if (d < bestD) { bestD = d; best = [i, j]; }
    }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  for (let k = 0; k < Math.floor(n / 4); k++) {
    const i = rng.int(0, n - 1);
    const j = rng.int(0, n - 1);
    if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i)) && dist(i, j) < 25) edges.push([i, j]);
  }

  // BFS order from entrance for numbering.
  const adj: number[][] = raw.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const order: number[] = [];
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const nb of adj[cur].sort((p, q) => raw[p].y - raw[q].y)) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
  }
  const idOf = new Map<number, number>();
  order.forEach((idx, i) => idOf.set(idx, i + 1));

  const names = rng.shuffle(ROOM_NAMES.any);
  const rooms: Room[] = order.map((idx, i) => {
    const r = raw[idx];
    const isLast = i === order.length - 1;
    const room: Room = {
      ...r,
      id: i + 1,
      name: i === 0 ? 'Entrance' : isLast ? 'Inner Sanctum' : names[i % names.length],
      feature: rng.pick(ROOM_FEATURES),
      contents: i === 0 ? 'The way in. Signs of recent passage.' : isLast ? 'The heart of the dungeon — the boss waits here.' : rng.pick(ROOM_CONTENTS),
      exits: adj[idx].map((j) => idOf.get(j)!).sort((a, b) => a - b),
    };
    if (isLast) {
      room.encounter = buildEncounter(rng, { level: opts.level, partySize: opts.partySize, env: opts.env ?? 'dungeon', difficulty: 'High', preferTypes: opts.preferTypes });
      room.treasure = rollLoot(rng, opts.level, 2);
    } else if (i > 0 && (room.contents.includes('monster') || room.contents.includes('Guardians') || rng.chance(0.35))) {
      room.encounter = buildEncounter(rng, { level: opts.level, partySize: opts.partySize, env: opts.env ?? 'dungeon', preferTypes: opts.preferTypes });
    }
    if (i > 0 && (room.contents.includes('Treasure') || rng.chance(0.2))) room.treasure = rollLoot(rng, opts.level, 1);
    if (i > 0 && (room.contents.includes('trap') || rng.chance(0.2))) room.trap = rng.pick(TRAPS);
    return room;
  });

  const corridors: Corridor[] = edges.map(([a, b]) => ({
    a: idOf.get(a)!,
    b: idOf.get(b)!,
    path: lPath(rng, center(raw[a]), center(raw[b])),
    door: rng.weighted([
      { value: 'open' as const, weight: 5 }, { value: 'door' as const, weight: 4 },
      { value: 'locked' as const, weight: 1 }, { value: 'secret' as const, weight: 1 },
    ]),
  }));

  const history = DUNGEON_HISTORY[0]
    .replace('{people}', rng.pick(DH_PEOPLE))
    .replace('{purpose}', rng.pick(DH_PURPOSE))
    .replace('{event}', rng.pick(DH_EVENT))
    .replace('{occupant}', rng.pick(DH_OCCUPANT));

  return {
    id: uid(), name: opts.name, theme: rng.pick(DUNGEON_THEMES), level: opts.level,
    width: W, height: H, rooms, corridors, history,
  };
}
