const { test, expect } = require('@playwright/test');

test('staff portal exposes every current staff operation', async ({ page }) => {
  await page.goto('/staff/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'スタッフポータル' })).toBeVisible();
  await expect(page.locator('.troy-staff-portal-card')).toHaveCount(5);
  await expect(page.locator('.troy-staff-portal-card-icon.is-music img')).toHaveAttribute('src', '/assets/ui/icons/044.png');

  await expect(page.getByRole('link', { name: '会計レジを開く' })).toHaveAttribute('href', '/troy-orders.html');
  await expect(page.getByRole('link', { name: 'TROY MUSIC GAMEを開く' })).toHaveAttribute('href', '/troy-music-game.html');
  await expect(page.getByRole('link', { name: 'タロット鑑定を開く' })).toHaveAttribute('href', '/tarot-reading.html');
  await expect(page.getByRole('link', { name: 'チップ返却QRを開く' })).toHaveAttribute('href', '/troy-coin-return.html');
  await expect(page.getByRole('link', { name: '店内ディスプレイを開く' })).toHaveAttribute('href', '/display.html');
});
