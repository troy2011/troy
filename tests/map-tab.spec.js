const { test, expect } = require('@playwright/test');
const {
  DEFAULT_PLAYER_INFO,
  bootstrapMainApp,
  openMapTab,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

async function getMapRuntimeState(page) {
  return page.evaluate(() => ({
    currentTab: document.body?.dataset.currentTab || '',
    currentMapId: String(window.__currentMapId || ''),
    currentMapLabel: String(window.__currentMapLabel || ''),
    hasGameInstance: !!window.gameInstance,
    canvasCount: document.querySelectorAll('#phaser-container canvas').length
  }));
}

async function tagCurrentCanvas(page, suffix = 'canvas') {
  return page.evaluate((label) => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const canvases = Array.from(document.querySelectorAll('#phaser-container canvas'));
    const visible = canvases.filter(isVisible);
    const canvas = visible[visible.length - 1] || canvases[canvases.length - 1] || null;
    if (!canvas) return '';
    if (!canvas.dataset.testCanvasId) {
      canvas.dataset.testCanvasId = `${label}-${Date.now()}`;
    }
    return canvas.dataset.testCanvasId;
  }, suffix);
}

async function getVisibleCanvasCount(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    return Array.from(document.querySelectorAll('#phaser-container canvas')).filter(isVisible).length;
  });
}

test.describe('map tab', () => {
  test('opens the player nation map and boots the scene once', async ({ page }) => {
    const errors = trackPageErrors(page);
    await bootstrapMainApp(page, { fixedHour: 1 });

    await openMapTab(page, DEFAULT_PLAYER_INFO);

    await expect(page.locator('#tabContentMap')).toBeVisible();
    await expect(page.locator('#phaser-container')).toBeVisible();
    await expect(page.locator('#phaser-container canvas')).toHaveCount(1);
    await expect(page.locator('#mapActionBar')).toBeVisible();
    await expect(page.locator('#mapChatArea')).toBeVisible();

    const runtime = await getMapRuntimeState(page);
    expect(runtime.currentTab).toBe('map');
    expect(runtime.currentMapId).toBe('wands');
    expect(runtime.hasGameInstance).toBe(true);
    expect(runtime.canvasCount).toBe(1);

    await expectNoPageErrors(errors);
  });

  test('switching map ids destroys and relaunches the map scene', async ({ page }) => {
    const errors = trackPageErrors(page);
    await bootstrapMainApp(page, { fixedHour: 1 });

    await openMapTab(page, DEFAULT_PLAYER_INFO);
    const firstCanvasId = await tagCurrentCanvas(page, 'map-switch-first');
    await page.waitForTimeout(1500);
    await openMapTab(page, DEFAULT_PLAYER_INFO, {
      skipMapSelect: true,
      mapId: 'cups',
      mapLabel: 'Cups'
    });
    await expect.poll(() => getVisibleCanvasCount(page)).toBe(1);

    const runtime = await getMapRuntimeState(page);
    const secondCanvasId = await tagCurrentCanvas(page, 'map-switch-second');
    expect(runtime.currentMapId).toBe('cups');
    expect(runtime.hasGameInstance).toBe(true);
    expect(firstCanvasId).not.toBe(secondCanvasId);

    await expectNoPageErrors(errors);
  });

  test('opening the same map id with skipMapSelect keeps the existing scene', async ({ page }) => {
    const errors = trackPageErrors(page);
    await bootstrapMainApp(page, { fixedHour: 1 });

    await openMapTab(page, DEFAULT_PLAYER_INFO);
    const firstCanvasId = await tagCurrentCanvas(page, 'same-map-first');

    await openMapTab(page, DEFAULT_PLAYER_INFO, {
      skipMapSelect: true,
      mapId: 'wands',
      mapLabel: 'Wands'
    });
    await expect(page.locator('#phaser-container canvas')).toHaveCount(1);

    const runtime = await getMapRuntimeState(page);
    const secondCanvasId = await tagCurrentCanvas(page, 'same-map-second');
    expect(runtime.currentMapId).toBe('wands');
    expect(runtime.hasGameInstance).toBe(true);
    expect(firstCanvasId).toBe(secondCanvasId);

    await expectNoPageErrors(errors);
  });

  test('reopening the map shows the world map overlay without relaunching the game', async ({ page }) => {
    const errors = trackPageErrors(page);
    const state = await bootstrapMainApp(page, { fixedHour: 1 });

    await openMapTab(page, DEFAULT_PLAYER_INFO);
    const firstCanvasId = await tagCurrentCanvas(page, 'overlay-first');
    await openMapTab(page, DEFAULT_PLAYER_INFO);

    await expect(page.locator('#mapLoadingOverlay')).toBeVisible();
    await expect(page.locator('#worldMapGrid .world-map-modal-cell')).toHaveCount(25);
    await expect(page.locator('#worldMapGrid .world-map-modal-cell.is-current')).toHaveCount(1);
    await expect(page.locator('#worldMapGrid .world-map-modal-cell.is-current')).toHaveAttribute('data-map-id', 'wands');
    await expect(page.locator('#worldMapGrid .world-map-modal-cell[data-map-id="wands"]')).toHaveClass(/is-occupied-fire/);

    await expect.poll(() => Array.isArray(state.lastOccupationRequest?.mapIds) ? state.lastOccupationRequest.mapIds.length : 0).toBeGreaterThan(0);
    expect(new Set(state.lastOccupationRequest?.mapIds || [])).toEqual(new Set(['wands', 'cups', 'swords', 'pentacles', 'major_00']));

    const runtime = await getMapRuntimeState(page);
    const secondCanvasId = await tagCurrentCanvas(page, 'overlay-second');
    expect(runtime.hasGameInstance).toBe(true);
    expect(firstCanvasId).toBe(secondCanvasId);

    await page.evaluate(() => {
      document.getElementById('mapLoadingClose')?.click();
    });
    await expect(page.locator('#mapLoadingOverlay')).toBeHidden();

    await expectNoPageErrors(errors);
  });

  test('clicking a world map cell as a non-king keeps the current map and shows the restriction message', async ({ page }) => {
    const errors = trackPageErrors(page);
    await bootstrapMainApp(page, { fixedHour: 1 });

    await openMapTab(page, DEFAULT_PLAYER_INFO);
    const firstCanvasId = await tagCurrentCanvas(page, 'overlay-guard-first');
    await page.evaluate(() => {
      window.__rpgMessages = [];
      window.showRpgMessage = (text) => {
        window.__rpgMessages.push(String(text || ''));
      };
    });

    await openMapTab(page, DEFAULT_PLAYER_INFO);
    await expect(page.locator('#mapLoadingOverlay')).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('#worldMapGrid .world-map-modal-cell[data-map-id="cups"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    await expect.poll(() => page.evaluate(() => (window.__rpgMessages || []).join('\n'))).toContain('王のみ配置を入れ替えできます。');

    const runtime = await getMapRuntimeState(page);
    const secondCanvasId = await tagCurrentCanvas(page, 'overlay-guard-second');
    expect(runtime.currentMapId).toBe('wands');
    expect(runtime.hasGameInstance).toBe(true);
    expect(firstCanvasId).toBe(secondCanvasId);

    await expectNoPageErrors(errors);
  });
});
