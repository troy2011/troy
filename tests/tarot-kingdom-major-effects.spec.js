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
      expect(audit.resultCount, `major ${audit.number}`).toBeGreaterThan(0);
    }
    expect(audits[11].state.battle.enemy.hp).toBeLessThan(400);
    expect(audits[13].state.battle.enemy.hp).toBeLessThan(400);
    expect(audits[20].state.players.filter((player) => player.hp > 0)).toHaveLength(4);
    expect(audits[21].state.battle.pendingWorldTimeStop).toMatchObject({ remainingTurns: 2 });
    expect(audits[1].resultCount).toBe(4);
    expect(audits[3].state.battle.effects.players[0]).toMatchObject({
      regen: { remainingTurns: 3, potency: 10 },
      allStatsUp: { remainingTurns: 3, potency: 25 }
    });
    expect(audits[4].state.battle.effects.enemy).toMatchObject({
      attackDown: { remainingTurns: 2, potency: 35 },
      defenseDown: { remainingTurns: 2, potency: 35 },
      intimidate: { expiresOn: 'clear' }
    });
    expect(audits[5].state.battle.effects.party).toMatchObject({
      damageBarrier: { remainingTurns: 2, potency: 45 },
      debuffImmunity: { remainingTurns: 2, potency: 100 }
    });
    expect(audits[8].state.battle.effects.players[0].lastStand.remainingTurns).toBe(3);
    expect(audits[10].state.battle.effects.party.partyCritical.potency).toBe(100);
    expect(audits[15].state.players[0]).toMatchObject({ maxHp: 60, hp: 60 });
    expect(audits[18].state.battle.effects.enemy).toMatchObject({
      majorConfusion: { remainingTurns: 2, potency: 50 },
      mirageBlind: { remainingTurns: 2, potency: 70 }
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

    expect(audit.chariotSecondaryDamage).toBe(56);
    expect(audit.chariotBuff).toMatchObject({
      potency: 30,
      evasionPenalty: 0.15,
      remainingTurns: 1
    });
    expect(audit.roleType).toBe('skill');
    expect(audit.chariotDamage).toBeLessThan(audit.roleDamage);
  });

  test('elemental combo reports only hit-time weakness and resistance reactions', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleSetDemoEnemy('ismartal-vol1-monster-09');
      debug.battleScenario({ withTrick: true, enemyHp: 500, enemyMaxHp: 500, enemyDefense: 0 });
      debug.battleSetCombatRandom(0.1);
      return debug.battleResolveMajorEffect(0, 1);
    });

    const hits = audit.result.results.filter((entry) => entry.kind === 'major-damage');
    expect(hits).toHaveLength(4);
    expect(hits.find((entry) => entry.element === 'water')).toMatchObject({
      affinityReaction: 'weak',
      affinityMultiplier: 1.3
    });
    expect(hits.find((entry) => entry.element === 'fire')).toMatchObject({
      affinityReaction: 'resist',
      affinityMultiplier: 0.8
    });
  });

  test('turn effects tick on field clear and World starts after its own forced clear', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: true, hpBySeat: [60, 60, 60, 60] });
      const empress = debug.battleResolveMajorEffect(0, 3);
      const firstClear = debug.battleClearTrick(0);
      const firstRegen = firstClear.battle.effects.players[0].regen;

      debug.battleScenario({
        withTrick: false,
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
    expect(audit.criticalSecondClear.battle.effects.enemy.enemyCritical.remainingTurns).toBe(2);
    expect(audit.criticalBacklashFirstClear.battle.effects.enemy.enemyCritical.remainingTurns).toBe(1);
    expect(audit.criticalBacklashSecondClear.battle.effects.enemy.enemyCritical).toBeUndefined();
    expect(audit.pact.state.players[0]).toMatchObject({ maxHp: 60, hp: 60 });
    expect(audit.pactExpired.players[0]).toMatchObject({ maxHp: 120, hp: 60 });
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
    await expect(row.locator(':scope > .tarot-kingdom-heal-number.is-regen.is-show')).toHaveText('+12');
    await expect(row).toHaveClass(/has-regen/);
  });

  test('skill name and every elemental reaction stay inside the battle stage at 390px and 900px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await page.evaluate(() => {
        const debug = window.TarotKingdomDebug;
        debug.battleSetDemoEnemy('ismartal-vol1-monster-09');
        debug.battleScenario({
          withTrick: false,
          enemyHp: 500,
          enemyMaxHp: 500,
          handsBySeat: [[
            { id: 'major-magician', kind: 'major', suit: 'None', number: 1 },
            { id: 'reserve-4', kind: 'minor', suit: 'Wand', number: 4 }
          ]]
        });
        debug.battlePlayCards(0, ['major-magician'], { resolve: false });
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
      expect(layout.bannerText).toBe('エレメンタルコンボ');
      expect(layout.bannerIsMajor).toBe(true);
      expect(layout.bannerInside).toBe(true);
      expect(layout.visualInside).toBe(true);
      expect(layout.visualTone).toBe('elemental');
      expect(layout.visualScope).toBe('enemy');
      expect(layout.visualPartCount).toBe(5);
      expect(layout.badges.some((text) => text.includes('WEAK'))).toBe(true);
      expect(layout.badges.some((text) => text.includes('RESIST'))).toBe(true);
      expect(layout.badgesInside).toBe(true);
    }
  });

  test('schema 10 disables major effects, schema 14 keeps single-card effects, and schema 15 amplifies sets', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const current = debug.battleScenario({ withTrick: false });
      const payload = debug.battlePublicState();
      const schema14Payload = JSON.parse(JSON.stringify(payload));
      schema14Payload.schema = 14;
      schema14Payload.state.rules.majorBattleEffectsVersion = 2;
      const schema14 = debug.battleDeserialize(schema14Payload);
      const legacyPayload = JSON.parse(JSON.stringify(payload));
      legacyPayload.schema = 10;
      delete legacyPayload.state.rules.majorBattleEffectsVersion;
      delete legacyPayload.state.rules.elementAffinityVersion;
      const legacy = debug.battleDeserialize(legacyPayload);
      return { current, schema14, legacy };
    });

    expect(audit.current.rules).toMatchObject({
      majorBattleEffectsVersion: 2,
      elementAffinityVersion: 1
    });
    expect(audit.schema14.rules.majorBattleEffectsVersion).toBe(1);
    expect(audit.legacy.rules).toMatchObject({
      majorBattleEffectsVersion: 0,
      elementAffinityVersion: 0
    });
  });

  test('same-number pairs and triples amplify the included major while legacy rules do not', async ({ page }) => {
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
        return debug.battleResolveMajorEffect(0, 1, { cardCount }).result;
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
          { id: 'major-magician-pair', kind: 'major', suit: 'Wand', number: 1 },
          { id: 'minor-ace-pair', kind: 'minor', suit: 'Cup', number: 1 },
          { id: 'pair-reserve', kind: 'minor', suit: 'Sword', number: 6 }
        ]]
      });
      const pairState = debug.battlePlayCards(
        0,
        ['major-magician-pair', 'minor-ace-pair'],
        { resolve: false }
      ).state;
      const pairEvent = pairState.battle.events.at(-1);
      return { single, pair, triple, legacyPair, pairEvent };
    });

    const sumDamage = (entry) => (entry?.results || [])
      .filter((result) => result.kind === 'major-damage')
      .reduce((total, result) => total + Number(result.amount || 0), 0);
    const singleDamage = sumDamage(audit.single);
    const pairDamage = sumDamage(audit.pair);
    const tripleDamage = sumDamage(audit.triple);

    expect(audit.single).toMatchObject({ number: 1, cardCount: 1, strengthMultiplier: 1 });
    expect(audit.pair).toMatchObject({ number: 1, cardCount: 2, strengthMultiplier: 1.5 });
    expect(audit.triple).toMatchObject({ number: 1, cardCount: 3, strengthMultiplier: 2 });
    expect(pairDamage).toBeGreaterThan(singleDamage);
    expect(tripleDamage).toBeGreaterThan(pairDamage);
    expect(pairDamage / singleDamage).toBeGreaterThanOrEqual(1.45);
    expect(pairDamage / singleDamage).toBeLessThanOrEqual(1.6);
    expect(tripleDamage / singleDamage).toBeGreaterThanOrEqual(1.9);
    expect(tripleDamage / singleDamage).toBeLessThanOrEqual(2.1);
    expect(audit.legacyPair).toBeNull();
    expect(audit.pairEvent).toMatchObject({
      majorSkillName: 'エレメンタルコンボ',
      majorCardCount: 2,
      majorStrengthMultiplier: 1.5
    });
    expect(audit.pairEvent.effects.filter((result) => result.kind === 'major-damage')).toHaveLength(4);
  });
});
