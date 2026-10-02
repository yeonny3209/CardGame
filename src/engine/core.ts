// Duel state and rule primitives (moving cards, stats, events).
import type {
  Answer,
  Buff,
  CardDef,
  CardInstance,
  ChainLink,
  Controller,
  DamageSubStep,
  BattleStep,
  DuelEvent,
  EffectDef,
  Flag,
  Location,
  LogEntry,
  Phase,
  PlayerId,
  Position,
  Request,
  SummonType,
} from './types';

export const MZONES = 5;
export const SZONES = 5;
export const START_LP = 8000;
export const START_HAND = 5;
export const HAND_LIMIT = 6;

export class DuelOver extends Error {
  constructor(
    public winner: PlayerId | null,
    public reason: string,
  ) {
    super(reason);
  }
}

export interface PlayerState {
  id: PlayerId;
  lp: number;
  deck: number[]; // last element = top of deck
  hand: number[];
  gy: number[];
  banished: number[];
  extra: number[];
  mzone: (number | null)[];
  szone: (number | null)[];
  fzone: number | null;
  normalSummonUsed: boolean;
}

export interface PendingTrigger {
  player: PlayerId;
  uid: number;
  version: number;
  effIndex: number;
  event: DuelEvent;
  mandatory: boolean;
  when: boolean;
}

export interface BattleState {
  attacker: number;
  attackerVersion: number;
  target: number | null;
  targetVersion: number;
  /** Monsters the defending player controlled at attack declaration (for replays). */
  defenderSnapshot: number[];
}

export interface DeckList {
  main: string[];
  extra: string[];
}

export interface DuelOptions {
  seed?: number;
  firstPlayer?: PlayerId;
  names?: [string, string];
}

export function other(p: PlayerId): PlayerId {
  return (1 - p) as PlayerId;
}

export function isExtraDeckMonster(def: CardDef): boolean {
  return def.monsterKind === 'fusion' || def.monsterKind === 'synchro' || def.monsterKind === 'xyz';
}

export function isFieldLocation(loc: Location): boolean {
  return loc === 'mzone' || loc === 'szone' || loc === 'fzone';
}

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Duel {
  cards: CardInstance[] = [];
  players: [PlayerState, PlayerState];
  names: [string, string];
  turn = 0;
  turnPlayer: PlayerId = 0;
  firstPlayer: PlayerId = 0;
  phase: Phase = 'draw';
  battleStep: BattleStep | null = null;
  damageStep: DamageSubStep | null = null;
  battle: BattleState | null = null;
  endBattleRequested = false;
  chain: ChainLink[] = [];
  resolvingLink: ChainLink | null = null;
  /** Once-per-turn usage keys for the current turn. */
  opt = new Set<string>();
  pendingTriggers: PendingTrigger[] = [];
  /** Events that opened the current response window (e.g. a summon or an attack declaration). */
  windowEvents: DuelEvent[] | null = null;
  events: DuelEvent[] = [];
  seq = 0;
  group = 0;
  /** Group id of the most recent thing that "happened" (for missing-timing checks). */
  lastGroup = 0;
  log: LogEntry[] = [];
  winner: PlayerId | null | undefined = undefined;
  endReason = '';
  rng: () => number;
  controllers: [Controller, Controller];
  listeners: Array<(duel: Duel) => void> = [];
  pendingRequest: Request | null = null;

  constructor(
    decks: [CardDef[], CardDef[]],
    extras: [CardDef[], CardDef[]],
    controllers: [Controller, Controller],
    options: DuelOptions = {},
  ) {
    this.controllers = controllers;
    this.rng = makeRng(options.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.names = options.names ?? ['Player 1', 'Player 2'];
    this.firstPlayer = options.firstPlayer ?? (this.rng() < 0.5 ? 0 : 1);
    const mk = (id: PlayerId): PlayerState => ({
      id,
      lp: START_LP,
      deck: [],
      hand: [],
      gy: [],
      banished: [],
      extra: [],
      mzone: Array(MZONES).fill(null),
      szone: Array(SZONES).fill(null),
      fzone: null,
      normalSummonUsed: false,
    });
    this.players = [mk(0), mk(1)];
    for (const p of [0, 1] as PlayerId[]) {
      for (const def of decks[p]) this.players[p].deck.push(this.createCard(def, p, 'deck').uid);
      for (const def of extras[p]) this.players[p].extra.push(this.createCard(def, p, 'extra').uid);
      this.shuffle(this.players[p].deck);
    }
  }

  private createCard(def: CardDef, owner: PlayerId, location: Location): CardInstance {
    const card: CardInstance = {
      uid: this.cards.length,
      def,
      owner,
      controller: owner,
      location,
      faceUp: false,
      position: 'atk',
      version: 0,
      summonType: null,
      properlySummoned: false,
      enteredTurn: -1,
      positionChangedTurn: -1,
      attacksThisTurn: 0,
      overlay: [],
      equippedTo: null,
      buffs: [],
    };
    this.cards.push(card);
    return card;
  }

  // ---------------------------------------------------------------- basics

  card(uid: number): CardInstance {
    return this.cards[uid];
  }

  shuffle(arr: number[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  notify(): void {
    for (const l of this.listeners) l(this);
  }

  addLog(text: string, player?: PlayerId): void {
    this.log.push({ turn: this.turn, player, text });
    this.notify();
  }

  cardName(uid: number, forceReveal = false): string {
    const c = this.card(uid);
    if (!forceReveal && isFieldLocation(c.location) && !c.faceUp) return '뒷면 카드';
    return `「${c.def.name}」`;
  }

  async ask(req: Request): Promise<Answer> {
    this.pendingRequest = req;
    this.notify();
    const ans = await this.controllers[req.player].choose(req, this);
    this.pendingRequest = null;
    return ans;
  }

  // ---------------------------------------------------------------- queries

  list(p: PlayerId, loc: Location): number[] {
    const ps = this.players[p];
    switch (loc) {
      case 'deck':
        return ps.deck;
      case 'hand':
        return ps.hand;
      case 'gy':
        return ps.gy;
      case 'banished':
        return ps.banished;
      case 'extra':
        return ps.extra;
      case 'mzone':
        return ps.mzone.filter((x): x is number => x !== null);
      case 'szone':
        return ps.szone.filter((x): x is number => x !== null);
      case 'fzone':
        return ps.fzone === null ? [] : [ps.fzone];
      case 'overlay':
        return ps.mzone.flatMap((x) => (x === null ? [] : this.card(x).overlay));
    }
  }

  cardsIn(p: PlayerId, locs: Location[], filter?: (c: CardInstance) => boolean): CardInstance[] {
    const out: CardInstance[] = [];
    for (const loc of locs) {
      for (const uid of this.list(p, loc)) {
        const c = this.card(uid);
        if (!filter || filter(c)) out.push(c);
      }
    }
    return out;
  }

  monsters(p: PlayerId, filter?: (c: CardInstance) => boolean): CardInstance[] {
    return this.cardsIn(p, ['mzone'], filter);
  }

  faceUpMonsters(p: PlayerId): CardInstance[] {
    return this.monsters(p, (c) => c.faceUp);
  }

  spellTraps(p: PlayerId): CardInstance[] {
    return this.cardsIn(p, ['szone', 'fzone']);
  }

  fieldCards(p: PlayerId): CardInstance[] {
    return this.cardsIn(p, ['mzone', 'szone', 'fzone']);
  }

  freeMZones(p: PlayerId): number {
    return this.players[p].mzone.filter((x) => x === null).length;
  }

  freeSZones(p: PlayerId): number {
    return this.players[p].szone.filter((x) => x === null).length;
  }

  isOnField(c: CardInstance): boolean {
    return isFieldLocation(c.location);
  }

  isMonster(c: CardInstance): boolean {
    return c.def.category === 'monster';
  }

  level(c: CardInstance): number {
    return c.def.level ?? 0;
  }

  // ---------------------------------------------------------------- stats & continuous effects

  private buffActive(b: Buff): boolean {
    if (!b.whileSource) return true;
    const src = this.card(b.whileSource.uid);
    return src.version === b.whileSource.version && this.isOnField(src) && src.faceUp;
  }

  /** True if the card's effects are negated (only buffs can negate; avoids recursive evaluation). */
  isNegated(c: CardInstance): boolean {
    if (!this.isOnField(c)) return false;
    return c.buffs.some((b) => this.buffActive(b) && b.flags?.includes('negated'));
  }

  /** All continuous effects currently applying, as [source card, effect] pairs. */
  activeContinuous(): Array<[CardInstance, EffectDef]> {
    const out: Array<[CardInstance, EffectDef]> = [];
    for (const p of [0, 1] as PlayerId[]) {
      for (const c of this.fieldCards(p)) {
        if (!c.faceUp || this.isNegated(c)) continue;
        for (const e of c.def.effects) {
          if (e.type !== 'continuous' || !e.continuous) continue;
          const range = e.range ?? defaultRange(c.def);
          if (!range.includes(c.location)) continue;
          if (c.def.spellKind === 'equip' && !this.equipValid(c)) continue;
          out.push([c, e]);
        }
      }
    }
    return out;
  }

  equipValid(equip: CardInstance): boolean {
    const e = equip.equippedTo;
    if (!e) return false;
    const t = this.card(e.uid);
    return t.version === e.version && t.location === 'mzone' && t.faceUp;
  }

  private statOf(c: CardInstance, key: 'atk' | 'def'): number {
    const base = c.def[key] ?? 0;
    if (!this.isOnField(c) || !c.faceUp || c.location !== 'mzone') return base;
    let value = base;
    const setKey = key === 'atk' ? 'setAtk' : 'setDef';
    for (const b of c.buffs) if (this.buffActive(b) && b[setKey] !== undefined) value = b[setKey]!;
    for (const b of c.buffs) if (this.buffActive(b) && b[key]) value += b[key]!;
    for (const [src, e] of this.activeContinuous()) {
      const spec = e.continuous!;
      const mod = spec[key];
      if (mod === undefined || !spec.affects(this, src, c)) continue;
      value += typeof mod === 'number' ? mod : mod(this, src, c);
    }
    return Math.max(0, value);
  }

  atk(c: CardInstance): number {
    return this.statOf(c, 'atk');
  }

  defense(c: CardInstance): number {
    return this.statOf(c, 'def');
  }

  hasFlag(c: CardInstance, flag: Flag): boolean {
    if (!this.isOnField(c)) return false;
    if (c.buffs.some((b) => this.buffActive(b) && b.flags?.includes(flag))) return true;
    if (flag === 'negated') return false;
    for (const [src, e] of this.activeContinuous()) {
      if (e.continuous!.flags?.includes(flag) && e.continuous!.affects(this, src, c)) return true;
    }
    return false;
  }

  addBuff(c: CardInstance, buff: Buff): void {
    c.buffs.push(buff);
    this.notify();
  }

  // ---------------------------------------------------------------- events

  newGroup(): number {
    this.group += 1;
    return this.group;
  }

  emit(ev: Omit<DuelEvent, 'seq' | 'group'> & { group?: number }, trackTiming = true): DuelEvent {
    const full: DuelEvent = { ...ev, seq: ++this.seq, group: ev.group ?? this.group };
    this.events.push(full);
    if (trackTiming) this.lastGroup = Math.max(this.lastGroup, full.group);
    this.onEvent?.(full);
    return full;
  }

  /** Set by the flow module to collect triggered effects. */
  onEvent: ((ev: DuelEvent) => void) | null = null;

  // ---------------------------------------------------------------- moving cards

  private removeFromCurrent(c: CardInstance): void {
    const ps = this.players[c.controller];
    switch (c.location) {
      case 'mzone':
        ps.mzone[ps.mzone.indexOf(c.uid)] = null;
        break;
      case 'szone':
        ps.szone[ps.szone.indexOf(c.uid)] = null;
        break;
      case 'fzone':
        ps.fzone = null;
        break;
      case 'overlay':
        for (const p of this.players)
          for (const m of p.mzone) {
            if (m === null) continue;
            const host = this.card(m);
            const i = host.overlay.indexOf(c.uid);
            if (i >= 0) host.overlay.splice(i, 1);
          }
        break;
      default: {
        const arr = this.list(c.owner, c.location);
        const i = arr.indexOf(c.uid);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }

  /**
   * Low-level move. Handles leaving-the-field cleanup (buffs, equips, Xyz materials)
   * but does not emit events; callers emit the appropriate event.
   */
  place(
    c: CardInstance,
    dest: Location,
    opts: { controller?: PlayerId; faceUp?: boolean; position?: Position; bottom?: boolean; zone?: number } = {},
  ): void {
    const wasOnField = this.isOnField(c);
    const wasMonsterZone = c.location === 'mzone';
    this.removeFromCurrent(c);
    c.version += 1;
    c.buffs = [];
    c.attacksThisTurn = 0;
    if (wasOnField && !isFieldLocation(dest)) c.equippedTo = null;
    const controller = isFieldLocation(dest) ? (opts.controller ?? c.controller) : c.owner;
    c.controller = controller;
    c.location = dest;
    const ps = this.players[controller];
    switch (dest) {
      case 'mzone': {
        const i = opts.zone !== undefined && ps.mzone[opts.zone] === null ? opts.zone : ps.mzone.indexOf(null);
        if (i < 0) throw new Error('No free Monster Zone');
        ps.mzone[i] = c.uid;
        c.faceUp = opts.faceUp ?? true;
        c.position = opts.position ?? 'atk';
        c.enteredTurn = this.turn;
        break;
      }
      case 'szone': {
        const i = opts.zone !== undefined && ps.szone[opts.zone] === null ? opts.zone : ps.szone.indexOf(null);
        if (i < 0) throw new Error('No free Spell & Trap Zone');
        ps.szone[i] = c.uid;
        c.faceUp = opts.faceUp ?? true;
        c.enteredTurn = this.turn;
        break;
      }
      case 'fzone':
        if (ps.fzone !== null) throw new Error('Field Zone occupied');
        ps.fzone = c.uid;
        c.faceUp = opts.faceUp ?? true;
        c.enteredTurn = this.turn;
        break;
      case 'deck':
        if (opts.bottom) ps.deck.unshift(c.uid);
        else ps.deck.push(c.uid);
        c.faceUp = false;
        break;
      case 'extra':
        ps.extra.push(c.uid);
        c.faceUp = false;
        break;
      case 'overlay':
        c.faceUp = true;
        break;
      default:
        this.list(c.owner, dest).push(c.uid);
        c.faceUp = dest !== 'hand';
    }
    if (dest !== 'mzone') c.summonType = null;

    if (wasMonsterZone && dest !== 'mzone') {
      // Xyz materials go to the GY when the Xyz Monster leaves the field.
      const mats = c.overlay.splice(0);
      for (const m of mats) {
        const mc = this.card(m);
        mc.location = 'gy';
        mc.version += 1;
        mc.faceUp = true;
        this.players[mc.owner].gy.push(m);
      }
    }
    this.notify();
  }

  /** Cards that must also leave because `c` left the field (equip spells). */
  private cascade(c: CardInstance, by: PlayerId | undefined): void {
    for (const p of [0, 1] as PlayerId[]) {
      for (const s of this.cardsIn(p, ['szone'])) {
        if (s.equippedTo && s.equippedTo.uid === c.uid && !this.equipValid(s)) {
          this.sendTo([s], 'gy', ['rule'], by);
        }
      }
    }
  }

  /** Generic move with events. Returns cards that actually moved. */
  sendTo(
    cards: CardInstance[],
    dest: 'gy' | 'banished' | 'hand' | 'deck' | 'extra',
    reasons: string[],
    by?: PlayerId,
    opts: {
      destroyed?: boolean;
      source?: number;
      shuffle?: boolean;
      bottom?: boolean;
      group?: number;
      noTiming?: boolean;
    } = {},
  ): CardInstance[] {
    const group = opts.group ?? this.newGroup();
    const moved: CardInstance[] = [];
    const deckPlayers = new Set<PlayerId>();
    for (const c of cards) {
      const from = c.location;
      const prevController = c.controller;
      const fromField = this.isOnField(c);
      let realDest: Location = dest;
      // Extra Deck monsters return to the Extra Deck instead of hand/deck.
      if ((dest === 'hand' || dest === 'deck') && isExtraDeckMonster(c.def)) realDest = 'extra';
      this.place(c, realDest, { bottom: opts.bottom });
      if (realDest === 'deck') deckPlayers.add(c.owner);
      moved.push(c);
      const base = { card: c.uid, version: c.version, player: prevController, from, reasons, by, group, source: opts.source, prevController };
      const t = !opts.noTiming;
      if (opts.destroyed) this.emit({ type: 'destroyed', ...base }, t);
      if (realDest === 'gy') this.emit({ type: 'sentToGy', ...base }, t);
      if (realDest === 'banished') this.emit({ type: 'banished', ...base }, t);
      if (realDest === 'hand') this.emit({ type: 'addedToHand', ...base }, t);
      if (fromField) this.cascade(c, by);
    }
    if (opts.shuffle !== false) for (const p of deckPlayers) if (!opts.bottom) this.shuffle(this.players[p].deck);
    return moved;
  }

  destroy(cards: CardInstance[], reasons: string[], by?: PlayerId, source?: number, group?: number): CardInstance[] {
    const valid = cards.filter((c) => {
      if (!this.isOnField(c)) return false;
      if (reasons.includes('battle') && this.hasFlag(c, 'indestructibleBattle')) return false;
      if (reasons.includes('effect') && this.hasFlag(c, 'indestructibleEffect')) return false;
      return true;
    });
    if (valid.length === 0) return [];
    for (const c of valid) this.addLog(`${this.cardName(c.uid, true)} 파괴`, c.controller);
    return this.sendTo(valid, 'gy', reasons, by, { destroyed: true, source, group });
  }

  draw(p: PlayerId, n: number, reasons: string[] = ['effect']): CardInstance[] {
    const drawn: CardInstance[] = [];
    const group = this.newGroup();
    for (let i = 0; i < n; i++) {
      const deck = this.players[p].deck;
      if (deck.length === 0) {
        this.finish(other(p), `${this.names[p]}의 덱이 비어 드로우할 수 없습니다.`);
      }
      const c = this.card(deck[deck.length - 1]);
      this.place(c, 'hand');
      drawn.push(c);
      this.emit({ type: 'drawn', card: c.uid, version: c.version, player: p, from: 'deck', reasons, group });
    }
    if (n > 0) this.addLog(`${this.names[p]} 드로우 ${n}장`, p);
    return drawn;
  }

  damage(p: PlayerId, amount: number, reasons: string[], by?: PlayerId): void {
    if (amount <= 0) return;
    this.players[p].lp = Math.max(0, this.players[p].lp - amount);
    this.addLog(`${this.names[p]} ${amount} 데미지 (LP ${this.players[p].lp})`, p);
    this.emit({ type: 'damaged', player: p, amount, reasons, by, group: this.newGroup() });
    this.checkLp();
  }

  gainLp(p: PlayerId, amount: number): void {
    this.players[p].lp += amount;
    this.addLog(`${this.names[p]} LP ${amount} 회복 (LP ${this.players[p].lp})`, p);
  }

  payLp(p: PlayerId, amount: number): void {
    this.players[p].lp = Math.max(0, this.players[p].lp - amount);
    this.addLog(`${this.names[p]} LP ${amount} 지불 (LP ${this.players[p].lp})`, p);
    this.checkLp();
  }

  checkLp(): void {
    const dead = ([0, 1] as PlayerId[]).filter((p) => this.players[p].lp <= 0);
    if (dead.length === 2) this.finish(null, '양쪽 LP가 0이 되어 무승부입니다.');
    if (dead.length === 1) this.finish(other(dead[0]), `${this.names[dead[0]]}의 LP가 0이 되었습니다.`);
  }

  finish(winner: PlayerId | null, reason: string): never {
    this.winner = winner;
    this.endReason = reason;
    this.addLog(reason);
    throw new DuelOver(winner, reason);
  }

  /**
   * Let `p` pick which free zone `c` goes to. With a single free zone nothing is asked.
   * Returns the zone index, or null when the player cancelled (only possible if `cancellable`).
   */
  async chooseZone(p: PlayerId, kind: 'mzone' | 'szone', c: CardInstance, cancellable = false): Promise<number | null> {
    const zones = kind === 'mzone' ? this.players[p].mzone : this.players[p].szone;
    const free = zones.flatMap((u, i) => (u === null ? [i] : []));
    if (free.length === 0) throw new Error(`No free ${kind}`);
    if (free.length === 1 && !cancellable) return free[0];
    const what = kind === 'mzone' ? '몬스터 존' : '마법·함정 존';
    const ans = await this.ask({
      type: 'zone',
      player: p,
      kind,
      uid: c.uid,
      free,
      prompt: `${this.cardName(c.uid, true)}을(를) 놓을 ${what}을 선택하세요.`,
      cancellable,
    });
    if (ans === null && cancellable) return null;
    return typeof ans === 'number' && free.includes(ans) ? ans : free[0];
  }

  /** Put a monster on the field as a summon and emit the event. */
  summonToField(
    c: CardInstance,
    p: PlayerId,
    type: SummonType,
    position: Position,
    faceUp = true,
    zone?: number,
  ): void {
    this.place(c, 'mzone', { controller: p, faceUp, position, zone });
    c.summonType = type;
    c.positionChangedTurn = -1;
    if (type === 'fusion' || type === 'synchro' || type === 'xyz' || type === 'ritual') c.properlySummoned = true;
    if (!faceUp) {
      this.addLog(`${this.names[p]} 몬스터 세트`, p);
      return;
    }
    const label: Record<SummonType, string> = {
      normal: '일반 소환',
      tribute: '어드밴스 소환',
      flip: '반전 소환',
      special: '특수 소환',
      fusion: '융합 소환',
      synchro: '싱크로 소환',
      xyz: '엑시즈 소환',
      ritual: '의식 소환',
    };
    this.addLog(`${this.names[p]} ${this.cardName(c.uid)} ${label[type]}`, p);
    this.emit({ type: 'summoned', card: c.uid, version: c.version, player: p, summonType: type, group: this.newGroup() });
  }

  /** Nomi rule: Extra Deck / Ritual monsters must be properly summoned before being revived. */
  canBeSpecialSummoned(c: CardInstance): boolean {
    const k = c.def.monsterKind;
    if (c.def.category !== 'monster') return false;
    if (k === 'fusion' || k === 'synchro' || k === 'xyz') return c.location !== 'extra' && c.properlySummoned;
    if (k === 'ritual') return c.properlySummoned;
    return true;
  }

  flipFaceUp(c: CardInstance, position: Position, by?: PlayerId): void {
    c.faceUp = true;
    c.position = position;
    this.addLog(`${this.cardName(c.uid)} 반전`, c.controller);
    this.emit({ type: 'flipped', card: c.uid, version: c.version, player: c.controller, by, group: this.newGroup() });
  }
}

export function defaultRange(def: CardDef): Location[] {
  if (def.category === 'monster') return ['mzone'];
  if (def.spellKind === 'field') return ['fzone'];
  return ['szone'];
}
