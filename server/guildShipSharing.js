const { PlayFabGroups, PlayFabData, withTitleEntityToken, getEntityKeyFromPlayFabId } = require('./playfab');

function normalizePlayFabId(value) {
    return String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
}

async function callTitleScoped(apiFunction, request, deps) {
    const promisifyPlayFab = deps?.promisifyPlayFab;
    if (typeof promisifyPlayFab !== 'function') {
        throw new Error('PromisifyPlayFabMissing');
    }
    const runner = typeof deps?.withTitleEntityToken === 'function'
        ? deps.withTitleEntityToken
        : withTitleEntityToken;
    return runner(() => promisifyPlayFab(apiFunction, request));
}

async function resolvePlayerEntityKey(playFabId, deps) {
    const normalizedId = normalizePlayFabId(playFabId);
    if (!normalizedId) return null;

    const resolver = deps?.getEntityKeyFromPlayFabId || getEntityKeyFromPlayFabId;
    if (typeof resolver === 'function') {
        const resolved = await resolver(normalizedId).catch(() => null);
        if (resolved?.Id && resolved?.Type) return resolved;
    }

    const promisifyPlayFab = deps?.promisifyPlayFab;
    const PlayFabServer = deps?.PlayFabServer;
    if (typeof promisifyPlayFab !== 'function' || !PlayFabServer?.GetPlayerProfile) {
        return null;
    }

    const profile = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
        PlayFabId: normalizedId,
        ProfileConstraints: { ShowEntity: true, ShowLinkedAccounts: true }
    }).catch(() => null);
    const entityId = profile?.PlayerProfile?.Entity?.Id || profile?.PlayerProfile?.PlayerId || null;
    const entityType = profile?.PlayerProfile?.Entity?.Type || (entityId ? 'title_player_account' : null);
    return entityId && entityType ? { Id: entityId, Type: entityType } : null;
}

async function getGuildData(guildId, deps) {
    const api = deps?.PlayFabData || PlayFabData;
    if (!guildId || !api?.GetObjects) return {};
    const result = await callTitleScoped(api.GetObjects, {
        Entity: { Id: guildId, Type: 'group' },
        EscapeObject: false
    }, deps).catch(() => null);
    const raw = result?.Objects?.GuildData?.DataObject;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function parseBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

const NATION_KING_LABEL_BY_KEY = {
    fire: '火の王',
    water: '水の王',
    wind: '風の王',
    earth: '地の王'
};

const NATION_GROUP_NAME_BY_KEY = {
    fire: 'nation_fire_island',
    water: 'nation_water_island',
    wind: 'nation_wind_island',
    earth: 'nation_earth_island'
};

const NATION_SAIL_COLOR_BY_KEY = {
    fire: 'red',
    water: 'blue',
    wind: 'yellow',
    earth: 'green'
};

const NATION_KEY_ALIASES = {
    human: 'fire',
    goblin: 'water',
    elf: 'wind',
    orc: 'earth'
};

function normalizeNationKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (NATION_KING_LABEL_BY_KEY[raw]) return raw;
    if (NATION_KEY_ALIASES[raw]) return NATION_KEY_ALIASES[raw];
    const match = /^nation_([a-z]+)_island$/.exec(raw);
    if (match && NATION_KING_LABEL_BY_KEY[match[1]]) return match[1];
    return '';
}

function resolveNationKingLabel(guildData, guildName) {
    const nationKey = normalizeNationKey(guildData?.nation || guildData?.nationKey || guildData?.kingNation);
    if (nationKey) return NATION_KING_LABEL_BY_KEY[nationKey];
    const labelMatch = String(guildName || guildData?.name || '').trim().match(/^(火|水|風|地)の国/);
    if (labelMatch) return `${labelMatch[1]}の王`;
    const captainName = String(guildData?.captainName || '').trim();
    return captainName || '王';
}

function isNationGuildData(guildData) {
    return guildData?.guildType === 'nation' || parseBooleanFlag(guildData?.isNationGuild);
}

function isNationMembershipGroup(groupEntry, guildData = null) {
    const values = [
        groupEntry?.GroupName,
        groupEntry?.Group?.Name,
        guildData?.groupName,
        guildData?.name
    ];
    return values.some((value) => /^nation_(fire|water|wind|earth)_island$/i.test(String(value || '').trim()));
}

function hasShipSharingGuildData(guildData) {
    const ownerPlayFabId = normalizePlayFabId(guildData?.ownerPlayFabId);
    if (!ownerPlayFabId) return false;
    const guildType = String(guildData?.guildType || '').trim().toLowerCase();
    return !guildType
        || guildType === 'nation'
        || guildType === 'pirate'
        || parseBooleanFlag(guildData?.isNationGuild);
}

function resolveGuildShipId(guildId, guildData) {
    const explicit = String(guildData?.guildShipId || '').trim();
    if (explicit) return explicit;
    const id = String(guildId || '').trim();
    return id ? `guild_ship_${id}` : null;
}

function resolveNationGroupEntry(groups, nationKey) {
    const groupName = NATION_GROUP_NAME_BY_KEY[nationKey];
    if (!groupName) return null;
    return (Array.isArray(groups) ? groups : []).find((group) => {
        const names = [
            group?.GroupName,
            group?.Group?.Name
        ].map((value) => String(value || '').trim());
        return names.includes(groupName);
    }) || null;
}

async function resolveNationGroupId(nationKey, groups, deps = {}) {
    const groupName = NATION_GROUP_NAME_BY_KEY[nationKey];
    if (!groupName) return '';
    const groupEntry = resolveNationGroupEntry(groups, nationKey);
    const groupId = String(groupEntry?.Group?.Id || '').trim();
    if (groupId) return groupId;
    const firestore = deps?.firestore;
    if (!firestore?.collection) return '';
    const snap = await firestore.collection('nation_groups').doc(groupName).get().catch(() => null);
    return snap?.exists ? String(snap.data()?.groupId || '').trim() : '';
}

async function resolveKingOwnShipContext(requesterPlayFabId, groups, ownContext, deps = {}) {
    const promisifyPlayFab = deps?.promisifyPlayFab;
    const PlayFabServer = deps?.PlayFabServer;
    if (typeof promisifyPlayFab !== 'function' || !PlayFabServer?.GetUserReadOnlyData) {
        return ownContext;
    }
    const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: requesterPlayFabId,
        Keys: ['IsKing', 'Nation']
    }).catch(() => null);
    const isKing = parseBooleanFlag(readOnly?.Data?.IsKing?.Value);
    const nationKey = normalizeNationKey(readOnly?.Data?.Nation?.Value);
    if (!isKing || !nationKey) return ownContext;

    const groupId = await resolveNationGroupId(nationKey, groups, deps);
    const groupName = NATION_GROUP_NAME_BY_KEY[nationKey];
    const guildId = groupId || groupName;
    const kingShipName = `${NATION_KING_LABEL_BY_KEY[nationKey]}の船`;
    const sailColor = NATION_SAIL_COLOR_BY_KEY[nationKey] || 'white';
    return {
        ...ownContext,
        shipOwnerPlayFabId: requesterPlayFabId,
        isSharedShip: false,
        isGuildShip: true,
        isNationGuild: true,
        guildType: 'nation',
        guildShipId: resolveGuildShipId(guildId, { guildShipId: groupId ? `guild_ship_${groupId}` : '' }),
        guildId,
        guildName: `${NATION_KING_LABEL_BY_KEY[nationKey]}直属ギルド`,
        kingShipName,
        captainName: NATION_KING_LABEL_BY_KEY[nationKey],
        nationKey,
        sailColor,
        appearance: {
            color: sailColor
        }
    };
}

async function resolveGuildShipContext(playFabId, deps = {}) {
    const requesterPlayFabId = normalizePlayFabId(playFabId);
    const ownContext = {
        requesterPlayFabId,
        shipOwnerPlayFabId: requesterPlayFabId,
        isSharedShip: false,
        isGuildShip: false,
        isNationGuild: false,
        guildType: null,
        guildShipId: null,
        guildId: null,
        guildName: null,
        kingShipName: null,
        captainName: null
    };
    if (!requesterPlayFabId) return ownContext;

    const entityKey = await resolvePlayerEntityKey(requesterPlayFabId, deps);
    const groupsApi = deps?.PlayFabGroups || PlayFabGroups;
    if (!entityKey?.Id || !entityKey?.Type || !groupsApi?.ListMembership) {
        return ownContext;
    }

    const membership = await callTitleScoped(groupsApi.ListMembership, { Entity: entityKey }, deps).catch(() => null);
    const groups = Array.isArray(membership?.Groups) ? membership.Groups : [];

    let selected = null;
    for (const group of groups) {
        if (isNationMembershipGroup(group)) continue;
        const guildId = String(group?.Group?.Id || '').trim();
        if (!guildId) continue;
        const guildData = await getGuildData(guildId, deps);
        if (isNationMembershipGroup(group, guildData)) continue;
        if (!hasShipSharingGuildData(guildData)) continue;
        selected = { group, guildId, guildData };
        break;
    }
    if (!selected) {
        return resolveKingOwnShipContext(requesterPlayFabId, groups, ownContext, deps);
    }

    const { group, guildId, guildData } = selected;
    const ownerPlayFabId = normalizePlayFabId(guildData?.ownerPlayFabId);
    const isNationGuild = isNationGuildData(guildData);
    const guildType = isNationGuild ? 'nation' : 'pirate';
    const guildShipId = isNationGuild ? resolveGuildShipId(guildId, guildData) : null;
    const guildName = group?.GroupName || guildData?.name || null;
    const kingShipName = isNationGuild ? `${resolveNationKingLabel(guildData, guildName)}の船` : null;
    if (!ownerPlayFabId) {
        return {
            ...ownContext,
            isGuildShip: isNationGuild,
            isNationGuild,
            guildType,
            guildShipId,
            guildId,
            guildName,
            kingShipName,
            captainName: guildData?.captainName || null
        };
    }

    return {
        requesterPlayFabId,
        shipOwnerPlayFabId: ownerPlayFabId,
        isSharedShip: ownerPlayFabId !== requesterPlayFabId,
        isGuildShip: isNationGuild,
        isNationGuild,
        guildType,
        guildShipId,
        guildId,
        guildName,
        kingShipName,
        captainName: guildData?.captainName || null,
        nationKey: normalizeNationKey(guildData?.nation || guildData?.nationKey || guildData?.kingNation),
        sailColor: guildData?.sailColor || guildData?.appearance?.color || null,
        appearance: guildData?.appearance || null
    };
}

module.exports = {
    normalizePlayFabId,
    resolveGuildShipContext
};
