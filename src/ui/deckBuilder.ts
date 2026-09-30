// Deck construction screen.
import { ALL_CARDS, ARCHETYPE_NAMES, CARD_DB } from '../cards/pool';
import {
  EXTRA_MAX,
  MAIN_MAX,
  STARTER_DECKS,
  belongsInExtra,
  copyLimit,
  countCards,
  decodeDeck,
  encodeDeck,
  loadSavedDecks,
  saveDecks,
  validateDeck,
} from '../deck/deck';
import type { Deck } from '../deck/deck';
import type { CardDef } from '../engine/types';
import { ATTR_LABEL, cardFace, detailHtml, frameClass } from './cardView';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CATEGORY_ORDER = (d: CardDef): number => {
  if (d.category === 'monster') {
    const k = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz'].indexOf(d.monsterKind ?? 'normal');
    return k;
  }
  return d.category === 'spell' ? 10 : 20;
};

export function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const da = CARD_DB[a];
    const db = CARD_DB[b];
    if (!da || !db) return 0;
    return CATEGORY_ORDER(da) - CATEGORY_ORDER(db) || (db.level ?? 0) - (da.level ?? 0) || da.name.localeCompare(db.name);
  });
}

export class DeckBuilder {
  decks: Deck[];
  current: Deck;
  currentIndex: number;
  filters = { text: '', category: '', attribute: '', archetype: '', kind: '' };
  detail: CardDef | null = null;
  dirty = false;

  constructor(
    private container: HTMLElement,
    private onExit: () => void,
  ) {
    this.decks = loadSavedDecks();
    if (this.decks.length === 0) {
      this.decks = STARTER_DECKS.map((d) => ({ ...d, name: d.name.replace('[스타터] ', '내 '), main: [...d.main], extra: [...d.extra] }));
      saveDecks(this.decks);
    }
    this.currentIndex = 0;
    this.current = this.clone(this.decks[0]);
  }

  private clone(d: Deck): Deck {
    return { name: d.name, main: [...d.main], extra: [...d.extra] };
  }

  start(): void {
    this.render();
  }

  private add(id: string): void {
    const def = CARD_DB[id];
    const counts = countCards(this.current);
    if ((counts.get(id) ?? 0) >= copyLimit(id)) return;
    if (belongsInExtra(def)) {
      if (this.current.extra.length >= EXTRA_MAX) return;
      this.current.extra.push(id);
    } else {
      if (this.current.main.length >= MAIN_MAX) return;
      this.current.main.push(id);
    }
    this.dirty = true;
    this.render();
  }

  private remove(id: string): void {
    const list = belongsInExtra(CARD_DB[id]) ? this.current.extra : this.current.main;
    const i = list.lastIndexOf(id);
    if (i >= 0) list.splice(i, 1);
    this.dirty = true;
    this.render();
  }

  private filtered(): CardDef[] {
    const f = this.filters;
    const text = f.text.trim().toLowerCase();
    return ALL_CARDS.filter((c) => {
      if (text && !c.name.toLowerCase().includes(text) && !c.text.toLowerCase().includes(text)) return false;
      if (f.category && c.category !== f.category) return false;
      if (f.attribute && c.attribute !== f.attribute) return false;
      if (f.archetype && !(f.archetype === 'none' ? !c.archetypes?.length : c.archetypes?.includes(f.archetype))) return false;
      if (f.kind) {
        const k = c.monsterKind ?? c.spellKind ?? c.trapKind;
        if (f.kind === 'tuner' ? !c.tuner : k !== f.kind) return false;
      }
      return true;
    }).sort((a, b) => CATEGORY_ORDER(a) - CATEGORY_ORDER(b) || a.name.localeCompare(b.name));
  }

  private select<T extends string>(label: string, value: string, options: Array<[T | '', string]>, onChange: (v: string) => void): HTMLElement {
    const wrap = h('label', 'field');
    wrap.append(h('span', '', label));
    const s = h('select');
    for (const [v, t] of options) {
      const o = h('option', '', t);
      o.value = v;
      if (v === value) o.selected = true;
      s.append(o);
    }
    s.addEventListener('change', () => onChange(s.value));
    wrap.append(s);
    return wrap;
  }

  render(): void {
    const root = h('div', 'builder');
    this.container.replaceChildren(root);

    // ---------------- toolbar
    const bar = h('div', 'toolbar');
    const back = h('button', 'btn ghost', '← 메뉴');
    back.addEventListener('click', () => {
      if (this.dirty && !confirm('저장하지 않은 변경 사항이 있습니다. 나가시겠습니까?')) return;
      this.onExit();
    });
    const pick = h('select', 'deck-pick');
    this.decks.forEach((d, i) => {
      const o = h('option', '', d.name);
      o.value = String(i);
      if (i === this.currentIndex) o.selected = true;
      pick.append(o);
    });
    pick.addEventListener('change', () => {
      if (this.dirty && !confirm('저장하지 않은 변경 사항을 버릴까요?')) {
        pick.value = String(this.currentIndex);
        return;
      }
      this.currentIndex = Number(pick.value);
      this.current = this.clone(this.decks[this.currentIndex]);
      this.dirty = false;
      this.render();
    });
    const name = h('input', 'deck-name');
    name.value = this.current.name;
    name.addEventListener('input', () => {
      this.current.name = name.value;
      this.dirty = true;
    });
    const mk = (label: string, fn: () => void, cls = 'btn') => {
      const b = h('button', cls, label);
      b.addEventListener('click', fn);
      return b;
    };
    bar.append(
      back,
      pick,
      name,
      mk('저장', () => {
        this.decks[this.currentIndex] = this.clone(this.current);
        saveDecks(this.decks);
        this.dirty = false;
        this.render();
      }, 'btn primary'),
      mk('새 덱', () => {
        this.decks.push({ name: `새 덱 ${this.decks.length + 1}`, main: [], extra: [] });
        this.currentIndex = this.decks.length - 1;
        this.current = this.clone(this.decks[this.currentIndex]);
        saveDecks(this.decks);
        this.dirty = false;
        this.render();
      }),
      mk('복제', () => {
        this.decks.push({ ...this.clone(this.current), name: `${this.current.name} (사본)` });
        this.currentIndex = this.decks.length - 1;
        this.current = this.clone(this.decks[this.currentIndex]);
        saveDecks(this.decks);
        this.dirty = false;
        this.render();
      }),
      mk('삭제', () => {
        if (this.decks.length <= 1 || !confirm(`「${this.current.name}」을(를) 삭제할까요?`)) return;
        this.decks.splice(this.currentIndex, 1);
        this.currentIndex = 0;
        this.current = this.clone(this.decks[0]);
        saveDecks(this.decks);
        this.dirty = false;
        this.render();
      }),
      mk('덱 코드 복사', () => {
        const code = encodeDeck(this.current);
        navigator.clipboard?.writeText(code).then(
          () => alert('덱 코드를 클립보드에 복사했습니다.'),
          () => prompt('덱 코드:', code),
        ) ?? prompt('덱 코드:', code);
      }),
      mk('덱 코드 가져오기', () => {
        const code = prompt('덱 코드를 붙여 넣으세요');
        if (!code) return;
        const deck = decodeDeck(code);
        if (!deck) {
          alert('올바른 덱 코드가 아닙니다.');
          return;
        }
        this.decks.push(deck);
        this.currentIndex = this.decks.length - 1;
        this.current = this.clone(deck);
        saveDecks(this.decks);
        this.dirty = false;
        this.render();
      }),
      mk('초기화', () => {
        if (!confirm('덱의 카드를 모두 비울까요?')) return;
        this.current.main = [];
        this.current.extra = [];
        this.dirty = true;
        this.render();
      }, 'btn ghost'),
    );
    root.append(bar);

    const body = h('div', 'builder-body');
    root.append(body);

    // ---------------- card pool
    const poolPane = h('section', 'pool');
    const filters = h('div', 'filters');
    const search = h('input', 'search');
    search.placeholder = '카드 이름·텍스트 검색';
    search.value = this.filters.text;
    search.addEventListener('input', () => {
      this.filters.text = search.value;
      this.renderPool(grid);
    });
    filters.append(
      search,
      this.select('종류', this.filters.category, [['', '전체'], ['monster', '몬스터'], ['spell', '마법'], ['trap', '함정']], (v) => {
        this.filters.category = v;
        this.render();
      }),
      this.select(
        '속성',
        this.filters.attribute,
        [['', '전체'], ...Object.entries(ATTR_LABEL).map(([k, v]) => [k, v] as [string, string])],
        (v) => {
          this.filters.attribute = v;
          this.render();
        },
      ),
      this.select(
        '테마',
        this.filters.archetype,
        [['', '전체'], ...Object.entries(ARCHETYPE_NAMES).map(([k, v]) => [k, v] as [string, string]), ['none', '범용']],
        (v) => {
          this.filters.archetype = v;
          this.render();
        },
      ),
      this.select(
        '분류',
        this.filters.kind,
        [
          ['', '전체'],
          ['normal', '일반'],
          ['effect', '효과'],
          ['tuner', '튜너'],
          ['ritual', '의식'],
          ['fusion', '융합'],
          ['synchro', '싱크로'],
          ['xyz', '엑시즈'],
          ['quickplay', '속공 마법'],
          ['continuous', '지속'],
          ['equip', '장착 마법'],
          ['field', '필드 마법'],
          ['counter', '카운터 함정'],
        ],
        (v) => {
          this.filters.kind = v;
          this.render();
        },
      ),
    );
    const grid = h('div', 'card-grid pool-grid');
    poolPane.append(filters, grid);
    this.renderPool(grid);

    // ---------------- deck list
    const deckPane = h('section', 'decklist');
    const errors = validateDeck(this.current);
    const status = h('div', `deck-status ${errors.length ? 'bad' : 'ok'}`);
    status.append(h('strong', '', errors.length ? '덱 규칙 위반' : '사용 가능한 덱'));
    for (const e of errors) status.append(h('div', '', e));
    deckPane.append(status);
    deckPane.append(this.renderList(`메인 덱 ${this.current.main.length}장`, this.current.main));
    deckPane.append(this.renderList(`엑스트라 덱 ${this.current.extra.length}장`, this.current.extra));

    // ---------------- detail
    const detailPane = h('section', 'builder-detail');
    if (this.detail) {
      detailPane.append(detailHtml(this.detail));
      const counts = countCards(this.current);
      const n = counts.get(this.detail.id) ?? 0;
      const row = h('div', 'prompt-buttons');
      const add = h('button', 'btn primary', `＋ 추가 (${n}/${copyLimit(this.detail.id)})`);
      add.disabled = n >= copyLimit(this.detail.id);
      const id = this.detail.id;
      add.addEventListener('click', () => this.add(id));
      const rem = h('button', 'btn', '－ 제거');
      rem.disabled = n === 0;
      rem.addEventListener('click', () => this.remove(id));
      row.append(add, rem);
      detailPane.append(row);
    } else detailPane.append(h('div', 'hint', '카드를 클릭하면 상세 정보가 표시됩니다. 더블클릭으로 바로 추가, 덱 목록의 ＋/－ 버튼으로 매수를 조정할 수 있습니다.'));

    body.append(poolPane, deckPane, detailPane);
  }

  private renderPool(grid: HTMLElement): void {
    grid.replaceChildren();
    const counts = countCards(this.current);
    for (const def of this.filtered()) {
      const face = cardFace(def, { small: true });
      const n = counts.get(def.id) ?? 0;
      if (n) face.append(h('span', 'in-deck', `×${n}`));
      face.addEventListener('click', () => {
        this.detail = def;
        this.render();
      });
      face.addEventListener('dblclick', () => this.add(def.id));
      grid.append(face);
    }
  }

  private renderList(title: string, ids: string[]): HTMLElement {
    const box = h('div', 'list');
    box.append(h('h4', '', title));
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const id of sortIds([...counts.keys()])) {
      const def = CARD_DB[id];
      if (!def) continue;
      const row = h('div', `list-row ${frameClass(def)}`);
      const nameEl = h('span', 'list-name', def.name);
      nameEl.addEventListener('click', () => {
        this.detail = def;
        this.render();
      });
      const minus = h('button', 'mini', '－');
      minus.addEventListener('click', () => this.remove(id));
      const plus = h('button', 'mini', '＋');
      plus.disabled = (countCards(this.current).get(id) ?? 0) >= copyLimit(id);
      plus.addEventListener('click', () => this.add(id));
      row.append(h('span', 'list-count', `×${counts.get(id)}`), nameEl, minus, plus);
      box.append(row);
    }
    if (!ids.length) box.append(h('div', 'hint', '비어 있음'));
    return box;
  }
}
