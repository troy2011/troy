'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDailyFortuneLedger } = require('../server/dailyFortuneLedger');
const { createDailyFortuneGrant } = require('../server/dailyFortuneGrant');

function database() {
  let rows = new Map(), tail = Promise.resolve();
  const db = {
    collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
    runTransaction: fn => {
      const task = tail.then(async () => {
        const copy = new Map([...rows].map(([key, value]) => [key, structuredClone(value)]));
        const tx = {
          get: async ref => ({ exists: copy.has(ref.path), data: () => structuredClone(copy.get(ref.path)) }),
          create: (ref, value) => { if (copy.has(ref.path)) throw Error('exists'); copy.set(ref.path, structuredClone(value)); },
          set: (ref, value, options) => copy.set(ref.path, options?.merge ? { ...copy.get(ref.path), ...structuredClone(value) } : structuredClone(value)),
          update: (ref, value) => {
            if (!copy.has(ref.path)) throw Error('missing');
            if (value.state === 'complete' && db.failFinishOnce) { db.failFinishOnce = false; throw Error('completion unavailable'); }
            copy.set(ref.path, { ...copy.get(ref.path), ...structuredClone(value) });
          }
        };
        const result = await fn(tx); rows = copy; return result;
      });
      tail = task.catch(() => {}); return task;
    },
    rows: () => rows
  };
  return db;
}
function fixture({ legacy = null, failGrant = false, failGrantAt = 0, failBalance = false, invalidReceipt = false, failPreflightOnce = false, failResolveOnce = false, failRankingOnce = false, invalidRankingOnce = false, failContributionOnce = false, failFragmentReadOnce = false, historyAdvanced = false, holdGrant = null, eligible = false, reversed = false } = {}) {
  const db = database(), routes = new Map(), records = new Map(), grants = [];
  if (legacy) records.set('DailyTarotFortune', JSON.stringify(legacy));
  let failRanking = failRankingOnce, invalidRanking = invalidRankingOnce, failPreflight = failPreflightOnce, failResolve = failResolveOnce, failContribution = failContributionOnce, failFragmentRead = failFragmentReadOnce, contributionReads = 0;
  const leaderboardVersions = [];
  const previousDay = day => new Date(Date.parse(`${day}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10);
  const dayDifference = (from, to) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000);
  let offsetMs = 0;
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [Date.now() + offsetMs])); }
    static now() { return Date.now() + offsetMs; }
  }
  const api = { GetUserReadOnlyData() {}, UpdateUserReadOnlyData() {}, GetLeaderboard() {}, UpdatePlayerStatistics() {} };
  const addInventoryItems = () => {};
  const promisifyPlayFab = async (method, request) => {
    if (method === api.GetUserReadOnlyData) {
      if (failFragmentRead && request.Keys?.includes('DailyTarotCardFragmentsV1')) { failFragmentRead = false; throw Error('fragment unavailable'); }
      return { Data: Object.fromEntries((request.Keys || []).filter(k => records.has(k)).map(k => [k, { Value: records.get(k) }])) };
    }
    if (method === api.UpdateUserReadOnlyData) { for (const [key, value] of Object.entries(request.Data)) records.set(key, value); return {}; }
    if (method === api.GetLeaderboard) {
      leaderboardVersions.push(request.Version);
      if (failRanking) { failRanking = false; throw Error('ranking unavailable'); }
      if (invalidRanking) { invalidRanking = false; return {}; }
      return { Leaderboard: eligible ? [{ PlayFabId: 'PLAYER' }] : [] };
    }
    if (method === addInventoryItems) {
      grants.push({ itemId: request.Item.Id, amount: request.Amount, key: request.IdempotencyId });
      if (holdGrant) await holdGrant;
      if (failGrant || (failGrantAt && grants.length === failGrantAt)) throw Error('grant outcome unknown');
      if (invalidReceipt === 'absent') return {};
      if (invalidReceipt === 'nullData') return { code: 200, data: null };
      if (invalidReceipt) return { IdempotencyId: 'different-request', TransactionIds: ['transaction'] };
      return { IdempotencyId: request.IdempotencyId, TransactionIds: ['transaction'] };
    }
    if (method === api.UpdatePlayerStatistics) return {};
    throw Error('unexpected PlayFab method');
  };
  const deps = {
    firestore: db, promisifyPlayFab, PlayFabServer: api, catalogCache: {},
    requireAuthenticatedPlayFabId: async (req, res, id) => {
      if (!req.uid) { res.status(401).json({ error: 'Unauthorized' }); return null; }
      if (req.uid !== id) { res.status(403).json({ error: 'Forbidden' }); return null; }
      return id;
    },
    PlayFabEconomy: { AddInventoryItems: addInventoryItems },
    ensureTitleEntityToken: async () => { if (failPreflight) { failPreflight = false; throw Error('token unavailable'); } },
    getEntityKeyForPlayFabId: async () => ({ Id: 'entity', Type: 'title_player_account' }),
    resolveItemId: id => { if (failResolve) { failResolve = false; return ''; } return id; },
    getCurrencyBalance: async () => { if (failBalance) throw Error('balance unavailable'); return 123; }
  };
  const stubs = {
    './economy': { VIRTUAL_CURRENCY_CODE: 'PS', LEADERBOARD_NAME: 'ps_ranking' },
    './tarotSkillNames': { getCardSkillName: () => 'Skill' },
    './tarotDeck': { getDeckType: () => 'Deck' },
    './gacha': { drawLocalGachaItem: () => ({ itemId: 'bonus-card' }) },
    './contributionStats': { PLAYER_DAILY_CONTRIBUTION_STAT: 'daily', ensureDailyContributionVersionForToday: async (_deps, { todayKey }) => {
      contributionReads++; if (failContribution) { failContribution = false; throw Error('version unavailable'); }
      return { rewardVersion: historyAdvanced ? 2 : 1, rewardDayKey: historyAdvanced ? todayKey : previousDay(todayKey) };
    }, getPreviousJstDateKey: previousDay, diffDayKeys: dayDifference },
    './dailyFortuneLedger': { createDailyFortuneLedger },
    './dailyFortuneGrant': { createDailyFortuneGrant }
  };
  const math = Object.create(Math); math.random = () => reversed ? 0.8 : 0.1;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('server/tarotFortune.js', 'utf8'), {
    module, exports: module.exports, require: name => { if (!stubs[name]) throw Error(`unexpected require ${name}`); return stubs[name]; },
    process: { env: {} }, Math: math, Date: FixtureDate, JSON, Number, String, Array, Object, Set, console: { error() {}, warn() {} }
  });
  module.exports.initializeTarotFortuneRoutes({ post: (path, handler) => routes.set(path, handler) }, deps);
  async function call(path, uid = 'PLAYER', playFabId = 'PLAYER', extra = {}) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(path)({ uid, body: { playFabId, ...extra } }, res); return res;
  }
  return { db, records, grants, call, leaderboardVersions, contributionReads: () => contributionReads, advanceDay: () => { offsetMs += 86400000; } };
}
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

test('authenticates before any ledger or reward operation', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/tarot-fortune-draw', null)).code, 401);
  assert.equal((await f.call('/api/tarot-fortune-draw', 'OTHER')).code, 403);
  assert.equal(f.db.rows().size, 0); assert.equal(f.grants.length, 0);
});

test('status before a draw is read-only and does not create a claim', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/tarot-fortune-status')).body.canDraw, true);
  assert.equal(f.db.rows().size, 0); assert.equal(f.grants.length, 0);
});

test('successful draw and retry preserve the result and grant each reward once', async () => {
  const f = fixture({ eligible: true });
  const first = await f.call('/api/tarot-fortune-draw');
  assert.equal(first.code, 200); assert.ok(first.body.result.fortune);
  assert.equal(first.body.dailyBountyReward.alreadyClaimed, false);
  const second = await f.call('/api/tarot-fortune-draw');
  assert.equal(second.body.alreadyClaimed, true);
  assert.equal(second.body.dailyBountyReward.alreadyClaimed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(second.body.result)), JSON.parse(JSON.stringify(first.body.result)));
  assert.equal(new Set(f.grants.map(g => g.key)).size, f.grants.length);
  assert.equal(f.grants.filter(g => g.key.startsWith('daily-bounty-gacha')).length, 3);
});

test('status after a draw returns the stored result without drawing again', async () => {
  const f = fixture();
  const drawn = await f.call('/api/tarot-fortune-draw');
  const count = f.grants.length;
  const status = await f.call('/api/tarot-fortune-status');
  assert.equal(status.body.canDraw, false);
  assert.deepEqual(JSON.parse(JSON.stringify(status.body.result)), JSON.parse(JSON.stringify(drawn.body.result)));
  assert.equal(f.grants.length, count);
});

test('a draw is settled by one claim write', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  assert.equal(f.db.rows().size, 1);
  assert.equal([...f.db.rows().values()][0].state, 'complete');
});

test('concurrent draws grant the reward once', async () => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const f = fixture({ holdGrant: hold });
  const first = f.call('/api/tarot-fortune-draw');
  while (!f.grants.length) await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const count = f.grants.length;
  const second = await f.call('/api/tarot-fortune-draw');
  assert.equal(second.body.alreadyClaimed, true);
  assert.equal(f.grants.length, count); release();
  const done = await first;
  assert.equal(done.code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(second.body.result)), JSON.parse(JSON.stringify(done.body.result)));
});

test('a failed reward send keeps the result and is not sent again', async () => {
  const f = fixture({ failGrant: true });
  const first = await f.call('/api/tarot-fortune-draw');
  assert.equal(first.code, 200); assert.ok(first.body.result);
  const count = f.grants.length;
  assert.ok(count > 0);
  assert.equal((await f.call('/api/tarot-fortune-draw')).body.alreadyClaimed, true);
  assert.equal(f.grants.length, count);
});

test('an unverifiable SDK receipt does not repeat a grant', async () => {
  const f = fixture({ invalidReceipt: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  const count = f.grants.length;
  assert.ok(count > 0);
  assert.equal((await f.call('/api/tarot-fortune-draw')).body.alreadyClaimed, true);
  assert.equal(f.grants.length, count);
});

test('a failed ranking read skips the ranking bonus and keeps the fortune', async () => {
  const f = fixture({ failRankingOnce: true, eligible: true });
  const first = await f.call('/api/tarot-fortune-draw');
  assert.equal(first.code, 200); assert.ok(first.body.result);
  assert.equal(first.body.dailyBountyReward, undefined);
  const second = await f.call('/api/tarot-fortune-draw');
  assert.equal(second.body.alreadyClaimed, true);
  assert.equal(f.grants.filter(g => g.key.startsWith('daily-bounty-gacha')).length, 0);
});

test('a balance read failure after the response changes nothing', async () => {
  const f = fixture({ failBalance: true });
  const first = await f.call('/api/tarot-fortune-draw');
  assert.equal(first.code, 200); assert.ok(first.body.result);
  await new Promise(resolve => setImmediate(resolve));
  const count = f.grants.length;
  assert.equal((await f.call('/api/tarot-fortune-draw')).body.alreadyClaimed, true);
  assert.equal(f.grants.length, count);
});

test('reversed result writes the fragment state exactly once', async () => {
  const f = fixture({ reversed: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  const fragments = f.records.get('DailyTarotCardFragmentsV1');
  assert.ok(fragments);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  assert.equal(f.records.get('DailyTarotCardFragmentsV1'), fragments);
});

test('a claim left by the earlier ledger counts as claimed only once it holds a result', async () => {
  const { createHash } = require('node:crypto');
  const path = `daily_fortune_claims/${createHash('sha256').update('PLAYER').digest('hex')}_${today()}`;
  const unfinished = fixture();
  unfinished.db.rows().set(path, { state: 'preparing', day: today(), owner: 'old', completed: {}, runningStep: null });
  assert.equal((await unfinished.call('/api/tarot-fortune-status')).body.canDraw, true);
  assert.equal((await unfinished.call('/api/tarot-fortune-draw')).body.alreadyClaimed, false);
  const applying = fixture();
  applying.db.rows().set(path, { state: 'applying', day: today(), owner: 'old', plan: { result: { dayKey: today(), cardId: 'kept' } }, completed: {} });
  const status = await applying.call('/api/tarot-fortune-status');
  assert.equal(status.body.canDraw, false); assert.equal(status.body.result.cardId, 'kept');
  const draw = await applying.call('/api/tarot-fortune-draw');
  assert.equal(draw.body.alreadyClaimed, true); assert.equal(draw.body.result.cardId, 'kept');
  assert.equal(applying.grants.length, 0);
});

test('the fragment route lists only major arcana progress and needs the signed-in player', async () => {
  const f = fixture();
  f.records.set('DailyTarotCardFragmentsV1', JSON.stringify({ version: 1, counts: { 'arcana-18': 1, 'minor-cups-4': 1 } }));
  const res = await f.call('/api/tarot-fortune-fragments');
  assert.equal(res.code, 200);
  assert.equal(res.body.required, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body.fragments)), [{ cardId: 'arcana-18', cardName: res.body.fragments[0].cardName, cardNumber: 18, count: 1 }]);
  assert.ok(res.body.fragments[0].cardName);
  assert.equal((await f.call('/api/tarot-fortune-fragments', 'OTHER')).code, 403);
  assert.equal(f.grants.length, 0);
});
