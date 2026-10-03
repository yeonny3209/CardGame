import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_DB } from '../src/cards/pool';
import { BANLIST, STARTER_DECKS, validateDeck } from '../src/deck/deck';

// Stat ceilings for a 9th-generation (2018–2019 era) power level.
const ATK_CAP: Record<number, number> = { 1: 1000, 2: 1000, 3: 1700, 4: 2100, 5: 2500, 6: 2600, 7: 2900, 8: 3100 };

describe('balance: stat ceilings', () => {
  for (const c of ALL_CARDS) {
    const { level, atk, def } = c;
    if (c.category !== 'monster' || level === undefined || atk === undefined) continue;
    if (c.monsterKind !== undefined && c.monsterKind !== 'normal' && c.monsterKind !== 'effect') continue;
    it(`${c.name} (Lv${level}, ${atk}/${def})`, () => {
      expect(atk).toBeLessThanOrEqual(ATK_CAP[Math.min(level, 8)] ?? 3100);
      if (def !== undefined) expect(def).toBeLessThanOrEqual(level <= 4 ? 2500 : 3000);
    });
  }
});

describe('balance: banlist', () => {
  it('only references existing cards', () => {
    for (const id of Object.keys(BANLIST)) expect(CARD_DB[id], id).toBeDefined();
  });
  it('forbidden cards appear in no starter deck, limited cards at most once', () => {
    for (const d of STARTER_DECKS) {
      expect(validateDeck(d), d.name).toEqual([]);
      for (const id of [...d.main, ...d.extra]) if (BANLIST[id] === 0) throw new Error(`${d.name}: forbidden ${id}`);
    }
  });
});
