// Enumerating and choosing material / tribute combinations.
import type { Duel } from './core';
import type { CardDef, CardInstance, PlayerId } from './types';
import { sanitizeSelection } from './context';

export function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function matchesAll(duel: Duel, def: CardDef, cards: CardInstance[]): boolean {
  if (def.materials?.type !== 'fusion') return false;
  const reqs = def.materials.materials;
  if (reqs.length !== cards.length) return false;
  // Try to assign each card to a distinct requirement (small, so brute force).
  const used = new Array(cards.length).fill(false);
  const rec = (ri: number): boolean => {
    if (ri === reqs.length) return true;
    for (let ci = 0; ci < cards.length; ci++) {
      if (used[ci] || !reqs[ri].filter(duel, cards[ci])) continue;
      used[ci] = true;
      if (rec(ri + 1)) return true;
      used[ci] = false;
    }
    return false;
  };
  return rec(0);
}

/** Every set of cards from `pool` that satisfies the Fusion Monster's material list. */
export function fusionCombos(duel: Duel, def: CardDef, pool: CardInstance[]): CardInstance[][] {
  if (def.materials?.type !== 'fusion') return [];
  const n = def.materials.materials.length;
  return combinations(pool, n).filter((combo) => matchesAll(duel, def, combo));
}

export function synchroCombos(duel: Duel, def: CardDef, pool: CardInstance[]): CardInstance[][] {
  const spec = def.materials;
  if (spec?.type !== 'synchro') return [];
  const target = def.level ?? 0;
  const faceUp = pool.filter((c) => c.faceUp && c.def.category === 'monster');
  const tuners = faceUp.filter((c) => c.def.tuner && (!spec.tuner || spec.tuner(duel, c)));
  const out: CardInstance[][] = [];
  for (const t of tuners) {
    const rest = faceUp.filter((c) => c !== t && !c.def.tuner && (!spec.nonTuner || spec.nonTuner(duel, c)));
    const need = target - duel.level(t);
    for (let k = 1; k <= rest.length; k++) {
      for (const combo of combinations(rest, k)) {
        if (combo.reduce((s, c) => s + duel.level(c), 0) === need) out.push([t, ...combo]);
      }
    }
  }
  return out;
}

export function xyzCombos(duel: Duel, def: CardDef, pool: CardInstance[]): CardInstance[][] {
  const spec = def.materials;
  if (spec?.type !== 'xyz') return [];
  const rank = def.level ?? 0;
  const ok = pool.filter(
    (c) =>
      c.faceUp &&
      c.def.category === 'monster' &&
      c.def.monsterKind !== 'xyz' &&
      duel.level(c) === rank &&
      (!spec.filter || spec.filter(duel, c)),
  );
  return combinations(ok, spec.count);
}

/** Minimal tribute sets whose total Level is at least `level`. */
export function ritualCombos(duel: Duel, level: number, pool: CardInstance[]): CardInstance[][] {
  const out: CardInstance[][] = [];
  const monsters = pool.filter((c) => c.def.category === 'monster');
  const lv = (c: CardInstance) => duel.level(c);
  const rec = (start: number, acc: CardInstance[], sum: number) => {
    if (sum >= level) {
      // No unnecessary tributes: removing any one must drop below the requirement.
      if (acc.every((c) => sum - lv(c) < level)) out.push([...acc]);
      return;
    }
    if (acc.length >= 5) return;
    for (let i = start; i < monsters.length; i++) {
      acc.push(monsters[i]);
      rec(i + 1, acc, sum + lv(monsters[i]));
      acc.pop();
    }
  };
  rec(0, [], 0);
  return out;
}

/**
 * Let a player pick one of the allowed combinations, one card at a time.
 * Returns the chosen combination (always one of `combos`), or null if none exist.
 */
export async function selectCombo(
  duel: Duel,
  player: PlayerId,
  combos: CardInstance[][],
  prompt: string,
): Promise<CardInstance[] | null> {
  if (combos.length === 0) return null;
  const chosen: CardInstance[] = [];
  for (;;) {
    const consistent = combos.filter((c) => chosen.every((x) => c.includes(x)));
    const complete = consistent.find((c) => c.length === chosen.length);
    const next = [...new Set(consistent.flatMap((c) => c.filter((x) => !chosen.includes(x))))];
    if (next.length === 0) return complete ?? consistent[0];
    const ans = await duel.ask({
      type: 'select',
      player,
      prompt: complete ? `${prompt} (추가 선택 또는 확정)` : `${prompt} (${chosen.length + 1}번째)`,
      candidates: next.map((c) => c.uid),
      min: complete ? 0 : 1,
      max: 1,
      purpose: 'material',
    });
    const picked = sanitizeSelection(ans, next, complete ? 0 : 1, 1);
    if (picked.length === 0) return complete!;
    chosen.push(duel.card(picked[0]));
  }
}
