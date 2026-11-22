const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');

// Drive the page only through what a player sees: the lit cards, the lit button and "次へ".
async function playThrough(page, { width, shots }) {
    const titles = [];
    for (let i = 0; i < 300; i += 1) {
        const dialog = page.locator('#ttDialog');
        if (await dialog.isVisible()) {
            const title = await page.locator('#ttDialogTitle').textContent();
            if (!titles.includes(title)) titles.push(title);
            if (title === 'チュートリアル完了') return titles;
            await dialog.locator('.kt-button-main').click();
            continue;
        }
        if (await page.locator('#ttNext').isVisible()) { await page.locator('#ttNext').click(); continue; }
        const targets = page.locator('#ttHand .kt-card.is-target');
        if (await targets.count()) {
            if (shots) await page.waitForTimeout(300);
            if (shots) await page.screenshot({ path: path.join(shots, `tutorial-${width}-${(await page.locator('body').getAttribute('data-tt-step')).replace(/:/g, '-')}.png`) });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            for (const id of await targets.evaluateAll(nodes => nodes.map(n => n.dataset.card)))
                await page.locator(`#ttHand [data-card="${id}"]`).click();
            await expect(page.locator('#ttPlay')).toHaveClass(/is-target/);
            await page.locator('#ttPlay').click();
            continue;
        }
        if (await page.locator('#ttPass.is-target').count()) { await page.locator('#ttPass').click(); continue; }
        await page.clock.runFor(1000);
    }
    throw new Error('tutorial did not finish');
}

for (const width of [320, 390, 430]) for (const reducedMotion of ['no-preference', 'reduce']) {
    test(`tutorial plays to the end at ${width}px (${reducedMotion})`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
        await page.clock.install();
        await page.setViewportSize({ width, height: 760 });
        await page.emulateMedia({ reducedMotion });
        await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html');
        await expect(page.locator('#ttChapters button')).toHaveCount(5);
        await page.locator('#ttChapters button').first().click();
        const shots = process.env.KT_SHOTS;
        if (shots) fs.mkdirSync(shots, { recursive: true });
        const titles = await playThrough(page, { width, shots: reducedMotion === 'reduce' ? null : shots });
        expect(titles).toEqual(['第1章 基本の出し方', '第1章 クリア', '第2章 数字の効果', '第2章 クリア', '第3章 大札', '第3章 クリア',
            '第4章 5枚役', '第4章 クリア', '第5章 コールと上がり', 'チュートリアル完了']);
        await expect(page.locator('#ttDialogBody')).toContainText('4翻');
        await expect(page.locator('#ttDialogBody')).toContainText('上がり1 ＋ 役2 ＋ 切札1');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });
}

test('a wrong card or button is stopped and the step is shown again', async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html?chapter=1');
    await page.locator('#ttDialog .kt-button-main').click();
    await expect(page.locator('#ttHand [data-card="cup-9"]')).toHaveClass(/is-target/);
    await page.locator('#ttHand [data-card="coin-9"]').click();
    await expect(page.locator('#ttCoachHint')).toContainText('光っている札');
    await expect(page.locator('#ttHand [data-card="coin-9"]')).not.toHaveClass(/is-selected/);
    await page.locator('#ttPass').click();
    await expect(page.locator('#ttCoachHint')).toContainText('出す');
    await expect(page.locator('#ttFieldCards [data-card="wand-6"]')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-tt-step', '0:0');
    await page.locator('#ttHand [data-card="cup-9"]').click();
    await page.locator('#ttPlay').click();
    await expect(page.locator('#ttFieldCards [data-card="cup-9"]')).toBeVisible();
});

test('reduced motion stops the pulsing guide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html?chapter=1');
    await page.locator('#ttDialog .kt-button-main').click();
    const target = page.locator('#ttHand .kt-card.is-target').first();
    expect(await target.evaluate(node => getComputedStyle(node, '::after').animationName)).toBe('none');
    expect(await page.locator('#ttCoach').evaluate(node => parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(0.12);
});

test('the table setup links to the tutorial', async ({ page }) => {
    await page.goto('/tarot-kingdom-table.html');
    await page.getByRole('button', { name: 'CPU練習' }).click();
    await expect(page.locator('#ktTutorial')).toBeVisible();
    await expect(page.locator('#ktTutorial')).toHaveAttribute('href', 'tarot-kingdom-tutorial.html');
});
