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

async function waitForSpinToSettle(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('tarotSpinRoot');
    return !!root && !root.classList.contains('is-spinning');
  }, { timeout: 15_000 });
}

async function readSpinSnapshot(page) {
  return page.evaluate(() => ({
    spinLabel: document.getElementById('spinTarotSpinButton')?.textContent?.trim() || '',
    panelText: document.getElementById('tarotSpinRoot')?.innerText || '',
    holdButtons: document.querySelectorAll('[data-hold-index]').length,
    arcanaChoices: document.querySelectorAll('[data-arcana-choice]').length
  }));
}

async function waitForPokerInteractive(page) {
  await page.waitForFunction(() => {
    const startButton = document.getElementById('tarotStartButton');
    const betButtons = [
      document.getElementById('tarotBetCheck'),
      document.getElementById('tarotBetCall'),
      document.getElementById('tarotBetBet'),
      document.getElementById('tarotBetRaise'),
      document.getElementById('tarotBetFold')
    ].filter(Boolean);
    const hasEnabledBet = betButtons.some((button) => !button.disabled);
    const hasJudgmentChoice = Array.from(document.querySelectorAll('#tarotJudgmentOptions button')).some((button) => !button.disabled);
    return !!startButton && (!startButton.disabled || hasEnabledBet || hasJudgmentChoice);
  }, { timeout: 30_000 });
}

async function readPokerSnapshot(page) {
  return page.evaluate(() => {
    const betButtons = [
      document.getElementById('tarotBetCheck'),
      document.getElementById('tarotBetCall'),
      document.getElementById('tarotBetBet'),
      document.getElementById('tarotBetRaise'),
      document.getElementById('tarotBetFold')
    ].filter(Boolean);
    return {
      playerCards: document.getElementById('tarotPlayerHand')?.childElementCount || 0,
      cpuCards: document.getElementById('tarotCpuHand')?.childElementCount || 0,
      boardCards: document.getElementById('tarotPokerBoard')?.childElementCount || 0,
      logEntries: document.getElementById('tarotLog')?.childElementCount || 0,
      enabledBetButtons: betButtons.filter((button) => !button.disabled).length,
      judgmentChoices: document.querySelectorAll('#tarotJudgmentOptions button').length
    };
  });
}

async function clickFirstVisibleEnabled(page, selectors) {
  for (const selector of selectors) {
    const button = page.locator(selector);
    if (await button.isVisible() && await button.isEnabled()) {
      await button.click();
      return selector;
    }
  }
  return '';
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
  test('spin tarot preview can complete the initial deal', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/spin-tarot-preview.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Spin Tarot Preview/i);
    await expect(page.locator('#tarotSpinRoot')).toBeVisible();
    await expect(page.locator('#spinTarotSpinButton')).toBeVisible();
    await waitForSpinToSettle(page);

    const before = await readSpinSnapshot(page);
    await page.locator('#spinTarotSpinButton').click();
    await waitForSpinToSettle(page);
    const after = await readSpinSnapshot(page);

    expect(before.spinLabel).toBe('DEAL');
    expect(after.spinLabel).toBe('DRAW/SPIN');
    expect(after.panelText).toContain('HOLD PHASE');
    expect(after.holdButtons).toBeGreaterThan(0);
    await expectNoPageErrors(errors);
  });

  test('tarot poker preview can start a hand and accept a bet action', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/tarot-poker-preview.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Tarot Poker Preview/i);
    await expect(page.locator('#tarotStartButton')).toBeVisible();
    await waitForPokerInteractive(page);

    await page.locator('#tarotModeWithoutArcana').click();
    await expect(page.locator('#tarotModeWithoutArcana')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tarotModeWithArcana')).toHaveAttribute('aria-pressed', 'false');

    await page.locator('#tarotStartButton').click();
    await page.waitForFunction(() => {
      const playerCards = document.getElementById('tarotPlayerHand')?.childElementCount || 0;
      const cpuCards = document.getElementById('tarotCpuHand')?.childElementCount || 0;
      const betButtons = Array.from(document.querySelectorAll('#tarotBetPopup button'));
      const hasEnabledBet = betButtons.some((button) => !button.disabled);
      return playerCards > 0 && cpuCards > 0 && hasEnabledBet;
    }, { timeout: 30_000 });

    const actionSelector = await clickFirstVisibleEnabled(page, [
      '#tarotBetCheck',
      '#tarotBetCall',
      '#tarotBetBet',
      '#tarotBetRaise',
      '#tarotBetFold'
    ]);

    await waitForPokerInteractive(page);
    const snapshot = await readPokerSnapshot(page);

    expect(actionSelector).not.toBe('');
    expect(snapshot.playerCards).toBeGreaterThan(0);
    expect(snapshot.cpuCards).toBeGreaterThan(0);
    expect(snapshot.logEntries).toBeGreaterThan(0);
    expect(snapshot.enabledBetButtons + snapshot.judgmentChoices).toBeGreaterThan(0);
    await expectNoPageErrors(errors);
  });

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
