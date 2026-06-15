// guild.js - ギルド機能のサーバー側API
// PlayFab Groups APIを使用したギルド管理

const { PlayFabGroups, PlayFabData, withTitleEntityToken, getEntityKeyFromPlayFabId } = require('../playfab');
const economy = require('../economy');
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');
const { buildStatsMapFromStatistics, applyDerivedPlayerLevelToStats } = require('../playerLevel');
const { getAvatarColorForNation } = require('../nation');
const {
    CREW_ROLE_DEFS,
    CREW_ROLE_BY_ID,
    normalizeCrewRoleId,
    getCrewRankLevel,
    getCrewRankDecorationClass,
    getCrewRankTitle
} = require('../crewRoles');

const CREW_UNLOCK_LEVEL = 21;
const CREW_FOUNDING_COST = 1000;
const MAX_CREW_COMPANIONS = 7;
const CREW_RECRUITMENT_COLLECTION = 'crew_recruitment_posts';
const MAX_CREW_RECRUITMENT_MESSAGE_LENGTH = 120;
const CREW_RECRUITMENT_LIST_LIMIT = 50;

const NATION_GUILD_LABEL_BY_KEY = {
    fire: '火の国',
    water: '水の国',
    wind: '風の国',
    earth: '地の国'
};

const NATION_GROUP_NAME_BY_KEY = {
    fire: 'nation_fire_island',
    water: 'nation_water_island',
    wind: 'nation_wind_island',
    earth: 'nation_earth_island'
};

const NATION_ALIASES = {
    human: 'fire',
    goblin: 'water',
    orc: 'earth',
    elf: 'wind'
};

const GEO_CONFIG = {
    GRID_SIZE: 32,
    MAP_TILE_SIZE: 500,
    METERS_PER_TILE: 100
};

function worldToLatLng(point) {
    const mapPixelSize = GEO_CONFIG.MAP_TILE_SIZE * GEO_CONFIG.GRID_SIZE;
    const metersPerPixel = GEO_CONFIG.METERS_PER_TILE / GEO_CONFIG.GRID_SIZE;
    const dxMeters = (point.x - mapPixelSize / 2) * metersPerPixel;
    const dyMeters = (mapPixelSize / 2 - point.y) * metersPerPixel;
    const lat = dyMeters / 110574;
    const lng = dxMeters / 111320;
    return { lat, lng };
}

// ギルドレベルシステムの設定
const GUILD_LEVEL_CONFIG = {
    1: { requiredExp: 0, maxMembers: 10 },
    2: { requiredExp: 100, maxMembers: 15 },
    3: { requiredExp: 300, maxMembers: 20 },
    4: { requiredExp: 600, maxMembers: 25 },
    5: { requiredExp: 1000, maxMembers: 30 },
    6: { requiredExp: 1500, maxMembers: 35 },
    7: { requiredExp: 2100, maxMembers: 40 },
    8: { requiredExp: 2800, maxMembers: 45 },
    9: { requiredExp: 3600, maxMembers: 50 },
    10: { requiredExp: 4500, maxMembers: 60 }
};

/**
 * ギルドレベルを計算
 * @param {number} exp - 現在の経験値
 * @returns {number} - ギルドレベル
 */
function calculateGuildLevel(exp) {
    let level = 1;
    for (let lvl = 10; lvl >= 1; lvl--) {
        if (exp >= GUILD_LEVEL_CONFIG[lvl].requiredExp) {
            level = lvl;
            break;
        }
    }
    return level;
}

/**
 * ギルドデータを取得（PlayFab Objects APIを使用）
 * @param {string} guildId - ギルドID
 * @returns {Object} - ギルドデータ
 */
async function getGuildData(guildId, promisifyPlayFab) {
    try {
        const result = await withTitleEntityToken(() => promisifyPlayFab(PlayFabData.GetObjects, {
            Entity: { Id: guildId, Type: 'group' },
            EscapeObject: false
        }));

        if (result.Objects && result.Objects.GuildData) {
            const raw = result.Objects.GuildData.DataObject;
            if (!raw) return {};
            if (typeof raw === 'string') return JSON.parse(raw);
            if (typeof raw === 'object') return raw;
        }

        // デフォルトのギルドデータ
        return {
            level: 1,
            exp: 0,
            treasury: 0, // ギルド資金
            warehouse: [], // アイテム倉庫
            pendingApplications: [] // 加入申請リスト
        };
    } catch (error) {
        console.warn('[getGuildData] データ取得失敗、デフォルト値を返します:', error.message);
        return {
            level: 1,
            exp: 0,
            treasury: 0,
            warehouse: [],
            pendingApplications: []
        };
    }
}

/**
 * ギルドデータを保存（PlayFab Objects APIを使用）
 * @param {string} guildId - ギルドID
 * @param {Object} data - 保存するデータ
 */
async function saveGuildData(guildId, data, promisifyPlayFab) {
    await withTitleEntityToken(() => promisifyPlayFab(PlayFabData.SetObjects, {
        Entity: { Id: guildId, Type: 'group' },
        Objects: [
            {
                ObjectName: 'GuildData',
                DataObject: data
            }
        ]
    }));
}

function normalizePlayFabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^playfab:/i, '').trim().toUpperCase();
}

function sanitizeRecruitmentMessage(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CREW_RECRUITMENT_MESSAGE_LENGTH);
}

function sanitizeRequestedGuildName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCrewRoleIds(values) {
    const source = Array.isArray(values) ? values : [values];
    const seen = new Set();
    const result = [];
    source.forEach((value) => {
        const roleId = normalizeCrewRoleId(value);
        if (roleId && !seen.has(roleId)) {
            seen.add(roleId);
            result.push(roleId);
        }
    });
    return result;
}

function parseBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (NATION_GUILD_LABEL_BY_KEY[raw]) return raw;
    if (NATION_ALIASES[raw]) return NATION_ALIASES[raw];
    const match = /^nation_([a-z]+)_island$/.exec(raw);
    if (match && NATION_GUILD_LABEL_BY_KEY[match[1]]) return match[1];
    return '';
}

function normalizePlayerNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'neutral' || raw === 'nationless' || raw === 'none' || raw === '無国籍') return 'neutral';
    return normalizeNationKey(raw);
}

function getNationGuildLabel(nationKey) {
    const key = normalizeNationKey(nationKey);
    return NATION_GUILD_LABEL_BY_KEY[key] || '国';
}

function getNationGroupName(nationKey) {
    const key = normalizeNationKey(nationKey);
    return NATION_GROUP_NAME_BY_KEY[key] || '';
}

function buildNationGuildName(nationKey) {
    return `${getNationGuildLabel(nationKey)}ギルド`;
}

function buildNationKingShipName(nationKey) {
    const nationLabel = getNationGuildLabel(nationKey);
    const kingLabel = nationLabel.replace(/の国$/u, '') || '国';
    return `${kingLabel}の王の船`;
}

function isNationGuildData(guildData) {
    return guildData?.guildType === 'nation' || parseBooleanFlag(guildData?.isNationGuild);
}

function isSystemNationGroupName(value) {
    return /^nation_(fire|water|wind|earth)_island$/i.test(String(value || '').trim());
}

function isSystemNationGroupEntry(groupEntry, guildData = null) {
    const values = [
        groupEntry?.GroupName,
        groupEntry?.Group?.Name,
        guildData?.groupName,
        guildData?.name
    ];
    return values.some(isSystemNationGroupName);
}

function resolveGuildNationKey(guildData) {
    return normalizeNationKey(guildData?.nation || guildData?.nationKey || guildData?.kingNation);
}

function hasCompanionGuildData(guildData) {
    const ownerPlayFabId = normalizePlayFabId(guildData?.ownerPlayFabId || guildData?.captainPlayFabId);
    if (!ownerPlayFabId) return false;
    const guildType = String(guildData?.guildType || '').trim().toLowerCase();
    if (!guildType) return true;
    return guildType === 'pirate' || guildType === 'nation' || parseBooleanFlag(guildData?.isNationGuild);
}

function getGuildType(guildData) {
    return isNationGuildData(guildData) ? 'nation' : 'pirate';
}

function getGuildOwnerTitle(guildData) {
    if (String(guildData?.ownerTitle || '').trim()) return String(guildData.ownerTitle).trim();
    return isNationGuildData(guildData) ? '王' : '船長';
}

function getGuildMemberPlayFabMap(guildData) {
    const source = guildData?.memberPlayFabIds || guildData?.memberEntityPlayFabIds || {};
    return source && typeof source === 'object' && !Array.isArray(source) ? { ...source } : {};
}

function setGuildMemberPlayFabMapEntry(guildData, entityKey, playFabId) {
    const entityId = String(entityKey?.Id || '').trim();
    const normalizedPlayFabId = normalizePlayFabId(playFabId);
    if (!entityId || !normalizedPlayFabId) return getGuildMemberPlayFabMap(guildData);
    const map = getGuildMemberPlayFabMap(guildData);
    map[entityId] = normalizedPlayFabId;
    guildData.memberPlayFabIds = map;
    return map;
}

function resolveGuildMemberPlayFabId(entityId, guildData) {
    const rawEntityId = String(entityId || '').trim();
    if (!rawEntityId) return '';
    const map = getGuildMemberPlayFabMap(guildData);
    const mapped = map[rawEntityId] || map[rawEntityId.toUpperCase()] || map[rawEntityId.toLowerCase()];
    return normalizePlayFabId(mapped || rawEntityId);
}

function scoreCompanionGuildCandidate(candidate, requesterPlayFabId, kingContext = {}) {
    const guildData = candidate?.guildData || {};
    if (!hasCompanionGuildData(guildData)) return -1;
    if (isSystemNationGroupEntry(candidate?.group, guildData)) return -1;

    const requesterId = normalizePlayFabId(requesterPlayFabId);
    const ownerId = normalizePlayFabId(guildData.ownerPlayFabId || guildData.captainPlayFabId);
    const guildType = getGuildType(guildData);
    const nationKey = resolveGuildNationKey(guildData);
    const isOwner = !!requesterId && requesterId === ownerId;

    if (kingContext?.isKing) {
        if (guildType === 'nation' && isOwner && nationKey && nationKey === kingContext.nationKey) return 1000;
        return -1;
    }

    if (isOwner) return 800;

    const roleAssignments = guildData?.crewRoles || guildData?.roleAssignments || {};
    if (roleAssignments && typeof roleAssignments === 'object' && roleAssignments[requesterId]) return 700;

    return guildType === 'nation' ? 600 : 500;
}

function selectCompanionGuildCandidate(candidates, requesterPlayFabId, kingContext = {}) {
    return (Array.isArray(candidates) ? candidates : [])
        .map((candidate, index) => ({
            candidate,
            index,
            score: scoreCompanionGuildCandidate(candidate, requesterPlayFabId, kingContext)
        }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))[0]?.candidate || null;
}

/**
 * ギルド関連のAPIルートを初期化
 * @param {Express} app - Expressアプリケーション
 * @param {Function} promisifyPlayFab - PlayFab APIのPromiseラッパー
 * @param {Object} PlayFabServer - PlayFab Server API
 * @param {Object} PlayFabAdmin - PlayFab Admin API
 */
function initializeGuildRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, resolveItemId, authTools = {}) {

    const economyDeps = { promisifyPlayFab, PlayFabEconomy, getEntityKeyFromPlayFabId, resolveItemId };
    const requireAuthenticatedPlayFabId = authTools?.requireAuthenticatedPlayFabId || null;

    async function requireAuthedPlayFabId(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return playFabId;
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    function callTitleScopedApi(apiFunction, request) {
        return withTitleEntityToken(() => promisifyPlayFab(apiFunction, request));
    }

    async function resolvePlayerEntityKey(playFabId) {
        let resolvedEntity = await getEntityKeyFromPlayFabId(playFabId);
        if (resolvedEntity?.Id && resolvedEntity?.Type) {
            return resolvedEntity;
        }
        const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowEntity: true, ShowLinkedAccounts: true }
        });
        const entityId = entityResult?.PlayerProfile?.Entity?.Id || entityResult?.PlayerProfile?.PlayerId || null;
        const entityType = entityResult?.PlayerProfile?.Entity?.Type || (entityId ? 'title_player_account' : null);
        if (entityId && entityType) {
            return { Id: entityId, Type: entityType };
        }
        return null;
    }

    async function assertGuildMembership(playFabId, guildId) {
        const entityKey = await resolvePlayerEntityKey(playFabId);
        if (!entityKey?.Id || !entityKey?.Type) {
            throw new Error('PlayerEntityNotFound');
        }
        const membershipResult = await callTitleScopedApi(PlayFabGroups.ListMembership, {
            Entity: entityKey
        });
        const groups = Array.isArray(membershipResult?.Groups) ? membershipResult.Groups : [];
        const isMember = groups.some((groupEntry) => String(groupEntry?.Group?.Id || '') === String(guildId || ''));
        if (!isMember) {
            throw new Error('NotGuildMember');
        }
        return entityKey;
    }

    async function assertGuildOwner(playFabId, guildId) {
        await assertGuildMembership(playFabId, guildId);
        const guildData = await getGuildData(guildId, promisifyPlayFab);
        const ownerId = normalizePlayFabId(guildData?.ownerPlayFabId);
        const requesterId = normalizePlayFabId(playFabId);
        if (!ownerId || ownerId !== requesterId) {
            throw new Error('NotGuildOwner');
        }
        return guildData;
    }

    async function getPlayerLevel(playFabId) {
        const statsResult = await promisifyPlayFab(PlayFabServer.GetPlayerStatistics, {
            PlayFabId: playFabId
        });
        const statsMap = buildStatsMapFromStatistics(statsResult?.Statistics || []);
        const derived = applyDerivedPlayerLevelToStats(statsMap);
        return Math.max(1, Math.floor(Number(derived?.stats?.Level || statsMap.Level || 1) || 1));
    }

    async function getPlayerDisplayName(playFabId) {
        const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        return String(profileResult?.PlayerProfile?.DisplayName || playFabId || '').trim() || playFabId;
    }

    async function getPlayerStoredNation(playFabId) {
        if (!playFabId) return '';
        const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation']
        });
        return normalizePlayerNationKey(readOnly?.Data?.Nation?.Value);
    }

    async function resolveGuildMasterNation(guildData) {
        const guildNation = normalizePlayerNationKey(guildData?.nation || guildData?.nationKey || guildData?.kingNation);
        if (guildNation) return guildNation;
        const ownerPlayFabId = guildData?.ownerPlayFabId || guildData?.captainPlayFabId || '';
        return ownerPlayFabId ? getPlayerStoredNation(ownerPlayFabId) : '';
    }

    async function syncGuildMemberNationToMaster(memberPlayFabId, guildData) {
        const nation = await resolveGuildMasterNation(guildData);
        if (!nation) return { updated: false, reason: 'MasterNationMissing' };
        const avatarColor = getAvatarColorForNation(nation) || (nation === 'neutral' ? 'black' : '');
        await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: memberPlayFabId,
            Data: {
                Nation: nation,
                AvatarColor: avatarColor || 'brown',
                NationChangedAt: String(Date.now())
            }
        });
        return { updated: true, nation, avatarColor: avatarColor || 'brown' };
    }

    async function getKingGuildContext(playFabId) {
        try {
            const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['IsKing', 'Nation']
            });
            const isKing = parseBooleanFlag(readOnly?.Data?.IsKing?.Value);
            const nationKey = normalizeNationKey(readOnly?.Data?.Nation?.Value);
            return {
                isKing: isKing && !!nationKey,
                nationKey,
                nationLabel: getNationGuildLabel(nationKey)
            };
        } catch (error) {
            console.warn('[Guild] Failed to resolve king guild context:', error?.errorMessage || error?.message || error);
            return { isKing: false, nationKey: '', nationLabel: '' };
        }
    }

    async function getParentNationGroupMeta(nationKey) {
        const normalizedNation = normalizeNationKey(nationKey);
        const groupName = getNationGroupName(normalizedNation);
        if (!groupName) return { nation: normalizedNation || null, parentNationGroupName: '', parentNationGroupId: '' };
        let parentNationGroupId = '';
        try {
            const snap = await admin.firestore().collection('nation_groups').doc(groupName).get();
            if (snap?.exists) {
                parentNationGroupId = String(snap.data()?.groupId || '').trim();
            }
        } catch (error) {
            console.warn('[Guild] Failed to resolve parent nation group:', error?.message || error);
        }
        return {
            nation: normalizedNation,
            parentNationGroupName: groupName,
            parentNationGroupId
        };
    }

    async function buildCompanionGuildCandidates(groups) {
        const entries = [];
        for (const groupEntry of Array.isArray(groups) ? groups : []) {
            const guildId = String(groupEntry?.Group?.Id || '').trim();
            if (!guildId) continue;
            if (isSystemNationGroupEntry(groupEntry)) continue;
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            if (isSystemNationGroupEntry(groupEntry, guildData)) continue;
            if (!hasCompanionGuildData(guildData)) continue;
            entries.push({
                group: groupEntry,
                guildId,
                guildName: String(groupEntry?.GroupName || groupEntry?.Group?.Name || guildData?.name || '').trim(),
                guildData
            });
        }
        return entries;
    }

    async function resolveCompanionGuildMembership(entityKey, requesterPlayFabId, kingContext = null) {
        const membershipResult = await callTitleScopedApi(PlayFabGroups.ListMembership, {
            Entity: entityKey
        });
        const groups = Array.isArray(membershipResult?.Groups) ? membershipResult.Groups : [];
        const candidates = await buildCompanionGuildCandidates(groups);
        const context = kingContext || await getKingGuildContext(requesterPlayFabId);
        return {
            groups,
            candidates,
            selected: selectCompanionGuildCandidate(candidates, requesterPlayFabId, context)
        };
    }

    function getCrewRoleAssignments(guildData) {
        const source = guildData?.crewRoles || guildData?.roleAssignments || {};
        return source && typeof source === 'object' && !Array.isArray(source) ? { ...source } : {};
    }

    function getAssignedCrewRole(playFabId, guildData) {
        return normalizeCrewRoleId(getCrewRoleAssignments(guildData)[normalizePlayFabId(playFabId)]);
    }

    function countCrewCompanions(guildData) {
        return Object.keys(getCrewRoleAssignments(guildData)).length;
    }

    function getAvailableCrewRoles(guildData) {
        const assigned = new Set(Object.values(getCrewRoleAssignments(guildData)).map(normalizeCrewRoleId).filter(Boolean));
        return CREW_ROLE_DEFS.map((role) => ({
            id: role.id,
            label: role.label,
            gameLabel: role.gameLabel,
            iconKey: role.iconKey,
            available: !assigned.has(role.id)
        }));
    }

    function getAvailableCrewRoleIds(guildData) {
        return getAvailableCrewRoles(guildData)
            .filter((role) => role.available)
            .map((role) => role.id);
    }

    function getRecruitmentRoleIds(guildData, requestedRoleIds = null) {
        const available = new Set(getAvailableCrewRoleIds(guildData));
        const source = requestedRoleIds === null
            ? guildData?.recruitment?.roleIds
            : requestedRoleIds;
        return normalizeCrewRoleIds(source).filter((roleId) => available.has(roleId));
    }

    function buildCrewRolePayload(roleIds) {
        return normalizeCrewRoleIds(roleIds).map((roleId) => {
            const role = CREW_ROLE_BY_ID[roleId];
            return {
                id: role.id,
                label: role.label,
                gameLabel: role.gameLabel,
                iconKey: role.iconKey
            };
        });
    }

    function getPendingApplications(guildData) {
        const pending = Array.isArray(guildData?.pendingApplications) ? guildData.pendingApplications : [];
        return pending
            .map((entry) => ({
                ...entry,
                playFabId: normalizePlayFabId(entry?.playFabId || entry?.applicantId),
                entityId: String(entry?.entityId || '').trim(),
                entityType: String(entry?.entityType || 'title_player_account').trim() || 'title_player_account',
                crewRoleId: normalizeCrewRoleId(entry?.crewRoleId || entry?.roleId),
                appliedAt: String(entry?.appliedAt || new Date().toISOString())
            }))
            .filter((entry) => entry.playFabId || entry.entityId);
    }

    function findPendingApplication(guildData, applicantId) {
        const target = normalizePlayFabId(applicantId);
        const raw = String(applicantId || '').trim();
        return getPendingApplications(guildData).find((entry) => (
            (target && normalizePlayFabId(entry.playFabId) === target)
            || (raw && String(entry.entityId || '') === raw)
        )) || null;
    }

    function upsertPendingApplication(guildData, application) {
        const pending = getPendingApplications(guildData);
        const nextPlayFabId = normalizePlayFabId(application?.playFabId);
        const nextEntityId = String(application?.entityId || '').trim();
        const filtered = pending.filter((entry) => {
            if (nextPlayFabId && normalizePlayFabId(entry.playFabId) === nextPlayFabId) return false;
            if (nextEntityId && String(entry.entityId || '') === nextEntityId) return false;
            return true;
        });
        filtered.push({
            ...application,
            playFabId: nextPlayFabId,
            entityId: nextEntityId,
            entityType: String(application?.entityType || 'title_player_account').trim() || 'title_player_account',
            crewRoleId: normalizeCrewRoleId(application?.crewRoleId),
            appliedAt: application?.appliedAt || new Date().toISOString()
        });
        guildData.pendingApplications = filtered;
        return filtered;
    }

    function removePendingApplication(guildData, applicantId) {
        const target = normalizePlayFabId(applicantId);
        const raw = String(applicantId || '').trim();
        guildData.pendingApplications = getPendingApplications(guildData).filter((entry) => {
            if (target && normalizePlayFabId(entry.playFabId) === target) return false;
            if (raw && String(entry.entityId || '') === raw) return false;
            return true;
        });
        return guildData.pendingApplications;
    }

    function buildRecruitmentInfo(guildData) {
        const roleIds = getRecruitmentRoleIds(guildData);
        const companionCount = countCrewCompanions(guildData);
        const maxCompanions = Math.max(1, Number(guildData?.maxCompanions || MAX_CREW_COMPANIONS) || MAX_CREW_COMPANIONS);
        const isOpen = guildData?.recruitment?.isOpen !== false && roleIds.length > 0 && companionCount < maxCompanions;
        return {
            isOpen,
            roleIds,
            roles: buildCrewRolePayload(roleIds),
            message: sanitizeRecruitmentMessage(guildData?.recruitment?.message),
            pendingApplicationsCount: getPendingApplications(guildData).length
        };
    }

    function buildGuildCrewMeta(guildData, playFabId, playerLevel = 1) {
        const roleId = getAssignedCrewRole(playFabId, guildData);
        const role = CREW_ROLE_BY_ID[roleId] || null;
        return {
            roleId,
            roleLabel: role?.label || '',
            gameLabel: role?.gameLabel || '',
            iconKey: role?.iconKey || '',
            rankLevel: role ? getCrewRankLevel(playerLevel) : 0,
            rankDecorationClass: role ? getCrewRankDecorationClass(playerLevel) : '',
            rankTitle: role ? getCrewRankTitle(roleId, playerLevel) : '',
            companionCount: countCrewCompanions(guildData),
            maxCompanions: Number(guildData?.maxCompanions || MAX_CREW_COMPANIONS),
            availableRoles: getAvailableCrewRoles(guildData)
        };
    }

    async function getGuildName(guildId) {
        try {
            const groupResult = await callTitleScopedApi(PlayFabGroups.GetGroup, {
                Group: { Id: guildId, Type: 'group' }
            });
            return String(groupResult?.GroupName || '').trim();
        } catch (error) {
            console.warn('[CrewRecruitment] Failed to resolve guild name:', error?.errorMessage || error?.message || error);
            return '';
        }
    }

    async function syncCrewRecruitmentPost(guildId, guildName, guildData) {
        const recruitment = buildRecruitmentInfo(guildData);
        const db = admin.firestore();
        const docRef = db.collection(CREW_RECRUITMENT_COLLECTION).doc(String(guildId));
        const now = new Date().toISOString();
        const guildType = getGuildType(guildData);
        const isNationGuild = guildType === 'nation';
        const nationKey = resolveGuildNationKey(guildData);
        const fallbackGuildName = isNationGuild ? buildNationGuildName(nationKey) : '海賊団';
        const ownerTitle = getGuildOwnerTitle(guildData);
        guildData.recruitment = {
            ...(guildData.recruitment || {}),
            isOpen: recruitment.isOpen,
            roleIds: recruitment.roleIds,
            message: recruitment.message,
            updatedAt: now
        };

        await docRef.set({
            guildId: String(guildId),
            guildName: String(guildName || guildData?.name || '').trim() || fallbackGuildName,
            captainName: String(guildData?.captainName || '').trim(),
            ownerPlayFabId: normalizePlayFabId(guildData?.ownerPlayFabId),
            ownerTitle,
            guildType,
            isNationGuild,
            nation: nationKey || null,
            parentNationGroupId: String(guildData?.parentNationGroupId || '').trim() || null,
            parentNationGroupName: String(guildData?.parentNationGroupName || getNationGroupName(nationKey)).trim() || null,
            isOpen: recruitment.isOpen,
            roleIds: recruitment.roleIds,
            roles: recruitment.roles,
            message: recruitment.message,
            companionCount: countCrewCompanions(guildData),
            maxCompanions: Number(guildData?.maxCompanions || MAX_CREW_COMPANIONS),
            pendingApplicationsCount: recruitment.pendingApplicationsCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtIso: now
        }, { merge: true });
    }

    function handleGuildAccessError(res, error) {
        const message = error?.errorMessage || error?.message || String(error);
        if (message === 'PlayerEntityNotFound') {
            res.status(400).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            return true;
        }
        if (message === 'NotGuildMember') {
            res.status(403).json({ error: 'ギルドメンバーのみ実行できます。' });
            return true;
        }
        if (message === 'NotGuildOwner') {
            res.status(403).json({ error: 'ギルドオーナーのみ実行できます。' });
            return true;
        }
        return false;
    }

    // ----------------------------------------------------
    // API: ギルド情報を取得
    // ----------------------------------------------------
    app.post('/api/get-guild-info', async (req, res) => {
        const { playFabId } = req.body;
        const requestedGuildName = sanitizeRequestedGuildName(req.body?.guildName);
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド情報取得] ${playFabId} のギルド情報を取得します...`);

        try {
            // プレイヤーのEntityKeyを取得
            let resolvedEntity = await resolvePlayerEntityKey(requesterPlayFabId);
            if (!resolvedEntity) {
                const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: requesterPlayFabId,
                    ProfileConstraints: { ShowEntity: true }
                });
                const entityId = entityResult?.PlayerProfile?.Entity?.Id || null;
                const entityType = entityResult?.PlayerProfile?.Entity?.Type || null;
                if (entityId && entityType) {
                    resolvedEntity = { Id: entityId, Type: entityType };
                }
            }
            if (!resolvedEntity) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const kingContext = await getKingGuildContext(requesterPlayFabId);
            const membership = await resolveCompanionGuildMembership(resolvedEntity, requesterPlayFabId, kingContext);
            const selectedGuild = membership.selected;

            if (!selectedGuild) {
                console.log(`[ギルド情報取得] ${playFabId} は仲間ギルドに所属していません。`);
                return res.json({ guild: null });
            }

            const group = selectedGuild.group;
            const guildId = selectedGuild.guildId;
            const guildName = selectedGuild.guildName || selectedGuild.guildData?.name || group.GroupName;
            const memberRole = group.RoleName || 'メンバー';
            const memberRoleLabel = memberRole === 'admins' ? '船長' : 'メンバー';

            // メンバー数を取得するために、グループメンバーを取得
            const membersResult = await callTitleScopedApi(PlayFabGroups.ListGroupMembers, {
                Group: { Id: guildId, Type: 'group' }
            });

            const memberCount = Array.isArray(membersResult.Members)
                ? membersResult.Members.reduce((count, roleGroup) => count + (Array.isArray(roleGroup.Members) ? roleGroup.Members.length : 0), 0)
                : 0;

            // ギルドデータを取得（レベル、経験値、資金など）
            const guildData = selectedGuild.guildData;
            const currentLevel = calculateGuildLevel(guildData.exp);
            const requesterLevel = await getPlayerLevel(requesterPlayFabId).catch(() => 1);
            const crewMeta = buildGuildCrewMeta(guildData, requesterPlayFabId, requesterLevel);
            const recruitment = buildRecruitmentInfo(guildData);
            const guildType = getGuildType(guildData);
            const isNationGuild = guildType === 'nation';
            const nationKey = resolveGuildNationKey(guildData);
            const ownerTitle = getGuildOwnerTitle(guildData);
            const isOwner = normalizePlayFabId(guildData?.ownerPlayFabId) === normalizePlayFabId(requesterPlayFabId);
            const resolvedMemberRoleLabel = isOwner ? ownerTitle : memberRoleLabel;

            // 次のレベルまでの必要経験値を計算
            const nextLevel = currentLevel < 10 ? currentLevel + 1 : 10;
            const nextLevelExp = GUILD_LEVEL_CONFIG[nextLevel].requiredExp;
            const currentLevelExp = GUILD_LEVEL_CONFIG[currentLevel].requiredExp;
            const expProgress = guildData.exp - currentLevelExp;
            const expRequired = nextLevelExp - currentLevelExp;

            console.log(`[ギルド情報取得] 成功: ${guildName} (ID: ${guildId}, Lv.${currentLevel})`);

            res.json({
                guild: {
                    guildId: guildId,
                    name: guildName,
                    memberCount: memberCount,
                    level: currentLevel,
                    exp: guildData.exp,
                    expProgress: expProgress,
                    expRequired: expRequired,
                    treasury: guildData.treasury || 0,
                    guildType,
                    isNationGuild,
                    nation: nationKey || null,
                    parentNationGroupId: String(guildData?.parentNationGroupId || '').trim() || null,
                    parentNationGroupName: String(guildData?.parentNationGroupName || getNationGroupName(nationKey)).trim() || null,
                    ownerTitle,
                    maxMembers: Math.max(1, crewMeta.maxCompanions + 1),
                    companionCount: crewMeta.companionCount,
                    maxCompanions: crewMeta.maxCompanions,
                    crewRoleId: crewMeta.roleId,
                    crewRoleLabel: crewMeta.roleLabel,
                    crewGameLabel: crewMeta.gameLabel,
                    crewIconKey: crewMeta.iconKey,
                    crewRankLevel: crewMeta.rankLevel,
                    crewRankDecorationClass: crewMeta.rankDecorationClass,
                    crewRankTitle: crewMeta.rankTitle,
                    availableRoles: crewMeta.availableRoles,
                    recruitment,
                    isOwner,
                    role: resolvedMemberRoleLabel,
                    pendingApplicationsCount: recruitment.pendingApplicationsCount
                }
            });

        } catch (error) {
            console.error('[ギルド情報取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド情報の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 募集中の海賊団一覧を取得
    // ----------------------------------------------------
    app.post('/api/crew-recruitment/list', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            let currentGuildId = '';
            let appliedGuildIds = new Set();
            const requesterEntity = await resolvePlayerEntityKey(requesterPlayFabId).catch(() => null);
            if (requesterEntity?.Id && requesterEntity?.Type) {
                const kingContext = await getKingGuildContext(requesterPlayFabId);
                const membership = await resolveCompanionGuildMembership(requesterEntity, requesterPlayFabId, kingContext).catch(() => null);
                currentGuildId = String(membership?.selected?.guildId || '');

                const opportunities = await callTitleScopedApi(PlayFabGroups.ListMembershipOpportunities, {
                    Entity: requesterEntity
                }).catch(() => null);
                const applications = Array.isArray(opportunities?.Applications) ? opportunities.Applications : [];
                appliedGuildIds = new Set(applications.map((entry) => String(entry?.Group?.Id || '')).filter(Boolean));
            }

            const snapshot = await admin.firestore()
                .collection(CREW_RECRUITMENT_COLLECTION)
                .where('isOpen', '==', true)
                .limit(CREW_RECRUITMENT_LIST_LIMIT)
                .get();

            const posts = [];
            snapshot.forEach((doc) => {
                const data = doc.data() || {};
                const roleIds = normalizeCrewRoleIds(data.roleIds);
                if (roleIds.length === 0) return;
                const guildId = String(data.guildId || doc.id || '').trim();
                if (!guildId) return;
                const updatedAt = data.updatedAtIso
                    || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : '')
                    || '';
                const guildType = data.guildType === 'nation' || parseBooleanFlag(data.isNationGuild) ? 'nation' : 'pirate';
                const isNationGuild = guildType === 'nation';
                const nationKey = normalizeNationKey(data.nation);
                const fallbackGuildName = isNationGuild ? buildNationGuildName(nationKey) : '海賊団';
                posts.push({
                    guildId,
                    guildName: String(data.guildName || fallbackGuildName).trim() || fallbackGuildName,
                    captainName: String(data.captainName || '').trim(),
                    ownerTitle: String(data.ownerTitle || (isNationGuild ? '王' : '船長')).trim(),
                    guildType,
                    isNationGuild,
                    nation: nationKey || null,
                    parentNationGroupId: String(data.parentNationGroupId || '').trim() || null,
                    parentNationGroupName: String(data.parentNationGroupName || getNationGroupName(nationKey)).trim() || null,
                    message: sanitizeRecruitmentMessage(data.message),
                    roleIds,
                    roles: buildCrewRolePayload(roleIds),
                    companionCount: Number(data.companionCount || 0),
                    maxCompanions: Number(data.maxCompanions || MAX_CREW_COMPANIONS),
                    pendingApplicationsCount: Number(data.pendingApplicationsCount || 0),
                    updatedAt,
                    canApply: !currentGuildId && !appliedGuildIds.has(guildId),
                    hasApplied: appliedGuildIds.has(guildId),
                    isOwnGuild: currentGuildId === guildId
                });
            });

            posts.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
            res.json({ posts });
        } catch (error) {
            console.error('[CrewRecruitmentList]', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '募集掲示板の取得に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    // ----------------------------------------------------
    // API: 海賊団の募集内容を保存（船長用）
    // ----------------------------------------------------
    app.post('/api/crew-recruitment/save', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const guildData = await assertGuildOwner(requesterPlayFabId, guildId);
            const wantsOpen = req.body?.isOpen !== false;
            const roleIds = getRecruitmentRoleIds(guildData, req.body?.roleIds);
            if (wantsOpen && roleIds.length === 0) {
                return res.status(400).json({ error: '募集する空き役職を選んでください。' });
            }

            const guildName = await getGuildName(guildId);
            guildData.recruitment = {
                isOpen: wantsOpen && roleIds.length > 0,
                roleIds,
                message: sanitizeRecruitmentMessage(req.body?.message),
                updatedAt: new Date().toISOString()
            };
            await syncCrewRecruitmentPost(guildId, guildName, guildData);
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            res.json({
                success: true,
                recruitment: buildRecruitmentInfo(guildData)
            });
        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[CrewRecruitmentSave]', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: '募集内容の保存に失敗しました。', details: error?.errorMessage || error?.message });
        }
    });

    // ----------------------------------------------------
    // API: 募集掲示板から加入申請
    // ----------------------------------------------------
    app.post('/api/crew-recruitment/apply', async (req, res) => {
        const { playFabId, guildId } = req.body;
        const requestedRoleId = normalizeCrewRoleId(req.body?.crewRoleId || req.body?.roleId);
        if (!playFabId || !guildId) return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        if (!requestedRoleId) return res.status(400).json({ error: '役職を選んでください。' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        try {
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: requesterPlayFabId,
                ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true, ShowLinkedAccounts: true, ShowEntity: true }
            });
            const profile = entityResult?.PlayerProfile || {};
            const entityKey = {
                Id: profile?.Entity?.Id || profile?.PlayerId,
                Type: profile?.Entity?.Type || 'title_player_account'
            };
            if (!entityKey.Id || !entityKey.Type) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const kingContext = await getKingGuildContext(requesterPlayFabId);
            if (kingContext.isKing) {
                return res.status(400).json({ error: '王は王直属の国ギルドのみ管理できます。' });
            }

            const membership = await resolveCompanionGuildMembership(entityKey, requesterPlayFabId, kingContext);
            if (membership.selected) {
                return res.status(400).json({ error: '既にギルドに所属しています。' });
            }

            const guildData = await getGuildData(guildId, promisifyPlayFab);
            if (isSystemNationGroupEntry({ Group: { Id: guildId }, GroupName: await getGuildName(guildId).catch(() => '') }, guildData) || !hasCompanionGuildData(guildData)) {
                return res.status(400).json({ error: 'このQRは仲間ギルド用ではありません。' });
            }
            const recruitment = buildRecruitmentInfo(guildData);
            if (!recruitment.isOpen || !recruitment.roleIds.includes(requestedRoleId)) {
                const roleLabel = CREW_ROLE_BY_ID[requestedRoleId]?.label || '選択した役職';
                return res.status(400).json({ error: `${roleLabel}は現在募集されていません。` });
            }
            if (findPendingApplication(guildData, requesterPlayFabId)) {
                return res.status(400).json({ error: 'このギルドには既に申請済みです。' });
            }

            const groupEntity = { Id: guildId, Type: 'group' };
            await callTitleScopedApi(PlayFabGroups.ApplyToGroup, {
                Group: groupEntity,
                Entity: entityKey,
                AutoAcceptOutstandingInvite: false
            });

            upsertPendingApplication(guildData, {
                playFabId: requesterPlayFabId,
                entityId: entityKey.Id,
                entityType: entityKey.Type,
                displayName: profile.DisplayName || requesterPlayFabId,
                avatarUrl: profile.AvatarUrl || null,
                crewRoleId: requestedRoleId,
                source: 'recruitment_board',
                appliedAt: new Date().toISOString()
            });
            await syncCrewRecruitmentPost(guildId, await getGuildName(guildId), guildData);
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            res.json({
                success: true,
                message: '加入申請を送信しました。',
                crewRoleId: requestedRoleId,
                crewRoleLabel: CREW_ROLE_BY_ID[requestedRoleId]?.label || ''
            });
        } catch (error) {
            console.error('[CrewRecruitmentApply]', error?.errorMessage || error?.message || error);
            const message = String(error?.errorMessage || error?.message || '');
            const alreadyApplied = /already|application|exists/i.test(message);
            res.status(alreadyApplied ? 400 : 500).json({
                error: alreadyApplied ? 'このギルドには既に申請済みです。' : '加入申請の送信に失敗しました。',
                details: error?.errorMessage || error?.message
            });
        }
    });

    // ----------------------------------------------------
    // API: ギルドを作成
    // ----------------------------------------------------
    app.post('/api/create-guild', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) {
            return res.status(400).json({ error: 'IDがありません。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド作成] ${playFabId} がギルドを作成します...`);

        try {
            const ownerPlayFabId = requesterPlayFabId;
            const requesterLevel = await getPlayerLevel(ownerPlayFabId);
            const kingContext = await getKingGuildContext(ownerPlayFabId);
            const isNationGuild = !!kingContext.isKing;
            const guildType = isNationGuild ? 'nation' : 'pirate';
            const guildKindLabel = isNationGuild ? '国ギルド' : '海賊団';
            const ownerTitle = isNationGuild ? '王' : '船長';
            if (!isNationGuild && requesterLevel < CREW_UNLOCK_LEVEL) {
                return res.status(403).json({ error: `海賊団の設立は船長以上（Lv.${CREW_UNLOCK_LEVEL}+）で利用できます。` });
            }

            const balance = await economy.getCurrencyBalance(ownerPlayFabId, 'PS', economyDeps).catch(() => null);
            if (Number.isFinite(balance) && balance < CREW_FOUNDING_COST) {
                return res.status(402).json({
                    error: `${guildKindLabel}の設立には${CREW_FOUNDING_COST.toLocaleString('ja-JP')}G必要です。`,
                    cost: CREW_FOUNDING_COST,
                    balance
                });
            }

            const entityKey = await resolvePlayerEntityKey(ownerPlayFabId);
            if (!entityKey?.Id || !entityKey?.Type) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const membership = await resolveCompanionGuildMembership(entityKey, ownerPlayFabId, kingContext);
            if (membership.selected) {
                return res.status(400).json({ error: '既にギルドに所属しています。' });
            }

            const captainName = await getPlayerDisplayName(ownerPlayFabId);
            const guildNation = isNationGuild ? kingContext.nationKey : await getPlayerStoredNation(ownerPlayFabId).catch(() => '');
            const parentNationMeta = await getParentNationGroupMeta(guildNation);
            if (!isNationGuild && requestedGuildName.length > 30) {
                return res.status(400).json({ error: '海賊団名は30文字以内で入力してください。' });
            }
            const guildName = isNationGuild
                ? buildNationGuildName(kingContext.nationKey)
                : (requestedGuildName || `${captainName.replace(/海賊団$/u, '').slice(0, 25)}海賊団`);

            await economy.subtractEconomyItem(ownerPlayFabId, 'PS', CREW_FOUNDING_COST, economyDeps);

            // ギルドを作成
            const createResult = await callTitleScopedApi(PlayFabGroups.CreateGroup, {
                GroupName: guildName,
                Entity: entityKey
            });

            const guildId = createResult.Group.Id;

            // 初期ギルドデータを保存
            const initialGuildData = {
                name: guildName,
                guildType,
                isNationGuild,
                nation: guildNation || null,
                parentNationGroupId: parentNationMeta.parentNationGroupId || '',
                parentNationGroupName: parentNationMeta.parentNationGroupName || '',
                ownerTitle,
                level: 1,
                exp: 0,
                treasury: 0,
                warehouse: [],
                pendingApplications: [],
                chatMessages: [], // チャットメッセージ履歴
                ownerPlayFabId,
                ownerEntityId: entityKey.Id,
                captainName,
                maxCompanions: MAX_CREW_COMPANIONS,
                crewRoles: {},
                memberPlayFabIds: {
                    [entityKey.Id]: normalizePlayFabId(ownerPlayFabId)
                },
                recruitment: {
                    isOpen: false,
                    roleIds: [],
                    message: '',
                    updatedAt: new Date().toISOString()
                },
                guildShipId: `guild_ship_${guildId}`
            };
            await saveGuildData(guildId, initialGuildData, promisifyPlayFab);

            try {
                const db = admin.firestore();
                const shipDocId = `guild_ship_${guildId}`;
                const shipRef = db.collection('ships').doc(shipDocId);
                const existing = await shipRef.get();
                if (!existing.exists) {
                    let mapId = null;
                    let spawnPos = { x: 100, y: 100 };
                    try {
                        const playerShipSnap = await db.collection('ships').doc(ownerPlayFabId).get();
                        if (playerShipSnap.exists) {
                            const data = playerShipSnap.data() || {};
                            mapId = data.mapId || null;
                            const pos = data.position || { x: data.currentX, y: data.currentY };
                            if (Number.isFinite(Number(pos?.x)) && Number.isFinite(Number(pos?.y))) {
                                spawnPos = { x: Number(pos.x), y: Number(pos.y) };
                            }
                        }
                    } catch (error) {
                        console.warn('[GuildShip] Failed to read player ship position:', error?.message || error);
                    }

                    let nationKey = isNationGuild ? kingContext.nationKey : null;
                    let sailColor = 'white';
                    try {
                        const userReadOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                            PlayFabId: ownerPlayFabId,
                            Keys: ['Nation', 'Race', 'AvatarColor']
                        });
                        nationKey = nationKey || normalizeNationKey(userReadOnly?.Data?.Nation?.Value);
                        const rawColor = String(userReadOnly?.Data?.AvatarColor?.Value || '').toLowerCase();
                        const colorKey = rawColor === 'red' || rawColor === 'blue' || rawColor === 'yellow' || rawColor === 'green'
                            ? rawColor
                            : null;
                        sailColor = colorKey || sailColor;
                        if (!colorKey && nationKey) {
                            if (nationKey === 'fire') sailColor = 'red';
                            if (nationKey === 'earth') sailColor = 'green';
                            if (nationKey === 'wind') sailColor = 'yellow';
                            if (nationKey === 'water') sailColor = 'blue';
                        }
                    } catch (error) {
                        console.warn('[GuildShip] Failed to resolve nation color:', error?.message || error);
                    }

                    const geo = worldToLatLng(spawnPos);
                    const geohash = geohashForLocation([geo.lat, geo.lng]);

                    const maxHp = 5000;
                    await shipRef.set({
                        shipId: shipDocId,
                        playFabId: null,
                        ownerId: ownerPlayFabId,
                        ownerPlayFabId,
                        guildId: guildId,
                        mapId: mapId,
                        nation: nationKey,
                        guildType,
                        isNationGuild,
                        ownerTitle,
                        isGuildShip: true,
                        guildShip: true,
                        shipClass: 'defender',
                        maxHp: maxHp,
                        currentHp: maxHp,
                        isDestroyed: false,
                        displayName: isNationGuild ? buildNationKingShipName(kingContext.nationKey) : `${guildName}号`,
                        appearance: {
                            shipType: 'guild',
                            domain: 'sea_surface',
                            color: sailColor
                        },
                        position: { x: spawnPos.x, y: spawnPos.y },
                        currentX: spawnPos.x,
                        currentY: spawnPos.y,
                        targetX: spawnPos.x,
                        targetY: spawnPos.y,
                        arrivalTime: Date.now(),
                        speed: 0,
                        shipVisionRange: 260,
                        movement: {
                            isMoving: false,
                            departureTime: null,
                            arrivalTime: null,
                            departurePos: null,
                            destinationPos: null
                        },
                        geohash: geohash,
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (error) {
                console.warn('[GuildShip] Failed to create guild ship:', error?.message || error);
            }

            console.log(`[ギルド作成] 成功: ${guildName} (ID: ${guildId})`);

            res.json({
                success: true,
                guildId: guildId,
                guildName,
                guildType,
                isNationGuild,
                nation: isNationGuild ? kingContext.nationKey : null,
                ownerTitle,
                cost: CREW_FOUNDING_COST
            });

        } catch (error) {
            console.error('[ギルド作成エラー]', error.errorMessage || error.message);

            // エラーメッセージを解析してユーザーフレンドリーなメッセージを返す
            let errorMsg = 'ギルドの設立に失敗しました。';
            let statusCode = 500;
            if (error.errorMessage && error.errorMessage.includes('already exists')) {
                errorMsg = '同じ名前のギルドが既に存在します。';
            }
            if (error.apiErrorInfo && error.apiErrorInfo.apiError === 'InsufficientFunds') {
                errorMsg = `ギルドの設立には${CREW_FOUNDING_COST.toLocaleString('ja-JP')}G必要です。`;
                statusCode = 402;
            }

            res.status(statusCode).json({ error: errorMsg, details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドに加入
    // ----------------------------------------------------
    app.post('/api/join-guild', async (req, res) => {
        const { playFabId, guildId } = req.body;
        const requestedRoleId = normalizeCrewRoleId(req.body?.crewRoleId || req.body?.roleId);
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }
        if (!requestedRoleId) {
            return res.status(400).json({ error: '役職を選んでください。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド加入] ${playFabId} がギルド ${guildId} に加入申請します...`);

        try {
            const entityKey = await resolvePlayerEntityKey(requesterPlayFabId);
            if (!entityKey?.Id || !entityKey?.Type) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const kingContext = await getKingGuildContext(requesterPlayFabId);
            if (kingContext.isKing) {
                return res.status(400).json({ error: '王は王直属の国ギルドのみ管理できます。' });
            }

            const membership = await resolveCompanionGuildMembership(entityKey, requesterPlayFabId, kingContext);
            if (membership.selected) {
                return res.status(400).json({ error: '既にギルドに所属しています。' });
            }

            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            const guildData = await getGuildData(guildId, promisifyPlayFab);
            if (isSystemNationGroupEntry({ Group: { Id: guildId } }, guildData) || !hasCompanionGuildData(guildData)) {
                return res.status(400).json({ error: 'このQRは仲間ギルド用ではありません。' });
            }
            const roleAssignments = getCrewRoleAssignments(guildData);
            const maxCompanions = Math.max(1, Number(guildData.maxCompanions || MAX_CREW_COMPANIONS) || MAX_CREW_COMPANIONS);
            if (Object.keys(roleAssignments).length >= maxCompanions) {
                return res.status(400).json({ error: `仲間は最大${maxCompanions}名までです。` });
            }
            if (Object.values(roleAssignments).map(normalizeCrewRoleId).includes(requestedRoleId)) {
                const roleLabel = CREW_ROLE_BY_ID[requestedRoleId]?.label || '選択した役職';
                return res.status(400).json({ error: `${roleLabel}はすでに同じギルド内で使われています。` });
            }

            // 勧誘QR経由の加入として、役職を確定してからメンバー追加する
            try {
                await callTitleScopedApi(PlayFabGroups.AddMembers, {
                    Group: groupEntity,
                    Members: [entityKey],
                    RoleId: 'members' // デフォルトのメンバーロール
                });

                const normalizedRequesterId = normalizePlayFabId(requesterPlayFabId);
                roleAssignments[normalizedRequesterId] = requestedRoleId;
                guildData.crewRoles = roleAssignments;
                guildData.maxCompanions = maxCompanions;
                setGuildMemberPlayFabMapEntry(guildData, entityKey, requesterPlayFabId);

                console.log(`[ギルド加入] 成功: ${requesterPlayFabId} がギルド ${guildId} に ${requestedRoleId} として加入しました。`);

                // ギルド名を取得
                let guildName = 'Unknown Guild';
                try {
                    const groupResult = await callTitleScopedApi(PlayFabGroups.GetGroup, {
                        Group: groupEntity
                    });
                    guildName = groupResult.GroupName || 'Unknown Guild';
                } catch (e) {
                    console.warn('[ギルド加入] ギルド名の取得に失敗しました。', e.message);
                }

                await syncCrewRecruitmentPost(guildId, guildName, guildData).catch((syncError) => {
                    console.warn('[ギルド加入] 募集掲示板の同期に失敗しました。', syncError?.message || syncError);
                });
                await saveGuildData(guildId, guildData, promisifyPlayFab);
                let nationSync = null;
                try {
                    nationSync = await syncGuildMemberNationToMaster(requesterPlayFabId, guildData);
                } catch (syncError) {
                    nationSync = { updated: false, error: syncError?.errorMessage || syncError?.message || String(syncError) };
                    console.warn('[ギルド加入] 所属国同期に失敗しました。', nationSync.error);
                }

                res.json({
                    success: true,
                    guildId: guildId,
                    guildName: guildName,
                    crewRoleId: requestedRoleId,
                    crewRoleLabel: CREW_ROLE_BY_ID[requestedRoleId]?.label || '',
                    crewGameLabel: CREW_ROLE_BY_ID[requestedRoleId]?.gameLabel || '',
                    crewIconKey: CREW_ROLE_BY_ID[requestedRoleId]?.iconKey || '',
                    nation: nationSync?.nation || undefined,
                    avatarColor: nationSync?.avatarColor || undefined,
                    nationSyncError: nationSync?.error || undefined
                });

            } catch (addError) {
                console.error('[ギルド加入] AddMembers失敗:', addError?.errorMessage || addError?.message || addError);
                throw addError;
            }

        } catch (error) {
            console.error('[ギルド加入エラー]', error.errorMessage || error.message);

            let errorMsg = 'ギルドへの加入に失敗しました。';
            if (error.errorMessage && error.errorMessage.includes('not found')) {
                errorMsg = 'ギルドが見つかりませんでした。';
            }

            res.status(500).json({ error: errorMsg, details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドから脱退
    // ----------------------------------------------------
    app.post('/api/leave-guild', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド脱退] ${playFabId} がギルドから脱退します...`);

        try {
            const entityKey = await resolvePlayerEntityKey(requesterPlayFabId);
            if (!entityKey?.Id || !entityKey?.Type) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const kingContext = await getKingGuildContext(requesterPlayFabId);
            const membership = await resolveCompanionGuildMembership(entityKey, requesterPlayFabId, kingContext);
            const selectedGuild = membership.selected;
            if (!selectedGuild) {
                return res.status(400).json({ error: 'ギルドに所属していません。' });
            }

            const guildId = selectedGuild.guildId;

            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            // ギルドから脱退
            await callTitleScopedApi(PlayFabGroups.RemoveMembers, {
                Group: groupEntity,
                Members: [entityKey]
            });

            const guildData = selectedGuild.guildData;
            const roleAssignments = getCrewRoleAssignments(guildData);
            delete roleAssignments[normalizePlayFabId(requesterPlayFabId)];
            guildData.crewRoles = roleAssignments;
            const memberMap = getGuildMemberPlayFabMap(guildData);
            delete memberMap[String(entityKey.Id || '').trim()];
            guildData.memberPlayFabIds = memberMap;
            await syncCrewRecruitmentPost(guildId, await getGuildName(guildId), guildData).catch((syncError) => {
                console.warn('[ギルド脱退] 募集掲示板の同期に失敗しました。', syncError?.message || syncError);
            });
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド脱退] 成功: ${playFabId} がギルド ${guildId} から脱退しました。`);

            res.json({
                success: true,
                message: 'ギルドから脱退しました。'
            });

        } catch (error) {
            console.error('[ギルド脱退エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルドからの脱退に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドメンバー一覧を取得
    // ----------------------------------------------------
    app.post('/api/get-guild-members', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルドメンバー取得] ギルド ${guildId} のメンバー一覧を取得します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            // ギルドメンバーを取得
            const membersResult = await callTitleScopedApi(PlayFabGroups.ListGroupMembers, {
                Group: groupEntity
            });

            if (!membersResult.Members || membersResult.Members.length === 0) {
                console.log(`[ギルドメンバー取得] ギルド ${guildId} にメンバーがいません。`);
                return res.json({ members: [] });
            }

            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const roleAssignments = getCrewRoleAssignments(guildData);
            const ownerTitle = getGuildOwnerTitle(guildData);
            const guildOwnerId = normalizePlayFabId(guildData?.ownerPlayFabId);
            const guildOwnerEntityId = String(guildData?.ownerEntityId || '').trim();

            // メンバー情報を整形
            const members = [];
            for (const roleGroup of membersResult.Members) {
                const roleName = roleGroup.RoleId || 'members';
                const roleMembers = Array.isArray(roleGroup.Members) ? roleGroup.Members : [];
                for (const member of roleMembers) {
                    const key = member?.Key || member?.EntityKey || member;
                    const entityId = String(key?.Id || '').trim();
                    if (!entityId) continue;
                    const memberPlayFabId = resolveGuildMemberPlayFabId(entityId, guildData);
                    const isOwnerMember = (guildOwnerId && guildOwnerId === normalizePlayFabId(memberPlayFabId))
                        || (guildOwnerEntityId && guildOwnerEntityId === entityId);
                    const memberRoleLabel = isOwnerMember ? ownerTitle : (roleName === 'admins' ? '船長' : 'メンバー');
                    const crewRoleId = normalizeCrewRoleId(roleAssignments[normalizePlayFabId(memberPlayFabId)]);
                    const crewRole = CREW_ROLE_BY_ID[crewRoleId] || null;

                    try {
                        const [profileResult, statsResult] = await Promise.all([
                            promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                                PlayFabId: memberPlayFabId,
                                ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                            }),
                            promisifyPlayFab(PlayFabServer.GetPlayerStatistics, { PlayFabId: memberPlayFabId }).catch(() => null)
                        ]);
                        const statsMap = buildStatsMapFromStatistics(statsResult?.Statistics || []);
                        const derived = applyDerivedPlayerLevelToStats(statsMap);
                        const memberLevel = Math.max(1, Math.floor(Number(derived?.stats?.Level || statsMap.Level || 1) || 1));

                        if (profileResult.PlayerProfile) {
                            members.push({
                                playFabId: memberPlayFabId,
                                displayName: profileResult.PlayerProfile.DisplayName || 'Unknown',
                                avatarUrl: profileResult.PlayerProfile.AvatarUrl || null,
                                role: memberRoleLabel,
                                crewRoleId,
                                crewRoleLabel: crewRole?.label || '',
                                crewGameLabel: crewRole?.gameLabel || '',
                                crewIconKey: crewRole?.iconKey || '',
                                crewRankLevel: crewRole ? getCrewRankLevel(memberLevel) : 0,
                                crewRankDecorationClass: crewRole ? getCrewRankDecorationClass(memberLevel) : '',
                                crewRankTitle: crewRole ? getCrewRankTitle(crewRoleId, memberLevel) : '',
                                level: memberLevel
                            });
                        }
                    } catch (profileError) {
                        console.warn(`[ギルドメンバー取得] Entity ${entityId} のプロフィール取得に失敗:`, profileError.message);
                        members.push({
                            playFabId: memberPlayFabId,
                            displayName: 'Unknown',
                            avatarUrl: null,
                            role: memberRoleLabel,
                            crewRoleId,
                            crewRoleLabel: crewRole?.label || '',
                            crewGameLabel: crewRole?.gameLabel || '',
                            crewIconKey: crewRole?.iconKey || '',
                            crewRankLevel: crewRole ? getCrewRankLevel(1) : 0,
                            crewRankDecorationClass: crewRole ? getCrewRankDecorationClass(1) : '',
                            crewRankTitle: crewRole ? getCrewRankTitle(crewRoleId, 1) : ''
                        });
                    }
                }
            }

            console.log(`[ギルドメンバー取得] 成功: ${members.length} 人のメンバーを取得しました。`);

            res.json({
                members: members
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルドメンバー取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'メンバー一覧の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請一覧を取得（リーダー用）
    // ----------------------------------------------------
    app.post('/api/get-guild-applications', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[加入申請取得] ギルド ${guildId} の加入申請を取得します...`);

        try {
            const guildData = await assertGuildOwner(requesterPlayFabId, guildId);
            const groupEntity = { Id: guildId, Type: 'group' };
            const storedPending = getPendingApplications(guildData);
            const storedByEntity = new Map(storedPending.map((entry) => [String(entry.entityId || ''), entry]));
            const storedByPlayer = new Map(storedPending.map((entry) => [normalizePlayFabId(entry.playFabId), entry]));
            const applicationMap = new Map();

            function addApplication(entry) {
                const role = CREW_ROLE_BY_ID[entry.crewRoleId] || null;
                const key = normalizePlayFabId(entry.playFabId) || String(entry.entityId || '');
                if (!key) return;
                applicationMap.set(key, {
                    playFabId: entry.playFabId || entry.entityId,
                    entityId: entry.entityId || '',
                    displayName: entry.displayName || entry.playFabId || entry.entityId || 'Unknown',
                    avatarUrl: entry.avatarUrl || null,
                    appliedAt: entry.appliedAt || new Date().toISOString(),
                    crewRoleId: entry.crewRoleId || '',
                    crewRoleLabel: role?.label || '',
                    crewGameLabel: role?.gameLabel || '',
                    crewIconKey: role?.iconKey || ''
                });
            }

            storedPending.forEach(addApplication);

            // PlayFab Groups APIで申請リストを取得
            const applicationsResult = await callTitleScopedApi(PlayFabGroups.ListGroupApplications, {
                Group: groupEntity
            }).catch((error) => {
                console.warn('[加入申請取得] PlayFab申請リストの取得に失敗:', error?.errorMessage || error?.message || error);
                return null;
            });

            if (applicationsResult?.Applications && applicationsResult.Applications.length > 0) {
                for (const app of applicationsResult.Applications) {
                    const entityId = String(app?.Entity?.Id || '').trim();
                    const stored = storedByEntity.get(entityId) || storedByPlayer.get(normalizePlayFabId(entityId)) || null;

                    try {
                        const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                            PlayFabId: stored?.playFabId || entityId,
                            ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                        });

                        if (profileResult.PlayerProfile) {
                            addApplication({
                                playFabId: stored?.playFabId || entityId,
                                entityId,
                                displayName: profileResult.PlayerProfile.DisplayName || 'Unknown',
                                avatarUrl: profileResult.PlayerProfile.AvatarUrl || null,
                                appliedAt: stored?.appliedAt || app.Created || new Date().toISOString(),
                                crewRoleId: stored?.crewRoleId || ''
                            });
                        }
                    } catch (profileError) {
                        console.warn(`[加入申請取得] Entity ${entityId} のプロフィール取得に失敗:`, profileError.message);
                        addApplication({
                            ...(stored || {}),
                            playFabId: stored?.playFabId || entityId,
                            entityId,
                            appliedAt: stored?.appliedAt || app.Created || new Date().toISOString()
                        });
                    }
                }
            }

            const applications = Array.from(applicationMap.values());

            console.log(`[加入申請取得] 成功: ${applications.length} 件の申請を取得しました。`);

            res.json({
                applications: applications
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[加入申請取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請を承認
    // ----------------------------------------------------
    app.post('/api/approve-guild-application', async (req, res) => {
        const { playFabId, guildId, applicantId } = req.body;
        const requestedRoleId = normalizeCrewRoleId(req.body?.crewRoleId || req.body?.roleId);
        if (!playFabId || !guildId || !applicantId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[加入申請承認] ${applicantId} の申請を承認します...`);

        try {
            const guildData = await assertGuildOwner(requesterPlayFabId, guildId);
            const pending = findPendingApplication(guildData, applicantId);
            const approvedRoleId = requestedRoleId || normalizeCrewRoleId(pending?.crewRoleId);
            if (!approvedRoleId) {
                return res.status(400).json({ error: '承認する役職を選んでください。' });
            }
            const roleAssignments = getCrewRoleAssignments(guildData);
            const maxCompanions = Math.max(1, Number(guildData.maxCompanions || MAX_CREW_COMPANIONS) || MAX_CREW_COMPANIONS);
            if (Object.keys(roleAssignments).length >= maxCompanions) {
                return res.status(400).json({ error: `仲間は最大${maxCompanions}名までです。` });
            }
            if (Object.values(roleAssignments).map(normalizeCrewRoleId).includes(approvedRoleId)) {
                const roleLabel = CREW_ROLE_BY_ID[approvedRoleId]?.label || '選択した役職';
                return res.status(400).json({ error: `${roleLabel}はすでに同じギルド内で使われています。` });
            }

            // 申請者のEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: applicantId,
                ProfileConstraints: { ShowLinkedAccounts: true, ShowEntity: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: '申請者情報の取得に失敗しました。' });
            }

            const applicantEntityKey = {
                Id: pending?.entityId || entityResult.PlayerProfile.Entity?.Id || entityResult.PlayerProfile.PlayerId,
                Type: pending?.entityType || entityResult.PlayerProfile.Entity?.Type || 'title_player_account'
            };

            const groupEntity = { Id: guildId, Type: 'group' };
            const applicantKingContext = await getKingGuildContext(applicantId);
            if (applicantKingContext.isKing) {
                return res.status(400).json({ error: '王は王直属の国ギルドのみ管理できます。' });
            }
            const applicantMembership = await resolveCompanionGuildMembership(applicantEntityKey, applicantId, applicantKingContext).catch(() => null);
            if (applicantMembership?.selected) {
                return res.status(400).json({ error: '申請者は既にギルドに所属しています。' });
            }

            // 申請を承認
            await callTitleScopedApi(PlayFabGroups.AcceptGroupApplication, {
                Group: groupEntity,
                Entity: applicantEntityKey
            });

            roleAssignments[normalizePlayFabId(applicantId)] = approvedRoleId;
            guildData.crewRoles = roleAssignments;
            setGuildMemberPlayFabMapEntry(guildData, applicantEntityKey, applicantId);
            removePendingApplication(guildData, applicantId);
            await syncCrewRecruitmentPost(guildId, await getGuildName(guildId), guildData).catch((syncError) => {
                console.warn('[加入申請承認] 募集掲示板の同期に失敗しました。', syncError?.message || syncError);
            });
            await saveGuildData(guildId, guildData, promisifyPlayFab);
            let nationSync = null;
            try {
                nationSync = await syncGuildMemberNationToMaster(applicantId, guildData);
            } catch (syncError) {
                nationSync = { updated: false, error: syncError?.errorMessage || syncError?.message || String(syncError) };
                console.warn('[加入申請承認] 所属国同期に失敗しました。', nationSync.error);
            }

            console.log(`[加入申請承認] 成功: ${applicantId} をギルドに追加しました。`);

            res.json({
                success: true,
                message: '加入申請を承認しました。',
                crewRoleId: approvedRoleId,
                crewRoleLabel: CREW_ROLE_BY_ID[approvedRoleId]?.label || '',
                nation: nationSync?.nation || undefined,
                avatarColor: nationSync?.avatarColor || undefined,
                nationSyncError: nationSync?.error || undefined
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[加入申請承認エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の承認に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請を拒否
    // ----------------------------------------------------
    app.post('/api/reject-guild-application', async (req, res) => {
        const { playFabId, guildId, applicantId } = req.body;
        if (!playFabId || !guildId || !applicantId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[加入申請拒否] ${applicantId} の申請を拒否します...`);

        try {
            const guildData = await assertGuildOwner(requesterPlayFabId, guildId);
            const pending = findPendingApplication(guildData, applicantId);
            // 申請者のEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: applicantId,
                ProfileConstraints: { ShowLinkedAccounts: true, ShowEntity: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: '申請者情報の取得に失敗しました。' });
            }

            const applicantEntityKey = {
                Id: pending?.entityId || entityResult.PlayerProfile.Entity?.Id || entityResult.PlayerProfile.PlayerId,
                Type: pending?.entityType || entityResult.PlayerProfile.Entity?.Type || 'title_player_account'
            };

            const groupEntity = { Id: guildId, Type: 'group' };

            // 申請を拒否（削除）
            await callTitleScopedApi(PlayFabGroups.RemoveGroupApplication, {
                Group: groupEntity,
                Entity: applicantEntityKey
            });

            removePendingApplication(guildData, applicantId);
            await syncCrewRecruitmentPost(guildId, await getGuildName(guildId), guildData).catch((syncError) => {
                console.warn('[加入申請拒否] 募集掲示板の同期に失敗しました。', syncError?.message || syncError);
            });
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[加入申請拒否] 成功: ${applicantId} の申請を削除しました。`);

            res.json({
                success: true,
                message: '加入申請を拒否しました。'
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[加入申請拒否エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の拒否に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドチャットメッセージを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-chat', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルドチャット取得] ギルド ${guildId} のチャットを取得します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const messages = guildData.chatMessages || [];

            // 最新100件のみ返す
            const recentMessages = messages.slice(-100);

            res.json({
                messages: recentMessages
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルドチャット取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'チャットメッセージの取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドチャットメッセージを送信
    // ----------------------------------------------------
    app.post('/api/send-guild-chat', async (req, res) => {
        const { playFabId, guildId, message } = req.body;
        if (!playFabId || !guildId || !message) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        if (message.trim().length === 0) {
            return res.status(400).json({ error: 'メッセージを入力してください。' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'メッセージは500文字以内で入力してください。' });
        }

        console.log(`[ギルドチャット送信] ${playFabId} がメッセージを送信します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            // プレイヤー名を取得
            const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
            });

            const displayName = profileResult.PlayerProfile.DisplayName || 'Unknown';
            const avatarUrl = profileResult.PlayerProfile.AvatarUrl || null;

            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 新しいメッセージを追加
            const newMessage = {
                playFabId: playFabId,
                displayName: displayName,
                avatarUrl: avatarUrl,
                message: message.trim(),
                timestamp: new Date().toISOString()
            };

            guildData.chatMessages = guildData.chatMessages || [];
            guildData.chatMessages.push(newMessage);

            // メッセージは最新1000件のみ保持
            if (guildData.chatMessages.length > 1000) {
                guildData.chatMessages = guildData.chatMessages.slice(-1000);
            }

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルドチャット送信] 成功: メッセージを保存しました。`);

            res.json({
                success: true,
                message: newMessage
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルドチャット送信エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'メッセージの送信に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫のアイテムを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-warehouse', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド倉庫取得] ギルド ${guildId} の倉庫を取得します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const warehouse = guildData.warehouse || [];

            res.json({
                warehouse: warehouse,
                treasury: guildData.treasury || 0
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルド倉庫取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド倉庫の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫にアイテムを寄付
    // ----------------------------------------------------
    app.post('/api/donate-to-guild-warehouse', async (req, res) => {
        const { playFabId, guildId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !guildId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド倉庫寄付] ${playFabId} がアイテムを寄付します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            // プレイヤーからアイテムを消費
            await economy.subtractEconomyItem(playFabId, itemId, 1, economyDeps);

            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 倉庫にアイテムを追加
            const donatedItem = {
                itemId: itemId,
                donatedBy: playFabId,
                donatedAt: new Date().toISOString()
            };

            guildData.warehouse = guildData.warehouse || [];
            guildData.warehouse.push(donatedItem);

            // ギルド経験値を追加（寄付のボーナス）
            guildData.exp = (guildData.exp || 0) + 10;

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド倉庫寄付] 成功: アイテムを寄付しました。`);

            res.json({
                success: true,
                message: 'アイテムをギルド倉庫に寄付しました。',
                guildExp: guildData.exp
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルド倉庫寄付エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'アイテムの寄付に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫からアイテムを取得
    // ----------------------------------------------------
    app.post('/api/withdraw-from-guild-warehouse', async (req, res) => {
        const { playFabId, guildId, warehouseIndex } = req.body;
        if (!playFabId || !guildId || warehouseIndex === undefined) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド倉庫引き出し] ${playFabId} がアイテムを引き出します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            if (!guildData.warehouse || !guildData.warehouse[warehouseIndex]) {
                return res.status(400).json({ error: '指定されたアイテムが見つかりません。' });
            }

            const item = guildData.warehouse[warehouseIndex];

            // プレイヤーにアイテムを付与
            await economy.addEconomyItem(playFabId, item.itemId, 1, economyDeps);

            // 倉庫からアイテムを削除
            guildData.warehouse.splice(warehouseIndex, 1);

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド倉庫引き出し] 成功: アイテムを引き出しました。`);

            res.json({
                success: true,
                message: 'アイテムをギルド倉庫から引き出しました。'
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルド倉庫引き出しエラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'アイテムの引き出しに失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドランキングを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-ranking', async (req, res) => {
        console.log('[ギルドランキング取得] ギルドランキングを取得します...');

        try {
            // すべてのギルドを取得してランキングを作成する
            // 注意: PlayFab Groups APIにはギルド一覧を取得するAPIがないため、
            // 実際のシステムでは別途ギルド一覧を管理する必要があります
            // ここでは簡易実装として、リクエストした際にエラーを返します

            // TODO: 本格的な実装では、Firestore等にギルド一覧を保存し、
            // それをベースにランキングを生成する必要があります

            res.json({
                ranking: [],
                message: 'ギルドランキング機能は現在開発中です。'
            });

        } catch (error) {
            console.error('[ギルドランキング取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルドランキングの取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドに経験値を追加（イベント報酬などで使用）
    // ----------------------------------------------------
    app.post('/api/add-guild-exp', async (req, res) => {
        const { playFabId, guildId, exp } = req.body;
        if (!playFabId || !guildId || !exp) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }
        const requesterPlayFabId = await requireAuthedPlayFabId(req, res, playFabId);
        if (!requesterPlayFabId) return;

        console.log(`[ギルド経験値追加] ギルド ${guildId} に ${exp} EXP を追加します...`);

        try {
            await assertGuildMembership(requesterPlayFabId, guildId);
            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 経験値を追加
            const oldExp = guildData.exp || 0;
            const newExp = oldExp + exp;
            guildData.exp = newExp;

            // レベルアップチェック
            const oldLevel = calculateGuildLevel(oldExp);
            const newLevel = calculateGuildLevel(newExp);

            const leveledUp = newLevel > oldLevel;

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド経験値追加] 成功: ${oldExp} -> ${newExp} EXP${leveledUp ? ` (Lv.${oldLevel} -> Lv.${newLevel})` : ''}`);

            res.json({
                success: true,
                oldExp: oldExp,
                newExp: newExp,
                oldLevel: oldLevel,
                newLevel: newLevel,
                leveledUp: leveledUp
            });

        } catch (error) {
            if (handleGuildAccessError(res, error)) return;
            console.error('[ギルド経験値追加エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド経験値の追加に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    console.log('[ギルドAPI] ギルド関連のAPIルートを初期化しました。');
}

module.exports = {
    initializeGuildRoutes,
    __test: {
        getNationGroupName,
        isSystemNationGroupName,
        isSystemNationGroupEntry,
        hasCompanionGuildData,
        resolveGuildNationKey,
        selectCompanionGuildCandidate,
        resolveGuildMemberPlayFabId,
        setGuildMemberPlayFabMapEntry
    }
};
