const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { test, expect } = require('@playwright/test');

test('the published worker loads one updated module generation on restart', async ({ browser }) => {
    const root = path.join(__dirname, '..');
    const currentIndex = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const previousIndex = cp.execFileSync('git', ['show', '7cd14c0fdb6d671a5f65cc2bdc041b01dae7390f:public/index.html'], { cwd: root, encoding: 'utf8' });
    const mapFrom = html => html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const oldMap = mapFrom(previousIndex), newMap = mapFrom(currentIndex);
    const oldSw = cp.execFileSync('git', ['show', '7cd14c0fdb6d671a5f65cc2bdc041b01dae7390f:public/sw.js'], { cwd: root, encoding: 'utf8' });
    const errors = [], requests = [];
    let updated = false;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        requests.push({ updated, path: url.pathname, query: url.search });
        const send = (body, type = 'application/javascript', status = 200) => {
            res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
        };
        if (req.method !== 'GET') return send('', 'text/plain', 405);
        if (url.pathname === '/sw.js') return send(oldSw);
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const map = updated ? newMap : oldMap;
            const js = `import * as Player from 'player'; import * as Api from 'api'; import * as Inventory from 'inventory'; import * as Ui from 'ui'; import * as Profile from './js/playerProfile.js'; import * as Relative from './js/consumer.js'; import * as LegacyClient from './js/playfabClient.js?v=20260830-s1-auth-v1'; import * as Client from './js/playfabClient.js?v=20261029-startup-v1'; import * as Ship from './js/ship.js?v=20260828-exploration-retreat-v1'; import * as Island from './js/island.js'; import * as Companions from './js/companions.js?v=20260604d'; window.fixture = { player: Player.version, api: Api.version, inventory: Inventory.version, ui: Ui.version, profile: Profile.version, same: Player === Relative.Player && Api === Relative.Api && Inventory === Relative.Inventory && Ui === Relative.Ui && Profile === Relative.Profile, sameClient: LegacyClient === Client, ship: Ship.version, island: Island.version, companions: Companions.version }; await navigator.serviceWorker.register('/sw.js');`;
            const cssVersion = updated ? '20261030-home-layout-v1' : '20261003-profile-cache-v1';
            return send(`<!doctype html><link rel="stylesheet" href="/css/home-v3.css?v=${cssVersion}"><script type="importmap">${map}</script><script type="module">${js}</script>`, 'text/html');
        }
        if (url.pathname === '/js/consumer.js') return send("import * as Player from './player.js'; import * as Api from './api.js'; import * as Inventory from './inventory.js'; import * as Ui from './ui.js'; import * as Profile from './playerProfile.js'; export { Player, Api, Inventory, Ui, Profile };");
        if (['/js/player.js', '/js/api.js', '/js/inventory.js', '/js/ui.js', '/js/playerProfile.js', '/js/playfabClient.js', '/js/ship.js', '/js/island.js', '/js/companions.js'].includes(url.pathname)) {
            const version = {
                '/js/ui.js': '20261030-fortune-gacha-v1',
                '/js/playerProfile.js': '20261030-home-layout-v1',
                '/js/inventory.js': '20261031-detail-tidy-v1',
                '/js/ship.js': '20261031-shipyard-v1'
            }[url.pathname] || '20261029-startup-v1';
            return send(`export const version = '${url.search.includes(version) ? 'new' : 'old'}';`);
        }
        if (url.pathname === '/css/home-v3.css') return send(`:root { --home-layout-generation: ${url.search.includes('20261030-home-layout-v1') ? 'new' : 'old'}; }`, 'text/css');
        if (url.pathname === '/style.css') return send('', 'text/css');
        if (url.pathname === '/main.js') return send('');
        if (url.pathname === '/manifest.webmanifest') return send('{}', 'application/manifest+json');
        if (url.pathname === '/favicon.ico') return send('', 'image/x-icon');
        return send('missing', 'text/plain', 404);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(origin);
        await expect.poll(() => page.evaluate(() => window.fixture?.player)).toBe('old');
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        });
        await page.reload();
        await expect.poll(() => page.evaluate(() => window.fixture?.player)).toBe('old');
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--home-layout-generation').trim())).toBe('old');
        updated = true;
        await page.goto(origin + '/index.html?updated=1');
        await expect.poll(() => page.evaluate(() => window.fixture || null)).toEqual({ player: 'new', api: 'new', inventory: 'new', ui: 'new', profile: 'new', same: true, sameClient: true, ship: 'new', island: 'new', companions: 'new' });
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--home-layout-generation').trim())).toBe('new');
        for (const asset of ['/js/player.js', '/js/api.js', '/js/island.js', '/js/companions.js']) {
            expect(requests.some(request => request.updated && request.path === asset && request.query.includes('20261029-startup-v1'))).toBe(true);
        }
        for (const [asset, version] of [['/js/inventory.js', '20261031-detail-tidy-v1'], ['/js/ship.js', '20261031-shipyard-v1']]) {
            expect(requests.some(request => request.updated && request.path === asset && request.query.includes(version))).toBe(true);
        }
        expect(requests.some(request => request.updated && request.path === '/js/ui.js' && request.query.includes('20261030-fortune-gacha-v1'))).toBe(true);
        for (const asset of ['/js/playerProfile.js', '/css/home-v3.css']) {
            expect(requests.some(request => request.updated && request.path === asset && request.query.includes('20261030-home-layout-v1'))).toBe(true);
        }
        const ui = fs.readFileSync(path.join(root, 'public/js/ui.js'), 'utf8');
        const main = fs.readFileSync(path.join(root, 'public/main.js'), 'utf8');
        expect(ui).toContain("const TAROT_MODULE_VERSION = '20261030-fortune-gacha-v1'");
        expect(main).toContain("const TAROT_MODULE_VERSION = '20261030-fortune-gacha-v1'");
        expect(errors).toEqual([]);
    } finally {
        await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
});
