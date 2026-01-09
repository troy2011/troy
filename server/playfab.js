const PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
const PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
const PlayFabAdmin = require('playfab-sdk/Scripts/PlayFab/PlayFabAdmin');
const PlayFabAuthentication = require('playfab-sdk/Scripts/PlayFab/PlayFabAuthentication');
const PlayFabGroups = require('playfab-sdk/Scripts/PlayFab/PlayFabGroups');
const PlayFabData = require('playfab-sdk/Scripts/PlayFab/PlayFabData');
const PlayFabEconomy = require('playfab-sdk/Scripts/PlayFab/PlayFabEconomy');

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
    const result = await promisifyPlayFab(PlayFabGroups.GetGroupData, {
        Group: { Id: groupId, Type: 'group' }
    });
    const data = result?.Data || {};
    const entry = data[key];
    return entry && typeof entry.Value === 'string' ? entry.Value : null;
}

async function setGroupDataValues(groupId, values) {
    if (!groupId) return null;
    await ensureTitleEntityToken();
    return promisifyPlayFab(PlayFabGroups.SetGroupData, {
        Group: { Id: groupId, Type: 'group' },
        Data: values
    });
}

async function getEntityKeyFromPlayFabId(playFabId) {
    if (!playFabId) return null;
    const result = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    const entity = result?.PlayerProfile?.Entity || null;
    if (entity?.Id && entity?.Type) return entity;
    const legacyId = result?.PlayerProfile?.EntityId || null;
    const legacyType = result?.PlayerProfile?.EntityType || null;
    if (legacyId && legacyType) return { Id: legacyId, Type: legacyType };
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
