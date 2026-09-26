// Tactical battle map: 5-ft squares, walls, obstacles (cover), difficult terrain.
// Pathfinding (A*), line of sight, cover and area-of-effect geometry live here.
import { Rng } from '../lib/rng';
import type { Creature, GameState } from './types';

export const FLOOR = 0;
export const WALL = 1; // blocks movement and sight
export const DIFFICULT = 2; // costs double movement
export const OBSTACLE = 3; // blocks movement, gives cover, doesn't block sight fully (crates, pillars, trees)
export const WATER = 4; // difficult terrain

export interface BattleMap {
  w: number;
  h: number;
  cells: number[]; // row-major
  theme: 'dungeon' | 'forest' | 'town' | 'cave' | 'open';
  name: string;
}

export const cellAt = (m: BattleMap, x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? WALL : m.cells[y * m.w + x]);
const passable = (t: number) => t === FLOOR || t === DIFFICULT || t === WATER;

// ---------- coordinates (A1 = top-left; letters are columns, numbers are rows) ----------

export function coordName(x: number, y: number): string {
  const col = x < 26 ? String.fromCharCode(65 + x) : `A${String.fromCharCode(65 + x - 26)}`;
  return `${col}${y + 1}`;
}

export function parseCoord(s: string): { x: number; y: number } | undefined {
  const m = s.trim().toUpperCase().match(/^([A-Z]{1,2})\s*(\d{1,2})$/);
  if (!m) return undefined;
  const x = m[1].length === 1 ? m[1].charCodeAt(0) - 65 : 26 + m[1].charCodeAt(1) - 65;
  return { x, y: Number(m[2]) - 1 };
}

// ---------- generation ----------

export function generateBattleMap(seed: string, theme: BattleMap['theme'], name: string): BattleMap {
  const rng = new Rng(seed);
  const w = 24;
  const h = 16;
  const cells = Array(w * h).fill(FLOOR);
  const set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = t; };
  const rect = (x0: number, y0: number, rw: number, rh: number, t: number) => { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y, t); };
  const blob = (cx: number, cy: number, r: number, t: number) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + rng.int(-1, 1)) set(x, y, t);
  };
  // Keep the deployment zones (left and right edges) mostly clear.
  const inZone = (x: number) => x < 5 || x > w - 6;

  switch (theme) {
    case 'dungeon': {
      rect(0, 0, w, h, WALL);
      rect(1, 1, w - 2, h - 2, FLOOR);
      // a dividing wall with doorways
      const wx = rng.int(9, 14);
      rect(wx, 1, 1, h - 2, WALL);
      for (let i = 0; i < 2; i++) { const dy = rng.int(2, h - 4); set(wx, dy, FLOOR); set(wx, dy + 1, FLOOR); }
      for (let i = 0; i < 6; i++) { const x = rng.int(6, w - 7); const y = rng.int(2, h - 3); if (x !== wx) set(x, y, OBSTACLE); } // pillars
      for (let i = 0; i < 2; i++) blob(rng.int(6, w - 7), rng.int(3, h - 4), 1, DIFFICULT); // rubble
      break;
    }
    case 'cave': {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rng.chance(0.42) && !inZone(x)) set(x, y, WALL);
      // smooth with cellular automaton
      for (let it = 0; it < 3; it++) {
        const next = [...cells];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && cellAt({ w, h, cells, theme, name }, x + dx, y + dy) === WALL) walls++;
          next[y * w + x] = inZone(x) ? FLOOR : walls >= 5 ? WALL : FLOOR;
        }
        cells.splice(0, cells.length, ...next);
      }
      rect(0, Math.floor(h / 2) - 1, w, 3, FLOOR); // guarantee a passage
      for (let i = 0; i < 3; i++) blob(rng.int(6, w - 7), rng.int(2, h - 3), 1, WATER);
      break;
    }
    case 'forest': {
      for (let i = 0; i < 22; i++) { const x = rng.int(0, w - 1); const y = rng.int(0, h - 1); if (!inZone(x) || rng.chance(0.2)) set(x, y, OBSTACLE); } // trees
      for (let i = 0; i < 4; i++) blob(rng.int(4, w - 5), rng.int(2, h - 3), rng.int(1, 2), DIFFICULT); // undergrowth
      if (rng.chance(0.5)) { const sx = rng.int(8, 15); for (let y = 0; y < h; y++) { set(sx + Math.round(Math.sin(y / 2)), y, WATER); } } // stream
      break;
    }
    case 'town': {
      for (let i = 0; i < 4; i++) { const bx = rng.int(6, w - 10); const by = rng.chance(0.5) ? 0 : h - rng.int(3, 5); rect(bx, by, rng.int(3, 5), rng.int(3, 4), WALL); } // buildings
      for (let i = 0; i < 6; i++) { const x = rng.int(5, w - 6); const y = rng.int(3, h - 4); set(x, y, OBSTACLE); if (rng.chance(0.5)) set(x + 1, y, OBSTACLE); } // carts, barrels
      if (rng.chance(0.4)) blob(rng.int(8, 16), rng.int(4, h - 5), 1, WATER); // fountain
      break;
    }
    default: {
      for (let i = 0; i < 8; i++) { const x = rng.int(5, w - 6); const y = rng.int(1, h - 2); set(x, y, OBSTACLE); }
      for (let i = 0; i < 3; i++) blob(rng.int(5, w - 6), rng.int(2, h - 3), 1, DIFFICULT);
    }
  }
  return { w, h, cells, theme, name };
}

// ---------- occupancy ----------

function occupiedBy(g: GameState, x: number, y: number, except?: Creature): Creature | undefined {
  return g.creatures.find((c) => c !== except && !c.dead && x >= c.pos.x && x < c.pos.x + c.size && y >= c.pos.y && y < c.pos.y + c.size);
}

/** Can creature c stand with its top-left corner at (x,y)? */
export function canStand(g: GameState, c: Creature, x: number, y: number): boolean {
  const m = g.map;
  for (let dy = 0; dy < c.size; dy++) for (let dx = 0; dx < c.size; dx++) {
    if (m && !passable(cellAt(m, x + dx, y + dy))) return false;
    if (!m && (x + dx < 0 || y + dy < 0)) return false;
    if (occupiedBy(g, x + dx, y + dy, c)) return false;
  }
  return true;
}

/** Can creature c move through (x,y)? Allies can be passed through; enemies block. */
function canPass(g: GameState, c: Creature, x: number, y: number): boolean {
  const m = g.map;
  for (let dy = 0; dy < c.size; dy++) for (let dx = 0; dx < c.size; dx++) {
    if (m && !passable(cellAt(m, x + dx, y + dy))) return false;
    const o = occupiedBy(g, x + dx, y + dy, c);
    if (o && o.side !== c.side && !(o.side === 'ally' && c.side === 'party') && !(o.side === 'party' && c.side === 'ally') && o.hp > 0) return false;
  }
  return true;
}

function stepCost(g: GameState, c: Creature, x: number, y: number): number {
  const m = g.map;
  if (!m) return 5;
  let difficult = false;
  for (let dy = 0; dy < c.size; dy++) for (let dx = 0; dx < c.size; dx++) {
    const t = cellAt(m, x + dx, y + dy);
    if (t === DIFFICULT || t === WATER) difficult = true;
  }
  return difficult ? 10 : 5;
}

// ---------- pathfinding (A* / Dijkstra on 8-neighbour grid) ----------

export interface Path { cells: { x: number; y: number }[]; cost: number }

/** Cheapest path for c from its position to any goal cell. */
export function findPath(g: GameState, c: Creature, goal: (x: number, y: number) => boolean, maxCost = 1000): Path | undefined {
  const W = g.map?.w ?? 60;
  const H = g.map?.h ?? 40;
  const key = (x: number, y: number) => y * 1000 + x;
  const start = c.pos;
  const dist = new Map<number, number>([[key(start.x, start.y), 0]]);
  const prev = new Map<number, number>();
  const open: [number, number, number][] = [[0, start.x, start.y]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, x, y] = open.shift()!;
    if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
    if ((x !== start.x || y !== start.y) && goal(x, y) && canStand(g, c, x, y)) {
      const cells: { x: number; y: number }[] = [];
      let k = key(x, y);
      while (k !== key(start.x, start.y)) { cells.unshift({ x: k % 1000, y: Math.floor(k / 1000) }); k = prev.get(k)!; }
      return { cells, cost: d };
    }
    if (d >= maxCost) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!canPass(g, c, nx, ny)) continue;
      // no corner-cutting through walls
      if (dx && dy && g.map && (!passable(cellAt(g.map, x + dx, y)) || !passable(cellAt(g.map, x, y + dy)))) continue;
      const nd = d + stepCost(g, c, nx, ny);
      if (nd < (dist.get(key(nx, ny)) ?? Infinity)) {
        dist.set(key(nx, ny), nd);
        prev.set(key(nx, ny), key(x, y));
        open.push([nd, nx, ny]);
      }
    }
  }
  return undefined;
}

/** All cells c can reach this turn with `budget` feet (for UI highlighting). */
export function reachable(g: GameState, c: Creature, budget: number): Set<string> {
  const W = g.map?.w ?? 60;
  const H = g.map?.h ?? 40;
  const out = new Set<string>();
  const dist = new Map<string, number>([[`${c.pos.x},${c.pos.y}`, 0]]);
  const queue: [number, number, number][] = [[0, c.pos.x, c.pos.y]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !canPass(g, c, nx, ny)) continue;
      if (dx && dy && g.map && (!passable(cellAt(g.map, x + dx, y)) || !passable(cellAt(g.map, x, y + dy)))) continue;
      const nd = d + stepCost(g, c, nx, ny);
      if (nd > budget || nd >= (dist.get(`${nx},${ny}`) ?? Infinity)) continue;
      dist.set(`${nx},${ny}`, nd);
      if (canStand(g, c, nx, ny)) out.add(`${nx},${ny}`);
      queue.push([nd, nx, ny]);
    }
  }
  return out;
}

// ---------- line of sight & cover ----------

function cellsOnLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  // Supercover-ish sampling between square centres
  const out: [number, number][] = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    const last = out[out.length - 1];
    if (!last || last[0] !== cx || last[1] !== cy) out.push([cx, cy]);
  }
  return out.filter(([x, y]) => !(x === x0 && y === y0) && !(x === x1 && y === y1));
}

export interface Sight { visible: boolean; cover: 0 | 2 | 5 }

/** Line of sight and cover between two creatures (best line between any of their squares). */
export function sight(g: GameState, a: Creature, b: Creature): Sight {
  if (!g.map) return { visible: true, cover: 0 };
  let best: Sight = { visible: false, cover: 5 };
  for (let ay = 0; ay < a.size; ay++) for (let ax = 0; ax < a.size; ax++) for (let by = 0; by < b.size; by++) for (let bx = 0; bx < b.size; bx++) {
    const line = cellsOnLine(a.pos.x + ax, a.pos.y + ay, b.pos.x + bx, b.pos.y + by);
    let blocked = false;
    let obstacles = 0;
    let creatureInWay = false;
    for (const [x, y] of line) {
      const t = cellAt(g.map, x, y);
      if (t === WALL) { blocked = true; break; }
      if (t === OBSTACLE) obstacles++;
      const o = occupiedBy(g, x, y, a);
      if (o && o !== b && o.hp > 0) creatureInWay = true;
    }
    if (blocked) continue;
    // Obstacles: one gives half cover, two or more three-quarters. Creatures in the way give half cover at most.
    const cover: 0 | 2 | 5 = obstacles >= 2 ? 5 : obstacles === 1 || creatureInWay ? 2 : 0;
    if (!best.visible || cover < best.cover) best = { visible: true, cover };
    if (best.cover === 0) return best;
  }
  return best;
}

// ---------- areas of effect ----------

export interface Area { shape: string; size: number; origin: { x: number; y: number }; toward?: { x: number; y: number } }

/** Creatures inside an area. Sphere/cube/cylinder: centred on origin. Cone/line: from origin toward a point. */
export function creaturesInArea(g: GameState, area: Area, exclude?: Creature): Creature[] {
  const r = area.size / 5;
  const { x: ox, y: oy } = area.origin;
  const inside = (x: number, y: number): boolean => {
    const dx = x - ox;
    const dy = y - oy;
    switch (area.shape) {
      case 'sphere': case 'cylinder': case 'emanation': case 'radius':
        return Math.max(Math.abs(dx), Math.abs(dy)) <= r && (!g.map || !wallBetween(g, ox, oy, x, y));
      case 'cube': case 'square':
        return Math.abs(dx) <= r / 2 && Math.abs(dy) <= r / 2;
      case 'cone': {
        if (!area.toward) return false;
        const tx = area.toward.x - ox;
        const ty = area.toward.y - oy;
        const len = Math.hypot(dx, dy);
        if (len === 0 || len > r + 0.5) return false;
        const cos = (dx * tx + dy * ty) / (len * (Math.hypot(tx, ty) || 1));
        return cos >= Math.cos(Math.PI / 4.2) && (!g.map || !wallBetween(g, ox, oy, x, y)); // ~53° cone
      }
      case 'line': {
        if (!area.toward) return false;
        const tx = area.toward.x - ox;
        const ty = area.toward.y - oy;
        const tl = Math.hypot(tx, ty) || 1;
        const along = (dx * tx + dy * ty) / tl;
        const perp = Math.abs(dx * ty - dy * tx) / tl;
        return along > 0 && along <= r && perp <= 0.75 && (!g.map || !wallBetween(g, ox, oy, x, y));
      }
      default:
        return Math.max(Math.abs(dx), Math.abs(dy)) <= r;
    }
  };
  return g.creatures.filter((c) => {
    if (c.dead || c === exclude) return false;
    for (let sy = 0; sy < c.size; sy++) for (let sx = 0; sx < c.size; sx++) if (inside(c.pos.x + sx, c.pos.y + sy)) return true;
    return false;
  });
}

function wallBetween(g: GameState, x0: number, y0: number, x1: number, y1: number): boolean {
  return cellsOnLine(x0, y0, x1, y1).some(([x, y]) => cellAt(g.map!, x, y) === WALL);
}

// ---------- deployment ----------

/** Place the party on the left edge and foes on the right, on free floor. */
export function deploy(g: GameState) {
  const m = g.map!;
  const place = (c: Creature, xs: number[]) => {
    for (const x of xs) for (let r = 0; r < m.h; r++) {
      const y = Math.floor(m.h / 2) + (r % 2 ? -Math.ceil(r / 2) : Math.ceil(r / 2));
      if (y < 0 || y >= m.h) continue;
      if (canStand(g, c, x, y)) { c.pos = { x, y }; return; }
    }
  };
  for (const c of g.creatures) c.pos = { x: -99, y: -99 };
  g.creatures.filter((c) => c.side !== 'enemy' && !c.dead).forEach((c) => place(c, [2, 3, 1, 4, 5]));
  g.creatures.filter((c) => c.side === 'enemy' && !c.dead).forEach((c) => place(c, [m.w - 4, m.w - 5, m.w - 3, m.w - 6, m.w - 7, m.w - 2]));
}

/** ASCII rendering for AI prompts. Tokens: party a,b,c…; enemies 1,2,3…; allies A,B… */
export function asciiMap(g: GameState): { map: string; legend: string } {
  const m = g.map!;
  const grid: string[][] = [];
  for (let y = 0; y < m.h; y++) {
    grid.push([]);
    for (let x = 0; x < m.w; x++) {
      const t = cellAt(m, x, y);
      grid[y].push(t === WALL ? '#' : t === OBSTACLE ? 'o' : t === DIFFICULT ? ',' : t === WATER ? '~' : '.');
    }
  }
  const legend: string[] = [];
  let p = 0;
  let e = 0;
  let a = 0;
  for (const c of g.creatures.filter((x) => !x.dead)) {
    const ch = c.side === 'party' ? String.fromCharCode(97 + p++) : c.side === 'enemy' ? String((e++ % 9) + 1) : String.fromCharCode(65 + a++);
    for (let dy = 0; dy < c.size; dy++) for (let dx = 0; dx < c.size; dx++) if (grid[c.pos.y + dy]?.[c.pos.x + dx] !== undefined) grid[c.pos.y + dy][c.pos.x + dx] = ch;
    legend.push(`${ch} = ${c.name} at ${coordName(c.pos.x, c.pos.y)}${c.hp <= 0 ? ' (down)' : ''}`);
  }
  const header = '   ' + Array.from({ length: m.w }, (_, x) => coordName(x, 0).replace(/\d+$/, '')).join('');
  const rows = grid.map((r, y) => `${String(y + 1).padStart(2)} ${r.join('')}`);
  return { map: [header, ...rows].join('\n'), legend: legend.join('\n') };
}
