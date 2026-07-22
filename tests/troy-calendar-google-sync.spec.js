const { test, expect } = require('@playwright/test');

const {
  createTroyCalendarGoogleSync,
  __test: { GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION, configFingerprint }
} = require('../server/troyCalendarGoogleSync');
const {
  hashSpecialHourPeriods,
  readGoogleBusinessProfileConfig
} = require('../server/googleBusinessProfile');

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
    } else if (value?.__fieldValue === 'delete') {
      delete target[key];
    } else if (value?.__fieldValue === 'arrayUnion') {
      target[key] = [...new Set([
        ...(Array.isArray(target[key]) ? target[key] : []),
        ...(Array.isArray(value.value) ? value.value : [])
      ])];
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
        serverTimestamp: () => fieldValue('serverTimestamp'),
        delete: () => fieldValue('delete'),
        arrayUnion: (...values) => fieldValue('arrayUnion', values)
      }
    }
  };
}

function configuredEnv(overrides = {}) {
  return {
    GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: 'true',
    GOOGLE_BUSINESS_PROFILE_LOCATION_NAME: 'locations/123456789',
    GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME: 'locations/123456789',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
    GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'true',
    GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false',
    GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED: 'false',
    ...overrides
  };
}

function productionEnv(overrides = {}) {
  return configuredEnv({
    GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: 'false',
    GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'true',
    GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED: 'true',
    ...overrides
  });
}

function approvedPendingState(env, overrides = {}) {
  const config = readGoogleBusinessProfileConfig(env);
  const parsedGeneration = Math.floor(Number(env.GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION));
  const generation = Number.isInteger(parsedGeneration) && parsedGeneration >= 1
    ? parsedGeneration
    : 1;
  return {
    pending: true,
    status: 'pending',
    revision: 1,
    explicitlyApproved: true,
    requestedOperationId: 'approved-operation-0001',
    requestedConsentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
    requestedLocationName: config.locationName,
    requestedConfigGeneration: generation,
    requestedConfigFingerprint: configFingerprint(config, generation),
    ...overrides
  };
}

function approvedMetadata(overrides = {}) {
  return {
    operationId: 'approved-operation-0001',
    consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
    locationName: 'locations/123456789',
    ...overrides
  };
}

function approvedCalendarEntry(overrides = {}, env = configuredEnv()) {
  const config = readGoogleBusinessProfileConfig(env);
  const parsedGeneration = Math.floor(Number(env.GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION));
  const generation = Number.isInteger(parsedGeneration) && parsedGeneration >= 1
    ? parsedGeneration
    : 1;
  return {
    googleBusinessProfileConsent: true,
    googleBusinessProfileConsentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
    googleBusinessProfileOperationId: 'approved-operation-0001',
    googleBusinessProfileLocationName: config.locationName,
    googleBusinessProfileAuthorization: 'staff_playfab_allowlist_and_king',
    googleBusinessProfileConfigGeneration: generation,
    googleBusinessProfileConfigFingerprint: configFingerprint(config, generation),
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
  batch.set(calendarRef, approvedCalendarEntry({
    date: '2030-08-02',
    openTime: '21:00',
    closeTime: '23:59',
    status: 'open',
    startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
    updatedAtMs: nowMs
  }));
  const queued = sync.markPendingInBatch(batch, 'calendar_save', approvedMetadata({
    requestedBy: 'king-123',
    calendarId: 'calendar-atomic',
    action: 'save'
  }));

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
    requestedOperationId: 'approved-operation-0001',
    requestedConsentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
    requestedBy: 'king-123',
    requestedCalendarId: 'calendar-atomic',
    requestedAction: 'save'
  });
});

test('outbox queueing requires a valid operation id and current consent version', async () => {
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore();
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    logger: { info() {}, warn() {} }
  });

  for (const metadata of [
    {},
    { operationId: 'short', consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION },
    { operationId: 'approved-operation-wrong', consentVersion: 'legacy-consent-v0' },
    approvedMetadata({ locationName: 'locations/999999999' })
  ]) {
    expect(await sync.markPending('calendar_save', metadata)).toMatchObject({
      status: 'approval_required',
      queued: false,
      code: 'GBP_EXPLICIT_APPROVAL_REQUIRED',
      consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION
    });
  }
  const batch = store.firestore.batch();
  expect(sync.markPendingInBatch(batch, 'calendar_save', {})).toMatchObject({
    status: 'approval_required',
    queued: false
  });
  await batch.commit();
  sync.stop();

  expect(store.getDocument('integration_states', stateId)).toBeUndefined();
});

test('startup activates configuration but never creates an unapproved sync request', async () => {
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore();
  let googleCallCount = 0;
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: configuredEnv(),
    fetchImpl: async () => {
      googleCallCount += 1;
      throw new Error('Startup must not call Google without an approved outbox request.');
    },
    logger: { info() {}, warn() {} }
  });

  expect(sync.start()).toMatchObject({ status: 'configured', enabled: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  sync.stop();

  expect(googleCallCount).toBe(0);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    activeConfigGeneration: 1,
    activeValidateOnly: true
  });
  expect(store.getDocument('integration_states', stateId).requestedReason).toBeUndefined();
});

test('legacy, local-only, and stale-configuration rows are excluded while their remote dates are preserved', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [{
    startDate: { year: 2030, month: 8, day: 2 },
    closed: true
  }];
  for (const calendarEntry of [
    {
      date: '2030-08-02',
      openTime: '21:00',
      closeTime: '23:59',
      status: 'open',
      startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
      updatedAtMs: nowMs
    },
    approvedCalendarEntry({
      date: '2030-08-02',
      openTime: '21:00',
      closeTime: '23:59',
      status: 'open',
      startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
      updatedAtMs: nowMs,
      googleBusinessProfileConfigFingerprint: 'stale-config-fingerprint'
    })
  ]) {
    const store = createFakeFirestore({
      troy_business_calendar: { calendar1: calendarEntry },
      integration_states: { [stateId]: approvedPendingState(configuredEnv()) }
    });
    const calls = [];
    const sync = createTroyCalendarGoogleSync({
      firestore: store.firestore,
      admin: fakeAdmin(),
      env: configuredEnv(),
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
        }
        return jsonResponse({
          name: 'locations/123456789',
          regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: remotePeriods }
        });
      },
      now: () => nowMs,
      logger: { info() {}, warn() {} }
    });

    expect(sync.getApprovalContext()).toMatchObject({
      consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
      locationName: 'locations/123456789',
      configGeneration: 1
    });
    const result = await sync.flush();
    sync.stop();

    expect(result).toMatchObject({ status: 'up_to_date', pending: false, updated: false });
    expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(0);
    expect(store.getDocument('integration_states', stateId)).not.toHaveProperty(
      'lastObservedRemoteSpecialHoursHash'
    );
  }
});

test('a Firestore lease lets only one of two manager instances call Google', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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

  expect(firstResult).toMatchObject({ status: 'validated', pending: false, updated: false });
  expect(businessGetCount).toBe(1);
  expect(patchCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'validated',
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
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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

  expect(await sync.markPending(
    'calendar_changed_during_outage',
    approvedMetadata({ operationId: 'approved-operation-0002' })
  )).toMatchObject({
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
    approvedCalendarEntry({
      date: '2030-08-02',
      openTime: '21:00',
      closeTime: '23:59',
      status: 'open',
      startsAtMs: startsAtMs + index,
      updatedAtMs: nowMs + index
    })
  ]));
  const store = createFakeFirestore({
    troy_business_calendar: calendarDocuments,
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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
  batch.set(store.firestore.collection('troy_business_calendar').doc('calendar2'), approvedCalendarEntry({
    date: '2030-08-03',
    openTime: '20:00',
    closeTime: '23:00',
    status: 'open',
    startsAtMs: Date.parse('2030-08-03T20:00:00+09:00'),
    updatedAtMs: nowMs + 1,
    googleBusinessProfileOperationId: 'approved-operation-0002'
  }));
  sync.markPendingInBatch(batch, 'calendar_save', approvedMetadata({
    operationId: 'approved-operation-0002',
    requestedBy: 'king-456',
    calendarId: 'calendar2',
    action: 'save'
  }));
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

  expect(finalResult).toMatchObject({ status: 'validated', pending: false, updated: false });
  expect(patchBodies).toHaveLength(2);
  expect(patchBodies[1].specialHours.specialHourPeriods.map((period) => period.startDate)).toEqual([
    { year: 2030, month: 8, day: 2 },
    { year: 2030, month: 8, day: 3 }
  ]);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'validated',
    revision: 2,
    lastAppliedRevision: 2
  });
  expect(store.getDocument('integration_states', stateId).managedDates).toBeUndefined();
});

test('a production generation supersedes an in-flight dry-run without stale finalize clearing pending', async () => {
  let nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv({
        GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '1'
      }))
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
    if (init.method === 'PATCH') {
      productionPatchUrls.push(String(url));
      if (!new URL(String(url)).searchParams.has('validateOnly')) {
        locationPayload.specialHours.specialHourPeriods = JSON.parse(init.body)
          .specialHours.specialHourPeriods;
      }
    }
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
    env: productionEnv({ GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '2' }),
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

  expect(activation).toMatchObject({ status: 'approval_required', pending: false });
  expect(stateAfterActivation).toMatchObject({
    pending: false,
    revision: 1,
    status: 'approval_required',
    activeConfigGeneration: 2,
    activeValidateOnly: false,
    leaseOwner: null,
    lastErrorCode: 'GBP_EXPLICIT_APPROVAL_REQUIRED'
  });

  const dryResult = await dryFlush;
  drySync.stop();
  expect(dryResult).toMatchObject({
    status: 'deferred',
    pending: false,
    reason: 'stale_lease',
    dryRun: true
  });
  const stateAfterStaleFinalize = store.getDocument('integration_states', stateId);
  expect(stateAfterStaleFinalize).toMatchObject({
    pending: false,
    revision: 1,
    status: 'approval_required',
    activeConfigGeneration: 2,
    activeValidateOnly: false
  });
  expect(stateAfterStaleFinalize.lastAppliedRevision).not.toBe(1);
  expect(dryPatchUrls).toHaveLength(1);
  expect(new URL(dryPatchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(productionPatchUrls).toHaveLength(0);

  expect(await productionSync.flush()).toMatchObject({ status: 'idle', pending: false });
  expect(productionPatchUrls).toHaveLength(0);

  const productionApproval = productionSync.getApprovalContext();
  await store.firestore.collection('troy_business_calendar').doc('calendar1').set({
    googleBusinessProfileOperationId: 'approved-operation-prod2',
    googleBusinessProfileConsentVersion: productionApproval.consentVersion,
    googleBusinessProfileLocationName: productionApproval.locationName,
    googleBusinessProfileConfigGeneration: productionApproval.configGeneration,
    googleBusinessProfileConfigFingerprint: productionApproval.configFingerprint
  }, { merge: true });

  expect(await productionSync.markPending('production_after_review', approvedMetadata({
    operationId: 'approved-operation-prod2'
  }))).toMatchObject({ status: 'queued', queued: true });
  expect(await productionSync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    code: 'GBP_INITIAL_SYNC_REQUIRES_REVIEW'
  });
  const productionReview = await productionSync.getReviewDetails();
  expect(await productionSync.approveReview(approvedMetadata({
    operationId: 'approved-operation-review-prod2',
    reviewedRemoteSpecialHoursHash: productionReview.reviewHash
  }))).toMatchObject({ status: 'queued', queued: true });
  const productionResult = await productionSync.flush();
  productionSync.stop();

  expect(productionResult).toMatchObject({
    status: 'synced',
    pending: false,
    updated: true,
    dryRun: false
  });
  expect(productionPatchUrls).toHaveLength(2);
  expect(new URL(productionPatchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(new URL(productionPatchUrls[1]).searchParams.has('validateOnly')).toBe(false);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    revision: 3,
    lastAppliedRevision: 3,
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
    env: productionEnv({ GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION: '7' }),
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
    pending: false
  });
  expect(await primarySync.markPending('primary_approved_request', approvedMetadata({
    reviewedRemoteSpecialHoursHash: hashSpecialHourPeriods([])
  }))).toMatchObject({ status: 'queued', queued: true });
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
    reviewRequired: false,
    reviewRequiredReason: null,
    reviewExpiresAtMs: null,
    revision: 8,
    lastAppliedRevision: 7,
    lastAppliedManagedSpecialHoursHash: null,
    lastAppliedManagedSpecialHoursRevision: 0,
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
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
    },
    integration_states: {
      [stateId]: approvedPendingState(configuredEnv())
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

  expect(result).toMatchObject({ status: 'validated', pending: false, updated: false });
  expect(patchCount).toBe(1);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'validated',
    nextAttemptAtMs: nowMs + 15_000
  });
});

test('Google-updated special hours require review while pending edits retain the approved outbox', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const stateId = 'troy_google_business_profile_special_hours';
  const googleProposedPeriods = [{
    startDate: { year: 2030, month: 8, day: 5 },
    closed: true
  }];
  const cases = [
    {
      metadata: { hasGoogleUpdated: true },
      googleUpdated: {
        diffMask: 'specialHours',
        location: {
          name: 'locations/123456789',
          specialHours: { specialHourPeriods: googleProposedPeriods }
        }
      },
      approveAfterReview: true,
      expected: {
        status: 'conflict_requires_review',
        pending: false,
        retryable: false,
        code: 'GBP_GOOGLE_UPDATED_SPECIAL_HOURS_REQUIRES_REVIEW'
      }
    },
    {
      metadata: { hasPendingEdits: true },
      googleUpdated: { pendingMask: 'specialHours' },
      expected: {
        status: 'retrying',
        pending: true,
        retryable: true,
        code: 'GBP_GOOGLE_SPECIAL_HOURS_UPDATE_PENDING'
      }
    }
  ];

  for (const scenario of cases) {
    const store = createFakeFirestore({
      troy_business_calendar: {
        calendar1: approvedCalendarEntry({
          date: '2030-08-02',
          openTime: '21:00',
          closeTime: '23:59',
          status: 'open',
          startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
          updatedAtMs: nowMs
        })
      },
      integration_states: { [stateId]: approvedPendingState(configuredEnv()) }
    });
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) return jsonResponse(scenario.googleUpdated);
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789',
          regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: [] },
          metadata: scenario.metadata
        });
      }
      if (scenario.approveAfterReview && init.method === 'PATCH') {
        return jsonResponse({ name: 'locations/123456789', validated: true });
      }
      throw new Error('PATCH must not run while Google has pending special-hours edits.');
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

    const result = await sync.flush();

    expect(result).toMatchObject(scenario.expected);
    const updatedCalls = calls.filter((call) => call.url.includes(':getGoogleUpdated'));
    expect(updatedCalls).toHaveLength(1);
    expect(new URL(updatedCalls[0].url).searchParams.get('readMask')).toBe('specialHours');
    expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(0);
    expect(store.getDocument('integration_states', stateId)).toMatchObject({
      pending: scenario.expected.pending,
      lastErrorCode: scenario.expected.code
    });
    if (scenario.approveAfterReview) {
      const stateBeforeDetails = store.getDocument('integration_states', stateId);
      const reviewDetails = await sync.getReviewDetails();
      expect(reviewDetails).toMatchObject({
        status: 'review_required',
        reviewRequired: true,
        reason: 'google_updated_special_hours',
        remoteSpecialHours: googleProposedPeriods
      });
      expect(reviewDetails.reviewHash).toMatch(/^[a-f0-9]{64}$/);
      expect(reviewDetails.proposedSpecialHours).toEqual([{
        startDate: { year: 2030, month: 8, day: 2 },
        openTime: { hours: 21, minutes: 0 },
        endDate: { year: 2030, month: 8, day: 2 },
        closeTime: { hours: 23, minutes: 59 }
      }]);
      expect(store.getDocument('integration_states', stateId)).toEqual(stateBeforeDetails);
      expect(await sync.approveReview(approvedMetadata({
        operationId: 'approved-operation-google-diff',
        reviewedRemoteSpecialHoursHash: reviewDetails.reviewHash
      }))).toMatchObject({ status: 'queued', queued: true });
      expect(await sync.flush()).toMatchObject({
        status: 'validated',
        pending: false,
        updated: false,
        wouldUpdate: true
      });
      expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(1);
    }
    sync.stop();
  }
});

test('initial production sync requires an exact composite review before the guarded PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [];
  const remoteHash = hashSpecialHourPeriods(remotePeriods);
  const desiredPeriods = [{
    startDate: { year: 2030, month: 8, day: 2 },
    openTime: { hours: 21, minutes: 0 },
    endDate: { year: 2030, month: 8, day: 2 },
    closeTime: { hours: 23, minutes: 59 }
  }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: approvedPendingState(env, { reviewedRemoteSpecialHoursHash: null })
    }
  });
  const calls = [];
  let currentRemotePeriods = remotePeriods;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: currentRemotePeriods }
      });
    }
    if (!new URL(String(url)).searchParams.has('validateOnly')) {
      currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env,
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    reviewRequired: true,
    code: 'GBP_INITIAL_SYNC_REQUIRES_REVIEW'
  });
  expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(0);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'conflict_requires_review',
    reviewRequiredExpiresAtMs: nowMs + (24 * 60 * 60 * 1000)
  });
  expect(store.getDocument('integration_states', stateId)).not.toHaveProperty(
    'reviewRequiredRemoteSpecialHoursHash'
  );

  const stateBeforeDetails = store.getDocument('integration_states', stateId);
  expect(await sync.getReviewDetails()).toMatchObject({
    status: 'review_required',
    reason: 'initial_production_baseline',
    remoteSpecialHours: remotePeriods,
    proposedSpecialHours: desiredPeriods
  });
  const reviewDetails = await sync.getReviewDetails();
  expect(reviewDetails.reviewHash).toMatch(/^[a-f0-9]{64}$/);
  expect(store.getDocument('integration_states', stateId)).toEqual(stateBeforeDetails);

  expect(await sync.approveReview(approvedMetadata({
    operationId: 'approved-operation-wrong-hash',
    reviewedRemoteSpecialHoursHash: hashSpecialHourPeriods([
      { startDate: { year: 2030, month: 8, day: 2 }, closed: true }
    ])
  }))).toMatchObject({
    status: 'review_conflict',
    queued: false,
    code: 'GBP_REVIEW_SNAPSHOT_CHANGED'
  });
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'conflict_requires_review',
    revision: 1
  });

  expect(await sync.approveReview(approvedMetadata({
    operationId: 'approved-operation-review1',
    reviewedRemoteSpecialHoursHash: reviewDetails.reviewHash
  }))).toMatchObject({ status: 'queued', queued: true });
  const result = await sync.flush();
  sync.stop();

  expect(result).toMatchObject({ status: 'synced', pending: false, updated: true });
  const patches = calls.filter((call) => call.init.method === 'PATCH');
  expect(patches).toHaveLength(2);
  expect(new URL(patches[0].url).searchParams.get('validateOnly')).toBe('true');
  expect(new URL(patches[1].url).searchParams.has('validateOnly')).toBe(false);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    pending: false,
    status: 'synced',
    lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(desiredPeriods),
    lastAppliedManagedSpecialHoursRevision: 2,
    lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
  });
});

test('a Google change after validate-only stops before the production PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const driftedPeriods = [{
    startDate: { year: 2030, month: 8, day: 2 },
    openTime: { hours: 17, minutes: 0 },
    endDate: { year: 2030, month: 8, day: 2 },
    closeTime: { hours: 22, minutes: 0 }
  }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: {
        ...approvedPendingState(env),
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(remotePeriods),
        lastAppliedManagedSpecialHoursRevision: 0,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      }
    }
  });
  let currentRemotePeriods = remotePeriods;
  const patchUrls = [];
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) {
        return jsonResponse({ diffMask: '', pendingMask: '' });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: currentRemotePeriods }
        });
      }
      patchUrls.push(String(url));
      if (new URL(String(url)).searchParams.get('validateOnly') === 'true') {
        currentRemotePeriods = driftedPeriods;
      }
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    code: 'GBP_REVIEW_SNAPSHOT_CHANGED'
  });
  sync.stop();
  expect(patchUrls).toHaveLength(1);
  expect(new URL(patchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(store.getDocument('integration_states', stateId)).not.toHaveProperty(
    'lastAppliedManagedSpecialHoursRevision',
    1
  );
});

test('an outbox revision change after validation prevents the production PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: {
        ...approvedPendingState(env),
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(remotePeriods),
        lastAppliedManagedSpecialHoursRevision: 0,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      }
    }
  });
  const patchUrls = [];
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) {
        return jsonResponse({ diffMask: '', pendingMask: '' });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: remotePeriods }
        });
      }
      patchUrls.push(String(url));
      if (new URL(String(url)).searchParams.get('validateOnly') === 'true') {
        await store.firestore.collection('integration_states').doc(stateId).set({
          revision: 2,
          requestedOperationId: 'newer-approved-operation'
        }, { merge: true });
      }
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, random: () => 0, logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({
    status: 'retrying',
    pending: true,
    retryable: true,
    code: 'GBP_SYNC_STATE_CHANGED_DURING_VALIDATION'
  });
  sync.stop();
  expect(patchUrls).toHaveLength(1);
  expect(new URL(patchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    revision: 2,
    pending: true,
    lastErrorCode: 'GBP_SYNC_STATE_CHANGED_DURING_VALIDATION'
  });
});

test('a failed production response that is not applied requires review without automatic re-PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const store = createFakeFirestore({
    integration_states: {
      [stateId]: {
        ...approvedPendingState(env),
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02'],
        approvedRemovalDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(remotePeriods),
        lastAppliedManagedSpecialHoursRevision: 0,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      }
    }
  });
  const patchUrls = [];
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) {
        return jsonResponse({ diffMask: '', pendingMask: '' });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: remotePeriods }
        });
      }
      patchUrls.push(String(url));
      if (!new URL(String(url)).searchParams.has('validateOnly')) {
        return jsonResponse({ error: { message: 'upstream unavailable' } }, 503);
      }
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED',
    reason: 'post_write_verification_required'
  });
  expect(patchUrls).toHaveLength(2);
  expect(new URL(patchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(new URL(patchUrls[1]).searchParams.has('validateOnly')).toBe(false);
  expect(await sync.flush()).toMatchObject({ status: 'idle', pending: false });
  expect(patchUrls).toHaveLength(2);
  sync.stop();
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    status: 'conflict_requires_review',
    approvedRemovalDates: ['2030-08-02'],
    lastAppliedManagedSpecialHoursRevision: 0
  });
});

test('a failed production response is successful only when post-verification proves it was applied', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const remotePeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: {
        ...approvedPendingState(env),
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(remotePeriods),
        lastAppliedManagedSpecialHoursRevision: 0,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      }
    }
  });
  let currentRemotePeriods = remotePeriods;
  const patchUrls = [];
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) {
        return jsonResponse({ diffMask: '', pendingMask: '' });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: currentRemotePeriods }
        });
      }
      patchUrls.push(String(url));
      if (!new URL(String(url)).searchParams.has('validateOnly')) {
        currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
        return jsonResponse({ error: { message: 'response lost after apply' } }, 503);
      }
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({ status: 'synced', pending: false, updated: true });
  expect(patchUrls).toHaveLength(2);
  expect(new URL(patchUrls[0]).searchParams.get('validateOnly')).toBe('true');
  expect(new URL(patchUrls[1]).searchParams.has('validateOnly')).toBe(false);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    status: 'synced',
    lastAppliedManagedSpecialHoursRevision: 1
  });
  sync.stop();
});

for (const scenario of [
  { label: 'pending mask', response: { pendingMask: 'specialHours', diffMask: '' } },
  { label: 'diff mask', response: { pendingMask: '', diffMask: 'specialHours' } },
  { label: 'getGoogleUpdated failure', response: null }
]) {
  test(`post-PATCH ${scenario.label} stops for review without replaying the write`, async () => {
    const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
    const env = productionEnv();
    const stateId = 'troy_google_business_profile_special_hours';
    const remotePeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
    const store = createFakeFirestore({
      troy_business_calendar: {
        calendar1: approvedCalendarEntry({
          date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
          startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
        }, env)
      },
      integration_states: {
        [stateId]: {
          ...approvedPendingState(env),
          locationName: 'locations/123456789',
          managedDates: ['2030-08-02'],
          lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(remotePeriods),
          lastAppliedManagedSpecialHoursRevision: 0,
          lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
        }
      }
    });
    let currentRemotePeriods = remotePeriods;
    let googleUpdatedReads = 0;
    const patchUrls = [];
    const sync = createTroyCalendarGoogleSync({
      firestore: store.firestore, admin: fakeAdmin(), env,
      fetchImpl: async (url, init = {}) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
        }
        if (String(url).includes(':getGoogleUpdated')) {
          googleUpdatedReads += 1;
          if (googleUpdatedReads === 1) return jsonResponse({ diffMask: '', pendingMask: '' });
          return scenario.response
            ? jsonResponse(scenario.response)
            : jsonResponse({ error: { message: 'verification unavailable' } }, 503);
        }
        if ((init.method || 'GET') === 'GET') {
          return jsonResponse({
            name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
            specialHours: { specialHourPeriods: currentRemotePeriods }
          });
        }
        patchUrls.push(String(url));
        if (!new URL(String(url)).searchParams.has('validateOnly')) {
          currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
        }
        return jsonResponse({ name: 'locations/123456789' });
      },
      now: () => nowMs, logger: { info() {}, warn() {} }
    });

    expect(await sync.flush()).toMatchObject({
      status: 'conflict_requires_review',
      pending: false,
      code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED'
    });
    expect(await sync.flush()).toMatchObject({ status: 'idle', pending: false });
    expect(patchUrls).toHaveLength(2);
    expect(store.getDocument('integration_states', stateId)).toMatchObject({
      status: 'conflict_requires_review',
      lastAppliedManagedSpecialHoursRevision: 0
    });
    sync.stop();
  });
}

test('remote drift after an applied revision blocks until that exact composite is reviewed', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const previousPeriods = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const remotePeriods = [];
  const remoteHash = hashSpecialHourPeriods(remotePeriods);
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: approvedPendingState(env, {
        reviewedRemoteSpecialHoursHash: null,
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(previousPeriods),
        lastAppliedManagedSpecialHoursRevision: 1,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789',
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02']
      })
    }
  });
  const calls = [];
  let currentRemotePeriods = remotePeriods;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: currentRemotePeriods }
      });
    }
    if (!new URL(String(url)).searchParams.has('validateOnly')) {
      currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env,
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    code: 'GBP_REMOTE_SPECIAL_HOURS_CONFLICT'
  });
  expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(0);

  const reviewDetails = await sync.getReviewDetails();
  expect(reviewDetails).toMatchObject({
    status: 'review_required',
    reason: 'remote_special_hours_changed',
    remoteSpecialHours: remotePeriods
  });
  await sync.approveReview(approvedMetadata({
    operationId: 'approved-operation-review2',
    reviewedRemoteSpecialHoursHash: reviewDetails.reviewHash
  }));
  expect(await sync.flush()).toMatchObject({ status: 'synced', pending: false, updated: true });
  sync.stop();

  expect(calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(2);
  expect(store.getDocument('integration_states', stateId)).toMatchObject({
    status: 'synced',
    lastAppliedManagedSpecialHoursRevision: 2,
    lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
  });
});

test('calendar sync persists an outbox revision, preserves manual dates, and clears pending after PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const manualPeriods = [{
    startDate: { year: 2030, month: 12, day: 24 },
    closed: true
  }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      }, productionEnv())
    }
  });
  const calls = [];
  let currentRemotePeriods = manualPeriods;
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
          specialHourPeriods: currentRemotePeriods
        }
      });
    }
    if (!new URL(String(url)).searchParams.has('validateOnly')) {
      currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore,
    admin: fakeAdmin(),
    env: productionEnv(),
    fetchImpl,
    now: () => nowMs,
    logger: { info() {}, warn() {} },
    random: () => 0.5
  });

  const queued = await sync.markPending('test_save', approvedMetadata());
  expect(queued.status).toBe('queued');
  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review',
    pending: false,
    code: 'GBP_INITIAL_SYNC_REQUIRES_REVIEW'
  });
  const reviewDetails = await sync.getReviewDetails();
  expect(await sync.approveReview(approvedMetadata({
    operationId: 'approved-operation-review3',
    reviewedRemoteSpecialHoursHash: reviewDetails.reviewHash
  }))).toMatchObject({ status: 'queued', queued: true });
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
    revision: 2,
    managedDates: ['2030-08-02'],
    locationName: 'locations/123456789'
  });

  const patches = calls.filter((call) => call.init.method === 'PATCH');
  expect(patches).toHaveLength(2);
  expect(new URL(patches[0].url).searchParams.get('validateOnly')).toBe('true');
  const productionPatch = patches[1];
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
      calendar1: approvedCalendarEntry({
        date: '2030-08-02',
        openTime: '21:00',
        closeTime: '23:59',
        status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'),
        updatedAtMs: nowMs
      })
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

  await sync.markPending('test_save', approvedMetadata());
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

test('review snapshots expire within 24 hours, refresh explicitly, and clear remote-derived hashes after success', async () => {
  let nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: { [stateId]: approvedPendingState(env) }
  });
  let currentRemotePeriods = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789',
        regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: currentRemotePeriods }
      });
    }
    if (!new URL(String(url)).searchParams.has('validateOnly')) {
      currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env, fetchImpl,
    now: () => nowMs, logger: { info() {}, warn() {} }
  });

  expect(await sync.flush()).toMatchObject({ status: 'conflict_requires_review' });
  const firstDetails = await sync.getReviewDetails();
  expect(firstDetails.reviewExpiresAtMs).toBe(nowMs + (24 * 60 * 60 * 1000));
  nowMs = firstDetails.reviewExpiresAtMs + 1;
  expect(await sync.approveReview(approvedMetadata({
    operationId: 'expired-review-operation', reviewHash: firstDetails.reviewHash
  }))).toMatchObject({ code: 'GBP_REVIEW_SNAPSHOT_EXPIRED', queued: false });

  const refreshedDetails = await sync.getReviewDetails();
  expect(refreshedDetails.reviewExpiresAtMs).toBe(nowMs + (24 * 60 * 60 * 1000));
  expect(refreshedDetails.reviewHash).not.toBe(firstDetails.reviewHash);
  expect(await sync.approveReview(approvedMetadata({
    operationId: 'refreshed-review-operation', reviewHash: refreshedDetails.reviewHash
  }))).toMatchObject({ status: 'queued', queued: true });
  expect(await sync.flush()).toMatchObject({ status: 'synced', pending: false });
  sync.stop();

  const state = store.getDocument('integration_states', stateId);
  for (const field of [
    'reviewedRemoteSpecialHoursHash',
    'reviewRequiredRemoteSpecialHoursHash',
    'lastObservedRemoteSpecialHoursHash',
    'lastValidatedRemoteSpecialHoursHash'
  ]) expect(state).not.toHaveProperty(field);
  expect(state.lastAppliedManagedSpecialHoursHash).toMatch(/^[a-f0-9]{64}$/);
});

test('a composite review hash rejects a stale proposal after a local-only calendar change', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: { [stateId]: approvedPendingState(env) }
  });
  let patchCount = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: [] }
      });
    }
    patchCount += 1;
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env, fetchImpl,
    now: () => nowMs, logger: { info() {}, warn() {} }
  });
  await sync.flush();
  const details = await sync.getReviewDetails();
  await store.firestore.collection('troy_business_calendar').doc('calendar1').set({
    googleBusinessProfileConsent: false,
    googleBusinessProfileAuthorization: 'local_calendar_only'
  }, { merge: true });
  expect(await sync.approveReview(approvedMetadata({
    operationId: 'stale-proposal-operation', reviewHash: details.reviewHash
  }))).toMatchObject({ code: 'GBP_REVIEW_SNAPSHOT_CHANGED', queued: false });
  sync.stop();
  expect(patchCount).toBe(0);
});

test('managed-date drift ignores unrelated manual Google dates', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const managedPeriod = {
    startDate: { year: 2030, month: 8, day: 2 },
    openTime: { hours: 21, minutes: 0 },
    endDate: { year: 2030, month: 8, day: 2 },
    closeTime: { hours: 23, minutes: 59 }
  };
  const manualPeriod = { startDate: { year: 2030, month: 12, day: 24 }, closed: true };
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: {
      [stateId]: approvedPendingState(env, {
        locationName: 'locations/123456789', managedDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods([managedPeriod]),
        lastAppliedManagedSpecialHoursRevision: 1,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      })
    }
  });
  let patchCount = 0;
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: [managedPeriod, manualPeriod] }
        });
      }
      patchCount += 1;
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });
  expect(await sync.flush()).toMatchObject({ status: 'up_to_date', pending: false });
  sync.stop();
  expect(patchCount).toBe(0);
});

test('coalesced approved removals survive retry failure and clear only after production success', async () => {
  let nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const managedPeriods = [
    { startDate: { year: 2030, month: 8, day: 2 }, closed: true },
    { startDate: { year: 2030, month: 8, day: 3 }, closed: true }
  ];
  const manualPeriod = { startDate: { year: 2030, month: 12, day: 24 }, closed: true };
  const config = readGoogleBusinessProfileConfig(env);
  const store = createFakeFirestore({
    integration_states: {
      [stateId]: {
        locationName: 'locations/123456789', managedDates: ['2030-08-02', '2030-08-03'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(managedPeriods),
        lastAppliedManagedSpecialHoursRevision: 1,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789',
        activeConfigGeneration: 1,
        activeConfigFingerprint: configFingerprint(config, 1)
      }
    }
  });
  let failNextPatch = true;
  let currentRemotePeriods = [...managedPeriods, manualPeriod];
  const patchBodies = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
    }
    if ((init.method || 'GET') === 'GET') {
      return jsonResponse({
        name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
        specialHours: { specialHourPeriods: currentRemotePeriods }
      });
    }
    patchBodies.push(JSON.parse(init.body));
    if (failNextPatch) {
      failNextPatch = false;
      return jsonResponse({ error: { message: 'retry' } }, 503);
    }
    if (!new URL(String(url)).searchParams.has('validateOnly')) {
      currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
    }
    return jsonResponse({ name: 'locations/123456789' });
  };
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env, fetchImpl,
    now: () => nowMs, random: () => 0.5, logger: { info() {}, warn() {} }
  });
  await sync.markPending('calendar_delete', approvedMetadata({
    operationId: 'delete-operation-date-1', action: 'delete',
    requestedDate: '2030-08-02', removalDates: ['2030-08-02']
  }));
  await sync.markPending('calendar_delete', approvedMetadata({
    operationId: 'delete-operation-date-2', action: 'delete',
    requestedDate: '2030-08-03', removalDates: ['2030-08-03']
  }));
  expect(store.getDocument('integration_states', stateId).approvedRemovalDates).toEqual([
    '2030-08-02', '2030-08-03'
  ]);
  expect(await sync.flush()).toMatchObject({ status: 'retrying', pending: true });
  let state = store.getDocument('integration_states', stateId);
  expect(state.approvedRemovalDates).toEqual(['2030-08-02', '2030-08-03']);
  nowMs = state.nextAttemptAtMs;
  expect(await sync.flush()).toMatchObject({ status: 'synced', pending: false });
  sync.stop();
  state = store.getDocument('integration_states', stateId);
  expect(state.approvedRemovalDates).toBeUndefined();
  expect(state.managedDates).toEqual([]);
  expect(patchBodies.at(-1).specialHours.specialHourPeriods).toEqual([manualPeriod]);
});

test('one composite approval covers concurrent Google updates and the initial production baseline', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const stateId = 'troy_google_business_profile_special_hours';
  const googleProposedPeriods = [{ startDate: { year: 2030, month: 8, day: 5 }, closed: true }];
  const store = createFakeFirestore({
    troy_business_calendar: {
      calendar1: approvedCalendarEntry({
        date: '2030-08-02', openTime: '21:00', closeTime: '23:59', status: 'open',
        startsAtMs: Date.parse('2030-08-02T21:00:00+09:00'), updatedAtMs: nowMs
      }, env)
    },
    integration_states: { [stateId]: approvedPendingState(env) }
  });
  let patchCount = 0;
  let currentRemotePeriods = [];
  let hasGoogleUpdated = true;
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if (String(url).includes(':getGoogleUpdated')) {
        if (!hasGoogleUpdated) return jsonResponse({ diffMask: '', pendingMask: '' });
        return jsonResponse({
          diffMask: 'specialHours',
          location: { specialHours: { specialHourPeriods: googleProposedPeriods } }
        });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: currentRemotePeriods },
          metadata: { hasGoogleUpdated }
        });
      }
      patchCount += 1;
      if (!new URL(String(url)).searchParams.has('validateOnly')) {
        currentRemotePeriods = JSON.parse(init.body).specialHours.specialHourPeriods;
        hasGoogleUpdated = false;
      }
      return jsonResponse({ name: 'locations/123456789' });
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });
  expect(await sync.flush()).toMatchObject({
    status: 'conflict_requires_review', reason: 'google_updated_special_hours'
  });
  const details = await sync.getReviewDetails();
  expect(await sync.approveReview(approvedMetadata({
    operationId: 'combined-google-baseline-review', reviewHash: details.reviewHash
  }))).toMatchObject({ status: 'queued', queued: true });
  expect(await sync.flush()).toMatchObject({ status: 'synced', pending: false });
  sync.stop();
  expect(patchCount).toBe(2);
});

test('an already-removed managed date clears its tombstone without a redundant PATCH', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = productionEnv();
  const config = readGoogleBusinessProfileConfig(env);
  const stateId = 'troy_google_business_profile_special_hours';
  const previouslyApplied = [{ startDate: { year: 2030, month: 8, day: 2 }, closed: true }];
  const store = createFakeFirestore({
    integration_states: {
      [stateId]: {
        ...approvedPendingState(env),
        activeConfigGeneration: 1,
        activeConfigFingerprint: configFingerprint(config, 1),
        locationName: 'locations/123456789',
        managedDates: ['2030-08-02'],
        approvedRemovalDates: ['2030-08-02'],
        lastAppliedManagedSpecialHoursHash: hashSpecialHourPeriods(previouslyApplied),
        lastAppliedManagedSpecialHoursRevision: 1,
        lastAppliedManagedSpecialHoursLocationName: 'locations/123456789'
      }
    }
  });
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      if ((init.method || 'GET') === 'GET') {
        return jsonResponse({
          name: 'locations/123456789', regularHours: { periods: [{ openDay: 'THURSDAY' }] },
          specialHours: { specialHourPeriods: [] }
        });
      }
      throw new Error('No PATCH is needed when Google already matches the approved removal.');
    },
    now: () => nowMs, logger: { info() {}, warn() {} }
  });
  expect(await sync.flush()).toMatchObject({ status: 'up_to_date', pending: false });
  sync.stop();
  expect(store.getDocument('integration_states', stateId).approvedRemovalDates).toBeUndefined();
});

test('configuration activation scrubs expired approval hashes and legacy remote hashes', async () => {
  const nowMs = Date.parse('2030-08-01T12:00:00+09:00');
  const env = configuredEnv();
  const config = readGoogleBusinessProfileConfig(env);
  const stateId = 'troy_google_business_profile_special_hours';
  const store = createFakeFirestore({
    integration_states: {
      [stateId]: {
        pending: false,
        status: 'idle',
        activeConfigGeneration: 1,
        activeConfigFingerprint: configFingerprint(config, 1),
        reviewedRemoteSpecialHoursHash: hashSpecialHourPeriods([]),
        reviewedRemoteSpecialHoursHashApprovedAtMs: nowMs - (26 * 60 * 60 * 1000),
        reviewedRemoteSpecialHoursHashExpiresAtMs: nowMs - (2 * 60 * 60 * 1000),
        lastObservedRemoteSpecialHoursHash: hashSpecialHourPeriods([]),
        lastValidatedRemoteSpecialHoursHash: hashSpecialHourPeriods([]),
        reviewRequiredRemoteSpecialHoursHash: hashSpecialHourPeriods([])
      }
    }
  });
  const sync = createTroyCalendarGoogleSync({
    firestore: store.firestore, admin: fakeAdmin(), env,
    now: () => nowMs, logger: { info() {}, warn() {} }
  });
  expect(await sync.activateConfiguration()).toMatchObject({ status: 'current' });
  sync.stop();
  const state = store.getDocument('integration_states', stateId);
  for (const field of [
    'reviewedRemoteSpecialHoursHash',
    'lastObservedRemoteSpecialHoursHash',
    'lastValidatedRemoteSpecialHoursHash',
    'reviewRequiredRemoteSpecialHoursHash'
  ]) expect(state).not.toHaveProperty(field);
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
