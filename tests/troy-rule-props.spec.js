const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const fixture = `
window.rulePropFixture = (kind) => {
    const card = id => Rules.buildDeck().find(c => c.id === id);
    const round = match.round;
    const after = { alt:13, stack:8, pair:8, cut: 8, back: 11, lock: 13, clear: 7 }[kind];
    const before = { alt:14, stack:13, pair:7, cut: 7, back: 10, lock: 14, clear: 6 }[kind];
    const suit = kind === "alt" ? "sword-" : "coin-";
    Object.assign(round, {
        phase: 'play', turn: ME, last: 1, passed: [], direction: 1, cut: false,
        back: kind === 'lock' || kind === 'stack' || kind === 'alt', lock: kind === 'stack' ? 'coin' : null,
        field: {kind:'normal',count:kind==='pair'?2:1,plays:[{by:1,cards:kind==='pair'?[card('coin-'+before),card('sword-'+before)]:[card(suit+before)]}]}
    });
    round.players[ME].hand = [card(suit+after), card('cup-4')];
    if (kind === 'pair') round.players[ME].hand.push(card('sword-'+after));
    if (kind !== 'clear' && !Rules.play(round, ME, kind==='pair'?['coin-'+after,'sword-'+after]:[suit+after], 'normal').ok) throw Error('Illegal rule setup: '+kind);
    render();
};
`;

for (const motion of ['reduce', 'no-preference']) test('TROY tabletop rule props retain true flags and do not intercept controls ('+motion+')', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.route('**/ui.js?v=field-depth-v1', route => route.fulfill({
        contentType: 'text/javascript',
        body: fs.readFileSync('public/tabletop-v65/js/kingdomTable/ui.js', 'utf8') + fixture
    }));
    await page.goto('/tarot-kingdom-table.html?v=65');
    await page.getByRole('button',{ name:'CPU練習' }).click();
    await page.locator('input[name=ktSeats][value="3"]').check();
    await page.locator('#ktStart').click();
    await expect(page.locator('#ktTable')).toBeVisible();
    const layer = page.locator('#ktRuleProps');
    const scroll = () => page.evaluate(() => document.scrollingElement.scrollHeight);
    const controls = await page.locator('#ktActions').boundingBox();
    for (const kind of ['cut','back','lock']) {
        await page.evaluate(flag => window.rulePropFixture(flag), kind);
        await expect(layer).toBeVisible();
        await expect(layer).toHaveAttribute('aria-hidden','true');
        await expect(layer.locator('img').first()).toBeVisible();
        await expect.poll(() => layer.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        expect(await layer.evaluate(n => getComputedStyle(n).pointerEvents)).toBe('none');
        expect(await scroll()).toBe(568);
        expect(await page.locator('#ktActions').boundingBox()).toEqual(controls);
        if (kind==='cut' && motion==='no-preference') {
            const impact = layer.locator('.kt-rule-impact');
            await expect(impact).toHaveCount(1);
            if (process.env.TROY_RULE_PREVIEW) {
                await impact.evaluate(node => { const [animation] = node.getAnimations(); animation.pause(); animation.currentTime = 250; });
                await page.screenshot({ path: process.env.TEMP+'/TROY-rule-cut.png' });
                await impact.evaluate(node => node.getAnimations()[0]?.play());
            }
            await expect(impact).toHaveCount(0);
        }
        if (kind==='back' && motion==='no-preference') {
            const flip = layer.locator('.kt-hourglass-flip');
            await expect(flip).toHaveCount(1);
            await expect(flip).toHaveAttribute("src", /hourglass-before\.webp$/);
            await expect.poll(() => flip.evaluate(node=>node.getAnimations()[0]?.effect.getKeyframes().at(-1).transform)).toContain('180deg');
            await expect(flip).toHaveCount(0);
        }
        if (kind === 'back' || kind === 'lock') {
            const glass = layer.locator('[data-kind="back"] img:not(.kt-hourglass-flip)');
            await expect(glass).toHaveAttribute('src', /hourglass-reference\.webp$/);
            expect(await glass.evaluate(node=>getComputedStyle(node).transform)).toBe('none');
        }
        if (motion==='reduce') {
            await expect(layer.locator('.kt-hourglass-flip')).toHaveCount(0);
            await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
            expect(await layer.locator('img').evaluateAll(nodes=>nodes.every(node=>!node.getAnimations().length))).toBe(true);
        }
        if (kind==='lock') {
            await expect(layer.locator('img')).toHaveCount(2);
            await expect(page.locator('#ktFieldState')).toContainText('11バック');
            await expect(page.locator('#ktFieldState')).toContainText('ペンタクル');
            await expect(layer.locator('svg[data-suit="coin"]')).toHaveCount(1);
            if (process.env.TROY_RULE_PREVIEW && motion==='reduce') await page.screenshot({ path: process.env.TEMP+'/TROY-rule-lock-back.png' });
        }
    }
    await page.evaluate(() => window.rulePropFixture('stack'));
    await expect(layer.locator('.kt-rule-prop:not(.kt-rule-impact)')).toHaveCount(3);
    await expect(layer.locator('[data-kind="cut"]:not(.kt-rule-impact) img')).toHaveAttribute('src', /knife-reference/);
    const exactMug=layer.locator('[data-kind="lock"]');
    await expect(exactMug.locator('img')).toHaveAttribute('src', /tankard-reference/);
    await expect(exactMug.locator('.kt-rule-suits')).toBeHidden();
    await expect(layer.locator('svg[data-suit="coin"]')).toHaveCount(1);
    await expect(page.locator('#ktSeatRight .kt-seat-panel')).toHaveAttribute('data-turn','current');
    await expect(page.locator('#ktSeatLeft .kt-seat-panel')).toHaveAttribute('data-turn','next');
    await expect(page.locator('#ktFieldCards .kt-field-top [data-card="coin-8"]')).toBeVisible();
    expect(await scroll()).toBe(568);
    for (const control of await page.locator('#ktActions button').all()) {
       const {x,y,width,height} = await control.boundingBox();
       expect(x).toBeGreaterThanOrEqual(0);
       expect(x+width).toBeLessThanOrEqual(320);
       expect(y+height).toBeLessThanOrEqual(556);
    }
    await page.evaluate(() => window.rulePropFixture('alt'));
    await expect(layer.locator('[data-kind="lock"] img')).toHaveAttribute('src', /tankard.webp$/);
    await expect(layer.locator('svg[data-suit="sword"]')).toBeVisible();
    await page.evaluate(() => window.rulePropFixture('pair'));
    if (motion==='no-preference') await expect(layer.locator('.kt-rule-impact')).toHaveCount(1);
    else await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
    await expect(layer.locator('.kt-rule-impact')).toHaveCount(0);
    await page.evaluate(() => window.rulePropFixture('clear'));
    await expect(layer.locator(".kt-rule-prop:not(.kt-rule-impact)")).toHaveCount(0);
});
