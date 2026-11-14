const { test, expect } = require('@playwright/test');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

// The three face-down cards are offered as soon as the player asks for the fortune;
// the draw is sent behind them and the chosen card turns once the server has answered.
async function isolate(page) {
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
}
function dailyResult() {
    return { cardId: 'fixture-card-only', cardNumber: 3, suit: 'Swords', isArcana: false, cardName: 'ソードの3', orientation: 'upright', weather: { level: 5, windLabel: '安定' }, strikeLine: 'まず今わかることを一つ確かめ、次の一歩を選んでください。', rewardPs: 3, rewardType: 'card', rewardItemName: 'ソードの3', rewardCardGranted: true };
}
const cards = page => page.locator('#dailyTarotFortuneCardHost button');

async function openWithHeldDraw(page, answer) {
    await isolate(page);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let draws = 0;
    await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: { canDraw: true, result: null } }));
    await page.route('**/api/tarot-fortune-draw', async route => { draws += 1; await held; return route.fulfill(answer); });
    await bootstrapMainApp(page);
    await page.locator('#btnDailyFortune').click();
    return { release, draws: () => draws };
}

for (const width of [320, 390, 430]) {
    test(`the cards are offered before the draw answers at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 760 });
        const draw = await openWithHeldDraw(page, { json: { result: dailyResult() } });
        await expect(cards(page)).toHaveCount(3);
        await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('カードを1枚選ぶ');
        await expect(page.locator('#dailyTarotFortuneText')).toHaveText('');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await cards(page).nth(1).click();
        await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('カードをめくっています…');
        await expect(page.locator('#dailyTarotFortuneText')).toHaveText('');
        draw.release();
        await expect(page.locator('#dailyTarotFortuneText')).toContainText(dailyResult().strikeLine, { timeout: 10000 });
        await expect(cards(page)).toHaveCount(1);
        expect(draw.draws()).toBe(1);
    });
}

test('a failed draw takes the cards away and says so', async ({ page }) => {
    const draw = await openWithHeldDraw(page, { status: 503, json: { error: 'FortuneTemporarilyUnavailable' } });
    await expect(cards(page)).toHaveCount(3);
    await cards(page).first().click();
    draw.release();
    await expect(page.locator('#dailyTarotFortuneSub')).toContainText('占いを始められませんでした');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('#dailyTarotFortuneCardHost')).not.toHaveClass(/is-choice/);
});

test('a draw already made elsewhere shows the stored result instead of the choice', async ({ page }) => {
    const draw = await openWithHeldDraw(page, { json: { alreadyClaimed: true, result: dailyResult() } });
    await expect(cards(page)).toHaveCount(3);
    draw.release();
    await expect(page.locator('#dailyTarotFortuneModal')).toHaveClass(/is-revisit/);
    await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('本日の占い結果です。');
    await expect(page.locator('#dailyTarotFortuneCardHost .tarot-fortune-card-shell')).toHaveCount(0);
    await expect(page.locator('#dailyTarotFortuneCardHost .tarot-fortune-card')).toHaveCount(1);
    await expect(page.locator('#dailyTarotFortuneCardHost')).not.toHaveClass(/is-choice/);
});

test('with reduced motion the chosen card turns quietly once the draw answers', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const draw = await openWithHeldDraw(page, { json: { result: dailyResult() } });
    await cards(page).first().click();
    await expect(page.locator('#dailyTarotFortuneSub')).toHaveText('カードをめくっています…');
    draw.release();
    await expect(page.locator('#dailyTarotFortuneText')).toContainText(dailyResult().strikeLine);
    await expect(cards(page).first()).toHaveClass(/is-quiet-reveal/);
});
