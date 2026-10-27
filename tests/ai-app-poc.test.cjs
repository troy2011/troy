const { test, expect } = require('@playwright/test');
const http = require('node:http');
const { AI_ORIGIN, assertAiTestEnvironment } = require('./helpers/troy-debug-bridge.cjs');
const {
  createTroyAiSession, getTroyDebugState, waitForTroyReady, assertTroyHealthy,
  checkApiContract, writeTroyReport
} = require('./helpers/troy-ai-harness.cjs');
const { homeReady, applyHomeScenario } = require('./fixtures/troy-ai-scenarios.cjs');

test('home-ready: real client, read-only state, safe network and mobile screenshot', async ({ page }, testInfo) => {
  const session = await createTroyAiSession(page);
  await applyHomeScenario(page);
  try {
    await page.goto('/');
    await waitForTroyReady(page, session);
    await page.locator('#navHome').click();
    await expect.poll(async () => (await getTroyDebugState(page))?.currentScreen).toBe('home');
    await expect.poll(async () => (await getTroyDebugState(page))?.displayedGold).toBe(250);
    await assertTroyHealthy(session);
    await writeTroyReport(page, session, testInfo, { outcome: 'passed', step: homeReady.operation, expected: homeReady.expected });
    await assertTroyHealthy(session);
  } catch (error) {
    await writeTroyReport(page, session, testInfo, { outcome: 'failed', step: homeReady.operation, expected: homeReady.expected });
    throw error;
  }
});

test('home-ready: detect broken bootstrap, then rerun unchanged scenario with repaired fixture', async ({ page, context }, testInfo) => {
  const broken = await createTroyAiSession(page);
  await applyHomeScenario(page, { brokenBootstrap: true });
  await page.goto('/');
  await expect.poll(() => broken.readNetwork().requests.some((record) => record.endpoint === '/api/player-bootstrap' && record.status === 503)).toBe(true);
  await expect.poll(() => broken.readNetwork().totalErrors).toBeGreaterThan(0);
  const failure = await writeTroyReport(page, broken, testInfo, {
    outcome: 'expected-failure', step: 'Receive player bootstrap', expected: '200 valid self profile (fixture deliberately returns 503)'
  });
  expect(failure.network.requests.some((record) => record.status === 503)).toBe(true);
  expect(failure.actual.appReady).toBe(false);
  await expect(assertTroyHealthy(broken)).rejects.toThrow();
  // Fresh page discards globals/session module state; fixture repair is NOT an app fix.
  await page.close();
  const repairedPage = await context.newPage();
  const repaired = await createTroyAiSession(repairedPage);
  await applyHomeScenario(repairedPage);
  await repairedPage.goto('/');
  try {
    await waitForTroyReady(repairedPage, repaired);
    await repairedPage.locator('#navHome').click();
    await expect.poll(async () => (await getTroyDebugState(repairedPage))?.displayedGold).toBe(250);
    await assertTroyHealthy(repaired);
    await writeTroyReport(repairedPage, repaired, testInfo, { outcome: 'repaired', step: homeReady.operation, expected: homeReady.expected });
    await assertTroyHealthy(repaired);
  } catch (error) {
    await writeTroyReport(repairedPage, repaired, testInfo, { outcome: 'failed', step: homeReady.operation, expected: homeReady.expected });
    throw error;
  }
});

test('guard and lightweight API contracts reject unsafe environments and malformed 200s', () => {
  expect(() => assertAiTestEnvironment(AI_ORIGIN, { NODE_ENV: 'production', TROY_AI_TEST: '1' })).toThrow();
  expect(() => assertAiTestEnvironment(AI_ORIGIN, { NODE_ENV: 'test' })).toThrow();
  expect(() => assertAiTestEnvironment('https://example.com', { NODE_ENV: 'test', TROY_AI_TEST: '1' })).toThrow();
  expect(checkApiContract('/api/login-playfab', 200, {})).toBe('invalid-login-fields');
  expect(checkApiContract('/api/player-bootstrap', 200, { success: false })).toBe('invalid-success');
  expect(checkApiContract('/api/player-bootstrap', 403, { error: 'Forbidden' })).toBe('error');
  expect(checkApiContract('/api/player-bootstrap', 500, {})).toBe('invalid-error-format');
});

test('read-only snapshot excludes secrets; console, exception, rejection and outbound requests are detected', async ({ page }) => {
  const session = await createTroyAiSession(page);
  await page.route('**/__ai_empty', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated bridge probe</title>' }));
  await page.goto('/__ai_empty');
  await page.evaluate(() => {
    window.myPlayFabId = 'DO_NOT_EXPORT_ID';
    window.myLineProfile = { displayName: 'DO_NOT_EXPORT_NAME', accessToken: 'DO_NOT_EXPORT_SECRET' };
    window.__firebaseAuth = { currentUser: { uid: 'DO_NOT_EXPORT_ID', getIdToken: () => 'DO_NOT_EXPORT_SECRET' } };
    window.__tkUid = 'DO_NOT_EXPORT_ID';
    console.error('DO_NOT_EXPORT_SECRET');
    setTimeout(() => { throw new Error('DO_NOT_EXPORT_SECRET'); }, 0);
    void Promise.reject(new Error('DO_NOT_EXPORT_SECRET'));
  });
  await expect.poll(() => session.readNetwork().totalErrors).toBeGreaterThanOrEqual(3);
  await page.evaluate(async () => { await fetch('https://example.com/api/DO_NOT_EXPORT_SECRET?token=DO_NOT_EXPORT_SECRET').catch(() => {}); });
  await expect.poll(() => session.readNetwork().blockedRequests).toBeGreaterThan(0);
  const snapshot = await getTroyDebugState(page);
  const serialized = JSON.stringify({ snapshot, network: session.readNetwork() });
  expect(serialized).not.toContain('DO_NOT_EXPORT');
  expect(JSON.stringify(await page.evaluate(() => window.__TROY_DEBUG__.getNetworkSummary()))).not.toContain('DO_NOT_EXPORT');
  expect(await page.evaluate(() => Object.keys(window.__TROY_DEBUG__).sort())).toEqual([
    'getAuthState', 'getGameState', 'getNetworkSummary', 'getState'
  ]);
  expect(await page.evaluate(async () => {
    const first = await window.__TROY_DEBUG__.getState();
    first.auth.uidMatches = false;
    return Object.isFrozen(first.auth) && (await window.__TROY_DEBUG__.getState()).auth.uidMatches;
  })).toBe(true);
});

test('HTTP failures, malformed 200, missing fixture auth and bursts cannot pass a checkpoint', async ({ page }) => {
  const session = await createTroyAiSession(page);
  await page.route('**/__ai_empty', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Network probe</title>' }));
  await page.goto('/__ai_empty');
  for (const status of [401, 403, 404, 429, 500]) {
    await page.route('**/api/player-bootstrap', (route) => route.fulfill({ status, json: { error: 'FixtureFailure' } }));
    await page.evaluate(() => fetch('/api/player-bootstrap', { method: 'POST' }).then((response) => response.text()));
    await expect.poll(() => session.readNetwork().requests.some((record) => record.status === status && record.contract === 'error')).toBe(true);
  }
  await page.route('**/api/player-bootstrap', (route) => route.fulfill({ status: 200, json: {} }));
  await page.evaluate(() => fetch('/api/player-bootstrap', { method: 'POST' }).then((response) => response.text()));
  await expect.poll(() => session.readNetwork().requests.some((record) => record.contract === 'invalid-bootstrap-fields')).toBe(true);
  expect(session.readNetwork().requests.some((record) => record.fixtureAuth === false)).toBe(true);
  await page.evaluate(() => Promise.all(Array.from({ length: 5 }, () => fetch('/api/get-stats', { method: 'POST' }))));
  expect(session.readNetwork().bursts).toContain('/api/get-stats');
  await expect(assertTroyHealthy(session)).rejects.toThrow();
  const failedCount = session.readNetwork().apiFailures;
  await page.route('**/api/get-stats', (route) => route.fulfill({ json: { stats: {} } }));
  await page.evaluate(() => Promise.all(Array.from({ length: 45 }, () => fetch('/api/get-stats', { method: 'POST' }).then((response) => response.text()))));
  expect(session.readNetwork().requests).toHaveLength(40);
  expect(session.readNetwork().apiFailures).toBe(failedCount);
  expect(session.readNetwork().coreApis.some((record) => record.contract === 'invalid-bootstrap-fields')).toBe(true);
});

test('ordinary public page has no debug bridge without runner injection', async ({ page }) => {
  await createTroyAiSession(page, AI_ORIGIN, { injectBridge: false });
  await applyHomeScenario(page);
  await page.goto('/');
  await expect(page.locator('#appWrapper')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__TROY_DEBUG__)).toBe('undefined');
});

test('network boundary never forwards HTTP or WebSocket to a separate local backend', async ({ page }) => {
  let received = 0;
  const trap = http.createServer((_request, response) => { received += 1; response.end('unexpected'); });
  trap.on('upgrade', (_request, socket) => { received += 1; socket.destroy(); });
  await new Promise((resolve) => trap.listen(0, '127.0.0.1', resolve));
  try {
    const port = trap.address().port;
    const session = await createTroyAiSession(page);
    await page.route('**/__ai_empty', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Boundary probe</title>' }));
    await page.goto('/__ai_empty');
    await page.evaluate(async (backendPort) => {
      await fetch(`http://127.0.0.1:${backendPort}/mutation`, { method: 'POST' }).catch(() => {});
      await new Promise((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.1:${backendPort}/stream`);
        socket.onclose = resolve;
        socket.onerror = resolve;
      });
    }, port);
    expect(session.readNetwork().blockedRequests).toBeGreaterThanOrEqual(2);
    expect(received).toBe(0);
  } finally {
    await new Promise((resolve) => trap.close(resolve));
  }
});

test('a closed browser page still produces a bounded failure report', async ({ page }, testInfo) => {
  const session = await createTroyAiSession(page);
  await page.close();
  const report = await writeTroyReport(page, session, testInfo, {
    outcome: 'expected-failure', step: 'Closed page probe', expected: 'Report survives unavailable page'
  });
  expect(report.actual).toBeNull();
  expect(report.screenshot).toBeNull();
  expect(report.captureIssues).toEqual(['screenshot-unavailable', 'debug-state-unavailable']);
});
