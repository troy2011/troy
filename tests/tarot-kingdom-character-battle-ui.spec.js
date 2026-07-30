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

async function openOfflineBattle(page, viewport, productionCascade = false) {
  await page.setViewportSize(viewport);
  await abortFirebaseDataRequests(page);
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', {
    waitUntil: 'domcontentloaded'
  });

  if (productionCascade) {
    await page.evaluate(() => {
      const root = document.getElementById('tarotKingdomRoot');
      const wrapper = document.createElement('div');
      wrapper.id = 'tabContentTarot';
      root.before(wrapper);
      wrapper.appendChild(root);
    });
  }

  await expect(page.locator('#tarotKingdomStartOfflineButton')).toBeVisible();
  await page.locator('#tarotKingdomStartOfflineButton').click();
  await expect(page.locator('#tarotKingdomBattleStage')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ handCounts: [8, 8, 8, 8] });
  });
  await expect(page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player')).toHaveCount(4);
  await expect(page.locator('#tarotKingdomHand > .tarot-card')).toHaveCount(8);
}

async function readBattleLayout(page) {
  return page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      };
    };
    const stage = document.getElementById('tarotKingdomBattleStage');
    const root = document.getElementById('tarotKingdomRoot');
    const arena = stage.querySelector('.tarot-kingdom-battle-arena');
    const enemy = stage.querySelector('.tarot-kingdom-battle-enemy');
    const center = stage.querySelector('.tarot-kingdom-battle-center');
    const feed = stage.querySelector('.tarot-kingdom-battle-feed');
    const feedEvent = feed.querySelector('.tarot-kingdom-battle-event');
    const party = stage.querySelector('.tarot-kingdom-battle-party-side');
    const rows = Array.from(stage.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player'));
    const enemyHpTrack = stage.querySelector('.tarot-kingdom-battle-enemy .tarot-kingdom-battle-hp');
    const enemySprite = document.getElementById('tarotKingdomEnemySprite');
    const enemyVisual = stage.querySelector('.tarot-kingdom-battle-enemy-visual');
    const trickPanel = document.querySelector('.tarot-kingdom-panel--trick');
    const cardStage = document.querySelector('.tarot-kingdom-card-stage');
    const fieldItems = Array.from(document.querySelectorAll('#tarotKingdomTrick > .tarot-card, #tarotKingdomTrick > .tarot-kingdom-field-slot'));
    const selectedEffect = document.getElementById('tarotKingdomSelectedEffect');
    const hand = document.getElementById('tarotKingdomHand');
    const handPanel = hand.closest('.tarot-kingdom-panel');
    const handCards = Array.from(hand.querySelectorAll(':scope > .tarot-card'));
    const actionPopup = document.getElementById('tarotKingdomActionPopup');
    const actionButtons = Array.from(actionPopup.querySelectorAll('.tarot-betting-actions > button'))
      .filter((button) => {
        const style = getComputedStyle(button);
        return !button.hidden
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && button.getClientRects().length > 0;
      });
    const styleOf = (element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        borderImageSource: style.borderImageSource,
        borderTopWidth: parseFloat(style.borderTopWidth) || 0,
        borderBottomWidth: parseFloat(style.borderBottomWidth) || 0,
        display: style.display,
        imageRendering: style.imageRendering,
        overflowX: style.overflowX,
        position: style.position,
        pointerEvents: style.pointerEvents,
        zIndex: Number(style.zIndex) || 0
      };
    };

    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      root: box(root),
      stage: box(stage),
      stageClientWidth: stage.clientWidth,
      stageScrollWidth: stage.scrollWidth,
      stageStyle: styleOf(stage),
      arena: box(arena),
      arenaStyle: styleOf(arena),
      enemy: box(enemy),
      enemyStyle: styleOf(enemy),
      center: box(center),
      centerStyle: styleOf(center),
      feed: box(feed),
      feedEvent: box(feedEvent),
      feedEventStyle: styleOf(feedEvent),
      party: box(party),
      partyStyle: styleOf(party),
      enemySprite: box(enemySprite),
      enemyVisual: box(enemyVisual),
      enemySpriteStyle: styleOf(enemySprite),
      enemyFacing: enemySprite.dataset.facing,
      affinityCount: stage.querySelectorAll('.tarot-kingdom-enemy-affinities').length,
      progressbarCount: stage.querySelectorAll('[role="progressbar"]').length,
      enemyHpAria: {
        now: enemyHpTrack?.getAttribute('aria-valuenow'),
        max: enemyHpTrack?.getAttribute('aria-valuemax')
      },
      trickPanel: box(trickPanel),
      cardStage: box(cardStage),
      fieldItems: fieldItems.map((item) => ({ box: box(item), style: styleOf(item) })),
      fieldArtAlignment: (() => {
        const card = fieldItems.find((item) => item.classList.contains('tarot-card'));
        const art = card?.querySelector('.tarot-card-art');
        if (!card || !art) return null;
        const cardBox = box(card);
        const artBox = box(art);
        return {
          x: Math.abs((cardBox.x + cardBox.width / 2) - (artBox.x + artBox.width / 2)),
          y: Math.abs((cardBox.y + cardBox.height / 2) - (artBox.y + artBox.height / 2))
        };
      })(),
      selectedEffect: box(selectedEffect),
      hand: {
        box: box(hand),
        panelBox: box(handPanel),
        clientWidth: hand.clientWidth,
        scrollWidth: hand.scrollWidth,
        style: styleOf(hand),
        cards: handCards.map(box),
        art: handCards.map((card) => box(card.querySelector('.tarot-card-art')))
      },
      actions: {
        box: box(actionPopup),
        bottomInset: document.documentElement.clientHeight - box(actionPopup).bottom,
        style: styleOf(actionPopup),
        buttons: actionButtons.map((button) => ({
          id: button.id,
          text: button.textContent.trim(),
          box: box(button),
          borderImageSource: getComputedStyle(button).borderImageSource,
          writingMode: getComputedStyle(button).writingMode
        }))
      },
      rows: rows.map((row) => {
        const avatar = row.querySelector('.tarot-kingdom-battle-player-avatar');
        const avatarStyle = getComputedStyle(avatar);
        const bodyLayer = avatar.querySelector('[id$="-layer-body"]');
        const info = row.querySelector('.tarot-kingdom-battle-player-info');
        const rank = row.querySelector('.tarot-kingdom-battle-player-rank');
        const hpPanel = row.querySelector('.tarot-kingdom-battle-player-hp');
        const hpTrack = row.querySelector('.tarot-kingdom-battle-player-hp-track');
        const handCount = row.querySelector('.tarot-kingdom-battle-player-hand-count');
        return {
          box: box(row),
          avatarBox: box(avatar),
          infoBox: box(info),
          avatarLayers: avatar.querySelectorAll('.avatar-layer').length,
          avatarFacing: avatar.dataset.facing,
          avatarFacingScale: avatarStyle.getPropertyValue('--avatar-facing-scale-x').trim(),
          avatarBodyImage: bodyLayer ? getComputedStyle(bodyLayer).backgroundImage : 'none',
          avatarShadowLeft: avatarStyle.getPropertyValue('--avatar-foot-shadow-left').trim(),
          avatarShadowBottom: avatarStyle.getPropertyValue('--avatar-foot-shadow-bottom').trim(),
          rankBox: box(rank),
          hpBox: box(hpPanel),
          hpTrackBox: box(hpTrack),
          handCountBox: box(handCount),
          rank: rank.textContent.trim(),
          handCount: handCount.textContent.trim(),
          handCountFontSize: parseFloat(getComputedStyle(handCount).fontSize),
          rankFontSize: parseFloat(getComputedStyle(rank).fontSize),
          handCountVisible: getComputedStyle(handCount).display !== 'none' && handCount.getClientRects().length > 0,
          hpText: row.querySelector('.tarot-kingdom-battle-player-hp-text')?.textContent.trim() || '',
          hpTextFontSize: parseFloat(getComputedStyle(row.querySelector('.tarot-kingdom-battle-player-hp-text')).fontSize),
          statsAbsent: !row.querySelector('.tarot-kingdom-battle-player-stats'),
          turnCue: {
            rowBackground: getComputedStyle(row).backgroundImage,
            beforeContent: getComputedStyle(row, '::before').content,
            avatarAnimation: getComputedStyle(avatar).animationName
          },
          hpAria: {
            now: row.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuenow'),
            max: row.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuemax')
          }
        };
      })
    };
  });
}

test('The World freezes the enemy sprite until time stop expires', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const enemySprite = page.locator('#tarotKingdomEnemySprite');

  await expect.poll(async () => {
    const first = await enemySprite.evaluate((node) => node.style.backgroundPosition);
    await page.waitForTimeout(180);
    const second = await enemySprite.evaluate((node) => node.style.backgroundPosition);
    return first !== second;
  }).toBe(true);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: {
        timeStop: {
          remainingTurns: 2,
          expiresOn: 'turn',
          source: 'major-21'
        }
      },
      party: {},
      players: [{}, {}, {}, {}]
    });
  });

  await expect(enemySprite).toHaveClass(/is-time-stopped/);
  const frozenFrame = await enemySprite.evaluate((node) => node.style.backgroundPosition);
  await page.waitForTimeout(500);
  await expect(enemySprite).toHaveCSS('animation-name', 'none');
  expect(await enemySprite.evaluate((node) => node.style.backgroundPosition)).toBe(frozenFrame);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: {},
      party: {},
      players: [{}, {}, {}, {}]
    });
  });
  await expect(enemySprite).not.toHaveClass(/is-time-stopped/);
  await expect.poll(
    () => enemySprite.evaluate((node) => node.style.backgroundPosition),
    { timeout: 2_000 }
  ).not.toBe(frozenFrame);
});

test('5 skip replaces the enemy blue ring with the ellipsis speech-bubble icon', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const enemySprite = page.locator('#tarotKingdomEnemySprite');
  const silenceIcon = page.locator('.tarot-kingdom-enemy-silence-icon');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEnemyAreaSeal(true);
  });

  await expect(enemySprite).toHaveClass(/is-area-sealed/);
  await expect(silenceIcon).toBeVisible();
  await expect(enemySprite).toHaveCSS('box-shadow', 'none');
  await expect(enemySprite).toHaveCSS('border-radius', '0px');

  const iconStyle = await silenceIcon.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backgroundImage: style.backgroundImage,
      backgroundPosition: style.backgroundPosition,
      backgroundSize: style.backgroundSize,
      width: style.width,
      height: style.height
    };
  });
  expect(iconStyle.backgroundImage).toMatch(/\/Sprites\/items\/icons\.png/);
  expect(iconStyle.backgroundPosition).toBe('-320px -32px');
  expect(iconStyle.backgroundSize).toBe('512px 2048px');
  expect(iconStyle.width).toBe('32px');
  expect(iconStyle.height).toBe('32px');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEnemyAreaSeal(false);
  });
  await expect(silenceIcon).toBeHidden();
});

test('field backgrounds show persistent card effects behind unobscured cards', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const trick = page.locator('#tarotKingdomTrick');
  const fieldCard = trick.locator(':scope > .tarot-card').first();
  const fieldSceneLayers = trick.locator(':scope > .tarot-kingdom-field-scene-layer');
  const card = (id, suit, number) => ({ id, kind: 'minor', suit, number });
  const expectScene = async (fileName) => {
    await expect(trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active'))
      .toHaveCSS('background-image', new RegExp(`${fileName}\\.webp`));
  };
  await expect(fieldSceneLayers).toHaveCount(2);
  await expect(fieldSceneLayers.first()).toHaveCSS('transition-duration', '0.42s');

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    tableCard: { id: 'scene-normal', kind: 'minor', suit: 'Wand', number: 1 }
  }));
  await expectScene('field-calm-sea');
  await expect(trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active'))
    .toHaveCSS('animation-name', 'tarotKingdomSceneGentleFlow');
  await expect(fieldCard).toHaveCSS('filter', 'none');
  await expect(fieldCard).toHaveCSS('opacity', '1');

  const lockScenes = [
    ['Wand', 'field-lock-lava'],
    ['Cup', 'field-lock-ice'],
    ['Sword', 'field-lock-storm'],
    ['Pentacle', 'field-lock-rock']
  ];
  for (const [lockSuit, fileName] of lockScenes) {
    await page.evaluate((suit) => window.TarotKingdomDebug.battleScenario({
      lockSuit: suit,
      tableCard: { id: `scene-lock-${suit}`, kind: 'minor', suit, number: 14 }
    }), lockSuit);
    await expectScene(fileName);
    await expect(trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active'))
      .toHaveCSS('animation-name', 'tarotKingdomSceneGentleFlow');
  }

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    reverse: true,
    tableCard: { id: 'scene-reverse', kind: 'minor', suit: 'Cup', number: 11 }
  }));
  await expectScene('field-reverse-whirlpool');
  const reverseSceneLayer = trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active');
  await expect(reverseSceneLayer).toHaveCSS('animation-name', 'tarotKingdomSceneBackFlow');
  await expect(reverseSceneLayer).toHaveCSS('animation-duration', '1.2s');
  const reverseMotion = await trick.evaluate((element) => {
    const sceneLayer = element.querySelector(':scope > .tarot-kingdom-field-scene-layer.is-active');
    const animation = sceneLayer?.getAnimations().find((entry) => entry.animationName === 'tarotKingdomSceneBackFlow');
    const cardElement = element.querySelector(':scope > .tarot-card');
    if (!animation || !cardElement || !sceneLayer) return null;
    animation.pause();
    animation.currentTime = 0;
    const startPosition = getComputedStyle(sceneLayer).backgroundPosition;
    const startCard = cardElement.getBoundingClientRect();
    animation.currentTime = 600;
    const movedPosition = getComputedStyle(sceneLayer).backgroundPosition;
    const movedCard = cardElement.getBoundingClientRect();
    return {
      startPosition,
      movedPosition,
      cardDeltaX: Math.abs(movedCard.x - startCard.x),
      cardDeltaY: Math.abs(movedCard.y - startCard.y)
    };
  });
  expect(reverseMotion).not.toBeNull();
  expect(reverseMotion.movedPosition).not.toBe(reverseMotion.startPosition);
  expect(reverseMotion.cardDeltaX).toBeLessThanOrEqual(0.1);
  expect(reverseMotion.cardDeltaY).toBeLessThanOrEqual(0.1);

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    tableCard: { id: 'scene-cut', kind: 'minor', suit: 'Sword', number: 8 }
  }));
  await expectScene('field-cut-crack');
  const cutSceneLayer = trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active');
  await expect(cutSceneLayer).toHaveCSS('transition-duration', '0s');
  await expect(cutSceneLayer).toHaveCSS('opacity', '1');
  await expect(cutSceneLayer).toHaveCSS('animation-name', 'none');

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    enemyTimeStop: true,
    tableCard: { id: 'scene-world', kind: 'major', suit: 'None', number: 21 }
  }));
  await expectScene('field-world-clock');
  await expect(trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active'))
    .toHaveCSS('animation-name', 'none');

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    enemyTimeStop: true,
    reverse: true,
    tableCard: { id: 'scene-priority-reverse', kind: 'minor', suit: 'Cup', number: 11 }
  }));
  await expectScene('field-reverse-whirlpool');

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    enemyTimeStop: true,
    reverse: true,
    lockSuit: 'Pentacle',
    tableCard: { id: 'scene-priority-lock', kind: 'minor', suit: 'Pentacle', number: 14 }
  }));
  await expectScene('field-lock-rock');

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    enemyTimeStop: true,
    reverse: true,
    lockSuit: 'Pentacle',
    tableCard: { id: 'scene-priority-cut', kind: 'minor', suit: 'Pentacle', number: 8 }
  }));
  await expectScene('field-cut-crack');

  const worldRoleCards = [21, 2, 3, 4, 6].map((number) => ({
    id: `scene-world-role-${number}`,
    kind: 'major',
    suit: 'None',
    number
  }));
  const worldRoleResult = await page.evaluate(({ roleCards, reserveCard }) => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      withTrick: false,
      turnIndex: 0,
      handsBySeat: [[...roleCards, reserveCard]]
    });
    return debug.battlePlayCards(0, roleCards.map((entry) => entry.id), { resolve: false });
  }, {
    roleCards: worldRoleCards,
    reserveCard: card('scene-world-role-reserve', 'Cup', 9)
  });
  expect(worldRoleResult.ok).toBe(true);
  await expectScene('field-role-world');
  await expect(trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active'))
    .toHaveCSS('animation-name', 'tarotKingdomSceneGentleFlow');

  await page.evaluate(({ playCard, reserveCard, tableCard }) => {
    window.TarotKingdomDebug.battleScenario({
      tableCard,
      turnIndex: 0,
      handsBySeat: [[playCard, reserveCard]]
    });
    window.TarotKingdomDebug.battlePlayOne(0, { resolve: false });
  }, {
    playCard: card('scene-skip', 'Wand', 5),
    reserveCard: card('scene-skip-reserve', 'Cup', 9),
    tableCard: card('scene-skip-table', 'Wand', 4)
  });
  await expect(trick).toHaveClass(/is-scene-skip/, { timeout: 5_000 });
  const skipWaveStyle = await trick.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      backgroundImage: style.backgroundImage
    };
  });
  expect(skipWaveStyle.animationName).toBe('tarotKingdomSceneSkipWave');
  expect(skipWaveStyle.animationDuration).toBe('0.9s');
  expect(skipWaveStyle.backgroundImage).toContain('field-skip-wave.webp');
  const skipWaveMotion = await trick.evaluate((element) => {
    const animation = element.getAnimations({ subtree: true })
      .find((entry) => entry.animationName === 'tarotKingdomSceneSkipWave');
    const cardElement = element.querySelector(':scope > .tarot-card');
    if (!animation || !cardElement) return null;
    animation.pause();
    animation.currentTime = 0;
    const startStyle = getComputedStyle(element, '::after');
    const startPosition = startStyle.backgroundPosition;
    const startOpacity = Number(startStyle.opacity);
    const startCard = cardElement.getBoundingClientRect();
    animation.currentTime = 470;
    const crestStyle = getComputedStyle(element, '::after');
    const crestPosition = crestStyle.backgroundPosition;
    const crestOpacity = Number(crestStyle.opacity);
    const crestCard = cardElement.getBoundingClientRect();
    animation.currentTime = 900;
    const returnedStyle = getComputedStyle(element, '::after');
    const returnedPosition = returnedStyle.backgroundPosition;
    const returnedOpacity = Number(returnedStyle.opacity);
    const returnedCard = cardElement.getBoundingClientRect();
    return {
      startPosition,
      startOpacity,
      crestPosition,
      crestOpacity,
      returnedPosition,
      returnedOpacity,
      crestCardDeltaX: Math.abs(crestCard.x - startCard.x),
      crestCardDeltaY: Math.abs(crestCard.y - startCard.y),
      returnedCardDeltaX: Math.abs(returnedCard.x - startCard.x),
      returnedCardDeltaY: Math.abs(returnedCard.y - startCard.y)
    };
  });
  expect(skipWaveMotion).not.toBeNull();
  expect(skipWaveMotion.crestPosition).not.toBe(skipWaveMotion.startPosition);
  expect(skipWaveMotion.returnedPosition).toBe(skipWaveMotion.startPosition);
  expect(skipWaveMotion.startOpacity).toBeLessThanOrEqual(0.01);
  expect(skipWaveMotion.crestOpacity).toBeGreaterThanOrEqual(0.95);
  expect(skipWaveMotion.returnedOpacity).toBeLessThanOrEqual(0.01);
  expect(skipWaveMotion.crestCardDeltaX).toBeLessThanOrEqual(0.1);
  expect(skipWaveMotion.crestCardDeltaY).toBeLessThanOrEqual(0.1);
  expect(skipWaveMotion.returnedCardDeltaX).toBeLessThanOrEqual(0.1);
  expect(skipWaveMotion.returnedCardDeltaY).toBeLessThanOrEqual(0.1);
  await expect(fieldCard).toHaveCSS('filter', 'none');
});

test('five-card roles always use rank-specific magic circles and ignore an included 8 cut', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const trick = page.locator('#tarotKingdomTrick');
  const activeScene = () => trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active');
  const minor = (id, suit, number) => ({ id, kind: 'minor', suit, number });
  const major = (number) => ({ id: `role-major-${number}`, kind: 'major', suit: 'None', number });
  const scenarios = [
    {
      key: 'straight',
      file: 'field-role-straight',
      cards: [
        minor('role-straight-6', 'Wand', 6),
        minor('role-straight-7', 'Cup', 7),
        minor('role-straight-8', 'Sword', 8),
        minor('role-straight-9', 'Pentacle', 9),
        minor('role-straight-10', 'Wand', 10)
      ]
    },
    {
      key: 'flush',
      file: 'field-role-flush',
      suitClass: 'is-scene-role-suit-cup',
      cards: [2, 4, 6, 9, 12].map((number) => minor(`role-flush-${number}`, 'Cup', number))
    },
    {
      key: 'full-house',
      file: 'field-role-full-house',
      cards: [3, 3, 3, 7, 7].map((number, index) => minor(`role-full-${index}`, ['Wand', 'Cup', 'Sword', 'Pentacle'][index % 4], number))
    },
    {
      key: 'four-kind',
      file: 'field-role-four-kind',
      cards: [8, 8, 8, 8, 9].map((number, index) => minor(`role-four-${index}`, ['Wand', 'Cup', 'Sword', 'Pentacle'][index % 4], number))
    },
    {
      key: 'world',
      file: 'field-role-world',
      cards: [major(21), major(2), major(3), major(4), major(6)]
    },
    {
      key: 'straight-flush',
      file: 'field-role-straight-flush',
      suitClass: 'is-scene-role-suit-wand',
      cards: [2, 3, 4, 5, 6].map((number) => minor(`role-straight-flush-${number}`, 'Wand', number))
    },
    {
      key: 'five-kind',
      file: 'field-role-five-kind',
      cards: Array.from({ length: 5 }, (_, index) => minor(`role-five-${index}`, ['Wand', 'Cup', 'Sword', 'Pentacle', 'Wand'][index], 9))
    }
  ];

  for (const scenario of scenarios) {
    const result = await page.evaluate(({ roleCards, reserveCard }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[...roleCards, reserveCard]]
      });
      return debug.battlePlayCards(0, roleCards.map((entry) => entry.id), { resolve: false });
    }, {
      roleCards: scenario.cards,
      reserveCard: minor(`role-${scenario.key}-reserve`, 'Pentacle', 13)
    });
    expect(result.ok, scenario.key).toBe(true);
    await expect(trick).toHaveClass(/is-scene-role/);
    await expect(activeScene()).toHaveCSS('background-image', new RegExp(`${scenario.file}\\.webp`));
    if (scenario.suitClass) await expect(trick).toHaveClass(new RegExp(scenario.suitClass));
    if (scenario.cards.some((entry) => Number(entry.number) === 8)) {
      await expect(trick).not.toHaveClass(/is-scene-cut/);
      await expect(activeScene()).not.toHaveCSS('background-image', /field-cut-crack\.webp/);
    }
  }
});

test('preview can switch every field-effect background from the demo picker', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const picker = page.locator('#tarotKingdomDemoFieldSceneSelect');
  const trick = page.locator('#tarotKingdomTrick');
  const activeScene = () => trick.locator(':scope > .tarot-kingdom-field-scene-layer.is-active');

  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(23);

  await picker.selectOption('role-straight');
  await expect(trick).toHaveClass(/is-scene-role-straight/);
  await expect(activeScene()).toHaveCSS('background-image', /field-role-straight\.webp/);

  await picker.selectOption('role-flush-sword');
  await expect(trick).toHaveClass(/is-scene-role-flush/);
  await expect(trick).toHaveClass(/is-scene-role-suit-sword/);
  await expect(activeScene()).toHaveCSS('background-image', /field-role-flush\.webp/);

  await picker.selectOption('cut');
  await expect(trick).toHaveClass(/is-scene-cut/);
  await expect(activeScene()).toHaveCSS('background-image', /field-cut-crack\.webp/);

  await picker.selectOption('normal');
  await expect(trick).not.toHaveClass(/is-scene-/);
  await expect(activeScene()).toHaveCSS('background-image', /field-calm-sea\.webp/);

  await picker.selectOption('auto');
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    tableCard: { id: 'demo-picker-auto-cut', kind: 'minor', suit: 'Cup', number: 8 }
  }));
  await expect(trick).toHaveClass(/is-scene-cut/);
});

test('preview can replay every normal and call five-card role cinematic', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const picker = page.locator('#tarotKingdomDemoRoleSelect');
  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(15);
  await expect(picker.locator('optgroup')).toHaveCount(2);

  await picker.selectOption('normal:FullHouse');
  await expect(picker).toHaveValue('');
  const initial = await page.evaluate(() => {
    const state = window.TarotKingdomDebug.battleState();
    const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-summon');
    const title = cutin?.querySelector('.tarot-kingdom-skill-cutin-title');
    const fanCard = cutin?.querySelector('.tarot-kingdom-skill-card-fan .tarot-card');
    return {
      roleKey: state.lastPlay?.role?.key || '',
      call: state.lastPlay?.call === true,
      transitionMs: Math.max(
        0,
        Number(state.transition?.endsAt || 0) - Number(state.transition?.startedAt || 0)
      ),
      clearingCount: document.querySelectorAll(
        '#tarotKingdomTrick > .tarot-card.is-role-field-clearing'
      ).length,
      fanRole: document.querySelector('.tarot-kingdom-skill-card-fan')?.dataset.roleFormation || '',
      roleShowAt: Number(cutin?.dataset.roleShowAt || 0),
      titleDurationMs: title ? parseFloat(getComputedStyle(title).animationDuration) * 1000 : 0,
      fanDurationMs: fanCard ? parseFloat(getComputedStyle(fanCard).animationDuration) * 1000 : 0
    };
  });
  expect(initial).toEqual({
    roleKey: 'FullHouse',
    call: false,
    transitionMs: 4500,
    clearingCount: 5,
    fanRole: 'FullHouse',
    roleShowAt: 1320,
    titleDurationMs: 1200,
    fanDurationMs: 1250
  });

  await page.waitForTimeout(500);
  const fullHouseTracks = await page.evaluate(() => Array.from(document.querySelectorAll(
    '#tarotKingdomTrick > .tarot-card.is-role-arriving'
  )).map((node) => node.dataset.roleEntry || ''));
  expect(fullHouseTracks).toEqual(['from-top', 'from-top', 'from-top', 'from-right', 'from-right']);

  const variants = await page.evaluate(() => {
    const roleKeys = [
      'Straight',
      'Flush',
      'FullHouse',
      'FourKind',
      'TheWorld',
      'StraightFlush',
      'FiveKind'
    ];
    return ['normal', 'call'].flatMap((mode) => roleKeys.map((roleKey) => {
      const result = window.TarotKingdomDebug.battleDemoRoleFormation(`${mode}:${roleKey}`);
      return {
        mode,
        roleKey,
        ok: result.ok,
        error: result.error || '',
        actualRoleKey: result.state?.lastPlay?.role?.key || '',
        call: result.state?.lastPlay?.call === true,
        transitionMs: Math.max(
          0,
          Number(result.state?.transition?.endsAt || 0) - Number(result.state?.transition?.startedAt || 0)
        )
      };
    }));
  });
  expect(variants).toHaveLength(14);
  variants.forEach((variant) => {
    expect(variant.ok, `${variant.mode}:${variant.roleKey}:${variant.error}`).toBe(true);
    expect(variant.actualRoleKey).toBe(variant.roleKey);
    expect(variant.call).toBe(variant.mode === 'call');
    expect(variant.transitionMs).toBe(4500);
  });
});

test('fullscreen close control uses only the framed close image', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 }, true);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'tarotKingdomExitButton';
    button.className = 'tarot-kingdom-exit-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'タロットキングダムを閉じる');
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    document.querySelector('.tarot-kingdom-header-meta')?.appendChild(button);
  });

  const closeButton = page.locator('#tarotKingdomExitButton');
  const closeIcon = closeButton.locator('span');
  await expect(closeButton).toHaveCSS('border-top-style', 'none');
  await expect(closeButton).toHaveCSS('border-image-source', 'none');
  await expect(closeButton).toHaveCSS('padding', '0px');
  await expect(closeIcon).toHaveCSS('width', '30px');
  await expect(closeIcon).toHaveCSS('height', '28px');
  await expect(closeIcon).toHaveCSS('background-image', /\/assets\/ui\/buttons\/action-close\.png/);
});

for (const fixture of [
  { label: 'preview 900px', viewport: { width: 900, height: 1000 }, productionCascade: false },
  { label: 'preview 390px', viewport: { width: 390, height: 844 }, productionCascade: false },
  { label: 'production 900px', viewport: { width: 900, height: 1000 }, productionCascade: true },
  { label: 'production 390px', viewport: { width: 390, height: 844 }, productionCascade: true }
]) {
  test(`battle UI keeps SFC arena, MJ hand, and lower commands at ${fixture.label}`, async ({ page }) => {
    await openOfflineBattle(page, fixture.viewport, fixture.productionCascade);
    const layout = await readBattleLayout(page);

    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.stage.x).toBeGreaterThanOrEqual(0);
    expect(layout.stage.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.stageScrollWidth).toBeLessThanOrEqual(layout.stageClientWidth + 1);
    expect(layout.stageStyle.backgroundImage).not.toBe('none');
    expect(layout.stageStyle.borderTopWidth + layout.stageStyle.borderBottomWidth).toBeGreaterThanOrEqual(1);
    expect(layout.arena.width).toBeGreaterThan(0);
    expect(layout.arena.height / layout.viewportHeight).toBeGreaterThanOrEqual(0.45);
    expect(layout.arena.height / layout.viewportHeight).toBeLessThanOrEqual(0.55);
    expect(layout.arenaStyle.backgroundImage).toContain('moonlit-terrace-vertical-v3.png');
    expect(layout.root.width).toBeLessThanOrEqual(640);

    expect(layout.enemy.x).toBeLessThan(layout.party.x);
    expect(layout.enemy.right - layout.party.x).toBeLessThanOrEqual(layout.stage.width * 0.05);
    expect(layout.enemyStyle.backgroundImage).toBe('none');
    expect(layout.partyStyle.backgroundImage).toBe('none');
    expect(layout.enemySprite.width).toBeGreaterThan(0);
    expect(layout.enemySprite.height).toBeGreaterThan(0);
    const enemyVisualCenter = layout.enemyVisual.y + (layout.enemyVisual.height / 2);
    const arenaCenter = layout.arena.y + (layout.arena.height / 2);
    expect(Math.abs(enemyVisualCenter - arenaCenter)).toBeLessThanOrEqual(layout.arena.height * 0.13);
    const enemySpriteCenter = layout.enemySprite.y + (layout.enemySprite.height / 2);
    expect(Math.abs(enemySpriteCenter - arenaCenter)).toBeLessThanOrEqual(layout.arena.height * 0.1);
    expect(layout.enemyFacing).toBe('left');
    expect(layout.affinityCount).toBe(0);
    expect(layout.enemySpriteStyle.imageRendering).toMatch(/pixelated|crisp-edges/);
    expect(layout.centerStyle.display).toBe('none');
    expect(layout.progressbarCount).toBe(5);
    expect(layout.enemyHpAria).toEqual({ now: '515', max: '515' });

    expect(layout.fieldItems).toHaveLength(5);
    expect(layout.fieldItems[0].style.borderImageSource).toBe('none');
    expect(layout.fieldArtAlignment).not.toBeNull();
    expect(layout.fieldArtAlignment.x).toBeLessThanOrEqual(2);
    expect(layout.fieldArtAlignment.y).toBeLessThanOrEqual(2);
    expect(layout.trickPanel.y).toBeGreaterThanOrEqual(layout.stage.bottom - 1);
    expect(layout.cardStage.y).toBeGreaterThanOrEqual(layout.trickPanel.y);
    expect(layout.selectedEffect.y).toBeGreaterThanOrEqual(layout.trickPanel.bottom - 1);
    expect(layout.hand.box.y).toBeGreaterThanOrEqual(layout.selectedEffect.bottom - 1);

    expect(layout.hand.cards).toHaveLength(8);
    expect(layout.hand.box.x).toBeGreaterThanOrEqual(0);
    expect(layout.hand.box.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.hand.scrollWidth).toBeLessThanOrEqual(layout.hand.clientWidth + 1);
    expect(layout.hand.style.overflowX).not.toBe('scroll');
    const minimumCardWidth = fixture.viewport.width <= 390 ? 32 : 40;
    const minimumCardHeight = fixture.viewport.width <= 390 ? 52 : 64;
    for (const card of layout.hand.cards) {
      expect(card.width).toBeGreaterThanOrEqual(minimumCardWidth);
      expect(card.height).toBeGreaterThanOrEqual(minimumCardHeight);
      expect(card.x).toBeGreaterThanOrEqual(layout.hand.box.x - 1);
      expect(card.right).toBeLessThanOrEqual(layout.hand.box.right + 1);
    }
    for (const art of layout.hand.art) {
      expect(art.width).toBeLessThanOrEqual(48.1);
      expect(art.height).toBeLessThanOrEqual(80.1);
    }
    const handTop = Math.min(...layout.hand.cards.map((card) => card.y));
    const handBottom = Math.max(...layout.hand.cards.map((card) => card.bottom));
    expect(Math.max(...layout.hand.cards.map((card) => card.y)) - handTop).toBeLessThanOrEqual(2);
    for (let index = 1; index < layout.hand.cards.length; index += 1) {
      const previous = layout.hand.cards[index - 1];
      const card = layout.hand.cards[index];
      expect(card.x).toBeGreaterThanOrEqual(previous.right - 1);
    }

    expect(layout.actions.style.position).toMatch(/relative|sticky/);
    expect(layout.actions.style.pointerEvents).not.toBe('none');
    expect(layout.actions.style.zIndex).toBeGreaterThanOrEqual(1000);
    expect(layout.actions.box.x).toBeGreaterThanOrEqual(0);
    expect(layout.actions.box.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.actions.box.height).toBeLessThanOrEqual(88);
    expect(layout.actions.buttons.map((button) => button.id)).toEqual([
      'tarotKingdomGraveToggleButton',
      'tarotKingdomClearButton',
      'tarotKingdomFoldButton',
      'tarotKingdomPlayButton'
    ]);
    for (const [index, button] of layout.actions.buttons.entries()) {
      expect(button.box.height).toBeGreaterThanOrEqual(44);
      expect(button.box.height).toBeLessThanOrEqual(52);
      expect(button.box.width).toBeGreaterThan(0);
      expect(button.borderImageSource).toMatch(/button-(?:dark|gold)-large\.png/);
      expect(button.writingMode).toBe('horizontal-tb');
      if (index > 0) {
        const previous = layout.actions.buttons[index - 1];
        expect(Math.abs(button.box.y - previous.box.y)).toBeLessThanOrEqual(2);
        expect(button.box.x).toBeGreaterThanOrEqual(previous.box.right - 1);
      }
    }
    expect(handTop).toBeGreaterThanOrEqual(0);
    expect(handBottom).toBeLessThanOrEqual(layout.actions.box.y + 1);
    expect(layout.actions.box.y - handBottom).toBeLessThanOrEqual(8);

    expect(layout.rows).toHaveLength(4);
    for (const [index, row] of layout.rows.entries()) {
      expect(row.box.x).toBeGreaterThanOrEqual(layout.party.x - 2);
      expect(row.box.right).toBeLessThanOrEqual(layout.party.right + 1);
      expect(row.box.width).toBeLessThanOrEqual(180.1);
      expect(row.avatarBox.x).toBeGreaterThanOrEqual(layout.party.x + 23);
      expect(row.avatarBox.width).toBeGreaterThan(0);
      expect(row.avatarBox.height).toBeGreaterThan(0);
      expect(row.avatarLayers).toBeGreaterThan(0);
      expect(row.avatarFacing).toBe('right');
      expect(row.avatarFacingScale).toBe('1');
      expect(row.avatarBodyImage).toContain('/Sprites/Characters/body/body_');
      expect(row.avatarBodyImage).not.toBe('none');
      expect(row.avatarShadowLeft).toBe('32px');
      expect(row.avatarShadowBottom).toBe('17px');
      expect(row.infoBox.x).toBeGreaterThanOrEqual(row.avatarBox.right - 1);
      expect(row.rankBox.height).toBeGreaterThan(0);
      expect(row.hpBox.height).toBeGreaterThan(0);
      expect(row.hpTrackBox.width).toBeLessThanOrEqual(88.1);
      expect(row.infoBox.right - row.hpTrackBox.right).toBeGreaterThanOrEqual(12);
      expect(row.handCountBox.height).toBeGreaterThan(0);
      expect(row.rank).toMatch(/(?:\S+\s+Lv\d+|Lv\d+\s*[·・]\s*\S+)/);
      expect(row.handCount).toMatch(/^残り手札\s+\d+枚$/);
      expect(row.handCountVisible).toBe(true);
      expect(row.handCountFontSize).toBeGreaterThanOrEqual(7);
      expect(row.rankFontSize).toBeGreaterThanOrEqual(7);
      expect(row.hpText).toMatch(/^HP\s+\d+\s+\/\s+\d+$/);
      expect(row.hpTextFontSize).toBeGreaterThanOrEqual(7);
      expect(row.statsAbsent).toBe(true);
      expect(Number(row.hpAria.now)).toBeGreaterThan(0);
      expect(Number(row.hpAria.max)).toBeGreaterThanOrEqual(Number(row.hpAria.now));

      if (index === 0) {
        expect(row.turnCue.rowBackground).toBe('none');
        expect(row.turnCue.beforeContent).toMatch(/none|normal/);
        expect(row.turnCue.avatarAnimation).toContain('tarotKingdomAvatarTurnGlow');
      }

      if (index > 0) {
        const previous = layout.rows[index - 1];
        expect(row.box.y).toBeGreaterThan(previous.box.y);
        expect(row.box.y).toBeGreaterThanOrEqual(previous.box.bottom - 1);
        expect(Math.abs(row.box.x - previous.box.x)).toBeLessThanOrEqual(1);
      }
    }

    if (fixture.viewport.width <= 390) {
      const firstCard = page.locator('#tarotKingdomHand > .tarot-card').first();
      const before = await firstCard.boundingBox();
      await firstCard.evaluate((card) => card.classList.add('is-selected'));
      await page.waitForTimeout(220);
      const after = await firstCard.boundingBox();
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      expect(before.y - after.y).toBeGreaterThanOrEqual(7);
    }
  });
}

test('battle opening brings the monster on screen, attacks, and deals the opening field card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abortFirebaseDataRequests(page);
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle&tkrev=opening-intro1', {
    waitUntil: 'domcontentloaded'
  });

  await expect(page.locator('#tarotKingdomStartOfflineButton')).toBeVisible();
  await page.locator('#tarotKingdomStartOfflineButton').click();

  const root = page.locator('#tarotKingdomRoot');
  const stage = page.locator('#tarotKingdomBattleStage');
  const enemySprite = page.locator('#tarotKingdomEnemySprite');
  const fieldCard = page.locator('#tarotKingdomTrick > .tarot-card');
  const attackButton = page.locator('#tarotKingdomPlayButton');

  await expect(stage).toBeVisible({ timeout: 20_000 });
  await expect(stage).toHaveClass(/is-opening-enemy-entering/);
  await expect(root).toHaveAttribute('data-opening-intro-stage', 'enter');
  await expect(fieldCard).toHaveCSS('visibility', 'hidden');
  await expect(attackButton).toBeDisabled();

  await expect(stage).toHaveClass(/is-opening-enemy-attacking/, { timeout: 2_500 });
  await expect(enemySprite).toHaveClass(/is-attacking/);
  await expect(root).toHaveAttribute('data-opening-intro-stage', 'attack');

  await expect(stage).toHaveClass(/is-opening-field-card/, { timeout: 2_500 });
  await expect(root).toHaveAttribute('data-opening-intro-stage', 'card');
  await expect(page.locator('.tarot-kingdom-card-deal-ghost')).toHaveCount(1);
  await expect(fieldCard).toHaveCSS('visibility', 'hidden');

  await expect(root).toHaveAttribute('data-opening-intro-stage', 'deal', { timeout: 2_500 });
  await expect(fieldCard).toHaveCSS('visibility', 'visible');
  await expect.poll(
    () => page.evaluate(() => window.TarotKingdomDebug?.battleState?.().phase),
    { timeout: 7_500 }
  ).not.toBe('openingDeal');
});

test('opening hand uses the sprite-sheet flip frames without changing the card footprint', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 }, true);
  await page.evaluate(() => window.TarotKingdomDebug.battleCardFlipPreview(0));

  const flippingCard = page.locator('#tarotKingdomHand > .tarot-card.is-opening-flip');
  await expect(flippingCard).toHaveCount(1);
  await expect(flippingCard.locator(':scope > .tarot-card-flip-sprite')).toHaveCount(1);
  const flipMetrics = await flippingCard.evaluate((card) => {
    const sprite = card.querySelector(':scope > .tarot-card-flip-sprite');
    const face = card.querySelector(':scope > .tarot-card-art:not(.tarot-card-flip-sprite)');
    const spriteAnimation = sprite?.getAnimations?.()[0] || null;
    const faceAnimation = face?.getAnimations?.()[0] || null;
    spriteAnimation?.pause();
    faceAnimation?.pause();
    const widths = [];
    const heights = [];
    const positions = [];
    [0, 120, 210, 300, 329].forEach((time) => {
      if (spriteAnimation) spriteAnimation.currentTime = time;
      if (faceAnimation) faceAnimation.currentTime = time;
      const rect = card.getBoundingClientRect();
      widths.push(rect.width);
      heights.push(rect.height);
      positions.push(sprite ? getComputedStyle(sprite).backgroundPosition : '');
    });
    const spriteStyle = sprite ? getComputedStyle(sprite) : null;
    const faceStyle = face ? getComputedStyle(face) : null;
    const cardStyle = getComputedStyle(card);
    return {
      widths,
      heights,
      positions: Array.from(new Set(positions)),
      spriteImage: spriteStyle?.backgroundImage || '',
      faceImage: faceStyle?.backgroundImage || '',
      flipAnimationName: spriteStyle?.animationName || '',
      cardAnimationName: cardStyle.animationName,
      cardTransform: cardStyle.transform
    };
  });

  expect(Math.max(...flipMetrics.widths) - Math.min(...flipMetrics.widths)).toBeLessThan(0.5);
  expect(Math.max(...flipMetrics.heights) - Math.min(...flipMetrics.heights)).toBeLessThan(0.5);
  expect(Math.min(...flipMetrics.widths)).toBeGreaterThan(40);
  expect(flipMetrics.positions.length).toBeGreaterThan(3);
  expect(flipMetrics.spriteImage).toContain('tarot.png');
  expect(flipMetrics.faceImage).toContain('tarot.png');
  expect(flipMetrics.flipAnimationName).toBe('tarotKingdomCardSpriteFlip');
  expect(flipMetrics.cardAnimationName).toBe('none');
  expect(flipMetrics.cardTransform).toBe('none');
});

test('battle opening keeps the arrived monster visible while its attack sheet finishes loading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abortFirebaseDataRequests(page);
  let delayedAttackRequest = false;
  await page.route('**/Sprites/pixel-monsters/**/attack.png', async (route) => {
    delayedAttackRequest = true;
    await new Promise((resolve) => setTimeout(resolve, 1_350));
    await route.continue();
  });
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle&tkrev=opening-preload1', {
    waitUntil: 'domcontentloaded'
  });

  await page.locator('#tarotKingdomStartOfflineButton').click();
  const root = page.locator('#tarotKingdomRoot');
  const stage = page.locator('#tarotKingdomBattleStage');
  const enemySprite = page.locator('#tarotKingdomEnemySprite');

  await expect(stage).toHaveClass(/is-opening-enemy-entering/);
  await page.waitForTimeout(950);
  expect(delayedAttackRequest).toBe(true);
  await expect(root).toHaveAttribute('data-opening-intro-stage', 'enter');
  await expect(enemySprite).toHaveCSS('opacity', '1');
  await expect(enemySprite).toHaveCSS('visibility', 'visible');
  const arrivedRect = await enemySprite.boundingBox();
  expect(arrivedRect).not.toBeNull();
  expect(arrivedRect.width).toBeGreaterThan(0);
  expect(arrivedRect.height).toBeGreaterThan(0);

  await expect(root).toHaveAttribute('data-opening-intro-stage', 'attack', { timeout: 3_000 });
  await expect(enemySprite).toHaveClass(/is-attacking/);
});

test('preview enemy picker switches among all purchased Pixel Monsters without changing battle rules', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const picker = page.locator('#tarotKingdomDemoEnemySelect');
  await expect(picker).toBeVisible();
  await expect(picker.locator('optgroup')).toHaveCount(3);
  await expect(picker.locator('option')).toHaveCount(50);
  await expect(picker).toHaveValue('ismartal-vol3-monster-01');

  const gallery = await page.evaluate(() => window.TarotKingdomDebug.battleDemoEnemies());
  expect(gallery).toHaveLength(50);
  expect(gallery.filter((enemy) => enemy.volume === 1)).toHaveLength(20);
  expect(gallery.filter((enemy) => enemy.volume === 2)).toHaveLength(20);
  expect(gallery.filter((enemy) => enemy.volume === 3)).toHaveLength(10);
  expect(gallery.filter((enemy) => enemy.isBoss).map((enemy) => enemy.id).sort()).toEqual([
    'ismartal-vol2-monster-07',
    'ismartal-vol2-monster-15',
    'ismartal-vol2-monster-16'
  ]);
  const manifest = await page.evaluate(async () => (
    fetch('/Sprites/pixel-monsters/manifest.json').then((response) => response.json())
  ));
  const animationRates = manifest.flatMap((monster) => (
    Object.values(monster.animations || {}).map((animation) => animation.fps)
  ));
  expect(new Set(animationRates)).toEqual(new Set([10]));
  const monsterNames = manifest.map((monster) => monster.name);
  expect(new Set(monsterNames).size).toBe(50);
  expect(monsterNames.every((name) => Array.from(name).length >= 2 && Array.from(name).length <= 6)).toBe(true);
  expect(manifest.filter((monster) => monster.isBoss).map((monster) => monster.id).sort()).toEqual([
    'ismartal-vol2-monster-07',
    'ismartal-vol2-monster-15',
    'ismartal-vol2-monster-16'
  ]);
  expect(manifest.filter((monster) => monster.animations?.attack2).map((monster) => monster.id).sort()).toEqual([
    'ismartal-vol2-monster-06',
    'ismartal-vol2-monster-07',
    'ismartal-vol2-monster-10'
  ]);
  expect(manifest.every((monster) => (
    Number.isFinite(monster.idleAnchor?.x)
    && Number.isFinite(monster.idleAnchor?.y)
    && monster.idleAnchor.x >= 0
    && monster.idleAnchor.x <= monster.frameWidth
    && monster.idleAnchor.y >= 0
    && monster.idleAnchor.y <= monster.frameHeight
    && ['ground', 'air'].includes(monster.idleAnchor.mode)
  ))).toBe(true);

  await picker.selectOption('ismartal-vol1-monster-01');
  await expect(picker).toHaveValue('ismartal-vol1-monster-01');
  await expect(page.locator('#tarotKingdomEnemyName')).toHaveText('トゲマル');
  await expect(page.locator('.tarot-kingdom-battle-enemy .tarot-kingdom-battle-eyebrow')).toHaveText('MONSTER');
  await page.waitForTimeout(1200);
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveCSS(
    'background-image',
    /\/pixel-monsters\/vol1\/monster-01\/idle\.png/
  );

  const selected = await page.evaluate(() => {
    const sprite = document.getElementById('tarotKingdomEnemySprite');
    const arena = document.querySelector('.tarot-kingdom-battle-arena');
    const spriteRect = sprite.getBoundingClientRect();
    const arenaRect = arena.getBoundingClientRect();
    const spriteStyle = getComputedStyle(sprite);
    const anchorX = parseFloat(spriteStyle.getPropertyValue('--tarot-kingdom-enemy-anchor-x'));
    const anchorY = parseFloat(spriteStyle.getPropertyValue('--tarot-kingdom-enemy-anchor-y'));
    const frameHeight = parseFloat(sprite.style.height) || 0;
    return {
      enemy: window.TarotKingdomDebug.battleState().battle.enemy,
      backgroundImage: getComputedStyle(sprite).backgroundImage,
      imageRendering: getComputedStyle(sprite).imageRendering,
      pixelScale: getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-scale').trim(),
      renderMode: sprite.dataset.monsterRender,
      frameWidth: parseFloat(sprite.style.width) || 0,
      frameHeight,
      spriteWidth: spriteRect.width,
      spriteHeight: spriteRect.height,
      layoutPivotX: parseFloat(spriteStyle.left) + parseFloat(spriteStyle.marginLeft) + anchorX,
      layoutPivotY: parseFloat(spriteStyle.bottom) + frameHeight - anchorY,
      anchorMode: sprite.dataset.monsterAnchor,
      arenaWidth: arenaRect.width,
      arenaHeight: arenaRect.height
    };
  });
  expect(selected.enemy.id).toBe('ismartal-vol1-monster-01');
  expect(selected.enemy.name).toBe('トゲマル');
  expect(selected.backgroundImage).toContain('/pixel-monsters/vol1/monster-01/idle.png');
  expect(selected.imageRendering).toMatch(/pixelated|crisp-edges/);
  expect(selected.pixelScale).toBe('2');
  expect(selected.renderMode).toBe('pixel');
  expect(Math.abs(selected.spriteWidth - (selected.frameWidth * 2))).toBeLessThanOrEqual(0.2);
  expect(selected.spriteWidth).toBeLessThan(selected.arenaWidth);
  expect(selected.spriteHeight).toBeLessThan(selected.arenaHeight);

  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({ handCounts: [8, 8, 8, 8] }));
  await expect(picker).toHaveValue('ismartal-vol3-monster-01');
  await expect(page.locator('#tarotKingdomEnemyName')).toHaveText('グラヴァ');

  await picker.selectOption('ismartal-vol2-monster-15');
  await page.waitForTimeout(1200);
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveCSS(
    'background-image',
    /\/pixel-monsters\/vol2\/monster-15\/idle\.png/
  );
  await expect(page.locator('#tarotKingdomEnemyName')).toHaveText('アビソス');
  await expect(page.locator('.tarot-kingdom-battle-enemy .tarot-kingdom-battle-eyebrow')).toHaveText('BOSS');
  const largeMonster = await page.locator('#tarotKingdomEnemySprite').evaluate((sprite) => ({
    pixelScale: getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-scale').trim(),
    frameWidth: parseFloat(sprite.style.width) || 0,
    displayWidth: sprite.getBoundingClientRect().width,
    displayLeft: sprite.getBoundingClientRect().left,
    displayRight: sprite.getBoundingClientRect().right,
    layoutPivotX: parseFloat(getComputedStyle(sprite).left)
      + parseFloat(getComputedStyle(sprite).marginLeft)
      + parseFloat(getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-anchor-x')),
    layoutPivotY: parseFloat(getComputedStyle(sprite).bottom)
      + (parseFloat(sprite.style.height) || 0)
      - parseFloat(getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-anchor-y')),
    anchorMode: sprite.dataset.monsterAnchor,
    partyLeft: document.querySelector('.tarot-kingdom-battle-party-side').getBoundingClientRect().left,
    stageScrollWidth: document.getElementById('tarotKingdomBattleStage').scrollWidth,
    stageClientWidth: document.getElementById('tarotKingdomBattleStage').clientWidth
  }));
  expect(largeMonster.pixelScale).toBe('2');
  expect(largeMonster.frameWidth).toBeGreaterThan(200);
  expect(Math.abs(largeMonster.displayWidth - (largeMonster.frameWidth * 2))).toBeLessThanOrEqual(0.2);
  expect(largeMonster.displayLeft).toBeLessThan(0);
  expect(Math.abs(largeMonster.layoutPivotX - selected.layoutPivotX)).toBeLessThanOrEqual(0.2);
  expect(Math.abs(largeMonster.layoutPivotY - selected.layoutPivotY)).toBeLessThanOrEqual(0.2);
  expect(largeMonster.anchorMode).toBe('ground');
  expect(largeMonster.stageScrollWidth).toBeLessThanOrEqual(largeMonster.stageClientWidth + 1);

  await picker.selectOption('ismartal-vol3-monster-01');
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveCSS('image-rendering', /pixelated|crisp-edges/);
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveAttribute('data-monster-render', 'pixel');
});

test('preview pet picker adds a normal monster to the second seat and can remove it', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const picker = page.locator('#tarotKingdomDemoPetSelect');
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(picker.locator('optgroup')).toHaveCount(3);
  await expect(picker.locator('option')).toHaveCount(48);

  const pets = await page.evaluate(() => window.TarotKingdomDebug.battleDemoPets());
  expect(pets).toHaveLength(47);
  expect(pets.every((monster) => monster.isBoss === false)).toBe(true);

  await picker.selectOption('ismartal-vol1-monster-05');
  await expect(picker).toHaveValue('ismartal-vol1-monster-05');
  const selectedState = await page.evaluate(() => window.TarotKingdomDebug.battleState());
  expect(selectedState.players.map((player) => player.id)).toEqual(['you', 'pet', 'npc1', 'npc2']);
  expect(selectedState.players.map((player) => player.isNpc)).toEqual([false, true, true, true]);
  expect(selectedState.players[1]).toMatchObject({
    name: 'ピコアイ',
    isPet: true,
    character: {
      source: 'pet',
      monsterId: 'ismartal-vol1-monster-05'
    }
  });

  const petRow = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player').nth(1);
  await expect(petRow).toHaveClass(/is-pet/);
  await expect(petRow.locator('.tarot-kingdom-battle-player-name')).toContainText('ピコアイ');
  await expect(petRow.locator('.tarot-kingdom-battle-pet-sprite')).toHaveCSS(
    'background-image',
    /\/pixel-monsters\/vol1\/monster-05\/idle\.png/
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await picker.selectOption('');
  await expect(picker).toHaveValue('');
  const clearedState = await page.evaluate(() => window.TarotKingdomDebug.battleState());
  expect(clearedState.players.map((player) => player.id)).toEqual(['you', 'npc1', 'npc2', 'npc3']);
  expect(clearedState.players.map((player) => player.isPet === true)).toEqual([false, false, false, false]);
  await expect(page.locator('#tarotKingdomBattleParty > .is-pet')).toHaveCount(0);
});

test('monsters with two attack sheets use the second one for area attacks and pet five-card skills', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const selection = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    const dualIds = [
      'ismartal-vol2-monster-06',
      'ismartal-vol2-monster-07',
      'ismartal-vol2-monster-10'
    ];
    return {
      dual: dualIds.map((id) => ({
        id,
        single: debug.battleMonsterAttackAnimation(id, 'single'),
        area: debug.battleMonsterAttackAnimation(id, 'area'),
        skill: debug.battleMonsterAttackAnimation(id, 'skill')
      })),
      fallback: {
        single: debug.battleMonsterAttackAnimation('ismartal-vol1-monster-01', 'single'),
        area: debug.battleMonsterAttackAnimation('ismartal-vol1-monster-01', 'area'),
        skill: debug.battleMonsterAttackAnimation('ismartal-vol1-monster-01', 'skill')
      },
      motion: debug.battleMonsterAttackMotion('ismartal-vol2-monster-06', 'area')
    };
  });
  expect(selection.dual).toEqual([
    { id: 'ismartal-vol2-monster-06', single: 'attack', area: 'attack2', skill: 'attack2' },
    { id: 'ismartal-vol2-monster-07', single: 'attack', area: 'attack2', skill: 'attack2' },
    { id: 'ismartal-vol2-monster-10', single: 'attack', area: 'attack2', skill: 'attack2' }
  ]);
  expect(selection.fallback).toEqual({ single: 'attack', area: 'attack', skill: 'attack' });
  expect(selection.motion).toMatchObject({
    animationName: 'attack2',
    animationDurationMs: 1100,
    advanceDurationMs: 180,
    returnDurationMs: 180,
    totalDurationMs: 1280
  });

  const enemySequence = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      pass: [false, true, true, true],
      leaderIndex: 1,
      turnIndex: 0,
      handCounts: [2, 2, 2, 2]
    });
    debug.battleSetDemoEnemy('ismartal-vol2-monster-06');
    const state = debug.battlePass(0);
    const visual = document.querySelector('.tarot-kingdom-battle-enemy-visual');
    const visualStyle = visual ? getComputedStyle(visual) : null;
    return {
      eventTypes: state.battle.events.slice(-2).map((event) => event.type),
      events: state.battle.events.slice(-2).map((event) => ({
        type: event.type,
        attackAnimationName: event.attackAnimationName,
        attackAnimationDurationMs: event.attackAnimationDurationMs,
        attackReturnDurationMs: event.attackReturnDurationMs
      })),
      animationName: document.getElementById('tarotKingdomEnemySprite')?.dataset.animationName || '',
      motionAnimationNames: visualStyle?.animationName || '',
      motionAnimationDurations: visualStyle?.animationDuration || '',
      motionAnimationDelays: visualStyle?.animationDelay || ''
    };
  });
  expect(enemySequence.eventTypes).toEqual(['enemy-single', 'enemy-area']);
  expect(enemySequence.events).toEqual([
    {
      type: 'enemy-single',
      attackAnimationName: 'attack',
      attackAnimationDurationMs: 1100,
      attackReturnDurationMs: 180
    },
    {
      type: 'enemy-area',
      attackAnimationName: 'attack2',
      attackAnimationDurationMs: 1100,
      attackReturnDurationMs: 180
    }
  ]);
  expect(enemySequence.animationName).toBe('attack');
  expect(enemySequence.motionAnimationNames).toContain('tarotKingdomBattleEnemyAdvance');
  expect(enemySequence.motionAnimationNames).toContain('tarotKingdomBattleEnemyReturn');
  expect(enemySequence.motionAnimationDurations).toBe('0.18s, 0.18s');
  const motionDelays = enemySequence.motionAnimationDelays
    .split(',')
    .map((value) => Number.parseFloat(value));
  expect(motionDelays[0]).toBeLessThanOrEqual(0);
  expect(motionDelays[1]).toBeGreaterThan(1);
  await page.waitForTimeout(220);
  const forwardOffset = await page.locator('.tarot-kingdom-battle-enemy-visual').evaluate((visual) => {
    const transform = getComputedStyle(visual).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
  });
  expect(forwardOffset).toBeGreaterThan(40);
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveAttribute('data-animation-name', 'attack2', {
    timeout: 1_800
  });
  await expect(page.locator('#tarotKingdomEnemySprite')).toHaveCSS(
    'background-image',
    /\/pixel-monsters\/vol2\/monster-06\/attack2\.png/
  );

  const petAnimations = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    const pet = {
      monsterId: 'ismartal-vol2-monster-06',
      monsterName: 'グリバト',
      number: 6,
      volume: 2
    };
    const normalCard = { id: 'pet-normal-2', kind: 'minor', suit: 'Wand', number: 2 };
    debug.battleScenario({
      pet,
      tableCard: { id: 'pet-normal-field', kind: 'minor', suit: 'Wand', number: 1 },
      handsBySeat: [
        [{ id: 'pet-normal-human', kind: 'minor', suit: 'Cup', number: 3 }],
        [normalCard, { id: 'pet-normal-keep', kind: 'minor', suit: 'Cup', number: 9 }],
        [{ id: 'pet-normal-npc2', kind: 'minor', suit: 'Sword', number: 4 }],
        [{ id: 'pet-normal-npc3', kind: 'minor', suit: 'Pentacle', number: 5 }]
      ],
      turnIndex: 1
    });
    debug.battlePlayOne(1, { resolve: false });
    const normalSprite = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player:nth-child(2) .tarot-kingdom-battle-pet-sprite'
    );
    const normal = {
      ok: true,
      animationName: normalSprite?.dataset.animationName || '',
      backgroundImage: normalSprite?.style.backgroundImage || ''
    };

    const roleCards = [2, 3, 4, 5, 6].map((number) => ({
      id: `pet-skill-${number}`,
      kind: 'minor',
      suit: 'Wand',
      number
    }));
    debug.battleScenario({
      pet,
      withTrick: false,
      handsBySeat: [
        [{ id: 'pet-skill-human', kind: 'minor', suit: 'Cup', number: 3 }],
        [...roleCards, { id: 'pet-skill-keep', kind: 'minor', suit: 'Cup', number: 9 }],
        [{ id: 'pet-skill-npc2', kind: 'minor', suit: 'Sword', number: 4 }],
        [{ id: 'pet-skill-npc3', kind: 'minor', suit: 'Pentacle', number: 5 }]
      ],
      turnIndex: 1
    });
    const skillResult = debug.battlePlayCards(1, roleCards.map((card) => card.id), { resolve: false });
    const skillSprite = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player:nth-child(2) .tarot-kingdom-battle-pet-sprite'
    );
    return {
      normal,
      skill: {
        ok: skillResult.ok,
        reason: skillResult.reason || '',
        animationName: skillSprite?.dataset.animationName || '',
        backgroundImage: skillSprite?.style.backgroundImage || ''
      }
    };
  });

  expect(petAnimations.normal).toMatchObject({ ok: true, animationName: 'attack' });
  expect(petAnimations.normal.backgroundImage).toContain('/pixel-monsters/vol2/monster-06/attack.png');
  expect(petAnimations.skill).toMatchObject({ ok: true, reason: '', animationName: 'attack2' });
  expect(petAnimations.skill.backgroundImage).toContain('/pixel-monsters/vol2/monster-06/attack2.png');
});

test('player attack and retreat shadows follow horizontal movement without leaving the floor', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const attackShadow = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      turnIndex: 0,
      leaderIndex: 1,
      tableCard: { id: 'shadow-field-1', kind: 'minor', suit: 'Cup', number: 1 },
      handsBySeat: [
        [
          { id: 'shadow-play-2', kind: 'minor', suit: 'Cup', number: 2 },
          { id: 'shadow-keep-9', kind: 'minor', suit: 'Sword', number: 9 }
        ],
        [{ id: 'shadow-npc1', kind: 'minor', suit: 'Wand', number: 3 }],
        [{ id: 'shadow-npc2', kind: 'minor', suit: 'Sword', number: 4 }],
        [{ id: 'shadow-npc3', kind: 'minor', suit: 'Pentacle', number: 5 }]
      ]
    });
    debug.battlePlayOne(0, { resolve: false });
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const shadow = row?.querySelector('.tarot-kingdom-battle-player-floor-shadow');
    const style = shadow ? getComputedStyle(shadow) : null;
    return {
      rowAttacking: row?.classList.contains('is-player-attacking') === true,
      animationName: style?.animationName || '',
      duration: style?.animationDuration || '',
      delay: parseFloat(style?.animationDelay || 'NaN')
    };
  });
  expect(attackShadow.rowAttacking).toBe(true);
  expect(attackShadow.animationName).toBe('tarotKingdomPlayerAttackShadow');
  expect(attackShadow.duration).toBe('0.38s');
  expect(attackShadow.delay).toBeGreaterThanOrEqual(0);

  const movingShadow = await page.locator(
    '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-battle-player-floor-shadow'
  ).evaluate((shadow) => {
    const style = getComputedStyle(shadow);
    const durationMs = parseFloat(style.animationDuration) * 1000;
    const delayMs = Math.max(0, parseFloat(style.animationDelay) * 1000);
    const animation = shadow.getAnimations().find((candidate) => (
      candidate.animationName === 'tarotKingdomPlayerAttackShadow'
    ));
    if (animation) {
      animation.pause();
      animation.currentTime = delayMs + (durationMs * 0.48);
    }
    const transform = getComputedStyle(shadow).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
  });
  expect(movingShadow).toBeLessThan(-40);

  const retreatShadow = await page.evaluate(() => {
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    row?.classList.add('is-retreating');
    document.getElementById('tarotKingdomBattleStage')?.classList.add('is-retreat');
    const shadow = row?.querySelector('.tarot-kingdom-battle-player-floor-shadow');
    return shadow ? getComputedStyle(shadow).animationName : '';
  });
  expect(retreatShadow).toBe('tarotKingdomPlayerRetreatShadow');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
  test(`all demo pets use the player scale and corrected flying offsets at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      return debug.battleDemoPets().map((pet) => {
        debug.battleSetDemoPet(pet.id);
        const playerAvatar = document.getElementById('tarotKingdomBattleAvatar-0');
        const petAvatar = document.getElementById('tarotKingdomBattleAvatar-1');
        const sprite = petAvatar?.querySelector(':scope > .tarot-kingdom-battle-pet-sprite');
        const spriteRect = sprite?.getBoundingClientRect();
        const hostRect = petAvatar?.getBoundingClientRect();
        const shadowStyle = petAvatar ? getComputedStyle(petAvatar, '::before') : null;
        const shadowCenterY = hostRect && shadowStyle
          ? hostRect.bottom - parseFloat(shadowStyle.bottom) - (parseFloat(shadowStyle.height) / 2)
          : NaN;
        return {
          id: pet.id,
          anchor: petAvatar?.dataset.monsterAnchor || '',
          playerScale: getComputedStyle(playerAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petHostScale: getComputedStyle(petAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petSpriteScale: sprite?.style.getPropertyValue('--tarot-kingdom-pet-scale') || '',
          offsetY: sprite?.style.getPropertyValue('--tarot-kingdom-pet-offset-y') || '',
          bottom: sprite ? getComputedStyle(sprite).bottom : '',
          horizontalAnchor: sprite ? parseFloat(getComputedStyle(sprite).left) : NaN,
          hostCenter: petAvatar ? petAvatar.offsetWidth / 2 : NaN,
          shadow: shadowStyle ? {
            content: shadowStyle.content,
            bottom: parseFloat(shadowStyle.bottom),
            width: parseFloat(shadowStyle.width),
            opacity: parseFloat(shadowStyle.opacity),
            background: shadowStyle.backgroundImage,
            centerOffsetX: parseFloat(shadowStyle.left) - parseFloat(getComputedStyle(sprite).left),
            groundGap: spriteRect ? shadowCenterY - spriteRect.bottom : NaN
          } : null,
          playerOrder: debug.battleState().players.map((player) => player.id)
        };
      });
    });

    expect(audit).toHaveLength(47);
    expect(audit.filter((pet) => !(
      !!pet.playerScale
      && pet.petHostScale === pet.playerScale
      && pet.petSpriteScale === '1'
      && pet.horizontalAnchor <= pet.hostCenter - 3
      && pet.horizontalAnchor >= pet.hostCenter - 5
      && pet.shadow?.content !== 'none'
      && pet.shadow?.width >= 36
      && pet.shadow?.background.includes('radial-gradient')
      && Math.abs(pet.shadow?.centerOffsetX) <= 1
      && (pet.anchor === 'air'
        ? pet.shadow?.bottom === -8 && pet.shadow?.opacity < 0.6 && pet.shadow?.groundGap >= 8
        : pet.shadow?.bottom === 1 && pet.shadow?.opacity >= 0.7
          && pet.shadow?.groundGap >= 0 && pet.shadow?.groundGap <= 4)
      && pet.playerOrder.join(',') === 'you,pet,npc1,npc2'
    ))).toEqual([]);
    for (const monsterId of [
      'ismartal-vol2-monster-05',
      'ismartal-vol2-monster-17',
      'ismartal-vol3-monster-09'
    ]) {
      const pet = audit.find((entry) => entry.id === monsterId);
      expect(pet).toMatchObject({ offsetY: '0px', bottom: '8px' });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('enemy and party shadows stay grounded while flying monsters cast a lower softer shadow', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    turnIndex: 0,
    handCounts: [8, 8, 8, 8]
  }));

  const picker = page.locator('#tarotKingdomDemoEnemySelect');
  const enemyVisual = page.locator('.tarot-kingdom-battle-enemy-visual');
  await picker.selectOption('ismartal-vol1-monster-01');
  await expect(enemyVisual).toHaveAttribute('data-monster-anchor', 'ground');

  const grounded = await enemyVisual.evaluate((visual) => {
    const style = getComputedStyle(visual, '::after');
    return {
      content: style.content,
      bottom: parseFloat(style.bottom),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      opacity: parseFloat(style.opacity),
      background: style.backgroundImage
    };
  });
  const playerShadow = await page.locator('.tarot-kingdom-battle-player-floor-shadow').first().evaluate((shadow) => {
    const style = getComputedStyle(shadow);
    const row = shadow.closest('.tarot-kingdom-battle-player');
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    const bodyLayer = Array.from(avatar?.children || []).find((layer) => (
      getComputedStyle(layer).backgroundImage.includes('/Sprites/Characters/body/')
    ));
    const shadowRect = shadow.getBoundingClientRect();
    const bodyRect = bodyLayer?.getBoundingClientRect();
    return {
      display: style.display,
      bottom: parseFloat(style.bottom),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      opacity: parseFloat(style.opacity),
      background: style.backgroundImage,
      filter: style.filter,
      boxShadow: style.boxShadow,
      centerOffsetX: bodyRect
        ? (shadowRect.left + shadowRect.width / 2) - (bodyRect.left + bodyRect.width / 2)
        : null,
      groundOffsetY: bodyRect
        ? (shadowRect.top + shadowRect.height / 2) - bodyRect.bottom
        : null
    };
  });

  expect(grounded.content).not.toBe('none');
  expect(grounded.bottom).toBe(-2);
  expect(grounded.width).toBeGreaterThanOrEqual(54);
  expect(grounded.height).toBeGreaterThanOrEqual(9);
  expect(grounded.opacity).toBeGreaterThanOrEqual(0.7);
  expect(grounded.background).toContain('radial-gradient');
  expect(playerShadow.display).toBe('block');
  expect(playerShadow.bottom).toBeCloseTo(2, 1);
  expect(playerShadow.width).toBe(52);
  expect(playerShadow.height).toBe(10);
  expect(playerShadow.opacity).toBeCloseTo(grounded.opacity, 2);
  expect(playerShadow.background).toBe(grounded.background);
  expect(playerShadow.filter).toContain('blur(2px)');
  expect(playerShadow.boxShadow).toBe('none');
  expect(Math.abs(playerShadow.centerOffsetX)).toBeLessThanOrEqual(1);
  expect(playerShadow.groundOffsetY).toBeGreaterThanOrEqual(0);
  expect(playerShadow.groundOffsetY).toBeLessThanOrEqual(2);

  await picker.selectOption('ismartal-vol1-monster-09');
  await expect(enemyVisual).toHaveAttribute('data-monster-anchor', 'air');
  const airborne = await enemyVisual.evaluate((visual) => {
    const style = getComputedStyle(visual, '::after');
    return {
      bottom: parseFloat(style.bottom),
      width: parseFloat(style.width),
      opacity: parseFloat(style.opacity),
      filter: style.filter
    };
  });

  expect(airborne.bottom).toBeLessThan(grounded.bottom);
  expect(airborne.width).toBeGreaterThanOrEqual(46);
  expect(airborne.opacity).toBeLessThan(grounded.opacity);
  expect(airborne.filter).toContain('blur');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
  test(`every monster and player shadow stays visible on its foot anchor at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ turnIndex: 0, handCounts: [8, 8, 8, 8] });
      const enemies = debug.battleDemoEnemies().map((monster) => {
        debug.battleSetDemoEnemy(monster.id);
        const sprite = document.getElementById('tarotKingdomEnemySprite');
        const visual = sprite?.closest('.tarot-kingdom-battle-enemy-visual');
        const visualRect = visual?.getBoundingClientRect();
        const shadow = visual ? getComputedStyle(visual, '::after') : null;
        return {
          id: monster.id,
          anchor: visual?.dataset.monsterAnchor || '',
          content: shadow?.content || 'none',
          display: shadow?.display || 'none',
          bottom: parseFloat(shadow?.bottom || 'NaN'),
          width: parseFloat(shadow?.width || 'NaN'),
          height: parseFloat(shadow?.height || 'NaN'),
          opacity: parseFloat(shadow?.opacity || 'NaN'),
          background: shadow?.backgroundImage || '',
          centerOffsetX: visualRect
            ? parseFloat(shadow?.left || 'NaN') - (visualRect.width / 2)
            : NaN,
          scaleY: visual?.style.getPropertyValue('--tarot-kingdom-enemy-shadow-scale-y') || ''
        };
      });
      const players = Array.from(
        document.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player:not(.is-pet)')
      ).map((row) => {
        const avatar = row.querySelector('.tarot-kingdom-battle-player-avatar');
        const body = Array.from(avatar?.children || []).find((layer) => (
          getComputedStyle(layer).backgroundImage.includes('/Sprites/Characters/body/')
        ));
        const shadow = row.querySelector('.tarot-kingdom-battle-player-floor-shadow');
        const bodyRect = body?.getBoundingClientRect();
        const shadowRect = shadow?.getBoundingClientRect();
        const style = shadow ? getComputedStyle(shadow) : null;
        return {
          display: style?.display || 'none',
          opacity: parseFloat(style?.opacity || 'NaN'),
          centerOffsetX: bodyRect && shadowRect
            ? (shadowRect.left + shadowRect.width / 2) - (bodyRect.left + bodyRect.width / 2)
            : NaN,
          groundOffsetY: bodyRect && shadowRect
            ? (shadowRect.top + shadowRect.height / 2) - bodyRect.bottom
            : NaN
        };
      });
      return { enemies, players };
    });

    expect(audit.enemies).toHaveLength(50);
    expect(audit.enemies.filter((enemy) => !(
      enemy.content !== 'none'
      && enemy.display !== 'none'
      && enemy.width >= (enemy.anchor === 'air' ? 46 : 54)
      && enemy.height >= 9
      && enemy.background.includes('radial-gradient')
      && Math.abs(enemy.centerOffsetX) <= 1
      && (enemy.anchor === 'air'
        ? enemy.bottom === -12 && enemy.opacity < 0.6 && enemy.scaleY === '0.62'
        : enemy.bottom === -2 && enemy.opacity >= 0.7 && enemy.scaleY === '0.72')
    ))).toEqual([]);
    expect(audit.players).toHaveLength(4);
    expect(audit.players.filter((player) => !(
      player.display === 'block'
      && player.opacity >= 0.7
      && Math.abs(player.centerOffsetX) <= 1
      && player.groundOffsetY >= 0
      && player.groundOffsetY <= 2
    ))).toEqual([]);
  });
}

test('monster-specific offsets and flips stay consistent in the demo renderer', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    turnIndex: 0,
    handCounts: [8, 8, 8, 8]
  }));

  const expected = [
    { id: 'ismartal-vol2-monster-05', name: 'リルフィ', offsetY: -24, flipX: false, flipY: false },
    { id: 'ismartal-vol2-monster-06', name: 'グリバト', offsetY: 0, flipX: false, flipY: true },
    { id: 'ismartal-vol2-monster-08', name: 'ルビット', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol2-monster-09', name: 'ノッカ', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol2-monster-10', name: 'ウッドラ', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol2-monster-17', name: 'メカノ', offsetY: -56, flipX: false, flipY: false },
    { id: 'ismartal-vol2-monster-19', name: 'バクス', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol3-monster-06', name: 'ヨミル', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol3-monster-09', name: 'クロモ', offsetY: -16, flipX: false, flipY: false }
  ];
  const manifest = await page.evaluate(() => (
    fetch('/Sprites/pixel-monsters/manifest.json').then((response) => response.json())
  ));
  expected.forEach((entry) => {
    const monster = manifest.find((candidate) => candidate.id === entry.id);
    expect(monster?.battleOffsetY || 0).toBe(entry.offsetY);
    expect(monster?.flipX === true).toBe(entry.flipX);
    expect(monster?.flipY === true).toBe(entry.flipY);
  });

  const picker = page.locator('#tarotKingdomDemoEnemySelect');
  const sprite = page.locator('#tarotKingdomEnemySprite');
  for (const entry of expected) {
    await picker.selectOption(entry.id);
    await expect(page.locator('#tarotKingdomEnemyName')).toHaveText(entry.name);
    await expect(sprite).toHaveAttribute('data-monster-flip-x', String(entry.flipX));
    await expect(sprite).toHaveAttribute('data-monster-flip-y', String(entry.flipY));
    const render = await sprite.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        offsetY: style.getPropertyValue('--tarot-kingdom-enemy-offset-y').trim(),
        scaleX: style.getPropertyValue('--tarot-kingdom-enemy-facing-scale-x').trim(),
        scaleY: style.getPropertyValue('--tarot-kingdom-enemy-scale-y').trim()
      };
    });
    expect(render.offsetY).toBe(`${entry.offsetY}px`);
    expect(render.scaleX).toBe(entry.flipX ? '1' : '-1');
    expect(render.scaleY).toBe(entry.flipY ? '-1' : '1');
  }
});

test('playing a card travels from the hand and settles into the field', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ withTrick: false, turnIndex: 0 });
  });
  await page.locator('#tarotKingdomHand > .tarot-card').first().click();
  await page.locator('#tarotKingdomPlayButton').click();
  const dealGhost = page.locator('.tarot-kingdom-card-deal-ghost');
  await expect(dealGhost).toHaveCount(1);
  await expect(page.locator('.tarot-kingdom-ram-card')).toHaveCount(0);
  const flightTarget = await dealGhost.evaluate((ghost) => {
    const animation = ghost.getAnimations()[0];
    const fieldSlot = document.querySelector('#tarotKingdomTrick > .tarot-kingdom-field-slot');
    if (!animation || !fieldSlot) return null;
    animation.pause();
    animation.currentTime = Math.max(0, Number(animation.effect?.getComputedTiming?.().duration) - 2);
    const ghostRect = ghost.getBoundingClientRect();
    const slotRect = fieldSlot.getBoundingClientRect();
    return {
      ghostWidth: ghostRect.width,
      ghostHeight: ghostRect.height,
      slotWidth: slotRect.width,
      slotHeight: slotRect.height,
      fieldWidth: document.getElementById('tarotKingdomTrick')?.getBoundingClientRect().width || 0
    };
  });
  expect(flightTarget).not.toBeNull();
  expect(Math.abs(flightTarget.ghostWidth - flightTarget.slotWidth)).toBeLessThan(2);
  expect(Math.abs(flightTarget.ghostHeight - flightTarget.slotHeight)).toBeLessThan(2);
  expect(flightTarget.ghostWidth).toBeLessThan(flightTarget.fieldWidth / 3);

  await page.waitForTimeout(370);
  const incoming = page.locator('#tarotKingdomTrick > .tarot-card.is-deal-settling');
  await expect(incoming).toHaveCount(1);
  const animation = await incoming.evaluate((card) => ({
    name: getComputedStyle(card).animationName,
    duration: getComputedStyle(card).animationDuration
  }));
  expect(animation.name).toBe('tarotKingdomFieldCardSettleV7');
  expect(animation.duration).toBe('0.22s');
});

test('normal play displaces the old field card without the legacy flying-card CSS', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      leaderIndex: 1,
      tableCard: { id: 'tk_v5_table_4', kind: 'minor', suit: 'Cup', number: 4 },
      handsBySeat: [[
        { id: 'tk_v5_play_7', kind: 'minor', suit: 'Wand', number: 7 },
        { id: 'tk_v5_reserve', kind: 'minor', suit: 'Cup', number: 9 }
      ]]
    });
  });

  const handCard = page.locator('#tarotKingdomHand > .tarot-card[data-card-index="0"]');
  await expect(handCard).toHaveCount(1);
  await handCard.click();
  await page.locator('#tarotKingdomPlayButton').click();

  const outgoing = page.locator('#tarotKingdomTrick > .tarot-card.is-deal-displaced');
  await expect(outgoing).toHaveCount(1);
  await expect(page.locator('.tarot-kingdom-card-deal-ghost')).toHaveCount(1);
  await expect(page.locator('.tarot-kingdom-ram-card')).toHaveCount(0);
  const exitAnimation = await outgoing.evaluate((card) => getComputedStyle(card).animationName);
  expect(exitAnimation).toBe('tarotKingdomFieldCardDisplaceV7');

  await page.waitForTimeout(370);
  const incoming = page.locator('#tarotKingdomTrick > .tarot-card.is-deal-settling');
  await expect(incoming).toHaveCount(1);
  const landingAnimation = await incoming.evaluate((card) => getComputedStyle(card).animationName);
  expect(landingAnimation).toBe('tarotKingdomFieldCardSettleV7');
});

test('another player deals from their battle avatar instead of the local hand', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 1,
      handsBySeat: [
        [
          { id: 'tk_local_keep_3', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'tk_local_keep_9', kind: 'minor', suit: 'Sword', number: 9 }
        ],
        [
          { id: 'tk_remote_play_7', kind: 'minor', suit: 'Wand', number: 7 },
          { id: 'tk_remote_keep_10', kind: 'minor', suit: 'Pentacle', number: 10 }
        ]
      ]
    });
    window.TarotKingdomDebug.battlePlayOne(1, { resolve: false });
  });

  const ghost = page.locator('.tarot-kingdom-card-deal-ghost');
  await expect(ghost).toHaveCount(1);
  const distances = await page.evaluate(() => {
    const ghostNode = document.querySelector('.tarot-kingdom-card-deal-ghost');
    const avatar = document.getElementById('tarotKingdomBattleAvatar-1');
    const handCard = document.querySelector('#tarotKingdomHand > .tarot-card');
    const avatarRect = avatar.getBoundingClientRect();
    const handRect = handCard.getBoundingClientRect();
    const ghostWidth = parseFloat(ghostNode.style.width) || ghostNode.getBoundingClientRect().width;
    const ghostHeight = parseFloat(ghostNode.style.height) || ghostNode.getBoundingClientRect().height;
    const source = {
      x: (parseFloat(ghostNode.style.left) || 0) + (ghostWidth / 2),
      y: (parseFloat(ghostNode.style.top) || 0) + (ghostHeight / 2)
    };
    const center = (rect) => ({ x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) });
    const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
    return {
      avatar: distance(source, center(avatarRect)),
      hand: distance(source, center(handRect))
    };
  });
  expect(distances.avatar).toBeLessThan(2);
  expect(distances.hand).toBeGreaterThan(60);
});

test('Judgment selection message is compact and fits the mobile frame', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      handsBySeat: [[
        { id: 'tk_judgment_20', kind: 'major', suit: 'None', number: 20 },
        { id: 'tk_judgment_keep_6', kind: 'minor', suit: 'Cup', number: 6 }
      ]]
    });
  });

  await page.locator('#tarotKingdomHand > .tarot-card', { hasText: '審判' }).click();
  const selectedEffect = page.locator('#tarotKingdomSelectedEffect');
  await expect(selectedEffect).toHaveText('審判 / A不可・11バック・墓地回収');
  await expect(selectedEffect).not.toContainText('選択:');
  const textFit = await selectedEffect.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(textFit.scrollWidth).toBeLessThanOrEqual(textFit.clientWidth);
  expect(textFit.scrollHeight).toBeLessThanOrEqual(textFit.clientHeight);
});

test('long card guidance uses the fixed two-line compact layout', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      handsBySeat: [[
        { id: 'tk_fool_0', kind: 'major', suit: 'None', number: 0 },
        { id: 'tk_fool_keep_6', kind: 'minor', suit: 'Cup', number: 6 }
      ]]
    });
  });

  await page.locator('#tarotKingdomHand > .tarot-card', { hasText: '愚者' }).click();
  const guidance = page.locator('#tarotKingdomSelectedEffect');
  await expect(guidance).not.toContainText('選択:');
  await expect(guidance).toHaveClass(/is-compact/);
  const textFit = await guidance.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(textFit.scrollWidth).toBeLessThanOrEqual(textFit.clientWidth);
  expect(textFit.scrollHeight).toBeLessThanOrEqual(textFit.clientHeight);
});

test('battle announcement stays visible while the hand remains selectable between turns', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const selectedEffect = page.locator('#tarotKingdomSelectedEffect');
  const firstCard = page.locator('#tarotKingdomHand > .tarot-card').first();

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 1 });
  });
  await expect(selectedEffect).toBeVisible();
  await expect(selectedEffect).toContainText('の行動を待っています');
  const waitingHandTop = await firstCard.evaluate((element) => element.getBoundingClientRect().top);
  await expect(firstCard).toHaveAttribute('aria-pressed', 'false');
  await firstCard.click({ force: true });
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0 });
  });
  await expect(selectedEffect).toBeVisible();
  await expect(selectedEffect).toHaveText('カードを選択してください');
  const activeHandTop = await firstCard.evaluate((element) => element.getBoundingClientRect().top);
  expect(Math.abs(activeHandTop - waitingHandTop)).toBeLessThanOrEqual(0.5);
  await firstCard.click();
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
});

test('encounter and battle result announcements use short RPG-style messages', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const announcement = page.locator('#tarotKingdomSelectedEffect');
  const setBattleAnnouncementState = async (patch) => {
    await page.evaluate((next) => {
      const debug = window.TarotKingdomDebug;
      const payload = debug.battlePublicState();
      payload.state.battle.enemy.name = 'グラヴァ';
      Object.assign(payload.state, next.state || {});
      Object.assign(payload.state.battle, next.battle || {});
      debug.battleDeserialize(payload);
      debug.battleRender();
    }, patch);
  };

  await setBattleAnnouncementState({
    state: { phase: 'openingDeal', openingIntroStage: 'enter' },
    battle: { outcome: null, resultReason: null }
  });
  await expect(announcement).toHaveText('グラヴァが　あらわれた！');

  await setBattleAnnouncementState({
    state: { phase: 'openingDeal', openingIntroStage: 'attack' },
    battle: { outcome: null, resultReason: null }
  });
  await expect(announcement).toHaveText('グラヴァの攻撃！');

  await setBattleAnnouncementState({
    state: { phase: 'openingDeal', openingIntroStage: 'card' },
    battle: { outcome: null, resultReason: null }
  });
  await expect(announcement).toHaveText('グラヴァは　カードをだした！');

  await setBattleAnnouncementState({
    state: { phase: 'openingCinematic', openingIntroStage: 'ready', handNo: 1 },
    battle: { outcome: null, resultReason: null }
  });
  await expect(announcement).toHaveText('第2局が　はじまった！');

  await setBattleAnnouncementState({
    state: { phase: 'roundEnd' },
    battle: { outcome: 'victory', resultReason: 'hand-empty' }
  });
  await expect(announcement).toHaveText('グラヴァを　たおした！');

  await setBattleAnnouncementState({
    state: { phase: 'roundEnd' },
    battle: { outcome: 'victory', resultReason: 'enemy-escaped' }
  });
  await expect(announcement).toHaveText('グラヴァは　にげだした！');

  const textFit = await announcement.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(textFit.scrollWidth).toBeLessThanOrEqual(textFit.clientWidth);
  expect(textFit.scrollHeight).toBeLessThanOrEqual(textFit.clientHeight);
});

for (const fixture of [
  { label: '900px', viewport: { width: 900, height: 1000 } },
  { label: '390px', viewport: { width: 390, height: 844 } }
]) {
  test(`selected card stays in the hand and never replaces the field at ${fixture.label}`, async ({ page }) => {
    await openOfflineBattle(page, fixture.viewport);

    const handCards = page.locator('#tarotKingdomHand > .tarot-card');
    const selectedCards = page.locator('#tarotKingdomSelectedCards');
    const fieldCards = page.locator('#tarotKingdomTrick > .tarot-card');
    const fieldTextBefore = await fieldCards.allTextContents();
    await expect(selectedCards).toHaveCount(0);

    const firstHandCard = handCards.first();
    await firstHandCard.click({ force: true });
    await expect(firstHandCard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(1);
    expect(await fieldCards.allTextContents()).toEqual(fieldTextBefore);

    await firstHandCard.click({ force: true });
    await expect(firstHandCard).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(0);
    expect(await fieldCards.allTextContents()).toEqual(fieldTextBefore);
  });
}

for (const fixture of [
  { label: '900px', viewport: { width: 900, height: 1000 } },
  { label: '390px', viewport: { width: 390, height: 844 } }
]) {
  test(`selected hand card keeps sharp axis-aligned sprite rendering at ${fixture.label}`, async ({ page }) => {
    await openOfflineBattle(page, fixture.viewport);
    const firstHandCard = page.locator('#tarotKingdomHand > .tarot-card').first();
    const visualBefore = await firstHandCard.evaluate((card) => {
      const rect = card.getBoundingClientRect();
      const art = card.querySelector('.tarot-card-art');
      return {
        x: rect.x,
        width: rect.width,
        artTransform: art ? getComputedStyle(art).transform : ''
      };
    });

    await firstHandCard.click({ force: true });
    await expect(firstHandCard).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(190);
    const visualAfter = await firstHandCard.evaluate((card) => {
      const rect = card.getBoundingClientRect();
      const art = card.querySelector('.tarot-card-art');
      const matrix = new DOMMatrix(getComputedStyle(card).transform);
      return {
        x: rect.x,
        width: rect.width,
        rotationB: matrix.b,
        rotationC: matrix.c,
        artTransform: art ? getComputedStyle(art).transform : '',
        imageRendering: art ? getComputedStyle(art).imageRendering : ''
      };
    });

    expect(Math.abs(visualAfter.x - visualBefore.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(visualAfter.width - visualBefore.width)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(visualAfter.rotationB)).toBeLessThanOrEqual(0.00001);
    expect(Math.abs(visualAfter.rotationC)).toBeLessThanOrEqual(0.00001);
    expect(visualAfter.artTransform).toBe(visualBefore.artTransform);
    expect(visualAfter.imageRendering).toMatch(/pixelated|crisp-edges/);
  });
}

test('only cards that can participate in a legal play glow in the hand', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const localHand = [
    { id: 'tk_playable_ace', kind: 'minor', suit: 'Wand', number: 1 },
    { id: 'tk_playable_world', kind: 'major', suit: 'None', number: 21 },
    { id: 'tk_blocked_fool', kind: 'major', suit: 'None', number: 0 }
  ];
  await page.evaluate((hand) => {
    window.TarotKingdomDebug.battleScenario({
      handCounts: [3, 6, 6, 6],
      handsBySeat: [hand],
      turnIndex: 0
    });
  }, localHand);

  const hand = page.locator('#tarotKingdomHand');
  const playableCards = hand.locator(':scope > .tarot-card.is-playable');
  const playableLabels = (await playableCards.allTextContents()).map((label) => label.replace(/\s+/g, ' ').trim());
  expect(playableLabels).toHaveLength(2);
  expect(playableLabels.some((label) => label.includes('Ace'))).toBe(true);
  expect(playableLabels.some((label) => label.includes('世界'))).toBe(true);

  const worldNumber = hand.locator(':scope > .tarot-card', { hasText: '世界' }).locator('.tarot-card-number');
  const foolNumber = hand.locator(':scope > .tarot-card', { hasText: '愚者' }).locator('.tarot-card-number');
  await expect(worldNumber).toHaveCSS('animation-name', 'tarotKingdomPlayableNumberGlow');
  await expect(foolNumber).toHaveCSS('animation-name', 'none');

  await page.evaluate((hand) => {
    window.TarotKingdomDebug.battleScenario({
      handCounts: [3, 6, 6, 6],
      handsBySeat: [hand],
      turnIndex: 1
    });
  }, localHand);
  await expect(hand.locator(':scope > .tarot-card.is-playable')).toHaveCount(0);
  await expect(hand.locator(':scope > .tarot-card', { hasText: '世界' }).locator('.tarot-card-number'))
    .toHaveCSS('animation-name', 'none');
});

test('major 15, 20 and 21 glow and explain errors using their schema 8 restrictions', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const debugScenario = async (options) => {
    await page.evaluate((scenario) => window.TarotKingdomDebug.battleScenario(scenario), options);
  };

  await debugScenario({
    turnIndex: 0,
    handsBySeat: [[
      { id: 'tk_special_judgment', kind: 'major', suit: 'None', number: 20 },
      { id: 'tk_special_judgment_keep', kind: 'minor', suit: 'Cup', number: 6 }
    ]]
  });
  const judgment = page.locator('#tarotKingdomHand > .tarot-card', { hasText: '審判' });
  await expect(judgment).not.toHaveClass(/is-playable/);
  await judgment.click();
  await page.locator('#tarotKingdomPlayButton').click();
  await expect(page.locator('#tarotKingdomSelectedEffect')).toHaveText('審判20はAには出せません。');

  await debugScenario({
    turnIndex: 0,
    tableCard: { id: 'tk_special_number_10', kind: 'minor', suit: 'Cup', number: 10 },
    handsBySeat: [[
      { id: 'tk_special_devil', kind: 'major', suit: 'None', number: 15 },
      { id: 'tk_special_devil_keep', kind: 'minor', suit: 'Wand', number: 6 }
    ]]
  });
  const devil = page.locator('#tarotKingdomHand > .tarot-card', { hasText: '悪魔' });
  await expect(devil).not.toHaveClass(/is-playable/);
  await devil.click();
  await page.locator('#tarotKingdomPlayButton').click();
  await expect(page.locator('#tarotKingdomSelectedEffect')).toContainText('コート札');

  await debugScenario({
    turnIndex: 0,
    tableCard: { id: 'tk_special_court_11', kind: 'minor', suit: 'Cup', number: 11 },
    handsBySeat: [[
      { id: 'tk_special_devil_ok', kind: 'major', suit: 'None', number: 15 },
      { id: 'tk_special_devil_ok_keep', kind: 'minor', suit: 'Wand', number: 6 }
    ]]
  });
  await expect(page.locator('#tarotKingdomHand > .tarot-card', { hasText: '悪魔' })).toHaveClass(/is-playable/);

  await debugScenario({
    withTrick: false,
    turnIndex: 0,
    handsBySeat: [[{ id: 'tk_special_world_last', kind: 'major', suit: 'None', number: 21 }]]
  });
  await expect(page.locator('#tarotKingdomHand > .tarot-card', { hasText: '世界' })).not.toHaveClass(/is-playable/);
});

test('field and hand identify suits with the same thin colored edge and no added frame', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const cards = [
    { id: 'tk_edge_wand', kind: 'minor', suit: 'Wand', number: 2 },
    { id: 'tk_edge_cup', kind: 'minor', suit: 'Cup', number: 3 },
    { id: 'tk_edge_sword', kind: 'minor', suit: 'Sword', number: 4 },
    { id: 'tk_edge_pentacle', kind: 'minor', suit: 'Pentacle', number: 5 },
    { id: 'tk_edge_all', kind: 'major', suit: 'None', number: 1 },
    { id: 'tk_edge_arcana_cup', kind: 'major', suit: 'None', number: 2 },
    { id: 'tk_edge_arcana_wand', kind: 'major', suit: 'None', number: 4 },
    { id: 'tk_edge_arcana_sword', kind: 'major', suit: 'None', number: 5 }
  ];
  const audit = await page.evaluate((hand) => {
    const readCard = (card) => {
      const style = getComputedStyle(card);
      const numberStyle = getComputedStyle(card.querySelector('.tarot-card-number'));
      const artRect = card.querySelector('.tarot-card-art')?.getBoundingClientRect();
      return {
        classes: Array.from(card.classList),
        borderColor: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        borderImage: style.borderImageSource,
        numberBorderColor: numberStyle.borderTopColor,
        numberBorderWidth: numberStyle.borderTopWidth,
        numberBorderImage: numberStyle.borderImageSource,
        numberBackground: numberStyle.backgroundColor,
        numberColor: numberStyle.color,
        artWidth: artRect?.width || 0,
        artHeight: artRect?.height || 0
      };
    };
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      handCounts: [8, 8, 8, 8],
      handsBySeat: [hand],
      turnIndex: 0
    });
    const handCards = Array.from(document.querySelectorAll('#tarotKingdomHand > .tarot-card')).map(readCard);
    return {
      handCards,
      addedMarks: document.querySelectorAll('.tarot-card-suit-mark').length
    };
  }, cards);

  const expectedColors = {
    wand: 'rgb(211, 74, 64)',
    cup: 'rgb(63, 137, 207)',
    sword: 'rgb(155, 114, 230)',
    pentacle: 'rgb(58, 166, 109)'
  };
  Object.entries(expectedColors).forEach(([suit, color]) => {
    const handCard = audit.handCards.find((entry) => entry.classes.includes(suit));
    expect(handCard?.borderColor).toBe(color);
    expect(handCard?.borderWidth).toBe('1px');
    expect(handCard?.borderImage).toBe('none');
    expect(handCard?.numberBorderColor).toBe(color);
    expect(handCard?.numberBorderWidth).toBe('2px');
    expect(handCard?.numberBorderImage).toBe('none');
    expect(handCard?.numberBackground).toBe('rgba(9, 6, 4, 0.82)');
  });
  expect(audit.handCards.find((entry) => entry.classes.includes('sword'))?.numberColor)
    .toBe('rgb(233, 221, 255)');
  const allSuit = audit.handCards.find((entry) => entry.classes.includes('arcana-all-corners'));
  expect(allSuit?.borderImage).toContain('conic-gradient');
  expect(allSuit?.numberBorderWidth).toBe('2px');
  expect(allSuit?.numberBorderImage).toContain('conic-gradient');
  expect(allSuit?.numberBackground).toBe('rgba(9, 6, 4, 0.82)');
  const suitlessArcana = audit.handCards.filter((entry) => entry.classes.includes('is-arcana') && !entry.classes.includes('arcana-all-corners'));
  expect(suitlessArcana).toHaveLength(3);
  suitlessArcana.forEach((entry) => {
    expect(entry.classes).toContain('none');
    expect(entry.classes).not.toContain('arcana-suit-hybrid');
    expect(entry.borderColor).toBe('rgb(237, 243, 251)');
    expect(entry.borderWidth).toBe('1px');
    expect(entry.borderImage).toBe('none');
  });
  expect(audit.addedMarks).toBe(0);
  audit.handCards.forEach((entry) => {
    expect(entry.numberBorderWidth).toBe('2px');
    expect(entry.artWidth).toBeLessThanOrEqual(48.1);
    expect(entry.artHeight).toBeLessThanOrEqual(80.1);
  });

  for (const [index, [suit, color]] of Object.entries(expectedColors).entries()) {
    await page.evaluate(({ suitName, cardNumber }) => {
      const normalizedSuit = `${suitName[0].toUpperCase()}${suitName.slice(1)}`;
      const playCard = { id: `tk_field_edge_${normalizedSuit}`, kind: 'minor', suit: normalizedSuit, number: cardNumber };
      const reserve = { id: `tk_field_reserve_${normalizedSuit}`, kind: 'minor', suit: 'Cup', number: 10 };
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, turnIndex: 0, handsBySeat: [[playCard, reserve]] });
      debug.battlePlayCards(0, [playCard.id]);
    }, { suitName: suit, cardNumber: index + 2 });
    await page.waitForTimeout(420);
    const fieldCard = page.locator('#tarotKingdomTrick > .tarot-card');
    await expect(fieldCard).toHaveCount(1);
    await expect(fieldCard).toHaveCSS('border-top-color', color);
    await expect(fieldCard).toHaveCSS('border-top-width', '1px');
    await expect(fieldCard).toHaveCSS('border-image-source', 'none');
    const fieldNumber = fieldCard.locator('.tarot-card-number');
    await expect(fieldNumber).toHaveCSS('border-top-color', color);
    await expect(fieldNumber).toHaveCSS('border-top-width', '2px');
    await expect(fieldNumber).toHaveCSS('border-image-source', 'none');
    await expect(fieldNumber).toHaveCSS('background-color', 'rgba(9, 6, 4, 0.82)');
    if (suit === 'sword') {
      await expect(fieldNumber).toHaveCSS('color', 'rgb(233, 221, 255)');
    }
  }
});

test('grave menu keeps its icon and updates its accessible label when toggled', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const graveButton = page.locator('#tarotKingdomGraveToggleButton');
  const graveIcon = graveButton.locator('[aria-hidden="true"]');
  await expect(graveButton).toBeVisible();
  await expect(page.locator('#tarotKingdomActionPopup .tarot-betting-actions > button').first())
    .toHaveAttribute('id', 'tarotKingdomGraveToggleButton');
  await expect(page.locator('#tarotKingdomBattleStage > #tarotKingdomGraveToggleButton')).toHaveCount(0);
  await expect(graveIcon).toHaveCount(1);
  await expect(graveIcon).toHaveText('☰');

  const closedLabel = await graveButton.getAttribute('aria-label');
  expect(closedLabel).toMatch(/墓地.*(?:開く|見る)/);

  await graveButton.click();
  await expect(graveIcon).toHaveCount(1);
  await expect(graveIcon).toHaveText('☰');
  await expect(graveButton).toHaveAttribute('aria-label', /墓地.*閉じる/);
  const closeButton = page.locator('#tarotKingdomJudgmentCloseButton');
  await expect(closeButton).toBeVisible();
  await expect(closeButton).toHaveAttribute('aria-label', '墓地を閉じる');

  await closeButton.click();
  await expect(page.locator('#tarotKingdomJudgmentArea')).toBeHidden();
  await expect(graveIcon).toHaveCount(1);
  await expect(graveIcon).toHaveText('☰');
  await expect(graveButton).toHaveAttribute('aria-label', closedLabel);
});

test('grave removes suit labels and fits all ranks without horizontal sliding at 375px', async ({ page }) => {
  await openOfflineBattle(page, { width: 375, height: 844 });

  await page.locator('#tarotKingdomGraveToggleButton').click();
  const graveArea = page.locator('#tarotKingdomJudgmentArea');
  const graveOptions = page.locator('#tarotKingdomJudgmentOptions');
  await expect(graveArea).toBeVisible();
  await expect(graveOptions.locator('.tarot-kingdom-grave-suit-label')).toHaveCount(0);
  await expect(graveOptions.locator('.tarot-kingdom-grave-row')).toHaveCount(4);
  await expect(graveOptions.locator('.tarot-kingdom-grave-grid').first().locator('.tarot-kingdom-grave-slot')).toHaveCount(14);

  const layout = await graveOptions.evaluate((options) => {
    const rows = [...options.querySelectorAll('.tarot-kingdom-grave-row')];
    const grids = [...options.querySelectorAll('.tarot-kingdom-grave-grid')];
    const lastSlots = grids.map((grid) => grid.lastElementChild?.getBoundingClientRect().right || 0);
    const optionRight = options.getBoundingClientRect().right;
    return {
      optionsClientWidth: options.clientWidth,
      optionsScrollWidth: options.scrollWidth,
      rowWidths: rows.map((row) => ({ client: row.clientWidth, scroll: row.scrollWidth })),
      gridWidths: grids.map((grid) => ({
        client: grid.clientWidth,
        scroll: grid.scrollWidth,
        gap: getComputedStyle(grid).columnGap
      })),
      lastSlots,
      optionRight,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth
    };
  });

  expect(layout.optionsScrollWidth).toBeLessThanOrEqual(layout.optionsClientWidth);
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.bodyClientWidth);
  expect(layout.rowWidths.every(({ client, scroll }) => scroll <= client)).toBe(true);
  expect(layout.gridWidths.every(({ client, scroll, gap }) => scroll <= client && gap === '1px')).toBe(true);
  expect(layout.lastSlots.every((right) => right <= layout.optionRight + 1)).toBe(true);
});

test('grave visibility stays local when another player enters Judgment', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const serialization = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({ withTrick: false, turnIndex: 0 });
    const payload = debug.battlePublicState();
    payload.state.phase = 'judgment';
    payload.state.roundActive = true;
    payload.state.pendingJudgment = 1;
    payload.state.pendingJudgmentFollowup = 'clear';
    payload.state.graveOpen = true;
    payload.state.players[1].discard = [
      { id: 'remote-grave-wand-7', kind: 'minor', suit: 'Wand', number: 7 }
    ];
    const restored = debug.battleDeserialize(payload);
    debug.battleRender();
    const republished = debug.battlePublicState();
    return {
      restoredHasGraveOpen: Object.prototype.hasOwnProperty.call(restored, 'graveOpen'),
      publicHasGraveOpen: Object.prototype.hasOwnProperty.call(republished.state, 'graveOpen')
    };
  });

  expect(serialization).toEqual({
    restoredHasGraveOpen: false,
    publicHasGraveOpen: false
  });

  const graveButton = page.locator('#tarotKingdomGraveToggleButton');
  const graveArea = page.locator('#tarotKingdomJudgmentArea');
  const graveTitle = page.locator('#tarotKingdomJudgmentTitle');
  const skipButton = page.locator('#tarotKingdomJudgmentSkipButton');
  const closeButton = page.locator('#tarotKingdomJudgmentCloseButton');

  await expect(graveArea).toBeHidden();
  await expect(graveButton).toBeEnabled();
  await expect(graveButton).toHaveAttribute('aria-label', /墓地.*(?:開く|見る)/);

  await graveButton.click();
  await expect(graveArea).toBeVisible();
  await expect(graveTitle).toHaveText('墓地（場から取り除かれたカード）');
  await expect(skipButton).toBeHidden();
  await expect(graveButton).toHaveAttribute('aria-label', /墓地.*閉じる/);

  await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    const payload = debug.battlePublicState();
    payload.state.phase = 'judgment';
    payload.state.pendingJudgment = 1;
    payload.state.pendingJudgmentFollowup = 'clear';
    debug.battleDeserialize(payload);
    debug.battleRender();
  });
  await expect(graveArea).toBeVisible();

  await graveButton.click();
  await expect(graveArea).toBeHidden();

  await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    const payload = debug.battlePublicState();
    payload.state.phase = 'judgment';
    payload.state.pendingJudgment = 0;
    payload.state.pendingJudgmentFollowup = 'clear';
    payload.state.players[0].discard = [
      { id: 'local-grave-cup-9', kind: 'minor', suit: 'Cup', number: 9 }
    ];
    payload.state.players[1].discard = [
      { id: 'other-grave-wand-7', kind: 'minor', suit: 'Wand', number: 7 }
    ];
    debug.battleDeserialize(payload);
    debug.battleRender();
  });

  await expect(graveArea).toBeVisible();
  await expect(graveTitle).toHaveText('審判: 墓地から回収するカードを選択');
  await expect(graveButton).toBeDisabled();
  await expect(graveButton).toHaveAttribute('aria-label', '墓地（審判中）');
  await expect(closeButton).toBeHidden();
  await expect(skipButton).toBeVisible();
  await expect(skipButton).toBeEnabled();
  await expect(skipButton).toHaveCSS('color', 'rgb(248, 250, 252)');
  const ownDiscard = page.locator('#tarotKingdomJudgmentOptions .tarot-card.cup');
  const otherDiscard = page.locator('#tarotKingdomJudgmentOptions .tarot-card.wand');
  await expect(ownDiscard).toHaveClass(/is-judgment-ineligible/);
  await expect(ownDiscard).toBeDisabled();
  await expect(ownDiscard).toHaveAttribute('aria-label', /自分の墓地・回収不可/);
  await expect(ownDiscard).toHaveCSS('opacity', '0.38');
  await expect(ownDiscard).toHaveCSS('filter', /grayscale\(1\)/);
  await expect(otherDiscard).not.toHaveClass(/is-judgment-ineligible/);
  await expect(otherDiscard).toBeEnabled();
});

test('Judgment recovery card appears before the avatar and is synchronized once', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({ withTrick: false, turnIndex: 0 });
    const payload = debug.battlePublicState();
    payload.state.phase = 'judgment';
    payload.state.roundActive = true;
    payload.state.pendingJudgment = 0;
    payload.state.pendingJudgmentFollowup = 'clear';
    payload.state.players[0].handCount = 7;
    payload.state.players[1].discard = [
      { id: 'judgment-reclaim-cup-9', kind: 'minor', suit: 'Cup', number: 9 }
    ];
    debug.battleDeserialize(payload);
    debug.battleRender();
  });

  const candidate = page.locator('#tarotKingdomJudgmentOptions .tarot-card.cup');
  await expect(candidate).toBeVisible();
  await candidate.click();

  const reclaimCard = page.locator(
    '#tarotKingdomBattleParty [data-player-index="0"] > .tarot-kingdom-judgment-reclaim-card'
  );
  await expect(reclaimCard).toHaveCount(1);
  await expect(reclaimCard).toHaveCSS('animation-name', 'tarotKingdomJudgmentReclaim');
  await expect(reclaimCard).toHaveCSS('width', '50px');
  await expect(reclaimCard).toHaveCSS('height', '82px');
  await expect(reclaimCard).toHaveCSS('filter', 'none');
  const reclaimArt = reclaimCard.locator('.tarot-card-art');
  await expect(reclaimArt).toHaveCSS('width', '48px');
  await expect(reclaimArt).toHaveCSS('height', '80px');
  await expect(reclaimArt).toHaveCSS('image-rendering', 'pixelated');
  await expect(page.locator('#tarotKingdomSelectedEffect')).toContainText('を回収した！');

  const synchronized = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    const payload = debug.battlePublicState();
    const restored = debug.battleDeserialize(payload);
    const event = restored.battle.events.at(-1);
    debug.battleRender();
    debug.battleRender();
    const cardRect = document.querySelector('.tarot-kingdom-judgment-reclaim-card')?.getBoundingClientRect();
    const avatarRect = document.querySelector('#tarotKingdomBattleAvatar-0')?.getBoundingClientRect();
    return {
      phase: restored.phase,
      transitionKind: restored.transition?.kind || '',
      type: event?.type || '',
      actorIndex: event?.actorIndex,
      cardId: event?.card?.id || '',
      renderedCards: document.querySelectorAll('.tarot-kingdom-judgment-reclaim-card').length,
      cardStartsBeforeAvatar: !!(
        cardRect
        && avatarRect
        && cardRect.left + (cardRect.width / 2) < avatarRect.left + (avatarRect.width / 2)
      )
    };
  });
  expect(synchronized).toEqual({
    phase: 'resolvingJudgment',
    transitionKind: 'judgmentReclaim',
    type: 'judgment-reclaim',
    actorIndex: 0,
    cardId: 'judgment-reclaim-cup-9',
    renderedCards: 1,
    cardStartsBeforeAvatar: true
  });

  await expect(reclaimCard).toHaveCount(0, { timeout: 2500 });
});

test('right command switches between pass and attack from card selection', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ withTrick: false, turnIndex: 0 });
  });

  const actionButton = page.locator('#tarotKingdomPlayButton');
  const firstCard = page.locator('#tarotKingdomHand > .tarot-card').first();
  await expect(actionButton).toHaveText('パス');
  await expect(actionButton).toHaveClass(/is-defense/);
  await expect(actionButton).not.toHaveClass(/is-attack/);

  await firstCard.click();
  await expect(actionButton).toHaveText('攻撃');
  await expect(actionButton).toHaveClass(/is-attack/);
  await expect(actionButton).not.toHaveClass(/is-defense/);

  await firstCard.click();
  await expect(actionButton).toHaveText('パス');
  await expect(actionButton).toHaveClass(/is-defense/);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0, leaderIndex: 1 });
  });
  await actionButton.click();
  await expect.poll(() => page.evaluate(() => window.TarotKingdomDebug.battleState().pass[0])).toBe(true);
  const passResult = await page.evaluate(() => {
    const state = window.TarotKingdomDebug.battleState();
    return { phase: state.phase, transitionKind: state.transition?.kind || '' };
  });
  expect(passResult).toEqual({ phase: 'resolvingEnemy', transitionKind: 'enemyResponse' });
});

test('defense pauses idle motion and shield users raise the shield hand into a guard pose', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const result = await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0, leaderIndex: 1 });
    const button = document.getElementById('tarotKingdomFoldButton');
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    const hand = avatar?.querySelector('.avatar-layer[id$="-layer-hand-left"]');
    const shield = avatar?.querySelector('.avatar-layer[id$="-layer-shield-left"]');
    const baseHandTransform = hand ? getComputedStyle(hand).transform : '';
    const baseShieldTransform = shield ? getComputedStyle(shield).transform : '';
    button?.click();
    const active = {
      buttonText: button?.textContent || '',
      rowDefending: row?.classList.contains('is-defending') === true,
      avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true',
      shieldPose: avatar?.classList.contains('is-kingdom-shield-defending') === true,
      leftHandPose: avatar?.classList.contains('is-kingdom-shield-hand-left') === true,
      handMovedForward: hand ? getComputedStyle(hand).transform !== baseHandTransform : false,
      shieldMovedForward: shield ? getComputedStyle(shield).transform !== baseShieldTransform : false
    };
    button?.click();
    return {
      active,
      released: {
        buttonText: button?.textContent || '',
        rowDefending: row?.classList.contains('is-defending') === true,
        avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true',
        shieldPose: avatar?.classList.contains('is-kingdom-shield-defending') === true,
        handRestored: hand ? getComputedStyle(hand).transform === baseHandTransform : false,
        shieldRestored: shield ? getComputedStyle(shield).transform === baseShieldTransform : false
      }
    };
  });

  expect(result).toEqual({
    active: {
      buttonText: '防御中',
      rowDefending: true,
      avatarPaused: true,
      shieldPose: true,
      leftHandPose: true,
      handMovedForward: true,
      shieldMovedForward: true
    },
    released: {
      buttonText: '防御',
      rowDefending: false,
      avatarPaused: false,
      shieldPose: false,
      handRestored: true,
      shieldRestored: true
    }
  });
});

test('shieldless defense pauses idle motion without applying the shield guard pose', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const result = await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      leaderIndex: 1,
      charactersBySeat: [{
        equipment: { RightHand: 'sword_2' },
        itemSource: {
          sword_2: {
            itemId: 'sword_2',
            customData: { Category: 'Weapon', WeaponType: 'sword', sprite_index: '2' }
          }
        },
        combat: { weaponType: 'sword', weaponTypes: ['sword'] }
      }]
    });
    const button = document.getElementById('tarotKingdomFoldButton');
    button?.click();
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    return {
      buttonText: button?.textContent || '',
      rowDefending: row?.classList.contains('is-defending') === true,
      avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true',
      shieldPose: avatar?.classList.contains('is-kingdom-shield-defending') === true
    };
  });

  expect(result).toEqual({
    buttonText: '防御中',
    rowDefending: true,
    avatarPaused: true,
    shieldPose: false
  });
});

test('a right-hand shield moves the matching hand and equipment layer into guard pose', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const result = await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      leaderIndex: 1,
      charactersBySeat: [{
        equipment: { RightHand: 'shield_right_test' },
        itemSource: {
          shield_right_test: {
            itemId: 'shield_right_test',
            customData: {
              Category: 'Shield',
              WeaponType: 'shield',
              Defense: 18,
              sprite_path: './Sprites/weapons/melee weapons/shield.png',
              sprite_index: '0'
            }
          }
        },
        combat: { weaponType: 'shield', weaponTypes: ['shield'] }
      }]
    });
    const avatar = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"] '
      + '.tarot-kingdom-battle-player-avatar'
    );
    const hand = avatar?.querySelector('.avatar-layer[id$="-layer-hand-right"]');
    const shield = avatar?.querySelector('.avatar-layer[id$="-layer-weapon-right"]');
    const baseHandTransform = hand ? getComputedStyle(hand).transform : '';
    const baseShieldTransform = shield ? getComputedStyle(shield).transform : '';
    document.getElementById('tarotKingdomFoldButton')?.click();
    return {
      avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true',
      rightHandPose: avatar?.classList.contains('is-kingdom-shield-hand-right') === true,
      leftHandPose: avatar?.classList.contains('is-kingdom-shield-hand-left') === true,
      handMovedForward: hand ? getComputedStyle(hand).transform !== baseHandTransform : false,
      shieldMovedForward: shield ? getComputedStyle(shield).transform !== baseShieldTransform : false
    };
  });

  expect(result).toEqual({
    avatarPaused: true,
    rightHandPose: true,
    leftHandPose: false,
    handMovedForward: true,
    shieldMovedForward: true
  });
});

test('attack explains why the selected cards cannot be played', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 0,
      leaderIndex: 1,
      handsBySeat: [[
        { id: 'tk_invalid_pair_w7', kind: 'minor', suit: 'Wand', number: 7 },
        { id: 'tk_invalid_pair_c7', kind: 'minor', suit: 'Cup', number: 7 },
        { id: 'tk_invalid_keep_9', kind: 'minor', suit: 'Sword', number: 9 }
      ]]
    });
  });

  const handCards = page.locator('#tarotKingdomHand > .tarot-card');
  await handCards.nth(0).click();
  await handCards.nth(1).click();
  const actionButton = page.locator('#tarotKingdomPlayButton');
  await expect(actionButton).toHaveText('攻撃');
  await actionButton.click();

  const reason = page.locator('#tarotKingdomSelectedEffect');
  await expect(reason).toHaveClass(/is-error/);
  await expect(reason).toHaveText('場は1枚出しです。1枚を選択してください。');
  await expect(reason).toHaveCSS('color', 'rgb(255, 230, 213)');
  await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(2);
});

test('hand selection stops at five cards without hiding an extra selection', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const handCards = page.locator('#tarotKingdomHand > .tarot-card');
  await expect(page.locator('#tarotKingdomSelectedCards')).toHaveCount(0);

  for (let index = 0; index < 5; index += 1) {
    await handCards.nth(index).click({ force: true });
  }
  await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(5);

  await handCards.nth(5).click({ force: true });
  await expect(handCards.nth(5)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(5);
});

test('hand can be selected and sorted while another player is taking a turn', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 1,
      leaderIndex: 1,
      handsBySeat: [[
        { id: 'tk_wait_w10', kind: 'minor', suit: 'Wand', number: 10 },
        { id: 'tk_wait_c2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'tk_wait_s7', kind: 'minor', suit: 'Sword', number: 7 }
      ]]
    });
  });

  const handCards = page.locator('#tarotKingdomHand > .tarot-card');
  const actionButton = page.locator('#tarotKingdomPlayButton');
  const sortButton = page.locator('#tarotKingdomClearButton');
  await expect(handCards).toHaveCount(3);
  await expect(sortButton).toBeEnabled();

  const orderBefore = await handCards.locator('.tarot-card-number').allTextContents();
  await sortButton.click();
  const orderAfter = await handCards.locator('.tarot-card-number').allTextContents();
  expect(orderAfter).not.toEqual(orderBefore);

  await handCards.first().click();
  await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(1);
  await expect(actionButton).toHaveText('攻撃');
  await expect(actionButton).toBeDisabled();
  await expect(sortButton).toHaveText('選択解除');

  const selectedId = await handCards.first().getAttribute('data-card-id');
  const firstBox = await handCards.first().boundingBox();
  const lastBox = await handCards.last().boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  await page.mouse.move(firstBox.x + (firstBox.width / 2), firstBox.y + (firstBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(lastBox.x + lastBox.width - 2, lastBox.y + (lastBox.height / 2), { steps: 8 });
  await page.mouse.up();

  const orderAfterDrag = await handCards.evaluateAll((cards) => cards.map((card) => card.dataset.cardId));
  expect(orderAfterDrag.at(-1)).toBe(selectedId);
  await expect(page.locator(`#tarotKingdomHand > .tarot-card[data-card-id="${selectedId}"]`)).toHaveClass(/is-selected/);
  await page.evaluate(() => window.TarotKingdomDebug.battleRender());
  const orderAfterRender = await handCards.evaluateAll((cards) => cards.map((card) => card.dataset.cardId));
  expect(orderAfterRender).toEqual(orderAfterDrag);

  const state = await page.evaluate(() => window.TarotKingdomDebug.battleState());
  expect(state.turn).toBe(1);
  expect(state.players[0].hand).toHaveLength(3);
});

test('touch pointer drag reorders the hand without turning the gesture into a tap', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      turnIndex: 1,
      leaderIndex: 1,
      handsBySeat: [[
        { id: 'tk_touch_w9', kind: 'minor', suit: 'Wand', number: 9 },
        { id: 'tk_touch_c2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'tk_touch_s6', kind: 'minor', suit: 'Sword', number: 6 }
      ]]
    });
  });

  const handCards = page.locator('#tarotKingdomHand > .tarot-card');
  const source = handCards.first();
  const sourceId = await source.getAttribute('data-card-id');
  const sourceBox = await source.boundingBox();
  const secondBoxBefore = await handCards.nth(1).boundingBox();
  const targetBox = await handCards.last().boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(secondBoxBefore).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const pointer = {
    pointerId: 17,
    pointerType: 'touch',
    isPrimary: true,
    button: 0
  };
  await source.dispatchEvent('pointerdown', {
    ...pointer,
    clientX: sourceBox.x + (sourceBox.width / 2),
    clientY: sourceBox.y + (sourceBox.height / 2)
  });
  await source.dispatchEvent('pointermove', {
    ...pointer,
    clientX: targetBox.x + targetBox.width - 2,
    clientY: targetBox.y + (targetBox.height / 2)
  });
  const gap = page.locator('#tarotKingdomHand > .tarot-kingdom-hand-drop-gap');
  await expect(gap).toHaveCount(1);
  const gapBox = await gap.boundingBox();
  expect(gapBox).not.toBeNull();
  expect(Math.abs(gapBox.width - sourceBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(gapBox.height - sourceBox.height)).toBeLessThanOrEqual(1);
  await expect.poll(async () => {
    const box = await handCards.nth(1).boundingBox();
    return box?.x ?? Number.POSITIVE_INFINITY;
  }).toBeLessThan(secondBoxBefore.x - 10);
  await expect(source).toHaveClass(/is-dragging/);
  await source.dispatchEvent('pointerup', {
    ...pointer,
    clientX: targetBox.x + targetBox.width - 2,
    clientY: targetBox.y + (targetBox.height / 2)
  });

  const order = await handCards.evaluateAll((cards) => cards.map((card) => card.dataset.cardId));
  expect(order.at(-1)).toBe(sourceId);
  await expect(gap).toHaveCount(0);
  await expect(page.locator('#tarotKingdomHand > .tarot-card.is-selected')).toHaveCount(0);
});

test('removed arcana commands and oracle slots leave one compact command row at 390px', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    const localHand = [
      { id: 'tk_a_12', kind: 'major', suit: 'None', number: 12 },
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `tk_hanged_minor_${index + 1}`,
        kind: 'minor',
        suit: 'Wand',
        number: index + 1
      }))
    ];
    window.TarotKingdomDebug.battleScenario({
      handCounts: [8, 8, 8, 8],
      handsBySeat: [localHand]
    });
  });

  const hangedManCard = page.locator('#tarotKingdomHand > .tarot-card', { hasText: '吊るされた男' });
  await expect(hangedManCard).toHaveCount(1);
  await hangedManCard.click({ force: true });
  await expect(page.locator('#tarotKingdomHangedManButton')).toHaveCount(0);
  await expect(page.locator('#tarotKingdomDrawMajorButton, #tarotKingdomDrawMinorButton')).toHaveCount(0);
  await expect(page.locator('#tarotKingdomOracleCardWrap, #tarotKingdomHiddenOracleCardWrap')).toHaveCount(0);

  const commandLayout = await page.locator('#tarotKingdomActionPopup').evaluate((popup) => {
    const visibleButtons = Array.from(popup.querySelectorAll('.tarot-betting-actions > button'))
      .filter((button) => {
        const style = getComputedStyle(button);
        return !button.hidden
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && button.getClientRects().length > 0;
      });
    const popupRect = popup.getBoundingClientRect();
    return {
      popupHeight: popupRect.height,
      popupRight: popupRect.right,
      buttons: visibleButtons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { id: button.id, x: rect.x, y: rect.y, right: rect.right, height: rect.height };
      })
    };
  });

  expect(commandLayout.buttons.map((button) => button.id)).toEqual([
    'tarotKingdomGraveToggleButton',
    'tarotKingdomClearButton',
    'tarotKingdomFoldButton',
    'tarotKingdomPlayButton'
  ]);
  expect(commandLayout.popupHeight).toBeLessThanOrEqual(88);
  const firstButtonY = commandLayout.buttons[0].y;
  for (const [index, button] of commandLayout.buttons.entries()) {
    expect(Math.abs(button.y - firstButtonY)).toBeLessThanOrEqual(2);
    expect(button.right).toBeLessThanOrEqual(commandLayout.popupRight + 1);
    if (index > 0) {
      expect(button.x).toBeGreaterThanOrEqual(commandLayout.buttons[index - 1].right - 1);
    }
  }
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
  test(`exploration mercenary party renders three evenly spaced seats at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const state = await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
      playerCount: 3,
      handCounts: [8, 8, 8],
      withTrick: false
    }));
    expect(state.rules.playerCount).toBe(3);
    expect(state.players).toHaveLength(3);
    expect(state.players.map((player) => player.hand.length)).toEqual([8, 8, 8]);
    await expect(page.locator('#tarotKingdomBattleParty')).toHaveAttribute('data-player-count', '3');
    const rows = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player');
    await expect(rows).toHaveCount(3);
    const layout = await rows.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, right: rect.right };
    }));
    expect(layout[1].top - layout[0].top).toBeGreaterThan(30);
    expect(layout[2].top - layout[1].top).toBeGreaterThan(30);
    expect(Math.max(...layout.map((row) => row.right))).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('pet occupies the second seat after the player with its own monster sprite, level, hp and hand count', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const pet = {
    monsterId: 'ismartal-vol1-monster-01',
    monsterName: 'トゲマル',
    nickname: 'コハク',
    displayName: 'コハク',
    number: 1
  };
  const state = await page.evaluate((debugPet) => window.TarotKingdomDebug.battleScenario({
    playerCount: 4,
    pet: debugPet,
    handCounts: [8, 8, 8, 8],
    withTrick: false
  }), pet);
  expect(state.players.map((player) => player.id)).toEqual(['you', 'pet', 'npc1', 'npc2']);
  expect(state.players[1]).toMatchObject({
    isPet: true,
    isNpc: true,
    name: 'コハク',
    character: {
      source: 'pet',
      monsterId: 'ismartal-vol1-monster-01'
    }
  });
  const row = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player').nth(1);
  await expect(row).toHaveClass(/is-pet/);
  await expect(row.locator('.tarot-kingdom-battle-player-name')).toContainText('コハク');
  await expect(row.locator('.tarot-kingdom-battle-player-rank')).toContainText('Lv12');
  await expect(row.locator('.tarot-kingdom-battle-player-hand-count')).toHaveText('残り手札 8枚');
  const sprite = row.locator('.tarot-kingdom-battle-pet-sprite');
  await expect(sprite).toHaveAttribute('data-monster-id', pet.monsterId);
  await expect(sprite).toHaveAttribute('data-animation-name', 'idle');
  const visual = await sprite.evaluate((node) => ({
    backgroundImage: getComputedStyle(node).backgroundImage,
    imageRendering: getComputedStyle(node).imageRendering,
    anchor: node.dataset.monsterAnchor,
    scaleX: node.style.getPropertyValue('--tarot-kingdom-pet-scale-x')
  }));
  expect(visual.backgroundImage).toContain('/Sprites/pixel-monsters/vol1/monster-01/idle.png');
  expect(['pixelated', 'crisp-edges', 'auto']).toContain(visual.imageRendering);
  expect(['ground', 'air']).toContain(visual.anchor);
  expect(visual.scaleX).toBe('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.evaluate((debugPet) => window.TarotKingdomDebug.battleScenario({
    playerCount: 4,
    pet: debugPet,
    handCounts: [8, 8, 8, 8],
    hpBySeat: [100, 0, 100, 100],
    withTrick: false
  }), pet);
  const koPetRow = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player').nth(1);
  await expect(koPetRow).toHaveClass(/is-ko/);
  await expect(koPetRow.locator('.tarot-kingdom-battle-pet-sprite')).toHaveAttribute('data-animation-name', 'death');
  await expect(koPetRow.locator('.tarot-kingdom-battle-pet-sprite')).toHaveCSS(
    'background-image',
    /\/pixel-monsters\/vol1\/monster-01\/death\.png/
  );
  await expect(koPetRow.locator('.avatar-combat-death-sprite')).toHaveCount(0);
});

test('online rescue prioritizes every owner pet and places it immediately after its owner', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const pet = {
    monsterId: 'ismartal-vol1-monster-01',
    monsterName: 'トゲマル',
    nickname: 'コハク',
    displayName: 'コハク',
    number: 1
  };
  const audit = await page.evaluate((currentPet) => ({
    roster: window.TarotKingdomDebug.battleExplorationRoster('online', currentPet),
    twoOwnerRoster: window.TarotKingdomDebug.battleOnlinePresenceRoster([
      {
        seat: 0,
        uid: 'PF_OWNER_1',
        displayName: 'プレイヤー1',
        currentPet
      },
      {
        seat: 2,
        uid: 'PF_OWNER_2',
        displayName: 'プレイヤー2',
        currentPet: {
          monsterId: 'ismartal-vol1-monster-02',
          monsterName: 'グリモア',
          nickname: 'ルナ',
          displayName: 'ルナ'
        }
      }
    ]),
    reservedOrder: window.TarotKingdomDebug.battleSeatClaimOrder(true),
    normalOrder: window.TarotKingdomDebug.battleSeatClaimOrder(false)
  }), pet);
  expect(audit.roster.map((player) => player.id)).toEqual(['you', 'pet', 'npc2', 'npc3']);
  expect(audit.roster[1]).toMatchObject({
    isNpc: true,
    isPet: true,
    name: 'コハク',
    pet: { monsterId: pet.monsterId }
  });
  expect(audit.twoOwnerRoster).toEqual([
    { seat: 0, kind: 'player', name: 'プレイヤー1', playFabId: 'PF_OWNER_1' },
    {
      seat: 1,
      kind: 'pet',
      name: 'コハク',
      ownerPlayFabId: 'PF_OWNER_1',
      monsterId: pet.monsterId
    },
    { seat: 2, kind: 'player', name: 'プレイヤー2', playFabId: 'PF_OWNER_2' },
    {
      seat: 3,
      kind: 'pet',
      name: 'ルナ',
      ownerPlayFabId: 'PF_OWNER_2',
      monsterId: 'ismartal-vol1-monster-02'
    }
  ]);
  expect(audit.reservedOrder).toEqual([0, 2, 3, 1]);
  expect(audit.normalOrder).toEqual([0, 1, 2, 3]);
});

test('round settlement confirmation remains visible after the battle stage completes', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleFinishRound(0);
  });

  const confirmButton = page.locator('#tarotKingdomSettlementConfirmButton');
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toBeEnabled();
  await expect(confirmButton).toHaveText('次の局へ');
  const buttonFit = await confirmButton.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: window.innerWidth
  }));
  expect(buttonFit.scrollWidth).toBeLessThanOrEqual(buttonFit.clientWidth);
  expect(buttonFit.left).toBeGreaterThanOrEqual(0);
  expect(buttonFit.right).toBeLessThanOrEqual(buttonFit.viewportWidth);
});

test('winner repeatedly jumps in place and the overall champion owns the final first-place ceremony', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      handNo: 0,
      chipsBySeat: [100, 100, 100, 100],
      handCounts: [3, 0, 3, 3],
      enemyHp: 0,
      withTrick: false
    });
    debug.battleFinishRound(1);
  });

  const roundWinnerRow = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="1"]');
  await expect(roundWinnerRow).toHaveClass(/is-round-winner/);
  await expect(page.locator('.tarot-kingdom-champion-ceremony')).toBeHidden();
  const roundPose = await roundWinnerRow.locator('.tarot-kingdom-battle-player-avatar').evaluate((avatar) => ({
    animationName: getComputedStyle(avatar).animationName,
    animationDuration: getComputedStyle(avatar).animationDuration,
    animationIterationCount: getComputedStyle(avatar).animationIterationCount,
    groundLightAnimationName: getComputedStyle(avatar, '::after').animationName,
    groundLightAnimationDuration: getComputedStyle(avatar, '::after').animationDuration,
    groundLightIterationCount: getComputedStyle(avatar, '::after').animationIterationCount,
    bodyMotion: avatar.dataset.avatarBodyMotion || '',
    victorious: avatar.classList.contains('is-avatar-victorious')
  }));
  expect(roundPose).toEqual({
    animationName: 'tarotKingdomPlayerVictoryPose, tarotKingdomWinnerAvatarGlow',
    animationDuration: '0.96s, 0.9s',
    animationIterationCount: 'infinite, 1',
    groundLightAnimationName: 'tarotKingdomWinnerGroundLight',
    groundLightAnimationDuration: '0.9s',
    groundLightIterationCount: '1',
    bodyMotion: 'idle',
    victorious: true
  });
  await page.waitForTimeout(950);
  const settledWinnerLight = await roundWinnerRow.locator('.tarot-kingdom-battle-player-avatar').evaluate((avatar) => ({
    groundOpacity: Number.parseFloat(getComputedStyle(avatar, '::after').opacity),
    filter: getComputedStyle(avatar).filter
  }));
  expect(settledWinnerLight.groundOpacity).toBeLessThanOrEqual(0.02);
  expect(settledWinnerLight.filter).not.toContain('255, 224, 122');

  const finalState = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      handNo: 3,
      chipsBySeat: [200, 60, 40, 20],
      handCounts: [3, 0, 3, 3],
      enemyHp: 0,
      withTrick: false
    });
    return debug.battleFinishRound(1);
  });
  expect(finalState.champion).toBe(0);

  const ceremony = page.locator('.tarot-kingdom-champion-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toContainText('FINAL RANKING');
  await expect(ceremony).toContainText('CHAMPION');
  await expect(ceremony).toHaveAttribute('aria-label', /最終順位1位/);

  const finalLayout = await page.evaluate(() => {
    const stage = document.getElementById('tarotKingdomBattleStage');
    const ceremony = stage?.querySelector(':scope > .tarot-kingdom-champion-ceremony');
    const championRow = document.querySelector('#tarotKingdomBattleParty > [data-player-index="0"]');
    const lastRoundWinnerRow = document.querySelector('#tarotKingdomBattleParty > [data-player-index="1"]');
    const championAvatar = document.getElementById('tarotKingdomBattleAvatar-0');
    const lastRoundWinnerAvatar = document.getElementById('tarotKingdomBattleAvatar-1');
    const stageRect = stage?.getBoundingClientRect();
    const ceremonyRect = ceremony?.getBoundingClientRect();
    return {
      stageGrandFinal: stage?.classList.contains('is-grand-final') || false,
      championRow: championRow?.classList.contains('is-match-champion') || false,
      championPresentedAsWinner: championRow?.classList.contains('is-round-winner') || false,
      lastRoundWinnerStillPresented: lastRoundWinnerRow?.classList.contains('is-round-winner') || false,
      championVictorious: championAvatar?.classList.contains('is-avatar-victorious') || false,
      lastRoundWinnerVictorious: lastRoundWinnerAvatar?.classList.contains('is-avatar-victorious') || false,
      ceremonyInsideStage: !!(
        stageRect
        && ceremonyRect
        && ceremonyRect.left >= stageRect.left - 1
        && ceremonyRect.right <= stageRect.right + 1
        && ceremonyRect.top >= stageRect.top - 1
        && ceremonyRect.bottom <= stageRect.bottom + 1
      ),
      overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(finalLayout).toEqual({
    stageGrandFinal: true,
    championRow: true,
    championPresentedAsWinner: true,
    lastRoundWinnerStillPresented: false,
    championVictorious: true,
    lastRoundWinnerVictorious: false,
    ceremonyInsideStage: true,
    overflowing: false
  });

  await page.setViewportSize({ width: 900, height: 1000 });
  const wideFinalLayout = await page.evaluate(() => {
    const stage = document.getElementById('tarotKingdomBattleStage');
    const ceremony = stage?.querySelector(':scope > .tarot-kingdom-champion-ceremony');
    const stageRect = stage?.getBoundingClientRect();
    const ceremonyRect = ceremony?.getBoundingClientRect();
    return {
      visible: !!ceremony && !ceremony.hidden && getComputedStyle(ceremony).display !== 'none',
      insideStage: !!(
        stageRect
        && ceremonyRect
        && ceremonyRect.left >= stageRect.left - 1
        && ceremonyRect.right <= stageRect.right + 1
        && ceremonyRect.top >= stageRect.top - 1
        && ceremonyRect.bottom <= stageRect.bottom + 1
      ),
      overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(wideFinalLayout).toEqual({
    visible: true,
    insideStage: true,
    overflowing: false
  });
});

test('a locally skipped player gets two light flashes and a direct navigation message', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const notice = await page.evaluate(() => {
    const card = (id, number) => ({ id, kind: 'minor', suit: 'Wand', number });
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      withTrick: false,
      turnIndex: 3,
      handsBySeat: [
        [card('local-a', 2), card('local-b', 3)],
        [card('seat-1-a', 6), card('seat-1-b', 7)],
        [card('seat-2-a', 8), card('seat-2-b', 9)],
        [card('skip-local', 5), card('skip-reserve', 14)]
      ]
    });
    return debug.battlePlayOne(3).skipNotice;
  });

  expect(notice).toMatchObject({ actorIndex: 3, targetIndexes: [0] });
  await expect(page.locator('#tarotKingdomSelectedEffect')).toHaveText('あなたは　スキップされた！');
  const flash = page.locator('#tarotKingdomLocalSkipFlash');
  await expect(flash).toHaveClass(/is-show/);
  const motion = await flash.evaluate((element) => ({
    flash: getComputedStyle(element).animationName,
    duration: getComputedStyle(element).animationDuration,
    pointerEvents: getComputedStyle(element).pointerEvents
  }));
  expect(motion).toEqual({
    flash: 'tarotKingdomLocalSkipDoubleFlash',
    duration: '0.76s',
    pointerEvents: 'none'
  });
  await expect(page.locator('#tarotKingdomLocalTurnAlert')).not.toHaveClass(/is-show/);
});

test('the former skip shutters now announce the start of the local turn', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({ turnIndex: 1 });
    debug.battleScenario({ turnIndex: 0 });
  });

  const alert = page.locator('#tarotKingdomLocalTurnAlert');
  await expect(alert).toHaveClass(/is-show/);
  const motion = await alert.evaluate((element) => ({
    edge: getComputedStyle(element).animationName,
    left: getComputedStyle(element, '::before').animationName,
    right: getComputedStyle(element, '::after').animationName,
    pointerEvents: getComputedStyle(element).pointerEvents
  }));
  expect(motion).toEqual({
    edge: 'tarotKingdomLocalTurnEdge',
    left: 'tarotKingdomLocalTurnCloseLeft',
    right: 'tarotKingdomLocalTurnCloseRight',
    pointerEvents: 'none'
  });
});
