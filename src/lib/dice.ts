// Dice: the single source of randomness for play. The AI never rolls; code does.

export interface Roll { expr: string; total: number; detail: string; at: number; rolls: number[] }

/** Parse and roll "2d6+3", "d20", "4d6kh3", "1d20 adv", "3d8 + 1d6 - 2". */
export function roll(exprRaw: string): Roll {
  let expr = exprRaw.trim().toLowerCase();
  let mode: 'adv' | 'dis' | undefined;
  if (/\s*(adv|advantage)$/.test(expr)) { mode = 'adv'; expr = expr.replace(/\s*(adv|advantage)$/, ''); }
  if (/\s*(dis|disadvantage)$/.test(expr)) { mode = 'dis'; expr = expr.replace(/\s*(dis|disadvantage)$/, ''); }
  const terms = expr.replace(/\s+/g, '').match(/[+-]?[^+-]+/g);
  if (!terms) throw new Error('Try something like 2d6+3');
  let total = 0;
  const parts: string[] = [];
  const all: number[] = [];
  for (const t of terms) {
    const sign = t.startsWith('-') ? -1 : 1;
    const body = t.replace(/^[+-]/, '');
    const m = body.match(/^(\d*)d(\d+|%)(?:(kh|kl)(\d+))?$/);
    if (m) {
      const n = Math.min(100, Number(m[1] || 1));
      const sides = m[2] === '%' ? 100 : Number(m[2]);
      if (!sides) throw new Error(`Bad die: ${body}`);
      const r = () => 1 + Math.floor(Math.random() * sides);
      const rolls = Array.from({ length: n }, r);
      if (mode && n === 1 && sides === 20) {
        const b = r();
        const pick = mode === 'adv' ? Math.max(rolls[0], b) : Math.min(rolls[0], b);
        parts.push(`${sign < 0 ? '−' : ''}d20 ${mode} [${rolls[0]}, ${b}] → ${pick}`);
        total += sign * pick;
        all.push(pick);
        continue;
      }
      let kept = rolls;
      if (m[3]) {
        const k = Number(m[4]);
        kept = [...rolls].sort((a, b) => (m[3] === 'kh' ? b - a : a - b)).slice(0, k);
      }
      const sum = kept.reduce((a, b) => a + b, 0);
      total += sign * sum;
      all.push(...kept);
      parts.push(`${sign < 0 ? '−' : ''}${n}d${sides}${m[3] ? m[3] + m[4] : ''} [${rolls.join(', ')}]`);
    } else if (/^\d+$/.test(body)) {
      total += sign * Number(body);
      parts.push(`${sign < 0 ? '−' : '+'}${body}`);
    } else throw new Error(`Can't read "${body}"`);
  }
  return { expr: exprRaw.trim(), total, detail: parts.join(' '), at: Date.now(), rolls: all };
}

export interface D20 { natural: number; total: number; text: string; crit: boolean; fumble: boolean }

export function d20(mod: number, mode?: 'adv' | 'dis'): D20 {
  const a = 1 + Math.floor(Math.random() * 20);
  const b = 1 + Math.floor(Math.random() * 20);
  const natural = mode === 'adv' ? Math.max(a, b) : mode === 'dis' ? Math.min(a, b) : a;
  const sign = mod >= 0 ? '+' : '−';
  const text = `${mode ? `[${a}, ${b}] ${mode} → ` : ''}${natural} ${sign} ${Math.abs(mod)} = ${natural + mod}`;
  return { natural, total: natural + mod, text, crit: natural === 20, fumble: natural === 1 };
}

/** Roll damage dice; on a crit, dice are doubled (not modifiers). */
export function rollDamage(dice: string, crit = false): Roll {
  const expr = crit ? dice.replace(/(\d*)d(\d+)/g, (_, n, s) => `${(Number(n || 1)) * 2}d${s}`) : dice;
  return roll(expr);
}

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
