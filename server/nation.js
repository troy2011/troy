// server/nation.js
// 国家関連のAPI

const { addGlobalChatMessage } = require('./chat');
const { PlayFabData, withTitleEntityToken } = require('./playfab');
const { addPlayerNationContribution } = require('./playerLevel');
const {
    CAPITAL_CAPTURE_BASE_DURATION_MS,
    CAPITAL_CAPTURE_BREACH_WALLS,
    CAPITAL_CAPTURE_SLOT_LIMIT,
    CAPITAL_PART_LABELS,
    createDefaultNationWarState,
    normalizeNationWarState,
    normalizeCapitalCaptureState,
    getNationWarWeaponDefinition,
    listNationWarWeapons,
    canNationUseWeapon,
    getNationModelByNation,
    getNationModelLabel,
    getNationLabel
} = require('./nationWarWeapons');
const {
    PLAYER_DAILY_CONTRIBUTION_STAT,
    ensureDailyContributionVersionForToday
} = require('./contributionStats');

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

const KING_STARTER_CROWN_BY_NATION = {
    fire: 'metal_black_01',
    wind: 'metal_black_08',
    earth: 'metal_black_11',
    water: 'metal_black_12'
};


const MAX_TREASURY_RECENT_ENTRIES = 20;
const TREASURY_SOURCE_LABELS = {
    troy_order: 'TROY会計',
    king_grant_receipt: '王の受領',
    shop_tax: '売上税',
    hot_spring_tax: '温泉税',
    nation_donation: '国庫寄付',
    war_deploy: '兵器配備',
    war_strike: '攻撃準備',
    war_raid: '国庫襲撃',
    manual_adjustment: '国庫調整'
};
const TREASURY_CASHBACK_RATE_BPS_BY_RANK = [1300, 1100, 900, 700];
const NATION_WAR_EVENT_LIMIT = 40;
const NATION_WAR_STATE_COLLECTION = 'nation_wars';
const NATION_WAR_EVENT_COLLECTION = 'nation_war_events';
const NATION_WAR_MIN_TREASURY_RESERVE = 5000;
const NATION_WAR_MAX_RAID_AMOUNT = 100000;
const NATION_WAR_RECON_COST_PS = 200;
const NATION_WAR_REPAIR_COST_PS = 400;
const NATION_WAR_SABOTAGE_COST_PS = 350;
const NATION_WAR_RECON_DURATION_MS = 10 * 60 * 1000;
const NATION_WAR_CAPTURE_REPAIR_AMOUNT = 5;
const NATION_WAR_SABOTAGE_COMMAND_DAMAGE = 5;
const NATION_WAR_SHIP_ATTACK_WALL_DAMAGE = 8;
const NATION_WAR_SIEGE_WALL_DAMAGE = 3;
const NATION_WAR_POST_RAID_WALLS = 65;
const NATION_WAR_POST_RAID_COOLDOWN_MS = 30 * 60 * 1000;
const NATION_WAR_CARD_REWARD_MAJOR_CHANCE = 0.2;
const NATION_WAR_CARD_REWARD_HIGH_RAID_THRESHOLD = 50000;

function callTitleScopedApi(promisifyPlayFab, apiFunction, request) {
    return withTitleEntityToken(() => promisifyPlayFab(apiFunction, request));
}

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function pickRandomNationWarTarotCardId() {
    if (Math.random() < NATION_WAR_CARD_REWARD_MAJOR_CHANCE) {
        return `arcana-${Math.floor(Math.random() * 22)}`;
    }
    const suits = ['wand', 'sword', 'cup', 'pentacle'];
    const suit = suits[Math.floor(Math.random() * suits.length)] || 'wand';
    const rank = 1 + Math.floor(Math.random() * 14);
    return `minor-${suit}-${rank}`;
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

async function resolveTroyNationForRequest(req, playFabId, deps) {
    const requestedNation = String(
        req.body?.troyNation
        || req.body?.entryNation
        || ''
    ).trim().toLowerCase();
    if (requestedNation && getNationMappingByNation(requestedNation)) {
        return requestedNation;
    }
    return getNationForPlayer(playFabId, deps);
}

function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

function getTroyRoomDoc(firestore, groupName) {
    return firestore.collection('troy_rooms').doc(groupName);
}

async function findOpenTroyNation(firestore) {
    const snap = await firestore.collection('troy_rooms').where('isOpen', '==', true).limit(1).get();
    if (snap.empty) return null;
    const groupName = snap.docs[0].id;
    const entry = Object.entries(NATION_GROUP_BY_NATION).find(([, v]) => v.groupName === groupName);
    return entry ? entry[0] : null;
}

async function deleteCollectionDocs(collectionRef, batchSize = 400) {
    let snapshot = await collectionRef.limit(batchSize).get();
    while (!snapshot.empty) {
        const batch = collectionRef.firestore.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        snapshot = await collectionRef.limit(batchSize).get();
    }
}

const MAP_OCCUPATION_KEY = 'MapOccupationByMapId';
const WORLD_MAP_LAYOUT_KEY = 'WorldMapLayoutV1';
const WORLD_MAP_PLACEMENT_OPEN_KEY = 'WorldMapPlacementOpen';
const EMPTY_MAP_ID = 'empty';
const WORLD_MAP_PLACEMENT_WEEKDAYS_JST = new Set([0]); // Sunday only

const NATION_LEVEL_MAX = 14;

const WORLD_MAP_DEFAULT_LAYOUT = [
    'pentacles', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'swords',
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, 'major_00', EMPTY_MAP_ID, EMPTY_MAP_ID,
    EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID,
    'cups', EMPTY_MAP_ID, EMPTY_MAP_ID, EMPTY_MAP_ID, 'wands'
];

async function getWorldMapPlacementOpen(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [WORLD_MAP_PLACEMENT_OPEN_KEY] });
    const raw = result?.Data?.[WORLD_MAP_PLACEMENT_OPEN_KEY];
    if (!raw) return isPlacementAllowedByWeekday();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'boolean') return parsed;
        if (typeof parsed?.open === 'boolean') return parsed.open;
        const now = Date.now();
        const start = parsed?.start ? Date.parse(parsed.start) : null;
        const end = parsed?.end ? Date.parse(parsed.end) : null;
        if (Number.isFinite(start) && now < start) return false;
        if (Number.isFinite(end) && now > end) return false;
        if (Number.isFinite(start) || Number.isFinite(end)) return true;
    } catch {
        // ignore
    }
    return isPlacementAllowedByWeekday();
}

function getJapanWeekdayNumber(date = new Date()) {
    try {
        const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        return jstDate.getDay();
    } catch {
        return date.getUTCDay();
    }
}

function getJapanDayKey(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    } catch {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
        const day = `${date.getUTCDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

const TROY_LAST_ORDER_UNDO_WINDOW_MS = 45 * 1000;

function isPlacementAllowedByWeekday(date = new Date()) {
    const weekday = getJapanWeekdayNumber(date);
    return WORLD_MAP_PLACEMENT_WEEKDAYS_JST.has(weekday);
}

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

async function getWorldMapLayout(deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    const result = await promisifyPlayFab(PlayFabAdmin.GetTitleData, { Keys: [WORLD_MAP_LAYOUT_KEY] });
    const raw = result?.Data?.[WORLD_MAP_LAYOUT_KEY] || '';
    if (!raw) return WORLD_MAP_DEFAULT_LAYOUT.slice();
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === WORLD_MAP_DEFAULT_LAYOUT.length) {
            return parsed;
        }
    } catch {
        // ignore
    }
    return WORLD_MAP_DEFAULT_LAYOUT.slice();
}

async function setWorldMapLayout(layout, deps) {
    const { promisifyPlayFab, PlayFabAdmin } = deps;
    if (!Array.isArray(layout) || layout.length !== WORLD_MAP_DEFAULT_LAYOUT.length) {
        throw new Error('InvalidLayout');
    }
    await promisifyPlayFab(PlayFabAdmin.SetTitleData, {
        Key: WORLD_MAP_LAYOUT_KEY,
        Value: JSON.stringify(layout)
    });
    return layout;
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
    const { promisifyPlayFab, PlayFabAdmin, PlayFabGroups, admin } = deps;

    const docRef = await getNationGroupDoc(firestore, mapping.groupName);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.groupId) {
        const existingGroupId = docSnap.data().groupId;
        try {
            await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.GetGroup, {
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
            await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.GetGroup, {
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

    const createResult = await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.CreateGroup, {
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

function buildTreasuryRecentEntry(entry = {}) {
    const rawAmount = Number(entry?.signedAmount ?? entry?.amount ?? 0);
    const amount = Math.max(0, Math.floor(Math.abs(rawAmount) || 0));
    const direction = String(entry?.direction || (rawAmount < 0 ? 'out' : 'in')).toLowerCase() === 'out' ? 'out' : 'in';
    const currency = String(entry?.currency || 'PS').trim().toUpperCase() || 'PS';
    const source = String(entry?.source || 'manual_adjustment').trim().toLowerCase() || 'manual_adjustment';
    const label = String(entry?.label || TREASURY_SOURCE_LABELS[source] || '国庫更新').trim().slice(0, 40) || '国庫更新';
    const timestampMs = Math.max(0, Math.floor(Number(entry?.timestampMs || Date.now()) || Date.now()));
    const actorId = normalizePlayFabId(entry?.actorId || '');
    const actorName = String(entry?.actorName || '').trim().slice(0, 40);
    const note = String(entry?.note || '').trim().slice(0, 80);
    const entryId = String(entry?.entryId || entry?.id || `${source}:${currency}:${direction}:${amount}:${timestampMs}:${actorId || 'anon'}`)
        .trim()
        .slice(0, 120);
    return {
        entryId,
        direction,
        currency,
        amount,
        source,
        label,
        timestampMs,
        actorId,
        actorName,
        note
    };
}

async function appendNationTreasuryRecentEntry(nation, firestore, admin, entry = {}) {
    const mapping = getNationMappingByNation(nation);
    if (!mapping || !firestore || !admin) return;
    const nextEntry = buildTreasuryRecentEntry(entry);
    if (!nextEntry.amount) return;
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const currentRaw = Array.isArray(snap.data()?.treasuryRecentEntries) ? snap.data().treasuryRecentEntries : [];
        const current = currentRaw
            .map((row) => buildTreasuryRecentEntry(row))
            .filter((row) => row.amount > 0 && row.entryId !== nextEntry.entryId);
        const recentEntries = [nextEntry, ...current]
            .sort((a, b) => b.timestampMs - a.timestampMs)
            .slice(0, MAX_TREASURY_RECENT_ENTRIES);
        tx.set(docRef, {
            treasuryRecentEntries: recentEntries,
            treasuryRecentUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

async function addTroyDailySales(nation, amount, firestore, admin) {
    const mapping = getNationMappingByNation(nation);
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!mapping || !firestore || !admin || value <= 0) return null;
    const dayKey = getJapanDayKey();
    const docRef = getNationGroupDoc(firestore, mapping.groupName);
    let nextTotal = value;
    let nextCount = 1;
    await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.data() || {};
        const currentDayKey = String(data.troyTodaySalesDayKey || '').trim();
        const currentTotal = currentDayKey === dayKey ? Math.max(0, Math.floor(Number(data.troyTodaySalesTotal) || 0)) : 0;
        const currentCount = currentDayKey === dayKey ? Math.max(0, Math.floor(Number(data.troyTodaySalesCount) || 0)) : 0;
        nextTotal = currentTotal + value;
        nextCount = currentCount + 1;
        tx.set(docRef, {
            troyTodaySalesDayKey: dayKey,
            troyTodaySalesTotal: nextTotal,
            troyTodaySalesCount: nextCount,
            troyTodaySalesUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
    return { dayKey, total: nextTotal, count: nextCount };
}

function buildTroyTodaySalesSnapshot(groupData = {}) {
    const todayDayKey = getJapanDayKey();
    const storedDayKey = String(groupData?.troyTodaySalesDayKey || '').trim();
    if (storedDayKey === todayDayKey) {
        return {
            dayKey: todayDayKey,
            total: Math.max(0, Math.floor(Number(groupData?.troyTodaySalesTotal) || 0)),
            count: Math.max(0, Math.floor(Number(groupData?.troyTodaySalesCount) || 0))
        };
    }
    const fallbackEntries = Array.isArray(groupData?.treasuryRecentEntries) ? groupData.treasuryRecentEntries : [];
    const troyEntries = fallbackEntries
        .map((entry) => buildTreasuryRecentEntry(entry))
        .filter((entry) => entry.direction === 'in' && ['troy_settlement', 'troy_order'].includes(entry.source))
        .filter((entry) => getJapanDayKey(new Date(entry.timestampMs || 0)) === todayDayKey);
    return {
        dayKey: todayDayKey,
        total: troyEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
        count: troyEntries.length
    };
}

function buildTreasuryOverview(entries = []) {
    const recentEntries = (Array.isArray(entries) ? entries : [])
        .map((entry) => buildTreasuryRecentEntry(entry))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.timestampMs - a.timestampMs)
        .slice(0, MAX_TREASURY_RECENT_ENTRIES);
    const summaryMap = new Map();
    recentEntries.forEach((entry) => {
        const key = `${entry.direction}|${entry.currency}|${entry.source}`;
        const existing = summaryMap.get(key) || {
            direction: entry.direction,
            currency: entry.currency,
            source: entry.source,
            label: entry.label,
            totalAmount: 0,
            count: 0
        };
        existing.totalAmount += entry.amount;
        existing.count += 1;
        summaryMap.set(key, existing);
    });
    const summary = Array.from(summaryMap.values()).sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === 'in' ? -1 : 1;
        return b.totalAmount - a.totalAmount;
    });
    return { recentEntries, summary };
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
    let contribution = null;
    if (value > 0 && options.contributorPlayFabId) {
        try {
            contribution = await addPlayerNationContribution(options.contributorPlayFabId, value, deps);
        } catch (error) {
            console.warn('[addNationTreasury] Failed to update player contribution:', error?.errorMessage || error?.message || error);
        }
    }
    if (value > 0) {
        try {
            await appendNationTreasuryRecentEntry(nation, firestore, deps?.admin, {
                entryId: options.idempotencyId || '',
                amount: value,
                currency: options.currency || 'PS',
                source: options.source || 'manual_adjustment',
                label: options.label,
                actorId: options.contributorPlayFabId || '',
                actorName: options.contributorName || '',
                note: options.note || ''
            });
        } catch (error) {
            console.warn('[addNationTreasury] Failed to append treasury entry:', error?.message || error);
        }
    }
    const treasuryPs = await getGroupTreasuryBalance(entityKey.Id, deps);
    return { groupId: entityKey.Id, treasuryPs, contribution };
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

    rows.sort((a, b) => (b.treasuryPs - a.treasuryPs) || String(a.nation || '').localeCompare(String(b.nation || '')));
    return rows;
}

function getTreasuryCashbackRateBpsByRank(rank) {
    const normalizedRank = Math.max(1, Math.floor(Number(rank) || 1));
    return TREASURY_CASHBACK_RATE_BPS_BY_RANK[Math.min(normalizedRank, TREASURY_CASHBACK_RATE_BPS_BY_RANK.length) - 1]
        || TREASURY_CASHBACK_RATE_BPS_BY_RANK[TREASURY_CASHBACK_RATE_BPS_BY_RANK.length - 1];
}

async function getNationTreasuryCashbackInfo(nation, firestore, deps) {
    const ranking = await getNationTreasuryRanking(firestore, deps);
    const nationKey = String(nation || '').toLowerCase();
    const rankIndex = ranking.findIndex((row) => String(row?.nation || '').toLowerCase() === nationKey);
    const rank = rankIndex >= 0 ? rankIndex + 1 : ranking.length + 1;
    const rateBps = getTreasuryCashbackRateBpsByRank(rank);
    return {
        rank,
        rateBps,
        rateRatio: rateBps / 10000,
        ratePercent: rateBps / 100,
        ranking
    };
}

function getNationWarDoc(firestore, nation) {
    return firestore.collection(NATION_WAR_STATE_COLLECTION).doc(String(nation || '').toLowerCase());
}

function getNationWarEventsCollection(firestore) {
    return firestore.collection(NATION_WAR_EVENT_COLLECTION);
}

function clampWarPercent(value) {
    return Math.max(0, Math.min(100, Math.floor(Number(value) || 0)));
}

function getWarPercentBand(value) {
    const safe = clampWarPercent(value);
    if (safe >= 70) return { key: 'high', label: '高' };
    if (safe >= 40) return { key: 'medium', label: '中' };
    return { key: 'low', label: '低' };
}

function getWarCertaintyBand(value) {
    const safe = clampWarPercent(value);
    if (safe >= 70) return { key: 'high', label: '確実' };
    if (safe >= 40) return { key: 'medium', label: '推定' };
    return { key: 'low', label: '不明' };
}

function getCapitalCaptureSpeedMultiplier(memberCount) {
    const count = Math.max(1, Math.floor(Number(memberCount) || 1));
    return Math.min(4, 1 + ((count - 1) * 0.5));
}

function buildCapitalCaptureQueueEntry(playFabId, nation, nowMs, shipId = '') {
    return {
        playFabId: String(playFabId || '').trim(),
        nation: String(nation || '').trim().toLowerCase(),
        shipId: String(shipId || '').trim(),
        joinedAt: Math.max(0, Math.floor(Number(nowMs) || Date.now()))
    };
}

function advanceNationWarCaptureState(state, nowMs = Date.now()) {
    if (!state || state.status !== 'capturing' || !Array.isArray(state.queue) || state.queue.length === 0) {
        return state;
    }
    const safeNow = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const lastAt = Number(state.lastProgressAt) || 0;
    if (lastAt > 0 && safeNow > lastAt) {
        const elapsedMs = safeNow - lastAt;
        state.progressBaseMs = Math.min(
            state.baseDurationMs,
            state.progressBaseMs + (elapsedMs * getCapitalCaptureSpeedMultiplier(state.queue.length))
        );
    }
    state.lastProgressAt = safeNow;
    const remainingBaseMs = Math.max(0, state.baseDurationMs - state.progressBaseMs);
    state.endsAt = remainingBaseMs <= 0
        ? safeNow
        : safeNow + Math.ceil(remainingBaseMs / getCapitalCaptureSpeedMultiplier(state.queue.length));
    return state;
}

function refreshNationWarCaptureState(rawState, warState, nowMs = Date.now()) {
    const safeNow = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const state = normalizeCapitalCaptureState(rawState, warState?.capitalStatus, safeNow);
    const breached = clampWarPercent(warState?.capitalStatus?.walls) <= CAPITAL_CAPTURE_BREACH_WALLS;
    state.slotLimit = CAPITAL_CAPTURE_SLOT_LIMIT;
    state.baseDurationMs = CAPITAL_CAPTURE_BASE_DURATION_MS;
    state.intelByNation = Object.entries(state.intelByNation || {}).reduce((acc, [nation, expiresAtMs]) => {
        const key = String(nation || '').trim().toLowerCase();
        const safeExpiresAtMs = Math.max(0, Math.floor(Number(expiresAtMs) || 0));
        if (key && safeExpiresAtMs > safeNow) acc[key] = safeExpiresAtMs;
        return acc;
    }, {});
    state.progressBaseMs = Math.max(0, Math.min(state.baseDurationMs, Math.floor(Number(state.progressBaseMs) || 0)));
    if (state.raidUnlockedAtMs > 0) {
        state.status = 'captured';
        state.queue = [];
        state.progressBaseMs = state.baseDurationMs;
        state.lastProgressAt = 0;
        state.endsAt = 0;
        return state;
    }
    if (!breached) {
        state.status = 'idle';
        state.breachedAt = 0;
        state.queue = [];
        state.progressBaseMs = 0;
        state.lastProgressAt = 0;
        state.endsAt = 0;
        state.ownerCandidateId = null;
        state.ownerCandidateNation = null;
        return state;
    }
    if (!state.breachedAt) {
        state.breachedAt = safeNow;
    }
    if (Array.isArray(state.queue) && state.queue.length > 0) {
        state.status = 'capturing';
        state.ownerCandidateId = state.queue[0].playFabId;
        state.ownerCandidateNation = state.queue[0].nation || null;
        return advanceNationWarCaptureState(state, safeNow);
    }
    state.status = 'breached';
    state.lastProgressAt = 0;
    state.endsAt = 0;
    state.ownerCandidateId = null;
    state.ownerCandidateNation = null;
    return state;
}

async function resolveNationWarCaptureState(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const safeNow = Date.now();
    const nextState = normalizeNationWarState(state, nationKey, safeNow);
    const prevCaptureState = nextState.capitalCaptureState || null;
    const refreshedCaptureState = refreshNationWarCaptureState(prevCaptureState, nextState, safeNow);
    let changed = JSON.stringify(prevCaptureState || {}) !== JSON.stringify(refreshedCaptureState || {});
    nextState.capitalCaptureState = refreshedCaptureState;
    if (
        refreshedCaptureState.status === 'capturing'
        && refreshedCaptureState.progressBaseMs >= refreshedCaptureState.baseDurationMs
        && refreshedCaptureState.queue.length > 0
        && !refreshedCaptureState.raidUnlockedAtMs
    ) {
        const leader = refreshedCaptureState.queue[0] || null;
        const participantIds = refreshedCaptureState.queue.map((entry) => String(entry.playFabId || '').trim()).filter(Boolean);
        refreshedCaptureState.status = 'captured';
        refreshedCaptureState.raidUnlockedAtMs = safeNow;
        refreshedCaptureState.raidUnlockedByNation = leader?.nation || null;
        refreshedCaptureState.lastCapturedByNation = leader?.nation || null;
        refreshedCaptureState.lastCapturedAtMs = safeNow;
        refreshedCaptureState.lastCaptureParticipantIds = Array.from(new Set(participantIds)).slice(0, 8);
        refreshedCaptureState.progressBaseMs = refreshedCaptureState.baseDurationMs;
        refreshedCaptureState.queue = [];
        refreshedCaptureState.lastProgressAt = 0;
        refreshedCaptureState.endsAt = 0;
        changed = true;
        await appendNationWarEvent(firestore, admin, {
            type: 'capital_capture_complete',
            publicLevel: 'global',
            summary: `${getNationLabel(nationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
            details: leader?.nation ? `${getNationLabel(leader.nation)}の攻城隊が制圧を完了` : '制圧が完了した。',
            participants: [nationKey, leader?.nation].filter(Boolean),
            attackerNation: leader?.nation || '',
            defenderNation: nationKey
        });
    }
    if (changed) {
        nextState.capitalCaptureState = refreshedCaptureState;
        await saveNationWarState(nationKey, nextState, firestore, admin);
    }
    return nextState;
}

function canViewCapitalIntel(viewerNation, defenderNation, captureState) {
    const viewerKey = String(viewerNation || '').trim().toLowerCase();
    const defenderKey = String(defenderNation || '').trim().toLowerCase();
    if (!viewerKey) return false;
    if (viewerKey === defenderKey) return true;
    const expiresAtMs = Math.max(0, Math.floor(Number(captureState?.intelByNation?.[viewerKey]) || 0));
    return expiresAtMs > Date.now();
}

function buildCapitalCapturePayload(captureState, viewerNation = '', defenderNation = '') {
    const safeNow = Date.now();
    const state = captureState && typeof captureState === 'object'
        ? captureState
        : normalizeCapitalCaptureState(null, { walls: 100 }, safeNow);
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const intelGranted = canViewCapitalIntel(viewerNation, defenderNation, state);
    const raidCooldownUntilMs = Math.max(0, Math.floor(Number(state.raidCooldownUntilMs) || 0));
    const raidCooldownActive = raidCooldownUntilMs > safeNow;
    const raidUnlocked = state.raidUnlockedAtMs > 0 && !raidCooldownActive;
    return {
        status: state.status,
        slotLimit: state.slotLimit,
        queueCount: queue.length,
        queue: queue.map((entry) => ({
            playFabId: entry.playFabId,
            nation: entry.nation,
            joinedAt: entry.joinedAt
        })),
        remainingMs: queue.length > 0 && state.endsAt > 0 ? Math.max(0, state.endsAt - safeNow) : 0,
        progressRatio: state.baseDurationMs > 0 ? Math.max(0, Math.min(1, state.progressBaseMs / state.baseDurationMs)) : 0,
        breached: state.status === 'breached' || state.status === 'capturing' || state.status === 'captured',
        breachThreshold: CAPITAL_CAPTURE_BREACH_WALLS,
        raidUnlocked,
        raidUnlockedAtMs: state.raidUnlockedAtMs,
        raidUnlockedByNation: state.raidUnlockedByNation || null,
        raidCooldownUntilMs,
        raidCooldownRemainingMs: raidCooldownActive ? Math.max(0, raidCooldownUntilMs - safeNow) : 0,
        raidCooldownActive,
        intelGranted,
        intelRemainingMs: intelGranted && viewerNation && viewerNation !== defenderNation
            ? Math.max(0, Math.floor(Number(state.intelByNation?.[String(viewerNation).trim().toLowerCase()] || 0) - safeNow))
            : 0
    };
}

function buildNationWarSystemEntry(weapon, nowMs) {
    const deployedAtMs = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const durationMs = Math.max(0, Math.floor(Number(weapon?.durationSeconds || 0) * 1000));
    return {
        id: `${String(weapon?.id || 'system')}:${deployedAtMs}:${Math.random().toString(36).slice(2, 8)}`,
        weaponId: String(weapon?.id || '').trim().toLowerCase(),
        deployedAtMs,
        expiresAtMs: durationMs > 0 ? (deployedAtMs + durationMs) : 0,
        ammoRemaining: Math.max(0, Math.floor(Number(weapon?.ammo) || 0))
    };
}

function buildNationWarStrikeEntry({ attackerNation, defenderNation, weapon, targetPart, attackBonus }, nowMs) {
    const createdAtMs = Math.max(0, Math.floor(Number(nowMs) || Date.now()));
    const prepMs = Math.max(0, Math.floor(Number(weapon?.prepSeconds || 0) * 1000));
    return {
        id: `${String(weapon?.id || 'strike')}:${createdAtMs}:${Math.random().toString(36).slice(2, 8)}`,
        attackerNation: String(attackerNation || '').trim().toLowerCase(),
        defenderNation: String(defenderNation || '').trim().toLowerCase(),
        weaponId: String(weapon?.id || '').trim().toLowerCase(),
        targetPart: String(targetPart || '').trim() || 'walls',
        createdAtMs,
        launchAtMs: createdAtMs + prepMs,
        decision: 'pending',
        interceptSystemId: '',
        attackBonus: {
            hit: Math.floor(Number(attackBonus?.hit) || 0),
            damage: Math.floor(Number(attackBonus?.damage) || 0),
            damageByPart: Object.entries(attackBonus?.damageByPart || {}).reduce((acc, [part, value]) => {
                acc[String(part || '').trim()] = Math.floor(Number(value) || 0);
                return acc;
            }, {})
        },
        targetKnown: false
    };
}

async function appendNationWarEvent(firestore, admin, event = {}) {
    if (!firestore || !admin) return null;
    const createdAtMs = Math.max(0, Math.floor(Number(event.createdAtMs) || Date.now()));
    const payload = {
        type: String(event.type || 'info').trim().toLowerCase() || 'info',
        publicLevel: String(event.publicLevel || 'nation').trim().toLowerCase() || 'nation',
        summary: String(event.summary || '').trim().slice(0, 180),
        details: String(event.details || '').trim().slice(0, 260),
        participants: Array.from(new Set((Array.isArray(event.participants) ? event.participants : [])
            .map((row) => String(row || '').trim().toLowerCase())
            .filter(Boolean))).slice(0, 4),
        attackerNation: String(event.attackerNation || '').trim().toLowerCase(),
        defenderNation: String(event.defenderNation || '').trim().toLowerCase(),
        weaponId: String(event.weaponId || '').trim().toLowerCase(),
        createdAtMs,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (!payload.summary) return null;
    await getNationWarEventsCollection(firestore).add(payload);
    if (payload.publicLevel === 'global') {
        addGlobalChatMessage(payload.summary, 'War');
    }
    return payload;
}

async function getRecentNationWarLogs(firestore, nation) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const snap = await getNationWarEventsCollection(firestore)
        .orderBy('createdAtMs', 'desc')
        .limit(NATION_WAR_EVENT_LIMIT)
        .get();
    const rows = snap.docs.map((doc) => {
        const data = doc.data() || {};
        return {
            id: doc.id,
            type: String(data.type || 'info').trim().toLowerCase() || 'info',
            publicLevel: String(data.publicLevel || 'nation').trim().toLowerCase() || 'nation',
            summary: String(data.summary || '').trim(),
            details: String(data.details || '').trim(),
            participants: Array.isArray(data.participants) ? data.participants.map((row) => String(row || '').trim().toLowerCase()).filter(Boolean) : [],
            attackerNation: String(data.attackerNation || '').trim().toLowerCase(),
            defenderNation: String(data.defenderNation || '').trim().toLowerCase(),
            weaponId: String(data.weaponId || '').trim().toLowerCase(),
            createdAtMs: Math.max(0, Math.floor(Number(data.createdAtMs) || 0))
        };
    });
    return {
        global: rows.filter((row) => row.publicLevel === 'global').slice(0, 12),
        nation: rows.filter((row) => row.participants.includes(nationKey) || row.publicLevel === 'global').slice(0, 16),
        detailed: rows.filter((row) => row.participants.includes(nationKey)).slice(0, 20)
    };
}

async function subtractNationTreasury(nation, amount, firestore, deps, options = {}) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    const entityKey = await getNationGroupEntityKey(nation, firestore, deps);
    if (!entityKey) return null;
    if (!deps?.subtractEconomyItem) {
        throw new Error('Missing subtractEconomyItem dependency');
    }
    if (value > 0) {
        await deps.subtractEconomyItem(entityKey.Id, 'PS', value, { entityKeyOverride: entityKey, idempotencyId: options.idempotencyId });
    }
    if (value > 0) {
        try {
            await appendNationTreasuryRecentEntry(nation, firestore, deps?.admin, {
                entryId: options.idempotencyId || '',
                amount: value,
                direction: 'out',
                currency: options.currency || 'PS',
                source: options.source || 'manual_adjustment',
                label: options.label,
                actorId: options.actorId || '',
                actorName: options.actorName || '',
                note: options.note || ''
            });
        } catch (error) {
            console.warn('[subtractNationTreasury] Failed to append treasury entry:', error?.message || error);
        }
    }
    const treasuryPs = await getGroupTreasuryBalance(entityKey.Id, deps);
    return { groupId: entityKey.Id, treasuryPs };
}

function getActiveNationWarSystems(state, nowMs) {
    return (Array.isArray(state?.activeSystems) ? state.activeSystems : [])
        .filter((system) => !system.expiresAtMs || system.expiresAtMs > nowMs);
}

function collectNationWarBonuses(state, nowMs) {
    const totals = {
        defense: { detect: 0, identify: 0, interceptSupport: 0, enemyHitPenalty: 0 },
        recon: { detect: 0, identify: 0 },
        attack: { hit: 0, damage: 0, damageByPart: {} }
    };
    getActiveNationWarSystems(state, nowMs).forEach((system) => {
        const weapon = getNationWarWeaponDefinition(system.weaponId);
        const defenseEffects = weapon?.effects?.defense || {};
        const reconEffects = weapon?.effects?.recon || {};
        const attackEffects = weapon?.effects?.attack || {};
        totals.defense.detect += Math.floor(Number(defenseEffects.detect) || 0);
        totals.defense.identify += Math.floor(Number(defenseEffects.identify) || 0);
        totals.defense.interceptSupport += Math.floor(Number(defenseEffects.interceptSupport) || 0);
        totals.defense.enemyHitPenalty += Math.floor(Number(defenseEffects.enemyHitPenalty) || 0);
        totals.recon.detect += Math.floor(Number(reconEffects.detect) || 0);
        totals.recon.identify += Math.floor(Number(reconEffects.identify) || 0);
        totals.attack.hit += Math.floor(Number(attackEffects.hit) || 0);
        totals.attack.damage += Math.floor(Number(attackEffects.damage) || 0);
        Object.entries(attackEffects.damageByPart || {}).forEach(([part, value]) => {
            const key = String(part || '').trim();
            if (!key) return;
            totals.attack.damageByPart[key] = (totals.attack.damageByPart[key] || 0) + Math.floor(Number(value) || 0);
        });
    });
    return totals;
}

function buildNationWarAttackSnapshot(state, nowMs) {
    const totals = collectNationWarBonuses(state, nowMs);
    return {
        hit: totals.attack.hit,
        damage: totals.attack.damage,
        damageByPart: totals.attack.damageByPart
    };
}

function buildNationWarIncomingIntel(incoming, defenderState, nowMs) {
    const weapon = getNationWarWeaponDefinition(incoming.weaponId);
    const capitalStatus = defenderState?.capitalStatus || createDefaultNationWarState(defenderState?.nation || '').capitalStatus;
    const totals = collectNationWarBonuses(defenderState, nowMs);
    const identifyScore = clampWarPercent(45 + totals.defense.identify + totals.recon.identify - Math.floor(Number(weapon?.identifyDifficulty) || 0));
    const hitScore = clampWarPercent(
        Math.floor(Number(weapon?.hit) || 0)
        + Math.floor(Number(incoming?.attackBonus?.hit) || 0)
        - totals.defense.enemyHitPenalty
        - Math.floor(Number(capitalStatus.airDefense || 0) * 0.12)
    );
    const decoyRiskScore = clampWarPercent(Math.floor(Number(weapon?.decoyValue) || 0) - Math.floor((totals.defense.identify + totals.recon.identify) * 0.6) + 35);
    const identifyBand = getWarCertaintyBand(identifyScore);
    const hitBand = getWarPercentBand(hitScore);
    const decoyBand = getWarPercentBand(decoyRiskScore);
    const targetBand = identifyScore >= 65 ? CAPITAL_PART_LABELS[incoming.targetPart] || '不明' : '不明';
    const weaponName = identifyScore >= 70
        ? weapon?.label || '飛来物'
        : identifyScore >= 40
            ? `推定 ${weapon?.label || '飛来物'}`
            : '正体不明の飛来物';
    return {
        identifyScore,
        hitScore,
        decoyRiskScore,
        identifyBand,
        hitBand,
        decoyBand,
        weaponName,
        targetLabel: targetBand
    };
}

function applyNationWarDamage(capitalStatus, incoming, weapon) {
    const next = { ...capitalStatus };
    const attackBonus = incoming.attackBonus || {};
    (Array.isArray(weapon?.payload) ? weapon.payload : []).forEach((entry) => {
        const part = String(entry?.part || '').trim();
        if (!part || !Object.prototype.hasOwnProperty.call(next, part)) return;
        const baseDamage = Math.floor(Number(entry?.damage) || 0);
        const extraDamage = Math.floor(Number(attackBonus.damage) || 0) + Math.floor(Number(attackBonus.damageByPart?.[part]) || 0);
        next[part] = clampWarPercent(next[part] - baseDamage - extraDamage);
    });
    return next;
}

function calculateNationWarRaidPlan(capitalStatus, treasuryPs, captureState = null) {
    const safeTreasury = Math.max(0, Math.floor(Number(treasuryPs) || 0));
    const safeStatus = {
        walls: clampWarPercent(capitalStatus?.walls),
        vault: clampWarPercent(capitalStatus?.vault),
        command: clampWarPercent(capitalStatus?.command)
    };
    const safeNow = Date.now();
    const raidCooldownUntilMs = Math.max(0, Math.floor(Number(captureState?.raidCooldownUntilMs) || 0));
    const raidCooldownActive = raidCooldownUntilMs > safeNow;
    const breachOpen = Math.max(0, Math.floor(Number(captureState?.raidUnlockedAtMs) || 0)) > 0 && !raidCooldownActive;
    const raidRate = 0.10
        + (((100 - safeStatus.vault) / 100) * 0.08)
        + (((100 - safeStatus.command) / 100) * 0.04);
    const maxSpendable = Math.max(0, safeTreasury - NATION_WAR_MIN_TREASURY_RESERVE);
    const expectedAmount = breachOpen
        ? Math.max(0, Math.min(NATION_WAR_MAX_RAID_AMOUNT, Math.floor(maxSpendable * raidRate)))
        : 0;
    return {
        breachOpen,
        reservePs: NATION_WAR_MIN_TREASURY_RESERVE,
        raidRate,
        expectedAmount,
        remainingAfterRaid: Math.max(0, safeTreasury - expectedAmount),
        raidCooldownUntilMs,
        raidCooldownActive,
        raidCooldownRemainingMs: raidCooldownActive ? Math.max(0, raidCooldownUntilMs - safeNow) : 0
    };
}

async function loadNationWarState(nation, firestore, admin, deps) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const docRef = getNationWarDoc(firestore, nationKey);
    const snap = await docRef.get();
    const nowMs = Date.now();
    const state = normalizeNationWarState(snap.exists ? snap.data() : null, nationKey, nowMs);
    if (!snap.exists) {
        await docRef.set({
            ...state,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    return state;
}

async function saveNationWarState(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const docRef = getNationWarDoc(firestore, nationKey);
    await docRef.set({
        ...state,
        nation: nationKey,
        updatedAtMs: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function resolveNationWarIncoming(nation, state, firestore, admin) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const nowMs = Date.now();
    const nextState = normalizeNationWarState(state, nationKey, nowMs);
    const previousSystemCount = Array.isArray(nextState.activeSystems) ? nextState.activeSystems.length : 0;
    nextState.activeSystems = getActiveNationWarSystems(nextState, nowMs);
    nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
    const remainingIncoming = [];
    let changed = nextState.activeSystems.length !== previousSystemCount;
    for (const incoming of nextState.incoming) {
        if (incoming.launchAtMs > nowMs) {
            remainingIncoming.push(incoming);
            continue;
        }
        const weapon = getNationWarWeaponDefinition(incoming.weaponId);
        if (!weapon) {
            changed = true;
            continue;
        }
        const totals = collectNationWarBonuses(nextState, nowMs);
        const autoSkip = incoming.decision === 'pending';
        const interceptSystem = incoming.decision === 'intercept'
            ? nextState.activeSystems.find((system) => system.id === incoming.interceptSystemId)
            : null;
        let intercepted = false;
        let interceptSummary = '';
        if (interceptSystem) {
            const interceptWeapon = getNationWarWeaponDefinition(interceptSystem.weaponId);
            if (interceptWeapon && interceptSystem.ammoRemaining > 0) {
                interceptSystem.ammoRemaining -= 1;
                const interceptChance = clampWarPercent(
                    Math.floor(Number(interceptWeapon.intercept) || 0)
                    + totals.defense.interceptSupport
                    + Math.floor(Number(interceptWeapon.detect || 0) / 8)
                    + Math.floor(Number(interceptWeapon.identify || 0) / 8)
                    - Math.floor(Number(weapon.detectDifficulty || 0) * 0.15)
                    - Math.floor(Number(weapon.identifyDifficulty || 0) * 0.1)
                    - Math.floor(Number(weapon.decoyValue || 0) * 0.08)
                );
                intercepted = Math.random() * 100 < interceptChance;
                interceptSummary = `${interceptWeapon.label}で迎撃${intercepted ? '成功' : '失敗'}`;
                await appendNationWarEvent(firestore, admin, {
                    type: intercepted ? 'intercept_success' : 'intercept_fail',
                    publicLevel: 'global',
                    summary: `${getNationLabel(nationKey)}が${weapon.label}への迎撃を${intercepted ? '成功' : '失敗'}`,
                    details: `${interceptWeapon.label} / 判定: ${interceptChance}%相当`,
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
            }
        }
        if (!intercepted) {
            const hitChance = clampWarPercent(
                Math.floor(Number(weapon.hit) || 0)
                + Math.floor(Number(incoming.attackBonus?.hit) || 0)
                - totals.defense.enemyHitPenalty
                - Math.floor(Number(nextState.capitalStatus.airDefense || 0) * 0.12)
            );
            const didHit = Math.random() * 100 < hitChance;
            if (didHit && Array.isArray(weapon.payload) && weapon.payload.length) {
                const previousWalls = clampWarPercent(nextState.capitalStatus.walls);
                nextState.capitalStatus = applyNationWarDamage(nextState.capitalStatus, incoming, weapon);
                nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
                const targetLabel = CAPITAL_PART_LABELS[incoming.targetPart] || '首都';
                await appendNationWarEvent(firestore, admin, {
                    type: 'strike_hit',
                    publicLevel: 'global',
                    summary: `${weapon.label}が${getNationLabel(nationKey)}の${targetLabel}に命中`,
                    details: `被害を確認。${autoSkip ? '迎撃判断が間に合わなかった。' : (interceptSummary || '迎撃なし')}`,
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
                if (previousWalls > CAPITAL_CAPTURE_BREACH_WALLS && nextState.capitalStatus.walls <= CAPITAL_CAPTURE_BREACH_WALLS) {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_breach',
                        publicLevel: 'global',
                        summary: `${getNationLabel(nationKey)}の城壁が破られ、首都へ上陸可能になった`,
                        details: '前線プレイヤーは首都へ乗り込み、制圧を進められる。',
                        participants: [nationKey, incoming.attackerNation],
                        attackerNation: incoming.attackerNation,
                        defenderNation: nationKey,
                        weaponId: incoming.weaponId
                    });
                }
            } else {
                await appendNationWarEvent(firestore, admin, {
                    type: 'strike_miss',
                    publicLevel: 'global',
                    summary: `${weapon.label}は${getNationLabel(nationKey)}への有効打を与えられず`,
                    details: weapon.role === 'decoy'
                        ? '飛来物はデコイと判明した。'
                        : (interceptSummary || '海上で失速した。'),
                    participants: [nationKey, incoming.attackerNation],
                    attackerNation: incoming.attackerNation,
                    defenderNation: nationKey,
                    weaponId: incoming.weaponId
                });
            }
        }
        changed = true;
    }
    nextState.incoming = remainingIncoming;
    nextState.activeSystems = nextState.activeSystems.filter((system) => {
        const weapon = getNationWarWeaponDefinition(system.weaponId);
        if (weapon?.role !== 'intercept') return true;
        return system.ammoRemaining > 0 && (!system.expiresAtMs || system.expiresAtMs > nowMs);
    });
    nextState.capitalCaptureState = refreshNationWarCaptureState(nextState.capitalCaptureState, nextState, nowMs);
    if (
        nextState.capitalCaptureState.status === 'capturing'
        && nextState.capitalCaptureState.progressBaseMs >= nextState.capitalCaptureState.baseDurationMs
        && nextState.capitalCaptureState.queue.length > 0
        && !nextState.capitalCaptureState.raidUnlockedAtMs
    ) {
        const leader = nextState.capitalCaptureState.queue[0] || null;
        nextState.capitalCaptureState.status = 'captured';
        nextState.capitalCaptureState.raidUnlockedAtMs = nowMs;
        nextState.capitalCaptureState.raidUnlockedByNation = leader?.nation || null;
        nextState.capitalCaptureState.progressBaseMs = nextState.capitalCaptureState.baseDurationMs;
        nextState.capitalCaptureState.queue = [];
        nextState.capitalCaptureState.lastProgressAt = 0;
        nextState.capitalCaptureState.endsAt = 0;
        changed = true;
        await appendNationWarEvent(firestore, admin, {
            type: 'capital_capture_complete',
            publicLevel: 'global',
            summary: `${getNationLabel(nationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
            details: leader?.nation ? `${getNationLabel(leader.nation)}の攻城隊が制圧を完了` : '首都制圧が完了した。',
            participants: [nationKey, leader?.nation].filter(Boolean),
            attackerNation: leader?.nation || '',
            defenderNation: nationKey
        });
    }
    if (changed) {
        await saveNationWarState(nationKey, nextState, firestore, admin);
    }
    return nextState;
}

async function buildNationWarPagePayload(nation, state, firestore, admin, deps) {
    const nationKey = String(nation || '').trim().toLowerCase();
    const nowMs = Date.now();
    const activeSystems = getActiveNationWarSystems(state, nowMs);
    const logs = await getRecentNationWarLogs(firestore, nationKey);
    const strikeWeapons = listNationWarWeapons(nationKey, 'strike');
    const deployWeapons = listNationWarWeapons(nationKey, 'deploy');
    const enemyNations = await Promise.all(Object.keys(NATION_GROUP_BY_NATION)
        .filter((key) => key !== nationKey)
        .map(async (key) => {
            let enemyState = await resolveNationWarIncoming(key, await loadNationWarState(key, firestore, admin, deps), firestore, admin);
            enemyState = await resolveNationWarCaptureState(key, enemyState, firestore, admin);
            const enemyGroupId = await getNationGroupIdByNation(key, firestore, deps);
            const treasuryPs = enemyGroupId ? await getGroupTreasuryBalance(enemyGroupId, deps) : 0;
            const raidPlan = calculateNationWarRaidPlan(enemyState.capitalStatus, treasuryPs, enemyState.capitalCaptureState);
            return {
                nation: key,
                label: getNationLabel(key),
                treasuryPs,
                raidEligible: raidPlan.breachOpen && raidPlan.expectedAmount > 0,
                raidExpectedPs: raidPlan.expectedAmount,
                raidRatePercent: Number((raidPlan.raidRate * 100).toFixed(1)),
                capitalCapture: buildCapitalCapturePayload(enemyState.capitalCaptureState, nationKey, key),
                capitalStatus: Object.entries(enemyState.capitalStatus || {}).map(([part, value]) => ({
                    part,
                    label: CAPITAL_PART_LABELS[part] || part,
                    value: clampWarPercent(value),
                    band: getWarPercentBand(value)
                }))
            };
        }));
    return {
        nation: nationKey,
        nationLabel: getNationLabel(nationKey),
        nationModel: getNationModelByNation(nationKey),
        nationModelLabel: getNationModelLabel(getNationModelByNation(nationKey)),
        capitalCapture: buildCapitalCapturePayload(state.capitalCaptureState, nationKey, nationKey),
        capitalStatus: Object.entries(state.capitalStatus || {}).map(([part, value]) => ({
            part,
            label: CAPITAL_PART_LABELS[part] || part,
            value: clampWarPercent(value),
            band: getWarPercentBand(value)
        })),
        activeSystems: activeSystems.map((system) => {
            const weapon = getNationWarWeaponDefinition(system.weaponId);
            return {
                id: system.id,
                weaponId: system.weaponId,
                label: weapon?.label || system.weaponId,
                role: String(weapon?.role || '').trim(),
                description: weapon?.description || '',
                ammoRemaining: Math.max(0, Math.floor(Number(system.ammoRemaining) || 0)),
                expiresAtMs: system.expiresAtMs,
                remainingMs: Math.max(0, Math.floor(Number(system.expiresAtMs || 0) - nowMs)),
                band: getWarPercentBand(system.ammoRemaining > 0 ? 100 : 0)
            };
        }),
        incoming: (Array.isArray(state.incoming) ? state.incoming : []).map((incoming) => {
            const intel = buildNationWarIncomingIntel(incoming, state, nowMs);
            return {
                id: incoming.id,
                weaponId: incoming.weaponId,
                weaponName: intel.weaponName,
                identifyLabel: intel.identifyBand.label,
                identifyBand: intel.identifyBand,
                hitOutlookLabel: intel.hitBand.label,
                hitOutlookBand: intel.hitBand,
                decoyRiskLabel: intel.decoyBand.label,
                decoyRiskBand: intel.decoyBand,
                targetLabel: intel.targetLabel,
                launchAtMs: incoming.launchAtMs,
                remainingMs: Math.max(0, Math.floor(Number(incoming.launchAtMs || 0) - nowMs)),
                decision: incoming.decision,
                interceptSystemId: incoming.interceptSystemId || ''
            };
        }).sort((a, b) => a.launchAtMs - b.launchAtMs),
        strikeWeapons: strikeWeapons.map((weapon) => ({
            id: weapon.id,
            label: weapon.label,
            costPs: weapon.costPs,
            prepSeconds: Math.max(0, Math.floor(Number(weapon.prepSeconds) || 0)),
            cooldownSeconds: Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)),
            description: weapon.description || '',
            cooldownRemainingMs: Math.max(0, Math.floor(Number(state.cooldowns?.[weapon.id] || 0) - nowMs))
        })),
        deployWeapons: deployWeapons.map((weapon) => ({
            id: weapon.id,
            label: weapon.label,
            role: weapon.role,
            costPs: weapon.costPs,
            durationSeconds: Math.max(0, Math.floor(Number(weapon.durationSeconds) || 0)),
            cooldownSeconds: Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)),
            ammo: Math.max(0, Math.floor(Number(weapon.ammo) || 0)),
            description: weapon.description || '',
            cooldownRemainingMs: Math.max(0, Math.floor(Number(state.cooldowns?.[weapon.id] || 0) - nowMs))
        })),
        interceptorOptions: activeSystems
            .map((system) => {
                const weapon = getNationWarWeaponDefinition(system.weaponId);
                if (weapon?.role !== 'intercept' || system.ammoRemaining <= 0) return null;
                return {
                    id: system.id,
                    weaponId: system.weaponId,
                    label: `${weapon.label} / 残弾${system.ammoRemaining}`,
                    ammoRemaining: system.ammoRemaining
                };
            })
            .filter(Boolean),
        targetOptions: Object.keys(NATION_GROUP_BY_NATION)
            .filter((key) => key !== nationKey)
            .map((key) => ({
                value: key,
                label: getNationLabel(key)
            })),
        enemyNations,
        logs
    };
}

function buildCapitalStatusForViewer(capitalStatus, viewerNation, targetNation, captureState) {
    const exact = canViewCapitalIntel(viewerNation, targetNation, captureState);
    return Object.entries(capitalStatus || {}).map(([part, value]) => ({
        part,
        label: CAPITAL_PART_LABELS[part] || part,
        value: exact ? clampWarPercent(value) : null,
        band: getWarPercentBand(value),
        exact
    }));
}

function buildCapitalWarStatePayload(targetNation, viewerNation, state, treasuryPs = 0) {
    const targetNationKey = String(targetNation || '').trim().toLowerCase();
    const viewerNationKey = String(viewerNation || '').trim().toLowerCase();
    const capture = buildCapitalCapturePayload(state.capitalCaptureState, viewerNationKey, targetNationKey);
    const isOwnNation = !!viewerNationKey && viewerNationKey === targetNationKey;
    return {
        nation: targetNationKey,
        nationLabel: getNationLabel(targetNationKey),
        isOwnNation,
        treasuryPs: Math.max(0, Math.floor(Number(treasuryPs) || 0)),
        capitalStatus: buildCapitalStatusForViewer(state.capitalStatus, viewerNationKey, targetNationKey, state.capitalCaptureState),
        capitalCapture: capture,
        actions: {
            canRecon: !isOwnNation,
            canRepair: isOwnNation,
            canSabotage: !isOwnNation && !capture.raidUnlocked,
            canShipAttack: !isOwnNation,
            canCapture: !isOwnNation && capture.breached,
            canRaid: !isOwnNation && capture.raidUnlocked
        }
    };
}

function pickCapitalRepairPart(capitalStatus = {}) {
    return Object.entries(capitalStatus)
        .filter(([part]) => Object.prototype.hasOwnProperty.call(CAPITAL_PART_LABELS, part))
        .sort((a, b) => (clampWarPercent(a[1]) - clampWarPercent(b[1])) || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'walls';
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

async function updateGuildOwnerAndShipOwner(guildId, newOwnerPlayFabId, deps) {
    const { promisifyPlayFab, firestore, admin } = deps;
    if (!guildId || !newOwnerPlayFabId) return { guildUpdated: false, shipUpdated: false };
    let guildUpdated = false;
    let shipUpdated = false;
    try {
        const result = await callTitleScopedApi(promisifyPlayFab, PlayFabData.GetObjects, {
            Entity: { Id: guildId, Type: 'group' },
            EscapeObject: false
        });
        const rawObject = result?.Objects?.GuildData?.DataObject;
        let guildData = rawObject;
        if (typeof guildData === 'string') {
            try {
                guildData = JSON.parse(guildData);
            } catch (e) {
                console.warn('[king-transfer] Failed to parse GuildData JSON:', e?.message || e);
                guildData = null;
            }
        }
        if (guildData && typeof guildData === 'object') {
            guildData.ownerPlayFabId = newOwnerPlayFabId;
            await callTitleScopedApi(promisifyPlayFab, PlayFabData.SetObjects, {
                Entity: { Id: guildId, Type: 'group' },
                Objects: [{ ObjectName: 'GuildData', DataObject: guildData }]
            });
            guildUpdated = true;
        }
    } catch (error) {
        console.warn('[king-transfer] Failed to update guild data:', error?.errorMessage || error?.message || error);
    }

    try {
        const shipDocId = `guild_ship_${guildId}`;
        const shipRef = firestore.collection('ships').doc(shipDocId);
        const shipSnap = await shipRef.get();
        if (shipSnap.exists) {
            await shipRef.set({
                ownerPlayFabId: newOwnerPlayFabId,
                ownerId: newOwnerPlayFabId,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            shipUpdated = true;
        }
    } catch (error) {
        console.warn('[king-transfer] Failed to update guild ship owner:', error?.message || error);
    }

    return { guildUpdated, shipUpdated };
}

async function requireKingContext(playFabId, firestore, deps) {
    const { promisifyPlayFab, PlayFabServer, admin } = deps;
    const kingId = normalizePlayFabId(playFabId);
    if (!kingId) throw new Error('InvalidPlayFabId');

    const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: kingId,
        Keys: ['IsKing', 'Nation']
    });
    const isKing = String(kingRo?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
    if (!isKing) throw new Error('NotKing');

    const nation = String(kingRo?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
    if (!nation) throw new Error('KingNationNotSet');
    const mapping = getNationMappingByNation(nation);
    if (!mapping) throw new Error('InvalidKingNation');

    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) throw new Error('NationGroupNotFound');

    const groupDocRef = getNationGroupDoc(firestore, mapping.groupName);
    const groupSnap = await groupDocRef.get();
    const storedKingId = groupSnap.exists ? normalizePlayFabId(groupSnap.data()?.kingPlayFabId || '') : '';

    if (storedKingId !== kingId) {
        await groupDocRef.set({
            kingPlayFabId: kingId,
            kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    return { kingId, nation, mapping, groupId };
}

function getKingStarterCrownIdByNation(nation) {
    const key = String(nation || '').toLowerCase();
    return KING_STARTER_CROWN_BY_NATION[key] || null;
}

function getKingStarterCrownGrantDataKey(nation) {
    const key = String(nation || '').toLowerCase();
    if (!key) return 'KingStarterCrownGranted';
    return `KingStarterCrownGranted_${key}`;
}

function normalizeTroyCheckoutItems(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const name = String(item?.name || item?.itemName || '').trim();
            const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
            const price = Math.max(0, Math.floor(Number(item?.price) || 0));
            if (!name || !price) return null;
            const orderedAtMs = Math.max(0, Math.floor(Number(item?.orderedAtMs) || 0));
            const undoUntilMs = Math.max(0, Math.floor(Number(item?.undoUntilMs) || 0));
            return {
                name,
                quantity,
                price,
                grantedPs: Math.max(0, Math.floor(Number(item?.grantedPs) || 0)),
                cashbackRateBps: Math.max(0, Math.floor(Number(item?.cashbackRateBps) || 0)),
                orderId: String(item?.orderId || '').trim(),
                orderedAtMs,
                undoUntilMs,
                lineTotal: price * quantity
            };
        })
        .filter(Boolean);
}

function isTroyUndoProtectedItem(item = {}) {
    const name = String(item?.name || '').trim();
    return name === '入店チャージ';
}

function buildStoredTroyCheckoutItem(item = {}) {
    const normalized = normalizeTroyCheckoutItems([item])[0];
    if (!normalized) return null;
    const stored = {
        name: normalized.name,
        quantity: normalized.quantity,
        price: normalized.price,
        grantedPs: normalized.grantedPs,
        cashbackRateBps: normalized.cashbackRateBps
    };
    if (normalized.orderId) stored.orderId = normalized.orderId;
    if (normalized.orderedAtMs > 0) stored.orderedAtMs = normalized.orderedAtMs;
    if (normalized.undoUntilMs > 0) stored.undoUntilMs = normalized.undoUntilMs;
    return stored;
}

function buildTroyCheckoutPayload(docOrData = null) {
    const hasDataFn = typeof docOrData?.data === 'function';
    const data = hasDataFn ? (docOrData.data() || {}) : (docOrData || {});
    const fallbackId = hasDataFn ? String(docOrData?.id || '').trim() : String(data?.playFabId || '').trim();
    const status = String(data.status || 'open').trim().toLowerCase();
    const items = normalizeTroyCheckoutItems(data.items);
    const total = Math.max(0, Math.floor(Number(data.total) || items.reduce((sum, item) => sum + item.lineTotal, 0)));
    const totalItems = Math.max(0, Math.floor(Number(data.totalItems) || items.reduce((sum, item) => sum + item.quantity, 0)));
    const createdAtRaw = data.createdAt?.toMillis ? data.createdAt.toMillis() : Number(data.createdAt) || 0;
    const updatedAtRaw = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Number(data.updatedAt) || 0;
    const lastOrderedAtRaw = data.lastOrderedAt?.toMillis ? data.lastOrderedAt.toMillis() : Number(data.lastOrderedAt) || 0;
    const settledAtRaw = data.settledAt?.toMillis ? data.settledAt.toMillis() : Number(data.settledAt) || 0;
    const grantTotal = Math.max(0, Math.floor(Number(data.grantTotal) || 0));
    const summary = items.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`).join(' / ');
    return {
        playFabId: normalizePlayFabId(data.playFabId || fallbackId),
        displayName: String(data.displayName || fallbackId || 'Player').trim(),
        status,
        total,
        totalItems,
        grantTotal,
        summary,
        items,
        createdAtMs: createdAtRaw,
        updatedAtMs: updatedAtRaw,
        lastOrderedAtMs: lastOrderedAtRaw,
        settledAtMs: settledAtRaw
    };
}

function buildTroyPendingCheckoutPayload(checkoutDocs = []) {
    return (Array.isArray(checkoutDocs) ? checkoutDocs : [])
        .map((doc) => buildTroyCheckoutPayload(doc))
        .filter((entry) => entry && (entry.status === 'open' || entry.status === 'pending'))
        .filter(Boolean)
        .sort((a, b) => (a.createdAtMs - b.createdAtMs) || String(a.playFabId || '').localeCompare(String(b.playFabId || '')));
}

function buildTroyMemberPayload(memberDocs = []) {
    return (Array.isArray(memberDocs) ? memberDocs : [])
        .map((doc) => {
            const data = typeof doc?.data === 'function' ? (doc.data() || {}) : {};
            const joinedAtMs = data.joinedAt?.toMillis ? data.joinedAt.toMillis() : Number(data.joinedAt) || 0;
            return {
                playFabId: normalizePlayFabId(doc?.id || data.playFabId || ''),
                displayName: String(data.displayName || doc?.id || 'Player').trim(),
                joinedAtMs
            };
        })
        .filter((entry) => entry.playFabId)
        .sort((a, b) => (a.joinedAtMs - b.joinedAtMs) || String(a.playFabId || '').localeCompare(String(b.playFabId || '')));
}

async function ensureKingStarterCrown(playFabId, nation, deps) {
    const { promisifyPlayFab, PlayFabServer, addEconomyItem } = deps;
    const kingId = normalizePlayFabId(playFabId);
    const crownItemId = getKingStarterCrownIdByNation(nation);
    if (!kingId || !crownItemId) {
        return { granted: false, reason: 'NoTarget' };
    }

    const dataKey = getKingStarterCrownGrantDataKey(nation);
    try {
        const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: kingId,
            Keys: [dataKey]
        });
        const alreadyGranted = String(ro?.Data?.[dataKey]?.Value || '').toLowerCase() === 'true';
        if (alreadyGranted) {
            return { granted: false, reason: 'AlreadyGranted', itemId: crownItemId };
        }

        await addEconomyItem(kingId, crownItemId, 1, {
            idempotencyId: `king-starter-crown-${kingId}-${crownItemId}`
        });

        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: kingId,
            Data: {
                [dataKey]: 'true',
                [`${dataKey}At`]: String(Date.now()),
                [`${dataKey}Item`]: crownItemId
            }
        });

        return { granted: true, itemId: crownItemId };
    } catch (error) {
        const msg = error?.errorMessage || error?.message || error;
        console.warn('[ensureKingStarterCrown] Failed:', msg);
        return { granted: false, reason: 'Error', itemId: crownItemId, error: String(msg) };
    }
}

// APIルートを初期化
function initializeNationRoutes(app, deps) {
    const { promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabGroups, firestore, admin, getGroupDataValue, setGroupDataValues, subtractEconomyItem, addEconomyItem, getCurrencyBalance, applyTax, transferOwnedIslands, createStarterIsland, relocateActiveShip, emitDisplayEvent, requireAuthenticatedPlayFabId } = deps;

    const nationDeps = {
        promisifyPlayFab,
        PlayFabServer,
        PlayFabAdmin,
        PlayFabGroups,
        firestore,
        admin,
        getGroupDataValue,
        setGroupDataValues,
        addEconomyItem,
        subtractEconomyItem,
        getAllInventoryItems: deps.getAllInventoryItems,
        getVirtualCurrencyMap: deps.getVirtualCurrencyMap
    };

    const pushDisplayEvent = (payload) => {
        if (typeof emitDisplayEvent !== 'function') return;
        try {
            emitDisplayEvent(payload);
        } catch (error) {
            console.warn('[display-event] Failed to emit:', error?.message || error);
        }
    };

    async function requireAuthedPlayFabId(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const ro = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: requesterPlayFabId,
                Keys: ['IsKing', 'Nation']
            });
            const isKingFlag = String(ro?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
            if (!isKingFlag) {
                return res.json({ notInNation: true });
            }

            const selfId = normalizePlayFabId(requesterPlayFabId);
            const nation = String(ro?.Data?.Nation?.Value || '').trim().toLowerCase() || null;
            try {
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
                await ensureKingStarterCrown(requesterPlayFabId, nation, { promisifyPlayFab, PlayFabServer, addEconomyItem });
            } catch (syncError) {
                console.warn('[get-nation-king-page] Failed to sync kingPlayFabId:', syncError?.message || syncError);
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: requesterPlayFabId,
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
                const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
                const groupId = await getNationGroupIdByNation(nation, firestore, nationDeps);
                const mapping = getNationMappingByNation(nation);
                if (groupId) {
                    const treasuryPs = await getGroupTreasuryBalance(groupId, nationDeps);
                    const groupSnap = await getNationGroupDoc(firestore, mapping.groupName).get();
                    const groupData = groupSnap.data() || {};
                    const treasuryOverview = buildTreasuryOverview(groupSnap.data()?.treasuryRecentEntries || []);
                    const cashbackInfo = await getNationTreasuryCashbackInfo(nation, firestore, nationDeps);
                    payload.treasuryPs = treasuryPs;
                    payload.treasuryRank = cashbackInfo.rank;
                    payload.troyCashbackRateBps = cashbackInfo.rateBps;
                    payload.troyCashbackRatePercent = cashbackInfo.ratePercent;
                    payload.treasuryRecentEntries = treasuryOverview.recentEntries;
                    payload.treasurySummary = treasuryOverview.summary;
                    payload.troyTodaySales = buildTroyTodaySalesSnapshot(groupData);
                }
                if (mapping) {
                    const roomSnap = await getTroyRoomDoc(firestore, mapping.groupName).get();
                    payload.troyOpen = !!roomSnap.data()?.isOpen;
                    const membersSnap = await getTroyRoomDoc(firestore, mapping.groupName)
                        .collection('members')
                        .orderBy('joinedAt', 'asc')
                        .limit(50)
                        .get();
                    const checkoutSnap = await getTroyRoomDoc(firestore, mapping.groupName)
                        .collection('checkouts')
                        .limit(30)
                        .get();
                    payload.troyMembers = buildTroyMemberPayload(membersSnap.docs);
                    payload.troyPendingCheckouts = buildTroyPendingCheckoutPayload(checkoutSnap.docs);
                }
                let warState = await resolveNationWarIncoming(nation, await loadNationWarState(nation, firestore, admin, nationDeps), firestore, admin);
                warState = await resolveNationWarCaptureState(nation, warState, firestore, admin);
                payload.war = await buildNationWarPagePayload(nation, warState, firestore, admin, nationDeps);
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

    // PlayFab全体の日次貢献度ランキング（ディスプレイ用）
    app.get('/api/troy-bounty-ranking', async (req, res) => {
        const limitRaw = Number.parseInt(String(req.query?.limit || '10'), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
        try {
            const contributionState = await ensureDailyContributionVersionForToday(nationDeps);
            const result = await promisifyPlayFab(PlayFabServer.GetLeaderboard, {
                StatisticName: PLAYER_DAILY_CONTRIBUTION_STAT,
                StartPosition: 0,
                MaxResultsCount: limit,
                ProfileConstraints: { ShowDisplayName: true },
                Version: contributionState.activeVersion
            });
            const entries = Array.isArray(result?.Leaderboard) ? result.Leaderboard : [];
            const ranking = entries.map((entry) => ({
                position: Number(entry?.Position) + 1,
                playFabId: String(entry?.PlayFabId || '').trim(),
                displayName: String(entry?.DisplayName || '').trim() || String(entry?.PlayFabId || '').trim() || 'Unknown',
                contribution: Number(entry?.StatValue) || 0,
                score: Number(entry?.StatValue) || 0,
                bounty: Number(entry?.StatValue) || 0
            }));
            res.json({
                scope: 'global',
                dayKey: contributionState.activeDayKey,
                updatedAt: Date.now(),
                ranking
            });
        } catch (error) {
            console.error('[troy-bounty-ranking] Error:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'Failed to load global contribution ranking' });
        }
    });

    // 還元率の王設定は廃止
    app.post('/api/king-set-grant-multiplier', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
            res.status(410).json({
                error: 'GrantMultiplierDeprecated',
                message: '還元率の王設定は廃止されました。国庫順位で自動決定されます。',
                treasuryRank: cashbackInfo.rank,
                troyCashbackRateBps: cashbackInfo.rateBps
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-set-grant-multiplier] Error:', msg);
            res.status(500).json({ error: 'Failed to resolve cashback rate' });
        }
    });

    app.post('/api/get-capital-war-state', async (req, res) => {
        const { playFabId, targetNation } = req.body || {};
        if (!playFabId || !targetNation) {
            return res.status(400).json({ error: 'playFabId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const viewerNation = await getNationForPlayer(requesterPlayFabId, nationDeps);
            const targetNationKey = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[targetNationKey]) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            let warState = await resolveNationWarIncoming(targetNationKey, await loadNationWarState(targetNationKey, firestore, admin, nationDeps), firestore, admin);
            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const groupId = await getNationGroupIdByNation(targetNationKey, firestore, nationDeps);
            const treasuryPs = groupId ? await getGroupTreasuryBalance(groupId, nationDeps) : 0;
            res.json({
                success: true,
                capitalWar: buildCapitalWarStatePayload(targetNationKey, viewerNation, warState, treasuryPs)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            console.error('[get-capital-war-state] Error:', msg);
            res.status(500).json({ error: 'Failed to load capital war state', details: String(msg) });
        }
    });

    app.post('/api/nation-war-capital-action', async (req, res) => {
        const { playFabId, targetNation, action } = req.body || {};
        if (!playFabId || !targetNation || !action) {
            return res.status(400).json({ error: 'playFabId, targetNation and action are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const playerNation = await getNationForPlayer(requesterPlayFabId, nationDeps);
            if (!playerNation || !NATION_GROUP_BY_NATION[playerNation]) {
                return res.status(400).json({ error: 'NationRequired' });
            }
            const targetNationKey = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[targetNationKey]) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const normalizedAction = String(action || '').trim().toLowerCase();
            let warState = await resolveNationWarIncoming(targetNationKey, await loadNationWarState(targetNationKey, firestore, admin, nationDeps), firestore, admin);
            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const nowMs = Date.now();
            const isOwnNation = playerNation === targetNationKey;
            const spendPlayerPs = async (amount, tag) => {
                const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
                if (safeAmount <= 0) return;
                await subtractEconomyItem(requesterPlayFabId, 'PS', safeAmount, { idempotencyId: `nation-war-capital:${tag}:${requesterPlayFabId}:${targetNationKey}:${nowMs}` });
            };

            if (normalizedAction === 'recon') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalReconNotAllowed' });
                await spendPlayerPs(NATION_WAR_RECON_COST_PS, 'recon');
                warState.capitalCaptureState.intelByNation[playerNation] = nowMs + NATION_WAR_RECON_DURATION_MS;
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_recon',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(playerNation)}の偵察隊が${getNationLabel(targetNationKey)}首都の情報を掴んだ`,
                    details: `${Math.ceil(NATION_WAR_RECON_DURATION_MS / 60000)}分間、首都情報を詳細表示できる。`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'repair') {
                if (!isOwnNation) return res.status(403).json({ error: 'EnemyCapitalRepairNotAllowed' });
                await spendPlayerPs(NATION_WAR_REPAIR_COST_PS, 'repair');
                const part = pickCapitalRepairPart(warState.capitalStatus);
                warState.capitalStatus[part] = clampWarPercent(warState.capitalStatus[part] + NATION_WAR_CAPTURE_REPAIR_AMOUNT);
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_repair',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(targetNationKey)}の工兵隊が${CAPITAL_PART_LABELS[part] || '首都設備'}を修復`,
                    details: `回復量 ${NATION_WAR_CAPTURE_REPAIR_AMOUNT}`,
                    participants: [targetNationKey],
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'sabotage') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalSabotageNotAllowed' });
                await spendPlayerPs(NATION_WAR_SABOTAGE_COST_PS, 'sabotage');
                warState.capitalStatus.command = clampWarPercent(warState.capitalStatus.command - NATION_WAR_SABOTAGE_COMMAND_DAMAGE);
                if (warState.capitalCaptureState.status === 'capturing' && warState.capitalCaptureState.ownerCandidateNation === playerNation) {
                    warState.capitalCaptureState.progressBaseMs = Math.min(
                        warState.capitalCaptureState.baseDurationMs,
                        warState.capitalCaptureState.progressBaseMs + 12000
                    );
                }
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: 'capital_sabotage',
                    publicLevel: 'nation',
                    summary: `${getNationLabel(playerNation)}の工作隊が${getNationLabel(targetNationKey)}首都へ浸透`,
                    details: `指揮に ${NATION_WAR_SABOTAGE_COMMAND_DAMAGE} ダメージ`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
            } else if (normalizedAction === 'ship_attack' || normalizedAction === 'siege') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalAttackNotAllowed' });
                const previousWalls = clampWarPercent(warState.capitalStatus.walls);
                const damage = previousWalls <= CAPITAL_CAPTURE_BREACH_WALLS
                    ? NATION_WAR_SIEGE_WALL_DAMAGE
                    : NATION_WAR_SHIP_ATTACK_WALL_DAMAGE;
                warState.capitalStatus.walls = clampWarPercent(previousWalls - damage);
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                await appendNationWarEvent(firestore, admin, {
                    type: normalizedAction === 'siege' ? 'capital_siege' : 'capital_ship_attack',
                    publicLevel: 'global',
                    summary: `${getNationLabel(playerNation)}が${getNationLabel(targetNationKey)}首都へ${normalizedAction === 'siege' ? '攻城' : '艦砲射撃'}を敢行`,
                    details: `城壁に ${damage} ダメージ`,
                    participants: [playerNation, targetNationKey],
                    attackerNation: playerNation,
                    defenderNation: targetNationKey
                });
                if (previousWalls > CAPITAL_CAPTURE_BREACH_WALLS && warState.capitalStatus.walls <= CAPITAL_CAPTURE_BREACH_WALLS) {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_breach',
                        publicLevel: 'global',
                        summary: `${getNationLabel(targetNationKey)}の城壁が破られ、首都へ上陸可能になった`,
                        details: '前線プレイヤーは首都へ乗り込み、制圧を進められる。',
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                }
            } else if (normalizedAction === 'capture_start' || normalizedAction === 'capture_join' || normalizedAction === 'capture_leave' || normalizedAction === 'capture_complete') {
                if (isOwnNation) return res.status(403).json({ error: 'OwnCapitalCaptureNotAllowed' });
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                if (Math.max(0, Math.floor(Number(warState.capitalCaptureState.raidCooldownUntilMs) || 0)) > nowMs && normalizedAction !== 'capture_leave') {
                    return res.status(409).json({ error: 'CapitalRaidCooldownActive' });
                }
                if (warState.capitalCaptureState.raidUnlockedAtMs > 0 && normalizedAction !== 'capture_leave') {
                    return res.status(409).json({ error: 'CapitalAlreadyCaptured' });
                }
                if (clampWarPercent(warState.capitalStatus.walls) > CAPITAL_CAPTURE_BREACH_WALLS) {
                    return res.status(409).json({ error: 'CapitalNotBreached' });
                }
                const queue = Array.isArray(warState.capitalCaptureState.queue) ? warState.capitalCaptureState.queue : [];
                const currentIndex = queue.findIndex((entry) => entry.playFabId === requesterPlayFabId);
                if (normalizedAction === 'capture_leave') {
                    if (currentIndex >= 0) queue.splice(currentIndex, 1);
                } else if (normalizedAction === 'capture_complete') {
                    if (queue.length <= 0) return res.status(409).json({ error: 'CaptureNotStarted' });
                    const leader = queue[0];
                    if (!leader || leader.playFabId !== requesterPlayFabId) return res.status(403).json({ error: 'CaptureLeaderOnly' });
                    warState.capitalCaptureState = advanceNationWarCaptureState(warState.capitalCaptureState, nowMs);
                    if (warState.capitalCaptureState.progressBaseMs < warState.capitalCaptureState.baseDurationMs) {
                        return res.status(409).json({ error: 'CaptureNotReady' });
                    }
                    const participantIds = queue.map((entry) => String(entry.playFabId || '').trim()).filter(Boolean);
                    warState.capitalCaptureState.status = 'captured';
                    warState.capitalCaptureState.raidUnlockedAtMs = nowMs;
                    warState.capitalCaptureState.raidUnlockedByNation = playerNation;
                    warState.capitalCaptureState.lastCapturedByNation = playerNation;
                    warState.capitalCaptureState.lastCapturedAtMs = nowMs;
                    warState.capitalCaptureState.lastCaptureParticipantIds = Array.from(new Set(participantIds)).slice(0, 8);
                    warState.capitalCaptureState.progressBaseMs = warState.capitalCaptureState.baseDurationMs;
                    warState.capitalCaptureState.queue = [];
                    warState.capitalCaptureState.lastProgressAt = 0;
                    warState.capitalCaptureState.endsAt = 0;
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_capture_complete',
                        publicLevel: 'global',
                        summary: `${getNationLabel(targetNationKey)}の首都防衛が崩れ、国庫襲撃が可能になった`,
                        details: `${getNationLabel(playerNation)}の攻城隊が制圧を完了`,
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                } else {
                    if (currentIndex < 0) {
                        if (queue.length >= warState.capitalCaptureState.slotLimit) {
                            return res.status(409).json({ error: 'CaptureFull' });
                        }
                        const leadNation = String(queue[0]?.nation || '').toLowerCase();
                        if (leadNation && leadNation !== playerNation) {
                            return res.status(409).json({ error: 'CaptureOccupiedByEnemy' });
                        }
                        queue.push(buildCapitalCaptureQueueEntry(requesterPlayFabId, playerNation, nowMs));
                    }
                }
                warState.capitalCaptureState.queue = queue;
                warState.capitalCaptureState = refreshNationWarCaptureState(warState.capitalCaptureState, warState, nowMs);
                await saveNationWarState(targetNationKey, warState, firestore, admin);
                if (normalizedAction === 'capture_start' || normalizedAction === 'capture_join') {
                    await appendNationWarEvent(firestore, admin, {
                        type: 'capital_capture_start',
                        publicLevel: 'nation',
                        summary: `${getNationLabel(playerNation)}が${getNationLabel(targetNationKey)}首都へ上陸`,
                        details: `参加 ${warState.capitalCaptureState.queue.length}/${warState.capitalCaptureState.slotLimit}`,
                        participants: [playerNation, targetNationKey],
                        attackerNation: playerNation,
                        defenderNation: targetNationKey
                    });
                }
            } else {
                return res.status(400).json({ error: 'InvalidAction' });
            }

            warState = await resolveNationWarCaptureState(targetNationKey, warState, firestore, admin);
            const groupId = await getNationGroupIdByNation(targetNationKey, firestore, nationDeps);
            const treasuryPs = groupId ? await getGroupTreasuryBalance(groupId, nationDeps) : 0;
            res.json({
                success: true,
                capitalWar: buildCapitalWarStatePayload(targetNationKey, playerNation, warState, treasuryPs)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            console.error('[nation-war-capital-action] Error:', msg);
            res.status(500).json({ error: 'Failed to process capital action', details: String(msg) });
        }
    });

    app.post('/api/nation-war-deploy', async (req, res) => {
        const { playFabId, weaponId } = req.body || {};
        if (!playFabId || !weaponId) {
            return res.status(400).json({ error: 'playFabId and weaponId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const weapon = getNationWarWeaponDefinition(weaponId);
            if (!weapon || weapon.actionType !== 'deploy' || !canNationUseWeapon(context.nation, weaponId)) {
                return res.status(400).json({ error: 'InvalidWeapon' });
            }
            const nowMs = Date.now();
            let warState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const cooldownUntil = Math.max(0, Math.floor(Number(warState.cooldowns?.[weapon.id] || 0)));
            if (cooldownUntil > nowMs) {
                return res.status(409).json({ error: 'WeaponCooldown', remainingMs: cooldownUntil - nowMs });
            }
            const alreadyActive = getActiveNationWarSystems(warState, nowMs).some((system) => system.weaponId === weapon.id);
            if (alreadyActive) {
                return res.status(409).json({ error: 'AlreadyActive' });
            }
            const groupTreasury = await getGroupTreasuryBalance(context.groupId, nationDeps);
            if (groupTreasury < weapon.costPs) {
                return res.status(400).json({ error: 'InsufficientTreasury', treasuryPs: groupTreasury, costPs: weapon.costPs });
            }
            const spendResult = await subtractNationTreasury(context.nation, weapon.costPs, firestore, nationDeps, {
                idempotencyId: `nation-war-deploy:${context.nation}:${weapon.id}:${nowMs}`,
                source: 'war_deploy',
                label: `兵器配備: ${weapon.label}`,
                actorId: context.kingId
            });
            warState.activeSystems.push(buildNationWarSystemEntry(weapon, nowMs));
            warState.cooldowns[weapon.id] = nowMs + (Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)) * 1000);
            await saveNationWarState(context.nation, warState, firestore, admin);
            await appendNationWarEvent(firestore, admin, {
                type: 'system_deploy',
                publicLevel: 'nation',
                summary: `${getNationLabel(context.nation)}が${weapon.label}を配備`,
                details: weapon.description || '国家システムを配備した。',
                participants: [context.nation],
                attackerNation: context.nation,
                weaponId: weapon.id
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                treasuryPs: spendResult?.treasuryPs ?? null,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-deploy] Error:', msg);
            res.status(500).json({ error: 'Failed to deploy weapon', details: String(msg) });
        }
    });

    app.post('/api/nation-war-prepare-strike', async (req, res) => {
        const { playFabId, weaponId, targetNation, targetPart } = req.body || {};
        if (!playFabId || !weaponId || !targetNation) {
            return res.status(400).json({ error: 'playFabId, weaponId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const defenderNation = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[defenderNation] || defenderNation === context.nation) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const safeTargetPart = CAPITAL_PART_LABELS[String(targetPart || '').trim()] ? String(targetPart || '').trim() : 'walls';
            const weapon = getNationWarWeaponDefinition(weaponId);
            if (!weapon || weapon.actionType !== 'strike' || !canNationUseWeapon(context.nation, weaponId)) {
                return res.status(400).json({ error: 'InvalidWeapon' });
            }
            const nowMs = Date.now();
            let attackerState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            let defenderState = await resolveNationWarIncoming(defenderNation, await loadNationWarState(defenderNation, firestore, admin, nationDeps), firestore, admin);
            const cooldownUntil = Math.max(0, Math.floor(Number(attackerState.cooldowns?.[weapon.id] || 0)));
            if (cooldownUntil > nowMs) {
                return res.status(409).json({ error: 'WeaponCooldown', remainingMs: cooldownUntil - nowMs });
            }
            const groupTreasury = await getGroupTreasuryBalance(context.groupId, nationDeps);
            if (groupTreasury < weapon.costPs) {
                return res.status(400).json({ error: 'InsufficientTreasury', treasuryPs: groupTreasury, costPs: weapon.costPs });
            }
            const spendResult = await subtractNationTreasury(context.nation, weapon.costPs, firestore, nationDeps, {
                idempotencyId: `nation-war-strike:${context.nation}:${weapon.id}:${nowMs}`,
                source: 'war_strike',
                label: `攻撃準備: ${weapon.label}`,
                actorId: context.kingId
            });
            const attackBonus = buildNationWarAttackSnapshot(attackerState, nowMs);
            defenderState.incoming.push(buildNationWarStrikeEntry({
                attackerNation: context.nation,
                defenderNation,
                weapon,
                targetPart: safeTargetPart,
                attackBonus
            }, nowMs));
            attackerState.cooldowns[weapon.id] = nowMs + (Math.max(0, Math.floor(Number(weapon.cooldownSeconds) || 0)) * 1000);
            await saveNationWarState(context.nation, attackerState, firestore, admin);
            await saveNationWarState(defenderNation, defenderState, firestore, admin);
            await appendNationWarEvent(firestore, admin, {
                type: 'strike_prepare',
                publicLevel: 'global',
                summary: `${getNationLabel(context.nation)}が${weapon.label}の発射準備を開始`,
                details: `${getNationLabel(defenderNation)}の${CAPITAL_PART_LABELS[safeTargetPart] || '首都'}を狙っている。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation,
                weaponId: weapon.id
            });
            await appendNationWarEvent(firestore, admin, {
                type: 'incoming_alert',
                publicLevel: 'nation',
                summary: `${getNationLabel(defenderNation)}が飛来警報を受信`,
                details: `${Math.max(1, Math.ceil(Number(weapon.prepSeconds || 0) / 60))}分後に到達見込み。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation,
                weaponId: weapon.id
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                treasuryPs: spendResult?.treasuryPs ?? null,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-prepare-strike] Error:', msg);
            res.status(500).json({ error: 'Failed to prepare strike', details: String(msg) });
        }
    });

    app.post('/api/nation-war-intercept', async (req, res) => {
        const { playFabId, incomingId, action, interceptSystemId } = req.body || {};
        if (!playFabId || !incomingId || !action) {
            return res.status(400).json({ error: 'playFabId, incomingId and action are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const nowMs = Date.now();
            let warState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const incoming = warState.incoming.find((row) => row.id === String(incomingId));
            if (!incoming) {
                return res.status(404).json({ error: 'IncomingNotFound' });
            }
            if (incoming.launchAtMs <= nowMs) {
                return res.status(409).json({ error: 'IncomingAlreadyResolving' });
            }
            const normalizedAction = String(action || '').trim().toLowerCase();
            if (normalizedAction !== 'intercept' && normalizedAction !== 'skip') {
                return res.status(400).json({ error: 'InvalidAction' });
            }
            incoming.decision = normalizedAction;
            incoming.interceptSystemId = '';
            if (normalizedAction === 'intercept') {
                const system = getActiveNationWarSystems(warState, nowMs)
                    .find((row) => row.id === String(interceptSystemId || '').trim());
                if (!system) {
                    return res.status(400).json({ error: 'InterceptorNotFound' });
                }
                const weapon = getNationWarWeaponDefinition(system.weaponId);
                if (!weapon || weapon.role !== 'intercept' || system.ammoRemaining <= 0) {
                    return res.status(400).json({ error: 'InterceptorUnavailable' });
                }
                incoming.interceptSystemId = system.id;
            }
            await saveNationWarState(context.nation, warState, firestore, admin);
            const incomingWeapon = getNationWarWeaponDefinition(incoming.weaponId);
            await appendNationWarEvent(firestore, admin, {
                type: normalizedAction === 'intercept' ? 'intercept_order' : 'intercept_skip',
                publicLevel: 'nation',
                summary: normalizedAction === 'intercept'
                    ? `${getNationLabel(context.nation)}が${incomingWeapon?.label || '飛来物'}への迎撃を指示`
                    : `${getNationLabel(context.nation)}が${incomingWeapon?.label || '飛来物'}への迎撃を見送った`,
                details: normalizedAction === 'intercept'
                    ? `迎撃兵器: ${getNationWarWeaponDefinition(incoming.interceptSystemId ? (warState.activeSystems.find((row) => row.id === incoming.interceptSystemId)?.weaponId || '') : '')?.label || '未設定'}`
                    : '脅威判定を見送り、消耗を抑える。',
                participants: [context.nation, incoming.attackerNation],
                attackerNation: incoming.attackerNation,
                defenderNation: context.nation,
                weaponId: incoming.weaponId
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-intercept] Error:', msg);
            res.status(500).json({ error: 'Failed to update intercept order', details: String(msg) });
        }
    });

    app.post('/api/nation-war-raid-treasury', async (req, res) => {
        const { playFabId, targetNation } = req.body || {};
        if (!playFabId || !targetNation) {
            return res.status(400).json({ error: 'playFabId and targetNation are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const defenderNation = String(targetNation || '').trim().toLowerCase();
            if (!NATION_GROUP_BY_NATION[defenderNation] || defenderNation === context.nation) {
                return res.status(400).json({ error: 'InvalidTargetNation' });
            }
            const attackerState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            const defenderState = await resolveNationWarIncoming(defenderNation, await loadNationWarState(defenderNation, firestore, admin, nationDeps), firestore, admin);
            const defenderGroupId = await getNationGroupIdByNation(defenderNation, firestore, nationDeps);
            const defenderTreasuryPs = defenderGroupId ? await getGroupTreasuryBalance(defenderGroupId, nationDeps) : 0;
            const raidPlan = calculateNationWarRaidPlan(defenderState.capitalStatus, defenderTreasuryPs, defenderState.capitalCaptureState);
            if (!raidPlan.breachOpen) {
                return res.status(409).json({ error: 'CapitalNotBreached' });
            }
            if (raidPlan.expectedAmount <= 0) {
                return res.status(409).json({ error: 'NothingToRaid', treasuryPs: defenderTreasuryPs });
            }
            const raidAmount = raidPlan.expectedAmount;
            const raidId = `nation-war-raid:${context.nation}:${defenderNation}:${Date.now()}`;
            const raidParticipantIds = (
                defenderState.capitalCaptureState?.lastCapturedByNation === context.nation
                    ? defenderState.capitalCaptureState?.lastCaptureParticipantIds
                    : []
            );
            const participantIds = Array.isArray(raidParticipantIds)
                ? Array.from(new Set(raidParticipantIds.map((row) => String(row || '').trim()).filter(Boolean))).slice(0, 8)
                : [];
            const participantRewardPulls = raidAmount >= NATION_WAR_CARD_REWARD_HIGH_RAID_THRESHOLD ? 2 : 1;
            const participantRewards = [];
            const spendResult = await subtractNationTreasury(defenderNation, raidAmount, firestore, nationDeps, {
                idempotencyId: `${raidId}:out`,
                source: 'war_raid',
                label: `国庫襲撃: ${getNationLabel(context.nation)}`,
                actorId: context.kingId,
                note: `${getNationLabel(context.nation)}による襲撃`
            });
            await addNationTreasury(context.nation, raidAmount, firestore, nationDeps, {
                idempotencyId: `${raidId}:in`,
                source: 'war_raid',
                label: `国庫襲撃戦果: ${getNationLabel(defenderNation)}`,
                note: `${getNationLabel(defenderNation)}からの戦果`
            });
            for (const participantId of participantIds) {
                const grantedItemIds = [];
                for (let pullIndex = 0; pullIndex < participantRewardPulls; pullIndex += 1) {
                    const rewardItemId = pickRandomNationWarTarotCardId();
                    await addEconomyItem(participantId, rewardItemId, 1, {
                        idempotencyId: `${raidId}:card:${participantId}:${pullIndex + 1}:${rewardItemId}`
                    });
                    grantedItemIds.push(rewardItemId);
                }
                participantRewards.push({
                    playFabId: participantId,
                    itemIds: grantedItemIds
                });
            }
            const participantRewardCount = participantRewards.reduce(
                (sum, entry) => sum + (Array.isArray(entry?.itemIds) ? entry.itemIds.length : 0),
                0
            );
            defenderState.capitalStatus.walls = Math.max(
                clampWarPercent(defenderState.capitalStatus.walls),
                NATION_WAR_POST_RAID_WALLS
            );
            defenderState.capitalStatus.vault = clampWarPercent(defenderState.capitalStatus.vault - 12);
            defenderState.capitalStatus.command = clampWarPercent(defenderState.capitalStatus.command - 6);
            defenderState.capitalCaptureState.raidUnlockedAtMs = 0;
            defenderState.capitalCaptureState.raidUnlockedByNation = null;
            defenderState.capitalCaptureState.raidCooldownUntilMs = Date.now() + NATION_WAR_POST_RAID_COOLDOWN_MS;
            defenderState.capitalCaptureState.queue = [];
            defenderState.capitalCaptureState.progressBaseMs = 0;
            defenderState.capitalCaptureState.lastProgressAt = 0;
            defenderState.capitalCaptureState.endsAt = 0;
            defenderState.capitalCaptureState.ownerCandidateId = null;
            defenderState.capitalCaptureState.ownerCandidateNation = null;
            defenderState.capitalCaptureState.breachedAt = 0;
            defenderState.capitalCaptureState.lastCapturedByNation = null;
            defenderState.capitalCaptureState.lastCapturedAtMs = 0;
            defenderState.capitalCaptureState.lastCaptureParticipantIds = [];
            defenderState.capitalCaptureState = refreshNationWarCaptureState(defenderState.capitalCaptureState, defenderState, Date.now());
            await saveNationWarState(defenderNation, defenderState, firestore, admin);
            const rewardDetails = participantRewardCount > 0
                ? ` 制圧参加者 ${participantRewards.length} 名にタロットカード ${participantRewardCount} 枚を配布。`
                : '';
            await appendNationWarEvent(firestore, admin, {
                type: 'treasury_raid',
                publicLevel: 'global',
                summary: `${getNationLabel(context.nation)}が${getNationLabel(defenderNation)}の国庫を襲撃`,
                details: `${raidAmount.toLocaleString()}Gを奪取。${rewardDetails}城壁は ${NATION_WAR_POST_RAID_WALLS}% まで復旧し、再襲撃は ${Math.floor(NATION_WAR_POST_RAID_COOLDOWN_MS / 60000)} 分後まで不可。`,
                participants: [context.nation, defenderNation],
                attackerNation: context.nation,
                defenderNation
            });
            const resolvedState = await resolveNationWarIncoming(context.nation, await loadNationWarState(context.nation, firestore, admin, nationDeps), firestore, admin);
            res.json({
                success: true,
                raidAmount,
                defenderTreasuryPs: spendResult?.treasuryPs ?? null,
                participantRewardPulls,
                participantRewardCount,
                participantRewards,
                war: await buildNationWarPagePayload(context.nation, resolvedState, firestore, admin, nationDeps)
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[nation-war-raid-treasury] Error:', msg);
            res.status(500).json({ error: 'Failed to raid treasury', details: String(msg) });
        }
    });

    // 王の譲渡
    app.post('/api/king-transfer', async (req, res) => {
        const { playFabId, newKingPlayFabId } = req.body || {};
        if (!playFabId || !newKingPlayFabId) {
            return res.status(400).json({ error: 'playFabId and newKingPlayFabId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        const targetKingId = normalizePlayFabId(newKingPlayFabId);
        if (!targetKingId) {
            return res.status(400).json({ error: 'newKingPlayFabId is invalid' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            if (context.kingId === targetKingId) {
                return res.json({ success: true, newKingPlayFabId: targetKingId, alreadyKing: true });
            }

            const targetNation = await getNationForPlayer(targetKingId, { promisifyPlayFab, PlayFabServer });
            if (!targetNation || String(targetNation).toLowerCase() !== String(context.nation).toLowerCase()) {
                return res.status(403).json({ error: 'TargetNotInSameNation' });
            }

            const csResult = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: context.kingId,
                FunctionName: 'TransferNationKing',
                FunctionParameter: { newKingPlayFabId: targetKingId },
                GeneratePlayStreamEvent: false
            });
            if (csResult && csResult.Error) {
                const msg = csResult.Error.Message || csResult.Error.Error || 'CloudScript error';
                if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
                if (String(msg).includes('TargetNotInSameNation')) {
                    return res.status(403).json({ error: 'TargetNotInSameNation' });
                }
                return res.status(500).json({ error: 'Failed to transfer king', details: msg });
            }

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: context.kingId,
                Data: { IsKing: 'false', NationKingId: targetKingId }
            });
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: targetKingId,
                Data: { IsKing: 'true', NationKingId: targetKingId }
            });

            const starterCrownResult = await ensureKingStarterCrown(targetKingId, context.nation, {
                promisifyPlayFab,
                PlayFabServer,
                addEconomyItem
            });

            await getNationGroupDoc(firestore, context.mapping.groupName).set({
                kingPlayFabId: targetKingId,
                kingAssignedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            let guildId = null;
            try {
                const entity = await getPlayerEntity(context.kingId, { promisifyPlayFab, PlayFabServer });
                if (entity) {
                    const membership = await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.ListMembership, { Entity: entity });
                    const groups = membership?.Groups || [];
                    const guildGroup = groups.find((groupEntry) => {
                        const id = groupEntry?.Group?.Id || '';
                        return id && id !== context.groupId;
                    });
                    guildId = guildGroup?.Group?.Id || null;
                }
            } catch (error) {
                console.warn('[king-transfer] Failed to resolve guild membership:', error?.message || error);
            }

            let guildUpdate = { guildUpdated: false, shipUpdated: false };
            if (guildId) {
                guildUpdate = await updateGuildOwnerAndShipOwner(guildId, targetKingId, { promisifyPlayFab, firestore, admin });
            }

            return res.json({
                success: true,
                newKingPlayFabId: targetKingId,
                guildId: guildId,
                guildUpdated: guildUpdate.guildUpdated,
                guildShipUpdated: guildUpdate.shipUpdated,
                starterCrown: starterCrownResult
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) return res.status(403).json({ error: 'NotKing' });
            console.error('[king-transfer] Error:', msg);
            return res.status(500).json({ error: 'Failed to transfer king', details: msg });
        }
    });

    // TROY営業状態の変更
    app.post('/api/king-set-troy-open', async (req, res) => {
        const { playFabId, isOpen } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const nextOpen = !!isOpen;

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
            if (!nextOpen) {
                await roomRef.set({
                    isOpen: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedBy: null
                }, { merge: true });
                await deleteCollectionDocs(roomRef.collection('members'));
                await deleteCollectionDocs(roomRef.collection('checkouts'));
            } else {
                await roomRef.set({
                    isOpen: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedBy: context.kingId
                }, { merge: true });
            }
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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
            const memberId = normalizePlayFabId(requesterPlayFabId);
            let checkout = null;
            if (memberId) {
                const checkoutSnap = await roomRef.collection('checkouts').doc(memberId).get();
                if (checkoutSnap.exists) {
                    const checkoutPayload = buildTroyCheckoutPayload(checkoutSnap);
                    if (checkoutPayload && (checkoutPayload.status === 'open' || checkoutPayload.status === 'pending')) {
                        checkout = {
                            status: checkoutPayload.status,
                            total: checkoutPayload.total,
                            totalItems: checkoutPayload.totalItems,
                            grantTotal: checkoutPayload.grantTotal,
                            items: checkoutPayload.items,
                            createdAt: checkoutPayload.createdAtMs || null,
                            updatedAt: checkoutPayload.updatedAtMs || null,
                            lastOrderedAt: checkoutPayload.lastOrderedAtMs || null
                        };
                    }
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.data() || {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(requesterPlayFabId);
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
                || await getPlayerDisplayName(requesterPlayFabId, { promisifyPlayFab, PlayFabServer })
                || requesterPlayFabId;

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
        const { playFabId, itemName, price, quantity, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!itemName) return res.status(400).json({ error: 'itemName is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.data() || {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }
            const memberId = normalizePlayFabId(requesterPlayFabId);
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
                || await getPlayerDisplayName(requesterPlayFabId, { promisifyPlayFab, PlayFabServer })
                || requesterPlayFabId;
            const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
            const priceValue = Math.max(0, Math.floor(Number(price) || 0));
            const orderAmount = Math.max(0, priceValue * safeQty);
            if (!orderAmount) {
                return res.status(400).json({ error: 'InvalidOrderAmount' });
            }
            const priceLabel = Number.isFinite(priceValue) ? `¥${priceValue.toLocaleString('ja-JP')}` : '不明';
            const orderLine = `${String(itemName)}${safeQty > 1 ? ` x${safeQty}` : ''}`;

            let grantAmount = 0;
            let cashbackRateBps = getTreasuryCashbackRateBpsByRank(2);
            let treasuryRank = 2;
            let grantApplied = false;
            let grantError = null;
            let receiverBalance = null;
            const orderedAtMs = Date.now();
            const orderId = `troy:${memberId}:${orderedAtMs}:${Math.random().toString(36).slice(2, 8)}`;

            try {
                const cashbackInfo = await getNationTreasuryCashbackInfo(nation, firestore, nationDeps);
                cashbackRateBps = cashbackInfo.rateBps;
                treasuryRank = cashbackInfo.rank;
                grantAmount = Math.floor(orderAmount * (cashbackRateBps / 10000));
                if (grantAmount > 0) {
                    await addEconomyItem(requesterPlayFabId, 'PS', grantAmount, { idempotencyId: `${orderId}:ps-grant` });
                    grantApplied = true;
                    if (getCurrencyBalance) {
                        receiverBalance = await getCurrencyBalance(requesterPlayFabId, 'PS');
                        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                            PlayFabId: requesterPlayFabId,
                            Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                        });
                    }
                }
            } catch (error) {
                grantError = error?.errorMessage || error?.message || String(error);
                console.warn('[troy-order] Grant failed:', grantError);
            }

            const checkoutRef = roomRef.collection('checkouts').doc(memberId);
            const checkoutSnap = await checkoutRef.get();
            const checkoutData = checkoutSnap.exists ? (checkoutSnap.data() || {}) : {};
            const checkoutStatus = String(checkoutData.status || '').trim().toLowerCase();
            if (checkoutSnap.exists && checkoutStatus && checkoutStatus !== 'open') {
                return res.status(409).json({ error: 'CheckoutPending' });
            }

            const existingItems = checkoutStatus === 'open' && Array.isArray(checkoutData.items) ? checkoutData.items : [];
            const storedGrantAmount = grantApplied ? grantAmount : 0;
            const nextItem = buildStoredTroyCheckoutItem({
                name: String(itemName || '').trim(),
                price: priceValue,
                quantity: safeQty,
                grantedPs: storedGrantAmount,
                cashbackRateBps,
                orderId,
                orderedAtMs,
                undoUntilMs: orderedAtMs + TROY_LAST_ORDER_UNDO_WINDOW_MS
            });
            const nextItems = existingItems.concat(nextItem ? [nextItem] : []);
            const nextNormalizedItems = normalizeTroyCheckoutItems(nextItems);
            const nextTotal = nextNormalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
            const nextTotalItems = nextNormalizedItems.reduce((sum, item) => sum + item.quantity, 0);
            const nextGrantTotal = Math.max(0, Math.floor(Number(checkoutData.grantTotal) || 0)) + storedGrantAmount;
            const nowTs = admin.firestore.FieldValue.serverTimestamp();
            const updatePayload = {
                playFabId: memberId,
                displayName: buyerName,
                status: 'open',
                items: nextItems,
                total: nextTotal,
                totalItems: nextTotalItems,
                grantTotal: nextGrantTotal,
                updatedAt: nowTs,
                lastOrderedAt: nowTs
            };
            if (!(checkoutSnap.exists && checkoutStatus === 'open')) {
                updatePayload.createdAt = nowTs;
            }
            await checkoutRef.set(updatePayload, { merge: true });

            const message = [
                '【TROY注文】',
                `注文者: ${buyerName}`,
                `内容: ${orderLine}`,
                `金額: ${priceLabel}`,
                `今回付与: ${grantAmount.toLocaleString('ja-JP')}G`,
                `未会計合計: ¥${nextTotal.toLocaleString('ja-JP')}`
            ].join('\n');

            try {
                await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
            } catch (lineError) {
                console.warn('[troy-order] Line notify failed:', lineError?.message || lineError);
            }

            pushDisplayEvent({
                type: orderAmount > 0 ? 'boom' : 'splash',
                label: `注文: ${buyerName} ${orderLine}`
            });
            res.json({
                success: true,
                orderAmount,
                grantAmount,
                cashbackRateBps,
                treasuryRank,
                grantApplied,
                grantError,
                receiverBalance: Number.isFinite(receiverBalance) ? receiverBalance : undefined,
                checkout: {
                    status: 'open',
                    total: nextTotal,
                    totalItems: nextTotalItems,
                    grantTotal: nextGrantTotal,
                    items: nextNormalizedItems
                }
            });
        } catch (error) {
            console.error('[troy-order] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to send order' });
        }
    });

    app.post('/api/troy-undo-last-order', async (req, res) => {
        const { playFabId } = req.body || {};
        const requestId = String(req.body?.requestId || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const { lineClient } = deps;
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const memberSnap = await roomRef.collection('members').doc(memberId).get();
            if (!memberSnap.exists) {
                return res.status(403).json({ error: 'NotInTroy' });
            }

            const checkoutRef = roomRef.collection('checkouts').doc(memberId);
            const checkoutSnap = await checkoutRef.get();
            if (!checkoutSnap.exists) {
                return res.status(404).json({ error: 'CheckoutNotFound' });
            }

            const checkoutPayload = buildTroyCheckoutPayload(checkoutSnap);
            if (!checkoutPayload || checkoutPayload.status !== 'open') {
                return res.status(409).json({ error: 'UndoNotAllowed' });
            }

            const lastItem = Array.isArray(checkoutPayload.items) ? checkoutPayload.items[checkoutPayload.items.length - 1] : null;
            if (!lastItem) {
                return res.status(404).json({ error: 'LastOrderNotFound' });
            }
            if (!lastItem.orderId || !lastItem.undoUntilMs) {
                return res.status(409).json({ error: 'UndoExpired' });
            }
            if (isTroyUndoProtectedItem(lastItem)) {
                return res.status(409).json({ error: 'LastOrderNotUndoable', details: '入店チャージは取り消せません。' });
            }
            if (Date.now() > lastItem.undoUntilMs) {
                return res.status(409).json({ error: 'UndoExpired' });
            }

            const undoBaseId = requestId || `troy-undo:${memberId}:${lastItem.orderId}`;
            let psReverted = false;
            if (lastItem.grantedPs > 0) {
                try {
                    await subtractEconomyItem(memberId, 'PS', lastItem.grantedPs, {
                        idempotencyId: `${undoBaseId}:ps-revert`
                    });
                    psReverted = true;
                } catch (subtractError) {
                    const subtractMessage = subtractError?.errorMessage || subtractError?.message || String(subtractError);
                    if (
                        subtractError?.apiErrorInfo?.apiError === 'InsufficientFunds'
                        || String(subtractMessage).includes('InsufficientFunds')
                    ) {
                        return res.status(409).json({ error: 'GrantedPsAlreadyUsed', details: '付与済みゴールドを消費しているため取り消せません。' });
                    }
                    return res.status(500).json({ error: 'FailedToRevertPs', details: subtractMessage });
                }
            }

            let nextCheckout = null;
            try {
                await firestore.runTransaction(async (tx) => {
                    const freshSnap = await tx.get(checkoutRef);
                    if (!freshSnap.exists) {
                        throw new Error('UndoCheckoutMissing');
                    }
                    const freshCheckout = buildTroyCheckoutPayload(freshSnap);
                    if (!freshCheckout || freshCheckout.status !== 'open') {
                        throw new Error('UndoCheckoutChanged');
                    }
                    const freshItems = Array.isArray(freshCheckout.items) ? freshCheckout.items : [];
                    const freshLastItem = freshItems[freshItems.length - 1] || null;
                    if (!freshLastItem || freshLastItem.orderId !== lastItem.orderId) {
                        throw new Error('UndoCheckoutChanged');
                    }
                    if (Date.now() > Math.max(0, Number(freshLastItem.undoUntilMs) || 0)) {
                        throw new Error('UndoExpired');
                    }
                    if (isTroyUndoProtectedItem(freshLastItem)) {
                        throw new Error('UndoProtected');
                    }

                    const remainingStoredItems = freshItems
                        .slice(0, -1)
                        .map((item) => buildStoredTroyCheckoutItem(item))
                        .filter(Boolean);
                    const remainingItems = normalizeTroyCheckoutItems(remainingStoredItems);
                    const nextTotal = remainingItems.reduce((sum, item) => sum + item.lineTotal, 0);
                    const nextTotalItems = remainingItems.reduce((sum, item) => sum + item.quantity, 0);
                    const nextGrantTotal = remainingItems.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
                    const nowTs = admin.firestore.FieldValue.serverTimestamp();

                    if (!remainingItems.length) {
                        tx.delete(checkoutRef);
                        nextCheckout = null;
                        return;
                    }

                    const lastRemainingItem = remainingItems[remainingItems.length - 1] || null;
                    tx.set(checkoutRef, {
                        items: remainingStoredItems,
                        total: nextTotal,
                        totalItems: nextTotalItems,
                        grantTotal: nextGrantTotal,
                        status: 'open',
                        updatedAt: nowTs,
                        lastOrderedAt: lastRemainingItem?.orderedAtMs
                            ? admin.firestore.Timestamp.fromMillis(lastRemainingItem.orderedAtMs)
                            : nowTs
                    }, { merge: true });

                    nextCheckout = {
                        status: 'open',
                        total: nextTotal,
                        totalItems: nextTotalItems,
                        grantTotal: nextGrantTotal,
                        items: remainingItems
                    };
                });
            } catch (transactionError) {
                if (psReverted && lastItem.grantedPs > 0) {
                    try {
                        await addEconomyItem(memberId, 'PS', lastItem.grantedPs, {
                            idempotencyId: `${undoBaseId}:ps-restore`
                        });
                    } catch (restoreError) {
                        console.error('[troy-undo-last-order] Compensation failed:', restoreError?.errorMessage || restoreError?.message || restoreError);
                        return res.status(500).json({ error: 'UndoCompensationFailed' });
                    }
                }

                const transactionMessage = transactionError?.message || String(transactionError);
                if (transactionMessage === 'UndoExpired') {
                    return res.status(409).json({ error: 'UndoExpired' });
                }
                if (transactionMessage === 'UndoProtected') {
                    return res.status(409).json({ error: 'LastOrderNotUndoable', details: '入店チャージは取り消せません。' });
                }
                if (transactionMessage === 'UndoCheckoutMissing' || transactionMessage === 'UndoCheckoutChanged') {
                    return res.status(409).json({ error: 'CheckoutChanged' });
                }
                throw transactionError;
            }

            let receiverBalance = null;
            if (psReverted && getCurrencyBalance) {
                try {
                    receiverBalance = await getCurrencyBalance(memberId, 'PS');
                    await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                        PlayFabId: memberId,
                        Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                    });
                } catch (balanceError) {
                    console.warn('[troy-undo-last-order] Balance sync failed:', balanceError?.errorMessage || balanceError?.message || balanceError);
                }
            }

            const buyerName = String(checkoutPayload.displayName || memberSnap.data()?.displayName || memberId).trim() || memberId;
            const lineTotal = Math.max(0, Number(lastItem.lineTotal) || ((Number(lastItem.price) || 0) * (Number(lastItem.quantity) || 1)));
            const remainingTotal = Math.max(0, Number(nextCheckout?.total) || 0);
            const remainingItems = Math.max(0, Number(nextCheckout?.totalItems) || 0);
            const orderLine = `${String(lastItem.name || '注文')}${Number(lastItem.quantity) > 1 ? ` x${Math.max(1, Math.floor(Number(lastItem.quantity) || 1))}` : ''}`;
            const kingPlayFabId = String(roomSnap.data()?.updatedBy || '').trim();
            if (lineClient && kingPlayFabId) {
                try {
                    const kingLineUserId = await getLineUserId(kingPlayFabId, { promisifyPlayFab, PlayFabServer });
                    if (kingLineUserId) {
                        const message = [
                            '【TROY取消】',
                            `注文者: ${buyerName}`,
                            `取消内容: ${orderLine}`,
                            `取消金額: ¥${lineTotal.toLocaleString('ja-JP')}`,
                            lastItem.grantedPs > 0 ? `戻しゴールド: ${Math.max(0, Math.floor(Number(lastItem.grantedPs) || 0)).toLocaleString('ja-JP')}G` : null,
                            remainingTotal > 0
                                ? `未会計合計: ¥${remainingTotal.toLocaleString('ja-JP')} (${remainingItems}点)`
                                : '未会計合計: なし'
                        ].filter(Boolean).join('\n');
                        await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
                    }
                } catch (lineError) {
                    console.warn('[troy-undo-last-order] Line notify failed:', lineError?.message || lineError);
                }
            }

            pushDisplayEvent({
                type: 'splash',
                label: `取消: ${buyerName} ${orderLine}`
            });

            res.json({
                success: true,
                undoneItem: lastItem,
                checkout: nextCheckout,
                receiverBalance: Number.isFinite(receiverBalance) ? receiverBalance : undefined
            });
        } catch (error) {
            console.error('[troy-undo-last-order] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to undo last order' });
        }
    });

    // TROY入店
    app.post('/api/troy-join', async (req, res) => {
        const { playFabId, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const { lineClient } = deps;
            const requestedNation = String(req.body?.troyNation || req.body?.entryNation || '').trim().toLowerCase();
            const nation = requestedNation && getNationMappingByNation(requestedNation)
                ? requestedNation
                : await findOpenTroyNation(firestore);
            if (!nation) return res.status(403).json({ error: 'TroyClosed' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            const roomData = roomSnap.exists ? (roomSnap.data() || {}) : {};
            if (!roomSnap.exists || !roomData.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const name = String(displayName || '').trim().slice(0, 40) || memberId;
            const memberRef = roomRef.collection('members').doc(memberId);
            const existingMemberSnap = await memberRef.get();
            const checkoutRef = roomRef.collection('checkouts').doc(memberId);
            const checkoutSnap = await checkoutRef.get();
            const checkoutData = checkoutSnap.exists ? (checkoutSnap.data() || {}) : {};
            const checkoutStatus = String(checkoutData.status || '').trim().toLowerCase();
            let entryChargeCreated = false;
            let entryChargeGrantAmount = 0;
            let entryChargeGrantError = null;
            let checkoutPayload = checkoutSnap.exists ? buildTroyCheckoutPayload(checkoutSnap) : null;

            if (!existingMemberSnap.exists && checkoutStatus && checkoutStatus !== 'open') {
                return res.status(409).json({ error: 'CheckoutPending' });
            }

            if (!existingMemberSnap.exists) {
                const existingItems = checkoutStatus === 'open' && Array.isArray(checkoutData.items) ? checkoutData.items : [];
                const hasEntryCharge = normalizeTroyCheckoutItems(existingItems).some((item) => isTroyUndoProtectedItem(item));
                if (!hasEntryCharge) {
                    const orderedAtMs = Date.now();
                    const orderId = `troy-entry:${memberId}:${orderedAtMs}`;
                    const entryItem = buildStoredTroyCheckoutItem({
                        name: '入店チャージ',
                        price: 500,
                        quantity: 1,
                        grantedPs: 0,
                        cashbackRateBps: 0,
                        orderId,
                        orderedAtMs,
                        undoUntilMs: 0
                    });
                    const nextStoredItems = existingItems.concat(entryItem ? [entryItem] : []);
                    const nextItems = normalizeTroyCheckoutItems(nextStoredItems);
                    const nextTotal = nextItems.reduce((sum, item) => sum + item.lineTotal, 0);
                    const nextTotalItems = nextItems.reduce((sum, item) => sum + item.quantity, 0);
                    const nextGrantTotal = nextItems.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
                    const nowTs = admin.firestore.FieldValue.serverTimestamp();
                    const checkoutUpdate = {
                        playFabId: memberId,
                        displayName: name,
                        status: 'open',
                        items: nextStoredItems,
                        total: nextTotal,
                        totalItems: nextTotalItems,
                        grantTotal: nextGrantTotal,
                        updatedAt: nowTs,
                        lastOrderedAt: admin.firestore.Timestamp.fromMillis(orderedAtMs)
                    };
                    if (!(checkoutSnap.exists && checkoutStatus === 'open')) {
                        checkoutUpdate.createdAt = nowTs;
                    }
                    await checkoutRef.set(checkoutUpdate, { merge: true });
                    entryChargeCreated = true;
                    checkoutPayload = {
                        status: 'open',
                        total: nextTotal,
                        totalItems: nextTotalItems,
                        grantTotal: nextGrantTotal,
                        items: nextItems
                    };

                    try {
                        const cashbackInfo = await getNationTreasuryCashbackInfo(nation, firestore, nationDeps);
                        const cashbackRateBps = Math.max(0, Math.floor(Number(cashbackInfo?.rateBps) || 0));
                        const grantAmount = Math.floor(500 * (cashbackRateBps / 10000));
                        if (grantAmount > 0) {
                            await addEconomyItem(memberId, 'PS', grantAmount, { idempotencyId: `${orderId}:ps-grant` });
                            entryChargeGrantAmount = grantAmount;
                            if (getCurrencyBalance) {
                                const receiverBalance = await getCurrencyBalance(memberId, 'PS');
                                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                                    PlayFabId: memberId,
                                    Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                                });
                            }

                            const grantedStoredItems = nextStoredItems.map((item) => (
                                String(item?.orderId || '') === orderId
                                    ? { ...item, grantedPs: grantAmount, cashbackRateBps }
                                    : item
                            ));
                            const grantedItems = normalizeTroyCheckoutItems(grantedStoredItems);
                            const grantedTotal = grantedItems.reduce((sum, item) => sum + item.lineTotal, 0);
                            const grantedTotalItems = grantedItems.reduce((sum, item) => sum + item.quantity, 0);
                            const grantedGrantTotal = grantedItems.reduce((sum, item) => sum + Math.max(0, Number(item.grantedPs) || 0), 0);
                            await checkoutRef.set({
                                items: grantedStoredItems,
                                total: grantedTotal,
                                totalItems: grantedTotalItems,
                                grantTotal: grantedGrantTotal,
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                            checkoutPayload = {
                                status: 'open',
                                total: grantedTotal,
                                totalItems: grantedTotalItems,
                                grantTotal: grantedGrantTotal,
                                items: grantedItems
                            };
                        }
                    } catch (grantError) {
                        entryChargeGrantError = grantError?.errorMessage || grantError?.message || String(grantError);
                        console.warn('[troy-join] Entry charge grant failed:', entryChargeGrantError);
                    }
                }
            }

            await roomRef.collection('members').doc(memberId).set({
                playFabId: memberId,
                displayName: name,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const kingPlayFabId = String(roomData.updatedBy || '').trim();
            if (entryChargeCreated && lineClient && kingPlayFabId) {
                try {
                    const kingLineUserId = await getLineUserId(kingPlayFabId, { promisifyPlayFab, PlayFabServer });
                    if (kingLineUserId) {
                        const message = [
                            '【TROY入店】',
                            `入店者: ${name}`,
                            '内容: 入店チャージ',
                            '金額: ¥500',
                            `今回付与: ${entryChargeGrantAmount.toLocaleString('ja-JP')}G`,
                            `未会計合計: ¥${Math.max(0, Number(checkoutPayload?.total) || 500).toLocaleString('ja-JP')}`
                        ].join('\n');
                        await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
                    }
                } catch (lineError) {
                    console.warn('[troy-join] Line notify failed:', lineError?.message || lineError);
                }
            }

            pushDisplayEvent({
                type: 'flare',
                label: `入店: ${name}`
            });
            res.json({
                success: true,
                nation,
                entryChargeCreated,
                entryChargeGrantAmount,
                entryChargeGrantError,
                checkout: checkoutPayload
            });
        } catch (error) {
            console.error('[troy-join] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to join troy' });
        }
    });

    // TROY退店
    app.post('/api/troy-leave', async (req, res) => {
        const { playFabId } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await resolveTroyNationForRequest(req, requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.json({ success: true });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.json({ success: true });

            const memberId = normalizePlayFabId(requesterPlayFabId);
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(requesterPlayFabId);
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
                        playFabId: data.playFabId || '',
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(403).json({ error: 'NotInNation' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(403).json({ error: 'NotInNation' });

            const memberId = normalizePlayFabId(requesterPlayFabId);
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

    app.post('/api/king-grant-ps', async (req, res) => {
        const { playFabId, receiverPlayFabId, amount } = req.body || {};
        const requestId = String(req.body?.requestId || '').trim();
        if (!playFabId || !receiverPlayFabId) {
            return res.status(400).json({ error: 'playFabId and receiverPlayFabId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }
        if (playFabId === receiverPlayFabId) {
            return res.status(400).json({ error: 'Cannot grant to self' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });
            const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
            const cashbackRateBps = cashbackInfo.rateBps;
            const treasuryRank = cashbackInfo.rank;
            const grantAmount = Math.floor(value * (cashbackRateBps / 10000));
            if (grantAmount <= 0) {
                const minReceived = Math.ceil(10000 / cashbackRateBps);
                return res.status(400).json({
                    error: 'Grant amount is zero',
                    details: `received=${value}, cashbackRateBps=${cashbackRateBps}, minReceived=${minReceived}`
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
                return res.status(500).json({ error: 'Failed to add gold', details: addError?.errorMessage || addError?.message });
            }

            let treasuryUpdated = true;
            let treasuryErrorMessage = '';
            try {
                await addNationTreasury(context.nation, value, firestore, nationDeps, {
                    idempotencyId: idempotencyFor('treasury'),
                    contributorPlayFabId: receiverId,
                    source: 'king_grant_receipt',
                    label: '王の受領'
                });
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
                            cashbackRateBps,
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
                cashbackRateBps,
                treasuryRank,
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
            res.status(500).json({ error: 'Failed to grant gold', details: msg });
        }
    });

    app.post('/api/king-settle-troy-checkout', async (req, res) => {
        const { playFabId, receiverPlayFabId, expectedTotal } = req.body || {};
        const requestId = String(req.body?.requestId || '').trim();
        if (!playFabId || !receiverPlayFabId) {
            return res.status(400).json({ error: 'playFabId and receiverPlayFabId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
            const receiverId = normalizePlayFabId(receiverPlayFabId);
            if (!receiverId) return res.status(400).json({ error: 'Invalid receiver PlayFab ID' });

            const roomRef = getTroyRoomDoc(firestore, context.mapping.groupName);
            const checkoutRef = roomRef.collection('checkouts').doc(receiverId);
            const checkoutSnap = await checkoutRef.get();
            if (!checkoutSnap.exists) {
                return res.status(404).json({ error: 'CheckoutNotFound' });
            }

            const checkoutPayload = buildTroyCheckoutPayload(checkoutSnap);
            if (!checkoutPayload || checkoutPayload.total <= 0) {
                return res.status(400).json({ error: 'InvalidCheckout' });
            }
            if (!['open', 'pending'].includes(checkoutPayload.status)) {
                return res.status(409).json({ error: 'CheckoutAlreadyClosed' });
            }

            const expected = Math.max(0, Math.floor(Number(expectedTotal) || 0));
            if (expected > 0 && checkoutPayload.total !== expected) {
                return res.status(409).json({
                    error: 'CheckoutChanged',
                    currentTotal: checkoutPayload.total
                });
            }
            const coinDepositAmount = Math.min(1000000, Math.max(0, Math.floor(Number(req.body?.coinDepositAmount) || 0)));

            const settleBaseId = requestId
                || `troy-settle:${receiverId}:${checkoutPayload.createdAtMs || checkoutPayload.updatedAtMs || 0}:${checkoutPayload.total}`;
            const idempotencyFor = (suffix) => `${settleBaseId}:${suffix}`;
            const checkoutStableId = `${receiverId}:${checkoutPayload.createdAtMs || checkoutPayload.updatedAtMs || 0}:${checkoutPayload.total}`;

            let grantAmount = 0;
            let cashbackRateBps = 0;
            let treasuryRank = null;
            let grantApplied = false;
            let grantError = null;

            if (checkoutPayload.status === 'pending') {
                try {
                    const cashbackInfo = await getNationTreasuryCashbackInfo(context.nation, firestore, nationDeps);
                    cashbackRateBps = cashbackInfo.rateBps;
                    treasuryRank = cashbackInfo.rank;
                    grantAmount = Math.floor(checkoutPayload.total * (cashbackRateBps / 10000));
                    if (grantAmount > 0) {
                        await addEconomyItem(receiverId, 'PS', grantAmount, { idempotencyId: idempotencyFor('ps-grant') });
                        grantApplied = true;
                        if (getCurrencyBalance) {
                            const receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                                PlayFabId: receiverId,
                                Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                            });
                        }
                    }
                } catch (grantIssue) {
                    grantError = grantIssue?.errorMessage || grantIssue?.message || String(grantIssue);
                    console.warn('[king-settle-troy-checkout] Legacy grant failed:', grantError);
                    return res.status(500).json({ error: 'FailedToGrantPs', details: grantError });
                }
            }

            let coinDepositApplied = false;
            let coinDepositError = null;
            if (coinDepositAmount > 0) {
                try {
                    await addEconomyItem(receiverId, 'PS', coinDepositAmount, { idempotencyId: `troy-coin-deposit:${checkoutStableId}:${coinDepositAmount}` });
                    coinDepositApplied = true;
                    if (getCurrencyBalance) {
                        const receiverBalance = await getCurrencyBalance(receiverId, 'PS');
                        await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                            PlayFabId: receiverId,
                            Statistics: [{ StatisticName: process.env.LEADERBOARD_NAME || 'ps_ranking', Value: receiverBalance }]
                        });
                    }
                } catch (coinIssue) {
                    coinDepositError = coinIssue?.errorMessage || coinIssue?.message || String(coinIssue);
                    console.warn('[king-settle-troy-checkout] Coin deposit failed:', coinDepositError);
                    return res.status(500).json({ error: 'FailedToDepositCoin', details: coinDepositError });
                }
            }

            let treasuryUpdated = true;
            let treasuryErrorMessage = '';
            let treasuryPs = null;
            try {
                const treasuryResult = await addNationTreasury(context.nation, checkoutPayload.total, firestore, nationDeps, {
                    idempotencyId: idempotencyFor('treasury'),
                    contributorPlayFabId: receiverId,
                    contributorName: checkoutPayload.displayName,
                    source: 'troy_settlement',
                    label: 'TROY会計',
                    note: checkoutPayload.summary || `${checkoutPayload.totalItems}点`
                });
                treasuryPs = treasuryResult?.treasuryPs ?? null;
            } catch (treasuryError) {
                treasuryUpdated = false;
                treasuryErrorMessage = treasuryError?.errorMessage || treasuryError?.message || String(treasuryError);
                console.warn('[king-settle-troy-checkout] Treasury failed:', treasuryErrorMessage);
                return res.status(500).json({ error: 'FailedToUpdateTreasury', details: treasuryErrorMessage });
            }

            let troyTodaySales = null;
            try {
                troyTodaySales = await addTroyDailySales(context.nation, checkoutPayload.total, firestore, admin);
            } catch (salesError) {
                console.warn('[king-settle-troy-checkout] Daily sales update failed:', salesError?.message || salesError);
            }

            try {
                await checkoutRef.delete();
            } catch (deleteError) {
                const msg = deleteError?.errorMessage || deleteError?.message || String(deleteError);
                console.warn('[king-settle-troy-checkout] Checkout delete failed:', msg);
                return res.status(500).json({ error: 'FailedToCloseCheckout', details: msg });
            }

            try {
                await roomRef.collection('members').doc(receiverId).delete();
            } catch (memberDeleteError) {
                console.warn('[king-settle-troy-checkout] Member delete failed:', memberDeleteError?.message || memberDeleteError);
            }

            pushDisplayEvent({
                type: 'flare',
                label: `会計済: ${checkoutPayload.displayName}${coinDepositAmount > 0 ? ` / 預かり ${coinDepositAmount}G` : ''}`
            });

            res.json({
                success: true,
                receivedAmount: checkoutPayload.total,
                totalItems: checkoutPayload.totalItems,
                grantAmount,
                cashbackRateBps,
                treasuryRank,
                treasuryUpdated,
                treasuryError: treasuryUpdated ? undefined : treasuryErrorMessage,
                treasuryPs,
                grantApplied,
                grantError,
                coinDepositAmount,
                coinDepositApplied,
                coinDepositError,
                settledStatus: checkoutPayload.status,
                troyTodaySales
            });
        } catch (error) {
            const msg = error?.errorMessage || error?.message || error;
            if (String(msg).includes('NotKing')) {
                return res.status(403).json({ error: 'NotKing' });
            }
            console.error('[king-settle-troy-checkout] Error:', msg);
            res.status(500).json({ error: 'Failed to settle checkout', details: msg });
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const kingCheck = await promisifyPlayFab(PlayFabServer.ExecuteCloudScript, {
                PlayFabId: requesterPlayFabId,
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
                PlayFabId: requesterPlayFabId,
                Keys: ['Nation', 'Race']
            });
            const kingNation = String(kingRo?.Data?.Nation?.Value || '').toLowerCase();
            if (!kingNation) return res.status(400).json({ error: 'King nation not set' });
            const nationMapping = getNationMappingByNation(kingNation);
            if (!nationMapping) return res.status(400).json({ error: 'Invalid king nation' });
            const groupInfo = await ensureNationGroupExists(firestore, nationMapping, nationDeps);
            const kingNationGroupId = groupInfo.groupId;
            const targetNationIsland = nationMapping.island;

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
                        await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.RemoveMembers, {
                            Group: { Id: prevGroup.groupId, Type: 'group' },
                            Members: [playerEntity]
                        });
                    } catch (e) {
                        console.warn('[king-exile] RemoveMembers failed:', e?.errorMessage || e?.message || e);
                    }
                }
            }

            try {
                await callTitleScopedApi(promisifyPlayFab, PlayFabGroups.AddMembers, {
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
                    AvatarColor: avatarColor || 'brown',
                    NationChangedAt: String(Date.now())
                }
            });
            await ensureNationDisplayName(targetPlayFabId, targetNationIsland || kingNation || null, {
                promisifyPlayFab,
                PlayFabServer,
                PlayFabAdmin
            });

            const transferResult = await transferOwnedIslands(firestore, targetPlayFabId, requesterPlayFabId, targetNationIsland || kingNation || null);
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const value = Math.floor(Number(amount) || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) {
                return res.status(400).json({ error: 'Nation not set' });
            }
            const mapping = getNationMappingByNation(nation);
            if (!mapping) {
                return res.status(400).json({ error: 'Invalid nation' });
            }

            await subtractEconomyItem(requesterPlayFabId, String(currency).toUpperCase(), value);

            const normalizedCurrency = String(currency).toUpperCase();
            const groupEntity = await getNationGroupEntityKey(nation, firestore, nationDeps);
            if (!groupEntity) {
                return res.status(500).json({ error: 'Nation group not found' });
            }
            await addEconomyItem(groupEntity.Id, normalizedCurrency, value, groupEntity);
            const contribution = await addPlayerNationContribution(requesterPlayFabId, value, nationDeps);
            try {
                await appendNationTreasuryRecentEntry(nation, firestore, admin, {
                    amount: value,
                    currency: normalizedCurrency,
                    source: 'nation_donation',
                    label: '国庫寄付',
                    actorId: requesterPlayFabId
                });
            } catch (ledgerError) {
                console.warn('[donate-nation-currency] Failed to append treasury entry:', ledgerError?.message || ledgerError);
            }

            res.json({
                success: true,
                contribution: contribution?.contributionTotal ?? value,
                level: contribution?.level ?? 1
            });
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

    // マップ占領状態一括取得
    app.post('/api/get-map-occupation-map', async (req, res) => {
        const { mapIds } = req.body || {};
        try {
            const map = await getMapOccupationMap({ promisifyPlayFab, PlayFabAdmin });
            if (Array.isArray(mapIds) && mapIds.length) {
                const filtered = {};
                mapIds.forEach((id) => {
                    const key = String(id || '').trim();
                    if (!key) return;
                    if (map[key]) filtered[key] = map[key];
                });
                return res.json({ map: filtered });
            }
            res.json({ map });
        } catch (error) {
            console.error('[GetMapOccupationMap] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get map occupation map' });
        }
    });

    app.post('/api/get-world-map-layout', async (_req, res) => {
        try {
            const layout = await getWorldMapLayout({ promisifyPlayFab, PlayFabAdmin });
            const placementOpen = await getWorldMapPlacementOpen({ promisifyPlayFab, PlayFabAdmin });
            res.json({ layout, placementOpen });
        } catch (error) {
            console.error('[get-world-map-layout] Error:', error?.message || error);
            res.status(500).json({ error: 'Failed to get world map layout' });
        }
    });

    app.post('/api/swap-world-map-cells', async (req, res) => {
        const { playFabId, fromMapId, toMapId, fromIndex, toIndex } = req.body || {};
        if (!playFabId || !fromMapId || !toMapId) {
            return res.status(400).json({ error: 'playFabId/fromMapId/toMapId are required' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const kingContext = await requireKingContext(requesterPlayFabId, firestore, { promisifyPlayFab, PlayFabServer });
            const placementOpen = await getWorldMapPlacementOpen({ promisifyPlayFab, PlayFabAdmin });
            if (!placementOpen) {
                return res.status(403).json({ error: 'PlacementClosed' });
            }
            const kingNation = String(kingContext.nation || '').toLowerCase();
            const fixedIds = new Set(['wands', 'swords', 'cups', 'pentacles']);
            const layout = await getWorldMapLayout({ promisifyPlayFab, PlayFabAdmin });
            const fromIdx = Number.isInteger(fromIndex) ? fromIndex : layout.indexOf(fromMapId);
            const toIdx = Number.isInteger(toIndex) ? toIndex : layout.indexOf(toMapId);
            if (fromIdx < 0 || toIdx < 0 || fromIdx >= layout.length || toIdx >= layout.length) {
                return res.status(400).json({ error: 'InvalidSwapIndex' });
            }
            const fromValue = layout[fromIdx];
            const toValue = layout[toIdx];
            if (!fromValue || !toValue) {
                return res.status(400).json({ error: 'MapNotInLayout' });
            }
            if (fixedIds.has(fromValue) || fixedIds.has(toValue)) {
                return res.status(400).json({ error: 'FixedMapCannotSwap' });
            }
            const isEmpty = (value) => String(value || '').trim() === EMPTY_MAP_ID;
            const fromEmpty = isEmpty(fromValue);
            const toEmpty = isEmpty(toValue);
            if (fromEmpty && toEmpty) {
                return res.status(400).json({ error: 'EmptySwapNotAllowed' });
            }
            const [fromNation, toNation] = await Promise.all([
                fromEmpty ? Promise.resolve(null) : getMapOccupationNation(fromValue, { promisifyPlayFab, PlayFabAdmin }),
                toEmpty ? Promise.resolve(null) : getMapOccupationNation(toValue, { promisifyPlayFab, PlayFabAdmin })
            ]);
            if (!fromEmpty && !toEmpty) {
                if (!fromNation || !toNation || fromNation !== toNation || fromNation !== kingNation) {
                    return res.status(403).json({ error: 'NotOwnedByNation' });
                }
            } else {
                const occupied = fromEmpty ? toNation : fromNation;
                if (!occupied || occupied !== kingNation) {
                    return res.status(403).json({ error: 'NotOwnedByNation' });
                }
            }
            const nextLayout = layout.slice();
            nextLayout[fromIdx] = toValue;
            nextLayout[toIdx] = fromValue;
            await setWorldMapLayout(nextLayout, { promisifyPlayFab, PlayFabAdmin });
            res.json({ layout: nextLayout });
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'NotKing') return res.status(403).json({ error: 'NotKing' });
            console.error('[swap-world-map-cells] Error:', msg);
            res.status(500).json({ error: 'Failed to swap world map cells', details: msg });
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
