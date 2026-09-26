import { useMemo } from 'react';
import type { Creature, GameState } from '../../play/types';
import { cellAt, coordName, DIFFICULT, OBSTACLE, reachable, WALL, WATER } from '../../play/map';

const C = 28; // px per 5-ft square
const PAD = 20;

export type MapMode = 'move' | 'aim' | 'look';

export function BattleMapView({ g, current, interactive, mode, onCell, onToken }: {
  g: GameState;
  current?: Creature;
  interactive: boolean;
  mode: MapMode;
  onCell?: (coord: string) => void;
  onToken?: (c: Creature) => void;
}) {
  const m = g.map!;
  const W = m.w * C + PAD;
  const H = m.h * C + PAD;
  const reach = useMemo(() => (interactive && mode === 'move' && current && g.combat ? reachable(g, current, g.combat.economy.move) : new Set<string>()),
    [g, current, interactive, mode]);

  const cells = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = cellAt(m, x, y);
    const px = PAD + x * C;
    const py = PAD + y * C;
    const canGo = reach.has(`${x},${y}`);
    cells.push(
      <g key={`${x},${y}`} onClick={interactive && t !== WALL ? () => onCell?.(coordName(x, y)) : undefined} style={{ cursor: interactive && t !== WALL ? 'pointer' : undefined }}>
        <rect x={px} y={py} width={C} height={C} className={`bm-cell bm-${t === WALL ? 'wall' : t === WATER ? 'water' : t === DIFFICULT ? 'difficult' : 'floor'}${canGo ? ' bm-reach' : ''}`} />
        {t === OBSTACLE && <circle cx={px + C / 2} cy={py + C / 2} r={C * 0.33} className="bm-obstacle" />}
        {t === DIFFICULT && <path d={`M${px + 5},${py + C - 6} l6,-8 M${px + 13},${py + C - 6} l6,-8`} className="bm-rubble" />}
      </g>,
    );
  }

  const tokens = g.creatures.filter((c) => !(c.dead && c.kind === 'monster') && c.pos.x >= 0).map((c) => {
    const cx = PAD + c.pos.x * C + (c.size * C) / 2;
    const cy = PAD + c.pos.y * C + (c.size * C) / 2;
    const r = (c.size * C) / 2 - 3;
    const frac = Math.max(0, c.hp / c.maxHp);
    const circ = 2 * Math.PI * (r + 1.5);
    const initials = c.name.split(/\s+/).map((w) => (/^\d+$/.test(w) ? w : w[0])).join('').slice(0, 3).toUpperCase();
    return (
      <g key={c.id} className={`bm-token side-${c.side} ${current?.id === c.id ? 'current' : ''} ${c.hp <= 0 ? 'down' : ''}`}
        onClick={interactive ? (e) => { e.stopPropagation(); onToken?.(c); } : undefined} style={{ cursor: interactive ? 'pointer' : undefined }}>
        <title>{`${c.name} — ${c.hp}/${c.maxHp} HP${c.conditions.length ? ` · ${c.conditions.map((x) => x.name).join(', ')}` : ''} · ${coordName(c.pos.x, c.pos.y)}`}</title>
        {current?.id === c.id && <circle cx={cx} cy={cy} r={r + 5} className="bm-glow" />}
        <circle cx={cx} cy={cy} r={r} className="bm-token-body" />
        <circle cx={cx} cy={cy} r={r + 1.5} className="bm-hp" strokeDasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 4} textAnchor="middle" className="bm-initials" fontSize={c.size > 1 ? 13 : 10}>{c.hp <= 0 ? '✕' : initials}</text>
        {c.conditions.length > 0 && <circle cx={cx + r - 2} cy={cy - r + 2} r={4} className="bm-cond" />}
      </g>
    );
  });

  return (
    <svg className="battlemap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Battle map">
      {Array.from({ length: m.w }, (_, x) => <text key={`c${x}`} x={PAD + x * C + C / 2} y={14} textAnchor="middle" className="bm-label">{coordName(x, 0).replace(/\d+$/, '')}</text>)}
      {Array.from({ length: m.h }, (_, y) => <text key={`r${y}`} x={10} y={PAD + y * C + C / 2 + 4} textAnchor="middle" className="bm-label">{y + 1}</text>)}
      {cells}
      {tokens}
    </svg>
  );
}
