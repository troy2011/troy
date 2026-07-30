const { test, expect } = require('@playwright/test');

async function openKingdomDebug(page) {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
}

test.describe('Tarot Kingdom eight-card rules, combat timeline, and fair NPC', () => {
  test.beforeEach(async ({ page }) => {
    await openKingdomDebug(page);
  });

  test('schema 15 publishes amplified major effects and current combat rules while older matches keep their rules', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const current = debug.battleScenario({ withTrick: false });
      const published = debug.battlePublicState();
      const legacyState = {
        handNo: 1,
        roundActive: true,
        phase: 'turn',
        turn: 0,
        players: [0, 1, 2, 3].map((seat) => ({
          hand: [{ id: `legacy-${seat}`, kind: 'minor', suit: 'Wand', number: seat + 2 }],
          discard: []
        }))
      };
      const schema1 = debug.battleDeserialize({ schema: 1, state: legacyState });
      const schema3 = debug.battleDeserialize({ schema: 3, state: legacyState });
      const schema4 = debug.battleDeserialize({ schema: 4, state: legacyState });
      const schema5 = debug.battleDeserialize({
        schema: 5,
        state: {
          ...legacyState,
          rules: { initialHandSize: 8, handLimit: 8, combatEffectsVersion: 1 }
        }
      });
      const schema6 = debug.battleDeserialize({
        schema: 6,
        state: {
          ...legacyState,
          rules: {
            initialHandSize: 8,
            handLimit: 8,
            combatEffectsVersion: 1,
            summonVersion: 1,
            majorArcanaGateVersion: 1
          }
        }
      });
      return { current, published, schema1, schema3, schema4, schema5, schema6 };
    });

    expect(audit.current.rules).toMatchObject({
      initialHandSize: 8,
      handLimit: 8,
      combatEffectsVersion: 1,
      summonVersion: 1,
      majorArcanaGateVersion: 1,
      majorArcanaSpecialVersion: 1,
      majorBattleEffectsVersion: 2,
      elementAffinityVersion: 1,
      carryHpBetweenRoundsVersion: 1,
      forcedDrawDeathVersion: 1,
      damageGrowthVersion: 1,
      enemyDefeatMode: 'hp-zero'
    });
    expect(audit.current.players.map((player) => player.hand.length)).toEqual([8, 8, 8, 8]);
    expect(audit.published.schema).toBe(15);
    expect(audit.published.state.rules).toMatchObject({
      initialHandSize: 8,
      handLimit: 8,
      playerCount: 4,
      combatEffectsVersion: 1,
      summonVersion: 1,
      majorArcanaGateVersion: 1,
      majorArcanaSpecialVersion: 1,
      majorBattleEffectsVersion: 2,
      elementAffinityVersion: 1,
      carryHpBetweenRoundsVersion: 1,
      forcedDrawDeathVersion: 1,
      damageGrowthVersion: 1,
      enemyDefeatMode: 'hp-zero'
    });
    expect(audit.schema1.rules).toMatchObject({ initialHandSize: 6, handLimit: 6 });
    expect(audit.schema3.rules).toMatchObject({ initialHandSize: 6, handLimit: 6 });
    expect(audit.schema4.rules).toMatchObject({
      initialHandSize: 8,
      handLimit: 8,
      combatEffectsVersion: 0,
      summonVersion: 0
    });
    expect(audit.schema5.rules).toMatchObject({
      initialHandSize: 8,
      handLimit: 8,
      combatEffectsVersion: 1,
      summonVersion: 0
    });
    expect(audit.schema6.rules).toMatchObject({
      initialHandSize: 8,
      handLimit: 8,
      combatEffectsVersion: 1,
      summonVersion: 1,
      majorArcanaGateVersion: 0,
      majorArcanaSpecialVersion: 0,
      forcedDrawDeathVersion: 0,
      enemyDefeatMode: 'hand-empty'
    });
  });

  test('normal attack delays visible HP until impact and then reveals it over 240ms', async ({ page }) => {
    const attack = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        enemyHp: 420,
        handsBySeat: [[
          { id: 'motion-play-7', kind: 'minor', suit: 'Wand', number: 7 },
          { id: 'motion-keep-9', kind: 'minor', suit: 'Cup', number: 9 }
        ]]
      });
      const result = debug.battlePlayCards(0, ['motion-play-7']);
      const state = result.state;
      const hpNode = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy > [role="progressbar"]');
      return {
        state,
        visibleHp: Number(hpNode?.getAttribute('aria-valuenow')),
        now: Date.now()
      };
    });

    const event = attack.state.battle.events.at(-1);
    const timeline = attack.state.transition.timeline;
    expect(event).toMatchObject({ type: 'attack', hpBefore: 420 });
    expect(event.hpAfter).toBeLessThan(420);
    expect(attack.state.battle.enemy.hp).toBe(event.hpAfter);
    expect(attack.visibleHp).toBe(420);
    expect(attack.state.transition.endsAt - attack.state.transition.startedAt).toBeGreaterThanOrEqual(900);
    expect(timeline).toMatchObject({ version: 1, variant: 'attack' });
    expect(timeline.hpRevealAt - timeline.impactAt).toBe(80);
    expect(timeline.hpTweenEndsAt - timeline.hpRevealAt).toBe(240);
    expect(timeline.damageNumberAt).toBe(timeline.effectAt);
    expect(attack.state.transition.endsAt - timeline.damageNumberAt).toBeGreaterThanOrEqual(260);

    await page.waitForTimeout(Math.max(0, timeline.hpRevealAt - attack.now + 70));
    const duringReveal = await page.locator('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy > [role="progressbar"]')
      .getAttribute('aria-valuenow');
    expect(Number(duringReveal)).toBeLessThan(420);
    expect(Number(duringReveal)).toBeGreaterThanOrEqual(event.hpAfter);
    await expect(page.locator('.tarot-kingdom-damage-number.is-show')).toHaveCount(0);

    await page.waitForTimeout(Math.max(0, timeline.damageNumberAt - Date.now() + 30));
    await expect(page.locator('.tarot-kingdom-damage-number.is-show')).toHaveCount(1);
    await expect(page.locator('.tarot-kingdom-damage-number.is-show')).toHaveText(String(event.damage));
    expect(event.label).toContain(`${event.damage}ダメージ`);
    expect(event.label).not.toContain(`-${event.damage}`);

    await page.waitForTimeout(Math.max(0, timeline.hpTweenEndsAt - Date.now() + 50));
    await expect(page.locator('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy > [role="progressbar"]'))
      .toHaveAttribute('aria-valuenow', String(event.hpAfter));
  });

  test('call visibly reuses the field card before the other four cards join it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      const initial = await page.evaluate(() => {
        const debug = window.TarotKingdomDebug;
        const flushCards = [1, 2, 3, 4, 5].map((number) => ({
          id: `call-visual-${number}`,
          kind: 'minor',
          suit: 'Wand',
          number
        }));
        debug.battleScenario({
          handsBySeat: [[
            ...flushCards.slice(1),
            { id: 'call-visual-keep', kind: 'minor', suit: 'Cup', number: 9 }
          ]],
          tableCard: flushCards[0],
          starsBySeat: [0],
          turnIndex: 0
        });
        const sourceArt = document.querySelector('#tarotKingdomTrick .tarot-card-art');
        const sourceSprite = {
          x: sourceArt?.style.getPropertyValue('--tarot-x'),
          y: sourceArt?.style.getPropertyValue('--tarot-y')
        };
        const result = debug.battlePlayCards(
          0,
          flushCards.slice(1).map((card) => card.id),
          { resolve: false }
        );
        const source = document.querySelector('#tarotKingdomTrick .tarot-card.is-call-source');
        return {
          ok: result.ok,
          sourceSprite,
          sourceMarked: !!source,
          sourceBadge: source?.querySelector('.tarot-kingdom-call-reuse-badge')?.textContent || '',
          sourceAnimation: source ? getComputedStyle(source).animationName : '',
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          sourceRuleLoaded: Array.from(document.styleSheets).some((sheet) => {
            try {
              return Array.from(sheet.cssRules || []).some((rule) => rule.selectorText === '.tarot-card.is-call-source');
            } catch (_) {
              return false;
            }
          }),
          ghostCount: document.querySelectorAll('.tarot-kingdom-call-ghost, .tarot-kingdom-call-ghost-taunt').length
        };
      });

      expect(initial).toMatchObject({
        ok: true,
        sourceMarked: true,
        sourceBadge: '場札',
        reducedMotion: false,
        sourceRuleLoaded: true,
        ghostCount: 0
      });
      expect(initial.sourceAnimation).toContain('tarotKingdomCallSourceLift');

      await expect(page.locator('#tarotKingdomTrick .tarot-card.is-call-reused')).toHaveCount(1);
      await expect(page.locator('#tarotKingdomTrick .tarot-card.is-call-arriving')).toHaveCount(4);
      await expect(page.locator('#tarotKingdomTrick .tarot-card.is-call-reused .tarot-kingdom-call-reuse-badge'))
        .toHaveText('場札 +1');

      const merged = await page.evaluate(() => {
        const firstArt = document.querySelector(
          '#tarotKingdomTrick .tarot-card.is-call-reused .tarot-card-art'
        );
        const reused = document.querySelector('#tarotKingdomTrick .tarot-card.is-call-reused');
        const arriving = Array.from(document.querySelectorAll(
          '#tarotKingdomTrick .tarot-card.is-call-arriving'
        ));
        const root = document.documentElement;
        return {
          x: firstArt?.style.getPropertyValue('--tarot-x'),
          y: firstArt?.style.getPropertyValue('--tarot-y'),
          reusedAnimation: reused ? getComputedStyle(reused).animationName : '',
          arrivingTracks: arriving.map((node) => node.dataset.roleEntry || ''),
          arrivingAnimations: arriving.map((node) => getComputedStyle(node).animationName),
          arrivingPlayStates: arriving.map((node) => getComputedStyle(node).animationPlayState),
          cardCount: document.querySelectorAll('#tarotKingdomTrick > .tarot-card').length,
          cloneCount: document.querySelectorAll('.tarot-kingdom-call-reuse-clone').length,
          horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth)
        };
      });
      expect({ x: merged.x, y: merged.y }).toEqual(initial.sourceSprite);
      expect(merged.reusedAnimation).toContain('tarotKingdomCallReuseSettle');
      expect(merged.arrivingTracks).toEqual(['fan-right', 'fan-left', 'fan-right', 'fan-left']);
      expect(merged.arrivingAnimations).toEqual([
        'tarotKingdomRoleCardFanRight',
        'tarotKingdomRoleCardFanLeft',
        'tarotKingdomRoleCardFanRight',
        'tarotKingdomRoleCardFanLeft'
      ]);
      expect(merged.arrivingPlayStates).toEqual(Array(4).fill('running'));
      expect(merged.cardCount).toBe(5);
      expect(merged.cloneCount).toBeLessThanOrEqual(1);
      expect(merged.horizontalOverflow).toBeLessThanOrEqual(1);

      await page.waitForTimeout(900);
      await expect(page.locator('.tarot-kingdom-call-reuse-clone')).toHaveCount(0);
    }
  });

  test('five-card roles clear the old field and use role-specific formation before summoning', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    const cases = [
      {
        roleKey: 'Straight',
        cards: [4, 5, 6, 7, 8].map((number, index) => ({
          id: `role-straight-${number}`,
          kind: 'minor',
          suit: ['Wand', 'Cup', 'Sword', 'Pentacle', 'Wand'][index],
          number
        })),
        expectedTracks: ['from-right', 'from-right', 'from-right', 'from-right', 'from-right']
      },
      {
        roleKey: 'Flush',
        cards: [2, 4, 6, 9, 12].map((number) => ({
          id: `role-flush-${number}`,
          kind: 'minor',
          suit: 'Cup',
          number
        })),
        expectedTracks: ['fade', 'fade', 'fade', 'fade', 'fade']
      },
      {
        roleKey: 'FullHouse',
        cards: [
          { id: 'role-house-3w', kind: 'minor', suit: 'Wand', number: 3 },
          { id: 'role-house-3c', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'role-house-3s', kind: 'minor', suit: 'Sword', number: 3 },
          { id: 'role-house-4w', kind: 'minor', suit: 'Wand', number: 4 },
          { id: 'role-house-4c', kind: 'minor', suit: 'Cup', number: 4 }
        ],
        expectedTracks: ['from-top', 'from-top', 'from-top', 'from-right', 'from-right']
      }
    ];

    for (const roleCase of cases) {
      const started = await page.evaluate(({ cards }) => {
        const debug = window.TarotKingdomDebug;
        const oldRoleCards = [2, 3, 4, 5, 6].map((number, index) => ({
          id: `role-formation-old-${number}`,
          kind: 'minor',
          suit: ['Wand', 'Cup', 'Sword', 'Pentacle', 'Wand'][index],
          number
        }));
        debug.battleScenario({
          handsBySeat: [[
            ...cards,
            { id: 'role-formation-keep', kind: 'minor', suit: 'Pentacle', number: 10 }
          ], [
            ...oldRoleCards,
            { id: 'role-formation-old-keep', kind: 'minor', suit: 'Cup', number: 10 }
          ]],
          withTrick: false,
          turnIndex: 1
        });
        const oldResult = debug.battlePlayCards(
          1,
          oldRoleCards.map((card) => card.id),
          { resolve: true }
        );
        const result = debug.battlePlayCards(0, cards.map((card) => card.id), { resolve: false });
        return {
          oldOk: oldResult.ok,
          ok: result.ok,
          reason: result.reason || '',
          clearingCount: document.querySelectorAll(
            '#tarotKingdomTrick > .tarot-card.is-role-field-clearing'
          ).length
        };
      }, roleCase);
      expect(started).toEqual({ oldOk: true, ok: true, reason: '', clearingCount: 5 });

      await page.waitForTimeout(500);
      const formation = await page.evaluate(() => ({
        roleKey: document.querySelector(
          '.tarot-kingdom-skill-card-fan'
        )?.dataset.roleFormation || '',
        isCall: document.querySelector(
          '.tarot-kingdom-skill-card-fan'
        )?.dataset.call || '',
        tracks: Array.from(document.querySelectorAll(
          '#tarotKingdomTrick > .tarot-card.is-role-arriving'
        )).map((node) => node.dataset.roleEntry || ''),
        animations: Array.from(document.querySelectorAll(
          '#tarotKingdomTrick > .tarot-card.is-role-arriving'
        )).map((node) => getComputedStyle(node).animationName),
        playStates: Array.from(document.querySelectorAll(
          '#tarotKingdomTrick > .tarot-card.is-role-arriving'
        )).map((node) => getComputedStyle(node).animationPlayState),
        durations: Array.from(document.querySelectorAll(
          '#tarotKingdomTrick > .tarot-card.is-role-arriving'
        )).map((node) => parseFloat(getComputedStyle(node).animationDuration) * 1000)
      }));

      expect(formation.roleKey).toBe(roleCase.roleKey);
      expect(formation.isCall).toBe('false');
      expect(formation.tracks).toEqual(roleCase.expectedTracks);
      expect(formation.animations.every((name) => name.startsWith('tarotKingdomRoleCard'))).toBe(true);
      expect(formation.playStates).toEqual(Array(5).fill('running'));
      expect(Math.min(...formation.durations)).toBeGreaterThanOrEqual(640);
    }
  });

  test('enemy attack shows unsigned damage above the targeted player', async ({ page }) => {
    const attack = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [120, 120, 120, 120],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 120, defense: 20 }))
      });
      const state = debug.battlePass(1);
      const event = state.battle.events.find((entry) => entry.type === 'enemy-single');
      const timeline = state.transition?.eventTimelineSpecs?.[String(event?.seq || '')]
        || state.transition?.timeline;
      return {
        event,
        damage: Number(event?.damages?.[0]?.damage || 0),
        hpRevealAt: Number(timeline?.hpRevealAt || 0),
        damageNumberAt: Number(timeline?.damageNumberAt || 0),
        now: Date.now()
      };
    });

    expect(attack.damage).toBeGreaterThan(0);
    const hpText = page.locator(
      '#tarotKingdomBattleParty [data-player-index="1"] .tarot-kingdom-battle-player-hp-text'
    );
    await expect(hpText).toContainText('HP 120 / 120');
    await page.waitForTimeout(Math.max(0, attack.hpRevealAt - attack.now + 40));
    const damage = page.locator(
      '#tarotKingdomBattleParty [data-player-index="1"] > .tarot-kingdom-player-damage-number.is-show'
    );
    await expect(page.locator('#tarotKingdomBattleAvatar-1')).toHaveClass(/is-avatar-damaged/);
    await expect(damage).toHaveCount(0);

    await page.waitForTimeout(Math.max(0, attack.damageNumberAt - Date.now() + 30));
    await expect(page.locator('#tarotKingdomBattleAvatar-1')).not.toHaveClass(/is-avatar-damaged/);
    await expect(damage).toHaveCount(1);
    await expect(damage).toHaveText(String(attack.damage));
    await expect(damage).not.toContainText('-');
  });

  test('five-card role runs one synchronized 4.5-second summon without duplicate events', async ({ page }) => {
    const cards = [
      { id: 'skill-2', kind: 'minor', suit: 'Wand', number: 2 },
      { id: 'skill-3', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'skill-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'skill-5', kind: 'minor', suit: 'Pentacle', number: 5 },
      { id: 'skill-6', kind: 'minor', suit: 'Wand', number: 6 },
      { id: 'skill-keep', kind: 'minor', suit: 'Cup', number: 10 }
    ];
    const audit = await page.evaluate((hand) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, turnIndex: 0, handsBySeat: [hand] });
      const result = debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      debug.battleRender();
      debug.battleRender();
      return {
        state: debug.battleState(),
        cutinCount: document.querySelectorAll('.tarot-kingdom-skill-cutin').length,
        cutinCardCount: document.querySelectorAll('.tarot-kingdom-skill-cutin .tarot-card').length,
        artSizes: Array.from(document.querySelectorAll('.tarot-kingdom-skill-cutin .tarot-card-art')).map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      };
    }, cards);

    const event = audit.state.battle.events.at(-1);
    expect(event.type).toBe('skill');
    expect(audit.state.battle.events.filter((entry) => entry.type === 'skill')).toHaveLength(1);
    expect(event.summon).toMatchObject({ id: 'skeletal_parrot', effectKey: 'command' });
    expect(audit.state.transition.endsAt - audit.state.transition.startedAt).toBe(4500);
    expect(audit.state.transition.timeline).toMatchObject({
      version: 2,
      variant: 'skill',
      impactAt: audit.state.transition.startedAt + 3000,
      hpRevealAt: audit.state.transition.startedAt + 3160,
      hpTweenEndsAt: audit.state.transition.startedAt + 3600,
      damageNumberAt: audit.state.transition.startedAt + 3600,
      endsAt: audit.state.transition.startedAt + 4500
    });
    expect(audit.cutinCount).toBe(1);
    expect(audit.cutinCardCount).toBe(5);
    expect(audit.state.battle.events.at(-1).label).toContain('召喚・骸骨オウム');
    audit.artSizes.forEach((size) => {
      expect(size.width).toBeLessThanOrEqual(48.1);
      expect(size.height).toBeLessThanOrEqual(80.1);
    });
  });

  test('reduced motion keeps the role cue, hit color, and final HP without movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const cards = [
      { id: 'reduced-2', kind: 'minor', suit: 'Wand', number: 2 },
      { id: 'reduced-3', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'reduced-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'reduced-5', kind: 'minor', suit: 'Pentacle', number: 5 },
      { id: 'reduced-6', kind: 'minor', suit: 'Wand', number: 6 },
      { id: 'reduced-keep', kind: 'minor', suit: 'Cup', number: 10 }
    ];
    const audit = await page.evaluate((hand) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, turnIndex: 0, handsBySeat: [hand] });
      debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      debug.battleRender();
      const state = debug.battleState();
      const event = state.battle.events.at(-1);
      const hpBar = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy > [role="progressbar"]');
      const cutin = document.querySelector('.tarot-kingdom-skill-cutin');
      const summonFigure = cutin?.querySelector('.tarot-kingdom-summon-figure');
      const arena = document.querySelector('#tarotKingdomBattleStage');
      return {
        hpAfter: event.hpAfter,
        visibleHp: Number(hpBar?.getAttribute('aria-valuenow')),
        roleName: cutin?.querySelector('.tarot-kingdom-skill-cutin-title')?.textContent || '',
        cutinAnimation: cutin ? getComputedStyle(cutin).animationName : '',
        summonFigureOpacity: summonFigure ? getComputedStyle(summonFigure).opacity : '',
        summonFigureAnimation: summonFigure ? getComputedStyle(summonFigure).animationName : '',
        arenaAnimation: arena ? getComputedStyle(arena).animationName : ''
      };
    }, cards);

    expect(audit.visibleHp).toBe(audit.hpAfter);
    expect(audit.roleName).toContain('ストレート');
    expect(audit.cutinAnimation).toBe('none');
    expect(audit.summonFigureOpacity).toBe('1');
    expect(audit.summonFigureAnimation).toBe('none');
    expect(audit.arenaAnimation).toBe('none');
  });

  test('enemy HP zero enters slow Rush Time without using the defeat pose', async ({ page }) => {
    const rush = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        enemyHp: 0,
        handsBySeat: [[
          { id: 'rush-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'rush-7', kind: 'minor', suit: 'Cup', number: 7 }
        ]]
      });
      const stage = document.querySelector('#tarotKingdomBattleStage');
      const enemy = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy');
      const sprite = document.querySelector('#tarotKingdomEnemySprite');
      return {
        stageRush: stage?.classList.contains('is-rush-time'),
        enemyRush: enemy?.classList.contains('is-rush-time'),
        spriteRush: sprite?.classList.contains('is-rush-time'),
        defeated: sprite?.classList.contains('is-defeated'),
        image: sprite ? getComputedStyle(sprite).backgroundImage : '',
        firstPosition: sprite ? getComputedStyle(sprite).backgroundPosition : ''
      };
    });

    expect(rush).toMatchObject({
      stageRush: true,
      enemyRush: true,
      spriteRush: true,
      defeated: false
    });
    expect(rush.image).toContain('idle.png');

    await page.waitForTimeout(120);
    const earlyPosition = await page.locator('#tarotKingdomEnemySprite').evaluate((node) => getComputedStyle(node).backgroundPosition);
    expect(earlyPosition).toBe(rush.firstPosition);

    await page.waitForTimeout(210);
    const slowedPosition = await page.locator('#tarotKingdomEnemySprite').evaluate((node) => getComputedStyle(node).backgroundPosition);
    expect(slowedPosition).not.toBe(rush.firstPosition);
  });

  test('last-card finisher plays the unique death sheet before dusting the enemy away', async ({ page }) => {
    const finisher = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        enemyHp: 0,
        rules: { enemyDefeatMode: 'hand-empty' },
        handsBySeat: [[{ id: 'finisher-2', kind: 'minor', suit: 'Wand', number: 2 }]]
      });
      debug.battlePlayCards(0, ['finisher-2']);
      const state = debug.battleResolveTransition();
      const sprite = document.querySelector('#tarotKingdomEnemySprite');
      const victory = state.battle.events.find((event) => event.type === 'victory');
      return {
        outcome: state.battle.outcome,
        resultReason: state.battle.resultReason,
        victory,
        image: sprite ? getComputedStyle(sprite).backgroundImage : '',
        firstPosition: sprite ? getComputedStyle(sprite).backgroundPosition : '',
        finisherClass: sprite?.classList.contains('is-finisher-defeat'),
        dustingClass: sprite?.classList.contains('is-dusting')
      };
    });

    expect(finisher).toMatchObject({
      outcome: 'victory',
      resultReason: 'enemy-defeated',
      finisherClass: true,
      dustingClass: false
    });
    expect(finisher.victory).toMatchObject({
      type: 'victory',
      finisher: true,
      deathAnimation: 'death',
      dustDurationMs: 330
    });
    expect(finisher.victory.deathDurationMs).toBeGreaterThan(0);
    expect(finisher.image).toContain('death.png');

    await page.waitForTimeout(110);
    const animatedPosition = await page.locator('#tarotKingdomEnemySprite').evaluate((node) => getComputedStyle(node).backgroundPosition);
    expect(animatedPosition).not.toBe(finisher.firstPosition);

    await expect(page.locator('#tarotKingdomEnemySprite')).toHaveClass(/is-dusting/, {
      timeout: finisher.victory.deathDurationMs + 700
    });
    const dustFx = await page.evaluate(() => {
      const sprite = document.querySelector('#tarotKingdomEnemySprite');
      const visual = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-enemy-visual');
      return {
        spriteAnimation: sprite ? getComputedStyle(sprite).animationName : '',
        particleAnimation: visual ? getComputedStyle(visual, '::before').animationName : ''
      };
    });
    expect(dustFx.spriteAnimation).toContain('tarotKingdomEnemyDustLeft');
    expect(dustFx.particleAnimation).toContain('tarotKingdomEnemyDustParticles');
  });

  test('a surviving enemy turns away and escapes without becoming a pet finisher', async ({ page }) => {
    const escaped = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const scenario = debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        enemyHp: 180,
        stage: {
          version: 1,
          stageNo: 1,
          stageId: 'escape-test-stage',
          battlefieldId: 'moonlit-ruins',
          monsters: [
            { order: 1, monsterId: 'ismartal-vol1-monster-01' },
            { order: 2, monsterId: 'ismartal-vol1-monster-02' },
            { order: 3, monsterId: 'ismartal-vol1-monster-03' },
            { order: 4, monsterId: 'ismartal-vol1-monster-04' }
          ],
          finishers: []
        },
        handsBySeat: [[{ id: 'escape-2', kind: 'minor', suit: 'Wand', number: 2 }]]
      });
      const hpBeforePlay = scenario.battle.enemy.hp;
      debug.battlePlayCards(0, ['escape-2']);
      const state = debug.battleResolveTransition();
      const sprite = document.querySelector('#tarotKingdomEnemySprite');
      const victory = state.battle.events.find((event) => event.type === 'victory');
      return {
        hpBeforePlay,
        hpAfterPlay: state.battle.enemy.hp,
        outcome: state.battle.outcome,
        resultReason: state.battle.resultReason,
        victory,
        stageFinishers: state.stage?.finishers || [],
        image: sprite ? getComputedStyle(sprite).backgroundImage : '',
        animationName: sprite ? getComputedStyle(sprite).animationName : '',
        transform: sprite ? getComputedStyle(sprite).transform : '',
        battleFacing: sprite ? getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-facing-scale-x').trim() : '',
        escapeFacing: sprite ? getComputedStyle(sprite).getPropertyValue('--tarot-kingdom-enemy-escape-facing-scale-x').trim() : '',
        escapingClass: sprite?.classList.contains('is-escaping'),
        finisherClass: sprite?.classList.contains('is-finisher-defeat'),
        dustingClass: sprite?.classList.contains('is-dusting')
      };
    });

    expect(escaped).toMatchObject({
      outcome: 'victory',
      resultReason: 'enemy-escaped',
      escapingClass: true,
      finisherClass: false,
      dustingClass: false,
      battleFacing: '-1',
      escapeFacing: '1',
      stageFinishers: []
    });
    expect(escaped.hpAfterPlay).toBeGreaterThan(0);
    expect(escaped.hpAfterPlay).toBeLessThan(escaped.hpBeforePlay);
    expect(escaped.victory).toMatchObject({
      type: 'victory',
      finisher: false,
      enemyEscaped: true,
      escapeAnimation: 'idle',
      hpAfter: escaped.hpAfterPlay,
      enemyHp: escaped.hpAfterPlay
    });
    expect(escaped.victory).not.toHaveProperty('deathAnimation');
    expect(escaped.image).toContain('idle.png');
    expect(escaped.animationName).toContain('tarotKingdomEnemyEscapeLeft');
    expect(escaped.transform).not.toBe('none');
  });

  test('NPC observation excludes combat and hidden cards and always takes an immediate win', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        tableCard: { id: 'npc-win-table', kind: 'minor', suit: 'Cup', number: 4 },
        handsBySeat: [
          [{ id: 'hidden-a', kind: 'major', suit: 'None', number: 21 }],
          [{ id: 'npc-win-7', kind: 'minor', suit: 'Wand', number: 7 }],
          [{ id: 'hidden-b', kind: 'minor', suit: 'Cup', number: 10 }],
          [{ id: 'hidden-c', kind: 'minor', suit: 'Sword', number: 12 }]
        ],
        hpBySeat: [1, 1, 1, 1],
        enemyHp: 1
      });
      return {
        observation: debug.battleNpcObservation(1),
        decision: debug.battleNpcDecision(1, 0.5)
      };
    });

    expect(audit.observation).not.toHaveProperty('battle');
    expect(audit.observation).not.toHaveProperty('enemyHp');
    expect(audit.observation).not.toHaveProperty('hp');
    expect(audit.observation).not.toHaveProperty('hands');
    expect(audit.observation.handCounts).toEqual([1, 1, 1, 1]);
    expect(audit.observation.hand.map((card) => card.id)).toEqual(['npc-win-7']);
    expect(audit.decision.action).toBe('play');
    expect(audit.decision.play.cardsHand.map((card) => card.id)).toEqual(['npc-win-7']);
  });

  test('low field three no longer makes incomplete role seeds trigger defense', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const hand = [
        { id: 'low-field-w4', kind: 'minor', suit: 'Wand', number: 4 },
        { id: 'low-field-w6', kind: 'minor', suit: 'Wand', number: 6 },
        { id: 'low-field-w8', kind: 'minor', suit: 'Wand', number: 8 },
        { id: 'low-field-c10', kind: 'minor', suit: 'Cup', number: 10 },
        { id: 'low-field-s12', kind: 'minor', suit: 'Sword', number: 12 },
        { id: 'low-field-p14', kind: 'minor', suit: 'Pentacle', number: 14 },
        { id: 'low-field-major2', kind: 'major', suit: 'None', number: 2 },
        { id: 'low-field-major9', kind: 'major', suit: 'None', number: 9 }
      ];
      const counts = { play: 0, pass: 0, defend: 0 };
      for (let index = 1; index <= 256; index += 1) {
        debug.battleScenario({
          enableNpcSeats: true,
          turnIndex: 1,
          leaderIndex: 0,
          tableCard: { id: `low-field-table-${index}`, kind: 'minor', suit: 'Cup', number: 3 },
          handsBySeat: [null, hand],
          npcPolicySeeds: [0, index, 0, 0]
        });
        const decision = debug.battleNpcDecision(1, (index % 251) / 251);
        counts[decision?.action] = (counts[decision?.action] || 0) + 1;
      }
      return counts;
    });

    expect(audit.defend).toBeLessThanOrEqual(12);
    expect(audit.play).toBeGreaterThan(audit.pass);
  });

  test('NPC protects flush and straight cards only at four-card tenpai, equal to call candidates', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const inspect = (hand, tableCard = null) => {
        debug.battleScenario({
          enableNpcSeats: true,
          turnIndex: 1,
          tableCard,
          handsBySeat: [null, hand]
        });
        return Object.fromEntries(
          debug.battleNpcReserveAudit(1).map((entry) => [entry.cardId, entry])
        );
      };
      return {
        threeFlush: inspect([
          { id: 'three-flush-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'three-flush-7', kind: 'minor', suit: 'Wand', number: 7 },
          { id: 'three-flush-12', kind: 'minor', suit: 'Wand', number: 12 },
          { id: 'three-flush-dead', kind: 'minor', suit: 'Cup', number: 14 }
        ]),
        threeStraight: inspect([
          { id: 'three-straight-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'three-straight-3', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'three-straight-4', kind: 'minor', suit: 'Sword', number: 4 },
          { id: 'three-straight-dead', kind: 'minor', suit: 'Pentacle', number: 10 }
        ]),
        fourFlush: inspect([
          { id: 'four-flush-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'four-flush-7', kind: 'minor', suit: 'Wand', number: 7 },
          { id: 'four-flush-10', kind: 'minor', suit: 'Wand', number: 10 },
          { id: 'four-flush-13', kind: 'minor', suit: 'Wand', number: 13 },
          { id: 'four-flush-dead', kind: 'minor', suit: 'Cup', number: 5 }
        ]),
        fourStraight: inspect([
          { id: 'four-straight-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'four-straight-3', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'four-straight-4', kind: 'minor', suit: 'Sword', number: 4 },
          { id: 'four-straight-5', kind: 'minor', suit: 'Pentacle', number: 5 },
          { id: 'four-straight-dead', kind: 'minor', suit: 'Wand', number: 10 }
        ]),
        callReady: inspect([
          { id: 'call-ready-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'call-ready-3', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'call-ready-4', kind: 'minor', suit: 'Sword', number: 4 },
          { id: 'call-ready-5', kind: 'minor', suit: 'Pentacle', number: 5 },
          { id: 'call-ready-dead', kind: 'minor', suit: 'Wand', number: 12 }
        ], { id: 'call-ready-field-6', kind: 'minor', suit: 'Cup', number: 6 })
      };
    });

    ['three-flush-2', 'three-flush-7', 'three-flush-12'].forEach((cardId) => {
      expect(audit.threeFlush[cardId].isProtected).toBe(false);
      expect(audit.threeFlush[cardId].preserveBias).toBe(0);
    });
    ['three-straight-2', 'three-straight-3', 'three-straight-4'].forEach((cardId) => {
      expect(audit.threeStraight[cardId].isProtected).toBe(false);
      expect(audit.threeStraight[cardId].preserveBias).toBe(0);
    });
    ['four-flush-2', 'four-flush-7', 'four-flush-10', 'four-flush-13'].forEach((cardId) => {
      expect(audit.fourFlush[cardId].isProtected).toBe(true);
      expect(audit.fourFlush[cardId].flushTenpaiCount).toBeGreaterThan(0);
    });
    ['four-straight-2', 'four-straight-3', 'four-straight-4', 'four-straight-5'].forEach((cardId) => {
      expect(audit.fourStraight[cardId].isProtected).toBe(true);
      expect(audit.fourStraight[cardId].straightTenpaiCount).toBeGreaterThan(0);
    });
    ['call-ready-2', 'call-ready-3', 'call-ready-4', 'call-ready-5'].forEach((cardId) => {
      expect(audit.callReady[cardId].isProtected).toBe(true);
      expect(audit.callReady[cardId].callCount).toBeGreaterThan(0);
      expect(audit.callReady[cardId].preserveBias).toBe(16);
    });
  });

  test('NPC policy seed and same-field pass memory survive public state migration without fixed types', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const initial = debug.battleScenario({
        enableNpcSeats: true,
        npcPolicySeeds: [0, 101, 202, 303],
        npcPassCounts: [0, 1, 2, 3]
      });
      const payload = debug.battlePublicState();
      const restored = debug.battleDeserialize(payload);
      return {
        initialSeeds: initial.npcPolicySeeds,
        restoredSeeds: restored.npcPolicySeeds,
        restoredPassCounts: restored.npcPassCounts,
        aiStyles: restored.players.map((player) => player.aiStyle || null)
      };
    });

    expect(audit.initialSeeds).toEqual([0, 101, 202, 303]);
    expect(audit.restoredSeeds).toEqual(audit.initialSeeds);
    expect(audit.restoredPassCounts).toEqual([0, 1, 2, 3]);
    expect(audit.aiStyles).toEqual([null, null, null, null]);
  });

  test('NPC decision is invariant to combat HP and opponents hidden cards with the same public counts', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const own = [
        { id: 'npc-5', kind: 'minor', suit: 'Wand', number: 5 },
        { id: 'npc-7a', kind: 'minor', suit: 'Cup', number: 7 },
        { id: 'npc-7b', kind: 'minor', suit: 'Sword', number: 7 },
        { id: 'npc-21', kind: 'major', suit: 'None', number: 21 }
      ];
      const run = (hiddenPrefix, hp, enemyHp) => {
        const hidden = [0, 1, 2, 3].map((index) => ({
          id: `${hiddenPrefix}-${index}`,
          kind: 'minor',
          suit: ['Wand', 'Cup', 'Sword', 'Pentacle'][index],
          number: index + 9
        }));
        debug.battleScenario({
          turnIndex: 1,
          tableCard: { id: `${hiddenPrefix}-table`, kind: 'minor', suit: 'Pentacle', number: 4 },
          handsBySeat: [[hidden[0], hidden[1]], own, [hidden[2]], [hidden[3], { ...hidden[0], id: `${hiddenPrefix}-x` }]],
          hpBySeat: hp,
          enemyHp
        });
        debug.battleNpcDecision(1, 0.25);
        const start = performance.now();
        const decision = debug.battleNpcDecision(1, 0.25);
        return {
          key: `${decision.action}:${(decision.play?.cardsHand || []).map((card) => card.id).sort().join(',')}`,
          elapsed: performance.now() - start
        };
      };
      return {
        first: run('hidden-first', [100, 100, 100, 100], 420),
        second: run('hidden-second', [1, 5, 0, 99], 1)
      };
    });

    expect(audit.second.key).toBe(audit.first.key);
    expect(audit.first.elapsed).toBeLessThan(25);
    expect(audit.second.elapsed).toBeLessThan(25);
  });

  test('NPC prioritizes control, preserves a World seed, and Judgment recovers for hand synergy', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        tableCard: { id: 'control-table', kind: 'minor', suit: 'Cup', number: 4 },
        handsBySeat: [
          null,
          [
            { id: 'control-5', kind: 'minor', suit: 'Wand', number: 5 },
            { id: 'control-7', kind: 'minor', suit: 'Cup', number: 7 },
            { id: 'control-9', kind: 'minor', suit: 'Sword', number: 9 }
          ],
          [{ id: 'threat-last', kind: 'minor', suit: 'Pentacle', number: 12 }]
        ]
      });
      const control = debug.battleNpcDecision(1, 0.5);

      debug.battleScenario({
        turnIndex: 1,
        tableCard: { id: 'seed-table', kind: 'minor', suit: 'Cup', number: 4 },
        handsBySeat: [null, [
          { id: 'seed-world', kind: 'major', suit: 'None', number: 21 },
          { id: 'seed-major-2', kind: 'major', suit: 'None', number: 2 },
          { id: 'seed-major-3', kind: 'major', suit: 'None', number: 3 },
          { id: 'seed-major-4', kind: 'major', suit: 'None', number: 4 },
          { id: 'seed-dead-6', kind: 'minor', suit: 'Wand', number: 6 }
        ]]
      });
      const preserve = debug.battleNpcDecision(1, 0.5);

      debug.battleScenario({
        turnIndex: 1,
        handsBySeat: [null, [
          { id: 'judge-2', kind: 'minor', suit: 'Wand', number: 2 },
          { id: 'judge-3', kind: 'minor', suit: 'Cup', number: 3 },
          { id: 'judge-4', kind: 'minor', suit: 'Sword', number: 4 },
          { id: 'judge-5', kind: 'minor', suit: 'Pentacle', number: 5 }
        ]],
        discardsBySeat: [[
          { id: 'judge-fit-6', kind: 'minor', suit: 'Wand', number: 6 },
          { id: 'judge-high-14', kind: 'minor', suit: 'Cup', number: 14 }
        ]]
      });
      const judgment = debug.battleNpcJudgmentChoice(1, 0.5);
      return { control, preserve, judgment };
    });

    expect(audit.control.play.cardsHand.map((card) => card.id)).toContain('control-5');
    expect(audit.preserve.play.cardsHand.map((card) => card.id)).toEqual(['seed-dead-6']);
    expect(audit.judgment.card.id).toBe('judge-fit-6');
  });

  test('NPC draw choice uses unseen distribution rather than the actual deck top', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const hand = [
        { id: 'draw-2', kind: 'minor', suit: 'Wand', number: 2 },
        { id: 'draw-4', kind: 'minor', suit: 'Cup', number: 4 },
        { id: 'draw-7', kind: 'minor', suit: 'Sword', number: 7 }
      ];
      const run = (drawDeck) => {
        debug.battleScenario({ turnIndex: 1, handsBySeat: [null, hand], drawDeck });
        return debug.battleNpcDrawPlan(1);
      };
      return {
        helpfulTop: run([{ id: 'hidden-helpful', kind: 'minor', suit: 'Wand', number: 3 }]),
        uselessTop: run([{ id: 'hidden-useless', kind: 'major', suit: 'None', number: 15 }])
      };
    });

    expect(audit.helpfulTop).toBe(audit.uselessTop);
  });

  test('5,000 deterministic NPC candidate simulations produce no illegal or stalled result', async ({ page }) => {
    test.setTimeout(60_000);
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const eightCardHand = [2, 3, 5, 7, 9, 11, 13, 14].map((number, index) => ({
        id: `perf-eight-${index}`,
        kind: 'minor',
        suit: ['Wand', 'Cup', 'Sword', 'Pentacle'][index % 4],
        number
      }));
      debug.battleScenario({
        turnIndex: 1,
        tableCard: { id: 'perf-table', kind: 'minor', suit: 'Wand', number: 4 },
        handsBySeat: [null, eightCardHand]
      });
      debug.battleNpcDecision(1, 0.4);
      const eightCardStartedAt = performance.now();
      debug.battleNpcDecision(1, 0.4);
      const eightCardMs = performance.now() - eightCardStartedAt;

      debug.battleScenario({
        turnIndex: 1,
        tableCard: { id: 'sim-table', kind: 'minor', suit: 'Wand', number: 4 },
        handsBySeat: [null, [
          { id: 'sim-5', kind: 'minor', suit: 'Wand', number: 5 },
          { id: 'sim-7a', kind: 'minor', suit: 'Cup', number: 7 },
          { id: 'sim-7b', kind: 'minor', suit: 'Sword', number: 7 },
          { id: 'sim-11', kind: 'minor', suit: 'Pentacle', number: 11 }
        ]]
      });
      let invalid = 0;
      let stalled = 0;
      const startedAt = performance.now();
      for (let index = 0; index < 5000; index += 1) {
        const decision = debug.battleNpcDecision(1, (index % 997) / 997);
        if (!decision || !['play', 'pass', 'defend'].includes(decision.action)) invalid += 1;
        if (decision?.action === 'play') {
          const count = Number(decision.play?.cardsHand?.length || 0);
          if (count <= 0 || count > 5) invalid += 1;
        } else {
          stalled += 1;
        }
      }
      const elapsed = performance.now() - startedAt;
      return { invalid, stalled, elapsed, averageMs: elapsed / 5000, eightCardMs };
    });

    expect(audit.invalid).toBe(0);
    expect(audit.stalled).toBe(0);
    expect(audit.averageMs).toBeLessThan(25);
    expect(audit.eightCardMs).toBeLessThan(25);
  });
});
