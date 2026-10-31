'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShipConstruction, registerShipConstructionRoutes } = require('../server/shipConstruction');
const { getShipProfileKey } = require('../server/resourceStorage');
const { resolveReviewedBuild, resolveReviewedProvision } = require('../server/shipConstructionRecovery');

function fixture() {
  const docs = new Map(), values = { Race: 'human', Nation: '', ActiveShipId: 'ship_ABC_old', PlayerShipProfile: '{"form":"boat","name":"Old","level":3}' };
  const items = [], calls = { payment: 0, assetWrites: 0 }, funds = { RT: 100, RR: 100, RG: 100, RY: 100, RB: 100 };
  let tail = Promise.resolve(), lost = false, failIndex = false, failBefore = false, writeBarrier = null, failPartial = false;
  function doc(path) { return { path, collection: name => collection(`${path}/${name}`),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    create: async data => { if (failIndex && path.startsWith('ships/')) { failIndex = false; throw Error('index unavailable'); } if (docs.has(path)) throw Error('exists'); docs.set(path, data); } }; }
  function collection(path) { return { doc: id => doc(`${path}/${id}`) }; }
  const db = { collection, runTransaction: fn => {
    const next = tail.then(async () => {
      const copy = new Map(docs), tx = {
        get: async ref => ({ exists: copy.has(ref.path), data: () => copy.get(ref.path) }),
        set: (ref, value, options) => copy.set(ref.path, options?.merge ? { ...copy.get(ref.path), ...value } : value),
        update: (ref, value) => copy.set(ref.path, { ...copy.get(ref.path), ...value })
      };
      const result = await fn(tx); docs.clear(); for (const [key, value] of copy) docs.set(key, value); return result;
    }); tail = next.catch(() => {}); return next;
  } };
  const read = () => {}, stats = () => {}, update = () => {}, execute = () => {};
  const catalog = { ship: { ItemId: 'ship', ItemClass: 'Ship', class: 'explorer', race: 'human', DisplayName: 'Explorer', MaxHP: 100, Speed: 10, CargoCapacity: 10, CrewCapacity: 1 }, RT: {}, RR: {}, RG: {}, RY: {}, RB: {} };
  const deps = { firestore: db, catalogCache: catalog, catalogCurrencyMap: {}, resolveItemId: id => id,
    PlayFabServer: { GetUserReadOnlyData: read, GetPlayerStatistics: stats, UpdateUserReadOnlyData: update },
    PlayFabEconomy: { ExecuteInventoryOperations: execute }, ensureTitleEntityToken: async () => {},
    getEntityKeyForPlayFabId: async () => ({ Id: 'ENTITY', Type: 'title_player_account' }),
    getAllInventoryItems: async () => items,
    promisifyPlayFab: async (method, req) => {
      if (method === read) return { Data: Object.fromEntries((req.Keys || []).filter(key => key in values).map(key => [key, { Value: values[key] }])) };
      if (method === stats) return { Statistics: [{ StatisticName: 'NationContribution', Value: 30000 }] };
      if (method === update) {
        calls.assetWrites++;
        if (writeBarrier) { const barrier = writeBarrier; writeBarrier = null; barrier.entered(); await barrier.wait; }
        if (failPartial) { failPartial = false; const key = Object.keys(req.Data)[0]; values[key] = req.Data[key]; throw Error('partial write'); }
        Object.assign(values, req.Data); return {};
      }
      if (method === execute) {
        calls.payment++;
        if (failBefore) { failBefore = false; throw Error('connection lost'); }
        const costs = req.Operations.filter(x => x.Subtract).map(x => x.Subtract);
        if (costs.some(x => funds[x.Item.Id] < x.Amount)) throw { code: 400, error: 'InsufficientFunds', errorMessage: 'insufficient' };
        for (const cost of costs) funds[cost.Item.Id] -= cost.Amount;
        const add = req.Operations.find(x => x.Add).Add;
        items.push({ Id: add.Item.Id, StackId: add.Item.StackId, Amount: 1, DisplayProperties: add.NewStackValues.DisplayProperties });
        if (lost) { lost = false; throw Error('response lost'); }
        return { IdempotencyId: req.IdempotencyId, TransactionIds: ['transaction'] };
      }
      throw Error('unexpected');
    },
    requireAuthenticatedPlayFabId: async (req, res, id) => req.uid === id ? id : (res.status(403).json({ error: 'Forbidden' }), null)
  };
  return { deps, docs, values, funds, calls, service: createShipConstruction(deps), loseResponse: () => { lost = true; }, failIndex: () => { failIndex = true; }, failBefore: () => { failBefore = true; },
    failPartial: () => { failPartial = true; }, holdAssetWrite: () => {
      let release, entered; const wait = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { entered = resolve; });
      writeBarrier = { wait, entered }; return { started, release };
    }, expireProvision: () => { [...docs.entries()].find(([key]) => key.endsWith(`/requests/${input.requestId}`))[1].provisionUntil = 0; } };
}
const input = { requestId: 'a'.repeat(32), shipItemId: 'ship', selectedResource: 'RR', expectedQuote: [{ itemId: 'RT', amount: 10 }, { itemId: 'RR', amount: 25 }] };
test('building preserves the old active ship and is idempotent', async () => {
  const f = fixture(), before = f.values.PlayerShipProfile;
  const result = await f.service.build('ABC', input);
  assert.equal(result.state, 'complete'); assert.equal(f.values.ActiveShipId, 'ship_ABC_old'); assert.equal(f.values.PlayerShipProfile, before);
  assert.ok(f.values[`Ship_${result.shipId}`]); assert.ok(f.values[getShipProfileKey(result.shipId)]);
  assert.equal((await f.service.build('ABC', input)).shipId, result.shipId); assert.equal(f.calls.payment, 1); assert.equal(f.funds.RR, 75);
});
test('lost payment response is reconciled from the exact added stack without a second debit', async () => {
  const f = fixture(); f.loseResponse();
  assert.equal((await f.service.build('ABC', input)).state, 'pending');
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'complete');
  assert.equal(f.calls.payment, 1); assert.equal(f.funds.RR, 75);
});
test('paid build resumes partial provision without a second debit', async () => {
  const f = fixture(); f.failIndex();
  await assert.rejects(f.service.build('ABC', input), /index unavailable/);
  const record = [...f.docs.entries()].find(([key]) => key.endsWith(`/requests/${input.requestId}`))[1];
  record.provisionUntil = 0;
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'complete'); assert.equal(f.calls.payment, 1);
});
test('a late original asset write is never duplicated after the provision lease expires', async () => {
  const f = fixture(), barrier = f.holdAssetWrite(), first = f.service.build('ABC', input);
  await barrier.started; f.expireProvision();
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'pending');
  assert.equal(f.calls.assetWrites, 1);
  barrier.release(); assert.equal((await first).state, 'pending');
  f.expireProvision(); const result = await f.service.resume('ABC', input.requestId);
  assert.equal(result.state, 'complete'); assert.equal(f.calls.assetWrites, 1);
  const key = `Ship_${result.shipId}`, evolved = { ...JSON.parse(f.values[key]), Level: 8 };
  f.values[key] = JSON.stringify(evolved);
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'complete');
  assert.equal(JSON.parse(f.values[key]).Level, 8);
});
test('partial uncertain asset write remains pending until explicitly reviewed', async () => {
  const f = fixture(); f.failPartial();
  await assert.rejects(f.service.build('ABC', input), /partial write/);
  f.expireProvision(); assert.equal((await f.service.resume('ABC', input.requestId)).state, 'pending');
  assert.equal(f.calls.assetWrites, 1);
  await assert.rejects(resolveReviewedProvision(f.deps.firestore, { playerId: 'ABC', requestId: input.requestId, confirmation: 'wrong', caseId: 'case', reviewer: 'operator' }), /InvalidReview/);
  await resolveReviewedProvision(f.deps.firestore, { playerId: 'ABC', requestId: input.requestId, confirmation: 'MANUALLY_VERIFIED_NO_INFLIGHT_WRITE', caseId: 'case', reviewer: 'operator' });
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'complete');
  assert.equal(f.calls.assetWrites, 2); assert.equal(f.calls.payment, 1);
});
test('unaffiliated material choice is verified server-side', async () => {
  const f = fixture();
  await assert.rejects(f.service.build('ABC', { ...input, selectedResource: 'PS' }), /ChooseMaterial/);
  assert.equal(f.calls.payment, 0);
});
test('insufficient materials end the attempt without blocking a later build', async () => {
  const f = fixture(); f.funds.RR = 0;
  assert.equal((await f.service.build('ABC', input)).state, 'failed');
  f.funds.RR = 100;
  assert.equal((await f.service.build('ABC', { ...input, requestId: 'b'.repeat(32) })).state, 'complete');
  assert.equal(f.funds.RR, 75);
});
test('concurrent requests with the same ID debit once', async () => {
  const f = fixture();
  const results = await Promise.all([f.service.build('ABC', input), f.service.build('ABC', input)]);
  assert.ok(results.some(result => result.state === 'complete'));
  assert.equal(f.calls.payment, 1); assert.equal(f.funds.RR, 75);
});
test('a colliding ship identifier is rejected before spending materials', async () => {
  const f = fixture();
  await f.service.build('ABC', input);
  const other = { ...input, requestId: `${input.requestId.slice(0, 20)}${'b'.repeat(12)}` };
  await assert.rejects(f.service.build('ABC', other), /ShipAlreadyExists/);
  assert.equal(f.calls.payment, 1);
});
test('reviewed failed attempt can be released without touching inventory', async () => {
  const f = fixture(); f.failBefore();
  assert.equal((await f.service.build('ABC', input)).state, 'pending');
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'pending');
  assert.equal(f.calls.payment, 1);
  await assert.rejects(resolveReviewedBuild(f.deps.firestore, { playerId: 'ABC', requestId: input.requestId, outcome: 'failed', confirmation: 'wrong', caseId: 'case', reviewer: 'operator' }), /InvalidReview/);
  await resolveReviewedBuild(f.deps.firestore, { playerId: 'ABC', requestId: input.requestId, outcome: 'failed', confirmation: 'MANUALLY_VERIFIED_NOT_CHARGED', caseId: 'case', reviewer: 'operator' });
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'failed');
  assert.equal((await f.service.build('ABC', { ...input, requestId: 'b'.repeat(32) })).state, 'complete');
  assert.equal(f.funds.RR, 75);
});
test('reviewed paid attempt resumes asset creation without another inventory send', async () => {
  const f = fixture(); f.loseResponse();
  assert.equal((await f.service.build('ABC', input)).state, 'pending');
  await resolveReviewedBuild(f.deps.firestore, { playerId: 'ABC', requestId: input.requestId, outcome: 'paid', confirmation: 'MANUALLY_VERIFIED_PAID', caseId: 'case', reviewer: 'operator' });
  assert.equal((await f.service.resume('ABC', input.requestId)).state, 'complete');
  assert.equal(f.calls.payment, 1);
});
test('routes reject a different authenticated account before any writes', async () => {
  const f = fixture(), routes = new Map(); registerShipConstructionRoutes({ post: (path, handler) => routes.set(path, handler) }, f.deps);
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get('/api/ship-construction/build')({ uid: 'OTHER', body: { ...input, playFabId: 'ABC' } }, res);
  assert.equal(res.code, 403); assert.equal(f.calls.payment, 0);
});
