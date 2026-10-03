import { describe, expect, it } from 'vitest';
import { find, optionIndex, scenario } from './harness';
import type { ActionOption } from '../src/engine/types';

const uidOf = (duel: { cards: { uid: number; def: { id: string } }[] }, id: string) => duel.cards.find((c) => c.def.id === id)!.uid;
const summonPolicy = (id: string) => (req: import('../src/engine/types').Request, d: Parameters<typeof uidOf>[0]) => {
  if (req.type === 'chain') return req.options.length > 0 ? 0 : undefined;
  if (req.type === 'yesno') return true;
  if (req.type !== 'action') return undefined;
  const i = optionIndex(req, (o) => (o as ActionOption).kind === 'normalSummon' && (o as { uid: number }).uid === uidOf(d, id));
  return i >= 0 ? i : undefined;
};

describe('범용 번 몬스터', () => {
  it('열풍 톱니 병정: end phase, 200 per other FIRE monster', async () => {
    const { duel, run } = scenario(
      0,
      [{ field: [{ id: 'gen_gear', loc: 'mzone' }, { id: 'gen_fuse', loc: 'mzone' }, { id: 'gen_cannon', loc: 'mzone' }] }, {}],
      [() => undefined, () => undefined],
    );
    await run(1);
    expect(duel.players[1].lp).toBe(8000 - 400);
  });

  it('열폭주 포병: 800 damage only when the opponent LP is at least yours', async () => {
    const a = scenario(0, [{ hand: ['gen_cannon'] }, {}], [summonPolicy('gen_cannon'), () => undefined]);
    await a.run(1);
    expect(find(a.duel, 'gen_cannon', 0)[0].location).toBe('mzone');
    expect(a.duel.players[1].lp).toBe(7200);

    const b = scenario(0, [{ hand: ['gen_cannon'] }, {}], [summonPolicy('gen_cannon'), () => undefined]);
    b.duel.players[0].lp = 9000;
    await b.run(1);
    expect(b.duel.players[1].lp).toBe(8000);
  });

  it('용광로 정비병: banishes a FIRE monster from the GY, damage = Level × 200', async () => {
    const { duel, run } = scenario(0, [{ hand: ['gen_forge'], field: [{ id: 'gen_cannon', loc: 'gy' }] }, {}], [summonPolicy('gen_forge'), () => undefined]);
    await run(1);
    expect(find(duel, 'gen_cannon', 0)[0].location).toBe('banished');
    expect(duel.players[1].lp).toBe(8000 - 800);
  });
});
