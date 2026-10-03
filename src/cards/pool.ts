// The card database. All cards are original designs.
import type { CardDef, CardInstance } from '../engine/types';
import type { EffectContext } from '../engine/context';
import {
  banishSelfCost,
  detachCost,
  discardCost,
  discardSelfCost,
  equipSpell,
  fusionActivation,
  handProcedure,
  hasReason,
  inArch,
  isAttacker,
  isMonster,
  isSpellTrap,
  monster,
  opponentAttacking,
  payLpCost,
  ritualActivation,
  selfEvent,
  selfFlag,
  spell,
  summonedSelf,
  trap,
} from './helpers';
import { MEM, memoryHole } from './memoryhole';
import { staples } from './staples';
import { SUN, sunshine } from './sunshine';

const EMBER = 'emberwing';
const TIDE = 'tidecall';
const CLOCK = 'clockwork';
const VEIL = 'veilborn';

const onOppField = (ctx: EffectContext, c: CardInstance) => ctx.duel.isOnField(c) && c.controller === ctx.opp;
const faceUpOppMonster = (ctx: EffectContext, c: CardInstance) => c.location === 'mzone' && c.faceUp && c.controller === ctx.opp;
const inOwnGy = (ctx: EffectContext, c: CardInstance) => c.location === 'gy' && c.owner === ctx.player;
const hasFreeZone = (ctx: EffectContext) => ctx.duel.freeMZones(ctx.player) > 0;

// ====================================================================== Emberwing (FIRE)

const emberwing: CardDef[] = [
  monster({
    id: 'ember_scout',
    name: '엠버윙 스카우트',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 3,
    atk: 1200,
    def: 800,
    tuner: true,
    archetypes: [EMBER],
    text: '①: 이 카드가 일반 소환에 성공했을 경우에 발동할 수 있다. 덱에서 「엠버윙 스카우트」 이외의 「엠버윙」 몬스터 1장을 패에 넣는다. 「엠버윙 스카우트」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '「엠버윙」 몬스터 서치',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal', 'tribute'),
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, EMBER) && isMonster(c) && c.def.id !== 'ember_scout').length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => inArch(c, EMBER) && isMonster(c) && c.def.id !== 'ember_scout');
        },
      },
    ],
  }),
  monster({
    id: 'ember_fledgling',
    name: '엠버윙 새끼새',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 3,
    atk: 1000,
    def: 500,
    archetypes: [EMBER],
    text: '①: 자신 필드에 앞면 표시의 「엠버윙」 몬스터가 존재할 경우, 이 카드는 패에서 특수 소환할 수 있다. 「엠버윙 새끼새」의 ①의 방법에 의한 특수 소환은 1턴에 1번밖에 할 수 없다.',
    effects: [handProcedure('패에서 특수 소환', (ctx) => ctx.faceUpMonsters(ctx.player, (c) => inArch(c, EMBER)).length > 0)],
  }),
  monster({
    id: 'ember_kestrel',
    name: '엠버윙 케스트럴',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 4,
    atk: 1800,
    def: 1000,
    archetypes: [EMBER],
    text: '①: 이 카드가 전투로 상대 몬스터를 파괴했을 경우에 발동한다. 상대에게 500 데미지를 준다.',
    effects: [
      {
        label: '500 데미지',
        type: 'trigger',
        event: 'destroyed',
        optional: false,
        eventFilter: (ctx, ev) => hasReason(ev, 'battle') && ev.source === ctx.uid && ev.prevController === ctx.opp,
        resolve: async (ctx) => ctx.damage(ctx.opp, 500),
      },
    ],
  }),
  monster({
    id: 'ember_harrier',
    name: '엠버윙 해리어',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 4,
    atk: 1600,
    def: 1200,
    archetypes: [EMBER],
    text: '①: 이 카드가 싱크로 소재로서 묘지로 보내졌을 경우에 발동할 수 있다. 자신은 1장 드로우한다. 「엠버윙 해리어」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '1장 드로우',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'synchro'),
        resolve: async (ctx) => {
          ctx.draw(1);
        },
      },
    ],
  }),
  monster({
    id: 'ember_cinder',
    name: '엠버윙 신더',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 1,
    atk: 300,
    def: 200,
    tuner: true,
    archetypes: [EMBER],
    text: '①: 자신 묘지에서 이 카드 이외의 화염 속성 몬스터 1장을 제외하고 발동할 수 있다. 이 카드를 묘지에서 특수 소환한다. 「엠버윙 신더」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지에서 자신을 특수 소환',
        type: 'ignition',
        range: ['gy'],
        opt: 'hard',
        condition: hasFreeZone,
        cost: {
          check: (ctx) => ctx.cards(ctx.player, ['gy'], (c) => c.uid !== ctx.uid && c.def.attribute === 'FIRE').length > 0,
          pay: async (ctx) => {
            const cands = ctx.cards(ctx.player, ['gy'], (c) => c.uid !== ctx.uid && c.def.attribute === 'FIRE');
            ctx.banish(await ctx.select(cands, { prompt: '제외할 화염 속성 몬스터', purpose: 'cost' }), ['cost']);
          },
        },
        resolve: async (ctx) => {
          if (ctx.selfStillThere && ctx.self.location === 'gy') await ctx.specialSummon(ctx.self);
        },
      },
    ],
  }),
  monster({
    id: 'ember_matriarch',
    name: '엠버윙 마트리아크',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 7,
    atk: 2500,
    def: 2000,
    archetypes: [EMBER],
    text: '①: 이 카드가 어드밴스 소환에 성공했을 경우, 자신 묘지의 「엠버윙」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 특수 소환한다. 「엠버윙 마트리아크」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지의 「엠버윙」 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('tribute'),
        opt: 'hard',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 「엠버윙」 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && inArch(c, EMBER) && isMonster(c) && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (t) await ctx.specialSummon(t);
        },
      },
    ],
  }),
  monster({
    id: 'ember_blazehawk',
    name: '엠버윙 블레이즈 호크',
    kind: 'synchro',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 6,
    atk: 2400,
    def: 1600,
    archetypes: [EMBER],
    materials: { type: 'synchro', desc: '튜너 + 튜너 이외의 몬스터 1장 이상' },
    text: '튜너 + 튜너 이외의 몬스터 1장 이상\n①: 이 카드가 싱크로 소환에 성공했을 경우, 상대 필드의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다. 「엠버윙 블레이즈 호크」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '상대 카드 1장 파괴',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('synchro'),
        opt: 'hard',
        target: { prompt: '파괴할 상대 카드', filter: onOppField, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'ember_phoenix',
    name: '엠버윙 소버린 피닉스',
    kind: 'synchro',
    attribute: 'FIRE',
    race: 'Winged Beast',
    level: 8,
    atk: 2800,
    def: 2200,
    archetypes: [EMBER],
    materials: {
      type: 'synchro',
      desc: '튜너 + 튜너 이외의 화염 속성 몬스터 1장 이상',
      nonTuner: (_d, c) => c.def.attribute === 'FIRE',
    },
    text: '튜너 + 튜너 이외의 화염 속성 몬스터 1장 이상\n①: 1턴에 1번, 상대 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 공격력은 턴 종료시까지 0이 된다. 이 효과는 상대 턴 및 데미지 스텝에도 발동할 수 있다.\n②: 이 카드가 파괴되어 묘지로 보내졌을 경우에 발동할 수 있다. 자신 묘지에서 레벨 4 이하의 「엠버윙」 몬스터 1장을 특수 소환한다. 「엠버윙 소버린 피닉스」의 ②의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '상대 몬스터 공격력 0',
        type: 'quick',
        opt: 'soft',
        damageStep: true,
        target: { prompt: '공격력을 0으로 할 몬스터', filter: faceUpOppMonster, purpose: 'harm' },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (t && t.faceUp) ctx.buff(t, { setAtk: 0, until: 'endOfTurn' });
        },
      },
      {
        label: '묘지에서 「엠버윙」 특수 소환',
        type: 'trigger',
        event: 'destroyed',
        range: ['gy'],
        opt: 'hard',
        eventFilter: selfEvent,
        condition: (ctx) =>
          hasFreeZone(ctx) &&
          ctx.cards(ctx.player, ['gy'], (c) => inArch(c, EMBER) && isMonster(c) && (c.def.level ?? 0) <= 4 && c.uid !== ctx.uid).length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['gy'], (c) => inArch(c, EMBER) && isMonster(c) && (c.def.level ?? 0) <= 4);
          const [c] = await ctx.select(cands, { prompt: '특수 소환할 몬스터', purpose: 'benefit' });
          if (c) await ctx.specialSummon(c);
        },
      },
    ],
  }),
  monster({
    id: 'ember_ashdrake',
    name: '엠버윙 애쉬 드레이크',
    kind: 'synchro',
    attribute: 'FIRE',
    race: 'Dragon',
    level: 5,
    atk: 2200,
    def: 1400,
    archetypes: [EMBER],
    materials: { type: 'synchro', desc: '튜너 + 튜너 이외의 몬스터 1장 이상' },
    text: '튜너 + 튜너 이외의 몬스터 1장 이상\n①: 이 카드의 공격력이 수비 표시 몬스터의 수비력을 넘은 경우, 그 수치만큼 상대에게 전투 데미지를 준다.',
    effects: [selfFlag('관통', 'piercing')],
  }),
  spell({
    id: 'ember_nest',
    name: '엠버윙의 둥지',
    kind: 'field',
    archetypes: [EMBER],
    text: '①: 자신 필드의 화염 속성 몬스터의 공격력은 300 올린다.\n②: 패를 1장 버리고 발동할 수 있다. 덱에서 「엠버윙」 몬스터 1장을 패에 넣는다. 「엠버윙의 둥지」의 ②의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      { label: '필드 발동', type: 'activate' },
      {
        label: '화염 속성 공격력 +300',
        type: 'continuous',
        continuous: {
          affects: (_d, self, t) => t.controller === self.controller && t.def.attribute === 'FIRE',
          atk: 300,
        },
      },
      {
        label: '패 1장 버리고 「엠버윙」 서치',
        type: 'ignition',
        opt: 'hard',
        cost: discardCost(1),
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, EMBER) && isMonster(c)).length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => inArch(c, EMBER) && isMonster(c));
        },
      },
    ],
  }),
  spell({
    id: 'ember_rally',
    name: '엠버윙 랠리',
    kind: 'quickplay',
    archetypes: [EMBER],
    text: '①: 자신 필드의 앞면 표시 「엠버윙」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 공격력은 턴 종료시까지 800 올린다. 이 효과는 데미지 스텝에도 발동할 수 있다.',
    effects: [
      {
        label: '공격력 +800',
        type: 'activate',
        damageStep: true,
        target: {
          prompt: '공격력을 올릴 몬스터',
          filter: (ctx, c) => c.location === 'mzone' && c.faceUp && c.controller === ctx.player && inArch(c, EMBER),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target?.faceUp) ctx.buff(ctx.target, { atk: 800, until: 'endOfTurn' });
        },
        ai: (ctx) => {
          const d = ctx.duel;
          if (!d.battle || d.damageStep === null || d.damageStep === 'afterCalc' || d.damageStep === 'end') return false;
          const mine = [d.card(d.battle.attacker), d.battle.target !== null ? d.card(d.battle.target) : null].find(
            (c) => c && c.controller === ctx.player && inArch(c, EMBER),
          );
          const foe = [d.card(d.battle.attacker), d.battle.target !== null ? d.card(d.battle.target) : null].find(
            (c) => c && c.controller === ctx.opp,
          );
          if (!mine || !foe) return false;
          const foeStat = foe.position === 'atk' ? d.atk(foe) : d.defense(foe);
          return d.atk(mine) <= foeStat && d.atk(mine) + 800 > foeStat;
        },
      },
    ],
  }),
  spell({
    id: 'ember_call',
    name: '엠버윙의 부름',
    kind: 'normal',
    archetypes: [EMBER],
    text: '「엠버윙의 부름」은 1턴에 1장밖에 발동할 수 없다.\n①: 덱에서 「엠버윙」 몬스터 1장을 패에 넣는다.',
    effects: [
      {
        label: '「엠버윙」 서치',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, EMBER) && isMonster(c)).length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => inArch(c, EMBER) && isMonster(c));
        },
      },
    ],
  }),
  trap({
    id: 'ember_ignition',
    name: '엠버윙 이그니션',
    kind: 'normal',
    archetypes: [EMBER],
    text: '①: 자신 필드에 화염 속성 몬스터가 존재하고, 상대 몬스터가 공격 선언했을 때, 그 공격 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 파괴하고, 상대에게 500 데미지를 준다.',
    effects: [
      {
        label: '공격 몬스터 파괴 + 500 데미지',
        type: 'activate',
        condition: (ctx) => opponentAttacking(ctx) && ctx.faceUpMonsters(ctx.player, (c) => c.def.attribute === 'FIRE').length > 0,
        target: { prompt: '공격 몬스터', filter: (ctx, c) => isAttacker(ctx, c) && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
          ctx.damage(ctx.opp, 500);
        },
      },
    ],
  }),
];

// ====================================================================== Tidecall (WATER)

const lv4Water = (c: CardInstance) => isMonster(c) && c.def.attribute === 'WATER' && c.def.level === 4;

const tidecall: CardDef[] = [
  monster({
    id: 'tide_mermaid',
    name: '타이드콜 머메이드',
    attribute: 'WATER',
    race: 'Aqua',
    level: 4,
    atk: 1500,
    def: 1100,
    archetypes: [TIDE],
    text: '①: 이 카드가 소환에 성공했을 경우에 발동할 수 있다. 패에서 레벨 4의 물 속성 몬스터 1장을 특수 소환한다. 「타이드콜 머메이드」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '패에서 레벨 4 물 속성 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf(),
        opt: 'hard',
        condition: (ctx) => hasFreeZone(ctx) && ctx.cards(ctx.player, ['hand'], lv4Water).length > 0,
        resolve: async (ctx) => {
          const [c] = await ctx.select(ctx.cards(ctx.player, ['hand'], lv4Water), { prompt: '특수 소환할 몬스터', purpose: 'benefit' });
          if (c) await ctx.specialSummon(c);
        },
      },
    ],
  }),
  monster({
    id: 'tide_coralknight',
    name: '타이드콜 코랄 나이트',
    attribute: 'WATER',
    race: 'Aqua',
    level: 4,
    atk: 1700,
    def: 1300,
    archetypes: [TIDE],
    text: '①: 1턴에 1번, 상대 필드의 마법·함정 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 주인의 패로 되돌린다.',
    effects: [
      {
        label: '상대 마법·함정 1장을 패로',
        type: 'ignition',
        opt: 'soft',
        target: { prompt: '패로 되돌릴 카드', filter: (ctx, c) => onOppField(ctx, c) && isSpellTrap(c), purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'tide_oracle',
    name: '타이드콜 펄 오라클',
    attribute: 'WATER',
    race: 'Aqua',
    level: 4,
    atk: 1200,
    def: 1800,
    archetypes: [TIDE],
    text: '①: 이 카드가 묘지로 보내졌을 경우에 발동할 수 있다. 덱에서 「타이드콜」 마법·함정 카드 1장을 패에 넣는다. 「타이드콜 펄 오라클」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '「타이드콜」 마법·함정 서치',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: selfEvent,
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, TIDE) && isSpellTrap(c)).length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => inArch(c, TIDE) && isSpellTrap(c));
        },
      },
    ],
  }),
  monster({
    id: 'tide_diver',
    name: '타이드콜 다이버',
    attribute: 'WATER',
    race: 'Sea Serpent',
    level: 4,
    atk: 1400,
    def: 1000,
    archetypes: [TIDE],
    text: '①: 자신 필드에 앞면 표시의 레벨 4 물 속성 몬스터가 존재할 경우, 이 카드는 패에서 특수 소환할 수 있다. 「타이드콜 다이버」의 ①의 방법에 의한 특수 소환은 1턴에 1번밖에 할 수 없다.',
    effects: [handProcedure('패에서 특수 소환', (ctx) => ctx.faceUpMonsters(ctx.player, lv4Water).length > 0)],
  }),
  monster({
    id: 'tide_leviathan',
    name: '타이드콜 리바이어선',
    kind: 'xyz',
    attribute: 'WATER',
    race: 'Sea Serpent',
    level: 4,
    atk: 2500,
    def: 2000,
    archetypes: [TIDE],
    materials: { type: 'xyz', count: 2, desc: '레벨 4 몬스터 × 2' },
    text: '레벨 4 몬스터 × 2\n①: 1턴에 1번, 이 카드의 엑시즈 소재를 1개 제거하고, 상대 필드의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 주인의 패로 되돌린다. 이 효과는 상대 턴에도 발동할 수 있다.',
    effects: [
      {
        label: '소재 1개 제거: 상대 카드 1장을 패로',
        type: 'quick',
        opt: 'soft',
        cost: detachCost(1),
        target: { prompt: '패로 되돌릴 카드', filter: onOppField, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'tide_queen',
    name: '타이드콜 어비스 퀸',
    kind: 'xyz',
    attribute: 'WATER',
    race: 'Aqua',
    level: 4,
    atk: 2200,
    def: 2400,
    archetypes: [TIDE],
    materials: { type: 'xyz', count: 2, desc: '레벨 4 물 속성 몬스터 × 2', filter: (_d, c) => c.def.attribute === 'WATER' },
    text: '레벨 4 물 속성 몬스터 × 2\n①: 상대 필드의 몬스터의 공격력은 300 내린다.\n②: 1턴에 1번, 이 카드의 엑시즈 소재를 1개 제거하고 발동할 수 있다. 자신은 1장 드로우한다.',
    effects: [
      {
        label: '상대 몬스터 공격력 -300',
        type: 'continuous',
        continuous: { affects: (_d, self, t) => t.controller !== self.controller, atk: -300 },
      },
      {
        label: '소재 1개 제거: 1장 드로우',
        type: 'ignition',
        opt: 'soft',
        cost: detachCost(1),
        resolve: async (ctx) => {
          ctx.draw(1);
        },
      },
    ],
  }),
  spell({
    id: 'tide_surge',
    name: '타이드콜 서지',
    kind: 'normal',
    archetypes: [TIDE],
    text: '「타이드콜 서지」는 1턴에 1장밖에 발동할 수 없다.\n①: 덱에서 「타이드콜」 몬스터 1장을 패에 넣는다.',
    effects: [
      {
        label: '「타이드콜」 서치',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, TIDE) && isMonster(c)).length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => inArch(c, TIDE) && isMonster(c));
        },
      },
    ],
  }),
  spell({
    id: 'tide_sanctum',
    name: '타이드콜 성역',
    kind: 'continuous',
    archetypes: [TIDE],
    text: '①: 자신 필드에 「타이드콜」 몬스터가 특수 소환되었을 경우에 발동할 수 있다. 자신은 1장 드로우한다. 「타이드콜 성역」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      { label: '지속 마법 발동', type: 'activate' },
      {
        label: '1장 드로우',
        type: 'trigger',
        event: 'summoned',
        opt: 'hard',
        eventFilter: (ctx, ev) => {
          const c = ctx.duel.card(ev.card!);
          return ev.summonType !== 'normal' && ev.summonType !== 'tribute' && ev.summonType !== 'flip' && ev.player === ctx.player && inArch(c, TIDE);
        },
        resolve: async (ctx) => {
          ctx.draw(1);
        },
      },
    ],
  }),
  trap({
    id: 'tide_riptide',
    name: '타이드콜 립타이드',
    kind: 'normal',
    archetypes: [TIDE],
    text: '①: 상대 필드의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 주인의 패로 되돌린다.',
    effects: [
      {
        label: '상대 몬스터 1장을 패로',
        type: 'activate',
        target: { prompt: '패로 되돌릴 몬스터', filter: (ctx, c) => c.location === 'mzone' && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'tide_whirlpool',
    name: '타이드콜 월풀',
    kind: 'counter',
    archetypes: [TIDE],
    text: '①: 상대가 마법 카드를 발동했을 때, 1000 LP를 지불하고 발동할 수 있다. 그 발동을 무효로 하고 파괴한다.',
    effects: [
      {
        label: '마법 발동 무효 + 파괴',
        type: 'activate',
        cost: payLpCost(1000),
        condition: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && r.isCardActivation && ctx.duel.card(r.uid).def.category === 'spell' && !r.negated;
        },
        resolve: async (ctx) => {
          const r = ctx.respondingTo;
          if (!r) return;
          ctx.negateLink(r, 'activation');
          const c = ctx.duel.card(r.uid);
          if (c.version === r.version && ctx.duel.isOnField(c)) ctx.destroy([c]);
        },
      },
    ],
  }),
];

// ====================================================================== Clockwork (EARTH Machine)

const clockwork: CardDef[] = [
  monster({
    id: 'clock_tinker',
    name: '클락워크 팅커',
    attribute: 'EARTH',
    race: 'Machine',
    level: 3,
    atk: 1000,
    def: 1400,
    archetypes: [CLOCK],
    text: '①: 이 카드가 일반 소환에 성공했을 경우에 발동할 수 있다. 덱에서 「클락워크 퓨전」 1장을 패에 넣는다. 그 후, 패를 1장 버린다. 「클락워크 팅커」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '「클락워크 퓨전」 서치 후 1장 버림',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal'),
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => c.def.id === 'clock_fusion').length > 0,
        resolve: async (ctx) => {
          // Card-neutral: the Fusion Spell comes at the price of a card from the hand.
          if (await ctx.search((c) => c.def.id === 'clock_fusion')) await ctx.discard(1);
        },
      },
    ],
  }),
  monster({
    id: 'clock_gearhound',
    name: '클락워크 기어하운드',
    attribute: 'EARTH',
    race: 'Machine',
    level: 4,
    atk: 1700,
    def: 800,
    archetypes: [CLOCK],
    text: '①: 이 카드가 융합 소재로서 묘지로 보내졌을 경우에 발동할 수 있다. 자신 묘지의 「클락워크 기어하운드」 이외의 「클락워크」 몬스터 1장을 패에 넣는다. 「클락워크 기어하운드」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지의 「클락워크」 회수',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'fusion'),
        condition: (ctx) => ctx.cards(ctx.player, ['gy'], (c) => inArch(c, CLOCK) && isMonster(c) && c.def.id !== 'clock_gearhound').length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['gy'], (c) => inArch(c, CLOCK) && isMonster(c) && c.def.id !== 'clock_gearhound');
          ctx.toHand(await ctx.select(cands, { prompt: '패에 넣을 몬스터', purpose: 'benefit' }));
        },
      },
    ],
  }),
  monster({
    id: 'clock_springknight',
    name: '클락워크 스프링 나이트',
    attribute: 'EARTH',
    race: 'Machine',
    level: 4,
    atk: 800,
    def: 2000,
    archetypes: [CLOCK],
    text: '①: 이 카드는 전투로는 파괴되지 않는다.',
    effects: [selfFlag('전투 파괴 내성', 'indestructibleBattle')],
  }),
  monster({
    id: 'clock_sentry',
    name: '클락워크 센트리',
    attribute: 'EARTH',
    race: 'Machine',
    level: 4,
    atk: 1800,
    def: 1200,
    archetypes: [CLOCK],
    text: '태엽 도시의 성문을 지키는 기계 병사. 녹슬지 않는 강철 몸은 불침번에 최적이다.',
  }),
  monster({
    id: 'clock_engine',
    name: '클락워크 그랜드 엔진',
    attribute: 'EARTH',
    race: 'Machine',
    level: 8,
    atk: 2800,
    def: 2000,
    archetypes: [CLOCK],
    text: '①: 이 카드가 어드밴스 소환에 성공했을 경우에 발동한다. 상대 필드의 마법·함정 카드를 전부 파괴한다.',
    effects: [
      {
        label: '상대 마법·함정 전부 파괴',
        type: 'trigger',
        event: 'summoned',
        optional: false,
        eventFilter: summonedSelf('tribute'),
        resolve: async (ctx) => {
          ctx.destroy(ctx.duel.spellTraps(ctx.opp));
        },
      },
    ],
  }),
  monster({
    id: 'clock_titan',
    name: '클락워크 타이탄',
    kind: 'fusion',
    attribute: 'EARTH',
    race: 'Machine',
    level: 8,
    atk: 2800,
    def: 2400,
    archetypes: [CLOCK],
    materials: {
      type: 'fusion',
      materials: [
        { desc: '「클락워크 기어하운드」', filter: (_d, c) => c.def.id === 'clock_gearhound' },
        { desc: '「클락워크」 몬스터', filter: (_d, c) => inArch(c, CLOCK) },
      ],
    },
    text: '「클락워크 기어하운드」 + 「클락워크」 몬스터\n①: 이 카드의 공격력이 수비 표시 몬스터의 수비력을 넘은 경우, 그 수치만큼 상대에게 전투 데미지를 준다.\n②: 이 카드가 융합 소환에 성공했을 경우, 상대 필드의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다. 「클락워크 타이탄」의 ②의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      selfFlag('관통', 'piercing'),
      {
        label: '상대 카드 1장 파괴',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('fusion'),
        opt: 'hard',
        target: { prompt: '파괴할 카드', filter: onOppField, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'clock_chimera',
    name: '클락워크 키메라',
    kind: 'fusion',
    attribute: 'EARTH',
    race: 'Machine',
    level: 6,
    atk: 2300,
    def: 1800,
    archetypes: [CLOCK],
    materials: {
      type: 'fusion',
      materials: [
        { desc: '「클락워크」 몬스터', filter: (_d, c) => inArch(c, CLOCK) },
        { desc: '기계족 몬스터', filter: (_d, c) => c.def.race === 'Machine' },
      ],
    },
    text:
      '「클락워크」 몬스터 + 기계족 몬스터\n①: 이 카드는 상대의 효과의 대상이 되지 않는다.\n' +
      '②: 이 카드의 공격력은 자신 묘지의 기계족 몬스터의 수 × 200 올린다. 이 효과로 올라가는 수치는 최대 800까지이다.',
    effects: [
      selfFlag('대상 내성', 'untargetable'),
      {
        label: '묘지의 기계족 × 200 (최대 800)',
        type: 'continuous',
        continuous: {
          affects: (_d, self, t) => self.uid === t.uid,
          atk: (d, self) => Math.min(800, d.cardsIn(self.controller, ['gy'], (c) => c.def.race === 'Machine').length * 200),
        },
      },
    ],
  }),
  spell({
    id: 'clock_fusion',
    name: '클락워크 퓨전',
    kind: 'normal',
    archetypes: [CLOCK],
    text: '「클락워크 퓨전」은 1턴에 1장밖에 발동할 수 없다.\n①: 자신의 패·필드에서 융합 소재 몬스터를 묘지로 보내고, 「클락워크」 융합 몬스터 1장을 엑스트라 덱에서 융합 소환한다.',
    effects: [{ ...fusionActivation('「클락워크」 융합 소환', (c) => inArch(c, CLOCK)), opt: 'hard' }],
  }),
  spell({
    id: 'clock_rewind',
    name: '클락워크 리와인드',
    kind: 'normal',
    archetypes: [CLOCK],
    text: '「클락워크 리와인드」는 1턴에 1장밖에 발동할 수 없다.\n①: 자신 묘지의 「클락워크」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 패에 넣는다.',
    effects: [
      {
        label: '묘지의 「클락워크」 회수',
        type: 'activate',
        opt: 'hard',
        target: {
          prompt: '패에 넣을 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && inArch(c, CLOCK) && isMonster(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'clock_overload',
    name: '클락워크 오버로드',
    kind: 'continuous',
    archetypes: [CLOCK],
    text: '①: 자신 필드의 기계족 몬스터의 공격력은 500 올린다.',
    effects: [
      { label: '지속 함정 발동', type: 'activate', ai: (ctx) => ctx.faceUpMonsters(ctx.player, (c) => c.def.race === 'Machine').length > 0 },
      {
        label: '기계족 공격력 +500',
        type: 'continuous',
        continuous: { affects: (_d, self, t) => t.controller === self.controller && t.def.race === 'Machine', atk: 500 },
      },
    ],
  }),
];

// ====================================================================== Veilborn (DARK)

const veilborn: CardDef[] = [
  monster({
    id: 'veil_wisp',
    name: '베일본 위습',
    attribute: 'DARK',
    race: 'Zombie',
    level: 2,
    atk: 500,
    def: 500,
    tuner: true,
    archetypes: [VEIL],
    text: '①: 이 카드가 묘지로 보내졌을 때에 발동할 수 있다. 덱에서 「베일본 위습」 이외의 「베일본」 카드 1장을 묘지로 보낸다. 「베일본 위습」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '덱에서 「베일본」을 묘지로',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        when: true,
        eventFilter: selfEvent,
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => inArch(c, VEIL) && c.def.id !== 'veil_wisp').length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['deck'], (c) => inArch(c, VEIL) && c.def.id !== 'veil_wisp');
          ctx.sendToGy(await ctx.select(cands, { prompt: '묘지로 보낼 카드', purpose: 'benefit' }));
        },
      },
    ],
  }),
  monster({
    id: 'veil_gravekeeper',
    name: '베일본 그레이브키퍼',
    attribute: 'DARK',
    race: 'Zombie',
    level: 4,
    atk: 1600,
    def: 1400,
    archetypes: [VEIL],
    text: '①: 이 카드가 일반 소환에 성공했을 경우, 자신 묘지의 레벨 4 이하의 「베일본」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 수비 표시로 특수 소환한다. 「베일본 그레이브키퍼」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지의 「베일본」 수비 표시 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal'),
        opt: 'hard',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && inArch(c, VEIL) && isMonster(c) && (c.def.level ?? 0) <= 4,
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) await ctx.specialSummon(ctx.target, { position: 'def' });
        },
      },
    ],
  }),
  monster({
    id: 'veil_revenant',
    name: '베일본 레버넌트',
    attribute: 'DARK',
    race: 'Zombie',
    level: 4,
    atk: 1900,
    def: 0,
    archetypes: [VEIL],
    text: '①: 이 카드가 전투로 파괴되어 묘지로 보내졌을 경우에 발동할 수 있다. 덱에서 「베일본 레버넌트」 이외의 레벨 4 이하의 「베일본」 몬스터 1장을 특수 소환한다. 「베일본 레버넌트」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '덱에서 「베일본」 특수 소환',
        type: 'trigger',
        event: 'destroyed',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'battle'),
        condition: (ctx) =>
          hasFreeZone(ctx) &&
          ctx.cards(ctx.player, ['deck'], (c) => inArch(c, VEIL) && isMonster(c) && (c.def.level ?? 0) <= 4 && c.def.id !== 'veil_revenant').length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['deck'], (c) => inArch(c, VEIL) && isMonster(c) && (c.def.level ?? 0) <= 4 && c.def.id !== 'veil_revenant');
          const [c] = await ctx.select(cands, { prompt: '특수 소환할 몬스터', purpose: 'benefit' });
          if (c) await ctx.specialSummon(c);
          ctx.duel.shuffle(ctx.duel.players[ctx.player].deck);
        },
      },
    ],
  }),
  monster({
    id: 'veil_shade',
    name: '베일본 셰이드',
    attribute: 'DARK',
    race: 'Fiend',
    level: 3,
    atk: 1300,
    def: 300,
    archetypes: [VEIL],
    text: '①: 묘지의 이 카드를 제외하고, 상대 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 공격력은 턴 종료시까지 1000 내린다. 이 효과는 상대 턴 및 데미지 스텝에도 발동할 수 있다. 「베일본 셰이드」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지에서 제외: 공격력 -1000',
        type: 'quick',
        range: ['gy'],
        opt: 'hard',
        damageStep: true,
        cost: banishSelfCost,
        target: { prompt: '공격력을 내릴 몬스터', filter: faceUpOppMonster, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target?.faceUp) ctx.buff(ctx.target, { atk: -1000, until: 'endOfTurn' });
        },
        ai: (ctx) => ctx.duel.damageStep === 'beforeCalc' || ctx.duel.damageStep === 'start',
      },
    ],
  }),
  monster({
    id: 'veil_lich',
    name: '베일본 리치 퀸',
    kind: 'ritual',
    attribute: 'DARK',
    race: 'Zombie',
    level: 8,
    atk: 3000,
    def: 2500,
    archetypes: [VEIL],
    materials: { type: 'ritual' },
    text: '「베일본 레퀴엠」에 의해 의식 소환할 수 있다.\n①: 1턴에 1번, 자신 묘지의 카드 1장을 제외하고, 필드의 이 카드 이외의 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다. 이 효과는 상대 턴에도 발동할 수 있다.',
    effects: [
      {
        label: '묘지 1장 제외: 필드의 카드 1장 파괴',
        type: 'quick',
        opt: 'soft',
        cost: {
          check: (ctx) => ctx.cards(ctx.player, ['gy']).length > 0,
          pay: async (ctx) => {
            ctx.banish(await ctx.select(ctx.cards(ctx.player, ['gy']), { prompt: '제외할 카드', purpose: 'cost' }), ['cost']);
          },
        },
        target: { prompt: '파괴할 카드', filter: (ctx, c) => ctx.duel.isOnField(c) && c.uid !== ctx.uid, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  spell({
    id: 'veil_requiem',
    name: '베일본 레퀴엠',
    kind: 'ritual',
    archetypes: [VEIL],
    text: '「베일본 리치 퀸」의 의식 소환에 필요.\n①: 자신의 패·필드의 몬스터를 릴리스하거나, 자신 묘지의 「베일본」 몬스터를 제외하고, 레벨의 합계가 8 이상이 되도록 하여, 패에서 「베일본 리치 퀸」을 의식 소환한다.',
    effects: [ritualActivation('「베일본 리치 퀸」 의식 소환', 'veil_lich', (c) => inArch(c, VEIL))],
  }),
  spell({
    id: 'veil_rebirth',
    name: '베일본의 귀환',
    kind: 'normal',
    archetypes: [VEIL],
    text: '「베일본의 귀환」은 1턴에 1장밖에 발동할 수 없다.\n①: 자신 묘지의 「베일본」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 특수 소환한다.',
    effects: [
      {
        label: '묘지의 「베일본」 특수 소환',
        type: 'activate',
        opt: 'hard',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && inArch(c, VEIL) && isMonster(c) && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) await ctx.specialSummon(ctx.target);
        },
      },
    ],
  }),
  trap({
    id: 'veil_curse',
    name: '베일본의 저주',
    kind: 'continuous',
    archetypes: [VEIL],
    text: '①: 상대 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 이 카드가 필드에 앞면 표시로 존재하는 한, 그 몬스터는 공격할 수 없고 효과는 무효화된다.',
    effects: [
      {
        label: '대상 몬스터 공격 불가 + 효과 무효',
        type: 'activate',
        target: { prompt: '대상 몬스터', filter: faceUpOppMonster, purpose: 'harm' },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (t && t.faceUp && ctx.selfStillThere) ctx.buff(t, { flags: ['negated', 'cannotAttack'] }, true);
        },
      },
    ],
  }),
  monster({
    id: 'veil_dreadknight',
    name: '베일본 드레드 나이트',
    kind: 'synchro',
    attribute: 'DARK',
    race: 'Zombie',
    level: 6,
    atk: 2300,
    def: 1500,
    archetypes: [VEIL],
    materials: { type: 'synchro', desc: '튜너 + 튜너 이외의 몬스터 1장 이상' },
    text: '튜너 + 튜너 이외의 몬스터 1장 이상\n①: 이 카드가 싱크로 소환에 성공했을 경우, 자신 묘지의 「베일본」 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 특수 소환한다. 「베일본 드레드 나이트」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '묘지의 「베일본」 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('synchro'),
        opt: 'hard',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => inOwnGy(ctx, c) && inArch(c, VEIL) && isMonster(c) && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) await ctx.specialSummon(ctx.target);
        },
      },
    ],
  }),
  monster({
    id: 'veil_wraith',
    name: '베일본 레이스 로드',
    kind: 'xyz',
    attribute: 'DARK',
    race: 'Fiend',
    level: 4,
    atk: 2400,
    def: 1600,
    archetypes: [VEIL],
    materials: { type: 'xyz', count: 2, desc: '레벨 4 몬스터 × 2' },
    text: '레벨 4 몬스터 × 2\n①: 1턴에 1번, 이 카드의 엑시즈 소재를 1개 제거하고, 상대 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 효과를 턴 종료시까지 무효로 하고, 공격력을 500 내린다. 이 효과는 상대 턴에도 발동할 수 있다.',
    effects: [
      {
        label: '소재 1개 제거: 효과 무효 + 공격력 -500',
        type: 'quick',
        opt: 'soft',
        cost: detachCost(1),
        target: { prompt: '대상 몬스터', filter: faceUpOppMonster, purpose: 'harm' },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (t?.faceUp) ctx.buff(t, { atk: -500, flags: ['negated'], until: 'endOfTurn' });
        },
      },
    ],
  }),
];

// ====================================================================== Generic

const generic: CardDef[] = [
  spell({
    id: 'gen_insight',
    name: '비전의 통찰',
    kind: 'normal',
    text: '①: 자신은 덱에서 2장 드로우한다.',
    effects: [
      {
        label: '2장 드로우',
        type: 'activate',
        condition: (ctx) => ctx.duel.players[ctx.player].deck.length >= 2,
        resolve: async (ctx) => {
          ctx.draw(2);
        },
      },
    ],
  }),
  spell({
    id: 'gen_exchange',
    name: '운명의 교환',
    kind: 'normal',
    text: '①: 자신은 덱에서 2장 드로우한다. 그 후, 패를 1장 버린다.',
    effects: [
      {
        label: '2장 드로우 후 1장 버림',
        type: 'activate',
        condition: (ctx) => ctx.duel.players[ctx.player].deck.length >= 2,
        resolve: async (ctx) => {
          ctx.draw(2);
          await ctx.discard(1);
        },
      },
    ],
  }),
  spell({
    id: 'gen_starfall',
    name: '스타폴 스트라이크',
    kind: 'normal',
    text: '①: 상대 필드의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 파괴한다.',
    effects: [
      {
        label: '상대 몬스터 1장 파괴',
        type: 'activate',
        target: { prompt: '파괴할 몬스터', filter: (ctx, c) => c.location === 'mzone' && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  spell({
    id: 'gen_cataclysm',
    name: '대격변',
    kind: 'normal',
    text: '①: 필드의 몬스터를 전부 파괴한다.',
    effects: [
      {
        label: '필드의 몬스터 전부 파괴',
        type: 'activate',
        condition: (ctx) => ctx.duel.monsters(0).length + ctx.duel.monsters(1).length > 0,
        resolve: async (ctx) => {
          ctx.destroy([...ctx.duel.monsters(0), ...ctx.duel.monsters(1)]);
        },
        ai: (ctx) => {
          const val = (p: 0 | 1) => ctx.duel.monsters(p).reduce((s, c) => s + ctx.duel.atk(c) + 500, 0);
          return val(ctx.opp) > val(ctx.player) + 1500;
        },
      },
    ],
  }),
  spell({
    id: 'gen_whirlwind',
    name: '선풍의 칼날',
    kind: 'quickplay',
    text: '①: 필드의 이 카드 이외의 마법·함정 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다.',
    effects: [
      {
        label: '마법·함정 1장 파괴',
        type: 'activate',
        target: {
          prompt: '파괴할 마법·함정 카드',
          filter: (ctx, c) => (c.location === 'szone' || c.location === 'fzone') && c.uid !== ctx.uid,
          purpose: 'harm',
        },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
        ai: (ctx) => ctx.duel.spellTraps(ctx.opp).length > 0,
      },
    ],
  }),
  spell({
    id: 'gen_seconddawn',
    name: '두 번째 새벽',
    kind: 'normal',
    text: '①: 자신 또는 상대의 묘지의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 자신 필드에 특수 소환한다.',
    effects: [
      {
        label: '묘지의 몬스터 특수 소환',
        type: 'activate',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => c.location === 'gy' && isMonster(c) && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          if (ctx.target) await ctx.specialSummon(ctx.target);
        },
      },
    ],
  }),
  spell({
    id: 'gen_ironresolve',
    name: '강철의 결의',
    kind: 'equip',
    text: '①: 자신 필드의 몬스터 1장을 대상으로 하여 이 카드를 발동할 수 있다. 이 카드를 그 몬스터에 장착한다.\n②: 장착 몬스터의 공격력은 700 올린다.',
    effects: equipSpell((ctx, c) => c.controller === ctx.player, { atk: 700 }),
  }),
  spell({
    id: 'gen_fusion',
    name: '융합의 도가니',
    kind: 'normal',
    text: '①: 자신의 패·필드에서 융합 소재 몬스터를 묘지로 보내고, 융합 몬스터 1장을 엑스트라 덱에서 융합 소환한다.',
    effects: [fusionActivation('융합 소환')],
  }),
  trap({
    id: 'gen_barrier',
    name: '성역의 방벽',
    kind: 'normal',
    text: '①: 상대 몬스터가 공격 선언했을 때에 발동할 수 있다. 상대 필드의 공격 표시 몬스터를 전부 파괴한다.',
    effects: [
      {
        label: '상대 공격 표시 몬스터 전부 파괴',
        type: 'activate',
        condition: opponentAttacking,
        resolve: async (ctx) => {
          ctx.destroy(ctx.monsters(ctx.opp, (c) => c.faceUp && c.position === 'atk'));
        },
      },
    ],
  }),
  trap({
    id: 'gen_pitfall',
    name: '함정 구덩이',
    kind: 'normal',
    text: '①: 상대가 공격력 1000 이상의 몬스터를 일반 소환·반전 소환했을 때, 그 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 파괴한다.',
    effects: [
      {
        label: '소환된 몬스터 파괴',
        type: 'activate',
        target: {
          prompt: '파괴할 몬스터',
          filter: (ctx, c) =>
            c.location === 'mzone' &&
            c.controller === ctx.opp &&
            c.faceUp &&
            ctx.duel.atk(c) >= 1000 &&
            !!ctx.duel.windowEvents?.some(
              (e) => e.type === 'summoned' && e.card === c.uid && e.version === c.version && ['normal', 'tribute', 'flip'].includes(e.summonType ?? ''),
            ),
          purpose: 'harm',
        },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'gen_edict',
    name: '엄숙한 칙령',
    kind: 'counter',
    text: '①: 상대가 몬스터의 효과·마법·함정 카드를 발동했을 때, LP를 절반 지불하고 발동할 수 있다. 그 발동을 무효로 하고 파괴한다.',
    effects: [
      {
        label: '발동 무효 + 파괴',
        type: 'activate',
        cost: payLpCost((ctx) => Math.floor(ctx.duel.players[ctx.player].lp / 2)),
        condition: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && !r.negated;
        },
        resolve: async (ctx) => {
          const r = ctx.respondingTo;
          if (!r) return;
          ctx.negateLink(r, 'activation');
          const c = ctx.duel.card(r.uid);
          if (c.version === r.version && ctx.duel.isOnField(c)) ctx.destroy([c]);
        },
        ai: (ctx) => {
          const r = ctx.respondingTo;
          if (!r || ctx.duel.players[ctx.player].lp < 3000) return false;
          const c = ctx.duel.card(r.uid);
          return r.effect.target?.purpose === 'harm' || c.def.id === 'gen_cataclysm' || (c.def.level ?? 0) >= 6;
        },
      },
    ],
  }),
  monster({
    id: 'gen_sentinel',
    name: '메아리 파수꾼',
    attribute: 'LIGHT',
    race: 'Fairy',
    level: 1,
    atk: 0,
    def: 1800,
    text: '①: 상대가 몬스터의 효과를 발동했을 때, 이 카드를 패에서 버리고 발동할 수 있다. 그 효과를 무효로 한다. 「메아리 파수꾼」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '패에서 버리고 몬스터 효과 무효',
        type: 'quick',
        range: ['hand'],
        opt: 'hard',
        cost: discardSelfCost,
        condition: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && !r.isCardActivation && ctx.duel.card(r.uid).def.category === 'monster' && !r.negated;
        },
        resolve: async (ctx) => {
          const r = ctx.respondingTo;
          if (r) ctx.negateLink(r, 'effect');
        },
      },
    ],
  }),
  monster({
    id: 'gen_dove',
    name: '장막의 비둘기',
    attribute: 'LIGHT',
    race: 'Winged Beast',
    level: 3,
    atk: 300,
    def: 1200,
    text: '①: 상대 몬스터가 공격 선언했을 때, 이 카드를 패에서 버리고 발동할 수 있다. 배틀 페이즈를 종료한다. 「장막의 비둘기」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '패에서 버리고 배틀 페이즈 종료',
        type: 'quick',
        range: ['hand'],
        opt: 'hard',
        cost: discardSelfCost,
        condition: opponentAttacking,
        resolve: async (ctx) => ctx.endBattlePhase(),
        ai: (ctx) => {
          const b = ctx.duel.battle;
          if (!b) return false;
          const a = ctx.duel.atk(ctx.duel.card(b.attacker));
          return b.target === null ? a >= 1500 : a > 1800;
        },
      },
    ],
  }),
  monster({
    id: 'gen_azure',
    name: '창공의 기사',
    attribute: 'LIGHT',
    race: 'Warrior',
    level: 4,
    atk: 1900,
    def: 1200,
    text: '푸른 갑옷을 두른 기사. 하늘을 가르는 일격은 누구도 막을 수 없다고 전해진다.',
  }),
  monster({
    id: 'gen_ogre',
    name: '진홍의 오우거',
    attribute: 'DARK',
    race: 'Fiend',
    level: 6,
    atk: 2300,
    def: 1200,
    text: '붉은 피부의 거대한 오우거. 그 포효는 산을 울린다.',
  }),
  monster({
    id: 'gen_elder',
    name: '백은의 고룡',
    attribute: 'LIGHT',
    race: 'Dragon',
    level: 8,
    atk: 3000,
    def: 2500,
    text: '태고부터 살아온 전설의 용. 은빛 비늘은 어떤 칼날도 튕겨낸다.',
  }),
  monster({
    id: 'gen_boar',
    name: '철갑 멧돼지',
    attribute: 'EARTH',
    race: 'Beast',
    level: 4,
    atk: 1500,
    def: 1300,
    text: '①: 이 카드가 리버스했을 경우, 필드의 이 카드 이외의 몬스터 1장을 대상으로 하여 발동한다. 그 몬스터를 파괴한다.',
    effects: [
      {
        label: '리버스: 몬스터 1장 파괴',
        type: 'trigger',
        event: 'flipped',
        optional: false,
        eventFilter: selfEvent,
        target: { prompt: '파괴할 몬스터', filter: (ctx, c) => c.location === 'mzone' && c.uid !== ctx.uid, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'gen_sprite',
    name: '글리머 스프라이트',
    attribute: 'LIGHT',
    race: 'Fairy',
    level: 2,
    atk: 800,
    def: 800,
    tuner: true,
    text: '①: 이 카드가 일반 소환에 성공했을 경우에 발동할 수 있다. 패에서 레벨 4 이하의 몬스터 1장을 수비 표시로 특수 소환한다. 「글리머 스프라이트」의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.',
    effects: [
      {
        label: '패에서 레벨 4 이하 특수 소환',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal'),
        opt: 'hard',
        condition: (ctx) => hasFreeZone(ctx) && ctx.cards(ctx.player, ['hand'], (c) => isMonster(c) && (c.def.level ?? 0) <= 4 && ctx.duel.canBeSpecialSummoned(c)).length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['hand'], (c) => isMonster(c) && (c.def.level ?? 0) <= 4 && ctx.duel.canBeSpecialSummoned(c));
          const [c] = await ctx.select(cands, { prompt: '특수 소환할 몬스터', purpose: 'benefit' });
          if (c) await ctx.specialSummon(c, { position: 'def' });
        },
      },
    ],
  }),
  monster({
    id: 'gen_wolf',
    name: '질풍 늑대',
    attribute: 'WIND',
    race: 'Beast',
    level: 4,
    atk: 1400,
    def: 1000,
    text: '①: 이 카드는 상대에게 직접 공격할 수 있다.',
    effects: [selfFlag('직접 공격 가능', 'directAttack')],
  }),
  monster({
    id: 'gen_healer',
    name: '치유의 사도',
    attribute: 'LIGHT',
    race: 'Fairy',
    level: 4,
    atk: 1000,
    def: 1700,
    text: '①: 자신 스탠바이 페이즈에 발동한다. 자신은 500 LP 회복한다.',
    effects: [
      {
        label: '500 LP 회복',
        type: 'trigger',
        event: 'phaseStart',
        optional: false,
        eventFilter: (ctx, ev) => ev.phase === 'standby' && ev.player === ctx.player,
        resolve: async (ctx) => ctx.gainLp(500),
      },
    ],
  }),
  monster({
    id: 'gen_golem',
    name: '자폭 골렘',
    attribute: 'EARTH',
    race: 'Rock',
    level: 3,
    atk: 1000,
    def: 1000,
    text: '①: 이 카드가 전투로 파괴되어 묘지로 보내졌을 경우에 발동한다. 상대에게 800 데미지를 준다.',
    effects: [
      {
        label: '800 데미지',
        type: 'trigger',
        event: 'destroyed',
        range: ['gy'],
        optional: false,
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'battle'),
        resolve: async (ctx) => ctx.damage(ctx.opp, 800),
      },
    ],
  }),
  monster({
    id: 'gen_gauntlet',
    name: '건틀릿 나이트',
    kind: 'xyz',
    attribute: 'LIGHT',
    race: 'Warrior',
    level: 4,
    atk: 2100,
    def: 1800,
    materials: { type: 'xyz', count: 2, desc: '레벨 4 몬스터 × 2' },
    text: '레벨 4 몬스터 × 2\n①: 1턴에 1번, 이 카드의 엑시즈 소재를 1개 제거하고, 상대 필드의 마법·함정 카드 1장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다.',
    effects: [
      {
        label: '소재 1개 제거: 마법·함정 1장 파괴',
        type: 'ignition',
        opt: 'soft',
        cost: detachCost(1),
        target: { prompt: '파괴할 카드', filter: (ctx, c) => onOppField(ctx, c) && isSpellTrap(c), purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'gen_storm',
    name: '스톰브레이커 드래곤',
    kind: 'synchro',
    attribute: 'WIND',
    race: 'Dragon',
    level: 7,
    atk: 2600,
    def: 2000,
    materials: { type: 'synchro', desc: '튜너 + 튜너 이외의 몬스터 1장 이상' },
    text: '튜너 + 튜너 이외의 몬스터 1장 이상\n①: 1턴에 1번, 상대 필드의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 주인의 패로 되돌린다.',
    effects: [
      {
        label: '몬스터 1장을 패로',
        type: 'ignition',
        opt: 'soft',
        target: { prompt: '패로 되돌릴 몬스터', filter: (ctx, c) => c.location === 'mzone' && c.controller === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  monster({
    id: 'gen_chimera',
    name: '쌍두 키메라',
    kind: 'fusion',
    attribute: 'EARTH',
    race: 'Beast',
    level: 6,
    atk: 2200,
    def: 1800,
    materials: {
      type: 'fusion',
      materials: [
        { desc: '야수족 몬스터', filter: (_d, c) => c.def.race === 'Beast' },
        { desc: '전사족 몬스터', filter: (_d, c) => c.def.race === 'Warrior' },
      ],
    },
    text: '야수족 몬스터 + 전사족 몬스터\n①: 이 카드는 1번의 배틀 페이즈 중에 2번 공격할 수 있다.',
    effects: [selfFlag('2회 공격', 'doubleAttack')],
  }),
];

export const ALL_CARDS: CardDef[] = [...emberwing, ...tidecall, ...clockwork, ...veilborn, ...sunshine, ...memoryHole, ...generic, ...staples];

export const CARD_DB: Record<string, CardDef> = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

export const ARCHETYPE_NAMES: Record<string, string> = {
  [EMBER]: '엠버윙',
  [TIDE]: '타이드콜',
  [CLOCK]: '클락워크',
  [VEIL]: '베일본',
  [SUN]: '선샤인',
  [MEM]: '메모리 홀',
};

export function getCard(id: string): CardDef {
  const c = CARD_DB[id];
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}
