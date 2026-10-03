// Core type definitions for the duel engine.
import type { EffectContext } from './context';
import type { Duel } from './core';

export type PlayerId = 0 | 1;

export type Location =
  | 'deck'
  | 'hand'
  | 'mzone'
  | 'szone'
  | 'fzone'
  | 'gy'
  | 'banished'
  | 'extra'
  | 'overlay';

export type Phase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';
export type BattleStep = 'start' | 'battle' | 'damage' | 'end';
export type DamageSubStep = 'start' | 'beforeCalc' | 'calc' | 'afterCalc' | 'end';

export type Attribute = 'LIGHT' | 'DARK' | 'FIRE' | 'WATER' | 'EARTH' | 'WIND';
export type Race =
  | 'Dragon'
  | 'Warrior'
  | 'Spellcaster'
  | 'Machine'
  | 'Fiend'
  | 'Beast'
  | 'Aqua'
  | 'Fairy'
  | 'Zombie'
  | 'Winged Beast'
  | 'Rock'
  | 'Sea Serpent';

export type Category = 'monster' | 'spell' | 'trap';
export type MonsterKind = 'normal' | 'effect' | 'ritual' | 'fusion' | 'synchro' | 'xyz';
export type SpellKind = 'normal' | 'quickplay' | 'continuous' | 'equip' | 'field' | 'ritual';
export type TrapKind = 'normal' | 'continuous' | 'counter';

export type Position = 'atk' | 'def';

export type Flag =
  | 'piercing'
  | 'indestructibleBattle'
  | 'indestructibleEffect'
  | 'untargetable' // cannot be targeted by the opponent's card effects
  | 'cannotAttack'
  | 'directAttack'
  | 'doubleAttack'
  | 'trapSetTurn' // a Set Trap card may be activated the turn it was Set
  | 'negated'; // effects are negated

export type CardFilter = (duel: Duel, card: CardInstance) => boolean;

export interface MaterialReq {
  desc: string;
  filter: CardFilter;
}

export type MaterialSpec =
  | { type: 'fusion'; materials: MaterialReq[] }
  | { type: 'synchro'; tuner?: CardFilter; nonTuner?: CardFilter; desc: string }
  | { type: 'xyz'; count: number; filter?: CardFilter; desc: string }
  | { type: 'ritual' };

export interface CardDef {
  id: string;
  name: string;
  category: Category;
  text: string;
  archetypes?: string[];
  // Monsters
  monsterKind?: MonsterKind;
  attribute?: Attribute;
  race?: Race;
  level?: number; // Rank for Xyz monsters
  atk?: number;
  def?: number;
  tuner?: boolean;
  materials?: MaterialSpec;
  // Spells / Traps
  spellKind?: SpellKind;
  trapKind?: TrapKind;
  effects: EffectDef[];
}

export type EffectType =
  | 'ignition' // Spell Speed 1, activated in own Main Phase
  | 'quick' // Spell Speed 2 (monster quick effects)
  | 'trigger' // activates when an event happens
  | 'activate' // activation of a Spell/Trap card itself
  | 'continuous' // always-on modifier, not activated
  | 'procedure'; // inherent Special Summon procedure (not activated, cannot be chained to)

export type SelectPurpose =
  | 'harm' // selecting opponent's cards to remove / weaken
  | 'benefit' // selecting cards to gain (search, revive, buff)
  | 'cost' // selecting own cards to lose
  | 'material'
  | 'neutral';

export interface TargetSpec {
  prompt: string;
  min?: number; // default 1
  max?: number; // default = min
  filter: (ctx: EffectContext, card: CardInstance) => boolean;
  purpose?: SelectPurpose;
}

export interface CostSpec {
  check: (ctx: EffectContext) => boolean;
  pay: (ctx: EffectContext) => Promise<void>;
}

export interface ContinuousSpec {
  affects: (duel: Duel, self: CardInstance, target: CardInstance) => boolean;
  atk?: number | ((duel: Duel, self: CardInstance, target: CardInstance) => number);
  def?: number | ((duel: Duel, self: CardInstance, target: CardInstance) => number);
  flags?: Flag[];
  /** Tributes the Tribute Summon of `target` needs change by this much (negative = fewer). Does not stack. */
  tributes?: (duel: Duel, self: CardInstance, target: CardInstance) => number;
  /** How many Tributes `self` counts as when released for the Tribute Summon of `summoned` (default 1). */
  releaseValue?: (duel: Duel, self: CardInstance, summoned: CardInstance) => number;
  /** Additional Normal Summons / Sets its controller may make each turn. */
  extraNormalSummons?: number;
}

export interface EffectDef {
  label: string;
  type: EffectType;
  speed?: 1 | 2 | 3;
  /** Locations the card must be in for this effect to activate / apply. */
  range?: Location[];
  event?: DuelEventType | DuelEventType[];
  eventFilter?: (ctx: EffectContext, ev: DuelEvent) => boolean;
  /** Triggers only. Defaults to true (optional). */
  optional?: boolean;
  /** Optional "When ... you can" triggers can miss timing. */
  when?: boolean;
  /** Once per turn. 'hard' = by card name (per player), 'soft' = per card instance. */
  opt?: 'hard' | 'soft';
  /** Shared once-per-turn key (e.g. "you can only use 1 X effect per turn"). */
  optKey?: string;
  /** Can be activated during the Damage Step. */
  damageStep?: boolean;
  condition?: (ctx: EffectContext) => boolean;
  /** Trap cards only: when this returns true the card may be activated from the hand without being Set. */
  fromHand?: (ctx: EffectContext) => boolean;
  cost?: CostSpec;
  target?: TargetSpec;
  resolve?: (ctx: EffectContext) => Promise<void>;
  continuous?: ContinuousSpec;
  /** AI hint: return false to make the AI hold this activation. */
  ai?: (ctx: EffectContext) => boolean;
}

export type SummonType = 'normal' | 'tribute' | 'flip' | 'special' | 'fusion' | 'synchro' | 'xyz' | 'ritual';

export interface Buff {
  atk?: number;
  def?: number;
  setAtk?: number;
  setDef?: number;
  flags?: Flag[];
  until: 'endOfTurn' | 'permanent';
  /** The buff only applies while this card stays face-up on the field. */
  whileSource?: { uid: number; version: number };
}

export interface CardInstance {
  uid: number;
  def: CardDef;
  owner: PlayerId;
  controller: PlayerId;
  location: Location;
  faceUp: boolean;
  position: Position;
  /** Incremented every time the card changes location; identifies a "new" card for the rules. */
  version: number;
  summonType: SummonType | null;
  properlySummoned: boolean;
  enteredTurn: number; // turn the card arrived on the field
  positionChangedTurn: number;
  attacksThisTurn: number;
  overlay: number[];
  /** Tributes (counting each Tribute's value) paid for this card's Tribute Summon; 0 if it was not one. */
  summonTributes: number;
  equippedTo: { uid: number; version: number } | null;
  buffs: Buff[];
}

export type DuelEventType =
  | 'summoned'
  | 'flipped'
  | 'destroyed'
  | 'sentToGy'
  | 'banished'
  | 'addedToHand'
  | 'drawn'
  | 'attackDeclared'
  | 'damaged'
  | 'phaseStart'
  | 'activated'
  | 'detached';

export interface DuelEvent {
  type: DuelEventType;
  seq: number;
  group: number;
  card?: number;
  version?: number;
  player?: PlayerId; // controller/owner related to the event
  from?: Location;
  reasons?: string[];
  /** Player whose effect / attack caused this. */
  by?: PlayerId;
  /** Card that caused this (battle: the attacking/defending monster). */
  source?: number;
  summonType?: SummonType;
  amount?: number;
  phase?: Phase;
  /** Previous controller when the card left the field. */
  prevController?: PlayerId;
}

export interface ChainLink {
  index: number;
  player: PlayerId;
  uid: number;
  version: number;
  effIndex: number;
  effect: EffectDef;
  speed: number;
  isCardActivation: boolean;
  targets: { uid: number; version: number }[];
  event?: DuelEvent;
  negated?: 'activation' | 'effect';
  data: Record<string, unknown>;
}

export interface ActivationOption {
  uid: number;
  effIndex: number;
  label: string;
}

export type ActionOption =
  | { kind: 'normalSummon'; uid: number; tributes: number }
  | { kind: 'setMonster'; uid: number; tributes: number }
  | { kind: 'flipSummon'; uid: number }
  | { kind: 'changePosition'; uid: number }
  | { kind: 'setST'; uid: number }
  | { kind: 'activate'; uid: number; effIndex: number; label: string }
  | { kind: 'procedure'; uid: number; effIndex: number; label: string }
  | { kind: 'extraSummon'; uid: number; method: 'synchro' | 'xyz' }
  | { kind: 'attack'; uid: number }
  | { kind: 'toBattle' }
  | { kind: 'toMain2' }
  | { kind: 'endTurn' };

export type Request =
  | { type: 'action'; player: PlayerId; options: ActionOption[] }
  | { type: 'chain'; player: PlayerId; options: ActivationOption[]; prompt: string }
  | {
      type: 'select';
      player: PlayerId;
      prompt: string;
      candidates: number[];
      min: number;
      max: number;
      purpose: SelectPurpose;
    }
  | { type: 'option'; player: PlayerId; prompt: string; options: string[] }
  | { type: 'yesno'; player: PlayerId; prompt: string }
  | { type: 'position'; player: PlayerId; uid: number; prompt: string }
  | { type: 'attackTarget'; player: PlayerId; attacker: number; targets: number[]; direct: boolean }
  /** Pick which free Monster / Spell & Trap Zone (index 0-4, left to right) a card is placed in. */
  | {
      type: 'zone';
      player: PlayerId;
      kind: 'mzone' | 'szone';
      uid: number;
      free: number[];
      prompt: string;
      /** Answering null cancels the action (only offered while nothing has been paid yet). */
      cancellable: boolean;
    };

export type Answer = number | number[] | boolean | Position | null;

export interface Controller {
  choose(req: Request, duel: Duel): Promise<Answer>;
}

export interface LogEntry {
  turn: number;
  player?: PlayerId;
  text: string;
}
