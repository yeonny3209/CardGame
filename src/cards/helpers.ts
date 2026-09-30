// Building blocks for card scripts.
import type { EffectContext } from '../engine/context';
import { fusionCombos, ritualCombos, selectCombo } from '../engine/materials';
import type {
  Attribute,
  CardDef,
  CardInstance,
  CostSpec,
  DuelEvent,
  EffectDef,
  Flag,
  MaterialSpec,
  Race,
  SpellKind,
  TrapKind,
} from '../engine/types';

export const inArch = (c: CardInstance, a: string): boolean => !!c.def.archetypes?.includes(a);
export const isMonster = (c: CardInstance): boolean => c.def.category === 'monster';
export const isSpellTrap = (c: CardInstance): boolean => c.def.category !== 'monster';

// ---------------------------------------------------------------- event filters

/** This card (this exact instance) was summoned, optionally by one of the given methods. */
export function summonedSelf(...types: string[]) {
  return (ctx: EffectContext, ev: DuelEvent): boolean =>
    ev.card === ctx.uid && ev.version === ctx.self.version && (types.length === 0 || types.includes(ev.summonType ?? ''));
}

export function selfEvent(ctx: EffectContext, ev: DuelEvent): boolean {
  return ev.card === ctx.uid && ev.version === ctx.self.version;
}

export function hasReason(ev: DuelEvent, r: string): boolean {
  return !!ev.reasons?.includes(r);
}

// ---------------------------------------------------------------- costs

export const discardCost = (n = 1, filter?: (c: CardInstance) => boolean): CostSpec => ({
  check: (ctx) => ctx.cards(ctx.player, ['hand'], (c) => c.uid !== ctx.uid && (!filter || filter(c))).length >= n,
  pay: async (ctx) => {
    await ctx.discard(n, (c) => c.uid !== ctx.uid && (!filter || filter(c)), ['discard', 'cost']);
  },
});

export const discardSelfCost: CostSpec = {
  check: (ctx) => ctx.self.location === 'hand',
  pay: async (ctx) => {
    ctx.duel.addLog(`${ctx.duel.cardName(ctx.uid, true)} 버림`, ctx.player);
    ctx.duel.sendTo([ctx.self], 'gy', ['discard', 'cost'], ctx.player);
  },
};

export const banishSelfCost: CostSpec = {
  check: (ctx) => ctx.self.location === 'gy',
  pay: async (ctx) => {
    ctx.banish([ctx.self], ['cost']);
  },
};

export const detachCost = (n = 1): CostSpec => ({
  check: (ctx) => ctx.self.overlay.length >= n,
  pay: async (ctx) => {
    const mats = ctx.self.overlay.map((u) => ctx.duel.card(u));
    const chosen = await ctx.select(mats, { prompt: `떼어낼 엑시즈 소재 ${n}개`, min: n, max: n, purpose: 'cost' });
    ctx.duel.addLog(`엑시즈 소재 ${chosen.length}개를 떼어냄`, ctx.player);
    ctx.duel.sendTo(chosen, 'gy', ['cost', 'detach'], ctx.player);
  },
});

export const payLpCost = (amount: number | ((ctx: EffectContext) => number)): CostSpec => ({
  check: (ctx) => ctx.duel.players[ctx.player].lp > (typeof amount === 'number' ? amount : amount(ctx)),
  pay: async (ctx) => {
    ctx.duel.payLp(ctx.player, typeof amount === 'number' ? amount : amount(ctx));
  },
});

// ---------------------------------------------------------------- card constructors

interface MonsterInit {
  id: string;
  name: string;
  attribute: Attribute;
  race: Race;
  level: number;
  atk: number;
  def: number;
  text?: string;
  archetypes?: string[];
  tuner?: boolean;
  kind?: CardDef['monsterKind'];
  materials?: MaterialSpec;
  effects?: EffectDef[];
}

export function monster(m: MonsterInit): CardDef {
  const effects = m.effects ?? [];
  return {
    id: m.id,
    name: m.name,
    category: 'monster',
    text: m.text ?? '',
    archetypes: m.archetypes,
    monsterKind: m.kind ?? (effects.length ? 'effect' : 'normal'),
    attribute: m.attribute,
    race: m.race,
    level: m.level,
    atk: m.atk,
    def: m.def,
    tuner: m.tuner,
    materials: m.materials,
    effects,
  };
}

export function spell(s: { id: string; name: string; kind: SpellKind; text: string; archetypes?: string[]; effects: EffectDef[] }): CardDef {
  return { id: s.id, name: s.name, category: 'spell', spellKind: s.kind, text: s.text, archetypes: s.archetypes, effects: s.effects };
}

export function trap(t: { id: string; name: string; kind: TrapKind; text: string; archetypes?: string[]; effects: EffectDef[] }): CardDef {
  return { id: t.id, name: t.name, category: 'trap', trapKind: t.kind, text: t.text, archetypes: t.archetypes, effects: t.effects };
}

// ---------------------------------------------------------------- common effect templates

/** "Special Summon this card from your hand if <cond>" (inherent procedure). */
export function handProcedure(label: string, cond: (ctx: EffectContext) => boolean): EffectDef {
  return {
    label,
    type: 'procedure',
    range: ['hand'],
    opt: 'hard',
    condition: cond,
    resolve: async (ctx) => {
      await ctx.specialSummon(ctx.self);
    },
  };
}

/** Continuous effect that applies to this card only. */
export function selfFlag(label: string, ...flags: Flag[]): EffectDef {
  return {
    label,
    type: 'continuous',
    continuous: { affects: (_d, self, t) => self.uid === t.uid, flags },
  };
}

function fusionPool(ctx: EffectContext): CardInstance[] {
  return ctx.cards(ctx.player, ['hand', 'mzone'], (c) => c.uid !== ctx.uid && isMonster(c));
}

function fusionTargets(ctx: EffectContext, filter?: (c: CardInstance) => boolean) {
  const pool = fusionPool(ctx);
  const free = ctx.duel.freeMZones(ctx.player);
  return ctx
    .cards(ctx.player, ['extra'], (c) => c.def.materials?.type === 'fusion' && (!filter || filter(c)))
    .map((c) => ({
      card: c,
      combos: fusionCombos(ctx.duel, c.def, pool).filter((combo) => free + combo.filter((m) => m.location === 'mzone').length > 0),
    }))
    .filter((x) => x.combos.length > 0);
}

/** Normal Spell: Fusion Summon using monsters from your hand or field. */
export function fusionActivation(label: string, filter?: (c: CardInstance) => boolean): EffectDef {
  return {
    label,
    type: 'activate',
    condition: (ctx) => fusionTargets(ctx, filter).length > 0,
    resolve: async (ctx) => {
      const options = fusionTargets(ctx, filter);
      const [f] = await ctx.select(
        options.map((o) => o.card),
        { prompt: '융합 소환할 몬스터를 선택', purpose: 'benefit' },
      );
      if (!f) return;
      const combos = options.find((o) => o.card === f)!.combos;
      const mats = await selectCombo(ctx.duel, ctx.player, combos, `${f.def.name}의 융합 소재`);
      if (!mats) return;
      ctx.duel.addLog(`융합 소재: ${mats.map((m) => ctx.duel.cardName(m.uid, true)).join(', ')}`, ctx.player);
      ctx.duel.sendTo(mats, 'gy', ['material', 'fusion'], ctx.player);
      await ctx.specialSummon(f, { type: 'fusion' });
    },
  };
}

function ritualTargets(ctx: EffectContext, ritualId: string) {
  const free = ctx.duel.freeMZones(ctx.player);
  return ctx
    .cards(ctx.player, ['hand'], (c) => c.def.id === ritualId)
    .map((r) => {
      const pool = ctx.cards(ctx.player, ['hand', 'mzone'], (c) => c.uid !== r.uid && isMonster(c));
      const combos = ritualCombos(ctx.duel, r.def.level ?? 0, pool).filter(
        (combo) => free + combo.filter((m) => m.location === 'mzone').length > 0,
      );
      return { card: r, combos };
    })
    .filter((x) => x.combos.length > 0);
}

/** Ritual Spell: Ritual Summon `ritualId` by Tributing monsters whose total Levels equal or exceed its Level. */
export function ritualActivation(label: string, ritualId: string): EffectDef {
  return {
    label,
    type: 'activate',
    condition: (ctx) => ritualTargets(ctx, ritualId).length > 0,
    resolve: async (ctx) => {
      const options = ritualTargets(ctx, ritualId);
      const [r] = await ctx.select(
        options.map((o) => o.card),
        { prompt: '의식 소환할 몬스터', purpose: 'benefit' },
      );
      if (!r) return;
      const mats = await selectCombo(ctx.duel, ctx.player, options.find((o) => o.card === r)!.combos, '의식 소환을 위해 릴리스할 몬스터');
      if (!mats) return;
      ctx.duel.addLog(`릴리스: ${mats.map((m) => ctx.duel.cardName(m.uid, true)).join(', ')}`, ctx.player);
      ctx.duel.sendTo(mats, 'gy', ['tribute', 'material', 'ritual'], ctx.player);
      await ctx.specialSummon(r, { type: 'ritual' });
    },
  };
}

/** Equip Spell granting stats/flags to the equipped monster. */
export function equipSpell(
  targetFilter: (ctx: EffectContext, c: CardInstance) => boolean,
  mods: { atk?: number; def?: number; flags?: Flag[] },
): EffectDef[] {
  return [
    {
      label: '장착',
      type: 'activate',
      target: {
        prompt: '장착할 몬스터를 선택',
        filter: (ctx, c) => c.location === 'mzone' && c.faceUp && targetFilter(ctx, c),
        purpose: 'benefit',
      },
      resolve: async (ctx) => {
        const t = ctx.target;
        if (!t || t.location !== 'mzone' || !t.faceUp || !ctx.selfStillThere) return;
        ctx.self.equippedTo = { uid: t.uid, version: t.version };
        ctx.duel.addLog(`${ctx.duel.cardName(ctx.uid)}를 ${ctx.duel.cardName(t.uid)}에 장착`, ctx.player);
      },
    },
    {
      label: '장착 효과',
      type: 'continuous',
      continuous: {
        affects: (_d, self, t) => self.equippedTo?.uid === t.uid && self.equippedTo.version === t.version,
        atk: mods.atk,
        def: mods.def,
        flags: mods.flags,
      },
    },
  ];
}

/** Opponent declared an attack in the current window. */
export function opponentAttacking(ctx: EffectContext): boolean {
  return !!ctx.duel.windowEvents?.some((e) => e.type === 'attackDeclared' && e.player === ctx.opp) && !!ctx.duel.battle;
}

export function isAttacker(ctx: EffectContext, c: CardInstance): boolean {
  const b = ctx.duel.battle;
  return !!b && b.attacker === c.uid && b.attackerVersion === c.version;
}
