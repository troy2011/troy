const { test, expect } = require('@playwright/test');
const { installBaseAppMocks } = require('./helpers/main-app-harness');

const UID = 'PF_PLAYWRIGHT';
const KEY = `troy:home-display:v1:${UID}`;
const authModule = `
const listeners = new Set();
const makeUser = uid => uid ? { uid, getIdToken: async () => 'test-token' } : null;
const auth = { currentUser: makeUser('PF_PLAYWRIGHT') };
export const getAuth = () => auth;
export function onAuthStateChanged(_auth, callback) {
  listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); });
  return () => listeners.delete(callback);
}
export function setTestUser(uid) { auth.currentUser = makeUser(uid); for (const callback of [...listeners]) callback(auth.currentUser); }
export async function signInWithCustomToken() { setTestUser('PF_PLAYWRIGHT'); return { user: auth.currentUser }; }
`;

function gate() {
    let release;
    return { wait: new Promise(resolve => { release = resolve; }), release: () => release() };
}

test.beforeEach(async ({ context }) => {
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === 'http://127.0.0.1:4187' && !url.pathname.startsWith('/api/') && request.method() === 'GET') return route.continue();
        return route.fulfill({ status: 501, json: { error: 'UnmockedRequestBlocked' } });
    });
});

async function setup(page, { value = 321, raw, uid = UID, storageDisabled = false } = {}) {
    await installBaseAppMocks(page, {});
    await page.route('**/firebase-auth.js', route => route.fulfill({ contentType: 'application/javascript', body: authModule }));
    await page.addInitScript(({ uid, raw, value, storageDisabled }) => {
        if (storageDisabled) {
            Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw Error('disabled'); } });
        } else if (raw !== null) {
            localStorage.setItem(`troy:home-display:v1:${uid}`, raw === undefined
                ? JSON.stringify({ version: 1, uid, savedAt: Date.now(), points: value }) : raw);
        }
    }, { uid, raw, value, storageDisabled });
}

test('cached balance appears only after matching authentication and fresh data replaces it', async ({ page }) => {
    await setup(page);
    const login = gate(), inventory = gate();
    await page.route('**/api/login-playfab', async route => { await login.wait; await route.fallback(); });
    await page.route('**/api/get-inventory', async route => { await inventory.wait; await route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } }); });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#appWrapper')).toBeHidden();
    await expect(page.locator('#currentPoints')).toHaveText(/^[?—]$/);
    login.release();
    await expect(page.locator('#appWrapper')).toBeVisible();
    await expect(page.locator('#currentPoints')).toHaveText('321');
    await expect(page.locator('#homePointsStatus')).toBeVisible();
    if (process.env.STARTUP_EVIDENCE) await page.screenshot({ path: process.env.STARTUP_EVIDENCE, mask: [page.locator('#myQrCanvas')] });
    expect(await page.evaluate(() => window.__tkUid)).toBe(UID);
    inventory.release();
    await expect(page.locator('#currentPoints')).toHaveText('432');
    await expect(page.locator('#homePointsStatus')).toBeHidden();
    const cached = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(cached.points).toBe(432);
    expect(Object.keys(cached).sort()).toEqual(['points', 'savedAt', 'uid', 'version']);
});

for (const scenario of ['first', 'corrupt', 'expired', 'other-user', 'storage-disabled']) {
    test(`${scenario} safely waits for fresh balance`, async ({ page }) => {
        const options = scenario === 'first' ? { raw: null }
            : scenario === 'corrupt' ? { raw: '{bad' }
                : scenario === 'expired' ? { raw: JSON.stringify({ version: 1, uid: UID, savedAt: Date.now() - 86400001, points: 321 }) }
                    : scenario === 'other-user' ? { uid: 'SOMEONE_ELSE' } : { storageDisabled: true };
        await setup(page, options);
        const inventory = gate();
        await page.route('**/api/get-inventory', async route => { await inventory.wait; await route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } }); });
        await page.goto('/');
        await expect(page.locator('#appWrapper')).toBeVisible();
        await expect(page.locator('#currentPoints')).toHaveText(/^[?—]$/);
        inventory.release();
        await expect(page.locator('#currentPoints')).toHaveText('432');
    });
}

for (const nextUid of [null, 'ANOTHER_USER', UID]) {
    test(`session transition ${nextUid} cannot restore old data`, async ({ page }) => {
        await setup(page);
        const inventory = gate();
        await page.route('**/api/get-inventory', async route => { await inventory.wait; await route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } }); });
        await page.goto('/');
        await expect(page.locator('#currentPoints')).toHaveText('321');
        await page.evaluate(async uid => { const auth = await import('firebase/auth'); auth.setTestUser(null); if (uid) auth.setTestUser(uid); }, nextUid);
        await expect(page.locator('#appWrapper')).toBeHidden();
        expect(await page.locator('#currentPoints').textContent()).toBe('?');
        expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
        inventory.release();
        await page.waitForTimeout(300);
        expect(await page.locator('#currentPoints').textContent()).toBe('?');
        expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
    });
}

for (const status of [401, 403]) {
    test(`inventory authentication failure ${status} clears the displayed hint`, async ({ page }) => {
        await setup(page);
        const inventory = gate();
        await page.route('**/api/get-inventory', async route => { await inventory.wait; await route.fulfill({ status, json: { error: 'AuthFailure' } }); });
        await page.goto('/');
        await expect(page.locator('#currentPoints')).toHaveText('321');
        inventory.release();
        await expect(page.locator('#appWrapper')).toBeHidden();
        await expect(page.locator('#profileSessionNotice')).toBeVisible();
        expect(await page.locator('#currentPoints').textContent()).toBe('?');
        expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
    });
}

test('an old startup inventory read cannot overwrite a newer confirmed balance', async ({ page }) => {
    await setup(page);
    const first = gate(); let requests = 0;
    await page.route('**/api/get-inventory', async route => {
        requests += 1;
        if (requests === 1) { await first.wait; return route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } }); }
        return route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 999 } } });
    });
    await page.goto('/');
    await expect(page.locator('#currentPoints')).toHaveText('321');
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(uid => { const session = window.capturePlayerSession(uid); window.syncAuthenticatedPoints(uid, 999, session); }, UID);
    const concurrent = await page.evaluate(async uid => { const player = await import('player'); return player.getPoints(uid, { isSilent: true }); }, UID);
    expect(concurrent).toBeNull();
    expect(requests).toBe(1);
    first.release();
    await expect(page.locator('#homePointsStatus')).toHaveText('要再読込');
    await page.waitForTimeout(250);
    expect(requests).toBe(1);
    await expect(page.locator('#currentPoints')).toHaveText('999');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).points, KEY)).toBe(999);
});

test('failed balance refresh preserves the hint, and an empty currency map means zero', async ({ page }) => {
    await setup(page);
    const inventory = gate();
    await page.route('**/api/get-inventory', async route => { await inventory.wait; await route.fulfill({ status: 503, json: { error: 'Unavailable' } }); });
    await page.goto('/');
    await expect(page.locator('#currentPoints')).toHaveText('321');
    inventory.release();
    await page.waitForTimeout(250);
    const result = await page.evaluate(async uid => { const player = await import('player'); return player.getPoints(uid, { isSilent: true }); }, UID);
    expect(result).toBeNull();
    await expect(page.locator('#currentPoints')).toHaveText('321');
    await expect(page.locator('#homePointsStatus')).toBeVisible();
    await page.unroute('**/api/get-inventory');
    await page.route('**/api/get-inventory', route => route.fulfill({ json: { inventory: [], virtualCurrency: {} } }));
    await page.evaluate(async uid => { const player = await import('player'); await player.getPoints(uid, { isSilent: true }); }, UID);
    await expect(page.locator('#currentPoints')).toHaveText('0');
});

test('logout during an uncertain fortune draw clears the overlay but preserves the pending guard', async ({ page }) => {
    await setup(page);
    const draw = gate(); let requests = 0;
    await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: { canDraw: true } }));
    await page.route('**/api/tarot-fortune-draw', async route => {
        requests += 1;
        await draw.wait;
        await route.fulfill({ json: { result: { cardNumber: 3, suit: 'Swords', isArcana: false, cardName: 'fixture', orientation: 'upright' }, balance: 432 } });
    });
    await page.goto('/');
    await expect(page.locator('#appWrapper')).toBeVisible();
    await page.locator('#btnDailyFortune').click();
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(async () => { const auth = await import('firebase/auth'); auth.setTestUser(null); });
    await expect(page.locator('#dailyTarotFortuneOverlay')).toHaveCount(0);
    const pendingKey = `troy:fortune-pending:${UID}`;
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBe('1');
    draw.release();
    await page.waitForTimeout(300);
    await expect(page.locator('#dailyTarotFortuneOverlay')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBe('1');
    expect(requests).toBe(1);
});

test('a late balance response is discarded without automatically resending a request', async ({ page }) => {
    await setup(page);
    let requests = 0;
    await page.route('**/api/get-inventory', route => {
        requests += 1;
        return requests === 1
            ? route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } })
            : route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    });
    await page.goto('/');
    await expect(page.locator('#currentPoints')).toHaveText('432');
    await page.evaluate(uid => {
        const session = window.capturePlayerSession(uid);
        window.syncAuthenticatedPoints(uid, 999, session);
        window.syncAuthenticatedPoints(uid, 111, session);
    }, UID);
    await expect(page.locator('#homePointsStatus')).toHaveText('要再読込');
    await page.waitForTimeout(250);
    expect(requests).toBe(1);
    await expect(page.locator('#currentPoints')).toHaveText('999');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).points, KEY)).toBe(999);
});
