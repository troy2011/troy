// server/nation.js
// 国家関連のAPI

const { addGlobalChatMessage } = require('./chat');
const { PlayFabData, withTitleEntityToken } = require('./playfab');
const { addPlayerNationContribution } = require('./playerLevel');
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

function callTitleScopedApi(promisifyPlayFab, apiFunction, request) {
    return withTitleEntityToken(() => promisifyPlayFab(apiFunction, request));
}

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
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

function getNationGroupDoc(firestore, groupName) {
    return firestore.collection('nation_groups').doc(groupName);
}

function getTroyRoomDoc(firestore, groupName) {
    return firestore.collection('troy_rooms').doc(groupName);
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
    const { promisifyPlayFab, PlayFabServer } = deps;
    const kingId = normalizePlayFabId(playFabId);
    if (!kingId) throw new Error('InvalidPlayFabId');

    const nation = await getNationForPlayer(kingId, { promisifyPlayFab, PlayFabServer });
    if (!nation) throw new Error('KingNationNotSet');
    const mapping = getNationMappingByNation(nation);
    if (!mapping) throw new Error('InvalidKingNation');

    const groupId = await getNationGroupIdByNation(nation, firestore, deps);
    if (!groupId) throw new Error('NationGroupNotFound');

    const groupDocRef = getNationGroupDoc(firestore, mapping.groupName);
    const groupSnap = await groupDocRef.get();
    const storedKingId = groupSnap.exists ? normalizePlayFabId(groupSnap.data()?.kingPlayFabId || '') : '';
    const kingRo = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: kingId,
        Keys: ['IsKing']
    });
    const isKing = String(kingRo?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
    if (!isKing) throw new Error('NotKing');

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
                Keys: ['NationGroupId', 'IsKing']
            });
            if (!ro || !ro.Data || !ro.Data.NationGroupId || !ro.Data.NationGroupId.Value) {
                return res.json({ notInNation: true });
            }

            const selfId = normalizePlayFabId(requesterPlayFabId);
            const isKingFlag = String(ro?.Data?.IsKing?.Value || '').toLowerCase() === 'true';
            if (!isKingFlag) {
                return res.status(403).json({ error: 'Only the king can view this page' });
            }
            try {
                const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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

    // 付与倍率設定
    app.post('/api/king-set-grant-multiplier', async (req, res) => {
        const { playFabId, grantMultiplier } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const multiplierValue = Number(grantMultiplier);
        if (!Number.isFinite(multiplierValue) || multiplierValue < 0) {
            return res.status(400).json({ error: 'Grant multiplier must be 0 or greater' });
        }

        try {
            const context = await requireKingContext(requesterPlayFabId, firestore, nationDeps);
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
                await deleteCollectionDocs(roomRef.collection('members'));
                await deleteCollectionDocs(roomRef.collection('checkouts'));
                await roomRef.set({
                    isOpen: false,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedBy: null
                }, { merge: true });
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
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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
        const { playFabId, itemName, price, quantity, total, displayName } = req.body || {};
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!itemName) return res.status(400).json({ error: 'itemName is required' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        const { lineClient } = deps;
        if (!lineClient) return res.status(500).json({ error: 'LineClientNotConfigured' });
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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
                    const treasuryResult = await addNationTreasury(nation, orderAmount, firestore, nationDeps, {
                        contributorPlayFabId: requesterPlayFabId
                    });
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
                        await addEconomyItem(requesterPlayFabId, 'PS', grantAmount);
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

            pushDisplayEvent({
                type: orderAmount > 0 ? 'boom' : 'splash',
                label: `注文: ${buyerName} ${orderLine}`
            });
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
            if (!nation) return res.status(400).json({ error: 'NationNotSet' });
            const mapping = getNationMappingByNation(nation);
            if (!mapping) return res.status(400).json({ error: 'InvalidNation' });

            const roomRef = getTroyRoomDoc(firestore, mapping.groupName);
            const roomSnap = await roomRef.get();
            if (!roomSnap.exists || !roomSnap.data()?.isOpen) {
                return res.status(403).json({ error: 'TroyClosed' });
            }

            const memberId = normalizePlayFabId(requesterPlayFabId);
            const name = String(displayName || '').trim().slice(0, 40) || memberId;
            await roomRef.collection('members').doc(memberId).set({
                playFabId: memberId,
                displayName: name,
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            pushDisplayEvent({
                type: 'flare',
                label: `入店: ${name}`
            });
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
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;
        try {
            const nation = await getNationForPlayer(requesterPlayFabId, { promisifyPlayFab, PlayFabServer });
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
                await addNationTreasury(context.nation, value, firestore, nationDeps, {
                    idempotencyId: idempotencyFor('treasury'),
                    contributorPlayFabId: receiverId
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
