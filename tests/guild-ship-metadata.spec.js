const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const spatialFields = [
  'mapId', 'position', 'currentX', 'currentY', 'targetX', 'targetY',
  'arrivalTime', 'movement', 'geohash'
];

function createHarness({ king = false, level = 21, balance = 2000, existingShip = null, failShipWrite = false } = {}) {
  const routes = new Map();
  const reads = [];
  const writes = [];
  const debits = [];
  let guildData = null;
  let joined = false;
  const firestore = () => ({ collection: (collection) => ({ doc: (id) => ({
    get: async () => {
      reads.push({ collection, id });
      if (collection === 'nation_groups') return { exists: true, data: () => ({ groupId: 'NATION' }) };
      if (collection === 'ships' && id === 'guild_ship_GUILD') return { exists: !!existingShip, data: () => existingShip };
      if (collection === 'ships' && id === 'PLAYER') return { exists: true, data: () => ({ mapId: 'wands', position: { x: 400, y: 500 } }) };
      throw new Error(`Unexpected read: ${collection}/${id}`);
    },
    set: async (data) => {
      if (failShipWrite) throw new Error('Fixture ship write failure');
      writes.push({ collection, id, data });
    }
  }) }) });
  firestore.FieldValue = { serverTimestamp: () => 'TIMESTAMP' };
  const groups = { ListMembership: 'membership', CreateGroup: 'create' };
  const dataApi = { GetObjects: 'objects', SetObjects: 'save' };
  const serverApi = { GetPlayerStatistics: 'stats', GetUserReadOnlyData: 'profileData', GetPlayerProfile: 'profile' };
  const playfabCall = async (method, args) => {
    switch (method) {
      case 'stats': return { Statistics: [{ StatisticName: 'Level', Value: level }] };
      case 'profileData': return { Data: { IsKing: { Value: String(king) }, Nation: { Value: 'wind' }, AvatarColor: { Value: 'yellow' } } };
      case 'profile': return { PlayerProfile: { DisplayName: 'Captain' } };
      case 'membership': return { Groups: joined ? [{ Group: { Id: 'GUILD' }, GroupName: guildData.name }] : [] };
      case 'create': joined = true; return { Group: { Id: 'GUILD' } };
      case 'save': guildData = args.Objects[0].DataObject; return {};
      case 'objects': return { Objects: { GuildData: { DataObject: guildData } } };
      default: throw new Error(`Unexpected PlayFab call: ${method}`);
    }
  };
  const sandboxRequire = (name) => {
    if (name === '../playfab') return {
      PlayFabGroups: groups, PlayFabData: dataApi,
      withTitleEntityToken: (fn) => fn(),
      getEntityKeyFromPlayFabId: async () => ({ Id: 'ENTITY', Type: 'title_player_account' })
    };
    if (name === '../economy') return {
      getCurrencyBalance: async () => balance,
      subtractEconomyItem: async (...args) => { debits.push(args.slice(0, 3)); }
    };
    if (name === 'firebase-admin') return { firestore };
    if (name === '../playerLevel') return {
      buildStatsMapFromStatistics: () => ({ Level: level }),
      applyDerivedPlayerLevelToStats: (stats) => ({ stats })
    };
    if (name === '../nation') return { getAvatarColorForNation: () => 'yellow' };
    if (name === '../crewRoles') return require('../server/crewRoles');
    // Present only in the pre-change source, to let the regression fail on its actual payload.
    if (name === 'geofire-common') return { geohashForLocation: () => 'LEGACY-GEOHASH' };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/routes/guildRoutes.js'), 'utf8'), {
    module, exports: module.exports, require: sandboxRequire,
    console: { log() {}, warn() {}, error() {} }, Date, Map, Set, setTimeout, clearTimeout
  });
  module.exports.initializeGuildRoutes({
    post: (url, handler) => routes.set(url, handler), get: (url, handler) => routes.set(url, handler)
  }, playfabCall, serverApi, {}, {}, (id) => id, {
    requireAuthenticatedPlayFabId: async (req, res, id) => {
      if (!req.uid) { res.status(401).json({ error: 'Unauthorized' }); return null; }
      if (req.uid !== id) { res.status(403).json({ error: 'Forbidden' }); return null; }
      return req.uid;
    }
  });
  async function create(body = { playFabId: 'PLAYER', guildName: 'Crew' }, uid = 'PLAYER') {
    const result = { status: 200 };
    const response = { status(code) { result.status = code; return this; }, json(data) { result.data = data; return this; } };
    await routes.get('/api/create-guild')({ body, uid }, response);
    return result;
  }
  return { create, reads, writes, debits, guild: () => guildData };
}

for (const king of [false, true]) {
  test(`new ${king ? 'nation' : 'pirate'} guild keeps ship metadata without map coordinates`, async () => {
    const h = createHarness({ king, level: king ? 1 : 21 });
    const response = await h.create();
    expect(response.status).toBe(200);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ collection: 'ships', id: 'guild_ship_GUILD', data: {
      shipId: 'guild_ship_GUILD', ownerId: 'PLAYER', ownerPlayFabId: 'PLAYER', guildId: 'GUILD',
      guildType: king ? 'nation' : 'pirate', isNationGuild: king, nation: 'wind',
      maxHp: 5000, currentHp: 5000, isDestroyed: false,
      appearance: { shipType: 'guild', domain: 'sea_surface', color: 'yellow' },
      speed: 0, shipVisionRange: 260, lastUpdated: 'TIMESTAMP'
    } });
    for (const key of spatialFields) expect(h.writes[0].data).not.toHaveProperty(key);
    expect(h.reads).not.toContainEqual({ collection: 'ships', id: 'PLAYER' });
    expect(h.debits).toEqual([['PLAYER', 'PS', 1000]]);
    expect(h.guild()).toMatchObject({ ownerPlayFabId: 'PLAYER', guildShipId: 'guild_ship_GUILD', treasury: 0, warehouse: [], chatMessages: [] });
  });
}

test('existing guild ship including legacy coordinates is never overwritten', async () => {
  const existing = { position: { x: 321, y: 654 }, currentHp: 123, displayName: 'Existing' };
  const h = createHarness({ existingShip: existing });
  expect((await h.create()).status).toBe(200);
  expect(h.writes).toEqual([]);
  expect(existing).toEqual({ position: { x: 321, y: 654 }, currentHp: 123, displayName: 'Existing' });
});

test('duplicate guild creation is still rejected before another debit or ship write', async () => {
  const h = createHarness();
  expect((await h.create()).status).toBe(200);
  expect((await h.create()).status).toBe(400);
  expect(h.debits).toHaveLength(1);
  expect(h.writes).toHaveLength(1);
});

test('missing ID, unauthenticated and mismatched user requests have no side effects', async () => {
  const h = createHarness();
  expect((await h.create({})).status).toBe(400);
  expect((await h.create({ playFabId: 'PLAYER' }, null)).status).toBe(401);
  expect((await h.create({ playFabId: 'OTHER' }, 'PLAYER')).status).toBe(403);
  expect(h.reads).toEqual([]);
  expect(h.debits).toEqual([]);
  expect(h.writes).toEqual([]);
});

test('level and balance checks stay ahead of guild ship creation', async () => {
  const lowLevel = createHarness({ level: 20 });
  expect((await lowLevel.create()).status).toBe(403);
  expect(lowLevel.debits).toEqual([]);
  expect(lowLevel.writes).toEqual([]);
  const lowBalance = createHarness({ balance: 999 });
  expect((await lowBalance.create()).status).toBe(402);
  expect(lowBalance.debits).toEqual([]);
  expect(lowBalance.writes).toEqual([]);
});

test('ship projection failure retains established guild creation and duplicate retry behavior', async () => {
  const h = createHarness({ failShipWrite: true });
  expect((await h.create()).status).toBe(200);
  expect(h.guild().guildShipId).toBe('guild_ship_GUILD');
  expect((await h.create()).status).toBe(400);
  expect(h.debits).toHaveLength(1);
  expect(h.writes).toEqual([]);
});
