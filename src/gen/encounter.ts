import type { Rng } from '../lib/rng';
import type { Encounter, EncounterMonster, LootItem } from '../lib/types';
import { MONSTERS, XP_BUDGET, CR_XP, crLabel, type Env, type MonsterRef } from '../data/monsters';
import { TWISTS } from '../data/story';
import { ITEMS, TRINKETS, rarityWeights } from '../data/items';
import { uid } from '../lib/rng';

const DIFF = ['Low', 'Moderate', 'High'] as const;

function xpOf(m: MonsterRef) {
  return CR_XP[String(m.cr)] ?? 0;
}

/**
 * Build an encounter using the 2024 DMG method: XP budget = per-character budget × party size,
 * then spend it on monsters (no group multiplier in 2024 rules).
 * Strategy: one leader worth 35–85% of the budget, then 2–6 minions of a sensible CR to fill the rest.
 */
export function buildEncounter(
  rng: Rng,
  opts: {
    level: number; partySize: number; env?: Env; difficulty?: (typeof DIFF)[number];
    title?: string; preferTypes?: string[]; boss?: string;
  },
): Encounter {
  const level = Math.max(1, Math.min(20, opts.level));
  const difficulty = opts.difficulty ?? rng.weighted([
    { value: 'Low' as const, weight: 3 }, { value: 'Moderate' as const, weight: 5 }, { value: 'High' as const, weight: 2 },
  ]);
  const budget = XP_BUDGET[level][DIFF.indexOf(difficulty)] * opts.partySize;
  // 2024 guidance: avoid single monsters with CR above party level (at low levels, well below).
  const maxCr = level <= 2 ? 1 : level <= 4 ? level - 1 : level + 1;

  let pool = MONSTERS.filter((m) => m.cr <= maxCr && xpOf(m) <= budget);
  if (opts.env) {
    const envPool = pool.filter((m) => m.env.includes(opts.env!) || m.env.includes('any'));
    if (envPool.length >= 4) pool = envPool;
  }
  const typed = opts.preferTypes?.length ? pool.filter((m) => opts.preferTypes!.includes(m.type)) : [];
  if (pool.length === 0) pool = MONSTERS.filter((m) => m.cr <= 0.25);

  const inRange = (list: MonsterRef[], lo: number, hi: number) => list.filter((m) => xpOf(m) >= budget * lo && xpOf(m) <= budget * hi);

  let note: string | undefined;
  let boss: MonsterRef | undefined;
  if (opts.boss) {
    boss = MONSTERS.find((m) => m.name === opts.boss);
    if (boss && xpOf(boss) < budget * 0.25) {
      note = `${boss.name} (CR ${crLabel(boss.cr)}) is weak for level ${level}: flank it with lieutenants, add legendary actions, or reskin a higher-CR stat block.`;
    }
    if (boss && xpOf(boss) > budget) {
      note = `${boss.name} (CR ${crLabel(boss.cr)}, ${xpOf(boss)} XP) exceeds the High budget of ${budget} XP. Weaken the stat block, or fight in phases with the party at full strength.`;
    }
  }
  if (!boss) {
    const typedBoss = inRange(typed, 0.35, 0.85);
    const anyBoss = inRange(pool, 0.35, 0.85);
    const strongest = [...pool].sort((a, b) => xpOf(b) - xpOf(a)).slice(0, 3);
    const candidates = typedBoss.length && rng.chance(0.7) ? typedBoss : anyBoss.length ? anyBoss : strongest;
    boss = rng.pick(candidates);
  }

  const monsters: EncounterMonster[] = [{ name: boss.name, cr: crLabel(boss.cr), xp: xpOf(boss), count: 1 }];
  let spent = xpOf(boss);
  const remaining = budget - spent;

  // Minions: 2–6 of one kind that together fill most of what's left, not trivially weak.
  if (remaining > 0) {
    const fits = (m: MonsterRef) => {
      const n = Math.floor(remaining / xpOf(m));
      return m.name !== boss!.name && (xpOf(m) <= xpOf(boss!) || !!opts.boss) && n >= 2 && n <= 6 && n * xpOf(m) >= remaining * 0.6;
    };
    const sameType = pool.filter((m) => m.type === boss!.type && fits(m));
    const typedMin = typed.filter(fits);
    const anyMin = pool.filter(fits);
    const cands = sameType.length && rng.chance(0.6) ? sameType : typedMin.length && rng.chance(0.6) ? typedMin : anyMin;
    if (cands.length) {
      const minion = rng.pick(cands);
      const count = Math.floor(remaining / xpOf(minion));
      monsters.push({ name: minion.name, cr: crLabel(minion.cr), xp: xpOf(minion), count });
      spent += count * xpOf(minion);
    } else if (xpOf(boss) * 2 <= budget && !opts.boss) {
      const extra = Math.min(5, Math.floor(budget / xpOf(boss)) - 1);
      monsters[0].count += extra;
      spent += extra * xpOf(boss);
    }
  }

  const lead = monsters[0];
  return {
    id: uid(),
    title: opts.title ?? `${lead.count > 1 ? lead.count + ' × ' : ''}${lead.name}${monsters[1] ? ` with ${monsters[1].count} × ${monsters[1].name}` : ''}`,
    difficulty,
    level,
    budget,
    xp: spent,
    monsters,
    twist: rng.pick(TWISTS),
    note,
  };
}

export function rollLoot(rng: Rng, level: number, count = 1): LootItem[] {
  const items: LootItem[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = rng.weighted(rarityWeights(level));
    items.push({ name: rng.pick(ITEMS[rarity]), rarity });
  }
  const gold = Math.round(level * level * rng.int(8, 25) + rng.int(10, 60));
  items.push({ name: `${gold} gp`, rarity: 'Coins', note: rng.chance(0.5) ? `and ${rng.pick(TRINKETS)}` : undefined });
  return items;
}
