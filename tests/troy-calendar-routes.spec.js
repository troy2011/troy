const { test, expect } = require('@playwright/test');

const { initializeEventRoutes } = require('../server/events');

const CALENDAR_COLLECTION = 'troy_business_calendar';
const AUDIT_COLLECTION = 'troy_business_calendar_audit';
const DATE_INDEX_COLLECTION = 'troy_business_calendar_dates';
const INTEGRATION_COLLECTION = 'integration_states';
const INTEGRATION_DOCUMENT = 'troy_google_business_profile_special_hours';
const CONTROL_DOCUMENT = 'troy_business_calendar_write_control';
const DEFAULT_GOOGLE_APPROVAL_CONTEXT = Object.freeze({
  consentVersion: 'gbp-special-hours-v1',
  locationName: 'locations/123456789',
  configGeneration: 1,
  configFingerprint: '0123456789abcdef0123456789abcdef'
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createFakeFirestore(initialCollections = {}, options = {}) {
  const collections = new Map();
  const commits = [];
  let generatedId = 0;
  let batchId = 0;
  let remainingCommitFailures = Number(options.failCommits || 0);
  let hasCommitted = false;
  let transactionTail = Promise.resolve();

  for (const [collectionName, documents] of Object.entries(initialCollections)) {
    collections.set(
      collectionName,
      new Map(Object.entries(documents).map(([id, data]) => [id, clone(data)]))
    );
  }

  function bucketFor(collectionName) {
    if (!collections.has(collectionName)) collections.set(collectionName, new Map());
    return collections.get(collectionName);
  }

  function documentReference(collectionName, id) {
    return {
      collectionName,
      id,
      async get() {
        if (hasCommitted && options.failDocumentGetsAfterCommit === true) {
          throw new Error('Injected post-commit document read failure');
        }
        const data = collections.get(collectionName)?.get(id);
        return {
          id,
          exists: data !== undefined,
          ref: this,
          data: () => clone(data)
        };
      }
    };
  }

  function collectionReference(collectionName, query = {}) {
    return {
      doc(id) {
        const documentId = id || `generated-${++generatedId}`;
        return documentReference(collectionName, documentId);
      },
      where(field, operator, value) {
        return collectionReference(collectionName, {
          ...query,
          where: { field, operator, value }
        });
      },
      orderBy(field, direction) {
        return collectionReference(collectionName, {
          ...query,
          orderBy: { field, direction }
        });
      },
      limit(value) {
        return collectionReference(collectionName, { ...query, limit: Number(value) });
      },
      async get() {
        let rows = [...(collections.get(collectionName) || new Map()).entries()];
        if (query.where) {
          const { field, operator, value } = query.where;
          rows = rows.filter(([, data]) => {
            if (operator === '==') return data?.[field] === value;
            if (operator === '>=') return Number(data?.[field] || 0) >= Number(value);
            if (operator === '<') return Number(data?.[field] || 0) < Number(value);
            throw new Error(`Unsupported fake Firestore operator: ${operator}`);
          });
        }
        if (query.orderBy) {
          const { field, direction } = query.orderBy;
          const multiplier = direction === 'desc' ? -1 : 1;
          rows.sort((left, right) => (
            Number(left[1]?.[field] || 0) - Number(right[1]?.[field] || 0)
          ) * multiplier);
        }
        if (Number.isFinite(query.limit)) rows = rows.slice(0, query.limit);
        const docs = rows.map(([id, data]) => ({
          id,
          ref: documentReference(collectionName, id),
          data: () => clone(data)
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
  }

  function applyWrites(writes) {
    for (const write of writes) {
      if (!write.ref?.collectionName || !write.ref?.id) {
        throw new Error('Invalid fake Firestore document reference.');
      }
    }
    for (const write of writes) {
      const bucket = bucketFor(write.ref.collectionName);
      if (write.type === 'delete') {
        bucket.delete(write.ref.id);
        continue;
      }
      const current = write.options?.merge === true ? bucket.get(write.ref.id) || {} : {};
      bucket.set(write.ref.id, { ...clone(current), ...clone(write.data) });
    }
  }

  async function commitWrites(id, kind, writes) {
    if (writes.length === 0) return;
    const record = {
      batchId: id,
      kind,
      applied: false,
      writes: writes.map((write) => ({
        type: write.type,
        collectionName: write.ref.collectionName,
        documentId: write.ref.id,
        data: clone(write.data)
      }))
    };
    commits.push(record);
    if (remainingCommitFailures > 0) {
      remainingCommitFailures -= 1;
      throw new Error('Injected Firestore commit failure');
    }
    applyWrites(writes);
    hasCommitted = true;
    record.applied = true;
  }

  const firestore = {
    collection(collectionName) {
      return collectionReference(collectionName);
    },
    batch() {
      const id = ++batchId;
      const writes = [];
      const batch = {
        __batchId: id,
        set(ref, data, writeOptions = {}) {
          writes.push({ type: 'set', ref, data: clone(data), options: clone(writeOptions) });
          return batch;
        },
        delete(ref) {
          writes.push({ type: 'delete', ref });
          return batch;
        },
        async commit() {
          await commitWrites(id, 'batch', writes);
        }
      };
      return batch;
    },
    runTransaction(callback) {
      const run = transactionTail.then(async () => {
        const id = ++batchId;
        const writes = [];
        const transaction = {
          __batchId: id,
          async get(target) {
            if (!target || typeof target.get !== 'function') {
              throw new Error('Invalid fake Firestore transaction read target.');
            }
            return target.get();
          },
          set(ref, data, writeOptions = {}) {
            writes.push({ type: 'set', ref, data: clone(data), options: clone(writeOptions) });
            return transaction;
          },
          delete(ref) {
            writes.push({ type: 'delete', ref });
            return transaction;
          }
        };
        const result = await callback(transaction);
        await commitWrites(id, 'transaction', writes);
        return result;
      });
      transactionTail = run.catch(() => {});
      return run;
    }
  };

  return {
    firestore,
    commits,
    getDocument(collectionName, id) {
      return clone(collections.get(collectionName)?.get(id));
    },
    listDocuments(collectionName) {
      return [...(collections.get(collectionName) || new Map()).entries()]
        .map(([id, data]) => ({ id, data: clone(data) }));
    }
  };
}

function createFakeApp() {
  const routes = new Map();
  return {
    post(path, handler) {
      routes.set(path, handler);
    },
    async invoke(path, body) {
      const handler = routes.get(path);
      if (!handler) throw new Error(`Route not registered: ${path}`);
      const response = {
        statusCode: 200,
        body: undefined,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        }
      };
      await handler({ body }, response);
      return { status: response.statusCode, body: response.body };
    }
  };
}

function createGoogleSyncStub(
  firestore,
  statusResult = {},
  approvalContext = DEFAULT_GOOGLE_APPROVAL_CONTEXT
) {
  const calls = {
    start: 0,
    scheduleFlush: 0,
    markPendingInBatch: [],
    getStatus: 0,
    getReviewDetails: 0,
    approveReview: []
  };
  return {
    calls,
    getApprovalContext() {
      return clone(approvalContext);
    },
    start() {
      calls.start += 1;
    },
    scheduleFlush() {
      calls.scheduleFlush += 1;
    },
    async getStatus() {
      calls.getStatus += 1;
      return clone(statusResult);
    },
    async getReviewDetails() {
      calls.getReviewDetails += 1;
      return {
        status: 'review_required',
        configured: true,
        enabled: true,
        reviewRequired: true,
        reviewHash: 'a'.repeat(64),
        reason: 'remote_conflict',
        remoteSpecialHours: [{
          startDate: { year: 2026, month: 12, day: 14 },
          closed: true
        }],
        proposedSpecialHours: [{
          startDate: { year: 2026, month: 12, day: 14 },
          openTime: { hours: 18, minutes: 0 },
          endDate: { year: 2026, month: 12, day: 14 },
          closeTime: { hours: 23, minutes: 0 }
        }]
      };
    },
    async approveReview(metadata) {
      calls.approveReview.push(clone(metadata));
      return {
        status: 'queued',
        configured: true,
        enabled: true,
        queued: true,
        dryRun: true
      };
    },
    markPendingInBatch(batch, reason, metadata) {
      calls.markPendingInBatch.push({
        batchId: batch.__batchId,
        reason,
        metadata: clone(metadata)
      });
      const ref = firestore.collection(INTEGRATION_COLLECTION).doc(INTEGRATION_DOCUMENT);
      batch.set(ref, {
        pending: true,
        reason,
        requestedBy: metadata.requestedBy,
        calendarId: metadata.calendarId,
        action: metadata.action
      }, { merge: true });
      return { status: 'pending', reason, queued: true };
    }
  };
}

function createHarness({
  initialCollections = {},
  failCommits = 0,
  failDocumentGetsAfterCommit = false,
  authenticated = true,
  isKing = true,
  nation = 'fire',
  staffPlayFabIds = [
    'KING-001',
    'KING-CONFLICT',
    'KING-INVALID-DATE',
    'KING-PARALLEL-CAPACITY',
    'KING-PARALLEL-CONFLICT',
    'KING-PARALLEL-DATE',
    'KING-PARALLEL-DUPLICATE',
    'KING-PARALLEL-UPDATE-DELETE',
    'KING-REQUEST-ID',
    'KING-STRICT'
  ].join(','),
  allowedLocationName = 'locations/123456789',
  syncLocationName = 'locations/123456789',
  googleApprovalContext,
  googleStatus = {
    status: 'up_to_date',
    configured: true,
    enabled: true,
    queued: false
  }
} = {}) {
  const resolvedGoogleApprovalContext = googleApprovalContext === undefined
    ? DEFAULT_GOOGLE_APPROVAL_CONTEXT
    : googleApprovalContext;
  const seededInitialCollections = clone(initialCollections) || {};
  if (resolvedGoogleApprovalContext) {
    const integrationDocuments = seededInitialCollections[INTEGRATION_COLLECTION] || {};
    seededInitialCollections[INTEGRATION_COLLECTION] = {
      ...integrationDocuments,
      [INTEGRATION_DOCUMENT]: {
        activeConfigGeneration: Number(resolvedGoogleApprovalContext.configGeneration),
        activeConfigFingerprint: resolvedGoogleApprovalContext.configFingerprint,
        activeLocationName: resolvedGoogleApprovalContext.locationName,
        ...(integrationDocuments[INTEGRATION_DOCUMENT] || {})
      }
    };
  }
  const store = createFakeFirestore(seededInitialCollections, {
    failCommits,
    failDocumentGetsAfterCommit
  });
  const app = createFakeApp();
  const googleSync = createGoogleSyncStub(
    store.firestore,
    googleStatus,
    resolvedGoogleApprovalContext
  );
  const getUserReadOnlyData = () => {};
  initializeEventRoutes(app, {
    firestore: store.firestore,
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => ({ __fieldValue: 'serverTimestamp' })
        }
      }
    },
    troyCalendarGoogleSync: googleSync,
    env: {
      GOOGLE_BUSINESS_PROFILE_STAFF_PLAYFAB_IDS: staffPlayFabIds,
      GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME: allowedLocationName,
      GOOGLE_BUSINESS_PROFILE_LOCATION_NAME: syncLocationName
    },
    requireAuthenticatedPlayFabId: async (_req, res, playFabId) => {
      if (authenticated) return playFabId;
      res.status(401).json({ error: 'Unauthorized' });
      return '';
    },
    PlayFabServer: { GetUserReadOnlyData: getUserReadOnlyData },
    promisifyPlayFab: async (_method, request) => {
      if (request.Keys?.includes('IsKing')) {
        return { Data: { IsKing: { Value: isKing ? 'true' : 'false' } } };
      }
      if (request.Keys?.includes('Nation')) return { Data: { Nation: { Value: nation } } };
      throw new Error(`Unexpected PlayFab request: ${JSON.stringify(request)}`);
    }
  });
  return { app, store, googleSync };
}

function saveBody(overrides = {}) {
  return {
    playFabId: 'KING-001',
    requestId: 'route-request-0001',
    date: '2026-12-14',
    openTime: '18:00',
    closeTime: '23:00',
    status: 'open',
    title: '通常営業',
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'gbp-operation-0001',
    ...overrides
  };
}

async function invokeWithExpectedServerError(app, path, body) {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await app.invoke(path, body);
  } finally {
    console.error = originalConsoleError;
  }
}

test('calendar save commits calendar, audit, GBP outbox, date index, and control atomically', async () => {
  const { app, store, googleSync } = createHarness();

  const response = await app.invoke('/api/troy-calendar/save', saveBody());

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    entry: { id: 'request-route-request-0001', date: '2026-12-14' },
    googleBusinessProfileSync: { status: 'pending', reason: 'calendar_save' }
  });
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({
    kind: 'transaction',
    applied: true,
    writes: [
      { type: 'set', collectionName: CALENDAR_COLLECTION, documentId: 'request-route-request-0001' },
      { type: 'set', collectionName: AUDIT_COLLECTION },
      { type: 'set', collectionName: INTEGRATION_COLLECTION, documentId: INTEGRATION_DOCUMENT },
      { type: 'set', collectionName: DATE_INDEX_COLLECTION, documentId: '2026-12-14' },
      { type: 'set', collectionName: INTEGRATION_COLLECTION, documentId: CONTROL_DOCUMENT }
    ]
  });
  expect(store.commits[0].writes).toHaveLength(5);
  expect(store.commits[0].writes[0].data).toMatchObject({
    googleBusinessProfileConsent: true,
    googleBusinessProfileOperationId: 'gbp-operation-0001',
    googleBusinessProfileConsentVersion: 'gbp-special-hours-v1',
    googleBusinessProfileLocationName: 'locations/123456789',
    googleBusinessProfileAuthorization: 'staff_playfab_allowlist_and_king',
    googleBusinessProfileConfigGeneration: 1,
    googleBusinessProfileConfigFingerprint: '0123456789abcdef0123456789abcdef'
  });
  expect(store.commits[0].writes[1].data).toMatchObject({
    action: 'create',
    calendarId: 'request-route-request-0001',
    actorPlayFabId: 'KING-001',
    actorNation: 'fire',
    googleBusinessProfileConsent: true,
    googleBusinessProfileConsentVersion: 'gbp-special-hours-v1',
    googleBusinessProfileOperationId: 'gbp-operation-0001',
    googleBusinessProfileLocationName: 'locations/123456789',
    googleBusinessProfileAuthorization: 'staff_playfab_allowlist_and_king',
    googleBusinessProfileConfigGeneration: 1,
    googleBusinessProfileConfigFingerprint: '0123456789abcdef0123456789abcdef',
    before: { date: '', status: '' },
    after: { date: '2026-12-14', status: 'open' }
  });
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2026-12-14')).toEqual({
    calendarId: 'request-route-request-0001',
    date: '2026-12-14'
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 1
  });
  expect(googleSync.calls.markPendingInBatch).toEqual([{
    batchId: store.commits[0].batchId,
    reason: 'calendar_save',
    metadata: {
      requestedBy: 'KING-001',
      calendarId: 'request-route-request-0001',
      action: 'save',
      operationId: 'gbp-operation-0001',
      consentVersion: 'gbp-special-hours-v1',
      locationName: 'locations/123456789',
      requestedDate: '2026-12-14',
      removalDates: []
    }
  }]);
  expect(googleSync.calls.start).toBe(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

test('calendar mutation requires the authenticated King to be in the fixed GBP staff allowlist', async () => {
  const { app, store, googleSync } = createHarness({ staffPlayFabIds: '' });

  const response = await app.invoke('/api/troy-calendar/save', saveBody());

  expect(response).toEqual({
    status: 403,
    body: { error: 'Google営業時間は許可された店舗スタッフのみ操作できます。' }
  });
  expect(store.commits).toHaveLength(0);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('calendar mutation fails closed when the fixed allowed location differs from the sync target', async () => {
  const { app, store, googleSync } = createHarness({
    allowedLocationName: 'locations/other'
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody());

  expect(response).toEqual({
    status: 503,
    body: { error: 'Google営業時間の同期先店舗が固定許可設定と一致していません。' }
  });
  expect(store.commits).toHaveLength(0);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
});

test('calendar mutation fails closed when the worker cannot bind consent to its configuration', async () => {
  const { app, store, googleSync } = createHarness({ googleApprovalContext: null });

  const response = await app.invoke('/api/troy-calendar/save', saveBody());

  expect(response).toEqual({
    status: 503,
    body: { error: 'Google営業時間の同意対象設定を確認できません。' }
  });
  expect(store.commits).toHaveLength(0);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
});

test('Google-consented save rejects an inactive config generation without staging writes', async () => {
  const staleActiveState = {
    activeConfigGeneration: 2,
    activeConfigFingerprint: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configFingerprint,
    activeLocationName: DEFAULT_GOOGLE_APPROVAL_CONTEXT.locationName
  };
  const { app, store, googleSync } = createHarness({
    initialCollections: {
      [INTEGRATION_COLLECTION]: {
        [INTEGRATION_DOCUMENT]: staleActiveState
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody({
    requestId: 'inactive-generation-save-01'
  }));

  expect(response).toEqual({
    status: 503,
    body: { error: 'Google連携の設定反映中です。少し待ってから再度確認・同意してください。' }
  });
  expect(store.commits).toHaveLength(0);
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(0);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
  expect(store.listDocuments(DATE_INDEX_COLLECTION)).toHaveLength(0);
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toBeUndefined();
  expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toEqual(staleActiveState);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('Google-consented delete rejects an inactive config generation without deleting or queuing', async () => {
  const calendarId = 'inactive-generation-delete';
  const existingEntry = {
    nation: 'global',
    date: '2026-12-15',
    openTime: '18:00',
    closeTime: '23:00',
    status: 'open',
    startsAtMs: Date.parse('2026-12-15T18:00:00+09:00')
  };
  const staleActiveState = {
    activeConfigGeneration: 2,
    activeConfigFingerprint: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configFingerprint,
    activeLocationName: DEFAULT_GOOGLE_APPROVAL_CONTEXT.locationName
  };
  const { app, store, googleSync } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: { [calendarId]: existingEntry },
      [DATE_INDEX_COLLECTION]: {
        '2026-12-15': { calendarId, date: '2026-12-15' }
      },
      [INTEGRATION_COLLECTION]: {
        [INTEGRATION_DOCUMENT]: staleActiveState,
        [CONTROL_DOCUMENT]: { schemaVersion: 1, entryCount: 1, mutationWindows: {} }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/delete', {
    playFabId: 'KING-001',
    calendarId,
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'inactive-generation-delete-01'
  });

  expect(response).toEqual({
    status: 503,
    body: { error: 'Google連携の設定反映中です。少し待ってから再度確認・同意してください。' }
  });
  expect(store.commits).toHaveLength(0);
  expect(store.getDocument(CALENDAR_COLLECTION, calendarId)).toEqual(existingEntry);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2026-12-15')).toEqual({
    calendarId,
    date: '2026-12-15'
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 1
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toEqual(staleActiveState);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('calendar mutation fails closed without specific GBP consent, version, and operation id', async () => {
  const invalidBodies = [
    saveBody({ googleBusinessProfileConsent: false }),
    saveBody({ googleBusinessProfileConsent: undefined }),
    saveBody({ consentVersion: 'old-version' }),
    saveBody({ operationId: 'short' })
  ];

  for (const body of invalidBodies) {
    const { app, store, googleSync } = createHarness();
    const response = await app.invoke('/api/troy-calendar/save', body);
    expect(response).toEqual({
      status: 400,
      body: { error: 'Googleビジネスプロフィールへ反映する内容への明示同意が必要です。' }
    });
    expect(store.commits).toHaveLength(0);
    expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
    expect(googleSync.calls.scheduleFlush).toBe(0);
  }
});

test('local-only calendar save remains available without GBP staff or configuration', async () => {
  const { app, store, googleSync } = createHarness({
    staffPlayFabIds: '',
    allowedLocationName: '',
    syncLocationName: '',
    googleApprovalContext: null
  });
  const body = saveBody();
  delete body.googleBusinessProfileConsent;
  delete body.consentVersion;
  delete body.operationId;

  const response = await app.invoke('/api/troy-calendar/save', body);

  expect(response).toMatchObject({
    status: 200,
    body: {
      success: true,
      googleBusinessProfileSync: { status: 'not_requested', queued: false }
    }
  });
  expect(store.getDocument(CALENDAR_COLLECTION, 'request-route-request-0001')).toMatchObject({
    googleBusinessProfileConsent: false,
    googleBusinessProfileAuthorization: 'local_calendar_only',
    googleBusinessProfileOperationId: null,
    googleBusinessProfileConfigFingerprint: null
  });
  expect(store.commits[0].writes).toHaveLength(4);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('moving a currently approved calendar row records its old date for scoped Google removal', async () => {
  const calendarId = 'approved-date-move';
  const { app, googleSync } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        [calendarId]: {
          nation: 'global',
          date: '2026-12-13',
          openTime: '18:00',
          closeTime: '23:00',
          status: 'open',
          startsAtMs: 1,
          googleBusinessProfileConsent: true,
          googleBusinessProfileConsentVersion: 'gbp-special-hours-v1',
          googleBusinessProfileOperationId: 'previous-operation-0001',
          googleBusinessProfileLocationName: 'locations/123456789',
          googleBusinessProfileAuthorization: 'staff_playfab_allowlist_and_king',
          googleBusinessProfileConfigGeneration: 1,
          googleBusinessProfileConfigFingerprint: '0123456789abcdef0123456789abcdef'
        }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody({
    calendarId,
    date: '2026-12-14'
  }));

  expect(response.status).toBe(200);
  expect(googleSync.calls.markPendingInBatch[0].metadata).toMatchObject({
    requestedDate: '2026-12-14',
    removalDates: ['2026-12-13']
  });
});

test('deleting a local-only row preserves unmanaged Google hours for that date', async () => {
  const calendarId = 'local-only-delete';
  const { app, googleSync } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        [calendarId]: {
          nation: 'global',
          date: '2026-12-13',
          startsAtMs: 1,
          googleBusinessProfileConsent: false,
          googleBusinessProfileAuthorization: 'local_calendar_only'
        }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/delete', {
    playFabId: 'KING-001',
    calendarId,
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'gbp-local-delete-0001'
  });

  expect(response.status).toBe(200);
  expect(googleSync.calls.markPendingInBatch[0].metadata).toMatchObject({
    requestedDate: '2026-12-13',
    removalDates: []
  });
});

test('Google sync conflict review approval is staff-only, explicit, and bound to the reviewed hash', async () => {
  const { app, googleSync } = createHarness();
  const reviewedHash = 'b'.repeat(64);

  const response = await app.invoke('/api/troy-calendar/google-sync-review-approve', {
    playFabId: 'KING-001',
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'gbp-review-operation-0001',
    reviewHash: reviewedHash
  });

  expect(response).toMatchObject({
    status: 200,
    body: {
      success: true,
      googleBusinessProfileSync: { status: 'queued', queued: true }
    }
  });
  expect(googleSync.calls.approveReview).toEqual([{
    requestedBy: 'KING-001',
    action: 'remote_special_hours_review_approve',
    operationId: 'gbp-review-operation-0001',
    consentVersion: 'gbp-special-hours-v1',
    locationName: 'locations/123456789',
    reviewHash: reviewedHash
  }]);

  const invalid = await app.invoke('/api/troy-calendar/google-sync-review-approve', {
    playFabId: 'KING-001',
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'gbp-review-operation-0002',
    reviewHash: 'not-a-hash'
  });
  expect(invalid.status).toBe(400);
  expect(googleSync.calls.approveReview).toHaveLength(1);
});

test('Google sync review details are staff-only and return concrete remote and proposed periods', async () => {
  const { app, googleSync } = createHarness();

  const response = await app.invoke('/api/troy-calendar/google-sync-review-details', {
    playFabId: 'KING-001'
  });

  expect(response).toMatchObject({
    status: 200,
    body: {
      success: true,
      googleBusinessProfileReview: {
        status: 'review_required',
        reviewHash: 'a'.repeat(64),
        remoteSpecialHours: [{
          startDate: { year: 2026, month: 12, day: 14 },
          closed: true
        }],
        proposedSpecialHours: [{
          startDate: { year: 2026, month: 12, day: 14 },
          openTime: { hours: 18, minutes: 0 },
          endDate: { year: 2026, month: 12, day: 14 },
          closeTime: { hours: 23, minutes: 0 }
        }]
      }
    }
  });
  expect(googleSync.calls.getReviewDetails).toBe(1);

  const nonStaff = createHarness({ staffPlayFabIds: 'SOMEONE-ELSE' });
  const forbidden = await nonStaff.app.invoke('/api/troy-calendar/google-sync-review-details', {
    playFabId: 'KING-001'
  });
  expect(forbidden.status).toBe(403);
  expect(nonStaff.googleSync.calls.getReviewDetails).toBe(0);
});

test('calendar delete commits its mutation, audit, GBP outbox, and control atomically', async () => {
  const calendarId = 'calendar-to-delete';
  const { app, store, googleSync } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        [calendarId]: { nation: 'global', date: '2026-12-15', startsAtMs: 1 }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/delete', {
    playFabId: 'KING-001',
    calendarId,
    googleBusinessProfileConsent: true,
    consentVersion: 'gbp-special-hours-v1',
    operationId: 'gbp-delete-operation-0001'
  });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    deleted: true,
    calendarId,
    googleBusinessProfileSync: { status: 'pending', reason: 'calendar_delete' }
  });
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({
    kind: 'transaction',
    applied: true,
    writes: [
      { type: 'delete', collectionName: CALENDAR_COLLECTION, documentId: calendarId },
      { type: 'set', collectionName: AUDIT_COLLECTION },
      { type: 'set', collectionName: INTEGRATION_COLLECTION, documentId: INTEGRATION_DOCUMENT },
      { type: 'set', collectionName: INTEGRATION_COLLECTION, documentId: CONTROL_DOCUMENT }
    ]
  });
  expect(store.commits[0].writes).toHaveLength(4);
  expect(store.commits[0].writes[1].data).toMatchObject({
    action: 'delete',
    calendarId,
    actorPlayFabId: 'KING-001',
    googleBusinessProfileConfigGeneration: 1,
    googleBusinessProfileConfigFingerprint: '0123456789abcdef0123456789abcdef',
    before: { date: '2026-12-15' },
    after: null
  });
  expect(store.getDocument(CALENDAR_COLLECTION, calendarId)).toBeUndefined();
  expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toMatchObject({
    pending: true,
    action: 'delete'
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 0
  });
  expect(googleSync.calls.markPendingInBatch[0].batchId).toBe(store.commits[0].batchId);
  expect(googleSync.calls.start).toBe(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

for (const scenario of [
  {
    name: 'save',
    path: '/api/troy-calendar/save',
    body: saveBody(),
    expectedError: 'FailedToSaveTroyCalendar',
    expectedCollections: [
      CALENDAR_COLLECTION,
      AUDIT_COLLECTION,
      INTEGRATION_COLLECTION,
      DATE_INDEX_COLLECTION,
      INTEGRATION_COLLECTION
    ],
    initialCollections: {},
    assertCalendarState: (store) => {
      expect(store.getDocument(CALENDAR_COLLECTION, 'request-route-request-0001')).toBeUndefined();
    }
  },
  {
    name: 'delete',
    path: '/api/troy-calendar/delete',
    body: {
      playFabId: 'KING-001',
      calendarId: 'calendar-to-delete',
      googleBusinessProfileConsent: true,
      consentVersion: 'gbp-special-hours-v1',
      operationId: 'gbp-delete-operation-0002'
    },
    expectedError: 'FailedToDeleteTroyCalendar',
    expectedCollections: [
      CALENDAR_COLLECTION,
      AUDIT_COLLECTION,
      INTEGRATION_COLLECTION,
      INTEGRATION_COLLECTION
    ],
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        'calendar-to-delete': { nation: 'global', date: '2026-12-15', startsAtMs: 1 }
      }
    },
    assertCalendarState: (store) => {
      expect(store.getDocument(CALENDAR_COLLECTION, 'calendar-to-delete')).toBeDefined();
    }
  }
]) {
  test(`calendar ${scenario.name} applies no staged transaction writes when commit fails`, async () => {
    const { app, store, googleSync } = createHarness({
      initialCollections: scenario.initialCollections,
      failCommits: 1
    });

    const response = await invokeWithExpectedServerError(app, scenario.path, scenario.body);

    expect(response).toEqual({ status: 500, body: { error: scenario.expectedError } });
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].applied).toBe(false);
    expect(store.commits[0]).toMatchObject({ kind: 'transaction', applied: false });
    expect(store.commits[0].writes.map((write) => write.collectionName))
      .toEqual(scenario.expectedCollections);
    scenario.assertCalendarState(store);
    expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
    expect(store.listDocuments(DATE_INDEX_COLLECTION)).toHaveLength(0);
    expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toMatchObject({
      activeConfigGeneration: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configGeneration,
      activeConfigFingerprint: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configFingerprint,
      activeLocationName: DEFAULT_GOOGLE_APPROVAL_CONTEXT.locationName
    });
    expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toBeUndefined();
    expect(googleSync.calls.start).toBe(1);
    expect(googleSync.calls.scheduleFlush).toBe(0);
  });
}

test('retrying an identical new save is duplicate-safe without another transaction commit', async () => {
  const { app, store, googleSync } = createHarness();
  const request = saveBody({ requestId: 'idempotent-request-01' });

  const first = await app.invoke('/api/troy-calendar/save', request);
  const createdAtMs = store.getDocument(
    CALENDAR_COLLECTION,
    'request-idempotent-request-01'
  ).createdAtMs;
  const second = await app.invoke('/api/troy-calendar/save', request);

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body.duplicate).toBeUndefined();
  expect(second.body.duplicate).toBe(true);
  expect(first.body.entry.id).toBe('request-idempotent-request-01');
  expect(second.body.entry.id).toBe(first.body.entry.id);
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.getDocument(CALENDAR_COLLECTION, first.body.entry.id).createdAtMs).toBe(createdAtMs);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({ kind: 'transaction', applied: true });
  expect(store.commits[0].writes).toHaveLength(5);
  expect(googleSync.calls.scheduleFlush).toBe(1);
  expect(googleSync.calls.getStatus).toBe(1);
});

test('parallel identical requestId saves produce one save and one duplicate', async () => {
  const { app, store, googleSync } = createHarness();
  const request = saveBody({
    playFabId: 'KING-PARALLEL-DUPLICATE',
    requestId: 'parallel-duplicate-01',
    date: '2027-01-10'
  });

  const responses = await Promise.all([
    app.invoke('/api/troy-calendar/save', { ...request }),
    app.invoke('/api/troy-calendar/save', { ...request })
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(responses.filter((response) => response.body.duplicate === true)).toHaveLength(1);
  expect(responses.filter((response) => response.body.duplicate !== true)).toHaveLength(1);
  expect(new Set(responses.map((response) => response.body.entry.id))).toEqual(
    new Set(['request-parallel-duplicate-01'])
  );
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({ kind: 'transaction', applied: true });
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2027-01-10')).toEqual({
    calendarId: 'request-parallel-duplicate-01',
    date: '2027-01-10'
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 1
  });
  expect(googleSync.calls.markPendingInBatch).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
  expect(googleSync.calls.getStatus).toBe(1);
});

test('parallel different payloads sharing a requestId produce one save and one 409', async () => {
  const { app, store, googleSync } = createHarness();
  const baseRequest = saveBody({
    playFabId: 'KING-PARALLEL-CONFLICT',
    requestId: 'parallel-conflict-01',
    date: '2027-01-11'
  });

  const responses = await Promise.all([
    app.invoke('/api/troy-calendar/save', { ...baseRequest, title: '並行保存A' }),
    app.invoke('/api/troy-calendar/save', { ...baseRequest, title: '並行保存B' })
  ]);

  expect(responses.map((response) => response.status).sort((left, right) => left - right))
    .toEqual([200, 409]);
  const saved = responses.find((response) => response.status === 200);
  const conflict = responses.find((response) => response.status === 409);
  expect(conflict.body).toEqual({ error: 'CalendarRequestConflict' });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.getDocument(CALENDAR_COLLECTION, 'request-parallel-conflict-01').title)
    .toBe(saved.body.entry.title);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
  expect(googleSync.calls.getStatus).toBe(0);
});

test('parallel requestIds for the same date produce one save and one date conflict', async () => {
  const { app, store, googleSync } = createHarness();
  const shared = {
    playFabId: 'KING-PARALLEL-DATE',
    date: '2027-01-12'
  };

  const responses = await Promise.all([
    app.invoke('/api/troy-calendar/save', saveBody({
      ...shared,
      requestId: 'same-date-request-01',
      title: '同日予定A'
    })),
    app.invoke('/api/troy-calendar/save', saveBody({
      ...shared,
      requestId: 'same-date-request-02',
      title: '同日予定B'
    }))
  ]);

  expect(responses.map((response) => response.status).sort((left, right) => left - right))
    .toEqual([200, 409]);
  const saved = responses.find((response) => response.status === 200);
  const conflict = responses.find((response) => response.status === 409);
  expect(conflict.body).toEqual({
    error: 'この日付には既に営業予定があります。既存予定を編集してください。'
  });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2027-01-12')).toEqual({
    calendarId: saved.body.entry.id,
    date: '2027-01-12'
  });
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

test('parallel update and delete serialize without resurrecting a deleted entry', async () => {
  const calendarId = 'parallel-update-delete';
  const date = '2027-01-13';
  const initialEntry = {
    nation: 'global',
    date,
    openTime: '18:00',
    closeTime: '23:00',
    status: 'open',
    title: '更新前',
    note: '',
    startsAtMs: Date.parse(`${date}T18:00:00+09:00`),
    updatedAtMs: 1,
    updatedBy: 'KING-PARALLEL-UPDATE-DELETE'
  };
  const { app, store, googleSync } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: { [calendarId]: initialEntry },
      [DATE_INDEX_COLLECTION]: {
        [date]: { calendarId, date }
      },
      [INTEGRATION_COLLECTION]: {
        [CONTROL_DOCUMENT]: { entryCount: 1, mutationWindows: {}, schemaVersion: 1 }
      }
    }
  });
  const playFabId = 'KING-PARALLEL-UPDATE-DELETE';

  const [updateResponse, deleteResponse] = await Promise.all([
    app.invoke('/api/troy-calendar/save', saveBody({
      playFabId,
      calendarId,
      requestId: undefined,
      date,
      title: '更新後'
    })),
    app.invoke('/api/troy-calendar/delete', {
      playFabId,
      calendarId,
      googleBusinessProfileConsent: true,
      consentVersion: 'gbp-special-hours-v1',
      operationId: 'gbp-delete-operation-parallel'
    })
  ]);

  expect(deleteResponse.status).toBe(200);
  expect([200, 404]).toContain(updateResponse.status);
  expect(store.getDocument(CALENDAR_COLLECTION, calendarId)).toBeUndefined();
  expect(store.getDocument(DATE_INDEX_COLLECTION, date)).toBeUndefined();
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 0
  });
  expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toMatchObject({
    action: 'delete',
    calendarId
  });

  if (updateResponse.status === 200) {
    expect(store.commits).toHaveLength(2);
    expect(store.listDocuments(AUDIT_COLLECTION).map((entry) => entry.data.action))
      .toEqual(['update', 'delete']);
    expect(googleSync.calls.markPendingInBatch).toHaveLength(2);
    expect(googleSync.calls.scheduleFlush).toBe(2);
  } else {
    expect(updateResponse.body).toEqual({ error: 'CalendarEntryNotFound' });
    expect(store.commits).toHaveLength(1);
    expect(store.listDocuments(AUDIT_COLLECTION).map((entry) => entry.data.action))
      .toEqual(['delete']);
    expect(googleSync.calls.markPendingInBatch).toHaveLength(1);
    expect(googleSync.calls.scheduleFlush).toBe(1);
  }
});

test('parallel creates at the 80th-entry boundary never exceed 80 entries', async () => {
  const existingCalendar = {};
  const firstDateMs = Date.parse('2026-08-01T21:00:00+09:00');
  for (let index = 0; index < 79; index += 1) {
    const startsAtMs = firstDateMs + (index * 24 * 60 * 60 * 1000);
    const date = new Date(startsAtMs + (9 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    existingCalendar[`boundary-${index + 1}`] = {
      nation: 'global',
      date,
      openTime: '21:00',
      closeTime: '23:00',
      status: 'open',
      startsAtMs
    };
  }
  const { app, store, googleSync } = createHarness({
    initialCollections: { [CALENDAR_COLLECTION]: existingCalendar }
  });
  const shared = { playFabId: 'KING-PARALLEL-CAPACITY' };

  const responses = await Promise.all([
    app.invoke('/api/troy-calendar/save', saveBody({
      ...shared,
      requestId: 'capacity-boundary-01',
      date: '2026-12-14'
    })),
    app.invoke('/api/troy-calendar/save', saveBody({
      ...shared,
      requestId: 'capacity-boundary-02',
      date: '2026-12-15'
    }))
  ]);

  expect(responses.map((response) => response.status).sort((left, right) => left - right))
    .toEqual([200, 409]);
  expect(responses.find((response) => response.status === 409).body).toEqual({
    error: '営業予定は最大80件です。既存予定を整理してください。'
  });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(80);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.listDocuments(DATE_INDEX_COLLECTION)).toHaveLength(1);
  expect(store.getDocument(INTEGRATION_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    entryCount: 80
  });
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

test('reusing a requestId with a different calendar payload returns 409 without writes', async () => {
  const { app, store, googleSync } = createHarness();
  const request = saveBody({
    playFabId: 'KING-CONFLICT',
    requestId: 'conflicting-request-01'
  });

  expect((await app.invoke('/api/troy-calendar/save', request)).status).toBe(200);
  const conflict = await app.invoke('/api/troy-calendar/save', {
    ...request,
    title: '再送時に変更されたタイトル'
  });

  expect(conflict).toEqual({
    status: 409,
    body: { error: 'CalendarRequestConflict' }
  });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
  expect(googleSync.calls.getStatus).toBe(0);
});

test('new save requires a requestId of at most 92 characters', async () => {
  const { app, store, googleSync } = createHarness();
  const invalidRequestIds = [undefined, '', 'a'.repeat(93)];

  for (const requestId of invalidRequestIds) {
    const response = await app.invoke('/api/troy-calendar/save', saveBody({
      playFabId: 'KING-REQUEST-ID',
      requestId
    }));
    expect(response).toEqual({
      status: 400,
      body: { error: '新規保存には有効なrequestIdが必要です。' }
    });
  }

  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(0);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
  expect(store.commits).toHaveLength(0);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('reusing a requestId with different Google consent semantics returns 409', async () => {
  const { app, store, googleSync } = createHarness();
  const localBody = saveBody();
  delete localBody.googleBusinessProfileConsent;
  delete localBody.consentVersion;
  delete localBody.operationId;

  const first = await app.invoke('/api/troy-calendar/save', localBody);
  expect(first.status).toBe(200);

  const changedConsent = await app.invoke('/api/troy-calendar/save', saveBody());
  expect(changedConsent).toEqual({
    status: 409,
    body: { error: 'CalendarRequestConflict' }
  });
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);

  const googleHarness = createHarness();
  const googleFirst = await googleHarness.app.invoke('/api/troy-calendar/save', saveBody());
  expect(googleFirst.status).toBe(200);
  const changedOperation = await googleHarness.app.invoke('/api/troy-calendar/save', saveBody({
    operationId: 'gbp-operation-0002'
  }));
  expect(changedOperation).toEqual({
    status: 409,
    body: { error: 'CalendarRequestConflict' }
  });
  expect(googleHarness.store.commits).toHaveLength(1);
  expect(googleHarness.googleSync.calls.markPendingInBatch).toHaveLength(1);
});

test('successful save does not depend on a document read after batch commit', async () => {
  const { app, store, googleSync } = createHarness({
    failDocumentGetsAfterCommit: true
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody({
    requestId: 'no-post-commit-read-01'
  }));

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    entry: {
      id: 'request-no-post-commit-read-01',
      date: '2026-12-14',
      title: '通常営業'
    }
  });
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({ applied: true });
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

test('Google sync status requires an authenticated King and returns the sync result', async () => {
  const missingIdHarness = createHarness();
  expect(await missingIdHarness.app.invoke('/api/troy-calendar/google-sync-status', {})).toEqual({
    status: 400,
    body: { error: 'playFabId is required' }
  });
  expect(missingIdHarness.googleSync.calls.getStatus).toBe(0);

  const unauthenticatedHarness = createHarness({ authenticated: false });
  expect(await unauthenticatedHarness.app.invoke('/api/troy-calendar/google-sync-status', {
    playFabId: 'KING-001'
  })).toEqual({ status: 401, body: { error: 'Unauthorized' } });
  expect(unauthenticatedHarness.googleSync.calls.getStatus).toBe(0);

  const nonKingHarness = createHarness({ isKing: false });
  expect(await nonKingHarness.app.invoke('/api/troy-calendar/google-sync-status', {
    playFabId: 'PLAYER-001'
  })).toEqual({ status: 403, body: { error: 'Google営業時間は許可された店舗スタッフのみ操作できます。' } });
  expect(nonKingHarness.googleSync.calls.getStatus).toBe(0);

  const statusResult = {
    status: 'retrying',
    configured: true,
    enabled: true,
    queued: true,
    nextAttemptAtMs: 1_800_000_000_000
  };
  const kingHarness = createHarness({ googleStatus: statusResult });
  expect(await kingHarness.app.invoke('/api/troy-calendar/google-sync-status', {
    playFabId: 'KING-001'
  })).toEqual({
    status: 200,
    body: { success: true, googleBusinessProfileSync: statusResult }
  });
  expect(kingHarness.googleSync.calls.getStatus).toBe(1);
});

test('calendar save strictly validates time, status, and Google-compatible overnight hours', async () => {
  const { app, store, googleSync } = createHarness();
  const invalidCases = [
    {
      requestId: 'invalid-open-format-01',
      openTime: '8:00',
      expectedError: 'OPENとCLOSEをHH:mm形式で入力してください。'
    },
    {
      requestId: 'invalid-close-clock-01',
      closeTime: '24:00',
      expectedError: 'OPENとCLOSEをHH:mm形式で入力してください。'
    },
    {
      requestId: 'invalid-status-value-01',
      status: 'holiday',
      expectedError: '営業状態が不正です。'
    },
    {
      requestId: 'invalid-overnight-noon-01',
      openTime: '22:00',
      closeTime: '12:00',
      expectedError: '日またぎ営業は24時間未満かつ翌日11:59までにしてください。'
    },
    {
      requestId: 'invalid-twenty-four-hour-01',
      openTime: '02:00',
      closeTime: '02:00',
      expectedError: '日またぎ営業は24時間未満かつ翌日11:59までにしてください。'
    }
  ];

  for (const invalidCase of invalidCases) {
    const { expectedError, ...overrides } = invalidCase;
    const response = await app.invoke('/api/troy-calendar/save', saveBody({
      playFabId: 'KING-STRICT',
      ...overrides
    }));
    expect(response).toEqual({ status: 400, body: { error: expectedError } });
  }
  expect(store.commits).toHaveLength(0);

  const validOvernight = await app.invoke('/api/troy-calendar/save', saveBody({
    playFabId: 'KING-STRICT',
    requestId: 'valid-overnight-request-01',
    date: '2026-12-20',
    openTime: '22:00',
    closeTime: '02:00'
  }));
  expect(validOvernight.status).toBe(200);
  expect(validOvernight.body.entry).toMatchObject({
    date: '2026-12-20',
    openTime: '22:00',
    closeTime: '02:00',
    status: 'open'
  });
  expect(store.commits).toHaveLength(1);
  expect(googleSync.calls.scheduleFlush).toBe(1);
});

test('new save returns 409 when 80 future calendar entries already exist', async () => {
  const existingCalendar = {};
  const firstDateMs = Date.parse('2026-08-01T21:00:00+09:00');
  for (let index = 0; index < 80; index += 1) {
    const startsAtMs = firstDateMs + (index * 24 * 60 * 60 * 1000);
    const date = new Date(startsAtMs + (9 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    existingCalendar[`capacity-${index + 1}`] = {
      nation: 'global',
      date,
      openTime: '21:00',
      closeTime: '23:00',
      status: 'open',
      startsAtMs
    };
  }
  const { app, store, googleSync } = createHarness({
    initialCollections: { [CALENDAR_COLLECTION]: existingCalendar }
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody({
    requestId: 'capacity-request-0001',
    date: '2026-12-14'
  }));

  expect(response).toEqual({
    status: 409,
    body: { error: '営業予定は最大80件です。既存予定を整理してください。' }
  });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(80);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
  expect(store.commits).toHaveLength(0);
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});

test('calendar save rejects syntactically valid but nonexistent dates before batching', async () => {
  const { app, store, googleSync } = createHarness();
  const invalidDates = ['2027-02-29', '2026-09-31', '2026-11-31'];

  for (const date of invalidDates) {
    const response = await app.invoke('/api/troy-calendar/save', saveBody({
      playFabId: 'KING-INVALID-DATE',
      requestId: `invalid-${date.replaceAll('-', '')}`,
      date
    }));
    expect(response).toEqual({
      status: 400,
      body: { error: '実在する営業日を入力してください。' }
    });
  }

  expect(store.commits).toHaveLength(0);
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(0);
  expect(store.getDocument(INTEGRATION_COLLECTION, INTEGRATION_DOCUMENT)).toMatchObject({
    activeConfigGeneration: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configGeneration,
    activeConfigFingerprint: DEFAULT_GOOGLE_APPROVAL_CONTEXT.configFingerprint,
    activeLocationName: DEFAULT_GOOGLE_APPROVAL_CONTEXT.locationName
  });
  expect(googleSync.calls.markPendingInBatch).toHaveLength(0);
  expect(googleSync.calls.start).toBe(1);
  expect(googleSync.calls.scheduleFlush).toBe(0);
});
