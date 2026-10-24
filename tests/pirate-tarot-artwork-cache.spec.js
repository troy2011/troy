const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/pirate-tarot/manifest.json')));

test('existing service worker and stale image/module caches cannot replace the new adopted edition', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pirate-tarot.html');
    await expect(page.locator('#cardGrid button')).toHaveCount(78);
    const previousImage = execFileSync('git', ['show', 'HEAD:public/assets/pirate-tarot/cards/cup-10.webp'], { cwd: root }).toString('base64');
    await page.evaluate(async ({ previousImage }) => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const cache = await caches.open('troy-runtime-troy-app-v20260830-s1-auth-v1');
        const bytes = Uint8Array.from(atob(previousImage), value => value.charCodeAt(0));
        await cache.put('/assets/pirate-tarot/cards/cup-10.webp', new Response(bytes, { headers: { 'Content-Type': 'image/webp' } }));
        const codeCache = await caches.open('troy-core-troy-app-v20260830-s1-auth-v1');
        const stale = new Response('throw Error("stale-artwork-module-used")', { headers: { 'Content-Type': 'text/javascript' } });
        await codeCache.put('/js/pirateTarotSelf.js', stale.clone());
        await codeCache.put('/js/pirateTarotSelf.js?v=20261022-pirate-tarot-artwork-v1', stale);
    }, { previousImage });
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator('#cardGrid button')).toHaveCount(78);
    await page.locator('#cardSearch').fill('カップ10');
    await page.locator('[data-card-id="cup-10"]').click();
    const image = page.locator('#selectedArt img');
    await expect(image).toHaveAttribute('src', `/assets/pirate-tarot/cards/cup-10.webp?v=${manifest.assetVersion}`);
    await image.evaluate(element => element.decode());
    const digest = await image.evaluate(async element => {
        const response = await fetch(element.currentSrc);
        const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    });
    expect(digest).toBe(manifest.cards.find(card => card.id === 'cup-10').cards.sha256);
    expect(errors).toEqual([]);
});

test('a removed back loading late cannot hide the reveal sprite or replace the front', async ({ page }) => {
    await page.goto('/pirate-tarot.html');
    const result = await page.evaluate(async () => {
        const art = await import('/js/pirateTarotArtwork.js?v=20261024-pirate-v8');
        const host = document.createElement('div');
        document.body.append(host);
        art.renderDailyTarotBackArtwork(host);
        const removedBack = host.querySelector('img');
        art.renderDailyTarotArtwork({ isArcana: false, suit: 'Cups', number: 10 }, host);
        removedBack.dispatchEvent(new Event('load'));
        const hiddenBeforeFrontLoad = host.classList.contains('has-pirate-artwork');
        const image = host.querySelector('img');
        await image.decode();
        const result = { hiddenBeforeFrontLoad, src: image.getAttribute('src'), count: host.querySelectorAll('img').length };
        host.remove();
        return result;
    });
    expect(result.hiddenBeforeFrontLoad).toBe(false);
    expect(result.count).toBe(1);
    expect(result.src).toBe(`/assets/pirate-tarot/cards/cup-10.webp?v=${manifest.assetVersion}`);
});
