const { test, expect } = require('@playwright/test');

async function openKingdomDebug(page) {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleMajorEffectsAudit === 'function');
}

test.describe('Tarot Kingdom major arcana battle effects', () => {
  test.beforeEach(async ({ page }) => {
    await openKingdomDebug(page);
  });

  test('all 22 skills and all 50 monster affinities are complete', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleMajorEffectsAudit());
    expect(audit.skillCount).toBe(22);
    expect(audit.skillNames).toHaveLength(22);
    expect(audit.skillNames.every(Boolean)).toBe(true);
    expect(audit.affinityCount).toBe(50);
    expect(audit.elements).toEqual(['fire', 'water', 'wind', 'earth', 'light', 'dark', 'neutral']);
    expect(new Set(Object.values(audit.affinities).map((affinity) => affinity.native)))
      .toEqual(new Set(audit.elements));
    expect(Object.values(audit.affinities).filter((affinity) => affinity.native === 'light'))
      .toHaveLength(4);
    expect(Object.values(audit.affinities).filter((affinity) => affinity.native === 'dark'))
      .toHaveLength(8);
    expect(Object.values(audit.affinities).filter((affinity) => affinity.native === 'neutral'))
      .toHaveLength(2);
    expect(audit.missingMonsterIds).toEqual([]);
    expect(audit.invalidAffinities).toEqual([]);
  });

  test('a hand-played single major triggers after its normal attack and publishes the skill result', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        hpBySeat: [40, 50, 60, 70],
        handsBySeat: [[
          { id: 'major-priestess', kind: 'major', suit: 'None', number: 2 },
          { id: 'reserve-3', kind: 'minor', suit: 'Wand', number: 3 }
        ]]
      });
      const before = debug.battleState();
      const after = debug.battlePlayCards(0, ['major-priestess'], { resolve: false }).state;
      const event = after.battle.events.at(-1);
      return { before, after, event };
    });

    expect(audit.event.majorSkillName).toBe('ディバインサンクチュアリ');
    expect(audit.event.baseDamage).toBeGreaterThan(0);
    expect(audit.event.effects.filter((entry) => entry.kind === 'major-heal')).toHaveLength(4);
    expect(audit.after.players.every((player, index) => player.hp >= audit.before.players[index].hp)).toBe(true);
    expect(audit.after.transition.kind).toBe('play');
  });

  test('every major resolves once with deterministic host-side results', async ({ page }) => {
    const audits = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      return Array.from({ length: 22 }, (_, number) => {
        debug.battleScenario({
          withTrick: true,
          hpBySeat: [80, 0, 70, 0],
          combatBySeat: [{ maxHp: 120, power: 60, defense: 30, intelligence: 60, speed: 30 }],
          enemyHp: 400,
          enemyMaxHp: 500,
          enemyDefense: 20,
          enemyDamageToParty: 200
        });
        debug.battleSetCombatRandom(number === 13 ? 0.1 : 0.2);
        const resolved = debug.battleResolveMajorEffect(0, number);
        return {
          number,
          skillName: resolved.result?.skillName,
          resultCount: resolved.result?.results?.length || 0,
          state: resolved.state
        };
      });
    });

    expect(audits).toHaveLength(22);
    for (const audit of audits) {
      expect(audit.skillName, `major ${audit.number}`).toBeTruthy();
      if (audit.number !== 14) expect(audit.resultCount, `major ${audit.number}`).toBeGreaterThan(0);
    }
    expect(audits[11].state.battle.enemy.hp).toBeLessThan(400);
    expect(audits[13].state.battle.enemy.hp).toBeLessThan(400);
    expect(audits[20].state.players.filter((player) => player.hp > 0)).toHaveLength(4);
    expect(audits[21].state.battle.pendingWorldTimeStop).toMatchObject({ remainingTurns: 2 });
    expect(audits[1].resultCount).toBe(2);
    expect([0, 2].every((index) => audits[3].state.battle.effects.players[index].hpShield?.shieldHp > 0)).toBe(true);
    expect(audits[4].state.battle.effects.players[0].powerUp).toMatchObject({
      remainingTurns: 2,
      potency: 30
    });
    expect(audits[4].state.battle.effects.players[0].accuracyUp).toMatchObject({
      remainingTurns: 2,
      potency: 30
    });
    expect(audits[4].state.battle.effects.enemy.fear).toMatchObject({
      potency: 25,
      majorRemainingClears: 1
    });
    expect(audits[8].state.battle.effects.players[0].lastStand.remainingTurns).toBe(3);
    expect(audits[10].state.battle.effects.party.partyCritical.potency).toBe(20);
    expect(audits[15].state.players[0]).toMatchObject({ maxHp: 60, hp: 60 });
    expect(audits[18].state.battle.effects.enemy).toMatchObject({
      confusion: { potency: 40 },
      blind: { potency: 40 }
    });
  });

  test('Chariot stays below a five-card skill while retaining a short assault buff', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const combat = [{ maxHp: 120, power: 60, defense: 30, intelligence: 60, speed: 30 }];
      debug.battleScenario({
        withTrick: false,
        combatBySeat: combat,
        enemyHp: 2000,
        enemyMaxHp: 2000,
        enemyDefense: 20,
        handsBySeat: [[
          { id: 'balance-chariot', kind: 'major', suit: 'None', number: 7 },
          { id: 'balance-chariot-reserve', kind: 'minor', suit: 'Cup', number: 2 }
        ]]
      });
      debug.battleSetCombatRandom(0);
      const chariot = debug.battlePlayCards(0, ['balance-chariot'], { resolve: false }).state;
      const chariotEvent = chariot.battle.events.at(-1);

      const roleCards = [
        { id: 'balance-role-2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'balance-role-3', kind: 'minor', suit: 'Sword', number: 3 },
        { id: 'balance-role-4', kind: 'minor', suit: 'Pentacle', number: 4 },
        { id: 'balance-role-5', kind: 'minor', suit: 'Wand', number: 5 },
        { id: 'balance-role-6', kind: 'minor', suit: 'Cup', number: 6 }
      ];
      debug.battleScenario({
        withTrick: false,
        combatBySeat: combat,
        enemyHp: 2000,
        enemyMaxHp: 2000,
        enemyDefense: 20,
        handsBySeat: [[
          ...roleCards,
          { id: 'balance-role-reserve', kind: 'minor', suit: 'Sword', number: 9 }
        ]]
      });
      debug.battleSetCombatRandom(0);
      const role = debug.battlePlayCards(0, roleCards.map((card) => card.id), { resolve: false }).state;
      const roleEvent = role.battle.events.at(-1);
      return {
        chariotDamage: chariotEvent.damage,
        chariotSecondaryDamage: chariotEvent.secondaryDamage,
        chariotBuff: chariot.battle.effects.players[0].chariot,
        roleDamage: roleEvent.damage,
        roleType: roleEvent.type
      };
    });

    expect(audit.chariotSecondaryDamage).toBeGreaterThan(0);
    expect(audit.chariotBuff).toMatchObject({
      potency: 25,
      evasionPenalty: 0.15,
      remainingTurns: 1
    });
    expect(audit.roleType).toBe('skill');
    expect(audit.chariotDamage).toBeLessThan(audit.roleDamage);
  });

  test('lightning major uses wind affinity while retaining lightning presentation', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleSetDemoEnemy('ismartal-vol1-monster-07');
      debug.battleScenario({ withTrick: true, enemyHp: 500, enemyMaxHp: 500, enemyDefense: 0 });
      debug.battleSetCombatRandom(0.1);
      return debug.battleResolveMajorEffect(0, 16);
    });

    const hits = audit.result.results.filter((entry) => entry.kind === 'major-damage');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      element: 'wind',
      visualElement: 'lightning',
      affinityReaction: 'weak',
      affinityMultiplier: 1.5
    });
  });

  test('four-element affinity uses the shared fire-wind-earth-water cycle', async ({ page }) => {
    const affinities = await page.evaluate(async () => {
      const { getTarotKingdomElementMultiplier } = await import('/js/tarotKingdomMajorEffects.js?v=20260826-four-elements-v1');
      const water = { native: 'water', weak: 'earth', resist: 'fire' };
      return {
        weak: getTarotKingdomElementMultiplier(water, 'earth'),
        resist: getTarotKingdomElementMultiplier(water, 'fire'),
        clash: getTarotKingdomElementMultiplier(water, 'wind'),
        same: getTarotKingdomElementMultiplier(water, 'water')
      };
    });

    expect(affinities.weak).toMatchObject({ multiplier: 1.5, reaction: 'weak' });
    expect(affinities.resist).toMatchObject({ multiplier: 0.6, reaction: 'resist' });
    expect(affinities.clash).toMatchObject({ multiplier: 0.85, reaction: 'clash' });
    expect(affinities.same).toMatchObject({ multiplier: 1, reaction: '' });
  });

  test('turn effects tick on field clear and World starts after its own forced clear', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: true, hpBySeat: [60, 60, 60, 60] });
      const empress = debug.battleResolveMajorEffect(0, 17);
      const firstClear = debug.battleClearTrick(0);
      const firstRegen = firstClear.battle.effects.players[0].regen;

      debug.battleScenario({
        withTrick: true,
        tableCard: { id: 'world-major-field', kind: 'major', suit: 'None', number: 5 },
        handsBySeat: [[
          { id: 'major-world', kind: 'major', suit: 'None', number: 21 },
          { id: 'world-reserve', kind: 'minor', suit: 'Wand', number: 3 }
        ]]
      });
      const worldPlayed = debug.battlePlayCards(0, ['major-world'], { resolve: true }).state;

      debug.battleScenario({ withTrick: true });
      debug.battleResolveMajorEffect(0, 10);
      const criticalFirstClear = debug.battleClearTrick(0);
      const criticalSecondClear = debug.battleClearTrick(0);
      const criticalBacklashFirstClear = debug.battleClearTrick(0);
      const criticalBacklashSecondClear = debug.battleClearTrick(0);

      debug.battleScenario({
        withTrick: true,
        hpBySeat: [80, 80, 80, 80],
        combatBySeat: [{ maxHp: 120, power: 60, defense: 30, intelligence: 60, speed: 30 }]
      });
      const pact = debug.battleResolveMajorEffect(0, 15);
      debug.battleClearTrick(0);
      const pactExpired = debug.battleClearTrick(0);

      return {
        empress,
        firstClear,
        firstRegen,
        worldPlayed,
        criticalFirstClear,
        criticalSecondClear,
        criticalBacklashFirstClear,
        criticalBacklashSecondClear,
        pact,
        pactExpired
      };
    });

    expect(audit.firstClear.players[0].hp).toBeGreaterThan(audit.empress.state.players[0].hp);
    expect(audit.firstRegen.remainingTurns).toBe(2);
    expect(audit.worldPlayed.battle.effects.enemy.timeStop).toMatchObject({
      remainingTurns: 2,
      expiresOn: 'turn'
    });
    expect(audit.worldPlayed.battle.pendingWorldTimeStop).toBeUndefined();
    expect(audit.criticalFirstClear.battle.effects.party.partyCritical.remainingTurns).toBe(1);
    expect(audit.criticalSecondClear.battle.effects.party.partyCritical).toBeUndefined();
    expect(audit.criticalSecondClear.battle.effects.enemy.enemyCritical).toBeUndefined();
    expect(audit.criticalBacklashFirstClear.battle.effects.enemy.enemyCritical).toBeUndefined();
    expect(audit.criticalBacklashSecondClear.battle.effects.enemy.enemyCritical).toBeUndefined();
    expect(audit.pact.state.players[0]).toMatchObject({ maxHp: 60, hp: 60 });
    expect(audit.pactExpired.players[0]).toMatchObject({ maxHp: 120, hp: 60 });
  });

  test('The World five-card role stops the enemy and keeps two turns after its own clear', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const played = debug.battleDemoRoleFormation('normal:TheWorld');
      const playEvent = played.state.battle.events.at(-1);
      const hpBeforePasses = played.state.players.map((player) => player.hp);
      debug.battleResolveTransition();
      debug.battlePass(1);
      debug.battlePass(2);
      const cleared = debug.battlePass(3);
      const stopEvent = cleared.battle.events.findLast((event) => (
        event.type === 'enemy-status' && event.attackKind === 'area'
      ));
      return { played, playEvent, hpBeforePasses, cleared, stopEvent };
    });

    expect(audit.played).toMatchObject({ ok: true, error: '' });
    expect(audit.played.state.battle.effects.enemy.timeStop).toMatchObject({
      remainingTurns: 2,
      expiresOn: 'turn',
      source: 'role-TheWorld'
    });
    expect(audit.playEvent.effects).toContainEqual(expect.objectContaining({
      kind: 'role-debuff',
      roleKey: 'TheWorld',
      statusKey: 'timeStop',
      success: true
    }));
    expect(audit.cleared.battle.effects.enemy.timeStop).toMatchObject({
      remainingTurns: 2,
      source: 'role-TheWorld'
    });
    expect(audit.stopEvent).toMatchObject({
      attackStopped: true,
      effects: [expect.objectContaining({ kind: 'skip', statusKey: 'timeStop' })]
    });
    expect(audit.cleared.players.map((player) => player.hp)).toEqual(audit.hpBeforePasses);
    expect(audit.cleared.battle.pendingWorldTimeStop).toBeUndefined();
  });

  test('The World call keeps time stop after call cleanup and cancels the next enemy attack', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const played = debug.battleDemoRoleFormation('call:TheWorld');
      const afterCall = debug.battleResolveTransition();
      const hpBeforePasses = afterCall.players.map((player) => player.hp);
      debug.battlePass(1);
      debug.battlePass(2);
      const cleared = debug.battlePass(3);
      const stopEvent = cleared.battle.events.findLast((event) => (
        event.type === 'enemy-status' && event.attackKind === 'area'
      ));
      return { played, afterCall, hpBeforePasses, cleared, stopEvent };
    });

    expect(audit.played).toMatchObject({ ok: true, error: '' });
    expect(audit.afterCall.battle.effects.enemy.timeStop).toMatchObject({
      remainingTurns: 2,
      expiresOn: 'turn',
      source: 'role-TheWorld'
    });
    expect(audit.stopEvent).toMatchObject({
      attackStopped: true,
      effects: [expect.objectContaining({ kind: 'skip', statusKey: 'timeStop' })]
    });
    expect(audit.cleared.players.map((player) => player.hp)).toEqual(audit.hpBeforePasses);
  });

  test('regen gives the player a pale green aura and shows the recovered amount on clear', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const active = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: true,
        hpBySeat: [60, 60, 60, 60],
        combatBySeat: [0, 1, 2, 3].map(() => ({
          maxHp: 120,
          power: 30,
          defense: 20,
          intelligence: 30,
          speed: 20
        }))
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [
          { regen: { potency: 10, remainingTurns: 3, expiresOn: 'turn', label: 'リジェネ' } },
          {},
          {},
          {}
        ],
        enemyAttackedSinceClear: false
      });
      const row = document.querySelector(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
      );
      const aura = row?.querySelector(':scope > .tarot-kingdom-regen-aura');
      return {
        hasRegen: row?.classList.contains('has-regen') || false,
        auraExists: !!aura,
        auraAnimation: aura ? getComputedStyle(aura).animationName : ''
      };
    });

    expect(active).toMatchObject({
      hasRegen: true,
      auraExists: true,
      auraAnimation: 'tarotKingdomRegenAura'
    });

    const cleared = await page.evaluate(() => (
      window.TarotKingdomDebug.battleClearTrick(0)
    ));
    expect(cleared.battle.events.at(-1)).toMatchObject({
      type: 'turn-effects',
      effects: [expect.objectContaining({
        kind: 'regen',
        targetIndex: 0,
        amount: 12,
        hpBefore: 60,
        hpAfter: 72
      })]
    });
    const row = page.locator(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
    );
    const regenNumber = row.locator(':scope > .tarot-kingdom-heal-number.is-status.is-regen.is-show');
    await expect(regenNumber).toHaveText('+12');
    const regenStyle = await regenNumber.evaluate((node) => ({
      color: getComputedStyle(node).color,
      fontFamily: getComputedStyle(node).fontFamily,
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
    }));
    expect(regenStyle.color).toBe('rgb(184, 255, 199)');
    expect(regenStyle.fontFamily).toContain('Georgia');
    expect(regenStyle.fontSize).toBeLessThanOrEqual(17);
    await expect(row).toHaveClass(/has-regen/);
  });

  test('skill name and field-element affinity reaction stay inside the battle stage at 390px and 900px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await page.evaluate(() => {
        const debug = window.TarotKingdomDebug;
        debug.battleSetDemoEnemy('ismartal-vol1-monster-07');
        debug.battleScenario({
          withTrick: true,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          tableCard: { id: 'major-field-sword-six', kind: 'minor', suit: 'Sword', number: 6 },
          handsBySeat: [[
            { id: 'major-tower', kind: 'major', suit: 'Sword', number: 16 },
            { id: 'reserve-4', kind: 'minor', suit: 'Wand', number: 4 }
          ]]
        });
        debug.battlePlayCards(0, ['major-tower'], { resolve: false });
        debug.battleRender();
      });

      const layout = await page.evaluate(() => {
        const root = document.getElementById('tarotKingdomRoot');
        const stage = document.getElementById('tarotKingdomBattleStage');
        const banner = stage.querySelector('.tarot-kingdom-effect-banner');
        const majorVisual = stage.querySelector('.tarot-kingdom-major-visual');
        const badges = Array.from(stage.querySelectorAll('.tarot-kingdom-affinity-badge'));
        const stageRect = stage.getBoundingClientRect();
        const inside = (rect) => (
          rect.left >= stageRect.left - 1
          && rect.right <= stageRect.right + 1
          && rect.top >= stageRect.top - 1
          && rect.bottom <= stageRect.bottom + 1
        );
        return {
          rootOverflow: root.scrollWidth - root.clientWidth,
          bannerText: banner?.textContent || '',
          bannerIsMajor: banner?.classList.contains('is-major') || false,
          bannerInside: !!banner && inside(banner.getBoundingClientRect()),
          visualInside: !!majorVisual && inside(majorVisual.getBoundingClientRect()),
          visualTone: majorVisual?.dataset.majorTone || '',
          visualScope: majorVisual?.dataset.majorScope || '',
          visualPartCount: majorVisual?.children.length || 0,
          badges: badges.map((badge) => badge.textContent),
          badgesInside: badges.every((badge) => inside(badge.getBoundingClientRect()))
        };
      });

      expect(layout.rootOverflow, `${width}px overflow`).toBeLessThanOrEqual(1);
      expect(layout.bannerText).toBe('サンダーブレイク');
      expect(layout.bannerIsMajor).toBe(true);
      expect(layout.bannerInside).toBe(true);
      expect(layout.visualInside).toBe(true);
      expect(layout.visualTone).toBe('tower');
      expect(layout.visualScope).toBe('both');
      expect(layout.visualPartCount).toBe(5);
      expect(layout.badges.some((text) => text.includes('WEAK'))).toBe(true);
      expect(layout.badgesInside).toBe(true);
    }
  });

  test('schema 23 keeps the previous rules while the current schema enables the revised majors', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const current = debug.battleScenario({ withTrick: false });
      const payload = debug.battlePublicState();
      const schema14Payload = JSON.parse(JSON.stringify(payload));
      schema14Payload.schema = 14;
      schema14Payload.state.rules.majorBattleEffectsVersion = 2;
      const schema14 = debug.battleDeserialize(schema14Payload);
      debug.battleScenario({ withTrick: false });
      const schema23Payload = debug.battlePublicState();
      schema23Payload.schema = 23;
      const schema23 = debug.battleDeserialize(schema23Payload);
      const legacyPayload = JSON.parse(JSON.stringify(payload));
      legacyPayload.schema = 10;
      delete legacyPayload.state.rules.majorBattleEffectsVersion;
      delete legacyPayload.state.rules.elementAffinityVersion;
      const legacy = debug.battleDeserialize(legacyPayload);
      return { current, schema23, schema14, legacy };
    });

    expect(audit.current.rules).toMatchObject({
      majorArcanaSpecialVersion: 3,
      majorBattleEffectsVersion: 3,
      arcanaLoadoutEffectsVersion: 7,
      elementAffinityVersion: 2
    });
    expect(audit.schema23.rules).toMatchObject({
      majorArcanaSpecialVersion: 1,
      majorBattleEffectsVersion: 2,
      arcanaLoadoutEffectsVersion: 3
    });
    expect(audit.schema14.rules.majorBattleEffectsVersion).toBe(1);
    expect(audit.legacy.rules).toMatchObject({
      majorBattleEffectsVersion: 0,
      elementAffinityVersion: 0
    });
  });

  test('same-number pairs and triples amplify majors while minor A stays distinct from Magician I', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const resolve = (cardCount, rules = null) => {
        debug.battleScenario({
          withTrick: false,
          ...(rules ? { rules } : {}),
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0
        });
        return debug.battleResolveMajorEffect(0, 7, { cardCount }).result;
      };
      const single = resolve(1);
      const pair = resolve(2);
      const triple = resolve(3);
      const legacyPair = resolve(2, { majorBattleEffectsVersion: 1 });
      debug.battleScenario({
        withTrick: false,
        enemyHp: 5000,
        enemyMaxHp: 5000,
        enemyDefense: 0,
        handsBySeat: [[
          { id: 'major-chariot-pair', kind: 'major', suit: 'None', number: 7 },
          { id: 'minor-seven-pair', kind: 'minor', suit: 'Cup', number: 7 },
          { id: 'pair-reserve', kind: 'minor', suit: 'Sword', number: 6 }
        ]]
      });
      const pairPlay = debug.battlePlayCards(
        0,
        ['major-chariot-pair', 'minor-seven-pair'],
        { resolve: false }
      );
      const pairEvent = pairPlay.state.battle.events.at(-1);

      const magician = { id: 'major-magician-pair', kind: 'major', suit: 'Wand', number: 1 };
      const cupAce = { id: 'minor-cup-ace-pair', kind: 'minor', suit: 'Cup', number: 1 };
      const swordAce = { id: 'minor-sword-ace-triple', kind: 'minor', suit: 'Sword', number: 1 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[magician, cupAce, swordAce, { id: 'magician-reserve', kind: 'minor', suit: 'Wand', number: 6 }]]
      });
      const magicianPair = debug.battleRebuildAction(0, {
        selectedCardIds: [magician.id, cupAce.id]
      });
      const magicianTriple = debug.battleRebuildAction(0, {
        selectedCardIds: [magician.id, cupAce.id, swordAce.id]
      });
      return { single, pair, triple, legacyPair, pairEvent, magicianPair, magicianTriple };
    });

    const sumDamage = (entry) => (entry?.results || [])
      .filter((result) => result.kind === 'major-damage')
      .reduce((total, result) => total + Number(result.amount || 0), 0);
    const singleDamage = sumDamage(audit.single);
    const pairDamage = sumDamage(audit.pair);
    const tripleDamage = sumDamage(audit.triple);

    expect(audit.single).toMatchObject({ number: 7, cardCount: 1, strengthMultiplier: 1 });
    expect(audit.pair).toMatchObject({ number: 7, cardCount: 2, strengthMultiplier: 1.5 });
    expect(audit.triple).toMatchObject({ number: 7, cardCount: 3, strengthMultiplier: 2 });
    expect(pairDamage).toBeGreaterThan(singleDamage);
    expect(tripleDamage).toBeGreaterThan(pairDamage);
    expect(pairDamage / singleDamage).toBeGreaterThanOrEqual(1.45);
    expect(pairDamage / singleDamage).toBeLessThanOrEqual(1.6);
    expect(tripleDamage / singleDamage).toBeGreaterThanOrEqual(1.9);
    expect(tripleDamage / singleDamage).toBeLessThanOrEqual(2.3);
    expect(audit.legacyPair).toBeNull();
    expect(audit.pairEvent).toMatchObject({
      majorSkillName: '突撃陣形',
      majorCardCount: 2,
      majorStrengthMultiplier: 1.5
    });
    expect(audit.pairEvent.effects.filter((result) => result.kind === 'major-damage')).toHaveLength(2);
    expect(audit.magicianPair).toEqual({
      ok: false,
      reason: 'Aはストレート以外で数字1として扱いません。'
    });
    expect(audit.magicianTriple).toEqual({
      ok: false,
      reason: 'Aはストレート以外で数字1として扱いません。'
    });
  });

  test('revised attack majors apply their ailment only after a successful hit', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const statusByNumber = {
        4: 'fear',
        7: 'vulnerable',
        11: 'silence',
        13: 'curse',
        16: 'paralysis',
        19: 'burn',
        20: 'blind'
      };
      const resolve = (number, mode = 'hit') => {
        debug.battleScenario({
          withTrick: false,
          hpBySeat: number === 20 ? [100, 0, 100, 0] : [100, 100, 100, 100],
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          enemyDamageToParty: 240
        });
        if (mode === 'immune') {
          debug.battleSetEffects({
            enemy: { statusImmunity: { key: 'statusImmunity', charges: 1, potency: 100 } },
            party: {},
            players: [{}, {}, {}, {}]
          });
        }
        debug.battleSetCombatRandom(0);
        return debug.battleResolveMajorEffect(0, number, {
          enemyAttackMissed: mode === 'miss'
        });
      };
      return Object.fromEntries(Object.entries(statusByNumber).map(([number, statusKey]) => {
        const hit = resolve(Number(number), 'hit');
        const miss = resolve(Number(number), 'miss');
        const immune = resolve(Number(number), 'immune');
        return [number, {
          statusKey,
          hit: hit.state.battle.effects.enemy[statusKey] || null,
          miss: miss.state.battle.effects.enemy[statusKey] || null,
          immune: immune.state.battle.effects.enemy[statusKey] || null,
          immuneBlocked: immune.result.results.some((entry) => (
            entry.statusKey === statusKey && entry.blocked === true
          ))
        }];
      }));
    });

    for (const entry of Object.values(audit)) {
      expect(entry.hit, entry.statusKey).toBeTruthy();
      expect(entry.miss, `${entry.statusKey} on miss`).toBeNull();
      expect(entry.immune, `${entry.statusKey} through immunity`).toBeNull();
      expect(entry.immuneBlocked, `${entry.statusKey} immunity result`).toBe(true);
    }
    expect(audit['16'].hit).toMatchObject({ guaranteedStop: true });
    expect(audit['13'].hit).toMatchObject({ darkDamageTakenUp: 20 });
  });

  test('Temperance target count, Judgment no-target failure, and Star/Devil max HP stacking are deterministic', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const combat = [0, 1, 2, 3].map(() => ({
        maxHp: 100,
        power: 30,
        defense: 20,
        intelligence: 30,
        speed: 20
      }));
      debug.battleScenario({ withTrick: false, hpBySeat: [40, 20, 60, 80], combatBySeat: combat });
      const temperance = debug.battleResolveMajorEffect(0, 14, { cardCount: 3 });

      debug.battleScenario({
        withTrick: false,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: combat,
        enemyHp: 1000,
        enemyMaxHp: 1000
      });
      const judgmentEnemyHpBefore = debug.battleState().battle.enemy.hp;
      const judgment = debug.battleResolveMajorEffect(0, 20);

      debug.battleScenario({ withTrick: false, hpBySeat: [80, 100, 100, 100], combatBySeat: combat });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          poison: { potency: 5, remainingAttackAttempts: 2 },
          powerDown: { potency: 25, remainingTurns: 2 },
          accuracyDown: { potency: 20, remainingTurns: 2 }
        }, {}, {}, {}]
      });
      const empress = debug.battleResolveMajorEffect(0, 3);

      debug.battleScenario({ withTrick: false, hpBySeat: [80, 100, 100, 100], combatBySeat: combat });
      const star = debug.battleResolveMajorEffect(0, 17);
      const devil = debug.battleResolveMajorEffect(0, 15);
      const firstClear = debug.battleAdvanceEffectTurn();
      const secondClear = debug.battleAdvanceEffectTurn();

      debug.battleScenario({ withTrick: false });
      debug.battleSetCombatRandom(0);
      const fortuneZero = debug.battleResolveMajorEffect(0, 10);
      const world = debug.battleResolveMajorEffect(0, 21);
      return {
        temperance,
        judgment,
        judgmentEnemyHpBefore,
        empress,
        star,
        devil,
        firstClear,
        secondClear,
        fortuneZero,
        world
      };
    });

    expect(audit.temperance.state.players.map((player) => player.hp)).toEqual([100, 100, 100, 80]);
    expect(audit.temperance.result.results.filter((entry) => entry.kind === 'major-heal')).toHaveLength(3);
    expect(audit.judgment.state.battle.enemy.hp).toBe(audit.judgmentEnemyHpBefore);
    expect(audit.judgment.result.results).toContainEqual(expect.objectContaining({
      kind: 'major-no-effect',
      success: false
    }));
    expect(audit.empress.state.battle.effects.players[0]).not.toHaveProperty('poison');
    expect(audit.empress.state.battle.effects.players[0]).not.toHaveProperty('powerDown');
    expect(audit.empress.state.battle.effects.players[0]).not.toHaveProperty('accuracyDown');
    expect(audit.empress.state.battle.effects.players[0].hpShield).toBeTruthy();
    expect(audit.star.state.players[0]).toMatchObject({ maxHp: 125, hp: 105 });
    expect(audit.devil.state.players[0]).toMatchObject({ maxHp: 62, hp: 62 });
    expect(audit.firstClear.state.players[0].maxHp).toBe(62);
    expect(audit.secondClear.state.players[0].maxHp).toBe(125);
    expect(audit.fortuneZero.state.battle.effects.party.partyCritical).toBeUndefined();
    expect(audit.fortuneZero.result.results).toContainEqual(expect.objectContaining({
      kind: 'major-no-effect',
      randomRoll: 0
    }));
    expect(audit.world.state.battle.pendingWorldTimeStop).toMatchObject({ remainingTurns: 2 });
    expect(audit.world.state.battle.effects.party.worldDamageUp).toBeUndefined();
  });
});
