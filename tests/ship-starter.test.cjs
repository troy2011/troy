'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const gate = require('../server/shipProfileGate');

test('concurrent first-login creation cannot replace the created ship', async () => {
  const docs = new Map(), values = {}, read = () => {}, write = () => {};
  let tail = Promise.resolve(), release, entered, writes = 0;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  let paused = false;
  const ref = path => ({ path, get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }), set: async (data, options) => docs.set(path, options?.merge ? { ...docs.get(path), ...data } : data) });
  const firestore = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: fn => {
    const next = tail.then(() => fn({ get: r => r.get(), set: (r, v) => docs.set(r.path, v), update: (r, v) => docs.set(r.path, { ...docs.get(r.path), ...v }), delete: r => docs.delete(r.path) })); tail = next.catch(() => {}); return next;
  } };
  const promisifyPlayFab = async (method, req) => {
    if (method === read) { if (!paused) { paused = true; entered(); await wait; } return { Data: Object.fromEntries((req.Keys || []).filter(k => k in values).map(k => [k, { Value: values[k] }])) }; }
    if (method === write) { writes++; Object.assign(values, req.Data); return {}; }
    throw Error('unexpected');
  };
  const source = fs.readFileSync('server.js', 'utf8');
  const begin = source.indexOf('async function ensureStarterShip({'), end = source.indexOf('async function provisionStarterAssets(', begin);
  assert.ok(begin >= 0 && end > begin);
  const context = { ...gate, firestore, promisifyPlayFab, PlayFabServer: { GetUserReadOnlyData: read, UpdateUserReadOnlyData: write },
    catalogCache: {}, island: { worldToLatLng: () => [0, 0] }, geohashForLocation: () => 'hash',
    admin: { firestore: { FieldValue: { serverTimestamp: () => 1 } } }, Date, JSON };
  vm.runInNewContext(`${source.slice(begin, end)}; globalThis.ensure = ensureStarterShip;`, context);
  const first = context.ensure({ playFabId: 'ABC' }); await enteredPromise;
  await assert.rejects(context.ensure({ playFabId: 'ABC' }), /ShipProfileBusy/);
  release(); const result = await first;
  values[`Ship_${result.shipId}`] = JSON.stringify({ ShipId: result.shipId, Owner: 'ABC', ShipType: 'Experienced', Level: 4 });
  await context.ensure({ playFabId: 'ABC' });
  assert.equal(writes, 1); assert.equal(values.ActiveShipId, result.shipId);
  assert.equal(JSON.parse(values[`Ship_${result.shipId}`]).Level, 4);
});
