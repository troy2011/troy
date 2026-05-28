const { chromium } = require('@playwright/test');
const {
  bootstrapMainApp,
  openMapTab,
  DEFAULT_PLAYER_INFO
} = require('../tests/helpers/main-app-harness');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173'
  });
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[console:${msg.type()}] ${msg.text()}`);
    }
  });

  try {
    await bootstrapMainApp(page, { fixedHour: 1 });
    await openMapTab(page, DEFAULT_PLAYER_INFO);

    const before = await page.evaluate(() => ({
      mapClass: document.getElementById('tabContentMap')?.className || '',
      canvasCount: document.querySelectorAll('#phaser-container canvas').length,
      hasGameInstance: !!window.gameInstance,
      overlayDisplay: window.getComputedStyle(document.getElementById('mapLoadingOverlay')).display,
      overlayClass: document.getElementById('mapLoadingOverlay')?.className || ''
    }));
    console.log('BEFORE', JSON.stringify(before));

    const islandMenu = await page.evaluate(async () => {
      const scene = window.gameInstance?.scene?.getScene('WorldMapScene');
      if (!scene) {
        return { ok: false, reason: 'scene missing' };
      }

      const islandData = {
        id: 'owned-island-1',
        name: '赤の砲台島',
        ownerId: 'PF_PLAYWRIGHT',
        ownerNation: 'fire',
        mapId: 'wands',
        biome: 'forest',
        buildings: [
          { id: 'battery-1', buildingId: 'coastal_battery', status: 'completed', maxHp: 120, currentHp: 120 }
        ]
      };

      scene.mapOccupationNation = 'fire';
      scene.islandObjects.set(islandData.id, islandData);
      window.__openedIslandMenu = null;
      window.__lastIslandAutoAttack = null;
      window.__shownTab = null;

      scene.openBuildingMenuForIsland = async (island) => {
        window.__openedIslandMenu = island?.id || null;
      };
      scene.triggerIslandAutoAttack = async (island, config) => {
        window.__lastIslandAutoAttack = {
          islandId: island?.id || null,
          label: String(config?.label || '')
        };
      };
      window.showTab = (tabId) => {
        window.__shownTab = String(tabId || '');
      };

      try {
        await scene.showIslandCommandMenu(islandData);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          panelClass: document.getElementById('islandCommandPanel')?.className || '',
          title: document.getElementById('islandCommandTitle')?.textContent || '',
          action: document.getElementById('islandCommandAction')?.textContent || '',
          tarotDisplay: window.getComputedStyle(document.getElementById('islandCommandTarot')).display,
          attackDisplay: window.getComputedStyle(document.getElementById('islandCommandAttack')).display,
          status: document.getElementById('islandCommandStatus')?.textContent || ''
        };
      } catch (error) {
        return {
          ok: false,
          reason: String(error?.message || error),
          stack: String(error?.stack || '')
        };
      }
    });

    console.log('ISLAND_MENU', JSON.stringify(islandMenu));
    console.log('PAGE_ERRORS', JSON.stringify(pageErrors));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
