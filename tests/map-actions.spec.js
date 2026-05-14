const { test, expect } = require('@playwright/test');
const {
  DEFAULT_PLAYER_INFO,
  bootstrapMainApp,
  openMapTab,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

async function openReadyMap(page, options = {}) {
  await bootstrapMainApp(page, { fixedHour: 1, ...options });
  await openMapTab(page, DEFAULT_PLAYER_INFO);
  await expect(page.locator('#phaser-container canvas')).toHaveCount(1, { timeout: 15_000 });
}

test.describe('map actions', () => {
  test('owned island menu exposes building, tarot, and attack actions', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openReadyMap(page);

    await page.evaluate(async () => {
      const scene = window.gameInstance?.scene?.getScene('WorldMapScene');
      if (!scene) throw new Error('WorldMapScene is not ready');

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
        document.body.dataset.currentTab = String(tabId || '');
      };

      await scene.showIslandCommandMenu(islandData);
    });

    await expect(page.locator('#islandCommandPanel')).toHaveClass(/active/);
    await expect(page.locator('#islandCommandTitle')).toHaveText('赤の砲台島');
    await expect(page.locator('#islandCommandAction')).toHaveText('施設メニューを開く');
    await expect(page.locator('#islandCommandTarot')).toBeVisible();
    await expect(page.locator('#islandCommandTarot')).toHaveText('タロットポーカー');
    await expect(page.locator('#islandCommandAttack')).toBeVisible();
    await expect(page.locator('#islandCommandAttack')).toHaveText(/攻撃準備/);

    await page.locator('#islandCommandAction').click();
    await expect.poll(() => page.evaluate(() => window.__openedIslandMenu || '')).toBe('owned-island-1');

    await page.locator('#islandCommandAttack').click();
    await expect.poll(() => page.evaluate(() => window.__lastIslandAutoAttack?.islandId || '')).toBe('owned-island-1');
    await expect.poll(() => page.evaluate(() => window.__lastIslandAutoAttack?.label || '')).toBe('沿岸砲台');

    await page.locator('#islandCommandTarot').click();
    await expect.poll(() => page.evaluate(() => window.__shownTab || '')).toBe('tarot');

    await expectNoPageErrors(errors);
  });

  test('ship action bar shows the active skill and invokes the scene handler', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openReadyMap(page);

    await page.evaluate(() => {
      const scene = window.gameInstance?.scene?.getScene('WorldMapScene');
      if (!scene) throw new Error('WorldMapScene is not ready');

      window.__shipActionTriggered = 0;
      scene.playerShipItemId = 'ship_human_explorer';
      scene.playerShipClass = 'explorer';
      scene.shipActionCooldownUntil = 0;
      scene.shipActionJammedUntil = 0;
      scene.shipCombatResourceStorage = {
        activeShipId: 'ship-alpha',
        cargoResources: { RR: 3, RG: 4, RY: 2, RB: 1, RT: 0, RS: 0 },
        cargoCapacity: 20,
        cargoUsed: 10
      };
      scene.triggerShipAction = () => {
        window.__shipActionTriggered += 1;
      };
      scene.updateShipCombatResourceHud();
      scene.updateShipActionUi(true);
    });

    await expect(page.locator('#shipActionButton')).toBeEnabled();
    await expect(page.locator('#shipActionStatus')).toHaveText('追い風加速');
    await expect(page.locator('#shipCombatResourceStatus')).toContainText('海戦資源');
    await expect(page.locator('#shipCombatResourceStatus')).toContainText('🪨4');
    await expect(page.locator('#shipCombatResourceStatus')).toContainText('船倉 10/20');

    await page.locator('#shipActionButton').click();
    await expect.poll(() => page.evaluate(() => window.__shipActionTriggered || 0)).toBe(1);

    await expectNoPageErrors(errors);
  });

  test('boarding from the ship command menu hands off to the battle entrypoint', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openReadyMap(page);

    await page.evaluate(() => {
      const scene = window.gameInstance?.scene?.getScene('WorldMapScene');
      if (!scene || !scene.playerShip) throw new Error('WorldMapScene ship is not ready');

      const enemyId = 'PF_ENEMY_1';
      const px = Number(scene.playerShip.x || 160);
      const py = Number(scene.playerShip.y || 160);
      scene.playerShipItemId = 'ship_human_fighter';
      scene.playerShipClass = 'fighter';
      scene.lastBoardingAt = 0;
      const enemySprite = {
        x: px + 24,
        y: py + 12,
        active: true,
        visible: true,
        __ownerNation: 'water',
        anims: {
          isPlaying: false,
          stop() {}
        },
        setFrame() {},
        setAlpha() {},
        setDepth() {}
      };
      scene.otherShips.set(enemyId, {
        sprite: enemySprite,
        data: {
          nation: 'water',
          shipClass: 'fighter',
          shipId: 'ship_enemy_fighter'
        }
      });

      window.__battleStartedWith = null;
      window.startBattleWithOpponent = (opponentId) => {
        window.__battleStartedWith = String(opponentId || '');
        const modal = document.getElementById('battleModal');
        if (modal) {
          modal.style.display = 'flex';
        }
      };

      scene.showShipCommandMenu(enemyId, 'Enemy Raider');
    });

    await expect(page.locator('#islandCommandPanel')).toHaveClass(/active/);
    await expect(page.locator('#islandCommandTitle')).toHaveText('船: Enemy Raider');
    await expect(page.locator('#islandCommandAction')).toHaveText('乗り込む');
    await expect(page.locator('#islandCommandAttack')).toBeHidden();

    await page.evaluate(() => {
      document.getElementById('islandCommandAction')?.click();
    });
    await expect.poll(() => page.evaluate(() => window.__battleStartedWith || '')).toBe('PF_ENEMY_1');
    await expect(page.locator('#battleModal')).toBeVisible();

    await expectNoPageErrors(errors);
  });

  test('battle modal renders live state, auto-attacks, and returns to the map after a win', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openReadyMap(page, { mockFirebaseDatabase: true });

    await page.evaluate(() => {
      window.firestore = null;
      window.__battleApiCalls = [];
      if (window.__pwFirebaseDbApi && typeof window.__pwFirebaseDbApi.clear === 'function') {
        window.__pwFirebaseDbApi.clear();
      }
      window.__pwBattleInitReady = false;

      const deps = {
        myPlayFabId: 'PF_PLAYWRIGHT',
        myCurrentEquipment: {},
        myInventory: [],
        callApiWithLoader: async (endpoint, body) => {
          window.__battleApiCalls.push({ endpoint, body });
          if (endpoint === '/api/start-battle') {
            return { battleId: 'pw-battle-1' };
          }
          if (endpoint === '/api/battle-action') {
            return { success: true };
          }
          if (endpoint === '/api/get-item-details') {
            return {};
          }
          return {};
        },
        renderAvatar: (prefix) => {
          const container = document.getElementById(prefix);
          if (container) {
            container.dataset.rendered = 'true';
          }
        },
        getMyCurrentEquipment: () => ({}),
        getMyInventory: () => ([]),
        db: { __mock: true }
      };

      window.initializeBattleSystem(deps);
      import('firebase/database').then(() => {
        setTimeout(() => {
          window.__pwBattleInitReady = true;
        }, 0);
      });
    });

    await page.waitForFunction(() => window.__pwBattleInitReady === true, { timeout: 20_000 });

    await page.evaluate(() => {
      window.startBattleWithOpponent('PF_ENEMY_BATTLE');
    });

    await expect.poll(() => page.evaluate(() => (window.__battleApiCalls || []).filter((call) => call.endpoint === '/api/start-battle').length)).toBe(1);
    await expect(page.locator('#battleModal')).toBeVisible();

    await page.evaluate(() => {
      window.__pwFirebaseDbApi.setValue('battles/pw-battle-1', {
        status: 'active',
        players: {
          PF_PLAYWRIGHT: {
            name: 'Playwright Tester',
            hp: 120,
            maxHp: 120,
            atb: 99,
            stats: { すばやさ: 20 },
            equipment: {},
            avatar: {}
          },
          PF_ENEMY_BATTLE: {
            name: 'Sea Wraith',
            hp: 95,
            maxHp: 95,
            atb: 0,
            stats: { すばやさ: 8 },
            equipment: {},
            avatar: {}
          }
        },
        log: {
          0: 'Battle start!'
        }
      });
    });

    await expect(page.locator('#battlePlayerAName')).toHaveText('Sea Wraith');
    await expect(page.locator('#battlePlayerBName')).toHaveText('Playwright Tester');
    await expect(page.locator('#battlePlayerAHpText')).toHaveText('95/95');
    await expect(page.locator('#battlePlayerBHpText')).toHaveText('120/120');
    await expect(page.locator('#battleLogContainer')).toContainText('Battle start!');

    await expect.poll(
      () => page.evaluate(() => (window.__battleApiCalls || []).filter((call) => call.endpoint === '/api/battle-action').length),
      { timeout: 15_000 }
    ).toBe(1);
    await expect.poll(
      () => page.evaluate(() => (window.__battleApiCalls || []).find((call) => call.endpoint === '/api/battle-action')?.body?.action || ''),
      { timeout: 15_000 }
    ).toBe('attack');

    await page.evaluate(() => {
      window.__pwFirebaseDbApi.setValue('battles/pw-battle-1', {
        status: 'finished',
        winner: 'PF_PLAYWRIGHT',
        players: {
          PF_PLAYWRIGHT: {
            name: 'Playwright Tester',
            hp: 120,
            maxHp: 120,
            atb: 0,
            stats: { すばやさ: 20 },
            equipment: {},
            avatar: {}
          },
          PF_ENEMY_BATTLE: {
            name: 'Sea Wraith',
            hp: 0,
            maxHp: 95,
            atb: 0,
            stats: { すばやさ: 8 },
            equipment: {},
            avatar: {}
          }
        },
        rounds: [
          {
            round: 1,
            winnerId: 'PF_PLAYWRIGHT',
            loserId: 'PF_ENEMY_BATTLE'
          }
        ],
        log: {
          0: '【連戦 1/1】',
          1: 'Playwright Tester attacks!',
          2: 'Sea Wraith sinks.'
        }
      });
    });

    await expect(page.locator('#battleLogContainer')).toContainText('勝者: Playwright Tester');
    await expect(page.locator('#battleCommandArea')).toContainText('YOU WIN!');
    await expect(page.locator('#battleCommandArea button')).toHaveText('戻る');

    await page.evaluate(() => {
      document.querySelector('#battleCommandArea button')?.click();
    });
    await expect(page.locator('#battleModal')).toBeHidden();

    await expectNoPageErrors(errors);
  });
});
