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

async function resolveGuildShipContext(playFabId, deps = {}) {
    const requesterPlayFabId = normalizePlayFabId(playFabId);
    const ownContext = {
        requesterPlayFabId,
        shipOwnerPlayFabId: requesterPlayFabId,
        isSharedShip: false,
        guildId: null,
        guildName: null,
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
    if (!ownerPlayFabId) {
        return {
            ...ownContext,
            guildId,
            guildName: group?.GroupName || guildData?.name || null,
            captainName: guildData?.captainName || null
        };
    }

    return {
        requesterPlayFabId,
        shipOwnerPlayFabId: ownerPlayFabId,
        isSharedShip: ownerPlayFabId !== requesterPlayFabId,
        guildId,
        guildName: group?.GroupName || guildData?.name || null,
        captainName: guildData?.captainName || null
    };
}

module.exports = {
    normalizePlayFabId,
    resolveGuildShipContext
};
