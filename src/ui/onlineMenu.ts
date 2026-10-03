// Online duel setup: two players swap connection codes by hand (chat, messenger, anywhere), then duel peer to peer.
// Everything here is optional: the rest of the game never depends on it, and without a network it is simply unusable.
import type { Deck } from '../deck/deck';
import { validateDeck } from '../deck/deck';
import { OnlineSession } from '../net/session';
import { onlineSupported, PeerLink } from '../net/peer';
import { showMessage } from './dialog';
import { DuelScreen } from './duelView';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class OnlineScreen {
  private link: PeerLink | null = null;
  private started = false;

  constructor(
    private container: HTMLElement,
    private decks: Deck[],
    private onExit: () => void,
  ) {}

  start(): void {
    this.cleanup();
    const root = h('div', 'menu online');
    this.container.replaceChildren(root);
    root.append(h('h1', 'title', '온라인 듀얼'), h('p', 'subtitle', '다른 컴퓨터·기기의 친구와 1:1로 듀얼합니다'));
    const panel = h('div', 'menu-panel');
    root.append(panel);

    if (!onlineSupported()) {
      panel.append(h('p', 'hint', '이 환경은 온라인 듀얼에 필요한 기능(WebRTC)을 지원하지 않습니다. AI 대전과 덱 편집은 그대로 사용할 수 있습니다.'));
      panel.append(this.backButton());
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      panel.append(h('p', 'hint warn', '지금은 인터넷에 연결되어 있지 않습니다. 같은 와이파이·공유기 안에서는 연결될 수도 있지만, 대부분은 인터넷이 필요합니다.'));
    }

    const label = h('label', 'field');
    label.append(h('span', '', '내 덱'));
    const sel = h('select');
    const firstValid = this.decks.findIndex((d) => validateDeck(d).length === 0);
    this.decks.forEach((d, i) => {
      const bad = validateDeck(d).length > 0;
      const o = h('option', '', bad ? `${d.name} (규칙 위반)` : d.name);
      o.value = String(i);
      o.disabled = bad;
      sel.append(o);
    });
    sel.value = String(firstValid);
    label.append(sel);
    panel.append(label);

    const host = h('button', 'btn primary big', '방 만들기 (호스트)');
    const join = h('button', 'btn big', '참가하기 (게스트)');
    host.addEventListener('click', () => this.hostFlow(root, this.decks[Number(sel.value)]));
    join.addEventListener('click', () => this.guestFlow(root, this.decks[Number(sel.value)]));
    panel.append(host, join, this.backButton());

    const help = h('div', 'rules');
    help.append(h('h3', '', '연결 방법'));
    const ul = h('ul');
    for (const t of [
      '한 명이 "방 만들기"로 호스트 코드를 만들어 상대에게 보냅니다 (메신저 등).',
      '상대는 "참가하기"에서 그 코드를 붙여 넣고 게스트 코드를 만들어 호스트에게 돌려줍니다.',
      '호스트가 게스트 코드를 붙여 넣으면 연결되고 듀얼이 시작됩니다. 호스트가 선공/후공 추첨의 시드를 정합니다.',
      '서버를 거치지 않는 직접 연결입니다. 일부 공유기·회사망에서는 연결되지 않을 수 있습니다.',
      '친구 간 대전을 전제로 한 방식이라, 양쪽 기기가 서로의 패·덱 정보를 메모리에 가지고 있습니다 (부정행위 방지는 없습니다).',
      '온라인 듀얼을 쓰지 않아도 AI 대전, 덱 편집은 인터넷 없이 그대로 동작합니다.',
    ])
      ul.append(h('li', '', t));
    help.append(ul);
    root.append(help);
  }

  private backButton(): HTMLElement {
    const b = h('button', 'btn ghost big', '← 메뉴로');
    b.addEventListener('click', () => {
      this.cleanup();
      this.onExit();
    });
    return b;
  }

  private cleanup(): void {
    if (!this.started) this.link?.close();
    this.link = null;
  }

  private codeBox(title: string, value: string): HTMLElement {
    const box = h('div', 'code-box');
    box.append(h('div', 'code-title', title));
    const area = h('textarea', 'code');
    area.readOnly = true;
    area.value = value;
    area.rows = 4;
    area.addEventListener('focus', () => area.select());
    const copy = h('button', 'btn', '코드 복사');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
        copy.textContent = '복사됨';
      } catch {
        area.select();
        copy.textContent = '직접 복사하세요';
      }
    });
    box.append(area, copy);
    return box;
  }

  private pasteBox(title: string, action: string, onSubmit: (code: string) => void): { box: HTMLElement; busy: (b: boolean) => void } {
    const box = h('div', 'code-box');
    box.append(h('div', 'code-title', title));
    const area = h('textarea', 'code');
    area.rows = 4;
    area.placeholder = 'AD1.…';
    const btn = h('button', 'btn primary', action);
    btn.addEventListener('click', () => onSubmit(area.value));
    box.append(area, btn);
    return { box, busy: (b) => (btn.disabled = area.disabled = b) };
  }

  private wipe(root: HTMLElement, heading: string): { panel: HTMLElement; status: HTMLElement } {
    root.replaceChildren(h('h1', 'title', '온라인 듀얼'), h('p', 'subtitle', heading));
    const panel = h('div', 'menu-panel');
    const status = h('p', 'hint', '');
    root.append(panel);
    return { panel, status };
  }

  private fail(msg: string): void {
    this.cleanup();
    void showMessage(msg).then(() => this.start());
  }

  private async connect(link: PeerLink, deck: Deck, role: 'host' | 'guest', status: HTMLElement): Promise<void> {
    status.textContent = '연결 중… (최대 30초)';
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('연결 시간이 초과되었습니다. 방화벽·공유기 문제일 수 있습니다.')), 30000));
    await Promise.race([link.opened, timeout]);
    status.textContent = '연결됨. 덱을 교환하는 중…';
    const session = new OnlineSession(link, role, deck);
    const shake = await Promise.race([session.handshake(), timeout]);
    this.started = true;
    new DuelScreen(this.container, { kind: 'online', session, myDeck: deck, oppDeck: shake.oppDeck, seed: shake.seed }, () => {
      session.close();
      this.onExit();
    }).start();
  }

  private async hostFlow(root: HTMLElement, deck: Deck): Promise<void> {
    if (!deck || validateDeck(deck).length) return void showMessage('사용 가능한 덱을 선택하세요.');
    const { panel, status } = this.wipe(root, '호스트: 코드를 만드는 중…');
    panel.append(status);
    const link = (this.link = new PeerLink());
    try {
      status.textContent = '연결 코드를 만드는 중… (몇 초 걸릴 수 있습니다)';
      const offer = await link.createOffer();
      panel.replaceChildren(
        this.codeBox('1. 이 호스트 코드를 상대에게 보내세요', offer),
        (() => {
          const p = this.pasteBox('2. 상대가 돌려준 게스트 코드를 붙여 넣으세요', '연결', async (code) => {
            p.busy(true);
            try {
              await link.acceptAnswer(code);
              await this.connect(link, deck, 'host', status);
            } catch (e) {
              this.fail(e instanceof Error ? e.message : String(e));
            }
          });
          return p.box;
        })(),
        status,
        this.backButton(),
      );
      status.textContent = '상대의 코드를 기다리는 중…';
      link.onClose = () => {
        if (!this.started) status.textContent = '연결이 닫혔습니다.';
      };
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private async guestFlow(root: HTMLElement, deck: Deck): Promise<void> {
    if (!deck || validateDeck(deck).length) return void showMessage('사용 가능한 덱을 선택하세요.');
    const { panel, status } = this.wipe(root, '게스트');
    const link = (this.link = new PeerLink());
    const p = this.pasteBox('1. 호스트가 보낸 코드를 붙여 넣으세요', '게스트 코드 만들기', async (code) => {
      p.busy(true);
      try {
        status.textContent = '게스트 코드를 만드는 중… (몇 초 걸릴 수 있습니다)';
        const answer = await link.acceptOffer(code);
        panel.replaceChildren(this.codeBox('2. 이 게스트 코드를 호스트에게 보내세요', answer), status, this.backButton());
        await this.connect(link, deck, 'guest', status);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : String(e));
      }
    });
    panel.append(p.box, status, this.backButton());
  }
}
