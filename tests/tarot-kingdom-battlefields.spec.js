const { test, expect } = require('@playwright/test');

const FIREBASE_SERVICE_HOSTS = [
  /(^|\.)firebaseio\.com$/i,
  /(^|\.)firebasedatabase\.app$/i,
  /^firestore\.googleapis\.com$/i,
  /^identitytoolkit\.googleapis\.com$/i,
  /^securetoken\.googleapis\.com$/i
];

async function abortFirebaseDataRequests(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const isFirebaseCdn = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
    if (isFirebaseCdn || FIREBASE_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname))) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
}

async function openBattle(page, viewport) {
  await page.setViewportSize(viewport);
  await abortFirebaseDataRequests(page);
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('#tarotKingdomStartOfflineButton').click();
  await expect(page.locator('#tarotKingdomBattleStage')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
}

async function setDestination(page, destinationId) {
  await page.evaluate((id) => {
    window.TarotKingdomDebug.battleScenario({
      destinationId: id,
      handCounts: [8, 8, 8, 8]
    });
  }, destinationId);
  await page.waitForFunction((id) => {
    const stage = document.getElementById('tarotKingdomBattleStage');
    return stage?.dataset?.battlefieldId && window.TarotKingdomDebug.battleState()?.battle?.battlefield?.destinationId === id;
  }, destinationId);
}

async function getStageGeometry(page) {
  return page.evaluate(() => {
    const arena = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-arena');
    const stage = document.getElementById('tarotKingdomBattleStage');
    const enemy = document.getElementById('tarotKingdomEnemySprite');
    const players = Array.from(document.querySelectorAll(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player .tarot-kingdom-battle-player-avatar'
    ));
    const rect = arena.getBoundingClientRect();
    const box = (element) => {
      const value = element.getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };
    return {
      battlefieldId: stage.dataset.battlefieldId,
      surface: stage.dataset.battlefieldSurface,
      isShipSide: stage.classList.contains('is-ship-side-battlefield'),
      arena: box(arena),
      enemy: box(enemy),
      players: players.map(box),
      groundStart: Number.parseFloat(
        getComputedStyle(arena).getPropertyValue('--tarot-kingdom-ground-start')
      ),
      backgroundImage: getComputedStyle(arena).backgroundImage,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

test('exploration battle freezes three random stray-pirate avatars with the player body colors', async ({ page }) => {
  await abortFirebaseDataRequests(page);
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleState === 'function');
  await page.evaluate(async () => {
    const module = await import('./js/tarotKingdom.js');
    window.__pendingExplorationBattle = module.startTarotKingdomExplorationBattle({
      explorationId: 'pw-random-pirates',
      destinationId: 'volcanic_island',
      destinationName: '火山島',
      monsterId: 'pixel_monster_01'
    });
  });
  await page.waitForFunction(() => window.TarotKingdomDebug.battleState()?.characterSnapshotReady === true);
  const roster = await page.evaluate(() => {
    const state = window.TarotKingdomDebug.battleState();
    return state.players.map((player) => ({
      name: player.name,
      avatarBase: player.character.avatarBase,
      equipment: player.character.equipment,
      itemSource: player.character.itemSource,
      combat: player.character.combat
    }));
  });

  expect(roster.slice(1).map((player) => player.name)).toEqual([
    'はぐれ海賊1',
    'はぐれ海賊2'
  ]);
  roster.slice(1).forEach((pirate) => {
    expect(pirate.avatarBase.AvatarColor).toBe(roster[0].avatarBase.AvatarColor);
    expect(pirate.avatarBase.SkinColorIndex).toBe(roster[0].avatarBase.SkinColorIndex);
    expect(pirate.equipment.RightHand).toBeTruthy();
    expect(pirate.equipment.Armor).toBeTruthy();
    expect(pirate.itemSource[pirate.equipment.RightHand].customData.WeaponType)
      .toBe(pirate.combat.weaponType);
  });
});

test('all exploration destinations resolve to floor-safe battlefield profiles', async ({ page }) => {
  await page.goto('/tarot-kingdom-preview.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const module = await import('./js/tarotKingdomBattlefields.js');
    const mappings = Object.entries(module.TAROT_KINGDOM_DESTINATION_BATTLEFIELDS).map(
      ([destinationId, expectedId]) => {
        const battlefield = module.resolveTarotKingdomBattlefield(destinationId);
        return {
          destinationId,
          expectedId,
          actualId: battlefield.id,
          groundStartPercent: battlefield.groundStartPercent,
          shipSide: battlefield.shipSide,
          imagePath: battlefield.imagePath
        };
      }
    );
    return {
      audit: module.auditTarotKingdomBattlefieldRegistry(),
      mappings
    };
  });

  expect(result.audit).toEqual(expect.objectContaining({
    ok: true,
    errors: [],
    battlefieldCount: 6,
    destinationCount: 18,
    groundStartPercent: 36
  }));
  expect(result.mappings).toHaveLength(18);
  expect(new Set(result.mappings.map((entry) => entry.actualId)).size).toBeGreaterThanOrEqual(5);
  for (const entry of result.mappings) {
    expect(entry.actualId).toBe(entry.expectedId);
    expect(entry.groundStartPercent).toBe(36);
    expect(entry.imagePath).toMatch(/\.(png|webp)$/);
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 900, height: 1000 }
]) {
  test(`${viewport.width}px keeps every party member on the shared floor line`, async ({ page }) => {
    await openBattle(page, viewport);
    const destinations = [
      ['palm_islet', 'coral-island'],
      ['phantom_admiral_marsh', 'haunted-marsh'],
      ['manta_wraith_grotto', 'blue-grotto'],
      ['old_lighthouse', 'sea-fortress'],
      ['megalodon_reef', 'ship-side']
    ];
    let referencePlayers = null;

    for (const [destinationId, battlefieldId] of destinations) {
      await setDestination(page, destinationId);
      const geometry = await getStageGeometry(page);
      expect(geometry.battlefieldId).toBe(battlefieldId);
      expect(geometry.backgroundImage).toContain('battlefields/');
      expect(geometry.groundStart).toBe(36);
      expect(geometry.players).toHaveLength(4);
      expect(geometry.overflowX).toBeLessThanOrEqual(1);

      const floorStartY = geometry.arena.y + (geometry.arena.height * geometry.groundStart / 100);
      for (const player of geometry.players) {
        expect(player.bottom).toBeGreaterThan(floorStartY);
        expect(player.bottom).toBeLessThanOrEqual(geometry.arena.bottom + 2);
        expect(player.x).toBeGreaterThan(geometry.arena.x + (geometry.arena.width * 0.5));
      }

      const currentPlayers = geometry.players.map(({ x, y, width, height }) => ({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      }));
      if (!referencePlayers) referencePlayers = currentPlayers;
      else expect(currentPlayers).toEqual(referencePlayers);
    }
  });
}

test('open-sea destinations place only the party on the right-side ship deck', async ({ page }) => {
  await openBattle(page, { width: 390, height: 844 });
  await setDestination(page, 'armored_kraken_nest');
  const geometry = await getStageGeometry(page);
  expect(geometry.battlefieldId).toBe('ship-side');
  expect(geometry.surface).toBe('ship-deck');
  expect(geometry.isShipSide).toBe(true);
  expect(geometry.enemy.x + (geometry.enemy.width / 2)).toBeLessThan(
    geometry.arena.x + (geometry.arena.width * 0.56)
  );
  for (const player of geometry.players) {
    expect(player.x).toBeGreaterThan(geometry.arena.x + (geometry.arena.width * 0.56));
  }
});
