import type { Rng } from '../lib/rng';
import { uid } from '../lib/rng';
import type { Npc, TownBuilding, TownMap } from '../lib/types';
import { TOWN_BUILDINGS } from '../data/story';
import { tavernName } from '../data/names';

/** Simple settlement layout: a main road, a cross road, buildings lining the roads. */
export function generateTown(rng: Rng, size: 'village' | 'town' | 'city'): TownMap {
  const W = 60;
  const H = 40;
  const roads: [number, number][][] = [];
  const midY = rng.int(16, 24);
  const midX = rng.int(24, 36);
  roads.push([[0, midY], [W / 3, midY + rng.int(-3, 3)], [(2 * W) / 3, midY + rng.int(-3, 3)], [W, midY]]);
  roads.push([[midX, 0], [midX + rng.int(-3, 3), H / 2], [midX, H]]);
  if (size !== 'village') {
    roads.push([[rng.int(6, 14), 0], [rng.int(10, 18), midY]]);
    roads.push([[rng.int(42, 54), midY], [rng.int(44, 56), H]]);
  }

  const river = rng.chance(0.5)
    ? ([[rng.int(0, 10), 0], [rng.int(10, 25), H / 3], [rng.int(5, 20), (2 * H) / 3], [rng.int(0, 15), H]] as [number, number][])
    : undefined;

  const count = size === 'village' ? rng.int(8, 12) : size === 'town' ? rng.int(16, 24) : rng.int(28, 40);
  const buildings: TownBuilding[] = [];
  const pool = TOWN_BUILDINGS.filter((k) => k !== 'Docks' || river);
  const kinds = size === 'village'
    ? ['Tavern', ...rng.shuffle(['Shrine', 'Smithy', 'Mill', 'General Store', 'Stables', 'Graveyard']).slice(0, rng.int(3, 5))]
    : ['Tavern', 'Temple', 'Market', 'Town Hall', ...rng.shuffle(pool.filter((k) => !['Tavern', 'Temple', 'Market', 'Town Hall'].includes(k)))]
        .slice(0, size === 'town' ? 14 : 20);
  const keyed = new Set(['Tavern', 'Temple', 'Town Hall', 'Market', 'Smithy']);

  const hitsRoad = (x: number, y: number, w: number, h: number) => {
    for (const road of roads) {
      for (let i = 0; i < road.length - 1; i++) {
        const [x1, y1] = road[i];
        const [x2, y2] = road[i + 1];
        for (let t = 0; t <= 1; t += 0.05) {
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          if (px > x - 1.5 && px < x + w + 1.5 && py > y - 1.5 && py < y + h + 1.5) return true;
        }
      }
    }
    return false;
  };

  for (let tries = 0; tries < 2000 && buildings.length < count; tries++) {
    const w = rng.int(3, 6);
    const h = rng.int(2, 4);
    const x = rng.int(2, W - w - 2);
    const y = rng.int(2, H - h - 2);
    // Cluster near the crossroads.
    const d = Math.hypot(x - midX, y - midY);
    if (d > (size === 'village' ? 16 : size === 'town' ? 22 : 30)) continue;
    if (hitsRoad(x, y, w, h)) continue;
    if (buildings.some((b) => x < b.x + b.w + 1 && x + w + 1 > b.x && y < b.y + b.h + 1 && y + h + 1 > b.y)) continue;
    const i = buildings.length;
    const kind = i < kinds.length ? kinds[i] : 'House';
    const name = kind === 'Tavern' ? tavernName(rng) : kind;
    buildings.push({ id: uid(), name: keyed.has(kind) || i < 8 ? name : kind, kind, x, y, w, h });
  }

  return { width: W, height: H, roads, buildings, walls: size !== 'village', river };
}

const ROLE_BUILDING: [RegExp, string[]][] = [
  [/mayor|noble/, ['Town Hall', 'Manor']], [/priest|healer/, ['Temple', 'Shrine']], [/innkeeper|bard/, ['Tavern']],
  [/blacksmith/, ['Smithy']], [/alchemist/, ['Alchemist']], [/merchant|smuggler/, ['Market', 'General Store', 'Warehouse', 'Docks']],
  [/guard/, ['Guardhouse']], [/sage|cartographer/, ['Library']], [/court wizard/, ["Wizard's Tower"]],
  [/gravedigger/, ['Graveyard']], [/ship captain/, ['Docks']], [/thieves|spy/, ['Warehouse', 'Tavern', 'Bathhouse']],
];

/** Give each local NPC a building matching their role; anyone left over gets an unassigned building as their home. */
export function assignNpcs(town: TownMap, npcs: Npc[]) {
  town.buildings.forEach((b) => { delete b.npcId; });
  const free = () => town.buildings.filter((b) => !b.npcId);
  for (const n of npcs) {
    const kinds = ROLE_BUILDING.find(([re]) => re.test(n.role))?.[1] ?? [];
    const b = free().find((x) => kinds.includes(x.kind)) ?? free().find((x) => x.kind === 'House') ?? free().at(-1);
    if (b) {
      b.npcId = n.id;
      if (b.kind === 'House') b.name = `${n.name.split(' ')[0]}'s house`;
    }
  }
}
