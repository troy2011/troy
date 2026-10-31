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

test('a known ranking-read failure resumes the saved outcome without repeating rewards', async () => {
  const f = fixture({ failRankingOnce: true, eligible: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const before = f.grants.length;
  const resumed = await f.call('/api/tarot-fortune-status');
  assert.equal(resumed.code, 200); assert.equal(resumed.body.dailyBountyReward.items.length, 3);
  assert.equal(before, 0);
  assert.equal(f.grants.filter(g => g.key.startsWith('daily-bounty-gacha')).length, 3);
  assert.equal(new Set(f.grants.map(g => g.key)).size, f.grants.length);
});

test('an incomplete ranking response is retried instead of treating the player as ineligible', async () => {
  const f = fixture({ invalidRankingOnce: true, eligible: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 0);
  const result = await f.call('/api/tarot-fortune-status');
  assert.equal(result.code, 200); assert.equal(result.body.dailyBountyReward.items.length, 3);
});

test('an unknown grant outcome is held and never sent twice on retry', async () => {
  const f = fixture({ failGrant: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal((await f.call('/api/tarot-fortune-status')).body.state, 'pending');
  assert.equal(f.grants.length, 1);
});

test('an unverifiable SDK receipt stays pending without repeating a grant', async () => {
  const f = fixture({ invalidReceipt: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 1);
});

test('an SDK success without optional receipt fields is accepted', async () => {
  const f = fixture({ invalidReceipt: 'absent' });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  const count = f.grants.length;
  assert.equal((await f.call('/api/tarot-fortune-draw')).body.alreadyClaimed, true);
  assert.equal(f.grants.length, count);
});

test('a success envelope without result data remains pending', async () => {
  const f = fixture({ invalidReceipt: 'nullData' });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 1);
});

test('an uncertain bonus grant keeps the confirmed fortune without resending any bonus', async () => {
  const f = fixture({ eligible: true, failGrantAt: 4 });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const count = f.grants.length;
  const status = await f.call('/api/tarot-fortune-status');
  assert.equal(status.code, 200); assert.ok(status.body.result); assert.equal(status.body.bountyPending, true);
  assert.equal(f.grants.length, count);
});

test('balance display failure cannot undo a completed fortune or repeat rewards', async () => {
  const f = fixture({ failBalance: true });
  const first = await f.call('/api/tarot-fortune-draw');
  assert.equal(first.code, 200); assert.ok(first.body.result);
  const count = f.grants.length;
  assert.equal((await f.call('/api/tarot-fortune-draw')).body.alreadyClaimed, true);
  assert.equal(f.grants.length, count);
});

test('a preflight failure can retry the same saved result without granting twice', async () => {
  const f = fixture({ failPreflightOnce: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 0);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  assert.equal(new Set(f.grants.map(g => g.key)).size, f.grants.length);
});

test('invalid catalog resolution before send permits safe retry', async () => {
  const f = fixture({ failResolveOnce: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 0);
  const result = await f.call('/api/tarot-fortune-status');
  assert.equal(result.code, 200); assert.ok(result.body.result);
});

test('a failed final ledger confirmation resumes without repeating paid rewards', async () => {
  const f = fixture({ eligible: true }); f.db.failFinishOnce = true;
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const count = f.grants.length;
  const result = await f.call('/api/tarot-fortune-status');
  assert.equal(result.code, 200); assert.ok(result.body.result);
  assert.equal(f.grants.length, count);
});

test('concurrent draws cannot send a second reward while the first is in flight', async () => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const f = fixture({ holdGrant: hold });
  const first = f.call('/api/tarot-fortune-draw');
  while (!f.grants.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 1); release();
  assert.equal((await first).code, 200);
});

test('legacy same-day result is retained without guessing whether bonus was paid', async () => {
  const legacy = { dayKey: today(), cardId: 'old', fortune: 'existing' };
  const f = fixture({ legacy });
  const response = await f.call('/api/tarot-fortune-draw');
  assert.equal(response.body.result.cardId, 'old');
  assert.equal(response.body.bountyPending, true);
  assert.equal(f.grants.length, 0);
});

test('a confirmed legacy bonus is adopted without granting again', async () => {
  const legacy = { dayKey: today(), cardId: 'old', fortune: 'existing' };
  const f = fixture({ legacy });
  f.records.set('DailyBountyGachaReward', JSON.stringify({ dayKey: today(), eligible: true, rank: 1, pulls: 1, itemIds: ['already-paid'] }));
  const response = await f.call('/api/tarot-fortune-draw');
  assert.equal(response.body.dailyBountyReward.items[0].itemId, 'already-paid');
  assert.equal(f.grants.length, 0);
});

test('an incomplete legacy bonus is not guessed to be paid or automatically granted', async () => {
  const legacy = { dayKey: today(), cardId: 'old', fortune: 'existing' };
  const f = fixture({ legacy });
  f.records.set('DailyBountyGachaReward', JSON.stringify({ dayKey: today(), eligible: true, rank: 1, pulls: 3, itemIds: ['maybe-paid'] }));
  const result = await f.call('/api/tarot-fortune-draw');
  assert.equal(result.body.bountyPending, true); assert.equal(result.body.dailyBountyReward, undefined);
  assert.equal(f.grants.length, 0);
});

test('reversed result writes the saved fragment state exactly once', async () => {
  const f = fixture({ reversed: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  const fragments = f.records.get('DailyTarotCardFragmentsV1');
  assert.ok(fragments);
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 200);
  assert.equal(f.records.get('DailyTarotCardFragmentsV1'), fragments);
});

test('a fixed prior-day claim resumes once and is acknowledged before a new draw', async () => {
  const f = fixture({ failPreflightOnce: true, eligible: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const saved = [...f.db.rows().values()].find(value => value.plan?.result);
  const planned = JSON.parse(JSON.stringify(saved.plan.result));
  assert.ok(saved.bountyPlan); assert.equal(f.grants.length, 0);
  f.advanceDay();
  const recovered = await f.call('/api/tarot-fortune-status');
  assert.equal(recovered.body.state, 'recovered');
  assert.equal(recovered.body.recoveryDay, planned.dayKey);
  assert.deepEqual(JSON.parse(JSON.stringify(recovered.body.result)), planned);
  const count = f.grants.length;
  assert.equal((await f.call('/api/tarot-fortune-status')).body.state, 'recovered');
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, count);
  assert.equal((await f.call('/api/tarot-fortune-ack-recovery', 'OTHER', 'PLAYER', { dayKey: planned.dayKey })).code, 403);
  const wrongDay = new Date(Date.parse(`${planned.dayKey}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10);
  assert.equal((await f.call('/api/tarot-fortune-ack-recovery', 'PLAYER', 'PLAYER', { dayKey: wrongDay })).code, 503);
  assert.equal((await f.call('/api/tarot-fortune-ack-recovery', 'PLAYER', 'PLAYER', { dayKey: planned.dayKey })).code, 200);
  assert.equal((await f.call('/api/tarot-fortune-status')).body.canDraw, true);
  assert.equal(f.grants.length, count);
});

test('a completed prior-day payment is not repeated after final confirmation fails', async () => {
  const f = fixture({ eligible: true }); f.db.failFinishOnce = true;
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const count = f.grants.length; f.advanceDay();
  const recovered = await f.call('/api/tarot-fortune-status');
  assert.equal(recovered.body.state, 'recovered');
  assert.equal(f.grants.length, count);
});

test('a prior-day ranking read resumes using the stored reward version', async () => {
  const f = fixture({ failRankingOnce: true, eligible: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const saved = [...f.db.rows().values()].find(value => value.plan?.result);
  assert.equal(saved.bountyBasis.rewardVersion, 1); assert.equal(f.grants.length, 0);
  f.advanceDay();
  assert.equal((await f.call('/api/tarot-fortune-status')).body.state, 'recovered');
  assert.equal(f.contributionReads(), 1);
  assert.equal(f.grants.filter(g => g.key.startsWith('daily-bounty-gacha')).length, 3);
  assert.equal(new Set(f.grants.map(g => g.key)).size, f.grants.length);
});

test('a prior-day version lookup resumes from the correct historical ranking version', async () => {
  const f = fixture({ failContributionOnce: true, historyAdvanced: true, eligible: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  const saved = [...f.db.rows().values()].find(value => value.plan?.result);
  const original = JSON.parse(JSON.stringify(saved.plan.result));
  assert.equal(f.grants.length, 0); f.advanceDay();
  const result = await f.call('/api/tarot-fortune-status');
  assert.equal(result.body.state, 'recovered');
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.result)), original);
  assert.deepEqual(f.leaderboardVersions, [1]);
});

test('a previous-day reservation with no saved outcome and no writes can finish safely', async () => {
  const f = fixture({ failFragmentReadOnce: true, historyAdvanced: true, reversed: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 0);
  const saved = [...f.db.rows().values()].find(value => value.state === 'preparing');
  assert.equal(saved.plan, undefined); const oldDay = saved.day;
  f.advanceDay();
  const result = await f.call('/api/tarot-fortune-status');
  assert.equal(result.body.state, 'recovered'); assert.equal(result.body.result.dayKey, oldDay);
  assert.deepEqual(f.leaderboardVersions, [1]);
});

test('an uncertain prior-day grant remains pending across midnight and is never resent', async () => {
  const f = fixture({ failGrant: true });
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 1); f.advanceDay();
  assert.equal((await f.call('/api/tarot-fortune-status')).body.state, 'pending');
  assert.equal((await f.call('/api/tarot-fortune-draw')).code, 503);
  assert.equal(f.grants.length, 1);
});

test('a recovery response cannot acknowledge or refresh a different signed-in account', async () => {
  const source = fs.readFileSync('public/main.js', 'utf8');
  const start = source.indexOf('async function finishDisplayedFortuneRecovery(');
  const end = source.indexOf('function setDailyFortuneButtonClaimed(', start);
  assert.ok(start >= 0 && end > start);
  let current = true, resolveStatus, calls = 0, refreshes = 0;
  const response = new Promise(resolve => { resolveStatus = resolve; });
  const modal = { classList: { contains: () => true }, querySelector: () => ({}) };
  const context = {
    Player: { isCurrentPlayerSession: () => current }, hasPendingDailyFortuneToday: () => false,
    document: { getElementById: id => id === 'dailyTarotFortuneOverlay' ? { style: { display: 'flex' } } : modal },
    callApiWithLoader: () => { calls++; return response; },
    Inventory: { getInventory: async () => { refreshes++; } }
  };
  vm.runInNewContext(`${source.slice(start, end)}; globalThis.run = finishDisplayedFortuneRecovery;`, context);
  const running = context.run('OLD', '2026-10-30', {});
  current = false;
  resolveStatus({ state: 'recovered', recoveryDay: '2026-10-30', result: { dayKey: '2026-10-30' } });
  await running;
  assert.equal(calls, 1); assert.equal(refreshes, 0);
});

test('a confirmed fortune makes an unresolved ranking bonus visible', async () => {
  const source = fs.readFileSync('public/main.js', 'utf8');
  const start = source.indexOf('async function finishDisplayedFortuneRecovery(');
  const end = source.indexOf('function setDailyFortuneButtonClaimed(', start);
  assert.ok(start >= 0 && end > start);
  const sub = { textContent: '' }, modal = { classList: { contains: () => true }, querySelector: () => ({}) };
  let calls = 0, refreshes = 0;
  const context = {
    Player: { isCurrentPlayerSession: () => true }, hasPendingDailyFortuneToday: () => false,
    document: { getElementById: id => id === 'dailyTarotFortuneOverlay' ? { style: { display: 'flex' } } : id === 'dailyTarotFortuneSub' ? sub : modal },
    callApiWithLoader: async () => { calls++; return { result: { dayKey: '2026-10-30' }, bountyPending: true }; },
    queueStatusFortuneBounty: () => null, showStatusFortuneBounty: () => {},
    Inventory: { getInventory: async () => { refreshes++; } }
  };
  vm.runInNewContext(`${source.slice(start, end)}; globalThis.run = finishDisplayedFortuneRecovery;`, context);
  await context.run('PLAYER', '2026-10-30', {});
  assert.match(sub.textContent, /確認中/); assert.equal(calls, 1); assert.equal(refreshes, 1);
});
