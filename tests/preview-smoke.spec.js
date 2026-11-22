const { test, expect } = require('@playwright/test');

function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message || String(error));
  });
  return errors;
}

async function expectNoPageErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}

async function waitForKingdomDoneState(page) {
  await page.waitForFunction(() => {
    const button = document.getElementById('tarotKingdomSettlementConfirmButton');
    return !!button && !button.hidden;
  }, { timeout: 20_000 });
}

async function waitForKingdomOfflineStart(page) {
  await page.waitForFunction(() => {
    const hand = document.getElementById('tarotKingdomHand');
    const players = document.getElementById('tarotKingdomPlayers');
    return !!hand && !!players && hand.childElementCount > 0 && players.childElementCount > 0;
  }, { timeout: 20_000 });
}

async function readKingdomSnapshot(page) {
  return page.evaluate(() => {
    const settlementButton = document.getElementById('tarotKingdomSettlementConfirmButton');
    const restartButton = document.getElementById('tarotKingdomRestartButton');
    return {
      handCards: document.getElementById('tarotKingdomHand')?.childElementCount || 0,
      players: document.getElementById('tarotKingdomPlayers')?.childElementCount || 0,
      logEntries: document.getElementById('tarotKingdomLog')?.childElementCount || 0,
      settlementVisible: !!settlementButton && !settlementButton.hidden,
      restartVisible: !!restartButton && !restartButton.hidden
    };
  });
}

test.describe('preview smoke', () => {
  test('tarot kingdom preview exposes the debug done state', async ({ page }) => {
    test.slow();
    const errors = trackPageErrors(page);

    await page.goto('/tarot-kingdom-preview.html?tkdebug=done&tkwinner=2', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Tarot Kingdom Preview/i);
    await waitForKingdomDoneState(page);
    const snapshot = await readKingdomSnapshot(page);

    expect(snapshot.settlementVisible).toBe(true);
    expect(snapshot.players).toBeGreaterThan(0);
    expect(snapshot.logEntries).toBeGreaterThan(0);
    await expectNoPageErrors(errors);
  });

  test('tarot kingdom preview can start an offline match', async ({ page }) => {
    test.slow();
    const errors = trackPageErrors(page);

    await page.goto('/tarot-kingdom-preview.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Tarot Kingdom Preview/i);
    await expect(page.locator('#tarotKingdomStartOfflineButton')).toBeVisible();
    await page.locator('#tarotKingdomStartOfflineButton').click();
    await waitForKingdomOfflineStart(page);

    const snapshot = await readKingdomSnapshot(page);
    expect(snapshot.handCards).toBeGreaterThan(0);
    expect(snapshot.players).toBeGreaterThan(0);
    expect(snapshot.logEntries).toBeGreaterThan(0);
    await expectNoPageErrors(errors);
  });
});
