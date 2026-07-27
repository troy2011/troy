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
        return {
          id: pet.id,
          playerScale: getComputedStyle(playerAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petHostScale: getComputedStyle(petAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petSpriteScale: sprite?.style.getPropertyValue('--tarot-kingdom-pet-scale') || '',
          offsetY: sprite?.style.getPropertyValue('--tarot-kingdom-pet-offset-y') || '',
          bottom: sprite ? getComputedStyle(sprite).bottom : '',
          horizontalAnchor: sprite ? parseFloat(getComputedStyle(sprite).left) : NaN,
          hostCenter: petAvatar ? petAvatar.offsetWidth / 2 : NaN,
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
  const playerShadow = await page.locator('.tarot-kingdom-battle-player-avatar').first().evaluate((avatar) => {
    const style = getComputedStyle(avatar, '::before');
    return {
      content: style.content,
      bottom: parseFloat(style.bottom),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      opacity: parseFloat(style.opacity),
      background: style.backgroundImage
    };
  });

  expect(grounded.content).not.toBe('none');
  expect(grounded.bottom).toBe(-2);
  expect(grounded.width).toBeGreaterThanOrEqual(54);
  expect(grounded.height).toBeGreaterThanOrEqual(9);
  expect(grounded.opacity).toBeGreaterThanOrEqual(0.7);
  expect(grounded.background).toContain('radial-gradient');
  expect(playerShadow.content).not.toBe('none');
  expect(playerShadow.bottom).toBe(17);
  expect(playerShadow.width).toBe(46);
  expect(playerShadow.height).toBe(11);
  expect(playerShadow.opacity).toBe(1);
  expect(playerShadow.background).toContain('radial-gradient');

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
  await expect(page.locator('.tarot-kingdom-card-deal-ghost')).toHaveCount(1);
  await expect(page.locator('.tarot-kingdom-ram-card')).toHaveCount(0);

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
  await expect(selectedEffect).toHaveText('選択: 審判 / A不可・11バック・墓地回収');
  const textFit = await selectedEffect.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(textFit.scrollWidth).toBeLessThanOrEqual(textFit.clientWidth);
  expect(textFit.scrollHeight).toBeLessThanOrEqual(textFit.clientHeight);
});

test('card selection guide and hand input are available only on the local turn', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const selectedEffect = page.locator('#tarotKingdomSelectedEffect');
  const firstCard = page.locator('#tarotKingdomHand > .tarot-card').first();

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 1 });
  });
  await expect(selectedEffect).toBeHidden();
  await expect(firstCard).toHaveAttribute('aria-pressed', 'false');
  await firstCard.click({ force: true });
  await expect(firstCard).toHaveAttribute('aria-pressed', 'false');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0 });
  });
  await expect(selectedEffect).toBeVisible();
  await expect(selectedEffect).toHaveText('カードを選択してください');
  await firstCard.click();
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
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
    expect(entry.borderColor).toBe('rgb(225, 199, 123)');
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

  await graveButton.click();
  await expect(graveIcon).toHaveCount(1);
  await expect(graveIcon).toHaveText('☰');
  await expect(graveButton).toHaveAttribute('aria-label', closedLabel);
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
    debug.battleDeserialize(payload);
    debug.battleRender();
  });

  await expect(graveArea).toBeVisible();
  await expect(graveTitle).toHaveText('審判: 墓地から回収するカードを選択');
  await expect(graveButton).toBeDisabled();
  await expect(graveButton).toHaveAttribute('aria-label', '墓地（審判中）');
  await expect(skipButton).toBeVisible();
  await expect(skipButton).toBeEnabled();
});

test('right command switches between defense and attack from card selection', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ withTrick: false, turnIndex: 0 });
  });

  const actionButton = page.locator('#tarotKingdomPlayButton');
  const firstCard = page.locator('#tarotKingdomHand > .tarot-card').first();
  await expect(actionButton).toHaveText('防御');
  await expect(actionButton).toHaveClass(/is-defense/);
  await expect(actionButton).not.toHaveClass(/is-attack/);

  await firstCard.click();
  await expect(actionButton).toHaveText('攻撃');
  await expect(actionButton).toHaveClass(/is-attack/);
  await expect(actionButton).not.toHaveClass(/is-defense/);

  await firstCard.click();
  await expect(actionButton).toHaveText('防御');
  await expect(actionButton).toHaveClass(/is-defense/);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0, leaderIndex: 1 });
  });
  await actionButton.click();
  await expect.poll(() => page.evaluate(() => window.TarotKingdomDebug.battleState().pass[0])).toBe(true);
  const defenseResult = await page.evaluate(() => {
    const state = window.TarotKingdomDebug.battleState();
    return { phase: state.phase, transitionKind: state.transition?.kind || '' };
  });
  expect(defenseResult).toEqual({ phase: 'resolvingEnemy', transitionKind: 'enemyResponse' });
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
    name: 'トゲマル',
    character: {
      source: 'pet',
      monsterId: 'ismartal-vol1-monster-01'
    }
  });
  const row = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player').nth(1);
  await expect(row).toHaveClass(/is-pet/);
  await expect(row.locator('.tarot-kingdom-battle-player-name')).toContainText('トゲマル');
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

test('victory pose stays grounded and the overall champion owns the final first-place ceremony', async ({ page }) => {
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
    bodyMotion: avatar.dataset.avatarBodyMotion || '',
    victorious: avatar.classList.contains('is-avatar-victorious')
  }));
  expect(roundPose).toEqual({
    animationName: 'tarotKingdomPlayerVictoryPose',
    bodyMotion: 'idle',
    victorious: true
  });

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
