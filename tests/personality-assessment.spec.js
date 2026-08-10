const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const {
  ARCHETYPES,
  ASSESSMENT_VERSION,
  AXES,
  MOTIFS,
  ROUNDS,
  TOTAL_ROUNDS,
  buildCompatibility,
  catalog,
  deriveAssessment,
  evaluateAnswers,
  getComplexityAdjustedRatio,
  getDestinyProfile,
  getQuestion,
  getResponseRatio,
  getResponseWeight,
  rankAnimalCandidates
} = require('../server/personalityAssessmentEngine');
const {
  ASSESSMENT_COLLECTION,
  PLAYFAB_DATA_KEY,
  TOKEN_TTL_MS,
  initializePersonalityAssessmentRoutes,
  isFeatureEnabled,
  parseStoredDestinyValue,
  signToken,
  validateElapsedTime,
  verifyToken
} = require('../server/personalityAssessment');

const TEST_SIGNING_SECRET = 'personality-test-signing-secret-that-is-long-enough';

function choicesFromSeed(seed, seconds = 5) {
  let state = seed >>> 0;
  return ROUNDS.map((round, roundIndex) => {
    state = (Math.imul(state ^ (roundIndex * 2_246_822_519), 1_664_525) + 1_013_904_223) >>> 0;
    return {
      roundId: round.id,
      optionId: round.options[state >>> 30].id,
      seconds: typeof seconds === 'function' ? seconds(roundIndex) : seconds
    };
  });
}

function createFirestore(memberIds = ['CUSTOMER123', 'NO_LINE', 'LEAVER', 'SECOND']) {
  const documents = new Map([
    ['troy_rooms/global', { isOpen: true }],
    ...memberIds.map((id) => [`troy_rooms/global/members/${id}`, { displayName: id }])
  ]);
  let transactionQueue = Promise.resolve();

  function snapshot(documentPath) {
    const exists = documents.has(documentPath);
    const value = documents.get(documentPath);
    return { exists, data: () => (exists ? structuredClone(value) : undefined) };
  }

  function document(documentPath) {
    return {
      _path: documentPath,
      collection(name) { return collection(`${documentPath}/${name}`); },
      async get() { return snapshot(documentPath); },
      async set(value, options = {}) {
        documents.set(documentPath, options.merge
          ? { ...(documents.get(documentPath) || {}), ...structuredClone(value) }
          : structuredClone(value));
      },
      async delete() { documents.delete(documentPath); }
    };
  }

  function collection(collectionPath) {
    return { doc: (id) => document(`${collectionPath}/${id}`) };
  }

  return {
    collection,
    documents,
    removeMember(id) { documents.delete(`troy_rooms/global/members/${id}`); },
    runTransaction(callback) {
      const run = transactionQueue.then(async () => {
        const writes = [];
        const transaction = {
          get: async (reference) => snapshot(reference._path),
          set(reference, value, options = {}) {
            writes.push({ type: 'set', path: reference._path, value: structuredClone(value), merge: Boolean(options.merge) });
          },
          delete(reference) { writes.push({ type: 'delete', path: reference._path }); }
        };
        const result = await callback(transaction);
        writes.forEach((write) => {
          if (write.type === 'delete') documents.delete(write.path);
          else documents.set(write.path, write.merge
            ? { ...(documents.get(write.path) || {}), ...write.value }
            : write.value);
        });
        return result;
      });
      transactionQueue = run.catch(() => undefined);
      return run;
    }
  };
}

function createPlayFab({ updateDelayMs = 0, failWrites = false, failAfterWrite = false } = {}) {
  const values = new Map();
  let writeCount = 0;
  let shouldFailWrites = failWrites;
  let lastWriteRequest = null;
  const PlayFabServer = {
    GetUserReadOnlyData: Symbol('GetUserReadOnlyData'),
    UpdateUserReadOnlyData: Symbol('UpdateUserReadOnlyData')
  };
  async function promisifyPlayFab(method, request) {
    if (method === PlayFabServer.GetUserReadOnlyData) {
      const value = values.get(request.PlayFabId);
      return { Data: value ? { [PLAYFAB_DATA_KEY]: { Value: value } } : {} };
    }
    if (method === PlayFabServer.UpdateUserReadOnlyData) {
      writeCount += 1;
      lastWriteRequest = structuredClone(request);
      if (updateDelayMs) await new Promise((resolve) => setTimeout(resolve, updateDelayMs));
      if (shouldFailWrites) throw new Error('PlayFab write failed');
      values.set(request.PlayFabId, request.Data[PLAYFAB_DATA_KEY]);
      if (failAfterWrite) throw new Error('PlayFab response was lost after write');
      return {};
    }
    throw new Error('Unexpected PlayFab operation');
  }
  return {
    PlayFabServer,
    promisifyPlayFab,
    values,
    setFailWrites(value) { shouldFailWrites = Boolean(value); },
    get writeCount() { return writeCount; },
    get lastWriteRequest() { return lastWriteRequest; }
  };
}

function seedDestiny(playFab, playFabId, animalId = 'animal-001') {
  const animal = catalog.animals.find((entry) => entry.id === animalId);
  playFab.values.set(playFabId, JSON.stringify({
    version: ASSESSMENT_VERSION,
    catalogVersion: catalog.catalogVersion,
    animalId,
    assignedAt: '2026-08-09T00:00:00.000Z',
    resultHash: 'a'.repeat(64),
    axisScores: animal.selection.axes,
    motifAffinities: animal.selection.motif,
    archetypeAffinities: animal.selection.archetype,
    tempo: animal.selection.tempo
  }));
}

function createRouteHarness(deps, options = {}) {
  const routes = new Map();
  const app = {
    get(routePath, ...handlers) { routes.set(`GET ${routePath}`, handlers); },
    post(routePath, ...handlers) { routes.set(`POST ${routePath}`, handlers); }
  };
  const routeOptions = options.enabled
    ? { signingSecret: TEST_SIGNING_SECRET, ...options }
    : options;
  initializePersonalityAssessmentRoutes(app, deps, routeOptions);

  return async function invoke(method, routePath, body = {}) {
    const handlers = routes.get(`${method} ${routePath}`);
    if (!handlers) throw new Error(`Missing route: ${method} ${routePath}`);
    let status = 200;
    let payload;
    const res = {
      status(value) { status = value; return this; },
      json(value) { payload = value; return value; }
    };
    const headers = {};
    const req = { body, headers, get(name) { return headers[String(name).toLowerCase()] || ''; } };
    async function dispatch(index) {
      const handler = handlers[index];
      if (handler) await handler(req, res, () => dispatch(index + 1));
    }
    await dispatch(0);
    return { status, body: payload };
  };
}

async function completeAssessment(invoke, customerRef, optionIndex = 0) {
  let response = await invoke('POST', '/api/personality-assessment/start', { customerRef });
  expect(response.status).toBe(200);
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    const question = response.body.question;
    response = await invoke('POST', '/api/personality-assessment/answer', {
      token: response.body.token,
      questionId: question.id,
      optionId: question.options[optionIndex % 4].id,
      elapsedMs: 0
    });
  }
  return response;
}

test('service worker never caches API responses', () => {
  const serviceWorker = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'sw.js'), 'utf8');
  expect(serviceWorker).toContain("path.startsWith('/api/')");
});

test('new feature flag takes precedence while the legacy flag remains a deployment fallback', () => {
  expect(isFeatureEnabled({ SPECIAL_ABILITY_ENABLED: 'true' })).toBe(true);
  expect(isFeatureEnabled({ PERSONALITY_ASSESSMENT_ENABLED: 'false', SPECIAL_ABILITY_ENABLED: 'true' })).toBe(false);
  expect(isFeatureEnabled({ PERSONALITY_ASSESSMENT_ENABLED: 'true' })).toBe(true);
});

test('V2 assessment uses 12 rounds, 48 distinct creatures and hidden continuous vectors', () => {
  expect(ASSESSMENT_VERSION).toBe(2);
  expect(ROUNDS).toHaveLength(12);
  expect(TOTAL_ROUNDS).toBe(12);
  const options = ROUNDS.flatMap((round) => round.options);
  expect(new Set(options.map((option) => option.creatureId)).size).toBe(48);
  expect(new Set(options.map((option) => option.creatureName)).size).toBe(48);
  options.forEach((option) => {
    AXES.forEach((axis) => expect(option.axisVector[axis]).toBeGreaterThanOrEqual(-1));
    MOTIFS.forEach((motif) => expect(option.motifVector[motif]).toBeGreaterThanOrEqual(0));
    ARCHETYPES.forEach((archetype) => expect(option.archetypeVector[archetype]).toBeGreaterThanOrEqual(0));
  });
  const question = getQuestion(0, 'assessment-a');
  expect(question.options[0]).toEqual(expect.objectContaining({ id: expect.any(String), imageUrl: expect.stringContaining('.webp'), alt: expect.any(String) }));
  expect(JSON.stringify(question)).not.toMatch(/axis|motif|archetype|tempo|creature|score/i);
});

test('response time weighting is bounded and complexity adjusted', () => {
  expect(getResponseRatio(0.1, 5)).toBe(0.6);
  expect(getResponseRatio(99, 5)).toBe(1.6);
  expect(getResponseWeight(2, 5)).toBeGreaterThan(1);
  expect(getResponseWeight(8, 5)).toBeLessThan(1);
  expect(getComplexityAdjustedRatio(4, 'symbolic')).toBe(1);
  expect(getComplexityAdjustedRatio(8, 'intricate')).toBe(1);
});

test('derivation is deterministic and contains no public type label', () => {
  const answers = choicesFromSeed(42, (index) => 2 + index);
  const first = deriveAssessment(answers);
  const second = deriveAssessment(answers);
  expect(first.selectedAnimal.id).toBe(second.selectedAnimal.id);
  expect(first.resultHash).toBe(second.resultHash);
  expect(first.candidates).toHaveLength(12);
  expect(first.axisScores).toEqual(expect.objectContaining({ E: expect.any(Number), S: expect.any(Number), T: expect.any(Number), J: expect.any(Number) }));
  expect(JSON.stringify(first.selectedAnimal)).not.toMatch(/targetType|typeCode|personalityType|epithet/);
});

test('all 365 animals win for their own semantic profile', () => {
  const winners = new Set();
  catalog.animals.forEach((animal) => {
    const winner = rankAnimalCandidates({
      axisScores: animal.selection.axes,
      motifAffinities: animal.selection.motif,
      archetypeAffinities: animal.selection.archetype,
      tempo: animal.selection.tempo
    }, 1)[0].animal;
    expect(winner.id).toBe(animal.id);
    winners.add(winner.id);
  });
  expect(winners.size).toBe(365);
});

test('owner profile is detailed while another player receives only a summary', () => {
  const full = getDestinyProfile({ animalId: 'animal-001' }, { detail: 'full' });
  const summary = getDestinyProfile({ animalId: 'animal-001' }, { detail: 'summary' });
  expect(full.animal).toEqual(expect.objectContaining({ pastLifeMemory: expect.any(String), strength: expect.any(String), weakness: expect.any(String), relationships: expect.any(String), advice: expect.any(String) }));
  expect(full.arcanaDay).toEqual(expect.objectContaining({ label: expect.any(String), omen: expect.any(String), prophecy: expect.any(String) }));
  expect(summary.animal).toEqual(expect.objectContaining({ id: 'animal-001', name: 'ライオン', core: expect.any(String) }));
  expect(summary.animal).not.toHaveProperty('pastLifeMemory');
  expect(summary.arcanaDay).toEqual(expect.objectContaining({ label: expect.any(String), omen: expect.any(String) }));
  expect(summary.arcanaDay).not.toHaveProperty('prophecy');
  expect(full).not.toHaveProperty('guardianArcana');
  expect(summary).not.toHaveProperty('guardianArcana');
  expect(summary).not.toHaveProperty('readingVersion');
  expect(JSON.stringify({ full, summary })).not.toMatch(/selection|relationVector|axisScores|motifAffinities|archetypeAffinities|tempo|typeCode/);
});

test('compatibility is symmetric, bounded and individualized by animal', () => {
  const forward = buildCompatibility({ animalId: 'animal-001' }, { animalId: 'animal-365' });
  const reverse = buildCompatibility({ animalId: 'animal-365' }, { animalId: 'animal-001' });
  expect(forward).toEqual(reverse);
  expect(forward.overall).toBeGreaterThanOrEqual(35);
  expect(forward.overall).toBeLessThanOrEqual(98);
  expect(forward.categories.love.summary).toContain('ライオン');
  expect(forward.categories.love.summary).toContain('マナマコ');
  expect(JSON.stringify(forward)).not.toMatch(/relationVector|selection|axis|typeCode/);
});

test('stored V2 payload is validated and old or incomplete data is rejected', () => {
  const animal = catalog.animals[0];
  const valid = {
    version: 2,
    catalogVersion: catalog.catalogVersion,
    animalId: animal.id,
    assignedAt: '2026-08-09T00:00:00.000Z',
    resultHash: 'b'.repeat(64),
    axisScores: animal.selection.axes,
    motifAffinities: animal.selection.motif,
    archetypeAffinities: animal.selection.archetype,
    tempo: animal.selection.tempo
  };
  expect(parseStoredDestinyValue(valid)).toEqual(expect.objectContaining({ animalId: animal.id, destinyProfile: expect.any(Object), publicDestinyProfile: expect.any(Object) }));
  expect(parseStoredDestinyValue({ ...valid, version: 1 })).toBeNull();
  expect(parseStoredDestinyValue({ ...valid, resultHash: 'bad' })).toBeNull();
  expect(parseStoredDestinyValue({ ...valid, axisScores: null })).toBeNull();
});

test('tokens detect tampering, expiry and invalid elapsed time', () => {
  const now = Date.UTC(2026, 7, 9, 12);
  const payload = {
    aud: 'troy-personality-assessment', version: 2, assessmentId: 'a', playFabId: 'p',
    roundIndex: 0, answers: [], issuedAt: now, expiresAt: now + TOKEN_TTL_MS, questionStartedAt: now
  };
  const token = signToken(payload, TEST_SIGNING_SECRET);
  expect(verifyToken(token, TEST_SIGNING_SECRET, now)).toEqual(payload);
  expect(() => verifyToken(`${token}x`, TEST_SIGNING_SECRET, now)).toThrow(/改ざん/);
  expect(() => verifyToken(token, TEST_SIGNING_SECRET, now + TOKEN_TTL_MS + 1)).toThrow(/有効時間/);
  expect(validateElapsedTime(payload, 2_000, now + 2_000)).toBe(2);
  expect(() => validateElapsedTime(payload, 60_000, now + 1_000)).toThrow(/確認できません/);
});

test('feature visibility follows the deployment flag without a staff PIN or secret URL', async () => {
  const disabled = createRouteHarness({}, { enabled: false });
  await expect(disabled('GET', '/api/personality-assessment/config')).resolves.toEqual({ status: 200, body: { success: true, enabled: false } });

  const firestore = createFirestore();
  const playFab = createPlayFab();
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true });
  const opened = await invoke('GET', '/api/personality-assessment/config');
  expect(opened.body).toEqual(expect.objectContaining({ success: true, enabled: true, totalRounds: 12, assetVersion: expect.any(Number) }));
  expect(opened.body).not.toHaveProperty('terminalSession');
});

test('store flow saves once, returns the full reading and forbids replay', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  const nowMs = Date.UTC(2026, 7, 9, 12);
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true, now: () => nowMs });
  const completed = await completeAssessment(invoke, 'TROY:NO_LINE', 0);
  expect(completed.status).toBe(200);
  expect(completed.body).toEqual(expect.objectContaining({ success: true, state: 'completed', destinyProfile: expect.any(Object) }));
  expect(completed.body.destinyProfile.animal).toEqual(expect.objectContaining({ pastLifeMemory: expect.any(String), advice: expect.any(String) }));
  expect(completed.body.destinyProfile.arcanaDay).toEqual(expect.objectContaining({ prophecy: expect.any(String) }));
  expect(completed.body.destinyProfile).not.toHaveProperty('guardianArcana');
  expect(playFab.writeCount).toBe(1);
  expect(playFab.lastWriteRequest.Permission).toBe('Private');
  const stored = JSON.parse(playFab.values.get('NO_LINE'));
  expect(stored).toEqual(expect.objectContaining({ version: 2, animalId: expect.stringMatching(/^animal-\d{3}$/), resultHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  expect(stored).not.toHaveProperty('typeCode');
  expect(firestore.documents.get(`${ASSESSMENT_COLLECTION}/NO_LINE`).status).toBe('confirmed');
  const replay = await invoke('POST', '/api/personality-assessment/start', { customerRef: 'TROY:NO_LINE' });
  expect(replay).toEqual(expect.objectContaining({ status: 409, body: expect.objectContaining({ code: 'already_completed' }) }));
});

test('final answer rejects a customer who has left the store', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  const nowMs = Date.UTC(2026, 7, 9, 12);
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true, now: () => nowMs });
  let response = await invoke('POST', '/api/personality-assessment/start', { customerRef: 'TROY:LEAVER' });
  for (let index = 0; index < TOTAL_ROUNDS - 1; index += 1) {
    response = await invoke('POST', '/api/personality-assessment/answer', {
      token: response.body.token,
      questionId: response.body.question.id,
      optionId: response.body.question.options[0].id,
      elapsedMs: 0
    });
  }
  firestore.removeMember('LEAVER');
  const final = await invoke('POST', '/api/personality-assessment/answer', {
    token: response.body.token,
    questionId: response.body.question.id,
    optionId: response.body.question.options[0].id,
    elapsedMs: 0
  });
  expect(final.status).toBe(403);
  expect(final.body.code).toBe('customer_left_store');
  expect(playFab.writeCount).toBe(0);
});

test('concurrent finalization stores exactly one result', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab({ updateDelayMs: 30 });
  const nowMs = Date.UTC(2026, 7, 9, 12);
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true, now: () => nowMs });
  let response = await invoke('POST', '/api/personality-assessment/start', { customerRef: 'TROY:CUSTOMER123' });
  for (let index = 0; index < TOTAL_ROUNDS - 1; index += 1) {
    response = await invoke('POST', '/api/personality-assessment/answer', {
      token: response.body.token,
      questionId: response.body.question.id,
      optionId: response.body.question.options[0].id,
      elapsedMs: 0
    });
  }
  const finalRequest = {
    token: response.body.token,
    questionId: response.body.question.id,
    optionId: response.body.question.options[0].id,
    elapsedMs: 0
  };
  const results = await Promise.all([
    invoke('POST', '/api/personality-assessment/answer', finalRequest),
    invoke('POST', '/api/personality-assessment/answer', finalRequest)
  ]);
  expect(results.map((entry) => entry.status).sort()).toEqual([200, 409]);
  expect(playFab.writeCount).toBe(1);
  expect(parseStoredDestinyValue(playFab.values.get('CUSTOMER123'))).not.toBeNull();
});

test('a failed save releases the reservation so the customer can retry', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab({ failWrites: true });
  const nowMs = Date.UTC(2026, 7, 9, 12);
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true, now: () => nowMs });
  const failed = await completeAssessment(invoke, 'TROY:CUSTOMER123', 1);
  expect(failed.status).toBe(502);
  expect(failed.body.code).toBe('save_failed');
  expect(firestore.documents.has(`${ASSESSMENT_COLLECTION}/CUSTOMER123`)).toBe(false);
  playFab.setFailWrites(false);
  const retry = await invoke('POST', '/api/personality-assessment/start', { customerRef: 'TROY:CUSTOMER123' });
  expect(retry.status).toBe(200);
  expect(retry.body.state).toBe('in_progress');
});

test('a confirmed Firestore result is preserved and restores a missing PlayFab record', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  const animal = catalog.animals.find((entry) => entry.id === 'animal-090');
  const confirmedPath = `${ASSESSMENT_COLLECTION}/CUSTOMER123`;
  firestore.documents.set(confirmedPath, {
    version: ASSESSMENT_VERSION,
    catalogVersion: catalog.catalogVersion,
    status: 'confirmed',
    playFabId: 'CUSTOMER123',
    animalId: animal.id,
    assignedAt: '2026-08-09T00:00:00.000Z',
    resultHash: 'c'.repeat(64),
    axisScores: animal.selection.axes,
    motifAffinities: animal.selection.motif,
    archetypeAffinities: animal.selection.archetype,
    tempo: animal.selection.tempo,
    confirmedAt: new Date('2026-08-09T00:00:00.000Z')
  });
  const invoke = createRouteHarness({ firestore, ...playFab }, { enabled: true });
  const status = await invoke('POST', '/api/personality-assessment/status', { customerRef: 'TROY:CUSTOMER123' });
  expect(status.status).toBe(200);
  expect(status.body).toEqual(expect.objectContaining({
    success: true,
    state: 'completed',
    destinyProfile: expect.objectContaining({ animal: expect.objectContaining({ name: 'ニホンジカ' }) })
  }));
  expect(firestore.documents.has(confirmedPath)).toBe(true);
  expect(playFab.writeCount).toBe(1);
  expect(parseStoredDestinyValue(playFab.values.get('CUSTOMER123'))?.animalId).toBe(animal.id);
});

test('compatibility API requires both V2 results and authenticates the requesting player', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  let authenticatedId = 'CUSTOMER123';
  const requireAuthenticatedPlayFabId = async (_req, res, requestedId) => {
    if (requestedId !== authenticatedId) {
      res.status(403).json({ success: false, error: 'forbidden' });
      return '';
    }
    return requestedId;
  };
  const invoke = createRouteHarness({ firestore, ...playFab, requireAuthenticatedPlayFabId }, { enabled: true });
  let response = await invoke('POST', '/api/player-compatibility', { playFabId: 'CUSTOMER123', targetPlayFabId: 'SECOND' });
  expect(response.body).toEqual(expect.objectContaining({ success: true, available: false }));
  seedDestiny(playFab, 'CUSTOMER123', 'animal-001');
  seedDestiny(playFab, 'SECOND', 'animal-365');
  response = await invoke('POST', '/api/player-compatibility', { playFabId: 'CUSTOMER123', targetPlayFabId: 'SECOND' });
  expect(response.body).toEqual(expect.objectContaining({ success: true, available: true, compatibility: expect.any(Object) }));
  expect(JSON.stringify(response.body)).not.toMatch(/relationVector|selection|axisScores|animalId|typeCode/);
  authenticatedId = 'OTHER';
  const rejected = await invoke('POST', '/api/player-compatibility', { playFabId: 'CUSTOMER123', targetPlayFabId: 'SECOND' });
  expect(rejected.status).toBe(403);
});

test('store diagnosis UI completes 12 questions and renders the full V3 reading', async ({ page }) => {
  const destinyProfile = getDestinyProfile({ animalId: 'animal-001' }, { detail: 'full' });
  await page.route('**/api/personality-assessment/config*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, enabled: true, totalRounds: 12, assetVersion: 4 })
  }));
  await page.route('**/api/tarot-reading/customers', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      isOpen: true,
      customers: [{ customerRef: 'TROY:CUSTOMER123', displayName: '診断テスト', lineLinked: false, joinedAtMs: Date.now() }]
    })
  }));
  await page.route('**/api/personality-assessment/status', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, state: 'available', destinyProfile: null })
  }));
  let answerIndex = 0;
  const question = (index) => getQuestion(index, 'ui-test');
  await page.route('**/api/personality-assessment/start', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, state: 'in_progress', token: 'token-0', question: question(0) })
  }));
  await page.route('**/api/personality-assessment/answer', (route) => {
    answerIndex += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(answerIndex === 12
        ? { success: true, state: 'completed', destinyProfile }
        : { success: true, state: 'in_progress', token: `token-${answerIndex}`, question: question(answerIndex) })
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tarot-reading.html');
  await page.locator('[data-reading-mode="personality"]').click();
  await page.locator('#tarotCustomerRef').selectOption('TROY:CUSTOMER123');
  await expect(page.locator('#personalityStart')).toBeEnabled();
  await page.locator('#personalityStart').click();
  for (let index = 0; index < 12; index += 1) {
    await expect(page.locator('#personalityOptions .personality-option')).toHaveCount(4);
    await page.locator('#personalityOptions .personality-option').first().click();
  }
  await expect(page.locator('#personalityResult')).toBeVisible();
  await expect(page.locator('#personalityTraits')).toHaveText(destinyProfile.traits);
  await expect(page.locator('#personalityAnimalName')).toHaveText('ライオン');
  await expect(page.locator('#personalityAnimalMemory')).toHaveText(destinyProfile.animal.pastLifeMemory);
  await expect(page.locator('#personalityAnimalAdvice')).toHaveText(destinyProfile.animal.advice);
  await expect(page.locator('#personalityArcanaDay')).toHaveText(destinyProfile.arcanaDay.label);
  await expect(page.locator('#personalityArcanaDayProphecy')).toHaveText(destinyProfile.arcanaDay.prophecy);
  await expect(page.locator('#personalityResult')).not.toContainText(/この動物になった理由|守護アルカナ/);
  await expect(page.locator('#personalityResult')).not.toContainText(/INTJ|TROY式16タイプ|採点|反応速度|候補順位|特殊能力/);

  const portrait = await page.locator('#personalityAnimalImage').evaluate((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    renderedWidth: image.getBoundingClientRect().width,
    renderedHeight: image.getBoundingClientRect().height
  }));
  expect(portrait).toEqual(expect.objectContaining({
    complete: true,
    naturalWidth: 768,
    naturalHeight: 768
  }));
  expect(portrait.renderedWidth).toBeGreaterThan(180);
  expect(portrait.renderedHeight).toBeGreaterThan(180);

  const desktop = await page.locator('#personalityResult').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));
  expect(desktop.width).toBeLessThanOrEqual(desktop.viewport);
  expect(desktop.scrollWidth).toBeLessThanOrEqual(Math.ceil(desktop.width) + 1);
  if (process.env.PERSONALITY_QA_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'tmp/personality-result-desktop.png', fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator('#personalityResult').evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    scrollWidth: element.scrollWidth,
    width: element.getBoundingClientRect().width,
    viewport: document.documentElement.clientWidth
  }));
  expect(mobile.left).toBeGreaterThanOrEqual(0);
  expect(mobile.right).toBeLessThanOrEqual(mobile.viewport + 1);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(Math.ceil(mobile.width) + 1);
  if (process.env.PERSONALITY_QA_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'tmp/personality-result-mobile.png', fullPage: true });
  }
});
