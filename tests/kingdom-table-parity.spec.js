const { test, expect } = require('@playwright/test');
async function open(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle');
  await page.waitForFunction(() => !!window.TarotKingdomDebug?.battleScenario);
}
test('ordinary card matches use the directional cycle with and without back', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(() => {
    const d = window.TarotKingdomDebug, suits = ['Wand', 'Cup', 'Sword', 'Pentacle'];
    return [false, true].flatMap(reverse => suits.flatMap((field, index) => suits.map((suit, reply) => {
      d.battleScenario({ reverse, playerCount: 3, rules: { tableRulesVersion: 1, openingRescueVersion: 1 },
        tableCard: { id: 'field', kind: 'minor', suit: field, number: 6 },
        handsBySeat: [[{ id: 'reply', kind: 'minor', suit, number: 6 }, { id: 'spare', kind: 'minor', suit: 'Wand', number: 2 }], [], []] });
      return { expected: reply === (index + 1) % 4, actual: d.battleRebuildAction(0, { selectedCardIds: ['reply'] }).ok };
    })));
  });
  for (const result of results) expect(result.actual).toBe(result.expected);
});
test('restricted final cards gain one han only on an empty field', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(() => {
    const d = window.TarotKingdomDebug;
    return [15, 16, 17, 18, 19, 21].map(number => {
      const hand = [{ id: 'last', kind: 'major', number, suit: 'None' }];
      const config = { playerCount: 3, starsBySeat: [0, 0, 0], rules: { tableRulesVersion: 1, openingRescueVersion: 1 },
        handsBySeat: [hand, [{ id: 'b', kind: 'minor', number: 2, suit: 'Wand' }], [{ id: 'c', kind: 'minor', number: 3, suit: 'Cup' }]] };
      d.battleScenario({ ...config, withTrick: false });
      const empty = d.battlePlayCards(0, ['last']);
      d.battleScenario({ ...config, tableCard: { id: 'occupied', kind: 'minor', number: 7, suit: 'Cup' } });
      const occupied = d.battleRebuildAction(0, { selectedCardIds: ['last'] });
      return { number, ok: empty.ok, stars: empty.state.players[0].stars, occupied: occupied.ok };
    });
  });
  for (const result of results) { expect(result.ok).toBe(true); expect(result.stars).toBe(1); }
  expect(results.find(r => r.number === 21).occupied).toBe(false);
  expect(results.find(r => r.number === 16).occupied).toBe(false);
});
test('ordinary rules protect minor aces and display the new rules on mobile', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await page.evaluate(() => {
    const d = window.TarotKingdomDebug;
    d.battleScenario({ rules: { tableRulesVersion: 1, openingRescueVersion: 1, majorArcanaGateVersion: 2 },
      tableCard: { id: 'ace', kind: 'minor', number: 1, suit: 'Sword' },
      handsBySeat: [[{ id: 'tower', kind: 'major', number: 16, suit: 'None' }], [], []] });
    return d.battleRebuildAction(0, { selectedCardIds: ['tower'] });
  });
  expect(result.ok).toBe(false);
  await page.locator('#tarotKingdomRulebookButton').click();
  await expect(page.locator('[data-table-card-rules]')).toContainText('ザ・ワールド・ストレートフラッシュ5翻');
  await expect(page.locator('[data-legacy-harmony]').last()).toBeHidden();
});
test('ordinary role rewards use card-match han while combat rates stay unchanged', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(() => {
    const d = window.TarotKingdomDebug;
    return [false, true].map(call => {
      const majors = [2, 3, 4, 5, 21].map(number => ({ id: `m${number}`, kind: 'major', number, suit: 'None' }));
      const cards = call ? majors.slice(1) : majors;
      d.battleScenario({ withTrick: call, tableCard: majors[0], playerCount: 3, starsBySeat: [0, 0, 0],
        rules: { tableRulesVersion: 1, openingRescueVersion: 1 },
        handsBySeat: [cards, [{ id: 'b', kind: 'minor', number: 2, suit: 'Wand' }], [{ id: 'c', kind: 'minor', number: 3, suit: 'Cup' }]] });
      const built = d.battleRebuildAction(0, { selectedCardIds: cards.map(c => c.id) });
      const result = d.battlePlayCards(0, cards.map(c => c.id));
      return { call, built: built.ok, ok: result.ok, stars: result.state.players[0].stars, rate: built.play?.role?.baseRate };
    });
  });
  expect(results).toEqual([
    { call: false, built: true, ok: true, stars: 6, rate: 3 },
    { call: true, built: true, ok: true, stars: 5, rate: 3 },
  ]);
});
