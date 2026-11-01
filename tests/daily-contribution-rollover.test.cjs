'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ensureDailyContributionVersionForToday } = require('../server/contributionStats');

// PlayFab rejects an increment that follows another too closely, so a rollover must
// make at most one and must not lose a version an earlier failed attempt created.
const DELETE = Symbol('delete');
function store(initial) {
  let doc = { ...initial };
  const merge = value => {
    const next = { ...doc };
    for (const [key, field] of Object.entries(value)) {
      if (field === DELETE) delete next[key]; else next[key] = field;
    }
    doc = next;
  };
  const ref = { get: async () => ({ data: () => ({ ...doc }) }), set: async value => merge(value) };
  const firestore = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async fn => fn({ get: async () => ({ data: () => ({ ...doc }) }), set: (_ref, value) => merge(value) })
  };
  return { firestore, read: () => doc };
}
function playFab(latest, { rateLimited = false } = {}) {
  const calls = { increments: 0 };
  const PlayFabServer = { GetPlayerStatisticVersions: () => ({ StatisticVersions: [{ Version: latest }] }) };
  const PlayFabAdmin = {
    IncrementPlayerStatisticVersion: () => {
      calls.increments += 1;
      if (rateLimited || calls.increments > 1) {
        throw { error: 'StatisticVersionIncrementRateExceeded', errorCode: 1204 };
      }
      latest += 1;
      return { StatisticVersion: { Version: latest } };
    }
  };
  return { calls, PlayFabServer, PlayFabAdmin, promisifyPlayFab: async (fn, request) => fn(request) };
}
function deps(db, api) {
  const admin = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'now' } } };
  return { firestore: db.firestore, admin, ...api };
}

test('a one-day rollover increments once and rewards the version yesterday filled', async () => {
  const db = store({ activeDayKey: '2026-10-31', activeVersion: 7 });
  const api = playFab(7);
  const result = await ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' });
  assert.equal(api.calls.increments, 1);
  assert.deepEqual([result.activeVersion, result.rewardDayKey, result.rewardVersion], [8, '2026-10-31', 7]);
  assert.equal(db.read().activeDayKey, '2026-11-01');
});

test('a multi-day gap increments once and rewards nobody for the stale days', async () => {
  const db = store({ activeDayKey: '2026-10-28', activeVersion: 7 });
  const api = playFab(7);
  const result = await ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' });
  assert.equal(api.calls.increments, 1);
  assert.deepEqual([result.activeVersion, result.rewardDayKey, result.rewardVersion], [8, '2026-10-31', null]);
  assert.equal(db.read().activeDayKey, '2026-11-01');
  assert.equal('previousVersion' in db.read(), false);
});

test('a version an earlier attempt created is adopted without another increment', async () => {
  const db = store({ activeDayKey: '2026-10-31', activeVersion: 7 });
  const api = playFab(8, { rateLimited: true });
  const result = await ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' });
  assert.equal(api.calls.increments, 0);
  assert.deepEqual([result.activeVersion, result.rewardVersion], [8, 7]);
});

test('several lost increments are adopted and the ambiguous day is not rewarded', async () => {
  const db = store({ activeDayKey: '2026-10-29', activeVersion: 7 });
  const api = playFab(12, { rateLimited: true });
  const result = await ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' });
  assert.equal(api.calls.increments, 0);
  assert.deepEqual([result.activeVersion, result.rewardVersion], [12, null]);
  const again = await ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' });
  assert.equal(again.activeVersion, 12);
  assert.equal(api.calls.increments, 0);
});

test('a refused increment with nothing to adopt still fails and keeps the old state', async () => {
  const db = store({ activeDayKey: '2026-10-31', activeVersion: 7 });
  const api = playFab(7, { rateLimited: true });
  await assert.rejects(ensureDailyContributionVersionForToday(deps(db, api), { todayKey: '2026-11-01' }),
    error => error.error === 'StatisticVersionIncrementRateExceeded');
  assert.deepEqual([db.read().activeDayKey, db.read().activeVersion], ['2026-10-31', 7]);
});
