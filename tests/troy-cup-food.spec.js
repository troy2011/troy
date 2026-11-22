const { test, expect } = require('@playwright/test');
test('public shop only lists cup noodle as food and separately discloses carry-in fee', async ({page})=>{
  await page.goto('/shop/');
  await expect(page.locator('article').filter({hasText:'FOOD'})).toContainText('カップ麺');
  await page.goto('/shop/menu.html');
  await expect(page.locator('#food dt')).toHaveText(['カップ麺']);
  await expect(page.locator('#food dd')).toHaveText(['¥500']);
  await expect(page.locator('#food p.responsible-note')).toHaveText('フード持ち込み料：¥500');
  await expect(page.getByText('ナゲット')).toHaveCount(0);
});
