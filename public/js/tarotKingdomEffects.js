const SUIT_KEYS = Object.freeze({
    Wand: 'wand',
    Cup: 'cup',
    Sword: 'sword',
    Pentacle: 'pentacle'
});

const SUIT_NAMES = Object.freeze({
    wand: 'Wand',
    cup: 'Cup',
    sword: 'Sword',
    pentacle: 'Pentacle'
});

const WEAPON_ALIASES = Object.freeze({
    greatsword: 'sword_big',
    'great-sword': 'sword_big',
    swordbig: 'sword_big',
    greataxe: 'axe_big',
    'great-axe': 'axe_big',
    axebig: 'axe_big',
    rifle: 'gun_big',
    cannon: 'gun_big',
    spear: 'polearm',
    lance: 'polearm',
    mace: 'blunt',
    hammer: 'blunt',
    club: 'blunt'
});

const NEGATIVE_STATUS_PRIORITY = Object.freeze([
    'paralysis', 'poison', 'burn', 'blind', 'fear', 'confusion', 'wet', 'weaken', 'vulnerable'
]);

const KNOWN_RESONANCE_EFFECT_CODES = Object.freeze(new Set([
    'accuracyBonus',
    'burn',
    'cleanse',
    'clearEnemyEvasion',
    'clearGuard',
    'confusion',
    'counter',
    'defenseDown',
    'evasion',
    'extraHpPercentDamage',
    'fear',
    'flood',
    'healAndCleanseOne',
    'healOrCleanseBurn',
    'healPercent',
    'morale',
    'moraleOrPower',
    'mpPercent',
    'nextDamageTaken',
    'nextMinorEffectMultiplier',
    'nextMinorPower',
    'nextWandsPower',
    'speedChange'
]));

function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, finiteNumber(value, min)));
}

function positiveRank(value) {
    const rank = Math.floor(finiteNumber(value, 0));
    return rank >= 1 && rank <= 14 ? rank : 0;
}

function normalizeSuit(value) {
    const raw = String(value || '').trim();
    if (SUIT_KEYS[raw]) return raw;
    const lower = raw.toLowerCase();
    if (SUIT_NAMES[lower]) return SUIT_NAMES[lower];
    if (lower === 'wands' || lower === 'fire') return 'Wand';
    if (lower === 'cups' || lower === 'water') return 'Cup';
    if (lower === 'swords' || lower === 'wind') return 'Sword';
    if (lower === 'pentacles' || lower === 'coin' || lower === 'coins' || lower === 'earth') return 'Pentacle';
    return '';
}

function normalizeWeapon(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    return WEAPON_ALIASES[raw] || raw || 'unarmed';
}

function normalizeEffectCode(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || '').trim();
    if (!type) return null;
    const normalized = { type };
    [
        'target', 'trigger', 'conditionStatus', 'status'
    ].forEach((key) => {
        if (raw[key] != null && String(raw[key]).trim()) normalized[key] = String(raw[key]).trim();
    });
    [
        'value', 'chance', 'multiplier', 'charges', 'turns', 'powerBonus', 'power'
    ].forEach((key) => {
        const value = Number(raw[key]);
        if (Number.isFinite(value)) normalized[key] = value;
    });
    if (Array.isArray(raw.statuses)) {
        normalized.statuses = raw.statuses.map((status) => String(status || '').trim()).filter(Boolean);
    }
    return normalized;
}

export function normalizeTarotKingdomDeckEntry(raw = {}, slot = 0) {
    const suit = normalizeSuit(raw.suit || raw.ArcanaSuit);
    const rank = positiveRank(raw.rank ?? raw.number ?? raw.ArcanaRank);
    if (!suit || !rank) return null;
    const itemId = String(raw.itemId || raw.ItemId || `minor-${SUIT_KEYS[suit]}-${rank}`).trim();
    const cardId = String(raw.cardId || `${SUIT_KEYS[suit].toUpperCase()}_${String(rank).padStart(2, '0')}`).trim();
    const power = Number(raw.power);
    return {
        slot: Math.max(0, Math.min(4, Math.floor(finiteNumber(raw.slot, slot)))),
        cardId,
        itemId,
        suit,
        rank,
        skillName: String(raw.skillName || raw.cardName || `${suit} ${rank}`).trim(),
        effectClass: String(raw.effectClass || '').trim(),
        target: String(raw.target || '').trim(),
        power: Number.isFinite(power) ? Math.max(0, power) : null,
        accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null,
        hitCount: Math.max(1, Math.floor(finiteNumber(raw.hitCount, 1))),
        effectCodes: (Array.isArray(raw.effectCodes) ? raw.effectCodes : []).map(normalizeEffectCode).filter(Boolean),
        ignoreDefense: clamp(raw.ignoreDefense, 0, 1),
        criticalBonus: clamp(raw.criticalBonus, 0, 1),
        drainRate: clamp(raw.drainRate, 0, 1),
        priority: !!raw.priority,
        conditionalPower: raw.conditionalPower && typeof raw.conditionalPower === 'object'
            ? { ...raw.conditionalPower }
            : null,
        effectText: String(raw.effectText || '').trim()
    };
}

export function normalizeTarotKingdomTarotDeck(rawDeck = []) {
    const seen = new Set();
    return (Array.isArray(rawDeck) ? rawDeck : [])
        .map((entry, index) => normalizeTarotKingdomDeckEntry(entry, index))
        .filter((entry) => {
            if (!entry) return false;
            const key = `${entry.suit}:${entry.rank}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 5)
        .map((entry, slot) => ({ ...entry, slot }));
}

export function normalizeTarotKingdomWeaponTypes(rawTypes, fallback = 'unarmed') {
    const source = Array.isArray(rawTypes) ? rawTypes : [rawTypes || fallback];
    const unique = [];
    source.forEach((entry) => {
        const weapon = normalizeWeapon(entry);
        if (weapon && !unique.includes(weapon)) unique.push(weapon);
    });
    return unique.length ? unique : ['unarmed'];
}

export function getTarotKingdomStatusChance(rank) {
    return clamp(20 + (positiveRank(rank) * 5), 0, 90) / 100;
}

export function getTarotKingdomPhysicalScale(power) {
    return 1 + (clamp(power, 0, 200) / 200);
}

export function getTarotKingdomMagicScale(intelligence) {
    return 1 + (clamp(intelligence, 0, 200) / 200);
}

export function getTarotKingdomCardIdentity(card) {
    if (!card || card.kind !== 'minor') return '';
    const suit = normalizeSuit(card.suit);
    const rank = positiveRank(card.number);
    return suit && rank ? `${suit}:${rank}` : '';
}

export function isTarotKingdomDeckMatch(card, deckEntry) {
    return !!getTarotKingdomCardIdentity(card)
        && getTarotKingdomCardIdentity(card) === `${normalizeSuit(deckEntry?.suit)}:${positiveRank(deckEntry?.rank)}`;
}

function getLivingPlayerIndexes(players = [], actorIndex = 0, predicate = null) {
    const count = Math.max(1, players.length);
    const indexes = [];
    for (let offset = 0; offset < count; offset += 1) {
        const index = (Math.max(0, actorIndex) + offset) % count;
        const player = players[index];
        if (!player || finiteNumber(player.hp, 0) <= 0) continue;
        if (predicate && !predicate(player, index)) continue;
        indexes.push(index);
    }
    return indexes.sort((left, right) => {
        const leftHp = finiteNumber(players[left]?.hp, 0);
        const rightHp = finiteNumber(players[right]?.hp, 0);
        if (leftHp !== rightHp) return leftHp - rightHp;
        const leftOffset = (left - actorIndex + count) % count;
        const rightOffset = (right - actorIndex + count) % count;
        return leftOffset - rightOffset;
    });
}

function findNegativeStatusKey(statuses = {}) {
    return NEGATIVE_STATUS_PRIORITY.find((key) => statuses?.[key]) || '';
}

function createDamageEffect(kind, label, amount, extras = {}) {
    const damage = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    return {
        source: 'weapon',
        kind,
        label,
        targetType: 'enemy',
        amount: damage,
        score: damage,
        ...extras
    };
}

function getWeaponSuit(weapon) {
    if (weapon === 'staff' || weapon === 'polearm') return 'Cup';
    if (weapon === 'wand' || weapon === 'gun' || weapon === 'gun_big' || weapon === 'bow') return 'Wand';
    if (weapon === 'sword' || weapon === 'sword_big' || weapon === 'dagger') return 'Sword';
    if (weapon === 'axe' || weapon === 'axe_big' || weapon === 'blunt' || weapon === 'shield') return 'Pentacle';
    return '';
}

function buildWeaponCandidate(weapon, card, context = {}) {
    const rank = positiveRank(card?.number);
    const suit = normalizeSuit(card?.suit);
    if (!rank || !suit || getWeaponSuit(weapon) !== suit) return null;
    const combat = context.character?.combat || {};
    const physicalScale = getTarotKingdomPhysicalScale(combat.power);
    const magicScale = getTarotKingdomMagicScale(combat.intelligence);
    const chance = getTarotKingdomStatusChance(rank);
    const players = Array.isArray(context.players) ? context.players : [];
    const actorIndex = Math.max(0, Math.floor(finiteNumber(context.actorIndex, 0)));
    const effects = context.effects && typeof context.effects === 'object' ? context.effects : {};

    if (weapon === 'staff') {
        if (rank % 2 === 0) {
            const statusTargets = getLivingPlayerIndexes(players, actorIndex, (_player, index) => (
                !!findNegativeStatusKey(effects.players?.[index] || {})
            ));
            if (statusTargets.length) {
                const targetIndex = statusTargets[0];
                const statusKey = findNegativeStatusKey(effects.players?.[targetIndex] || {});
                return {
                    source: 'weapon', kind: 'cleanse', label: '浄化', targetType: 'player', targetIndex,
                    statusKey, amount: 1, score: 25, rank, weapon, suit
                };
            }
        }
        const living = getLivingPlayerIndexes(players, actorIndex);
        if (!living.length) return null;
        const targetIndex = living[0];
        const fullAmount = Math.floor(rank * 2 * magicScale);
        const amount = rank % 2 === 0 ? Math.max(1, Math.floor(fullAmount / 2)) : fullAmount;
        const missing = Math.max(0, finiteNumber(players[targetIndex]?.maxHp, 0) - finiteNumber(players[targetIndex]?.hp, 0));
        return {
            source: 'weapon', kind: 'heal', label: rank % 2 === 0 ? '小回復' : '回復',
            targetType: 'player', targetIndex, amount, score: Math.min(amount, missing), rank, weapon, suit
        };
    }
    if (weapon === 'wand') {
        return createDamageEffect('magic', '魔法ダメージ', rank * 2 * magicScale, { rank, weapon, suit });
    }
    if (weapon === 'sword' || weapon === 'sword_big') {
        return createDamageEffect('effective', '有効打', rank * 2.5 * physicalScale, { rank, weapon, suit });
    }
    if (weapon === 'axe' || weapon === 'axe_big') {
        return createDamageEffect('effective', '斧の大打撃', rank * 3 * physicalScale, { rank, weapon, suit });
    }
    if (weapon === 'polearm') {
        const hitCount = rank <= 5 ? 2 : (rank <= 10 ? 3 : 4);
        const perHit = Math.max(1, Math.floor((rank * physicalScale) / 2));
        return createDamageEffect('multi-hit', `${hitCount}連撃`, perHit * hitCount, {
            rank, weapon, suit, hitCount, perHit
        });
    }
    if (weapon === 'dagger') {
        const statusKey = rank % 2 === 0 ? 'paralysis' : 'poison';
        const potency = statusKey === 'poison' ? Math.max(1, Math.floor((rank * physicalScale) / 2)) : 1;
        return {
            source: 'weapon', kind: 'status', label: statusKey === 'poison' ? '毒' : '麻痺',
            targetType: 'enemy', statusKey, potency, chance, score: chance * (statusKey === 'paralysis' ? 40 : potency * 2),
            rank, weapon, suit
        };
    }
    if (weapon === 'gun' || weapon === 'gun_big' || weapon === 'bow') {
        const statusKey = rank % 2 === 0 ? 'blind' : 'burn';
        const potency = statusKey === 'burn'
            ? Math.max(1, Math.floor((rank * physicalScale) / 2))
            : Math.min(50, 15 + (rank * 2));
        return {
            source: 'weapon', kind: 'status', label: statusKey === 'burn' ? '火傷' : '暗闇',
            targetType: 'enemy', statusKey, potency, chance, score: chance * (statusKey === 'blind' ? 25 : potency * 2),
            rank, weapon, suit
        };
    }
    if (weapon === 'blunt') {
        const potency = Math.min(40, 10 + (rank * 2));
        return {
            source: 'weapon', kind: 'status', label: '崩し', targetType: 'enemy', statusKey: 'break',
            potency, chance, charges: 1, score: chance * potency, rank, weapon, suit
        };
    }
    if (weapon === 'shield') {
        if (rank % 2 === 1) {
            const potency = Math.min(50, 20 + (rank * 2));
            return {
                source: 'weapon', kind: 'guard', label: '全体防御', targetType: 'party', statusKey: 'areaGuard',
                potency, charges: 1, score: potency, rank, weapon, suit
            };
        }
        const potency = Math.min(50, 15 + (rank * 2));
        return {
            source: 'weapon', kind: 'guard', label: '身代わり', targetType: 'party', statusKey: 'cover',
            potency, charges: 1, coverIndex: actorIndex, score: potency + 5, rank, weapon, suit
        };
    }
    return null;
}

export function resolveTarotKingdomWeaponEffect(context = {}) {
    if (String(context.playType || '') !== 'set') return null;
    const cards = (Array.isArray(context.cards) ? context.cards : []).filter((card) => card?.kind === 'minor');
    if (!cards.length || cards.length > 3) return null;
    const combat = context.character?.combat || {};
    const weaponTypes = normalizeTarotKingdomWeaponTypes(combat.weaponTypes, combat.weaponType);
    const primary = normalizeWeapon(combat.weaponType);
    const candidates = [];
    cards.forEach((card) => {
        weaponTypes.forEach((weapon) => {
            const candidate = buildWeaponCandidate(weapon, card, context);
            if (candidate) candidates.push(candidate);
        });
    });
    candidates.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        const leftPrimary = left.weapon === primary ? 1 : 0;
        const rightPrimary = right.weapon === primary ? 1 : 0;
        if (rightPrimary !== leftPrimary) return rightPrimary - leftPrimary;
        return String(left.weapon).localeCompare(String(right.weapon));
    });
    return candidates[0] || null;
}

function resonanceScaleForSuit(suit, combat = {}) {
    return suit === 'Wand' || suit === 'Cup'
        ? getTarotKingdomMagicScale(combat.intelligence)
        : getTarotKingdomPhysicalScale(combat.power);
}

function createResonanceStep(kind, label, extras = {}) {
    return { source: 'resonance', kind, label, ...extras };
}

function addEffectCodeSteps(steps, entry, code, context) {
    const rank = entry.rank;
    const chance = getTarotKingdomStatusChance(rank);
    const targetSelf = String(code.target || entry.target || '').toLowerCase() === 'self';
    const playerTarget = { targetType: 'player', targetIndex: context.actorIndex };
    const enemyTarget = { targetType: 'enemy' };
    const target = targetSelf ? playerTarget : enemyTarget;
    const value = finiteNumber(code.value, 0);
    const multiplier = finiteNumber(code.multiplier, 0);
    if (code.type === 'burn' || code.type === 'flood' || code.type === 'fear' || code.type === 'confusion') {
        const statusKey = code.type === 'flood' ? 'wet' : code.type;
        const potency = statusKey === 'burn'
            ? Math.max(1, Math.floor((rank * resonanceScaleForSuit(entry.suit, context.character?.combat)) / 2))
            : (statusKey === 'wet' ? 20 : 1);
        steps.push(createResonanceStep('status', entry.skillName, {
            ...enemyTarget, statusKey, potency, chance, score: chance * (statusKey === 'fear' || statusKey === 'confusion' ? 30 : 18)
        }));
        return;
    }
    if (code.type === 'healPercent') {
        steps.push(createResonanceStep('heal-percent', entry.skillName, { ...playerTarget, percent: Math.max(0, value), score: Math.max(0, value) }));
        return;
    }
    if (code.type === 'healOrCleanseBurn') {
        steps.push(createResonanceStep('heal-or-cleanse', entry.skillName, { ...playerTarget, percent: Math.max(0, value), statusKey: 'burn', score: 20 }));
        return;
    }
    if (code.type === 'healAndCleanseOne') {
        steps.push(createResonanceStep('heal-cleanse', entry.skillName, { ...playerTarget, percent: Math.max(0, value), score: 28 }));
        return;
    }
    if (code.type === 'cleanse') {
        steps.push(createResonanceStep('cleanse', entry.skillName, {
            ...playerTarget,
            statusKey: String(code.status || ''),
            statusKeys: Array.isArray(code.statuses) ? code.statuses : [],
            score: 24
        }));
        return;
    }
    if (code.type === 'nextDamageTaken') {
        const potency = Math.round((1 - (multiplier || 1)) * 100);
        steps.push(createResonanceStep('guard', entry.skillName, {
            ...target, statusKey: targetSelf ? 'guard' : 'break', potency: Math.abs(potency),
            charges: Math.max(1, Math.floor(finiteNumber(code.charges, 1))), score: Math.abs(potency)
        }));
        return;
    }
    if (code.type === 'defenseDown') {
        const potency = Math.max(1, Math.round((1 - (multiplier || 0.9)) * 100));
        steps.push(createResonanceStep('status', entry.skillName, { ...enemyTarget, statusKey: 'break', potency, chance, charges: 1, score: potency }));
        return;
    }
    if (code.type === 'speedChange' || code.type === 'nextMinorEffectMultiplier') {
        const potency = Math.max(10, Math.round(Math.abs(1 - (multiplier || 0.8)) * 100));
        if (targetSelf) {
            steps.push(createResonanceStep('buff', entry.skillName, { ...playerTarget, statusKey: 'nextEffectUp', potency, charges: 1, score: potency }));
        } else {
            steps.push(createResonanceStep('status', entry.skillName, { ...enemyTarget, statusKey: 'weaken', potency, chance: 1, charges: 1, score: potency }));
        }
        return;
    }
    if (code.type === 'accuracyBonus') {
        steps.push(createResonanceStep('buff', entry.skillName, {
            ...playerTarget, statusKey: 'statusChanceUp', potency: finiteNumber(code.value, 10), charges: 1, score: 10
        }));
        return;
    }
    if (code.type === 'mpPercent') {
        if (finiteNumber(code.value, 0) > 0 || String(code.target || '') === 'self') {
            steps.push(createResonanceStep('buff', entry.skillName, {
                ...playerTarget, statusKey: 'nextEffectUp', potency: Math.max(5, Math.abs(value)), charges: 1, score: Math.max(5, Math.abs(value))
            }));
        } else {
            steps.push(createResonanceStep('status', entry.skillName, { ...enemyTarget, statusKey: 'weaken', potency: Math.abs(value), chance: 1, charges: 1, score: Math.abs(value) }));
        }
        return;
    }
    if (code.type === 'morale' || code.type === 'moraleOrPower') {
        steps.push(createResonanceStep('buff', entry.skillName, {
            targetType: 'party', statusKey: 'nextAttackUp', potency: Math.max(15, finiteNumber(code.powerBonus, 15)), charges: 1, score: 18
        }));
        return;
    }
    if (code.type === 'nextWandsPower' || code.type === 'nextMinorPower') {
        steps.push(createResonanceStep('buff', entry.skillName, {
            ...playerTarget, statusKey: code.type === 'nextWandsPower' ? 'nextWandUp' : 'nextEffectFlat',
            potency: Math.max(1, value), charges: 1, score: Math.max(10, value)
        }));
        return;
    }
    if (code.type === 'clearGuard' || code.type === 'clearEnemyEvasion') {
        steps.push(createResonanceStep('dispel', entry.skillName, { ...enemyTarget, statusKey: code.type === 'clearGuard' ? 'guard' : 'evasion', score: 18 }));
        return;
    }
    if (code.type === 'extraHpPercentDamage') {
        steps.push(createResonanceStep('conditional-percent-damage', entry.skillName, {
            ...enemyTarget, percent: Math.max(0, value), conditionStatus: String(code.conditionStatus || ''), score: Math.max(0, value) * 3
        }));
        return;
    }
    if (code.type === 'counter') {
        steps.push(createResonanceStep('buff', entry.skillName, {
            ...playerTarget, statusKey: 'counter', potency: Math.max(1, finiteNumber(code.power, value || 60)), charges: 1, score: 20
        }));
        return;
    }
    if (code.type === 'evasion') {
        steps.push(createResonanceStep('buff', entry.skillName, {
            ...playerTarget, statusKey: 'evasion', potency: Math.round(getTarotKingdomStatusChance(rank) * 100), charges: 1, score: 24
        }));
    }
}

export function buildTarotKingdomResonanceCandidate(entry, card, context = {}) {
    const normalized = normalizeTarotKingdomDeckEntry(entry, entry?.slot || 0);
    if (!normalized || !isTarotKingdomDeckMatch(card, normalized)) return null;
    const steps = [];
    const combat = context.character?.combat || {};
    if (Number.isFinite(normalized.power) && normalized.power > 0) {
        let rawPower = normalized.power;
        const condition = normalized.conditionalPower;
        if (condition && typeof condition === 'object') {
            const status = String(condition.status || '').toLowerCase();
            if ((status === 'any' && Object.keys(context.effects?.enemy || {}).length)
                || (status && context.effects?.enemy?.[status])
                || (condition.enemyGuarding && context.effects?.enemy?.guard)
                || (condition.enemyUsedPriority && context.enemyAttackedSinceClear)) {
                rawPower += finiteNumber(condition.value, 0);
            } else if (condition.selfSpeedAtLeastEnemy) {
                rawPower += Math.floor(finiteNumber(condition.value, 0) / 2);
            }
        }
        let damage = Math.floor(rawPower * 0.2 * resonanceScaleForSuit(normalized.suit, combat));
        damage = Math.floor(damage * (1 + Math.min(0.5, (normalized.ignoreDefense * 0.5) + normalized.criticalBonus)));
        if (normalized.priority) damage = Math.floor(damage * 1.1);
        steps.push(createResonanceStep('damage', normalized.skillName, {
            targetType: 'enemy', amount: Math.max(1, damage), score: Math.max(1, damage), hitCount: normalized.hitCount
        }));
    }
    normalized.effectCodes.forEach((code) => addEffectCodeSteps(steps, normalized, code, context));
    if (normalized.drainRate > 0) {
        steps.push(createResonanceStep('drain', normalized.skillName, {
            targetType: 'player', targetIndex: context.actorIndex, rate: normalized.drainRate, score: 12
        }));
    }
    if (!steps.length) {
        steps.push(createResonanceStep('buff', normalized.skillName, {
            targetType: 'party', statusKey: 'nextAttackUp', potency: 10, charges: 1, score: 10
        }));
    }
    return {
        source: 'resonance',
        cardId: normalized.cardId,
        itemId: normalized.itemId,
        slot: normalized.slot,
        suit: normalized.suit,
        rank: normalized.rank,
        skillName: normalized.skillName,
        steps,
        score: steps.reduce((sum, step) => sum + Math.max(0, finiteNumber(step.score, 0)), 0)
    };
}

function getResonancePriority(candidate, context = {}) {
    const steps = Array.isArray(candidate?.steps) ? candidate.steps : [];
    const damage = steps
        .filter((step) => ['damage', 'magic', 'effective', 'multi-hit', 'conditional-percent-damage'].includes(step.kind))
        .reduce((sum, step) => sum + Math.max(0, finiteNumber(step.amount, 0)), 0);
    const enemyHp = Math.max(0, finiteNumber(context.enemy?.hp, 0));
    let actualHeal = 0;
    let cleanse = 0;
    let actionStop = 0;
    let defense = 0;
    steps.forEach((step) => {
        const targetIndex = Math.max(0, Math.floor(finiteNumber(step.targetIndex, context.actorIndex || 0)));
        const target = context.players?.[targetIndex] || {};
        const maxHp = Math.max(1, finiteNumber(target.maxHp, 1));
        const missing = Math.max(0, maxHp - Math.max(0, finiteNumber(target.hp, 0)));
        if (step.kind === 'heal') actualHeal += Math.min(missing, Math.max(0, finiteNumber(step.amount, 0)));
        if (step.kind === 'heal-percent' || step.kind === 'heal-or-cleanse' || step.kind === 'heal-cleanse') {
            actualHeal += Math.min(missing, Math.floor(maxHp * (Math.max(0, finiteNumber(step.percent, 0)) / 100)));
        }
        if (step.kind === 'drain') actualHeal += Math.min(missing, Math.floor(damage * Math.max(0, finiteNumber(step.rate, 0))));
        if (step.kind === 'cleanse' || step.kind === 'heal-or-cleanse' || step.kind === 'heal-cleanse' || step.kind === 'dispel') cleanse += 1;
        if (step.kind === 'status' && ['paralysis', 'fear', 'confusion'].includes(String(step.statusKey || ''))) actionStop += Math.max(1, finiteNumber(step.score, 1));
        if (step.kind === 'guard' || step.kind === 'buff' || ['guard', 'areaGuard', 'cover', 'counter', 'evasion'].includes(String(step.statusKey || ''))) {
            defense += Math.max(1, finiteNumber(step.potency, finiteNumber(step.score, 1)));
        }
    });
    return [enemyHp > 0 && damage >= enemyHp ? 1 : 0, actualHeal, damage, actionStop, cleanse, defense, candidate.score];
}

export function resolveTarotKingdomResonance(context = {}) {
    const cards = (Array.isArray(context.cards) ? context.cards : []).filter((card) => card?.kind === 'minor');
    const deck = normalizeTarotKingdomTarotDeck(context.character?.tarotDeck || []);
    const candidates = [];
    cards.forEach((card) => {
        deck.forEach((entry) => {
            const candidate = buildTarotKingdomResonanceCandidate(entry, card, context);
            if (candidate) candidates.push(candidate);
        });
    });
    candidates.sort((left, right) => {
        const leftPriority = getResonancePriority(left, context);
        const rightPriority = getResonancePriority(right, context);
        for (let index = 0; index < leftPriority.length; index += 1) {
            if (rightPriority[index] !== leftPriority[index]) return rightPriority[index] - leftPriority[index];
        }
        return left.slot - right.slot;
    });
    return candidates[0] || null;
}

export function getUnsupportedTarotKingdomEffectCodes(deck = []) {
    const unsupported = new Set();
    (Array.isArray(deck) ? deck : []).map((entry, index) => normalizeTarotKingdomDeckEntry(entry, index)).filter(Boolean).forEach((entry) => {
        entry.effectCodes.forEach((code) => {
            if (!KNOWN_RESONANCE_EFFECT_CODES.has(code.type)) unsupported.add(code.type);
        });
    });
    return Array.from(unsupported).sort();
}

export const TAROT_KINGDOM_STATUS_ICON_INDEX = Object.freeze({
    burn: 144,
    wet: 149,
    fear: 230,
    confusion: 222,
    poison: 144,
    paralysis: 222,
    blind: 68,
    weaken: 97,
    vulnerable: 223,
    break: 74,
    guard: 203,
    areaGuard: 203,
    cover: 203,
    counter: 136,
    evasion: 223,
    nextAttackUp: 136,
    nextEffectUp: 136,
    nextWandUp: 144,
    nextEffectFlat: 136,
    statusChanceUp: 68,
    regen: 149,
    allStatsUp: 136,
    statusImmunity: 203,
    damageBarrier: 203,
    debuffImmunity: 203,
    attackDown: 97,
    defenseDown: 97,
    intimidate: 230,
    chariot: 136,
    lastStand: 136,
    invisible: 223,
    partyCritical: 136,
    enemyCritical: 136,
    hpShield: 203,
    bloodPact: 144,
    majorConfusion: 222,
    mirageBlind: 68,
    decoy: 223,
    sunBlessing: 136,
    timeStop: 222
});

export const __test = {
    KNOWN_RESONANCE_EFFECT_CODES,
    buildWeaponCandidate,
    findNegativeStatusKey,
    normalizeEffectCode,
    normalizeSuit,
    normalizeWeapon
};
