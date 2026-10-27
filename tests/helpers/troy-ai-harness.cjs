const fs = require('node:fs/promises');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { installBaseAppMocks } = require('./main-app-harness');
const { AI_ORIGIN, assertAiTestEnvironment, installTroyDebugBridge } = require('./troy-debug-bridge.cjs');

const CORE_APIS = ['/api/login-playfab', '/api/player-bootstrap'];
const LIMIT = 40;

// Only source-code literals can enter reports, never arbitrary request URL text.
async function getKnownApiPaths() {
  const files = ['public/main.js'];
  for (const entry of await fs.readdir('public/js', { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(entry.parentPath || entry.path, entry.name));
    }
  }
  const paths = new Set(CORE_APIS);
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/['"](\/api\/[a-zA-Z0-9/_-]+)['"]/g)) paths.add(match[1]);
  }
  return paths;
}

function checkApiContract(endpoint, status, data) {
  if (status >= 400) return typeof data?.error === 'string' ? 'error' : 'invalid-error-format';
  if (!data || typeof data !== 'object' || data.success === false || data.error) return 'invalid-success';
  if (endpoint === '/api/login-playfab') {
    return typeof data.playFabId === 'string' && data.playFabId.length > 0
      && typeof data.needsRaceSelection === 'boolean' && typeof data.firebaseToken === 'string'
      && data.firebaseToken.length > 0 ? 'valid' : 'invalid-login-fields';
  }
  if (endpoint === '/api/player-bootstrap') {
    return data.playFabId === 'PF_PLAYWRIGHT' && typeof data.playerData?.Race === 'string'
      && typeof data.playerData?.Nation === 'string' ? 'valid' : 'invalid-bootstrap-fields';
  }
  return 'not-checked';
}

async function createTroyAiSession(page, origin = AI_ORIGIN, { injectBridge = true } = {}) {
  assertAiTestEnvironment(origin);
  const knownPaths = await getKnownApiPaths();
  const requests = new Map();
  const coreRequests = new Map();
  const records = [];
  const errors = [];
  const checks = new Set();
  let totalErrors = 0;
  let totalRequests = 0;
  let blockedRequests = 0;
  let apiFailures = 0;
  const addError = (kind) => {
    totalErrors += 1;
    if (errors.length < LIMIT) errors.push({ kind, message: 'Raw message omitted (may contain credentials).' });
  };
  page.on('console', (message) => { if (message.type() === 'error') addError('console.error'); });
  // Chromium reports both uncaught exceptions and unhandled promise rejections here.
  page.on('pageerror', () => addError('uncaught-or-unhandled-rejection'));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    const endpoint = knownPaths.has(url.pathname) ? url.pathname : '/api/[unrecognized]';
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method())
      ? request.method() : 'OTHER';
    const coreApi = CORE_APIS.includes(endpoint);
    const fixtureAuth = endpoint === '/api/player-bootstrap'
      ? request.headers().authorization === 'Bearer playwright-firebase-id-token'
      : null;
    const record = {
      endpoint, method, status: null, contract: 'pending', startedAt: Date.now(),
      requestContract: coreApi && (method !== 'POST' || url.origin !== origin || fixtureAuth === false)
        ? 'invalid-method-origin-or-fixture-auth' : 'not-rejected',
      fixtureAuth
    };
    if (record.requestContract.startsWith('invalid')) apiFailures += 1;
    if (coreApi) coreRequests.set(endpoint, record);
    totalRequests += 1;
    requests.set(request, record);
    records.push(record);
    if (records.length > LIMIT) records.shift();
  });
  page.on('response', (response) => {
    const record = requests.get(response.request());
    if (!record) return;
    record.status = response.status();
    const check = (async () => {
      if (CORE_APIS.includes(record.endpoint)) {
        try { record.contract = checkApiContract(record.endpoint, record.status, await response.json()); }
        catch { record.contract = 'invalid-json'; }
      } else record.contract = 'not-checked';
      if (record.status >= 400 || record.contract.startsWith('invalid')) apiFailures += 1;
    })();
    checks.add(check);
    void check.finally(() => checks.delete(check));
  });
  page.on('requestfinished', (request) => requests.delete(request));
  page.on('requestfailed', (request) => {
    const record = requests.get(request);
    if (record) record.contract = 'request-failed';
    requests.delete(request);
    addError('request-failed');
  });
  const safeRecord = ({ startedAt, ...record }) => ({ ...record });
  const readNetwork = () => ({
    inFlight: requests.size,
    pendingContracts: checks.size,
    totalRequests,
    blockedRequests,
    totalErrors,
    apiFailures,
    errors: errors.map((error) => ({ ...error })),
    requests: records.map(safeRecord),
    // Keep the two latest auth outcomes when the bounded request log rolls over.
    coreApis: [...coreRequests.values()].map(safeRecord),
    // Diagnostic threshold, not proof of duplicated business operations.
    bursts: [...new Set(records.filter((record) => records.filter((other) => (
      other.endpoint === record.endpoint && Math.abs(other.startedAt - record.startedAt) < 1000
    )).length > 3).map((record) => record.endpoint))]
  });

  const context = page.context();
  await context.routeWebSocket('**/*', (socket) => {
    blockedRequests += 1;
    socket.close();
  });
  // Page-level, exact SDK/API fixtures installed below take precedence. No fallback
  // to remote services or a local Express server is permitted for unknown APIs.
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/') && request.method() === 'GET') {
      await route.continue();
      return;
    }
    blockedRequests += 1;
    await route.fulfill({ status: 501, contentType: 'application/json', body: '{"error":"UnmockedRequestBlocked"}' });
  });
  await installBaseAppMocks(page, {}, { mockGame: true, fixedHour: 12 });
  // Font service is not part of the startup contract. Use system font offline.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/css', body: ''
  }));
  if (injectBridge) await installTroyDebugBridge(page, origin, readNetwork);
  return { readNetwork, origin };
}

async function getTroyDebugState(page) {
  return page.evaluate(() => window.__TROY_DEBUG__?.getState() || null);
}

async function waitForTroyReady(page, session) {
  await expect.poll(async () => (await getTroyDebugState(page))?.appReady, { message: 'Home + matching fixture auth ready' }).toBe(true);
  await expect.poll(() => session.readNetwork().pendingContracts).toBe(0);
  for (const endpoint of CORE_APIS) {
    await expect.poll(() => session.readNetwork().coreApis.some((record) => (
      record.endpoint === endpoint && record.status === 200 && record.contract === 'valid'
        && !record.requestContract.startsWith('invalid')
    )), { message: `${endpoint}: valid completed response` }).toBe(true);
  }
  await expect.poll(async () => (await getTroyDebugState(page))?.loading).toBe(false);
}

async function assertTroyHealthy(session) {
  // This is API-idle at a checkpoint, not universal networkidle (RTDB can stay open).
  await expect.poll(() => session.readNetwork().inFlight).toBe(0);
  await expect.poll(() => session.readNetwork().pendingContracts).toBe(0);
  const network = session.readNetwork();
  expect(network.blockedRequests, 'Unknown/unmocked network request').toBe(0);
  expect(network.totalErrors, 'Browser error; inspect safe report').toBe(0);
  expect(network.apiFailures, 'Failed API (including records outside the bounded log)').toBe(0);
  expect(network.requests.filter((record) => record.status === null || record.status >= 400
    || record.contract.startsWith('invalid')), 'Unsuccessful API response').toEqual([]);
  expect(network.bursts, 'More than 3 same-API requests within one second').toEqual([]);
}

async function writeTroyReport(page, session, testInfo, { outcome, expected, step }) {
  const screenshot = testInfo.outputPath(`${outcome}.png`);
  const captureIssues = [];
  let actual = null;
  let screenshotName = null;
  // A crashed/closed page should still leave a useful report, not hide the
  // original failure behind a screenshot exception (which may contain raw URLs).
  try {
    await page.screenshot({ path: screenshot, fullPage: false, mask: [page.locator('#globalPlayerName'), page.locator('#myQrCanvas')] });
    screenshotName = path.basename(screenshot);
  } catch { captureIssues.push('screenshot-unavailable'); }
  try { actual = await getTroyDebugState(page); }
  catch { captureIssues.push('debug-state-unavailable'); }
  const report = {
    scenario: 'home-ready', outcome, step, expected,
    actual,
    network: session.readNetwork(),
    sourceHints: ['public/main.js:initializeLiff', 'public/main.js:updateAvatarBaseInfo', 'public/js/api.js:callPointApi'],
    screenshot: screenshotName,
    captureIssues
  };
  const reportPath = testInfo.outputPath(`${outcome}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  await testInfo.attach(outcome, { path: reportPath, contentType: 'application/json' });
  return report;
}

module.exports = {
  createTroyAiSession, getTroyDebugState, waitForTroyReady, assertTroyHealthy,
  checkApiContract, writeTroyReport
};
