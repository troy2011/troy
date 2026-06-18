const { test, expect } = require('@playwright/test');

test('decorated panel border images render with 25 slice cells', async ({ page }) => {
  await page.route('**/main.js*', (route) => route.abort());
  await page.goto('/index.html');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="/css/panel-slice-25.css?v=test">
        <style>
          #panel {
            width: 360px;
            height: 180px;
            border: 32px solid transparent;
            border-image: url("/assets/ui/panels/panel-dark-gold.png") 32 fill / 16px / 0 stretch;
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        <div id="panel"><p>content</p></div>
      </body>
    </html>
  `);

  await page.evaluate(async () => {
    const module = await import('/js/panelSlice25.js');
    module.installPanelSlice25(document);
  });

  const layer = page.locator('#panel > .panel-slice-25-layer');
  await expect(layer).toHaveCount(1);
  await expect(layer.locator('> .panel-slice-25-fill')).toHaveCount(1);
  await expect(layer.locator('> .panel-slice-25-cell')).toHaveCount(25);

  const metrics = await page.locator('#panel').evaluate((panel) => {
    const layerEl = panel.querySelector('.panel-slice-25-layer');
    const topCenter = layerEl.querySelector('[data-slice-row="0"][data-slice-col="2"]');
    const topStretch = layerEl.querySelector('[data-slice-row="0"][data-slice-col="1"]');
    const middleCenter = layerEl.querySelector('[data-slice-row="2"][data-slice-col="2"]');
    const panelStyle = window.getComputedStyle(panel);
    const topCenterRect = topCenter.getBoundingClientRect();
    const topStretchRect = topStretch.getBoundingClientRect();
    const middleCenterRect = middleCenter.getBoundingClientRect();
    return {
      borderImageSource: panelStyle.borderImageSource,
      hasFill: Boolean(layerEl.querySelector('.panel-slice-25-fill')),
      layerCells: layerEl.querySelectorAll('.panel-slice-25-cell').length,
      topCenterWidth: Math.round(topCenterRect.width),
      topStretchWidth: Math.round(topStretchRect.width),
      middleCenterHeight: Math.round(middleCenterRect.height)
    };
  });

  expect(metrics.borderImageSource).toBe('none');
  expect(metrics.hasFill).toBe(true);
  expect(metrics.layerCells).toBe(25);
  expect(metrics.topCenterWidth).toBeGreaterThan(8);
  expect(metrics.topCenterWidth).toBeLessThan(metrics.topStretchWidth);
  expect(metrics.middleCenterHeight).toBeGreaterThan(8);

  await page.locator('#panel').evaluate((panel) => {
    panel.style.width = '420px';
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel');
    const fill = panel.querySelector('.panel-slice-25-fill');
    return fill && window.getComputedStyle(panel).getPropertyValue('--panel-slice-25-border-top').trim() === '16px';
  });

  const rerenderMetrics = await page.locator('#panel').evaluate((panel) => {
    const layerEl = panel.querySelector('.panel-slice-25-layer');
    const fill = layerEl.querySelector('.panel-slice-25-fill');
    return {
      borderTopVar: window.getComputedStyle(panel).getPropertyValue('--panel-slice-25-border-top').trim(),
      fillCount: layerEl.querySelectorAll('.panel-slice-25-fill').length,
      cellCount: layerEl.querySelectorAll('.panel-slice-25-cell').length,
      fillWidth: Math.round(fill.getBoundingClientRect().width)
    };
  });

  expect(rerenderMetrics.borderTopVar).toBe('16px');
  expect(rerenderMetrics.fillCount).toBe(1);
  expect(rerenderMetrics.cellCount).toBe(25);
  expect(rerenderMetrics.fillWidth).toBeGreaterThan(0);
});

test('compact chrome controls are not auto-upgraded to 25 slice panels', async ({ page }) => {
  await page.route('**/main.js*', (route) => route.abort());
  await page.goto('/index.html');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="/css/panel-slice-25.css?v=test">
        <style>
          .currency-display,
          button,
          input {
            border: 16px solid transparent;
            border-image: url("/assets/ui/panels/panel-dark.png") 30 fill / 12px / 0 stretch;
          }
          .currency-display::before {
            content: "";
            width: 30px;
            height: 30px;
            display: inline-block;
            background: url("/assets/ui/icons/002.png") center / contain no-repeat;
          }
          .manual-panel {
            width: 180px;
            height: 88px;
            border: 24px solid transparent;
            border-image: url("/assets/ui/panels/panel-dark.png") 30 fill / 12px / 0 stretch;
          }
        </style>
      </head>
      <body>
        <div class="currency-display"><b id="globalPoints">123</b>G</div>
        <button type="button">押す</button>
        <input value="入力">
        <div class="manual-panel" data-panel-slice="25">manual</div>
      </body>
    </html>
  `);

  await page.evaluate(async () => {
    const module = await import('/js/panelSlice25.js');
    module.installPanelSlice25(document);
  });

  await page.waitForSelector('.manual-panel > .panel-slice-25-layer');
  await expect(page.locator('.manual-panel > .panel-slice-25-layer > .panel-slice-25-cell')).toHaveCount(25);
  await expect(page.locator('.currency-display > .panel-slice-25-layer')).toHaveCount(0);
  await expect(page.locator('button > .panel-slice-25-layer')).toHaveCount(0);
  await expect(page.locator('input > .panel-slice-25-layer')).toHaveCount(0);

  const currencyBefore = await page.locator('.currency-display').evaluate((element) => {
    const beforeStyle = window.getComputedStyle(element, '::before');
    return {
      content: beforeStyle.content,
      backgroundImage: beforeStyle.backgroundImage,
      width: beforeStyle.width
    };
  });

  expect(currencyBefore.content).not.toBe('none');
  expect(currencyBefore.backgroundImage).toContain('002.png');
  expect(currencyBefore.width).toBe('30px');
});

test('gold plaque banner images render as 5 by 3 slices wherever reused', async ({ page }) => {
  await page.route('**/main.js*', (route) => route.abort());
  await page.goto('/index.html');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="/css/panel-slice-25.css?v=test">
        <style>
          .home-announcement-panel,
          .section-plaque,
          .item-detail-copy {
            width: 320px;
            min-height: 56px;
            border: 18px solid transparent;
            border-image: url("/assets/ui/banners/banner-plaque-gold.png") 38 32 30 32 fill / 18px 17px 15px 17px / 0 stretch;
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        <section class="home-announcement-panel"><span>王の告知</span></section>
        <h2 class="section-plaque">見出し</h2>
        <div class="item-detail-copy">詳細</div>
      </body>
    </html>
  `);

  await page.evaluate(async () => {
    const module = await import('/js/panelSlice25.js');
    module.installPanelSlice25(document);
  });

  const plaques = page.locator('.home-announcement-panel, .section-plaque, .item-detail-copy');
  await expect(plaques).toHaveCount(3);
  await expect(page.locator('.panel-slice-25-layer[data-source="banner-plaque-gold.png"]')).toHaveCount(3);
  await expect(page.locator('.panel-slice-25-layer[data-source="banner-plaque-gold.png"][data-slice-grid="5x3"]')).toHaveCount(3);
  await expect(page.locator('.panel-slice-25-layer[data-source="banner-plaque-gold.png"] > .panel-slice-25-cell')).toHaveCount(45);

  const plaqueMetrics = await plaques.evaluateAll((elements) => elements.map((element) => {
    const style = window.getComputedStyle(element);
    const layer = element.querySelector(':scope > .panel-slice-25-layer');
    return {
      borderImageSource: style.borderImageSource,
      layerCount: element.querySelectorAll(':scope > .panel-slice-25-layer').length,
      sliceGrid: layer?.dataset.sliceGrid || '',
      fillCount: layer?.querySelectorAll(':scope > .panel-slice-25-fill').length || 0,
      cellCount: layer?.querySelectorAll(':scope > .panel-slice-25-cell').length || 0,
      centerColumnCount: layer?.querySelectorAll(':scope > .panel-slice-25-cell[data-slice-col="2"]').length || 0
    };
  }));

  plaqueMetrics.forEach((metrics) => {
    expect(metrics.borderImageSource).toBe('none');
    expect(metrics.layerCount).toBe(1);
    expect(metrics.sliceGrid).toBe('5x3');
    expect(metrics.fillCount).toBe(1);
    expect(metrics.cellCount).toBe(15);
    expect(metrics.centerColumnCount).toBe(3);
  });
});
