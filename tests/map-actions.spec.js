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
        melee: {
          version: 1,
          duels: [
            {
              round: 1,
              attackerId: 'PF_PLAYWRIGHT',
              defenderId: 'PF_ENEMY_BATTLE',
              winnerId: 'PF_PLAYWRIGHT',
              loserId: 'PF_ENEMY_BATTLE',
              setup: {
                version: 1,
                combatants: [
                  {
                    id: 'PF_PLAYWRIGHT',
                    name: 'Playwright Tester',
                    weaponType: 'sword',
                    weaponLabel: '剣',
                    maxHp: 120,
                    currentHp: 120,
                    slots: [
                      { die: 2, initialUnlocked: false, weaponForm: { name: '強撃', kind: 'attack', power: 130, accuracy: 85 }, card: null },
                      { die: 3, initialUnlocked: false, weaponForm: { name: '突き', kind: 'attack', power: 95, accuracy: 100 }, card: null },
                      { die: 4, initialUnlocked: false, weaponForm: { name: '連斬', kind: 'attack', power: 50, accuracy: 95 }, card: null },
                      { die: 5, initialUnlocked: true, weaponForm: { name: '構え直し', kind: 'support', power: null, accuracy: null }, card: { cardName: 'カップ5', skillName: '潮戻し', suit: 'Cup', rank: 5 } },
                      { die: 6, initialUnlocked: false, weaponForm: { name: '決め斬り', kind: 'attack', power: 170, accuracy: 80 }, card: null }
                    ]
                  },
                  {
                    id: 'PF_ENEMY_BATTLE',
                    name: 'Sea Wraith',
                    weaponType: 'axe_big',
                    weaponLabel: '大斧',
                    maxHp: 95,
                    currentHp: 95,
                    slots: [
                      { die: 2, initialUnlocked: false, weaponForm: { name: '踏み外し', kind: 'support', power: null, accuracy: null }, card: null },
                      { die: 3, initialUnlocked: false, weaponForm: { name: '大振り', kind: 'attack', power: 140, accuracy: 80 }, card: null },
                      { die: 4, initialUnlocked: false, weaponForm: { name: '叩き割り', kind: 'attack', power: 180, accuracy: 70 }, card: null },
                      { die: 5, initialUnlocked: false, weaponForm: { name: '威圧', kind: 'support', power: null, accuracy: null }, card: null },
                      { die: 6, initialUnlocked: false, weaponForm: { name: '処刑斧', kind: 'attack', power: 230, accuracy: 60 }, card: null }
                    ]
                  }
                ]
              },
              timeline: [
                {
                  round: 1,
                  actorId: 'PF_PLAYWRIGHT',
                  actorName: 'Playwright Tester',
                  targetId: 'PF_ENEMY_BATTLE',
                  targetName: 'Sea Wraith',
                  die: 5,
                  resultType: 'minorArcana',
                  reason: '',
                  action: {
                    source: 'minor',
                    kind: 'support',
                    name: '潮戻し',
                    cardName: 'カップ5',
                    suit: 'cup',
                    rank: 5,
                    power: null,
                    accuracy: null,
                    hitCount: 1,
                    effectText: '潮の力で立て直す'
                  },
                  damage: 0,
                  selfDamage: 0,
                  healing: 10,
                  attackerHpBefore: 110,
                  attackerHpAfter: 120,
                  defenderHpBefore: 95,
                  defenderHpAfter: 95,
                  anyHit: true,
                  statusChanges: []
                },
                {
                  round: 1,
                  actorId: 'PF_PLAYWRIGHT',
                  actorName: 'Playwright Tester',
                  targetId: 'PF_ENEMY_BATTLE',
                  targetName: 'Sea Wraith',
                  die: 4,
                  resultType: 'weaponForm',
                  reason: '',
                  action: {
                    source: 'weapon',
                    kind: 'attack',
                    name: '連斬',
                    cardName: '',
                    power: 50,
                    accuracy: 95,
                    hitCount: 2
                  },
                  damage: 32,
                  selfDamage: 0,
                  healing: 0,
                  attackerHpBefore: 120,
                  attackerHpAfter: 120,
                  defenderHpBefore: 95,
                  defenderHpAfter: 63,
                  anyHit: true,
                  statusChanges: []
                }
              ]
            }
          ]
        },
        log: {
          0: '【連戦 1/1】',
          1: 'Playwright Tester attacks!',
          2: 'Sea Wraith sinks.'
        }
      });
    });

    await expect(page.locator('#battleLogContainer')).toContainText('勝者: Playwright Tester');
    await expect(page.locator('#battleMeleeReplay')).toBeVisible();
    await expect(page.locator('#battleStage .melee-minor-arcana-effect[data-card-name="カップ5"]')).toContainText('潮戻し');
    await expect(page.locator('#battleStage .melee-minor-arcana-effect[data-card-name="カップ5"] .melee-minor-arcana-art')).toBeVisible();
    await expect(page.locator('#battleMeleeReplay')).toContainText('出目4');
    await expect(page.locator('#battleMeleeReplay')).toContainText('連斬');
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant[data-weapon="sword"]')).toBeVisible();
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant.is-enemy-side[data-weapon="axe_big"]')).toBeVisible();
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant[data-weapon="sword"] .melee-replay-slot[data-die="1"]')).toBeVisible();
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant[data-weapon="sword"] .melee-replay-slot')).toHaveCount(6);
    await expect(page.locator('#battleMeleeReplay .melee-replay-slot.is-active[data-die="4"]')).toBeVisible();
    const replayDie = page.locator('#battleMeleeReplay .melee-replay-die.dice-sprite[data-die="4"]');
    const slotDie = page.locator('#battleMeleeReplay .melee-replay-slot.is-active[data-die="4"] .melee-replay-slot-die.dice-sprite[data-die="4"]');
    const replayWeapon = page.locator('#battleMeleeReplay .melee-replay-slot.is-active[data-die="4"] .weapon-sprite[data-weapon="sword"]');
    const replayTarot = page.locator('#battleMeleeReplay .melee-replay-slot[data-die="5"] .melee-slot-tarot[data-suit="cup"][data-rank="5"]');
    const enemySlotWeapon = page.locator('#battleMeleeReplay .melee-replay-combatant.is-enemy-side[data-weapon="axe_big"] .melee-replay-slot[data-die="4"] .weapon-sprite[data-weapon="axe_big"]');
    await expect(replayDie).toBeVisible();
    await expect(slotDie).toBeVisible();
    await expect(replayWeapon).toBeVisible();
    await expect(replayTarot).toBeVisible();
    await expect(enemySlotWeapon).toBeVisible();
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant[data-weapon="sword"] .melee-replay-combatant-identity .weapon-sprite')).toHaveCount(0);
    await expect(page.locator('#battleMeleeReplay .melee-replay-combatant[data-weapon="sword"] .melee-replay-slot[data-die="5"]')).not.toContainText('潮戻し');
    const dieRatio = await replayDie.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.height / rect.width;
    });
    const weaponRatio = await replayWeapon.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.height / rect.width;
    });
    expect(dieRatio).toBeGreaterThan(0.9);
    expect(dieRatio).toBeLessThan(1.1);
    expect(weaponRatio).toBeGreaterThan(1.5);
    expect(weaponRatio).toBeLessThan(1.8);
    await expect(page.locator('#battleCommandArea')).toContainText('YOU WIN!');
    await expect(page.locator('#battleCommandArea button')).toHaveText('戻る');

    await page.evaluate(() => {
      document.querySelector('#battleCommandArea button')?.click();
    });
    await expect(page.locator('#battleModal')).toBeHidden();

    await expectNoPageErrors(errors);
  });

  test('exploration npc melee start keeps the boarded naval opponent payload', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openReadyMap(page, { mockFirebaseDatabase: true });

    await page.evaluate(() => {
      window.__battleApiCalls = [];
      window.__pwBattleInitReady = false;
      window.myPlayFabId = 'PF_PLAYWRIGHT';
      if (window.__pwFirebaseDbApi && typeof window.__pwFirebaseDbApi.clear === 'function') {
        window.__pwFirebaseDbApi.clear();
      }

      const deps = {
        myPlayFabId: '',
        myCurrentEquipment: {},
        myInventory: [],
        callApiWithLoader: async (endpoint, body, options = {}) => {
          window.__battleApiCalls.push({ endpoint, body, options });
          if (endpoint === '/api/exploration/npc-battle') {
            return { battleId: 'pw-exploration-npc-battle' };
          }
          return {};
        },
        renderAvatar: () => {},
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

    const result = await page.evaluate(() => window.startExplorationNpcBattle({
      requestId: 'exploration-npc-test',
      opponentId: 'npc_exploration_naval_alpha',
      opponentName: '試験海賊船',
      opponentShipProfile: {
        itemId: 'guild_ship',
        form: 'guild',
        shipClass: 'guild',
        stage: 3
      },
      throwOnError: true,
      continueFromNaval: true,
      battleContext: {
        navalOutcome: 'boarding',
        boardedPlayerId: 'npc_exploration_naval_alpha',
        boardingPlayerId: 'PF_PLAYWRIGHT',
        navalBoardingState: {
          player: { morale: 1, crewHpPercent: 90, crewMpPercent: 80, statuses: {} },
          enemy: { morale: -1, crewHpPercent: 45, crewMpPercent: 30, statuses: { burn: { turns: 2 } } }
        }
      }
    }));

    expect(result).toMatchObject({ battleId: 'pw-exploration-npc-battle' });
    const calls = await page.evaluate(() => window.__battleApiCalls || []);
    const npcCall = calls.find((call) => call.endpoint === '/api/exploration/npc-battle');
    expect(npcCall).toBeTruthy();
    expect(npcCall.options).toMatchObject({ throwOnError: true });
    expect(npcCall.body).toMatchObject({
      playFabId: 'PF_PLAYWRIGHT',
      requestId: 'exploration-npc-test',
      navalOpponentId: 'npc_exploration_naval_alpha',
      navalOpponentName: '試験海賊船',
      opponentShipProfile: {
        itemId: 'guild_ship',
        form: 'guild',
        shipClass: 'guild',
        stage: 3
      },
      battleContext: {
        source: 'explorationNpc',
        rewardMode: 'none',
        npcBattle: true,
        navalOutcome: 'boarding',
        boardedPlayerId: 'npc_exploration_naval_alpha',
        boardingPlayerId: 'PF_PLAYWRIGHT',
        navalBoardingState: {
          enemy: { statuses: { burn: { turns: 2 } } }
        }
      }
    });

    await expectNoPageErrors(errors);
  });
});
