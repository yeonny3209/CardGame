// Deck lists, the Forbidden & Limited list, validation and persistence.
import { CARD_DB } from '../cards/pool';
import { isExtraDeckMonster } from '../engine/core';
import type { CardDef } from '../engine/types';

export interface Deck {
  name: string;
  main: string[];
  extra: string[];
}

export const MAIN_MIN = 40;
export const MAIN_MAX = 60;
export const EXTRA_MAX = 15;
export const MAX_COPIES = 3;

/** Forbidden (0), Limited (1), Semi-Limited (2). */
export const BANLIST: Record<string, 0 | 1 | 2> = {
  gen_cataclysm: 0,
  gen_insight: 1,
  gen_starfall: 1,
  gen_seconddawn: 1,
  gen_barrier: 1,
  gen_edict: 1,
  gen_whirlwind: 2,
};

export function copyLimit(id: string): number {
  return BANLIST[id] ?? MAX_COPIES;
}

export function belongsInExtra(def: CardDef): boolean {
  return isExtraDeckMonster(def);
}

export function validateDeck(deck: Deck): string[] {
  const errors: string[] = [];
  const unknown = [...deck.main, ...deck.extra].filter((id) => !CARD_DB[id]);
  if (unknown.length) errors.push(`알 수 없는 카드: ${[...new Set(unknown)].join(', ')}`);
  if (deck.main.length < MAIN_MIN || deck.main.length > MAIN_MAX)
    errors.push(`메인 덱은 ${MAIN_MIN}~${MAIN_MAX}장이어야 합니다 (현재 ${deck.main.length}장).`);
  if (deck.extra.length > EXTRA_MAX) errors.push(`엑스트라 덱은 최대 ${EXTRA_MAX}장입니다 (현재 ${deck.extra.length}장).`);
  for (const id of deck.main) {
    const def = CARD_DB[id];
    if (def && belongsInExtra(def)) {
      errors.push(`「${def.name}」은(는) 엑스트라 덱에 넣어야 합니다.`);
      break;
    }
  }
  for (const id of deck.extra) {
    const def = CARD_DB[id];
    if (def && !belongsInExtra(def)) {
      errors.push(`「${def.name}」은(는) 엑스트라 덱에 넣을 수 없습니다.`);
      break;
    }
  }
  const counts = countCards(deck);
  for (const [id, n] of counts) {
    const def = CARD_DB[id];
    if (!def) continue;
    const limit = copyLimit(id);
    if (n > limit) {
      errors.push(
        limit === 0 ? `「${def.name}」은(는) 금지 카드입니다.` : `「${def.name}」은(는) ${limit}장까지만 넣을 수 있습니다 (현재 ${n}장).`,
      );
    }
  }
  return errors;
}

export function countCards(deck: Deck): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of [...deck.main, ...deck.extra]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export function expand(spec: Array<[string, number]>): string[] {
  return spec.flatMap(([id, n]) => Array(n).fill(id));
}

export const STARTER_DECKS: Deck[] = [
  {
    name: '[스타터] 엠버윙 싱크로',
    main: expand([
      ['ember_scout', 3],
      ['ember_fledgling', 3],
      ['ember_kestrel', 3],
      ['ember_harrier', 3],
      ['ember_cinder', 2],
      ['ember_matriarch', 2],
      ['gen_sprite', 2],
      ['gen_azure', 2],
      ['gen_dove', 2],
      ['gen_sentinel', 1],
      ['ember_nest', 2],
      ['ember_rally', 2],
      ['ember_call', 3],
      ['gen_insight', 1],
      ['gen_starfall', 1],
      ['gen_seconddawn', 1],
      ['gen_whirlwind', 2],
      ['ember_ignition', 3],
      ['gen_pitfall', 2],
    ]),
    extra: expand([
      ['ember_blazehawk', 2],
      ['ember_phoenix', 2],
      ['ember_ashdrake', 2],
      ['gen_storm', 1],
      ['gen_gauntlet', 1],
      ['tide_leviathan', 1],
    ]),
  },
  {
    name: '[스타터] 타이드콜 엑시즈',
    main: expand([
      ['tide_mermaid', 3],
      ['tide_coralknight', 3],
      ['tide_oracle', 3],
      ['tide_diver', 3],
      ['gen_azure', 2],
      ['gen_wolf', 2],
      ['gen_sentinel', 2],
      ['gen_healer', 1],
      ['tide_surge', 3],
      ['tide_sanctum', 2],
      ['gen_insight', 1],
      ['gen_starfall', 1],
      ['gen_whirlwind', 2],
      ['gen_seconddawn', 1],
      ['gen_ironresolve', 2],
      ['tide_riptide', 3],
      ['tide_whirlpool', 2],
      ['gen_pitfall', 2],
      ['gen_barrier', 1],
      ['gen_edict', 1],
    ]),
    extra: expand([
      ['tide_leviathan', 2],
      ['tide_queen', 2],
      ['gen_gauntlet', 2],
      ['veil_wraith', 1],
    ]),
  },
  {
    name: '[스타터] 클락워크 융합',
    main: expand([
      ['clock_tinker', 3],
      ['clock_gearhound', 3],
      ['clock_springknight', 2],
      ['clock_sentry', 3],
      ['clock_engine', 2],
      ['gen_boar', 2],
      ['gen_azure', 2],
      ['gen_golem', 2],
      ['gen_dove', 1],
      ['clock_fusion', 3],
      ['gen_fusion', 1],
      ['clock_rewind', 2],
      ['gen_insight', 1],
      ['gen_starfall', 1],
      ['gen_ironresolve', 2],
      ['gen_whirlwind', 1],
      ['clock_overload', 2],
      ['gen_pitfall', 3],
      ['gen_barrier', 1],
      ['gen_edict', 1],
      ['tide_riptide', 2],
    ]),
    extra: expand([
      ['clock_titan', 3],
      ['clock_chimera', 3],
      ['gen_chimera', 2],
      ['gen_gauntlet', 2],
    ]),
  },
  {
    name: '[스타터] 베일본 의식',
    main: expand([
      ['veil_wisp', 3],
      ['veil_gravekeeper', 3],
      ['veil_revenant', 3],
      ['veil_shade', 3],
      ['veil_lich', 2],
      ['gen_sprite', 1],
      ['gen_ogre', 1],
      ['gen_healer', 1],
      ['gen_sentinel', 2],
      ['gen_dove', 1],
      ['veil_requiem', 2],
      ['veil_rebirth', 2],
      ['gen_insight', 1],
      ['gen_exchange', 2],
      ['gen_starfall', 1],
      ['gen_seconddawn', 1],
      ['gen_whirlwind', 1],
      ['veil_curse', 3],
      ['gen_pitfall', 2],
      ['gen_barrier', 1],
      ['gen_edict', 1],
      ['tide_riptide', 3],
    ]),
    extra: expand([
      ['veil_dreadknight', 3],
      ['veil_wraith', 2],
      ['gen_storm', 2],
      ['gen_gauntlet', 2],
    ]),
  },
];

// ---------------------------------------------------------------- sharing & storage

export function encodeDeck(deck: Deck): string {
  const json = JSON.stringify({ n: deck.name, m: deck.main, e: deck.extra });
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeDeck(code: string): Deck | null {
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!Array.isArray(obj.m) || !Array.isArray(obj.e)) return null;
    return {
      name: typeof obj.n === 'string' ? obj.n : '가져온 덱',
      main: obj.m.filter((x: unknown) => typeof x === 'string'),
      extra: obj.e.filter((x: unknown) => typeof x === 'string'),
    };
  } catch {
    return null;
  }
}

const STORAGE_KEY = 'cardgame.decks.v1';

export function loadSavedDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((d) => d && Array.isArray(d.main) && Array.isArray(d.extra)) : [];
  } catch {
    return [];
  }
}

export function saveDecks(decks: Deck[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // Storage unavailable (private mode etc.) — decks stay in memory only.
  }
}

export function toDefs(deck: Deck): { main: CardDef[]; extra: CardDef[] } {
  return { main: deck.main.map((id) => CARD_DB[id]), extra: deck.extra.map((id) => CARD_DB[id]) };
}
