const PlayFab = require('playfab-sdk');
const PlayFabServer = PlayFab.PlayFabServer || require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
const PlayFabAdmin = PlayFab.PlayFabAdmin || require('playfab-sdk/Scripts/PlayFab/PlayFabAdmin');
const PlayFabAuthentication = PlayFab.PlayFabAuthentication || require('playfab-sdk/Scripts/PlayFab/PlayFabAuthentication');
const PlayFabGroups = PlayFab.PlayFabGroups || require('playfab-sdk/Scripts/PlayFab/PlayFabGroups');
const PlayFabData = PlayFab.PlayFabData || require('playfab-sdk/Scripts/PlayFab/PlayFabData');
const PlayFabEconomy = PlayFab.PlayFabEconomy || require('playfab-sdk/Scripts/PlayFab/PlayFabEconomy');

let _titleEntityTokenReady = false;

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

async function ensureTitleEntityToken() {
    if (_titleEntityTokenReady && PlayFab._internalSettings?.entityToken) return;
    const tokenResult = await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});
    const entityToken = tokenResult?.EntityToken;
    if (entityToken && PlayFab?._internalSettings) {
        PlayFab._internalSettings.entityToken = entityToken;
    }
    _titleEntityTokenReady = true;
}

async function getGroupDataValue(groupId, key) {
    if (!groupId || !key) return null;
    await ensureTitleEntityToken();
    const result = await promisifyPlayFab(PlayFabData.GetObjects, {
        Entity: { Id: groupId, Type: 'group' }
    });
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
    await ensureTitleEntityToken();
    const objects = Object.entries(values || {}).map(([key, value]) => ({
        ObjectName: key,
        DataObject: String(value)
    }));
    return promisifyPlayFab(PlayFabData.SetObjects, {
        Entity: { Id: groupId, Type: 'group' },
        Objects: objects
    });
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
    getGroupDataValue,
    setGroupDataValues,
    getEntityKeyFromPlayFabId
};
