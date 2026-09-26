import type { TownMap as Town, Npc } from '../lib/types';

const S = 12;

export function TownMap({ t, name, npcs }: { t: Town; name: string; npcs: Npc[] }) {
  const W = t.width * S;
  const H = t.height * S;
  const labelled = [...t.buildings.filter((b) => b.npcId), ...t.buildings.filter((b) => !b.npcId && b.kind !== 'House')].slice(0, 20);
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${x * S},${y * S}`).join(' ');

  // Wall: convex-ish ring around the building cluster.
  const bx = t.buildings.map((b) => b.x);
  const by = t.buildings.map((b) => b.y);
  const bx2 = t.buildings.map((b) => b.x + b.w);
  const by2 = t.buildings.map((b) => b.y + b.h);
  const wall = t.walls && t.buildings.length ? {
    cx: ((Math.min(...bx) + Math.max(...bx2)) / 2) * S,
    cy: ((Math.min(...by) + Math.max(...by2)) / 2) * S,
    rx: ((Math.max(...bx2) - Math.min(...bx)) / 2 + 2.5) * S,
    ry: ((Math.max(...by2) - Math.min(...by)) / 2 + 2.5) * S,
  } : null;

  return (
    <div className="town-wrap">
      <svg className="map town-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${name}`}>
        <rect width={W} height={H} fill="#c9d2a4" />
        {t.river && <polyline points={pts(t.river)} fill="none" stroke="#5b8fb0" strokeWidth={S * 2.2} strokeLinecap="round" strokeLinejoin="round" />}
        {wall && <ellipse cx={wall.cx} cy={wall.cy} rx={wall.rx} ry={wall.ry} fill="#d8d1b8" stroke="#6a5f4e" strokeWidth="5" strokeDasharray="14 3" />}
        {t.roads.map((r, i) => <polyline key={i} points={pts(r)} fill="none" stroke="#b39b72" strokeWidth={S * 1.4} strokeLinecap="round" strokeLinejoin="round" />)}
        {t.buildings.map((b) => {
          const idx = labelled.indexOf(b);
          return (
            <g key={b.id}>
              <rect x={b.x * S} y={b.y * S} width={b.w * S} height={b.h * S} rx="2"
                fill={b.kind === 'Temple' || b.kind === 'Shrine' ? '#e8e1cf' : b.kind === 'Tavern' ? '#b0613f' : b.kind === 'Town Hall' || b.kind === 'Manor' ? '#8a6d9c' : '#a0583a'}
                stroke="#4a2f22" strokeWidth="1.5" />
              {idx >= 0 && (
                <g>
                  <circle cx={(b.x + b.w / 2) * S} cy={(b.y + b.h / 2) * S} r="8" fill="#fbf6e6" stroke="#4a2f22" />
                  <text x={(b.x + b.w / 2) * S} y={(b.y + b.h / 2) * S + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#2c1d14">{idx + 1}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <ol className="town-legend">
        {labelled.map((b) => {
          const npc = npcs.find((n) => n.id === b.npcId);
          return <li key={b.id}><strong>{b.name}</strong>{b.name !== b.kind && <span className="muted"> ({b.kind})</span>}{npc && <> — {npc.name}, {npc.role}</>}</li>;
        })}
      </ol>
    </div>
  );
}
