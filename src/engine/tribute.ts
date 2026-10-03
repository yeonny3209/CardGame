// Tribute Summon rules: how many Tributes a monster needs, what each Tribute is worth, and how many
// Normal Summons a player may make. Kept free of other engine imports so cards and flow can both use it.
import type { Duel } from './core';
import type { CardDef, CardInstance, PlayerId } from './types';

export function tributesNeeded(def: CardDef): number {
  const lv = def.level ?? 0;
  if (lv >= 7) return 2;
  if (lv >= 5) return 1;
  return 0;
}

/**
 * Tributes `c` needs right now. Effects can reduce this (`continuous.tributes`); only the strongest single
 * reduction applies, so several of them do not stack.
 */
export function tributesFor(duel: Duel, c: CardInstance): number {
  let mod = 0;
  for (const [src, e] of duel.activeContinuous()) {
    const spec = e.continuous!;
    if (!spec.tributes || !spec.affects(duel, src, c)) continue;
    mod = Math.min(mod, spec.tributes(duel, src, c));
  }
  return Math.max(0, tributesNeeded(c.def) + mod);
}

/** How many Tributes `released` counts as when it is released for the Tribute Summon of `summoned`. */
export function releaseValue(duel: Duel, released: CardInstance, summoned: CardInstance): number {
  let value = 1;
  if (released.faceUp && !duel.isNegated(released)) {
    for (const e of released.def.effects) {
      if (e.type === 'continuous' && e.continuous?.releaseValue) value = Math.max(value, e.continuous.releaseValue(duel, released, summoned));
    }
  }
  return value;
}

/** Smallest sets of `pool` whose total value reaches `need`: removing any one card drops the total below it. */
export function sumCombos(pool: CardInstance[], need: number, value: (c: CardInstance) => number): CardInstance[][] {
  if (need <= 0) return [[]];
  const cards = pool.slice(0, 6);
  const out: CardInstance[][] = [];
  for (let mask = 1; mask < 1 << cards.length; mask++) {
    const combo = cards.filter((_, i) => (mask & (1 << i)) !== 0);
    const sum = combo.reduce((s, c) => s + value(c), 0);
    if (sum >= need && combo.every((c) => sum - value(c) < need)) out.push(combo);
  }
  return out;
}

/** Every way `p` can pay the Tributes for `c` from their own monsters. `[[]]` when none are needed. */
export function tributeCombos(duel: Duel, p: PlayerId, c: CardInstance, need: number): CardInstance[][] {
  return sumCombos(duel.monsters(p), need, (m) => releaseValue(duel, m, c));
}

export function normalSummonsAllowed(duel: Duel, p: PlayerId): number {
  let n = 1 + duel.players[p].extraNormalSummons;
  for (const [src, e] of duel.activeContinuous()) {
    if (src.controller === p && e.continuous!.extraNormalSummons) n += e.continuous!.extraNormalSummons;
  }
  return n;
}

export function canNormalSummon(duel: Duel, p: PlayerId): boolean {
  return duel.players[p].normalSummons < normalSummonsAllowed(duel, p);
}
