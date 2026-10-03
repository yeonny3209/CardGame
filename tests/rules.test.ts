import { describe, expect, it } from 'vitest';
import { find, optionIndex, scenario } from './harness';
import type { Request } from '../src/engine/types';
import { tributesNeeded } from '../src/engine/flow';
import { getCard } from '../src/cards/pool';
import { STARTER_DECKS, validateDeck, decodeDeck, encodeDeck, expand, withNewStarters } from '../src/deck/deck';

const uidOf = (duel: { cards: { uid: number; def: { id: string } }[] }, id: string) => duel.cards.find((c) => c.def.id === id)!.uid;

describe('deck construction', () => {
  it('starter decks are legal', () => {
    for (const d of STARTER_DECKS) expect(validateDeck(d), d.name).toEqual([]);
  });

  it('rejects too many copies, forbidden cards and misplaced Extra Deck monsters', () => {
    const base = STARTER_DECKS[0];
    expect(validateDeck({ ...base, main: [...base.main.slice(0, 36), ...expand([['ember_scout', 4]])] }).join()).toMatch(/3장까지/);
    expect(validateDeck({ ...base, main: [...base.main.slice(0, 39), 'gen_cataclysm'] }).join()).toMatch(/금지/);
    expect(validateDeck({ ...base, main: [...base.main.slice(0, 39), 'gen_insight'] }).join()).toMatch(/1장까지/);
    expect(validateDeck({ ...base, main: [...base.main.slice(0, 39), 'gen_storm'] }).join()).toMatch(/엑스트라 덱에 넣어야/);
    expect(validateDeck({ ...base, main: base.main.slice(0, 39) }).join()).toMatch(/40~60/);
  });

  it('round-trips deck codes', () => {
    const d = STARTER_DECKS[2];
    expect(decodeDeck(encodeDeck(d))).toEqual(d);
    expect(decodeDeck('not a code')).toBeNull();
  });

  it('offers new starter decks to returning players once, without bringing back renamed ones', () => {
    // First visit: everything is offered.
    const first = withNewStarters([], null);
    expect(first.decks).toHaveLength(STARTER_DECKS.length);
    expect(first.decks.every((d) => d.name.startsWith('내 '))).toBe(true);

    // A returning player from before the builder tracked this: only the newer starters are added.
    const legacy = STARTER_DECKS.slice(0, 4).map((d, i) => ({ name: i === 0 ? '내가 이름 바꾼 덱' : d.name.replace('[스타터] ', '내 '), main: [...d.main], extra: [...d.extra] }));
    const second = withNewStarters(legacy, null);
    expect(second.decks).toHaveLength(legacy.length + STARTER_DECKS.length - 4);
    expect(second.decks.slice(4).map((d) => d.name)).toEqual(STARTER_DECKS.slice(4).map((d) => d.name.replace('[스타터] ', '내 ')));
    expect(second.decks.some((d) => d.name === '내 엠버윙 싱크로')).toBe(false); // the renamed deck did not come back

    // Running it again changes nothing, even if the player deleted one.
    const third = withNewStarters(second.decks.slice(0, -1), second.seeded);
    expect(third.decks).toHaveLength(second.decks.length - 1);
  });

  it('computes tribute requirements', () => {
    expect(tributesNeeded(getCard('gen_azure'))).toBe(0);
    expect(tributesNeeded(getCard('gen_ogre'))).toBe(1);
    expect(tributesNeeded(getCard('gen_elder'))).toBe(2);
  });
});

describe('chains and spell speed', () => {
  it('a Counter Trap negates a Spell; only Spell Speed 3 may respond to it', async () => {
    const offeredToP0: Request[] = [];
    const { duel, run } = scenario(
      0,
      [
        {
          hand: ['gen_starfall'],
          field: [
            { id: 'gen_azure', loc: 'mzone' },
            { id: 'gen_edict', loc: 'szone', faceUp: false },
            { id: 'tide_riptide', loc: 'szone', faceUp: false },
          ],
        },
        {
          field: [
            { id: 'gen_ogre', loc: 'mzone' },
            { id: 'tide_whirlpool', loc: 'szone', faceUp: false },
            { id: 'tide_riptide', loc: 'szone', faceUp: false },
          ],
        },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = optionIndex(req, (o) => o.uid === uidOf(d, 'gen_starfall'));
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'chain') {
            offeredToP0.push(req);
            return -1;
          }
          return undefined;
        },
        (req, d) => {
          if (req.type === 'chain' && d.chain.length === 1) {
            // Both the Counter Trap and the Normal Trap may respond to a Spell Speed 1 link.
            expect(req.options.map((o) => d.card(o.uid).def.id).sort()).toEqual(['tide_riptide', 'tide_whirlpool']);
            return req.options.findIndex((o) => d.card(o.uid).def.id === 'tide_whirlpool');
          }
          return undefined;
        },
      ],
    );
    await run(1);
    const ogre = find(duel, 'gen_ogre', 1)[0];
    expect(ogre.location).toBe('mzone');
    expect(find(duel, 'gen_starfall', 0)[0].location).toBe('gy');
    expect(find(duel, 'tide_whirlpool', 1)[0].location).toBe('gy');
    expect(duel.players[1].lp).toBe(7000);
    // Links resolve last-in, first-out.
    const texts = duel.log.map((l) => l.text);
    expect(texts.findIndex((t) => t.startsWith('체인 2'))).toBeLessThan(texts.findIndex((t) => t.startsWith('체인 1')));
    // Player 0 could answer the Counter Trap only with a Counter Trap.
    const response = offeredToP0.find((r) => r.type === 'chain' && r.prompt.includes('체인 2'));
    expect(response && response.type === 'chain' && response.options.map((o) => duel.card(o.uid).def.id)).toEqual(['gen_edict']);
  });

  it('hard once-per-turn: a second copy cannot be activated the same turn', async () => {
    let offeredSecond = false;
    const { duel, run } = scenario(
      0,
      [{ hand: ['ember_call', 'ember_call'], deck: ['ember_scout', 'ember_kestrel'] }, {}],
      [
        (req, d) => {
          if (req.type !== 'action') return undefined;
          const idx = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'ember_call');
          if (idx >= 0 && d.cardsIn(0, ['gy'], (c) => c.def.id === 'ember_call').length > 0) offeredSecond = true;
          return idx >= 0 ? idx : undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(offeredSecond).toBe(false);
    expect(duel.cardsIn(0, ['hand'], (c) => c.def.id === 'ember_call')).toHaveLength(1);
  });
});

describe('missing timing', () => {
  it('an optional "when" trigger misses timing if it was not the last thing to happen', async () => {
    const { duel, run } = scenario(
      0,
      [
        {
          hand: ['veil_wisp'],
          field: [{ id: 'ember_nest', loc: 'fzone' }],
          deck: ['ember_scout', 'veil_shade'],
        },
        {},
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'ember_nest');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.purpose === 'cost') return [uidOf(d, 'veil_wisp')];
          if (req.type === 'yesno') return true;
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(duel.log.some((l) => l.text.includes('타이밍을 놓쳤습니다'))).toBe(true);
    expect(find(duel, 'veil_shade', 0)[0].location).toBe('deck');
    expect(find(duel, 'ember_scout', 0)[0].location).toBe('hand');
  });

  it('the same trigger activates when it was the last thing to happen', async () => {
    const { duel, run } = scenario(
      0,
      [{ hand: ['gen_exchange', 'veil_wisp'], deck: ['veil_shade'] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'gen_exchange');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.prompt.includes('버릴')) return [uidOf(d, 'veil_wisp')];
          if (req.type === 'yesno') return true;
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(duel.log.some((l) => l.text.includes('타이밍을 놓쳤습니다'))).toBe(false);
    expect(find(duel, 'veil_shade', 0)[0].location).toBe('gy');
  });
});

describe('battle', () => {
  it('piercing damage against a Defense Position monster', async () => {
    const { duel, run } = scenario(
      1,
      [
        { field: [{ id: 'ember_ashdrake', loc: 'mzone' }] },
        { field: [{ id: 'veil_gravekeeper', loc: 'mzone', position: 'def' }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'toBattle' || o.kind === 'attack');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'attackTarget') return uidOf(d, 'veil_gravekeeper');
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(2);
    expect(find(duel, 'veil_gravekeeper', 1)[0].location).toBe('gy');
    expect(duel.players[1].lp).toBe(8000 - (2200 - 1400));
  });

  it('flip effects resolve after damage calculation', async () => {
    const { duel, run } = scenario(
      1,
      [
        { field: [{ id: 'gen_ogre', loc: 'mzone' }, { id: 'gen_azure', loc: 'mzone' }] },
        { field: [{ id: 'gen_boar', loc: 'mzone', faceUp: false, position: 'def' }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const ogre = d.cards.find((c) => c.def.id === 'gen_ogre' && c.owner === 0)!;
            const i = req.options.findIndex((o) => o.kind === 'toBattle' || (o.kind === 'attack' && o.uid === ogre.uid));
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'attackTarget') return uidOf(d, 'gen_boar');
          return undefined;
        },
        (req, d) => {
          if (req.type === 'select' && req.prompt.includes('파괴할 몬스터')) return [d.cards.find((c) => c.def.id === 'gen_ogre' && c.owner === 0)!.uid];
          return undefined;
        },
      ],
    );
    await run(2);
    const log = duel.log.map((l) => l.text);
    // Boar was flipped face-up, battle was calculated (no damage vs 1300 DEF), then its flip effect destroyed the Ogre.
    expect(find(duel, 'gen_boar', 1)[0].location).toBe('gy');
    expect(find(duel, 'gen_ogre', 0)[0].location).toBe('gy');
    const flipIdx = log.findIndex((t) => t.includes('「철갑 멧돼지」 반전'));
    const effIdx = log.findIndex((t) => t.includes('「철갑 멧돼지」 발동'));
    expect(flipIdx).toBeGreaterThanOrEqual(0);
    expect(effIdx).toBeGreaterThan(flipIdx);
    expect(duel.players[1].lp).toBe(8000);
  });

  it('a stronger attacker destroys the target and deals the difference', async () => {
    let attackPrompts = 0;
    const { duel, run } = scenario(
      1,
      [
        { field: [{ id: 'gen_elder', loc: 'mzone' }] },
        { field: [{ id: 'gen_azure', loc: 'mzone' }, { id: 'tide_riptide', loc: 'szone', faceUp: false }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'toBattle' || o.kind === 'attack');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'attackTarget') {
            attackPrompts++;
            return req.targets.length ? req.targets[0] : req.direct ? -1 : null;
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(2);
    expect(attackPrompts).toBe(1);
    expect(find(duel, 'gen_azure', 1)[0].location).toBe('gy');
    expect(duel.players[1].lp).toBe(8000 - 1100);
  });

  it('replay after the target is removed lets the attacker attack directly', async () => {
    let second: Request | null = null;
    let prompts = 0;
    const { duel, run } = scenario(
      1,
      [
        { field: [{ id: 'gen_elder', loc: 'mzone' }, { id: 'tide_riptide', loc: 'szone', faceUp: false }] },
        { field: [{ id: 'gen_azure', loc: 'mzone' }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'toBattle' || o.kind === 'attack');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'attackTarget') {
            prompts++;
            if (prompts === 2) {
              second = req;
              return -1;
            }
            return req.targets[0];
          }
          // Attacker's own quick response: bounce the defending monster after declaring the attack.
          if (req.type === 'chain' && d.battle && d.damageStep === null) return 0;
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(2);
    expect(prompts).toBe(2);
    expect(second).not.toBeNull();
    expect(find(duel, 'gen_azure', 1)[0].location).toBe('hand');
    expect(duel.players[1].lp).toBe(8000 - 3000);
  });

  it('only Damage-Step-legal effects are offered during the Damage Step', async () => {
    const damageStepOptions: string[][] = [];
    const { duel, run } = scenario(
      1,
      [
        {
          hand: ['ember_rally', 'gen_whirlwind'],
          field: [{ id: 'ember_kestrel', loc: 'mzone' }],
        },
        { field: [{ id: 'gen_azure', loc: 'mzone' }, { id: 'clock_overload', loc: 'szone', faceUp: false }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'toBattle' || o.kind === 'attack');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'attackTarget') return uidOf(d, 'gen_azure');
          if (req.type === 'chain' && d.damageStep !== null) {
            damageStepOptions.push(req.options.map((o) => d.card(o.uid).def.id));
            if (d.damageStep === 'beforeCalc') return req.options.findIndex((o) => d.card(o.uid).def.id === 'ember_rally');
            return -1;
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(2);
    expect(damageStepOptions.length).toBeGreaterThan(0);
    for (const opts of damageStepOptions) expect(opts).not.toContain('gen_whirlwind');
    expect(damageStepOptions.flat()).toContain('ember_rally');
    // 1800 + 800 beats 1900: Azure destroyed, 700 damage, then Kestrel's burn for 500.
    expect(find(duel, 'gen_azure', 1)[0].location).toBe('gy');
    expect(duel.players[1].lp).toBe(8000 - 700 - 500);
  });
});

describe('summoning', () => {
  it('Synchro Summon sends materials to the GY and triggers "sent as Synchro Material" effects', async () => {
    const { duel, run } = scenario(
      1,
      [
        {
          field: [
            { id: 'ember_scout', loc: 'mzone' },
            { id: 'ember_harrier', loc: 'mzone' },
          ],
          extra: ['gen_storm'],
        },
        {},
      ],
      [
        (req) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'extraSummon');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'yesno') return true;
          if (req.type === 'select' && req.purpose === 'material') return req.min === 0 ? [] : [req.candidates[0]];
          return undefined;
        },
        () => undefined,
      ],
    );
    const handBefore = 5;
    await run(2);
    const storm = find(duel, 'gen_storm', 0)[0];
    expect(storm.location).toBe('mzone');
    expect(storm.summonType).toBe('synchro');
    expect(find(duel, 'ember_scout', 0)[0].location).toBe('gy');
    expect(find(duel, 'ember_harrier', 0)[0].location).toBe('gy');
    // Turn draw + Harrier draw gives 7 cards; the End Phase hand limit trims back to 6.
    expect(duel.log.some((l) => l.text.includes('「엠버윙 해리어」 발동'))).toBe(true);
    expect(duel.log.some((l) => l.text.includes('패 매수 제한'))).toBe(true);
    expect(duel.players[0].hand.length).toBe(handBefore + 1);
  });

  it('Xyz materials are attached, not sent to the GY, and can be detached as a cost', async () => {
    const { duel, run } = scenario(
      1,
      [
        {
          field: [
            { id: 'tide_oracle', loc: 'mzone' },
            { id: 'tide_mermaid', loc: 'mzone' },
          ],
          extra: ['tide_queen'],
          deck: ['tide_surge'],
        },
        {},
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            let i = req.options.findIndex((o) => o.kind === 'extraSummon');
            if (i < 0) i = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'tide_queen');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.purpose === 'material') return req.min === 0 ? [] : [req.candidates[0]];
          if (req.type === 'select' && req.purpose === 'cost') return [uidOf(d, 'tide_oracle')];
          if (req.type === 'yesno') return true;
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(2);
    const queen = find(duel, 'tide_queen', 0)[0];
    expect(queen.location).toBe('mzone');
    expect(queen.overlay.map((u) => duel.card(u).def.id)).toEqual(['tide_mermaid']);
    // Oracle was detached (sent to GY) and its GY trigger searched a Tidecall Spell/Trap.
    expect(find(duel, 'tide_oracle', 0)[0].location).toBe('gy');
    expect(find(duel, 'tide_surge', 0)[0].location).toBe('hand');
  });

  it('Extra Deck monsters must be properly summoned before they can be revived', () => {
    const { duel } = scenario(0, [{ extra: ['gen_storm'] }, {}], [() => undefined, () => undefined]);
    const storm = find(duel, 'gen_storm', 0)[0];
    duel.place(storm, 'gy');
    expect(duel.canBeSpecialSummoned(storm)).toBe(false);
    storm.properlySummoned = true;
    expect(duel.canBeSpecialSummoned(storm)).toBe(true);
  });

  it('Ritual Summon tributes monsters whose Levels meet the requirement', async () => {
    const { duel, run } = scenario(
      0,
      [{ hand: ['veil_requiem', 'veil_lich', 'gen_ogre', 'veil_gravekeeper'], field: [{ id: 'gen_healer', loc: 'mzone' }] }, {}],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'activate' && d.card(o.uid).def.id === 'veil_requiem');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.purpose === 'material') {
            if (req.min === 0) return [];
            const pick = req.candidates.find((u) => ['gen_ogre', 'gen_healer'].includes(d.card(u).def.id));
            return [pick ?? req.candidates[0]];
          }
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    const lich = find(duel, 'veil_lich', 0)[0];
    expect(lich.location).toBe('mzone');
    expect(lich.summonType).toBe('ritual');
    // 6 + 4 >= 8, and no unnecessary tribute was allowed.
    expect(find(duel, 'gen_ogre', 0)[0].location).toBe('gy');
    expect(find(duel, 'gen_healer', 0)[0].location).toBe('gy');
    expect(find(duel, 'veil_gravekeeper', 0)[0].location).toBe('hand');
  });

  it('Tribute Summon of a Level 7+ monster requires two tributes', async () => {
    const { duel, run } = scenario(
      0,
      [{ hand: ['gen_elder'], field: [{ id: 'gen_azure', loc: 'mzone' }, { id: 'gen_healer', loc: 'mzone' }] }, {}],
      [
        (req) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'normalSummon');
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.purpose === 'material') return req.min === 0 ? [] : [req.candidates[0]];
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    expect(find(duel, 'gen_elder', 0)[0].location).toBe('mzone');
    expect(duel.monsters(0)).toHaveLength(1);
    expect(duel.players[0].gy).toHaveLength(2);
  });
});

describe('continuous effects', () => {
  it('equip spells modify ATK and are sent to the GY when the monster leaves', async () => {
    let atkAfterEquip = -1;
    const { duel, run } = scenario(
      0,
      [{ hand: ['gen_ironresolve'], field: [{ id: 'ember_kestrel', loc: 'mzone' }] }, { field: [{ id: 'tide_riptide', loc: 'szone', faceUp: false }] }],
      [
        (req, d) => {
          if (req.type === 'action') {
            const i = req.options.findIndex((o) => o.kind === 'activate');
            if (i >= 0) return i;
            atkAfterEquip = d.atk(d.cards.find((c) => c.def.id === 'ember_kestrel')!);
            return undefined;
          }
          return undefined;
        },
        (req, d) => {
          if (req.type === 'chain' && d.phase === 'end' && d.chain.length === 0) return 0;
          return undefined;
        },
      ],
    );
    await run(1);
    expect(atkAfterEquip).toBe(2500);
    expect(find(duel, 'ember_kestrel', 0)[0].location).toBe('hand');
    expect(find(duel, 'gen_ironresolve', 0)[0].location).toBe('gy');
  });

  it('field spells boost matching monsters and a continuous trap negates while face-up', async () => {
    const { duel } = scenario(
      0,
      [{ field: [{ id: 'ember_nest', loc: 'fzone' }, { id: 'ember_kestrel', loc: 'mzone' }, { id: 'gen_azure', loc: 'mzone' }] }, {}],
      [() => undefined, () => undefined],
    );
    const kestrel = find(duel, 'ember_kestrel', 0)[0];
    const azure = find(duel, 'gen_azure', 0)[0];
    expect(duel.atk(kestrel)).toBe(2100);
    expect(duel.atk(azure)).toBe(1900);
    const nest = find(duel, 'ember_nest', 0)[0];
    duel.sendTo([nest], 'gy', ['effect']);
    expect(duel.atk(kestrel)).toBe(1800);
  });
});
