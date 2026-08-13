const { test, expect } = require('@playwright/test');

async function mountModal(page) {
  await page.goto('/tarot-reading.html');
  await page.evaluate(async () => {
    const { bindModalClose } = await import('/js/modalClose.js');
    document.body.innerHTML = `
      <div id="testOverlay" style="position:fixed;inset:0;display:flex">
        <section style="position:relative;width:260px;height:180px;margin:auto">
          <button id="testClose" class="ui-modal-close" aria-label="閉じる"></button>
        </section>
      </div>`;
    window.testCloseCount = 0;
    const overlay = document.getElementById('testOverlay');
    const button = document.getElementById('testClose');
    const close = () => {
      window.testCloseCount += 1;
      overlay.hidden = true;
    };
    bindModalClose(button, close, {
      overlay,
      closeOnBackdrop: true,
      closeOnEscape: true,
      icon: true
    });
    bindModalClose(button, close, {
      overlay,
      closeOnBackdrop: true,
      closeOnEscape: true,
      icon: true
    });
  });
}

test('shared modal close button has one reliable 52px hit target', async ({ page }) => {
  await mountModal(page);
  const button = page.getByRole('button', { name: '閉じる' });
  const box = await button.boundingBox();
  expect(box?.width).toBe(52);
  expect(box?.height).toBe(52);

  await button.click({ position: { x: 3, y: 3 } });
  await expect.poll(() => page.evaluate(() => window.testCloseCount)).toBe(1);
});

test('shared modal close handles backdrop and Escape without duplicate callbacks', async ({ page }) => {
  await mountModal(page);
  await page.locator('#testOverlay').click({ position: { x: 4, y: 4 } });
  await expect.poll(() => page.evaluate(() => window.testCloseCount)).toBe(1);

  await page.evaluate(() => {
    const overlay = document.getElementById('testOverlay');
    overlay.hidden = false;
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.testCloseCount)).toBe(2);
});
