const PlayFab = require('playfab-sdk');
const PlayFabServer = PlayFab.PlayFabServer || require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
const PlayFabAdmin = PlayFab.PlayFabAdmin || require('playfab-sdk/Scripts/PlayFab/PlayFabAdmin');
const PlayFabAuthentication = PlayFab.PlayFabAuthentication || require('playfab-sdk/Scripts/PlayFab/PlayFabAuthentication');
const PlayFabGroups = PlayFab.PlayFabGroups || require('playfab-sdk/Scripts/PlayFab/PlayFabGroups');
const PlayFabData = PlayFab.PlayFabData || require('playfab-sdk/Scripts/PlayFab/PlayFabData');
const PlayFabEconomy = PlayFab.PlayFabEconomy || require('playfab-sdk/Scripts/PlayFab/PlayFabEconomy');

let _titleEntityTokenReady = false;
let _titleEntityTokenExpiresAtMs = 0;
let _titleEntityTokenPromise = null;
let _titleEntityKey = null;
const TITLE_ENTITY_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

function configurePlayFab({ titleId, secretKey }) {
    if (titleId) PlayFab.settings.titleId = titleId;
    if (secretKey) PlayFab.settings.developerSecretKey = secretKey;
}

function promisifyPlayFab(apiFunction, request) {
    return new Promise((resolve, reject) => {
        apiFunction(request, (error, result) => {
            if (error) return reject(error);
            if (result && result.data) return resolve(result.data);
            if (result) return resolve(result);
            return reject(new Error('PlayFab call returned no error and no result.'));
        });
    });
}

function parseEntityTokenExpirationMs(value) {
    const expiresAtMs = Date.parse(String(value || ''));
    return Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
}

function hasUsableTitleEntityToken() {
    const entityToken = String(PlayFab?._internalSettings?.entityToken || '').trim();
    if (!_titleEntityTokenReady || !entityToken) return false;
    if (_titleEntityTokenExpiresAtMs <= 0) return true;
    return (Date.now() + TITLE_ENTITY_TOKEN_REFRESH_BUFFER_MS) < _titleEntityTokenExpiresAtMs;
}

async function refreshTitleEntityToken() {
    if (_titleEntityTokenPromise) return _titleEntityTokenPromise;
    _titleEntityTokenPromise = (async () => {
        const tokenResult = await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
        const entityToken = String(tokenResult?.EntityToken || '').trim();
        if (!entityToken) {
            throw new Error('TitleEntityTokenMissing');
        }
        if (PlayFab?._internalSettings) {
            PlayFab._internalSettings.entityToken = entityToken;
        }
        _titleEntityTokenReady = true;
        _titleEntityTokenExpiresAtMs = parseEntityTokenExpirationMs(tokenResult?.TokenExpiration);
        _titleEntityKey = tokenResult?.Entity?.Id && tokenResult?.Entity?.Type
            ? { Id: String(tokenResult.Entity.Id), Type: String(tokenResult.Entity.Type) }
            : null;
        return entityToken;
    })().catch((error) => {
        _titleEntityTokenReady = false;
        _titleEntityTokenExpiresAtMs = 0;
        _titleEntityKey = null;
        if (PlayFab?._internalSettings) {
            PlayFab._internalSettings.entityToken = null;
        }
        throw error;
    }).finally(() => {
        _titleEntityTokenPromise = null;
    });
    return _titleEntityTokenPromise;
}

async function ensureTitleEntityToken(options = {}) {
    if (!options.forceRefresh && hasUsableTitleEntityToken()) return;
    await refreshTitleEntityToken();
}

function isEntityTokenExpiredError(error) {
    const message = [
        error?.error,
        error?.errorMessage,
        error?.message
    ].filter(Boolean).join(' ');
    return /EntityTokenExpired|InvalidEntityToken|EntityTokenMissing|entity token/i.test(message);
}

async function withTitleEntityToken(action, options = {}) {
    if (typeof action !== 'function') {
        throw new TypeError('withTitleEntityToken requires an action function.');
    }
    await ensureTitleEntityToken(options);
    try {
        return await action();
    } catch (error) {
        if (!isEntityTokenExpiredError(error)) {
            throw error;
        }
        await ensureTitleEntityToken({ forceRefresh: true });
        return action();
    }
}

async function getTitleEntityKey(options = {}) {
    await ensureTitleEntityToken(options);
    return _titleEntityKey ? { ..._titleEntityKey } : null;
}

async function getGroupDataValue(groupId, key) {
    if (!groupId || !key) return null;
    const result = await withTitleEntityToken(() => promisifyPlayFab(PlayFabData.GetObjects, {
        Entity: { Id: groupId, Type: 'group' }
    }));
    const objects = result?.Data?.Objects || result?.Objects || {};
    const entry = objects[key];
    if (!entry) return null;
    const dataObject = entry?.DataObject ?? entry?.Object ?? entry;
    if (dataObject == null) return null;
    if (typeof dataObject === 'string') return dataObject;
    if (typeof dataObject === 'number') return String(dataObject);
    if (typeof dataObject === 'object' && dataObject.Value != null) return String(dataObject.Value);
    try {
        return JSON.stringify(dataObject);
    } catch {
        return String(dataObject);
    }
}

async function setGroupDataValues(groupId, values) {
    if (!groupId) return null;
    const objects = Object.entries(values || {}).map(([key, value]) => ({
        ObjectName: key,
        DataObject: String(value)
    }));
    return withTitleEntityToken(() => promisifyPlayFab(PlayFabData.SetObjects, {
        Entity: { Id: groupId, Type: 'group' },
        Objects: objects
    }));
}

async function getEntityKeyFromPlayFabId(playFabId) {
    if (!playFabId) return null;
    try {
        if (typeof PlayFabAdmin?.GetUserAccountInfo === 'function') {
            const accountInfo = await promisifyPlayFab(PlayFabAdmin.GetUserAccountInfo, {
                PlayFabId: playFabId
            });
            const titlePlayerAccount = accountInfo?.UserAccountInfo?.TitleInfo?.TitlePlayerAccount
                || accountInfo?.UserInfo?.TitleInfo?.TitlePlayerAccount
                || accountInfo?.AccountInfo?.TitleInfo?.TitlePlayerAccount
                || null;
            if (titlePlayerAccount?.Id) {
                return { Id: titlePlayerAccount.Id, Type: titlePlayerAccount.Type || 'title_player_account' };
            }
            const titlePlayerAccountId = accountInfo?.UserAccountInfo?.TitleInfo?.TitlePlayerAccountId
                || accountInfo?.AccountInfo?.TitleInfo?.TitlePlayerAccountId
                || null;
            if (titlePlayerAccountId) {
                return { Id: titlePlayerAccountId, Type: 'title_player_account' };
            }
        }
    } catch (error) {
        console.warn('[getEntityKeyFromPlayFabId] Admin.GetUserAccountInfo failed:', error?.errorMessage || error?.message || error);
    }
    try {
        const result = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId
        });
        const entity = result?.PlayerProfile?.Entity || null;
        if (entity?.Id && entity?.Type) return entity;
        const legacyId = result?.PlayerProfile?.EntityId || null;
        const legacyType = result?.PlayerProfile?.EntityType || null;
        if (legacyId && legacyType) return { Id: legacyId, Type: legacyType };
    } catch (error) {
        console.warn('[getEntityKeyFromPlayFabId] GetPlayerProfile failed:', error?.errorMessage || error?.message || error);
    }
    console.warn('[getEntityKeyFromPlayFabId] Entity not found in profile:', playFabId);
    return null;
}

module.exports = {
    PlayFab,
    PlayFabServer,
    PlayFabAdmin,
    PlayFabAuthentication,
    PlayFabGroups,
    PlayFabData,
    PlayFabEconomy,
    configurePlayFab,
    promisifyPlayFab,
    ensureTitleEntityToken,
    withTitleEntityToken,
    getTitleEntityKey,
    isEntityTokenExpiredError,
    getGroupDataValue,
    setGroupDataValues,
    getEntityKeyFromPlayFabId
};
