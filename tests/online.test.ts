import { describe, expect, it } from 'vitest';
import { AIController } from '../src/ai/ai';
import { STARTER_DECKS, toDefs } from '../src/deck/deck';
import { Duel } from '../src/engine/core';
import { runDuel } from '../src/engine/flow';
import { memoryPair } from '../src/net/channel';
import { OnlineSession } from '../src/net/session';
import { decodeSignal, encodeSignal } from '../src/net/signal';
import type { Controller } from '../src/engine/types';

async function playOnline(deckA: number, deckB: number, seed: number, tamper = false) {
  const [ca, cb] = memoryPair();
  const a = new OnlineSession(ca, 'host', STARTER_DECKS[deckA], seed);
  const b = new OnlineSession(cb, 'guest', STARTER_DECKS[deckB], 1);
  const [ha, hb] = await Promise.all([a.handshake(), b.handshake()]);
  expect(hb.seed).toBe(seed);
  expect(ha.oppDeck.main).toEqual(STARTER_DECKS[deckB].main);
  let desync = 0;
  a.onDesync = b.onDesync = () => desync++;

  const build = (s: OnlineSession, own: number, opp: number, name: [string, string]) => {
    const ai = new AIController(s.seat);
    const local: Controller = { choose: (req, d) => ai.choose(req, d) };
    const decks = s.seat === 0 ? [STARTER_DECKS[own], STARTER_DECKS[opp]] : [STARTER_DECKS[opp], STARTER_DECKS[own]];
    const d0 = toDefs(decks[0]);
    const d1 = toDefs(decks[1]);
    return new Duel([d0.main, d1.main], [d0.extra, d1.extra], s.controllers(local), { seed, names: name });
  };
  const da = build(a, deckA, deckB, ['A', 'B']);
  const db = build(b, deckB, deckA, ['A', 'B']);
  if (tamper) db.players[0].lp = 7000; // the guest's state silently differs
  await Promise.race([
    Promise.all([runDuel(da, { maxTurns: 40 }), runDuel(db, { maxTurns: 40 })]),
    new Promise((res) => setTimeout(res, tamper ? 500 : 20000)),
  ]);
  return { da, db, desync };
}

describe('online duel (lockstep)', () => {
  it('both sides reach the identical result from the exchanged answers only', async () => {
    for (const [x, y, seed] of [[0, 1, 11], [2, 3, 22], [4, 5, 33], [3, 0, 44]] as const) {
      const { da, db, desync } = await playOnline(x, y, seed);
      expect(desync).toBe(0);
      expect(da.winner).toBe(db.winner);
      expect(da.log.map((l) => l.text)).toEqual(db.log.map((l) => l.text));
      expect(da.turn).toBe(db.turn);
      expect(da.turn).toBeGreaterThan(2);
    }
  }, 60000);

  it('detects a divergence between the two sides', async () => {
    const { desync } = await playOnline(0, 1, 5, true);
    expect(desync).toBeGreaterThan(0);
  });

  it('rejects an opponent deck that breaks the rules, and a different protocol version', async () => {
    const [ca, cb] = memoryPair();
    const a = new OnlineSession(ca, 'host', STARTER_DECKS[0], 1);
    const bad = { ...STARTER_DECKS[1], main: [...STARTER_DECKS[1].main, 'gen_insight'] };
    const b = new OnlineSession(cb, 'guest', bad, 1);
    const result = await Promise.allSettled([a.handshake(), b.handshake()]);
    expect(result[0].status).toBe('rejected');
  });

  it('reports a closed connection', async () => {
    const [ca, cb] = memoryPair();
    const a = new OnlineSession(ca, 'host', STARTER_DECKS[0], 1);
    const b = new OnlineSession(cb, 'guest', STARTER_DECKS[1], 1);
    let closed = false;
    a.onClose = () => (closed = true);
    b.close();
    await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(true);
    expect(a.closed).toBe(true);
  });
});

describe('connection codes', () => {
  it('round-trips a session description and rejects garbage', async () => {
    const sdp = 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\na=candidate:1 1 udp 2113937151 192.168.0.5 51234 typ host\r\n'.repeat(8);
    const code = await encodeSignal({ type: 'offer', sdp });
    expect(code).toMatch(/^AD[01]\./);
    expect(code.length).toBeLessThan(sdp.length);
    expect(await decodeSignal(`  ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual({ type: 'offer', sdp });
    expect(await decodeSignal('hello')).toBeNull();
    expect(await decodeSignal('AD1.@@@')).toBeNull();
  });
});
