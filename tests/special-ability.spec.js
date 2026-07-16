const { test, expect } = require('@playwright/test');

const {
  ASSESSMENT_VERSION,
  AXES,
  ROUNDS,
  TOTAL_ROUNDS,
  catalog,
  evaluateAnswers,
  getComplexityAdjustedRatio,
  getQuestion,
  getResponseRatio,
  getResponseWeight,
  rankAbilityCandidates,
  resolveAxisLetter,
  selectAffinity,
  selectLeastUsedAbility
} = require('../server/specialAbilityEngine');
const {
  ASSIGNMENT_STATE_DOCUMENT,
  PLAYFAB_DATA_KEY,
  TERMINAL_BOOTSTRAP_HEADER,
  TERMINAL_SESSION_HEADER,
  TOKEN_TTL_MS,
  initializeSpecialAbilityRoutes,
  parseStoredAbilityValue,
  signTerminalSession,
  signToken,
  validateElapsedTime,
  verifyToken
} = require('../server/specialAbility');

const ASSIGNMENT_STATE_PATH = `special_ability_state/${ASSIGNMENT_STATE_DOCUMENT}`;
const TEST_TERMINAL_TOKEN = 'store-terminal-token-for-special-ability-tests';

function choicesFromInteger(value, seconds = 5) {
  let remaining = value;
  return ROUNDS.map((round) => {
    const option = round.options[remaining % round.options.length];
    remaining = Math.floor(remaining / round.options.length);
    return { roundId: round.id, optionId: option.id, seconds };
  });
}

function createFirestore(memberIds = ['CUSTOMER123', 'NO_LINE', 'LEAVER']) {
  const documents = new Map([
    ['troy_rooms/global', { isOpen: true }],
    ...memberIds.map((id) => [`troy_rooms/global/members/${id}`, { displayName: id }])
  ]);
  let transactionQueue = Promise.resolve();
  let readCount = 0;
  let writeCount = 0;

  function snapshot(path) {
    const exists = documents.has(path);
    const value = documents.get(path);
    return { exists, data: () => (exists ? structuredClone(value) : undefined) };
  }

  function document(path) {
    return {
      _path: path,
      collection(name) {
        return collection(`${path}/${name}`);
      },
      async get() {
        readCount += 1;
        return snapshot(path);
      },
      async set(value, options = {}) {
        writeCount += 1;
        const next = options.merge ? { ...(documents.get(path) || {}), ...structuredClone(value) } : structuredClone(value);
        documents.set(path, next);
      },
      async delete() {
        writeCount += 1;
        documents.delete(path);
      }
    };
  }

  function collection(path) {
    return {
      doc(id) {
        return document(`${path}/${id}`);
      }
    };
  }

  return {
    collection,
    documents,
    get readCount() { return readCount; },
    get writeCount() { return writeCount; },
    removeMember(id) {
      documents.delete(`troy_rooms/global/members/${id}`);
    },
    runTransaction(callback) {
      const run = transactionQueue.then(async () => {
        const writes = [];
        const transaction = {
          get: async (ref) => snapshot(ref._path),
          set(ref, value, options = {}) {
            writes.push({ type: 'set', path: ref._path, value: structuredClone(value), merge: !!options.merge });
          },
          delete(ref) {
            writes.push({ type: 'delete', path: ref._path });
          }
        };
        const result = await callback(transaction);
        writes.forEach((write) => {
          writeCount += 1;
          if (write.type === 'delete') {
            documents.delete(write.path);
            return;
          }
          const next = write.merge
            ? { ...(documents.get(write.path) || {}), ...write.value }
            : write.value;
          documents.set(write.path, next);
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
      if (updateDelayMs) await new Promise((resolve) => setTimeout(resolve, updateDelayMs));
      if (shouldFailWrites) throw new Error('PlayFab write failed');
      values.set(request.PlayFabId, request.Data[PLAYFAB_DATA_KEY]);
      if (failAfterWrite) throw new Error('PlayFab response was lost after write');
      return {};
    }
    throw new Error('Unexpected PlayFab method');
  }
  return {
    PlayFabServer,
    promisifyPlayFab,
    values,
    setFailWrites(value) { shouldFailWrites = !!value; },
    get writeCount() { return writeCount; }
  };
}

function createRouteHarness(deps, options) {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); }
  };
  const routeOptions = options?.enabled
    ? { terminalToken: TEST_TERMINAL_TOKEN, ...options }
    : options;
  initializeSpecialAbilityRoutes(app, deps, routeOptions);
  const sessionToken = routeOptions?.enabled && routeOptions?.signingSecret
    ? signTerminalSession(routeOptions.signingSecret, routeOptions.now?.() ?? Date.now())
    : '';
  return async function invoke(method, path, body = {}, requestOptions = {}) {
    const handlers = routes.get(`${method} ${path}`);
    if (!handlers) throw new Error(`Missing route: ${method} ${path}`);
    let status = 200;
    let payload;
    const res = {
      status(value) { status = value; return this; },
      json(value) { payload = value; return value; }
    };
    const headers = Object.fromEntries(Object.entries(requestOptions.headers || {}).map(([name, value]) => (
      [String(name).toLowerCase(), String(value)]
    )));
    if (requestOptions.authenticated !== false && sessionToken && !headers[TERMINAL_SESSION_HEADER]) {
      headers[TERMINAL_SESSION_HEADER] = sessionToken;
    }
    const req = {
      body,
      headers,
      get(name) { return headers[String(name).toLowerCase()] || ''; }
    };
    async function dispatch(index) {
      const handler = handlers[index];
      if (!handler) return;
      await handler(req, res, () => dispatch(index + 1));
    }
    await dispatch(0);
    return { status, body: payload };
  };
}

test('all 16,777,216 image paths reach every one of the 16 internal types', () => {
  const scaledScores = ROUNDS.map((round) => round.options.map((option) => (
    AXES.map((axis) => Math.round(Number(option.score[axis] || 0) * 100))
  )));
  const firstRelevantRound = AXES.map((axis, axisIndex) => (
    ROUNDS.findIndex((_round, roundIndex) => scaledScores[roundIndex][0][axisIndex] !== 0)
  ));
  const choices = new Uint8Array(TOTAL_ROUNDS);
  const scores = new Int16Array(AXES.length);
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
      scores[axisIndex] += scaledScores[roundIndex][0][axisIndex];
    }
  }

  const pathCounts = new Uint32Array(16);
  const combinations = 4 ** TOTAL_ROUNDS;
  for (let pathIndex = 0; pathIndex < combinations; pathIndex += 1) {
    let typeMask = 0;
    for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
      const score = scores[axisIndex] || scaledScores[firstRelevantRound[axisIndex]][choices[firstRelevantRound[axisIndex]]][axisIndex];
      typeMask = (typeMask << 1) | (score > 0 ? 1 : 0);
    }
    pathCounts[typeMask] += 1;

    let cursor = 0;
    while (cursor < TOTAL_ROUNDS) {
      const previousChoice = choices[cursor];
      const nextChoice = previousChoice + 1;
      choices[cursor] = nextChoice < 4 ? nextChoice : 0;
      for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
        scores[axisIndex] += scaledScores[cursor][choices[cursor]][axisIndex]
          - scaledScores[cursor][previousChoice][axisIndex];
      }
      if (nextChoice < 4) break;
      cursor += 1;
    }
  }

  expect([...pathCounts].every((count) => count > 0)).toBe(true);
  expect([...pathCounts].reduce((sum, count) => sum + count, 0)).toBe(combinations);
  const sampleStep = Math.floor(combinations / 4096);
  for (let value = 0; value < combinations; value += sampleStep) {
    expect(evaluateAnswers(choicesFromInteger(value)).type).toMatch(/^[EI][SN][TF][JP]$/);
  }
});

test('timing weight, tie-breaking and affinity boundaries follow the assessment rules', () => {
  expect(getResponseRatio(1, 10)).toBeCloseTo(0.60);
  expect(getResponseRatio(10, 10)).toBeCloseTo(1);
  expect(getResponseRatio(20, 10)).toBeCloseTo(1.60);
  expect(getResponseWeight(1, 10)).toBeCloseTo(1.10);
  expect(getResponseWeight(10, 10)).toBeCloseTo(1);
  expect(getResponseWeight(20, 10)).toBeCloseTo(0.90);
  expect(getComplexityAdjustedRatio(4, 'symbolic')).toBeCloseTo(1);
  expect(getComplexityAdjustedRatio(6, 'environmental')).toBeCloseTo(1);
  expect(getComplexityAdjustedRatio(8, 'intricate')).toBeCloseTo(1);
  expect(resolveAxisLetter('E', 0, [
    { seconds: 6, responseRatio: 0.75, score: { E: 1 } },
    { seconds: 2, responseRatio: 0.65, score: { E: -1 } }
  ])).toBe('I');
  expect(selectAffinity('INTJ', 0.499999)).toBe('manipulation');
  expect(selectAffinity('INTJ', 0.5)).toBe('specialization');
  expect(selectAffinity('INFP', 0.32)).toBe('conjuration');
  expect(selectAffinity('INFP', 0.34)).toBe('transmutation');
  expect(selectAffinity('INFP', 0.67)).toBe('specialization');
  expect(validateElapsedTime({ questionStartedAt: 10_000 }, 2_000, 16_000)).toBe(2);
  expect(validateElapsedTime({ questionStartedAt: 10_000 }, 20_000, 30_000)).toBe(20);
  expect(() => validateElapsedTime({ questionStartedAt: 10_000 }, 1_000, 30_000)).toThrow(/回答時間を確認/);
});

test('absolute tempo is normalized for the visual complexity of each round', () => {
  const answers = ROUNDS.map((round) => ({
    roundId: round.id,
    optionId: round.options[0].id,
    seconds: { symbolic: 4, environmental: 6, intricate: 8 }[round.complexityTier]
  }));
  const evaluation = evaluateAnswers(answers);
  expect(evaluation.normalizedMedianRatio).toBeCloseTo(1);
  expect(evaluation.tempo).toBeCloseTo(0.4);
  expect(Object.values(evaluation.tierMedians)).toEqual([4, 6, 8]);
});

test('question order is stable within an assessment and shuffled for a new assessment', () => {
  const first = ROUNDS.map((_round, index) => getQuestion(index, 'assessment-a').options.map((option) => option.id));
  const repeated = ROUNDS.map((_round, index) => getQuestion(index, 'assessment-a').options.map((option) => option.id));
  const second = ROUNDS.map((_round, index) => getQuestion(index, 'assessment-b').options.map((option) => option.id));
  expect(repeated).toEqual(first);
  expect(second.some((options, index) => options.join('|') !== first[index].join('|'))).toBe(true);
  first.forEach((options, index) => {
    expect([...options].sort()).toEqual(ROUNDS[index].options.map((option) => option.id).sort());
  });
});

test('365 abilities have complete coverage and deterministic least-used assignment', () => {
  expect(catalog.abilities).toHaveLength(365);
  expect(new Set(catalog.abilities.map((ability) => ability.name)).size).toBe(365);
  for (const [type, affinities] of Object.entries(catalog.typeAffinities)) {
    for (const affinity of affinities) {
      const candidates = rankAbilityCandidates(type, affinity, 0.5);
      expect(candidates).toHaveLength(12);
      expect(candidates.every(({ ability }) => ability.affinity === affinity && ability.compatibleTypes.includes(type))).toBe(true);
      const counts = Object.fromEntries(candidates.map(({ ability }, index) => [ability.id, index === 5 ? 0 : 3]));
      expect(selectLeastUsedAbility(candidates, counts, 'fixed-assessment').id).toBe(candidates[5].ability.id);
      expect(selectLeastUsedAbility(candidates, {}, 'fixed-assessment').id)
        .toBe(selectLeastUsedAbility(candidates, {}, 'fixed-assessment').id);
    }
  }
});

test('signed assessment tokens reject tampering and expiration', () => {
  const secret = 'test-secret-that-is-long-enough';
  const now = 10_000;
  const token = signToken({
    aud: 'troy-special-ability', version: ASSESSMENT_VERSION, assessmentId: 'a', playFabId: 'p',
    roundIndex: 0, answers: [], expiresAt: now + TOKEN_TTL_MS
  }, secret);
  expect(verifyToken(token, secret, now).assessmentId).toBe('a');
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  expect(() => verifyToken(tampered, secret, now)).toThrow(/改ざん/);
  expect(() => verifyToken(token, secret, now + TOKEN_TTL_MS + 1)).toThrow(/有効時間/);
  const legacyToken = signToken({
    aud: 'troy-special-ability', version: ASSESSMENT_VERSION - 1, assessmentId: 'old', playFabId: 'p',
    roundIndex: 0, answers: [], expiresAt: now + TOKEN_TTL_MS
  }, secret);
  expect(() => verifyToken(legacyToken, secret, now)).toThrow(/形式が古い/);
});

test('v3 storage does not revive discarded legacy ability data', () => {
  const ability = catalog.abilities[0];
  expect(PLAYFAB_DATA_KEY).toBe('SpecialAbilityJudgmentV3');
  expect(ASSIGNMENT_STATE_DOCUMENT).toBe('assignment-v3');
  expect(parseStoredAbilityValue({
    version: 1,
    abilityId: ability.id,
    name: ability.name,
    effect: ability.effect
  })).toBeNull();
  expect(parseStoredAbilityValue({
    version: ASSESSMENT_VERSION,
    abilityId: ability.id,
    name: ability.name,
    effect: ability.effect
  })).toEqual(expect.objectContaining({
    version: ASSESSMENT_VERSION,
    abilityId: ability.id,
    name: ability.name,
    effect: ability.effect
  }));
});

test('disabled feature only exposes a disabled config response', async () => {
  const invoke = createRouteHarness({}, { enabled: false });
  await expect(invoke('GET', '/api/special-ability/config')).resolves.toEqual({
    status: 200,
    body: { success: true, enabled: false, totalRounds: undefined, assetVersion: undefined }
  });
  const response = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:CUSTOMER123' });
  expect(response.status).toBe(404);
  expect(response.body.enabled).toBe(false);
});

test('store UI keeps the special ability entry hidden while the feature flag is off', async ({ page }) => {
  await page.route('**/api/tarot-reading/customers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, isOpen: true, customers: [] })
  }));
  await page.route('**/api/special-ability/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, enabled: false })
  }));
  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#readingModeSwitch')).toBeHidden();
  await expect(page.locator('#specialAbilityBoard')).toBeHidden();
  await expect(page.locator('#tarotReadingBoard')).toBeVisible();
});

test('enabled feature requires a signing secret before routes are registered', () => {
  expect(() => createRouteHarness({}, { enabled: true, signingSecret: '' }))
    .toThrow(/SPECIAL_ABILITY_SIGNING_SECRET/);
});

test('enabled feature requires a long store terminal token', () => {
  expect(() => createRouteHarness({}, {
    enabled: true,
    signingSecret: 'terminal-prerequisite-secret',
    terminalToken: 'too-short'
  })).toThrow(/SPECIAL_ABILITY_TERMINAL_TOKEN/);
});

test('store APIs stay hidden until the bootstrap token establishes a terminal session', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  const signingSecret = 'terminal-authorization-secret';
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret,
    now: () => 450_000
  });

  const hiddenConfig = await invoke('GET', '/api/special-ability/config', {}, { authenticated: false });
  expect(hiddenConfig).toEqual({ status: 200, body: { success: true, enabled: false } });
  const forbidden = await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  }, { authenticated: false });
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.code).toBe('terminal_authorization_required');

  const bootstrapped = await invoke('GET', '/api/special-ability/config', {}, {
    authenticated: false,
    headers: { [TERMINAL_BOOTSTRAP_HEADER]: TEST_TERMINAL_TOKEN }
  });
  expect(bootstrapped.body).toEqual(expect.objectContaining({
    success: true,
    enabled: true,
    totalRounds: TOTAL_ROUNDS,
    terminalSession: expect.any(String)
  }));
  const authorized = await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  }, {
    authenticated: false,
    headers: { [TERMINAL_SESSION_HEADER]: bootstrapped.body.terminalSession }
  });
  expect(authorized.status).toBe(200);
});

test('answer endpoint rejects a forged question order and an unoffered option', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  let nowMs = 500_000;
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'answer-validation-secret',
    now: () => nowMs
  });
  const started = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:CUSTOMER123' });
  nowMs += 1_000;

  const wrongQuestion = await invoke('POST', '/api/special-ability/answer', {
    token: started.body.token,
    questionId: 'r08',
    optionId: started.body.question.options[0].id,
    elapsedMs: 1_000
  });
  expect(wrongQuestion.status).toBe(400);
  expect(wrongQuestion.body.code).toBe('invalid_round_order');

  const forgedOption = await invoke('POST', '/api/special-ability/answer', {
    token: started.body.token,
    questionId: started.body.question.id,
    optionId: 'r01-forged',
    elapsedMs: 1_000
  });
  expect(forgedOption.status).toBe(400);
  expect(forgedOption.body.code).toBe('invalid_option');
  expect(playFab.writeCount).toBe(0);
});

test('LINE-unlinked customer can complete once and concurrent finalization stores one public ability', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab({ updateDelayMs: 25 });
  let nowMs = 1_000_000;
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'integration-secret',
    now: () => nowMs
  });

  const firstStart = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:NO_LINE' });
  const restarted = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:NO_LINE' });
  expect(firstStart.status).toBe(200);
  expect(restarted.status).toBe(200);
  expect(restarted.body.token).not.toBe(firstStart.body.token);

  let current = restarted.body;
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS - 1; roundIndex += 1) {
    nowMs += 1_500;
    const response = await invoke('POST', '/api/special-ability/answer', {
      token: current.token,
      questionId: current.question.id,
      optionId: current.question.options[0].id,
      elapsedMs: 1_500
    });
    expect(response.status).toBe(200);
    expect(response.body.state).toBe('in_progress');
    current = response.body;
  }

  nowMs += 1_500;
  const finalRequest = {
    token: current.token,
    questionId: current.question.id,
    optionId: current.question.options[0].id,
    elapsedMs: 1_500
  };
  const finalResponses = await Promise.all([
    invoke('POST', '/api/special-ability/answer', finalRequest),
    invoke('POST', '/api/special-ability/answer', finalRequest)
  ]);
  expect(finalResponses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(playFab.writeCount).toBe(1);
  const completed = finalResponses.find((response) => response.status === 200).body;
  expect(completed).toEqual({
    success: true,
    state: 'completed',
    ability: { name: expect.any(String), effect: expect.any(String) }
  });
  expect(JSON.stringify(completed)).not.toMatch(/INTJ|affinity|tempo|score|type/);

  const writesBeforeStatus = firestore.writeCount;
  const status = await invoke('POST', '/api/special-ability/status', { customerRef: 'TROY:NO_LINE' });
  expect(status.body.state).toBe('completed');
  expect(status.body.ability).toEqual(completed.ability);
  const repeatedStatus = await invoke('POST', '/api/special-ability/status', { customerRef: 'TROY:NO_LINE' });
  expect(repeatedStatus.body.ability).toEqual(completed.ability);
  expect(firestore.writeCount).toBe(writesBeforeStatus);
  const blockedRestart = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:NO_LINE' });
  expect(blockedRestart.status).toBe(409);
  expect(blockedRestart.body.code).toBe('already_completed');
});

test('answering is rejected after the selected customer leaves the store', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  let nowMs = 2_000_000;
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'customer-left-secret',
    now: () => nowMs
  });
  const started = await invoke('POST', '/api/special-ability/start', { customerRef: 'TROY:LEAVER' });
  const readsAfterStart = firestore.readCount;
  firestore.removeMember('LEAVER');
  let current = started.body;
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    nowMs += 1_500;
    const response = await invoke('POST', '/api/special-ability/answer', {
      token: current.token,
      questionId: current.question.id,
      optionId: current.question.options[0].id,
      elapsedMs: 1_500
    });
    if (roundIndex < TOTAL_ROUNDS - 1) {
      expect(response.status).toBe(200);
      expect(firestore.readCount).toBe(readsAfterStart);
      current = response.body;
    } else {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('customer_left_store');
    }
  }
  expect(playFab.writeCount).toBe(0);
});

test('failed PlayFab save releases the one-time reservation and permits a clean restart', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab({ failWrites: true });
  let nowMs = 3_000_000;
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'compensation-secret',
    now: () => nowMs
  });
  let current = (await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  })).body;

  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    nowMs += 1_250;
    const response = await invoke('POST', '/api/special-ability/answer', {
      token: current.token,
      questionId: current.question.id,
      optionId: current.question.options[0].id,
      elapsedMs: 1_250
    });
    if (roundIndex < TOTAL_ROUNDS - 1) {
      expect(response.status).toBe(200);
      current = response.body;
    } else {
      expect(response.status).toBe(502);
      expect(response.body.code).toBe('save_failed');
    }
  }

  expect(firestore.documents.has('special_ability_judgments/CUSTOMER123')).toBe(false);
  const state = firestore.documents.get(ASSIGNMENT_STATE_PATH);
  expect(Object.values(state.counts).every((count) => count === 0)).toBe(true);

  playFab.setFailWrites(false);
  const restarted = await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  });
  expect(restarted.status).toBe(200);
  expect(restarted.body.state).toBe('in_progress');
});

test('a lost PlayFab response reconciles the stored result instead of assigning twice', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab({ failAfterWrite: true });
  let nowMs = 4_000_000;
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'ambiguous-write-secret',
    now: () => nowMs
  });
  let current = (await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  })).body;
  let completed;

  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    nowMs += 1_000;
    const response = await invoke('POST', '/api/special-ability/answer', {
      token: current.token,
      questionId: current.question.id,
      optionId: current.question.options[0].id,
      elapsedMs: 1_000
    });
    expect(response.status).toBe(200);
    if (roundIndex < TOTAL_ROUNDS - 1) current = response.body;
    else completed = response.body;
  }

  expect(completed.state).toBe('completed');
  expect(completed.ability).toEqual({ name: expect.any(String), effect: expect.any(String) });
  expect(playFab.writeCount).toBe(1);
  expect(firestore.documents.get('special_ability_judgments/CUSTOMER123').status).toBe('confirmed');
  const blockedRestart = await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  });
  expect(blockedRestart.status).toBe(409);
  expect(blockedRestart.body.code).toBe('already_completed');
});

test('PlayFab remains authoritative when Firestore lock data is missing or inconsistent', async () => {
  const firestore = createFirestore();
  const playFab = createPlayFab();
  const actualAbility = catalog.abilities[0];
  const oldAbility = catalog.abilities[1];
  playFab.values.set('CUSTOMER123', JSON.stringify({
    version: ASSESSMENT_VERSION,
    abilityId: actualAbility.id,
    name: actualAbility.name,
    effect: actualAbility.effect,
    assignedAt: '2026-07-15T00:00:00.000Z'
  }));
  firestore.documents.set('special_ability_judgments/CUSTOMER123', {
    status: 'confirmed',
    abilityId: oldAbility.id,
    name: oldAbility.name,
    effect: oldAbility.effect
  });
  firestore.documents.set(ASSIGNMENT_STATE_PATH, {
    counts: { [oldAbility.id]: 1, [actualAbility.id]: 0 }
  });
  const invoke = createRouteHarness({ firestore, ...playFab }, {
    enabled: true,
    signingSecret: 'playfab-authority-secret',
    now: () => 5_000_000
  });

  const status = await invoke('POST', '/api/special-ability/status', {
    customerRef: 'TROY:CUSTOMER123'
  });
  expect(status.status).toBe(200);
  expect(status.body.ability).toEqual({ name: actualAbility.name, effect: actualAbility.effect });
  expect(firestore.documents.get('special_ability_judgments/CUSTOMER123').abilityId).toBe(actualAbility.id);
  const counts = firestore.documents.get(ASSIGNMENT_STATE_PATH).counts;
  expect(counts[oldAbility.id]).toBe(0);
  expect(counts[actualAbility.id]).toBe(1);

  playFab.values.delete('CUSTOMER123');
  const restarted = await invoke('POST', '/api/special-ability/start', {
    customerRef: 'TROY:CUSTOMER123'
  });
  expect(restarted.status).toBe(200);
  expect(firestore.documents.has('special_ability_judgments/CUSTOMER123')).toBe(false);
  expect(firestore.documents.get(ASSIGNMENT_STATE_PATH).counts[actualAbility.id]).toBe(0);
});

test('store ability UI loads all 48 original images and reveals only name and effect', async ({ page }) => {
  await page.route('**/api/tarot-reading/customers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      success: true,
      isOpen: true,
      customers: [{ customerRef: 'TROY:NO_LINE', displayName: 'ボブ', joinedAtMs: 1, lineLinked: false }]
    })
  }));
  await page.route('**/api/special-ability/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      success: true,
      enabled: true,
      totalRounds: TOTAL_ROUNDS,
      assetVersion: ASSESSMENT_VERSION,
      terminalSession: 'browser-terminal-session'
    })
  }));
  await page.route('**/api/special-ability/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, state: 'available', ability: null })
  }));
  await page.route('**/api/special-ability/start', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, state: 'in_progress', token: 'token-0', question: browserQuestion(0) })
  }));
  let answerIndex = 0;
  await page.route('**/api/special-ability/answer', async (route) => {
    answerIndex += 1;
    const response = answerIndex < TOTAL_ROUNDS
      ? { success: true, state: 'in_progress', token: `token-${answerIndex}`, question: browserQuestion(answerIndex) }
      : { success: true, state: 'completed', ability: { name: '星渡りの門', effect: '離れた場所を光の通路で結び、仲間や物を安全に移動させられる。' } };
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(response) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tarot-reading.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#readingModeSwitch')).toBeVisible();
  const imageInspection = await page.evaluate(async (totalRounds) => {
    const urls = Array.from({ length: totalRounds }, (_, roundIndex) => (
      ['a', 'b', 'c', 'd'].map((letter) => `/assets/special-ability/r${String(roundIndex + 1).padStart(2, '0')}-${letter}.webp`)
    )).flat();
    return Promise.all(urls.map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ src, width: 0, height: 0 });
      image.src = src;
    })));
  }, TOTAL_ROUNDS);
  expect(imageInspection).toHaveLength(48);
  expect(imageInspection.every((image) => image.width === 768 && image.height === 768)).toBe(true);

  await page.locator('[data-reading-mode="ability"]').click();
  await expect(page.locator('#tarotReadingBoard')).toBeHidden();
  await page.locator('#tarotCustomerRef').selectOption('TROY:NO_LINE');
  await expect(page.locator('#specialAbilityStart')).toBeEnabled();
  await page.locator('#specialAbilityStart').click();
  await expect(page.locator('#specialAbilityOptions img')).toHaveCount(4);
  await expect.poll(() => page.locator('#specialAbilityOptions img').evaluateAll((images) => (
    images.every((image) => image.complete && image.naturalWidth > 0)
  ))).toBe(true);
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    await expect(page.locator('#specialAbilityOptions .special-ability-option')).toHaveCount(4);
    await page.locator('#specialAbilityOptions .special-ability-option').first().click();
  }
  await expect(page.locator('#specialAbilityResult')).toBeVisible();
  await expect(page.locator('#specialAbilityName')).toHaveText('星渡りの門');
  await expect(page.locator('#specialAbilityEffect')).toContainText('光の通路');
  await expect(page.locator('#specialAbilityResult')).not.toContainText(/INTJ|特質系|反応速度|採点/);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    resultWidth: document.querySelector('#specialAbilityResult').getBoundingClientRect().width
  }));
  expect(mobile.scroll).toBeLessThanOrEqual(mobile.viewport);
  expect(mobile.resultWidth).toBeGreaterThanOrEqual(350);
});

function browserQuestion(roundIndex) {
  const number = roundIndex + 1;
  const round = `r${String(number).padStart(2, '0')}`;
  return {
    id: round,
    number,
    total: TOTAL_ROUNDS,
    prompt: '直感で一つ選んでください',
    options: ['a', 'b', 'c', 'd'].map((letter, index) => ({
      id: `${round}-${letter}`,
      imageUrl: `/assets/special-ability/${round}-${letter}.webp`,
      alt: `選択肢 ${index + 1}`
    }))
  };
}
