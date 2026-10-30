const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');
const { __test: fortune } = require('../server/tarotFortune');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/pirate-tarot/manifest.json')));
const output = process.env.PIRATE_APP_ARTWORK_EVIDENCE;
const imageUrl = id => `/assets/pirate-tarot/cards/${id}.webp?v=${manifest.assetVersion}&delivery=20261025`;

async function isolate(page) {
    const blocked = [];
    await page.route('**/*', (route) => {
        if (new URL(route.request().url()).hostname !== '127.0.0.1') {
            blocked.push('unknown external request');
            return route.abort();
        }
        return route.continue();
    });
    return blocked;
}
function dailyResult(overrides = {}) {
    return { cardId: 'fixture-card-only', cardNumber: 3, suit: 'Swords', isArcana: false, cardName: 'ソードの3', orientation: 'upright', weather: { level: 5, windLabel: '安定' }, strikeLine: 'まず今わかることを一つ確かめ、次の一歩を選んでください。', rewardPs: 3, rewardType: 'card', rewardItemName: 'ソードの3', rewardCardGranted: true, ...overrides };
}
async function installFortune(page, result, claimed = false) {
    let drawCount = 0;
    await page.route('**/api/tarot-fortune-status', (route) => route.fulfill({ json: claimed ? { canDraw: false, result } : { canDraw: true } }));
    await page.route('**/api/tarot-fortune-draw', (route) => {
        drawCount++;
        return route.fulfill({ json: { balance: 1003, result } });
    });
    return () => drawCount;
}
async function waitImage(image) {
    await expect(image).toBeVisible();
    await image.evaluate(async (element) => { await element.decode(); await new Promise(requestAnimationFrame); });
    expect(await image.evaluate((element) => element.naturalWidth)).toBe(640);
}
async function screenshotModal(page, name) {
    if (!output) return;
    await expect(page.locator('.rpg-message-popup')).toHaveCount(0, { timeout: 7000 });
    const modal = page.locator('#dailyTarotFortuneModal');
    const active = await page.evaluate(() => document.activeElement?.classList.contains('tarot-fortune-done'));
    if (active) await modal.focus();
    await page.screenshot({ path: path.join(output, name), fullPage: false });
}

test('daily engine cards and catalog cards resolve the same 78 adopted fronts', async ({ page }) => {
    await isolate(page);
    await page.goto('/pirate-tarot.html');
    const deck = fortune.buildTarotDeck();
    const resolved = await page.evaluate(async (cards) => {
        const images = await import('/js/pirateTarotArtwork.js');
        return cards.map((card) => {
            const number = card.number;
            const catalog = { Category: card.isArcana ? 'TarotMajor' : 'TarotMinor', ArcanaNumber: number, ArcanaSuit: card.suit, ArcanaRank: number };
            return { daily: images.getDailyTarotArtworkId(card), inventory: images.getPirateTarotCardId(catalog) };
        });
    }, deck);
    expect(resolved).toHaveLength(78);
    expect(new Set(resolved.map((entry) => entry.daily)).size).toBe(78);
    expect(resolved.map((entry) => entry.daily).sort()).toEqual(manifest.cards.map((card) => card.id).sort());
    for (const entry of resolved) expect(entry.daily).toBe(entry.inventory);
});

test('home daily fortune reveals the adopted minor upright once and keeps result and reward', async ({ page }) => {
    await isolate(page);
    const errors = trackPageErrors(page);
    const requestedArtwork = [];
    page.on('request', (request) => { if (request.url().includes('/assets/pirate-tarot/cards/')) requestedArtwork.push(request.url()); });
    const result = dailyResult();
    const draws = await installFortune(page, result);
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await expect(page.locator('#dailyTarotFortuneCardHost img[data-artwork-side="front"]')).toHaveCount(0);
    const backs = page.locator('#dailyTarotFortuneCardHost img[data-artwork-side="back"]');
    await expect(backs).toHaveCount(3);
    await expect(backs.first()).toHaveAttribute('src', `/assets/pirate-tarot/back.webp?v=${manifest.assetVersion}&delivery=20261025`);
    await waitImage(backs.first());
    await screenshotModal(page, 'daily-fortune-mobile-back.png');
    expect(requestedArtwork).toEqual([]);
    await page.locator('#dailyTarotFortuneCardHost button').first().evaluate((button) => { button.click(); button.click(); button.click(); });
    const image = page.locator('#dailyTarotFortuneCardHost img[data-artwork-side="front"]');
    await waitImage(image);
    await expect(image).toHaveAttribute('src', imageUrl('sword-3'));
    await expect(image).toHaveAttribute('alt', 'ソードの3の採用カード');
    await expect(image).not.toHaveClass(/is-reversed/);
    await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('ソードの3');
    await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('正位置');
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);
    await expect(page.locator('#dailyTarotFortuneReward')).toContainText('ソードの3');
    await expect(page.locator('#btnDailyFortune')).toBeEnabled();
    expect(draws()).toBe(1);
    expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshotModal(page, 'daily-fortune-mobile-upright.png');
    await page.locator('.tarot-fortune-close').click();
    await expect(page.locator('#dailyTarotFortuneOverlay')).toBeHidden();
    await expectNoPageErrors(errors);
});

test('major reversed rotates only the adopted art and preserves the fragment reward', async ({ page }) => {
    await isolate(page);
    const errors = trackPageErrors(page);
    const result = dailyResult({ cardNumber: 18, suit: 'None', isArcana: true, cardName: '月', orientation: 'reversed', rewardType: 'fragment', rewardItemName: '月', rewardCardGranted: false, rewardFragmentAmount: 1, rewardFragmentCount: 1, rewardFragmentRequired: 2 });
    const draws = await installFortune(page, result);
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await page.locator('#dailyTarotFortuneCardHost button').first().click();
    const image = page.locator('#dailyTarotFortuneCardHost img[data-artwork-side="front"]');
    await waitImage(image);
    await expect(image).toHaveAttribute('src', imageUrl('major-18'));
    await expect(image).toHaveClass(/is-reversed/);
    const rotation = await image.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return { a: matrix.a, d: matrix.d };
    });
    expect(rotation.a).toBeCloseTo(-1);
    expect(rotation.d).toBeCloseTo(-1);
    await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('月');
    await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText('逆位置');
    await expect(page.locator('#dailyTarotFortuneReward')).toContainText('「月」の欠片を1個受け取った。（1/2）');
    expect(draws()).toBe(1);
    await screenshotModal(page, 'daily-fortune-mobile-reversed.png');
    await expectNoPageErrors(errors);
});

for (const [name, result, expectedId] of [
    ['major zero', dailyResult({ cardNumber: 0, isArcana: true, cardName: '愚者', orientation: 'upright' }), 'major-0'],
    ['minor court', dailyResult({ cardNumber: 14, suit: 'Cups', cardName: 'カップのキング', orientation: 'reversed' }), 'cup-king'],
    ['adopted cup3', dailyResult({ cardNumber: 3, suit: 'Cups', cardName: 'カップの3', orientation: 'upright' }), 'cup-3'],
    ['adopted cup10', dailyResult({ cardNumber: 10, suit: 'Cups', cardName: 'カップの10', orientation: 'reversed' }), 'cup-10']
]) {
    test(`already claimed ${name} shows adopted art without drawing or granting again`, async ({ page }) => {
        await isolate(page);
        const draws = await installFortune(page, result, true);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await bootstrapMainApp(page);
        await page.locator('#btnDailyFortune').click();
        const image = page.locator('#dailyTarotFortuneCardHost img');
        await waitImage(image);
        await expect(image).toHaveAttribute('src', imageUrl(expectedId));
        await expect(page.locator('#dailyTarotFortuneResultMeta')).toContainText(result.cardName);
        await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);
        await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('本日の占い結果です。');
        expect(draws()).toBe(0);
        const pixels = await image.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
        expect(pixels.width / pixels.height).toBeCloseTo(2 / 3);
        await screenshotModal(page, `daily-fortune-desktop-${expectedId}.png`);
    });
}

test('failed daily artwork retains the original reversed sprite, advice and reward', async ({ page }) => {
    await isolate(page);
    const result = dailyResult({ orientation: 'reversed' });
    const draws = await installFortune(page, result);
    let artworkRequests = 0;
    await page.route('**/assets/pirate-tarot/cards/sword-3.webp*', (route) => { artworkRequests++; return route.fulfill({ status: 404, body: '' }); });
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await page.locator('#dailyTarotFortuneCardHost button').first().click();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine, { timeout: 10000 });
    await expect(page.locator('#dailyTarotFortuneCardHost img')).toBeHidden();
    await expect(page.locator('#dailyTarotFortuneCardHost button')).toHaveClass(/is-reversed/);
    await expect(page.locator('#dailyTarotFortuneCardHost button')).not.toHaveClass(/has-pirate-artwork/);
    await expect(page.locator('#dailyTarotFortuneCardHost .tarot-card-art')).toBeVisible();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);
    await expect(page.locator('#dailyTarotFortuneReward')).toBeVisible();
    expect(draws()).toBe(1);
    expect(artworkRequests).toBe(1);
});

async function openOwnedCard(page, category = 'TarotMinor') {
    await page.evaluate(async (category) => {
        document.getElementById('tabContentInventory').style.display = 'block';
        const inventory = await import('/js/inventory.js');
        await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
        inventory.switchInventoryGroup('Tarot');
        inventory.switchInventoryTab(category);
    }, category);
    await page.locator('#inventoryGrid .inventory-item-cell').first().click();
}
async function mockOwnedCards(page) {
    const cards = [
        { itemId: 'owned_fixture_major_6', name: '恋人', customData: { Category: 'TarotMajor', ArcanaNumber: '6' } },
        { itemId: 'owned_fixture_pentacle_6', name: '金貨の6', customData: { Category: 'TarotMinor', ArcanaSuit: 'pentacle', ArcanaRank: '6', CardNumber: '6' } }
    ];
    await page.route('**/api/get-inventory', (route) => route.fulfill({ json: { inventory: cards, virtualCurrency: { PS: 0 }, contribution: 0 } }));
}

test('owned tarot detail shows the correct adopted front and preserves ownership actions on mobile', async ({ page }) => {
    await isolate(page);
    const errors = trackPageErrors(page);
    await mockOwnedCards(page);
    const mutations = [];
    page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (/(?:^|[-/])(?:equip|unequip|replace|level-up|upgrade)(?:[-/]|$)/.test(pathname)) mutations.push(pathname);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapMainApp(page);
    await openOwnedCard(page, 'TarotMajor');
    let image = page.locator('#itemDetailModal .pirate-tarot-inventory-art img');
    await waitImage(image);
    await expect(image).toHaveAttribute('src', imageUrl('major-6'));
    await expect(page.locator('#itemDetailName')).toHaveText('恋人');
    await page.evaluate(() => window.closeItemDetailModal());
    await openOwnedCard(page, 'TarotMinor');
    image = page.locator('#itemDetailModal .pirate-tarot-inventory-art img');
    await waitImage(image);
    await expect(image).toHaveAttribute('src', imageUrl('pentacle-6'));
    await expect(image).not.toHaveClass(/is-reversed/);
    await expect(page.locator('#itemDetailName')).toHaveText('金貨の6');
    await expect(page.locator('#itemDetailTarotCombat')).toBeVisible();
    await expect(page.locator('#itemDetailModal')).toContainText('デッキに追加');
    expect(mutations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (output) await page.screenshot({ path: path.join(output, 'owned-tarot-detail-mobile.png'), fullPage: false });
    await expectNoPageErrors(errors);
});

test('missing owned-card artwork keeps the card name, skill, old icon and controls usable', async ({ page }) => {
    await isolate(page);
    await mockOwnedCards(page);
    await page.route('**/assets/pirate-tarot/cards/pentacle-6.webp*', (route) => route.fulfill({ status: 404, body: '' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapMainApp(page);
    await openOwnedCard(page);
    await expect(page.locator('#itemDetailModal .pirate-tarot-inventory-art img')).toBeHidden();
    await expect(page.locator('#itemDetailName')).toHaveText('金貨の6');
    await expect(page.locator('#itemDetailIcon')).toBeVisible();
    await expect(page.locator('#itemDetailTarotCombat')).toBeVisible();
    await expect(page.locator('#itemDetailModal')).toContainText('デッキに追加');
    await page.locator('#itemDetailModal .item-detail-corner-close').click();
    await expect(page.locator('#itemDetailModal')).toBeHidden();
});

test('missing adopted back retains the existing back sprite and still reveals the correct front', async ({ page }) => {
    await isolate(page);
    await page.route('**/assets/pirate-tarot/back.webp*', route => route.fulfill({ status: 404, body: '' }));
    const draws = await installFortune(page, dailyResult());
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    const button = page.locator('#dailyTarotFortuneCardHost button').first();
    await expect(button.locator('[data-artwork-side="back"]')).toBeHidden();
    await expect(button.locator('.tarot-card-art')).toBeVisible();
    await button.click();
    await waitImage(button.locator('[data-artwork-side="front"]'));
    await expect(button.locator('img')).toHaveAttribute('src', imageUrl('sword-3'));
    expect(draws()).toBe(1);
});


test('daily reveal charges light by wind tier, flips, then keeps the full reading', async ({ page }) => {
    await isolate(page);
    // Sword 3 upright is wind 2, so the quiet moon tier runs without a color promotion.
    const result = dailyResult();
    const draws = await installFortune(page, result);
    await page.setViewportSize({ width: 320, height: 720 });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('カードを1枚選ぶ');
    await expect(page.locator('.tarot-fortune-reading')).toBeHidden();
    await page.clock.install();
    // Pause so each checkpoint below lands inside its phase regardless of real test speed.
    await page.clock.pauseAt(Date.now() + 1000);
    const card = page.locator('#dailyTarotFortuneCardHost button').first();
    await card.click();
    await expect(card).toHaveClass(/is-selected/);
    await page.clock.runFor(800);
    await expect(card).toHaveClass(/is-revealing/);
    await expect(card.locator('.tarot-card-art')).toBeHidden();
    await expect(card.locator('[data-artwork-side="back"]')).toBeVisible();
    await expect(page.locator('#dailyTarotFortuneCardHost button')).toHaveCount(1);
    await expect(page.locator('.tarot-fortune-fx')).toHaveAttribute('data-tier', 'moon');
    await expect(page.locator('#dailyTarotFortuneOverlay')).toHaveClass(/is-fortune-charging/);
    await expect(page.locator('.tarot-fortune-reading')).toBeHidden();
    await page.clock.runFor(1250);
    await expect(card).toHaveClass(/is-flip-out/);
    await page.clock.runFor(240);
    await expect(card).toHaveClass(/is-flip-in/);
    await expect(card.locator('[data-artwork-side="front"]')).toHaveCount(1);
    await page.clock.runFor(340);
    await expect(card).toHaveClass(/is-revealed/);
    await expect(page.locator('#dailyTarotFortuneOverlay')).not.toHaveClass(/is-fortune-charging/);
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(result.strikeLine);
    await expect(page.locator('#dailyTarotFortuneReward')).toContainText(result.rewardItemName);
    await page.clock.runFor(1800);
    await expect(page.locator('.tarot-fortune-fx')).toHaveCount(0);
    expect(draws()).toBe(1);
});
