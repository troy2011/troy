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
