export const TAROT_KINGDOM_STATUS_EFFECTS_VERSION = 1;

const STATUS_DEFINITIONS = [
  {
    key: 'paralysis', label: '麻痺', priority: 130, iconIndex: 145, visual: 'lightning',
    durationKind: 'attack', defaultCount: 1, control: true,
    description: '次の戦闘攻撃が1回不発になる'
  },
  {
    key: 'freeze', label: '凍結', priority: 125, iconIndex: 148, visual: 'ice',
    durationKind: 'attack-or-damage', defaultCount: 1, control: true,
    description: '次の攻撃が不発。先に被弾すると割砕される'
  },
  {
    key: 'sleep', label: '睡眠', priority: 135, iconIndex: 228, visual: 'sleep',
    durationKind: 'damage', defaultCount: null, control: true,
    description: 'ダメージを受けるまで戦闘攻撃不能'
  },
  {
    key: 'silence', label: '沈黙', priority: 115, iconIndex: 229, visual: 'silence',
    durationKind: 'attack', defaultCount: 1,
    description: '次のカード行動の副次効果を封印する'
  },
  {
    key: 'confusion', label: '混乱', priority: 110, iconIndex: 222, visual: 'confusion',
    durationKind: 'attack', defaultCount: 1,
    description: '次の攻撃時、50%で自分を攻撃する'
  },
  {
    key: 'poison', label: '毒', priority: 105, iconIndex: 150, visual: 'poison',
    durationKind: 'action', defaultCount: 2,
    description: '行動開始時にダメージ。HP1で止まる'
  },
  {
    key: 'burn', label: '火傷', priority: 100, iconIndex: 144, visual: 'burn',
    durationKind: 'action', defaultCount: 2,
    description: '行動開始時にダメージ。HP1で止まる'
  },
  {
    key: 'fear', label: '恐怖', priority: 95, iconIndex: 230, visual: 'fear',
    durationKind: 'attack', defaultCount: 2,
    description: '攻撃ダメージ35%低下・クリティカル不可'
  },
  {
    key: 'blind', label: '暗闇', priority: 90, iconIndex: 68, visual: 'blind',
    durationKind: 'attack', defaultCount: 2,
    description: '攻撃の命中率が低下する'
  },
  {
    key: 'wet', label: '水浸し', priority: 85, iconIndex: 149, visual: 'wet',
    durationKind: 'action', defaultCount: 2,
    description: '火に強く、雷・麻痺・凍結に弱くなる'
  },
  {
    key: 'weaken', label: '弱体', priority: 80, iconIndex: 97, visual: 'weaken',
    durationKind: 'action', defaultCount: 2,
    description: '与えるダメージが低下する'
  },
  {
    key: 'vulnerable', label: '脆弱', priority: 75, iconIndex: 223, visual: 'vulnerable',
    durationKind: 'hit', defaultCount: 1,
    description: '次に受ける直接攻撃のダメージが増える'
  },
  {
    key: 'slow', label: '鈍足', priority: 70, iconIndex: 101, visual: 'slow',
    durationKind: 'action', defaultCount: 2,
    description: '素早さが25%低下する'
  }
];

export const TAROT_KINGDOM_STATUS_DEFINITIONS = Object.freeze(
  STATUS_DEFINITIONS.map((entry) => Object.freeze({ ...entry }))
);

export const TAROT_KINGDOM_STATUS_BY_KEY = Object.freeze(Object.fromEntries(
  TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => [entry.key, entry])
));

export const TAROT_KINGDOM_NEGATIVE_STATUS_KEYS = Object.freeze(
  TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => entry.key)
);

export const TAROT_KINGDOM_STATUS_ICON_INDEX = Object.freeze({
  ...Object.fromEntries(TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => [entry.key, entry.iconIndex])),
  break: 74,
  guard: 203,
  areaGuard: 204,
  cover: 205,
  counter: 136,
  evasion: 224,
  nextAttackUp: 137,
  nextEffectUp: 138,
  nextWandUp: 146,
  nextEffectFlat: 139,
  statusChanceUp: 69,
  regen: 151,
  allStatsUp: 140,
  statusImmunity: 206,
  damageBarrier: 207,
  debuffImmunity: 208,
  attackDown: 98,
  defenseDown: 99,
  intimidate: 231,
  chariot: 141,
  lastStand: 142
});

export function getTarotKingdomStatusDefinition(key) {
  return TAROT_KINGDOM_STATUS_BY_KEY[String(key || '')] || null;
}

export function isTarotKingdomNegativeStatus(key) {
  return !!getTarotKingdomStatusDefinition(key);
}

export function getTarotKingdomStatusRemaining(effect = {}, definition = null) {
  const status = definition || getTarotKingdomStatusDefinition(effect?.key);
  if (!status) return null;
  if (effect.statusVersion !== 1 && effect.charges != null) {
    const value = Math.max(0, Math.floor(Number(effect.charges) || 0));
    return { kind: 'legacy', value, label: `残り${value}回` };
  }
  if (effect.statusVersion !== 1 && effect.remainingTurns != null) {
    const value = Math.max(0, Math.floor(Number(effect.remainingTurns) || 0));
    return { kind: 'legacy-turn', value, label: `残り${value}ターン` };
  }
  if (effect.untilClear === true) return { kind: 'clear', value: null, label: '場流れまで' };
  if (status.durationKind === 'damage' || effect.untilDamage === true) {
    return { kind: 'damage', value: null, label: '被弾まで' };
  }
  if (status.durationKind === 'hit') {
    const value = Math.max(0, Math.floor(Number(effect.remainingHits) || 0));
    return { kind: 'hit', value, label: `残り${value}回` };
  }
  if (status.durationKind === 'attack' || status.durationKind === 'attack-or-damage') {
    const value = Math.max(0, Math.floor(Number(effect.remainingAttackAttempts) || 0));
    return { kind: 'attack', value, label: `攻撃あと${value}回` };
  }
  const value = Math.max(0, Math.floor(Number(effect.remainingActions) || 0));
  return { kind: 'action', value, label: `行動あと${value}回` };
}

export function formatTarotKingdomStatusDetail(key, effect = {}) {
  const definition = getTarotKingdomStatusDefinition(key);
  if (!definition) return null;
  const remaining = getTarotKingdomStatusRemaining(effect, definition);
  return {
    ...definition,
    remainingLabel: remaining?.label || '',
    effectLabel: String(effect.label || definition.label)
  };
}
