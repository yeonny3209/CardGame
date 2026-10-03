import { describe, expect, it } from 'vitest';
import { find, optionIndex, scenario } from './harness';
import { canActivate, mainActions } from '../src/engine/flow';
import { tributesFor } from '../src/engine/tribute';
import type { ActionOption, PlayerId } from '../src/engine/types';

const uidOf = (duel: { cards: { uid: number; def: { id: string } }[] }, id: string) => duel.cards.find((c) => c.def.id === id)!.uid;
const normalOpt = (o: ActionOption, uid: number) => o.kind === 'normalSummon' && o.uid === uid;

describe('선샤인: tributes', () => {
  it('a Sunshine Herald lowers the Tributes of Level 5+ Sunshine monsters in the hand by one', async () => {
    let tributes = -1;
    const { duel, run } = scenario(0, [{ hand: ['sun_knight'], field: [{ id: 'sun_herald', loc: 'mzone' }] }, {}], [
      (req, d) => {
        if (req.type !== 'action') return undefined;
        const i = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_knight')));
        if (i >= 0) tributes = (req.options[i] as { tributes: number }).tributes;
        return i >= 0 ? i : undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(tributes).toBe(0);
    const knight = find(duel, 'sun_knight', 0)[0];
    expect(knight.location).toBe('mzone');
    expect(find(duel, 'sun_herald', 0)[0].location).toBe('mzone'); // nothing was released
  });

  it('Herald and the Altar do not stack, and only Level 5+ Sunshine monsters are affected', () => {
    const need = (id: string, field: { id: string; loc: 'mzone' | 'fzone' }[]) => {
      const { duel } = scenario(0, [{ deck: [id], field }, {}], [() => undefined, () => undefined]);
      const c = find(duel, id, 0)[0];
      duel.place(c, 'hand');
      return tributesFor(duel, c);
    };
    const herald = { id: 'sun_herald', loc: 'mzone' as const };
    const altar = { id: 'sun_altar', loc: 'fzone' as const };
    expect(need('sun_bird', [])).toBe(2);
    expect(need('sun_bird', [herald])).toBe(1);
    expect(need('sun_bird', [herald, altar])).toBe(1); // 2 - 1, not 2 - 2
    expect(need('sun_knight', [altar])).toBe(0);
    expect(need('gen_ogre', [herald, altar])).toBe(1); // not a Sunshine monster
    expect(need('sun_sprite', [herald, altar])).toBe(0); // Level 2: nothing to reduce
  });

  it('a Sunshine Pilgrim counts as two Tributes for Sunshine monsters only', async () => {
    const seen: number[] = [];
    const { duel, run } = scenario(0, [{ hand: ['sun_bird', 'gen_elder'], field: [{ id: 'sun_pilgrim', loc: 'mzone' }] }, {}], [
      (req, d) => {
        if (req.type !== 'action') return undefined;
        const elder = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'gen_elder')));
        seen.push(elder);
        const i = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_bird')));
        return i >= 0 ? i : undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(seen[0]).toBe(-1); // a Level 8 non-Sunshine needs two real Tributes
    const bird = find(duel, 'sun_bird', 0)[0];
    expect(bird.location).toBe('mzone');
    expect(bird.summonTributes).toBe(2);
    expect(find(duel, 'sun_pilgrim', 0)[0].location).toBe('gy');
  });

  it('Sunshine Lamb draws when it is released for an Advance Summon', async () => {
    const { duel, run } = scenario(
      0,
      [{ hand: ['sun_bird'], field: [{ id: 'sun_lamb', loc: 'mzone' }, { id: 'clock_sentry', loc: 'mzone' }] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_bird')));
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'yesno') return req.prompt.includes('어린 양');
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(find(duel, 'sun_bird', 0)[0].location).toBe('mzone');
    expect(find(duel, 'sun_lamb', 0)[0].location).toBe('gy');
    expect(duel.log.some((l) => l.text.includes('「선샤인 어린 양」') && l.text.includes('발동'))).toBe(true);
    expect(duel.players[0].hand).toHaveLength(5); // 5 - Bird + 1 draw
  });

  it('the Dragon is untargetable only when it was summoned with two Tributes worth', async () => {
    const full = scenario(0, [{ hand: ['sun_dragon'], field: [{ id: 'sun_pilgrim', loc: 'mzone' }] }, {}], [
      (req, d) => (req.type === 'action' ? (optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_dragon'))) >= 0 ? optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_dragon'))) : undefined) : undefined),
      () => undefined,
    ]);
    await full.run(1);
    const d1 = find(full.duel, 'sun_dragon', 0)[0];
    expect(d1.location).toBe('mzone');
    expect(full.duel.hasFlag(d1, 'untargetable')).toBe(true);

    const cheap = scenario(0, [{ hand: ['sun_dragon'], field: [{ id: 'sun_herald', loc: 'mzone' }, { id: 'sun_lamb', loc: 'mzone' }] }, {}], [
      (req, d) => (req.type === 'action' ? (optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_dragon'))) >= 0 ? optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'sun_dragon'))) : undefined) : undefined),
      (req) => (req.type === 'select' ? [req.candidates[req.candidates.length - 1]] : undefined),
    ]);
    // Herald lowers the need to 1 Tribute: the Dragon arrives, but without the bonus.
    await cheap.run(1);
    const d2 = find(cheap.duel, 'sun_dragon', 0)[0];
    expect(d2.location).toBe('mzone');
    expect(d2.summonTributes).toBe(1);
    expect(cheap.duel.hasFlag(d2, 'untargetable')).toBe(false);
  });
});

describe('선샤인: extra summons', () => {
  it('Coronation allows a second Normal Summon, but not a third', async () => {
    const afterTwo: string[][] = [];
    let summoned = 0;
    const { duel, run } = scenario(0, [{ hand: ['sun_coronation', 'gen_azure', 'gen_wolf'] }, {}], [
      (req, d) => {
        if (req.type !== 'action') return undefined;
        const co = optionIndex(req, (o) => o.kind === 'activate' && o.uid === uidOf(d, 'sun_coronation'));
        if (co >= 0) return co;
        const pick = optionIndex(req, (o) => o.kind === 'normalSummon' && [uidOf(d, 'gen_azure'), uidOf(d, 'gen_wolf')].includes((o as { uid: number }).uid));
        if (pick >= 0 && summoned < 2) {
          summoned++;
          return pick;
        }
        if (summoned >= 2) afterTwo.push(req.options.map((o) => o.kind));
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(duel.players[0].normalSummons).toBe(2);
    expect(duel.monsters(0)).toHaveLength(2);
    expect(afterTwo.length).toBeGreaterThan(0);
    expect(afterTwo[0]).not.toContain('normalSummon');
  });

  it('Ascension Advance Summons without using up the Normal Summon', async () => {
    const { duel, run } = scenario(
      0,
      [{ hand: ['sun_ascend', 'sun_bird', 'gen_azure'], field: [{ id: 'sun_sprite', loc: 'mzone' }] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            let i = optionIndex(req, (o) => o.kind === 'activate' && o.uid === uidOf(d, 'sun_ascend'));
            if (i < 0) i = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'gen_azure')));
            return i >= 0 ? i : undefined;
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    const bird = find(duel, 'sun_bird', 0)[0];
    expect(bird.location).toBe('mzone');
    expect(bird.summonType).toBe('tribute');
    expect(bird.summonTributes).toBe(1); // 2 - 1
    expect(find(duel, 'sun_sprite', 0)[0].location).toBe('gy');
    expect(find(duel, 'gen_azure', 0)[0].location).toBe('mzone'); // the Normal Summon was still available
    expect(duel.players[0].normalSummons).toBe(1);
  });
});

describe('메모리 홀: traps', () => {
  function setup(extra: Parameters<typeof scenario>[1][0] = {}) {
    return scenario(
      0,
      [
        { field: [{ id: 'mem_corridor', loc: 'szone' }, { id: 'mem_replay', loc: 'szone', faceUp: false }, { id: 'mem_banish', loc: 'gy' }], ...extra },
        {},
      ],
      [() => undefined, () => undefined],
    );
  }

  it('Corridor lets Memory Hole Traps be activated the turn they are Set', () => {
    const { duel } = setup();
    duel.turn = 3;
    duel.turnPlayer = 0;
    duel.phase = 'main1';
    const replay = find(duel, 'mem_replay', 0)[0];
    replay.enteredTurn = duel.turn; // Set this turn
    expect(duel.hasFlag(replay, 'trapSetTurn')).toBe(true);
    expect(canActivate(duel, 0 as PlayerId, replay, 0, true)).toBe(true);

    // Without Corridor it has to wait for the next turn.
    duel.sendTo([find(duel, 'mem_corridor', 0)[0]], 'gy', ['effect']);
    expect(duel.hasFlag(replay, 'trapSetTurn')).toBe(false);
    expect(canActivate(duel, 0 as PlayerId, replay, 0, true)).toBe(false);
    replay.enteredTurn = duel.turn - 1;
    expect(canActivate(duel, 0 as PlayerId, replay, 0, true)).toBe(true);
  });

  it('Corridor only helps Memory Hole Traps', () => {
    const { duel } = scenario(0, [{ field: [{ id: 'mem_corridor', loc: 'szone' }, { id: 'gen_pitfall', loc: 'szone', faceUp: false }] }, {}], [() => undefined, () => undefined]);
    expect(duel.hasFlag(find(duel, 'gen_pitfall', 0)[0], 'trapSetTurn')).toBe(false);
  });

  it('Rewind can be activated from the hand only while you control a Memory Hole monster', () => {
    const { duel } = scenario(0, [{ field: [{ id: 'mem_guard', loc: 'mzone' }] , deck: ['mem_rewind'] }, { field: [{ id: 'gen_azure', loc: 'mzone' }] }], [() => undefined, () => undefined]);
    const rewind = find(duel, 'mem_rewind', 0)[0];
    duel.place(rewind, 'hand');
    const attacker = find(duel, 'gen_azure', 1)[0];
    duel.turn = 2;
    duel.turnPlayer = 1;
    duel.phase = 'battle';
    duel.battle = { attacker: attacker.uid, attackerVersion: attacker.version, target: null, targetVersion: 0, defenderSnapshot: [] };
    duel.windowEvents = [{ type: 'attackDeclared', seq: 1, group: 1, card: attacker.uid, version: attacker.version, player: 1 }];
    expect(canActivate(duel, 0 as PlayerId, rewind, 0, false)).toBe(true);
    duel.sendTo([find(duel, 'mem_guard', 0)[0]], 'gy', ['effect']);
    expect(canActivate(duel, 0 as PlayerId, rewind, 0, false)).toBe(false);
  });

  it('Replay Sets a Trap from the GY and it can be used the same turn', async () => {
    let flagDuringTurn: boolean | null = null;
    let activatableDuringTurn: boolean | null = null;
    const { duel, run } = scenario(
      0,
      [{ field: [{ id: 'mem_replay', loc: 'szone', faceUp: false }, { id: 'mem_banish', loc: 'gy' }] }, {}],
      [
        (req, d) => {
          if (req.type !== 'action') return undefined;
          const banish = d.cards.find((c) => c.def.id === 'mem_banish')!;
          if (banish.location === 'szone') {
            // After Replay resolved: still the turn it was Set, yet it counts as activatable.
            flagDuringTurn = d.hasFlag(banish, 'trapSetTurn');
            activatableDuringTurn = banish.enteredTurn === d.turn;
            return undefined;
          }
          const i = optionIndex(req, (o) => o.kind === 'activate' && o.uid === uidOf(d, 'mem_replay'));
          return i >= 0 ? i : undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    const banish = find(duel, 'mem_banish', 0)[0];
    expect(banish.location).toBe('szone');
    expect(banish.faceUp).toBe(false);
    expect(activatableDuringTurn).toBe(true); // it really was Set this turn
    expect(flagDuringTurn).toBe(true);
    // The effect lasts until the end of the turn only.
    expect(duel.hasFlag(banish, 'trapSetTurn')).toBe(false);
  });
});

describe('메모리 홀: loops', () => {
  it('two Replays cannot keep Setting each other forever', async () => {
    const { duel, run } = scenario(
      0,
      [
        {
          field: [
            { id: 'mem_replay', loc: 'szone', faceUp: false },
            { id: 'mem_replay', loc: 'gy' },
            { id: 'mem_replay', loc: 'gy' },
            { id: 'mem_banish', loc: 'gy' },
          ],
        },
        {},
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'mem_replay');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'chain') return 0; // always take the chance to activate again
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(duel.turn).toBe(1); // the duel got through the turn instead of hanging
    expect(duel.log.filter((l) => l.text.includes('「메모리 홀 재현」 발동')).length).toBeLessThanOrEqual(1);
  });
});

describe('메모리 홀: monsters', () => {
  it('Archivist Sets a Memory Hole Trap from the deck', async () => {
    const { duel, run } = scenario(0, [{ hand: ['mem_archivist'], deck: ['mem_banish'] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => normalOpt(o as ActionOption, uidOf(d, 'mem_archivist')));
          return i >= 0 ? i : undefined;
        }
        if (req.type === 'yesno') return true;
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    const trap = find(duel, 'mem_banish', 0)[0];
    expect(trap.location).toBe('szone');
    expect(trap.faceUp).toBe(false);
  });

  it('Guard protects Set cards from effects but not face-up ones', () => {
    const { duel } = scenario(0, [{ field: [{ id: 'mem_guard', loc: 'mzone' }, { id: 'mem_banish', loc: 'szone', faceUp: false }, { id: 'mem_corridor', loc: 'szone' }] }, {}], [() => undefined, () => undefined]);
    const setCard = find(duel, 'mem_banish', 0)[0];
    const faceUp = find(duel, 'mem_corridor', 0)[0];
    expect(duel.destroy([setCard], ['effect'], 1)).toHaveLength(0);
    expect(duel.destroy([faceUp], ['effect'], 1)).toHaveLength(1);
  });

  it('Librarian can be Special Summoned from the hand only with three Traps in the GY', () => {
    const { duel } = scenario(
      0,
      [{ deck: ['mem_librarian', 'mem_abyss'], field: [{ id: 'mem_banish', loc: 'gy' }, { id: 'mem_rewind', loc: 'gy' }, { id: 'gen_azure', loc: 'gy' }] }, {}],
      [() => undefined, () => undefined],
    );
    const lib = find(duel, 'mem_librarian', 0)[0];
    duel.place(lib, 'hand');
    duel.turn = 1;
    duel.turnPlayer = 0;
    duel.phase = 'main1';
    const hasProcedure = () => mainActions(duel).some((o) => o.kind === 'procedure' && o.uid === lib.uid);
    expect(hasProcedure()).toBe(false); // two Traps and a monster in the GY
    duel.place(find(duel, 'mem_abyss', 0)[0], 'gy');
    expect(hasProcedure()).toBe(true);
  });
});
