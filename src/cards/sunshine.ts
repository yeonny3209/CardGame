// 선샤인 (Sunshine): LIGHT monsters built around Advance (Tribute) Summons.
// Cheap Sunshine monsters are Tribute fodder that pay off when released, and the big ones trigger when they
// are Advance Summoned. Tribute reductions and extra Normal Summons make the high-level monsters easy to land.
import type { CardDef, CardInstance } from '../engine/types';
import type { EffectContext } from '../engine/context';
import { advanceSummon, canAdvanceSummon, hasReason, inArch, isMonster, monster, selfEvent, spell, summonedSelf, trap } from './helpers';

export const SUN = 'sunshine';

const isSun = (c: CardInstance): boolean => inArch(c, SUN);
const isHighSun = (c: CardInstance): boolean => isSun(c) && isMonster(c) && (c.def.level ?? 0) >= 5;
const inOwnGy = (ctx: EffectContext, c: CardInstance) => c.location === 'gy' && c.owner === ctx.player;
const hasFreeZone = (ctx: EffectContext) => ctx.duel.freeMZones(ctx.player) > 0;
const once = (name: string, n: string) => `「${name}」의 ${n}의 효과는 1턴에 1번밖에 사용할 수 없다.`;

/** Level 5+ Sunshine monsters in their controller's hand need one Tribute fewer. */
const highSunInHand = (_d: unknown, self: CardInstance, t: CardInstance): boolean =>
  t.controller === self.controller && t.location === 'hand' && isHighSun(t);

export const sunshine: CardDef[] = [
  monster({
    id: 'sun_sprite',
    name: '선샤인 햇살 정령',
    attribute: 'LIGHT',
    race: 'Fairy',
    level: 2,
    atk: 700,
    def: 500,
    archetypes: [SUN],
    text: '①: 이 카드가 일반 소환에 성공했을 경우에 발동할 수 있다. 덱에서 레벨 5 이상의 「선샤인」 몬스터 1장을 패에 넣는다. ' + once('선샤인 햇살 정령', '①'),
    effects: [
      {
        label: '레벨 5 이상 「선샤인」 서치',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal', 'tribute'),
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], isHighSun).length > 0,
        resolve: async (ctx) => {
          await ctx.search(isHighSun);
        },
      },
    ],
  }),
  monster({
    id: 'sun_lamb',
    name: '선샤인 어린 양',
    attribute: 'LIGHT',
    race: 'Beast',
    level: 3,
    atk: 1000,
    def: 1200,
    archetypes: [SUN],
    text: '①: 이 카드가 어드밴스 소환의 릴리스로서 묘지로 보내졌을 경우에 발동할 수 있다. 자신은 1장 드로우한다. ' + once('선샤인 어린 양', '①'),
    effects: [
      {
        label: '1장 드로우',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'advance'),
        condition: (ctx) => ctx.duel.players[ctx.player].deck.length > 0,
        resolve: async (ctx) => {
          ctx.draw(1);
        },
      },
    ],
  }),
  monster({
    id: 'sun_herald',
    name: '선샤인 전령',
    attribute: 'LIGHT',
    race: 'Fairy',
    level: 4,
    atk: 1600,
    def: 1000,
    archetypes: [SUN],
    text: '①: 자신의 패의 레벨 5 이상의 「선샤인」 몬스터를 어드밴스 소환하기 위한 릴리스는 1장 적어진다. 이 효과는 중복 적용되지 않는다.',
    effects: [
      {
        label: '릴리스 1장 감소',
        type: 'continuous',
        continuous: { affects: highSunInHand, tributes: () => -1 },
      },
    ],
  }),
  monster({
    id: 'sun_pilgrim',
    name: '선샤인 순례자',
    attribute: 'LIGHT',
    race: 'Warrior',
    level: 4,
    atk: 1700,
    def: 1300,
    archetypes: [SUN],
    text: '①: 이 카드를 「선샤인」 몬스터의 어드밴스 소환을 위해 릴리스하는 경우, 이 카드는 릴리스 2장분으로 취급한다.',
    effects: [
      {
        label: '릴리스 2장분',
        type: 'continuous',
        continuous: { affects: () => false, releaseValue: (_d, _self, summoned) => (isSun(summoned) ? 2 : 1) },
      },
    ],
  }),
  monster({
    id: 'sun_knight',
    name: '선샤인 태양 기사',
    attribute: 'LIGHT',
    race: 'Warrior',
    level: 5,
    atk: 2100,
    def: 1500,
    archetypes: [SUN],
    text: '①: 이 카드가 어드밴스 소환에 성공했을 경우, 자신 묘지의 레벨 4 이하의 「선샤인」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 특수 소환한다. ' + once('선샤인 태양 기사', '①'),
    effects: [
      {
        label: '묘지의 「선샤인」 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('tribute'),
        opt: 'hard',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && isSun(c) && isMonster(c) && (c.def.level ?? 0) <= 4 && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) await ctx.specialSummon(ctx.target);
        },
      },
    ],
  }),
  monster({
    id: 'sun_lion',
    name: '선샤인 사자왕',
    attribute: 'LIGHT',
    race: 'Beast',
    level: 6,
    atk: 2400,
    def: 1800,
    archetypes: [SUN],
    text: '①: 이 카드가 어드밴스 소환에 성공했을 경우, 상대 필드의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다. ' + once('선샤인 사자왕', '①'),
    effects: [
      {
        label: '상대 카드 1장 파괴',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('tribute'),
        opt: 'hard',
        target: { prompt: '파괴할 상대 카드', filter: (ctx, c) => ctx.duel.isOnField(c) && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'sun_bird',
    name: '선샤인 아침새',
    attribute: 'LIGHT',
    race: 'Winged Beast',
    level: 6,
    atk: 2400,
    def: 2000,
    archetypes: [SUN],
    text: '①: 이 카드가 어드밴스 소환에 성공했을 경우에 발동할 수 있다. 자신은 덱에서 2장 드로우한다. 그 후, 패를 1장 버린다. ' + once('선샤인 아침새', '①'),
    effects: [
      {
        label: '2장 드로우 후 1장 버림',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('tribute'),
        opt: 'hard',
        condition: (ctx) => ctx.duel.players[ctx.player].deck.length >= 2,
        resolve: async (ctx) => {
          ctx.draw(2);
          await ctx.discard(1);
        },
      },
    ],
  }),
  monster({
    id: 'sun_dragon',
    name: '선샤인 일륜룡',
    attribute: 'LIGHT',
    race: 'Dragon',
    level: 7,
    atk: 2800,
    def: 2500,
    archetypes: [SUN],
    text:
      '①: 이 카드가 어드밴스 소환에 성공했을 경우에 발동한다. 상대 필드의 마법·함정 카드를 전부 주인의 패로 되돌린다.\n' +
      '②: 이 카드가 릴리스 2장분 이상으로 어드밴스 소환되었다면, 이 카드는 상대의 효과의 대상이 되지 않는다.',
    effects: [
      {
        label: '상대 마법·함정 전부 패로',
        type: 'trigger',
        event: 'summoned',
        optional: false,
        eventFilter: summonedSelf('tribute'),
        resolve: async (ctx) => {
          ctx.toHand(ctx.duel.spellTraps(ctx.opp));
        },
      },
      {
        label: '2장분 이상 소환: 대상 내성',
        type: 'continuous',
        continuous: { affects: (_d, self, t) => self.uid === t.uid && self.summonTributes >= 2, flags: ['untargetable'] },
      },
    ],
  }),

  spell({
    id: 'sun_altar',
    name: '선샤인 제단',
    kind: 'field',
    archetypes: [SUN],
    text:
      '①: 자신 필드의 빛 속성 몬스터의 공격력은 300 올린다.\n' +
      '②: 자신의 패의 레벨 5 이상의 「선샤인」 몬스터를 어드밴스 소환하기 위한 릴리스는 1장 적어진다. 이 효과는 중복 적용되지 않는다.',
    effects: [
      { label: '필드 발동', type: 'activate' },
      {
        label: '빛 속성 공격력 +300',
        type: 'continuous',
        continuous: { affects: (_d, self, t) => t.controller === self.controller && t.def.attribute === 'LIGHT', atk: 300 },
      },
      {
        label: '릴리스 1장 감소',
        type: 'continuous',
        continuous: { affects: highSunInHand, tributes: () => -1 },
      },
    ],
  }),
  spell({
    id: 'sun_coronation',
    name: '선샤인 대관식',
    kind: 'normal',
    archetypes: [SUN],
    text: '「선샤인 대관식」은 1턴에 1장밖에 발동할 수 없다.\n①: 이 턴에, 자신은 일반 소환·세트를 1번 더 할 수 있다.',
    effects: [
      {
        label: '일반 소환 1번 추가',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['hand'], isMonster).length > 0,
        resolve: async (ctx) => {
          ctx.addNormalSummons(1);
        },
        ai: (ctx) => ctx.cards(ctx.player, ['hand'], isMonster).length >= 2 && ctx.duel.players[ctx.player].normalSummons === 0,
      },
    ],
  }),
  spell({
    id: 'sun_ascend',
    name: '선샤인 승천',
    kind: 'normal',
    archetypes: [SUN],
    text:
      '「선샤인 승천」은 1턴에 1장밖에 발동할 수 없다.\n' +
      '①: 자신의 패의 「선샤인」 몬스터 1장을 어드밴스 소환한다. 이 소환을 위한 릴리스는 1장 적어진다. 이 소환은 일반 소환의 횟수에 포함되지 않는다.',
    effects: [
      {
        label: '패의 「선샤인」 어드밴스 소환',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['hand'], (c) => isSun(c) && isMonster(c) && canAdvanceSummon(ctx, c, 1)).length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['hand'], (c) => isSun(c) && isMonster(c) && canAdvanceSummon(ctx, c, 1));
          const [c] = await ctx.select(cands, { prompt: '어드밴스 소환할 몬스터', purpose: 'benefit' });
          if (c) await advanceSummon(ctx, c, { reduce: 1 });
        },
        ai: (ctx) => ctx.cards(ctx.player, ['hand'], (c) => isHighSun(c) && canAdvanceSummon(ctx, c, 1)).length > 0,
      },
    ],
  }),
  trap({
    id: 'sun_shield',
    name: '선샤인 보호막',
    kind: 'normal',
    archetypes: [SUN],
    text: '①: 자신 필드의 「선샤인」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터는 턴 종료시까지 효과로는 파괴되지 않고, 상대의 효과의 대상이 되지 않는다.',
    effects: [
      {
        label: '효과 파괴·대상 내성 부여',
        type: 'activate',
        target: {
          prompt: '보호할 「선샤인」 몬스터',
          filter: (ctx, c) => c.location === 'mzone' && c.faceUp && c.controller === ctx.player && isSun(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (t?.faceUp) ctx.buff(t, { flags: ['indestructibleEffect', 'untargetable'], until: 'endOfTurn' });
        },
        ai: (ctx) => {
          const r = ctx.respondingTo;
          if (!r || r.player !== ctx.opp) return false;
          return r.targets.some((t) => ctx.duel.card(t.uid).controller === ctx.player && isSun(ctx.duel.card(t.uid)));
        },
      },
    ],
  }),
];
