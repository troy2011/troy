const { test, expect } = require('@playwright/test');
const { bootstrapMainApp, trackPageErrors, expectNoPageErrors } = require('./helpers/main-app-harness');

// Long-pressing an item starts multi-select with that item chosen; taps then toggle items.
const INVENTORY = [
  { itemId: 'junk_001', instances: ['junk-stack'], count: 2, name: 'Junk', customData: { Category: 'Consumable', Effect: { Type: 'None' } } },
  { itemId: 'potion_001', instances: ['potion-stack'], count: 1, name: 'Potion', customData: { Category: 'Consumable', Effect: { Type: 'HP', Amount: 10 } } }
];

async function openInventory(page) {
  await page.route('**/api/get-inventory', route => route.fulfill({ json: { inventory: INVENTORY, virtualCurrency: { PS: 100 }, contribution: 0 } }));
  await page.route('**/api/get-equipment', route => route.fulfill({ json: { equipment: {} } }));
  await page.route('**/api/tarot-deck-get', route => route.fulfill({ json: { ok: true, tarotDeck: [], tarotRole: null } }));
  await bootstrapMainApp(page);
  await page.evaluate(async () => {
    const inventoryTab = document.getElementById('tabContentInventory');
    if (inventoryTab) inventoryTab.style.display = 'block';
    const inventory = await import('/js/inventory.js');
    await inventory.getInventory('PF_PLAYWRIGHT', { force: true });
    inventory.switchInventoryGroup('All', { panel: 'items' });
  });
}
const cell = (page, name) => page.locator('#inventoryGrid .inventory-item-cell', { hasText: name });

async function longPress(page, locator, ms = 650) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

for (const width of [320, 390, 430]) {
  test(`long-press starts multi-select and the check stays round at ${width}px`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.setViewportSize({ width, height: 844 });
    await openInventory(page);
    await expect(cell(page, 'Junk')).toBeVisible();

    await longPress(page, cell(page, 'Junk'));
    await expect(page.locator('#inventorySelectionBar')).toBeVisible();
    await expect(page.locator('#itemDetailModal')).toBeHidden();
    await expect(cell(page, 'Junk')).toHaveClass(/is-sell-selected/);
    await expect(page.locator('#inventorySelectionBar .inventory-selection-summary')).toHaveText('2個 2G');

    const checks = await page.locator('#inventoryGrid .inventory-sell-check').evaluateAll(nodes => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    expect(checks.length).toBe(2);
    for (const size of checks) {
      expect(size.width).toBeGreaterThan(20);
      expect(Math.abs(size.width - size.height)).toBeLessThan(0.5);
    }

    await cell(page, 'Potion').click();
    await expect(cell(page, 'Potion')).toHaveClass(/is-sell-selected/);
    await expect(page.locator('#inventorySelectionBar .inventory-selection-summary')).toHaveText('3個 3G');
    await cell(page, 'Junk').click();
    await expect(cell(page, 'Junk')).not.toHaveClass(/is-sell-selected/);
    await expect(page.locator('#itemDetailModal')).toBeHidden();
    await expectNoPageErrors(errors);
  });
}

test('a short tap still opens the item detail and a scroll drag does not start selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openInventory(page);
  await cell(page, 'Junk').click();
  await expect(page.locator('#itemDetailModal')).toBeVisible();
  await page.evaluate(() => window.closeItemDetailModal && window.closeItemDetailModal());
  await expect(page.locator('#itemDetailModal')).toBeHidden();

  const box = await cell(page, 'Junk').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 });
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(page.locator('#inventorySelectionBar')).toBeHidden();
});
