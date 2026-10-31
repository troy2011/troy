'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getShipProfileKey } = require('../server/resourceStorage');
const { createHash } = require('node:crypto');

function fixture() {
  const documents = new Map(), routes = new Map(); let tail = Promise.resolve(), inventory = [];
  const old = 'ship_ABC_old', next = 'ship_ABC_new';
  const values = { ActiveShipId: old, PlayerShipProfile: JSON.stringify({ form: 'explorer', name: 'Old', level: 4, majorArcanaItemIds: ['owned'], extraLegacyField: 'kept' }),
    [`Ship_${old}`]: JSON.stringify({ ShipId: old, Owner: 'ABC', ItemId: 'ship_explorer', ShipType: 'Old', Level: 4 }),
    [`Ship_${next}`]: JSON.stringify({ ShipId: next, Owner: 'ABC', ItemId: 'ship_fighter', ShipType: 'New', Level: 2 }),
    [getShipProfileKey(next)]: JSON.stringify({ form: 'fighter', name: 'New', level: 2, majorArcanaItemIds: ['sold'] }) };
  const ref = p => ({ path: p, get: async () => ({ exists: documents.has(p), data: () => documents.get(p) }),
    set: async (v, options) => documents.set(p, options?.merge ? { ...documents.get(p), ...v } : v) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`), where: (field, _operator, value) => {
    const get = async () => ({ docs: [...documents.entries()].filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value).map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })) });
    return { get, limit: () => ({ get }) };
  } }),
    runTransaction: fn => { const nextOp = tail.then(async () => { const tx = {
      get: async r => ({ exists: documents.has(r.path), data: () => documents.get(r.path) }),
      set: (r, v) => documents.set(r.path, v), update: (r, v) => documents.set(r.path, { ...documents.get(r.path), ...v }), delete: r => documents.delete(r.path)
    }; return fn(tx); }); tail = nextOp.catch(() => {}); return nextOp; } };
  documents.set(`ships/${old}`, { shipId: old, playFabId: 'ABC' }); documents.set(`ships/${next}`, { shipId: next, playFabId: 'ABC' });
  const firestore = Object.assign(() => db, { FieldValue: { delete: () => null, serverTimestamp: () => 1 } });
  const read = () => {}, write = () => {}, server = { GetUserReadOnlyData: read, UpdateUserReadOnlyData: write };
  const promisify = async (method, request) => {
    if (method === read) return { Data: Object.fromEntries((request.Keys || []).filter(key => key in values).map(key => [key, { Value: values[key] }])) };
    if (method === write) { Object.assign(values, request.Data); return {}; }
    throw Error('unexpected');
  };
  const mocks = {
    'firebase-admin': { firestore }, 'geofire-common': {}, '../islandEffects': {},
    '../guildShipSharing': { resolveGuildShipContext: async id => ({ shipOwnerPlayFabId: id, isSharedShip: false, isGuildShip: false }) },
    '../playfab': { getEntityKeyFromPlayFabId: async () => ({ Id: 'entity', Type: 'title_player_account' }) },
    '../economy': { getAllInventoryItems: async () => inventory }
  };
  const localRequire = name => mocks[name] || require(name.startsWith('../') ? path.resolve(__dirname, '../server', name.slice(3)) : name);
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/routes/shipRoutes.js'), 'utf8'), { module: mod, exports: mod.exports, require: localRequire, console, Date, Map, Set, structuredClone });
  mod.exports.initializeShipRoutes({ locals: {}, post: (route, fn) => routes.set(route, fn), get: (route, fn) => routes.set(route, fn) }, promisify, server, {}, {}, {}, id => id, {}, { requireAuthenticatedPlayFabId: async (req, res, id) => req.uid === id ? id : (res.status(403).json({ error: 'Forbidden' }), null) });
  async function call(route, body, uid = 'ABC') {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(route)({ uid, body }, res); return res;
  }
  const switchTo = (id, uid = 'ABC') => call('/api/set-active-ship', { playFabId: 'ABC', shipId: id }, uid);
  return { values, documents, old, next, switchTo, call, setInventory: value => { inventory = value; } };
}

test('switch saves the existing full profile and removes sold cards from the target', async () => {
  const f = fixture(), result = await f.switchTo(f.next);
  assert.equal(result.code, 200); assert.deepEqual(Array.from(result.body.removedCards), ['sold']);
  assert.equal(f.values.ActiveShipId, f.next); assert.equal(JSON.parse(f.values.PlayerShipProfile).name, 'New');
  assert.deepEqual(JSON.parse(f.values.PlayerShipProfile).majorArcanaItemIds, []);
  assert.equal(JSON.parse(f.values[getShipProfileKey(f.old)]).extraLegacyField, 'kept');
  f.setInventory([{ Id: 'owned', Amount: 1 }]);
  assert.equal((await f.switchTo(f.old)).code, 200);
  assert.equal(JSON.parse(f.values.PlayerShipProfile).level, 4);
  assert.deepEqual(JSON.parse(f.values.PlayerShipProfile).majorArcanaItemIds, ['owned']);
});
test('switch rejects another account and an active exploration', async () => {
  const f = fixture(); assert.equal((await f.switchTo(f.next, 'OTHER')).code, 403);
  f.documents.set('player_explorations/ABC', { stageNo: 1 });
  assert.equal((await f.switchTo(f.next)).code, 500); assert.equal(f.values.ActiveShipId, f.old);
});
test('a pending build blocks only its own incomplete ship, not switching existing ships', async () => {
  const f = fixture(), id = 'a'.repeat(32), building = `ship_ABC_${id.slice(0, 20)}`;
  const root = createHash('sha256').update('ABC').digest('hex');
  f.documents.set(`ship_construction/${root}`, { activeRequestId: id });
  f.documents.set(`ships/${building}`, { shipId: building, playFabId: 'ABC' });
  f.values[`Ship_${building}`] = JSON.stringify({ ShipId: building, Owner: 'ABC' });
  assert.equal((await f.switchTo(building)).code, 500);
  assert.equal((await f.switchTo(f.next)).code, 200);
});
test('owned ship list exposes each saved profile name', async () => {
  const f = fixture(), result = await f.call('/api/get-player-ships', { playFabId: 'ABC' });
  assert.equal(result.code, 200);
  assert.equal(result.body.ships.find(ship => ship.shipId === f.old).profileName, 'Old');
  assert.equal(result.body.ships.find(ship => ship.shipId === f.next).profileName, 'New');
});
