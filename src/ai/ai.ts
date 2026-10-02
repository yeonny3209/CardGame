// Heuristic computer opponent. It only looks at information its player could know.
import { EffectContext } from '../engine/context';
import { Duel, other } from '../engine/core';
import { canAttack } from '../engine/flow';
import { synchroCombos, xyzCombos } from '../engine/materials';
import type { ActionOption, Answer, CardInstance, Controller, PlayerId, Request } from '../engine/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AIController implements Controller {
  constructor(
    public me: PlayerId,
    public delayMs = 0,
  ) {}

  async choose(req: Request, duel: Duel): Promise<Answer> {
    if (this.delayMs > 0) await sleep(this.delayMs);
    return decide(duel, this.me, req);
  }
}

// ---------------------------------------------------------------- evaluation helpers

function visibleAtk(duel: Duel, c: CardInstance): number {
  return c.faceUp ? duel.atk(c) : 0;
}

/** What the AI believes a defending monster's relevant stat is. */
function defendingStat(duel: Duel, c: CardInstance): number {
  if (!c.faceUp) return 1500;
  return c.position === 'atk' ? duel.atk(c) : duel.defense(c);
}

function strongestAtk(duel: Duel, p: PlayerId): number {
  return Math.max(0, ...duel.monsters(p).map((c) => visibleAtk(duel, c)));
}

export function cardValue(duel: Duel, c: CardInstance): number {
  if (c.def.category === 'monster') {
    const atk = duel.isOnField(c) && c.faceUp ? duel.atk(c) : (c.def.atk ?? 0);
    return atk + (c.def.level ?? 0) * 60 + (c.def.effects.length ? 300 : 0);
  }
  return 1200;
}

function hasSummonTrigger(c: CardInstance): boolean {
  return c.def.effects.some((e) => e.type === 'trigger' && (Array.isArray(e.event) ? e.event.includes('summoned') : e.event === 'summoned'));
}

function ctxFor(duel: Duel, p: PlayerId, uid: number, effIndex: number): EffectContext {
  const c = duel.card(uid);
  return new EffectContext(duel, uid, p, c.def.effects[effIndex], effIndex);
}

function attackGain(duel: Duel, attacker: CardInstance, target: CardInstance | null): number {
  const a = duel.atk(attacker);
  if (target === null) return a;
  if (!target.faceUp) return a >= 1600 ? 400 : -1;
  const s = defendingStat(duel, target);
  if (target.position === 'atk') {
    if (a > s) return cardValue(duel, target) + (a - s);
    if (a === s) return cardValue(duel, target) > cardValue(duel, attacker) ? 50 : -1;
    return -(s - a) - cardValue(duel, attacker);
  }
  if (a > s) return cardValue(duel, target) + (duel.hasFlag(attacker, 'piercing') ? a - s : 0);
  return -(s - a);
}

function bestTarget(duel: Duel, attacker: CardInstance, targets: number[], direct: boolean): { target: number | null; gain: number } {
  let best: { target: number | null; gain: number } = { target: null, gain: -Infinity };
  if (direct) best = { target: null, gain: attackGain(duel, attacker, null) };
  for (const t of targets) {
    const g = attackGain(duel, attacker, duel.card(t));
    if (g > best.gain) best = { target: t, gain: g };
  }
  return best;
}

// ---------------------------------------------------------------- main decision

function decide(duel: Duel, me: PlayerId, req: Request): Answer {
  switch (req.type) {
    case 'action':
      return decideAction(duel, me, req.options);
    case 'chain':
      return decideChain(duel, me, req.options);
    case 'select':
      return decideSelect(duel, me, req.candidates, req.min, req.max, req.purpose);
    case 'option':
      return 0;
    case 'yesno':
      return true;
    case 'position': {
      const c = duel.card(req.uid);
      const atk = c.def.atk ?? 0;
      const def = c.def.def ?? 0;
      return atk >= strongestAtk(duel, other(me)) || atk >= def ? 'atk' : 'def';
    }
    case 'zone':
      return req.free[0];
    case 'attackTarget': {
      const a = duel.card(req.attacker);
      const best = bestTarget(duel, a, req.targets, req.direct);
      if (best.gain < 0) return null;
      return best.target === null ? -1 : best.target;
    }
  }
}

function scoreAction(duel: Duel, me: PlayerId, o: ActionOption): number {
  const opp = other(me);
  switch (o.kind) {
    case 'activate': {
      const c = duel.card(o.uid);
      const ctx = ctxFor(duel, me, o.uid, o.effIndex);
      const e = ctx.effect;
      if (e.ai && !e.ai(ctx)) return -1;
      // Traps and quick effects are better saved for the opponent's turn unless they remove something.
      if (c.def.category === 'trap' && e.target?.purpose !== 'harm') return e.ai ? 45 : -1;
      if (c.def.spellKind === 'field' && duel.players[me].fzone !== null && duel.card(duel.players[me].fzone!).def.id === c.def.id) return -1;
      if (e.target?.purpose === 'harm') return 70;
      if (c.def.spellKind === 'equip') return duel.faceUpMonsters(me).length > 0 ? 35 : -1;
      return 85;
    }
    case 'procedure':
      return 60;
    case 'extraSummon': {
      const c = duel.card(o.uid);
      const combos = o.method === 'synchro' ? synchroCombos(duel, c.def, duel.monsters(me)) : xyzCombos(duel, c.def, duel.monsters(me));
      const best = Math.min(...combos.map((m) => Math.max(...m.map((x) => visibleAtk(duel, x)))));
      return (c.def.atk ?? 0) > best + 200 ? 65 + (c.def.atk ?? 0) / 1000 : -1;
    }
    case 'normalSummon': {
      const c = duel.card(o.uid);
      const atk = c.def.atk ?? 0;
      if (o.tributes > 0) {
        const mine = duel.monsters(me).map((m) => visibleAtk(duel, m)).sort((x, y) => x - y);
        const lost = mine.slice(0, o.tributes).reduce((s, x) => s + x, 0);
        if (atk <= lost + 500) return -1;
      }
      if (!hasSummonTrigger(c) && atk < strongestAtk(duel, opp) && (c.def.def ?? 0) > atk) return -1;
      return 50 + atk / 200 + (hasSummonTrigger(c) ? 25 : 0);
    }
    case 'setMonster': {
      const c = duel.card(o.uid);
      if (o.tributes > 0) return -1;
      return (c.def.def ?? 0) >= 1200 || c.def.effects.some((e) => e.event === 'flipped') ? 30 : 10;
    }
    case 'flipSummon':
      return 40;
    case 'changePosition': {
      const c = duel.card(o.uid);
      const oppMax = strongestAtk(duel, opp);
      if (c.position === 'def' && duel.atk(c) > oppMax) return 35;
      if (c.position === 'atk' && duel.phase === 'main2' && duel.atk(c) < oppMax && duel.defense(c) > duel.atk(c)) return 25;
      return -1;
    }
    case 'setST': {
      const c = duel.card(o.uid);
      if (c.def.category === 'trap') return 30;
      if (c.def.spellKind === 'quickplay') return 20;
      return -1;
    }
    case 'attack': {
      const a = duel.card(o.uid);
      const targets = duel.monsters(opp).map((m) => m.uid);
      const best = bestTarget(duel, a, targets, targets.length === 0 || duel.hasFlag(a, 'directAttack'));
      return best.gain > 0 ? 50 + best.gain / 100 : -1;
    }
    case 'toBattle': {
      const anyAttack = duel.monsters(me).some((m) => canAttack(duel, m));
      return anyAttack ? 5 : -1;
    }
    case 'toMain2':
    case 'endTurn':
      return 0;
  }
}

function decideAction(duel: Duel, me: PlayerId, options: ActionOption[]): number {
  let bestIdx = options.length - 1;
  let bestScore = -Infinity;
  options.forEach((o, i) => {
    const s = scoreAction(duel, me, o);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  });
  if (bestScore < 0) {
    const fallback = options.findIndex((o) => o.kind === 'endTurn' || o.kind === 'toMain2');
    return fallback >= 0 ? fallback : options.length - 1;
  }
  return bestIdx;
}

function decideChain(duel: Duel, me: PlayerId, options: { uid: number; effIndex: number }[]): number {
  const opp = other(me);
  const top = duel.chain[duel.chain.length - 1];
  if (top && top.player === me) return -1;
  const oppActing =
    (top && top.player === opp) ||
    !!duel.windowEvents?.some((e) => (e.type === 'attackDeclared' || e.type === 'summoned') && e.player === opp);
  for (let i = 0; i < options.length; i++) {
    const ctx = ctxFor(duel, me, options[i].uid, options[i].effIndex);
    const e = ctx.effect;
    if (e.ai) {
      if (e.ai(ctx)) return i;
      continue;
    }
    // Reactive cards (conditions tied to what the opponent is doing) fire whenever they can.
    if (e.condition && oppActing) return i;
    if (e.target?.purpose === 'harm' && oppActing) return i;
  }
  return -1;
}

function decideSelect(
  duel: Duel,
  me: PlayerId,
  candidates: number[],
  min: number,
  max: number,
  purpose: string,
): number[] {
  const cards = candidates.map((u) => duel.card(u));
  const alreadyTargeted = new Set(duel.chain.filter((l) => l.player === me).flatMap((l) => l.targets.map((t) => t.uid)));
  const value = (c: CardInstance) => {
    const v = cardValue(duel, c) / (purpose === 'harm' && alreadyTargeted.has(c.uid) ? 10 : 1);
    if (purpose === 'harm') return c.controller === me && duel.isOnField(c) ? -v : v;
    return v;
  };
  if (purpose === 'material' && min === 0) return [];
  const sorted = [...cards].sort((a, b) => value(b) - value(a));
  if (purpose === 'cost' || purpose === 'material') {
    const n = purpose === 'material' ? Math.max(min, 1) : min;
    return sorted.reverse().slice(0, Math.min(n, max)).map((c) => c.uid);
  }
  if (purpose === 'harm') {
    const good = sorted.filter((c) => value(c) > 0);
    const n = Math.max(min, Math.min(max, good.length));
    return sorted.slice(0, n).map((c) => c.uid);
  }
  return sorted.slice(0, Math.max(min, Math.min(max, sorted.length))).map((c) => c.uid);
}

