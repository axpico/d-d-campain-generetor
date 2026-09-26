import type { Rng } from '../lib/rng';
import type { Region, RegionTerrainCell } from '../lib/types';

export const REGION_COLS = 64;
export const REGION_ROWS = 44;

/** Smooth value noise on a coarse lattice, bilinearly interpolated. */
function valueNoise(rng: Rng, cols: number, rows: number, scale: number): number[] {
  const gw = Math.ceil(cols / scale) + 2;
  const gh = Math.ceil(rows / scale) + 2;
  const grid = Array.from({ length: gw * gh }, () => rng.next());
  const out: number[] = [];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const g = (i: number, j: number) => grid[j * gw + i];
    const a = g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx;
    const b = g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx;
    out.push(a * (1 - ty) + b * ty);
  }
  return out;
}

export function generateRegionTerrain(rng: Rng, name: string, coastal: boolean): Region {
  const c = REGION_COLS;
  const r = REGION_ROWS;
  const n1 = valueNoise(rng, c, r, 12);
  const n2 = valueNoise(rng, c, r, 5);
  const n3 = valueNoise(rng, c, r, 2.5);
  const mo = valueNoise(rng, c, r, 9);
  // Coastal maps put the sea on one random side; inland maps are mostly land.
  const seaSide = rng.int(0, 3);
  const cells: RegionTerrainCell[] = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) {
    const i = y * c + x;
    let h = n1[i] * 0.6 + n2[i] * 0.3 + n3[i] * 0.1;
    const nx = x / c;
    const ny = y / r;
    const edge = [ny, 1 - nx, 1 - ny, nx][seaSide];
    if (coastal) h = h * 0.75 + Math.min(1, edge * 2.2) * 0.35 - 0.12;
    else h = h * 0.8 + 0.2 - Math.max(0, 0.08 - Math.min(nx, ny, 1 - nx, 1 - ny)) * 3;
    cells.push({ h: Math.max(0, Math.min(1, h)), m: mo[i] });
  }
  return { name, cols: c, rows: r, cells, roads: [] };
}

export type Biome = 'deep' | 'water' | 'beach' | 'plains' | 'forest' | 'swamp' | 'desert' | 'hills' | 'mountains' | 'snow' | 'tundra';

export const SEA_LEVEL = 0.38;

export function biomeOf(cell: RegionTerrainCell, row: number, rows: number): Biome {
  const { h, m } = cell;
  if (h < SEA_LEVEL - 0.08) return 'deep';
  if (h < SEA_LEVEL) return 'water';
  if (h < SEA_LEVEL + 0.025) return 'beach';
  if (h > 0.85) return 'snow';
  if (h > 0.74) return 'mountains';
  if (row < rows * 0.12) return 'tundra';
  if (h > 0.64) return 'hills';
  if (m > 0.68 && h < 0.48) return 'swamp';
  if (m > 0.52) return 'forest';
  if (m < 0.28) return 'desert';
  return 'plains';
}

export const BIOME_TERRAIN: Record<Biome, string> = {
  deep: 'coast', water: 'coast', beach: 'coast', plains: 'plains', forest: 'forest', swamp: 'swamp',
  desert: 'desert', hills: 'hills', mountains: 'mountains', snow: 'mountains', tundra: 'tundra',
};
