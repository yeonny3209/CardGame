// Title screen: pick decks and start a duel against the AI.
import { STARTER_DECKS, loadSavedDecks, validateDeck } from '../deck/deck';
import type { Deck } from '../deck/deck';
import { DeckBuilder } from './deckBuilder';
import { showMessage } from './dialog';
import { DuelScreen } from './duelView';
import { OnlineScreen } from './onlineMenu';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const RULES = [
  '덱: 메인 40~60장, 엑스트라 0~15장, 같은 카드는 3장까지 (금지·제한·준제한 리스트 적용).',
  'LP 8000, 초기 패 5장, 선공 첫 턴은 드로우·배틀 불가, 엔드 페이즈에 패 6장 제한.',
  '페이즈: 드로우 → 스탠바이 → 메인1 → 배틀 → 메인2 → 엔드.',
  '일반 소환/세트는 턴당 1회, 레벨 5~6은 1장, 7 이상은 2장 릴리스.',
  '특수 소환: 융합(마법), 싱크로(튜너+비튜너 레벨 합), 엑시즈(같은 레벨 2장), 의식(의식 마법+레벨 합 이상 릴리스), 자체 소환 조건.',
  '소환·세트·발동할 때 몬스터 존/마법·함정 존의 어느 칸에 놓을지 직접 고를 수 있습니다.',
  '체인: 스펠 스피드 1/2/3, 역순 처리, 서로 연속 패스 시 처리. 카운터 함정만 카운터 함정에 체인 가능.',
  '유발 효과는 동시 발생 시 턴 플레이어의 강제 → 상대 강제 → 턴 플레이어 임의 → 상대 임의 순으로 체인(SEGOC).',
  '"~했을 때 발동할 수 있다" 효과는 마지막으로 일어난 일이 아니면 타이밍을 놓칩니다.',
  '데미지 스텝에서는 카운터 함정과 공격력·수비력을 바꾸는 효과만 발동 가능. 리플레이, 관통, 전투 파괴 내성 지원.',
  '세트한 함정과 속공 마법은 세트한 턴에 발동할 수 없습니다. 효과의 대상은 처리 시 다시 확인합니다.',
];

export function allDecks(): Deck[] {
  const saved = loadSavedDecks();
  return [...saved, ...STARTER_DECKS];
}

export function showMenu(container: HTMLElement): void {
  const root = h('div', 'menu');
  container.replaceChildren(root);
  root.append(h('h1', 'title', 'Arcane Duel'), h('p', 'subtitle', '체인과 스펠 스피드까지 구현한 트레이딩 카드 게임'));

  const decks = allDecks();
  const panel = h('div', 'menu-panel');
  const mkSelect = (label: string, includeRandom: boolean) => {
    const wrap = h('label', 'field');
    wrap.append(h('span', '', label));
    const s = h('select');
    if (includeRandom) {
      const o = h('option', '', '무작위 스타터 덱');
      o.value = '-1';
      s.append(o);
    }
    decks.forEach((d, i) => {
      const errs = validateDeck(d);
      const o = h('option', '', errs.length ? `${d.name} (규칙 위반)` : d.name);
      o.value = String(i);
      o.disabled = errs.length > 0;
      s.append(o);
    });
    const firstValid = decks.findIndex((d) => validateDeck(d).length === 0);
    if (!includeRandom) s.value = String(firstValid);
    wrap.append(s);
    return { wrap, s };
  };
  const mine = mkSelect('내 덱', false);
  const ai = mkSelect('AI 덱', true);
  const start = h('button', 'btn primary big', '듀얼 시작');
  start.addEventListener('click', () => {
    const myDeck = decks[Number(mine.s.value)];
    const aiIdx = Number(ai.s.value);
    const aiDeck = aiIdx < 0 ? STARTER_DECKS[Math.floor(Math.random() * STARTER_DECKS.length)] : decks[aiIdx];
    if (!myDeck || validateDeck(myDeck).length) {
      void showMessage('사용 가능한 덱을 선택하세요.');
      return;
    }
    new DuelScreen(container, { kind: 'ai', myDeck, aiDeck }, () => showMenu(container)).start();
  });
  const builder = h('button', 'btn big', '덱 편집');
  builder.addEventListener('click', () => new DeckBuilder(container, () => showMenu(container)).start());
  const online = h('button', 'btn big', '온라인 듀얼 (선택)');
  online.title = '다른 기기의 친구와 1:1 대전. 인터넷이 없어도 나머지 기능은 모두 사용할 수 있습니다.';
  online.addEventListener('click', () => {
    try {
      new OnlineScreen(container, decks, () => showMenu(container)).start();
    } catch (e) {
      console.error(e);
      void showMessage('온라인 듀얼을 시작할 수 없습니다. AI 대전과 덱 편집은 그대로 사용할 수 있습니다.');
    }
  });
  panel.append(mine.wrap, ai.wrap, start, builder, online);
  root.append(panel);

  const rules = h('div', 'rules');
  rules.append(h('h3', '', '주요 규칙'));
  const ul = h('ul');
  for (const r of RULES) ul.append(h('li', '', r));
  rules.append(ul);
  root.append(rules);
}
