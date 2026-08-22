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

function shiftTarotKingdomHostClock(payload, deltaMs, epoch) {
  const shifted = JSON.parse(JSON.stringify(payload));
  const shiftValue = (target, key) => {
    const value = Number(target?.[key]);
    if (Number.isFinite(value) && value > 0) target[key] = value + deltaMs;
  };
  const shiftTimeline = (timeline) => {
    if (!timeline || typeof timeline !== 'object') return;
    [
      'startedAt',
      'motionAt',
      'impactAt',
      'hpRevealAt',
      'hpTweenEndsAt',
      'effectAt',
      'damageNumberAt',
      'endsAt'
    ].forEach((key) => shiftValue(timeline, key));
  };

  shiftValue(shifted, 'updatedAt');
  const state = shifted.state || {};
  if (state.presentation && typeof state.presentation === 'object') {
    state.presentation.epoch = String(epoch || 'guest-presentation-test');
    (state.presentation.cues || []).forEach((cue) => {
      shiftValue(cue, 'createdAt');
      if (cue?.transition && typeof cue.transition === 'object') {
        shiftValue(cue.transition, 'startedAt');
        shiftValue(cue.transition, 'endsAt');
        shiftTimeline(cue.transition.timeline);
        Object.values(cue.transition.eventTimelines || {}).forEach(shiftTimeline);
      }
    });
  }
  if (state.transition && typeof state.transition === 'object') {
    shiftValue(state.transition, 'startedAt');
    shiftValue(state.transition, 'endsAt');
    shiftTimeline(state.transition.timeline);
    Object.values(state.transition.eventTimelines || {}).forEach(shiftTimeline);
  }
  (state.battle?.events || []).forEach((event) => shiftValue(event, 'at'));
  return shifted;
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
        const apBadge = row.querySelector('.tarot-kingdom-battle-ap');
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
          apBox: box(apBadge),
          rank: rank.textContent.trim(),
          handCount: handCount.textContent.trim(),
          apText: apBadge?.textContent.trim() || '',
          handCountFontSize: parseFloat(getComputedStyle(handCount).fontSize),
          rankFontSize: parseFloat(getComputedStyle(rank).fontSize),
          handCountVisible: getComputedStyle(handCount).display !== 'none' && handCount.getClientRects().length > 0,
          apVisible: Boolean(apBadge && getComputedStyle(apBadge).display !== 'none' && apBadge.getClientRects().length > 0),
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

test('rulebook explains the current rules and returns to the same battle on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abortFirebaseDataRequests(page);
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', {
    waitUntil: 'domcontentloaded'
  });

  const rulebookButton = page.locator('#tarotKingdomRulebookButton');
  const rulebook = page.locator('#tarotKingdomRulebook');
  const rulebookPage = rulebook.locator('[data-rulebook-page]');
  await expect(rulebookButton).toBeVisible();
  await expect(rulebookButton).toHaveAttribute('aria-expanded', 'false');

  const stateBeforeFirstOpen = await page.locator('#tarotKingdomStateText').textContent();
  await rulebookButton.click();
  await expect(rulebook).toBeVisible();
  await expect(rulebookButton).toHaveAttribute('aria-expanded', 'true');
  await expect(rulebook.getByRole('heading', { name: /タロットキングダム\s*ルールブック/ })).toBeVisible();
  await expect(rulebook.getByText('Aは通常時の最強札（15）')).toBeVisible();
  await expect(rulebook.getByText('数字1とは別物で、大アルカナでは返せません。Aを1として使えるのは、A–2–3–4–5のストレートだけ。')).toBeVisible();
  await expect(rulebook.getByText('通常のパスでは反撃を受ける場合があります。ただし局開始の公開札だけが場にある間は、反撃も全員パス時の全体攻撃もありません。「防御」は場が流れるまで自動で守り、被害を抑えます。')).toBeVisible();
  await expect(rulebook.getByText('同じスート5枚、または世界なしの大アルカナ5枚')).toBeVisible();
  await expect(rulebook.locator('.tarot-kingdom-rulebook-table-wrap tbody tr')).toHaveCount(7);
  await expect(rulebook.locator('.tarot-kingdom-rulebook-card-image')).toHaveCount(49);
  await expect(rulebook.locator('.tarot-kingdom-roles-sample-grid .sample')).toHaveCount(7);
  await expect(rulebook.locator('.tarot-kingdom-roles-sample-grid .sample-cards')).toHaveCount(7);
  await expect(rulebook.locator('.tarot-kingdom-roles-sample-grid .sample-cards .tarot-kingdom-rulebook-card-image')).toHaveCount(35);
  await expect(rulebook.locator('.tarot-kingdom-rulebook-special-grid .tarot-kingdom-rulebook-card-image')).toHaveCount(4);
  await expect(rulebook.locator('.tarot-kingdom-rulebook-major-list .tarot-kingdom-rulebook-card-image')).toHaveCount(6);
  const rulebookCardStyle = await rulebook.locator('.tarot-kingdom-rulebook-card-image').first().evaluate((card) => {
    const box = card.getBoundingClientRect();
    const artwork = getComputedStyle(card, '::before');
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      backgroundImage: artwork.backgroundImage
    };
  });
  expect(rulebookCardStyle).toEqual({
    width: 28,
    height: 47,
    backgroundImage: expect.stringContaining('Sprites/Buildings/tarot.png')
  });
  await expect(rulebook.locator('[data-rulebook-close]').first()).toBeFocused();

  const mobileLayout = await rulebookPage.evaluate((pageNode) => {
    const box = pageNode.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      canScroll: pageNode.scrollHeight > pageNode.clientHeight
    };
  });
  expect(mobileLayout.left).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.right).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.top).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.bottom).toBeLessThanOrEqual(mobileLayout.viewportHeight);
  expect(mobileLayout.documentScrollWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.canScroll).toBe(true);

  await rulebook.getByRole('button', { name: '5枚役' }).click();
  await expect.poll(() => rulebookPage.evaluate((pageNode) => pageNode.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await expect(rulebook).toBeHidden();
  await expect(rulebookButton).toBeFocused();
  await expect(page.locator('#tarotKingdomStateText')).toHaveText(stateBeforeFirstOpen || '');

  await page.locator('#tarotKingdomStartOfflineButton').click();
  await expect(page.locator('#tarotKingdomBattleStage')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({ handCounts: [8, 8, 8, 8] });
  });
  await expect(page.locator('#tarotKingdomHand > .tarot-card')).toHaveCount(8);

  const battleStateBeforeOpen = await page.evaluate(() => {
    const state = window.TarotKingdomDebug?.battleState?.();
    return {
      handIds: Array.isArray(state?.players?.[0]?.hand)
        ? state.players[0].hand.map((card) => card.id)
        : [],
      round: state?.round,
      turnIndex: state?.turnIndex
    };
  });
  const battleButtonStyle = await rulebookButton.evaluate((button) => {
    const style = getComputedStyle(button);
    return { position: style.position, pointerEvents: style.pointerEvents };
  });
  expect(battleButtonStyle).toEqual({ position: 'fixed', pointerEvents: 'auto' });

  await rulebookButton.click();
  await expect(rulebook).toBeVisible();
  await rulebook.locator('[data-rulebook-close]').first().click();
  await expect(rulebook).toBeHidden();
  await expect(page.locator('#tarotKingdomBattleStage')).toBeVisible();
  await expect(page.locator('#tarotKingdomHand > .tarot-card')).toHaveCount(8);

  const battleStateAfterClose = await page.evaluate(() => {
    const state = window.TarotKingdomDebug?.battleState?.();
    return {
      handIds: Array.isArray(state?.players?.[0]?.hand)
        ? state.players[0].hand.map((card) => card.id)
        : [],
      round: state?.round,
      turnIndex: state?.turnIndex
    };
  });
  expect(battleStateAfterClose).toEqual(battleStateBeforeOpen);
});

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

test('5 skip leaves a wet film and droplets without raising a wave or showing a silence icon', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const enemySprite = page.locator('#tarotKingdomEnemySprite');
  const skipSoak = page.locator('.tarot-kingdom-enemy-skip-soak');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEnemyAreaSeal(true);
  });

  await expect(enemySprite).toHaveClass(/is-area-sealed/);
  await expect(skipSoak).toBeVisible();
  await expect(enemySprite).toHaveCSS('box-shadow', 'none');
  await expect(enemySprite).toHaveCSS('border-radius', '0px');

  const soakStyle = await skipSoak.evaluate((node) => {
    const style = getComputedStyle(node);
    const filmStyle = getComputedStyle(node, '::before');
    const dropsStyle = getComputedStyle(node, '::after');
    return {
      filmBackgroundImage: filmStyle.backgroundImage,
      filmAnimationName: filmStyle.animationName,
      dropsAnimationName: dropsStyle.animationName,
      animationName: style.animationName,
      width: style.width,
      height: style.height
    };
  });
  expect(soakStyle.filmBackgroundImage).toContain('gradient');
  expect(soakStyle.filmBackgroundImage).not.toMatch(/field-skip-wave\.webp|icons\.png/);
  expect(soakStyle.animationName).toBe('none');
  expect(soakStyle.filmAnimationName).toBe('none');
  expect(soakStyle.dropsAnimationName).toBe('tarotKingdomEnemySkipWaterDrops');
  expect(parseFloat(soakStyle.width)).toBeGreaterThan(80);
  expect(parseFloat(soakStyle.height)).toBeGreaterThan(60);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEnemyAreaSeal(false);
  });
  await expect(skipSoak).toBeHidden();
});

test('player ailments appear below the hand count and animate on the avatar without covering either', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.locator('#tarotKingdomDemoBattlefieldSelect').selectOption('stage-02-windswept-deck');
  await expect.poll(() => page.locator('.tarot-kingdom-battle-arena').evaluate((node) => (
    node.style.getPropertyValue('--tarot-kingdom-ground-start').trim()
  ))).toBe('46%');
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: { burn: { label: '火傷', potency: 8, charges: 2, expiresOn: 'action' } },
      party: {},
      players: [{
        paralysis: { label: '麻痺', charges: 1, expiresOn: 'action' },
        poison: { label: '毒', potency: 5, charges: 2, expiresOn: 'action' },
        silence: { label: '沈黙', charges: 1, expiresOn: 'action' }
      }, {}, {}, {}]
    });
  });

  const row = page.locator('.tarot-kingdom-battle-player[data-player-index="0"]');
  const handCount = row.locator('.tarot-kingdom-battle-player-hand-count');
  const tray = row.locator('.tarot-kingdom-battle-status-tray');
  const apBadge = tray.locator('.tarot-kingdom-battle-ap');
  await expect(handCount).toHaveText('残り手札 8枚');
  await expect(handCount).not.toContainText('AP');
  await expect(apBadge).toHaveText('AP 1');
  await expect(apBadge).toBeVisible();
  await expect(tray.locator('.tarot-kingdom-battle-status-icon')).toHaveCount(3);
  const enemyTray = page.locator('.tarot-kingdom-battle-status-tray.is-enemy');
  await expect(enemyTray.locator('.tarot-kingdom-battle-status-icon')).toHaveCount(1);
  await expect(enemyTray).toBeVisible();
  await expect(enemyTray).toHaveAttribute('aria-label', '敵の状態効果');

  await tray.locator('.tarot-kingdom-battle-status-icon').first().dispatchEvent('click');
  const detail = page.locator('.tarot-kingdom-status-detail-backdrop');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h3')).toContainText('状態');
  await expect(detail.locator('.tarot-kingdom-status-detail-row')).toHaveCount(3);
  await expect(detail).toContainText('2回の場流れまで');
  await detail.locator('header button').dispatchEvent('click');
  await expect(detail).toBeHidden();

  const layout = await row.evaluate((node) => {
    const hand = node.querySelector('.tarot-kingdom-battle-player-hand-count')?.getBoundingClientRect();
    const trayRect = node.querySelector('.tarot-kingdom-battle-status-tray')?.getBoundingClientRect();
    const ap = node.querySelector('.tarot-kingdom-battle-ap')?.getBoundingClientRect();
    const icons = Array.from(node.querySelectorAll('.tarot-kingdom-battle-status-icon'));
    const firstIcon = icons[0]?.getBoundingClientRect();
    const avatar = node.querySelector('.tarot-kingdom-battle-player-avatar');
    const accent = avatar?.querySelector(':scope > .tarot-kingdom-status-accent');
    const avatarRect = avatar?.getBoundingClientRect();
    const accentRect = accent?.getBoundingClientRect();
    const accentBefore = accent ? getComputedStyle(accent, '::before') : null;
    const nextName = document.querySelector(
      '.tarot-kingdom-battle-player[data-player-index="1"] .tarot-kingdom-battle-player-name'
    )?.getBoundingClientRect();
    return {
      handBottom: hand?.bottom || 0,
      trayTop: trayRect?.top || 0,
      trayFollowsHand: node.querySelector('.tarot-kingdom-battle-player-hand-count')?.nextElementSibling
        === node.querySelector('.tarot-kingdom-battle-status-tray'),
      apIsFirst: node.querySelector('.tarot-kingdom-battle-status-tray')?.firstElementChild
        === node.querySelector('.tarot-kingdom-battle-ap'),
      apSharesStatusRow: Boolean(ap && firstIcon && Math.abs(ap.top - firstIcon.top) <= 1),
      apInsideTray: Boolean(ap && trayRect
        && ap.left >= trayRect.left
        && ap.right <= trayRect.right
        && ap.top >= trayRect.top
        && ap.bottom <= trayRect.bottom),
      apToNextNameGap: ap && nextName ? nextName.top - ap.bottom : 0,
      iconSizes: icons.map((icon) => {
        const rect = icon.getBoundingClientRect();
        return [rect.width, rect.height];
      }),
      iconImages: icons.map((icon) => getComputedStyle(icon).backgroundImage),
      geometricStatusFxCount: node.querySelectorAll('.tarot-kingdom-combat-status-fx').length,
      actorStatus: avatar?.getAttribute('data-combat-status') || '',
      actorMotion: avatar?.getAttribute('data-status-motion') || '',
      actorFilter: avatar ? getComputedStyle(avatar).filter : '',
      actorAnimation: avatar ? getComputedStyle(avatar).animationName : '',
      accentStatus: accent?.getAttribute('data-status') || '',
      accentShape: accentBefore?.clipPath || '',
      accentInsideAvatar: Boolean(avatarRect && accentRect
        && accentRect.left >= avatarRect.left
        && accentRect.right <= avatarRect.right
        && accentRect.top >= avatarRect.top
        && accentRect.bottom <= avatarRect.bottom),
      rowTop: node.getBoundingClientRect().top,
      rowRight: node.getBoundingClientRect().right
    };
  });
  expect(layout.trayTop).toBeGreaterThanOrEqual(layout.handBottom - 1);
  expect(layout.trayFollowsHand).toBe(true);
  expect(layout.apIsFirst).toBe(true);
  expect(layout.apSharesStatusRow).toBe(true);
  expect(layout.apInsideTray).toBe(true);
  expect(layout.apToNextNameGap).toBeGreaterThanOrEqual(6);
  expect(layout.iconSizes.every(([width, height]) => width <= 12.5 && height <= 12.5)).toBe(true);
  expect(layout.iconImages.every((value) => value.includes('icons.png'))).toBe(true);
  expect(layout.geometricStatusFxCount).toBe(0);
  expect(layout.actorStatus).toBe('paralysis');
  expect(layout.actorMotion).toBe('interrupt');
  expect(layout.actorFilter).toContain('drop-shadow');
  expect(layout.actorFilter).toContain('255, 246, 107');
  expect(layout.actorAnimation).toContain('tarotKingdomActorParalysis');
  expect(layout.accentStatus).toBe('paralysis');
  expect(layout.accentShape).toContain('polygon');
  expect(layout.accentInsideAvatar).toBe(true);
  expect(layout.rowRight).toBeLessThanOrEqual(390);

  const enemyLayout = await page.locator('#tarotKingdomEnemySprite').evaluate((sprite) => {
    const accent = sprite.querySelector(':scope > .tarot-kingdom-status-accent.is-enemy');
    const spriteRect = sprite.getBoundingClientRect();
    const accentRect = accent?.getBoundingClientRect();
    return {
      geometricStatusFxCount: sprite.querySelectorAll('.tarot-kingdom-combat-status-fx').length,
      actorStatus: sprite.getAttribute('data-combat-status') || '',
      actorMotion: sprite.getAttribute('data-status-motion') || '',
      actorFilter: getComputedStyle(sprite).filter,
      accentStatus: accent?.getAttribute('data-status') || '',
      accentInsideActor: Boolean(accentRect
        && accentRect.left >= spriteRect.left
        && accentRect.right <= spriteRect.right
        && accentRect.top >= spriteRect.top
        && accentRect.bottom <= spriteRect.bottom)
    };
  });
  expect(enemyLayout.geometricStatusFxCount).toBe(0);
  expect(enemyLayout.actorStatus).toBe('burn');
  expect(enemyLayout.actorMotion).toBe('agitated');
  expect(enemyLayout.actorFilter).toContain('drop-shadow');
  expect(enemyLayout.actorFilter).toContain('255, 181, 57');
  expect(enemyLayout.accentStatus).toBe('burn');
  expect(enemyLayout.accentInsideActor).toBe(true);

  const enemyTrayLayout = await page.locator('.tarot-kingdom-battle-enemy').evaluate((enemy) => {
    const hp = enemy.querySelector('.tarot-kingdom-battle-hp')?.getBoundingClientRect();
    const tray = enemy.querySelector('.tarot-kingdom-battle-status-tray.is-enemy')?.getBoundingClientRect();
    const icon = enemy.querySelector('.tarot-kingdom-battle-status-tray.is-enemy .tarot-kingdom-battle-status-icon')?.getBoundingClientRect();
    const stage = enemy.closest('#tarotKingdomBattleStage')?.getBoundingClientRect();
    return {
      trayNearHp: Boolean(hp && tray && tray.top >= hp.top && tray.top <= hp.bottom + 18),
      trayHeight: tray?.height || 0,
      iconInsideStage: Boolean(icon && stage
        && icon.left >= stage.left
        && icon.right <= stage.right
        && icon.top >= stage.top
        && icon.bottom <= stage.bottom),
      enemyDisplay: getComputedStyle(enemy).display
    };
  });
  expect(enemyTrayLayout.trayNearHp).toBe(true);
  expect(enemyTrayLayout.trayHeight).toBeLessThanOrEqual(36.5);
  expect(enemyTrayLayout.iconInsideStage).toBe(true);
  expect(enemyTrayLayout.enemyDisplay).toBe('block');

  await page.locator('#tarotKingdomDemoBattlefieldSelect').selectOption('stage-03-island-causeway');
  await expect.poll(() => page.locator('.tarot-kingdom-battle-arena').evaluate((node) => (
    node.style.getPropertyValue('--tarot-kingdom-ground-start').trim()
  ))).toBe('20%');
  const lowFloorRowTop = await row.evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(lowFloorRowTop - layout.rowTop)).toBeLessThanOrEqual(1);
});

test('hard-control statuses stop the actor while slow and sleep use distinct motion profiles', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const avatar = page.locator('.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-battle-player-avatar');
  const enemy = page.locator('#tarotKingdomEnemySprite');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: { freeze: { label: '凍結', charges: 1, expiresOn: 'attack' } },
      party: {},
      players: [{ sleep: { label: '睡眠', charges: 1, expiresOn: 'damage' } }, {}, {}, {}]
    });
  });
  await expect(avatar).toHaveAttribute('data-combat-status', 'sleep');
  await expect(avatar).toHaveAttribute('data-status-motion', 'drowsy');
  await expect(enemy).toHaveAttribute('data-combat-status', 'freeze');
  await expect(enemy).toHaveAttribute('data-status-motion', 'stopped');

  const firstAccentProfiles = await page.evaluate(() => {
    const playerAccent = document.querySelector(
      '.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-status-accent'
    );
    const enemyAccent = document.querySelector('#tarotKingdomEnemySprite > .tarot-kingdom-status-accent');
    const playerBefore = playerAccent ? getComputedStyle(playerAccent, '::before') : null;
    const enemyBefore = enemyAccent ? getComputedStyle(enemyAccent, '::before') : null;
    return {
      player: [playerAccent?.getAttribute('data-status'), playerBefore?.borderRadius, playerBefore?.animationName],
      enemy: [enemyAccent?.getAttribute('data-status'), enemyBefore?.borderBottomWidth, enemyBefore?.boxShadow]
    };
  });
  expect(firstAccentProfiles.player[0]).toBe('sleep');
  expect(firstAccentProfiles.player[1]).toContain('50%');
  expect(firstAccentProfiles.player[2]).toContain('tarotKingdomStatusFloat');
  expect(firstAccentProfiles.enemy[0]).toBe('freeze');
  expect(firstAccentProfiles.enemy[1]).toBe('2px');
  expect(firstAccentProfiles.enemy[2]).not.toBe('none');

  const stopped = await enemy.evaluate((node) => ({
    animationName: getComputedStyle(node).animationName,
    filter: getComputedStyle(node).filter
  }));
  expect(stopped.filter).toContain('drop-shadow');
  expect(stopped.animationName).not.toContain('tarotKingdomActorParalysis');

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: { petrify: { label: '石化', charges: 1, expiresOn: 'none' } },
      party: {},
      players: [{ slow: { label: '鈍足', potency: 20, remainingClears: 2 } }, {}, {}, {}]
    });
  });
  await expect(avatar).toHaveAttribute('data-combat-status', 'slow');
  await expect(avatar).toHaveAttribute('data-status-motion', 'slow');
  await expect(enemy).toHaveAttribute('data-combat-status', 'petrify');
  await expect(enemy).toHaveAttribute('data-status-motion', 'stopped');
  const secondAccentProfiles = await page.evaluate(() => ({
    player: getComputedStyle(document.querySelector(
      '.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-status-accent'
    ), '::before').boxShadow,
    enemy: getComputedStyle(
      document.querySelector('#tarotKingdomEnemySprite > .tarot-kingdom-status-accent'),
      '::before'
    ).clipPath
  }));
  expect(secondAccentProfiles.player).not.toBe(firstAccentProfiles.player[2]);
  expect(secondAccentProfiles.enemy).toContain('polygon');
});

test('blindness covers the full actor, silence centers its cross, and confusion sways horizontally', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: { blind: { label: '暗闇', potency: 35, remainingClears: 2 } },
      party: {},
      players: [{ silence: { label: '沈黙', charges: 1, expiresOn: 'attack' } }, {}, {}, {}]
    });
  });

  const visualProfiles = await page.evaluate(() => {
    const playerAccent = document.querySelector(
      '.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-status-accent'
    );
    const enemyAccent = document.querySelector('#tarotKingdomEnemySprite > .tarot-kingdom-status-accent');
    const silenceMark = playerAccent ? getComputedStyle(playerAccent, '::before') : null;
    const blindMist = enemyAccent ? getComputedStyle(enemyAccent, '::before') : null;
    return {
      silence: {
        status: playerAccent?.getAttribute('data-status'),
        top: Number.parseFloat(silenceMark?.top || '0'),
        left: Number.parseFloat(silenceMark?.left || '0'),
        width: Number.parseFloat(silenceMark?.width || '0'),
        accentWidth: playerAccent?.getBoundingClientRect().width || 0,
        accentHeight: playerAccent?.getBoundingClientRect().height || 0,
        transform: silenceMark?.transform
      },
      blind: {
        status: enemyAccent?.getAttribute('data-status'),
        backgroundImage: blindMist?.backgroundImage,
        animationName: blindMist?.animationName,
        height: Number.parseFloat(blindMist?.height || '0'),
        accentHeight: Number.parseFloat(enemyAccent ? getComputedStyle(enemyAccent).height : '0')
      }
    };
  });
  expect(visualProfiles.silence.status).toBe('silence');
  expect(Math.abs(visualProfiles.silence.top - visualProfiles.silence.accentHeight * 0.5)).toBeLessThan(2);
  expect(Math.abs(visualProfiles.silence.left - visualProfiles.silence.accentWidth * 0.5)).toBeLessThan(2);
  expect(Math.abs(visualProfiles.silence.width - visualProfiles.silence.accentWidth * 0.58)).toBeLessThan(2);
  expect(visualProfiles.silence.transform).not.toBe('none');
  expect(visualProfiles.blind.status).toBe('blind');
  expect(visualProfiles.blind.backgroundImage).toContain('radial-gradient');
  expect(visualProfiles.blind.animationName).toContain('tarotKingdomStatusMist');
  expect(visualProfiles.blind.height).toBeGreaterThan(visualProfiles.blind.accentHeight * 0.9);

  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: {},
      party: {},
      players: [{ confusion: { label: '混乱', potency: 50, charges: 1, expiresOn: 'attack' } }, {}, {}, {}]
    });
  });
  const confusionProfile = await page.locator(
    '.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-battle-player-avatar'
  ).evaluate((avatar) => {
    const accent = avatar.querySelector(':scope > .tarot-kingdom-status-accent');
    const actorStyle = getComputedStyle(avatar);
    const accentStyle = getComputedStyle(accent, '::before');
    return {
      animationName: actorStyle.animationName,
      rotate: actorStyle.rotate,
      accentAnimationName: accentStyle.animationName
    };
  });
  expect(confusionProfile.animationName).toContain('tarotKingdomActorConfusion');
  expect(confusionProfile.rotate).toBe('none');
  expect(confusionProfile.accentAnimationName).toContain('tarotKingdomStatusConfusionSway');
});

test('buffs, debuffs and support effects use the same compact icon system as ailments', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const demoEffectSelect = page.locator('#tarotKingdomDemoStatusSelect');
  await expect(demoEffectSelect.locator('optgroup')).toHaveCount(3);
  await expect(demoEffectSelect.locator('option[value="powerUp"]')).toHaveCount(1);
  await expect(page.locator('#tarotKingdomDemoStatusTargetSelect option')).toHaveCount(5);
  await page.locator('#tarotKingdomDemoStatusTargetSelect').selectOption('player-3');
  await demoEffectSelect.selectOption('powerUp');
  await expect(page.locator('.tarot-kingdom-battle-player[data-player-index="3"] [data-status="powerUp"]')).toBeVisible();
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleSetEffects({
      enemy: {
        attackDown: { label: '攻撃低下', potency: 20, remainingTurns: 2, expiresOn: 'turn' }
      },
      party: {},
      players: [{
        powerUp: { label: '力上昇', potency: 25, remainingTurns: 2, expiresOn: 'turn' },
        defenseDown: { label: '守備低下', potency: 20, remainingTurns: 2, expiresOn: 'turn' },
        regen: { label: 'リジェネ', potency: 8, remainingTurns: 2, expiresOn: 'turn' },
        hpShield: { label: 'シールド', shieldHp: 24, remainingTurns: 2, expiresOn: 'turn' }
      }, {}, {}, {}]
    });
  });

  const playerTray = page.locator('.tarot-kingdom-battle-player[data-player-index="0"] .tarot-kingdom-battle-status-tray');
  const powerUp = playerTray.locator('[data-status="powerUp"]');
  const defenseDown = playerTray.locator('[data-status="defenseDown"]');
  const regen = playerTray.locator('[data-status="regen"]');
  const enemyDown = page.locator('.tarot-kingdom-battle-status-tray.is-enemy [data-status="attackDown"]');

  await expect(playerTray.locator('.tarot-kingdom-battle-status-icon')).toHaveCount(4);
  await expect(powerUp).toHaveClass(/is-modifier/);
  await expect(powerUp).toHaveClass(/is-buff/);
  await expect(powerUp).toHaveAttribute('data-modifier-group', 'buff');
  await expect(powerUp).toHaveAttribute('data-direction', '1');
  await expect(powerUp).toHaveAttribute('aria-label', '強化：力上昇');
  await expect(defenseDown).toHaveClass(/is-debuff/);
  await expect(defenseDown).toHaveAttribute('data-direction', '-1');
  await expect(defenseDown).toHaveAttribute('aria-label', '弱体：守備低下');
  await expect(regen).toHaveClass(/is-special/);
  await expect(regen).toHaveAttribute('aria-label', '補助：リジェネ');
  await expect(enemyDown).toHaveClass(/is-debuff/);
  const shieldRing = page.locator(
    '.tarot-kingdom-battle-player[data-player-index="0"] '
    + '.tarot-kingdom-battle-player-avatar > .tarot-kingdom-shield-ring'
  );
  await expect(shieldRing).toBeVisible();
  const shieldLayout = await shieldRing.evaluate((ring) => {
    const rect = ring.getBoundingClientRect();
    const avatarRect = ring.parentElement?.getBoundingClientRect();
    const style = getComputedStyle(ring);
    return {
      width: rect.width,
      height: rect.height,
      borderWidth: style.borderTopWidth,
      borderRadius: style.borderRadius,
      insideAvatar: Boolean(avatarRect
        && rect.left >= avatarRect.left
        && rect.right <= avatarRect.right
        && rect.top >= avatarRect.top
        && rect.bottom <= avatarRect.bottom)
    };
  });
  expect(shieldLayout.width).toBeLessThan(shieldLayout.height);
  expect(shieldLayout.borderWidth).toBe('1px');
  expect(shieldLayout.borderRadius).toContain('50%');
  expect(shieldLayout.insideAvatar).toBe(true);

  const iconStyles = await playerTray.locator('.tarot-kingdom-battle-status-icon.is-modifier').evaluateAll((icons) => (
    icons.map((icon) => {
      const style = getComputedStyle(icon);
      const marker = getComputedStyle(icon, '::after');
      const rect = icon.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        markerContent: marker.content,
        markerClip: marker.clipPath
      };
    })
  ));
  expect(iconStyles.every(({ width, height }) => width <= 12.5 && height <= 12.5)).toBe(true);
  expect(iconStyles.every(({ backgroundImage }) => backgroundImage.includes('icons.png'))).toBe(true);
  expect(new Set(iconStyles.map(({ borderColor }) => borderColor)).size).toBeGreaterThanOrEqual(3);
  expect(new Set(iconStyles.map(({ backgroundColor }) => backgroundColor)).size).toBeGreaterThanOrEqual(3);
  expect(iconStyles.some(({ markerContent, markerClip }) => markerContent !== 'none' && markerClip.includes('polygon'))).toBe(true);

  await powerUp.dispatchEvent('click');
  const detail = page.locator('.tarot-kingdom-status-detail-backdrop');
  await expect(detail).toBeVisible();
  const detailIcon = detail.locator('[data-status="powerUp"]');
  await expect(detailIcon).toHaveClass(/is-modifier/);
  const detailSize = await detailIcon.evaluate((icon) => {
    const rect = icon.getBoundingClientRect();
    return [rect.width, rect.height];
  });
  expect(detailSize).toEqual([24, 24]);
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
  const chainPicker = page.locator('#tarotKingdomDemoChainSelect');
  await expect(picker).toBeVisible();
  await expect(chainPicker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(15);
  await expect(picker.locator('optgroup')).toHaveCount(2);
  await expect(chainPicker.locator('option')).toHaveCount(5);

  await chainPicker.selectOption('4');
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
      fanDurationMs: fanCard ? parseFloat(getComputedStyle(fanCard).animationDuration) * 1000 : 0,
      chainCount: state.lastPlay?.roleChain?.count || 0,
      chainMultiplier: state.lastPlay?.roleChain?.multiplier || 0,
      fieldChainText: document.querySelector('#tarotKingdomRoleChain')?.textContent || '',
      cutinChainText: cutin?.querySelector('.tarot-kingdom-summon-chain-label')?.textContent || '',
      impactChainText: cutin?.querySelector('.tarot-kingdom-summon-chain-impact')?.textContent || ''
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
    fanDurationMs: 1250,
    chainCount: 4,
    chainMultiplier: 1.75,
    fieldChainText: '4 CHAIN',
    cutinChainText: '4 CHAIN',
    impactChainText: '4 CHAIN'
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

test('chain indicators stay inside the battlefield and reduced motion keeps a static result', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const inspect = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.locator('#tarotKingdomDemoChainSelect').selectOption('5');
    await page.locator('#tarotKingdomDemoRoleSelect').selectOption('normal:Straight');
    return page.evaluate(() => {
      const inside = (child, parent) => {
        const childRect = child?.getBoundingClientRect();
        const parentRect = parent?.getBoundingClientRect();
        return !!(
          childRect
          && parentRect
          && childRect.left >= parentRect.left - 1
          && childRect.right <= parentRect.right + 1
          && childRect.top >= parentRect.top - 1
          && childRect.bottom <= parentRect.bottom + 1
        );
      };
      const stage = document.querySelector('#tarotKingdomBattleStage');
      const chain = document.querySelector('#tarotKingdomRoleChain');
      const label = document.querySelector('.tarot-kingdom-summon-chain-label');
      const impact = document.querySelector('.tarot-kingdom-summon-chain-impact');
      return {
        fieldText: chain?.textContent || '',
        cutinText: label?.textContent || '',
        impactText: impact?.textContent || '',
        labelInside: inside(label, stage),
        impactInside: inside(impact, stage),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
  };

  for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
    const layout = await inspect(viewport.width, viewport.height);
    expect(layout).toMatchObject({
      fieldText: '5 CHAIN',
      cutinText: '5 CHAIN',
      impactText: '5 CHAIN',
      labelInside: true,
      impactInside: true
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#tarotKingdomDemoRoleSelect').selectOption('normal:Flush');
  const reduced = await page.evaluate(() => {
    const label = document.querySelector('.tarot-kingdom-summon-chain-label');
    const impact = document.querySelector('.tarot-kingdom-summon-chain-impact');
    const field = document.querySelector('#tarotKingdomRoleChain');
    return {
      fieldVisible: !!field && !field.hidden && getComputedStyle(field).display !== 'none',
      labelAnimation: label ? getComputedStyle(label).animationName : '',
      impactDisplay: impact ? getComputedStyle(impact).display : ''
    };
  });
  expect(reduced).toEqual({
    fieldVisible: true,
    labelAnimation: 'none',
    impactDisplay: 'none'
  });
});

test('fullscreen close control uses only the framed close image', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 }, true);
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'tarotKingdomExitButton';
    button.className = 'tarot-kingdom-exit-button ui-modal-close';
    button.type = 'button';
    button.setAttribute('aria-label', 'タロットキングダムを閉じる');
    document.querySelector('.tarot-kingdom-header-meta')?.appendChild(button);
  });

  const closeButton = page.locator('#tarotKingdomExitButton');
  await expect(closeButton).toHaveCSS('border-top-style', 'none');
  await expect(closeButton).toHaveCSS('border-image-source', 'none');
  await expect(closeButton).toHaveCSS('padding', '0px');
  await expect(closeButton).toHaveCSS('width', '52px');
  await expect(closeButton).toHaveCSS('height', '52px');
  await expect(closeButton).toHaveCSS('background-image', /\/assets\/ui\/buttons\/action-close\.png/);
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
      expect(row.apText).toMatch(/^AP \d+$/);
      expect(row.apVisible).toBe(true);
      expect(row.apBox.y).toBeGreaterThanOrEqual(row.handCountBox.bottom - 1);
      expect(row.apBox.right).toBeLessThanOrEqual(row.infoBox.right + 1);
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
  const lilfi = manifest.find((monster) => monster.id === 'ismartal-vol2-monster-05');
  expect(lilfi?.idleAnchor).toMatchObject({ mode: 'ground', y: 59 });
  expect(lilfi?.battleOffsetY).toBeUndefined();
  expect(manifest.filter((monster) => monster.idleAnchor.mode === 'air').map((monster) => monster.id)).toEqual([
    'ismartal-vol1-monster-09',
    'ismartal-vol1-monster-12',
    'ismartal-vol1-monster-16',
    'ismartal-vol1-monster-17',
    'ismartal-vol1-monster-20',
    'ismartal-vol2-monster-02',
    'ismartal-vol2-monster-03',
    'ismartal-vol2-monster-11',
    'ismartal-vol2-monster-16',
    'ismartal-vol2-monster-18',
    'ismartal-vol3-monster-05'
  ]);

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
      motion: debug.battleMonsterAttackMotion('ismartal-vol2-monster-06', 'area'),
      timing: {
        short: debug.battleMonsterAttackMotion('ismartal-vol3-monster-03', 'single'),
        medium: debug.battleMonsterAttackMotion('ismartal-vol1-monster-03', 'single'),
        capped: debug.battleMonsterAttackMotion('ismartal-vol2-monster-08', 'single')
      }
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
    animationDurationMs: 900,
    advanceDurationMs: 180,
    returnDurationMs: 180,
    totalDurationMs: 1080
  });
  expect(selection.timing.short).toMatchObject({
    animationDurationMs: 400,
    totalDurationMs: 580
  });
  expect(selection.timing.medium).toMatchObject({
    animationDurationMs: 900,
    totalDurationMs: 1080
  });
  expect(selection.timing.capped).toMatchObject({
    animationDurationMs: 900,
    totalDurationMs: 1080
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
      attackAnimationDurationMs: 900,
      attackReturnDurationMs: 180
    },
    {
      type: 'enemy-area',
      attackAnimationName: 'attack2',
      attackAnimationDurationMs: 900,
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
  expect(motionDelays[1]).toBeGreaterThan(0.75);
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

test('all monster attack sheets use their native timing up to the compact battle cap', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const audit = await page.evaluate(() => window.TarotKingdomDebug.battleDemoEnemies().map((monster) => ({
    id: monster.id,
    name: monster.name,
    single: window.TarotKingdomDebug.battleMonsterAttackMotion(monster.id, 'single'),
    area: window.TarotKingdomDebug.battleMonsterAttackMotion(monster.id, 'area')
  })));

  expect(audit).toHaveLength(50);
  const observedDurations = new Set();
  audit.forEach((monster) => {
    for (const motion of [monster.single, monster.area]) {
      expect(motion.animationDurationMs, monster.name).toBeGreaterThan(0);
      expect(motion.animationDurationMs, monster.name).toBeLessThanOrEqual(900);
      expect(motion.advanceDurationMs, monster.name).toBe(180);
      expect(motion.returnDurationMs, monster.name).toBe(180);
      expect(motion.totalDurationMs, monster.name).toBe(motion.animationDurationMs + 180);
      observedDurations.add(motion.animationDurationMs);
    }
  });
  expect(observedDurations.size).toBeGreaterThan(1);

  const rubit = audit.find((monster) => monster.id === 'ismartal-vol2-monster-08');
  expect(rubit?.name).toBe('ルビット');
  expect(rubit?.single.animationDurationMs).toBe(900);
});

test('player attack and retreat keep silhouette shadows without legacy oval shadow nodes', async ({ page }) => {
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
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    return {
      rowAttacking: row?.classList.contains('is-player-attacking') === true,
      ovalShadowCount: row?.querySelectorAll('.tarot-kingdom-battle-player-floor-shadow').length || 0,
      silhouetteFilter: avatar ? getComputedStyle(avatar).filter : ''
    };
  });
  expect(attackShadow.rowAttacking).toBe(true);
  expect(attackShadow.ovalShadowCount).toBe(0);
  expect(attackShadow.silhouetteFilter).toContain('drop-shadow');

  const retreatShadow = await page.evaluate(() => {
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    row?.classList.add('is-retreating');
    document.getElementById('tarotKingdomBattleStage')?.classList.add('is-retreat');
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    return {
      ovalShadowCount: row?.querySelectorAll('.tarot-kingdom-battle-player-floor-shadow').length || 0,
      silhouetteFilter: avatar ? getComputedStyle(avatar).filter : ''
    };
  });
  expect(retreatShadow.ovalShadowCount).toBe(0);
  expect(retreatShadow.silhouetteFilter).toContain('drop-shadow');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
  test(`all demo pets use idle-art grounding without changing flying offsets at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      return debug.battleDemoPets().map((pet) => {
        debug.battleSetDemoPet(pet.id);
        const playerAvatar = document.getElementById('tarotKingdomBattleAvatar-0');
        const petAvatar = document.getElementById('tarotKingdomBattleAvatar-1');
        const sprite = petAvatar?.querySelector(':scope > .tarot-kingdom-battle-pet-sprite');
        const spriteStyle = sprite ? getComputedStyle(sprite) : null;
        const shadowStyle = petAvatar ? getComputedStyle(petAvatar, '::before') : null;
        return {
          id: pet.id,
          anchor: petAvatar?.dataset.monsterAnchor || '',
          playerScale: getComputedStyle(playerAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petHostScale: getComputedStyle(petAvatar).getPropertyValue('--avatar-combat-scale').trim(),
          petSpriteScale: sprite?.style.getPropertyValue('--tarot-kingdom-pet-scale') || '',
          offsetY: sprite?.style.getPropertyValue('--tarot-kingdom-pet-offset-y') || '',
          bottom: spriteStyle?.bottom || '',
          horizontalAnchor: spriteStyle ? parseFloat(spriteStyle.left) : NaN,
          hostCenter: petAvatar ? petAvatar.offsetWidth / 2 : NaN,
          ovalShadowContent: shadowStyle?.content || 'none',
          silhouetteFilter: petAvatar ? getComputedStyle(petAvatar).filter : '',
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
      && pet.ovalShadowContent === 'none'
      && pet.silhouetteFilter.includes('drop-shadow')
      && pet.playerOrder.join(',') === 'you,pet,npc1,npc2'
    ))).toEqual([]);
    const lilfi = audit.find((entry) => entry.id === 'ismartal-vol2-monster-05');
    expect(lilfi).toMatchObject({ anchor: 'ground', offsetY: '0px', bottom: '-27px' });
    expect(audit.find((entry) => entry.id === 'ismartal-vol2-monster-17'))
      .toMatchObject({ anchor: 'ground', offsetY: '0px', bottom: '-37px' });
    expect(audit.find((entry) => entry.id === 'ismartal-vol3-monster-09'))
      .toMatchObject({ anchor: 'ground', offsetY: '0px', bottom: '-20px' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('enemy, player and pet actors use silhouette shadows without legacy oval floor shadows', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    turnIndex: 0,
    handCounts: [8, 8, 8, 8]
  }));

  const picker = page.locator('#tarotKingdomDemoEnemySelect');
  const enemyVisual = page.locator('.tarot-kingdom-battle-enemy-visual');
  const enemySprite = page.locator('#tarotKingdomEnemySprite');
  await picker.selectOption('ismartal-vol1-monster-01');
  await expect(enemyVisual).toHaveAttribute('data-monster-anchor', 'ground');

  const grounded = await enemySprite.evaluate((sprite) => {
    const visual = sprite.closest('.tarot-kingdom-battle-enemy-visual');
    return {
      ovalContent: visual ? getComputedStyle(visual, '::after').content : '',
      silhouetteFilter: getComputedStyle(sprite).filter
    };
  });
  const playerShadow = await page.locator('.tarot-kingdom-battle-player').first().evaluate((row) => {
    const avatar = row.querySelector('.tarot-kingdom-battle-player-avatar');
    return {
      ovalNodeCount: row.querySelectorAll('.tarot-kingdom-battle-player-floor-shadow').length,
      ovalContent: avatar ? getComputedStyle(avatar, '::before').content : '',
      silhouetteFilter: avatar ? getComputedStyle(avatar).filter : ''
    };
  });

  expect(grounded.ovalContent).toBe('none');
  expect(grounded.silhouetteFilter).toContain('drop-shadow');
  expect(playerShadow.ovalNodeCount).toBe(0);
  expect(playerShadow.ovalContent).toBe('none');
  expect(playerShadow.silhouetteFilter).toContain('drop-shadow');

  await picker.selectOption('ismartal-vol1-monster-09');
  await expect(enemyVisual).toHaveAttribute('data-monster-anchor', 'air');
  const airborne = await enemySprite.evaluate((sprite) => {
    const visual = sprite.closest('.tarot-kingdom-battle-enemy-visual');
    return {
      ovalContent: visual ? getComputedStyle(visual, '::after').content : '',
      silhouetteFilter: getComputedStyle(sprite).filter
    };
  });

  expect(airborne.ovalContent).toBe('none');
  expect(airborne.silhouetteFilter).toContain('drop-shadow');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
  test(`every monster and player uses one silhouette shadow at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ turnIndex: 0, handCounts: [8, 8, 8, 8] });
      const enemies = debug.battleDemoEnemies().map((monster) => {
        debug.battleSetDemoEnemy(monster.id);
        const sprite = document.getElementById('tarotKingdomEnemySprite');
        const visual = sprite?.closest('.tarot-kingdom-battle-enemy-visual');
        return {
          id: monster.id,
          anchor: visual?.dataset.monsterAnchor || '',
          ovalContent: visual ? getComputedStyle(visual, '::after').content : '',
          silhouetteFilter: sprite ? getComputedStyle(sprite).filter : ''
        };
      });
      const players = Array.from(
        document.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player:not(.is-pet)')
      ).map((row) => {
        const avatar = row.querySelector('.tarot-kingdom-battle-player-avatar');
        return {
          ovalNodeCount: row.querySelectorAll('.tarot-kingdom-battle-player-floor-shadow').length,
          ovalContent: avatar ? getComputedStyle(avatar, '::before').content : '',
          silhouetteFilter: avatar ? getComputedStyle(avatar).filter : ''
        };
      });
      return { enemies, players };
    });

    expect(audit.enemies).toHaveLength(50);
    expect(audit.enemies.filter((enemy) => !(
      enemy.ovalContent === 'none'
      && enemy.silhouetteFilter.includes('drop-shadow')
    ))).toEqual([]);
    expect(audit.players).toHaveLength(4);
    expect(audit.players.filter((player) => !(
      player.ovalNodeCount === 0
      && player.ovalContent === 'none'
      && player.silhouetteFilter.includes('drop-shadow')
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
    { id: 'ismartal-vol2-monster-05', name: 'リルフィ', offsetY: 0, flipX: false, flipY: false, anchor: 'ground' },
    { id: 'ismartal-vol2-monster-06', name: 'グリバト', offsetY: 0, flipX: false, flipY: true, anchor: 'ground' },
    { id: 'ismartal-vol2-monster-08', name: 'ルビット', offsetY: 0, flipX: true, flipY: false, anchor: 'ground' },
    { id: 'ismartal-vol2-monster-09', name: 'ノッカ', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol2-monster-10', name: 'ウッドラ', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol2-monster-17', name: 'メカノ', offsetY: 0, flipX: false, flipY: false, anchor: 'ground' },
    { id: 'ismartal-vol2-monster-19', name: 'バクス', offsetY: 0, flipX: true, flipY: false },
    { id: 'ismartal-vol3-monster-06', name: 'ヨミル', offsetY: 0, flipX: true, flipY: false, anchor: 'ground' },
    { id: 'ismartal-vol3-monster-09', name: 'クロモ', offsetY: 0, flipX: false, flipY: false, anchor: 'ground' }
  ];
  const manifest = await page.evaluate(() => (
    fetch('/Sprites/pixel-monsters/manifest.json').then((response) => response.json())
  ));
  expected.forEach((entry) => {
    const monster = manifest.find((candidate) => candidate.id === entry.id);
    expect(monster?.battleOffsetY || 0).toBe(entry.offsetY);
    expect(monster?.flipX === true).toBe(entry.flipX);
    expect(monster?.flipY === true).toBe(entry.flipY);
    if (entry.anchor) expect(monster?.idleAnchor?.mode).toBe(entry.anchor);
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
        scaleY: style.getPropertyValue('--tarot-kingdom-enemy-scale-y').trim(),
        anchor: node.dataset.monsterAnchor
      };
    });
    expect(render.offsetY).toBe(`${entry.offsetY}px`);
    expect(render.scaleX).toBe(entry.flipX ? '1' : '-1');
    expect(render.scaleY).toBe(entry.flipY ? '-1' : '1');
    if (entry.anchor) expect(render.anchor).toBe(entry.anchor);
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

test('a delayed guest replays a host attack once despite opposite 60 second clock skews', async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await Promise.all([
      openOfflineBattle(page, { width: 390, height: 844 }),
      openOfflineBattle(guest, { width: 390, height: 844 })
    ]);

    const hostPayload = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const cards = [
        { id: 'tk_net_host_play_6', kind: 'minor', suit: 'Sword', number: 6 },
        { id: 'tk_net_host_keep_9', kind: 'minor', suit: 'Cup', number: 9 },
        { id: 'tk_net_host_keep_12', kind: 'minor', suit: 'Pentacle', number: 12 }
      ];
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [cards]
      });
      debug.battlePlayOne(0, { resolve: false });
      return debug.battlePublicState();
    });

    expect(hostPayload.state.presentation.cues).toHaveLength(2);
    const actionCue = hostPayload.state.presentation.cues.find((cue) => cue.kind === 'action');
    const transitionCue = hostPayload.state.presentation.cues.find((cue) => cue.kind === 'transition');
    expect(actionCue).toMatchObject({
      kind: 'action',
      actorIndex: 0
    });
    expect(transitionCue).toMatchObject({
      kind: 'transition',
      transition: { kind: 'play', actorIndex: 0 }
    });
    expect(hostPayload.state.transition).toMatchObject({ kind: 'play', actorIndex: 0 });
    const attackEvent = hostPayload.state.battle.events.at(-1);
    expect(attackEvent).toMatchObject({ type: 'attack', actorIndex: 0 });

    // Let the original 900ms host animation expire before the guest receives it.
    // The guest must still start a complete local presentation on receipt.
    await page.waitForTimeout(1200);

    const cases = [
      { deltaMs: 60_000, epoch: 'guest-clock-ahead' },
      { deltaMs: -60_000, epoch: 'guest-clock-behind' }
    ];
    for (const skew of cases) {
      const remotePayload = shiftTarotKingdomHostClock(hostPayload, skew.deltaMs, skew.epoch);
      const firstAudit = await guest.evaluate((payload) => {
        const debug = window.TarotKingdomDebug;
        debug.battleResetPresentationAudit();
        debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
        return debug.battlePresentationAudit();
      }, remotePayload);

      expect(firstAudit.epoch).toBe(skew.epoch);
      expect(firstAudit.activeKind).toBe('play');
      expect(firstAudit.starts).toHaveLength(2);
      expect(firstAudit.starts.filter((start) => start.kind === 'transition')).toHaveLength(1);
      expect(firstAudit.starts.filter((start) => start.kind === 'action')).toHaveLength(1);
      expect(firstAudit.starts.find((start) => start.kind === 'action')).toMatchObject({
        seq: actionCue.seq,
        kind: 'action',
        actorIndex: 0
      });
      expect(firstAudit.activeSeq).toBe(transitionCue.seq);
      expect(firstAudit.lastSeenSeq).toBe(remotePayload.state.presentation.seq);

      if (skew === cases[0]) {
        const guestDealGhost = guest.locator('.tarot-kingdom-card-deal-ghost[data-actor-index="0"]');
        await expect(guestDealGhost).toHaveCount(1);
        const sourceDistances = await guest.evaluate(() => {
          const ghost = document.querySelector('.tarot-kingdom-card-deal-ghost[data-actor-index="0"]');
          const avatar = document.getElementById('tarotKingdomBattleAvatar-0');
          const handCard = document.querySelector('#tarotKingdomHand > .tarot-card');
          const ghostWidth = parseFloat(ghost?.style.width || '0') || ghost?.getBoundingClientRect().width || 0;
          const ghostHeight = parseFloat(ghost?.style.height || '0') || ghost?.getBoundingClientRect().height || 0;
          const source = {
            x: (parseFloat(ghost?.style.left || '0') || 0) + (ghostWidth / 2),
            y: (parseFloat(ghost?.style.top || '0') || 0) + (ghostHeight / 2)
          };
          const center = (rect) => ({ x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) });
          const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
          return {
            avatar: distance(source, center(avatar.getBoundingClientRect())),
            hand: distance(source, center(handCard.getBoundingClientRect()))
          };
        });
        expect(sourceDistances.avatar).toBeLessThan(2);
        expect(sourceDistances.hand).toBeGreaterThan(60);
      }

      const remoteRow = guest.locator('#tarotKingdomPlayers .tarot-kingdom-player-row[data-player-index="0"]');
      await expect(remoteRow).toHaveClass(/fx-action/);
      await expect(guest.locator('#tarotKingdomBattleStage')).toHaveClass(/is-battle-charging/);
      await expect(guest.locator('#tarotKingdomEnemyHpText')).toContainText(`HP ${attackEvent.hpBefore} /`);

      const duplicateAudit = await guest.evaluate((payload) => {
        const debug = window.TarotKingdomDebug;
        debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
        debug.battleRender();
        debug.battleRender();
        debug.battleRender();
        return debug.battlePresentationAudit();
      }, remotePayload);
      expect(duplicateAudit.starts).toHaveLength(2);
      expect(duplicateAudit.activeSeq).toBe(firstAudit.activeSeq);

      const damageNumber = guest.locator(
        '.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number'
      );
      await expect(damageNumber).toHaveClass(/is-show/, { timeout: 2500 });
      await expect(damageNumber).toHaveText(String(attackEvent.displayDamage));
      await expect(guest.locator('#tarotKingdomEnemyHpText')).toContainText(`HP ${attackEvent.hpAfter} /`);
      await expect(guest.locator('#tarotKingdomBattleStage')).not.toHaveClass(/is-battle-charging/, {
        timeout: 2500
      });
      await guest.waitForTimeout(650);
    }
  } finally {
    await guest.close();
  }
});

test('a guest renders one synchronized five-card summon across repeated state and render updates', async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await Promise.all([
      openOfflineBattle(page, { width: 390, height: 844 }),
      openOfflineBattle(guest, { width: 390, height: 844 })
    ]);

    const hostPayload = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const roleCards = [
        { id: 'tk_net_role_w2', kind: 'minor', suit: 'Wand', number: 2 },
        { id: 'tk_net_role_c3', kind: 'minor', suit: 'Cup', number: 3 },
        { id: 'tk_net_role_s4', kind: 'minor', suit: 'Sword', number: 4 },
        { id: 'tk_net_role_p5', kind: 'minor', suit: 'Pentacle', number: 5 },
        { id: 'tk_net_role_w6', kind: 'minor', suit: 'Wand', number: 6 }
      ];
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[
          ...roleCards,
          { id: 'tk_net_role_keep_9', kind: 'minor', suit: 'Cup', number: 9 },
          { id: 'tk_net_role_keep_10', kind: 'minor', suit: 'Cup', number: 10 }
        ]]
      });
      const played = debug.battlePlayCards(0, roleCards.map((card) => card.id), { resolve: false });
      if (!played.ok) throw new Error(played.reason || 'role play failed');
      return debug.battlePublicState();
    });

    const skillEvent = hostPayload.state.battle.events.at(-1);
    expect(skillEvent).toMatchObject({ type: 'skill', actorIndex: 0, roleKey: 'Straight' });
    expect(skillEvent.summon?.id).toBeTruthy();

    const remotePayload = shiftTarotKingdomHostClock(hostPayload, 60_000, 'guest-summon-clock-ahead');
    const audit = await guest.evaluate((payload) => {
      const debug = window.TarotKingdomDebug;
      debug.battleResetPresentationAudit();
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      debug.battleRender();
      debug.battleRender();
      return debug.battlePresentationAudit();
    }, remotePayload);

    expect(audit.starts.filter((start) => start.kind === 'transition')).toHaveLength(1);
    expect(audit.starts.filter((start) => start.kind === 'action')).toHaveLength(1);
    expect(audit.activeKind).toBe('play');
    const summonCutin = guest.locator(
      '#tarotKingdomBattleStage > .tarot-kingdom-skill-cutin.is-summon'
    );
    await expect(summonCutin).toHaveCount(1);
    await expect(summonCutin).toHaveAttribute('data-summon-id', String(skillEvent.summon.id));
    await expect(summonCutin).toContainText('ストレート');
    await expect(guest.locator('#tarotKingdomBattleStage')).toHaveClass(/is-battle-skill/);
  } finally {
    await guest.close();
  }
});

test('a delayed guest keeps the retained call actor focused after the authoritative transition is gone', async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await Promise.all([
      openOfflineBattle(page, { width: 390, height: 844 }),
      openOfflineBattle(guest, { width: 390, height: 844 })
    ]);

    const source = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const actorIndex = 2;
      const tableCard = { id: 'tk_guest_call_table_2', kind: 'minor', suit: 'Wand', number: 2 };
      const callCards = [
        { id: 'tk_guest_call_cup_2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'tk_guest_call_sword_2', kind: 'minor', suit: 'Sword', number: 2 },
        { id: 'tk_guest_call_wand_3', kind: 'minor', suit: 'Wand', number: 3 },
        { id: 'tk_guest_call_cup_3', kind: 'minor', suit: 'Cup', number: 3 }
      ];
      const handsBySeat = Array.from({ length: 4 }, () => null);
      handsBySeat[actorIndex] = [
        ...callCards,
        { id: 'tk_guest_call_keep_7', kind: 'minor', suit: 'Sword', number: 7 },
        { id: 'tk_guest_call_keep_10', kind: 'minor', suit: 'Pentacle', number: 10 }
      ];
      debug.battleScenario({
        turnIndex: actorIndex,
        leaderIndex: 0,
        tableCard,
        handsBySeat
      });
      const baseline = debug.battlePublicState();
      const played = debug.battlePlayCards(actorIndex, callCards.map((card) => card.id), { resolve: false });
      if (!played.ok) throw new Error(played.reason || 'call play failed');
      return { actorIndex, baseline, call: debug.battlePublicState() };
    });

    expect(source.call.state.transition).toMatchObject({ kind: 'call', actorIndex: source.actorIndex });
    const transitionCue = source.call.state.presentation.cues.find((cue) => cue.kind === 'transition');
    expect(transitionCue).toMatchObject({
      kind: 'transition',
      transition: { kind: 'call', actorIndex: source.actorIndex }
    });

    const remoteBaseline = shiftTarotKingdomHostClock(source.baseline, -60_000, 'guest-retained-call');
    const remoteCall = shiftTarotKingdomHostClock(source.call, -60_000, 'guest-retained-call');
    remoteCall.state.transition = null;
    remoteCall.state.phase = 'turn';
    remoteCall.state.callMergeFx = null;

    await guest.evaluate((payload) => {
      const debug = window.TarotKingdomDebug;
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      debug.battleResetPresentationAudit();
    }, remoteBaseline);
    await page.waitForTimeout(1200);

    const audit = await guest.evaluate((payload) => {
      const debug = window.TarotKingdomDebug;
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      return debug.battlePresentationAudit();
    }, remoteCall);
    expect(audit.activeKind).toBe('call');
    expect(audit.starts.filter((start) => start.kind === 'transition')).toEqual([
      expect.objectContaining({ seq: transitionCue.seq, actorIndex: source.actorIndex })
    ]);

    const playerRows = guest.locator('#tarotKingdomPlayers .tarot-kingdom-player-row');
    await expect(playerRows).toHaveCount(4);
    const actorRow = guest.locator(
      `#tarotKingdomPlayers .tarot-kingdom-player-row[data-player-index="${source.actorIndex}"]`
    );
    await expect(actorRow).toHaveClass(/is-call-focus/);
    await expect(actorRow).not.toHaveClass(/is-call-dim/);
    for (let playerIndex = 0; playerIndex < 4; playerIndex += 1) {
      if (playerIndex === source.actorIndex) continue;
      const row = guest.locator(
        `#tarotKingdomPlayers .tarot-kingdom-player-row[data-player-index="${playerIndex}"]`
      );
      await expect(row).toHaveClass(/is-call-dim/);
      await expect(row).not.toHaveClass(/is-call-focus/);
    }
  } finally {
    await guest.close();
  }
});

test('enemy damage pop restarts when the same event is replayed in a new presentation epoch', async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await Promise.all([
      openOfflineBattle(page, { width: 390, height: 844 }),
      openOfflineBattle(guest, { width: 390, height: 844 })
    ]);

    const hostPayload = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[
          { id: 'tk_damage_epoch_play_6', kind: 'minor', suit: 'Sword', number: 6 },
          { id: 'tk_damage_epoch_keep_9', kind: 'minor', suit: 'Cup', number: 9 },
          { id: 'tk_damage_epoch_keep_12', kind: 'minor', suit: 'Pentacle', number: 12 }
        ]]
      });
      debug.battlePlayOne(0, { resolve: false });
      return debug.battlePublicState();
    });
    const damageEvent = hostPayload.state.battle.events.at(-1);
    expect(damageEvent).toMatchObject({ type: 'attack', actorIndex: 0 });
    expect(Number(damageEvent.displayDamage)).toBeGreaterThan(0);

    const firstPayload = shiftTarotKingdomHostClock(hostPayload, -60_000, 'guest-damage-epoch-a');
    const secondPayload = shiftTarotKingdomHostClock(hostPayload, -60_000, 'guest-damage-epoch-b');
    const firstEvent = firstPayload.state.battle.events.at(-1);
    const secondEvent = secondPayload.state.battle.events.at(-1);
    expect(secondEvent).toMatchObject({
      seq: firstEvent.seq,
      type: firstEvent.type,
      displayDamage: firstEvent.displayDamage,
      damage: firstEvent.damage
    });

    await guest.evaluate(() => {
      window.__tkDamageAnimationStarts = [];
      document.addEventListener('animationstart', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.matches('.tarot-kingdom-damage-number')) return;
        window.__tkDamageAnimationStarts.push({
          animationName: event.animationName,
          timeStamp: event.timeStamp,
          text: target.textContent,
          startTime: target.getAnimations()[0]?.startTime ?? null
        });
      }, true);
    });

    const damageNumber = guest.locator(
      '.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number'
    );
    await guest.evaluate((payload) => {
      window.TarotKingdomDebug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
    }, firstPayload);
    await expect(damageNumber).toHaveClass(/is-show/, { timeout: 2500 });
    await expect.poll(() => guest.evaluate(() => window.__tkDamageAnimationStarts.length)).toBe(1);
    const firstStart = await guest.evaluate(() => window.__tkDamageAnimationStarts[0]);
    expect(firstStart).toMatchObject({
      animationName: 'tarotKingdomDamagePop',
      text: String(damageEvent.displayDamage)
    });

    await guest.evaluate((payload) => {
      const debug = window.TarotKingdomDebug;
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      debug.battleRender();
    }, secondPayload);
    await expect.poll(() => guest.evaluate(() => window.__tkDamageAnimationStarts.length), {
      timeout: 2500
    }).toBe(2);
    const replay = await guest.evaluate(() => ({
      starts: window.__tkDamageAnimationStarts.slice(),
      text: document.querySelector('.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number')?.textContent,
      classes: document.querySelector('.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number')?.className
    }));
    expect(replay.starts[1]).toMatchObject({
      animationName: 'tarotKingdomDamagePop',
      text: String(damageEvent.displayDamage)
    });
    expect(replay.starts[1].timeStamp).toBeGreaterThan(replay.starts[0].timeStamp);
    expect(replay.starts[1].startTime).not.toBe(replay.starts[0].startTime);
    expect(replay.text).toBe(String(damageEvent.displayDamage));
    expect(replay.classes).toContain('is-show');

    await guest.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleRender();
      debug.battleRender();
    });
    await guest.waitForTimeout(80);
    expect(await guest.evaluate(() => window.__tkDamageAnimationStarts.length)).toBe(2);
  } finally {
    await guest.close();
  }
});

test('a guest plays each short synchronized action cue once for pass defend draw and skip', async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await Promise.all([
      openOfflineBattle(page, { width: 390, height: 844 }),
      openOfflineBattle(guest, { width: 390, height: 844 })
    ]);

    const cases = [
      { kind: 'pass', actorIndex: 2, expectedLabel: 'パス' },
      { kind: 'defend', actorIndex: 1, expectedLabel: '防御' },
      { kind: 'draw', actorIndex: 0, expectedLabel: 'ドロー' },
      { kind: 'skip', actorIndex: 3, expectedLabel: '5スキップ' }
    ];

    for (const actionCase of cases) {
      await test.step(actionCase.kind, async () => {
        const baseline = await page.evaluate(({ kind, actorIndex }) => {
          const debug = window.TarotKingdomDebug;
          if (kind === 'skip') {
            const handsBySeat = Array.from({ length: 4 }, () => null);
            handsBySeat[actorIndex] = [
              { id: 'tk_guest_short_skip_5', kind: 'minor', suit: 'Wand', number: 5 },
              { id: 'tk_guest_short_skip_keep_8', kind: 'minor', suit: 'Cup', number: 8 },
              { id: 'tk_guest_short_skip_keep_12', kind: 'minor', suit: 'Sword', number: 12 }
            ];
            debug.battleScenario({ withTrick: false, turnIndex: actorIndex, handsBySeat });
          } else {
            debug.battleScenario({ turnIndex: actorIndex, handCounts: [3, 3, 3, 3] });
          }
          if (kind === 'draw') debug.battleClearTrick(actorIndex);
          return debug.battlePublicState();
        }, actionCase);

        await guest.evaluate(({ payload, localSeat }) => {
          const debug = window.TarotKingdomDebug;
          debug.battleApplyRemoteState(payload, { localSeat, forcePreview: true });
          debug.battleResetPresentationAudit();
        }, {
          payload: baseline,
          localSeat: (actionCase.actorIndex + 1) % 4
        });

        let updated;
        if (actionCase.kind === 'draw') {
          await expect(page.locator('#tarotKingdomPlayButton')).toHaveText('ドロー');
          await page.locator('#tarotKingdomPlayButton').click();
          await page.waitForFunction((baselineSeq) => (
            Number(window.TarotKingdomDebug.battlePublicState()?.state?.presentation?.seq || 0)
              > Number(baselineSeq || 0)
          ), baseline.state.presentation.seq);
          updated = await page.evaluate(() => window.TarotKingdomDebug.battlePublicState());
        } else {
          updated = await page.evaluate(({ kind, actorIndex }) => {
            const debug = window.TarotKingdomDebug;
            if (kind === 'pass') debug.battlePass(actorIndex);
            if (kind === 'defend') debug.battlePass(actorIndex, { foldMode: 'fold-start' });
            if (kind === 'skip') {
              const played = debug.battlePlayCards(actorIndex, ['tk_guest_short_skip_5'], { resolve: true });
              if (!played.ok) throw new Error(played.reason || 'skip play failed');
            }
            return debug.battlePublicState();
          }, actionCase);
        }

        const baselineSeq = Number(baseline.state.presentation.seq || 0);
        const expectedCues = updated.state.presentation.cues.filter((cue) => Number(cue.seq) > baselineSeq);
        const expectedActionCue = expectedCues.find((cue) => (
          cue.kind === 'action' && String(cue.label || '').includes(actionCase.expectedLabel)
        ));
        expect(expectedCues.filter((cue) => cue.kind === 'action').map((cue) => cue.label)).toEqual(
          expect.arrayContaining([expect.stringContaining(actionCase.expectedLabel)])
        );
        expect(expectedActionCue.actorIndex).toBe(actionCase.actorIndex);

        const audit = await guest.evaluate(({ payload, localSeat }) => {
          const debug = window.TarotKingdomDebug;
          debug.battleApplyRemoteState(payload, { localSeat, forcePreview: true });
          debug.battleApplyRemoteState(payload, { localSeat, forcePreview: true });
          debug.battleRender();
          debug.battleRender();
          return debug.battlePresentationAudit();
        }, {
          payload: updated,
          localSeat: (actionCase.actorIndex + 1) % 4
        });

        expect(audit.starts).toHaveLength(expectedCues.length);
        expect(new Set(audit.starts.map((start) => start.seq)).size).toBe(expectedCues.length);
        expectedCues.forEach((cue) => {
          const starts = audit.starts.filter((start) => Number(start.seq) === Number(cue.seq));
          const expectedActorIndex = cue.kind === 'transition'
            ? cue.transition?.actorIndex ?? null
            : cue.actorIndex ?? null;
          expect(starts).toHaveLength(1);
          expect(starts[0]).toMatchObject({
            seq: cue.seq,
            kind: cue.kind,
            actorIndex: expectedActorIndex
          });
        });
        expect(audit.starts.find((start) => start.seq === expectedActionCue.seq)).toMatchObject({
          kind: 'action',
          actorIndex: actionCase.actorIndex
        });
      });
    }
  } finally {
    await guest.close();
  }
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
  const selectedEffect = page.locator('#tarotKingdomSelectedEffectText');
  await expect(selectedEffect).toHaveText('審判 / 11バック・墓地回収');
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
  await expect(page.locator('#tarotKingdomSelectedEffectText')).not.toContainText('選択:');
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

test('resonance showcase uses number glow, guardian passive and selectable effects', async ({ page }) => {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle&tkshowcase=resonance&tkrev=resonance-hud10');

  const npcSeats = await page.evaluate(() => (
    window.TarotKingdomDebug.battleState().players.slice(1).map((player) => player.isNpc)
  ));
  expect(npcSeats).toEqual([true, true, true]);
  await expect(page.locator('#tarotKingdomArcanaNav')).toBeVisible();
  const guardian = page.locator('#tarotKingdomGuardianPassive');
  await expect(guardian).toBeVisible();
  await expect(guardian).toContainText('魔導士');
  await expect(guardian.locator('#tarotKingdomGuardianPassiveText')).toHaveText('');
  const resonantCards = page.locator('#tarotKingdomHand .tarot-card.is-resonant');
  await expect(resonantCards).toHaveCount(5);
  await expect(page.locator('#tarotKingdomHand .tarot-card-resonance-mark')).toHaveCount(0);
  expect(await resonantCards.locator('.tarot-card-number').evaluateAll((nodes) => (
    nodes.every((node) => getComputedStyle(node).animationName === 'tarotKingdomResonanceNumberGlow')
  ))).toBe(true);

  const hierophant = page.locator('#tarotKingdomHand [data-card-id="showcase-major-5"]');
  await expect(hierophant.locator('.tarot-card-resonance-mark')).toHaveCount(0);
  await expect(hierophant.locator('[aria-label="守護アルカナ覚醒"]')).toHaveCount(0);
  await hierophant.click();
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('法王 / 次の2人をスキップ');
  await expect(page.locator('#tarotKingdomSelectedEffectText')).not.toContainText('共鳴');
  await expect(page.locator('#tarotKingdomGuardianPassiveLabel')).toHaveText('守護');
  await expect(page.locator('#tarotKingdomGuardianPassiveName')).toHaveText('魔導士');
  await expect(page.locator('#tarotKingdomGuardianPassiveName')).toBeVisible();
  await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('盾割り');
  await expect(page.locator('#tarotKingdomGuardianPassiveText')).toHaveText('');
  await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('共鳴50%');
  await expect(page.locator('#tarotKingdomGuardianPassive')).not.toHaveAttribute('title', /盾割り|守護覚醒|覚醒/);
  await expect(page.locator('.tarot-kingdom-hand-title')).toBeHidden();
});

test('battle announcement stays visible while the hand remains selectable between turns', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const selectedEffect = page.locator('#tarotKingdomSelectedEffectText');
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
  const announcement = page.locator('#tarotKingdomSelectedEffectText');
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

test('resonance glows on the number while legal-play guidance uses the card body', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const localHand = [
    { id: 'tk_resonant_sword_5', kind: 'minor', suit: 'Sword', number: 5 },
    { id: 'tk_plain_cup_6', kind: 'minor', suit: 'Cup', number: 6 }
  ];
  const character = {
    version: 4,
    tarotDeck: [{
      slot: 0,
      itemId: 'tarot_minor_sword_05',
      suit: 'Sword',
      rank: 5,
      cardLevel: 1,
      resonanceId: 'sword-5'
    }]
  };
  await page.evaluate(({ hand, characterSnapshot }) => {
    window.TarotKingdomDebug.battleScenario({
      withTrick: false,
      handCounts: [2, 6, 6, 6],
      handsBySeat: [hand],
      turnIndex: 0,
      charactersBySeat: [characterSnapshot]
    });
  }, { hand: localHand, characterSnapshot: character });

  const hand = page.locator('#tarotKingdomHand');
  const playableCards = hand.locator(':scope > .tarot-card.is-playable');
  await expect(playableCards).toHaveCount(2);
  const resonant = hand.locator('[data-card-id="tk_resonant_sword_5"]');
  const plainPlayable = hand.locator('[data-card-id="tk_plain_cup_6"]');
  await expect(resonant).toHaveClass(/is-resonant/);
  await expect(resonant.locator('.tarot-card-number')).toHaveCSS(
    'animation-name',
    'tarotKingdomResonanceNumberGlow'
  );
  await expect(plainPlayable).not.toHaveClass(/is-resonant/);
  await expect(plainPlayable.locator('.tarot-card-number')).toHaveCSS('animation-name', 'none');
  await expect(hand.locator('.tarot-card-resonance-mark')).toHaveCount(0);

  await page.evaluate(({ hand: nextHand, characterSnapshot }) => {
    window.TarotKingdomDebug.battleScenario({
      withTrick: false,
      handCounts: [2, 6, 6, 6],
      handsBySeat: [nextHand],
      turnIndex: 1,
      charactersBySeat: [characterSnapshot]
    });
  }, { hand: localHand, characterSnapshot: character });
  await expect(hand.locator(':scope > .tarot-card.is-playable')).toHaveCount(0);
  await expect(hand.locator('[data-card-id="tk_resonant_sword_5"] .tarot-card-number'))
    .toHaveCSS('animation-name', 'tarotKingdomResonanceNumberGlow');
  await expect(hand.locator('[data-card-id="tk_plain_cup_6"] .tarot-card-number'))
    .toHaveCSS('animation-name', 'none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedResonanceNumber = hand.locator('[data-card-id="tk_resonant_sword_5"] .tarot-card-number');
  await expect(reducedResonanceNumber).toHaveCSS('animation-name', 'none');
  expect(await reducedResonanceNumber.evaluate((node) => getComputedStyle(node).filter)).not.toBe('none');
});

test('only legal cards glow, illegal cards dim, and a valid selection emphasizes attack', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    tableCard: { id: 'tk_guide_field_8', kind: 'minor', suit: 'Cup', number: 8 },
    handsBySeat: [[
      { id: 'tk_guide_low_6', kind: 'minor', suit: 'Sword', number: 6 },
      { id: 'tk_guide_high_9', kind: 'minor', suit: 'Wand', number: 9 }
    ]],
    turnIndex: 0
  }));

  const low = page.locator('[data-card-id="tk_guide_low_6"]');
  const high = page.locator('[data-card-id="tk_guide_high_9"]');
  const attack = page.locator('#tarotKingdomPlayButton');
  await expect(low).toHaveClass(/is-unplayable/);
  await expect(low).not.toHaveClass(/is-playable/);
  await expect(high).toHaveClass(/is-playable/);
  await expect(high).not.toHaveClass(/is-unplayable/);
  const unavailableVisual = await low.evaluate((node) => {
    const style = getComputedStyle(node);
    return { opacity: Number(style.opacity), filter: style.filter };
  });
  expect(unavailableVisual.opacity).toBeGreaterThanOrEqual(0.7);
  expect(unavailableVisual.opacity).toBeLessThan(0.8);
  expect(unavailableVisual.filter).toContain('grayscale(0.12)');
  expect(unavailableVisual.filter).toContain('brightness(0.86)');
  expect(unavailableVisual.filter).toContain('saturate(0.86)');

  await high.click();
  await expect(attack).toHaveText('攻撃');
  await expect(attack).toHaveClass(/is-confirm-ready/);
  await expect(attack).toHaveCSS('animation-name', 'tarotKingdomConfirmButtonGlow');
  const readyVisual = await attack.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      filter: style.filter,
      boxShadow: style.boxShadow,
      textShadow: style.textShadow
    };
  });
  expect(readyVisual.filter).toContain('drop-shadow');
  expect(readyVisual.boxShadow).not.toBe('none');
  expect(readyVisual.textShadow).not.toBe('none');
  await high.click();
  await low.click();
  await expect(attack).not.toHaveClass(/is-confirm-ready/);
});

test('a player with no legal card gets the short pass and retaliation guidance', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
    turnIndex: 0,
    tableCard: { id: 'tutorial-pass-field', kind: 'minor', suit: 'Cup', number: 14 },
    handsBySeat: [[
      { id: 'tutorial-pass-2', kind: 'minor', suit: 'Cup', number: 2 },
      { id: 'tutorial-pass-3', kind: 'minor', suit: 'Wand', number: 3 },
      { id: 'tutorial-pass-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'tutorial-pass-6', kind: 'minor', suit: 'Pentacle', number: 6 },
      { id: 'tutorial-pass-8', kind: 'minor', suit: 'Cup', number: 8 },
      { id: 'tutorial-pass-10', kind: 'minor', suit: 'Wand', number: 10 },
      { id: 'tutorial-pass-12', kind: 'minor', suit: 'Sword', number: 12 },
      { id: 'tutorial-pass-13', kind: 'minor', suit: 'Pentacle', number: 13 }
    ]]
  }));
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(
    '出せる札がない：パスすると敵が反撃'
  );
});

for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1100 }]) {
  test(`defense command keeps its auto-pass sublabel below the main label at ${viewport.width}px`, async ({ page }) => {
    await openOfflineBattle(page, viewport);
    const defense = page.locator('#tarotKingdomFoldButton');
    await expect(defense).toHaveAttribute('aria-label', '防御（自動パス）');
    const layout = await defense.evaluate((node) => {
      const style = getComputedStyle(node);
      const sublabel = getComputedStyle(node, '::after');
      const buttonRect = node.getBoundingClientRect();
      const fontSize = Number.parseFloat(style.fontSize);
      const mainLineHeight = Number.parseFloat(style.lineHeight) || fontSize;
      const subFontSize = Number.parseFloat(sublabel.fontSize);
      const subLineHeight = Number.parseFloat(sublabel.lineHeight) || subFontSize;
      const subMargin = Number.parseFloat(sublabel.marginTop) || 0;
      return {
        content: sublabel.content,
        position: sublabel.position,
        display: sublabel.display,
        subFontSize,
        gridRows: style.gridTemplateRows.split(' ').map((value) => Number.parseFloat(value)),
        buttonHeight: buttonRect.height,
        subMargin,
        subLineHeight,
        mainLineHeight
      };
    });
    expect(layout.content).toContain('自動パス');
    expect(layout.position).toBe('static');
    expect(layout.display).toBe('block');
    expect(layout.subFontSize).toBeLessThan(10);
    expect(layout.gridRows).toHaveLength(2);
    expect(layout.gridRows.every((height) => height > 0)).toBe(true);
    expect(layout.mainLineHeight + layout.subMargin + layout.subLineHeight).toBeLessThan(layout.buttonHeight);
  });
}

test('stage 1 teaches four actions with minor-only scripted hands', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const expectedPrompts = [
    '1-1　カードで攻撃\n場より大きい数字を1枚出そう',
    '1-2　5を2枚出して2人スキップ',
    '1-3　ポーカー役：2～6でストレート',
    '1-4　コール：場札＋4枚でフルハウス'
  ];

  for (let lesson = 1; lesson <= 4; lesson += 1) {
    const state = await page.evaluate((currentLesson) => (
      window.TarotKingdomDebug.battleTutorialScenario(currentLesson, 3)
    ), lesson);
    const allCards = [
      ...state.drawDeck,
      ...state.players.flatMap((player) => player.hand),
      ...(state.trick?.cardsTable || [])
    ];
    expect(allCards.length).toBeGreaterThan(0);
    expect(allCards.every((card) => card.kind === 'minor')).toBe(true);
    expect(state.players.every((player) => player.hand.length === 8)).toBe(true);
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(expectedPrompts[lesson - 1]);
  }

  const lessonOne = await page.evaluate(() => window.TarotKingdomDebug.battleTutorialScenario(1, 3));
  const matchupPair = lessonOne.tutorialProgress.matchupPairs[0];
  const leadCard = lessonOne.players[0].hand.find((card) => card.id === matchupPair.leadCardId);
  const replyCard = lessonOne.players[0].hand.find((card) => card.id === matchupPair.replyCardId);
  const openingCard = lessonOne.trick?.cardsTable?.[0];
  expect(leadCard).toBeTruthy();
  expect(replyCard).toBeTruthy();
  expect(openingCard).toMatchObject({ kind: 'minor', suit: 'Cup', number: 3 });
  expect(leadCard).toMatchObject({ kind: 'minor', suit: 'Cup', number: 4 });
  expect(matchupPair.replyBaseCard).toMatchObject({ kind: 'minor', suit: 'Cup', number: 6 });
  expect(replyCard).toMatchObject({ kind: 'minor', suit: 'Wand', number: 6 });
  await expect(page.locator(`[data-card-id="${matchupPair.leadCardId}"]`)).toHaveClass(/is-playable/);
  await expect(page.locator(`[data-card-id="${matchupPair.replyCardId}"]`)).toHaveClass(/is-unplayable/);
  await page.locator(`[data-card-id="${matchupPair.leadCardId}"]`).click();
  await expect(page.locator('#tarotKingdomPlayButton')).toHaveClass(/is-confirm-ready/);
  const lessonOneLeadResult = await page.evaluate((cardId) => (
    window.TarotKingdomDebug.battlePlayCards(0, [cardId], { resolve: true })
  ), matchupPair.leadCardId);
  expect(lessonOneLeadResult.ok).toBe(true);
  expect(lessonOneLeadResult.state.turn).toBe(0);
  expect(lessonOneLeadResult.state.tutorialProgress.stepsByPlayer[0]).toBe(1);
  expect(lessonOneLeadResult.state.tutorialProgress.completedPlayers[0]).toBe(false);
  expect(lessonOneLeadResult.state.trick.cardsTable[0].id).toBe(matchupPair.replyBaseCard.id);
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(
    /同じ数字は\s+相性スートで返せる\s+ワンド↔カップ\s+ソード↔ペンタクル/
  );
  const replyNode = page.locator(`[data-card-id="${matchupPair.replyCardId}"]`);
  await expect(replyNode).toHaveClass(/is-playable/);
  await replyNode.click();
  await expect(page.locator('#tarotKingdomPlayButton')).toHaveClass(/is-confirm-ready/);
  const lessonOneReplyResult = await page.evaluate((cardId) => (
    window.TarotKingdomDebug.battlePlayCards(0, [cardId], { resolve: true })
  ), matchupPair.replyCardId);
  expect(lessonOneReplyResult.ok).toBe(true);
  expect(lessonOneReplyResult.state.tutorialProgress.completedPlayers[0]).toBe(true);

  const lessonTwo = await page.evaluate(() => window.TarotKingdomDebug.battleTutorialScenario(2, 3));
  expect(lessonTwo.players[0].hand.filter((card) => Number(card.number) === 5).length).toBeGreaterThanOrEqual(2);
  expect(lessonTwo.trick).toBeNull();
  expect(lessonTwo.turn).toBe(0);
  const lessonTwoFives = lessonTwo.players[0].hand
    .filter((card) => Number(card.number) === 5 && ['Cup', 'Wand'].includes(card.suit))
    .map((card) => card.id);
  const firstFive = page.locator(`[data-card-id="${lessonTwoFives[0]}"]`);
  const secondFive = page.locator(`[data-card-id="${lessonTwoFives[1]}"]`);
  await expect(firstFive).toHaveClass(/is-playable/);
  await expect(secondFive).toHaveClass(/is-playable/);
  await firstFive.click();
  await expect(page.locator('#tarotKingdomPlayButton')).not.toHaveClass(/is-confirm-ready/);
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(expectedPrompts[1]);
  await page.locator('#tarotKingdomPlayButton').click();
  await expect(page.locator('#tarotKingdomHand > .tarot-card')).toHaveCount(lessonTwo.players[0].hand.length);
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(expectedPrompts[1]);
  await secondFive.click();
  await expect(page.locator('#tarotKingdomPlayButton')).toHaveClass(/is-confirm-ready/);
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(expectedPrompts[1]);
  const lessonTwoResult = await page.evaluate((cardIds) => (
    window.TarotKingdomDebug.battlePlayCards(0, cardIds)
  ), lessonTwoFives);
  expect(lessonTwoResult.ok).toBe(true);
  expect(lessonTwoResult.state.tutorialProgress.completedPlayers[0]).toBe(true);
  const lessonThree = await page.evaluate(() => window.TarotKingdomDebug.battleTutorialScenario(3, 3));
  expect([2, 3, 4, 5, 6].every((number) => (
    lessonThree.players[0].hand.some((card) => Number(card.number) === number)
  ))).toBe(true);
  const lessonThreeStraightIds = [2, 3, 4, 5, 6].map((number) => (
    lessonThree.players[0].hand.find((card) => Number(card.number) === number)?.id
  ));
  const lessonThreeRole = await page.evaluate((cardIds) => (
    window.TarotKingdomDebug.battleRebuildAction(0, { selectedCardIds: cardIds })
  ), lessonThreeStraightIds);
  expect(lessonThreeRole).toMatchObject({ ok: true, play: { type: 'role', role: { key: 'Straight' } } });
  const lessonFour = await page.evaluate(() => window.TarotKingdomDebug.battleTutorialScenario(4, 3));
  expect(lessonFour.trick?.cardsTable?.[0]?.number).toBe(5);
  const callCardIds = lessonFour.players[0].hand
    .filter((card) => (
      (Number(card.number) === 5 && ['Wand', 'Sword'].includes(card.suit))
      || (Number(card.number) === 8 && ['Cup', 'Wand'].includes(card.suit))
    ))
    .map((card) => card.id);
  expect(callCardIds).toHaveLength(4);
  expect(callCardIds.every(Boolean)).toBe(true);
  for (const [index, cardId] of callCardIds.entries()) {
    const cardNode = page.locator(`[data-card-id="${cardId}"]`);
    await cardNode.click();
    await expect(cardNode).toHaveClass(/is-selected/);
    if (index < callCardIds.length - 1) {
      await expect(page.locator('#tarotKingdomPlayButton')).not.toHaveClass(/is-confirm-ready/);
      await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(expectedPrompts[3]);
    }
  }
  const selectedCallAudit = await page.evaluate(() => {
    const selectedIds = [...document.querySelectorAll('#tarotKingdomHand > .tarot-card.is-selected')]
      .map((card) => card.dataset.cardId)
      .filter(Boolean);
    return {
      selectedIds,
      rebuilt: window.TarotKingdomDebug.battleRebuildAction(0, { selectedCardIds: selectedIds }),
      state: window.TarotKingdomDebug.battleState()
    };
  });
  expect(selectedCallAudit.rebuilt).toMatchObject({ ok: true });
  expect(selectedCallAudit.rebuilt.play).toMatchObject({ call: true, role: { key: 'FullHouse' } });
  expect(selectedCallAudit.state.tutorialProgress).toMatchObject({ lesson: 4 });
  await expect(page.locator('#tarotKingdomPlayButton')).toHaveClass(/is-confirm-ready/);

  for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.TarotKingdomDebug.battleTutorialScenario(3, 3));
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#tarotKingdomHand > .tarot-card')];
      const viewportWidth = document.documentElement.clientWidth;
      return {
        overflow: document.documentElement.scrollWidth - viewportWidth,
        cardsInside: cards.every((card) => {
          const rect = card.getBoundingClientRect();
          return rect.left >= -0.5 && rect.right <= viewportWidth + 0.5;
        })
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.cardsInside).toBe(true);
  }
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
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('Aの能力：大アルカナでは返せません。');

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

test('grave centers its card list and fits all ranks without horizontal sliding at 375px', async ({ page }) => {
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
    const optionRect = options.getBoundingClientRect();
    return {
      alignItems: getComputedStyle(options).alignItems,
      optionsClientWidth: options.clientWidth,
      optionsScrollWidth: options.scrollWidth,
      rowWidths: rows.map((row) => ({ client: row.clientWidth, scroll: row.scrollWidth })),
      rowCenterDeltas: rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return Math.abs((rect.left + rect.right) / 2 - (optionRect.left + optionRect.right) / 2);
      }),
      gridWidths: grids.map((grid) => ({
        client: grid.clientWidth,
        scroll: grid.scrollWidth,
        gap: getComputedStyle(grid).columnGap
      })),
      lastSlots,
      optionRight: optionRect.right,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth
    };
  });

  expect(layout.alignItems).toBe('center');
  expect(layout.rowCenterDeltas.every((delta) => delta <= 1)).toBe(true);
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

test('defense pose remains until the final enemy area attack presentation ends', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const result = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({
      turnIndex: 3,
      leaderIndex: 1,
      pass: [true, false, true, false],
      fold: [true, false, false, false]
    });
    const state = debug.battlePass(3);
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    const areaEvent = state.battle.events.find((event) => event.type === 'enemy-area');
    const during = {
      logicalDefenseReset: state.fold?.[0] === false,
      heldIndexes: areaEvent?.defendingPlayerIndexes || [],
      rowDefending: row?.classList.contains('is-defending') === true,
      avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true'
    };
    debug.battleResolveTransition();
    return {
      during,
      after: {
        rowDefending: row?.classList.contains('is-defending') === true,
        avatarPaused: avatar?.dataset.kingdomDefensePaused === 'true'
      }
    };
  });

  expect(result).toEqual({
    during: {
      logicalDefenseReset: true,
      heldIndexes: [0],
      rowDefending: true,
      avatarPaused: true
    },
    after: {
      rowDefending: false,
      avatarPaused: false
    }
  });
});

test('defense can be queued during another player action and commits when the local turn arrives', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  const immediate = await page.evaluate(() => {
    const debug = window.TarotKingdomDebug;
    debug.battleScenario({ turnIndex: 3, leaderIndex: 1 });
    const response = debug.battlePass(3);
    const button = document.getElementById('tarotKingdomFoldButton');
    const disabledBeforeClick = button?.disabled === true;
    button?.click();
    const state = debug.battleState();
    return {
      responsePhase: response.phase,
      transitionKind: response.transition?.kind || '',
      disabledBeforeClick,
      buttonText: button?.textContent || '',
      foldedTooEarly: state.fold?.[0] === true
    };
  });

  expect(immediate).toEqual({
    responsePhase: 'resolvingEnemy',
    transitionKind: 'enemyResponse',
    disabledBeforeClick: false,
    buttonText: '防御中',
    foldedTooEarly: false
  });
  await expect.poll(
    () => page.evaluate(() => window.TarotKingdomDebug.battleState().fold?.[0] === true),
    { timeout: 5000 }
  ).toBe(true);
});

test('current-turn glow does not override any weapon motion or the visible large-gun recoil', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });

  const result = await page.evaluate(async () => {
    const combat = await import('/js/avatarCombat.js');
    window.TarotKingdomDebug.battleScenario({ turnIndex: 0, leaderIndex: 1 });
    const row = document.querySelector(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const avatar = row?.querySelector('.tarot-kingdom-battle-player-avatar');
    const expected = {
      unarmed: 'avatarCombatUnarmed',
      sword: 'avatarCombatSword',
      dagger: 'avatarCombatDagger',
      polearm: 'avatarCombatPolearm',
      blunt: 'avatarCombatBlunt',
      axe: 'avatarCombatAxe',
      sword_big: 'avatarCombatGreatsword',
      axe_big: 'avatarCombatGreataxe',
      staff: 'avatarCombatStaff',
      wand: 'avatarCombatWand',
      bow: 'avatarCombatBow',
      gun: 'avatarCombatGun',
      gun_big: 'avatarCombatBigGun',
      shield: 'avatarCombatShield'
    };
    const animations = {};
    for (const weapon of Object.keys(expected)) {
      const motion = combat.playCombatAvatarAttack(avatar, weapon, {
        direction: 'left',
        duration: 120,
        bodyMotion: false
      });
      animations[weapon] = avatar ? getComputedStyle(avatar).animationName : '';
      await motion;
    }
    const attack = combat.playCombatAvatarAttack(avatar, 'gun_big', {
      direction: 'left',
      duration: 1000,
      bodyMotion: false
    });
    const animationName = avatar ? getComputedStyle(avatar).animationName : '';
    const recoil = avatar?.getAnimations().find((entry) => entry.animationName === 'avatarCombatBigGun');
    recoil?.pause();
    if (recoil) recoil.currentTime = 520;
    const recoilX = avatar
      ? new DOMMatrix(getComputedStyle(avatar).transform).m41
      : 0;
    combat.resetCombatAvatarState(avatar, { resumeIdle: false });
    await attack;
    return {
      currentTurn: row?.classList.contains('is-turn') === true,
      animations,
      expected,
      animationName,
      recoilX
    };
  });

  expect(result.currentTurn).toBe(true);
  expect(result.animations).toEqual(result.expected);
  expect(result.animationName).toBe('avatarCombatBigGun');
  expect(result.recoilX).toBeGreaterThanOrEqual(20);
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

test('another player render does not cancel an in-progress local hand reorder', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.battleScenario({
      withTrick: false,
      turnIndex: 1,
      handsBySeat: [[
        { id: 'tk_remote_drag_w9', kind: 'minor', suit: 'Wand', number: 9 },
        { id: 'tk_remote_drag_c2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'tk_remote_drag_s6', kind: 'minor', suit: 'Sword', number: 6 }
      ], [
        { id: 'tk_remote_actor_w3', kind: 'minor', suit: 'Wand', number: 3 },
        { id: 'tk_remote_actor_keep', kind: 'minor', suit: 'Cup', number: 8 }
      ]]
    });
  });

  const handCards = page.locator('#tarotKingdomHand > .tarot-card');
  const source = handCards.first();
  const sourceId = await source.getAttribute('data-card-id');
  const sourceBox = await source.boundingBox();
  const targetBox = await handCards.last().boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const pointer = {
    pointerId: 23,
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
  await expect(source).toHaveClass(/is-dragging/);
  await expect(page.locator('#tarotKingdomHand > .tarot-kingdom-hand-drop-gap')).toHaveCount(1);

  const remoteAction = await page.evaluate(() => (
    window.TarotKingdomDebug.battlePlayOne(1, { resolve: false })
  ));
  expect(remoteAction.transition).toMatchObject({ kind: 'play', actorIndex: 1 });
  await expect(source).toHaveClass(/is-dragging/);
  await expect(page.locator('#tarotKingdomHand > .tarot-kingdom-hand-drop-gap')).toHaveCount(1);

  await source.dispatchEvent('pointerup', {
    ...pointer,
    clientX: targetBox.x + targetBox.width - 2,
    clientY: targetBox.y + (targetBox.height / 2)
  });
  const order = await handCards.evaluateAll((cards) => cards.map((card) => card.dataset.cardId));
  expect(order.at(-1)).toBe(sourceId);
  await expect(page.locator('#tarotKingdomHand > .tarot-kingdom-hand-drop-gap')).toHaveCount(0);
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
    number: 1,
    level: 4
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
  await expect(row.locator('.tarot-kingdom-battle-player-rank')).toContainText('Lv4');
  await expect(row.locator('.tarot-kingdom-battle-player-hand-count')).toHaveText('残り手札 8枚');
  await expect(row.locator('.tarot-kingdom-battle-ap')).toHaveText('AP 1');
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

  const explorationResult = await page.evaluate((debugPet) => {
    window.myPlayFabId = 'PF_PET_OWNER';
    window.TarotKingdomDebug.battleSetExplorationSession(true, 'offline');
    window.TarotKingdomDebug.battleScenario({
      playerCount: 4,
      pet: debugPet,
      handCounts: [8, 8, 8, 8],
      withTrick: false
    });
    return window.TarotKingdomDebug.battleExplorationResult();
  }, pet);
  expect(explorationResult.standings[1]).toMatchObject({
    isNpc: true,
    isPet: true,
    petOwnerPlayFabId: 'PF_PET_OWNER',
    petMonsterId: pet.monsterId
  });
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
  const actionBar = page.locator('#tarotKingdomSettlementActions');
  await expect(actionBar).toBeVisible();
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toBeEnabled();
  await expect(confirmButton).toHaveText('次の局へ');
  const buttonFit = await confirmButton.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    width: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth
  }));
  expect(buttonFit.scrollWidth).toBeLessThanOrEqual(buttonFit.clientWidth);
  expect(buttonFit.left).toBeGreaterThanOrEqual(0);
  expect(buttonFit.right).toBeLessThanOrEqual(buttonFit.viewportWidth);
  expect(buttonFit.width).toBeGreaterThanOrEqual(280);
  expect(await actionBar.evaluate((element) => element.previousElementSibling?.id)).toBe('tarotKingdomBattleStage');
});

test('exploration victory offers a themed return action in the same result position', async ({ page }) => {
  await openOfflineBattle(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    window.TarotKingdomDebug.matchDone({ winnerIndex: 0 });
    window.TarotKingdomDebug.battleSetExplorationSession(true, 'offline');
  });

  const actionBar = page.locator('#tarotKingdomSettlementActions');
  const confirmButton = page.locator('#tarotKingdomSettlementConfirmButton');
  await expect(actionBar).toBeVisible();
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toHaveText('宝を持って帰還する');
  expect(await actionBar.evaluate((element) => element.previousElementSibling?.id)).toBe('tarotKingdomBattleStage');
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
  await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('あなたは　スキップされた！');
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
