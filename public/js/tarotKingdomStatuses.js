export const TAROT_KINGDOM_STATUS_EFFECTS_VERSION = 2;

const STATUS_DEFINITIONS = [
  {
    key: 'paralysis', label: '麻痺', priority: 130, spriteIndex: 0, visual: 'lightning',
    durationKind: 'clear-count', defaultCount: 2, control: true,
    description: '2回の場流れまで、戦闘行動が確率で不発になる'
  },
  {
    key: 'freeze', label: '凍結', priority: 125, spriteIndex: 1, visual: 'ice',
    durationKind: 'attack-or-damage', defaultCount: 1, control: true,
    description: '次の戦闘行動が不発。先に直接攻撃を受けると被ダメージが20%増えて解除'
  },
  {
    key: 'sleep', label: '睡眠', priority: 135, spriteIndex: 2, visual: 'sleep',
    durationKind: 'damage', defaultCount: null, control: true,
    description: 'ダメージを受けるまで戦闘効果が不発になる'
  },
  {
    key: 'petrify', label: '石化', priority: 145, spriteIndex: 3, visual: 'petrify',
    durationKind: 'round', defaultCount: null, control: true,
    description: 'HPを残したまま強制スキップ。攻撃対象外で自然解除しない'
  },
  {
    key: 'silence', label: '沈黙', priority: 115, spriteIndex: 4, visual: 'silence',
    durationKind: 'attack', defaultCount: 1,
    description: '次のカード行動で武器・共鳴・守護・大アルカナ副次効果を封印'
  },
  {
    key: 'seal', label: '封印', priority: 112, spriteIndex: 5, visual: 'seal',
    durationKind: 'clear-count', defaultCount: 2,
    description: '2回の場流れまで5枚役・コールの召喚効果を封印する'
  },
  {
    key: 'confusion', label: '混乱', priority: 110, spriteIndex: 6, visual: 'confusion',
    durationKind: 'attack', defaultCount: 1,
    description: '次の攻撃時、付与された確率で自分を攻撃する'
  },
  {
    key: 'poison', label: '毒', priority: 105, spriteIndex: 7, visual: 'poison',
    durationKind: 'action', defaultCount: 3,
    description: '低い継続ダメージを3回受ける。HP1で止まる'
  },
  {
    key: 'burn', label: '火傷', priority: 100, spriteIndex: 8, visual: 'burn',
    durationKind: 'action', defaultCount: 2,
    description: '毒より高い継続ダメージを2回受ける。HP1で止まる'
  },
  {
    key: 'fear', label: '恐怖', priority: 95, spriteIndex: 9, visual: 'fear',
    durationKind: 'attack', defaultCount: 2,
    description: '与ダメージが低下し、クリティカルが発生しなくなる'
  },
  {
    key: 'blind', label: '暗闇', priority: 90, spriteIndex: 10, visual: 'blind',
    durationKind: 'attack', defaultCount: 2,
    description: '命中率が低下する'
  },
  {
    key: 'wet', label: '水浸し', priority: 85, spriteIndex: 11, visual: 'wet',
    durationKind: 'action', defaultCount: 2,
    description: '火に強くなり、雷ダメージと麻痺成功率が上がる'
  },
  {
    key: 'vulnerable', label: '脆弱', priority: 75, spriteIndex: 12, visual: 'vulnerable',
    durationKind: 'hit', defaultCount: 1,
    description: '次の直接攻撃による被ダメージが増える'
  },
  {
    key: 'slow', label: '鈍足', priority: 70, spriteIndex: 13, visual: 'slow',
    durationKind: 'action', defaultCount: 2,
    description: '素早さが低下し、命中率・回避率も下がる'
  },
  {
    key: 'curse', label: '呪い', priority: 108, spriteIndex: 14, visual: 'curse',
    durationKind: 'clear-count', defaultCount: 2,
    description: '2回の場流れまで通常回復・リジェネ・吸収を無効化する'
  }
];

const MODIFIER_DEFINITIONS = [
  { key: 'powerUp', label: '力上昇', group: 'buff', axis: 'power', direction: 1, iconIndex: 137, description: '物理攻撃力が上昇' },
  { key: 'powerDown', label: '力低下', group: 'debuff', axis: 'power', direction: -1, iconIndex: 98, description: '物理攻撃力が低下' },
  { key: 'intelligenceUp', label: '知力上昇', group: 'buff', axis: 'intelligence', direction: 1, iconIndex: 146, description: '魔法攻撃力が上昇' },
  { key: 'intelligenceDown', label: '知力低下', group: 'debuff', axis: 'intelligence', direction: -1, iconIndex: 99, description: '魔法攻撃力が低下' },
  { key: 'defenseUp', label: '守備上昇', group: 'buff', axis: 'defense', direction: 1, iconIndex: 203, description: '防御力が上昇' },
  { key: 'defenseDown', label: '守備低下', group: 'debuff', axis: 'defense', direction: -1, iconIndex: 99, description: '防御力が低下' },
  { key: 'speedUp', label: '加速', group: 'buff', axis: 'speed', direction: 1, iconIndex: 141, description: '素早さが上昇' },
  { key: 'speedDown', label: '減速', group: 'debuff', axis: 'speed', direction: -1, iconIndex: 101, description: '素早さが低下' },
  { key: 'accuracyUp', label: '命中上昇', group: 'buff', axis: 'accuracy', direction: 1, iconIndex: 69, description: '命中率が上昇' },
  { key: 'accuracyDown', label: '命中低下', group: 'debuff', axis: 'accuracy', direction: -1, iconIndex: 68, description: '命中率が低下' },
  { key: 'evasionUp', label: '回避上昇', group: 'buff', axis: 'evasion', direction: 1, iconIndex: 224, description: '回避率が上昇' },
  { key: 'evasionDown', label: '回避低下', group: 'debuff', axis: 'evasion', direction: -1, iconIndex: 101, description: '回避率が低下' },
  { key: 'criticalUp', label: '会心上昇', group: 'buff', axis: 'critical', direction: 1, iconIndex: 140, description: 'クリティカル率が上昇' },
  { key: 'criticalDown', label: '会心低下', group: 'debuff', axis: 'critical', direction: -1, iconIndex: 230, description: 'クリティカル率が低下' },
  { key: 'regen', label: 'リジェネ', group: 'special', iconIndex: 151, description: '場が流れるたびにHPを回復' },
  { key: 'hpShield', label: 'シールド', group: 'special', iconIndex: 207, description: '一定量のダメージを肩代わり' },
  { key: 'damageBarrier', label: 'ダメージ軽減', group: 'special', iconIndex: 204, description: '受けるダメージを軽減' },
  { key: 'areaGuard', label: '全体防御', group: 'special', iconIndex: 204, description: '次の全体攻撃を軽減' },
  { key: 'guard', label: '防御', group: 'special', iconIndex: 203, description: '次に受けるダメージを軽減' },
  { key: 'statusImmunity', label: '状態無効', group: 'special', iconIndex: 206, description: '状態異常を無効化' },
  { key: 'statusImmune', label: '状態無効', group: 'special', iconIndex: 206, description: '状態異常を無効化' },
  { key: 'debuffImmunity', label: '弱体無効', group: 'special', iconIndex: 208, description: '能力低下を無効化' },
  { key: 'statDebuffImmunity', label: '能力低下無効', group: 'special', iconIndex: 208, description: '能力値を下げる効果を無効化' },
  { key: 'sureHit', label: '必中', group: 'special', iconIndex: 69, description: '次の攻撃が必ず命中' },
  { key: 'decoy', label: '分身', group: 'special', iconIndex: 224, description: '直接攻撃を無効化' },
  { key: 'invisible', label: '透明', group: 'special', iconIndex: 224, description: '直接攻撃を無効化' },
  { key: 'counter', label: '反撃', group: 'special', iconIndex: 136, description: '直接攻撃へ反撃' },
  { key: 'cover', label: '身代わり', group: 'special', iconIndex: 205, description: '味方への攻撃を身代わり' },
  { key: 'lastStand', label: '食いしばり', group: 'special', iconIndex: 142, description: '致死ダメージをHP1で耐える' },
  { key: 'autoRevive', label: '自動復活', group: 'special', iconIndex: 151, description: '戦闘不能時に一度復活' },
  { key: 'nextAttackUp', label: '次撃強化', group: 'special', iconIndex: 137, description: '次の攻撃を強化' },
  { key: 'extraHit', label: '追加攻撃', group: 'special', iconIndex: 139, description: '次の攻撃に追撃を追加' },
  { key: 'allStatsUp', label: '全能力上昇', group: 'buff', iconIndex: 140, description: '力・守・知・速が上昇' },
  { key: 'attackDown', label: '攻撃低下', group: 'debuff', iconIndex: 98, description: '与えるダメージが低下' },
  { key: 'intimidate', label: '威圧', group: 'debuff', iconIndex: 231, description: '敵の次の攻撃を封じる' },
  { key: 'break', label: '崩し', group: 'debuff', iconIndex: 74, description: '次に受ける攻撃のダメージが増加' }
];

export const TAROT_KINGDOM_STATUS_DEFINITIONS = Object.freeze(
  STATUS_DEFINITIONS.map((entry) => Object.freeze({ ...entry }))
);

export const TAROT_KINGDOM_MODIFIER_DEFINITIONS = Object.freeze(
  MODIFIER_DEFINITIONS.map((entry, index) => Object.freeze({ priority: 40 - index, ...entry }))
);

export const TAROT_KINGDOM_STATUS_BY_KEY = Object.freeze(Object.fromEntries(
  TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => [entry.key, entry])
));

export const TAROT_KINGDOM_MODIFIER_BY_KEY = Object.freeze(Object.fromEntries(
  TAROT_KINGDOM_MODIFIER_DEFINITIONS.map((entry) => [entry.key, entry])
));

export const TAROT_KINGDOM_NEGATIVE_STATUS_KEYS = Object.freeze(
  TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => entry.key)
);

export const TAROT_KINGDOM_HARD_CONTROL_KEYS = Object.freeze([
  'paralysis', 'freeze', 'sleep', 'petrify'
]);

export const TAROT_KINGDOM_STATUS_ICON_INDEX = Object.freeze({
  ...Object.fromEntries(TAROT_KINGDOM_STATUS_DEFINITIONS.map((entry) => [entry.key, entry.spriteIndex])),
  ...Object.fromEntries(TAROT_KINGDOM_MODIFIER_DEFINITIONS.map((entry) => [entry.key, entry.iconIndex]))
});

export function getTarotKingdomStatusDefinition(key) {
  return TAROT_KINGDOM_STATUS_BY_KEY[String(key || '')] || null;
}

export function getTarotKingdomModifierDefinition(key) {
  return TAROT_KINGDOM_MODIFIER_BY_KEY[String(key || '')] || null;
}

export function isTarotKingdomNegativeStatus(key) {
  return !!getTarotKingdomStatusDefinition(key);
}

export function getTarotKingdomStatusRemaining(effect = {}, definition = null) {
  const status = definition || getTarotKingdomStatusDefinition(effect?.key);
  if (!status) return null;
  if (effect.statusVersion !== 1 && effect.statusVersion !== 2 && effect.charges != null) {
    const value = Math.max(0, Math.floor(Number(effect.charges) || 0));
    return { kind: 'legacy', value, label: `残り${value}回` };
  }
  if (effect.statusVersion !== 1 && effect.statusVersion !== 2 && effect.remainingTurns != null) {
    const value = Math.max(0, Math.floor(Number(effect.remainingTurns) || 0));
    return { kind: 'legacy-turn', value, label: `残り${value}ターン` };
  }
  if (Number(effect.remainingClears) > 0) {
    const value = Math.max(0, Math.floor(Number(effect.remainingClears) || 0));
    return { kind: 'clear-count', value, label: `場流れあと${value}回` };
  }
  if (status.durationKind === 'round') return { kind: 'round', value: null, label: '解除されるまで' };
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
  const definition = getTarotKingdomStatusDefinition(key) || getTarotKingdomModifierDefinition(key);
  if (!definition) return null;
  const remaining = getTarotKingdomStatusDefinition(key)
    ? getTarotKingdomStatusRemaining(effect, definition)
    : null;
  const potency = Math.max(0, Number(effect.potency) || 0);
  const potencySuffix = potency > 0 && !['paralysis', 'silence', 'seal', 'sleep', 'freeze', 'petrify'].includes(key)
    ? `（${Math.round(potency)}${definition.axis === 'accuracy' || definition.axis === 'evasion' ? 'pt' : '%'}）`
    : '';
  const remainingTurns = Math.max(0, Math.floor(Number(effect.remainingTurns) || 0));
  const charges = Math.max(0, Math.floor(Number(effect.charges) || 0));
  return {
    ...definition,
    remainingLabel: remaining?.label
      || (remainingTurns > 0 ? `残り${remainingTurns}ターン` : (charges > 0 ? `残り${charges}回` : '場流れまで')),
    effectLabel: `${String(effect.label || definition.label)}${potencySuffix}`
  };
}
