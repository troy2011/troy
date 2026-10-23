const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const evidence = process.env.TAROT_MANUAL_EVIDENCE;

async function observe(page) {
    const errors = [];
    const unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (['error', 'warning'].includes(message.type())) errors.push(message.text());
    });
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname !== '127.0.0.1' || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
            unexpected.push({ method: request.method(), path: url.pathname });
            return route.abort();
        }
        return route.continue();
    });
    return { errors, unexpected };
}

async function screenshot(page, name) {
    if (!evidence) return;
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, name), fullPage: false });
}

test('the existing self-reading URL links to the manual and browser back retains the selected result', async ({ page }) => {
    const health = await observe(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pirate-tarot.html');
    await expect(page).toHaveTitle('海賊タロット｜一枚から、自分の航路へ');
    const entry = page.getByRole('navigation', { name: '実物カードの遊び方' });
    await expect(entry.getByRole('link')).toHaveAttribute('href', '/tarot-kingdom-real.html');
    await screenshot(page, 'self-entry-mobile.png');
    await expect(page.locator('#cardGrid button')).toHaveCount(78);
    await page.locator('[data-card-id="sword-3"]').click();
    await page.getByLabel('逆位置', { exact: false }).check();
    await page.locator('#showReading').click();
    await expect(page.locator('#resultLabel')).toHaveText('ソード 3');
    const reading = await page.locator('#resultPoint').textContent();
    await expect(page).toHaveURL(/\/pirate-tarot\.html$/);
    await entry.getByRole('link').click();
    await expect(page).toHaveURL(/\/tarot-kingdom-real\.html$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('タロットキングダム');
    await page.goBack();
    await expect(page).toHaveURL(/\/pirate-tarot\.html$/);
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resultLabel')).toHaveText('ソード 3');
    await expect(page.locator('#resultDirection')).toHaveText('逆位置');
    await expect(page.locator('#resultPoint')).toHaveText(reading);
    expect(health.errors).toEqual([]);
    expect(health.unexpected).toEqual([]);
});

for (const width of [320, 390, 1440]) {
    test(`manual is readable at ${width}px, with working chapter links, adopted rules and a return route`, async ({ page }) => {
        const health = await observe(page);
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.goto('/tarot-kingdom-real.html');
        await expect(page).toHaveTitle('タロットキングダム｜実物版説明書');
        await expect(page.locator('.goal')).toContainText('札の効果より先に勝利');
        await expect(page.locator('.rule-section')).toHaveCount(9);
        await expect(page.locator('.role-list > li h3')).toHaveText([
            'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード',
            'ザ・ワールド', 'ストレートフラッシュ', 'ファイブカード'
        ]);
        await screenshot(page, `manual-${width}-top.png`);
        await page.getByText('今回の採用ルールを確認する', { exact: true }).click();
        await expect(page.locator('.revision')).toHaveAttribute('open', '');
        const links = await page.locator('.contents a').evaluateAll(items => items.map(item => ({ href: item.getAttribute('href'), text: item.textContent })));
        for (const link of links) {
            await page.locator('.contents').getByRole('link', { name: link.text, exact: true }).click();
            await expect(page).toHaveURL(new RegExp(`${link.href}$`));
            await expect(page.locator(link.href)).toBeInViewport();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await expect(page.locator('#rescue')).toContainText('3回引いても脱落しません');
        await expect(page.locator('#rescue')).toContainText('山札を引くより先に確認');
        await expect(page.locator('#major')).toContainText('合法に出して手札0枚になれば、その場で勝利');
        await expect(page.locator('#rescue')).toContainText('山札切れだけで即終了にはせず');
        expect(await page.locator('#turn > p:not(.eyebrow)').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
        await page.locator('#rescue').evaluate(element => element.scrollIntoView({ block: 'start' }));
        await screenshot(page, `manual-${width}-rescue.png`);
        await page.getByText('同じ役同士の比べ方', { exact: true }).click();
        await expect(page.getByText('フルハウス：3枚側の数字、同じなら2枚側。', { exact: true })).toBeVisible();
        await page.locator('header').getByRole('link', { name: '← セルフ占いへ', exact: true }).click();
        await expect(page).toHaveURL(/\/pirate-tarot\.html$/);
        await expect(page.locator('#cardGrid button')).toHaveCount(78);
        expect(health.errors).toEqual([]);
        expect(health.unexpected).toEqual([]);
    });
}

test('the full physical manual and navigation work without JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
        const health = await observe(page);
        await page.goto(`${baseURL}/tarot-kingdom-real.html`);
        await expect(page.locator('script')).toHaveCount(0);
        await page.locator('.contents').getByRole('link', { name: '初手が出せないとき', exact: true }).click();
        await expect(page.locator('#rescue')).toBeInViewport();
        await page.getByText('同じ役同士の比べ方', { exact: true }).click();
        await expect(page.getByText('フラッシュ：大きい数字から順に比較。', { exact: true })).toBeVisible();
        expect(health.errors).toEqual([]);
        expect(health.unexpected).toEqual([]);
    } finally {
        await context.close();
    }
});
