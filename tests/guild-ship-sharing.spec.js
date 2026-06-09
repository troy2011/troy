const { test, expect } = require('@playwright/test');
const { resolveGuildShipContext } = require('../server/guildShipSharing');

const listMembershipApi = function listMembershipApi() {};
const getObjectsApi = function getObjectsApi() {};
const getUserReadOnlyDataApi = function getUserReadOnlyDataApi() {};

function makeDeps({ groups, guildDataById, readOnlyData = {}, nationGroupDocs = {} }) {
  return {
    withTitleEntityToken: async (action) => action(),
    getEntityKeyFromPlayFabId: async (playFabId) => ({ Id: `entity-${playFabId}`, Type: 'title_player_account' }),
    PlayFabGroups: {
      ListMembership: listMembershipApi
    },
    PlayFabData: {
      GetObjects: getObjectsApi
    },
    PlayFabServer: {
      GetUserReadOnlyData: getUserReadOnlyDataApi
    },
    firestore: {
      collection: (collectionName) => ({
        doc: (docId) => ({
          get: async () => {
            const data = collectionName === 'nation_groups' ? nationGroupDocs[docId] : null;
            return data ? { exists: true, data: () => data } : { exists: false, data: () => null };
          }
        })
      })
    },
    promisifyPlayFab: async (apiFunction, request) => {
      if (apiFunction === listMembershipApi) {
        return { Groups: groups };
      }
      if (apiFunction === getObjectsApi) {
        const guildId = request?.Entity?.Id;
        const data = guildDataById[guildId];
        return data ? { Objects: { GuildData: { DataObject: data } } } : { Objects: {} };
      }
      if (apiFunction === getUserReadOnlyDataApi) {
        const data = readOnlyData[request?.PlayFabId] || {};
        return {
          Data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { Value: String(value) }]))
        };
      }
      throw new Error('Unexpected PlayFab API call');
    }
  };
}

test('nation membership group alone keeps the player on their own ship', async () => {
  const context = await resolveGuildShipContext('PLAYER1', makeDeps({
    groups: [
      { Group: { Id: 'nation-fire-group', Type: 'group' }, GroupName: 'nation_fire_island' }
    ],
    guildDataById: {}
  }));

  expect(context.shipOwnerPlayFabId).toBe('PLAYER1');
  expect(context.isSharedShip).toBe(false);
  expect(context.isGuildShip).toBe(false);
  expect(context.guildId).toBeNull();
});

test('king with only nation membership still uses the nation guild ship', async () => {
  const context = await resolveGuildShipContext('KING1', makeDeps({
    groups: [
      { Group: { Id: 'nation-fire-group', Type: 'group' }, GroupName: 'nation_fire_island' }
    ],
    guildDataById: {},
    readOnlyData: {
      KING1: { IsKing: 'true', Nation: 'fire' }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('KING1');
  expect(context.isSharedShip).toBe(false);
  expect(context.isGuildShip).toBe(true);
  expect(context.isNationGuild).toBe(true);
  expect(context.guildId).toBe('nation-fire-group');
  expect(context.guildShipId).toBe('guild_ship_nation-fire-group');
  expect(context.kingShipName).toBe('火の王の船');
  expect(context.sailColor).toBe('red');
  expect(context.appearance).toEqual({ color: 'red' });
});

test('king can resolve nation guild ship from Firestore when membership is unavailable', async () => {
  const context = await resolveGuildShipContext('KING1', makeDeps({
    groups: [],
    guildDataById: {},
    readOnlyData: {
      KING1: { IsKing: 'true', Nation: 'fire' }
    },
    nationGroupDocs: {
      nation_fire_island: { groupId: 'nation-fire-doc-group' }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('KING1');
  expect(context.isGuildShip).toBe(true);
  expect(context.isNationGuild).toBe(true);
  expect(context.guildId).toBe('nation-fire-doc-group');
  expect(context.guildShipId).toBe('guild_ship_nation-fire-doc-group');
  expect(context.sailColor).toBe('red');
});

test('nation guild ship sail colors use wind yellow and earth green', async () => {
  const windContext = await resolveGuildShipContext('WINDKING', makeDeps({
    groups: [
      { Group: { Id: 'nation-wind-group', Type: 'group' }, GroupName: 'nation_wind_island' }
    ],
    guildDataById: {},
    readOnlyData: {
      WINDKING: { IsKing: 'true', Nation: 'wind' }
    }
  }));
  const earthContext = await resolveGuildShipContext('EARTHKING', makeDeps({
    groups: [
      { Group: { Id: 'nation-earth-group', Type: 'group' }, GroupName: 'nation_earth_island' }
    ],
    guildDataById: {},
    readOnlyData: {
      EARTHKING: { IsKing: 'true', Nation: 'earth' }
    }
  }));

  expect(windContext.sailColor).toBe('yellow');
  expect(windContext.appearance).toEqual({ color: 'yellow' });
  expect(earthContext.sailColor).toBe('green');
  expect(earthContext.appearance).toEqual({ color: 'green' });
});

test('non-king nation member remains on their own ship', async () => {
  const context = await resolveGuildShipContext('PLAYER1', makeDeps({
    groups: [
      { Group: { Id: 'nation-fire-group', Type: 'group' }, GroupName: 'nation_fire_island' }
    ],
    guildDataById: {},
    readOnlyData: {
      PLAYER1: { IsKing: 'false', Nation: 'fire' }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('PLAYER1');
  expect(context.isSharedShip).toBe(false);
  expect(context.isGuildShip).toBe(false);
  expect(context.guildId).toBeNull();
});

test('king guild membership uses the king guild ship even when nation group is listed first', async () => {
  const context = await resolveGuildShipContext('PLAYER1', makeDeps({
    groups: [
      { Group: { Id: 'nation-fire-group', Type: 'group' }, GroupName: 'nation_fire_island' },
      { Group: { Id: 'king-guild-fire', Type: 'group' }, GroupName: '火の国ギルド' }
    ],
    guildDataById: {
      'king-guild-fire': {
        name: '火の国ギルド',
        guildType: 'nation',
        isNationGuild: true,
        nation: 'fire',
        ownerPlayFabId: 'KING1',
        captainName: '火の王',
        guildShipId: 'guild_ship_king-guild-fire'
      }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('KING1');
  expect(context.isSharedShip).toBe(true);
  expect(context.isGuildShip).toBe(true);
  expect(context.isNationGuild).toBe(true);
  expect(context.guildId).toBe('king-guild-fire');
  expect(context.kingShipName).toBe('火の王の船');
});

test('pirate guild membership still shares the captain ship', async () => {
  const context = await resolveGuildShipContext('PLAYER1', makeDeps({
    groups: [
      { Group: { Id: 'pirate-guild', Type: 'group' }, GroupName: '海風海賊団' }
    ],
    guildDataById: {
      'pirate-guild': {
        name: '海風海賊団',
        guildType: 'pirate',
        ownerPlayFabId: 'CAPTAIN1',
        captainName: '海風の船長'
      }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('CAPTAIN1');
  expect(context.isSharedShip).toBe(true);
  expect(context.isGuildShip).toBe(false);
  expect(context.guildName).toBe('海風海賊団');
});

test('legacy pirate guild data without guildType still shares the captain ship', async () => {
  const context = await resolveGuildShipContext('PLAYER1', makeDeps({
    groups: [
      { Group: { Id: 'legacy-pirate-guild', Type: 'group' }, GroupName: '古い海賊団' }
    ],
    guildDataById: {
      'legacy-pirate-guild': {
        name: '古い海賊団',
        ownerPlayFabId: 'CAPTAIN2',
        captainName: '古参船長'
      }
    }
  }));

  expect(context.shipOwnerPlayFabId).toBe('CAPTAIN2');
  expect(context.isSharedShip).toBe(true);
  expect(context.isGuildShip).toBe(false);
  expect(context.guildName).toBe('古い海賊団');
});
