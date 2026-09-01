const { test, expect } = require('@playwright/test');

test.describe('public shop MEO page', () => {
  test('exposes crawlable NAP, hours, actions, and structured data', async ({ page }) => {
    await page.goto('/shop/');

    await expect(page).toHaveTitle('海賊酒場TROY｜千葉県富里市十倉のアミューズメントバー');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('海賊の酒場へ');
    await expect(page.getByText('〒286-0212', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('千葉県富里市十倉310-401', { exact: true }).first()).toBeVisible();

    const phoneLinks = page.locator('a[href="tel:09047120670"]');
    await expect(phoneLinks.first()).toBeVisible();
    await expect(phoneLinks).toHaveCount(4);

    const routeLink = page.getByRole('link', { name: 'Googleマップでルートを見る' });
    await expect(routeLink).toHaveAttribute('href', 'https://www.google.com/maps?cid=2095983393703557607');
    await expect(page.getByRole('link', { name: 'メニューをすべて見る' })).toHaveAttribute('href', '/shop/menu.html');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://troy-xetw.onrender.com/shop/');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /富里市十倉/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /海賊酒場TROY/);

    const jsonLdText = await page.locator('script[type="application/ld+json"]').textContent();
    const jsonLd = JSON.parse(jsonLdText);
    expect(jsonLd['@type']).toBe('BarOrPub');
    expect(jsonLd.name).toBe('海賊酒場TROY');
    expect(jsonLd.telephone).toBe('+81-90-4712-0670');
    expect(jsonLd.address).toMatchObject({
      postalCode: '286-0212',
      addressRegion: '千葉県',
      addressLocality: '富里市',
      streetAddress: '十倉310-401',
      addressCountry: 'JP'
    });
    expect(jsonLd.openingHoursSpecification.opens).toBe('21:00');
    expect(jsonLd.openingHoursSpecification.closes).toBe('00:00');
    expect(jsonLd.openingHoursSpecification.dayOfWeek).not.toContain('https://schema.org/Wednesday');
    expect(jsonLd.menu).toBe('https://troy-xetw.onrender.com/shop/menu.html');
    expect(jsonLd.hasMenu).toBe('https://troy-xetw.onrender.com/shop/menu.html');
    expect(jsonLd.aggregateRating).toBeUndefined();
  });

  test('publishes a complete standalone menu', async ({ page }) => {
    await page.goto('/shop/menu.html');

    await expect(page).toHaveTitle('メニュー｜海賊酒場TROY');
    await expect(page.getByRole('heading', { name: '酒場のメニュー', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ドリンク', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '酒場のフード', level: 2 })).toBeVisible();
    await expect(page.getByText('ジントニック', { exact: true })).toBeVisible();
    await expect(page.getByText('フライドポテト', { exact: true })).toBeVisible();
    await expect(page.getByText('お酒は20歳になってから。', { exact: false })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://troy-xetw.onrender.com/shop/menu.html');
  });

  test('publishes operator, privacy, terms, and a retired integration notice', async ({ page, request }) => {
    const pages = [
      '/shop/about.html',
      '/shop/privacy.html',
      '/shop/terms.html'
    ];
    for (const path of pages) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be public`).toBeTruthy();
      expect(await response.text(), `${path} should be indexable`).toContain('name="robots" content="index,follow"');
    }

    const retiredResponse = await request.get('/shop/business-profile-sync.html');
    expect(retiredResponse.ok()).toBeTruthy();
    expect(await retiredResponse.text()).toContain('name="robots" content="noindex,follow"');

    await page.goto('/shop/business-profile-sync.html');
    await expect(page.getByRole('heading', { name: '営業時間同期機能を廃止しました', level: 1 })).toBeVisible();
    await expect(page.getByText('TROYからGoogle APIへ読み取り・更新・同期は行いません', { exact: false })).toBeVisible();

    await page.goto('/shop/privacy.html');
    await expect(page.getByRole('heading', { name: 'プライバシーポリシー', level: 1 })).toBeVisible();
    await expect(page.getByText('Google Business Profile API', { exact: false })).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://troy-xetw.onrender.com/shop/privacy.html');
  });

  test('keeps the public menu aligned with the ordering data', async ({ page }) => {
    await page.goto('/shop/menu.html');

    const expectedRows = await page.evaluate(async () => {
      const { TROY_PRODUCT_MENUS, TROY_BOTTLE_ITEMS } = await import('/js/troyMenuData.js');
      return [
        ...Object.values(TROY_PRODUCT_MENUS).flatMap((category) => category.items),
        ...TROY_BOTTLE_ITEMS
      ].map((item) => ({
        name: item.concept,
        price: `${item.price}${item.sizeOptions?.length ? '〜' : ''}`
      }));
    });
    const publishedRows = await page.locator('.menu-category dl > div').evaluateAll((rows) => rows.map((row) => ({
      name: row.querySelector('dt').childNodes[0].textContent.trim(),
      price: row.querySelector('dd').textContent.replace(/[¥,]/g, '').trim()
    })));
    const byNameAndPrice = (left, right) => `${left.name}\u0000${left.price}`.localeCompare(`${right.name}\u0000${right.price}`, 'ja');

    expect(publishedRows.sort(byNameAndPrice)).toEqual(expectedRows.sort(byNameAndPrice));
  });

  test('keeps visit actions visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/shop/');

    const mobileActions = page.getByRole('navigation', { name: '来店アクション' });
    await expect(mobileActions).toBeVisible();
    await expect(mobileActions.getByRole('link', { name: '電話' })).toHaveAttribute('href', 'tel:09047120670');
    await expect(mobileActions.getByRole('link', { name: 'メニュー' })).toHaveAttribute('href', '/shop/menu.html');
    await expect(mobileActions.getByRole('link', { name: 'ルート' })).toHaveAttribute('href', 'https://www.google.com/maps?cid=2095983393703557607');
  });

  test('keeps visit actions visible on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/shop/');

    await expect(page.getByRole('navigation', { name: '来店アクション' })).toBeVisible();
  });

  test('keeps operational and demo pages out of search results', async ({ request }) => {
    const noindexPages = [
      '/display.html',
      '/spin-tarot-preview.html',
      '/tarot-kingdom-preview.html',
      '/tarot-poker-preview.html',
      '/tarot-reading.html',
      '/troy-coin-return.html',
      '/troy-orders.html'
    ];

    for (const path of noindexPages) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be available`).toBeTruthy();
      expect(await response.text(), `${path} should be noindex`).toContain('name="robots" content="noindex,follow"');
    }
  });

  test('publishes robots and sitemap discovery files', async ({ request }) => {
    const home = await request.get('/');
    expect(home.ok()).toBeTruthy();
    expect(await home.text()).toContain('name="google-site-verification" content="I52q_TXXAk_RGfkozH2Xcc-ftUyLUoGo17svTraJw7w"');

    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain('Sitemap: https://troy-xetw.onrender.com/sitemap.xml');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain('<loc>https://troy-xetw.onrender.com/shop/</loc>');
    expect(sitemapText).toContain('<loc>https://troy-xetw.onrender.com/shop/menu.html</loc>');
    expect(sitemapText).toContain('<loc>https://troy-xetw.onrender.com/shop/about.html</loc>');
    expect(sitemapText).not.toContain('<loc>https://troy-xetw.onrender.com/shop/business-profile-sync.html</loc>');
    expect(sitemapText).toContain('<loc>https://troy-xetw.onrender.com/shop/privacy.html</loc>');
    expect(sitemapText).toContain('<loc>https://troy-xetw.onrender.com/shop/terms.html</loc>');
  });
});
