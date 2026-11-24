const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');

// Drive the page only through what a player sees: the lit cards, the lit button and "次へ".
async function playThrough(page, { width, shots }) {
    const titles = [];
    for (let i = 0; i < 300; i += 1) {
        const dialog = page.locator('#ktDialog');
        if (await dialog.isVisible()) {
            const title = await page.locator('#ktDialogTitle').textContent();
            if (!titles.includes(title)) titles.push(title);
            if (title === 'チュートリアル完了') return titles;
            await dialog.locator('.kt-button-main').click();
            continue;
        }
        if (await page.locator('#ktTutorialNext').isVisible()) { await page.locator('#ktTutorialNext').click(); continue; }
        const targets = page.locator('#ktHand .kt-card.is-tutorial-target');
        if (await targets.count()) {
            if (shots) await page.waitForTimeout(300);
            if (shots) await page.screenshot({ path: path.join(shots, `tutorial-${width}-${(await page.locator('body').getAttribute('data-tt-step')).replace(/:/g, '-')}.png`) });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
            for (const id of await targets.evaluateAll(nodes => nodes.map(n => n.dataset.card)))
                await page.locator(`#ktHand [data-card="${id}"]`).click({position:{x:7,y:12}});
            await expect(page.locator('#ktPlay')).toHaveClass(/is-tutorial-target/);
            await page.locator('#ktPlay').click();
            continue;
        }
        if (await page.locator('#ktPass.is-tutorial-target').count()) { await page.locator('#ktPass').click(); continue; }
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
        const height = width === 320 ? 568 : width === 390 ? 760 : 844;
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion });
        await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html');
        await expect(page.locator('#ttChapters button')).toHaveCount(5);
        await page.locator('#ttChapters button').first().click();
        await expect(page).toHaveURL(/tarot-kingdom-table\.html\?tutorial=1/);
        await expect(page.locator('#ktTable.kt-live-tutorial')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
        const shots = process.env.KT_SHOTS;
        if (shots) fs.mkdirSync(shots, { recursive: true });
        const titles = await playThrough(page, { width, shots: reducedMotion === 'reduce' ? null : shots });
        expect(titles).toEqual(['第1章 基本の出し方', '第1章 クリア', '第2章 数字の効果', '第2章 クリア', '第3章 大札', '第3章 クリア',
            '第4章 5枚役', '第4章 クリア', '第5章 コールと上がり', 'チュートリアル完了']);
        await expect(page.locator('#ktDialogBody')).toContainText('4翻');
        const score = page.locator('#ktDialogBody details');
        await expect(score).not.toHaveAttribute('open');
        await score.locator('summary').click();
        await expect(score.locator('.kt-result-note')).toHaveText('上がり1 ＋ 役2 ＋ 切札1');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });
}

test('a wrong card or button is stopped and the step is shown again', async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html?chapter=1');
    await page.locator('#ktDialog .kt-button-main').click();
    await expect(page.locator('#ktHand [data-card="cup-9"]')).toHaveClass(/is-tutorial-target/);
    await page.locator('#ktHand [data-card="coin-9"]').click();
    await expect(page.locator('#ktTutorialText')).toContainText('光る札');
    await expect(page.locator('#ktHand [data-card="coin-9"]')).not.toHaveClass(/is-selected/);
    await expect(page.locator('#ktPass')).toBeDisabled();
    await expect(page.locator('#ktFieldCards [data-card="wand-6"]')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-tt-step', '0:0');
    await expect(page.locator('#ktTable .kt-player-rating')).toHaveCount(0);
    await page.locator('#ktHand [data-card="cup-9"]').click();
    await page.locator('#ktPlay').click();
    await expect(page.locator('#ktFieldCards [data-card="cup-9"]')).toBeVisible();
});

test('reduced motion stops the pulsing guide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html?chapter=1');
    await page.locator('#ktDialog .kt-button-main').click();
    const target = page.locator('#ktHand .kt-card.is-tutorial-target').first();
    expect(await target.evaluate(node => getComputedStyle(node, '::after').animationName)).toBe('none');
    expect(await page.locator('#ktTutorialCoach').evaluate(node => parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(0.12);
});

test('the table setup links to the tutorial', async ({ page }) => {
    await page.goto('/tarot-kingdom-table.html');
    await page.getByRole('button', { name: 'CPU練習' }).click();
    await expect(page.locator('#ktTutorial')).toBeVisible();
    await expect(page.locator('#ktTutorial')).toHaveAttribute('href', 'tarot-kingdom-tutorial.html');
});


test('chapter list back, forward, and restart preserve tutorial mode without rate', async ({ page }) => {
    await page.setViewportSize({ width:320, height:568 });
    await page.goto('/tabletop-v65/tarot-kingdom-tutorial.html');
    await page.locator('#ttChapters button').nth(1).click();
    await expect(page).toHaveURL(/\/tarot-kingdom-table\.html\?tutorial=2$/);
    await page.locator('#ktDialog .kt-button-main').click();
    await page.locator('#ktTutorialRestart').click();
    await expect(page.locator('#ktDialogTitle')).toContainText('第2章');
    await expect(page.locator('body')).toHaveAttribute('data-tt-step', '1:0');
    await expect(page.locator('#ktTable .kt-player-rating')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#ttChapters button')).toHaveCount(5);
    await page.goForward();
    await expect(page.locator('#ktTable.kt-live-tutorial')).toBeVisible();
    await page.reload();
    await expect(page.locator('#ktDialogTitle')).toContainText('第2章');
});


test('marks card, actual next action, then Continue, with long detail on request only', async ({page}) => {
    await page.setViewportSize({width:320,height:568});
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.goto('/tarot-kingdom-table.html?tutorial=1');
    await expect(page.locator('#ktDialogBody details')).not.toHaveAttribute('open');
    await page.locator('#ktDialog .kt-button-main').click();
    const coach = page.locator('#ktTutorialText');
    const button = page.locator('#ktPlay');
    const next = page.locator('#ktTutorialNext');
    const hand = page.locator('#ktHand .kt-card.is-tutorial-target');
    await expect(coach).toHaveText('光る札をタップ');
    await expect(hand).toHaveCount(1);
    await expect(button).not.toHaveClass(/is-tutorial-target/);
    await page.getByRole('button',{name:'説明の詳細を見る'}).click();
    const detail = page.getByRole('dialog',{name:'詳しい説明'});
    await expect(detail).toContainText('ワンドの6');
    await detail.getByRole('button',{name:'閉じる'}).click();
    await expect(coach).toHaveText('光る札をタップ');
    await hand.first().click({position:{x:7,y:12}});
    await expect(hand).toHaveCount(0);
    await expect(button).toHaveClass(/is-tutorial-target/);
    await expect(coach).toHaveText('「出す」をタップ');
    await button.click();
    await expect(coach).toHaveText('6に9で返せた！');
    await expect(next).toHaveClass(/is-tutorial-target/);
    await expect(button).not.toHaveClass(/is-tutorial-target/);
    await expect(page.locator('#ktFieldCards [data-card="cup-9"]')).toBeVisible();
});

test('the lesson uses the same fixed board slots and the guide pages use the common shell', async ({browser,baseURL}) => {
    const page = await browser.newPage({baseURL,viewport:{width:320,height:568},deviceScaleFactor:3,reducedMotion:'reduce',isMobile:true,hasTouch:true});
    try {
        for(const link of ['/tabletop-v65/tarot-kingdom-table-rules.html','/tabletop-v65/tarot-kingdom-audio-credits.html']){
            const response=await page.goto(link);
            expect(response.ok()).toBe(true);
            await expect(page.locator('link[href*="tarot-kingdom-table-victory-v1.css"]')).toHaveCount(1);
            expect(await page.evaluate(()=>document.scrollingElement.scrollWidth)).toBe(320);
        }
        const slots = () => page.evaluate(() => {
            const bounds = selector => {
                const b = document.querySelector(selector).getBoundingClientRect();
                return [b.y,b.height];
            };
            return ['#ktFelt','#ktMe','.kt-message-wrap','#ktActions'].map(bounds);
        });
        await page.goto('/tarot-kingdom-table.html#practice');
        await page.locator('input[name=ktSeats][value="3"]').check();
        await page.locator('#ktStart').click();
        const normal = await slots();
        await page.goto('/tarot-kingdom-table.html?tutorial=1');
        await page.locator('#ktDialog .kt-button-main').click();
        await expect(page.locator('header.kt-bar #ktTutorialHeader')).toBeVisible();
        await expect(page.locator('.kt-message-wrap #ktTutorialCoach')).toBeVisible();
        await expect(page.locator('#ktMessage')).toBeHidden();
        expect(await slots()).toEqual(normal);
        const header = await page.locator('#ktTutorialHeader').boundingBox();
        const settings = await page.locator('#ktSettings').boundingBox();
        expect(header.x+header.width).toBeLessThan(settings.x);
        if(process.env.TROY_LESSON_CAPTURE){
            await page.evaluate(async()=>{await document.fonts.ready; await Promise.allSettled([...document.images].filter(n=>n.getClientRects().length).map(n=>n.decode()));});
            await page.screenshot({path:process.env.TEMP+'/TROY-canonical-live-lesson-DPR3.png'});
        }
    } finally {await page.close();}
});
