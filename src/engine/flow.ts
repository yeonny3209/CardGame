// Duel flow: activation legality, chains, triggers, response windows, phases and battle.
import { EffectContext, sanitizeSelection } from './context';
import { Duel, DuelOver, HAND_LIMIT, defaultRange, isExtraDeckMonster, other, START_HAND } from './core';
import type { PendingTrigger } from './core';
import { combinations, selectCombo, synchroCombos, xyzCombos } from './materials';
import type {
  ActionOption,
  ActivationOption,
  CardDef,
  CardInstance,
  ChainLink,
  DuelEvent,
  EffectDef,
  Phase,
  PlayerId,
  Position,
} from './types';

// ====================================================================== helpers

export function effectSpeed(def: CardDef, e: EffectDef): number {
  if (e.speed) return e.speed;
  if (def.category === 'trap') return def.trapKind === 'counter' ? 3 : 2;
  if (def.category === 'spell') {
    if (e.type === 'activate' && def.spellKind === 'quickplay') return 2;
    return e.type === 'quick' ? 2 : 1;
  }
  return e.type === 'quick' ? 2 : 1;
}

export function tributesNeeded(def: CardDef): number {
  const lv = def.level ?? 0;
  if (lv >= 7) return 2;
  if (lv >= 5) return 1;
  return 0;
}

export function isMainPhase(phase: Phase): boolean {
  return phase === 'main1' || phase === 'main2';
}

function optKey(p: PlayerId, c: CardInstance, idx: number, e: EffectDef): string | null {
  if (e.optKey) return `H:${p}:${e.optKey}`;
  if (e.opt === 'hard') return `H:${p}:${c.def.id}#${idx}`;
  if (e.opt === 'soft') return `S:${c.uid}:${c.version}:${idx}`;
  return null;
}

function optUsed(duel: Duel, p: PlayerId, c: CardInstance, idx: number, e: EffectDef): boolean {
  const k = optKey(p, c, idx, e);
  return k !== null && duel.opt.has(k);
}

function useOpt(duel: Duel, p: PlayerId, c: CardInstance, idx: number, e: EffectDef): void {
  const k = optKey(p, c, idx, e);
  if (k) duel.opt.add(k);
}

export function targetCandidates(ctx: EffectContext): CardInstance[] {
  const spec = ctx.effect.target;
  if (!spec) return [];
  return ctx.duel.cards.filter(
    (c) => c.location !== 'deck' && c.location !== 'hand' && c.location !== 'extra' && c.location !== 'overlay' && ctx.targetable(c) && spec.filter(ctx, c),
  );
}

/** Condition + cost + target availability (shared by all activation kinds). */
function requirementsMet(ctx: EffectContext): boolean {
  const e = ctx.effect;
  if (e.condition && !e.condition(ctx)) return false;
  if (e.cost && !e.cost.check(ctx)) return false;
  if (e.target && targetCandidates(ctx).length < (e.target.min ?? 1)) return false;
  return true;
}

// ====================================================================== activation legality

/**
 * Can player `p` activate effect `idx` of card `c` right now?
 * `open` = turn player's open game state in their Main Phase (Spell Speed 1 allowed).
 */
export function canActivate(duel: Duel, p: PlayerId, c: CardInstance, idx: number, open: boolean): boolean {
  const e = c.def.effects[idx];
  if (e.type !== 'ignition' && e.type !== 'quick' && e.type !== 'activate') return false;
  const onField = duel.isOnField(c);
  if (onField ? c.controller !== p : c.owner !== p) return false;
  const speed = effectSpeed(c.def, e);
  const ownMainOpen = open && duel.turnPlayer === p && isMainPhase(duel.phase) && duel.chain.length === 0;

  if (e.type === 'activate') {
    if (c.def.category === 'monster') return false;
    if (c.location === 'hand') {
      if (c.def.category === 'trap') return false;
      if (c.def.spellKind !== 'field' && duel.freeSZones(p) === 0) return false;
      if (c.def.spellKind === 'quickplay') {
        if (duel.turnPlayer !== p) return false;
      } else if (!ownMainOpen) return false;
    } else if ((c.location === 'szone' || c.location === 'fzone') && !c.faceUp) {
      const setThisTurn = c.enteredTurn === duel.turn;
      if (c.def.category === 'trap' || c.def.spellKind === 'quickplay') {
        if (setThisTurn) return false;
      } else if (!ownMainOpen) return false;
    } else return false;
  } else {
    const range = e.range ?? defaultRange(c.def);
    if (!range.includes(c.location)) return false;
    if (onField && (!c.faceUp || duel.isNegated(c))) return false;
    if (e.type === 'ignition' && !ownMainOpen) return false;
  }

  const top = duel.chain[duel.chain.length - 1];
  if (!open || duel.chain.length > 0) {
    if (speed < 2) return false;
    if (top && speed < top.speed) return false;
  }
  if (duel.damageStep !== null && !(e.damageStep || speed === 3)) return false;
  if (optUsed(duel, p, c, idx, e)) return false;
  return requirementsMet(new EffectContext(duel, c.uid, p, e, idx));
}

/** Everything player `p` could activate now. */
export function activationOptions(duel: Duel, p: PlayerId, open: boolean): ActivationOption[] {
  const out: ActivationOption[] = [];
  for (const c of duel.cardsIn(p, ['hand', 'mzone', 'szone', 'fzone', 'gy', 'banished'])) {
    c.def.effects.forEach((e, idx) => {
      if (canActivate(duel, p, c, idx, open)) out.push({ uid: c.uid, effIndex: idx, label: e.label });
    });
  }
  return out;
}

function canActivateTrigger(duel: Duel, t: PendingTrigger): boolean {
  const c = duel.card(t.uid);
  if (c.version !== t.version) return false;
  const e = c.def.effects[t.effIndex];
  const range = e.range ?? defaultRange(c.def);
  if (!range.includes(c.location)) return false;
  if (duel.isOnField(c) && (!c.faceUp || duel.isNegated(c))) return false;
  if (optUsed(duel, t.player, c, t.effIndex, e)) return false;
  return requirementsMet(new EffectContext(duel, c.uid, t.player, e, t.effIndex, undefined, t.event));
}

// ====================================================================== activation & chain

export async function activate(duel: Duel, p: PlayerId, uid: number, idx: number, event?: DuelEvent): Promise<ChainLink> {
  const c = duel.card(uid);
  const e = c.def.effects[idx];
  const isCardActivation = e.type === 'activate';
  if (isCardActivation) {
    if (c.location === 'hand') {
      if (c.def.spellKind === 'field') {
        const old = duel.players[p].fzone;
        if (old !== null) duel.sendTo([duel.card(old)], 'gy', ['rule'], p);
        duel.place(c, 'fzone', { faceUp: true });
      } else duel.place(c, 'szone', { faceUp: true });
    } else c.faceUp = true;
  }
  const link: ChainLink = {
    index: duel.chain.length + 1,
    player: p,
    uid,
    version: c.version,
    effIndex: idx,
    effect: e,
    speed: effectSpeed(c.def, e),
    isCardActivation,
    targets: [],
    event,
    data: {},
  };
  const ctx = new EffectContext(duel, uid, p, e, idx, link, event);
  useOpt(duel, p, c, idx, e);
  duel.addLog(`${duel.names[p]} 체인 ${link.index}: ${duel.cardName(uid)} 발동 — ${e.label}`, p);
  if (e.cost) await e.cost.pay(ctx);
  if (e.target) {
    const spec = e.target;
    const min = spec.min ?? 1;
    const chosen = await ctx.select(targetCandidates(ctx), {
      prompt: spec.prompt,
      min,
      max: spec.max ?? min,
      purpose: spec.purpose ?? 'neutral',
    });
    link.targets = chosen.map((t) => ({ uid: t.uid, version: t.version }));
    if (chosen.length) duel.addLog(`대상: ${chosen.map((t) => duel.cardName(t.uid)).join(', ')}`, p);
  }
  duel.chain.push(link);
  duel.emit({ type: 'activated', card: uid, version: c.version, player: p, group: duel.newGroup() }, false);
  duel.notify();
  return link;
}

async function resolveChain(duel: Duel): Promise<void> {
  while (duel.chain.length > 0) {
    const link = duel.chain[duel.chain.length - 1];
    duel.lastGroup = duel.newGroup();
    duel.resolvingLink = link;
    const c = duel.card(link.uid);
    const e = link.effect;
    const persistent =
      link.isCardActivation &&
      (c.def.spellKind === 'continuous' ||
        c.def.spellKind === 'field' ||
        c.def.spellKind === 'equip' ||
        c.def.trapKind === 'continuous');
    const cardGone = link.isCardActivation && (c.version !== link.version || !duel.isOnField(c));
    if (link.negated) {
      duel.addLog(`체인 ${link.index} ${duel.cardName(link.uid, true)} 무효`, link.player);
    } else if (persistent && cardGone) {
      duel.addLog(`체인 ${link.index} ${duel.cardName(link.uid, true)}: 카드가 필드에 없어 적용되지 않음`, link.player);
    } else {
      duel.addLog(`체인 ${link.index} 처리: ${duel.cardName(link.uid, true)}`, link.player);
      const ctx = new EffectContext(duel, link.uid, link.player, e, link.effIndex, link, link.event);
      await e.resolve?.(ctx);
    }
    duel.chain.pop();
    duel.resolvingLink = null;
    // Non-persistent Spell/Trap cards go to the GY after resolving (not a timing-relevant event).
    if (link.isCardActivation && c.version === link.version && duel.isOnField(c)) {
      const stays =
        !link.negated && persistent && (c.def.spellKind !== 'equip' || (c.equippedTo !== null && duel.equipValid(c)));
      if (!stays) duel.sendTo([c], 'gy', ['rule'], link.player, { noTiming: true });
    }
    duel.notify();
  }
}

/** Players alternately add links until both pass in succession, then the chain resolves. */
async function chainLoop(duel: Duel): Promise<void> {
  let passes = 0;
  let p = other(duel.chain[duel.chain.length - 1].player);
  while (passes < 2) {
    const opts = activationOptions(duel, p, false);
    if (opts.length > 0) {
      const ans = await duel.ask({ type: 'chain', player: p, options: opts, prompt: chainPrompt(duel) });
      if (typeof ans === 'number' && ans >= 0 && ans < opts.length) {
        await activate(duel, p, opts[ans].uid, opts[ans].effIndex);
        passes = 0;
        p = other(p);
        continue;
      }
    }
    passes++;
    p = other(p);
  }
  await resolveChain(duel);
}

function chainPrompt(duel: Duel): string {
  const top = duel.chain[duel.chain.length - 1];
  if (top) return `체인 ${top.index}: ${duel.cardName(top.uid)} (${top.effect.label})에 체인하시겠습니까?`;
  if (duel.windowEvents?.some((e) => e.type === 'attackDeclared')) return '공격 선언에 대응하시겠습니까?';
  if (duel.windowEvents?.some((e) => e.type === 'summoned')) return '소환에 대응하시겠습니까?';
  if (duel.damageStep) return '데미지 스텝: 효과를 발동하시겠습니까?';
  return '효과를 발동하시겠습니까?';
}

// ====================================================================== triggers

function collectTriggers(duel: Duel, ev: DuelEvent): void {
  for (const c of duel.cards) {
    if (c.location === 'deck' || c.location === 'extra' || c.location === 'overlay') continue;
    c.def.effects.forEach((e, idx) => {
      if (e.type !== 'trigger' || !e.event) return;
      const evs = Array.isArray(e.event) ? e.event : [e.event];
      if (!evs.includes(ev.type)) return;
      const range = e.range ?? defaultRange(c.def);
      if (!range.includes(c.location)) return;
      if (duel.isOnField(c) && (!c.faceUp || duel.isNegated(c))) return;
      const p = duel.isOnField(c) ? c.controller : c.owner;
      const ctx = new EffectContext(duel, c.uid, p, e, idx, undefined, ev);
      if (e.eventFilter && !e.eventFilter(ctx, ev)) return;
      duel.pendingTriggers.push({
        player: p,
        uid: c.uid,
        version: c.version,
        effIndex: idx,
        event: ev,
        mandatory: e.optional === false,
        when: !!e.when,
      });
    });
  }
}

/** Build chains from pending triggers (SEGOC order) until none remain. */
export async function processTriggers(duel: Duel): Promise<boolean> {
  let chained = false;
  while (duel.pendingTriggers.length > 0) {
    const pending = duel.pendingTriggers;
    duel.pendingTriggers = [];
    const valid: PendingTrigger[] = [];
    for (const t of pending) {
      if (!t.mandatory && t.when && t.event.group < duel.lastGroup) {
        duel.addLog(`${duel.cardName(t.uid, true)}의 효과는 타이밍을 놓쳤습니다.`, t.player);
        continue;
      }
      valid.push(t);
    }
    const tp = duel.turnPlayer;
    const ordered = [
      ...valid.filter((t) => t.mandatory && t.player === tp),
      ...valid.filter((t) => t.mandatory && t.player !== tp),
      ...valid.filter((t) => !t.mandatory && t.player === tp),
      ...valid.filter((t) => !t.mandatory && t.player !== tp),
    ];
    for (const t of ordered) {
      if (!canActivateTrigger(duel, t)) continue;
      const c = duel.card(t.uid);
      const e = c.def.effects[t.effIndex];
      if (!t.mandatory) {
        const ok = await duel.ask({
          type: 'yesno',
          player: t.player,
          prompt: `${duel.cardName(t.uid, true)}의 효과를 발동하시겠습니까? — ${e.label}`,
        });
        if (ok !== true) continue;
        if (!canActivateTrigger(duel, t)) continue;
      }
      await activate(duel, t.player, t.uid, t.effIndex, t.event);
    }
    if (duel.chain.length > 0) {
      chained = true;
      await chainLoop(duel);
    }
  }
  return chained;
}

// ====================================================================== windows

/**
 * Open a window in which players may start a chain with Spell Speed 2+ effects.
 * `skipTurnPlayer`: the turn player already had their chance (Main Phase open state).
 */
export async function responseWindow(
  duel: Duel,
  events: DuelEvent[] | null,
  opts: { skipTurnPlayer?: boolean; triggers?: boolean } = {},
): Promise<void> {
  const prev = duel.windowEvents;
  duel.windowEvents = events;
  try {
    if (opts.triggers !== false && (await processTriggers(duel))) {
      // Once a chain has resolved, the "when X happens" moment has passed.
      duel.windowEvents = null;
    }
    const tp = duel.turnPlayer;
    const start = (): [PlayerId, number] => (opts.skipTurnPlayer ? [other(tp), 1] : [tp, 0]);
    let [p, passes] = start();
    while (passes < 2) {
      if (duel.endBattleRequested && duel.phase === 'battle') break;
      const optsList = activationOptions(duel, p, false);
      if (optsList.length > 0) {
        const ans = await duel.ask({ type: 'chain', player: p, options: optsList, prompt: chainPrompt(duel) });
        if (typeof ans === 'number' && ans >= 0 && ans < optsList.length) {
          await activate(duel, p, optsList[ans].uid, optsList[ans].effIndex);
          await chainLoop(duel);
          duel.windowEvents = null;
          if (opts.triggers !== false) await processTriggers(duel);
          [p, passes] = start();
          continue;
        }
      }
      passes++;
      p = other(p);
    }
  } finally {
    duel.windowEvents = prev;
  }
}

// ====================================================================== summoning actions

async function choosePosition(duel: Duel, p: PlayerId, c: CardInstance): Promise<Position> {
  const ans = await duel.ask({ type: 'position', player: p, uid: c.uid, prompt: `${c.def.name}의 표시 형식` });
  return ans === 'def' ? 'def' : 'atk';
}

function lastSummonEvents(duel: Duel, since: number): DuelEvent[] {
  return duel.events.filter((e) => e.seq > since && (e.type === 'summoned' || e.type === 'flipped'));
}

async function normalSummon(duel: Duel, uid: number, set: boolean): Promise<void> {
  const p = duel.turnPlayer;
  const c = duel.card(uid);
  const n = tributesNeeded(c.def);
  if (n > 0) {
    const combos = combinations(duel.monsters(p), n);
    const chosen = await selectCombo(duel, p, combos, `릴리스할 몬스터 ${n}장 선택`);
    if (!chosen) return;
    for (const t of chosen) duel.addLog(`${duel.cardName(t.uid, true)} 릴리스`, p);
    duel.sendTo(chosen, 'gy', ['tribute', 'cost'], p);
  }
  duel.players[p].normalSummonUsed = true;
  if (set) {
    duel.summonToField(c, p, n > 0 ? 'tribute' : 'normal', 'def', false);
    c.summonType = null;
  } else {
    duel.summonToField(c, p, n > 0 ? 'tribute' : 'normal', 'atk');
  }
}

async function flipSummon(duel: Duel, uid: number): Promise<void> {
  const c = duel.card(uid);
  c.faceUp = true;
  c.position = 'atk';
  c.positionChangedTurn = duel.turn;
  c.summonType = 'flip';
  const g = duel.newGroup();
  duel.addLog(`${duel.names[c.controller]} ${duel.cardName(uid)} 반전 소환`, c.controller);
  duel.emit({ type: 'flipped', card: uid, version: c.version, player: c.controller, group: g });
  duel.emit({ type: 'summoned', card: uid, version: c.version, player: c.controller, summonType: 'flip', group: g });
}

function extraSummonCombos(duel: Duel, c: CardInstance, method: 'synchro' | 'xyz'): CardInstance[][] {
  const pool = duel.monsters(c.owner);
  return method === 'synchro' ? synchroCombos(duel, c.def, pool) : xyzCombos(duel, c.def, pool);
}

async function extraSummon(duel: Duel, uid: number, method: 'synchro' | 'xyz'): Promise<void> {
  const c = duel.card(uid);
  const p = c.owner;
  const mats = await selectCombo(duel, p, extraSummonCombos(duel, c, method), `${c.def.name}의 소재 선택`);
  if (!mats) return;
  if (method === 'synchro') {
    duel.addLog(`싱크로 소재: ${mats.map((m) => duel.cardName(m.uid)).join(', ')}`, p);
    duel.sendTo(mats, 'gy', ['material', 'synchro'], p);
  } else {
    duel.addLog(`엑시즈 소재: ${mats.map((m) => duel.cardName(m.uid)).join(', ')}`, p);
    for (const m of mats) duel.place(m, 'overlay');
  }
  const pos = await choosePosition(duel, p, c);
  duel.summonToField(c, p, method, pos);
  if (method === 'xyz') c.overlay = mats.map((m) => m.uid);
}

// ====================================================================== main phase

export function mainActions(duel: Duel): ActionOption[] {
  const p = duel.turnPlayer;
  const ps = duel.players[p];
  const out: ActionOption[] = [];
  const myMonsters = duel.monsters(p);

  for (const c of duel.cardsIn(p, ['hand'])) {
    if (c.def.category === 'monster') {
      if (ps.normalSummonUsed || c.def.monsterKind === 'ritual' || isExtraDeckMonster(c.def)) continue;
      const n = tributesNeeded(c.def);
      if (myMonsters.length < n) continue;
      if (duel.freeMZones(p) + n === 0) continue;
      out.push({ kind: 'normalSummon', uid: c.uid, tributes: n });
      out.push({ kind: 'setMonster', uid: c.uid, tributes: n });
    } else {
      const fieldSpell = c.def.spellKind === 'field';
      if (fieldSpell ? ps.fzone === null : duel.freeSZones(p) > 0) out.push({ kind: 'setST', uid: c.uid });
    }
  }
  for (const c of myMonsters) {
    if (c.enteredTurn === duel.turn || c.positionChangedTurn === duel.turn) continue;
    if (!c.faceUp) out.push({ kind: 'flipSummon', uid: c.uid });
    else if (c.attacksThisTurn === 0) out.push({ kind: 'changePosition', uid: c.uid });
  }
  for (const a of activationOptions(duel, p, true)) out.push({ kind: 'activate', ...a });
  for (const c of duel.cardsIn(p, ['hand', 'gy'])) {
    c.def.effects.forEach((e, idx) => {
      if (e.type !== 'procedure') return;
      const range = e.range ?? ['hand'];
      if (!range.includes(c.location) || duel.freeMZones(p) === 0) return;
      if (optUsed(duel, p, c, idx, e)) return;
      if (!requirementsMet(new EffectContext(duel, c.uid, p, e, idx))) return;
      out.push({ kind: 'procedure', uid: c.uid, effIndex: idx, label: e.label });
    });
  }
  for (const c of duel.cardsIn(p, ['extra'])) {
    const m = c.def.materials?.type;
    if ((m === 'synchro' || m === 'xyz') && extraSummonCombos(duel, c, m).length > 0) {
      out.push({ kind: 'extraSummon', uid: c.uid, method: m });
    }
  }
  if (duel.phase === 'main1' && duel.turn > 1) out.push({ kind: 'toBattle' });
  out.push({ kind: 'endTurn' });
  return out;
}

/** Runs a Main Phase. Returns how it ended. */
async function mainPhase(duel: Duel, phase: 'main1' | 'main2'): Promise<'toBattle' | 'endTurn'> {
  duel.phase = phase;
  duel.addLog(phase === 'main1' ? '메인 페이즈 1' : '메인 페이즈 2', duel.turnPlayer);
  const p = duel.turnPlayer;
  for (let guard = 0; guard < 500; guard++) {
    const options = mainActions(duel);
    const ans = await duel.ask({ type: 'action', player: p, options });
    const act = typeof ans === 'number' && options[ans] ? options[ans] : options[options.length - 1];
    const since = duel.seq;
    switch (act.kind) {
      case 'normalSummon':
      case 'setMonster':
        await normalSummon(duel, act.uid, act.kind === 'setMonster');
        await responseWindow(duel, lastSummonEvents(duel, since), { skipTurnPlayer: true });
        break;
      case 'flipSummon':
        await flipSummon(duel, act.uid);
        await responseWindow(duel, lastSummonEvents(duel, since), { skipTurnPlayer: true });
        break;
      case 'changePosition': {
        const c = duel.card(act.uid);
        c.position = c.position === 'atk' ? 'def' : 'atk';
        c.positionChangedTurn = duel.turn;
        duel.addLog(`${duel.cardName(c.uid)} 표시 형식 변경 → ${c.position === 'atk' ? '공격' : '수비'}`, p);
        break;
      }
      case 'setST': {
        const c = duel.card(act.uid);
        duel.place(c, c.def.spellKind === 'field' ? 'fzone' : 'szone', { faceUp: false });
        duel.addLog(`${duel.names[p]} 마법·함정 카드 세트`, p);
        break;
      }
      case 'activate':
        await activate(duel, p, act.uid, act.effIndex);
        await chainLoop(duel);
        await processTriggers(duel);
        break;
      case 'procedure': {
        const c = duel.card(act.uid);
        const e = c.def.effects[act.effIndex];
        useOpt(duel, p, c, act.effIndex, e);
        await e.resolve?.(new EffectContext(duel, c.uid, p, e, act.effIndex));
        await responseWindow(duel, lastSummonEvents(duel, since), { skipTurnPlayer: true });
        break;
      }
      case 'extraSummon':
        await extraSummon(duel, act.uid, act.method);
        await responseWindow(duel, lastSummonEvents(duel, since), { skipTurnPlayer: true });
        break;
      case 'toBattle':
      case 'endTurn':
        await responseWindow(duel, null, { skipTurnPlayer: true });
        return act.kind;
      default:
        break;
    }
  }
  return 'endTurn';
}

// ====================================================================== battle

function maxAttacks(duel: Duel, c: CardInstance): number {
  return duel.hasFlag(c, 'doubleAttack') ? 2 : 1;
}

export function canAttack(duel: Duel, c: CardInstance): boolean {
  return (
    c.location === 'mzone' &&
    c.controller === duel.turnPlayer &&
    c.faceUp &&
    c.position === 'atk' &&
    c.attacksThisTurn < maxAttacks(duel, c) &&
    !duel.hasFlag(c, 'cannotAttack') &&
    duel.turn > 1
  );
}

function attackStillValid(duel: Duel): boolean {
  const b = duel.battle;
  if (!b) return false;
  const a = duel.card(b.attacker);
  if (a.version !== b.attackerVersion || a.location !== 'mzone' || !a.faceUp || a.position !== 'atk') return false;
  if (a.controller !== duel.turnPlayer) return false;
  if (b.target !== null) {
    const t = duel.card(b.target);
    if (t.version !== b.targetVersion || t.location !== 'mzone' || t.controller === duel.turnPlayer) return false;
  }
  return true;
}

async function chooseAttackTarget(duel: Duel, attacker: CardInstance, allowCancel: boolean): Promise<number | null | 'cancel'> {
  const opp = other(duel.turnPlayer);
  const targets = duel.monsters(opp).map((c) => c.uid);
  const direct = targets.length === 0 || duel.hasFlag(attacker, 'directAttack');
  const ans = await duel.ask({ type: 'attackTarget', player: duel.turnPlayer, attacker: attacker.uid, targets, direct });
  if (typeof ans === 'number' && targets.includes(ans)) return ans;
  if (ans === -1 && direct) return null;
  if (allowCancel) return 'cancel';
  if (targets.length > 0) return targets[0];
  return null;
}

async function declareAttack(duel: Duel, uid: number): Promise<void> {
  const p = duel.turnPlayer;
  const opp = other(p);
  const attacker = duel.card(uid);
  const target = await chooseAttackTarget(duel, attacker, true);
  if (target === 'cancel') return;
  attacker.attacksThisTurn += 1;
  duel.battle = {
    attacker: uid,
    attackerVersion: attacker.version,
    target,
    targetVersion: target === null ? 0 : duel.card(target).version,
    defenderSnapshot: duel.monsters(opp).map((c) => c.uid),
  };
  duel.addLog(
    `${duel.cardName(uid)} 공격 선언 → ${target === null ? '직접 공격' : duel.cardName(target)}`,
    p,
  );
  const ev = duel.emit({ type: 'attackDeclared', card: uid, version: attacker.version, player: p, source: target ?? undefined, group: duel.newGroup() });
  await responseWindow(duel, [ev]);
  const b = duel.battle!;
  const a = duel.card(b.attacker);
  if (
    duel.endBattleRequested ||
    a.version !== b.attackerVersion ||
    a.location !== 'mzone' ||
    !a.faceUp ||
    a.position !== 'atk' ||
    a.controller !== p
  ) {
    duel.battle = null;
    return;
  }
  // Replay: the number of monsters the opponent controls changed, or the target is gone.
  const now = duel.monsters(opp);
  const tgt = b.target === null ? null : duel.card(b.target);
  const targetGone = tgt !== null && (tgt.version !== b.targetVersion || tgt.location !== 'mzone');
  if (now.length !== b.defenderSnapshot.length || targetGone) {
    duel.addLog('리플레이 발생', p);
    const t = await chooseAttackTarget(duel, a, true);
    if (t === 'cancel') {
      duel.battle = null;
      return;
    }
    b.target = t;
    b.targetVersion = t === null ? 0 : duel.card(t).version;
  }
  await damageStep(duel);
}

async function damageStep(duel: Duel): Promise<void> {
  const p = duel.turnPlayer;
  const opp = other(p);
  duel.battleStep = 'damage';
  try {
    duel.damageStep = 'start';
    await responseWindow(duel, null);
    if (!attackStillValid(duel)) return;
    const b = duel.battle!;
    const attacker = duel.card(b.attacker);
    duel.damageStep = 'beforeCalc';
    if (b.target !== null) {
      const t = duel.card(b.target);
      if (!t.faceUp) duel.flipFaceUp(t, 'def', p);
    }
    await responseWindow(duel, null, { triggers: false });
    if (!attackStillValid(duel)) {
      await processTriggers(duel);
      return;
    }
    duel.damageStep = 'calc';
    await responseWindow(duel, null, { triggers: false });
    if (!attackStillValid(duel)) {
      await processTriggers(duel);
      return;
    }
    const toDestroy: Array<[CardInstance, number]> = [];
    const a = duel.atk(attacker);
    if (b.target === null) {
      duel.damage(opp, a, ['battle'], p);
    } else {
      const t = duel.card(b.target);
      if (t.position === 'atk') {
        const ta = duel.atk(t);
        if (a > ta) {
          toDestroy.push([t, attacker.uid]);
          duel.damage(opp, a - ta, ['battle'], p);
        } else if (a < ta) {
          toDestroy.push([attacker, t.uid]);
          duel.damage(p, ta - a, ['battle'], opp);
        } else if (a > 0) {
          toDestroy.push([t, attacker.uid], [attacker, t.uid]);
        }
      } else {
        const td = duel.defense(t);
        if (a > td) {
          toDestroy.push([t, attacker.uid]);
          if (duel.hasFlag(attacker, 'piercing')) duel.damage(opp, a - td, ['battle'], p);
        } else if (a < td) {
          duel.damage(p, td - a, ['battle'], opp);
        }
      }
    }
    duel.damageStep = 'afterCalc';
    await responseWindow(duel, null);
    duel.damageStep = 'end';
    const g = duel.newGroup();
    for (const [c, src] of toDestroy) {
      if (c.location === 'mzone') duel.destroy([c], ['battle'], duel.card(src).controller, src, g);
    }
    await responseWindow(duel, null);
  } finally {
    duel.damageStep = null;
    duel.battleStep = 'battle';
    duel.battle = null;
  }
}

async function battlePhase(duel: Duel): Promise<void> {
  const p = duel.turnPlayer;
  duel.phase = 'battle';
  duel.endBattleRequested = false;
  duel.battleStep = 'start';
  duel.addLog('배틀 페이즈', p);
  const ev = duel.emit({ type: 'phaseStart', phase: 'battle', player: p, group: duel.newGroup() });
  await responseWindow(duel, [ev]);
  duel.battleStep = 'battle';
  for (let guard = 0; guard < 100 && !duel.endBattleRequested; guard++) {
    const options: ActionOption[] = duel.monsters(p).filter((c) => canAttack(duel, c)).map((c) => ({ kind: 'attack', uid: c.uid }));
    for (const a of activationOptions(duel, p, false)) options.push({ kind: 'activate', ...a });
    options.push({ kind: 'toMain2' });
    const ans = await duel.ask({ type: 'action', player: p, options });
    const act = typeof ans === 'number' && options[ans] ? options[ans] : options[options.length - 1];
    if (act.kind === 'attack') await declareAttack(duel, act.uid);
    else if (act.kind === 'activate') {
      await activate(duel, p, act.uid, act.effIndex);
      await chainLoop(duel);
      await processTriggers(duel);
    } else break;
  }
  duel.battleStep = 'end';
  if (!duel.endBattleRequested) await responseWindow(duel, null);
  duel.battleStep = null;
  duel.endBattleRequested = false;
}

// ====================================================================== turn structure

async function phaseWindow(duel: Duel, phase: Phase, label: string, before?: () => void): Promise<void> {
  duel.phase = phase;
  duel.addLog(label, duel.turnPlayer);
  before?.();
  const ev = duel.emit({ type: 'phaseStart', phase, player: duel.turnPlayer, group: duel.newGroup() });
  await responseWindow(duel, [ev]);
}

async function endPhase(duel: Duel): Promise<void> {
  const p = duel.turnPlayer;
  await phaseWindow(duel, 'end', '엔드 페이즈');
  const hand = duel.players[p].hand;
  const excess = hand.length - HAND_LIMIT;
  if (excess > 0) {
    const ans = await duel.ask({
      type: 'select',
      player: p,
      prompt: `패가 ${HAND_LIMIT}장이 되도록 ${excess}장을 버리세요`,
      candidates: [...hand],
      min: excess,
      max: excess,
      purpose: 'cost',
    });
    const cands = hand.map((u) => duel.card(u));
    const picked = sanitizeSelection(ans, cands, excess, excess).map((u) => duel.card(u));
    duel.sendTo(picked, 'gy', ['rule', 'discard'], p);
    duel.addLog(`패 매수 제한으로 ${excess}장 버림`, p);
    await processTriggers(duel);
  }
  for (const c of duel.cards) c.buffs = c.buffs.filter((b) => b.until !== 'endOfTurn');
}

async function runTurn(duel: Duel): Promise<void> {
  duel.turn += 1;
  duel.turnPlayer = duel.turn === 1 ? duel.firstPlayer : other(duel.turnPlayer);
  const p = duel.turnPlayer;
  duel.players[p].normalSummonUsed = false;
  duel.opt.clear();
  for (const c of duel.cards) c.attacksThisTurn = 0;
  duel.addLog(`===== 턴 ${duel.turn}: ${duel.names[p]} =====`, p);

  await phaseWindow(duel, 'draw', '드로우 페이즈', () => {
    if (duel.turn > 1) duel.draw(p, 1, ['rule', 'draw']);
  });
  await phaseWindow(duel, 'standby', '스탠바이 페이즈');
  const next = await mainPhase(duel, 'main1');
  if (next === 'toBattle') {
    await battlePhase(duel);
    await mainPhase(duel, 'main2');
  }
  await endPhase(duel);
}

export interface RunOptions {
  maxTurns?: number;
}

/** Plays the duel to completion. Resolves when a winner is decided (or the turn limit is hit). */
export async function runDuel(duel: Duel, opts: RunOptions = {}): Promise<void> {
  duel.onEvent = (ev) => collectTriggers(duel, ev);
  try {
    duel.addLog(`${duel.names[duel.firstPlayer]} 선공`);
    for (const p of [duel.firstPlayer, other(duel.firstPlayer)]) duel.draw(p, START_HAND, ['rule']);
    duel.pendingTriggers = [];
    for (;;) {
      if (opts.maxTurns && duel.turn >= opts.maxTurns) {
        duel.winner = null;
        duel.endReason = '턴 제한에 도달했습니다.';
        duel.addLog(duel.endReason);
        return;
      }
      await runTurn(duel);
    }
  } catch (e) {
    if (e instanceof DuelOver) {
      duel.notify();
      return;
    }
    throw e;
  }
}
