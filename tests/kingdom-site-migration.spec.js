const { test, expect } = require('@playwright/test');
for (const width of [320, 390]) {
  test(`legacy table URLs retain an accessible migration route at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, javaScriptEnabled: false });
    const page = await context.newPage();
    const requests = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      return url.origin === baseURL ? route.continue() : route.abort();
    });
    for (const file of ['tarot-kingdom-table.html', 'tarot-kingdom-table-rules.html']) {
      await page.goto(`/${file}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('独立サイトへ移転');
      await expect(page.getByRole('link')).toHaveAttribute('href', `https://tarot-kingdom-online.bar-troy2011.chatgpt.site/${file}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('script').count()).toBe(0);
    }
    expect(requests.every(path => path.endsWith('.html'))).toBe(true);
    await context.close();
  });
}
