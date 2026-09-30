import { describe, expect, it } from 'vitest';
import { AIController } from '../src/ai/ai';
import { Duel } from '../src/engine/core';
import { runDuel } from '../src/engine/flow';
import { STARTER_DECKS, toDefs } from '../src/deck/deck';
import type { PlayerId } from '../src/engine/types';

function checkInvariants(duel: Duel) {
  const seen = new Map<number, string>();
  const note = (uid: number, where: string) => {
    expect(seen.has(uid), `card ${uid} in ${where} and ${seen.get(uid)}`).toBe(false);
    seen.set(uid, where);
  };
  for (const p of [0, 1] as PlayerId[]) {
    const ps = duel.players[p];
    for (const loc of ['deck', 'hand', 'gy', 'banished', 'extra'] as const) {
      for (const u of ps[loc]) {
        note(u, `${p}:${loc}`);
        expect(duel.card(u).location).toBe(loc);
      }
    }
    for (const u of ps.mzone) if (u !== null) {
      note(u, `${p}:mzone`);
      expect(duel.card(u).location).toBe('mzone');
      for (const o of duel.card(u).overlay) {
        note(o, `${p}:overlay`);
        expect(duel.card(o).location).toBe('overlay');
      }
    }
    for (const u of ps.szone) if (u !== null) {
      note(u, `${p}:szone`);
      expect(duel.card(u).location).toBe('szone');
    }
    if (ps.fzone !== null) note(ps.fzone, `${p}:fzone`);
  }
  expect(seen.size).toBe(duel.cards.length);
}

describe('AI vs AI fuzz', () => {
  const decks = STARTER_DECKS;
  for (let i = 0; i < 48; i++) {
    const a = decks[i % decks.length];
    const b = decks[Math.floor(i / decks.length) % decks.length];
    it(`duel #${i}: ${a.name} vs ${b.name}`, async () => {
      const da = toDefs(a);
      const db = toDefs(b);
      const duel = new Duel([da.main, db.main], [da.extra, db.extra], [new AIController(0), new AIController(1)], { seed: 1000 + i });
      await runDuel(duel, { maxTurns: 60 });
      checkInvariants(duel);
      expect(duel.winner !== undefined || duel.turn >= 60).toBe(true);
    });
  }
});
