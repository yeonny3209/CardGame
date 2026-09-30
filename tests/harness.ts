// Scripted duels for rule tests.
import { getCard } from '../src/cards/pool';
import { Duel } from '../src/engine/core';
import { runDuel } from '../src/engine/flow';
import type { Answer, CardInstance, Controller, Location, PlayerId, Position, Request } from '../src/engine/types';

export type Policy = (req: Request, duel: Duel) => Answer | undefined;

export function defaultAnswer(req: Request): Answer {
  switch (req.type) {
    case 'action': {
      const i = req.options.findIndex((o) => o.kind === 'endTurn' || o.kind === 'toMain2');
      return i >= 0 ? i : req.options.length - 1;
    }
    case 'chain':
      return -1;
    case 'yesno':
      return false;
    case 'select':
      return req.candidates.slice(0, req.min);
    case 'option':
      return 0;
    case 'position':
      return 'atk';
    case 'attackTarget':
      return null;
  }
}

export class Scripted implements Controller {
  requests: Request[] = [];
  constructor(private policy: Policy = () => undefined) {}
  async choose(req: Request, duel: Duel): Promise<Answer> {
    this.requests.push(req);
    const a = this.policy(req, duel);
    return a === undefined ? defaultAnswer(req) : a;
  }
}

export interface Placement {
  id: string;
  loc: Location;
  faceUp?: boolean;
  position?: Position;
}

export interface SideSetup {
  hand?: string[];
  field?: Placement[];
  deck?: string[];
  extra?: string[];
}

const FILLER = 'clock_sentry';

/** Build a duel where each player's opening hand and board are fixed. */
export function scenario(first: PlayerId, sides: [SideSetup, SideSetup], policies: [Policy, Policy]) {
  const controllers: [Scripted, Scripted] = [new Scripted(policies[0]), new Scripted(policies[1])];
  const main = sides.map((s) => {
    const ids = [...(s.hand ?? []), ...(s.field ?? []).filter((f) => f.loc !== 'extra').map((f) => f.id), ...(s.deck ?? [])];
    while (ids.length < 40) ids.push(FILLER);
    return ids.map(getCard);
  }) as [ReturnType<typeof getCard>[], ReturnType<typeof getCard>[]];
  const extra = sides.map((s) => (s.extra ?? []).map(getCard)) as [ReturnType<typeof getCard>[], ReturnType<typeof getCard>[]];
  const duel = new Duel(main, extra, controllers, { firstPlayer: first, seed: 1 });
  for (const p of [0, 1] as PlayerId[]) {
    const s = sides[p];
    const deck = duel.players[p].deck;
    const take = (id: string): CardInstance => {
      const i = deck.findIndex((u) => duel.card(u).def.id === id);
      if (i < 0) throw new Error(`card ${id} not in deck`);
      const [u] = deck.splice(i, 1);
      deck.push(u);
      return duel.card(u);
    };
    for (const f of s.field ?? []) {
      const c = take(f.id);
      if (f.loc === 'gy') {
        duel.place(c, 'gy');
      } else {
        duel.place(c, f.loc, { faceUp: f.faceUp ?? true, position: f.position ?? 'atk' });
        c.enteredTurn = -1;
      }
    }
    // Opening hand: put the requested cards on top of the deck.
    const hand = s.hand ?? [];
    const handCards = hand.map((id) => take(id));
    for (const c of handCards) {
      deck.splice(deck.indexOf(c.uid), 1);
    }
    // Fill the remaining opening-hand slots with filler from the deck.
    const fill: number[] = [];
    while (handCards.length + fill.length < 5) {
      const i = deck.findIndex((u) => duel.card(u).def.id === FILLER && !fill.includes(u));
      fill.push(deck.splice(i, 1)[0]);
    }
    deck.push(...fill, ...handCards.map((c) => c.uid).reverse());
  }
  return { duel, controllers, run: (maxTurns: number) => runDuel(duel, { maxTurns }) };
}

export function find(duel: Duel, id: string, p?: PlayerId): CardInstance[] {
  return duel.cards.filter((c) => c.def.id === id && (p === undefined || c.owner === p));
}

export function optionIndex(req: Request, pred: (o: { kind?: string; uid?: number; effIndex?: number }) => boolean): number {
  if (req.type === 'action') return req.options.findIndex((o) => pred(o as never));
  if (req.type === 'chain') return req.options.findIndex((o) => pred(o as never));
  return -1;
}
