const { test, expect } = require('@playwright/test');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

// From the daily fortune result the player can jump to the card in the inventory,
// where it is marked NEW; ranking rewards show item names, and major arcana fragments are listed.
const WANDS = { itemId: 'minor-wands-1', name: 'ワンドのエース', count: 1, customData: { Category: 'TarotMinor', ArcanaSuit: 'Wands', ArcanaRank: '1', CardNumber: '1' } };
const SWORDS = { itemId: 'minor-swords-3', name: 'ソードの3', count: 1, customData: { Category: 'TarotMinor', ArcanaSuit: 'Swords', ArcanaRank: '3', CardNumber: '3' } };
const TICKET = { itemId: 'equip_gacha_ticket', name: '装備ガチャチケット', count: 1, customData: { Category: 'Consumable', Effect: { Type: 'None' } } };
const dayKey = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function cardResult() {
  return { dayKey: dayKey(), cardId: 'minor-swords-3', cardNumber: 3, suit: 'Swords', isArcana: false, cardName: 'ソードの3', orientation: 'reversed', strikeLine: 'まず今わかることを一つ確かめ、次の一歩を選んでください。', rewardPs: 3, rewardType: 'card', rewardItemId: 'minor-swords-3', rewardItemName: 'ソードの3', rewardItemAmount: 1, rewardCardGranted: true, rewardFragmentAmount: 0 };
}
function fragmentResult() {
  return { dayKey: dayKey(), cardId: 'arcana-18', cardNumber: 18, suit: 'None', isArcana: true, cardName: '月', orientation: 'reversed', strikeLine: 'まず今わかることを一つ確かめ、次の一歩を選んでください。', rewardPs: 18, rewardType: 'fragment', rewardItemId: 'arcana-18', rewardItemName: '月', rewardItemAmount: 0, rewardCardGranted: false, rewardFragmentAmount: 1, rewardFragmentCount: 1, rewardFragmentRequired: 2 };
}

async function drawFortune(page, { result, bounty = null }) {
  let drew = false;
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/api/get-inventory', route => route.fulfill({ json: {
    inventory: drew ? [WANDS, ...(result.rewardCardGranted ? [SWORDS] : []), ...(bounty ? [TICKET] : [])] : [WANDS],
    virtualCurrency: { PS: 100 }, contribution: 0 } }));
  await page.route('**/api/get-equipment', route => route.fulfill({ json: { equipment: {} } }));
  await page.route('**/api/tarot-deck-get', route => route.fulfill({ json: { ok: true, tarotDeck: [], tarotRole: null } }));
  await page.route('**/api/tarot-fortune-status', route => route.fulfill({ json: { canDraw: true, result: null } }));
  await page.route('**/api/tarot-fortune-fragments', route => route.fulfill({ json: { ok: true, required: 2,
    fragments: drew && !result.rewardCardGranted ? [{ cardId: 'arcana-18', cardName: '月', cardNumber: 18, count: 1 }] : [] } }));
  await page.route('**/api/tarot-fortune-draw', route => {
    drew = true;
    return route.fulfill({ json: { ok: true, balance: 103, awarded: result.rewardPs, result,
      ...(bounty ? { dailyBountyReward: { awarded: true, rank: 2, rewardDayKey: '2026-11-04', pulls: 1, items: [{ itemId: TICKET.itemId, amount: 1 }] } } : {}) } });
  });
  await bootstrapMainApp(page);
  await page.locator('#btnDailyFortune').click();
  await page.locator('#dailyTarotFortuneCardHost button').first().click();
  await expect(page.locator('#dailyTarotFortuneText')).toContainText('次の一歩', { timeout: 15000 });
}

for (const width of [320, 390, 430]) {
  test(`a drawn card opens in the inventory marked NEW, with reward names, at ${width}px`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.setViewportSize({ width, height: 844 });
    await drawFortune(page, { result: cardResult(), bounty: true });

    const reward = page.locator('#dailyTarotFortuneReward');
    await expect(reward).toContainText('「ソードの3」を1枚手に入れた。');
    await expect(page.locator('#dailyTarotFortuneBounty')).toContainText('装備ガチャチケット');
    await expect(page.locator('#dailyTarotFortuneBounty')).not.toContainText('equip_gacha_ticket');
    const button = reward.getByRole('button', { name: '持ち物で見る' });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width);

    await button.click();
    await expect(page.locator('#dailyTarotFortuneOverlay')).toBeHidden();
    await expect(page.locator('#tabContentInventory')).toBeVisible();
    await expect(page.getByRole('tab', { name: '小アルカナ', exact: true })).toHaveAttribute('aria-selected', 'true');
    const cell = page.locator('#inventoryGrid .inventory-item-cell[data-item-id="minor-swords-3"]');
    await expect(cell).toHaveClass(/is-new/);
    await expect(cell.locator('.inventory-item-badge.is-new')).toHaveText('NEW');
    await expect(cell).toBeInViewport();
    await expect(page.locator('#inventoryGrid .inventory-item-cell[data-item-id="minor-wands-1"]')).not.toHaveClass(/is-new/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectNoPageErrors(errors);
  });
}

test('a major arcana fragment opens the fragment list in the inventory', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await drawFortune(page, { result: fragmentResult() });

  const reward = page.locator('#dailyTarotFortuneReward');
  await expect(reward).toContainText('「月」の欠片を1個受け取った。（1/2）');
  await reward.getByRole('button', { name: '欠片を持ち物で見る' }).click();

  await expect(page.getByRole('tab', { name: '大アルカナ', exact: true })).toHaveAttribute('aria-selected', 'true');
  const strip = page.locator('#inventoryFortuneFragments');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('集めている欠片（2個でカード1枚）');
  await expect(strip.locator('[data-card-id="arcana-18"]')).toHaveText(/月\s*1\/2/);

  await page.getByRole('tab', { name: '小アルカナ', exact: true }).click();
  await expect(strip).toBeHidden();
  await expectNoPageErrors(errors);
});
