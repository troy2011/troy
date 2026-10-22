const { test, expect } = require('@playwright/test');
async function open(page) {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle');
    await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
}
for (const mode of ['offline', 'online'])
    test('ordinary ' + mode + ' uses the final World exception and wins without effects', async ({ page }) => {
        await open(page);
        const result = await page.evaluate(mode => {
            const d = window.TarotKingdomDebug;
            d.battleSetStartMode(mode);
            d.battleScenario({ withTrick: false, playerCount: 3, rules: { openingRescueVersion: 1 }, handsBySeat: [[{ id: 'world', kind: 'major', number: 21, suit: 'None' }], [{ id: 'b', kind: 'minor', number: 2, suit: 'Wand' }], [{ id: 'c', kind: 'minor', number: 3, suit: 'Cup' }]], drawDeck: [{ id: 'draw', kind: 'minor', number: 7, suit: 'Sword' }] });
            return d.battlePlayCards(0, ['world']);
        }, mode);
        expect(result.ok).toBe(true);
        expect(result.state.phase).toBe('roundOutCinematic');
        expect(result.state.players[0].hand).toHaveLength(0);
        expect(result.state.drawDeck).toHaveLength(1);
        expect(result.state.battle.outcome).toBe('victory');
    });
test('mobile rulebook shows the proposal only in a new ordinary match', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.TarotKingdomDebug.battleScenario({ withTrick: false, rules: { openingRescueVersion: 1 } }));
    await page.locator('#tarotKingdomRulebookButton').click();
    await expect(page.locator('[data-opening-rescue-rules]')).toHaveCount(1);
    expect(await page.locator('[data-opening-rescue-rules]').getAttribute('hidden')).toBe(null);
    await expect(page.locator('[data-opening-rescue-rules]')).toContainText('強制ドロー3回による脱落はありません');
    await page.locator('[data-rulebook-target="tarotKingdomRulesHelp"]').first().click();
    await expect(page.locator('[data-opening-rescue-rules]')).toBeVisible();
    await expect.poll(async () => page.locator('[data-opening-rescue-rules]').evaluate(note => {
        const rect = note.getBoundingClientRect();
        return rect.top >= 0 && rect.top < innerHeight;
    })).toBe(true);
    if (process.env.KINGDOM_RULES_EVIDENCE) {
        await page.screenshot({ path: process.env.KINGDOM_RULES_EVIDENCE, fullPage: false });
    }
    await page.locator('[data-rulebook-close]').first().click();
    await page.evaluate(() => window.TarotKingdomDebug.battleScenario({ withTrick: false, rules: { openingRescueVersion: 0 } }));
    await page.locator('#tarotKingdomRulebookButton').click();
    await expect(page.locator('[data-opening-rescue-rules]')).toHaveAttribute('hidden', '');
});
