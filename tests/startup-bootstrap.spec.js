const { test, expect } = require('@playwright/test');
const { installBaseAppMocks, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.fulfill({ contentType: 'text/css', body: '' });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { success: true, stats: { Level: 10 }, inventory: [], equipment: {}, virtualCurrency: { PS: 0 } } });
        return route.continue();
    });
    await installBaseAppMocks(page, {}, {});
});

test('alias and relative imports share one inventory state and one UI module across navigation', async ({ page }) => {
    const errors = trackPageErrors(page);
    const modules = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (['/js/inventory.js', '/js/ui.js'].includes(url.pathname)) modules.push(url.pathname + url.search);
    });
    await page.route('**/api/get-inventory', route => route.fulfill({ json: {
        inventory: [{ itemId: 'startup-shared-item', name: 'Shared fixture', count: 1, instances: ['fixture-1'], customData: { Category: 'Consumable' } }],
        virtualCurrency: { PS: 0 }
    } }));
    await page.goto('/');
    await expect(page.locator('#appWrapper')).toBeVisible();
    const shared = await page.evaluate(async () => {
        const a = await import('inventory');
        const b = await import('/js/inventory.js');
        const ui = await import('ui');
        const relativeUi = await import('/js/ui.js');
        await a.getInventory('PF_PLAYWRIGHT', { force: true });
        await ui.showTab('inventory', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
        await relativeUi.showTab('home', { playFabId: 'PF_PLAYWRIGHT', race: 'human', nation: 'fire' });
        return { sameInventoryModule: a === b, sameUiModule: ui === relativeUi, sameArray: a.getMyInventory() === b.getMyInventory(), itemVisibleThroughRelativeImport: b.getMyInventory().some(item => item.itemId === 'startup-shared-item') };
    });
    expect(shared).toEqual({ sameInventoryModule: true, sameUiModule: true, sameArray: true, itemVisibleThroughRelativeImport: true });
    expect(modules.filter(url => url.startsWith('/js/inventory.js'))).toHaveLength(1);
    expect(modules.filter(url => url.startsWith('/js/ui.js'))).toHaveLength(1);
    await expectNoPageErrors(errors);
});

test('SDKs finish before DOM ready and trigger only one login initialization', async ({ page }) => {
    const errors = trackPageErrors(page);
    let logins = 0;
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', async route => {
        await new Promise(resolve => setTimeout(resolve, 350));
        return route.fallback();
    });
    await page.route('**/api/login-playfab', async route => { logins++; return route.fallback(); });
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        window.__startupSdkOrder = { liff: typeof window.liff?.init === 'function', qr: typeof window.QRious === 'function' };
    }));
    await page.goto('/');
    await expect(page.locator('#appWrapper')).toBeVisible();
    expect(await page.evaluate(() => window.__startupSdkOrder)).toEqual({ liff: true, qr: true });
    expect(logins).toBe(1);
    await expectNoPageErrors(errors);
});

for (const dpr of [1, 2, 3]) {
    test(`390px boot image keeps its original resolution at DPR ${dpr}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, baseURL, serviceWorkers: 'block' });
        const page = await context.newPage();
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname !== '127.0.0.1') return route.fulfill({ contentType: 'text/plain', body: '' });
            if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
            return route.continue();
        });
        await page.addInitScript(() => { window.__TAROT_KINGDOM_PREVIEW__ = true; });
        await page.goto('/');
        await expect.poll(() => page.locator('#bootSplash img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
        expect(await page.locator('#bootSplash img').evaluate(image => new URL(image.currentSrc).pathname)).toBe('/assets/ui/boot/title.avif');
        expect(await page.locator('#bootSplash img').evaluate(image => [image.naturalWidth, image.naturalHeight])).toEqual([941, 1672]);
        await expect(page.locator('.boot-shop-link')).toBeVisible();
        await context.close();
    });
}

for (const reason of ['unsupported-format', 'failed-load']) {
    test(`boot image falls back to the preserved original after ${reason}`, async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.addInitScript(() => { window.__TAROT_KINGDOM_PREVIEW__ = true; });
        if (reason === 'failed-load') await page.route('**/assets/ui/boot/title.avif', route => route.abort());
        await page.goto('/');
        if (reason === 'unsupported-format') await page.locator('#bootSplash source').evaluate(source => { source.type = 'image/unsupported-fixture'; });
        await expect.poll(() => page.locator('#bootSplash img').evaluate(image => image.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname)).toBe('/Sprites/background/title.webp');
        await expect(page.locator('.boot-shop-link')).toBeVisible();
        await expectNoPageErrors(errors);
    });
}
