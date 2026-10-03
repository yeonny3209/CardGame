// Generic ("staple") cards that fit into any deck. Their power is set to the middle of OCG's 9th generation:
// a handful of hand traps and cheap interaction, burn that needs a condition, searchers limited to once per turn,
// and the strongest effects kept to one or two copies by the Forbidden & Limited list (src/deck/deck.ts).
import type { CardDef, CardInstance } from '../engine/types';
import type { EffectContext } from '../engine/context';
import { discardCost, discardSelfCost, hasReason, isAttacker, isMonster, monster, opponentAttacking, selfEvent, spell, summonedSelf, trap } from './helpers';

const faceUpOppMonster = (ctx: EffectContext, c: CardInstance) => c.location === 'mzone' && c.faceUp && c.controller === ctx.opp;
const hasFreeZone = (ctx: EffectContext) => ctx.duel.freeMZones(ctx.player) > 0;
const once = (name: string, n: string) => `「${name}」의 ${n}의 효과는 1턴에 1번밖에 사용할 수 없다.`;
const isFireMonster = (c: CardInstance): boolean => isMonster(c) && c.def.attribute === 'FIRE';
const smallAtk = (c: CardInstance): boolean => isMonster(c) && (c.def.atk ?? 0) <= 1500;

/** The opponent's attack declaration this window, targeting the attacking monster. */
const attackerTarget = { prompt: '공격 몬스터', filter: (ctx: EffectContext, c: CardInstance) => isAttacker(ctx, c) && c.controller === ctx.opp, purpose: 'harm' as const };

export const staples: CardDef[] = [
  // ============================================================ high-level Normal Monsters
  monster({
    id: 'gen_serpent',
    name: '심해의 포식자',
    attribute: 'WATER',
    race: 'Sea Serpent',
    level: 5,
    atk: 2200,
    def: 1600,
    text: '깊은 바다 밑에서 올라와 배를 통째로 삼킨다는 거대한 바다뱀.',
  }),
  monster({
    id: 'gen_wyvern',
    name: '폭풍을 가르는 비룡',
    attribute: 'WIND',
    race: 'Dragon',
    level: 6,
    atk: 2400,
    def: 1800,
    text: '폭풍의 눈을 둥지 삼아 사는 비룡. 날개짓 한 번에 돌풍이 인다.',
  }),
  monster({
    id: 'gen_ifrit',
    name: '염옥의 군주',
    attribute: 'FIRE',
    race: 'Fiend',
    level: 6,
    atk: 2500,
    def: 1200,
    text: '타오르는 감옥을 다스리는 악마. 그가 지나간 자리에는 재조차 남지 않는다.',
  }),
  monster({
    id: 'gen_archmage',
    name: '황혼의 대마도사',
    attribute: 'DARK',
    race: 'Spellcaster',
    level: 7,
    atk: 2500,
    def: 2100,
    text: '해가 지는 순간에만 완전한 힘을 드러내는 마도사. 그의 지팡이는 별빛을 끌어모은다.',
  }),
  monster({
    id: 'gen_dragoon',
    name: '대지의 용기사',
    attribute: 'EARTH',
    race: 'Warrior',
    level: 7,
    atk: 2600,
    def: 2100,
    text: '용의 비늘로 만든 갑옷을 걸친 기사. 대지가 그의 발걸음에 응답한다.',
  }),
  monster({
    id: 'gen_blackdrake',
    name: '칠흑의 폭룡',
    attribute: 'DARK',
    race: 'Dragon',
    level: 8,
    atk: 2800,
    def: 2400,
    text: '밤보다 짙은 비늘을 가진 폭룡. 울부짖음 하나로 성벽이 무너진다.',
  }),

  // ============================================================ FIRE Machine burn monsters (Level 1-4)
  monster({
    id: 'gen_fuse',
    name: '도화선 인형',
    attribute: 'FIRE',
    race: 'Machine',
    level: 1,
    atk: 200,
    def: 100,
    text: '①: 이 카드가 상대에 의해 파괴되어 묘지로 보내졌을 경우에 발동한다. 상대에게 800 데미지를 준다.',
    effects: [
      {
        label: '800 데미지',
        type: 'trigger',
        event: 'destroyed',
        range: ['gy'],
        optional: false,
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && ev.by === ctx.opp,
        resolve: async (ctx) => ctx.damage(ctx.opp, 800),
      },
    ],
  }),
  monster({
    id: 'gen_gear',
    name: '열풍 톱니 병정',
    attribute: 'FIRE',
    race: 'Machine',
    level: 2,
    atk: 700,
    def: 500,
    text: '①: 자신 엔드 페이즈에 발동한다. 이 카드 이외의 자신 필드의 화염 속성 몬스터 1장당 200 데미지를 상대에게 준다.',
    effects: [
      {
        label: '다른 화염 속성 몬스터 × 200 데미지',
        type: 'trigger',
        event: 'phaseStart',
        optional: false,
        eventFilter: (ctx, ev) => ev.phase === 'end' && ev.player === ctx.player,
        condition: (ctx) => ctx.faceUpMonsters(ctx.player, (c) => c.uid !== ctx.uid && isFireMonster(c)).length > 0,
        resolve: async (ctx) => {
          const n = ctx.faceUpMonsters(ctx.player, (c) => c.uid !== ctx.uid && isFireMonster(c)).length;
          ctx.damage(ctx.opp, n * 200);
        },
      },
    ],
  }),
  monster({
    id: 'gen_forge',
    name: '용광로 정비병',
    attribute: 'FIRE',
    race: 'Machine',
    level: 3,
    atk: 1000,
    def: 1000,
    text:
      '①: 이 카드가 일반 소환에 성공했을 경우, 자신 묘지의 화염 속성 몬스터 1장을 제외하고 발동할 수 있다. 제외한 몬스터의 레벨 × 200 데미지를 상대에게 준다. ' +
      once('용광로 정비병', '①'),
    effects: [
      {
        label: '묘지의 화염 속성 몬스터를 제외: 레벨 × 200 데미지',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf('normal', 'tribute'),
        opt: 'hard',
        cost: {
          check: (ctx) => ctx.cards(ctx.player, ['gy'], isFireMonster).length > 0,
          pay: async (ctx) => {
            const [c] = await ctx.select(ctx.cards(ctx.player, ['gy'], isFireMonster), { prompt: '제외할 화염 속성 몬스터', purpose: 'cost' });
            if (!c) return;
            if (ctx.link) ctx.link.data.level = c.def.level ?? 0;
            ctx.banish([c], ['cost']);
          },
        },
        resolve: async (ctx) => {
          const level = Number(ctx.link?.data.level ?? 0);
          ctx.damage(ctx.opp, level * 200);
        },
      },
    ],
  }),
  monster({
    id: 'gen_cannon',
    name: '열폭주 포병',
    attribute: 'FIRE',
    race: 'Machine',
    level: 4,
    atk: 1500,
    def: 1100,
    text: '①: 이 카드가 소환에 성공했을 경우, 상대의 LP가 자신의 LP 이상일 경우에 발동할 수 있다. 상대에게 800 데미지를 준다. ' + once('열폭주 포병', '①'),
    effects: [
      {
        label: '800 데미지',
        type: 'trigger',
        event: 'summoned',
        eventFilter: summonedSelf(),
        opt: 'hard',
        condition: (ctx) => ctx.duel.players[ctx.opp].lp >= ctx.duel.players[ctx.player].lp,
        resolve: async (ctx) => ctx.damage(ctx.opp, 800),
      },
    ],
  }),

  // ============================================================ other generic effect monsters
  monster({
    id: 'gen_veiler',
    name: '속삭이는 베일',
    attribute: 'LIGHT',
    race: 'Spellcaster',
    level: 1,
    atk: 0,
    def: 0,
    text:
      '①: 상대 메인 페이즈에, 이 카드를 패에서 버리고, 상대 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 효과는 턴 종료시까지 무효가 된다. ' +
      once('속삭이는 베일', '①'),
    effects: [
      {
        label: '패에서 버리고 몬스터 효과 무효',
        type: 'quick',
        range: ['hand'],
        opt: 'hard',
        cost: discardSelfCost,
        condition: (ctx) => ctx.duel.turnPlayer === ctx.opp && (ctx.duel.phase === 'main1' || ctx.duel.phase === 'main2'),
        target: { prompt: '효과를 무효로 할 몬스터', filter: faceUpOppMonster, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target?.faceUp) ctx.buff(ctx.target, { flags: ['negated'], until: 'endOfTurn' });
        },
        ai: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && !r.isCardActivation;
        },
      },
    ],
  }),
  monster({
    id: 'gen_crow',
    name: '묘지의 까마귀',
    attribute: 'DARK',
    race: 'Winged Beast',
    level: 1,
    atk: 100,
    def: 100,
    text: '①: 상대 묘지의 카드 1장을 대상으로 하여, 이 카드를 패에서 버리고 발동할 수 있다. 그 카드를 제외한다. ' + once('묘지의 까마귀', '①'),
    effects: [
      {
        label: '패에서 버리고 상대 묘지의 카드를 제외',
        type: 'quick',
        range: ['hand'],
        opt: 'hard',
        cost: discardSelfCost,
        target: { prompt: '제외할 상대 묘지의 카드', filter: (ctx, c) => c.location === 'gy' && c.owner === ctx.opp, purpose: 'harm' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.banish([ctx.target]);
        },
        ai: (ctx) => {
          const r = ctx.respondingTo;
          return !!r && r.player === ctx.opp && r.targets.some((t) => ctx.duel.card(t.uid).location === 'gy');
        },
      },
    ],
  }),
  monster({
    id: 'gen_hunter',
    name: '별빛 사냥꾼',
    attribute: 'DARK',
    race: 'Fiend',
    level: 3,
    atk: 1000,
    def: 600,
    text: '①: 이 카드가 필드에서 묘지로 보내졌을 경우에 발동할 수 있다. 덱에서 공격력 1500 이하의 몬스터 1장을 패에 넣는다. ' + once('별빛 사냥꾼', '①'),
    effects: [
      {
        label: '공격력 1500 이하 몬스터 서치',
        type: 'trigger',
        event: 'sentToGy',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && ev.from === 'mzone',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], smallAtk).length > 0,
        resolve: async (ctx) => {
          await ctx.search(smallAtk, '패에 넣을 몬스터');
        },
      },
    ],
  }),
  monster({
    id: 'gen_scout',
    name: '숲의 정찰병',
    attribute: 'EARTH',
    race: 'Beast',
    level: 3,
    atk: 1200,
    def: 800,
    text: '①: 이 카드가 전투로 파괴되어 묘지로 보내졌을 경우에 발동할 수 있다. 덱에서 공격력 1500 이하의 몬스터 1장을 수비 표시로 특수 소환한다. ' + once('숲의 정찰병', '①'),
    effects: [
      {
        label: '덱에서 공격력 1500 이하 몬스터 특수 소환',
        type: 'trigger',
        event: 'destroyed',
        range: ['gy'],
        opt: 'hard',
        eventFilter: (ctx, ev) => selfEvent(ctx, ev) && hasReason(ev, 'battle'),
        condition: (ctx) => hasFreeZone(ctx) && ctx.cards(ctx.player, ['deck'], (c) => smallAtk(c) && ctx.duel.canBeSpecialSummoned(c)).length > 0,
        resolve: async (ctx) => {
          const cands = ctx.cards(ctx.player, ['deck'], (c) => smallAtk(c) && ctx.duel.canBeSpecialSummoned(c));
          const [c] = await ctx.select(cands, { prompt: '특수 소환할 몬스터', purpose: 'benefit' });
          if (c) await ctx.specialSummon(c, { position: 'def' });
          ctx.duel.shuffle(ctx.duel.players[ctx.player].deck);
        },
      },
    ],
  }),

  // ============================================================ generic Spells
  spell({
    id: 'gen_thunder',
    name: '천둥의 징벌',
    kind: 'normal',
    text:
      '①: 자신 필드에 카드가 존재하지 않을 경우에 발동할 수 있다. 아래 효과에서 1개를 선택하여 적용한다.\n' +
      '●상대 필드의 공격 표시 몬스터를 전부 파괴한다.\n' +
      '●상대 필드의 마법·함정 카드를 전부 파괴한다.',
    effects: [
      {
        label: '공격 표시 몬스터 또는 마법·함정 전부 파괴',
        type: 'activate',
        condition: (ctx) => ctx.duel.fieldCards(ctx.player).length === 0 && ctx.duel.fieldCards(ctx.opp).length > 0,
        resolve: async (ctx) => {
          const pick = await ctx.option('적용할 효과를 선택', ['상대의 공격 표시 몬스터를 전부 파괴', '상대의 마법·함정 카드를 전부 파괴']);
          if (pick === 0) ctx.destroy(ctx.monsters(ctx.opp, (c) => c.faceUp && c.position === 'atk'));
          else ctx.destroy(ctx.duel.spellTraps(ctx.opp));
        },
        ai: (ctx) => ctx.monsters(ctx.opp).length >= 2 || ctx.duel.spellTraps(ctx.opp).length >= 2,
      },
    ],
  }),
  spell({
    id: 'gen_twisters',
    name: '쌍둥이 회오리',
    kind: 'quickplay',
    text: '①: 패를 1장 버리고, 필드의 이 카드 이외의 마법·함정 카드 최대 2장을 대상으로 하여 발동할 수 있다. 그 카드를 파괴한다.',
    effects: [
      {
        label: '마법·함정 최대 2장 파괴',
        type: 'activate',
        cost: discardCost(1),
        target: {
          prompt: '파괴할 마법·함정 카드 (최대 2장)',
          min: 1,
          max: 2,
          filter: (ctx, c) => (c.location === 'szone' || c.location === 'fzone') && c.uid !== ctx.uid,
          purpose: 'harm',
        },
        resolve: async (ctx) => {
          ctx.destroy(ctx.targets);
        },
        ai: (ctx) => ctx.duel.spellTraps(ctx.opp).length > 0,
      },
    ],
  }),
  spell({
    id: 'gen_reincarnation',
    name: '윤회의 의식',
    kind: 'normal',
    text: '「윤회의 의식」은 1턴에 1장밖에 발동할 수 없다.\n①: 패를 1장 버리고, 자신 묘지의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 패에 넣는다.',
    effects: [
      {
        label: '묘지의 몬스터를 패로',
        type: 'activate',
        opt: 'hard',
        cost: discardCost(1),
        target: { prompt: '패에 넣을 몬스터', filter: (ctx, c) => c.location === 'gy' && c.owner === ctx.player && isMonster(c), purpose: 'benefit' },
        resolve: async (ctx) => {
          if (ctx.target) ctx.toHand([ctx.target]);
        },
      },
    ],
  }),
  spell({
    id: 'gen_chalice',
    name: '봉인의 잔',
    kind: 'quickplay',
    text:
      '①: 필드의 앞면 표시 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터의 공격력은 턴 종료시까지 400 올라가고, 그 몬스터의 효과는 턴 종료시까지 무효가 된다. ' +
      '이 효과는 데미지 스텝에도 발동할 수 있다.',
    effects: [
      {
        label: '공격력 +400, 효과 무효',
        type: 'activate',
        damageStep: true,
        target: { prompt: '대상 몬스터', filter: (_ctx, c) => c.location === 'mzone' && c.faceUp, purpose: 'neutral' },
        resolve: async (ctx) => {
          if (ctx.target?.faceUp) ctx.buff(ctx.target, { atk: 400, flags: ['negated'], until: 'endOfTurn' });
        },
        ai: () => false,
      },
    ],
  }),
  spell({
    id: 'gen_requisition',
    name: '기계 조달',
    kind: 'normal',
    text: '「기계 조달」은 1턴에 1장밖에 발동할 수 없다.\n①: 덱에서 레벨 4 이하의 기계족 몬스터 1장을 패에 넣는다.',
    effects: [
      {
        label: '기계족 몬스터 서치',
        type: 'activate',
        opt: 'hard',
        condition: (ctx) => ctx.cards(ctx.player, ['deck'], (c) => isMonster(c) && c.def.race === 'Machine' && (c.def.level ?? 0) <= 4).length > 0,
        resolve: async (ctx) => {
          await ctx.search((c) => isMonster(c) && c.def.race === 'Machine' && (c.def.level ?? 0) <= 4, '패에 넣을 기계족 몬스터');
        },
      },
    ],
  }),
  spell({
    id: 'gen_furnace',
    name: '용광로의 불꽃',
    kind: 'field',
    text:
      '①: 필드의 화염 속성 몬스터의 공격력은 200 올라가고, 수비력은 200 내려간다.\n' +
      '②: 필드의 물 속성 몬스터의 공격력은 200 내려가고, 수비력은 200 올라간다.',
    effects: [
      { label: '필드 발동', type: 'activate' },
      {
        label: '화염 속성 공격력 +200, 수비력 -200',
        type: 'continuous',
        continuous: { affects: (_d, _s, t) => t.def.attribute === 'FIRE', atk: 200, def: -200 },
      },
      {
        label: '물 속성 공격력 -200, 수비력 +200',
        type: 'continuous',
        continuous: { affects: (_d, _s, t) => t.def.attribute === 'WATER', atk: -200, def: 200 },
      },
    ],
  }),

  // ============================================================ generic Traps
  trap({
    id: 'gen_negate',
    name: '차단의 장막',
    kind: 'normal',
    text: '①: 상대 몬스터가 공격 선언했을 때에 발동할 수 있다. 그 공격을 무효로 하고, 배틀 페이즈를 종료한다.',
    effects: [
      {
        label: '공격 무효 + 배틀 페이즈 종료',
        type: 'activate',
        condition: opponentAttacking,
        resolve: async (ctx) => ctx.endBattlePhase(),
        ai: (ctx) => {
          const b = ctx.duel.battle;
          return !!b && ctx.duel.atk(ctx.duel.card(b.attacker)) >= 1500;
        },
      },
    ],
  }),
  trap({
    id: 'gen_prison',
    name: '차원의 감옥',
    kind: 'normal',
    text: '①: 상대 몬스터가 공격 선언했을 때, 그 공격 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 제외한다.',
    effects: [
      {
        label: '공격 몬스터 제외',
        type: 'activate',
        condition: opponentAttacking,
        target: attackerTarget,
        resolve: async (ctx) => {
          if (ctx.target) ctx.banish([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'gen_armor',
    name: '폭발 방패',
    kind: 'normal',
    text: '①: 상대 몬스터가 공격 선언했을 때, 그 공격 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 파괴한다.',
    effects: [
      {
        label: '공격 몬스터 파괴',
        type: 'activate',
        condition: opponentAttacking,
        target: attackerTarget,
        resolve: async (ctx) => {
          if (ctx.target) ctx.destroy([ctx.target]);
        },
      },
    ],
  }),
  trap({
    id: 'gen_bottomless',
    name: '심연의 함정구멍',
    kind: 'normal',
    text: '①: 상대가 공격력 1500 이상의 몬스터를 소환·반전 소환·특수 소환했을 때, 그 몬스터를 대상으로 하여 발동할 수 있다. 그 몬스터를 파괴하고 제외한다.',
    effects: [
      {
        label: '소환된 몬스터를 파괴하고 제외',
        type: 'activate',
        target: {
          prompt: '파괴하고 제외할 몬스터',
          filter: (ctx, c) =>
            c.location === 'mzone' &&
            c.faceUp &&
            c.controller === ctx.opp &&
            ctx.duel.atk(c) >= 1500 &&
            !!ctx.duel.windowEvents?.some((e) => e.type === 'summoned' && e.card === c.uid && e.version === c.version),
          purpose: 'harm',
        },
        resolve: async (ctx) => {
          if (!ctx.target) return;
          const [gone] = ctx.destroy([ctx.target]);
          if (gone) ctx.banish([gone]);
        },
      },
    ],
  }),
  trap({
    id: 'gen_haunted',
    name: '혼의 호출',
    kind: 'continuous',
    text:
      '①: 자신 묘지의 몬스터 1장을 대상으로 하여 발동할 수 있다. 그 몬스터를 공격 표시로 특수 소환한다.\n' +
      '②: 이 카드가 필드를 떠났을 경우, 그 몬스터를 파괴한다. 그 몬스터가 필드를 떠났을 경우, 이 카드를 파괴한다.',
    effects: [
      {
        label: '묘지의 몬스터를 공격 표시로 특수 소환',
        type: 'activate',
        condition: hasFreeZone,
        target: {
          prompt: '특수 소환할 몬스터',
          filter: (ctx, c) => c.location === 'gy' && c.owner === ctx.player && isMonster(c) && ctx.duel.canBeSpecialSummoned(c),
          purpose: 'benefit',
        },
        resolve: async (ctx) => {
          const t = ctx.target;
          if (!t || !ctx.selfStillThere || !ctx.duel.isOnField(ctx.self)) return;
          if (await ctx.specialSummon(t, { position: 'atk' })) {
            // From now on the Trap and the monster stand and fall together (see Duel.sendTo / Duel.cascade).
            ctx.self.equippedTo = { uid: t.uid, version: t.version };
          }
        },
        ai: (ctx) => ctx.cards(ctx.player, ['gy'], (c) => isMonster(c) && (c.def.atk ?? 0) >= 1800).length > 0,
      },
    ],
  }),
];

