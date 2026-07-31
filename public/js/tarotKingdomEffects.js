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

async function loadTarotKingdomArcanaEffects() {
    const injected = globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__;
    if (injected && typeof injected === 'object') return injected;
    if (String(import.meta.url || '').startsWith('data:')) {
        return { version: 1, minor: [], guardian: [] };
    }
    const url = new URL('../data/tarot-kingdom-arcana-effects.json', import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Arcana effects could not be loaded: ${response.status}`);
    return response.json();
}

export const TAROT_KINGDOM_ARCANA_EFFECTS = await loadTarotKingdomArcanaEffects();
export const TAROT_KINGDOM_ARCANA_EFFECT_CATALOG = TAROT_KINGDOM_ARCANA_EFFECTS;
const MINOR_RESONANCE_BY_KEY = new Map(
    (Array.isArray(TAROT_KINGDOM_ARCANA_EFFECTS.minor) ? TAROT_KINGDOM_ARCANA_EFFECTS.minor : [])
        .map((entry) => [`${entry.suit}:${entry.rank}`, entry])
);
const GUARDIAN_BY_NUMBER = new Map(
    (Array.isArray(TAROT_KINGDOM_ARCANA_EFFECTS.guardian) ? TAROT_KINGDOM_ARCANA_EFFECTS.guardian : [])
        .map((entry) => [Number(entry.number), entry])
);

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

export function normalizeTarotKingdomDeckEntry(raw = {}, slot = 0) {
    const suit = normalizeSuit(raw.suit || raw.ArcanaSuit);
    const rank = positiveRank(raw.rank ?? raw.number ?? raw.ArcanaRank);
    if (!suit || !rank) return null;
    const itemId = String(raw.itemId || raw.ItemId || `minor-${SUIT_KEYS[suit]}-${rank}`).trim();
    const cardId = String(raw.cardId || `${SUIT_KEYS[suit].toUpperCase()}_${String(rank).padStart(2, '0')}`).trim();
    const definition = MINOR_RESONANCE_BY_KEY.get(`${suit}:${rank}`) || null;
    const rawSteps = Array.isArray(raw.steps) ? raw.steps : definition?.steps;
    return {
        slot: Math.max(0, Math.min(4, Math.floor(finiteNumber(raw.slot, slot)))),
        cardId,
        itemId,
        suit,
        rank,
        cardLevel: Math.max(1, Math.min(15, Math.floor(finiteNumber(raw.cardLevel, 1)))),
        resonanceId: String(raw.resonanceId || definition?.id || `${SUIT_KEYS[suit]}-${rank}`).trim(),
        skillName: String(definition?.name || raw.skillName || raw.cardName || `${suit} ${rank}`).trim(),
        effectText: String(definition?.effect || raw.effectText || '').trim(),
        steps: (Array.isArray(rawSteps) ? rawSteps : []).map((step) => ({ ...step }))
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

export function normalizeTarotKingdomGuardian(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    const parsedNumber = Math.floor(finiteNumber(raw.number, -1));
    if (parsedNumber < 0 || parsedNumber > 21 || !GUARDIAN_BY_NUMBER.has(parsedNumber)) return null;
    const number = parsedNumber;
    const definition = GUARDIAN_BY_NUMBER.get(number);
    return {
        itemId: String(raw.itemId || '').trim(),
        number,
        name: String(raw.name || '').trim(),
        cardLevel: Math.max(1, Math.min(25, Math.floor(finiteNumber(raw.cardLevel, 1)))),
        passiveId: String(raw.passiveId || definition.passiveId).trim(),
        passiveName: String(raw.passiveName || definition.passiveName).trim(),
        awakeningId: String(raw.awakeningId || definition.awakeningId).trim()
    };
}

export function getTarotKingdomGuardianDefinition(number) {
    const definition = GUARDIAN_BY_NUMBER.get(Math.floor(finiteNumber(number, -1)));
    return definition ? { ...definition } : null;
}

export function getTarotKingdomMinorDefinition(suit, rank) {
    const definition = MINOR_RESONANCE_BY_KEY.get(`${normalizeSuit(suit)}:${positiveRank(rank)}`);
    return definition ? { ...definition, steps: definition.steps.map((step) => ({ ...step })) } : null;
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

export function getTarotKingdomLevelDamageScale(level) {
    return 1 + (clamp(Math.floor(finiteNumber(level, 1)) - 1, 0, 100) / 100);
}

export function getTarotKingdomEquipmentDamageScale(equipmentPower) {
    return 1 + (clamp(equipmentPower, 0, 100) / 200);
}

export function getTarotKingdomGrowthDamageScale(character = {}, damageKind = 'physical', growthVersion = 0) {
    if (Number(growthVersion) < 1) return 1;
    const combat = character?.combat && typeof character.combat === 'object' ? character.combat : {};
    const equipmentPower = String(damageKind || '').toLowerCase() === 'magic'
        ? finiteNumber(combat.equipmentMagicPower, 0)
        : finiteNumber(combat.equipmentPower, 0);
    return getTarotKingdomLevelDamageScale(character?.level) * getTarotKingdomEquipmentDamageScale(equipmentPower);
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
    const physicalGrowthScale = getTarotKingdomGrowthDamageScale(
        context.character,
        'physical',
        context.growthVersion
    );
    const magicGrowthScale = getTarotKingdomGrowthDamageScale(
        context.character,
        'magic',
        context.growthVersion
    );
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
        const fullAmount = Math.floor(rank * 2 * magicScale * magicGrowthScale);
        const amount = rank % 2 === 0 ? Math.max(1, Math.floor(fullAmount / 2)) : fullAmount;
        const missing = Math.max(0, finiteNumber(players[targetIndex]?.maxHp, 0) - finiteNumber(players[targetIndex]?.hp, 0));
        return {
            source: 'weapon', kind: 'heal', label: rank % 2 === 0 ? '小回復' : '回復',
            targetType: 'player', targetIndex, amount, score: Math.min(amount, missing), rank, weapon, suit
        };
    }
    if (weapon === 'wand') {
        return createDamageEffect('magic', '魔法ダメージ', rank * 2 * magicScale * magicGrowthScale, { rank, weapon, suit });
    }
    if (weapon === 'sword' || weapon === 'sword_big') {
        return createDamageEffect('effective', '有効打', rank * 2.5 * physicalScale * physicalGrowthScale, { rank, weapon, suit });
    }
    if (weapon === 'axe' || weapon === 'axe_big') {
        return createDamageEffect('effective', '斧の大打撃', rank * 3 * physicalScale * physicalGrowthScale, { rank, weapon, suit });
    }
    if (weapon === 'polearm') {
        const hitCount = rank <= 5 ? 2 : (rank <= 10 ? 3 : 4);
        const perHit = Math.max(1, Math.floor((rank * physicalScale * physicalGrowthScale) / 2));
        return createDamageEffect('multi-hit', `${hitCount}連撃`, perHit * hitCount, {
            rank, weapon, suit, hitCount, perHit
        });
    }
    if (weapon === 'dagger') {
        const statusKey = rank % 2 === 0 ? 'paralysis' : 'poison';
        const potency = statusKey === 'poison'
            ? Math.max(1, Math.floor((rank * physicalScale * physicalGrowthScale) / 2))
            : 1;
        return {
            source: 'weapon', kind: 'status', label: statusKey === 'poison' ? '毒' : '麻痺',
            targetType: 'enemy', statusKey, potency, chance, score: chance * (statusKey === 'paralysis' ? 40 : potency * 2),
            rank, weapon, suit
        };
    }
    if (weapon === 'gun' || weapon === 'gun_big' || weapon === 'bow') {
        const statusKey = rank % 2 === 0 ? 'blind' : 'burn';
        const potency = statusKey === 'burn'
            ? Math.max(1, Math.floor((rank * physicalScale * physicalGrowthScale) / 2))
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

function createResonanceStep(kind, label, extras = {}) {
    return { source: 'resonance', kind, label, ...extras };
}

export function getTarotKingdomCardLevelScale(level) {
    return 1 + (Math.max(1, Math.floor(finiteNumber(level, 1))) - 1) * 0.02;
}

function getContextLivingPlayerIndexes(context = {}) {
    return (Array.isArray(context.players) ? context.players : [])
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => Number(player?.hp) > 0)
        .map(({ index }) => index);
}

function getLowestHpIndex(context = {}, excludeIndex = null) {
    const actorIndex = Math.max(0, Math.floor(finiteNumber(context.actorIndex, 0)));
    const count = Math.max(1, context.players?.length || 1);
    return getContextLivingPlayerIndexes(context)
        .filter((index) => index !== excludeIndex)
        .sort((left, right) => {
            const leftPlayer = context.players[left] || {};
            const rightPlayer = context.players[right] || {};
            const leftRate = Math.max(0, finiteNumber(leftPlayer.hp, 0)) / Math.max(1, finiteNumber(leftPlayer.maxHp, 1));
            const rightRate = Math.max(0, finiteNumber(rightPlayer.hp, 0)) / Math.max(1, finiteNumber(rightPlayer.maxHp, 1));
            if (leftRate !== rightRate) return leftRate - rightRate;
            return ((left - actorIndex + count) % count) - ((right - actorIndex + count) % count);
        })[0] ?? null;
}

function getNextLivingIndex(context = {}, fromIndex = 0) {
    const living = new Set(getContextLivingPlayerIndexes(context));
    const count = Math.max(1, context.players?.length || 1);
    for (let offset = 1; offset < count; offset += 1) {
        const candidate = (fromIndex + offset) % count;
        if (living.has(candidate)) return candidate;
    }
    return null;
}

function getResonanceValue(entry, context, kind) {
    const combat = context.character?.combat || {};
    const scale = kind === 'magic'
        ? getTarotKingdomMagicScale(combat.intelligence)
        : getTarotKingdomPhysicalScale(combat.power);
    const growth = getTarotKingdomGrowthDamageScale(context.character, kind, context.growthVersion);
    return Math.max(1, Math.floor(
        (5 + (entry.rank * 0.75))
        * scale
        * growth
        * getTarotKingdomCardLevelScale(entry.cardLevel)
    ));
}

function scaledNumeric(value, levelScale, cap = Infinity) {
    return Math.min(cap, Math.max(0, Math.round(finiteNumber(value, 0) * levelScale)));
}

function addPlayerStatus(steps, entry, raw, targetType, targetIndex, levelScale) {
    const potency = raw.potencyFromResonance != null
        ? Math.max(1, Math.floor(getResonanceValue(entry, raw.__context, 'physical') * finiteNumber(raw.potencyFromResonance, 0)))
        : scaledNumeric(raw.potency, levelScale, 50);
    steps.push(createResonanceStep(raw.statusKey === 'guard' ? 'guard' : 'buff', entry.skillName, {
        targetType,
        targetIndex,
        statusKey: raw.statusKey,
        potency,
        charges: raw.charges,
        turns: raw.turns,
        untilClear: raw.untilClear === true,
        score: Math.max(1, potency)
    }));
}

function expandResonanceDefinition(entry, context = {}) {
    const steps = [];
    const levelScale = getTarotKingdomCardLevelScale(entry.cardLevel);
    const actorIndex = Math.max(0, Math.floor(finiteNumber(context.actorIndex, 0)));
    const living = getContextLivingPlayerIndexes(context);
    const lowest = getLowestHpIndex(context);
    const lowestOther = getLowestHpIndex(context, actorIndex);
    const addHeal = (targetIndex, percent, raw = {}) => {
        if (!Number.isInteger(targetIndex)) return;
        let scaledPercent = scaledNumeric(percent, levelScale, 40);
        const player = context.players?.[targetIndex] || {};
        const hpRate = Math.max(0, finiteNumber(player.hp, 0)) / Math.max(1, finiteNumber(player.maxHp, 1));
        if (raw.thresholdPercent != null && hpRate * 100 <= finiteNumber(raw.thresholdPercent, 0)) {
            scaledPercent = Math.min(40, scaledPercent + scaledNumeric(raw.bonusPercent, levelScale, 40));
        }
        steps.push(createResonanceStep(raw.cleanseBelowPercent != null && hpRate * 100 <= raw.cleanseBelowPercent ? 'heal-cleanse' : 'heal-percent', entry.skillName, {
            targetType: 'player',
            targetIndex,
            percent: scaledPercent,
            score: scaledPercent
        }));
    };
    const addShield = (targetIndex, percent) => {
        if (!Number.isInteger(targetIndex)) return;
        const scaledPercent = scaledNumeric(percent, levelScale, 40);
        const maxHp = Math.max(1, finiteNumber(context.players?.[targetIndex]?.maxHp, 1));
        steps.push(createResonanceStep('buff', entry.skillName, {
            targetType: 'player',
            targetIndex,
            statusKey: 'hpShield',
            potency: scaledPercent,
            shieldHp: Math.max(1, Math.floor(maxHp * scaledPercent / 100)),
            score: scaledPercent
        }));
    };
    entry.steps.forEach((sourceStep) => {
        const raw = { ...sourceStep, __context: context };
        const magic = ['magic-damage', 'elemental-barrage', 'weakness-damage'].includes(raw.kind);
        const physical = raw.kind === 'physical-damage';
        if (magic || physical) {
            let multiplier = finiteNumber(raw.multiplier, 1);
            const enemyHp = Math.max(0, finiteNumber(context.enemy?.hp, 0));
            const enemyMaxHp = Math.max(1, finiteNumber(context.enemy?.maxHp, 1));
            if (raw.thresholdPercent != null && enemyHp / enemyMaxHp * 100 <= raw.thresholdPercent) {
                multiplier = finiteNumber(raw.thresholdMultiplier, multiplier);
            }
            const base = getResonanceValue(entry, context, magic ? 'magic' : 'physical');
            const elements = raw.kind === 'elemental-barrage'
                ? raw.elements
                : [raw.kind === 'weakness-damage' ? String(context.enemyAffinity?.weak || '') : raw.element];
            const hitCount = raw.kind === 'elemental-barrage'
                ? Math.max(1, elements.length)
                : Math.max(1, Math.floor(finiteNumber(raw.hitCount, 1)));
            steps.push(createResonanceStep(magic ? 'magic' : 'damage', entry.skillName, {
                targetType: 'enemy',
                amount: Math.max(1, Math.floor(base * multiplier)),
                element: elements.filter(Boolean)[0] || '',
                elements: elements.filter(Boolean),
                hitCount,
                ignoreDefense: clamp(raw.ignoreDefense, 0, 1),
                score: Math.max(1, Math.floor(base * multiplier))
            }));
            return;
        }
        if (raw.kind === 'heal-lowest') addHeal(lowest, raw.percent, raw);
        else if (raw.kind === 'heal-self') addHeal(actorIndex, raw.percent, raw);
        else if (raw.kind === 'heal-lowest-other') addHeal(lowestOther, raw.percent, raw);
        else if (raw.kind === 'heal-party') living.forEach((index) => addHeal(index, raw.percent, raw));
        else if (raw.kind === 'shield-self') addShield(actorIndex, raw.percent);
        else if (raw.kind === 'shield-lowest-other') addShield(lowestOther, raw.percent);
        else if (raw.kind === 'shield-party') living.forEach((index) => addShield(index, raw.percent));
        else if (raw.kind === 'cleanse-lowest') {
            const affected = living.find((index) => NEGATIVE_STATUS_PRIORITY.some((key) => context.effects?.players?.[index]?.[key]));
            if (Number.isInteger(affected)) {
                steps.push(createResonanceStep('cleanse', entry.skillName, {
                    targetType: 'player', targetIndex: affected, score: 20
                }));
            } else addHeal(lowest, raw.fallbackPercent, raw);
        } else if (raw.kind === 'heal-last-damage') {
            const maxHp = Math.max(1, finiteNumber(context.players?.[actorIndex]?.maxHp, 1));
            const amount = Math.min(
                Math.floor(maxHp * scaledNumeric(raw.capPercent, levelScale, 40) / 100),
                Math.floor(finiteNumber(context.lastEnemyDirectDamage, 0) * finiteNumber(raw.rate, 0) / 100)
            );
            steps.push(createResonanceStep('heal', entry.skillName, {
                targetType: 'player', targetIndex: actorIndex, amount, score: amount
            }));
        } else if (raw.kind === 'enemy-status') {
            const potency = raw.potencyFromResonance != null
                ? Math.max(1, Math.floor(getResonanceValue(entry, context, entry.suit === 'Wand' ? 'magic' : 'physical') * raw.potencyFromResonance))
                : scaledNumeric(raw.potency, levelScale, 50);
            steps.push(createResonanceStep('status', entry.skillName, {
                targetType: 'enemy',
                statusKey: raw.statusKey,
                potency,
                chance: raw.chance,
                charges: raw.charges,
                turns: raw.turns,
                untilClear: raw.untilClear === true,
                score: Math.max(1, potency)
            }));
        } else if (raw.kind === 'party-status') {
            addPlayerStatus(steps, entry, raw, 'party', null, levelScale);
        } else if (raw.kind === 'player-status-self') {
            addPlayerStatus(steps, entry, raw, 'player', actorIndex, levelScale);
        } else if (raw.kind === 'player-status-lowest') {
            addPlayerStatus(steps, entry, raw, 'player', lowest, levelScale);
        } else if (raw.kind === 'crit-pair') {
            [actorIndex, getNextLivingIndex(context, actorIndex)].filter(Number.isInteger).forEach((targetIndex) => {
                addPlayerStatus(steps, entry, { ...raw, statusKey: 'criticalUp' }, 'player', targetIndex, levelScale);
            });
        } else if (raw.kind === 'cover-lowest') {
            steps.push(createResonanceStep('buff', entry.skillName, {
                targetType: 'party',
                statusKey: 'cover',
                potency: scaledNumeric(raw.potency, levelScale, 50),
                coverIndex: actorIndex,
                targetIndex: lowestOther,
                charges: raw.charges,
                score: raw.potency
            }));
        } else if (raw.kind === 'defense-counter') {
            const defense = Math.max(0, finiteNumber(context.character?.combat?.defense, 0));
            const amount = Math.max(1, Math.floor((5 + entry.rank * 0.75) * (1 + Math.min(200, defense) / 200) * levelScale));
            steps.push(createResonanceStep('buff', entry.skillName, {
                targetType: 'player', targetIndex: actorIndex, statusKey: 'counter',
                potency: amount, charges: raw.charges, score: amount
            }));
        } else if (raw.kind === 'dispel-enemy-guard') {
            steps.push(createResonanceStep('dispel', entry.skillName, {
                targetType: 'enemy', statusKey: 'guard', score: 18
            }));
        } else if (raw.kind === 'cleanse-debuff-shield') {
            const affected = living.find((index) => ['weaken', 'attackDown', 'defenseDown', 'speedDown'].some((key) => context.effects?.players?.[index]?.[key]));
            const targetIndex = Number.isInteger(affected) ? affected : lowest;
            if (Number.isInteger(affected)) {
                steps.push(createResonanceStep('cleanse', entry.skillName, {
                    targetType: 'player', targetIndex: affected, score: 20
                }));
            }
            addShield(targetIndex, raw.percent);
        }
    });
    return steps;
}

export function buildTarotKingdomResonanceCandidate(entry, card, context = {}) {
    const normalized = normalizeTarotKingdomDeckEntry(entry, entry?.slot || 0);
    if (!normalized || !isTarotKingdomDeckMatch(card, normalized)) return null;
    const steps = expandResonanceDefinition(normalized, context);
    if (!steps.length) return null;
    return {
        source: 'resonance',
        cardId: normalized.cardId,
        itemId: normalized.itemId,
        slot: normalized.slot,
        suit: normalized.suit,
        rank: normalized.rank,
        cardLevel: normalized.cardLevel,
        resonanceId: normalized.resonanceId,
        skillName: normalized.skillName,
        steps,
        score: steps.reduce((sum, step) => sum + Math.max(0, finiteNumber(step.score, 0)), 0)
    };
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
    candidates.sort((left, right) => left.slot - right.slot);
    if (!candidates.length) return null;
    return {
        source: 'resonance',
        candidates,
        cardId: candidates[0].cardId,
        resonanceIds: candidates.map((candidate) => candidate.resonanceId),
        skillName: candidates.map((candidate) => candidate.skillName).join('・'),
        skillNames: candidates.map((candidate) => candidate.skillName),
        steps: candidates.flatMap((candidate) => (
            candidate.steps.map((step) => ({
                ...step,
                cardId: candidate.cardId,
                resonanceId: candidate.resonanceId,
                skillName: candidate.skillName
            }))
        )),
        score: candidates.reduce((sum, candidate) => sum + candidate.score, 0)
    };
}

export function getUnsupportedTarotKingdomEffectCodes(deck = []) {
    return (Array.isArray(deck) ? deck : [])
        .map((entry, index) => normalizeTarotKingdomDeckEntry(entry, index))
        .filter((entry) => entry && entry.steps.length === 0)
        .map((entry) => entry.resonanceId);
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
    buildWeaponCandidate,
    findNegativeStatusKey,
    normalizeSuit,
    normalizeWeapon
};
