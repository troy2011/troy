const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Tarot Kingdom shares the canonical inventory module with the app shell', () => {
  const kingdomSource = fs.readFileSync(
    path.join(ROOT_DIR, 'public', 'js', 'tarotKingdom.js'),
    'utf8'
  );
  const indexSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
  const previewSource = fs.readFileSync(
    path.join(ROOT_DIR, 'public', 'tarot-kingdom-preview.html'),
    'utf8'
  );

  expect(kingdomSource).toContain("} from 'inventory';");
  expect(kingdomSource).not.toContain("} from './inventory.js';");
  expect(indexSource).toContain('"inventory": "./js/inventory.js?v=20260811-resonance-per-card1"');
  expect(previewSource).toContain('"inventory": "./js/inventory.js?v=20260811-resonance-per-card1"');
});

test('Tarot Kingdom retries a transient Arcana catalog failure before starting', async ({ page }) => {
  let currentCatalogRequests = 0;
  await page.route(/tarot-kingdom-arcana-effects\.json(?:\?|$)/, async (route) => {
    currentCatalogRequests += 1;
    if (currentCatalogRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle&tkrev=arcana-retry1');

  await expect.poll(() => currentCatalogRequests).toBe(2);
  await expect(page.locator('#tarotKingdomRoot')).toBeVisible();
});

test('Tarot Kingdom release advances its entry modules and service-worker cache together', () => {
  const release = '20260812-effect-result-v1';
  const indexSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
  const mainSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'main.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'ui.js'), 'utf8');
  const previewSource = fs.readFileSync(
    path.join(ROOT_DIR, 'public', 'tarot-kingdom-preview.html'),
    'utf8'
  );
  const serviceWorkerSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'sw.js'), 'utf8');

  expect(indexSource).toContain(`"ui": "./js/ui.js?v=${release}"`);
  expect(indexSource).toContain(`src="main.js?v=${release}"`);
  expect(mainSource).toContain(`const TAROT_KINGDOM_RESCUE_VERSION = '${release}';`);
  expect(uiSource).toContain(`const TAROT_KINGDOM_MODULE_VERSION = '${release}';`);
  expect(previewSource).toContain(`./js/tarotKingdom.js?v=${release}`);
  expect(serviceWorkerSource).toContain("const CACHE_VERSION = 'troy-app-v20260812n';");
});

function loadServiceWorkerHarness() {
  const source = fs.readFileSync(path.join(ROOT_DIR, 'public', 'sw.js'), 'utf8');
  const listeners = new Map();
  const state = {
    cacheMatches: [],
    cachePuts: [],
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    indexResponse: null
  };

  class MockResponse {
    constructor(body = '', options = {}) {
      this.body = body;
      this.status = Number(options.status || 200);
      this.statusText = String(options.statusText || '');
      this.headers = options.headers || {};
      this.ok = this.status >= 200 && this.status < 300;
    }

    clone() {
      return new MockResponse(this.body, {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers
      });
    }
  }

  const context = vm.createContext({
    URL,
    Response: MockResponse,
    Promise,
    console,
    setTimeout,
    clearTimeout,
    self: {
      location: { origin: 'https://preview.test' },
      clients: { claim: async () => {} },
      skipWaiting() {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    },
    caches: {
      async open() {
        return {
          async addAll() {},
          async put(request, response) {
            state.cachePuts.push({ request, response });
          }
        };
      },
      async keys() {
        return [];
      },
      async delete() {
        return true;
      },
      async match(request) {
        state.cacheMatches.push(request);
        return request === '/index.html' ? state.indexResponse : null;
      }
    },
    fetch(request) {
      return state.fetchImpl(request);
    }
  });

  vm.runInContext(source, context, { filename: 'sw.js' });

  return {
    MockResponse,
    state,
    async dispatchFetch(request) {
      let responsePromise = null;
      listeners.get('fetch')({
        request,
        respondWith(value) {
          responsePromise = Promise.resolve(value);
        }
      });
      if (!responsePromise) throw new Error('Service worker did not handle the request');
      return responsePromise;
    }
  };
}

test('service worker never turns a failed preview navigation into the app shell', async () => {
  const harness = loadServiceWorkerHarness();
  harness.state.indexResponse = new harness.MockResponse('INDEX');

  const response = await harness.dispatchFetch({
    method: 'GET',
    mode: 'navigate',
    url: 'https://preview.test/tarot-kingdom-preview.html'
  });

  expect(response.status).toBe(503);
  expect(response.body).toContain('ローカルプレビューサーバー');
  expect(harness.state.cacheMatches).not.toContain('/index.html');
});

test('service worker keeps the cached index fallback for app-shell navigation only', async () => {
  const harness = loadServiceWorkerHarness();
  const indexResponse = new harness.MockResponse('INDEX');
  harness.state.indexResponse = indexResponse;

  const response = await harness.dispatchFetch({
    method: 'GET',
    mode: 'navigate',
    url: 'https://preview.test/'
  });

  expect(response).toBe(indexResponse);
  expect(harness.state.cacheMatches).toContain('/index.html');
});

test('service worker caches successful code responses but not failed responses', async () => {
  const harness = loadServiceWorkerHarness();
  harness.state.fetchImpl = async () => new harness.MockResponse('missing', { status: 404 });

  const request = {
    method: 'GET',
    mode: 'cors',
    url: 'https://preview.test/missing.js'
  };
  const missingResponse = await harness.dispatchFetch(request);
  await new Promise((resolve) => setImmediate(resolve));

  expect(missingResponse.status).toBe(404);
  expect(harness.state.cachePuts).toEqual([]);

  harness.state.fetchImpl = async () => new harness.MockResponse('ok', { status: 200 });
  const okResponse = await harness.dispatchFetch({ ...request, url: 'https://preview.test/main.js' });
  await new Promise((resolve) => setImmediate(resolve));

  expect(okResponse.status).toBe(200);
  expect(harness.state.cachePuts).toHaveLength(1);
});

test('main LIFF initialization guard recognizes the preview flag and pathname', () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, 'public', 'main.js'), 'utf8');
  const match = source.match(/function isTarotKingdomPreviewContext\(\) \{[\s\S]*?\n\}/);
  expect(match, 'preview guard function should exist').not.toBeNull();
  expect(source).toMatch(/async function initializeLiff\(\) \{\s*if \(isTarotKingdomPreviewContext\(\)\) return;/);

  const previewByPath = vm.runInNewContext(`(${match[0]})`, {
    window: {
      __TAROT_KINGDOM_PREVIEW__: false,
      location: { pathname: '/tarot-kingdom-preview.html' }
    }
  });
  const previewByFlag = vm.runInNewContext(`(${match[0]})`, {
    window: {
      __TAROT_KINGDOM_PREVIEW__: true,
      location: { pathname: '/' }
    }
  });
  const productionPage = vm.runInNewContext(`(${match[0]})`, {
    window: {
      __TAROT_KINGDOM_PREVIEW__: false,
      location: { pathname: '/' }
    }
  });

  expect(previewByPath()).toBe(true);
  expect(previewByFlag()).toBe(true);
  expect(productionPage()).toBe(false);
});

test('standalone preview starts offline without LIFF or production data writes', async ({ page }) => {
  const blockedRequests = [];
  const sensitiveSockets = [];
  const sensitivePattern = /(?:access\.line\.me|playfabapi\.com|firebaseio\.com|firebasedatabase\.app)/i;
  const guardedApiPattern = /\/api\/(?:login-playfab|tarot-kingdom\/combat-profiles)(?:[/?#]|$)/i;

  await page.addInitScript(() => {
    window.__previewLiffCalls = { init: 0, login: 0, profile: 0 };
    window.liff = {
      init: async () => { window.__previewLiffCalls.init += 1; },
      login: () => { window.__previewLiffCalls.login += 1; },
      isLoggedIn: () => false,
      getProfile: async () => {
        window.__previewLiffCalls.profile += 1;
        return {};
      }
    };
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const isGuardedApi = guardedApiPattern.test(url);
    const isSensitiveRemote = sensitivePattern.test(url);
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    if (isGuardedApi || (isSensitiveRemote && isWrite) || /access\.line\.me/i.test(url)) {
      blockedRequests.push(`${request.method()} ${url}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  page.on('websocket', (socket) => {
    if (sensitivePattern.test(socket.url())) sensitiveSockets.push(socket.url());
  });

  await page.goto('/tarot-kingdom-preview.html', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/Tarot Kingdom Preview/i);
  await page.locator('#tarotKingdomStartOfflineButton').click();
  await page.waitForFunction(() => (
    (document.getElementById('tarotKingdomHand')?.childElementCount || 0) > 0
  ));

  const isolation = await page.evaluate(() => ({
    preview: window.__TAROT_KINGDOM_PREVIEW__ === true,
    liffCalls: window.__previewLiffCalls,
    hasProductionDatabase: !!window.__tkDb,
    pathname: window.location.pathname,
    scriptSources: Array.from(document.scripts, (script) => script.src).filter(Boolean)
  }));

  expect(isolation.preview).toBe(true);
  expect(isolation.pathname).toBe('/tarot-kingdom-preview.html');
  expect(isolation.liffCalls).toEqual({ init: 0, login: 0, profile: 0 });
  expect(isolation.hasProductionDatabase).toBe(false);
  expect(isolation.scriptSources.some((src) => /main\.js(?:[?#]|$)/.test(src))).toBe(false);
  expect(blockedRequests).toEqual([]);
  expect(sensitiveSockets).toEqual([]);
});
