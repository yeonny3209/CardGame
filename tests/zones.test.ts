import { describe, expect, it } from 'vitest';
import { find, optionIndex, scenario } from './harness';
import type { Request } from '../src/engine/types';

type ZoneReq = Extract<Request, { type: 'zone' }>;
const uidOf = (duel: { cards: { uid: number; def: { id: string } }[] }, id: string) => duel.cards.find((c) => c.def.id === id)!.uid;
const isZone = (r: Request): r is ZoneReq => r.type === 'zone';

describe('choosing the zone', () => {
  it('Normal Summon goes to the chosen Monster Zone', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(0, [{ hand: ['gen_azure'] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => o.kind === 'normalSummon' && o.uid === uidOf(d, 'gen_azure'));
          return i >= 0 ? i : undefined;
        }
        if (isZone(req)) {
          asked.push(req);
          return 3;
        }
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(asked).toHaveLength(1);
    expect(asked[0].kind).toBe('mzone');
    expect(asked[0].free).toEqual([0, 1, 2, 3, 4]);
    expect(duel.players[0].mzone[3]).toBe(uidOf(duel, 'gen_azure'));
  });

  it('Setting a Spell lets you pick the zone, and cancelling keeps the card in hand', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(0, [{ hand: ['gen_insight'] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => o.kind === 'setST' && o.uid === uidOf(d, 'gen_insight'));
          return i >= 0 ? i : undefined;
        }
        if (isZone(req)) {
          asked.push(req);
          return asked.length === 1 ? null : 4;
        }
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(asked.map((r) => [r.kind, r.cancellable])).toEqual([
      ['szone', true],
      ['szone', true],
    ]);
    const insight = find(duel, 'gen_insight', 0)[0];
    expect(duel.players[0].szone[4]).toBe(insight.uid);
    expect(insight.faceUp).toBe(false);
  });

  it('cancelling a Normal Summon does not use up the summon for the turn', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(0, [{ hand: ['gen_azure'] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => o.kind === 'normalSummon' && o.uid === uidOf(d, 'gen_azure'));
          return i >= 0 ? i : undefined;
        }
        if (isZone(req)) {
          asked.push(req);
          return asked.length === 1 ? null : 1;
        }
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(asked).toHaveLength(2);
    expect(duel.players[0].mzone[1]).toBe(uidOf(duel, 'gen_azure'));
    expect(duel.players[0].normalSummons).toBe(1);
    expect(duel.log.filter((l) => l.text.includes('일반 소환'))).toHaveLength(1);
  });

  it('activating a Spell from the hand places it in the chosen Spell & Trap Zone', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(
      0,
      [{ hand: ['gen_ironresolve'], field: [{ id: 'ember_kestrel', loc: 'mzone' }] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = optionIndex(req, (o) => o.kind === 'activate' && o.uid === uidOf(d, 'gen_ironresolve'));
            return i >= 0 ? i : undefined;
          }
          if (isZone(req)) {
            asked.push(req);
            return 2;
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ kind: 'szone', cancellable: false });
    expect(duel.players[0].szone[2]).toBe(uidOf(duel, 'gen_ironresolve'));
  });

  it('a Special Summon uses the chosen zone, and only free zones are offered', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(
      0,
      [{ hand: ['ember_fledgling'], field: [{ id: 'ember_kestrel', loc: 'mzone' }] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = optionIndex(req, (o) => o.kind === 'procedure' && o.uid === uidOf(d, 'ember_fledgling'));
            return i >= 0 ? i : undefined;
          }
          if (isZone(req)) {
            asked.push(req);
            return 4;
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(asked[0].free).toEqual([1, 2, 3, 4]);
    expect(duel.players[0].mzone[4]).toBe(uidOf(duel, 'ember_fledgling'));
  });

  it('with a single free zone nothing is asked', async () => {
    const asked: ZoneReq[] = [];
    const { duel, run } = scenario(
      0,
      [
        {
          hand: ['ember_fledgling'],
          field: [
            { id: 'ember_kestrel', loc: 'mzone' },
            { id: 'gen_azure', loc: 'mzone' },
            { id: 'gen_ogre', loc: 'mzone' },
            { id: 'gen_wolf', loc: 'mzone' },
          ],
        },
        {},
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = optionIndex(req, (o) => o.kind === 'procedure' && o.uid === uidOf(d, 'ember_fledgling'));
            return i >= 0 ? i : undefined;
          }
          if (isZone(req)) asked.push(req);
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(asked).toHaveLength(0);
    expect(duel.players[0].mzone[4]).toBe(uidOf(duel, 'ember_fledgling'));
  });

  it('an invalid answer falls back to the first free zone', async () => {
    const { duel, run } = scenario(0, [{ hand: ['gen_azure'], field: [{ id: 'gen_ogre', loc: 'mzone' }] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => o.kind === 'normalSummon' && o.uid === uidOf(d, 'gen_azure'));
          return i >= 0 ? i : undefined;
        }
        if (isZone(req)) return 0; // occupied by the Ogre
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(duel.players[0].mzone[0]).toBe(uidOf(duel, 'gen_ogre'));
    expect(duel.players[0].mzone[1]).toBe(uidOf(duel, 'gen_azure'));
  });
});
