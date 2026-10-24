const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { installBaseAppMocks } = require('./helpers/main-app-harness');

test('new entry URLs bypass old cached modules while new and legacy games keep separate rules', async ({ browser, baseURL }) => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    const main = html.match(/src="(main\.js\?v=[^"]+)"/)[1];
    const version = new URL(main, baseURL).searchParams.get('v');
    const previewHtml = fs.readFileSync(path.join(root, 'public/tarot-kingdom-preview.html'), 'utf8');
    const kingdomEntry = previewHtml.match(/from '([^']*tarotKingdom\.js\?v=[^']+)'/)[1];
    const kingdomUrl = new URL(kingdomEntry, baseURL);
    const cacheVersion = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8').match(/const CACHE_VERSION = '([^']+)'/)[1];
    expect(imports.ui).toBe(imports['./js/ui.js']);
    expect(imports.ui).toContain('?v=' + version);
    const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(new URL(request.url()).pathname + new URL(request.url()).search));
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' || route.request().method() !== 'GET' || url.pathname.startsWith('/api/')) return route.abort();
        return route.continue();
    });
    await page.goto('/pirate-tarot.html');
    await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const staleUrls = [
        '/main.js?v=20261022-pirate-tarot-artwork-v1',
        '/js/ui.js?v=20261022-pirate-tarot-artwork-v1',
        '/js/tarotKingdom.js?v=20260828-exploration-retreat-v1'
    ];
    await page.evaluate(async ({ cacheVersion, urls }) => {
        const cache = await caches.open('troy-core-' + cacheVersion);
        for (const url of urls) await cache.put(url, new Response('throw new Error("stale release fixture");', { headers: { 'Content-Type': 'application/javascript' } }));
    }, { cacheVersion, urls: staleUrls });
    await installBaseAppMocks(page, {}, {});
    await page.addInitScript(() => { window.__TAROT_KINGDOM_PREVIEW__ = true; });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.showTab === 'function');
    expect(requests).toContain('/' + main);
    expect(requests).toContain('/js/ui.js?v=' + version);
    for (const old of staleUrls) expect(requests).not.toContain(old);
    await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle');
    await page.waitForFunction(() => !!window.TarotKingdomDebug?.battleScenario);
    await page.locator('#tarotKingdomStartOfflineButton').click();
    expect(await page.evaluate(() => window.TarotKingdomDebug.battleState().rules.openingRescueVersion)).toBe(1);
    const result = await page.evaluate(() => {
        const d = window.TarotKingdomDebug;
        const hands = [[{ id: 'release-world', kind: 'major', number: 21, suit: 'None' }], [{ id: 'release-b', kind: 'minor', number: 2, suit: 'Wand' }], [{ id: 'release-c', kind: 'minor', number: 3, suit: 'Cup' }]];
        d.battleScenario({ withTrick: false, playerCount: 3, handsBySeat: hands, rules: { openingRescueVersion: 0 } });
        const legacy = d.battlePlayCards(0, ['release-world']).ok;
        d.battleScenario({ withTrick: false, playerCount: 3, handsBySeat: hands, rules: { openingRescueVersion: 1 } });
        const current = d.battlePlayCards(0, ['release-world']);
        return { legacy, current: current.ok, empty: current.state.players[0].hand.length, phase: current.state.phase };
    });
    expect(result).toEqual({ legacy: false, current: true, empty: 0, phase: 'roundOutCinematic' });
    // Artwork entry updates do not require downloading an unchanged game engine again.
    expect(requests).toContain(kingdomUrl.pathname + kingdomUrl.search);
    expect(errors).toEqual([]);
    await context.close();
});
