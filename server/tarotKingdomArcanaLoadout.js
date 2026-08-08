const arcanaEffects = require('../public/data/tarot-kingdom-arcana-effects.json');
const {
    getCanonicalTarotCategory,
    getMajorArcanaTitle,
    enrichTarotCatalogData
} = require('./tarotCards');

const TAROT_GUARDIAN_DATA_KEY = 'TarotGuardianArcana';
const TAROT_GUARDIAN_VERSION = 1;

const MINOR_EFFECT_BY_KEY = new Map(
    arcanaEffects.minor.map((entry) => [`${entry.suit}-${entry.rank}`, entry])
);
const GUARDIAN_EFFECT_BY_NUMBER = new Map(
    arcanaEffects.guardian.map((entry) => [Number(entry.number), entry])
);

function clampCardLevel(value, isMajor = false) {
    const max = isMajor ? 25 : 15;
    return Math.max(1, Math.min(max, Math.floor(Number(value) || 1)));
}

function normalizeMinorSuit(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'cup' || key === 'cups') return 'Cup';
    if (key === 'wand' || key === 'wands') return 'Wand';
    if (key === 'sword' || key === 'swords') return 'Sword';
    if (key === 'pentacle' || key === 'pentacles' || key === 'coin' || key === 'coins') return 'Pentacle';
    return '';
}

function getMinorRank(itemData = {}) {
    const raw = String(
        itemData.ArcanaRank
        ?? itemData.Rank
        ?? itemData.CardRank
        ?? itemData.CardNumber
        ?? ''
    ).trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return Math.max(1, Math.min(14, Math.floor(numeric)));
    return {
        A: 1,
        ACE: 1,
        P: 11,
        PAGE: 11,
        N: 12,
        KNIGHT: 12,
        Q: 13,
        QUEEN: 13,
        K: 14,
        KING: 14
    }[raw.toUpperCase()] || 0;
}

function getMajorNumber(itemId, itemData = {}) {
    const direct = Number(itemData.ArcanaNumber ?? itemData.CardNumber);
    if (Number.isFinite(direct)) return Math.max(0, Math.min(21, Math.floor(direct)));
    const match = String(itemId || '').match(/(?:arcana-|_)(\d+)$/i);
    return match ? Math.max(0, Math.min(21, Math.floor(Number(match[1]) || 0))) : null;
}

function isMinorItem(itemData = {}) {
    return getCanonicalTarotCategory(itemData.Category) === 'TarotMinor';
}

function isMajorItem(itemData = {}) {
    return getCanonicalTarotCategory(itemData.Category) === 'TarotMajor';
}

function buildTarotKingdomMinorLoadout(itemIds = [], catalogCache = {}, cardLevels = {}) {
    return (Array.isArray(itemIds) ? itemIds : [])
        .slice(0, 5)
        .map((rawItemId, slot) => {
            const itemId = String(rawItemId || '').trim();
            const itemData = enrichTarotCatalogData(itemId, catalogCache[itemId] || {});
            if (!itemId || !isMinorItem(itemData)) return null;
            const suit = normalizeMinorSuit(itemData.ArcanaSuit || itemData.Suit);
            const rank = getMinorRank(itemData);
            const definition = MINOR_EFFECT_BY_KEY.get(`${suit}-${rank}`);
            if (!definition) return null;
            return {
                slot,
                itemId,
                suit,
                rank,
                cardLevel: clampCardLevel(cardLevels?.[itemId]?.level ?? cardLevels?.[itemId], false),
                resonanceId: definition.id,
                skillName: definition.name
            };
        })
        .filter(Boolean);
}

function buildTarotKingdomGuardian(itemId, catalogCache = {}, cardLevels = {}) {
    const normalizedItemId = String(itemId || '').trim();
    const itemData = enrichTarotCatalogData(normalizedItemId, catalogCache[normalizedItemId] || {});
    if (!normalizedItemId || !isMajorItem(itemData)) return null;
    const number = getMajorNumber(normalizedItemId, itemData);
    const definition = GUARDIAN_EFFECT_BY_NUMBER.get(number);
    if (!definition) return null;
    return {
        itemId: normalizedItemId,
        number,
        name: getMajorArcanaTitle(number),
        cardLevel: clampCardLevel(cardLevels?.[normalizedItemId]?.level ?? cardLevels?.[normalizedItemId], true),
        passiveId: definition.passiveId,
        passiveName: definition.passiveName,
        attribute: String(definition.attribute || 'neutral')
    };
}

function parseTarotGuardian(raw) {
    if (!raw) return { version: TAROT_GUARDIAN_VERSION, itemId: null };
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
            version: TAROT_GUARDIAN_VERSION,
            itemId: String(parsed?.itemId || '').trim() || null
        };
    } catch {
        return { version: TAROT_GUARDIAN_VERSION, itemId: null };
    }
}

function serializeTarotGuardian(itemId) {
    return JSON.stringify({
        version: TAROT_GUARDIAN_VERSION,
        itemId: String(itemId || '').trim() || null
    });
}

function getArcanaEffectsCatalog() {
    return arcanaEffects;
}

module.exports = {
    TAROT_GUARDIAN_DATA_KEY,
    TAROT_GUARDIAN_VERSION,
    buildTarotKingdomMinorLoadout,
    buildTarotKingdomGuardian,
    clampCardLevel,
    getArcanaEffectsCatalog,
    getMajorNumber,
    isMajorItem,
    parseTarotGuardian,
    serializeTarotGuardian
};
