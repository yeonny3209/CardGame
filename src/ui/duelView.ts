// The duel screen: board rendering and the human player's controller.
import { AIController } from '../ai/ai';
import { Duel } from '../engine/core';
import { runDuel } from '../engine/flow';
import type { ActionOption, Answer, CardDef, CardInstance, Controller, PlayerId, Request } from '../engine/types';
import type { Deck } from '../deck/deck';
import { toDefs } from '../deck/deck';
import { cardBack, cardFace, detailHtml, fieldCard } from './cardView';
import type { OnlineSession } from '../net/session';
import { askConfirm } from './dialog';

export type DuelSetup = { kind: 'ai'; myDeck: Deck; aiDeck: Deck } | { kind: 'online'; session: OnlineSession; myDeck: Deck; oppDeck: Deck; seed: number };

const PHASES: Array<[string, string]> = [
  ['draw', 'DP'],
  ['standby', 'SP'],
  ['main1', 'M1'],
  ['battle', 'BP'],
  ['main2', 'M2'],
  ['end', 'EP'],
];

const LOC_LABEL: Record<string, string> = {
  hand: '패',
  mzone: '몬스터 존',
  szone: '마법·함정 존',
  fzone: '필드 존',
  gy: '묘지',
  banished: '제외',
  deck: '덱',
  extra: '엑스트라 덱',
  overlay: '엑시즈 소재',
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function actionLabel(duel: Duel, o: ActionOption): string {
  switch (o.kind) {
    case 'normalSummon':
      return o.tributes ? `어드밴스 소환 (릴리스 ${o.tributes})` : '일반 소환';
    case 'setMonster':
      return o.tributes ? `세트 (릴리스 ${o.tributes})` : '세트';
    case 'flipSummon':
      return '반전 소환';
    case 'changePosition':
      return duel.card(o.uid).position === 'atk' ? '수비 표시로 변경' : '공격 표시로 변경';
    case 'setST':
      return '세트';
    case 'activate':
      return `발동: ${o.label}`;
    case 'procedure':
      return `특수 소환: ${o.label}`;
    case 'extraSummon':
      return o.method === 'synchro' ? '싱크로 소환' : '엑시즈 소환';
    case 'attack':
      return '공격';
    case 'toBattle':
      return '배틀 페이즈로 ▶';
    case 'toMain2':
      return '메인 페이즈 2로 ▶';
    case 'endTurn':
      return '턴 종료 ⏭';
  }
}

const CHAIN_MODE_KEY = 'cardgame.chainMode';

function loadChainMode(): 'auto' | 'always' {
  try {
    return localStorage.getItem(CHAIN_MODE_KEY) === 'always' ? 'always' : 'auto';
  } catch {
    return 'auto';
  }
}

function saveChainMode(m: 'auto' | 'always'): void {
  try {
    localStorage.setItem(CHAIN_MODE_KEY, m);
  } catch {
    // ignore
  }
}

interface Pending {
  req: Request;
  resolve: (a: Answer) => void;
}

export class DuelScreen {
  root: HTMLElement;
  duel: Duel;
  pending: Pending | null = null;
  detail: { def: CardDef; card?: CardInstance } | null = null;
  popup: { uid: number; x: number; y: number } | null = null;
  pileView: { player: PlayerId; loc: 'gy' | 'banished' | 'extra' } | null = null;
  selection = new Set<number>();
  renderQueued = false;
  finished = false;
  chainMode: 'auto' | 'always' = loadChainMode();

  readonly me: PlayerId;
  readonly opp: PlayerId;

  constructor(
    private container: HTMLElement,
    private setup: DuelSetup,
    private onExit: () => void,
  ) {
    this.me = setup.kind === 'online' ? setup.session.seat : 0;
    this.opp = this.me === 0 ? 1 : 0;
    const human: Controller = {
      choose: (req) =>
        new Promise<Answer>((resolve) => {
          if (this.finished) return; // duel abandoned: never resume
          if (req.type === 'chain' && this.chainMode === 'auto' && !this.meaningfulWindow()) {
            resolve(-1);
            return;
          }
          this.pending = { req, resolve };
          this.selection.clear();
          this.popup = null;
          this.queueRender();
        }),
    };
    const mine = toDefs(setup.myDeck);
    if (setup.kind === 'ai') {
      const b = toDefs(setup.aiDeck);
      const ai = new AIController(this.opp, 450);
      const aiController: Controller = {
        choose: (req, d) => (this.finished ? new Promise<Answer>(() => {}) : ai.choose(req, d)),
      };
      this.duel = new Duel([mine.main, b.main], [mine.extra, b.extra], [human, aiController], { names: ['나', 'AI'] });
    } else {
      const s = setup.session;
      const theirs = toDefs(setup.oppDeck);
      const decks = this.me === 0 ? [mine, theirs] : [theirs, mine];
      const names: [string, string] = this.me === 0 ? ['나', '상대'] : ['상대', '나'];
      this.duel = new Duel([decks[0].main, decks[1].main], [decks[0].extra, decks[1].extra], s.controllers(human), { seed: setup.seed, names });
      s.onSurrender = () => this.endOnline(this.me, '상대가 항복했습니다.');
      s.onClose = () => this.endOnline(this.me, '상대와의 연결이 끊어졌습니다.');
      s.onDesync = () => this.endOnline(null, '두 사람의 게임 상태가 어긋나 듀얼을 중단했습니다.');
    }
    this.duel.listeners.push(() => this.queueRender());
    this.root = h('div', 'duel');
    container.replaceChildren(this.root);
    this.root.addEventListener('click', (e) => {
      if (this.popup && !(e.target as HTMLElement).closest('.popup, .actionable')) {
        this.popup = null;
        this.queueRender();
      }
    });
  }

  start(): void {
    this.render();
    runDuel(this.duel).then(
      () => {
        this.finished = true;
        this.render();
      },
      (err) => {
        console.error(err);
        this.duel.addLog(`오류: ${String(err)}`);
        this.finished = true;
        this.render();
      },
    );
  }

  /** In auto mode, only stop for responses when something actually happened. */
  private meaningfulWindow(): boolean {
    const d = this.duel;
    if (d.chain.length > 0) return true;
    if (d.windowEvents?.some((e) => e.type === 'summoned' || e.type === 'attackDeclared')) return true;
    if (d.damageStep !== null && d.damageStep !== 'end' && d.damageStep !== 'afterCalc') return true;
    // Give a chance at the opponent's End Phase (the classic moment to use set cards).
    if (d.phase === 'end' && d.turnPlayer !== this.me && d.windowEvents?.some((e) => e.type === 'phaseStart')) return true;
    return false;
  }

  /** An online duel that ends outside the engine: surrender, disconnect or a state mismatch. */
  private endOnline(winner: PlayerId | null, reason: string): void {
    if (this.finished) return;
    const d = this.duel;
    d.winner = winner;
    d.endReason = reason;
    d.addLog(reason);
    this.finished = true;
    this.pending = null;
    this.render();
  }

  private surrender(): void {
    if (this.setup.kind === 'online') this.setup.session.surrender();
    const d = this.duel;
    d.winner = this.opp;
    d.endReason = '항복했습니다.';
    d.addLog(d.endReason);
    this.finished = true;
    this.pending = null;
    this.render();
  }

  private answer(a: Answer): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.popup = null;
    this.selection.clear();
    this.render();
    p.resolve(a);
  }

  queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  // ------------------------------------------------------------ option lookup

  /** Map of card uid -> indices of options the human may take with that card. */
  private cardOptions(): Map<number, number[]> {
    const map = new Map<number, number[]>();
    const req = this.pending?.req;
    if (!req) return map;
    if (req.type === 'action') {
      req.options.forEach((o, i) => {
        if ('uid' in o) map.set(o.uid, [...(map.get(o.uid) ?? []), i]);
      });
    } else if (req.type === 'chain') {
      req.options.forEach((o, i) => map.set(o.uid, [...(map.get(o.uid) ?? []), i]));
    }
    return map;
  }

  private optionLabel(i: number): string {
    const req = this.pending!.req;
    if (req.type === 'action') return actionLabel(this.duel, req.options[i]);
    if (req.type === 'chain') return `발동: ${req.options[i].label}`;
    return '';
  }

  // ------------------------------------------------------------ rendering

  render(): void {
    const d = this.duel;
    const opts = this.cardOptions();
    const root = this.root;
    root.replaceChildren();

    const side = h('aside', 'side');
    const detail = h('div', 'detail-slot');
    if (this.detail) detail.append(detailHtml(this.detail.def, this.detail.card ? { duel: d, card: this.detail.card } : undefined));
    else detail.append(h('div', 'hint', '카드에 마우스를 올리면 상세 정보가 표시됩니다.'));
    const tools = h('div', 'side-tools');
    const surrender = h('button', 'btn ghost', '항복');
    surrender.disabled = this.finished;
    surrender.addEventListener('click', async () => {
      if (!(await askConfirm('항복하시겠습니까?', '항복'))) return;
      this.surrender();
    });
    const mode = h('button', 'btn ghost', this.chainMode === 'auto' ? '체인 확인: 자동' : '체인 확인: 항상');
    mode.title = '자동: 소환·공격·체인·데미지 스텝·상대 엔드 페이즈에서만 묻습니다. 항상: 발동 가능한 모든 타이밍에 묻습니다.';
    mode.addEventListener('click', () => {
      this.chainMode = this.chainMode === 'auto' ? 'always' : 'auto';
      saveChainMode(this.chainMode);
      this.render();
    });
    tools.append(mode, surrender);
    side.append(tools, detail, this.renderLog());

    const board = h('main', 'board');
    board.append(this.renderHand(this.opp, opts));
    board.append(this.renderRow(this.opp, 'st', opts));
    board.append(this.renderRow(this.opp, 'mz', opts));
    board.append(this.renderMidbar());
    const prompt = this.renderPrompt();
    if (prompt) board.append(prompt);
    board.append(this.renderRow(this.me, 'mz', opts));
    board.append(this.renderRow(this.me, 'st', opts));
    board.append(this.renderHand(this.me, opts));

    root.append(board, side);
    if (this.popup) root.append(this.renderPopup(opts));
    const modal = this.renderModal(opts);
    if (modal) root.append(modal);
    if (this.finished) root.append(this.renderResult());
  }

  private canSee(c: CardInstance): boolean {
    return c.controller === this.me || c.faceUp || c.location === 'gy' || c.location === 'banished';
  }

  /** Update the side panel and, when a card list dialog is open, its own detail pane. */
  private showDetail(c: CardInstance): void {
    if (!this.canSee(c)) return;
    this.detail = { def: c.def, card: c };
    this.root.querySelectorAll('.detail-slot, .modal-detail').forEach((slot) => {
      slot.replaceChildren(detailHtml(c.def, { duel: this.duel, card: c }));
    });
  }

  /**
   * Card list dialogs dim the board, which hides the side panel. Give them a detail pane of their own,
   * starting with the card that was last hovered (or the first card in the list).
   */
  private modalDetail(uids: number[]): HTMLElement {
    const pane = h('div', 'modal-detail');
    const hovered = this.detail?.card && uids.includes(this.detail.card.uid) ? this.detail.card : null;
    const cur = hovered ?? (uids.length ? this.duel.card(uids[0]) : null);
    if (cur && this.canSee(cur)) pane.append(detailHtml(cur.def, { duel: this.duel, card: cur }));
    else pane.append(h('div', 'hint', '카드에 마우스를 올리면 효과 텍스트가 표시됩니다.'));
    return pane;
  }

  private bindCard(elm: HTMLElement, c: CardInstance, opts: Map<number, number[]>): void {
    elm.addEventListener('mouseenter', () => this.showDetail(c));
    const mine = opts.get(c.uid);
    const req = this.pending?.req;
    const isTarget = req?.type === 'attackTarget' && req.targets.includes(c.uid);
    if (mine || isTarget) elm.classList.add('actionable');
    elm.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showDetail(c);
      if (isTarget) {
        this.answer(c.uid);
        return;
      }
      if (!mine) return;
      const r = elm.getBoundingClientRect();
      this.popup = { uid: c.uid, x: r.left + r.width / 2, y: r.top };
      this.render();
    });
  }

  private renderHand(p: PlayerId, opts: Map<number, number[]>): HTMLElement {
    const row = h('div', `hand ${p === this.me ? 'me' : 'opp'}`);
    for (const uid of this.duel.players[p].hand) {
      const c = this.duel.card(uid);
      const elm = p === this.me ? cardFace(c.def, { small: true }) : cardBack(true);
      if (p === this.me) this.bindCard(elm, c, opts);
      row.append(elm);
    }
    return row;
  }

  private pile(p: PlayerId, loc: 'gy' | 'banished' | 'extra' | 'deck', opts: Map<number, number[]>): HTMLElement {
    const list = this.duel.players[p][loc];
    const cell = h('div', `zone pile pile-${loc}`);
    cell.append(h('span', 'zone-label', `${LOC_LABEL[loc]} ${list.length}`));
    if (list.length) {
      const topUid = list[list.length - 1];
      const top = this.duel.card(topUid);
      const showFace = loc === 'gy' || loc === 'banished';
      const face = showFace ? cardFace(top.def, { small: true }) : cardBack(true);
      if (showFace) face.addEventListener('mouseenter', () => this.showDetail(top));
      cell.append(face);
    }
    if (loc !== 'deck') {
      const actionable = list.some((u) => opts.has(u));
      if (actionable) cell.classList.add('actionable');
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (loc === 'extra' && p !== this.me) return;
        this.pileView = { player: p, loc };
        this.render();
      });
      cell.classList.add('clickable');
    }
    return cell;
  }

  private renderRow(p: PlayerId, kind: 'mz' | 'st', opts: Map<number, number[]>): HTMLElement {
    const d = this.duel;
    const ps = d.players[p];
    const row = h('div', `row ${kind} ${p === this.me ? 'me' : 'opp'}`);
    const zones = kind === 'mz' ? ps.mzone : ps.szone;
    const cells: HTMLElement[] = [];
    if (kind === 'mz') {
      const f = h('div', 'zone field-zone');
      f.append(h('span', 'zone-label', '필드'));
      if (ps.fzone !== null) {
        const c = d.card(ps.fzone);
        const elm = fieldCard(d, c, this.me);
        this.bindCard(elm, c, opts);
        f.append(elm);
      }
      cells.push(f);
    } else cells.push(this.pile(p, 'extra', opts));
    const zreq = this.pending?.req.type === 'zone' ? this.pending.req : null;
    const pickable = (i: number) =>
      p === this.me && zreq !== null && zreq.kind === (kind === 'mz' ? 'mzone' : 'szone') && zreq.free.includes(i);
    zones.forEach((uid, zi) => {
      const z = h('div', `zone ${kind === 'mz' ? 'mzone' : 'szone'}`);
      if (pickable(zi)) {
        z.classList.add('pick-zone');
        z.append(h('span', 'pick-label', '여기에'));
        z.addEventListener('click', (e) => {
          e.stopPropagation();
          this.answer(zi);
        });
      }
      if (uid !== null) {
        const c = d.card(uid);
        const elm = fieldCard(d, c, this.me);
        if (d.battle && (d.battle.attacker === uid || d.battle.target === uid)) elm.classList.add('in-battle');
        if (d.chain.some((l) => l.uid === uid)) elm.classList.add('chaining');
        if (d.chain.some((l) => l.targets.some((t) => t.uid === uid))) elm.classList.add('targeted');
        this.bindCard(elm, c, opts);
        z.append(elm);
      }
      cells.push(z);
    });
    if (kind === 'mz') {
      cells.push(this.pile(p, 'gy', opts));
      cells.push(this.pile(p, 'banished', opts));
    } else {
      cells.push(this.pile(p, 'deck', opts));
      cells.push(h('div', 'zone empty-slot'));
    }
    // Mirror the opponent's side like a real table.
    if (p !== this.me) cells.reverse();
    row.append(...cells);
    return row;
  }

  private renderMidbar(): HTMLElement {
    const d = this.duel;
    const bar = h('div', 'midbar');
    const lp = (p: PlayerId) => {
      const box = h('div', `lp ${p === this.me ? 'me' : 'opp'}${d.turnPlayer === p ? ' active' : ''}`);
      box.append(h('span', 'lp-name', d.names[p]), h('span', 'lp-value', String(d.players[p].lp)));
      return box;
    };
    const phases = h('div', 'phases');
    phases.append(h('span', 'turn', `턴 ${d.turn}`));
    for (const [id, label] of PHASES) {
      const chip = h('span', `phase${d.phase === id ? ' current' : ''}`, label);
      phases.append(chip);
    }
    if (d.damageStep) phases.append(h('span', 'step', '데미지 스텝'));
    bar.append(lp(this.opp), phases, lp(this.me));
    if (d.chain.length) {
      const ch = h('div', 'chain');
      for (const l of d.chain) {
        const item = h('div', `link ${l.player === this.me ? 'me' : 'opp'}`, `체인 ${l.index}: ${d.card(l.uid).def.name} — ${l.effect.label}`);
        ch.append(item);
      }
      bar.append(ch);
    }
    return bar;
  }

  private renderLog(): HTMLElement {
    const box = h('div', 'log');
    const entries = this.duel.log.slice(-150);
    for (const e of entries) {
      const line = h('div', `log-line${e.player === this.me ? ' me' : e.player === this.opp ? ' opp' : ''}${e.text.startsWith('=====') ? ' turn' : ''}`, e.text);
      box.append(line);
    }
    requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
    return box;
  }

  private renderPopup(opts: Map<number, number[]>): HTMLElement {
    const pop = h('div', 'popup');
    const { uid, x, y } = this.popup!;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 220, x - 100))}px`;
    pop.style.top = `${Math.max(8, y - 8)}px`;
    pop.style.transform = 'translateY(-100%)';
    pop.append(h('div', 'popup-title', this.duel.card(uid).def.name));
    for (const i of opts.get(uid) ?? []) {
      const b = h('button', 'btn', this.optionLabel(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pileView = null;
        this.answer(i);
      });
      pop.append(b);
    }
    return pop;
  }

  private renderPrompt(): HTMLElement | null {
    const p = this.pending;
    if (!p) {
      if (this.finished) return null;
      const w = h('div', 'prompt waiting');
      w.append(h('div', 'prompt-text', this.duel.turnPlayer === this.me ? '처리 중…' : '상대가 행동 중…'));
      return w;
    }
    const req = p.req;
    const box = h('div', 'prompt');
    const text = h('div', 'prompt-text');
    const buttons = h('div', 'prompt-buttons');
    box.append(text, buttons);
    const btn = (label: string, fn: () => void, cls = 'btn') => {
      const b = h('button', cls, label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      buttons.append(b);
    };
    switch (req.type) {
      case 'action': {
        const inBattle = this.duel.phase === 'battle';
        text.textContent = inBattle
          ? '배틀 페이즈: 공격할 몬스터를 선택하세요.'
          : '메인 페이즈: 빛나는 카드를 클릭해 행동을 선택하세요.';
        req.options.forEach((o, i) => {
          if (o.kind === 'toBattle' || o.kind === 'toMain2' || o.kind === 'endTurn') btn(actionLabel(this.duel, o), () => this.answer(i), 'btn primary');
        });
        break;
      }
      case 'chain':
        text.textContent = req.prompt;
        req.options.forEach((o, i) => btn(`${this.duel.card(o.uid).def.name}: ${o.label}`, () => this.answer(i)));
        btn('패스', () => this.answer(-1), 'btn ghost');
        break;
      case 'yesno':
        text.textContent = req.prompt;
        btn('예', () => this.answer(true), 'btn primary');
        btn('아니오', () => this.answer(false), 'btn ghost');
        break;
      case 'option':
        text.textContent = req.prompt;
        req.options.forEach((o, i) => btn(o, () => this.answer(i)));
        break;
      case 'position':
        text.textContent = `${req.prompt}을(를) 선택하세요.`;
        btn('공격 표시', () => this.answer('atk'), 'btn primary');
        btn('수비 표시', () => this.answer('def'));
        break;
      case 'attackTarget': {
        text.textContent = `${this.duel.card(req.attacker).def.name}의 공격 대상을 선택하세요.`;
        for (const t of req.targets) {
          const c = this.duel.card(t);
          btn(c.faceUp ? `${c.def.name} (${c.position === 'atk' ? `ATK ${this.duel.atk(c)}` : `DEF ${this.duel.defense(c)}`})` : '뒷면 수비 몬스터', () => this.answer(t));
        }
        if (req.direct) btn('직접 공격', () => this.answer(-1), 'btn primary');
        btn('취소', () => this.answer(null), 'btn ghost');
        break;
      }
      case 'zone': {
        const c = this.duel.card(req.uid);
        text.textContent = `${req.prompt} 빛나는 칸을 클릭하세요.`;
        const hint = h('div', 'zone-card');
        hint.append(cardFace(c.def, { small: true }));
        box.prepend(hint);
        if (req.cancellable) btn('취소', () => this.answer(null), 'btn ghost');
        break;
      }
      case 'select':
        return null; // handled by the modal
    }
    return box;
  }

  private renderModal(opts: Map<number, number[]>): HTMLElement | null {
    const req = this.pending?.req;
    if (req?.type === 'select') return this.renderSelect(req);
    if (!this.pileView) return null;
    const { player, loc } = this.pileView;
    const overlay = h('div', 'modal-backdrop');
    const modal = h('div', 'modal wide');
    modal.append(h('h3', '', `${this.duel.names[player]}의 ${LOC_LABEL[loc]} (${this.duel.players[player][loc].length}장)`));
    const grid = h('div', 'card-grid');
    for (const uid of [...this.duel.players[player][loc]].reverse()) {
      const c = this.duel.card(uid);
      const face = cardFace(c.def, { small: true });
      this.bindCard(face, c, opts);
      grid.append(face);
    }
    if (!grid.childElementCount) grid.append(h('div', 'hint', '카드가 없습니다.'));
    const close = h('button', 'btn ghost', '닫기');
    close.addEventListener('click', () => {
      this.pileView = null;
      this.render();
    });
    const main = h('div', 'modal-main');
    main.append(grid, close);
    const body = h('div', 'modal-body');
    body.append(main, this.modalDetail(this.duel.players[player][loc]));
    modal.append(body);
    overlay.append(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.pileView = null;
        this.render();
      }
    });
    return overlay;
  }

  private renderSelect(req: Extract<Request, { type: 'select' }>): HTMLElement {
    const d = this.duel;
    const overlay = h('div', 'modal-backdrop');
    const modal = h('div', 'modal wide');
    modal.append(h('h3', '', req.prompt));
    modal.append(h('div', 'hint', req.min === req.max ? `${req.min}장 선택` : `${req.min}~${req.max}장 선택`));
    const grid = h('div', 'card-grid');
    const confirm = h('button', 'btn primary', '확정');
    const update = () => {
      const n = this.selection.size;
      confirm.disabled = n < req.min || n > req.max;
      confirm.textContent = `확정 (${n})`;
    };
    for (const uid of req.candidates) {
      const c = d.card(uid);
      const wrap = h('div', 'choice');
      const visible = c.faceUp || c.owner === this.me || c.location === 'gy' || c.location === 'banished';
      const face = visible
        ? cardFace(c.def, { small: true, stats: c.location === 'mzone' && c.faceUp ? { atk: d.atk(c), def: d.defense(c) } : undefined })
        : cardBack(true);
      face.addEventListener('mouseenter', () => this.showDetail(c));
      const owner = c.controller === this.me ? '나' : '상대';
      wrap.append(face, h('div', 'choice-label', `${owner} · ${LOC_LABEL[c.location]}`));
      if (this.selection.has(uid)) wrap.classList.add('chosen');
      wrap.addEventListener('click', () => {
        this.showDetail(c);
        if (this.selection.has(uid)) this.selection.delete(uid);
        else {
          if (req.max === 1) this.selection.clear();
          if (this.selection.size < req.max) this.selection.add(uid);
        }
        wrap.classList.toggle('chosen', this.selection.has(uid));
        grid.querySelectorAll('.choice').forEach((el, i) => el.classList.toggle('chosen', this.selection.has(req.candidates[i])));
        update();
      });
      grid.append(wrap);
    }
    confirm.addEventListener('click', () => this.answer([...this.selection]));
    update();
    const buttons = h('div', 'prompt-buttons');
    buttons.append(confirm);
    if (req.min === 0) {
      const skip = h('button', 'btn ghost', '선택 안 함');
      skip.addEventListener('click', () => this.answer([]));
      buttons.append(skip);
    }
    const main = h('div', 'modal-main');
    main.append(grid, buttons);
    const body = h('div', 'modal-body');
    body.append(main, this.modalDetail(req.candidates));
    modal.append(body);
    overlay.append(modal);
    return overlay;
  }

  private renderResult(): HTMLElement {
    const d = this.duel;
    const overlay = h('div', 'modal-backdrop result');
    const modal = h('div', 'modal');
    const title = d.winner === this.me ? '승리!' : d.winner === this.opp ? '패배' : '무승부';
    modal.append(h('h2', `result-title ${d.winner === this.me ? 'win' : 'lose'}`, title), h('p', '', d.endReason));
    const buttons = h('div', 'prompt-buttons');
    const again = h('button', 'btn primary', '다시 하기');
    again.addEventListener('click', () => new DuelScreen(this.container, this.setup, this.onExit).start());
    const back = h('button', 'btn', '메뉴로');
    back.addEventListener('click', () => {
      if (this.setup.kind === 'online') this.setup.session.close();
      this.onExit();
    });
    const view = h('button', 'btn ghost', '필드 보기');
    view.addEventListener('click', () => overlay.remove());
    if (this.setup.kind === 'ai') buttons.append(again);
    buttons.append(back, view);
    modal.append(buttons);
    overlay.append(modal);
    return overlay;
  }
}
