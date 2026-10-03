// 메모리 홀 (Memory Hole): DARK Trap-centred theme. Monsters search and Set Traps, the Traps erase what the
// opponent does, and a few effects let Traps be used the turn they are Set or straight from the hand.
import type { CardDef, CardInstance, CostSpec } from '../engine/types';
import type { EffectContext } from '../engine/context';
import {
  discardCost,
  discardSelfCost,
  handProcedure,
  inArch,
  isAttacker,
  monster,
  opponentAttacking,
  searchAndSet,
  selfEvent,
  spell,
  summonedSelf,
  trap,
} from './helpers';

export const MEM = 'memoryhole';

const isTrap = (c: CardInstance): boolean => c.def.category === 'trap';
const isMemTrap = (c: CardInstance): boolean => inArch(c, MEM) && isTrap(c);
const inOwnGy = (ctx: EffectContext, c: CardInstance) => c.location === 'gy' && c.owner === ctx.player;
const gyTraps = (ctx: EffectContext, exceptSelf = true): CardInstance[] =>
  ctx.cards(ctx.player, ['gy'], (c) => isTrap(c) && (!exceptSelf || c.uid !== ctx.uid));
const once = (name: string, n: string) => `「${name}」의 ${n}의 효과는 1턴에 1번밖에 사용할 수 없다.`;

/** Cost: banish `n` Trap cards from your GY. */
const banishGyTraps = (n: number): CostSpec => ({
  check: (ctx) => gyTraps(ctx).length >= n,
  pay: async (ctx) => {
    const chosen = await ctx.select(gyTraps(ctx), { prompt: `제외할 묘지의 함정 카드 ${n}장`, min: n, max: n, purpose: 'cost' });
    ctx.banish(chosen, ['cost']);
  },
});

export const memoryHole: CardDef[] = [
  monster({
    id: 'mem_scribe',
    name: '메모리 홀 필경사',
    attribute: 'DARK',
    race: 'Fiend',
    level: 1,
    atk: 300,
    def: 300,
    archetypes: [MEM],
    text: '①: 이 카드를 패에서 버리고 발동할 수 있다. 덱에서 「메모리 홀」 함정 카드 1장을 묘지로 보낸다. ' + once('메모리 홀 필경사', '①'),
    effects: [
      {
        label: '덱의 「메모리 홀」 함정을 묘지로',
        type: 'ignition',
        range: ['hand'],
        opt: 'hard',
        cost: discardSelfCost,
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], isMemTrap).length > 0,
        resolve: async (ctx) => {
          const [c] = await ctx.select(ctx.cards(ctx.player, ['deck'], isMemTrap), { prompt: '묘지로 보낼 함정 카드', purpose: 'benefit' });
          if (c) ctx.sendToGy([c]);
        },
      },
    ],
  }),
  monster({
    id: 'mem_warden',
    name: '메모리 홀 파수꾼',
    attribute: 'DARK',
    race: 'Fiend',
    level: 3,
    atk: 1000,
    def: 1500,
    archetypes: [MEM],
    text: '①: 이 카드가 소환에 성공했을 경우에 발동할 수 있다. 덱에서 「메모리 홀」 함정 카드 1장을 패에 넣는다. ' + once('메모리 홀 파수꾼', '①'),
    effects: [
      {
        label: '「메모리 홀」 함정 서치',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf(),
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], isMemTrap).length > 0,
        resolve: async (ctx) => {
          await ctx.search(isMemTrap, '패에 넣을 함정 카드');
        },
      },
    ],
  }),
  monster({
    id: 'mem_archivist',
    name: '메모리 홀 기록원',
    attribute: 'DARK',
    race: 'Spellcaster',
    level: 4,
    atk: 1500,
    def: 1700,
    archetypes: [MEM],
    text: '①: 이 카드가 일반 소환에 성공했을 경우에 발동할 수 있다. 덱에서 「메모리 홀」 함정 카드 1장을 자신 마법·함정 존에 세트한다. ' + once('메모리 홀 기록원', '①'),
    effects: [
      {
        label: '덱의 「메모리 홀」 함정 세트',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal', 'tribute'),
        opt: 'hard',
        condition: (ctx) => ctx.duel.freeSZones(ctx.player) > 0 && ctx.cards(ctx.player, ['deck'], isMemTrap).length > 0,
        resolve: async (ctx) => {
          await searchAndSet(ctx, isMemTrap, '세트할 함정 카드');
        },
      },
    ],
  }),
  monster({
    id: 'mem_guard',
    name: '메모리 홀 수호자',
    attribute: 'DARK',
    race: 'Zombie',
    level: 4,
    atk: 800,
    def: 2000,
    archetypes: [MEM],
    text: '①: 자신 필드의 세트된 마법·함정 카드는 효과로는 파괴되지 않는다.',
    effects: [
      {
        label: '세트된 카드 효과 파괴 내성',
        type: 'continuous',
        continuous: {
          affects: (_d, self, t) => t.controller === self.controller && (t.location === 'szone' || t.location === 'fzone') && !t.faceUp,
          flags: ['indestructibleEffect'],
        },
      },
    ],
  }),
  monster({
    id: 'mem_librarian',
    name: '메모리 홀 사서',
    attribute: 'DARK',
    race: 'Spellcaster',
    level: 7,
    atk: 2600,
    def: 2200,
    archetypes: [MEM],
    text:
      '①: 자신 묘지에 함정 카드가 3장 이상 존재할 경우, 이 카드는 패에서 특수 소환할 수 있다. 「메모리 홀 사서」의 ①의 방법에 의한 특수 소환은 1턴에 1번밖에 할 수 없다.\n' +
      '②: 1턴에 1번, 자신 묘지의 함정 카드 1장을 제외하고, 상대 필드의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다. 이 효과는 상대 턴에도 발동할 수 있다.',
    effects: [
      handProcedure('묘지에 함정 3장 이상: 패에서 특수 소환', (ctx) => gyTraps(ctx).length >= 3),
      {
        label: '묘지의 함정 1장 제외: 상대 카드 1장 파괴',
        type: 'quick',
        opt: 'soft',
        cost: banishGyTraps(1),
        target: { prompt: '파괴할 상대 카드', filter: (ctx, c) => ctx.duel.isOnField(c) && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),

  spell({
    id: 'mem_archive',
    name: '메모리 홀 서고',
    kind: 'field',
    archetypes: [MEM],
    text:
      '①: 자신 필드의 「메모리 홀」 몬스터의 공격력은 300 올린다.\n' +
      '②: 패를 1장 버리고 발동할 수 있다. 덱에서 「메모리 홀」 함정 카드 1장을 자신 마법·함정 존에 세트한다. ' + once('메모리 홀 서고', '②'),
    effects: [
      { label: '필드 발동', type: 'activate' },
      {
        label: '「메모리 홀」 몬스터 공격력 +300',
        type: 'continuous',
        continuous: { affects: (_d, self, t) => t.controller === self.controller && inArch(t, MEM), atk: 300 },
      },
      {
        label: '패 1장 버리고 「메모리 홀」 함정 세트',
        type: 'ignition',
        opt: 'hard',
        cost: discardCost(1),
        condition: (ctx) => ctx.duel.freeSZones(ctx.player) > 0 && ctx.cards(ctx.player, ['deck'], isMemTrap).length > 0,
        resolve: async (ctx) => {
          await searchAndSet(ctx, isMemTrap, '세트할 함정 카드');
        },
      },
    ],
  }),
  spell({
    id: 'mem_whisper',
    name: '메모리 홀 속삭임',
    kind: 'normal',
    archetypes: [MEM],
    text: '「메모리 홀 속삭임」은 1턴에 1장밖에 발동할 수 없다.\n①: 덱에서 「메모리 홀」 카드 1장을 묘지로 보낸다.',
    effects: [
      {
        label: '덱의 「메모리 홀」 카드를 묘지로',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, MEM)).length > 0,
        resolve: async (ctx) => {
          const [c] = await ctx.select(ctx.cards(ctx.player, ['deck'], (x) => inArch(x, MEM)), { prompt: '묘지로 보낼 카드', purpose: 'benefit' });
          if (c) ctx.sendToGy([c]);
        },
      },
    ],
  }),

  trap({
    id: 'mem_banish',
    name: '메모리 홀 추방',
    kind: 'normal',
    archetypes: [MEM],
    text: '①: 상대가 몬스터를 특수 소환했을 때, 그 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 제외한다.',
    effects: [
      {
        label: '특수 소환된 몬스터 제외',
        type: 'activate',
        target: {
          prompt: '제외할 몬스터',
          filter: (ctx, c) =>
            c.location === 'mzone' &&
            c.faceUp &&
            c.controller === ctx.opp &&
            !!ctx.duel.windowEvents?.some(
              (e) => e.type === 'summoned' && e.card === c.uid && e.version === c.version && !['normal', 'tribute', 'flip'].includes(e.summonType ?? ''),
            ),
          purpose: 'harm',
        },
        resolve: async (ctx) => {
          if (ctx.target) ctx.banish([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'mem_rewind',
    name: '메모리 홀 되감기',
    kind: 'normal',
    archetypes: [MEM],
    text:
      '①: 상대 몬스터가 공격 선언했을 때, 그 공격 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 주인의 패로 되돌리고, 자신은 1장 드로우한다. ' +
      '자신 필드에 「메모리 홀」 몬스터가 존재할 경우, 이 카드는 세트하지 않고 패에서 발동할 수 있다.',
    effects: [
      {
        label: '공격 몬스터를 패로 + 1장 드로우',
        type: 'activate',
        fromHand: (ctx) => ctx.faceUpMonsters(ctx.player, (c) => inArch(c, MEM)).length > 0,
        condition: (ctx) => opponentAttacking(ctx) && ctx.duel.players[ctx.player].deck.length > 0,
        target: { prompt: '공격 몬스터', filter: (ctx, c) => isAttacker(ctx, c) && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
          ctx.draw(1);
        },
      },
    ],
  }),
  trap({
    id: 'mem_erase',
    name: '메모리 홀 기억 소거',
    kind: 'counter',
    archetypes: [MEM],
    text: '①: 상대가 몬스터의 효과·마법·함정 카드를 발동했을 때, 자신 묘지의 함정 카드 1장을 제외하고 발동할 수 있다. 그 발동을 무효로 하고 제외한다.',
    effects: [
      {
        label: '발동 무효 + 제외',
        type: 'activate',
        cost: banishGyTraps(1),
        condition: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && !r.negated;
        },
        resolve: async (ctx) => {
          const r = ctx.respondingTo;
          if (!r) return;
          ctx.negateLink(r, 'activation');
          const c = ctx.duel.card(r.uid);
          if (c.version === r.version && ctx.duel.isOnField(c)) ctx.banish([c]);
        },
        ai: (ctx) => {
          const r = ctx.respondingTo;
          if (!r) return false;
          const c = ctx.duel.card(r.uid);
          return r.effect.target?.purpose === 'harm' || (c.def.level ?? 0) >= 6 || c.def.category === 'spell';
        },
      },
    ],
  }),
  trap({
    id: 'mem_corridor',
    name: '메모리 홀 회랑',
    kind: 'continuous',
    archetypes: [MEM],
    text:
      '①: 자신 필드의 「메모리 홀」 함정 카드는 세트한 턴에도 발동할 수 있다.\n' +
      '②: 이 카드가 필드에서 묘지로 보내졌을 경우에 발동할 수 있다. 덱에서 「메모리 홀 회랑」 이외의 「메모리 홀」 함정 카드 1장을 자신 마법·함정 존에 세트한다. ' + once('메모리 홀 회랑', '②'),
    effects: [
      { label: '지속 함정 발동', type: 'activate', ai: () => true },
      {
        label: '「메모리 홀」 함정은 세트한 턴에 발동 가능',
        type: 'continuous',
        continuous: {
          affects: (_d, self, t) => t.controller === self.controller && (t.location === 'szone' || t.location === 'fzone') && isMemTrap(t),
          flags: ['trapSetTurn'],
        },
      },
      {
        label: '묘지로 보내졌을 경우: 「메모리 홀」 함정 세트',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && ev.from === 'szone',
        condition: (ctx) => ctx.duel.freeSZones(ctx.player) > 0 && ctx.cards(ctx.player, ['deck'], (c) => isMemTrap(c) && c.def.id !== 'mem_corridor').length > 0,
        resolve: async (ctx) => {
          await searchAndSet(ctx, (c) => isMemTrap(c) && c.def.id !== 'mem_corridor', '세트할 함정 카드');
        },
      },
    ],
  }),
  trap({
    id: 'mem_replay',
    name: '메모리 홀 재현',
    kind: 'normal',
    archetypes: [MEM],
    text:
      '「메모리 홀 재현」은 1턴에 1장밖에 발동할 수 없다.\n' +
      '①: 자신 묘지의 「메모리 홀 재현」 이외의 「메모리 홀」 함정 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 자신 마법·함정 존에 세트한다. 이 효과로 세트한 카드는 이 턴에도 발동할 수 있다.',
    effects: [
      {
        label: '묘지의 「메모리 홀」 함정 세트',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.duel.freeSZones(ctx.player) > 0,
        target: {
          prompt: '세트할 함정 카드',
          filter: (ctx, c) => inOwnGy(ctx, c) && isMemTrap(c) && c.def.id !== 'mem_replay',
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (!t || !(await ctx.setSpellTrap(t))) return;
          ctx.buff(t, { flags: ['trapSetTurn'], until: 'endOfTurn' });
        },
        ai: (ctx) => ctx.duel.freeSZones(ctx.player) > 1,
      },
    ],
  }),
  trap({
    id: 'mem_abyss',
    name: '메모리 홀 심연',
    kind: 'normal',
    archetypes: [MEM],
    text: '「메모리 홀 심연」은 1턴에 1장밖에 발동할 수 없다.\n①: 자신 묘지의 함정 카드 3장을 제외하고 발동할 수 있다. 상대 필드의 몬스터를 전부 제외한다.',
    effects: [
      {
        label: '상대 몬스터 전부 제외',
        type: 'activate',
        opt: 'hard',
        cost: banishGyTraps(3),
        condition: (ctx) => ctx.monsters(ctx.opp).length > 0,
        resolve: async (ctx) => {
          ctx.banish(ctx.monsters(ctx.opp));
        },
        ai: (ctx) => ctx.monsters(ctx.opp).length >= 2 || ctx.monsters(ctx.opp).some((c) => ctx.duel.atk(c) >= 2500),
      },
    ],
  }),
];
