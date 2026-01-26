// server/nation.js
// 国家関連のAPI

const { addGlobalChatMessage } = require('./chat');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const QUEST_QR_PREFIX = 'quest:';
const QUEST_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const QUEST_CLAIM_COLLECTION = 'troy_quest_claims';
const QUEST_REWARD_TABLE_PATH = path.join(__dirname, 'data', 'questRewardTables.json');
const QUEST_CLEAR_DATA_KEY = 'troyQuestClears';
const QUEST_REWARD_RARITY_LEVELS = ['common', 'rare', 'epic'];
const QUEST_REWARD_TIER_MIX = {
    common: { common: 1 },
    rare: { common: 1, rare: 0.8, epic: 0.25 },
    epic: { rare: 0.8, epic: 1.2 }
};
const QUEST_BET_TIER_THRESHOLDS = {
    bonus1: 500,
    bonus2: 1000
};
const QUEST_BET_MAX = 100000;
const QUEST_APPROVER_ADMIN_LINE_IDS = (process.env.QUEST_APPROVER_ADMIN_LINE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value);
const QUEST_REWARD_ITEM_BY_TYPE = {
    sword: process.env.QUEST_REWARD_SWORD_ITEM_ID || '',
    axe: process.env.QUEST_REWARD_AXE_ITEM_ID || '',
    spear: process.env.QUEST_REWARD_SPEAR_ITEM_ID || '',
    staff: process.env.QUEST_REWARD_STAFF_ITEM_ID || '',
    gun: process.env.QUEST_REWARD_GUN_ITEM_ID || '',
    helmet: process.env.QUEST_REWARD_HELMET_ITEM_ID || '',
    shield: process.env.QUEST_REWARD_SHIELD_ITEM_ID || '',
    item: process.env.QUEST_REWARD_ITEM_ITEM_ID || ''
};
const QUEST_GACHA_TYPE_ALIASES = {
    hat: 'helmet',
    leather: 'helmet',
    metal: 'helmet',
    wand: 'staff',
    staff: 'staff',
    dagger: 'sword',
    sword: 'sword',
    axe: 'axe',
    blunt: 'axe',
    shield: 'shield',
    polearm: 'spear',
    gun: 'gun'
};
const QUEST_REWARD_GACHA_TYPES = new Set(Object.keys(QUEST_REWARD_ITEM_BY_TYPE));
const QUEST_ALLOWED_GACHA_TYPES = new Set([
    ...Object.keys(QUEST_REWARD_ITEM_BY_TYPE),
    ...Object.keys(QUEST_GACHA_TYPE_ALIASES),
    'skill'
]);
let questRewardTablesCache = null;

const NATION_GROUP_BY_RACE = {
    Human: { island: 'fire', groupName: 'nation_fire_island' },
    Goblin: { island: 'water', groupName: 'nation_water_island' },
    Orc: { island: 'earth', groupName: 'nation_earth_island' },
    Elf: { island: 'wind', groupName: 'nation_wind_island' }
};

const NATION_GROUP_BY_NATION = {
    fire: { island: 'fire', groupName: 'nation_fire_island' },
    earth: { island: 'earth', groupName: 'nation_earth_island' },
    wind: { island: 'wind', groupName: 'nation_wind_island' },
    water: { island: 'water', groupName: 'nation_water_island' }
};

const NATION_EMOJI_BY_NATION = {
    fire: '🔥',
    water: '💧',
    wind: '🌪️',
    earth: '🌱',
    neutral: '🏴'
};

const AVATAR_COLOR_BY_NATION = {
    fire: 'red',
    earth: 'green',
    wind: 'purple',
    water: 'blue'
};

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function normalizeQuestDifficulty(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value <= 2) return 'easy';
        if (value <= 4) return 'normal';
        return 'hard';
    }
    const key = String(value || '').toLowerCase().trim();
    if (key === 'easy' || key === 'normal' || key === 'hard') return key;
    const numeric = Number(key);
    if (Number.isFinite(numeric)) {
        if (numeric <= 2) return 'easy';
        if (numeric <= 4) return 'normal';
        return 'hard';
    }
    return 'normal';
}

function normalizeQuestBetAmount(value) {
    const amount = Math.floor(Number(value) || 0);
    if (!Number.isFinite(amount) || amount < 0) return 0;
    return Math.min(amount, QUEST_BET_MAX);
}

function normalizeQuestGachaType(gachaType) {
    const raw = String(gachaType || '').toLowerCase().trim();
    if (raw === 'skill') {
        return { raw, rewardKey: '', isSkill: true };
    }
    const rewardKey = QUEST_GACHA_TYPE_ALIASES[raw] || raw;
    return { raw, rewardKey, isSkill: false };
}

function getQuestBetTier(betAmount) {
    if (betAmount >= QUEST_BET_TIER_THRESHOLDS.bonus2) return 2;
    if (betAmount >= QUEST_BET_TIER_THRESHOLDS.bonus1) return 1;
    return 0;
}

function resolveQuestRewardTier(difficulty, betAmount) {
    const difficultyKey = normalizeQuestDifficulty(difficulty);
    const baseTier = difficultyKey === 'easy' ? 0 : difficultyKey === 'hard' ? 2 : 1;
    const bonusTier = getQuestBetTier(betAmount);
    const tierIndex = Math.min(2, baseTier + bonusTier);
    return QUEST_REWARD_RARITY_LEVELS[tierIndex] || 'common';
}

function parseQuestClears(rawValue) {
    if (!rawValue) return {};
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
}

function base64UrlEncode(input) {
    return Buffer.from(input, 'utf8')
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(input) {
    const normalized = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function getQuestClaimDoc(firestore, claimId) {
    return firestore.collection(QUEST_CLAIM_COLLECTION).doc(claimId);
}

function buildQuestPayloadString(payload) {
    const ordered = {
        claimId: payload.claimId,
        playerId: payload.playerId,
        questId: payload.questId,
        questKey: payload.questKey,
        gachaType: payload.gachaType,
        nonce: payload.nonce,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt
    };
    if (payload.difficulty) {
        ordered.difficulty = payload.difficulty;
    }
    if (payload.betAmount !== undefined) {
        ordered.betAmount = payload.betAmount;
    }
    return JSON.stringify(ordered);
}

function signQuestPayload(payload, secret) {
    const body = buildQuestPayloadString(payload);
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function encodeQuestQrValue(payload) {
    return `${QUEST_QR_PREFIX}${base64UrlEncode(JSON.stringify(payload))}`;
}

function decodeQuestQrValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value.startsWith(QUEST_QR_PREFIX)) return null;
    const encoded = value.slice(QUEST_QR_PREFIX.length);
    if (!encoded) return null;
    try {
        const decoded = base64UrlDecode(encoded);
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}

function generateQuestClaimId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

async function getLineUserId(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['lineUserId']
    });
    const lineUserId = result?.Data?.lineUserId?.Value;
    return lineUserId ? String(lineUserId) : '';
}

async function isAdminApprover(playFabId, deps) {
    if (!QUEST_APPROVER_ADMIN_LINE_IDS.length) return false;
    const lineUserId = await getLineUserId(playFabId, deps);
    if (!lineUserId) return false;
    return QUEST_APPROVER_ADMIN_LINE_IDS.includes(lineUserId);
}

async function isGuildLeader(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabGroups, ensureTitleEntityToken } = deps;
    await ensureTitleEntityToken();
    const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    const entity = profile?.PlayerProfile?.Entity;
    if (!entity?.Id || !entity?.Type) return false;
    const membership = await promisifyPlayFab(PlayFabGroups.ListMembership, {
        Entity: { Id: entity.Id, Type: entity.Type }
    });
    const groups = membership?.Groups || [];
    return groups.some((group) => String(group.RoleName || '').toLowerCase() === 'admins');
}

function resolveQuestRewardItemId(gachaType) {
    const normalized = normalizeQuestGachaType(gachaType);
    if (!normalized.rewardKey) return '';
    if (!QUEST_REWARD_GACHA_TYPES.has(normalized.rewardKey)) return '';
    return QUEST_REWARD_ITEM_BY_TYPE[normalized.rewardKey] || '';
}

function loadQuestRewardTables() {
    if (questRewardTablesCache) return questRewardTablesCache;
    try {
        const raw = fs.readFileSync(QUEST_REWARD_TABLE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        questRewardTablesCache = parsed?.tables || parsed || {};
    } catch (error) {
        console.warn('[quest-reward] Failed to load reward tables:', error?.message || error);
        questRewardTablesCache = {};
    }
    return questRewardTablesCache;
}

function flattenQuestRewardTable(entry) {
    if (Array.isArray(entry)) return entry;
    if (!entry || typeof entry !== 'object') return [];
    const merged = [];
    QUEST_REWARD_RARITY_LEVELS.forEach((tier) => {
        const list = entry[tier];
        if (Array.isArray(list)) merged.push(...list);
    });
    return merged;
}

function getQuestRewardPool(gachaType) {
    const tables = loadQuestRewardTables();
    const normalized = normalizeQuestGachaType(gachaType);
    if (!normalized.rewardKey) return [];
    return flattenQuestRewardTable(tables?.[normalized.rewardKey]);
}

function getQuestRewardPoolForTier(gachaType, tier) {
    const tables = loadQuestRewardTables();
    const normalized = normalizeQuestGachaType(gachaType);
    if (!normalized.rewardKey) return [];
    const entry = tables?.[normalized.rewardKey];
    if (Array.isArray(entry)) return entry;
    if (!entry || typeof entry !== 'object') return [];
    const tierKey = QUEST_REWARD_RARITY_LEVELS.includes(tier) ? tier : 'common';
    const mix = QUEST_REWARD_TIER_MIX[tierKey] || QUEST_REWARD_TIER_MIX.common;
    const pool = [];
    Object.keys(mix).forEach((bucket) => {
        const multiplier = mix[bucket];
        const list = entry[bucket];
        if (!Array.isArray(list)) return;
        list.forEach((item) => {
            const weight = Math.max(1, Math.round((Number(item.weight) || 1) * multiplier));
            pool.push({ ...item, weight });
        });
    });
    return pool;
}

function pickWeightedItem(items) {
    const pool = items.filter((item) => item && typeof item === 'object');
    if (!pool.length) return null;
    const weights = pool.map((item) => Math.max(1, Number(item.weight) || 1));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
}

function resolveQuestRewardFromTables(gachaType, tier) {
    const pool = getQuestRewardPoolForTier(gachaType, tier);
    const picked = pickWeightedItem(pool);
    const itemId = picked?.itemId || picked?.id || '';
    return itemId ? String(itemId) : '';
}

function getAvatarColorForNation(nation) {
    const key = String(nation || '').toLowerCase();
    return AVATAR_COLOR_BY_NATION[key] || null;
}

function getNationMappingByNation(nation) {
    const key = String(nation || '').toLowerCase();
    return NATION_GROUP_BY_NATION[key] || null;
}

function stripNationEmoji(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.replace(/^(🔥|💧|🌪️|🌱|🏴)\s*/, '').trim();
}

function buildNationDisplayName(baseName, nation) {
    const key = String(nation || '').toLowerCase();
    const emoji = NATION_EMOJI_BY_NATION[key] || '';
    const base = stripNationEmoji(baseName);
    if (!emoji) return base;
    return base ? `${emoji} ${base}` : emoji;
}

async function ensureNationDisplayName(playFabId, nation, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin } = deps;
    if (!playFabId || !nation) return;
    let currentDisplayName = '';
    let baseName = '';
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['BaseDisplayName']
        });
        baseName = ro?.Data?.BaseDisplayName?.Value || '';
    } catch (e) {
        console.warn('[displayName] BaseDisplayName fetch failed:', e?.errorMessage || e?.message || e);
    }
    if (!baseName) {
        try {
            const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true }
            });
            currentDisplayName = profile?.PlayerProfile?.DisplayName || '';
            baseName = stripNationEmoji(currentDisplayName) || playFabId;
        } catch (e) {
            console.warn('[displayName] GetPlayerProfile failed:', e?.errorMessage || e?.message || e);
            baseName = playFabId;
        }
    }
    const nextDisplayName = buildNationDisplayName(baseName, nation);
    if (nextDisplayName && nextDisplayName !== currentDisplayName) {
        try {
            await promisifyPlayFab(PlayFabAdmin.UpdateUserTitleDisplayName, {
                PlayFabId: playFabId,
                DisplayName: nextDisplayName
            });
        } catch (e) {
            console.warn('[displayName] UpdateUserTitleDisplayName failed:', e?.errorMessage || e?.message || e);
        }
    }
    try {
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId,
            Data: { BaseDisplayName: baseName }
        });
    } catch (e) {
        console.warn('[displayName] UpdateUserReadOnlyData(BaseDisplayName) failed:', e?.errorMessage || e?.message || e);
    }
}

async function getNationForPlayer(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: ['Nation']
    });
    const nation = ro?.Data?.Nation?.Value || null;
    return nation ? String(nation).toLowerCase() : null;
}

function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

function getTroyRoomDoc(firestore, groupName) {
    return firestore.collection('troy_rooms').doc(groupName);
}

const MAP_OCCUPATION_KEY = 'MapOccupationByMapId';

const NATION_LEVEL_MAX = 14;

function getArcanaPointValue(mapId) {
    const key = String(mapId || '').trim();
    if (!key.startsWith('major_')) return 0;
    const raw = key.replace('major_', '');
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
}

function calcNationLevel(points) {
    const safePoints = Math.max(0, Math.floor(Number(points) || 0));
    if (safePoints <= 10) return Math.max(1, safePoints);
    if (safePoints <= 20) return 11;
    if (safePoints <= 30) return 12;
    if (safePoints <= 40) return 13;
    return NATION_LEVEL_MAX;
}

async function updateNationArcanaPoints(nation, delta, deps) {
    const { firestore, admin } = deps || {};
    const mapping = getNationMappingByNation(nation);
    if (!mapping || !firestore) return;
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const current = Math.max(0, Math.floor(Number(snap.data()?.arcanaPoints || 0)));
        const next = Math.max(0, current + Math.floor(Number(delta) || 0));
        const level = calcNationLevel(next);
        const patch = {
            arcanaPoints: next,
            nationLevel: level
        };
        if (admin) {
            patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        tx.set(docRef, patch, { merge: true });
    });
}

async function getMapOccupationMap(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [MAP_OCCUPATION_KEY] });
    const raw = result?.Data?.[MAP_OCCUPATION_KEY] || '';
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function getMapOccupationNation(mapId, deps) {
    const key = String(mapId || '').trim();
    if (!key) return null;
    const map = await getMapOccupationMap(deps);
    const value = map?.[key];
    return value ? String(value).toLowerCase() : null;
}

async function setMapOccupationNation(mapId, nation, deps) {
    const key = String(mapId || '').trim();
    if (!key) return null;
    const map = await getMapOccupationMap(deps);
    const prevNation = map[key] ? String(map[key]).toLowerCase() : null;
    const nextNation = nation ? String(nation).toLowerCase() : null;
    if (nextNation) {
        map[key] = nextNation;
    } else {
        delete map[key];
    }
    await deps.promisifyPlayFab(deps.PlayFabAdmin.SetTitleData, {
        Key: MAP_OCCUPATION_KEY,
        Value: JSON.stringify(map)
    });
    const arcanaValue = getArcanaPointValue(key);
    if (arcanaValue > 0 && prevNation !== nextNation) {
        if (prevNation) {
            await updateNationArcanaPoints(prevNation, -arcanaValue, deps);
        }
        if (nextNation) {
            await updateNationArcanaPoints(nextNation, arcanaValue, deps);
        }
    }
    return map[key] || null;
}

async function getPlayerDisplayName(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        const name = profile?.PlayerProfile?.DisplayName;
        return name ? String(name) : '';
    } catch (error) {
        console.warn('[getPlayerDisplayName] Failed:', error?.errorMessage || error?.message || error);
        return '';
    }
}

async function ensureNationGroupExists(firestore, mapping, deps) {
    const { promisifyPlayFab, PlayFabAdmin, PlayFabGroups, ensureTitleEntityToken, admin } = deps;

    const docRef = await getNationGroupDoc(firestore, mapping.groupName);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.groupId) {
        const existingGroupId = docSnap.data().groupId;
        try {
            await ensureTitleEntityToken();
            await promisifyPlayFab(PlayFabGroups.GetGroup, {
                Group: { Id: existingGroupId, Type: 'group' }
            });
            return {
                groupId: existingGroupId,
                groupName: mapping.groupName,
                created: false
            };
        } catch (e) {
            console.warn('[ensureNationGroupExists] Stored groupId invalid, recreating:', existingGroupId);
        }
    }

    const titleDataKey = 'NationGroupIds';
    const titleData = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [titleDataKey] });
    let titleGroupId = null;
    if (titleData?.Data?.[titleDataKey]) {
        try {
            const parsed = JSON.parse(titleData.Data[titleDataKey]);
            titleGroupId = parsed?.[mapping.groupName] || null;
        } catch (e) {
            console.warn('[ensureNationGroupExists] Failed to parse TitleData:', e?.message || e);
        }
    }
    if (titleGroupId) {
        try {
            await ensureTitleEntityToken();
            await promisifyPlayFab(PlayFabGroups.GetGroup, {
                Group: { Id: titleGroupId, Type: 'group' }
            });
            await docRef.set({
                groupId: titleGroupId,
                groupName: mapping.groupName,
                nation: mapping.island,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { groupId: titleGroupId, groupName: mapping.groupName, created: false };
        } catch (e) {
            console.warn('[ensureNationGroupExists] TitleData groupId invalid, recreating:', titleGroupId);
            titleGroupId = null;
        }
    }

    await ensureTitleEntityToken();
    const createResult = await promisifyPlayFab(PlayFabGroups.CreateGroup, {
        GroupName: mapping.groupName
    });
    const groupId = createResult?.Group?.Id || null;
    if (!groupId) {
        throw new Error('CreateGroup did not return group id');
    }

    await docRef.set({
        groupId,
        groupName: mapping.groupName,
        nation: mapping.island,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const newTitleMap = { [mapping.groupName]: groupId };
    try {
        const existing = titleData?.Data?.[titleDataKey] ? JSON.parse(titleData.Data[titleDataKey]) : {};
        const merged = { ...existing, ...newTitleMap };
        await promisifyPlayFab(PlayFabAdmin.SetTitleData, {
            Key: titleDataKey,
            Value: JSON.stringify(merged)
        });
    } catch (e) {
        console.warn('[ensureNationGroupExists] Failed to update TitleData:', e?.message || e);
    }

    return { groupId, groupName: mapping.groupName, created: true };
}

async function getNationGroupIdByNation(nation, firestore, deps) {
    const key = String(nation || '').toLowerCase();
    if (!key) return null;
    const mapping = getNationMappingByNation(key);
    if (!mapping) return null;
    const info = await ensureNationGroupExists(firestore, mapping, deps);
    return info?.groupId || null;
}

async function getNationGroupEntityKey(nation, firestore, deps) {
    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) return null;
    return { Id: groupId, Type: 'group' };
}

async function getGroupTreasuryBalance(groupId, deps) {
    if (!groupId) return 0;
    if (!deps?.getAllInventoryItems || !deps?.getVirtualCurrencyMap) return 0;
    const entityKey = { Id: groupId, Type: 'group' };
    const items = await deps.getAllInventoryItems(entityKey);
    const totals = deps.getVirtualCurrencyMap(items);
    return Math.max(0, Math.floor(Number(totals?.PS) || 0));
}

async function getNationTaxRateBps(nation, firestore, deps) {
    const { getGroupDataValue } = deps;
    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) return 0;
    const raw = await getGroupDataValue(groupId, 'taxRateBps');
    const bps = Math.max(0, Math.min(5000, Math.floor(Number(raw) || 0)));
    return bps;
}

async function addNationTreasury(nation, amount, firestore, deps, options = {}) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    const entityKey = await getNationGroupEntityKey(nation, firestore, deps);
    if (!entityKey) return null;
    if (!deps?.addEconomyItem) {
        throw new Error('Missing addEconomyItem dependency');
    }
    if (value > 0) {
        await deps.addEconomyItem(entityKey.Id, 'PS', value, { entityKeyOverride: entityKey, idempotencyId: options.idempotencyId });
    }
    const treasuryPs = await getGroupTreasuryBalance(entityKey.Id, deps);
    return { groupId: entityKey.Id, treasuryPs };
}

async function getNationTreasuryRanking(firestore, deps) {
    const rows = [];
    for (const mapping of Object.values(NATION_GROUP_BY_NATION)) {
        try {
            const info = await ensureNationGroupExists(firestore, mapping, deps);
            const groupId = info?.groupId;
            if (!groupId) {
                rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
                continue;
            }
            const treasuryPs = await getGroupTreasuryBalance(groupId, deps);
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs });
        } catch (error) {
            console.warn('[getNationTreasuryRanking] Failed for', mapping?.groupName, error?.message || error);
            rows.push({ nation: mapping.island, groupName: mapping.groupName, treasuryPs: 0 });
        }
    }

    rows.sort((a, b) => b.treasuryPs - a.treasuryPs);
    return rows;
}

async function getPlayerEntity(playFabId, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    if (!playFabId) return null;
    try {
        const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true, ShowEntity: true }
        });
        const entityId = profile?.PlayerProfile?.Entity?.Id || profile?.PlayerProfile?.EntityId || null;
        const entityType = profile?.PlayerProfile?.Entity?.Type || profile?.PlayerProfile?.EntityType || null;
        if (entityId && entityType) return { Id: entityId, Type: entityType };
    } catch (error) {
        console.warn('[getPlayerEntity] GetPlayerProfile failed:', error?.errorMessage || error?.message || error);
    }
    return null;
}

async function requireKingContext(playFabId, firestore, deps) {
    const { promisifyPlayFab, PlayFabServer } = deps;
    const kingId = normalizePlayFabId(playFabId);
    if (!kingId) throw new Error('InvalidPlayFabId');

    const nation = await getNationForPlayer(kingId, { promisifyPlayFab, PlayFabServer });
    if (!nation) throw new Error('KingNationNotSet');
    const mapping = getNationMappingByNation(nation);
    if (!mapping) throw new Error('InvalidKingNation');

    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) throw new Error('NationGroupNotFound');

    const groupSnap = await getNationGroupDoc(firestore, mapping.groupName).get();
    const storedKingId = groupSnap.exists ? normalizePlayFabId(groupSnap.data()?.kingPlayFabId || '') : '';
    if (storedKingId && storedKingId !== kingId) throw new Error('NotKing');

    if (!storedKingId) {
        const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: kingId,
            Keys: ['IsKing', 'NationKingId']
        });
        const isKing = String(kingRo?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
        const roKingId = normalizePlayFabId(kingRo?.Data?.NationKingId?.Value || '');
        if (!isKing || (roKingId && roKingId !== kingId)) throw new Error('NotKing');
    }

    return { kingId, nation, mapping, groupId };
}

// APIルートを初期化
function initializeNationRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, firestore, admin, ensureTitleEntityToken, getGroupDataValue, setGroupDataValues, subtractEconomyItem, addEconomyItem, getCurrencyBalance, applyTax, transferOwnedIslands, createStarterIsland, relocateActiveShip } = deps;

    const nationDeps = {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabGroups,
        ensureTitleEntityToken,
        admin,
        getGroupDataValue,
        setGroupDataValues,
        addEconomyItem,
        getAllInventoryItems: deps.getAllInventoryItems,
        getVirtualCurrencyMap: deps.getVirtualCurrencyMap
    };

    // 国家グループ取得
    app.post('/api/get-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            const docRef = await getNationGroupDoc(firestore, mapping.groupName);
            const docSnap = await docRef.get();
            const data = docSnap.exists ? docSnap.data() : null;
            return res.json({
                groupName: mapping.groupName,
                groupId: data && data.groupId ? data.groupId : null
            });
        } catch (error) {
            console.error('[get-nation-group] Error:', error.errorMessage || error.message);
            return res.status(500).json({ error: 'Failed to get nation group', details: error.errorMessage || error.message });
        }
    });

    // 国家グループ確保
    app.post('/api/ensure-nation-group', async (req, res) => {
        const { raceName } = req.body || {};
        if (!raceName) return res.status(400).json({ error: 'raceName is required' });

        const mapping = NATION_GROUP_BY_RACE[raceName];
        if (!mapping) return res.status(400).json({ error: 'Invalid raceName' });

        try {
            let result;
            try {
                result = await ensureNationGroupExists(firestore, mapping, nationDeps);
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (String(msg).includes('group name is already in use')) {
                    const retry = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: ['NationGroupIds'] });
                    let retryGroupId = null;
                    try {
                        const parsed = retry?.Data?.NationGroupIds ? JSON.parse(retry.Data.NationGroupIds) : {};
                        retryGroupId = parsed?.[mapping.groupName] || null;
                    } catch (parseErr) {
                        console.warn('[ensure-nation-group] Retry parse failed:', parseErr?.message || parseErr);
                    }
                    if (retryGroupId) {
                        await getNationGroupDoc(firestore, mapping.groupName).set({
                            groupId: retryGroupId,
                            groupName: mapping.groupName,
                            nation: mapping.island,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        result = { groupId: retryGroupId, groupName: mapping.groupName, created: false };
                    } else {
                        throw e;
                    }
                } else {
                    throw e;
                }
            }
            return res.json({
                groupName: mapping.groupName,
                groupId: result.groupId,
                created: result.created
            });
        } catch (error) {
            console.error('[ensure-nation-group] Error:', error.errorMessage || error.message || error);
            return res.status(500).json({ error: 'Failed to ensure nation group', details: error.errorMessage || error.message || String(error) });
        }
    });

    // 国王ページデータ取得
    app.post('/api/get-nation-king-page', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });

        try {
            const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['NationGroupId', 'IsKing', 'NationKingId']
            });
            if (!ro || !ro.Data || !ro.Data.NationGroupId || !ro.Data.NationGroupId.Value) {
                return res.json({ notInNation: true });
            }

            const selfId = normalizePlayFabId(playFabId);
            const isKingFlag = String(ro?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
            const roKingId = normalizePlayFabId(ro?.Data?.NationKingId?.Value || '');
            if (isKingFlag && (!roKingId || roKingId === selfId)) {
                try {
                    const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
                    const mapping = getNationMappingByNation(nation);
                    if (mapping) {
                        const docRef = getNationGroupDoc(firestore, mapping.groupName);
                        const docSnap = await docRef.get();
                        const storedKingId = normalizePlayFabId(docSnap.data()?.kingPlayFabId || '');
                        if (storedKingId !== selfId) {
                            await docRef.set({
                                kingPlayFabId: selfId,
                                kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                    }
                } catch (syncError) {
                    console.warn('[get-nation-king-page] Failed to sync kingPlayFabId:', syncError?.message || syncError);
                }
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: playFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });

            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NationGroupNotSet')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('JavascriptException')) {
                    return res.json({ notInNation: true });
                }
                if (String(msg).includes('NotKing')) {
                    return res.status(403).json({ error: 'Only the king can view this page' });
                }
                if (String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Nation king is not set' });
                }
                return res.status(500).json({ error: 'Failed to get king page data', details: msg });
            }

            const payload = csResult ? (csResult.FunctionResult || {}) : {};
            try {
                const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
                const groupId = await getNationGroupIdByNation(nation, firestore, nationDeps);
                const mapping = getNationMappingByNation(nation);
                if (groupId) {
                    const grantMultiplierRaw = await getGroupDataValue(groupId, 'grantMultiplier');
                    const grantMultiplierValue = Number(grantMultiplierRaw);
                    const grantMultiplier = Number.isFinite(grantMultiplierValue) && grantMultiplierValue >= 0
                        ? grantMultiplierValue
                        : 1;
                    const treasuryPs = await getGroupTreasuryBalance(groupId, nationDeps);
                    payload.grantMultiplier = grantMultiplier;
                    payload.treasuryPs = treasuryPs;
                }
                if (mapping) {
                    const roomSnap = await getTroyRoomDoc(firestore, mapping.groupName).get();
                    payload.troyOpen = !!roomSnap.data()?.isOpen;
                }
            } catch (e) {
                console.warn('[get-nation-king-page] Failed to load group tax data:', e?.message || e);
            }

            res.json(payload);
        } catch (error) {
            const msg = error.errorMessage || error.message;
            if (String(msg).includes('NationGroupNotSet')) {
                return res.json({ notInNation: true });
            }
            if (String(msg).includes('JavascriptException')) {
                return res.json({ notInNation: true });
            }
            console.error('[get-nation-king-page]', msg);
            res.status(500).json({ error: 'Failed to get king page data', details: msg });
        }
    });

    // 付与倍率設定
    app.post('/api/king-set-grant-multiplier', async (req, res) => {
        const { playFabId, grantMultiplier } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const multiplierValue = Number(grantMultiplier);
        if (!Number.isFinite(multiplierValue) || multiplierValue < 0) {
            return res.status(400).json({ error: 'Grant multiplier must be 0 or greater' });
        }

        try {
            const context = await requireKingContext(playFabId, firestore, nationDeps);
            await setGroupDataValues(context.groupId, { grantMultiplier: String(multiplierValue) });
            res.json({ success: true, grantMultiplier: multiplierValue });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-set-grant-multiplier] Error:', msg);
            res.status(500).json({ error: 'Failed to set grant multiplier' });
        }
    });

    // TROY営業状態の変更
    app.post('/api/king-set-troy-open', async (req, res) => {
        const { playFabId, isOpen } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const nextOpen = !!isOpen;

        try {
            const context = await requireKingContext(playFabId, firestore, nationDeps);
            const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
            await roomRef.set({
                isOpen: nextOpen,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: context.kingId
            }, { merge: true });
            const kingName = await getPlayerDisplayName(context.kingId, { promisifyPlayFab, PlayFabServer });
            const label = kingName || '王';
            const message = nextOpen ? 'TROYをOPEN！' : 'TROYをCLOSE。';
            addGlobalChatMessage(message, label);
            res.json({ success: true, isOpen: nextOpen });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-set-troy-open] Error:', msg);
            res.status(500).json({ error: 'Failed to update troy status' });
        }
    });

    // TROY状態取得
    app.post('/api/get-troy-status', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.json({ isOpen: false, members: [], notInNation: true });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.json({ isOpen: false, members: [], notInNation: true });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const isOpen = !!roomSnap.data()?.isOpen;

            const membersSnap = await roomRef
                .collection('members')
                .orderBy('joinedAt', 'asc')
                .limit(50)
                .get();
            const members = membersSnap.docs.map(doc => {
                const data = doc.data() || {};
                return {
                    playFabId: doc.id,
                    displayName: data.displayName || doc.id,
                    joinedAt: data.joinedAt ? data.joinedAt.toMillis?.() || data.joinedAt : null
                };
            });
            const memberId = normalizePlayFabId(playFabId);
            let checkout = null;
            if (memberId) {
                const checkoutSnap = await roomRef.collection('checkouts').doc(memberId).get();
                if (checkoutSnap.exists) {
                    const checkoutData = checkoutSnap.data() || {};
                    checkout = {
                        status: checkoutData.status || 'pending',
                        total: Number(checkoutData.total || 0),
                        items: Array.isArray(checkoutData.items) ? checkoutData.items : [],
                        createdAt: checkoutData.createdAt ? checkoutData.createdAt.toMillis?.() || checkoutData.createdAt : null,
                        approvedAt: checkoutData.approvedAt ? checkoutData.approvedAt.toMillis?.() || checkoutData.approvedAt : null
                    };
                }
            }

            res.json({ isOpen, members, nation, checkout });
        } catch (error) {
            console.error('[get-troy-status] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get troy status' });
        }
    });

    // TROY会計（セッション確定）
    app.post('/api/troy-checkout', async (req, res) => {
        const { playFabId, items, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.data() || {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(playFabId);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }

            const safeItems = Array.isArray(items) ? items : [];
            const normalizedItems = safeItems
                .map((item) => {
                    const name = String(item?.name || item?.itemName || '').trim();
                    const price = Math.max(0, Math.floor(Number(item?.price) || 0));
                    const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
                    if (!name || !price) return null;
                    return { name, price, quantity };
                })
                .filter(Boolean);
            if (!normalizedItems.length) {
                return res.status(400).json({ error: 'NoItems' });
            }

            const total = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            if (!Number.isFinite(total) || total <= 0) {
                return res.status(400).json({ error: 'InvalidTotal' });
            }

            const checkoutRef = roomRef.collection('checkouts').doc(memberId);
            const checkoutSnap = await checkoutRef.get();
            if (checkoutSnap.exists && String(checkoutSnap.data()?.status || 'pending') === 'pending') {
                return res.status(409).json({ error: 'CheckoutPending' });
            }

            const buyerName = String(displayName || '').trim()
                || await getPlayerDisplayName(playFabId, { promisifyPlayFab, PlayFabServer })
                || playFabId;

            await checkoutRef.set({
                playFabId: memberId,
                displayName: buyerName,
                items: normalizedItems,
                total,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const kingPlayFabId = String(roomData.updatedBy || '').trim();
            if (kingPlayFabId) {
                const kingLineUserId = await getLineUserId(kingPlayFabId, { promisifyPlayFab, PlayFabServer });
                if (kingLineUserId) {
                    const itemLines = normalizedItems.map((item) => {
                        const lineTotal = item.price * item.quantity;
                        return `- ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''} / ¥${lineTotal.toLocaleString('ja-JP')}`;
                    });
                    const message = [
                        '【TROY 会計確定】',
                        `注文者: ${buyerName}`,
                        '内容:',
                        ...itemLines,
                        `会計合計: ¥${total.toLocaleString('ja-JP')}`
                    ].join('\n');
                    try {
                        await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
                    } catch (lineError) {
                        console.warn('[troy-checkout] Line notify failed:', lineError?.message || lineError);
                    }
                }
            }

            res.json({
                success: true,
                checkout: {
                    status: 'pending',
                    total,
                    items: normalizedItems
                }
            });
        } catch (error) {
            console.error('[troy-checkout] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to checkout' });
        }
    });

    // TROY注文通知
    app.post('/api/troy-order', async (req, res) => {
        const { playFabId, itemName, price, quantity, total, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!itemName) return res.status(400).json({ error: 'itemName is required' });
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.data() || {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }
            const memberId = normalizePlayFabId(playFabId);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }
            const kingPlayFabId = String(roomData.updatedBy || '').trim();
            if (!kingPlayFabId) {
                return res.status(404).json({ error: 'KingNotFound' });
            }
            const kingLineUserId = await getLineUserId(kingPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!kingLineUserId) {
                return res.status(404).json({ error: 'KingLineNotFound' });
            }

            const buyerName = String(displayName || '').trim()
                || await getPlayerDisplayName(playFabId, { promisifyPlayFab, PlayFabServer })
                || playFabId;
            const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
            const priceValue = Math.max(0, Math.floor(Number(price) || 0));
            const orderAmount = Math.max(0, priceValue * safeQty);
            const totalValue = Number(total);
            const priceLabel = Number.isFinite(priceValue) ? `¥${priceValue.toLocaleString('ja-JP')}` : '不明';
            const totalLabel = Number.isFinite(totalValue) ? `¥${totalValue.toLocaleString('ja-JP')}` : '不明';
            const orderLine = `${String(itemName)}${safeQty > 1 ? ` x${safeQty}` : ''}`;
            const message = [
                '【TROY注文】',
                `注文者: ${buyerName}`,
                `内容: ${orderLine}`,
                `金額: ${priceLabel}`,
                `会計合計: ${totalLabel}`
            ].join('\n');

            let treasuryUpdated = false;
            let treasuryPs = null;
            let treasuryError = null;
            let grantAmount = 0;
            let grantMultiplier = 1;
            let grantApplied = false;
            let grantError = null;

            if (orderAmount > 0) {
                try {
                    const treasuryResult = await addNationTreasury(nation, orderAmount, firestore, nationDeps);
                    treasuryUpdated = true;
                    treasuryPs = treasuryResult?.treasuryPs ?? null;
                    const groupId = treasuryResult?.groupId || await getNationGroupIdByNation(nation, firestore, nationDeps);
                    if (groupId) {
                        const multiplierRaw = await getGroupDataValue(groupId, 'grantMultiplier');
                        const multiplierValue = Number(multiplierRaw);
                        grantMultiplier = Number.isFinite(multiplierValue) && multiplierValue >= 0 ? multiplierValue : 1;
                    }
                    grantAmount = Math.floor(orderAmount * 0.1 * grantMultiplier);
                    if (grantAmount > 0) {
                        await addEconomyItem(playFabId, 'PS', grantAmount);
                        grantApplied = true;
                    }
                } catch (error) {
                    const msg = error?.errorMessage || error?.message || String(error);
                    if (!treasuryUpdated) {
                        treasuryError = msg;
                    } else {
                        grantError = msg;
                    }
                    console.warn('[troy-order] Treasury/Grant failed:', msg);
                }
            }

            try {
                await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
            } catch (lineError) {
                console.warn('[troy-order] Line notify failed:', lineError?.message || lineError);
            }
            res.json({
                success: true,
                orderAmount,
                treasuryUpdated,
                treasuryPs,
                treasuryError,
                grantAmount,
                grantMultiplier,
                grantApplied,
                grantError
            });
        } catch (error) {
            console.error('[troy-order] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to send order' });
        }
    });

    // TROY入店
    app.post('/api/troy-join', async (req, res) => {
        const { playFabId, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            if (!roomSnap.exists || !roomSnap.data()?.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(playFabId);
            const name = String(displayName || '').trim().slice(0, 40) || memberId;
            await roomRef.collection('members').doc(memberId).set({
                playFabId: memberId,
                displayName: name,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.json({ success: true });
        } catch (error) {
            console.error('[troy-join] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to join troy' });
        }
    });

    // TROY退店
    app.post('/api/troy-leave', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.json({ success: true });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.json({ success: true });

            const memberId = normalizePlayFabId(playFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            await roomRef.collection('members').doc(memberId).delete();
            res.json({ success: true });
        } catch (error) {
            console.error('[troy-leave] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to leave troy' });
        }
    });

    // TROYチャット取得
    app.post('/api/get-troy-chat', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(playFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }

            const snap = await roomRef
                .collection('chat')
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
            const messages = snap.docs
                .map((doc) => {
                    const data = doc.data() || {};
                    const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt;
                    return {
                        message: data.message || '',
                        displayName: data.displayName || 'Player',
                        timestamp: ts || Date.now()
                    };
                })
                .reverse();

            res.json({ success: true, messages });
        } catch (error) {
            console.error('[get-troy-chat] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get troy chat' });
        }
    });

    // TROYチャット送信
    app.post('/api/send-troy-chat', async (req, res) => {
        const { playFabId, message } = req.body || {};
        const text = String(message || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!text) return res.status(400).json({ error: 'Message is required' });
        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(playFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }
            const memberData = memberSnap.data() || {};
            const displayName = memberData.displayName || memberId;

            await roomRef.collection('chat').add({
                playFabId: memberId,
                displayName,
                message: text,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({ success: true });
        } catch (error) {
            console.error('[send-troy-chat] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to send troy chat' });
        }
    });

    // TROYクエスト: クリア状況取得
    app.post('/api/get-quest-clears', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        try {
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: [QUEST_CLEAR_DATA_KEY]
            });
            const raw = result?.Data?.[QUEST_CLEAR_DATA_KEY]?.Value || '';
            const clears = parseQuestClears(raw);
            res.json({ success: true, clears });
        } catch (error) {
            console.error('[get-quest-clears] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get quest clears' });
        }
    });

    // TROYクエスト: 承認QR発行
    app.post('/api/quest-claim', async (req, res) => {
        const { playFabId, questId, questKey, gachaType } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!questId) return res.status(400).json({ error: 'questId is required' });
        if (!questKey) return res.status(400).json({ error: 'questKey is required' });
        const secret = process.env.QUEST_QR_SECRET;
        if (!secret) return res.status(500).json({ error: 'Quest QR secret is not configured' });

        const gacha = normalizeQuestGachaType(gachaType);
        if (!QUEST_ALLOWED_GACHA_TYPES.has(gacha.raw)) {
            return res.status(400).json({ error: 'Invalid gachaType' });
        }
        if (!gacha.isSkill) {
            const hasTable = getQuestRewardPool(gacha.rewardKey).length > 0;
            if (!QUEST_REWARD_GACHA_TYPES.has(gacha.rewardKey) && !hasTable) {
                return res.status(400).json({ error: 'Invalid gachaType' });
            }
        }
        const difficulty = normalizeQuestDifficulty(req.body?.difficulty);
        const betAmount = normalizeQuestBetAmount(req.body?.betAmount);

        try {
            const claimId = generateQuestClaimId();
            const now = Date.now();
            const expiresAt = now + QUEST_CLAIM_TTL_MS;
            const payload = {
                claimId,
                playerId: normalizePlayFabId(playFabId),
                questId: String(questId),
                questKey: String(questKey),
                gachaType: gacha.raw,
                difficulty,
                betAmount,
                nonce: crypto.randomBytes(8).toString('hex'),
                issuedAt: now,
                expiresAt
            };
            const sig = signQuestPayload(payload, secret);
            const signedPayload = { ...payload, sig };
            const qrValue = encodeQuestQrValue(signedPayload);

            await getQuestClaimDoc(firestore, claimId).set({
                ...payload,
                sig,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.json({ success: true, claimId, qrValue, expiresAt });
        } catch (error) {
            console.error('[quest-claim] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to create quest claim' });
        }
    });

    // TROYクエスト: 承認と報酬付与
    app.post('/api/quest-approve', async (req, res) => {
        const { playFabId, qrValue } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!qrValue) return res.status(400).json({ error: 'qrValue is required' });
        const secret = process.env.QUEST_QR_SECRET;
        if (!secret) return res.status(500).json({ error: 'Quest QR secret is not configured' });

        const payload = decodeQuestQrValue(qrValue);
        if (!payload) return res.status(400).json({ error: 'Invalid QR value' });

        const { sig, ...basePayload } = payload;
        if (!sig || signQuestPayload(basePayload, secret) !== sig) {
            return res.status(400).json({ error: 'Invalid QR signature' });
        }
        if (Date.now() > Number(basePayload.expiresAt || 0)) {
            return res.status(400).json({ error: 'Quest claim has expired' });
        }

        try {
            let approverRole = null;
            try {
                await requireKingContext(playFabId, firestore, nationDeps);
                approverRole = 'king';
            } catch (error) {
                const msg = error?.errorMessage || error?.message || error;
                if (!String(msg).includes('NotKing')) {
                    console.warn('[quest-approve] King check failed:', msg);
                }
            }
            if (!approverRole && await isAdminApprover(playFabId, nationDeps)) {
                approverRole = 'admin';
            }
            if (!approverRole && await isGuildLeader(playFabId, nationDeps)) {
                approverRole = 'guild';
            }
            if (!approverRole) {
                return res.status(403).json({ error: 'NotApprover' });
            }

            const claimRef = getQuestClaimDoc(firestore, basePayload.claimId);
            const claimSnap = await claimRef.get();
            if (!claimSnap.exists) return res.status(404).json({ error: 'ClaimNotFound' });
            const claimData = claimSnap.data() || {};
            if (claimData.status === 'approved') {
                return res.status(400).json({ error: 'AlreadyApproved' });
            }
            if (claimData.playerId && claimData.playerId !== basePayload.playerId) {
                return res.status(400).json({ error: 'PlayerMismatch' });
            }

            if (claimData.gachaType && claimData.gachaType !== basePayload.gachaType) {
                return res.status(400).json({ error: 'ClaimMismatch' });
            }

            const rewardType = claimData.gachaType || basePayload.gachaType;
            const rewardTier = resolveQuestRewardTier(
                claimData.difficulty || basePayload.difficulty,
                normalizeQuestBetAmount(claimData.betAmount ?? basePayload.betAmount)
            );
            const normalizedReward = normalizeQuestGachaType(rewardType);
            let rewardItemId = '';
            if (!normalizedReward.isSkill) {
                rewardItemId = resolveQuestRewardFromTables(normalizedReward.rewardKey, rewardTier)
                    || resolveQuestRewardItemId(normalizedReward.rewardKey);
                if (!rewardItemId) {
                    return res.status(500).json({ error: 'RewardNotConfigured' });
                }
                await addEconomyItem(basePayload.playerId, rewardItemId, 1, {
                    idempotencyId: `quest-${basePayload.claimId}`
                });
            }

            let questCleared = false;
            const questIdKey = String(claimData.questId || basePayload.questId || '').trim();
            if (questIdKey) {
                try {
                    const clearResult = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                        PlayFabId: basePayload.playerId,
                        Keys: [QUEST_CLEAR_DATA_KEY]
                    });
                    const rawClears = clearResult?.Data?.[QUEST_CLEAR_DATA_KEY]?.Value || '';
                    const clears = parseQuestClears(rawClears);
                    if (!clears[questIdKey]) {
                        clears[questIdKey] = true;
                        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                            PlayFabId: basePayload.playerId,
                            Data: {
                                [QUEST_CLEAR_DATA_KEY]: JSON.stringify(clears)
                            }
                        });
                    }
                    questCleared = true;
                } catch (clearError) {
                    console.warn('[quest-approve] Failed to update quest clears:', clearError?.message || clearError);
                }
            }

            await claimRef.set({
                status: 'approved',
                approvedBy: normalizePlayFabId(playFabId),
                approverRole,
                rewardTier,
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.json({
                success: true,
                claimId: basePayload.claimId,
                rewardItemId: rewardItemId || null,
                rewardLabel: rewardType,
                rewardTier,
                questCleared
            });
        } catch (error) {
            console.error('[quest-approve] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to approve quest' });
        }
    });

    // 国王によるPs付与（サーバー実行）
    app.post('/api/king-grant-ps', async (req, res) => {
        const { playFabId, receiverPlayFabId, amount } = req.body || {};
        const requestId = String(req.body?.requestId || '').trim();
        if (!playFabId || !receiverPlayFabId) {
            return res.status(400).json({ error: 'playFabId and receiverPlayFabId are required' });
        }
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }
        if (playFabId === receiverPlayFabId) {
            return res.status(400).json({ error: 'Cannot grant to self' });
        }

        try {
            const context = await requireKingContext(playFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });

            const multiplierRaw = await getGroupDataValue(context.groupId, 'grantMultiplier');
            const multiplierValue = Number(multiplierRaw);
            const multiplier = Number.isFinite(multiplierValue) && multiplierValue > 0 ? multiplierValue : 1;

            const grantAmount = Math.floor(value * 0.1 * multiplier);
            if (grantAmount <= 0) {
                const minReceived = Math.ceil(10 / multiplier);
                return res.status(400).json({
                    error: 'Grant amount is zero',
                    details: `received=${value}, multiplier=${multiplier}, minReceived=${minReceived}`
                });
            }

            const idempotencyFor = (suffix) => requestId ? `${requestId}:${suffix}` : null;
            try {
                await addEconomyItem(receiverId, 'PS', grantAmount, { idempotencyId: idempotencyFor('ps-grant') });
            } catch (addError) {
                const addMessage = addError?.errorMessage || addError?.message || '';
                if (String(addMessage).includes('EntityKeyNotFound')) {
                    return res.status(400).json({ error: '受取人のアカウントが見つかりません。' });
                }
                return res.status(500).json({ error: 'Failed to add PS', details: addError?.errorMessage || addError?.message });
            }

            let treasuryUpdated = true;
            let treasuryErrorMessage = '';
            try {
                await addNationTreasury(context.nation, value, firestore, nationDeps, { idempotencyId: idempotencyFor('treasury') });
            } catch (treasuryError) {
                treasuryUpdated = false;
                treasuryErrorMessage = treasuryError?.errorMessage || treasuryError?.message || String(treasuryError);
                console.warn('[king-grant-ps] Failed to add treasury:', treasuryErrorMessage);
            }

            if (firestore && admin) {
                try {
                    await firestore
                        .collection('notifications')
                        .doc(receiverId)
                        .collection('items')
                        .add({
                            type: 'king_grant',
                            fromId: context.kingId,
                            amount: grantAmount,
                            currency: 'PS',
                            receivedAmount: value,
                            grantMultiplier: multiplier,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                } catch (notifyError) {
                    console.warn('[king-grant-ps] Notification write failed:', notifyError?.message || notifyError);
                }
            }

            let checkoutApproved = false;
            let checkoutTotal = null;
            if (firestore && admin) {
                try {
                    const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
                    const checkoutRef = roomRef.collection('checkouts').doc(receiverId);
                    const checkoutSnap = await checkoutRef.get();
                    if (checkoutSnap.exists) {
                        const checkoutData = checkoutSnap.data() || {};
                        const status = String(checkoutData.status || 'pending');
                        const storedTotal = Number(checkoutData.total || 0);
                        checkoutTotal = Number.isFinite(storedTotal) ? storedTotal : null;
                        if (status === 'pending' && checkoutTotal === value) {
                            await checkoutRef.set({
                                status: 'approved',
                                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                                approvedBy: context.kingId,
                                receivedAmount: value,
                                grantAmount
                            }, { merge: true });
                            await roomRef.collection('members').doc(receiverId).delete();
                            checkoutApproved = true;
                        }
                    }
                } catch (checkoutError) {
                    console.warn('[king-grant-ps] Checkout approve failed:', checkoutError?.message || checkoutError);
                }
            }

            let receiverBalance = null;
            if (getCurrencyBalance) {
                receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: receiverId,
                    Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                });
            }

            res.json({
                success: true,
                receivedAmount: value,
                grantAmount,
                grantMultiplier: multiplier,
                receiverNation: await getNationForPlayer(receiverId, { promisifyPlayFab, PlayFabServer }),
                receiverBalance: Number.isFinite(receiverBalance) ? receiverBalance : undefined,
                treasuryUpdated,
                treasuryError: treasuryUpdated ? undefined : treasuryErrorMessage,
                checkoutApproved,
                checkoutTotal
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-grant-ps] Error:', msg);
            res.status(500).json({ error: 'Failed to grant PS', details: msg });
        }
    });

    // プレイヤー追放
    app.post('/api/king-exile', async (req, res) => {
        const { playFabId, targetPlayFabId } = req.body || {};
        if (!playFabId || !targetPlayFabId) {
            return res.status(400).json({ error: 'playFabId and targetPlayFabId are required' });
        }
        if (playFabId === targetPlayFabId) {
            return res.status(400).json({ error: 'Cannot exile self' });
        }

        try {
            const kingCheck = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: playFabId,
                FunctionName: 'GetNationKingPageData',
                FunctionParameter: {},
                GeneratePlayStreamEvent: false
            });
            if (kingCheck && kingCheck.Error) {
                const msg = kingCheck.Error.Message || kingCheck.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing') || String(msg).includes('NationKingNotSet')) {
                    return res.status(403).json({ error: 'Only the king can exile players' });
                }
                return res.status(500).json({ error: 'Failed to validate king', details: msg });
            }

            const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['Nation', 'Race']
            });
            const kingNation = String(kingRo?.Data?.Nation?.Value || '').toLowerCase();
            if (!kingNation) return res.status(400).json({ error: 'King nation not set' });
            const nationMapping = getNationMappingByNation(kingNation);
            if (!nationMapping) return res.status(400).json({ error: 'Invalid king nation' });
            const groupInfo = await ensureNationGroupExists(firestore, nationMapping, nationDeps);
            const kingNationGroupId = groupInfo.groupId;
            const targetNationIsland = nationMapping.island;
            const targetNationGroupName = nationMapping.groupName;

            const targetRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Keys: ['Race', 'Nation']
            });
            const targetRace = targetRo?.Data?.Race?.Value || null;
            const targetPrevNation = String(targetRo?.Data?.Nation?.Value || '').toLowerCase();

            const playerEntity = await getPlayerEntity(targetPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!playerEntity) return res.status(400).json({ error: 'Failed to resolve target entity' });

            if (targetPrevNation && targetPrevNation !== kingNation) {
                const prevMapping = getNationMappingByNation(targetPrevNation);
                if (prevMapping) {
                    try {
                        const prevGroup = await ensureNationGroupExists(firestore, prevMapping, nationDeps);
                        await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                            Group: { Id: prevGroup.groupId, Type: 'group' },
                            Members: [playerEntity]
                        });
                    } catch (e) {
                        console.warn('[king-exile] RemoveMembers failed:', e?.errorMessage || e?.message || e);
                    }
                }
            }

            try {
                await promisifyPlayFab(PlayFabGroups.AddMembers, {
                    Group: { Id: kingNationGroupId, Type: 'group' },
                    Members: [playerEntity]
                });
            } catch (e) {
                const msg = e?.errorMessage || e?.message || String(e);
                if (!String(msg).includes('EntityIsAlreadyMember')) throw e;
            }

            const avatarColor = getAvatarColorForNation(targetNationIsland || kingNation);
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: targetPlayFabId,
                Data: {
                    Nation: targetNationIsland || kingNation || null,
                    NationGroupId: kingNationGroupId,
                    NationGroupName: targetNationGroupName,
                    AvatarColor: avatarColor || 'brown',
                    NationChangedAt: String(Date.now())
                }
            });
            await ensureNationDisplayName(targetPlayFabId, targetNationIsland || kingNation || null, {
                promisifyPlayFab,
                PlayFabServer,
                PlayFabAdmin
            });

            const transferResult = await transferOwnedIslands(firestore, targetPlayFabId, playFabId, targetNationIsland || kingNation || null);
            let starterIsland = null;
            try {
                const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: targetPlayFabId,
                    ProfileConstraints: { ShowDisplayName: true }
                });
                const displayName = profile?.PlayerProfile?.DisplayName || null;
                starterIsland = await createStarterIsland({
                    playFabId: targetPlayFabId,
                    raceName: targetRace || 'Human',
                    nationIsland: targetNationIsland || kingNation || null,
                    displayName
                });
            } catch (e) {
                console.warn('[king-exile] Failed to create starter island:', e?.errorMessage || e?.message || e);
            }

            if (starterIsland?.respawnPosition) {
                await relocateActiveShip(firestore, targetPlayFabId, starterIsland.respawnPosition);
            }

            return res.json({
                success: true,
                nationGroupId: kingNationGroupId,
                nationIsland: targetNationIsland || kingNation || null,
                transferredIslands: transferResult.transferred,
                starterIsland
            });
        } catch (error) {
            console.error('[king-exile] Error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'Failed to exile player', details: error?.errorMessage || error?.message || error });
        }
    });

    // 国家通貨寄付
    app.post('/api/donate-nation-currency', async (req, res) => {
        const { playFabId, currency, amount } = req.body || {};
        if (!playFabId || !currency) {
            return res.status(400).json({ error: 'playFabId and currency are required' });
        }
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        try {
            const nation = await getNationForPlayer(playFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) {
                return res.status(400).json({ error: 'Nation not set' });
            }
            const mapping = getNationMappingByNation(nation);
            if (!mapping) {
                return res.status(400).json({ error: 'Invalid nation' });
            }

            await subtractEconomyItem(playFabId, String(currency).toUpperCase(), value);

            const normalizedCurrency = String(currency).toUpperCase();
            const groupEntity = await getNationGroupEntityKey(nation, firestore, nationDeps);
            if (!groupEntity) {
                return res.status(500).json({ error: 'Nation group not found' });
            }
            await addEconomyItem(groupEntity.Id, normalizedCurrency, value, groupEntity);

            res.json({ success: true });
        } catch (error) {
            console.error('[donate-nation-currency] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to donate currency' });
        }
    });

    // マップ占領状態取得
    app.post('/api/get-map-occupation', async (req, res) => {
        const { mapId } = req.body || {};
        if (!mapId) return res.status(400).json({ error: 'mapId is required' });
        try {
            const nation = await getMapOccupationNation(mapId, { promisifyPlayFab, PlayFabAdmin });
            res.json({ mapId, nation: nation || null });
        } catch (error) {
            console.error('[GetMapOccupation] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get map occupation' });
        }
    });

    app.post('/api/get-nation-treasury-ranking', async (_req, res) => {
        try {
            const ranking = await getNationTreasuryRanking(firestore, nationDeps);
            res.json({ ranking });
        } catch (error) {
            console.error('[get-nation-treasury-ranking] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get nation treasury ranking' });
        }
    });

    app.post('/api/get-nation-levels', async (_req, res) => {
        try {
            const levels = {};
            for (const [nation, mapping] of Object.entries(NATION_GROUP_BY_NATION)) {
                const docRef = getNationGroupDoc(firestore, mapping.groupName);
                const snap = await docRef.get();
                const points = Math.max(0, Math.floor(Number(snap.data()?.arcanaPoints || 0)));
                levels[nation] = {
                    arcanaPoints: points,
                    nationLevel: calcNationLevel(points)
                };
            }
            res.json({ levels });
        } catch (error) {
            console.error('[get-nation-levels] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get nation levels' });
        }
    });
}

module.exports = {
    NATION_GROUP_BY_RACE,
    NATION_GROUP_BY_NATION,
    AVATAR_COLOR_BY_NATION,
    getAvatarColorForNation,
    getNationMappingByNation,
    getNationForPlayer,
    getNationGroupDoc,
    ensureNationGroupExists,
    getNationGroupIdByNation,
    getNationTaxRateBps,
    addNationTreasury,
    getNationTreasuryRanking,
    getMapOccupationNation,
    setMapOccupationNation,
    getPlayerEntity,
    initializeNationRoutes
};
