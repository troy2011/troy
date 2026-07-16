const { test, expect } = require('@playwright/test');

const { createTroyCalendarGoogleSync } = require('../server/troyCalendarGoogleSync');

function fieldValue(type, value) {
  return { __fieldValue: type, value };
}

function applyData(current, incoming, merge) {
  const target = merge ? { ...(current || {}) } : {};
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value?.__fieldValue === 'increment') {
      target[key] = Number(target[key] || 0) + Number(value.value || 0);
    } else if (value?.__fieldValue === 'serverTimestamp') {
      target[key] = { seconds: 1, nanoseconds: 0 };
    } else {
      target[key] = value;
    }
  }
  return target;
}

function createFakeFirestore(initialCollections = {}) {
  const collections = new Map();
  let transactionTail = Promise.resolve();
  for (const [name, documents] of Object.entries(initialCollections)) {
    collections.set(name, new Map(Object.entries(documents).map(([id, data]) => [id, { ...data }])));
  }

  function commitWrites(writes) {
    for (const write of writes) {
      const { ref } = write;
      if (!ref?.collectionName || !ref?.id) throw new Error('Invalid fake Firestore document reference.');
    }
    for (const write of writes) {
      const { ref } = write;
      if (!collections.has(ref.collectionName)) collections.set(ref.collectionName, new Map());
      const bucket = collections.get(ref.collectionName);
      if (write.type === 'delete') {
        bucket.delete(ref.id);
      } else {
        bucket.set(ref.id, applyData(bucket.get(ref.id), write.data, write.options?.merge === true));
      }
    }
  }

  function documentReference(collectionName, id) {
    return {
      collectionName,
      id,
      async get() {
        const data = collections.get(collectionName)?.get(id);
        return {
          id,
          exists: data !== undefined,
          data: () => (data === undefined ? undefined : { ...data })
        };
      },
      async set(data, options = {}) {
        commitWrites([{ type: 'set', ref: this, data, options }]);
      },
      async delete() {
        commitWrites([{ type: 'delete', ref: this }]);
      }
    };
  }

  function collectionReference(name, query = {}) {
    return {
      doc(id) {
        return documentReference(name, id);
      },
      where(field, operator, value) {
        return collectionReference(name, { ...query, where: { field, operator, value } });
      },
      orderBy(field, direction) {
        return collectionReference(name, { ...query, orderBy: { field, direction } });
      },
      limit(value) {
        return collectionReference(name, { ...query, limit: Number(value) });
      },
      async get() {
        let rows = [...(collections.get(name) || new Map()).entries()];
        if (query.where) {
          const { field, operator, value } = query.where;
          rows = rows.filter(([, data]) => {
            if (operator === '>=') return Number(data?.[field] || 0) >= Number(value || 0);
            throw new Error(`Unsupported fake where operator: ${operator}`);
          });
        }
        if (query.orderBy) {
          const { field, direction } = query.orderBy;
          const multiplier = direction === 'desc' ? -1 : 1;
          rows.sort((left, right) => (Number(left[1]?.[field] || 0) - Number(right[1]?.[field] || 0)) * multiplier);
        }
        if (Number.isFinite(query.limit)) rows = rows.slice(0, query.limit);
        const docs = rows.map(([id, data]) => ({ id, data: () => ({ ...data }) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
  }

  const firestore = {
    collection(name) {
      return collectionReference(name);
    },
    batch() {
      const writes = [];
      const batch = {
        set(ref, data, options = {}) {
          writes.push({ type: 'set', ref, data, options });
          return batch;
        },
        delete(ref) {
          writes.push({ type: 'delete', ref });
          return batch;
        },
        async commit() {
          commitWrites(writes);
        }
      };
      return batch;
    },
    runTransaction(callback) {
      const run = transactionTail.then(async () => {
        const writes = [];
        const transaction = {
          get: (ref) => ref.get(),
          set(ref, data, options = {}) {
            writes.push({ type: 'set', ref, data, options });
            return transaction;
          },
          delete(ref) {
            writes.push({ type: 'delete', ref });
            return transaction;
          }
        };
        const result = await callback(transaction);
        commitWrites(writes);
        return result;
      });
      transactionTail = run.catch(() => {});
      return run;
    }
  };

  return {
    firestore,
    getDocument(name, id) {
      const data = collections.get(name)?.get(id);
      return data === undefined ? undefined : { ...data };
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeAdmin() {
  return {
    firestore: {
      FieldValue: {
        increment: (value) => fieldValue('increment', value),
        serverTimestamp: () => fieldValue('serverTimestamp')
      }
    }
  };
}

function configuredEnv(overrides = {}) {
  return {
    GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: 'true',
    GOOGLE_BUSINESS_PROFILE_LOCATION_NAME: 'locations/123456789',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
    ...overrides
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    }
  };
}

test('atomic batch keeps calendar and outbox invisible until commit without resetting backoff', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const nextAttemptAtMs = nowMs + 45_000;
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    integration_states: {
      [stateId]: {
        pending: true,
        status: 'retrying',
        revision: 7,
        attemptCount: 3,
        nextAttemptAtMs
      }
    }
  });
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    fetchImpl: async () => {
      throw new Error('Google must not be called while only staging a batch.');
    },
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'atomic-test-worker'
  });
  const calendarRef = store.firestore.collection('troy_business_calendar').doc('calendar-atomic');
  const batch = store.firestore.batch();
  batch.set(calendarRef, {
    date: '2030-08-02',
    openTime: '21:00',
    closeTime: '23:59',
    status: 'open',
    startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
    updatedAtMs: nowMs
  });
  const queued = sync.markPendingInBatch(batch, 'calendar_save', {
    requestedBy: 'king-123',
    calendarId: 'calendar-atomic',
    action: 'save'
  });

  expect(queued).toMatchObject({ status: 'queued', queued: true });
  expect(store.getDocument('troy_business_calendar', 'calendar-atomic')).toBeUndefined();
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    revision: 7,
    status: 'retrying',
    attemptCount: 3,
    nextAttemptAtMs
  });

  await batch.commit();
  sync.stop();

  expect(store.getDocument('troy_business_calendar', 'calendar-atomic')).toMatchObject({
    date: '2030-08-02',
    status: 'open'
  });
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: true,
    status: 'pending',
    revision: 8,
    attemptCount: 3,
    nextAttemptAtMs,
    requestedReason: 'calendar_save',
    requestedBy: 'king-123',
    requestedCalendarId: 'calendar-atomic',
    requestedAction: 'save'
  });
});

test('a Firestore lease lets only one of two manager instances call Google', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  const getStarted = deferred();
  const releaseGet = deferred();
  let businessGetCount = 0;
  let patchCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      businessGetCount += 1;
      getStarted.resolve();
      await releaseGet.promise;
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: [] }
      });
    }
    if (init.method === 'PATCH') patchCount += 1;
    return jsonResponse({ name: 'locations/123456789' });
  };
  const env = configuredEnv({
    GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false'
  });
  const syncA = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env,
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'lease-worker-a'
  });
  const syncB = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env,
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'lease-worker-b'
  });

  const firstFlush = syncA.flush();
  await getStarted.promise;
  const secondResult = await syncB.flush();
  expect(secondResult).toMatchObject({
    status: 'deferred',
    pending: true,
    reason: 'leased'
  });
  expect(businessGetCount).toBe(1);
  expect(patchCount).toBe(0);

  syncB.stop();
  releaseGet.resolve();
  const firstResult = await firstFlush;
  syncA.stop();

  expect(firstResult).toMatchObject({ status: 'synced', pending: false, updated: true });
  expect(businessGetCount).toBe(1);
  expect(patchCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    leaseOwner: null,
    leaseToken: null,
    leaseUntilMs: 0
  });
});

test('lease renewal trusts the committed transaction retry instead of an aborted callback attempt', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  const runCommittedTransaction = store.firestore.runTransaction.bind(store.firestore);
  let transactionCallCount = 0;
  let abortedAttemptResult = 0;
  let abortedAttemptWriteCount = 0;
  const firestore = {
    ...store.firestore,
    async runTransaction(callback) {
      transactionCallCount += 1;
      if (transactionCallCount !== 2) return runCommittedTransaction(callback);

      const stagedWrites = [];
      const abortedTransaction = {
        get: (ref) => ref.get(),
        set(ref, data, options = {}) {
          stagedWrites.push({ type: 'set', ref, data, options });
          return abortedTransaction;
        },
        delete(ref) {
          stagedWrites.push({ type: 'delete', ref });
          return abortedTransaction;
        }
      };
      abortedAttemptResult = await callback(abortedTransaction);
      abortedAttemptWriteCount = stagedWrites.length;

      const stateRef = store.firestore.collection('integration_states').doc(stateId);
      await stateRef.set({
        leaseOwner: 'retry-winning-worker',
        leaseToken: 'retry-winning-token',
        leaseUntilMs: nowMs + 120_000
      }, { merge: true });

      // Firestore can replay a transaction callback after discarding its first
      // attempt. Only this second callback result is allowed to escape.
      return runCommittedTransaction(callback);
    }
  };
  let businessGetCount = 0;
  let patchCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      businessGetCount += 1;
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: [] }
      });
    }
    if (init.method === 'PATCH') patchCount += 1;
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore,
    admin: fakeAdmin(),
    env: configuredEnv({ GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false' }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'lease-retry-worker'
  });

  const result = await sync.flush();
  sync.stop();

  expect(abortedAttemptResult).toBeGreaterThan(nowMs);
  expect(abortedAttemptWriteCount).toBe(1);
  expect(result).toMatchObject({
    status: 'deferred',
    pending: true,
    retryable: true,
    reason: 'lease_lost'
  });
  expect(businessGetCount).toBe(1);
  expect(patchCount).toBe(0);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: true,
    leaseOwner: 'retry-winning-worker',
    leaseToken: 'retry-winning-token',
    leaseUntilMs: nowMs + 120_000
  });
});

test('concurrent flush calls share one failed attempt and preserve persisted backoff', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  let businessGetCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      businessGetCount += 1;
      return jsonResponse({ error: { message: 'temporarily unavailable' } }, 503);
    }
    throw new Error('PATCH must not run after a failed GET.');
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({ GOOGLE_BUSINESS_PROFILE_CHANGE_DEBOUNCE_MS: '60000' }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    random: () => 0.5,
    instanceId: 'backoff-worker'
  });

  const results = await Promise.all([sync.flush(), sync.flush(), sync.flush()]);
  expect(results.map((result) => result.status)).toEqual(['retrying', 'retrying', 'retrying']);
  expect(businessGetCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: true,
    status: 'retrying',
    revision: 1,
    attemptCount: 1,
    nextAttemptAtMs: nowMs + 30_000,
    leaseOwner: null,
    leaseToken: null,
    leaseUntilMs: 0
  });

  expect(await sync.markPending('calendar_changed_during_outage')).toMatchObject({
    status: 'queued',
    queued: true
  });
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: true,
    revision: 2,
    attemptCount: 1,
    nextAttemptAtMs: nowMs + 30_000
  });

  const deferredResult = await sync.flush();
  sync.stop();

  expect(deferredResult).toMatchObject({
    status: 'deferred',
    pending: true,
    reason: 'backoff',
    nextAttemptAtMs: nowMs + 30_000
  });
  expect(businessGetCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    attemptCount: 1,
    nextAttemptAtMs: nowMs + 30_000
  });
});

test('501 future entries block the revision before any Google request', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const startsAtMs = Date.parse('2030-08-02T21:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const calendarDocuments = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [
    `calendar-${String(index).padStart(3, '0')}`,
    {
      date: '2030-08-02',
      openTime: '21:00',
      closeTime: '23:59',
      status: 'open',
      startsAtMs: startsAtMs + index,
      updatedAtMs: nowMs + index
    }
  ]));
  const store = createFakeFirestore({
    troy_business_calendar: calendarDocuments,
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  let googleCallCount = 0;
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    fetchImpl: async () => {
      googleCallCount += 1;
      throw new Error('Google must not be called when the calendar limit is exceeded.');
    },
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'limit-worker'
  });

  const result = await sync.flush();
  sync.stop();

  expect(result).toMatchObject({
    status: 'blocked',
    pending: false,
    retryable: false,
    code: 'GBP_CALENDAR_LIMIT_EXCEEDED'
  });
  expect(googleCallCount).toBe(0);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'blocked',
    lastErrorCode: 'GBP_CALENDAR_LIMIT_EXCEEDED',
    leaseOwner: null,
    leaseToken: null,
    leaseUntilMs: 0
  });
});

test('a revision committed during PATCH remains pending and is applied by one follow-up run', async () => {
  let nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  const firstPatchStarted = deferred();
  const releaseFirstPatch = deferred();
  const patchBodies = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: [] }
      });
    }
    if (init.method === 'PATCH') {
      patchBodies.push(JSON.parse(init.body));
      if (patchBodies.length === 1) {
        firstPatchStarted.resolve();
        await releaseFirstPatch.promise;
      }
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false',
      GOOGLE_BUSINESS_PROFILE_MIN_UPDATE_INTERVAL_MS: '5000'
    }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'revision-worker'
  });

  const firstFlush = sync.flush();
  await firstPatchStarted.promise;

  const batch = store.firestore.batch();
  batch.set(store.firestore.collection('troy_business_calendar').doc('calendar2'), {
    date: '2030-08-03',
    openTime: '20:00',
    closeTime: '23:00',
    status: 'open',
    startsAtMs: Date.parse('2030-08-03T20:00:00+09:00'),
    updatedAtMs: nowMs + 1
  });
  sync.markPendingInBatch(batch, 'calendar_save', {
    requestedBy: 'king-456',
    calendarId: 'calendar2',
    action: 'save'
  });
  await batch.commit();
  const joinedFlush = sync.flush();
  releaseFirstPatch.resolve();

  const [firstResult, joinedResult] = await Promise.all([firstFlush, joinedFlush]);
  expect(firstResult).toMatchObject({ status: 'deferred', pending: true, reason: 'backoff' });
  expect(joinedResult).toMatchObject({ status: 'deferred', pending: true, reason: 'backoff' });
  expect(patchBodies).toHaveLength(1);
  const betweenRuns = store.getDocument('integration_states', stateId);
  expect(betweenRuns).toMatchObject({
    pending: true,
    revision: 2,
    lastAppliedRevision: 1,
    attemptCount: 0
  });

  nowMs = betweenRuns.nextAttemptAtMs;
  const finalResult = await sync.flush();
  sync.stop();

  expect(finalResult).toMatchObject({ status: 'synced', pending: false, updated: true });
  expect(patchBodies).toHaveLength(2);
  expect(patchBodies[1].specialHours.specialHourPeriods.map((period) => period.startDate)).toEqual([
    { year: 2030, month: 8, day: 2 },
    { year: 2030, month: 8, day: 3 }
  ]);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    revision: 2,
    lastAppliedRevision: 2,
    managedDates: ['2030-08-02', '2030-08-03']
  });
});

test('a production generation supersedes an in-flight dry-run without stale finalize clearing pending', async () => {
  let nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  const dryPatchStarted = deferred();
  const releaseDryPatch = deferred();
  const dryPatchUrls = [];
  const productionPatchUrls = [];
  const locationPayload = {
    name: 'locations/123456789',
    regularHours: { periods: [{ openDay: 'THURSDAY' }] },
    specialHours: { specialHourPeriods: [] }
  };
  const dryFetch = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'dry-access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') return jsonResponse(locationPayload);
    if (init.method === 'PATCH') {
      dryPatchUrls.push(String(url));
      dryPatchStarted.resolve();
      await releaseDryPatch.promise;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const productionFetch = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'production-access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') return jsonResponse(locationPayload);
    if (init.method === 'PATCH') productionPatchUrls.push(String(url));
    return jsonResponse({ name: 'locations/123456789' });
  };
  const drySync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '1',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'true',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false'
    }),
    fetchImpl: dryFetch,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'generation-1-dry-worker'
  });
  const productionSync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '2',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'false',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false'
    }),
    fetchImpl: productionFetch,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'generation-2-production-worker'
  });

  const dryFlush = drySync.flush();
  await dryPatchStarted.promise;

  let activation;
  let stateAfterActivation;
  try {
    activation = await productionSync.activateConfiguration('production_activation');
    productionSync.stop();
    stateAfterActivation = store.getDocument('integration_states', stateId);
  } finally {
    releaseDryPatch.resolve();
  }

  expect(activation).toMatchObject({ status: 'activated', revision: 2 });
  expect(stateAfterActivation).toMatchObject({
    pending: true,
    revision: 2,
    activeConfigGeneration: 2,
    activeValidateOnly: false,
    leaseOwner: 'generation-1-dry-worker'
  });

  const dryResult = await dryFlush;
  drySync.stop();
  expect(dryResult).toMatchObject({
    status: 'deferred',
    pending: true,
    reason: 'stale_lease',
    dryRun: true
  });
  const stateAfterStaleFinalize = store.getDocument('integration_states', stateId);
  expect(stateAfterStaleFinalize).toMatchObject({
    pending: true,
    revision: 2,
    activeConfigGeneration: 2,
    activeValidateOnly: false
  });
  expect(stateAfterStaleFinalize.lastAppliedRevision).not.toBe(1);
  expect(dryPatchUrls).toHaveLength(1);
  expect(new URL(dryPatchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(productionPatchUrls).toHaveLength(0);

  nowMs = stateAfterStaleFinalize.leaseUntilMs;
  const productionResult = await productionSync.flush();
  productionSync.stop();

  expect(productionResult).toMatchObject({
    status: 'synced',
    pending: false,
    updated: true,
    dryRun: false
  });
  expect(productionPatchUrls).toHaveLength(1);
  expect(new URL(productionPatchUrls[0]).searchParams.has('validateOnly')).toBe(false);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    revision: 2,
    lastAppliedRevision: 2,
    activeConfigGeneration: 2,
    activeValidateOnly: false,
    lastUpdatedRemote: true
  });
});

test('workers with the same generation but different fingerprints report configuration conflict', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore();
  let googleCallCount = 0;
  const fetchImpl = async () => {
    googleCallCount += 1;
    throw new Error('A configuration conflict must not call Google.');
  };
  const primarySync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '7',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'false'
    }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'fingerprint-primary-worker'
  });
  const conflictingSync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '7',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'true'
    }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'fingerprint-conflict-worker'
  });

  expect(await primarySync.activateConfiguration('primary_activation')).toMatchObject({
    status: 'activated',
    revision: 1
  });
  primarySync.stop();
  expect(await conflictingSync.activateConfiguration('conflicting_activation')).toMatchObject({
    status: 'configuration_conflict',
    relation: 'conflict',
    activeGeneration: 7
  });
  expect(await conflictingSync.flush()).toMatchObject({
    status: 'configuration_conflict',
    pending: true,
    retryable: false,
    code: 'GBP_CONFIG_GENERATION_CONFLICT',
    activeGeneration: 7
  });
  conflictingSync.stop();

  expect(googleCallCount).toBe(0);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: true,
    revision: 1,
    activeConfigGeneration: 7,
    activeValidateOnly: false
  });
});

test('getStatus exposes blocked and validated outcomes without leaking internal state', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore();
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '4',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'true'
    }),
    fetchImpl: async () => {
      throw new Error('getStatus must not call Google.');
    },
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'status-worker'
  });
  expect(await sync.activateConfiguration('status_activation')).toMatchObject({ status: 'activated' });
  sync.stop();

  const stateRef = store.firestore.collection('integration_states').doc(stateId);
  await stateRef.set({
    pending: false,
    status: 'blocked',
    revision: 8,
    lastAppliedRevision: 7,
    lastUpdatedRemote: false,
    lastWouldUpdateRemote: false,
    lastErrorCode: 'GBP_PERMISSION_DENIED',
    lastError: 'refresh-token-secret must stay private',
    leaseOwner: 'internal-worker-id',
    leaseToken: 'internal-lease-token',
    requestedBy: 'private-playfab-id'
  }, { merge: true });

  const blocked = await sync.getStatus();
  expect(blocked).toEqual({
    status: 'blocked',
    configured: true,
    enabled: true,
    pending: false,
    retryable: false,
    dryRun: true,
    code: 'GBP_PERMISSION_DENIED',
    revision: 8,
    lastAppliedRevision: 7,
    lastUpdatedRemote: false,
    lastWouldUpdateRemote: false,
    configurationMismatch: false,
    activeGeneration: 4
  });
  expect(JSON.stringify(blocked)).not.toContain('refresh-token-secret');
  expect(blocked).not.toHaveProperty('leaseOwner');
  expect(blocked).not.toHaveProperty('leaseToken');
  expect(blocked).not.toHaveProperty('requestedBy');
  expect(blocked).not.toHaveProperty('activeConfigFingerprint');

  await stateRef.set({
    pending: false,
    status: 'validated',
    revision: 9,
    lastAppliedRevision: 9,
    lastUpdatedRemote: false,
    lastWouldUpdateRemote: true,
    lastErrorCode: null
  }, { merge: true });
  expect(await sync.getStatus()).toMatchObject({
    status: 'validated',
    pending: false,
    retryable: false,
    dryRun: true,
    code: null,
    revision: 9,
    lastAppliedRevision: 9,
    lastUpdatedRemote: false,
    lastWouldUpdateRemote: true,
    configurationMismatch: false,
    activeGeneration: 4
  });
});

test('the minimum remote update interval is clamped to fifteen seconds', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    },
    integration_states: {
      [stateId]: { pending: true, status: 'pending', revision: 1 }
    }
  });
  let patchCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: [] }
      });
    }
    if (init.method === 'PATCH') patchCount += 1;
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv({
      GOOGLE_BUSINESS_PROFILE_MIN_UPDATE_INTERVAL_MS: '5000',
      GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false'
    }),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    instanceId: 'minimum-interval-worker'
  });

  const result = await sync.flush();
  sync.stop();

  expect(result).toMatchObject({ status: 'synced', pending: false, updated: true });
  expect(patchCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    nextAttemptAtMs: nowMs + 15_000
  });
});

test('calendar sync persists an outbox revision, preserves manual dates, and clears pending after PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    }
  });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: {
          specialHourPeriods: [{
            startDate: { year: 2030, month: 12, day: 24 },
            closed: true
          }]
        }
      });
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    random: () => 0.5
  });

  const queued = await sync.markPending('test_save');
  expect(queued.status).toBe('queued');
  const result = await sync.flush();
  sync.stop();

  expect(result).toMatchObject({
    status: 'synced',
    updated: true,
    pending: false,
    managedDateCount: 1
  });
  const state = store.getDocument('integration_states', 'troy_google_business_profile_special_hours');
  expect(state).toMatchObject({
    pending: false,
    status: 'synced',
    revision: 1,
    managedDates: ['2030-08-02'],
    locationName: 'locations/123456789'
  });

  const patches = calls.filter((call) => call.init.method === 'PATCH');
  expect(patches).toHaveLength(1);
  const productionPatch = patches[0];
  expect(new URL(productionPatch.url).searchParams.has('validateOnly')).toBe(false);
  const periods = JSON.parse(productionPatch.init.body).specialHours.specialHourPeriods;
  expect(periods).toEqual([
    {
      startDate: { year: 2030, month: 8, day: 2 },
      openTime: { hours: 21, minutes: 0 },
      endDate: { year: 2030, month: 8, day: 2 },
      closeTime: { hours: 23, minutes: 59 }
    },
    { startDate: { year: 2030, month: 12, day: 24 }, closed: true }
  ]);
});

test('missing regular hours blocks the revision without retrying forever', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: {
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }
    }
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} }
  });

  await sync.markPending('test_save');
  const result = await sync.flush();
  sync.stop();

  expect(result).toMatchObject({
    status: 'blocked',
    pending: false,
    retryable: false,
    code: 'GBP_REGULAR_HOURS_REQUIRED'
  });
  expect(store.getDocument('integration_states', 'troy_google_business_profile_special_hours')).toMatchObject({
    pending: false,
    status: 'blocked',
    lastErrorCode: 'GBP_REGULAR_HOURS_REQUIRED'
  });
});

test('explicit opt-in keeps disabled deployments from adding Firestore integration state', async () => {
  const store = createFakeFirestore();
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: {},
    logger: { info() {}, warn() {} }
  });

  expect(await sync.markPending('test_save')).toMatchObject({
    status: 'disabled',
    enabled: false,
    configured: false
  });
  expect(store.getDocument('integration_states', 'troy_google_business_profile_special_hours')).toBeUndefined();
});
