import { TAROT_KINGDOM_NEGATIVE_STATUS_KEYS } from './tarotKingdomStatuses.js?v=20260812-status-v2';

const SUIT_ELEMENT = Object.freeze({ Wand: 'fire', Cup: 'water', Sword: 'wind', Pentacle: 'earth' });
const NEGATIVE_STATUSES = TAROT_KINGDOM_NEGATIVE_STATUS_KEYS;
const RESONANCE_GROWTH_TEXT = Object.freeze({
  1: '手札にある札の種類が多いほど効果上昇',
  2: 'この局で実際に回復したHPが多いほど効果上昇',
  3: 'この局で任意ドローした回数が多いほど効果上昇',
  4: 'ターンが進むほど効果上昇',
  5: 'この局でシールドを付与した回数が多いほど効果上昇',
  6: 'この局で複数枚出しした回数が多いほど効果上昇',
  7: '自分が続けてカードを出すほど効果上昇',
  8: '手番が多く移るほど効果上昇',
  9: '自分が攻撃を回避した回数が多いほど効果上昇',
  10: '発動時に0～10を抽選して効果を決定',
  11: '状態異常を付与・解除した回数が多いほど効果上昇',
  12: '自分が攻撃を受けた回数が多いほど効果上昇',
  13: '自分が場流しで墓地へ送った札が多いほど効果上昇',
  14: '提出前の場札との数字差が大きいほど効果上昇'
});
const STATUS_DISPLAY_NAMES = Object.freeze({
  paralysis: '麻痺', sleep: '睡眠', freeze: '凍結', poison: '毒', burn: '火傷',
  silence: '沈黙', blind: '暗闇', fear: '恐怖', confusion: '混乱',
  magicDefenseDown: '魔法防御低下', nextAttackDown: '次の敵攻撃を弱体化'
});
const BUFF_DISPLAY_NAMES = Object.freeze({
  regenAfterAction: 'リジェネ',
  singleGuard: '単体攻撃を軽減',
  damageBarrier: 'ダメージバリア',
  shieldPreserve: 'シールドを保護',
  cover: '味方を身代わり',
  areaGuard: '全体攻撃を軽減',
  guard: '次の被ダメージを軽減',
  statusAttackGuard: '状態異常耐性上昇',
  defenseUp: '防御上昇',
  nextAttackUp: '次の攻撃を強化',
  speedUpUntilChainEnds: '素早さ上昇',
  evasion: '回避上昇'
});
const RANDOM_EFFECT_DESCRIPTIONS = Object.freeze({
  'cup-10': '0～10を抽選する。0は空瓶、1～3は最少HPの味方を3％回復、4～6は毒・火傷を70％で1つ解除、7～9は敵へ70％で毒を2行動付与、10は3効果すべて発動する。',
  'wand-10': '0～10を抽選し、抽選結果に応じて威力0～60の魔法攻撃を行う。0なら不発。',
  'pentacle-10': '0～10を抽選し、次に受けるダメージを抽選結果と同じ0～10％軽減する。0なら軽減しない。'
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function livingIndexes(context) {
  return (Array.isArray(context.players) ? context.players : [])
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => finite(player?.hp) > 0)
    .map(({ index }) => index);
}

function lowestHpIndex(context, excludeIndex = null) {
  const actorIndex = Math.max(0, Math.floor(finite(context.actorIndex)));
  const count = Math.max(1, context.players?.length || 1);
  return livingIndexes(context)
    .filter((index) => index !== excludeIndex)
    .sort((left, right) => {
      const a = context.players[left] || {};
      const b = context.players[right] || {};
      const ar = finite(a.hp) / Math.max(1, finite(a.maxHp, 1));
      const br = finite(b.hp) / Math.max(1, finite(b.maxHp, 1));
      if (ar !== br) return ar - br;
      return ((left - actorIndex + count) % count) - ((right - actorIndex + count) % count);
    })[0] ?? null;
}

function levelScale(entry) {
  return 1 + (Math.max(1, Math.floor(finite(entry?.cardLevel, 1))) - 1) * 0.02;
}

function matchScale(context) {
  return clamp(context.resonanceMatch?.multiplier ?? 1, 0, 1);
}

function numeric(value, entry, context, cap = Number.POSITIVE_INFINITY) {
  const base = Math.max(0, finite(value));
  if (base <= 0) return 0;
  return Math.min(cap, Math.max(1, Math.round(base * levelScale(entry) * matchScale(context))));
}

function probability(percent, context) {
  return clamp(finite(percent) * matchScale(context), 0, 100) / 100;
}

function combatScale(context, kind) {
  const combat = context.character?.combat || {};
  const stat = kind === 'magic' ? finite(combat.intelligence) : finite(combat.power);
  const level = Math.max(1, Math.floor(finite(context.character?.level, 1)));
  const equipment = kind === 'magic' ? finite(combat.equipmentMagicPower) : finite(combat.equipmentPower);
  const growth = Number(context.growthVersion) >= 1
    ? (1 + Math.min(100, level - 1) / 100) * (1 + Math.min(100, equipment) / 200)
    : 1;
  return (1 + Math.min(200, Math.max(0, stat)) / 200) * growth;
}

function damageAmount(power, kind, entry, context) {
  return numeric(Math.max(0, power) * combatScale(context, kind), entry, context, 300);
}

function step(kind, entry, extras = {}) {
  return { source: 'resonance', kind, label: entry.skillName || entry.name, ...extras };
}

function damage(entry, context, power, kind = 'physical', extras = {}) {
  const amount = damageAmount(power, kind, entry, context);
  return step(kind === 'magic' ? 'magic' : 'damage', entry, {
    targetType: 'enemy', amount, score: amount, ...extras
  });
}

function heal(entry, context, targetIndex, percent, extras = {}) {
  if (!Number.isInteger(targetIndex)) return null;
  const scaledPercent = numeric(percent, entry, context, 40);
  return step('heal-percent', entry, {
    targetType: 'player', targetIndex, percent: scaledPercent, score: scaledPercent, ...extras
  });
}

function shield(entry, context, targetIndex, percent, extras = {}) {
  if (!Number.isInteger(targetIndex)) return null;
  const scaledPercent = numeric(percent, entry, context, 40);
  const maxHp = Math.max(1, finite(context.players?.[targetIndex]?.maxHp, 1));
  return step('buff', entry, {
    targetType: 'player', targetIndex, statusKey: 'hpShield', potency: scaledPercent,
    shieldHp: Math.max(1, Math.floor(maxHp * scaledPercent / 100)), score: scaledPercent, ...extras
  });
}

function status(entry, context, statusKey, percent, extras = {}) {
  return step('status', entry, {
    targetType: 'enemy', statusKey, chance: probability(percent, context), score: Math.max(1, percent), ...extras
  });
}

function playerBuff(entry, context, targetIndex, statusKey, potency, extras = {}) {
  return step('buff', entry, {
    targetType: 'player', targetIndex, statusKey,
    potency: numeric(potency, entry, context, 50), score: Math.max(1, potency), ...extras
  });
}

function partyBuff(entry, context, statusKey, potency, extras = {}) {
  return step('buff', entry, {
    targetType: 'party', statusKey, potency: numeric(potency, entry, context, 50),
    score: Math.max(1, potency), ...extras
  });
}

function trigger(entry, context, triggerName, extras = {}) {
  return step('register-trigger', entry, {
    targetType: extras.targetType || 'enemy', trigger: triggerName,
    effectKind: extras.effectKind || 'delayed-effect', expiresOn: extras.expiresOn || 'clear',
    damageKind: extras.damageKind || (extras.effectKind === 'magic' ? 'magic' : 'physical'),
    score: Math.max(1, finite(extras.amount || extras.potency || extras.percent, 10)), ...extras
  });
}

export function createTarotKingdomRHistory(playerCount = 4) {
  return {
    version: 1,
    actualHealPoints: 0,
    optionalDrawCount: 0,
    turnNo: 1,
    shieldGrantActions: 0,
    multiCardPlays: 0,
    consecutiveSubmissions: Array(Math.max(1, playerCount)).fill(0),
    playerChanges: 0,
    dodgeActions: Array(Math.max(1, playerCount)).fill(0),
    statusApplyActions: 0,
    statusCleanseActions: 0,
    attacksReceived: Array(Math.max(1, playerCount)).fill(0),
    graveCardsByClear: Array(Math.max(1, playerCount)).fill(0),
    guardian: Array.from({ length: Math.max(1, playerCount) }, () => ({ counters: {}, used: {} })),
    rank10: { value: null, floorByPlayer: Array(Math.max(1, playerCount)).fill(0) },
    lastActorIndex: null
  };
}

export function normalizeTarotKingdomRHistory(raw, playerCount = 4) {
  const base = createTarotKingdomRHistory(playerCount);
  if (!raw || typeof raw !== 'object') return base;
  const copyArray = (value, fallback) => Array.from({ length: fallback.length }, (_, index) => (
    Math.max(0, Math.floor(finite(value?.[index], fallback[index])))
  ));
  return {
    ...base,
    actualHealPoints: Math.max(0, Math.floor(finite(raw.actualHealPoints))),
    optionalDrawCount: Math.max(0, Math.floor(finite(raw.optionalDrawCount))),
    turnNo: Math.max(1, Math.floor(finite(raw.turnNo, 1))),
    shieldGrantActions: Math.max(0, Math.floor(finite(raw.shieldGrantActions))),
    multiCardPlays: Math.max(0, Math.floor(finite(raw.multiCardPlays))),
    consecutiveSubmissions: copyArray(raw.consecutiveSubmissions, base.consecutiveSubmissions),
    playerChanges: Math.max(0, Math.floor(finite(raw.playerChanges))),
    dodgeActions: copyArray(raw.dodgeActions, base.dodgeActions),
    statusApplyActions: Math.max(0, Math.floor(finite(raw.statusApplyActions))),
    statusCleanseActions: Math.max(0, Math.floor(finite(raw.statusCleanseActions))),
    attacksReceived: copyArray(raw.attacksReceived, base.attacksReceived),
    graveCardsByClear: copyArray(raw.graveCardsByClear, base.graveCardsByClear),
    guardian: Array.from({ length: base.guardian.length }, (_, index) => ({
      counters: { ...(raw.guardian?.[index]?.counters || {}) },
      used: { ...(raw.guardian?.[index]?.used || {}) }
    })),
    rank10: {
      value: Number.isInteger(Number(raw.rank10?.value)) ? clamp(raw.rank10.value) : null,
      floorByPlayer: copyArray(raw.rank10?.floorByPlayer, base.rank10.floorByPlayer)
    },
    lastActorIndex: Number.isInteger(Number(raw.lastActorIndex)) ? Number(raw.lastActorIndex) : null
  };
}

export function resolveTarotKingdomR(rank, context = {}, random = Math.random) {
  const resolvedByRank = context.resolvedRByRank && typeof context.resolvedRByRank === 'object'
    ? context.resolvedRByRank
    : null;
  if (resolvedByRank && Number.isFinite(Number(resolvedByRank[rank]))) {
    return clamp(Math.floor(Number(resolvedByRank[rank])));
  }
  if (context.resolvedR != null && Number.isFinite(Number(context.resolvedR))) {
    return clamp(Math.floor(Number(context.resolvedR)));
  }
  const history = normalizeTarotKingdomRHistory(context.rHistory, context.players?.length || 4);
  const actorIndex = Math.max(0, Math.floor(finite(context.actorIndex)));
  let value = 0;
  if (rank === 1) {
    const kinds = new Set((context.handBefore || []).map((card) => (
      card?.kind === 'major' ? 'major' : String(card?.suit || '')
    )).filter(Boolean));
    value = kinds.size * 2;
  } else if (rank === 2) value = history.actualHealPoints;
  else if (rank === 3) value = history.optionalDrawCount * 3;
  else if (rank === 4) value = history.turnNo;
  else if (rank === 5) value = history.shieldGrantActions;
  else if (rank === 6) value = history.multiCardPlays;
  else if (rank === 7) value = finite(history.consecutiveSubmissions[actorIndex]) * 2;
  else if (rank === 8) value = history.playerChanges;
  else if (rank === 9) value = finite(history.dodgeActions[actorIndex]);
  else if (rank === 10) {
    const floor = context.guardianNumber === 10 ? finite(history.rank10.floorByPlayer[actorIndex]) : 0;
    const roll = Math.floor(clamp(random(), 0, 0.999999) * (11 - floor)) + floor;
    value = roll;
  } else if (rank === 11) value = Math.max(history.statusApplyActions, history.statusCleanseActions);
  else if (rank === 12) value = finite(history.attacksReceived[actorIndex]);
  else if (rank === 13) value = finite(history.graveCardsByClear[actorIndex]);
  else if (rank === 14) value = Math.abs(finite(context.fieldCard?.number) - finite(context.sourceCard?.number));
  value = clamp(Math.floor(value));
  return context.guardianNumber === 11 && context.reverseBefore === true ? 10 - value : value;
}

function cupSteps(entry, context, r) {
  const actor = Math.max(0, Math.floor(finite(context.actorIndex)));
  const lowest = lowestHpIndex(context);
  const all = livingIndexes(context);
  if (entry.rank === 1) return [heal(entry, context, lowest, 2 + 0.4 * r)].filter(Boolean);
  if (entry.rank === 2) return [playerBuff(entry, context, lowest, 'regenAfterAction', 0.8 + 0.2 * r, { charges: 2 })].filter(Boolean);
  if (entry.rank === 3) return [step('cleanse', entry, { targetType: 'party', statusKeys: ['poison', 'burn', 'silence'], chance: probability(40 + 6 * r, context), score: 18 })];
  if (entry.rank === 4) return [trigger(entry, context, 'actor-next-hit', { targetType: 'player', targetIndex: actor, effectKind: 'heal-percent', percent: numeric(1 + 0.3 * r, entry, context, 40), charges: 1, expiresOn: 'actor-turn' })];
  if (entry.rank === 5) return [status(entry, context, 'paralysis', 10 + 3 * r, { charges: 1 })];
  if (entry.rank === 6) return all.slice(0, 2).sort((a, b) => {
    const pa = context.players[a]; const pb = context.players[b];
    return pa.hp / pa.maxHp - pb.hp / pb.maxHp;
  }).map((index) => heal(entry, context, index, 1 + 0.25 * r)).filter(Boolean);
  if (entry.rank === 7) return [step('cleanse', entry, { targetType: 'player', targetIndex: actor, statusKeys: ['paralysis', 'sleep', 'freeze', 'petrify', 'confusion'], chance: probability(40 + 6 * r, context), score: 18 })];
  if (entry.rank === 8) return all.map((index) => heal(entry, context, index, 0.5 + 0.1 * r)).filter(Boolean);
  if (entry.rank === 9) return [status(entry, context, 'blind', 100, { potency: numeric(5 + 2 * r, entry, context, 50), charges: 1 })];
  if (entry.rank === 10) {
    if (r === 0) return [];
    const out = [];
    if (r <= 3 || r === 10) out.push(heal(entry, context, lowest, 3));
    if (r >= 4 && r <= 6 || r === 10) out.push(step('cleanse', entry, { targetType: 'party', statusKeys: ['poison', 'burn'], chance: probability(70, context), score: 12 }));
    if (r >= 7 || r === 10) out.push(status(entry, context, 'poison', 70, { turns: 2, potency: 1 }));
    return out.filter(Boolean);
  }
  if (entry.rank === 11) return [step('cleanse-transfer', entry, { targetType: 'party', statusKeys: NEGATIVE_STATUSES, chance: probability(30 + 5 * r, context), transferChance: probability(10 + 4 * r, context), score: 24 })];
  if (entry.rank === 12) return [status(entry, context, 'poison', 15 + 4 * r, { turns: 2, potency: 1, targetSource: 'last-attacker' })];
  if (entry.rank === 13) return [step('revive-percent', entry, { targetType: 'player', targetIndex: context.koPlayerIndex, percent: 1, chance: probability(10 + 4 * r, context), oncePerRound: true, score: 40 })];
  return [status(entry, context, 'sleep', 10 + 4 * r, { charges: 1, expiresOn: 'damage' })];
}

function wandSteps(entry, context, r) {
  const element = context.sourceElement || SUIT_ELEMENT[entry.suit] || 'neutral';
  const attack = (power, extras = {}) => damage(entry, context, power, 'magic', { element, ...extras });
  if (entry.rank === 1) return [attack(20 + 2 * r), status(entry, context, ({ fire: 'burn', water: 'freeze', wind: 'paralysis', earth: 'poison' })[element] || 'silence', 10 + 2 * r, { charges: 1, visualElement: element === 'wind' ? 'lightning' : element })];
  if (entry.rank === 2) return [attack(20 + 2 * r), status(entry, context, 'silence', 10 + 3 * r, { charges: 1 })];
  if (entry.rank === 3) return [attack(15 + r), trigger(entry, context, 'next-same-element', { effectKind: 'magic', amount: damageAmount(10 + 2 * r, 'magic', entry, context), element, charges: 1 })];
  if (entry.rank === 4) return [attack(20 + r), step('status', entry, { targetType: 'enemy', statusKey: 'magicDefenseDown', potency: numeric(5 + r, entry, context, 50), charges: 1 })];
  if (entry.rank === 5) return [attack(25 + 2 * r, { shieldPierce: numeric(10 + 2 * r, entry, context, 50) })];
  if (entry.rank === 6) return [attack(15 + 2 * r), status(entry, context, 'paralysis', 10 + 3 * r, { charges: 1 })];
  if (entry.rank === 7) return [attack(20 + 3 * r)];
  if (entry.rank === 8) return [attack(15 + r), status(entry, context, 'confusion', 10 + 4 * r, { charges: 1 })];
  if (entry.rank === 9) return [attack(15 + r), status(entry, context, 'blind', 100, { potency: numeric(5 + r, entry, context, 50), charges: 1 })];
  if (entry.rank === 10) return r > 0 ? [attack(6 * r)] : [];
  if (entry.rank === 11) return [attack(15 + r), step('extend-status', entry, { targetType: 'enemy', chance: probability(20 + 3 * r, context), turns: 1, score: 15 })];
  if (entry.rank === 12) return [attack(20 + r), step('status', entry, { targetType: 'enemy', statusKey: 'nextAttackDown', potency: numeric(5 + r, entry, context, 50), charges: 1 })];
  if (entry.rank === 13) return [attack(15 + r), status(entry, context, 'poison', 20 + 3 * r, { turns: 2, potency: 1 })];
  return [trigger(entry, context, 'enemy-next-turn-end', { effectKind: 'magic', amount: damageAmount(30 + 3 * r, 'magic', entry, context), element, charges: 1, expiresOn: 'action' })];
}

function swordSteps(entry, context, r) {
  const actor = Math.max(0, Math.floor(finite(context.actorIndex)));
  const attack = (power, extras = {}) => damage(entry, context, power, 'physical', extras);
  if (entry.rank === 1) return [attack(40 + 2 * r, { accuracyBonus: numeric(r, entry, context, 100) })];
  if (entry.rank === 2) return [attack(22 + r, { hitCount: 2, perHitAmount: damageAmount(22 + r, 'physical', entry, context) })];
  if (entry.rank === 3) return [attack(15 + Math.floor(r / 2), { hitCount: 3, perHitAmount: damageAmount(15 + Math.floor(r / 2), 'physical', entry, context) })];
  if (entry.rank === 4) return [attack(40 + r), playerBuff(entry, context, actor, 'nextAttackUp', 2 * r, { charges: 1 })];
  if (entry.rank === 5) return [attack(45 + r, { ignoreDefense: clamp(numeric(2 * r, entry, context, 50) / 100, 0, 0.5) })];
  if (entry.rank === 6) return [attack(30), trigger(entry, context, 'other-multi-play', { effectKind: 'damage', amount: damageAmount(20 + 2 * r, 'physical', entry, context), charges: 1 })];
  if (entry.rank === 7) return [attack(35 + r), playerBuff(entry, context, actor, 'speedUpUntilChainEnds', 2 * r, { expiresOn: 'submission-chain' })];
  if (entry.rank === 8) return [attack(30 + r), playerBuff(entry, context, actor, 'evasion', 2 * r, { charges: 1 })];
  if (entry.rank === 9) return [trigger(entry, context, 'full-dodge', { effectKind: 'damage', amount: damageAmount(30 + 3 * r, 'physical', entry, context), charges: 1 })];
  if (entry.rank === 10) return [attack(25 + 5 * r)];
  if (entry.rank === 11) return [attack(40 + r + (context.enemyHasStatus ? 10 : 0), { accuracyBonus: numeric(2 * r, entry, context, 100) })];
  if (entry.rank === 12) return [attack(40 + 2 * r + (finite(context.players?.[actor]?.hp) / Math.max(1, finite(context.players?.[actor]?.maxHp, 1)) <= 0.5 ? 15 : 0))];
  if (entry.rank === 13) return [attack(45 + r + (finite(context.enemy?.hp) / Math.max(1, finite(context.enemy?.maxHp, 1)) <= 0.3 ? 2 * r : 0))];
  return [attack(45 + r, { accuracyBonus: numeric(r, entry, context, 100), criticalBonus: numeric(2 * r, entry, context, 100) })];
}

function pentacleSteps(entry, context, r) {
  const actor = Math.max(0, Math.floor(finite(context.actorIndex)));
  const lowest = lowestHpIndex(context);
  const fieldOwner = Number.isInteger(Number(context.fieldOwnerIndex)) ? Number(context.fieldOwnerIndex) : actor;
  if (entry.rank === 1) return [shield(entry, context, actor, 3 + 0.5 * r)].filter(Boolean);
  if (entry.rank === 2) return [playerBuff(entry, context, lowest, 'singleGuard', 10 + r, { charges: 1 })].filter(Boolean);
  if (entry.rank === 3) return [playerBuff(entry, context, actor, 'damageBarrier', 5 + 0.5 * r, { charges: 2 })];
  if (entry.rank === 4) return [shield(entry, context, fieldOwner, 2 + 0.5 * r)].filter(Boolean);
  if (entry.rank === 5) return [partyBuff(entry, context, 'shieldPreserve', 10 + r, { charges: 1 })];
  if (entry.rank === 6) return [partyBuff(entry, context, 'singleGuard', 8, { charges: 1 + Math.floor(r / 5) })];
  if (entry.rank === 7) return [step('buff', entry, { targetType: 'party', targetIndex: lowestHpIndex(context, actor), statusKey: 'cover', coverIndex: actor, potency: numeric(5 + r, entry, context, 50), charges: 1, score: 20 })];
  if (entry.rank === 8) return [partyBuff(entry, context, 'areaGuard', 3 + 0.5 * r, { charges: 1 })];
  if (entry.rank === 9) return [shield(entry, context, lowest, 2 + 0.5 * r)].filter(Boolean);
  if (entry.rank === 10) return r > 0 ? [playerBuff(entry, context, actor, 'guard', r, { charges: 1 })] : [];
  if (entry.rank === 11) return [partyBuff(entry, context, 'statusAttackGuard', 5 + r, { statusChanceDown: numeric(5 + r, entry, context, 50), charges: 1 })];
  if (entry.rank === 12) return [playerBuff(entry, context, actor, 'defenseUp', 5 + r, { expiresOn: 'actor-turn' })];
  if (entry.rank === 13) return livingIndexes(context).map((index) => shield(entry, context, index, 1 + 0.3 * r)).filter(Boolean);
  return [...new Set([actor, fieldOwner])].map((index) => shield(entry, context, index, 2 + 0.4 * r)).filter(Boolean);
}

export function expandTarotKingdomV3Resonance(entry, context = {}) {
  const sourceCard = context.resonanceMatch?.submittedCard || context.cards?.[0] || null;
  const guardianNumber = Number(context.character?.guardianArcana?.number);
  const r = resolveTarotKingdomR(entry.rank, {
    ...context,
    sourceCard,
    guardianNumber: Number.isInteger(guardianNumber) ? guardianNumber : null
  }, context.random || Math.random);
  const resolved = { ...context, sourceCard, resolvedR: r };
  let steps = [];
  if (entry.suit === 'Cup') steps = cupSteps(entry, resolved, r);
  else if (entry.suit === 'Wand') steps = wandSteps(entry, resolved, r);
  else if (entry.suit === 'Sword') steps = swordSteps(entry, resolved, r);
  else if (entry.suit === 'Pentacle') steps = pentacleSteps(entry, resolved, r);
  return steps.filter(Boolean).map((item) => ({ ...item, resolvedR: r, effectVersion: 3 }));
}

export function getTarotKingdomResolvedEffectText(definition, context = {}) {
  if (!definition) return '';
  const entry = { ...definition, skillName: definition.name, cardLevel: context.cardLevel || 1 };
  const steps = expandTarotKingdomV3Resonance(entry, context);
  if (!steps.length) return '今回は効果なし';
  const summaries = steps.slice(0, 2).map((item) => {
    if (item.kind === 'damage' || item.kind === 'magic') return `${item.amount}ダメージ`;
    if (item.kind === 'heal-percent') {
      return `${item.targetType === 'party' ? '味方全体' : '味方1人'}を${item.percent}%回復`;
    }
    if (item.statusKey === 'hpShield') return `${item.potency}%シールド`;
    if (item.kind === 'status') {
      const statusName = STATUS_DISPLAY_NAMES[item.statusKey] || item.statusKey || '状態異常';
      const chance = item.chance == null ? '' : ` ${Math.round(finite(item.chance) * 100)}%`;
      const strength = item.potency == null ? '' : ` ${item.potency}%`;
      return `${statusName}${chance || strength}`;
    }
    if (item.kind === 'buff') {
      const buffName = BUFF_DISPLAY_NAMES[item.statusKey] || '強化効果';
      return `${buffName}${item.potency == null ? '' : ` ${item.potency}%`}`;
    }
    if (item.kind === 'cleanse') return '状態異常を解除';
    if (item.kind === 'cleanse-transfer') return '状態異常を解除して敵へ返す';
    if (item.kind === 'revive-percent') return `味方をHP${item.percent}%で復活`;
    if (item.kind === 'extend-status') return '敵の状態異常を延長';
    if (item.kind === 'register-trigger') {
      if (item.effectKind === 'heal-percent') return `条件成立時に${item.percent}%回復`;
      if (item.effectKind === 'damage' || item.effectKind === 'magic') return `条件成立時に${item.amount}ダメージ`;
      return '条件成立時に追加効果';
    }
    return '効果発動';
  });
  return summaries.join('・');
}

export function getTarotKingdomResonanceGrowthText(rank) {
  return RESONANCE_GROWTH_TEXT[Math.max(1, Math.min(14, Math.floor(finite(rank, 1))))] || '';
}

export function getTarotKingdomFriendlyRangeText(definition = {}) {
  return String(definition?.range || '')
    .replace(/^R=0～10／/, '')
    .replace(/^Rは発動時に/, '発動時に')
    .trim();
}

function getFriendlyRangeValues(definition = {}) {
  return getTarotKingdomFriendlyRangeText(definition)
    .split('／')
    .map((part) => part.match(/-?\d+(?:\.\d+)?～-?\d+(?:\.\d+)?/)?.[0] || '')
    .filter(Boolean);
}

export function getTarotKingdomFriendlyEffectText(definition = {}) {
  const effectId = String(definition?.id || '');
  if (RANDOM_EFFECT_DESCRIPTIONS[effectId]) return RANDOM_EFFECT_DESCRIPTIONS[effectId];
  const values = getFriendlyRangeValues(definition);
  let valueIndex = 0;
  const nextValue = () => values[valueIndex++] || '条件に応じた値';
  return String(definition?.effect || '')
    .replace(/（[^）]*R[^）]*）/g, nextValue)
    .replace(/(?:\d+(?:\.\d+)?)?R(?=％|ポイント|回|加える)/g, nextValue)
    .replace(/R/g, '実績値')
    .trim();
}

export const __test = { numeric, probability, damageAmount, cupSteps, wandSteps, swordSteps, pentacleSteps };
