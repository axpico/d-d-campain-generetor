import type { Dungeon } from '../lib/types';

const G = 14; // px per 5-ft square

export function DungeonMap({ d, selectedRoom, onSelectRoom }: { d: Dungeon; selectedRoom?: number; onSelectRoom?: (id: number) => void }) {
  const W = d.width * G;
  const H = d.height * G;

  const inRoom = (x: number, y: number) => d.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  // Corridor floor cells (deduplicated) and door positions at the room boundary.
  const floor = new Set<string>();
  const doors: { x: number; y: number; kind: string; vertical: boolean }[] = [];
  for (const c of d.corridors) {
    let prevInside = true;
    c.path.forEach(([x, y], i) => {
      const inside = !!inRoom(x, y);
      if (!inside) floor.add(`${x},${y}`);
      if (i > 0 && inside !== prevInside && c.door !== 'open') {
        const [px, py] = c.path[i - 1];
        const cell = inside ? [px, py] : [x, y];
        if (!doors.some((dd) => dd.x === cell[0] && dd.y === cell[1])) doors.push({ x: cell[0], y: cell[1], kind: c.door, vertical: px !== x });
      }
      prevInside = inside;
    });
  }

  return (
    <svg className="map dungeon-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${d.name}`}>
      <defs>
        <pattern id="grid" width={G} height={G} patternUnits="userSpaceOnUse">
          <path d={`M${G},0 L0,0 0,${G}`} fill="none" stroke="#9aa6b2" strokeWidth="0.5" />
        </pattern>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#6f7c88" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#dfe4e8" />
      <rect width={W} height={H} fill="url(#hatch)" opacity="0.35" />
      {/* Floors: draw a thick outline pass then the fill pass so walls read clearly */}
      <g fill="#2b3640">
        {[...floor].map((k) => { const [x, y] = k.split(',').map(Number); return <rect key={'o' + k} x={x * G - 2} y={y * G - 2} width={G + 4} height={G + 4} />; })}
        {d.rooms.map((r) => <rect key={'o' + r.id} x={r.x * G - 3} y={r.y * G - 3} width={r.w * G + 6} height={r.h * G + 6} />)}
      </g>
      <g fill="#fbfaf5">
        {[...floor].map((k) => { const [x, y] = k.split(',').map(Number); return <rect key={'f' + k} x={x * G} y={y * G} width={G} height={G} />; })}
        {d.rooms.map((r) => (
          <rect key={'f' + r.id} x={r.x * G} y={r.y * G} width={r.w * G} height={r.h * G}
            fill={r.id === selectedRoom ? '#fff1b8' : r.encounter ? '#f7eeee' : '#fbfaf5'}
            onClick={() => onSelectRoom?.(r.id)} style={{ cursor: onSelectRoom ? 'pointer' : undefined }} />
        ))}
      </g>
      <g fill="url(#grid)" pointerEvents="none">
        {[...floor].map((k) => { const [x, y] = k.split(',').map(Number); return <rect key={'g' + k} x={x * G} y={y * G} width={G} height={G} />; })}
        {d.rooms.map((r) => <rect key={'g' + r.id} x={r.x * G} y={r.y * G} width={r.w * G} height={r.h * G} />)}
      </g>
      {/* Doors */}
      {doors.map((dd, i) => {
        const cx = dd.x * G + G / 2;
        const cy = dd.y * G + G / 2;
        const w = dd.vertical ? 5 : G - 2;
        const h = dd.vertical ? G - 2 : 5;
        if (dd.kind === 'secret') return <text key={i} x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#8b1e1e">S</text>;
        return (
          <g key={i}>
            <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="#8a5a2b" stroke="#2b3640" strokeWidth="1" />
            {dd.kind === 'locked' && <circle cx={cx} cy={cy} r="1.8" fill="#f2d24b" />}
          </g>
        );
      })}
      {/* Room numbers and markers */}
      {d.rooms.map((r) => (
        <g key={'n' + r.id} pointerEvents="none">
          <text x={r.x * G + (r.w * G) / 2} y={r.y * G + (r.h * G) / 2 + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1d2730">{r.id}</text>
          {r.encounter && <text x={r.x * G + 4} y={r.y * G + 12} fontSize="10" fill="#8b1e1e">⚔</text>}
          {r.treasure && <text x={r.x * G + r.w * G - 12} y={r.y * G + 12} fontSize="10" fill="#9a7400">◆</text>}
          {r.trap && <text x={r.x * G + 4} y={r.y * G + r.h * G - 4} fontSize="10" fill="#6b3fa0">⚠</text>}
        </g>
      ))}
      {/* Entrance arrow */}
      {d.rooms[0] && (
        <text x={d.rooms[0].x * G + (d.rooms[0].w * G) / 2} y={Math.min(H - 4, (d.rooms[0].y + d.rooms[0].h) * G + 16)} textAnchor="middle" fontSize="13" fill="#1d2730">▲ entrance</text>
      )}
    </svg>
  );
}
