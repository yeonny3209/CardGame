// Rendering of individual cards and card details.
import { ARCHETYPE_NAMES } from '../cards/pool';
import { copyLimit } from '../deck/deck';
import type { Duel } from '../engine/core';
import type { CardDef, CardInstance } from '../engine/types';

export const ATTR_LABEL: Record<string, string> = {
  LIGHT: '빛',
  DARK: '어둠',
  FIRE: '화염',
  WATER: '물',
  EARTH: '땅',
  WIND: '바람',
};

export const RACE_LABEL: Record<string, string> = {
  Dragon: '드래곤족',
  Warrior: '전사족',
  Spellcaster: '마법사족',
  Machine: '기계족',
  Fiend: '악마족',
  Beast: '야수족',
  Aqua: '물족',
  Fairy: '천사족',
  Zombie: '언데드족',
  'Winged Beast': '비행야수족',
  Rock: '암석족',
  'Sea Serpent': '해룡족',
};

const RACE_GLYPH: Record<string, string> = {
  Dragon: '🐉',
  Warrior: '⚔️',
  Spellcaster: '🔮',
  Machine: '⚙️',
  Fiend: '😈',
  Beast: '🐗',
  Aqua: '💧',
  Fairy: '👼',
  Zombie: '💀',
  'Winged Beast': '🦅',
  Rock: '🪨',
  'Sea Serpent': '🐍',
};

const SPELL_KIND_LABEL: Record<string, string> = {
  normal: '일반 마법',
  quickplay: '속공 마법',
  continuous: '지속 마법',
  equip: '장착 마법',
  field: '필드 마법',
  ritual: '의식 마법',
};

const TRAP_KIND_LABEL: Record<string, string> = {
  normal: '일반 함정',
  continuous: '지속 함정',
  counter: '카운터 함정',
};

const SPELL_GLYPH: Record<string, string> = {
  normal: '✨',
  quickplay: '⚡',
  continuous: '♾️',
  equip: '🗡️',
  field: '🏞️',
  ritual: '🕯️',
};

const TRAP_GLYPH: Record<string, string> = { normal: '🪤', continuous: '♾️', counter: '🛡️' };

const MONSTER_KIND_LABEL: Record<string, string> = {
  normal: '일반',
  effect: '효과',
  ritual: '의식',
  fusion: '융합',
  synchro: '싱크로',
  xyz: '엑시즈',
};

export function frameClass(def: CardDef): string {
  if (def.category === 'spell') return 'f-spell';
  if (def.category === 'trap') return 'f-trap';
  return `f-${def.monsterKind ?? 'normal'}`;
}

export function typeLine(def: CardDef): string {
  if (def.category === 'spell') return SPELL_KIND_LABEL[def.spellKind ?? 'normal'];
  if (def.category === 'trap') return TRAP_KIND_LABEL[def.trapKind ?? 'normal'];
  const parts = [RACE_LABEL[def.race ?? ''] ?? def.race, MONSTER_KIND_LABEL[def.monsterKind ?? 'normal']];
  if (def.tuner) parts.push('튜너');
  return `[${parts.join(' / ')}]`;
}

function glyph(def: CardDef): string {
  if (def.category === 'spell') return SPELL_GLYPH[def.spellKind ?? 'normal'];
  if (def.category === 'trap') return TRAP_GLYPH[def.trapKind ?? 'normal'];
  return RACE_GLYPH[def.race ?? ''] ?? '❔';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function limitBadge(id: string): HTMLElement | null {
  const n = copyLimit(id);
  if (n >= 3) return null;
  const b = el('span', `limit limit-${n}`, n === 0 ? '금' : String(n));
  b.title = n === 0 ? '금지' : n === 1 ? '제한' : '준제한';
  return b;
}

/** Full-size card face (deck builder, selection dialogs). */
export function cardFace(def: CardDef, opts: { stats?: { atk: number; def: number }; small?: boolean } = {}): HTMLElement {
  const root = el('div', `card ${frameClass(def)}${opts.small ? ' small' : ''}`);
  root.dataset.id = def.id;
  const head = el('div', 'card-head');
  head.append(el('span', 'card-name', def.name));
  if (def.attribute) head.append(el('span', `attr attr-${def.attribute}`, ATTR_LABEL[def.attribute]));
  else head.append(el('span', `attr attr-${def.category}`, def.category === 'spell' ? '마' : '함'));
  root.append(head);
  if (def.category === 'monster') {
    const stars = el('div', def.monsterKind === 'xyz' ? 'stars rank' : 'stars');
    stars.textContent = `${def.monsterKind === 'xyz' ? '☆' : '★'}${def.level}`;
    root.append(stars);
  }
  const art = el('div', `art art-${def.attribute ?? def.category}`);
  art.append(el('span', 'glyph', glyph(def)));
  root.append(art);
  root.append(el('div', 'type-line', typeLine(def)));
  if (def.category === 'monster') {
    const stats = opts.stats ?? { atk: def.atk ?? 0, def: def.def ?? 0 };
    const s = el('div', 'stats');
    const a = el('span', stats.atk > (def.atk ?? 0) ? 'up' : stats.atk < (def.atk ?? 0) ? 'down' : '', `ATK ${stats.atk}`);
    const d = el('span', stats.def > (def.def ?? 0) ? 'up' : stats.def < (def.def ?? 0) ? 'down' : '', def.monsterKind === 'xyz' ? `DEF ${stats.def}` : `DEF ${stats.def}`);
    s.append(a, d);
    root.append(s);
  }
  const badge = limitBadge(def.id);
  if (badge) root.append(badge);
  return root;
}

export function cardBack(small = false): HTMLElement {
  const b = el('div', `card back${small ? ' small' : ''}`);
  b.append(el('div', 'back-emblem', '◈'));
  return b;
}

/** Card as it sits in a zone during a duel. */
export function fieldCard(duel: Duel, c: CardInstance, viewer: number): HTMLElement {
  const visible = c.faceUp || c.controller === viewer;
  if (!visible) {
    const b = cardBack(true);
    if (c.location === 'mzone' && c.position === 'def') b.classList.add('def');
    return b;
  }
  const stats = c.location === 'mzone' && c.faceUp ? { atk: duel.atk(c), def: duel.defense(c) } : undefined;
  const face = cardFace(c.def, { stats, small: true });
  if (!c.faceUp) face.classList.add('set');
  if (c.location === 'mzone' && c.position === 'def') face.classList.add('def');
  if (c.overlay.length) face.append(el('span', 'overlay-count', `소재 ${c.overlay.length}`));
  if (duel.isNegated(c)) face.classList.add('negated');
  return face;
}

export function detailHtml(def: CardDef, extra?: { duel: Duel; card: CardInstance }): HTMLElement {
  const wrap = el('div', 'detail');
  wrap.append(cardFace(def, extra && extra.card.location === 'mzone' && extra.card.faceUp ? { stats: { atk: extra.duel.atk(extra.card), def: extra.duel.defense(extra.card) } } : {}));
  const info = el('div', 'detail-info');
  info.append(el('h3', '', def.name));
  const meta: string[] = [typeLine(def)];
  if (def.category === 'monster') {
    meta.push(`${ATTR_LABEL[def.attribute ?? '']} · ${def.monsterKind === 'xyz' ? '랭크' : '레벨'} ${def.level}`);
    meta.push(`ATK ${def.atk} / DEF ${def.def}`);
  }
  if (def.archetypes?.length) meta.push(`테마: ${def.archetypes.map((a) => ARCHETYPE_NAMES[a] ?? a).join(', ')}`);
  const lim = copyLimit(def.id);
  if (lim < 3) meta.push(lim === 0 ? '금지 카드' : lim === 1 ? '제한 카드 (1장)' : '준제한 카드 (2장)');
  for (const m of meta) info.append(el('div', 'meta', m));
  const text = el('p', 'card-text');
  text.textContent = def.text;
  info.append(text);
  if (extra) {
    const c = extra.card;
    const st: string[] = [];
    if (c.overlay.length) st.push(`엑시즈 소재: ${c.overlay.map((u) => extra.duel.card(u).def.name).join(', ')}`);
    if (c.equippedTo) st.push(`장착 대상: ${extra.duel.card(c.equippedTo.uid).def.name}`);
    if (extra.duel.isNegated(c)) st.push('효과 무효 상태');
    for (const s of st) info.append(el('div', 'meta status', s));
  }
  wrap.append(info);
  return wrap;
}
