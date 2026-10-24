const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/pirate-tarot/manifest.json')));
const cacheVersion = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/)[1];

test('existing service worker and stale image/module caches cannot replace the new adopted edition', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pirate-tarot.html');
    await expect(page.locator('#cardGrid button')).toHaveCount(78);
    const previousImage = execFileSync('git', ['show', '3993f20835933451cdf68f8526e31a30e04e1081:public/assets/pirate-tarot/cards/cup-10.webp'], { cwd: root }).toString('base64');
    const previousThumbnail = execFileSync('git', ['show', '3993f20835933451cdf68f8526e31a30e04e1081:public/assets/pirate-tarot/thumbs/cup-10.webp'], { cwd: root }).toString('base64');
    await page.evaluate(async ({ previousImage, previousThumbnail, cacheVersion }) => {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const cache = await caches.open(`troy-runtime-${cacheVersion}`);
        for (const [variant, encoded] of [['cards', previousImage], ['thumbs', previousThumbnail]]) {
            const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
            const image = new Response(bytes, { headers: { 'Content-Type': 'image/webp' } });
            const url = `/assets/pirate-tarot/${variant}/cup-10.webp`;
            await cache.put(url, image.clone());
            // The partial deployment also cached wrong bytes under the new v8 URL.
            await cache.put(`${url}?v=v8-a740ed2707b653a3`, image);
        }
        const codeCache = await caches.open(`troy-core-${cacheVersion}`);
        const stale = new Response('throw Error("stale-artwork-module-used")', { headers: { 'Content-Type': 'text/javascript' } });
        await codeCache.put('/js/pirateTarotSelf.js', stale.clone());
        await codeCache.put('/js/pirateTarotSelf.js?v=20261022-pirate-tarot-artwork-v1', stale.clone());
        await codeCache.put('/js/pirateTarotSelf.js?v=20261024-pirate-v8', stale);
    }, { previousImage, previousThumbnail, cacheVersion });
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator('#cardGrid button')).toHaveCount(78);
    await page.locator('#cardSearch').fill('カップ10');
    const thumbnail = page.locator('[data-card-id="cup-10"] img');
    await thumbnail.evaluate(element => element.decode());
    const thumbnailDigest = await thumbnail.evaluate(async element => {
        const response = await fetch(element.currentSrc);
        const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    });
    expect(thumbnailDigest).toBe(manifest.cards.find(card => card.id === 'cup-10').thumbs.sha256);
    await page.locator('[data-card-id="cup-10"]').click();
    const image = page.locator('#selectedArt img');
    await expect(image).toHaveAttribute('src', `/assets/pirate-tarot/cards/cup-10.webp?v=${manifest.assetVersion}&delivery=20261025`);
    await image.evaluate(element => element.decode());
    const digest = await image.evaluate(async element => {
        const response = await fetch(element.currentSrc);
        const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
    });
    expect(digest).toBe(manifest.cards.find(card => card.id === 'cup-10').cards.sha256);
    const staleEntryStillExists = await page.evaluate(async cacheVersion => {
        const cache = await caches.open(`troy-runtime-${cacheVersion}`);
        return !!await cache.match('/assets/pirate-tarot/cards/cup-10.webp?v=v8-a740ed2707b653a3');
    }, cacheVersion);
    expect(staleEntryStillExists).toBe(true);
    expect(errors).toEqual([]);
});

test('a removed back loading late cannot hide the reveal sprite or replace the front', async ({ page }) => {
    await page.goto('/pirate-tarot.html');
    const result = await page.evaluate(async () => {
        const art = await import('/js/pirateTarotArtwork.js?v=20261025-pirate-delivery-v2');
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
    expect(result.src).toBe(`/assets/pirate-tarot/cards/cup-10.webp?v=${manifest.assetVersion}&delivery=20261025`);
});
