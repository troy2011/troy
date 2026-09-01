const { test, expect } = require('@playwright/test');

const { initializeEventRoutes } = require('../server/events');

const CALENDAR_COLLECTION = 'troy_business_calendar';
const AUDIT_COLLECTION = 'troy_business_calendar_audit';
const DATE_INDEX_COLLECTION = 'troy_business_calendar_dates';
const CONTROL_COLLECTION = 'integration_states';
const CONTROL_DOCUMENT = 'troy_business_calendar_write_control';

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
        return documentReference(collectionName, id || `generated-${++generatedId}`);
      },
      where(field, operator, value) {
        return collectionReference(collectionName, { ...query, where: { field, operator, value } });
      },
      orderBy(field, direction) {
        return collectionReference(collectionName, { ...query, orderBy: { field, direction } });
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
      const bucket = bucketFor(write.ref.collectionName);
      if (write.type === 'delete') {
        bucket.delete(write.ref.id);
        continue;
      }
      const current = write.options?.merge === true ? bucket.get(write.ref.id) || {} : {};
      bucket.set(write.ref.id, { ...clone(current), ...clone(write.data) });
    }
  }

  async function commitWrites(id, writes) {
    if (!writes.length) return;
    const record = {
      batchId: id,
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
    runTransaction(callback) {
      const run = transactionTail.then(async () => {
        const id = ++batchId;
        const writes = [];
        const transaction = {
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
        await commitWrites(id, writes);
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
    hasRoute(path) {
      return routes.has(path);
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

function createHarness({
  initialCollections = {},
  failCommits = 0,
  failDocumentGetsAfterCommit = false,
  authenticated = true,
  isKing = true,
  nation = 'fire'
} = {}) {
  const store = createFakeFirestore(initialCollections, { failCommits, failDocumentGetsAfterCommit });
  const app = createFakeApp();
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
  return { app, store };
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
    note: '',
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

test('calendar save commits calendar, audit, date index, and control atomically', async () => {
  const { app, store } = createHarness();
  const response = await app.invoke('/api/troy-calendar/save', saveBody({
    googleBusinessProfileConsent: true,
    consentVersion: 'retired-integration',
    operationId: 'retired-operation'
  }));

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    entry: { id: 'request-route-request-0001', date: '2026-12-14' }
  });
  expect(response.body.googleBusinessProfileSync).toBeUndefined();

  const calendar = store.getDocument(CALENDAR_COLLECTION, 'request-route-request-0001');
  expect(calendar).toMatchObject({
    nation: 'global',
    date: '2026-12-14',
    openTime: '18:00',
    closeTime: '23:00',
    status: 'open',
    updatedBy: 'KING-001'
  });
  expect(calendar.googleBusinessProfileConsent).toBeUndefined();
  expect(calendar.consentVersion).toBeUndefined();
  expect(calendar.operationId).toBeUndefined();
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2026-12-14')).toEqual({
    calendarId: 'request-route-request-0001',
    date: '2026-12-14'
  });
  expect(store.getDocument(CONTROL_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({
    schemaVersion: 1,
    entryCount: 1
  });
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0]).toMatchObject({ applied: true });
});

test('calendar mutation requires Firebase authentication and King authority', async () => {
  const unauthenticated = createHarness({ authenticated: false });
  expect(await unauthenticated.app.invoke('/api/troy-calendar/save', saveBody())).toEqual({
    status: 401,
    body: { error: 'Unauthorized' }
  });
  expect(unauthenticated.store.commits).toHaveLength(0);

  const nonKing = createHarness({ isKing: false });
  expect(await nonKing.app.invoke('/api/troy-calendar/save', saveBody())).toEqual({
    status: 403,
    body: { error: '王のみ操作できます。' }
  });
  expect(nonKing.store.commits).toHaveLength(0);
});

test('retired Google Business calendar endpoints are not registered', () => {
  const { app } = createHarness();
  expect(app.hasRoute('/api/troy-calendar/google-sync-status')).toBe(false);
  expect(app.hasRoute('/api/troy-calendar/google-sync-review-details')).toBe(false);
  expect(app.hasRoute('/api/troy-calendar/google-sync-review-approve')).toBe(false);
});

test('calendar delete commits its mutation, audit, date index, and control atomically', async () => {
  const calendarId = 'calendar-delete-001';
  const { app, store } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        [calendarId]: {
          nation: 'global',
          date: '2026-12-14',
          openTime: '18:00',
          closeTime: '23:00',
          status: 'open',
          title: '通常営業',
          startsAtMs: Date.parse('2026-12-14T18:00:00+09:00')
        }
      },
      [DATE_INDEX_COLLECTION]: {
        '2026-12-14': { calendarId, date: '2026-12-14' }
      },
      [CONTROL_COLLECTION]: {
        [CONTROL_DOCUMENT]: { schemaVersion: 1, entryCount: 1, mutationWindows: {} }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/delete', {
    playFabId: 'KING-001',
    calendarId
  });

  expect(response).toEqual({
    status: 200,
    body: { success: true, deleted: true, calendarId }
  });
  expect(store.getDocument(CALENDAR_COLLECTION, calendarId)).toBeUndefined();
  expect(store.getDocument(DATE_INDEX_COLLECTION, '2026-12-14')).toBeUndefined();
  expect(store.getDocument(CONTROL_COLLECTION, CONTROL_DOCUMENT)).toMatchObject({ entryCount: 0 });
  expect(store.listDocuments(AUDIT_COLLECTION)[0].data).toMatchObject({
    action: 'delete',
    calendarId,
    actorPlayFabId: 'KING-001'
  });
  expect(store.commits).toHaveLength(1);
});

for (const scenario of [
  {
    name: 'save',
    path: '/api/troy-calendar/save',
    body: saveBody()
  },
  {
    name: 'delete',
    path: '/api/troy-calendar/delete',
    body: { playFabId: 'KING-001', calendarId: 'calendar-delete-failure' },
    initialCollections: {
      [CALENDAR_COLLECTION]: {
        'calendar-delete-failure': {
          nation: 'global',
          date: '2026-12-14',
          openTime: '18:00',
          closeTime: '23:00',
          status: 'open'
        }
      }
    }
  }
]) {
  test(`calendar ${scenario.name} applies no staged transaction writes when commit fails`, async () => {
    const { app, store } = createHarness({
      initialCollections: scenario.initialCollections,
      failCommits: 1
    });
    const before = clone(store.listDocuments(CALENDAR_COLLECTION));
    const response = await invokeWithExpectedServerError(app, scenario.path, scenario.body);
    expect(response.status).toBe(500);
    expect(store.listDocuments(CALENDAR_COLLECTION)).toEqual(before);
    expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(0);
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].applied).toBe(false);
  });
}

test('retrying an identical new save is duplicate-safe without another commit', async () => {
  const { app, store } = createHarness();
  const first = await app.invoke('/api/troy-calendar/save', saveBody());
  const second = await app.invoke('/api/troy-calendar/save', saveBody());

  expect(first.status).toBe(200);
  expect(second).toMatchObject({ status: 200, body: { success: true, duplicate: true } });
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
});

test('reusing a requestId with a different payload returns 409 without another write', async () => {
  const { app, store } = createHarness();
  expect((await app.invoke('/api/troy-calendar/save', saveBody())).status).toBe(200);
  const conflict = await app.invoke('/api/troy-calendar/save', saveBody({ title: '貸切営業' }));

  expect(conflict).toEqual({ status: 409, body: { error: 'CalendarRequestConflict' } });
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
  expect(store.commits).toHaveLength(1);
});

test('parallel requestIds for the same date produce one save and one date conflict', async () => {
  const { app, store } = createHarness();
  const responses = await Promise.all([
    app.invoke('/api/troy-calendar/save', saveBody({ requestId: 'parallel-date-0001' })),
    app.invoke('/api/troy-calendar/save', saveBody({ requestId: 'parallel-date-0002' }))
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(store.listDocuments(CALENDAR_COLLECTION)).toHaveLength(1);
  expect(store.listDocuments(AUDIT_COLLECTION)).toHaveLength(1);
});

test('new save requires a valid requestId of at most 92 characters', async () => {
  for (const requestId of ['', 'short', 'x'.repeat(93)]) {
    const { app, store } = createHarness();
    const response = await app.invoke('/api/troy-calendar/save', saveBody({ requestId }));
    expect(response.status).toBe(400);
    expect(store.commits).toHaveLength(0);
  }
});

test('calendar save strictly validates date, time, status, and overnight duration', async () => {
  const invalidBodies = [
    { date: '2026-02-30' },
    { openTime: '25:00' },
    { closeTime: '12:60' },
    { status: 'unknown' },
    { openTime: '18:00', closeTime: '12:00' }
  ];
  for (const overrides of invalidBodies) {
    const { app, store } = createHarness();
    const response = await app.invoke('/api/troy-calendar/save', saveBody(overrides));
    expect(response.status).toBe(400);
    expect(store.commits).toHaveLength(0);
  }

  const valid = createHarness();
  const response = await valid.app.invoke('/api/troy-calendar/save', saveBody({
    openTime: '21:00',
    closeTime: '02:00'
  }));
  expect(response.status).toBe(200);
});

test('new save returns 409 when 80 future entries already exist', async () => {
  const calendars = {};
  for (let index = 0; index < 80; index += 1) {
    calendars[`existing-${index}`] = {
      nation: 'global',
      date: `2027-01-${String((index % 28) + 1).padStart(2, '0')}`,
      startsAtMs: Date.parse(`2027-01-${String((index % 28) + 1).padStart(2, '0')}T18:00:00+09:00`)
    };
  }
  const { app, store } = createHarness({
    initialCollections: {
      [CALENDAR_COLLECTION]: calendars,
      [CONTROL_COLLECTION]: {
        [CONTROL_DOCUMENT]: { schemaVersion: 1, entryCount: 80, mutationWindows: {} }
      }
    }
  });

  const response = await app.invoke('/api/troy-calendar/save', saveBody());
  expect(response.status).toBe(409);
  expect(store.commits).toHaveLength(0);
});

test('successful save does not depend on a document read after commit', async () => {
  const { app, store } = createHarness({ failDocumentGetsAfterCommit: true });
  const response = await app.invoke('/api/troy-calendar/save', saveBody());
  expect(response.status).toBe(200);
  expect(store.commits).toHaveLength(1);
  expect(store.commits[0].applied).toBe(true);
});
