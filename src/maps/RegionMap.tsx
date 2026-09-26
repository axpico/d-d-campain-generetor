import { useMemo } from 'react';
import type { Campaign, LocationKind } from '../lib/types';
import { biomeOf, type Biome } from '../gen/region';

const COLORS: Record<Biome, string> = {
  deep: '#35607a', water: '#4d7f98', beach: '#d9c9a0', plains: '#a9b872', forest: '#5f8a4e', swamp: '#6d7a55',
  desert: '#d8bd84', hills: '#9c9a6a', mountains: '#8a7f72', snow: '#eeeeea', tundra: '#c7cfc6',
};

const ICON: Record<LocationKind, string> = {
  city: '♜', town: '■', village: '●', fortress: '⛫', dungeon: '☠', wilderness: '▲', landmark: '★',
};

const CELL = 12;

export function RegionMap({ c, selected, onSelect }: { c: Campaign; selected?: string; onSelect?: (id: string) => void }) {
  const { cols, rows, cells } = c.region;
  const W = cols * CELL;
  const H = rows * CELL;

  const terrain = useMemo(() => cells.map((cell, i) => {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const biome = biomeOf(cell, y, rows);
    return { x, y, biome, h: cell.h };
  }), [cells, cols, rows]);

  // One pixel per cell, upscaled with smoothing: soft painted look, far cheaper than thousands of blurred rects.
  const terrainPng = useMemo(() => {
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const sctx = small.getContext('2d');
    if (!sctx) return '';
    for (const t of terrain) {
      sctx.fillStyle = COLORS[t.biome];
      sctx.fillRect(t.x, t.y, 1, 1);
    }
    // Upscale with smoothing + blur in-canvas, so the result doesn't depend on how the browser scales images.
    const scale = 6;
    const big = document.createElement('canvas');
    big.width = cols * scale;
    big.height = rows * scale;
    const bctx = big.getContext('2d');
    if (!bctx) return small.toDataURL();
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.filter = `blur(${scale * 0.9}px)`;
    bctx.drawImage(small, -1, -1, big.width + 2, big.height + 2);
    return big.toDataURL('image/png');
  }, [terrain, cols, rows]);

  // Sparse, irregular glyph placement (hash of the cell), so symbols don't line up in rows/columns.
  const glyphCells = useMemo(() => terrain.filter((t) => ((t.x * 73856093) ^ (t.y * 19349663)) % 5 === 0), [terrain]);

  const byId = new Map(c.locations.map((l) => [l.id, l]));

  return (
    <svg className="map region-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${c.region.name}`}>
      <defs>
        <pattern id="paper" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="transparent" />
          <circle cx="1" cy="1" r="0.5" fill="#000" opacity="0.06" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={COLORS.deep} />
      <image href={terrainPng} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ imageRendering: 'auto' }} />
      {/* Mountain and tree glyphs for texture */}
      <g aria-hidden="true">
        {glyphCells.map((t) => {
          const cx = t.x * CELL + CELL / 2 + ((t.y * 7) % 5) - 2;
          const cy = t.y * CELL + CELL / 2 + ((t.x * 5) % 5) - 2;
          if (t.biome === 'mountains' || t.biome === 'snow') {
            return <path key={`g${t.x},${t.y}`} d={`M${cx - 6},${cy + 4} L${cx},${cy - 6} L${cx + 6},${cy + 4}`} fill="none" stroke="#4a4038" strokeWidth="1.2" opacity="0.7" />;
          }
          if (t.biome === 'hills') {
            return <path key={`g${t.x},${t.y}`} d={`M${cx - 6},${cy + 3} Q${cx},${cy - 5} ${cx + 6},${cy + 3}`} fill="none" stroke="#5d5a3c" strokeWidth="1" opacity="0.6" />;
          }
          if (t.biome === 'forest') {
            return <circle key={`g${t.x},${t.y}`} cx={cx} cy={cy} r="3.2" fill="#3f6b36" opacity="0.8" />;
          }
          if (t.biome === 'swamp') {
            return <path key={`g${t.x},${t.y}`} d={`M${cx - 4},${cy} h8 M${cx - 2},${cy + 3} h5`} stroke="#3c4a2f" strokeWidth="1" opacity="0.7" />;
          }
          return null;
        })}
      </g>
      <rect width={W} height={H} fill="url(#paper)" />
      {/* Roads */}
      <g stroke="#6b4a2b" strokeWidth="2.2" strokeDasharray="6 4" fill="none" opacity="0.85">
        {c.region.roads.map(([a, b]) => {
          const la = byId.get(a);
          const lb = byId.get(b);
          if (!la || !lb) return null;
          const mx = (la.x + lb.x) / 2 * W + (la.y - lb.y) * 30;
          const my = (la.y + lb.y) / 2 * H + (lb.x - la.x) * 30;
          return <path key={a + b} d={`M${la.x * W},${la.y * H} Q${mx},${my} ${lb.x * W},${lb.y * H}`} />;
        })}
      </g>
      {/* Locations */}
      {c.locations.map((l) => {
        const x = l.x * W;
        const y = l.y * H;
        const sel = l.id === selected;
        return (
          <g key={l.id} className="map-pin" transform={`translate(${x},${y})`} onClick={() => onSelect?.(l.id)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <circle r={sel ? 13 : 10} fill={sel ? '#fff3c4' : '#f4ead2'} stroke={l.kind === 'dungeon' ? '#8b1e1e' : '#3b2a1a'} strokeWidth={sel ? 3 : 2} />
            <text textAnchor="middle" dy="4.5" fontSize="12" fill={l.kind === 'dungeon' ? '#8b1e1e' : '#3b2a1a'}>{ICON[l.kind]}</text>
            <text className="map-label" textAnchor="middle" y="-15" fontSize="12.5">{l.name.replace(/ \(.*\)$/, '')}</text>
          </g>
        );
      })}
      {/* Compass */}
      <g transform={`translate(${W - 40},${40})`} aria-hidden="true">
        <circle r="20" fill="#f4ead2" stroke="#3b2a1a" opacity="0.9" />
        <path d="M0,-17 L5,0 L0,17 L-5,0 Z" fill="#3b2a1a" />
        <text textAnchor="middle" y="-22" fontSize="11" fill="#f4ead2" stroke="#3b2a1a" strokeWidth="3" paintOrder="stroke">N</text>
      </g>
      <text x="16" y={H - 16} fontSize="20" className="map-title">{c.region.name}</text>
    </svg>
  );
}

export const REGION_LEGEND = ICON;
