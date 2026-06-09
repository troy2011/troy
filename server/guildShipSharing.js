const { PlayFabGroups, PlayFabData, withTitleEntityToken, getEntityKeyFromPlayFabId } = require('./playfab');

function normalizePlayFabId(value) {
    return String(value || '').trim().replace(/^playfab:/i, '').toUpperCase();
}

async function callTitleScoped(apiFunction, request, deps) {
    const promisifyPlayFab = deps?.promisifyPlayFab;
    if (typeof promisifyPlayFab !== 'function') {
        throw new Error('PromisifyPlayFabMissing');
    }
    return withTitleEntityToken(() => promisifyPlayFab(apiFunction, request));
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

function resolveGuildShipId(guildId, guildData) {
    const explicit = String(guildData?.guildShipId || '').trim();
    if (explicit) return explicit;
    const id = String(guildId || '').trim();
    return id ? `guild_ship_${id}` : null;
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
    if (groups.length === 0) return ownContext;

    const group = groups[0];
    const guildId = String(group?.Group?.Id || '').trim();
    if (!guildId) return ownContext;

    const guildData = await getGuildData(guildId, deps);
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
        captainName: guildData?.captainName || null
    };
}

module.exports = {
    normalizePlayFabId,
    resolveGuildShipContext
};
