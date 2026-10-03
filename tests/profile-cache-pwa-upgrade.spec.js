const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { test, expect } = require('@playwright/test');

test('PWA upgrade uses one generation for alias and relative modules while old unversioned requests fail', async ({ browser }) => {
    const root = path.join(__dirname, '..');
    const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const importMap = index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const previousIndex = cp.execFileSync('git', ['show', 'c1c0c9e7e66cd46b050030e30c303ce8086d1d6c:public/index.html'], { cwd: root, encoding: 'utf8' });
    const previousMap = previousIndex.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const modernSw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
    const legacySw = cp.execFileSync('git', ['show', '43a96405addefe340f53753f578a12941b9584e4:public/sw.js'], { cwd: root, encoding: 'utf8' });
    const legacyVersion = legacySw.match(/const CACHE_VERSION = '([^']+)'/)[1];
    const modernVersion = modernSw.match(/const CACHE_VERSION = '([^']+)'/)[1];
    const cacheModule = fs.readFileSync(path.join(root, 'public/js/playerBootstrapCache.js'), 'utf8');
    let phase = 'legacy';
    let workerPhase = 'legacy';
    let fixedMap = false;
    const requests = [];
    const unexpected = [];
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        requests.push({ phase, fixedMap, pathname: url.pathname, search: url.search });
        const send = (body, type = 'application/javascript', status = 200) => {
            res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            res.end(body);
        };
        if (req.method !== 'GET') {
            unexpected.push(req.method + ' ' + url.pathname);
            return send('', 'text/plain', 405);
        }
        if (url.pathname === '/sw.js') return send(workerPhase === 'legacy' ? legacySw : modernSw);
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const script = phase === 'legacy' ? `
                import * as Player from './js/player.js';
                import { sourceVersion } from './js/playerProfile.js';
                window.fixture = { player: Player.sourceVersion, profile: sourceVersion };
                await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            ` : `
                import * as Player from 'player';
                import { Player as RelativePlayer } from './js/consumer.js';
                import { sourceVersion } from './js/playerProfile.js';
                import { readCachedProfile } from './js/playerBootstrapCache.js';
                window.fixture = { player: Player.sourceVersion, profile: sourceVersion,
                    samePlayerModule: Player === RelativePlayer,
                    cacheFallback: readCachedProfile('FAKE_PWA_USER', { storage: null }) };
            `;
            return send(`<!doctype html><html><head>${phase === 'modern' ? '<script type="importmap">' + (fixedMap ? importMap : previousMap) + '</script>' : ''}</head><body><p>PWA fixture</p><script type="module">${script}</script></body></html>`, 'text/html');
        }
        if (url.pathname === '/js/player.js' || url.pathname === '/js/playerProfile.js') {
            // Model a failed old URL during an otherwise online upgrade. The old SW can fall back to its old cache.
            if (phase === 'modern' && !url.search) {
                req.socket.destroy();
                return;
            }
            return send(`export const sourceVersion = '${phase}';`);
        }
        if (url.pathname === '/js/playerBootstrapCache.js') return send(cacheModule);
        if (url.pathname === '/js/consumer.js') return send("import * as Player from './player.js'; export { Player };");
        if (url.pathname === '/style.css') return send('', 'text/css');
        if (url.pathname === '/main.js') return send('// mocked app shell');
        if (url.pathname === '/manifest.webmanifest') return send('{}', 'application/manifest+json');
        if (url.pathname === '/favicon.ico') return send('', 'image/x-icon');
        unexpected.push(req.method + ' ' + url.pathname);
        return send('Fixture-only server', 'text/plain', 404);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [];
    const foreign = [];
    page.on('pageerror', (error) => errors.push(error.message));
    context.on('request', (request) => { if (new URL(request.url()).origin !== origin) foreign.push(request.url()); });
    try {
        await page.goto(origin);
        await page.waitForFunction(() => window.fixture?.player === 'legacy');
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
                await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
            }
        });
        await page.reload();
        const oldCore = 'troy-core-' + legacyVersion;
        await page.evaluate(async (key) => {
            const cache = await caches.open(key);
            for (const url of ['/js/player.js', '/js/playerProfile.js']) {
                await cache.put(url, await fetch(url));
            }
        }, oldCore);
        phase = 'modern';
        // The previous import map reproduces the problem: new shell, old player modules from cache.
        await page.goto(origin + '/index.html?upgrade=unfixed');
        await expect.poll(() => page.evaluate(() => window.fixture || null)).toEqual({
            player: 'legacy', profile: 'legacy', samePlayerModule: true, cacheFallback: null
        });
        fixedMap = true;
        // Keep the old worker active for this navigation; update it only after testing the mixed-generation window.
        await page.goto(origin + '/index.html?upgrade=1');
        await expect.poll(() => page.evaluate(() => window.fixture || null)).toEqual({
            player: 'modern', profile: 'modern', samePlayerModule: true, cacheFallback: null
        });
        const versionedModules = ['/js/player.js', '/js/playerProfile.js', '/js/playerBootstrapCache.js'];
        for (const pathname of versionedModules) {
            expect(requests.some((request) => request.phase === 'modern' && request.pathname === pathname && request.search.includes('20261003-profile-cache-v2'))).toBe(true);
        }
        expect(requests.some((request) => request.fixedMap && ['/js/player.js', '/js/playerProfile.js'].includes(request.pathname) && !request.search)).toBe(false);
        await expect.poll(() => page.evaluate(async ({ key, paths }) => {
            const cache = await caches.open(key);
            const urls = (await cache.keys()).map((request) => new URL(request.url));
            return paths.every((pathname) => urls.some((url) => url.pathname === pathname && url.search.includes('20261003-profile-cache-v2')));
        }, { key: oldCore, paths: versionedModules })).toBe(true);
        workerPhase = 'modern';
        await page.evaluate(async () => {
            const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
            const registration = await navigator.serviceWorker.getRegistration();
            await registration.update();
            await changed;
        });
        await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(oldCore);
        const keys = await page.evaluate(() => caches.keys());
        expect(keys).toContain('troy-core-' + modernVersion);
        expect(keys).not.toContain(oldCore);
        await page.reload();
        await expect.poll(() => page.evaluate(() => window.fixture || null)).toEqual({
            player: 'modern', profile: 'modern', samePlayerModule: true, cacheFallback: null
        });
        expect(errors).toEqual([]);
        expect(foreign).toEqual([]);
        expect(unexpected).toEqual([]);
    } finally {
        await context.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
