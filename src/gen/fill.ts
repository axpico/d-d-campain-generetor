import type { Rng } from '../lib/rng';

export interface FillCtx {
  villain?: string;
  faction?: string;
  place?: string;
  region?: string;
  npc?: string;
  lair?: string;
  [key: string]: string | undefined;
}

/** Replace {token}s in a template. {n} is a small random number. */
export function fill(tpl: string, ctx: FillCtx, rng: Rng): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === 'n') return String(rng.int(3, 7));
    const v = (ctx as Record<string, string | undefined>)[key];
    return v ?? key;
  });
}
