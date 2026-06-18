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

test('explicit 15 slice panels preserve horizontal center ornaments only where requested', async ({ page }) => {
  await page.route('**/main.js*', (route) => route.abort());
  await page.goto('/index.html');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="/css/panel-slice-25.css?v=test">
        <style>
          .notice-panel,
          .plain-plaque {
            width: 430px;
            min-height: 44px;
            padding: 12px 24px 10px;
            border: 1px solid transparent;
            border-image: url("/assets/ui/banners/banner-plaque-gold.png") 38 32 30 32 fill / 18px 17px 15px 17px / 0 stretch;
            box-sizing: border-box;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <section class="notice-panel" data-panel-slice="15" data-panel-slice-center-x="64">告知</section>
        <section class="plain-plaque">通常</section>
      </body>
    </html>
  `);

  await page.evaluate(async () => {
    const module = await import('/js/panelSlice25.js');
    module.installPanelSlice25(document);
  });

  const layer = page.locator('.notice-panel > .panel-slice-25-layer');
  await expect(layer).toHaveCount(1);
  await expect(layer.locator('> .panel-slice-25-cell')).toHaveCount(15);
  await expect(page.locator('.plain-plaque > .panel-slice-25-layer')).toHaveCount(0);

  const metrics = await page.locator('.notice-panel').evaluate((panel) => {
    const style = window.getComputedStyle(panel);
    const layerEl = panel.querySelector(':scope > .panel-slice-25-layer');
    const centerTop = layerEl.querySelector('[data-slice-row="0"][data-slice-col="2"]');
    const stretchTop = layerEl.querySelector('[data-slice-row="0"][data-slice-col="1"]');
    return {
      width: Math.round(panel.getBoundingClientRect().width),
      height: Math.round(panel.getBoundingClientRect().height),
      fontSize: style.fontSize,
      borderImageSource: style.borderImageSource,
      grid: layerEl.dataset.sliceGrid,
      cellCount: layerEl.querySelectorAll('.panel-slice-25-cell').length,
      centerWidth: Math.round(centerTop.getBoundingClientRect().width),
      stretchWidth: Math.round(stretchTop.getBoundingClientRect().width)
    };
  });

  expect(metrics.width).toBe(430);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.fontSize).toBe('12px');
  expect(metrics.borderImageSource).toBe('none');
  expect(metrics.grid).toBe('5x3');
  expect(metrics.cellCount).toBe(15);
  expect(metrics.centerWidth).toBeGreaterThan(24);
  expect(metrics.centerWidth).toBeLessThan(metrics.stretchWidth);
});
