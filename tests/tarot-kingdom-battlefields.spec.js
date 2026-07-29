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
    battlefieldCount: 18,
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

test('all 11 exploration stages load distinct dedicated battlefield images', async ({ page }) => {
  await page.goto('/tarot-kingdom-preview.html', { waitUntil: 'domcontentloaded' });
  const stageBattlefieldIds = [
    'stage-01-coral-shallows',
    'stage-02-windswept-deck',
    'stage-03-island-causeway',
    'stage-04-moon-shadow-castle',
    'stage-05-emerald-jungle',
    'stage-06-haunted-marsh',
    'stage-07-sea-fortress',
    'stage-08-azure-grotto',
    'stage-09-steel-fleet',
    'stage-10-infernal-marsh',
    'stage-11-eclipse-castle'
  ];
  const result = await page.evaluate(async (battlefieldIds) => {
    const module = await import('./js/tarotKingdomBattlefields.js');
    return Promise.all(battlefieldIds.map((battlefieldId) => new Promise((resolve) => {
      const battlefield = module.getTarotKingdomBattlefieldById(battlefieldId);
      const image = new Image();
      image.addEventListener('load', () => resolve({
        id: battlefield.id,
        imagePath: battlefield.imagePath,
        groundStartPercent: battlefield.groundStartPercent,
        shipSide: battlefield.shipSide,
        surface: battlefield.surface,
        width: image.naturalWidth,
        height: image.naturalHeight,
        loaded: true
      }), { once: true });
      image.addEventListener('error', () => resolve({
        id: battlefield.id,
        imagePath: battlefield.imagePath,
        loaded: false
      }), { once: true });
      image.src = battlefield.imagePath;
    })));
  }, stageBattlefieldIds);

  expect(result).toHaveLength(11);
  expect(new Set(result.map((entry) => entry.id)).size).toBe(11);
  expect(new Set(result.map((entry) => entry.imagePath)).size).toBe(11);
  for (const entry of result) {
    expect(entry.loaded).toBe(true);
    expect(entry.imagePath).toMatch(/stage-\d{2}-.+-v1\.webp$/);
    expect(entry.groundStartPercent).toBe(36);
    expect(entry.width).toBeGreaterThan(900);
    expect(entry.height / entry.width).toBeGreaterThan(1.7);
  }
  expect(result.filter((entry) => entry.shipSide).map((entry) => entry.id)).toEqual([
    'stage-02-windswept-deck',
    'stage-09-steel-fleet'
  ]);
  expect(result.filter((entry) => entry.shipSide).every((entry) => entry.surface.endsWith('-deck'))).toBe(true);
});

test('raid uses its own eclipse altar battlefield asset', async ({ page }) => {
  await page.goto('/tarot-kingdom-preview.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const module = await import('./js/tarotKingdomBattlefields.js');
    const battlefield = module.getTarotKingdomBattlefieldById(module.TAROT_KINGDOM_RAID_BATTLEFIELD_ID);
    const image = new Image();
    const loaded = await new Promise((resolve) => {
      image.addEventListener('load', () => resolve(true), { once: true });
      image.addEventListener('error', () => resolve(false), { once: true });
      image.src = battlefield.imagePath;
    });
    return {
      constant: module.TAROT_KINGDOM_RAID_BATTLEFIELD_ID,
      battlefield,
      loaded,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  });

  expect(result.constant).toBe('raid-eclipse-altar');
  expect(result.battlefield).toMatchObject({
    id: 'raid-eclipse-altar',
    label: '蝕海の祭壇',
    imagePath: './assets/tarot-kingdom/battlefields/raid-eclipse-altar-v1.webp',
    surface: 'raid-stone',
    groundStartPercent: 36,
    shipSide: false
  });
  expect(result.loaded).toBe(true);
  expect(result.width).toBeGreaterThan(900);
  expect(result.height / result.width).toBeGreaterThan(1.7);
});

test('enemy depth layer stays between party seats 2 and 3', async ({ page }) => {
  await openBattle(page, { width: 390, height: 844 });
  for (const playerCount of [3, 4]) {
    const depth = await page.evaluate((count) => {
      window.TarotKingdomDebug.battleScenario({
        playerCount: count,
        handCounts: Array(count).fill(8),
        withTrick: false
      });
      const enemy = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy');
      const partySide = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side');
      const players = Array.from(document.querySelectorAll(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player'
      ));
      const normalPlayerDepths = players.map((row) => Number.parseInt(getComputedStyle(row).zIndex, 10));
      players[2].classList.add('is-round-winner');
      const roundWinnerDepth = Number.parseInt(getComputedStyle(players[2]).zIndex, 10);
      players[2].classList.remove('is-round-winner');
      players[2].classList.add('is-match-champion');
      const matchChampionDepth = Number.parseInt(getComputedStyle(players[2]).zIndex, 10);
      return {
        enemy: Number.parseInt(getComputedStyle(enemy).zIndex, 10),
        partySide: getComputedStyle(partySide).zIndex,
        players: normalPlayerDepths,
        roundWinnerDepth,
        matchChampionDepth
      };
    }, playerCount);

    expect(depth.partySide).toBe('auto');
    expect(depth.players).toHaveLength(playerCount);
    expect(depth.players[1]).toBeGreaterThan(depth.enemy);
    expect(depth.enemy).toBeGreaterThan(depth.players[2]);
    expect(depth.roundWinnerDepth).toBe(depth.players[2]);
    expect(depth.matchChampionDepth).toBe(depth.players[2]);
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
