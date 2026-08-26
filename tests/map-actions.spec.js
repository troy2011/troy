const { test, expect } = require('@playwright/test');
const {
  DEFAULT_PLAYER_INFO,
  bootstrapMainApp,
  openMapTab,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

async function openReadyMap(page, options = {}) {
  await bootstrapMainApp(page, { fixedHour: 1, ...options });
  await openMapTab(page, DEFAULT_PLAYER_INFO);
  await expect(page.locator('#phaser-container canvas')).toHaveCount(1, { timeout: 15_000 });
}

test.describe('map actions', () => {
  test('removed exploration npc melee entry is not exposed', async ({ page }) => {
    await openReadyMap(page, { mockFirebaseDatabase: true });
    await expect.poll(() => page.evaluate(() => typeof window.startExplorationNpcBattle)).toBe('undefined');
  });
});
