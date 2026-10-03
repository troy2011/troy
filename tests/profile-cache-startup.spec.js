const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { installBaseAppMocks, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

const UID = 'PF_PLAYWRIGHT';
const PREFIX = 'troy:profile-bootstrap:v1:';
const fresh = { Race: 'human', Nation: 'fire', SkinColorIndex: '1', FaceIndex: '1', HairStyleIndex: '1', HairColorIndex: '1', FacialHairStyleIndex: '0' };
const previous = { ...fresh, Race: 'elf', Nation: 'wind', SkinColorIndex: '2' };
const authModule = `
const listeners = new Set();
const makeUser = (uid) => uid ? { uid, getIdToken: async () => 'playwright-firebase-id-token' } : null;
const auth = { currentUser: makeUser('PF_PLAYWRIGHT') };
export const getAuth = () => auth;
export function onAuthStateChanged(_auth, callback) {
 listeners.add(callback);
 queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); });
 return () => listeners.delete(callback);
}
export function setTestUser(uid) {
 auth.currentUser = makeUser(uid);
 for (const callback of [...listeners]) callback(auth.currentUser);
}
export async function signInWithCustomToken() {
 setTestUser('PF_PLAYWRIGHT');
 return { user: auth.currentUser };
}
`;

function gate() {
    let release;
    return { wait: new Promise((resolve) => { release = resolve; }), release: () => release() };
}

// Every API and external SDK is intercepted. Only local static GETs reach the fixture server.
test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') {
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        }
        if (url.pathname.startsWith('/api/')) {
            return route.fulfill({ json: {} });
        }
        if (route.request().method() !== 'GET') return route.abort();
        return route.continue();
    });
    if (typeof page.routeWebSocket === 'function') {
        await page.routeWebSocket('**/*', (socket) => socket.close());
    }
});

async function setup(page, { cachedUid = UID, rawCache, storageDisabled = false, needsRaceSelection = false, firebaseToken, initialUid = UID } = {}) {
    const state = {};
    await installBaseAppMocks(page, state, { needsRaceSelection, firebaseToken });
    await page.route('**/firebase-auth.js', (route) => route.fulfill({ contentType: 'application/javascript', body: authModule.replaceAll("'PF_PLAYWRIGHT'", JSON.stringify(initialUid)) }));
    await page.addInitScript(({ uid, raw, disabled, prefix }) => {
        if (disabled) {
            Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage disabled for test'); } });
        } else if (raw !== null) {
            localStorage.setItem(prefix + uid, raw);
        }
    }, { uid: cachedUid, raw: rawCache === undefined ? JSON.stringify({ version: 1, uid: cachedUid, savedAt: Date.now(), playerData: previous }) : rawCache, disabled: storageDisabled, prefix: PREFIX });
    return state;
}

async function waitForShell(page) {
    await expect(page.locator('#appWrapper')).toBeVisible();
    await expect(page.locator('#bottomNav')).toBeVisible();
    await expect(page.locator('#bottomNav')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#bootSplash')).toBeHidden();
    await expect(page.locator('#loadingSpinner')).toBeHidden();
}

test('cached home and navigation appear before slow server reads; fresh server values replace them', async ({ page }) => {
    const errors = trackPageErrors(page);
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await setup(page);
    const bootstrap = gate();
    const inventory = gate();
    const stats = gate();
    await page.route('**/api/player-bootstrap', async (route) => {
        await bootstrap.wait;
        await route.fulfill({ json: { playFabId: UID, playerData: { ...fresh, PS: 888, token: 'fake-not-for-cache' } } });
    });
    await page.route('**/api/get-inventory', async (route) => {
        await inventory.wait;
        await route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432, RR: 7 }, contribution: 15 } });
    });
    await page.route('**/api/get-stats', async (route) => {
        await stats.wait;
        await route.fulfill({ json: { stats: { Level: 4, ちから: 5, みのまもり: 4, すばやさ: 3, かしこさ: 2, たいりょく: 1, HP: 80, MaxHP: 80 } } });
    });
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#homeProfileStatus')).toHaveText('前回のプロフィールを表示中・更新しています');
    await expect.poll(() => page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('elf');
    await expect(page.locator('#currentPoints')).toHaveText('—');
    await expect(page.locator('#homeStatStr')).toHaveText('—');
    await expect(page.locator('#btnRandomHaircut')).toBeDisabled();
    const evidence = process.env.PROFILE_QA_ARTIFACTS;
    if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, 'desktop-cached-loading.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('#homeProfileStatus')).toBeInViewport();
        const messageTop = await page.locator('#homeProfileStatus').boundingBox();
        const headerBottom = await page.locator('#globalStatusBar').boundingBox();
        expect(messageTop.y + 20).toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height);
        await page.screenshot({ path: path.join(evidence, 'mobile-cached-loading.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('#navInventory').click();
    await expect(page.locator('#tabContentInventory')).toBeVisible();
    bootstrap.release();
    inventory.release();
    stats.release();
    await expect(page.locator('#homeProfileStatus')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('human');
    await expect(page.locator('#currentPoints')).toHaveText('432');
    await expect(page.locator('#homeStatStr')).toHaveText('5');
    await expect(page.locator('body')).toHaveAttribute('data-current-tab', 'inventory');
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PREFIX + UID);
    expect(saved.playerData).toEqual(fresh);
    expect(Object.keys(saved).sort()).toEqual(['playerData', 'savedAt', 'uid', 'version']);
    await page.locator('#navHome').click();
    await expect(page.locator('#tabContentHome')).toBeVisible();
    if (evidence) await page.screenshot({ path: path.join(evidence, 'mobile-fresh-home.png'), fullPage: true });
    await expectNoPageErrors(errors);
    expect(consoleErrors).toEqual([]);
});

test('failed refresh retains the previous appearance with an explicit previous-value label', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page);
    await page.route('**/api/player-bootstrap', (route) => route.fulfill({ status: 503, json: { error: 'FixtureUnavailable' } }));
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#homeProfileStatus')).toHaveText('更新できませんでした。前回のプロフィールを表示しています');
    expect(await page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('elf');
    await expect(page.locator('#btnRandomHaircut')).toBeDisabled();
    await expectNoPageErrors(errors);
});

test('a failed first refresh leaves the shell available with a retry instruction', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page, { rawCache: null });
    await page.route('**/api/player-bootstrap', (route) => route.fulfill({ status: 503, json: { error: 'FixtureUnavailable' } }));
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#homeProfileStatus')).toHaveText('プロフィールを取得できませんでした。再読み込みしてください');
    expect(await page.evaluate((key) => localStorage.getItem(key), PREFIX + UID)).toBeNull();
    await expectNoPageErrors(errors);
});

for (const scenario of ['first-login', 'corrupt-cache', 'other-uid', 'storage-disabled']) {
    test(`${scenario} starts without a cached profile and falls back to the server`, async ({ page }) => {
        const errors = trackPageErrors(page);
        const options = scenario === 'other-uid' ? { cachedUid: 'FAKE_OTHER_USER' }
            : scenario === 'corrupt-cache' ? { rawCache: '{broken' }
                : scenario === 'storage-disabled' ? { storageDisabled: true }
                    : { rawCache: null };
        await setup(page, options);
        const bootstrap = gate();
        await page.route('**/api/player-bootstrap', async (route) => {
            await bootstrap.wait;
            await route.fulfill({ json: { playFabId: UID, playerData: fresh } });
        });
        await page.goto('/');
        await waitForShell(page);
        await expect(page.locator('#homeProfileStatus')).toHaveText('プロフィールを読み込んでいます');
        expect(await page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('human');
        bootstrap.release();
        await expect(page.locator('#homeProfileStatus')).toBeHidden();
        await expectNoPageErrors(errors);
    });
}

for (const nextUid of [null, 'FAKE_OTHER_USER']) {
    test(`session change to ${nextUid} deletes this UID cache and prevents late responses from restoring it`, async ({ page }) => {
        const errors = trackPageErrors(page);
        await setup(page);
        const bootstrap = gate();
        let responded = false;
        await page.route('**/api/player-bootstrap', async (route) => {
            await bootstrap.wait;
            await route.fulfill({ json: { playFabId: UID, playerData: fresh } });
            responded = true;
        });
        await page.goto('/');
        await waitForShell(page);
        await page.evaluate(async (uid) => {
            const { setTestUser } = await import('firebase/auth');
            setTestUser(uid);
        }, nextUid);
        await expect(page.locator('#appWrapper')).toBeHidden();
        await expect(page.locator('#bottomNav')).toBeHidden();
        await expect(page.locator('#profileSessionNotice')).toBeVisible();
        expect(await page.evaluate((key) => localStorage.getItem(key), PREFIX + UID)).toBeNull();
        bootstrap.release();
        await expect.poll(() => responded).toBe(true);
        // Flush the fetch continuation without wall-clock sleeps.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await page.evaluate((key) => localStorage.getItem(key), PREFIX + UID)).toBeNull();
        expect(await page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('elf');
        await expectNoPageErrors(errors);
    });
}

test('missing token with a different Firebase session preserves the existing authentication error and does not restore the cache', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page, { initialUid: 'FAKE_OTHER_USER', firebaseToken: null });
    let bootstrapCalls = 0;
    await page.route('**/api/player-bootstrap', (route) => {
        bootstrapCalls += 1;
        return route.fulfill({ json: { playFabId: UID, playerData: fresh } });
    });
    await page.goto('/');
    await expect(page.locator('#globalPlayerName')).toHaveText('認証エラー');
    expect(bootstrapCalls).toBe(0);
    expect(await page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('human');
    await expect(page.locator('#bottomNav')).toBeHidden();
    await expectNoPageErrors(errors);
});

test('missing custom token reuses only the matching authenticated session', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page, { firebaseToken: null });
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#homeProfileStatus')).toBeHidden();
    expect(await page.evaluate(() => window.myAvatarBaseInfo.Race)).toBe('human');
    await expectNoPageErrors(errors);
});

test('pending profile and stats cannot supply a cached nation to reservations or invitation links', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page);
    const bootstrap = gate();
    const stats = gate();
    const statusBodies = [];
    const reservationBodies = [];
    await page.route('**/api/player-bootstrap', async (route) => {
        await bootstrap.wait;
        await route.fulfill({ json: { playFabId: UID, playerData: fresh } });
    });
    await page.route('**/api/get-stats', async (route) => {
        await stats.wait;
        await route.fulfill({ json: { stats: { Level: 4 } } });
    });
    await page.route('**/api/get-troy-status', async (route) => {
        statusBodies.push(JSON.parse(route.request().postData()));
        await route.fulfill({ json: { nation: 'fire', isOpen: false, members: [] } });
    });
    await page.route('**/api/reservations/create', async (route) => {
        reservationBodies.push(JSON.parse(route.request().postData()));
        await route.fulfill({ json: { success: true } });
    });
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#btnCopyInviteLink')).toBeDisabled();
    await page.locator('#navTroy').click();
    await expect.poll(() => statusBodies.some((body) => Object.hasOwn(body, 'troyNation'))).toBe(true);
    expect(statusBodies.every((body) => !body.troyNation)).toBe(true);
    // Exercise the already-wired reservation handler using a fake form, without real bookings.
    await page.evaluate(() => {
        document.getElementById('reservationStartsAt').value = '2026-10-04T18:00';
        document.getElementById('btnCreateReservation').click();
    });
    await expect.poll(() => reservationBodies.length).toBe(1);
    expect(reservationBodies[0].nation).toBe('');
    bootstrap.release();
    await expect(page.locator('#homeProfileStatus')).toBeHidden();
    // A fresh appearance alone does not turn a placeholder level into confirmed stats.
    await expect(page.locator('#btnCopyInviteLink')).toBeDisabled();
    stats.release();
    await expect(page.locator('#btnCopyInviteLink')).toBeEnabled();
    await page.evaluate(() => document.getElementById('btnCreateReservation').click());
    await expect.poll(() => reservationBodies.length).toBe(2);
    expect(reservationBodies[1].nation).toBe('fire');
    await expectNoPageErrors(errors);
});

test('late home completion for an entry URL preserves the tab the user selected', async ({ page }) => {
    const errors = trackPageErrors(page);
    await setup(page);
    const inventory = gate();
    let entered = false;
    await page.route('**/api/get-inventory', async (route) => {
        await inventory.wait;
        await route.fulfill({ json: { inventory: [], virtualCurrency: { PS: 432 } } });
    });
    await page.route('**/api/troy-join', async (route) => {
        await route.fulfill({ json: { nation: 'fire', alreadyEntered: true } });
        entered = true;
    });
    await page.goto('/?action=troy-entry&troyNation=fire');
    await waitForShell(page);
    await page.locator('#navInventory').click();
    await expect(page.locator('#tabContentInventory')).toBeVisible();
    inventory.release();
    await expect.poll(() => entered).toBe(true);
    await expect(page).not.toHaveURL(/action=troy-entry/);
    await expect(page.locator('body')).toHaveAttribute('data-current-tab', 'inventory');
    await expect(page.locator('#tabContentInventory')).toBeVisible();
    await expectNoPageErrors(errors);
});
