// Online duel protocol (lockstep). Both players run the same duel engine with the same seed and decks, and only
// exchange the answers to requests. A request for the local player is answered by the local UI and the answer is
// sent to the peer; a request for the remote player waits for the peer's answer. No game state is transferred.
// Each answer carries a digest of the sender's state so that a divergence is detected immediately.
import type { Deck } from '../deck/deck';
import { validateDeck } from '../deck/deck';
import type { Duel } from '../engine/core';
import type { Answer, Controller, PlayerId } from '../engine/types';
import type { Channel } from './channel';

export const PROTOCOL = 1;

type Message =
  | { t: 'hello'; v: number; deck: Deck; seed?: number }
  | { t: 'ans'; a: Answer; d: string }
  | { t: 'sur' };

export interface Handshake {
  seed: number;
  oppDeck: Deck;
}

/** Cheap summary of the visible state, identical on both sides while they stay in sync. */
export function digest(duel: Duel): string {
  const p = duel.players;
  return [
    duel.turn,
    duel.phase,
    duel.chain.length,
    duel.log.length,
    p[0].lp,
    p[1].lp,
    p[0].hand.length,
    p[1].hand.length,
    p[0].deck.length,
    p[1].deck.length,
    p[0].gy.length,
    p[1].gy.length,
  ].join(',');
}

export class OnlineSession {
  /** Seat in the duel: the host is player 0, the guest is player 1. */
  readonly seat: PlayerId;
  onSurrender: (() => void) | null = null;
  onClose: (() => void) | null = null;
  onDesync: (() => void) | null = null;
  closed = false;

  private hello: ((h: Handshake) => void) | null = null;
  private helloFail: ((e: Error) => void) | null = null;
  private answers: Array<{ a: Answer; d: string }> = [];
  private waiter: ((m: { a: Answer; d: string }) => void) | null = null;
  private seed: number;
  private oppDeck: Deck | null = null;
  private gotHello = false;
  private failure: Error | null = null;

  constructor(
    private ch: Channel,
    readonly role: 'host' | 'guest',
    private myDeck: Deck,
    seed = Math.floor(Math.random() * 2 ** 31),
  ) {
    this.seat = role === 'host' ? 0 : 1;
    this.seed = seed;
    ch.onMessage = (raw) => this.receive(raw);
    ch.onClose = () => {
      this.closed = true;
      this.fail(new Error('연결이 끊어졌습니다.'));
      this.onClose?.();
    };
  }

  private send(m: Message): void {
    this.ch.send(JSON.stringify(m));
  }

  private fail(e: Error): void {
    this.failure ??= e;
    this.helloFail?.(e);
  }

  private receive(raw: string): void {
    let m: Message;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'hello') {
      if (m.v !== PROTOCOL) return this.fail(new Error('상대방의 게임 버전이 다릅니다. 둘 다 최신 버전으로 업데이트하세요.'));
      const deck: Deck = { name: String(m.deck?.name ?? '상대 덱'), main: m.deck?.main ?? [], extra: m.deck?.extra ?? [] };
      if (!Array.isArray(deck.main) || !Array.isArray(deck.extra)) return this.fail(new Error('상대방의 덱 정보가 올바르지 않습니다.'));
      const errs = validateDeck(deck);
      if (errs.length) return this.fail(new Error(`상대방의 덱이 규칙에 맞지 않습니다: ${errs[0]}`));
      this.oppDeck = deck;
      if (this.role === 'guest') {
        if (typeof m.seed !== 'number') return this.fail(new Error('호스트의 시작 정보가 없습니다.'));
        this.seed = m.seed;
      }
      this.gotHello = true;
      this.hello?.({ seed: this.seed, oppDeck: deck });
    } else if (m.t === 'ans') {
      const item = { a: m.a, d: m.d };
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(item);
      } else this.answers.push(item);
    } else if (m.t === 'sur') {
      this.onSurrender?.();
    }
  }

  /** Exchange decks; resolves when both sides know the seed and the opposing deck. */
  handshake(): Promise<Handshake> {
    return new Promise<Handshake>((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      this.hello = resolve;
      this.helloFail = reject;
      this.send({ t: 'hello', v: PROTOCOL, deck: this.myDeck, seed: this.role === 'host' ? this.seed : undefined });
      if (this.gotHello && this.oppDeck) resolve({ seed: this.seed, oppDeck: this.oppDeck });
    });
  }

  surrender(): void {
    this.send({ t: 'sur' });
  }

  close(): void {
    this.closed = true;
    this.ch.close();
  }

  /** Controllers for [player 0, player 1]; `local` answers for this side's own seat. */
  controllers(local: Controller): [Controller, Controller] {
    const mine: Controller = {
      choose: async (req, duel) => {
        const a = await local.choose(req, duel);
        this.send({ t: 'ans', a, d: digest(duel) });
        return a;
      },
    };
    const theirs: Controller = {
      choose: async (_req, duel) => {
        const m = this.answers.shift() ?? (await new Promise<{ a: Answer; d: string }>((res) => (this.waiter = res)));
        if (m.d !== digest(duel)) {
          this.onDesync?.();
          return new Promise<Answer>(() => {}); // the duel is over; never resume
        }
        return m.a;
      },
    };
    return this.seat === 0 ? [mine, theirs] : [theirs, mine];
  }
}
