import { getTarotBattleSkills } from './playfabClient.js?v=20260826-tutorial-reward-v1';
import { getCanonicalTarotCategory } from './tarotCards.js';

const MINOR_SUIT_ALIASES = {
    wand: 'wand',
    wands: 'wand',
    fire: 'wand',
    sword: 'sword',
    swords: 'sword',
    wind: 'sword',
    cup: 'cup',
    cups: 'cup',
    water: 'cup',
    pentacle: 'pentacle',
    pentacles: 'pentacle',
    coin: 'pentacle',
    coins: 'pentacle',
    earth: 'pentacle'
};

const FACE_ORDER = {
    A: 1,
    ACE: 1,
    PAGE: 11,
    KNIGHT: 12,
    QUEEN: 13,
    KING: 14
};

let tarotBattleSkillsPromise = null;
let tarotBattleSkillsByItemId = new Map();
let tarotBattleSkillsByCardId = new Map();

function normalizeMinorSuit(value) {
    const raw = String(value || '').trim().toLowerCase();
    return MINOR_SUIT_ALIASES[raw] || raw;
}

function parseRankNumber(value) {
    const raw = String(value || '').trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return FACE_ORDER[raw.toUpperCase()] || null;
}

function normalizeItemIdToSkillKey(itemId) {
    const id = String(itemId || '').trim();
    if (!id) return '';
    const major = id.match(/^MAJOR_(\d+)$/i);
    if (major) return `arcana-${Number(major[1])}`;
    const arcana = id.match(/^arcana-(\d+)$/i);
    if (arcana) return `arcana-${Number(arcana[1])}`;
    const legacyMajor = id.match(/^tarot[_-]major[_-][a-z]+[_-](\d+)$/i);
    if (legacyMajor) return `arcana-${Number(legacyMajor[1])}`;

    const minor = id.match(/^(WAND|SWORD|CUP|PENTACLE)_(\d+)$/i);
    if (minor) return `minor-${minor[1].toLowerCase()}-${Number(minor[2])}`;
    const modernMinor = id.match(/^minor-(wand|sword|cup|pentacle)-(\d+)$/i);
    if (modernMinor) return `minor-${modernMinor[1].toLowerCase()}-${Number(modernMinor[2])}`;
    const legacyMinor = id.match(/^tarot[_-]minor[_-](wand|sword|cup|pentacle)[_-](\d+)$/i);
    if (legacyMinor) return `minor-${legacyMinor[1].toLowerCase()}-${Number(legacyMinor[2])}`;
    return id;
}

function itemDataToSkillKey(itemData) {
    if (!itemData || typeof itemData !== 'object') return '';
    const category = getCanonicalTarotCategory(itemData.Category);
    if (category === 'TarotMajor') {
        const number = Number(itemData.ArcanaNumber ?? itemData.CardNumber);
        return Number.isFinite(number) ? `arcana-${number}` : '';
    }
    if (category === 'TarotMinor') {
        const suit = normalizeMinorSuit(itemData.ArcanaSuit || itemData.Suit);
        const rank = parseRankNumber(itemData.ArcanaRank || itemData.Rank || itemData.CardRank || itemData.CardNumber);
        return suit && rank ? `minor-${suit}-${rank}` : '';
    }
    return '';
}

function indexTarotBattleSkills(cards = []) {
    const byItemId = new Map();
    const byCardId = new Map();
    (Array.isArray(cards) ? cards : []).forEach((skill) => {
        const itemId = normalizeItemIdToSkillKey(skill?.itemId);
        if (itemId) byItemId.set(itemId, { ...skill, itemId });
        const cardId = String(skill?.cardId || '').trim().toUpperCase();
        if (cardId) byCardId.set(cardId, { ...skill, itemId });
    });
    tarotBattleSkillsByItemId = byItemId;
    tarotBattleSkillsByCardId = byCardId;
}

export async function preloadTarotBattleSkills() {
    if (tarotBattleSkillsByItemId.size > 0) return true;
    if (!tarotBattleSkillsPromise) {
        tarotBattleSkillsPromise = getTarotBattleSkills()
            .then((data) => {
                indexTarotBattleSkills(data?.cards || []);
                return true;
            })
            .catch((error) => {
                console.warn('[tarotBattleSkills] load failed:', error);
                return false;
            })
            .finally(() => {
                tarotBattleSkillsPromise = null;
            });
    }
    return tarotBattleSkillsPromise;
}

export function resolveTarotBattleSkill(itemId, itemData = null) {
    const directKey = normalizeItemIdToSkillKey(itemId);
    const dataKey = itemDataToSkillKey(itemData);
    return tarotBattleSkillsByItemId.get(directKey)
        || tarotBattleSkillsByItemId.get(dataKey)
        || tarotBattleSkillsByCardId.get(String(itemId || '').trim().toUpperCase())
        || null;
}

export const __test = {
    normalizeItemIdToSkillKey,
    itemDataToSkillKey,
    indexTarotBattleSkills
};
