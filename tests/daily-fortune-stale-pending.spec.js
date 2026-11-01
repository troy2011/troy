const { test, expect } = require('@playwright/test');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

// The server ledger decides whether a draw is in progress. A device flag left
// by a failed request must not block a player once status says no claim exists.
const PENDING_KEY = 'troy:fortune-pending:PF_PLAYWRIGHT';
const PENDING_TEXT = '処理状況が不明です';

async function isolate(page) {
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
}
function dailyResult() {
    return { cardId: 'fixture-card-only', cardNumber: 3, suit: 'Swords', isArcana: false, cardName: 'ソードの3', orientation: 'upright', weather: { level: 5, windLabel: '安定' }, strikeLine: 'まず今わかることを一つ確かめ、次の一歩を選んでください。', rewardPs: 3, rewardType: 'card', rewardItemName: 'ソードの3', rewardCardGranted: true };
}
const readFlag = page => page.evaluate(key => localStorage.getItem(key), PENDING_KEY);

test('a stale device flag is cleared when the server says the draw is open', async ({ page }) => {
    await isolate(page);
    await page.addInitScript(key => localStorage.setItem(key, '1'), PENDING_KEY);
    let draws = 0;
    await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: { canDraw: true, result: null } }));
    await page.route('**/api/tarot-fortune-draw', route => { draws += 1; return route.fulfill({ json: { balance: 1003, result: dailyResult() } }); });
    await bootstrapMainApp(page);
    const button = page.locator('#btnDailyFortune');
    await expect(button).toHaveText('占い');
    await button.click();
    await expect(page.locator('#dailyTarotFortuneCardHost button')).toHaveCount(3);
    await expect(page.locator('#dailyTarotFortuneText')).not.toContainText(PENDING_TEXT);
    await page.locator('#dailyTarotFortuneCardHost button').first().click();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(dailyResult().strikeLine, { timeout: 10000 });
    expect(draws).toBe(1);
    expect(await readFlag(page)).toBeNull();
});

test('a draw the server refused before starting can be tried again', async ({ page }) => {
    await isolate(page);
    let draws = 0;
    await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: { canDraw: true, result: null } }));
    await page.route('**/api/tarot-fortune-draw', route => {
        draws += 1;
        return draws === 1
            ? route.fulfill({ status: 503, json: { error: 'FortuneTemporarilyUnavailable' } })
            : route.fulfill({ json: { balance: 1003, result: dailyResult() } });
    });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await expect(page.locator('#dailyTarotFortuneSub')).toContainText('占いを始められませんでした');
    await expect(page.locator('#dailyTarotFortuneText')).not.toContainText(PENDING_TEXT);
    expect(await readFlag(page)).toBeNull();
    await expect(page.locator('#dailyTarotFortuneModal .tarot-fortune-retry')).toBeHidden();
    await page.locator('#dailyTarotFortuneModal .tarot-fortune-close').click();
    await page.locator('#btnDailyFortune').click();
    await expect(page.locator('#dailyTarotFortuneCardHost button')).toHaveCount(3);
    await page.locator('#dailyTarotFortuneCardHost button').first().click();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(dailyResult().strikeLine, { timeout: 10000 });
    expect(draws).toBe(2);
});

test('an uncertain draw still waits for the server and is not resent', async ({ page }) => {
    await isolate(page);
    let draws = 0;
    let serverPending = false;
    await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: serverPending
        ? { state: 'pending', canDraw: false, result: null }
        : { canDraw: true, result: null } }));
    await page.route('**/api/tarot-fortune-draw', route => {
        draws += 1;
        serverPending = true;
        return route.fulfill({ status: 503, json: { error: 'FortunePending' } });
    });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(PENDING_TEXT);
    expect(await readFlag(page)).toBe('1');
    await page.locator('#dailyTarotFortuneModal .tarot-fortune-retry').click();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(PENDING_TEXT);
    expect(await readFlag(page)).toBe('1');
    expect(draws).toBe(1);
});
