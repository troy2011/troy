const { test, expect } = require('@playwright/test');

test.describe('public shop MEO page', () => {
  test('exposes crawlable NAP, schedule access, actions, and structured data', async ({ page }) => {
    await page.goto('/shop/');

    await expect(page).toHaveTitle('海賊酒場TROY｜千葉県富里市十倉のアミューズメントバー');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('海賊の酒場');
    await expect(page.getByText('〒286-0212', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('千葉県富里市十倉310-401', { exact: true }).first()).toBeVisible();

    await expect(page.getByRole('link', { name: 'お問い合わせ' })).toHaveAttribute('href', 'tel:09047120670');

    const routeLink = page.getByRole('link', { name: 'Googleマップでルートを見る' });
    await expect(routeLink).toHaveAttribute('href', 'https://www.google.com/maps?cid=2095983393703557607');
    await expect(page.getByRole('navigation', { name: '来店アクション' }).getByRole('link', { name: 'メニュー' })).toHaveAttribute('href', '/shop/menu.html');

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
    expect(jsonLd.openingHoursSpecification).toBeUndefined();
    await expect(page.getByText('水曜定休')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '航海予定' })).toBeVisible();
    expect(jsonLd.menu).toBe('https://troy-xetw.onrender.com/shop/menu.html');
    expect(jsonLd.hasMenu).toBe('https://troy-xetw.onrender.com/shop/menu.html');
    expect(jsonLd.aggregateRating).toBeUndefined();
  });

  test('renders the public schedule and picks up updates without a LINE session', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    let calendar = [
      { date: '2030-12-04', status: 'open', openTime: '22:00', closeTime: '02:00', publicHelmName: 'カイ' },
      { date: '2030-12-06', status: 'private', openTime: '', closeTime: '', publicHelmName: '公開しない名前' }
    ];
    await page.route('**/api/troy-calendar/public', async (route) => {
      expect(route.request().method()).toBe('GET');
      expect(route.request().headers().authorization).toBeUndefined();
      await route.fulfill({ json: { calendar } });
    });
    await page.goto('/shop/#hours');
    await expect(page.locator('#shop-calendar-days')).toContainText('22:00–02:00');
    await expect(page.getByText('出航時間', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '航海予定' })).toBeVisible();
    await expect(page.locator('#shop-calendar-days')).toContainText('出航');
    await expect(page.locator('#shop-calendar-days')).toContainText('本日の舵取り：カイ');
    await expect(page.locator('#shop-calendar-days')).not.toContainText('公開しない名前');
    await expect(page.locator('#shop-calendar-days')).toContainText('貸切');
    await expect(page.locator('#shop-calendar-days > div')).toHaveCount(2);
    calendar = [{ date: '2030-12-04', status: 'closed', openTime: '', closeTime: '' }];
    await page.reload();
    await expect(page.locator('#shop-calendar-days')).toContainText('休航');
    await expect(page.locator('#shop-calendar-days')).not.toContainText('本日の舵取り');
    await expect(page.locator('#shop-calendar-days')).not.toContainText('22:00');
    calendar = [];
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('今後の航海予定はまだ掲載されていません。');
  });

  test('keeps the calendar failure separate from a closure', async ({ page }) => {
    await page.route('**/api/troy-calendar/public', (route) => route.fulfill({ status: 503 }));
    await page.goto('/shop/#hours');
    await expect(page.getByRole('status')).toContainText('航海予定を読み込めませんでした');
    await expect(page.locator('#shop-calendar-days > div')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /お電話で営業を確認/ })).toBeVisible();
  });

  test('publishes a complete standalone menu', async ({ page }) => {
    await page.goto('/shop/menu.html');

    await expect(page).toHaveTitle('メニュー｜海賊酒場TROY');
    await expect(page.getByRole('heading', { name: '酒場のメニュー', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ドリンク', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '酒場のフード', level: 2 })).toBeVisible();
    await expect(page.getByText('ジントニック', { exact: true })).toBeVisible();
    await expect(page.getByText('カップ麺', { exact: true })).toBeVisible();
    await expect(page.getByText('フライドポテト', { exact: true })).toHaveCount(0);
    await expect(page.getByText('フード持ち込み料：¥500', { exact: true })).toBeVisible();
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
        ...Object.entries(TROY_PRODUCT_MENUS).flatMap(([id, category]) => id === 'food'
          ? category.items.filter((item) => item.concept === 'カップラーメン') : category.items),
        ...TROY_BOTTLE_ITEMS
      ].map((item) => ({
        name: item.menuLabel || item.concept,
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
    await page.setViewportSize({ width: 375, height: 667 });
    await page.route('**/api/troy-calendar/public', (route) => route.fulfill({
      json: { calendar: [{ date: '2030-12-04', status: 'open', openTime: '23:00', closeTime: '01:00' }] }
    }));
    await page.goto('/shop/');

    const mobileActions = page.getByRole('navigation', { name: '来店アクション' });
    await expect(mobileActions).toBeVisible();
    await expect(mobileActions.getByRole('link', { name: 'お問い合わせ' })).toHaveAttribute('href', 'tel:09047120670');
    await expect(mobileActions.getByRole('link', { name: 'メニュー' })).toHaveAttribute('href', '/shop/menu.html');
    await expect(mobileActions.getByRole('link', { name: 'アクセス' })).toHaveAttribute('href', '#access');
    await expect(page.getByText('23:00–01:00')).toBeInViewport();
    await expect(page.getByText('営業日を見る', { exact: true })).toHaveCount(0);
    await expect(page.locator('.home-play-grid img')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.getByLabel('サイトメニュー').click();
    await expect(page.getByRole('navigation', { name: '店舗情報ナビゲーション' })).toBeVisible();
  });

  test('keeps visit actions visible on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/shop/');

    await expect(page.getByRole('navigation', { name: '来店アクション' })).toBeVisible();
  });

  test('keeps operational and demo pages out of search results', async ({ request }) => {
    const noindexPages = [
      '/display.html',
      '/tarot-kingdom-preview.html',
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
