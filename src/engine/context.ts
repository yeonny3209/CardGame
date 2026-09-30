// The API card scripts use to query and change the duel.
import { Duel, other } from './core';
import type {
  Buff,
  CardInstance,
  ChainLink,
  DuelEvent,
  EffectDef,
  Location,
  PlayerId,
  Position,
  SelectPurpose,
  SummonType,
} from './types';

export class EffectContext {
  constructor(
    public duel: Duel,
    public uid: number,
    public player: PlayerId,
    public effect: EffectDef,
    public effIndex: number,
    public link?: ChainLink,
    public event?: DuelEvent,
  ) {}

  get self(): CardInstance {
    return this.duel.card(this.uid);
  }

  get opp(): PlayerId {
    return other(this.player);
  }

  /** Version of the card when the effect was activated (for "this card" checks at resolution). */
  get selfStillThere(): boolean {
    return !this.link || this.self.version === this.link.version;
  }

  /** Targets that are still valid (same card, not moved since targeting). */
  get targets(): CardInstance[] {
    if (!this.link) return [];
    return this.link.targets
      .map((t) => ({ c: this.duel.card(t.uid), v: t.version }))
      .filter(({ c, v }) => c.version === v)
      .map(({ c }) => c);
  }

  get target(): CardInstance | undefined {
    return this.targets[0];
  }

  // ------------------------------------------------------------ queries

  cards(p: PlayerId, locs: Location[], filter?: (c: CardInstance) => boolean): CardInstance[] {
    return this.duel.cardsIn(p, locs, filter);
  }

  monsters(p: PlayerId, filter?: (c: CardInstance) => boolean): CardInstance[] {
    return this.duel.monsters(p, filter);
  }

  faceUpMonsters(p: PlayerId, filter?: (c: CardInstance) => boolean): CardInstance[] {
    return this.duel.monsters(p, (c) => c.faceUp && (!filter || filter(c)));
  }

  allFieldCards(filter?: (c: CardInstance) => boolean): CardInstance[] {
    return [...this.duel.fieldCards(0), ...this.duel.fieldCards(1)].filter((c) => !filter || filter(c));
  }

  atk(c: CardInstance): number {
    return this.duel.atk(c);
  }

  /** Can this card be chosen as a target by this effect's controller? */
  targetable(c: CardInstance): boolean {
    return !(c.controller !== this.player && this.duel.isOnField(c) && this.duel.hasFlag(c, 'untargetable'));
  }

  inChainOf(p: PlayerId): ChainLink | undefined {
    const top = this.duel.chain[this.duel.chain.length - 1];
    return top && top.player === p ? top : undefined;
  }

  /** Link this effect is responding to (the link directly below it, or the top of the chain before activation). */
  get respondingTo(): ChainLink | undefined {
    const ch = this.duel.chain;
    if (this.link) return ch.find((l) => l.index === this.link!.index - 1);
    return ch[ch.length - 1];
  }

  // ------------------------------------------------------------ choices

  async select(
    candidates: CardInstance[],
    opts: { prompt: string; min?: number; max?: number; purpose?: SelectPurpose; player?: PlayerId },
  ): Promise<CardInstance[]> {
    const min = Math.min(opts.min ?? 1, candidates.length);
    const max = Math.min(opts.max ?? opts.min ?? 1, candidates.length);
    if (candidates.length === 0 || max === 0) return [];
    const ans = await this.duel.ask({
      type: 'select',
      player: opts.player ?? this.player,
      prompt: opts.prompt,
      candidates: candidates.map((c) => c.uid),
      min,
      max,
      purpose: opts.purpose ?? 'neutral',
    });
    return sanitizeSelection(ans, candidates, min, max).map((u) => this.duel.card(u));
  }

  async option(prompt: string, options: string[], player?: PlayerId): Promise<number> {
    if (options.length <= 1) return 0;
    const ans = await this.duel.ask({ type: 'option', player: player ?? this.player, prompt, options });
    return typeof ans === 'number' && ans >= 0 && ans < options.length ? ans : 0;
  }

  async yesno(prompt: string, player?: PlayerId): Promise<boolean> {
    const ans = await this.duel.ask({ type: 'yesno', player: player ?? this.player, prompt });
    return ans === true;
  }

  async choosePosition(c: CardInstance, player?: PlayerId): Promise<Position> {
    const ans = await this.duel.ask({
      type: 'position',
      player: player ?? this.player,
      uid: c.uid,
      prompt: `${c.def.name}의 표시 형식`,
    });
    return ans === 'def' ? 'def' : 'atk';
  }

  // ------------------------------------------------------------ actions

  draw(n: number, p: PlayerId = this.player): CardInstance[] {
    return this.duel.draw(p, n, ['effect']);
  }

  destroy(cards: CardInstance[]): CardInstance[] {
    return this.duel.destroy(cards, ['effect'], this.player, this.uid);
  }

  sendToGy(cards: CardInstance[], reasons: string[] = ['effect']): CardInstance[] {
    if (cards.length === 0) return [];
    for (const c of cards) this.duel.addLog(`${this.duel.cardName(c.uid, true)} 묘지로`, c.controller);
    return this.duel.sendTo(cards, 'gy', reasons, this.player, { source: this.uid });
  }

  banish(cards: CardInstance[], reasons: string[] = ['effect']): CardInstance[] {
    if (cards.length === 0) return [];
    for (const c of cards) this.duel.addLog(`${this.duel.cardName(c.uid, true)} 제외`, c.controller);
    return this.duel.sendTo(cards, 'banished', reasons, this.player, { source: this.uid });
  }

  toHand(cards: CardInstance[], reasons: string[] = ['effect']): CardInstance[] {
    if (cards.length === 0) return [];
    for (const c of cards) this.duel.addLog(`${this.duel.cardName(c.uid, true)} 패로`, c.owner);
    return this.duel.sendTo(cards, 'hand', reasons, this.player, { source: this.uid });
  }

  toDeck(cards: CardInstance[], reasons: string[] = ['effect']): CardInstance[] {
    if (cards.length === 0) return [];
    for (const c of cards) this.duel.addLog(`${this.duel.cardName(c.uid, true)} 덱으로`, c.owner);
    return this.duel.sendTo(cards, 'deck', reasons, this.player, { source: this.uid });
  }

  /** Select a card from the deck matching `filter` and add it to the hand. */
  async search(filter: (c: CardInstance) => boolean, prompt = '패에 넣을 카드를 선택'): Promise<CardInstance | undefined> {
    const cands = this.cards(this.player, ['deck'], filter);
    const [c] = await this.select(cands, { prompt, purpose: 'benefit' });
    if (!c) return undefined;
    this.toHand([c]);
    this.duel.shuffle(this.duel.players[this.player].deck);
    return c;
  }

  async discard(n: number, filter?: (c: CardInstance) => boolean, reasons: string[] = ['discard', 'effect']): Promise<CardInstance[]> {
    const cands = this.cards(this.player, ['hand'], filter);
    const chosen = await this.select(cands, { prompt: `버릴 카드 ${n}장 선택`, min: n, max: n, purpose: 'cost' });
    if (chosen.length === 0) return [];
    for (const c of chosen) this.duel.addLog(`${this.duel.cardName(c.uid, true)} 버림`, c.owner);
    return this.duel.sendTo(chosen, 'gy', reasons, this.player, { source: this.uid });
  }

  canSpecialSummon(c: CardInstance, p: PlayerId = this.player): boolean {
    return this.duel.freeMZones(p) > 0 && this.duel.canBeSpecialSummoned(c);
  }

  async specialSummon(
    c: CardInstance,
    opts: { position?: Position; type?: SummonType; player?: PlayerId } = {},
  ): Promise<boolean> {
    const p = opts.player ?? this.player;
    if (this.duel.freeMZones(p) === 0) return false;
    if ((opts.type ?? 'special') === 'special' && !this.duel.canBeSpecialSummoned(c)) return false;
    const pos = opts.position ?? (await this.choosePosition(c, p));
    this.duel.summonToField(c, p, opts.type ?? 'special', pos);
    return true;
  }

  damage(p: PlayerId, amount: number): void {
    this.duel.damage(p, amount, ['effect'], this.player);
  }

  gainLp(amount: number, p: PlayerId = this.player): void {
    this.duel.gainLp(p, amount);
  }

  /** Apply a stat/flag change. `whileSelf` ties it to this card staying on the field. */
  buff(c: CardInstance, buff: Omit<Buff, 'until'> & { until?: Buff['until'] }, whileSelf = false): void {
    if (!this.duel.isOnField(c)) return;
    const b: Buff = { until: 'permanent', ...buff };
    if (whileSelf) b.whileSource = { uid: this.uid, version: this.self.version };
    this.duel.addBuff(c, b);
    const parts: string[] = [];
    if (buff.atk) parts.push(`ATK ${buff.atk > 0 ? '+' : ''}${buff.atk}`);
    if (buff.def) parts.push(`DEF ${buff.def > 0 ? '+' : ''}${buff.def}`);
    if (buff.setAtk !== undefined) parts.push(`ATK → ${buff.setAtk}`);
    if (buff.flags?.includes('negated')) parts.push('효과 무효');
    if (parts.length) this.duel.addLog(`${this.duel.cardName(c.uid)} ${parts.join(', ')}`, c.controller);
  }

  negateLink(link: ChainLink, kind: 'activation' | 'effect'): void {
    link.negated = kind;
    this.duel.addLog(`체인 ${link.index} ${kind === 'activation' ? '발동 무효' : '효과 무효'}`, this.player);
  }

  endBattlePhase(): void {
    if (this.duel.phase === 'battle') {
      this.duel.endBattleRequested = true;
      this.duel.addLog('배틀 페이즈 종료', this.player);
    }
  }
}

export function sanitizeSelection(ans: unknown, candidates: CardInstance[], min: number, max: number): number[] {
  const allowed = new Set(candidates.map((c) => c.uid));
  let picked = Array.isArray(ans) ? [...new Set(ans.filter((u) => typeof u === 'number' && allowed.has(u)))] : [];
  if (picked.length > max) picked = picked.slice(0, max);
  if (picked.length < min) {
    for (const c of candidates) {
      if (picked.length >= min) break;
      if (!picked.includes(c.uid)) picked.push(c.uid);
    }
  }
  return picked;
}
