const { test, expect } = require('@playwright/test');

async function openBattleDebug(page) {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=battle-flow', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
}

const zeroDefenseParty = Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 }));

test.describe('Tarot Kingdom character battle flow', () => {
  test.beforeEach(async ({ page }) => {
    await openBattleDebug(page);
  });

  test('normal pass causes one counter and the final pass area attack spares the player who clears the field', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const normal = debug.battlePass(1);

      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        pass: [false, false, true, true],
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const finalPass = debug.battlePass(1);
      return { normal, finalPass };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.normal.battle.events.map((event) => event.type)).toEqual(['enemy-single']);
    expect(audit.normal.players.map((player) => player.hp)).toEqual([100, 73, 100, 100]);
    expect(audit.normal.transition).toMatchObject({ kind: 'enemyResponse', eventSeqs: [1] });

    expect(audit.finalPass.battle.events.map((event) => event.type)).toEqual(['enemy-single', 'enemy-area']);
    expect(audit.finalPass.players.map((player) => player.hp)).toEqual([100, 60, 87, 87]);
    expect(audit.finalPass.battle.events[1]).toMatchObject({
      targetIndexes: [1, 2, 3],
      protectedPlayerIndex: 0
    });
    expect(audit.finalPass.transition).toMatchObject({ kind: 'enemyResponse', eventSeqs: [1, 2] });
  });

  test('the untouched opening field card prevents monster attacks until a player submits a card', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const realOpening = debug.battleSetupHandWithOpening(20);
      debug.battleScenario({
        openingField: true,
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const openingPasses = [
        debug.battlePass(1),
        debug.battlePass(2),
        debug.battlePass(3)
      ];

      const responseCard = { id: 'opening-response-3', kind: 'minor', suit: 'Wand', number: 3 };
      debug.battleScenario({
        openingField: true,
        turnIndex: 1,
        leaderIndex: 0,
        tableCard: { id: 'opening-field-2', kind: 'minor', suit: 'Wand', number: 2 },
        handsBySeat: [[], [
          responseCard,
          { id: 'opening-response-keep', kind: 'minor', suit: 'Cup', number: 4 }
        ]],
        hpBySeat: [100, 100, 100, 100],
        enemyDefense: 10000,
        combatBySeat
      });
      const afterPlay = debug.battlePlayCards(1, [responseCard.id], { resolve: true }).state;
      const afterNormalPass = debug.battlePass(2);
      return { realOpening, openingPasses, afterPlay, afterNormalPass };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.realOpening.openingFieldAttackProtection).toBe(true);
    expect(audit.realOpening.trick?.cardsTable).toHaveLength(1);
    const afterOpeningClear = audit.openingPasses.at(-1);
    expect(afterOpeningClear.trick).toBeNull();
    expect(afterOpeningClear.openingFieldAttackProtection).toBe(false);
    expect(afterOpeningClear.players.map((player) => player.hp)).toEqual([100, 100, 100, 100]);
    expect(afterOpeningClear.battle.events.filter((event) => event.type.startsWith('enemy-'))).toEqual([]);
    expect(audit.afterPlay.openingFieldAttackProtection).toBe(false);
    expect(audit.afterNormalPass.battle.events.filter((event) => event.type === 'enemy-single')).toHaveLength(1);
    expect(audit.afterNormalPass.players[2].hp).toBe(73);
  });

  test('equal values require the directed winning-suit cycle', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const validateReply = (fieldSuit, replySuit, suffix) => {
        const fieldCard = { id: `suit-field-${suffix}`, kind: 'minor', suit: fieldSuit, number: 7 };
        const replyCard = { id: `suit-reply-${suffix}`, kind: 'minor', suit: replySuit, number: 7 };
        debug.battleScenario({
          turnIndex: 0,
          leaderIndex: 1,
          tableCard: fieldCard,
          handsBySeat: [[replyCard]]
        });
        return debug.battleRebuildAction(0, { selectedCardIds: [replyCard.id] });
      };
      return {
        cupOverWand: validateReply('Wand', 'Cup', 'cup-over-wand'),
        swordOverCup: validateReply('Cup', 'Sword', 'sword-over-cup'),
        pentacleOverSword: validateReply('Sword', 'Pentacle', 'pentacle-over-sword'),
        wandOverPentacle: validateReply('Pentacle', 'Wand', 'wand-over-pentacle'),
        wandUnderCup: validateReply('Cup', 'Wand', 'wand-under-cup'),
        sameSuit: validateReply('Wand', 'Wand', 'same-suit'),
        skippingSuit: validateReply('Wand', 'Sword', 'skipping-suit')
      };
    });

    expect(audit.cupOverWand.ok).toBe(true);
    expect(audit.swordOverCup.ok).toBe(true);
    expect(audit.pentacleOverSword.ok).toBe(true);
    expect(audit.wandOverPentacle.ok).toBe(true);
    for (const result of [audit.wandUnderCup, audit.sameSuit, audit.skippingSuit]) {
      expect(result).toMatchObject({ ok: false });
      expect(result.reason).toContain('勝ちスート');
    }
  });

  test('stage 1 unlocks five-card roles in 1-3 and calls in 1-4 for humans and NPCs', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const tutorialMonsters = debug.battleDemoEnemies()
        .filter((monster) => monster.isBoss !== true)
        .slice(0, 4);
      const straight = (prefix) => [2, 3, 4, 5, 6].map((number) => ({
        id: `${prefix}-${number}`,
        kind: 'minor',
        suit: 'Wand',
        number
      }));
      const stage = {
        stageNo: 1,
        stageId: 'tarot_stage_1',
        stageName: 'はじまりの島',
        monsters: tutorialMonsters.map((monster, index) => ({
          monsterId: monster.id,
          monsterName: monster.name,
          threatLevel: index + 1,
          archetype: 'balanced'
        }))
      };
      const validateRole = (lesson) => {
        const cards = straight(`lesson-${lesson}-role`);
        debug.battleScenario({
          tutorialEnabled: true,
          stage,
          handNo: lesson - 1,
          withTrick: false,
          handsBySeat: [cards]
        });
        return debug.battleRebuildAction(0, {
          selectedCardIds: cards.map((card) => card.id)
        });
      };
      const validateCall = (lesson) => {
        const cards = straight(`lesson-${lesson}-call`);
        debug.battleScenario({
          tutorialEnabled: true,
          stage,
          handNo: lesson - 1,
          tableCard: cards[0],
          handsBySeat: [cards.slice(1)]
        });
        return debug.battleRebuildAction(0, {
          selectedCardIds: cards.slice(1).map((card) => card.id)
        });
      };

      const npcCards = straight('lesson-1-npc');
      debug.battleScenario({
        tutorialEnabled: true,
        stage,
        handNo: 0,
        withTrick: false,
        turnIndex: 1,
        enableNpcSeats: true,
        handsBySeat: [[], npcCards]
      });
      const npcDecision = debug.battleNpcDecision(1, 0.5);

      const regularCards = straight('stage-1-regular');
      debug.battleScenario({
        tutorialEnabled: false,
        stage,
        handNo: 0,
        withTrick: false,
        handsBySeat: [regularCards]
      });
      const regularStageOneRole = debug.battleRebuildAction(0, {
        selectedCardIds: regularCards.map((card) => card.id)
      });

      return {
        role1: validateRole(1),
        role2: validateRole(2),
        role3: validateRole(3),
        call1: validateCall(1),
        call3: validateCall(3),
        call4: validateCall(4),
        npcDecision,
        regularStageOneRole
      };
    });

    expect(audit.role1).toMatchObject({ ok: false, reason: '5枚役は1-3で解禁されます。' });
    expect(audit.role2).toMatchObject({ ok: false, reason: '5枚役は1-3で解禁されます。' });
    expect(audit.role3.ok).toBe(true);
    expect(audit.call1).toMatchObject({ ok: false, reason: 'コールは1-4で解禁されます。' });
    expect(audit.call3).toMatchObject({ ok: false, reason: 'コールは1-4で解禁されます。' });
    expect(audit.call4.ok).toBe(true);
    expect(audit.npcDecision.action).toBe('play');
    expect(audit.npcDecision.play.type).toBe('set');
    expect(audit.regularStageOneRole).toMatchObject({ ok: true, play: { type: 'role' } });
  });

  test('passing or folding against a five-card role avoids counters but keeps the all-pass area attack', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const cards = [2, 3, 4, 5, 6, 9].map((number, index) => ({
        id: `role-${index}`,
        kind: 'minor',
        suit: 'Wand',
        number
      }));
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [cards],
        hpBySeat: [100, 100, 100, 100],
        enemyDefense: 10000,
        combatBySeat
      });
      debug.battlePlayCards(0, cards.slice(0, 5).map((card) => card.id), { resolve: true });
      const passes = [
        debug.battlePass(1, { foldMode: 'fold-start' }),
        debug.battlePass(2),
        debug.battlePass(3)
      ];
      return { passes, final: debug.battleState() };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.final.trick).toBeNull();
    expect(audit.final.players.map((player) => player.hp)).toEqual([100, 88, 87, 87]);
    expect(audit.final.battle.events.filter((event) => event.type === 'enemy-single')).toEqual([]);
    expect(audit.final.battle.events.filter((event) => event.type === 'enemy-area')).toHaveLength(1);
    expect(audit.final.battle.events.find((event) => event.type === 'enemy-area')?.defendingPlayerIndexes)
      .toEqual([1]);
    expect(audit.final.battle.events.find((event) => event.type === 'enemy-area')?.damages)
      .toContainEqual(expect.objectContaining({
        playerIndex: 1,
        damage: 12,
        effects: expect.arrayContaining([{
          kind: 'defense',
          potency: 8,
          source: 'shield'
        }])
      }));
  });

  test('successive five-card roles build a capped chain and clearing the field resets it', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const minor = (id, suit, number) => ({ id, kind: 'minor', suit, number });
      const handsBySeat = [
        [
          minor('chain-straight-2', 'Wand', 2),
          minor('chain-straight-3', 'Cup', 3),
          minor('chain-straight-4', 'Sword', 4),
          minor('chain-straight-5', 'Pentacle', 5),
          minor('chain-straight-6', 'Wand', 6),
          minor('chain-straight-keep', 'Cup', 14)
        ],
        [
          minor('chain-flush-2', 'Cup', 2),
          minor('chain-flush-4', 'Cup', 4),
          minor('chain-flush-6', 'Cup', 6),
          minor('chain-flush-8', 'Cup', 8),
          minor('chain-flush-10', 'Cup', 10),
          minor('chain-flush-keep', 'Wand', 14)
        ],
        [
          minor('chain-house-7a', 'Wand', 7),
          minor('chain-house-7b', 'Cup', 7),
          minor('chain-house-7c', 'Sword', 7),
          minor('chain-house-9a', 'Wand', 9),
          minor('chain-house-9b', 'Cup', 9),
          minor('chain-house-keep', 'Pentacle', 14)
        ],
        [
          minor('chain-four-10a', 'Wand', 10),
          minor('chain-four-10b', 'Cup', 10),
          minor('chain-four-10c', 'Sword', 10),
          minor('chain-four-10d', 'Pentacle', 10),
          minor('chain-four-kicker', 'Wand', 3),
          minor('chain-four-keep', 'Sword', 14)
        ]
      ];
      debug.battleScenario({
        withTrick: false,
        handsBySeat,
        rules: { enemyDefeatMode: 'hand-empty' },
        enemyDefense: 0
      });
      const played = handsBySeat.map((hand, playerIndex) => {
        const result = debug.battlePlayCards(
          playerIndex,
          hand.slice(0, 5).map((card) => card.id),
          { resolve: true }
        );
        const state = result.state;
        return {
          ok: result.ok,
          roleKey: state.trick?.role?.key || '',
          chain: state.trick?.roleChain || null,
          eventChain: state.battle.events.at(-1)?.roleChain || null,
          transitionChain: state.transition?.roleChain || null
        };
      });
      const published = debug.battlePublicState();
      const sampleRole = JSON.parse(JSON.stringify(played[0] && debug.battleState().lastPlay));
      const cleared = debug.battleClearTrick(3);
      const legacyPayload = JSON.parse(JSON.stringify(published));
      legacyPayload.schema = 16;
      const legacy = debug.battleDeserialize(legacyPayload);

      debug.battleScenario({
        withTrick: false,
        rules: { enemyDefeatMode: 'hand-empty' },
        enemyDefense: 0
      });
      const roleDamage = [1, 2, 3, 4].map((count) => debug.battleDamageForPlay(0, {
        ...sampleRole,
        roleChain: { count, multiplier: debug.battleRoleChainMultiplier(count) }
      }));

      const callLead = minor('chain-call-lead', 'Cup', 2);
      const callHand = [4, 6, 8, 10].map((number) => minor(`chain-call-${number}`, 'Cup', number));
      callHand.push(minor('chain-call-keep', 'Wand', 14));
      const answerHand = [
        minor('chain-call-answer-7a', 'Wand', 7),
        minor('chain-call-answer-7b', 'Cup', 7),
        minor('chain-call-answer-7c', 'Sword', 7),
        minor('chain-call-answer-9a', 'Wand', 9),
        minor('chain-call-answer-9b', 'Cup', 9),
        minor('chain-call-answer-keep', 'Pentacle', 14)
      ];
      debug.battleScenario({
        tableCard: callLead,
        handsBySeat: [callHand, answerHand],
        rules: { enemyDefeatMode: 'hand-empty' }
      });
      const callStart = debug.battlePlayCards(
        0,
        callHand.slice(0, 4).map((card) => card.id),
        { resolve: true }
      );
      const callAnswer = debug.battlePlayCards(
        1,
        answerHand.slice(0, 5).map((card) => card.id),
        { resolve: true }
      );
      return {
        played,
        multipliers: [1, 2, 3, 4, 5].map((count) => debug.battleRoleChainMultiplier(count)),
        roleDamage,
        published,
        cleared,
        legacy,
        callStart: callStart.state.lastPlay,
        callAnswer: callAnswer.state.lastPlay
      };
    });

    expect(audit.played.map((entry) => entry.ok)).toEqual([true, true, true, true]);
    expect(audit.played.map((entry) => entry.roleKey)).toEqual([
      'Straight',
      'Flush',
      'FullHouse',
      'FourKind'
    ]);
    expect(audit.played.map((entry) => entry.chain)).toEqual([
      { count: 1, multiplier: 1 },
      { count: 2, multiplier: 1.25 },
      { count: 3, multiplier: 1.5 },
      { count: 4, multiplier: 1.75 }
    ]);
    expect(audit.played.map((entry) => entry.eventChain)).toEqual(
      audit.played.map((entry) => entry.chain)
    );
    expect(audit.multipliers).toEqual([1, 1.25, 1.5, 1.75, 1.75]);
    const baseDamage = audit.roleDamage[0].baseDamage;
    audit.roleDamage.forEach((entry, index) => {
      expect(Math.abs(entry.baseDamage - (baseDamage * audit.multipliers[index]))).toBeLessThanOrEqual(1);
    });
    expect(audit.published.schema).toBe(30);
    expect(audit.published.state.rules.roleChainVersion).toBe(1);
    expect(audit.published.state.trick.roleChain).toEqual({ count: 4, multiplier: 1.75 });
    expect(audit.cleared.trick).toBeNull();
    expect(audit.cleared.lastPlay).toBeNull();
    expect(audit.legacy.rules.roleChainVersion).toBe(0);
    expect(audit.legacy.trick.roleChain).toBeUndefined();
    expect(audit.callStart).toMatchObject({
      type: 'role',
      call: true,
      roleChain: { count: 1, multiplier: 1 }
    });
    expect(audit.callAnswer).toMatchObject({
      type: 'role',
      call: false,
      roleChain: { count: 2, multiplier: 1.25 }
    });
  });

  test('a minor Ace is distinct from numeric one outside a straight', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const magician = { id: 'magician-pair-major', kind: 'major', suit: 'Wand', number: 1 };
      const cupAce = { id: 'magician-pair-cup-ace', kind: 'minor', suit: 'Cup', number: 1 };
      const swordAce = { id: 'magician-pair-sword-ace', kind: 'minor', suit: 'Sword', number: 1 };
      const reserve = { id: 'magician-pair-reserve', kind: 'minor', suit: 'Wand', number: 6 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[magician, cupAce, swordAce, reserve]]
      });
      const pair = debug.battleRebuildAction(0, {
        selectedCardIds: [magician.id, cupAce.id]
      });
      const reversedPair = debug.battleRebuildAction(0, {
        selectedCardIds: [swordAce.id, magician.id]
      });
      const minorPair = debug.battleRebuildAction(0, {
        selectedCardIds: [cupAce.id, swordAce.id]
      });
      const triple = debug.battleRebuildAction(0, {
        selectedCardIds: [magician.id, cupAce.id, swordAce.id]
      });
      const played = debug.battlePlayCards(0, [magician.id, cupAce.id], { resolve: false });
      const lowStraightCards = [
        { id: 'ace-low-straight-a', kind: 'minor', suit: 'Wand', number: 1 },
        { id: 'ace-low-straight-2', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'ace-low-straight-3', kind: 'minor', suit: 'Sword', number: 3 },
        { id: 'ace-low-straight-4', kind: 'minor', suit: 'Pentacle', number: 4 },
        { id: 'ace-low-straight-5', kind: 'minor', suit: 'Wand', number: 5 }
      ];
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [lowStraightCards]
      });
      const lowStraight = debug.battleRebuildAction(0, {
        selectedCardIds: lowStraightCards.map((card) => card.id)
      });
      return { pair, reversedPair, minorPair, triple, played, lowStraight };
    });

    expect(audit.pair).toEqual({ ok: false, reason: 'Aはストレート以外で数字1として扱いません。' });
    expect(audit.reversedPair).toEqual(audit.pair);
    expect(audit.minorPair).toMatchObject({
      ok: true,
      play: { type: 'set', count: 2, number: 1, setPower: 15 }
    });
    expect(audit.triple).toEqual(audit.pair);
    expect(audit.played).toMatchObject({
      ok: false,
      reason: 'Aはストレート以外で数字1として扱いません。'
    });
    expect(audit.played.state.players[0].hand).toHaveLength(4);
    expect(audit.lowStraight).toMatchObject({
      ok: true,
      play: { type: 'role', role: { key: 'Straight', primary: [5] } }
    });
  });

  test('fold and every later automatic fold receive shield-mitigated counters', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const responseCard = { id: 'fold-response', kind: 'minor', suit: 'Wand', number: 2 };
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        tableCard: { id: 'fold-field', kind: 'minor', suit: 'Wand', number: 1 },
        handsBySeat: [[], [], [responseCard], []],
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const first = debug.battlePass(1, { foldMode: 'fold-start' });
      debug.battleResolveTransition();
      debug.battlePlayCards(2, [responseCard.id], { resolve: true });
      const continued = debug.battlePass(1, { foldMode: 'fold-auto' });
      return { first, continued };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.first.fold[1]).toBe(true);
    expect(audit.first.battle.events.filter((event) => event.type === 'enemy-single')).toHaveLength(1);
    expect(audit.first.players[1].hp).toBe(75);
    expect(audit.continued.fold[1]).toBe(true);
    expect(audit.continued.battle.events.filter((event) => event.type === 'enemy-single')).toHaveLength(2);
    expect(audit.continued.players[1].hp).toBe(50);
  });

  test('defense adds equipped shield Defense and gives shieldless characters the minimum bonus', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const run = (playerIndex, foldMode) => {
        debug.battleScenario({
          turnIndex: playerIndex,
          leaderIndex: playerIndex === 0 ? 1 : 0,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat
        });
        return debug.battlePass(playerIndex, { foldMode });
      };
      return {
        shield: run(0, 'fold-start'),
        shieldless: run(2, 'fold-start'),
        normalPass: run(2, '')
      };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.shield.players[0].hp).toBe(76);
    expect(audit.shield.battle.events[0].effects).toContainEqual({
      kind: 'defense',
      potency: 10,
      source: 'shield'
    });
    expect(audit.shieldless.players[2].hp).toBe(75);
    expect(audit.shieldless.battle.events[0].effects).toContainEqual({
      kind: 'defense',
      potency: 8,
      source: 'minimum'
    });
    expect(audit.normalPass.players[2].hp).toBe(73);
    expect(audit.normalPass.battle.events[0].effects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'defense' })])
    );
  });

  test('guard defense profile falls back to 8 for missing, invalid, and shieldless equipment', async ({ page }) => {
    const profiles = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const profile = (customData, weaponTypes = ['sword', 'shield']) => (
        debug.battleGuardDefenseProfile({
          equipment: { RightHand: 'sword_01', LeftHand: 'shield_test' },
          itemSource: {
            shield_test: { itemId: 'shield_test', customData }
          },
          combat: { weaponType: 'sword', weaponTypes }
        })
      );
      return {
        valid: profile({ Category: 'Shield', Defense: 24 }),
        missing: profile({ Category: 'Shield' }),
        invalid: profile({ Category: 'Shield', Defense: 'invalid' }),
        shieldless: debug.battleGuardDefenseProfile({
          equipment: { RightHand: 'sword_01' },
          itemSource: {},
          combat: { weaponType: 'sword', weaponTypes: ['sword'] }
        })
      };
    });

    expect(profiles).toEqual({
      valid: { hasShield: true, shieldHand: 'left', bonus: 24, source: 'shield' },
      missing: { hasShield: true, shieldHand: 'left', bonus: 8, source: 'shield' },
      invalid: { hasShield: true, shieldHand: 'left', bonus: 8, source: 'shield' },
      shieldless: { hasShield: false, shieldHand: '', bonus: 8, source: 'minimum' }
    });
  });

  test('NPC passes on the first unavailable response and only defends after waiting when the field can continue', async ({ page }) => {
    const decisions = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const scenario = (options = {}) => {
        debug.battleScenario({
          enableNpcSeats: true,
          turnIndex: 1,
          leaderIndex: 0,
          tableCard: { id: 'npc-defense-field', kind: 'minor', suit: 'Wand', number: 14 },
          handsBySeat: [
            [],
            [{ id: 'npc-defense-low', kind: 'minor', suit: 'Cup', number: 2 }],
            [
              { id: 'npc-defense-seat2-a', kind: 'minor', suit: 'Sword', number: 2 },
              { id: 'npc-defense-seat2-b', kind: 'minor', suit: 'Sword', number: 4 }
            ],
            [
              { id: 'npc-defense-seat3-a', kind: 'minor', suit: 'Pentacle', number: 2 },
              { id: 'npc-defense-seat3-b', kind: 'minor', suit: 'Pentacle', number: 4 }
            ]
          ],
          ...options
        });
        return debug.battleNpcDecision(1, 0.5);
      };
      return {
        firstUnavailable: scenario(),
        waitedAndContinuing: scenario({ npcPassCounts: [0, 1, 0, 0] }),
        waitedButClearing: scenario({
          npcPassCounts: [0, 1, 0, 0],
          pass: [false, false, true, true]
        })
      };
    });

    expect(decisions.firstUnavailable.action).toBe('pass');
    expect(decisions.waitedAndContinuing.action).toBe('defend');
    expect(decisions.waitedButClearing.action).toBe('pass');
  });

  test('11 back reopens NPC defense and resets its same-field pass memory', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const reverseCard = { id: 'npc-defense-reverse', kind: 'minor', suit: 'Wand', number: 11 };
      const reverseReserve = { id: 'npc-defense-reverse-reserve', kind: 'minor', suit: 'Cup', number: 4 };
      debug.battleScenario({
        enableNpcSeats: true,
        turnIndex: 2,
        leaderIndex: 0,
        tableCard: { id: 'npc-defense-reverse-field', kind: 'minor', suit: 'Wand', number: 3 },
        handsBySeat: [
          [],
          [{ id: 'npc-defense-reserve', kind: 'minor', suit: 'Cup', number: 7 }],
          [reverseCard, reverseReserve],
          [{ id: 'npc-defense-reverse-seat3', kind: 'minor', suit: 'Pentacle', number: 6 }]
        ],
        fold: [false, true, false, false],
        npcPassCounts: [0, 2, 0, 0]
      });
      const before = debug.battleState();
      const played = debug.battlePlayCards(2, [reverseCard.id], { resolve: true });
      return { before, played };
    });

    expect(audit.before.fold[1]).toBe(true);
    expect(audit.before.npcPassCounts[1]).toBe(2);
    expect(audit.played.ok).toBe(true);
    expect(audit.played.state.reverse).toBe(true);
    expect(audit.played.state.fold).toEqual([false, false, false, false]);
    expect(audit.played.state.npcPassCounts).toEqual([0, 0, 0, 0]);
  });

  test('enemy defense reduces player damage without changing card play', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = (id) => ({ id, kind: 'minor', suit: 'Cup', number: 4 });
      const scenario = (enemyDefense) => {
        debug.battleScenario({
          withTrick: false,
          enemyHp: 400,
          enemyDefense,
          handsBySeat: [[card(`attack-${enemyDefense}`), card(`reserve-${enemyDefense}`)]],
          rules: {
            initialHandSize: 8,
            handLimit: 8,
            combatEffectsVersion: 0,
            summonVersion: 0,
            enemyCombatVersion: 1
          }
        });
        return debug.battlePlayOne(0, { resolve: false });
      };
      return { open: scenario(0), armored: scenario(100) };
    });

    const openEvent = audit.open.battle.events.at(-1);
    const armoredEvent = audit.armored.battle.events.at(-1);
    expect(openEvent.damage).toBeGreaterThan(armoredEvent.damage);
    expect(armoredEvent.damage).toBe(Math.floor(openEvent.damage / 2));
    expect(audit.armored.players[0].hand).toHaveLength(1);
    expect(audit.armored.trick.cardsTable[0].id).toBe('attack-100');
  });

  test('overkill keeps enemy HP at zero but displays the full resolved damage', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const attackCard = { id: 'overkill-attack', kind: 'minor', suit: 'Sword', number: 14 };
      const reserveCard = { id: 'overkill-reserve', kind: 'minor', suit: 'Cup', number: 2 };
      debug.battleScenario({
        withTrick: false,
        enemyHp: 5,
        enemyDefense: 0,
        handsBySeat: [[attackCard, reserveCard]],
        rules: {
          initialHandSize: 8,
          handLimit: 8,
          combatEffectsVersion: 0,
          summonVersion: 0,
          enemyCombatVersion: 1
        }
      });
      const state = debug.battlePlayOne(0, { resolve: false });
      return {
        enemyHp: state.battle.enemy.hp,
        event: state.battle.events.at(-1)
      };
    });

    expect(audit.enemyHp).toBe(0);
    expect(audit.event.damage).toBe(5);
    expect(audit.event.displayDamage).toBeGreaterThan(audit.event.damage);
    await expect(page.locator('.tarot-kingdom-damage-number')).toHaveText(
      String(audit.event.displayDamage),
      { timeout: 3000 }
    );
  });

  test('speed difference controls player accuracy and enemy evasion without changing turn order', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = (id) => ({ id, kind: 'minor', suit: 'Cup', number: 4 });
      const playerAttack = (playerSpeed, enemySpeed, suffix) => {
        debug.battleScenario({
          withTrick: false,
          enemyHp: 400,
          enemyDefense: 0,
          enemySpeed,
          handsBySeat: [[card(`speed-${suffix}`), card(`reserve-${suffix}`)]],
          combatBySeat: [{ speed: playerSpeed }]
        });
        debug.battleSetCombatRandom(0.97);
        return debug.battlePlayOne(0, { resolve: false });
      };
      const enemyAttack = (enemySpeed, playerSpeed) => {
        debug.battleScenario({
          turnIndex: 1,
          leaderIndex: 0,
          hpBySeat: [100, 100, 100, 100],
          enemySpeed,
          combatBySeat: [
            { maxHp: 100, defense: 0, speed: 24 },
            { maxHp: 100, defense: 0, speed: playerSpeed },
            { maxHp: 100, defense: 0, speed: 24 },
            { maxHp: 100, defense: 0, speed: 24 }
          ]
        });
        debug.battleSetCombatRandom(0.7);
        return debug.battlePass(1);
      };
      return {
        fastPlayer: playerAttack(200, 0, 'fast'),
        slowPlayer: playerAttack(0, 200, 'slow'),
        fastDefender: enemyAttack(0, 200),
        slowDefender: enemyAttack(200, 0)
      };
    });

    expect(audit.fastPlayer.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      attackMissed: false,
      hitChance: 0.98,
      accuracyRoll: 0.97
    });
    expect(audit.fastPlayer.battle.events.at(-1).damage).toBeGreaterThan(0);
    expect(audit.slowPlayer.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      damage: 0,
      attackMissed: true,
      hitChance: 0.66,
      accuracyRoll: 0.97
    });
    expect(audit.slowPlayer.players[0].hand).toHaveLength(1);
    expect(audit.slowPlayer.trick.cardsTable[0].id).toBe('speed-slow');

    expect(audit.fastDefender.players[1].hp).toBe(100);
    expect(audit.fastDefender.battle.events.at(-1).damages[0]).toMatchObject({
      damage: 0,
      missed: true,
      hitChance: 0.66,
      accuracyRoll: 0.7
    });
    expect(audit.slowDefender.players[1].hp).toBe(73);
    expect(audit.slowDefender.battle.events.at(-1).damages[0]).toMatchObject({
      missed: false,
      hitChance: 0.98,
      accuracyRoll: 0.7
    });
  });

  test('demo enemy selection also switches stats and visual-role ability profile', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const before = debug.battleScenario();
      const switched = debug.battleSetDemoEnemy('ismartal-vol1-monster-03');
      return { before, switched };
    });

    expect(audit.switched.ok).toBe(true);
    expect(audit.switched.state.battle.enemy).toMatchObject({
      id: 'ismartal-vol1-monster-03',
      name: 'ボーンテイル',
      maxHp: 268,
      hp: 268,
      passDamage: 15,
      areaDamage: 7,
      defense: 4,
      speed: 14,
      ailment: {
        statusKey: 'curse',
        scope: 'both'
      },
      abilities: {
        attacks: {
          single: { ailment: { statusKey: 'curse' } },
          area: { ailment: { statusKey: 'curse' } }
        }
      }
    });
    expect(audit.switched.state.battle.enemy.maxHp).not.toBe(audit.before.battle.enemy.maxHp);
  });

  test('enemy ailments never block card submission and only change combat results', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = (id, number = 4) => ({ id, kind: 'minor', suit: 'Cup', number });
      const hands = (prefix) => [
        [card(`${prefix}-attack`), card(`${prefix}-reserve`, 6)],
        [card(`${prefix}-p1`)],
        [card(`${prefix}-p2`)],
        [card(`${prefix}-p3`)]
      ];

      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        withTrick: false,
        enemyHp: 400,
        enemyDefense: 0,
        handsBySeat: hands('paralysis')
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          paralysis: {
            key: 'paralysis',
            label: '攻撃不能',
            potency: 1,
            charges: 1,
            expiresOn: 'action'
          }
        }, {}, {}, {}]
      });
      const paralysis = debug.battlePlayOne(0, { resolve: false });

      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        withTrick: false,
        enemyHp: 400,
        enemyDefense: 0,
        handsBySeat: hands('blind')
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          blind: {
            key: 'blind',
            label: '暗闇',
            potency: 45,
            charges: 1,
            expiresOn: 'action'
          }
        }, {}, {}, {}]
      });
      debug.battleSetCombatRandom(0.99);
      const blind = debug.battlePlayOne(0, { resolve: false });

      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        withTrick: false,
        enemyHp: 400,
        enemyDefense: 0,
        hpBySeat: [100, 100, 100, 100],
        handsBySeat: hands('poison')
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          poison: {
            key: 'poison',
            label: '毒',
            potency: 5,
            charges: 2,
            expiresOn: 'action'
          }
        }, {}, {}, {}]
      });
      const poison = debug.battlePlayOne(0, { resolve: false });

      return { paralysis, blind, poison };
    });

    for (const state of [audit.paralysis, audit.blind, audit.poison]) {
      expect(state.players[0].hand).toHaveLength(1);
      expect(state.trick.cardsTable).toHaveLength(1);
    }
    expect(audit.paralysis.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      damage: 0,
      attackBlocked: true,
      attackMissed: false
    });
    expect(audit.paralysis.battle.effects.players[0].paralysis).toBeUndefined();
    expect(audit.blind.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      damage: 0,
      attackBlocked: true,
      attackMissed: true
    });
    expect(audit.blind.battle.effects.players[0].blind).toBeUndefined();
    expect(audit.poison.battle.events.at(-1).damage).toBeGreaterThan(0);
    expect(audit.poison.players[0].hp).toBe(95);
    expect(audit.poison.battle.effects.players[0].poison.remainingActions).toBe(1);
  });

  test('new status lifecycle keeps DoT nonlethal, wakes sleep, and shatters freeze on damage', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const hand = [[
        { id: 'status-hit', kind: 'minor', suit: 'Sword', number: 6 },
        { id: 'status-reserve', kind: 'minor', suit: 'Cup', number: 8 }
      ]];
      const scenario = () => debug.battleScenario({
        withTrick: false,
        enemyHp: 500,
        enemyDefense: 0,
        hpBySeat: [3, 100, 100, 100],
        handsBySeat: hand
      });

      scenario();
      debug.battleSetEffects({
        enemy: {}, party: {},
        players: [{
          poison: { key: 'poison', label: '毒', potency: 8, charges: 2 },
          sleep: { key: 'sleep', label: '睡眠', charges: 1 }
        }, {}, {}, {}]
      });
      const nonlethal = debug.battlePlayOne(0, { resolve: false });

      scenario();
      debug.battleSetEffects({ enemy: {}, party: {}, players: [{}, {}, {}, {}] });
      const baseline = debug.battlePlayOne(0, { resolve: false });

      scenario();
      debug.battleSetEffects({
        enemy: { freeze: { key: 'freeze', label: '凍結', charges: 1 } },
        party: {}, players: [{}, {}, {}, {}]
      });
      const shattered = debug.battlePlayOne(0, { resolve: false });

      scenario();
      const wet = debug.battleApplyStatus('enemy', 'wet', { potency: 30, charges: 2 });
      const blockedBurn = debug.battleApplyStatus('enemy', 'burn', { potency: 8, charges: 2 });
      return { nonlethal, baseline, shattered, wet, blockedBurn };
    });

    expect(audit.nonlethal.players[0].hp).toBe(1);
    expect(audit.nonlethal.players[0].hand).toHaveLength(1);
    expect(audit.nonlethal.battle.events.at(-1).damage).toBeGreaterThan(0);
    expect(audit.nonlethal.battle.effects.players[0].sleep).toBeUndefined();
    expect(audit.nonlethal.battle.effects.players[0].poison.remainingActions).toBe(1);
    expect(audit.shattered.battle.events.at(-1).damage)
      .toBeGreaterThan(audit.baseline.battle.events.at(-1).damage);
    expect(audit.shattered.battle.effects.enemy.freeze).toBeUndefined();
    expect(audit.shattered.battle.events.at(-1).effects)
      .toContainEqual(expect.objectContaining({ kind: 'freeze-shatter', potency: 20 }));
    expect(audit.wet.ok).toBe(true);
    expect(audit.blockedBurn.ok).toBe(false);
    expect(audit.blockedBurn.state.battle.effects.enemy.wet).toBeUndefined();
    expect(audit.blockedBurn.state.battle.effects.enemy.burn).toBeUndefined();
  });

  test('schema 26 enables enemy abilities while older battles keep their original status rules', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const currentPayload = debug.battlePublicState();
      const currentState = debug.battleState();
      const v1Payload = JSON.parse(JSON.stringify(currentPayload));
      v1Payload.schema = 22;
      v1Payload.state.rules.statusEffectsVersion = 2;
      const v1State = debug.battleDeserialize(v1Payload);
      const legacyPayload = JSON.parse(JSON.stringify(currentPayload));
      legacyPayload.schema = 21;
      legacyPayload.state.rules.statusEffectsVersion = 2;
      const legacyState = debug.battleDeserialize(legacyPayload);
      const previousPayload = JSON.parse(JSON.stringify(currentPayload));
      previousPayload.schema = 25;
      previousPayload.state.rules.enemyAbilityVersion = 1;
      const previousState = debug.battleDeserialize(previousPayload);
      return { currentPayload, currentState, v1State, legacyState, previousState };
    });

    expect(audit.currentPayload.schema).toBe(30);
    expect(audit.currentState.rules.statusEffectsVersion).toBe(2);
    expect(audit.currentState.rules.enemyAbilityVersion).toBe(1);
    expect(audit.currentState.battle.enemy.abilities).toBeTruthy();
    expect(audit.previousState.rules.enemyAbilityVersion).toBe(0);
    expect(audit.previousState.battle.enemy.abilities).toBeNull();
    expect(audit.v1State.rules.statusEffectsVersion).toBe(1);
    expect(audit.legacyState.rules.statusEffectsVersion).toBe(0);
  });

  test('current non-raid direct enemy hits cannot remove more than 45 percent max HP', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const setup = (enemyCombatVersion) => debug.battleScenario({
        withTrick: false,
        rules: { enemyCombatVersion },
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: [{ maxHp: 100, defense: 0 }]
      });
      setup(3);
      const current = debug.battleApplyPlayerDamage(0, 999, { source: 'enemy-single' });
      setup(2);
      const legacy = debug.battleApplyPlayerDamage(0, 999, { source: 'enemy-single' });
      setup(3);
      const ongoing = debug.battleApplyPlayerDamage(0, 999, { source: 'enemy-status' });
      return { current, legacy, ongoing };
    });

    expect(audit.current.result).toMatchObject({ damage: 45, hpBefore: 100, hpAfter: 55 });
    expect(audit.legacy.result).toMatchObject({ damage: 100, hpBefore: 100, hpAfter: 0 });
    expect(audit.ongoing.result).toMatchObject({ damage: 100, hpBefore: 100, hpAfter: 0 });
  });

  test('status V2 resolves control replacement, clear counters, curse, petrify, seal and modifier offset', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = (id, suit, number) => ({ id, kind: 'minor', suit, number });

      debug.battleScenario({
        rules: { statusEffectsVersion: 2 },
        withTrick: false,
        enemyHp: 500,
        enemyDefense: 0,
        handsBySeat: [[card('paralysis-play', 'Sword', 4), card('paralysis-rest', 'Cup', 6)]]
      });
      debug.battleApplyStatus('player-0', 'sleep');
      debug.battleApplyStatus('player-0', 'freeze');
      const controlReplacement = debug.battleState();
      debug.battleApplyStatus('player-0', 'paralysis', { potency: 40, remainingClears: 2 });
      debug.battleSetCombatRandom(0);
      const paralysisPlay = debug.battlePlayOne(0, { resolve: false });
      const afterOneClear = debug.battleAdvanceEffectTurn(false).state;
      const afterTwoClears = debug.battleAdvanceEffectTurn(false).state;

      debug.battleScenario({
        rules: { statusEffectsVersion: 2 },
        hpBySeat: [50, 100, 100, 100],
        combatBySeat: [{ maxHp: 100 }]
      });
      debug.battleSetEffects({
        enemy: {}, party: {}, players: [{
          curse: { key: 'curse', label: '呪い', remainingClears: 2 },
          regen: { key: 'regen', label: 'リジェネ', potency: 20, remainingTurns: 2, expiresOn: 'turn' }
        }, {}, {}, {}]
      });
      const cursed = debug.battleAdvanceEffectTurn(true).state;

      debug.battleScenario({ rules: { statusEffectsVersion: 2 } });
      debug.battleApplyModifier('player-0', 'powerUp', { potency: 30 });
      const offset = debug.battleApplyModifier('player-0', 'powerDown', { potency: 20 }).state;
      debug.battleApplyStatus('player-1', 'petrify');
      const petrified = {
        conscious: debug.battleIsPlayerConscious(1),
        state: debug.battleState()
      };

      const roleCards = [
        card('seal-2a', 'Cup', 2), card('seal-2b', 'Sword', 2), card('seal-2c', 'Wand', 2),
        card('seal-3a', 'Cup', 3), card('seal-3b', 'Pentacle', 3)
      ];
      debug.battleScenario({
        rules: { statusEffectsVersion: 2 },
        withTrick: false,
        enemyHp: 500,
        handsBySeat: [roleCards]
      });
      debug.battleApplyStatus('player-0', 'seal', { remainingClears: 2 });
      const sealedRole = debug.battlePlayCards(0, roleCards.map((entry) => entry.id)).state;

      return { controlReplacement, paralysisPlay, afterOneClear, afterTwoClears, cursed, offset, petrified, sealedRole };
    });

    expect(audit.controlReplacement.battle.effects.players[0].freeze).toBeTruthy();
    expect(audit.controlReplacement.battle.effects.players[0].sleep).toBeUndefined();
    expect(audit.paralysisPlay.battle.events.at(-1)).toMatchObject({ attackBlocked: true, damage: 0 });
    expect(audit.paralysisPlay.battle.effects.players[0].paralysis.remainingClears).toBe(2);
    expect(audit.afterOneClear.battle.effects.players[0].paralysis.remainingClears).toBe(1);
    expect(audit.afterTwoClears.battle.effects.players[0].paralysis).toBeUndefined();
    expect(audit.cursed.players[0].hp).toBe(50);
    expect(audit.cursed.battle.effects.players[0].curse.remainingClears).toBe(1);
    expect(audit.offset.battle.effects.players[0].powerUp.potency).toBe(10);
    expect(audit.offset.battle.effects.players[0].powerDown).toBeUndefined();
    expect(audit.petrified.conscious).toBe(false);
    expect(audit.petrified.state.players[1].hp).toBeGreaterThan(0);
    expect(audit.sealedRole.trick.cardsTable).toHaveLength(5);
    expect(audit.sealedRole.battle.events.at(-1)).toMatchObject({ damage: 0, summon: null });
    expect(audit.sealedRole.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'summon-sealed', statusKey: 'seal' })
    ]));
  });

  test('expanded ailments alter combat without preventing the played card from reaching the field', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const minorHand = (prefix) => [[
        { id: `${prefix}-attack`, kind: 'minor', suit: 'Sword', number: 6 },
        { id: `${prefix}-reserve`, kind: 'minor', suit: 'Cup', number: 8 }
      ]];
      const run = (statusKey, effect, randomValue = 0, options = {}) => {
        debug.battleScenario({
          rules: { statusEffectsVersion: 1 },
          withTrick: false,
          enemyHp: 500,
          enemyDefense: 0,
          enemySpeed: 30,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat: [{ maxHp: 100, power: 30, defense: 20, intelligence: 30, speed: 30 }],
          handsBySeat: options.handsBySeat || minorHand(statusKey)
        });
        debug.battleSetEffects({
          enemy: {},
          party: {},
          players: [{
            [statusKey]: {
              key: statusKey,
              label: effect.label,
              potency: effect.potency,
              charges: effect.charges ?? 1,
              expiresOn: 'action'
            }
          }, {}, {}, {}]
        });
        debug.battleSetCombatRandom(randomValue);
        return debug.battlePlayOne(0, { resolve: false });
      };

      const baseline = run('slow', { label: '鈍足', potency: 0 });
      const slow = run('slow', { label: '鈍足', potency: 50 });
      const fear = run('fear', { label: '恐怖', potency: 1 });
      const confusion = run('confusion', { label: '混乱', potency: 100 });
      const weaken = run('weaken', { label: '弱体', potency: 50 });
      const wet = run('wet', { label: '水浸し', potency: 50 });
      const silence = run('silence', { label: '沈黙', potency: 1 }, 0, {
        handsBySeat: [[
          { id: 'silence-priestess', kind: 'major', suit: 'None', number: 2 },
          { id: 'silence-reserve', kind: 'minor', suit: 'Cup', number: 8 }
        ]]
      });
      const passDamage = (vulnerable) => {
        debug.battleScenario({
          rules: { statusEffectsVersion: 1 },
          turnIndex: 1,
          leaderIndex: 0,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 }))
        });
        debug.battleSetEffects({
          enemy: {},
          party: {},
          players: [{}, vulnerable ? {
            vulnerable: { key: 'vulnerable', label: '脆弱', potency: 50, charges: 1, expiresOn: 'action' }
          } : {}, {}, {}]
        });
        debug.battleSetCombatRandom(0);
        return debug.battlePass(1);
      };
      return {
        baseline, slow, fear, confusion, weaken, wet, silence,
        normalHit: passDamage(false),
        vulnerableHit: passDamage(true)
      };
    });

    for (const state of [audit.baseline, audit.slow, audit.fear, audit.confusion, audit.weaken, audit.wet, audit.silence]) {
      expect(state.players[0].hand).toHaveLength(1);
      expect(state.trick.cardsTable).toHaveLength(1);
    }
    expect(audit.slow.battle.events.at(-1).hitChance)
      .toBeLessThan(audit.baseline.battle.events.at(-1).hitChance);
    expect(audit.fear.battle.events.at(-1).attackBlocked).toBe(false);
    expect(audit.fear.battle.events.at(-1).damage)
      .toBeLessThan(audit.baseline.battle.events.at(-1).damage);
    expect(audit.confusion.battle.events.at(-1)).toMatchObject({ damage: 0, attackBlocked: true });
    expect(audit.confusion.players[0].hp).toBeLessThan(100);
    expect(audit.weaken.battle.events.at(-1).damage)
      .toBeLessThan(audit.baseline.battle.events.at(-1).damage);
    expect(audit.wet.battle.events.at(-1).damage)
      .toBe(audit.baseline.battle.events.at(-1).damage);
    expect(audit.silence.battle.events.at(-1).damage).toBeGreaterThan(0);
    expect(audit.silence.battle.events.at(-1).majorSkillName).toBe('');
    expect(audit.silence.players[0].hp).toBe(100);
    expect(audit.vulnerableHit.players[1].hp).toBeLessThan(audit.normalHit.players[1].hp);
    expect(audit.vulnerableHit.battle.effects.players[1].vulnerable).toBeUndefined();
  });

  test('designated enemies inflict statuses, which persist through a field clear until used', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 })),
        enemySpeed: 0,
        enemyAilment: {
          statusKey: 'poison',
          label: '毒',
          scope: 'single',
          chance: 1,
          potency: 4,
          charges: 3
        }
      });
      debug.battleSetCombatRandom(0);
      const inflicted = debug.battlePass(1);
      debug.battleResolveTransition();
      const cleared = debug.battleClearTrick(0);
      return { inflicted, cleared };
    });

    expect(audit.inflicted.battle.effects.players[1].poison).toMatchObject({
      source: 'enemy',
      potency: 3,
      remainingActions: 3,
      expiresOn: 'status'
    });
    expect(audit.inflicted.battle.events.at(-1).effects).toContainEqual(expect.objectContaining({
      kind: 'enemy-ailment',
      targetIndex: 1,
      statusKey: 'poison',
      success: true
    }));
    expect(audit.cleared.battle.effects.players[1].poison).toBeTruthy();
  });

  test('status results use short combat text and natural navigation copy', async ({ page }) => {
    await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 })),
        enemySpeed: 0,
        enemyAilment: {
          statusKey: 'poison',
          label: '毒',
          scope: 'single',
          chance: 1,
          potency: 4,
          charges: 3
        }
      });
      debug.battleSetCombatRandom(0);
      debug.battlePass(1);
      const state = debug.battleState();
      const timeline = state.transition.timeline;
      const originalNow = Date.now;
      try {
        Date.now = () => timeline.effectAt + 1;
        debug.battleRender();
      } finally {
        Date.now = originalNow;
      }
    });

    const row = page.locator('#tarotKingdomBattleParty > .tarot-kingdom-battle-player').nth(1);
    await expect(row.locator('.tarot-kingdom-effect-result-text')).toHaveText('POISON');
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toContainText('毒に侵された');
  });

  test('self-healing enemies recover after attacking, show the amount, and curse blocks recovery', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const ability = {
        version: 1,
        attacks: { single: null, area: null },
        special: {
          id: 'test-regeneration',
          kind: 'heal',
          trigger: 'single',
          maxUses: 1,
          hpThreshold: 0.6,
          healRate: 0.2,
          label: '自己再生'
        }
      };
      const scenario = () => debug.battleScenario({
        rules: { enemyAbilityVersion: 1, statusEffectsVersion: 2 },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 })),
        enemyMaxHp: 100,
        enemyHp: 40,
        enemySpeed: 0,
        enemyAilment: null,
        enemyAbilities: ability
      });

      scenario();
      debug.battleSetCombatRandom(0);
      const healed = debug.battlePass(1);
      const event = healed.battle.events.at(-1);
      const timeline = healed.transition.timeline;
      const originalNow = Date.now;
      try {
        Date.now = () => timeline.damageNumberAt + 1;
        debug.battleRender();
      } finally {
        Date.now = originalNow;
      }
      const visual = {
        amount: document.querySelector('.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number')?.textContent || '',
        healingClass: document.querySelector('.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number')?.classList.contains('is-heal') || false,
        navigation: document.querySelector('#tarotKingdomSelectedEffectText')?.textContent || ''
      };

      scenario();
      debug.battleSetEffects({
        enemy: { curse: { key: 'curse', label: '呪い', potency: 100, remainingClears: 2, statusVersion: 2 } },
        party: {},
        players: [{}, {}, {}, {}]
      });
      debug.battleSetCombatRandom(0);
      const cursed = debug.battlePass(1);
      return { healed, event, visual, cursed };
    });

    expect(audit.healed.battle.enemy.hp).toBe(60);
    expect(audit.healed.battle.enemy.abilityState.uses['test-regeneration']).toBe(1);
    expect(audit.event).toMatchObject({
      type: 'enemy-single',
      enemyHealAmount: 20,
      enemyHpBefore: 40,
      enemyHp: 60
    });
    expect(audit.event.effects).toContainEqual(expect.objectContaining({
      kind: 'enemy-heal',
      label: '自己再生',
      amount: 20
    }));
    expect(audit.visual).toMatchObject({ amount: '+20', healingClass: true });
    expect(audit.visual.navigation).toContain('HPを回復した');
    expect(audit.cursed.battle.enemy.hp).toBe(40);
    expect(audit.cursed.battle.enemy.abilityState.uses['test-regeneration']).toBeUndefined();
  });

  test('enemy drain, hardening and cleanse roles resolve once through the shared event pipeline', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const run = (special, enemyEffects = {}) => {
        debug.battleScenario({
          rules: { enemyAbilityVersion: 1, statusEffectsVersion: 2 },
          turnIndex: 1,
          leaderIndex: 0,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 })),
          enemyMaxHp: 100,
          enemyHp: 50,
          enemySpeed: 0,
          enemyAilment: null,
          enemyAbilities: { version: 1, attacks: { single: null, area: null }, special }
        });
        debug.battleSetEffects({ enemy: enemyEffects, party: {}, players: [{}, {}, {}, {}] });
        debug.battleSetCombatRandom(0);
        return debug.battlePass(1);
      };
      return {
        drain: run({
          id: 'test-drain', kind: 'drain', trigger: 'single', maxUses: 1,
          damageRate: 0.5, healCapRate: 0.1, label: '生命吸収'
        }),
        buff: run({
          id: 'test-guard', kind: 'buff', trigger: 'single', maxUses: 1,
          statusKey: 'defenseUp', potency: 30, turns: 2, label: '甲殻硬化'
        }),
        cleanse: run({
          id: 'test-cleanse', kind: 'cleanse', trigger: 'single', maxUses: 1, label: '浄化'
        }, {
          poison: {
            key: 'poison', label: '毒', potency: 4, statusVersion: 2,
            remainingActions: 3, expiresOn: 'status'
          }
        })
      };
    });

    expect(audit.drain.battle.enemy.hp).toBe(60);
    expect(audit.drain.battle.events.at(-1).effects).toContainEqual(expect.objectContaining({
      kind: 'enemy-heal', drain: true, amount: 10
    }));
    expect(audit.buff.battle.effects.enemy.defenseUp).toMatchObject({
      source: 'enemy', potency: 30, remainingTurns: 2
    });
    expect(audit.buff.battle.events.at(-1).effects).toContainEqual(expect.objectContaining({
      kind: 'buff', statusKey: 'defenseUp', label: '甲殻硬化'
    }));
    expect(audit.cleanse.battle.effects.enemy.poison).toBeUndefined();
    expect(audit.cleanse.battle.events.at(-1).effects).toContainEqual(expect.objectContaining({
      kind: 'cleanse', statusKey: 'poison', label: '浄化'
    }));
  });

  test('single and area attacks reveal HP and KO in visual event order', async ({ page }) => {
    const duringSingle = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        pass: [false, false, true, true],
        hpBySeat: [5, 100, 5, 5],
        combatBySeat
      });
      debug.battlePass(1);
      const rows = Array.from(document.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player'));
      return rows.map((row) => ({
        ko: row.classList.contains('is-ko'),
        hp: row.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuenow') || ''
      }));
    }, { combatBySeat: zeroDefenseParty });
    expect(duringSingle[0]).toMatchObject({ ko: false, hp: '5' });
    expect(duringSingle[2]).toMatchObject({ ko: false, hp: '5' });
    expect(duringSingle[3]).toMatchObject({ ko: false, hp: '5' });

    // The area hit follows the normalized 1100ms single-target response, then reveals HP
    // after its hurt pose and 240ms tween. The field-clearing leader stays safe.
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player'
      ));
      return [2, 3].every((index) => (
        rows[index]?.classList.contains('is-ko')
        && rows[index]?.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuenow') === '0'
      ));
    });
    const duringArea = await page.evaluate(() => (
      Array.from(document.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player'))
        .map((row) => ({
          ko: row.classList.contains('is-ko'),
          hp: row.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuenow') || ''
        }))
    ));
    expect(duringArea[0]).toMatchObject({ ko: false, hp: '5' });
    expect(duringArea[2]).toMatchObject({ ko: true, hp: '0' });
    expect(duringArea[3]).toMatchObject({ ko: true, hp: '0' });
  });

  test('8 petrifies until clear, 11 confusion can self-hit, and 5 seals the area attack', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const card = (id, number) => ({ id, kind: 'minor', suit: 'Wand', number });
      const hands = (number) => [
        [card(`effect-${number}`, number), card(`reserve-${number}`, 14)],
        [card(`p1-${number}`, 2)],
        [card(`p2-${number}`, 3)],
        [card(`p3-${number}`, 4)]
      ];

      debug.battleScenario({ leaderIndex: 0, turnIndex: 0, handsBySeat: hands(8), combatBySeat });
      const afterEight = debug.battlePlayOne(0);
      const afterPetrifiedPass = debug.battlePass(1);
      debug.battlePass(2);
      const afterEightClear = debug.battlePass(3);

      debug.battleScenario({ leaderIndex: 0, turnIndex: 0, handsBySeat: hands(11), combatBySeat });
      const afterEleven = debug.battlePlayOne(0);
      debug.battleSetCombatRandom(0);
      const afterConfusedPass = debug.battlePass(1);

      debug.battleScenario({ leaderIndex: 0, turnIndex: 0, handsBySeat: hands(5), combatBySeat });
      const afterFive = debug.battlePlayOne(0);
      const afterFivePublic = debug.battlePublicState();
      debug.battlePass(1);
      debug.battleResolveTransition();
      debug.battlePass(2);
      debug.battleResolveTransition();
      const afterFiveClear = debug.battlePass(3);
      const restoredSkipNotice = debug.battleDeserialize(afterFivePublic)?.skipNotice || null;

      return {
        afterEight,
        afterPetrifiedPass,
        afterEightClear,
        afterEleven,
        afterConfusedPass,
        afterFive,
        afterFiveClear,
        restoredSkipNotice
      };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.afterEight.battle.enemy.petrifiedUntilClear).toBe(true);
    expect(audit.afterPetrifiedPass.players[1].hp).toBe(100);
    expect(audit.afterPetrifiedPass.battle.events.map((event) => event.type)).toEqual(['attack']);
    expect(audit.afterEightClear.battle.enemy.petrifiedUntilClear).toBe(false);

    expect(audit.afterEleven.reverse).toBe(true);
    expect(audit.afterConfusedPass.players[1].hp).toBe(100);
    expect(audit.afterConfusedPass.battle.enemy.hp).toBe(audit.afterEleven.battle.enemy.hp - 27);
    expect(audit.afterConfusedPass.battle.events.at(-1)).toMatchObject({ type: 'enemy-self', attackKind: 'single', damage: 27 });

    expect(audit.afterFive.battle.enemy.areaAttackSealedUntilClear).toBe(true);
    expect(audit.afterFive.turn).toBe(2);
    expect(audit.afterFive.skipNotice).toMatchObject({
      actorIndex: 0,
      targetIndexes: [1]
    });
    expect(audit.afterFive.skipNotice.token).toMatch(/^skip:/);
    expect(audit.restoredSkipNotice).toEqual(audit.afterFive.skipNotice);
    expect(audit.afterFive.pass[1]).toBe(false);
    expect(audit.afterFive.players[1].hp).toBe(100);
    expect(audit.afterFive.battle.events.some((event) => event.type === 'enemy-single')).toBe(false);
    expect(audit.afterFiveClear.battle.enemy.areaAttackSealedUntilClear).toBe(false);
    expect(audit.afterFiveClear.battle.events.filter((event) => event.type === 'enemy-single')).toHaveLength(3);
    expect(audit.afterFiveClear.battle.events.some((event) => event.type === 'enemy-area')).toBe(false);
    expect(audit.afterFiveClear.players.map((player) => player.hp)).toEqual([100, 73, 73, 73]);
  });

  test('combat statuses resolve DoT, action stop, blind, cover and area guard in order', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ rules: { statusEffectsVersion: 1 }, turnIndex: 1, leaderIndex: 0, hpBySeat: [100, 100, 100, 100], combatBySeat });
      debug.battleSetEffects({
        enemy: {
          poison: { key: 'poison', potency: 5, charges: null },
          paralysis: { key: 'paralysis', potency: 1, charges: 1 }
        },
        party: {}, players: [{}, {}, {}, {}]
      });
      const stopped = debug.battlePass(1);

      debug.battleScenario({ rules: { statusEffectsVersion: 1 }, turnIndex: 1, leaderIndex: 0, hpBySeat: [100, 100, 100, 100], combatBySeat });
      debug.battleSetEffects({
        enemy: { blind: { key: 'blind', potency: 25, charges: null } },
        party: { cover: { key: 'cover', potency: 27, charges: 1, coverIndex: 0 } },
        players: [{}, {}, {}, {}]
      });
      const covered = debug.battlePass(1);

      debug.battleScenario({
        rules: { statusEffectsVersion: 1, arcanaLoadoutEffectsVersion: 3 },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 40, 80, 90],
        combatBySeat,
        charactersBySeat: [{
          version: 4,
          guardianArcana: { number: 12, cardLevel: 1, passiveId: 'guardian-v3-12' }
        }]
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          hpShield: { key: 'hpShield', potency: 10, value: 10, remainingTurns: 2, expiresOn: 'turn' }
        }, {}, {}, {}]
      });
      const guardianCovered = debug.battlePass(1);

      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        turnIndex: 1, leaderIndex: 0, pass: [false, false, true, true],
        hpBySeat: [100, 100, 100, 100], combatBySeat
      });
      debug.battleSetEffects({
        enemy: {}, party: { areaGuard: { key: 'areaGuard', potency: 30, charges: 1 } },
        players: [{}, {}, {}, {}]
      });
      const guardedArea = debug.battlePass(1);
      return { stopped, covered, guardianCovered, guardedArea };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.stopped.battle.enemy.hp).toBe(510);
    expect(audit.stopped.players.map((player) => player.hp)).toEqual([100, 100, 100, 100]);
    expect(audit.stopped.battle.events.at(-1)).toMatchObject({ type: 'enemy-status' });
    expect(audit.stopped.battle.effects.enemy.poison).toBeTruthy();
    expect(audit.stopped.battle.effects.enemy.paralysis).toBeUndefined();

    expect(audit.covered.players.map((player) => player.hp)).toEqual([81, 100, 100, 100]);
    expect(audit.covered.battle.events[0]).toMatchObject({
      type: 'enemy-single',
      coverIndex: 0,
      protectedIndex: 1,
      coverKind: 'party'
    });
    expect(audit.covered.battle.events[0].label).toContain('かばった');
    expect(audit.covered.battle.events[0].effectMessage).toContain('かばった');
    expect(audit.covered.battle.events[0].effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'cover', potency: 27 })
    ]));

    expect(audit.guardianCovered.battle.events.at(-1)).toMatchObject({
      type: 'enemy-single',
      coverIndex: 0,
      protectedIndex: 1,
      coverKind: 'guardian',
      targetIndexes: [0]
    });
    expect(audit.guardianCovered.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'guardianCover', guardianNumber: 12, originalTargetIndex: 1 })
    ]));

    expect(audit.guardedArea.players.map((player) => player.hp)).toEqual([100, 64, 91, 91]);
    expect(audit.guardedArea.battle.events.at(-1)).toMatchObject({
      type: 'enemy-area',
      targetIndexes: [1, 2, 3],
      protectedPlayerIndex: 0
    });
    expect(audit.guardedArea.battle.effects.party.areaGuard).toBeUndefined();
  });

  test('poison HP loss uses a smaller green damage number for enemies and players', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      debug.battleSetEffects({
        enemy: {
          poison: { key: 'poison', potency: 5, charges: null },
          paralysis: { key: 'paralysis', potency: 1, charges: 1 }
        },
        party: {},
        players: [{}, {}, {}, {}]
      });
      debug.battlePass(1);
      debug.battleRender();
    }, { combatBySeat: zeroDefenseParty });

    const enemyNumber = page.locator(
      '.tarot-kingdom-battle-enemy > .tarot-kingdom-damage-number.is-status-poison.is-show'
    );
    await expect(enemyNumber).toHaveText('5', { timeout: 2500 });
    const enemyStyle = await enemyNumber.evaluate((node) => ({
      color: getComputedStyle(node).color,
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
    }));
    expect(enemyStyle.color).toBe('rgb(186, 255, 135)');
    expect(enemyStyle.fontSize).toBeLessThanOrEqual(30);

    await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      debug.battleSetEffects({
        enemy: { paralysis: { key: 'paralysis', potency: 1, charges: 1 } },
        party: {},
        players: [{}, {
          poison: { key: 'poison', potency: 7, charges: null }
        }, {}, {}]
      });
      debug.battlePass(1);
      debug.battleRender();
    }, { combatBySeat: zeroDefenseParty });

    const playerNumber = page.locator(
      '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="1"]'
      + ' > .tarot-kingdom-player-damage-number.is-status-poison.is-show'
    );
    await expect(playerNumber).toHaveText('7', { timeout: 2500 });
    const playerStyle = await playerNumber.evaluate((node) => ({
      color: getComputedStyle(node).color,
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
    }));
    expect(playerStyle.color).toBe('rgb(186, 255, 135)');
    expect(playerStyle.fontSize).toBeLessThanOrEqual(18);
  });

  test('coverer visibly interposes before the protected player and takes the hit', async ({ page }) => {
    const presentation = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        rules: { statusEffectsVersion: 1 },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      debug.battleSetEffects({
        enemy: {},
        party: { cover: { key: 'cover', potency: 27, charges: 1, coverIndex: 0 } },
        players: [{}, {}, {}, {}]
      });
      debug.battleSetCombatRandom(0);
      const state = debug.battlePass(1);
      debug.battleRender();
      const coverRow = document.querySelector(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="0"]'
      );
      const protectedRow = document.querySelector(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player[data-player-index="1"]'
      );
      const avatar = coverRow?.querySelector('.tarot-kingdom-battle-player-avatar');
      const coverAnimation = avatar?.getAnimations().find((animation) => (
        String(animation.id || '').startsWith('tarot-kingdom-cover:')
      ));
      return {
        event: state.battle.events.at(-1),
        coverClass: coverRow?.classList.contains('is-covering-ally') || false,
        protectedClass: protectedRow?.classList.contains('is-being-covered') || false,
        callout: protectedRow?.querySelector('.tarot-kingdom-cover-callout')?.textContent || '',
        offsetX: coverRow?.style.getPropertyValue('--tk-cover-offset-x') || '',
        offsetY: coverRow?.style.getPropertyValue('--tk-cover-offset-y') || '',
        motionKey: avatar?.dataset.kingdomCoverEventKey || '',
        keyframes: coverAnimation?.effect?.getKeyframes().map((frame) => ({
          offset: frame.offset,
          translate: frame.translate
        })) || [],
        navigation: document.querySelector('#tarotKingdomSelectedEffectText')?.textContent || ''
      };
    }, { combatBySeat: zeroDefenseParty });

    expect(presentation.event).toMatchObject({
      type: 'enemy-single',
      coverIndex: 0,
      protectedIndex: 1,
      targetIndexes: [0]
    });
    expect(presentation.coverClass).toBe(true);
    expect(presentation.protectedClass).toBe(true);
    expect(presentation.callout).toBe('COVER');
    expect(presentation.offsetX).toMatch(/^-?\d+px$/);
    expect(presentation.offsetY).toMatch(/^-?\d+px$/);
    expect(presentation.motionKey).not.toBe('');
    expect(presentation.keyframes.some((frame) => frame.translate !== '0px 0px')).toBe(true);
    expect(presentation.navigation).toContain('かばった');

    const cleared = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const state = debug.battleState();
      const event = state.battle.events.at(-1);
      debug.battleResolveTransition();
      const originalNow = Date.now;
      try {
        Date.now = () => Number(event?.at || 0) + 10000;
        debug.battleRender();
      } finally {
        Date.now = originalNow;
      }
      const rows = Array.from(document.querySelectorAll(
        '#tarotKingdomBattleParty > .tarot-kingdom-battle-player'
      ));
      return {
        covering: rows.some((row) => row.classList.contains('is-covering-ally')),
        protected: rows.some((row) => row.classList.contains('is-being-covered')),
        callouts: document.querySelectorAll('.tarot-kingdom-cover-callout').length
      };
    });
    expect(cleared).toEqual({ covering: false, protected: false, callouts: 0 });
  });

  test('weapon and equipped-card resonance share one event and expose the new AP debuff result', async ({ page }) => {
    const hand = [
      { id: 'resonance-sword-5', kind: 'minor', suit: 'Sword', number: 5 },
      { id: 'reserve-sword-6', kind: 'minor', suit: 'Sword', number: 6 }
    ];
    await page.evaluate((handsBySeat) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, turnIndex: 0, handsBySeat });
      debug.battleSetCombatRandom(0);
    }, [hand]);
    await expect(page.locator('#tarotKingdomHand .tarot-card.is-resonant')).toHaveCount(1);
    const result = await page.evaluate(() => window.TarotKingdomDebug.battlePlayOne(0, { resolve: false }));
    expect(result.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      effectCount: 2,
      resonanceName: 'ヴォルテックス',
      weaponEffectName: '有効打'
    });
    const effectMessage = result.battle.events.at(-1).effectMessage;
    expect(effectMessage).toContain('隙をさらした');
    expect(effectMessage).not.toContain('盾割り');
    expect(effectMessage).not.toContain('有効打');
    expect(result.battle.resonanceTriggers).toEqual([]);
    expect(result.transition.endsAt - result.transition.startedAt).toBe(1204);
    await expect(page.locator('.tarot-kingdom-status-tray, .tarot-kingdom-status-icon')).toHaveCount(0);
    await page.waitForTimeout(810);
    await expect(page.locator('.tarot-kingdom-effect-banner')).toHaveText('ヴォルテックス');
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText(effectMessage);
    await page.waitForTimeout(2450);
    await expect(page.locator('#tarotKingdomSelectedEffectText')).not.toHaveText(effectMessage);
  });

  test('AP resonance spends, recharges, rewards a clear, and resets for the next hand', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const wandSix = { id: 'ap-wand-6', kind: 'minor', suit: 'Wand', number: 6 };
      const pentacleKing = { id: 'ap-pentacle-king', kind: 'minor', suit: 'Pentacle', number: 14 };
      const state = debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        arcanaPointsBySeat: [1, 1, 1, 1],
        handsBySeat: [[wandSix, pentacleKing]],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [
            { slot: 0, suit: 'Wand', rank: 6, cardLevel: 1, resonanceId: 'wand-6' },
            { slot: 1, suit: 'Pentacle', rank: 14, cardLevel: 1, resonanceId: 'pentacle-14' }
          ]
        }]
      });
      const played = debug.battlePlayCards(0, [wandSix.id], { resolve: false }).state;
      const effect = played.battle.events.at(-1).effects.find((entry) => (
        entry.source === 'resonance' && entry.resonanceId === 'wand-6'
      ));
      const cleared = debug.battleClearTrick(0);
      debug.battleFinishRound(0);
      const nextHand = debug.battleNextRound();
      const cupAce = { id: 'ap-cup-ace', kind: 'minor', suit: 'Cup', number: 1 };
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        hpBySeat: [1, 100, 100, 100],
        arcanaPointsBySeat: [10, 1, 1, 1],
        handsBySeat: [[cupAce, { id: 'ap-cup-reserve', kind: 'minor', suit: 'Cup', number: 2 }]],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' }]
        }]
      });
      const acePlayed = debug.battlePlayCards(0, [cupAce.id], { resolve: false }).state;
      const aceEffect = acePlayed.battle.events.at(-1).effects.find((entry) => (
        entry.source === 'resonance' && entry.resonanceId === 'cup-1'
      ));
      return {
        initialAp: state.players[0].arcanaPoints,
        afterPlayAp: played.players[0].arcanaPoints,
        effect,
        afterClearAp: cleared.players[0].arcanaPoints,
        nextHandAp: nextHand.players.map((player) => player.arcanaPoints),
        aceHp: acePlayed.players[0].hp,
        aceMaxHp: acePlayed.players[0].maxHp,
        aceAp: acePlayed.players[0].arcanaPoints,
        aceEffect
      };
    });

    expect(audit.initialAp).toBe(1);
    expect(audit.afterPlayAp).toBe(2);
    expect(audit.effect).toMatchObject({
      kind: 'ap-gain',
      apBefore: 1,
      apCost: 1,
      apGain: 2,
      apAfter: 2,
      amount: 2
    });
    expect(audit.afterClearAp).toBe(3);
    expect(audit.nextHandAp).toEqual([1, 1, 1, 1]);
    expect(audit.aceHp).toBe(audit.aceMaxHp);
    expect(audit.aceAp).toBe(0);
    expect(audit.aceEffect).toMatchObject({ kind: 'heal-percent', amount: audit.aceMaxHp - 1, apAllocation: 10 });
  });

  test('AP affordability is visible and resonance stage damage carries 37.5/25/12.5 percent forward', async ({ page }) => {
    const setup = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const roster = debug.battleDemoEnemies().filter((monster) => monster.isBoss !== true).slice(0, 4);
      const swordFour = { id: 'stage-sword-4', kind: 'minor', suit: 'Sword', number: 4 };
      const pentacleKing = { id: 'stage-pentacle-king', kind: 'minor', suit: 'Pentacle', number: 14 };
      return debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        arcanaPointsBySeat: [1, 1, 1, 1],
        handsBySeat: [[swordFour, pentacleKing]],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [
            { slot: 0, suit: 'Sword', rank: 4, cardLevel: 1, resonanceId: 'sword-4' },
            { slot: 1, suit: 'Pentacle', rank: 14, cardLevel: 1, resonanceId: 'pentacle-14' }
          ]
        }],
        stage: {
          version: 2,
          stageNo: 2,
          stageId: 'tarot_stage_2',
          stageName: 'AP全体攻撃テスト',
          monsters: roster.map((monster, index) => ({
            monsterId: monster.id,
            monsterName: monster.name,
            threatLevel: index + 1,
            archetype: 'balanced'
          }))
        }
      });
    });

    const playerRow = page.locator('.tarot-kingdom-player-row[data-player-index="0"]');
    await expect(playerRow.locator('.tarot-kingdom-meta-ap')).toContainText('AP 1');
    const freeCard = page.locator('#tarotKingdomHand [data-card-id="stage-sword-4"]');
    const expensiveCard = page.locator('#tarotKingdomHand [data-card-id="stage-pentacle-king"]');
    await expect(freeCard).toHaveClass(/is-resonance-affordable/);
    await expect(freeCard.locator('.tarot-card-ap-cost')).toHaveText('AP 0');
    await expect(expensiveCard).toHaveClass(/is-resonance-insufficient/);
    await expect(expensiveCard.locator('.tarot-card-ap-cost')).toHaveText('AP 2');

    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const played = debug.battlePlayCards(0, ['stage-sword-4'], { resolve: false }).state;
      const event = played.battle.events.at(-1);
      const resonance = event.effects.find((entry) => (
        entry.source === 'resonance' && entry.resonanceId === 'sword-4'
      ));
      debug.battleFinishRound(0);
      const nextHand = debug.battleNextRound();
      return {
        afterVitals: played.stage.enemyVitals,
        activeHpBefore: event.enemyHpBefore,
        activeHpAfter: event.enemyHp,
        effectMessage: event.effectMessage,
        stageHits: resonance.stageHits,
        nextEnemyHp: nextHand.battle.enemy.hp
      };
    });

    expect(setup.rules).toMatchObject({
      arcanaPointVersion: 1,
      stageWideAreaDamageVersion: 2,
      stageVersion: 2
    });
    expect(audit.activeHpAfter).toBeLessThan(audit.activeHpBefore);
    expect(audit.stageHits.map((hit) => hit.rate)).toEqual([0.375, 0.25, 0.125]);
    expect(audit.stageHits).toHaveLength(3);
    audit.stageHits.forEach((hit, offset) => {
      expect(hit.amount).toBeGreaterThan(0);
      expect(hit.hpAfter).toBeGreaterThanOrEqual(1);
      expect(audit.afterVitals[offset + 1].hp).toBe(hit.hpAfter);
      expect(audit.afterVitals[offset + 1].hp).toBeLessThan(hit.hpBefore);
    });
    expect(audit.effectMessage).toContain('後続3体にも HIT');
    expect(audit.nextEnemyHp).toBe(audit.afterVitals[1].hp);

    await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const cupAce = { id: 'ap-empty-cup-ace', kind: 'minor', suit: 'Cup', number: 1 };
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        arcanaPointsBySeat: [0, 1, 1, 1],
        handsBySeat: [[cupAce, { id: 'ap-empty-reserve', kind: 'minor', suit: 'Sword', number: 9 }]],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' }]
        }],
        rules: { arcanaLoadoutEffectsVersion: 7 }
      });
    });
    const emptyApAce = page.locator('#tarotKingdomHand [data-card-id="ap-empty-cup-ace"]');
    await expect(emptyApAce).toHaveClass(/is-resonance-insufficient/);
    await expect(emptyApAce).not.toHaveClass(/is-resonance-affordable/);

    await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const swordKing = { id: 'scholar-discount-sword-king', kind: 'minor', suit: 'Sword', number: 14 };
      debug.battleScenario({
        withTrick: false,
        reverse: true,
        turnIndex: 0,
        arcanaPointsBySeat: [1, 1, 1, 1],
        handsBySeat: [[swordKing, { id: 'scholar-discount-reserve', kind: 'minor', suit: 'Cup', number: 9 }]],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Sword', rank: 14, cardLevel: 1, resonanceId: 'sword-14' }],
          guardianArcana: { itemId: 'tarot_major_11', number: 11, cardLevel: 1, passiveId: 'guardian-v7-11' }
        }],
        rules: { arcanaLoadoutEffectsVersion: 7 }
      });
    });
    const discountedKing = page.locator('#tarotKingdomHand [data-card-id="scholar-discount-sword-king"]');
    await expect(discountedKing).toHaveClass(/is-resonance-affordable/);
    await expect(discountedKing.locator('.tarot-card-ap-cost')).toHaveText('AP 1');
  });

  test('guardian v7 Gambler repeats every exact resonance in a two-card pair without extra AP', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const run = (effectsVersion) => {
        const swordTwo = { id: `gambler-sword-${effectsVersion}`, kind: 'minor', suit: 'Sword', number: 2 };
        const wandTwo = { id: `gambler-wand-${effectsVersion}`, kind: 'minor', suit: 'Wand', number: 2 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          arcanaPointsBySeat: [1, 1, 1, 1],
          handsBySeat: [[
            swordTwo,
            wandTwo,
            { id: `gambler-reserve-${effectsVersion}`, kind: 'minor', suit: 'Cup', number: 9 }
          ]],
          charactersBySeat: [{
            version: 4,
            tarotDeck: [
              { slot: 0, suit: 'Sword', rank: 2, cardLevel: 1, resonanceId: 'sword-2' },
              { slot: 1, suit: 'Wand', rank: 2, cardLevel: 1, resonanceId: 'wand-2' }
            ],
            guardianArcana: {
              itemId: 'tarot_major_10', number: 10, cardLevel: 1, passiveId: 'guardian-v7-10'
            }
          }],
          rules: { arcanaLoadoutEffectsVersion: effectsVersion }
        });
        const played = debug.battlePlayCards(0, [swordTwo.id, wandTwo.id], { resolve: false });
        const event = played.state.battle.events.at(-1);
        const resonanceEffects = (event?.effects || []).filter((effect) => effect.source === 'resonance');
        return {
          ok: played.ok,
          reason: played.reason || '',
          ap: played.state.players[0].arcanaPoints,
          guardianPassiveName: event?.guardianPassiveName || '',
          doubleUpCount: (event?.effects || []).filter((effect) => effect.label === 'ダブルアップ').length,
          resonanceIds: resonanceEffects.map((effect) => effect.resonanceId),
          resonanceDamage: resonanceEffects.reduce((sum, effect) => sum + Math.max(0, Number(effect.amount) || 0), 0)
        };
      };
      return { current: run(7), legacy: run(6) };
    });

    expect(audit.current).toMatchObject({ ok: true, reason: '', ap: 1, doubleUpCount: 1 });
    expect(audit.current.guardianPassiveName).toBe('ダブルアップ');
    expect(audit.current.resonanceIds.filter((id) => id === 'sword-2')).toHaveLength(2);
    expect(audit.current.resonanceIds.filter((id) => id === 'wand-2')).toHaveLength(2);
    expect(audit.legacy).toMatchObject({ ok: true, reason: '', ap: 1, doubleUpCount: 0 });
    expect(audit.legacy.resonanceIds.filter((id) => id === 'sword-2')).toHaveLength(1);
    expect(audit.legacy.resonanceIds.filter((id) => id === 'wand-2')).toHaveLength(1);
    expect(audit.current.resonanceDamage).toBeGreaterThan(audit.legacy.resonanceDamage);
  });

  test('guardian v7 card level strengthens positive values without increasing its sacrifice', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const runWhiteMage = (cardLevel) => {
        const cupKing = { id: `white-mage-cup-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 14 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          hpBySeat: [100, 10, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
          handsBySeat: [[cupKing, { id: `white-mage-reserve-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 9 }]],
          charactersBySeat: [{
            version: 4,
            guardianArcana: {
              itemId: 'tarot_major_02', number: 2, cardLevel, passiveId: 'guardian-v7-2'
            }
          }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        const state = debug.battlePlayCards(0, [cupKing.id], { resolve: false }).state;
        const effect = state.battle.events.at(-1).effects.find((entry) => entry.label === '白魔道士');
        return { hp: state.players[1].hp, amount: effect?.amount || 0, percent: effect?.percent || 0 };
      };
      const runDarkKnight = (effectsVersion, cardLevel) => {
        const swordPage = { id: `dark-knight-${effectsVersion}-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 11 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
          handsBySeat: [[swordPage, { id: `dark-knight-reserve-${effectsVersion}-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{
            version: 4,
            guardianArcana: {
              itemId: 'tarot_major_15', number: 15, cardLevel, passiveId: `guardian-v${effectsVersion}-15`
            }
          }],
          rules: { arcanaLoadoutEffectsVersion: effectsVersion }
        });
        const state = debug.battlePlayCards(0, [swordPage.id], { resolve: false }).state;
        const effect = state.battle.events.at(-1).effects.find((entry) => entry.label === '暗黒騎士');
        return { maxHp: state.players[0].maxHp, potency: effect?.potency || 0 };
      };
      return {
        whiteMageLv1: runWhiteMage(1),
        whiteMageLv25: runWhiteMage(25),
        darkKnightLv1: runDarkKnight(7, 1),
        darkKnightLv25: runDarkKnight(7, 25),
        darkKnightLegacy: runDarkKnight(6, 25)
      };
    });

    expect(audit.whiteMageLv1).toMatchObject({ hp: 24, amount: 14 });
    expect(audit.whiteMageLv25.amount).toBeGreaterThan(audit.whiteMageLv1.amount);
    expect(audit.darkKnightLv1).toMatchObject({ maxHp: 98, potency: 8 });
    expect(audit.darkKnightLv25.maxHp).toBe(98);
    expect(audit.darkKnightLv25.potency).toBeGreaterThan(audit.darkKnightLv1.potency);
    expect(audit.darkKnightLegacy).toMatchObject({ maxHp: 97, potency: 6 });
  });

  test('guardian v7 level ranges apply to World, Priest, Ninja, Illusion Knight, and Magic Swordsman', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const runWorld = (cardLevel) => {
        const sword = { id: `world-sword-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 2 };
        const wand = { id: `world-wand-${cardLevel}`, kind: 'minor', suit: 'Wand', number: 2 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          hpBySeat: [20, 20, 20, 20],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
          handsBySeat: [[sword, wand, { id: `world-reserve-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{
            version: 4,
            guardianArcana: { number: 21, cardLevel, passiveId: 'guardian-v7-21' },
            tarotDeck: [
              { slot: 0, suit: 'Sword', rank: 2, cardLevel: 1, resonanceId: 'sword-2' },
              { slot: 1, suit: 'Wand', rank: 2, cardLevel: 1, resonanceId: 'wand-2' }
            ]
          }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        const state = debug.battlePlayCards(0, [sword.id, wand.id], { resolve: false }).state;
        return {
          hp: state.players[1].hp,
          nextAttackUp: state.battle.effects.party.nextAttackUp?.potency,
          timeStop: state.battle.effects.enemy.timeStop?.remainingTurns
        };
      };
      const runPriest = (cardLevel) => {
        const justice = { id: `priest-level-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 11 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          hpBySeat: [100, 0, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
          koOrder: [1],
          handsBySeat: [[justice, { id: `priest-reserve-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{ version: 4, guardianArcana: { number: 20, cardLevel, passiveId: 'guardian-v7-20' } }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        return debug.battlePlayCards(0, [justice.id], { resolve: false }).state.players[1].hp;
      };
      const runNinja = (cardLevel) => {
        const sword = { id: `ninja-sword-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 2 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          handsBySeat: [[sword, { id: `ninja-reserve-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{ version: 4, guardianArcana: { number: 9, cardLevel, passiveId: 'guardian-v7-9' } }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        return debug.battlePlayCards(0, [sword.id], { resolve: false }).state.battle.guardianState[0].v3.counters.evasion;
      };
      const runGuardianSuit = (number, suit, cardLevel) => {
        const first = { id: `guardian-${number}-${suit}-a-${cardLevel}`, kind: 'minor', suit, number: 2 };
        const second = { id: `guardian-${number}-${suit}-b-${cardLevel}`, kind: 'minor', suit, number: 2 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          handsBySeat: [[first, second, { id: `guardian-${number}-reserve-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{ version: 4, guardianArcana: { number, cardLevel, passiveId: `guardian-v7-${number}` } }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        const state = debug.battlePlayCards(0, [first.id, second.id], { resolve: false }).state;
        return state.battle.effects.players[0];
      };
      return {
        worldLv1: runWorld(1),
        worldLv25: runWorld(25),
        priestLv1: runPriest(1),
        priestLv25: runPriest(25),
        ninjaLv1: runNinja(1),
        ninjaLv25: runNinja(25),
        illusionLv1: runGuardianSuit(18, 'Pentacle', 1).evasionUp,
        illusionLv25: runGuardianSuit(18, 'Pentacle', 25).evasionUp,
        magicLv1: runGuardianSuit(16, 'Sword', 1).lightningBlade,
        magicLv25: runGuardianSuit(16, 'Sword', 25).lightningBlade
      };
    });

    expect(audit.worldLv1).toEqual({ hp: 70, nextAttackUp: 10, timeStop: 1 });
    expect(audit.worldLv25).toEqual({ hp: 100, nextAttackUp: 50, timeStop: 1 });
    expect(audit.priestLv1).toBe(10);
    expect(audit.priestLv25).toBe(70);
    expect(audit.ninjaLv1).toBe(30);
    expect(audit.ninjaLv25).toBe(67);
    expect(audit.illusionLv1).toMatchObject({ potency: 5, remainingTurns: 2 });
    expect(audit.illusionLv25).toMatchObject({ potency: 30, remainingTurns: 2 });
    expect(audit.magicLv1).toMatchObject({ paralysisChance: 0.5, damageBonus: 20 });
    expect(audit.magicLv25).toMatchObject({ paralysisChance: 1, damageBonus: 100 });
  });

  test('guardian v7 level ranges change counter, cover, lightning, and resonance values in battle', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const runFighter = (cardLevel) => {
        debug.battleScenario({
          turnIndex: 1,
          leaderIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          hpBySeat: [100, 100, 100, 100],
          combatBySeat,
          charactersBySeat: [
            {},
            { version: 4, guardianArcana: { number: 8, cardLevel, passiveId: 'guardian-v7-8' } }
          ],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        debug.battleSetCombatRandom(0.999);
        const state = debug.battlePass(1);
        const evasion = state.battle.events.at(-1).effects.find((entry) => entry.kind === 'speed-evasion');
        return evasion?.guardianCounter;
      };
      const runGuardianCover = (cardLevel) => {
        debug.battleScenario({
          turnIndex: 1,
          leaderIndex: 0,
          hpBySeat: [100, 40, 80, 90],
          combatBySeat,
          charactersBySeat: [{ version: 4, guardianArcana: { number: 12, cardLevel, passiveId: 'guardian-v7-12' } }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        debug.battleSetEffects({
          enemy: {}, party: {}, players: [{ hpShield: { key: 'hpShield', potency: 1, shieldHp: 1, expiresOn: 'turn' } }, {}, {}, {}]
        });
        debug.battleSetCombatRandom(0);
        const state = debug.battlePass(1);
        const event = state.battle.events.at(-1);
        return {
          damage: event.damages[0].damage,
          cover: event.effects.find((entry) => entry.kind === 'guardianCover')
        };
      };
      const runLightning = (damageBonus, paralysisChance) => {
        const sword = { id: `lightning-sword-${damageBonus}`, kind: 'minor', suit: 'Sword', number: 2 };
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          handsBySeat: [[sword, { id: `lightning-reserve-${damageBonus}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{ version: 4, tarotDeck: [{ slot: 0, suit: 'Sword', rank: 2, cardLevel: 1, resonanceId: 'sword-2' }] }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        debug.battleSetEffects({
          enemy: {}, party: {}, players: [{ lightningBlade: { key: 'lightningBlade', damageBonus, paralysisChance, charges: 1, expiresOn: 'action' } }, {}, {}, {}]
        });
        debug.battleSetCombatRandom(0.75);
        const state = debug.battlePlayCards(0, [sword.id], { resolve: false }).state;
        const effect = state.battle.events.at(-1).effects.find((entry) => entry.source === 'resonance' && entry.resonanceId === 'sword-2');
        return { amount: effect?.amount, paralysis: effect?.paralysis?.success };
      };
      const runShaman = (cardLevel) => {
        const wand = { id: `shaman-wand-${cardLevel}`, kind: 'minor', suit: 'Wand', number: 6 };
        debug.battleScenario({
          tableCard: { id: `shaman-field-${cardLevel}`, kind: 'minor', suit: 'Wand', number: 5 },
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          handsBySeat: [[wand, { id: `shaman-reserve-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          combatBySeat: [{ weaponType: 'gun', weaponTypes: ['gun'], intelligence: 100 }],
          charactersBySeat: [{
            version: 4,
            guardianArcana: { number: 1, cardLevel, passiveId: 'guardian-v7-1' },
            tarotDeck: [{ slot: 0, suit: 'Wand', rank: 6, cardLevel: 1, resonanceId: 'wand-6' }]
          }],
          guardianState: [{ v3: { counters: { statusAttempts: 5 }, used: {} } }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        debug.battleSetCombatRandom(0);
        const state = debug.battlePlayCards(0, [wand.id], { resolve: false }).state;
        const status = state.battle.events.at(-1).effects.find((entry) => entry.source === 'weapon' && entry.kind === 'status');
        return {
          chance: status?.chance,
          vulnerability: state.battle.effects.enemy.vulnerable?.potency,
          appliedVulnerability: status?.guardianVulnerability?.potency
        };
      };
      const runResonance = (guardianNumber, cardLevel) => {
        const sword = { id: `resonance-${guardianNumber}-sword-${cardLevel}`, kind: 'minor', suit: 'Sword', number: 2 };
        const wand = { id: `resonance-${guardianNumber}-wand-${cardLevel}`, kind: 'minor', suit: 'Wand', number: 2 };
        const cards = guardianNumber === 10 ? [sword, wand] : [sword];
        debug.battleScenario({
          withTrick: false,
          reverse: guardianNumber === 11,
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          handsBySeat: [[...cards, { id: `resonance-reserve-${guardianNumber}-${cardLevel}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [{
            version: 4,
            guardianArcana: { number: guardianNumber, cardLevel, passiveId: `guardian-v7-${guardianNumber}` },
            tarotDeck: cards.map((card, slot) => ({ slot, suit: card.suit, rank: card.number, cardLevel: 1 }))
          }],
          rules: { arcanaLoadoutEffectsVersion: 7 }
        });
        const state = debug.battlePlayCards(0, cards.map((card) => card.id), { resolve: false }).state;
        return state.battle.events.at(-1).effects.filter((entry) => entry.source === 'resonance');
      };
      return {
        fighterLv1: runFighter(1),
        fighterLv25: runFighter(25),
        coverLv1: runGuardianCover(1),
        coverLv25: runGuardianCover(25),
        lightningLv1: runLightning(20, 0.5),
        lightningLv25: runLightning(100, 1),
        shamanLv1: runShaman(1),
        shamanLv25: runShaman(25),
        scholarLv1: runResonance(11, 1),
        scholarLv25: runResonance(11, 25),
        gamblerLv25: runResonance(10, 25)
      };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.fighterLv1).toMatchObject({ counterMultiplier: 1 });
    expect(audit.fighterLv25).toMatchObject({ counterMultiplier: 2.5 });
    expect(audit.fighterLv25.amount).toBeGreaterThan(audit.fighterLv1.amount);
    expect(audit.coverLv1.cover).toMatchObject({ potency: 10 });
    expect(audit.coverLv25.cover).toMatchObject({ potency: 65 });
    expect(audit.coverLv25.damage).toBeLessThan(audit.coverLv1.damage);
    expect(audit.lightningLv25.amount).toBeGreaterThan(audit.lightningLv1.amount);
    expect(audit.lightningLv1.paralysis).toBe(false);
    expect(audit.lightningLv25.paralysis).toBe(true);
    expect(audit.shamanLv25.chance - audit.shamanLv1.chance).toBeCloseTo(0.2, 5);
    expect(audit.shamanLv1).toMatchObject({ vulnerability: 25, appliedVulnerability: 25 });
    expect(audit.shamanLv25).toMatchObject({ vulnerability: 25, appliedVulnerability: 25 });
    expect(audit.scholarLv1[0]).toMatchObject({ numericMultiplier: 1.5 });
    expect(audit.scholarLv25[0]).toMatchObject({ numericMultiplier: 3 });
    expect(audit.scholarLv25[0].amount).toBe(audit.scholarLv1[0].amount * 2);
    const gamblerSword = audit.gamblerLv25.filter((entry) => entry.resonanceId === 'sword-2');
    expect(gamblerSword).toHaveLength(2);
    expect(gamblerSword.find((entry) => entry.gamblerReplay)).toMatchObject({ numericMultiplier: 2.5 });
    expect(gamblerSword.find((entry) => entry.gamblerReplay).amount).toBe(
      Math.round(gamblerSword.find((entry) => !entry.gamblerReplay).amount * 2.5)
    );
  });

  test('five-card roles use distinct single and stage-wide attack ranges', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const roster = debug.battleDemoEnemies().filter((monster) => monster.isBoss !== true).slice(0, 4);
      const stage = {
        version: 2,
        stageNo: 3,
        stageId: 'tarot_stage_role_range',
        stageName: '5枚役範囲テスト',
        monsters: roster.map((monster, index) => ({
          monsterId: monster.id,
          monsterName: monster.name,
          threatLevel: index + 1,
          archetype: 'balanced'
        }))
      };
      const run = (prefix, cards) => {
        const hand = [
          ...cards,
          { id: `${prefix}-reserve`, kind: 'minor', suit: 'Pentacle', number: 14 }
        ];
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          handsBySeat: [hand],
          combatBySeat: [{ intelligence: 0 }],
          enemyDefense: 0,
          stage
        });
        const played = debug.battlePlayCards(0, cards.map((card) => card.id), { resolve: false }).state;
        const event = played.battle.events.at(-1);
        return {
          roleKey: played.lastPlay.role.key,
          displayBaseDamage: event.displayBaseDamage,
          targetScope: event.roleTargetScope,
          rangeLabel: event.roleRangeLabel,
          stageHits: event.roleStageHits,
          effectMessage: event.effectMessage,
          afterVitals: played.stage.enemyVitals.map((vital) => vital?.hp ?? null)
        };
      };
      const straight = run('range-straight', [1, 2, 3, 4, 5].map((number, index) => ({
        id: `range-straight-${number}`,
        kind: 'minor',
        suit: ['Wand', 'Cup', 'Sword', 'Pentacle', 'Wand'][index],
        number
      })));
      const flush = run('range-flush', [2, 4, 6, 8, 10].map((number) => ({
        id: `range-flush-${number}`,
        kind: 'minor',
        suit: 'Cup',
        number
      })));
      const profiles = debug.battleRoleAttackProfiles();
      const currentPublic = debug.battlePublicState();
      const legacyPayload = JSON.parse(JSON.stringify(currentPublic));
      legacyPayload.schema = 28;
      delete legacyPayload.state.rules.roleAttackRangeVersion;
      const legacy = debug.battleDeserialize(legacyPayload);
      const legacyProfiles = debug.battleRoleAttackProfiles();
      return { straight, flush, profiles, legacy, legacyProfiles };
    });

    expect(audit.profiles).toMatchObject({
      Straight: { targetScope: 'single', rangeLabel: '単体中攻撃', damageScale: 1 },
      Flush: { targetScope: 'stage', rangeLabel: '全体小攻撃', damageScale: 0.65 },
      FullHouse: { targetScope: 'single', rangeLabel: '単体大攻撃', damageScale: 1 },
      FourKind: { targetScope: 'stage', rangeLabel: '全体中攻撃', damageScale: 0.82 },
      TheWorld: { targetScope: 'stage', rangeLabel: '全体中攻撃', damageScale: 0.82 },
      StraightFlush: { targetScope: 'stage', rangeLabel: '全体大攻撃', damageScale: 0.9 },
      FiveKind: { targetScope: 'stage', rangeLabel: '全体特大攻撃', damageScale: 0.95 }
    });
    expect(audit.straight).toMatchObject({
      roleKey: 'Straight',
      targetScope: 'single',
      rangeLabel: '単体中攻撃',
      stageHits: []
    });
    expect(audit.flush).toMatchObject({
      roleKey: 'Flush',
      targetScope: 'stage',
      rangeLabel: '全体小攻撃'
    });
    expect(audit.flush.displayBaseDamage).toBeLessThan(audit.straight.displayBaseDamage);
    expect(audit.flush.stageHits.map((hit) => hit.rate)).toEqual([0.75, 0.5, 0.25]);
    audit.flush.stageHits.forEach((hit, index) => {
      expect(hit.hpAfter).toBeGreaterThanOrEqual(1);
      expect(hit.hpAfter).toBeLessThan(hit.hpBefore);
      expect(audit.flush.afterVitals[index + 1]).toBe(hit.hpAfter);
    });
    expect(audit.flush.effectMessage).toContain('後続3体にも HIT');
    expect(audit.legacy.rules.roleAttackRangeVersion).toBe(0);
    expect(audit.legacyProfiles.Flush).toMatchObject({
      targetScope: 'single',
      rangeLabel: '',
      damageScale: 1
    });
  });

  test('call resonance includes the reused field card and uses only the caller loadout', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const fieldCard = { id: 'call-resonance-field', kind: 'minor', suit: 'Cup', number: 2 };
      const callerHand = [4, 6, 8, 10].map((number) => ({
        id: `call-resonance-hand-${number}`,
        kind: 'minor',
        suit: 'Cup',
        number
      }));
      callerHand.push({ id: 'call-resonance-reserve', kind: 'minor', suit: 'Wand', number: 14 });
      const cupTwoDeck = [{
        slot: 0,
        itemId: 'tarot_minor_cup_02',
        suit: 'Cup',
        rank: 2,
        cardLevel: 1,
        resonanceId: 'cup-2'
      }];

      const run = (charactersBySeat) => {
        debug.battleScenario({
          tableCard: fieldCard,
          leaderIndex: 1,
          turnIndex: 0,
          handsBySeat: [callerHand],
          charactersBySeat,
          rules: { arcanaLoadoutEffectsVersion: 3 }
        });
        const played = debug.battlePlayCards(
          0,
          callerHand.slice(0, 4).map((card) => card.id),
          { resolve: false }
        );
        return {
          ok: played.ok,
          lastPlay: played.state.lastPlay,
          event: played.state.battle.events.at(-1)
        };
      };

      return {
        callerEquipped: run([{ version: 4, tarotDeck: cupTwoDeck }, { version: 4, tarotDeck: [] }]),
        fieldOwnerEquipped: run([{ version: 4, tarotDeck: [] }, { version: 4, tarotDeck: cupTwoDeck }])
      };
    });

    expect(audit.callerEquipped).toMatchObject({
      ok: true,
      lastPlay: { call: true, count: 5 }
    });
    expect(audit.callerEquipped.lastPlay.cardsHand).toHaveLength(4);
    expect(audit.callerEquipped.lastPlay.cardsTable).toHaveLength(5);
    expect(audit.callerEquipped.event).toMatchObject({ resonanceName: '悠久の霊薬' });
    expect(audit.fieldOwnerEquipped).toMatchObject({ ok: true });
    expect(audit.fieldOwnerEquipped.event?.resonanceName || '').toBe('');
  });

  test('a five-card role resolves each resonant card from its own rank condition', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const cards = [
        { id: 'rank-map-cup-1', kind: 'minor', suit: 'Cup', number: 1 },
        { id: 'rank-map-wand-2', kind: 'minor', suit: 'Wand', number: 2 },
        { id: 'rank-map-sword-3', kind: 'minor', suit: 'Sword', number: 3 },
        { id: 'rank-map-pentacle-4', kind: 'minor', suit: 'Pentacle', number: 4 },
        { id: 'rank-map-cup-5', kind: 'minor', suit: 'Cup', number: 5 },
        { id: 'rank-map-reserve', kind: 'minor', suit: 'Sword', number: 14 }
      ];
      window.TarotKingdomDebug.battleScenario({
        withTrick: false,
        handsBySeat: [cards],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [
            { slot: 0, itemId: 'tarot_minor_cup_01', suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' },
            { slot: 1, itemId: 'tarot_minor_wand_02', suit: 'Wand', rank: 2, cardLevel: 1, resonanceId: 'wand-2' }
          ]
        }],
        rules: { arcanaLoadoutEffectsVersion: 3 }
      });
      const played = window.TarotKingdomDebug.battlePlayCards(
        0,
        cards.slice(0, 5).map((card) => card.id),
        { resolve: false }
      );
      return {
        ok: played.ok,
        lastPlay: played.state.lastPlay,
        event: played.state.battle.events.at(-1)
      };
    });

    expect(audit).toMatchObject({
      ok: true,
      lastPlay: {
        type: 'role',
        resonanceContext: { resolvedRByRank: { 1: 8, 2: 0 } }
      },
      event: { resonanceName: '五彩の雫・サイレンスミスト' }
    });
  });

  test('battle start freezes the API tarot deck and activates its matching resonance', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const character = {
        version: 4,
        displayName: 'Profile Player',
        level: 12,
        avatarBase: { Race: 'human', AvatarColor: 'brown', level: 12 },
        equipment: {},
        itemSource: {},
        tarotDeck: [
          { slot: 0, itemId: 'tarot_minor_wand_01', suit: 'Wand', rank: 1, cardLevel: 1, resonanceId: 'wand-1' },
          { slot: 1, itemId: 'tarot_minor_cup_05', suit: 'Cup', rank: 5, cardLevel: 1, resonanceId: 'cup-5' },
          { slot: 2, itemId: 'tarot_minor_sword_10', suit: 'Sword', rank: 10, cardLevel: 1, resonanceId: 'sword-10' },
          { slot: 3, itemId: 'tarot_minor_pentacle_13', suit: 'Pentacle', rank: 13, cardLevel: 1, resonanceId: 'pentacle-13' },
          { slot: 4, itemId: 'minor-sword-14', suit: 'Sword', rank: 14, cardLevel: 1, resonanceId: 'sword-14' }
        ],
        guardianArcana: {
          itemId: 'tarot_major_05',
          number: 5,
          cardLevel: 1,
          passiveId: 'guardian-v3-5',
          passiveName: '魔導士'
        },
        combat: {
          maxHp: 120,
          power: 20,
          defense: 10,
          intelligence: 10,
          speed: 10,
          weaponType: 'unarmed',
          weaponTypes: ['unarmed']
        }
      };
      return window.TarotKingdomDebug.battleLoadProfileAndPlay(character, {
        id: 'loaded-wand-one',
        suit: 'Wand',
        number: 1
      });
    });

    expect(result.applied).toBe(true);
    expect(result.played).toBe(true);
    expect(result.state.players[0].character.source).toBe('playfab');
    expect(result.state.players[0].character.tarotDeck).toHaveLength(5);
    expect(result.state.players[0].character.tarotDeck[0]).toMatchObject({
      itemId: 'tarot_minor_wand_01',
      suit: 'Wand',
      rank: 1
    });
    expect(result.state.players[0].character.guardianArcana).toMatchObject({
      itemId: 'tarot_major_05',
      number: 5,
      passiveName: '魔導士'
    });
    expect(result.state.battle.events.at(-1)).toMatchObject({
      type: 'attack',
      resonanceName: '火炎波',
      guardianPassiveName: '魔導士'
    });
    await expect(page.locator('.tarot-kingdom-effect-banner')).toContainText('守護・魔導士');
  });

  test('profile loading rejects missing equipped Arcana, falls back offline, and permits a truly empty loadout', async ({ page }) => {
    const audit = await page.evaluate(async () => {
      const debug = window.TarotKingdomDebug;
      const emptyProfile = {
        version: 4,
        displayName: 'Profile Player',
        level: 12,
        tarotDeck: [],
        guardianArcana: null,
        combat: {
          maxHp: 120,
          power: 20,
          defense: 10,
          intelligence: 10,
          speed: 10,
          weaponType: 'unarmed',
          weaponTypes: ['unarmed']
        }
      };
      const card = { id: 'empty-profile-card', suit: 'Cup', number: 1 };
      const equippedLocal = {
        tarotDeck: [{ slot: 0, itemId: 'tarot_minor_cup_01', suit: 'Cup', rank: 1 }],
        guardianArcana: { itemId: 'tarot_major_05', number: 5, passiveName: '魔導士' }
      };
      const loadedLocalProfile = {
        ...emptyProfile,
        tarotDeck: equippedLocal.tarotDeck,
        guardianArcana: equippedLocal.guardianArcana
      };
      const missingLoadout = await debug.battleLoadProfileAndPlay(
        emptyProfile,
        card,
        { localLoadout: equippedLocal }
      );
      const partialLoadout = await debug.battleLoadProfileAndPlay(
        {
          ...emptyProfile,
          tarotDeck: [equippedLocal.tarotDeck[0]]
        },
        card,
        {
          localLoadout: {
            ...equippedLocal,
            tarotDeck: [
              ...equippedLocal.tarotDeck,
              { slot: 1, itemId: 'tarot_minor_wand_02', suit: 'Wand', rank: 2 }
            ]
          }
        }
      );
      const offlineFallback = await debug.battleLoadProfileAndPlay(
        emptyProfile,
        card,
        {
          localLoadout: equippedLocal,
          localCharacter: loadedLocalProfile,
          profileFailure: true
        }
      );
      const failedRequest = await debug.battleLoadProfileAndPlay(
        emptyProfile,
        card,
        { localLoadout: equippedLocal, localCharacter: null, profileFailure: true }
      );
      const trulyUnequipped = await debug.battleLoadProfileAndPlay(
        emptyProfile,
        card,
        { localLoadout: { tarotDeck: [], guardianArcana: null } }
      );
      return { missingLoadout, partialLoadout, offlineFallback, failedRequest, trulyUnequipped };
    });

    expect(audit.missingLoadout.applied).toBe(false);
    expect(audit.missingLoadout.state.characterSnapshotReady).toBe(false);
    expect(audit.missingLoadout.state.message).toContain('タロット装備を取得できない');
    expect(audit.partialLoadout.applied).toBe(false);
    expect(audit.partialLoadout.state.characterSnapshotReady).toBe(false);
    expect(audit.partialLoadout.state.message).toContain('タロット装備を取得できない');
    expect(audit.offlineFallback).toMatchObject({ applied: true, played: true });
    expect(audit.offlineFallback.state.players[0].character.tarotDeck).toHaveLength(1);
    expect(audit.offlineFallback.state.players[0].character.tarotDeck[0]).toMatchObject({
      itemId: 'tarot_minor_cup_01',
      suit: 'Cup',
      rank: 1
    });
    expect(audit.offlineFallback.state.players[0].character.guardianArcana).toMatchObject({
      itemId: 'tarot_major_05',
      number: 5,
      passiveName: '魔導士'
    });
    expect(audit.failedRequest.applied).toBe(false);
    expect(audit.failedRequest.state.characterSnapshotReady).toBe(false);
    expect(audit.failedRequest.state.message).toContain('戦闘プロフィールの取得に失敗');
    expect(audit.trulyUnequipped).toMatchObject({ applied: true, played: true });
    expect(audit.trulyUnequipped.state.players[0].character.tarotDeck).toEqual([]);
    expect(audit.trulyUnequipped.state.players[0].character.guardianArcana).toBeNull();
  });

  test('selected minor resonance and major dedicated effects use the compact arcana navigation correctly', async ({ page }) => {
    const character = {
      version: 3,
      tarotDeck: [{
        slot: 0,
        itemId: 'tarot_minor_sword_05',
        suit: 'Sword',
        rank: 5,
        cardLevel: 1,
        resonanceId: 'sword-5'
      }],
      guardianArcana: {
        itemId: 'tarot_major_05',
        number: 5,
        cardLevel: 1,
        passiveId: 'hierophant-skip',
        awakeningId: 'hierophant-awaken'
      }
    };
    await page.evaluate((charactersBySeat) => {
      window.TarotKingdomDebug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[
          { id: 'hud-sword-5', kind: 'minor', suit: 'Sword', number: 5 },
          { id: 'hud-major-5', kind: 'major', suit: 'None', number: 5 },
          { id: 'hud-reserve-6', kind: 'minor', suit: 'Cup', number: 6 }
        ]],
        charactersBySeat
      });
    }, [character]);

    const guardian = page.locator('#tarotKingdomGuardianPassive');
    await expect(guardian).toBeVisible();
    await expect(guardian.locator('#tarotKingdomGuardianPassiveName')).toHaveText('魔導士');
    await expect(guardian.locator('#tarotKingdomGuardianPassiveText')).toHaveText('');

    const exactCard = page.locator('#tarotKingdomHand [data-card-id="hud-sword-5"]');
    await expect(exactCard).toHaveClass(/is-resonant/);
    await expect(exactCard.locator('.tarot-card-resonance-mark')).toHaveCount(0);
    await expect(exactCard.locator('.tarot-card-number')).toHaveCSS(
      'animation-name',
      'tarotKingdomResonanceNumberGlow'
    );
    await exactCard.click();
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('V / 5スキップ');
    await expect(page.locator('#tarotKingdomGuardianPassiveLabel')).toHaveText('共鳴');
    await expect(page.locator('#tarotKingdomGuardianPassiveName')).toBeHidden();
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('盾割り');
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('共鳴100%');
    await expect(page.locator('#tarotKingdomArcanaNav')).toContainText('風属性物理ダメージ');
    await expect(page.locator('#tarotKingdomArcanaNav')).toContainText('25％増加');
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText(/R\d/);

    await exactCard.click();
    const awakenedCard = page.locator('#tarotKingdomHand [data-card-id="hud-major-5"]');
    await expect(awakenedCard.locator('.tarot-card-resonance-mark')).toHaveCount(0);
    await expect(awakenedCard.locator('[aria-label="守護アルカナ覚醒"]')).toHaveCount(0);
    await awakenedCard.click();
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('法王 / 次の2人をスキップ');
    await expect(page.locator('#tarotKingdomSelectedEffectText')).not.toContainText('共鳴');
    await expect(page.locator('#tarotKingdomGuardianPassiveLabel')).toHaveText('守護');
    await expect(page.locator('#tarotKingdomGuardianPassiveName')).toHaveText('魔導士');
    await expect(page.locator('#tarotKingdomGuardianPassiveName')).toBeVisible();
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('盾割り');
    await expect(page.locator('#tarotKingdomGuardianPassiveText')).not.toContainText('27ダメージ');
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('共鳴50%');
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('軽減55%');

    const layout = await page.evaluate(() => {
      const nav = document.getElementById('tarotKingdomSelectedEffect').getBoundingClientRect();
      const arcanaNav = document.getElementById('tarotKingdomArcanaNav').getBoundingClientRect();
      const passive = document.getElementById('tarotKingdomGuardianPassive').getBoundingClientRect();
      const text = document.getElementById('tarotKingdomSelectedEffectText').getBoundingClientRect();
      return {
        navHeight: nav.height,
        arcanaNavHeight: arcanaNav.height,
        arcanaAboveNav: arcanaNav.bottom <= nav.top,
        passiveInsideArcana: passive.top >= arcanaNav.top && passive.bottom <= arcanaNav.bottom,
        textInside: text.top >= nav.top && text.bottom <= nav.bottom,
        overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(layout.navHeight).toBe(48);
    expect(layout.arcanaNavHeight).toBe(22);
    expect(layout.arcanaAboveNav).toBe(true);
    expect(layout.passiveInsideArcana).toBe(true);
    expect(layout.textInside).toBe(true);
    expect(layout.overflowing).toBe(false);

    await page.evaluate((remoteGuardian) => {
      window.TarotKingdomDebug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[{ id: 'local-no-guardian', kind: 'minor', suit: 'Cup', number: 4 }]],
        charactersBySeat: [{ version: 3 }, remoteGuardian]
      });
    }, character);
    await expect(guardian).toBeHidden();
    await expect(page.locator('#tarotKingdomArcanaNav')).toBeHidden();
  });

  test('schema 20 disables guardian awakening while schema 19 keeps the legacy result', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const major = { id: 'guardian-major-1', kind: 'major', suit: 'None', number: 1 };
      const character = {
        version: 3,
        guardianArcana: {
          itemId: 'tarot_major_01',
          number: 1,
          cardLevel: 10,
          passiveId: 'magician-elements',
          awakeningId: 'magician-awaken'
        }
      };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[major]],
        charactersBySeat: [character]
      });
      const current = debug.battlePlayCards(0, [major.id], { resolve: false }).state;

      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[major]],
        charactersBySeat: [character],
        rules: { arcanaLoadoutEffectsVersion: 2 }
      });
      const legacy = debug.battlePlayCards(0, [major.id], { resolve: false }).state;
      return {
        currentEvent: current.battle.events.at(-1),
        legacyEvent: legacy.battle.events.at(-1),
        currentRules: current.rules,
        legacyRules: legacy.rules
      };
    });

    expect(audit.currentRules.arcanaLoadoutEffectsVersion).toBe(7);
    expect(audit.currentEvent).toMatchObject({
      majorAwakened: false,
      awakeningId: ''
    });
    expect(audit.legacyRules.arcanaLoadoutEffectsVersion).toBe(2);
    expect(audit.legacyEvent).toMatchObject({
      majorAwakened: true,
      guardianItemId: 'tarot_major_01',
      guardianCardLevel: 10,
      awakeningId: 'magician-awaken'
    });
  });

  test('schema 19 keeps legacy guardian hooks while schema 20 and 21 do not run them', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const character = {
        version: 4,
        guardianArcana: {
          itemId: 'tarot_major_13',
          number: 13,
          cardLevel: 1,
          passiveId: 'guardian-v3-13'
        }
      };
      debug.battleScenario({
        tableCard: { id: 'legacy-guardian-clear-card', kind: 'minor', suit: 'Sword', number: 5 },
        leaderIndex: 0,
        turnIndex: 0,
        enemyHp: 400,
        enemyDefense: 0,
        charactersBySeat: [character]
      });
      const template = debug.battlePublicState();
      const run = (schema) => {
        const payload = JSON.parse(JSON.stringify(template));
        payload.schema = schema;
        delete payload.state.rules.arcanaLoadoutEffectsVersion;
        const migrated = debug.battleDeserialize(payload);
        const hpBefore = migrated.battle.enemy.hp;
        const cleared = debug.battleClearTrick(0);
        return {
          effectsVersion: cleared.rules.arcanaLoadoutEffectsVersion,
          damage: hpBefore - cleared.battle.enemy.hp,
          hasLegacyGraveBlade: cleared.battle.events.some((event) => (
            event?.type === 'guardian-passive'
            && String(event.label || '').includes('墓標の刃')
          ))
        };
      };
      return {
        schema19: run(19),
        schema20: run(20),
        schema21: run(21)
      };
    });

    expect(audit.schema19).toEqual({
      effectsVersion: 2,
      damage: 8,
      hasLegacyGraveBlade: true
    });
    [audit.schema20, audit.schema21].forEach((current) => {
      expect(current.effectsVersion).toBe(3);
      expect(current.damage).toBe(0);
      expect(current.hasLegacyGraveBlade).toBe(false);
    });
  });

  test('guardian passives heal on Cup play and reward the harder same-rank field response', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const guardian = (number) => ({
        version: 3,
        guardianArcana: {
          itemId: `tarot_major_${String(number).padStart(2, '0')}`,
          number,
          cardLevel: 1,
          passiveId: `guardian-${number}`,
          awakeningId: `awakening-${number}`
        }
      });

      const cupFive = { id: 'guardian-cup-5', kind: 'minor', suit: 'Cup', number: 5 };
      debug.battleScenario({
        tableCard: { id: 'guardian-v3-field-3', kind: 'minor', suit: 'Sword', number: 3 },
        turnIndex: 0,
        handsBySeat: [[cupFive, { id: 'guardian-v3-reserve-8', kind: 'minor', suit: 'Cup', number: 8 }]],
        hpBySeat: [50, 80, 0, 90],
        combatBySeat: [{ maxHp: 100 }, { maxHp: 200 }, { maxHp: 100 }, { maxHp: 100 }],
        charactersBySeat: [guardian(2)],
        rules: { arcanaLoadoutEffectsVersion: 3 }
      });
      const priestessV3 = debug.battlePlayCards(0, [cupFive.id], { resolve: false }).state;

      const fullHpCupFive = { id: 'guardian-v3-full-hp-cup-5', kind: 'minor', suit: 'Cup', number: 5 };
      debug.battleScenario({
        tableCard: { id: 'guardian-v3-full-hp-field-3', kind: 'minor', suit: 'Sword', number: 3 },
        turnIndex: 0,
        handsBySeat: [[fullHpCupFive, { id: 'guardian-v3-full-hp-reserve-8', kind: 'minor', suit: 'Cup', number: 8 }]],
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: [{ maxHp: 100 }, { maxHp: 100 }, { maxHp: 100 }, { maxHp: 100 }],
        charactersBySeat: [guardian(2)],
        rules: { arcanaLoadoutEffectsVersion: 3 }
      });
      const priestessV3AtFullHp = debug.battlePlayCards(0, [fullHpCupFive.id], { resolve: false }).state;

      const silencedCupFive = { id: 'guardian-v3-silenced-cup-5', kind: 'minor', suit: 'Cup', number: 5 };
      debug.battleScenario({
        tableCard: { id: 'guardian-v3-silenced-field-3', kind: 'minor', suit: 'Sword', number: 3 },
        turnIndex: 0,
        handsBySeat: [[silencedCupFive, { id: 'guardian-v3-silenced-reserve-8', kind: 'minor', suit: 'Cup', number: 8 }]],
        hpBySeat: [50, 100, 100, 100],
        combatBySeat: [{ maxHp: 100 }],
        charactersBySeat: [guardian(2)],
        rules: { arcanaLoadoutEffectsVersion: 3 }
      });
      debug.battleSetEffects({
        enemy: {},
        party: {},
        players: [{
          silence: { key: 'silence', label: '沈黙', potency: 1, charges: 1, expiresOn: 'action' }
        }, {}, {}, {}]
      });
      const priestessV3Silenced = debug.battlePlayCards(0, [silencedCupFive.id], { resolve: false }).state;

      debug.battleScenario({
        tableCard: { id: 'guardian-field-3', kind: 'minor', suit: 'Sword', number: 3 },
        turnIndex: 0,
        handsBySeat: [[cupFive, { id: 'guardian-reserve-8', kind: 'minor', suit: 'Cup', number: 8 }]],
        hpBySeat: [50, 100, 100, 100],
        combatBySeat: [{ maxHp: 100 }],
        charactersBySeat: [guardian(2)],
        rules: { arcanaLoadoutEffectsVersion: 2 }
      });
      const priestess = debug.battlePlayCards(0, [cupFive.id], { resolve: false }).state;

      const pentacleFive = { id: 'guardian-pentacle-5', kind: 'minor', suit: 'Pentacle', number: 5 };
      debug.battleScenario({
        tableCard: { id: 'guardian-field-5', kind: 'minor', suit: 'Sword', number: 5 },
        leaderIndex: 1,
        turnIndex: 0,
        handsBySeat: [[pentacleFive, { id: 'guardian-reserve-9', kind: 'minor', suit: 'Cup', number: 9 }]],
        hpBySeat: [50, 50, 50, 50],
        combatBySeat: [{ maxHp: 100 }, { maxHp: 100 }, { maxHp: 100 }, { maxHp: 100 }],
        charactersBySeat: [guardian(14)],
        rules: { arcanaLoadoutEffectsVersion: 2 }
      });
      const temperanceAttempt = debug.battlePlayCards(0, [pentacleFive.id], { resolve: false });
      const temperance = temperanceAttempt.state;
      return { priestessV3, priestessV3AtFullHp, priestessV3Silenced, priestess, temperance, temperanceAttemptOk: temperanceAttempt.ok, temperanceAttemptReason: temperanceAttempt.reason };
    });

    expect(audit.priestessV3.players.map((player) => player.hp)).toEqual([50, 90, 0, 90]);
    expect(audit.priestessV3.battle.events.at(-1)).toMatchObject({
      guardianPassiveName: '白魔道士',
      effectMessage: '味方のHPを10回復'
    });
    expect(audit.priestessV3.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'guardian-passive',
        label: '白魔道士',
        targetIndex: 1,
        amount: 10
      })
    ]));
    expect(audit.priestessV3AtFullHp.players[0].hp).toBe(100);
    expect(audit.priestessV3AtFullHp.battle.events.at(-1)).toMatchObject({ guardianPassiveName: '白魔道士' });
    expect(audit.priestessV3AtFullHp.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'guardian-passive', label: '白魔道士', amount: 0 })
    ]));
    expect(audit.priestessV3Silenced.players[0].hp).toBe(50);
    expect(audit.priestessV3Silenced.battle.events.at(-1)).toMatchObject({
      attackBlocked: false,
      guardianPassiveName: ''
    });
    expect(audit.priestessV3Silenced.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'attack-impairment', statusKey: 'silence' })
    ]));
    expect(audit.priestessV3Silenced.battle.events.at(-1).effects).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'guardian-passive' })
    ]));
    expect(audit.priestess.players[0].hp).toBe(55);
    expect(audit.priestess.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'guardian-passive', label: '聖杯の叡智', amount: 5 })
    ]));
    expect({ ok: audit.temperanceAttemptOk, reason: audit.temperanceAttemptReason }).toEqual({ ok: true, reason: undefined });
    expect(audit.temperance.players.map((player) => player.hp)).toEqual([65, 65, 65, 65]);
    expect(audit.temperance.battle.effects.players.every((effects) => effects.hpShield?.shieldHp === 15)).toBe(true);
  });

  test('guardian v5 Temperance copies the previous confirmed minor result without equipping rank 14', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const swordFive = { id: 'copy-source-sword-5', kind: 'minor', suit: 'Sword', number: 5 };
      const swordFourteen = { id: 'copy-guardian-sword-14', kind: 'minor', suit: 'Sword', number: 14 };
      const character = (tarotDeck, guardianArcana = null) => ({ version: 4, tarotDeck, guardianArcana });
      debug.battleScenario({
        withTrick: false,
        leaderIndex: 1,
        turnIndex: 1,
        handsBySeat: [
          [swordFourteen, { id: 'copy-guardian-reserve', kind: 'minor', suit: 'Cup', number: 2 }],
          [swordFive, { id: 'copy-source-reserve', kind: 'minor', suit: 'Cup', number: 3 }]
        ],
        charactersBySeat: [
          character([{ slot: 0, suit: 'Cup', rank: 2, cardLevel: 1, resonanceId: 'cup-2' }], {
            itemId: 'tarot_major_14', number: 14, cardLevel: 1, passiveId: 'guardian-v5-14'
          }),
          character([{ slot: 0, suit: 'Sword', rank: 5, cardLevel: 1, resonanceId: 'sword-5' }])
        ]
      });
      debug.battleSetCombatRandom(0);
      const source = debug.battlePlayCards(1, [swordFive.id], { resolve: true }).state;
      const sourceEffect = source.battle.events.at(-1).effects.find((effect) => effect.source === 'resonance' && effect.amount > 0);
      debug.battlePass(2);
      debug.battleResolveTransition();
      debug.battlePass(3);
      debug.battleResolveTransition();
      const copiedAttempt = debug.battlePlayCards(0, [swordFourteen.id], { resolve: false });
      const copied = copiedAttempt.state;
      return {
        sourceEffect,
        copiedAttemptOk: copiedAttempt.ok,
        copiedAttemptReason: copiedAttempt.reason,
        copiedEventEffects: copied.battle.events.at(-1).effects,
        copiedEffects: copied.battle.events.at(-1).effects.filter((effect) => effect.source === 'guardian-14-copy'),
        mimicUsed: copied.battle.guardianState?.[0]?.v3?.used?.mimic === true
      };
    });

    expect(audit.sourceEffect.amount).toBeGreaterThan(0);
    expect({ ok: audit.copiedAttemptOk, reason: audit.copiedAttemptReason }).toEqual({ ok: true, reason: undefined });
    expect(audit.copiedEffects).toHaveLength(2);
    expect(audit.copiedEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ copied: true, success: true, kind: 'damage' }),
      expect.objectContaining({ copied: true, success: true, kind: 'status', statusKey: 'vulnerable' })
    ]));
    const copiedDamage = audit.copiedEffects.find((effect) => effect.kind === 'damage');
    expect(copiedDamage.displayAmount).toBe(Math.max(1, Math.floor(audit.sourceEffect.displayAmount * 0.5)));
    expect(audit.mimicUsed).toBe(true);
  });

  test('guardian v4 Temperance can copy the owner previous resonance and Judgment revives only the earliest KO', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const character = (tarotDeck, guardianArcana = null) => ({ version: 4, tarotDeck, guardianArcana });
      const swordFive = { id: 'self-copy-sword-5', kind: 'minor', suit: 'Sword', number: 5 };
      const swordFourteen = { id: 'self-copy-sword-14', kind: 'minor', suit: 'Sword', number: 14 };
      const temperanceCharacter = character([
        { slot: 0, suit: 'Sword', rank: 5, cardLevel: 1, resonanceId: 'sword-5' },
        { slot: 1, suit: 'Sword', rank: 14, cardLevel: 1, resonanceId: 'sword-14' }
      ], {
        itemId: 'tarot_major_14', number: 14, cardLevel: 1, passiveId: 'guardian-v4-14'
      });
      const runSelfCopy = (effectsVersion) => {
        debug.battleScenario({
          tableCard: { id: `self-copy-field-${effectsVersion}`, kind: 'minor', suit: 'Sword', number: 3 },
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          handsBySeat: [[
            swordFive,
            swordFourteen,
            { id: `self-copy-reserve-${effectsVersion}`, kind: 'minor', suit: 'Cup', number: 9 }
          ]],
          charactersBySeat: [temperanceCharacter],
          rules: { arcanaLoadoutEffectsVersion: effectsVersion }
        });
        debug.battleSetCombatRandom(0);
        debug.battlePlayCards(0, [swordFive.id], { resolve: true });
        const copiedAttempt = debug.battlePlayCards(0, [swordFourteen.id], { resolve: false });
        const copiedEvent = copiedAttempt.state.battle.events.at(-1);
        return {
          ok: copiedAttempt.ok,
          reason: copiedAttempt.reason || '',
          effects: (copiedEvent?.effects || []).filter((effect) => effect.source === 'guardian-14-copy')
        };
      };

      const justice = { id: 'guardian-judgment-eleven', kind: 'minor', suit: 'Sword', number: 11 };
      debug.battleScenario({
        tableCard: { id: 'guardian-judgment-field-ten', kind: 'minor', suit: 'Cup', number: 10 },
        turnIndex: 0,
        hpBySeat: [100, 0, 0, 100],
        koOrder: [2, 1],
        handsBySeat: [[justice, { id: 'guardian-judgment-reserve', kind: 'minor', suit: 'Wand', number: 9 }]],
        charactersBySeat: [character([], {
          itemId: 'tarot_major_20', number: 20, cardLevel: 1, passiveId: 'guardian-v4-20'
        })]
      });
      const judgment = debug.battlePlayCards(0, [justice.id], { resolve: false }).state;
      return {
        v4SelfCopy: runSelfCopy(4),
        v3SelfCopy: runSelfCopy(3),
        judgmentHp: judgment.players.map((player) => player.hp),
        judgmentEffects: (judgment.battle.events.at(-1)?.effects || []).filter((effect) => effect.source === 'guardian-passive')
      };
    });

    expect(audit.v4SelfCopy).toMatchObject({ ok: true, reason: '' });
    expect(audit.v4SelfCopy.effects).toHaveLength(1);
    expect(audit.v4SelfCopy.effects[0]).toMatchObject({ copied: true, success: true });
    expect(audit.v3SelfCopy).toMatchObject({ ok: true, reason: '', effects: [] });
    expect(audit.judgmentHp[1]).toBe(0);
    expect(audit.judgmentHp[2]).toBeGreaterThan(0);
    expect(audit.judgmentEffects).toHaveLength(1);
    expect(audit.judgmentEffects[0]).toMatchObject({
      label: 'ビショップ',
      targetIndex: 2
    });
  });

  test('guardian v4 Hermit starts at forty evasion points', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const run = (withGuardian) => {
        debug.battleScenario({
          tableCard: { id: `hermit-field-${withGuardian}`, kind: 'minor', suit: 'Cup', number: 4 },
          turnIndex: 0,
          handsBySeat: [[{ id: `hermit-hand-${withGuardian}`, kind: 'minor', suit: 'Wand', number: 6 }]],
          charactersBySeat: [{
            version: 4,
            guardianArcana: withGuardian
              ? { itemId: 'tarot_major_09', number: 9, cardLevel: 1, passiveId: 'guardian-v4-9' }
              : null
          }]
        });
        debug.battleSetCombatRandom(0.99);
        const state = debug.battlePass(0);
        const event = state.battle.events.findLast((entry) => entry.type === 'enemy-single');
        return event?.damages?.[0]?.hitChance ?? null;
      };
      return { normal: run(false), hermit: run(true) };
    });

    expect(audit.normal).not.toBeNull();
    expect(audit.hermit).not.toBeNull();
    expect(audit.normal - audit.hermit).toBeCloseTo(0.4, 5);
  });

  test('guardian v5 Scholar maximizes resonance and reverses only normal and weapon combat values', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const run = (effectsVersion, withScholar) => {
        const card = { id: `scholar-${effectsVersion}-${withScholar}`, kind: 'minor', suit: 'Cup', number: 1 };
        debug.battleScenario({
          reverse: true,
          tableCard: { id: `scholar-field-${effectsVersion}-${withScholar}`, kind: 'minor', suit: 'Wand', number: 1 },
          turnIndex: 0,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          handsBySeat: [[card, { id: `scholar-reserve-${effectsVersion}-${withScholar}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          combatBySeat: [{ power: 40, intelligence: 40, weaponType: 'polearm', weaponTypes: ['polearm'] }],
          charactersBySeat: [{
            version: 4,
            tarotDeck: [{ slot: 0, suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' }],
            guardianArcana: withScholar
              ? { itemId: 'tarot_major_11', number: 11, cardLevel: 1, passiveId: 'guardian-v5-11' }
              : null
          }],
          rules: { arcanaLoadoutEffectsVersion: effectsVersion }
        });
        debug.battleSetCombatRandom(0);
        const rebuilt = debug.battleRebuildAction(0, { selectedCardIds: [card.id] });
        const played = debug.battlePlayCards(0, [card.id], { resolve: false });
        const event = played.state.battle.events.at(-1);
        return {
          ok: played.ok,
          rebuiltOk: rebuilt.ok,
          baseDamage: event.baseDamage,
          weaponDamage: event.effects.find((effect) => effect.source === 'weapon')?.displayAmount || 0,
          resonanceR: event.effects.find((effect) => effect.source === 'resonance')?.resolvedR ?? null,
          reason: played.reason || '',
          trickNumber: played.state.trick?.number,
          displayedNumber: played.state.trick?.cardsTable?.[0]?.number
        };
      };
      return {
        normalV5: run(5, false),
        scholarV5: run(5, true),
        scholarV4: run(4, true)
      };
    });

    expect(audit.scholarV5).toMatchObject({ ok: true, rebuiltOk: true, resonanceR: 10, trickNumber: 1, displayedNumber: 1 });
    expect(audit.scholarV5.baseDamage).toBeGreaterThan(audit.normalV5.baseDamage);
    expect(audit.scholarV5.weaponDamage).toBeGreaterThan(audit.normalV5.weaponDamage);
    expect(audit.scholarV5.baseDamage).toBeGreaterThan(audit.scholarV4.baseDamage);
    expect(audit.scholarV5.weaponDamage).toBeGreaterThan(audit.scholarV4.weaponDamage);
  });

  test('guardian v5 Hero counts exact submitted cards and consumes its enemy stop once', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const character = {
        version: 4,
        tarotDeck: [{ slot: 0, suit: 'Cup', rank: 7, cardLevel: 1, resonanceId: 'cup-7' }],
        guardianArcana: { itemId: 'tarot_major_21', number: 21, cardLevel: 1, passiveId: 'guardian-v5-21' }
      };
      const run = (count) => {
        const cards = Array.from({ length: count }, (_, index) => ({
          id: `hero-cup-7-${count}-${index}`,
          kind: 'minor', suit: 'Cup', number: 7
        }));
        debug.battleScenario({
          withTrick: false,
          turnIndex: 0,
          hpBySeat: [40, 50, 60, 70],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100, defense: 0 })),
          handsBySeat: [[...cards, { id: `hero-reserve-${count}`, kind: 'minor', suit: 'Sword', number: 9 }]],
          charactersBySeat: [character],
          rules: { arcanaLoadoutEffectsVersion: 5 }
        });
        const playedResult = debug.battlePlayCards(0, cards.map((card) => card.id), { resolve: true });
        const played = playedResult.state;
        const afterPlay = JSON.parse(JSON.stringify(played));
        let afterFirstEnemyAction = null;
        let afterSecondEnemyAction = null;
        if (count === 2) {
          afterFirstEnemyAction = debug.battlePass(played.turn);
          debug.battleResolveTransition();
          const next = debug.battlePublicState();
          afterSecondEnemyAction = debug.battlePass(next.turn);
        }
        return { ok: playedResult.ok, reason: playedResult.reason || '', afterPlay, afterFirstEnemyAction, afterSecondEnemyAction };
      };
      return { one: run(1), two: run(2) };
    });

    expect(audit.one.afterPlay.battle.guardianState[0].v3.counters.resonance).toBe(1);
    expect(audit.one.afterPlay.battle.guardianState[0].v3.used.hero).not.toBe(true);
    expect(audit.two).toMatchObject({ ok: true, reason: '' });
    expect(audit.two.afterPlay.players.map((player) => player.hp)).toEqual([100, 100, 100, 100]);
    expect(audit.two.afterPlay.battle.guardianState[0].v3.used.hero).toBe(true);
    expect(audit.two.afterFirstEnemyAction.battle.events.at(-1)).toMatchObject({ type: 'enemy-status', attackStopped: true });
    expect(audit.two.afterFirstEnemyAction.battle.effects.enemy.timeStop).toBeUndefined();
    expect(audit.two.afterSecondEnemyAction.battle.events.at(-1).type).toBe('enemy-single');
  });

  test('guardian v5 Bard spreads its own resonance and Necromancer counts every minor grave', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const cupAce = { id: 'bard-cup-ace', kind: 'minor', suit: 'Cup', number: 1 };
      debug.battleScenario({
        tableCard: { id: 'bard-field', kind: 'minor', suit: 'Wand', number: 1 },
        handsBySeat: [[cupAce, { id: 'bard-reserve', kind: 'minor', suit: 'Cup', number: 4 }]],
        hpBySeat: [50, 20, 50, 50],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Cup', rank: 1, cardLevel: 1, resonanceId: 'cup-1' }],
          guardianArcana: { itemId: 'tarot_major_06', number: 6, cardLevel: 1, passiveId: 'guardian-v5-6' }
        }],
        rules: { arcanaLoadoutEffectsVersion: 5 }
      });
      const bard = debug.battlePlayCards(0, [cupAce.id], { resolve: false }).state;

      const wandAce = { id: 'necro-wand-ace', kind: 'minor', suit: 'Wand', number: 1 };
      const minorDiscard = (id, suit, number) => ({ id, kind: 'minor', suit, number });
      debug.battleScenario({
        tableCard: { id: 'necro-field', kind: 'minor', suit: 'Pentacle', number: 1 },
        enemyHp: 5000,
        enemyMaxHp: 5000,
        enemyDefense: 0,
        handsBySeat: [[wandAce, { id: 'necro-reserve', kind: 'minor', suit: 'Cup', number: 4 }]],
        hpBySeat: [30, 100, 100, 100],
        combatBySeat: [{ maxHp: 100, power: 100 }],
        discardsBySeat: [
          [minorDiscard('grave-1', 'Cup', 2), { id: 'grave-major', kind: 'major', number: 3 }],
          [minorDiscard('grave-2', 'Wand', 3), minorDiscard('grave-3', 'Sword', 4)],
          [minorDiscard('grave-4', 'Pentacle', 5)],
          [minorDiscard('grave-5', 'Cup', 6)]
        ],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Wand', rank: 1, cardLevel: 1, resonanceId: 'wand-1' }],
          guardianArcana: { itemId: 'tarot_major_13', number: 13, cardLevel: 1, passiveId: 'guardian-v5-13' }
        }],
        rules: { arcanaLoadoutEffectsVersion: 5 }
      });
      const necro = debug.battlePlayCards(0, [wandAce.id], { resolve: false }).state;
      return { bard, necro };
    });

    expect(audit.bard.players[1].hp).toBeGreaterThan(20);
    expect(audit.bard.players[0].hp).toBeGreaterThan(50);
    expect(audit.bard.players[2].hp).toBeGreaterThan(50);
    expect(audit.bard.players[3].hp).toBeGreaterThan(50);
    const necroResonance = audit.necro.battle.events.at(-1).effects.find((effect) => (
      effect.source === 'resonance' && effect.drain
    ));
    expect(necroResonance.drain.rate).toBe(10);
    expect(audit.necro.players[0].hp).toBeGreaterThan(30);
  });

  test('guardian v5 Shaman gains only one stage from multiple status attempts in one action', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const wandSix = { id: 'shaman-wand-six', kind: 'minor', suit: 'Wand', number: 6 };
      debug.battleScenario({
        tableCard: { id: 'shaman-field-five', kind: 'minor', suit: 'Wand', number: 5 },
        enemyHp: 5000,
        enemyMaxHp: 5000,
        handsBySeat: [[wandSix, { id: 'shaman-reserve', kind: 'minor', suit: 'Cup', number: 9 }]],
        combatBySeat: [{ weaponType: 'gun', weaponTypes: ['gun'], intelligence: 100 }],
        charactersBySeat: [{
          version: 4,
          tarotDeck: [{ slot: 0, suit: 'Wand', rank: 6, cardLevel: 1, resonanceId: 'wand-6' }],
          guardianArcana: { itemId: 'tarot_major_01', number: 1, cardLevel: 1, passiveId: 'guardian-v5-1' }
        }],
        rules: { arcanaLoadoutEffectsVersion: 5 }
      });
      debug.battleSetCombatRandom(0);
      const playedResult = debug.battlePlayCards(0, [wandSix.id], { resolve: false });
      const played = playedResult.state;
      const effects = played.battle.events.at(-1)?.effects || [];
      return {
        stage: played.battle.guardianState?.[0]?.v3?.counters?.statusAttempts,
        ok: playedResult.ok,
        reason: playedResult.reason || '',
        eventTypes: played.battle.events.map((event) => event.type),
        allEffects: effects,
        attemptedSources: effects.filter((effect) => (
          effect.kind === 'status' && ['weapon', 'resonance'].includes(effect.source)
        )).map((effect) => effect.source),
        guardianResults: effects.filter((effect) => effect.label === '呪術師')
      };
    });

    expect(audit).toMatchObject({ ok: true, reason: '' });
    expect(audit.attemptedSources).toEqual(expect.arrayContaining(['weapon', 'resonance']));
    expect(audit.stage).toBe(1);
    expect(audit.guardianResults).toHaveLength(1);
    expect(audit.guardianResults[0]).toMatchObject({ potency: 5, success: true });
  });

  test('guardian v5 Priest can revive again in the same round when its owner starts 11-back again', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const character = {
        version: 4,
        guardianArcana: { itemId: 'tarot_major_20', number: 20, cardLevel: 1, passiveId: 'guardian-v5-20' }
      };
      const runActivation = (suffix, guardianState = null) => {
        const justice = { id: `priest-justice-${suffix}`, kind: 'minor', suit: 'Sword', number: 11 };
        debug.battleScenario({
          tableCard: { id: `priest-field-${suffix}`, kind: 'minor', suit: 'Sword', number: 10 },
          turnIndex: 0,
          hpBySeat: [100, 0, 100, 100],
          combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
          koOrder: [1],
          handsBySeat: [[justice, { id: `priest-reserve-${suffix}`, kind: 'minor', suit: 'Cup', number: 9 }]],
          charactersBySeat: [character],
          rules: { arcanaLoadoutEffectsVersion: 5 },
          guardianState
        });
        const playedResult = debug.battlePlayCards(0, [justice.id], { resolve: false });
        const played = playedResult.state;
        return {
          ok: playedResult.ok,
          reason: playedResult.reason || '',
          reverse: played.reverse,
          guardian: played.players[0]?.character?.guardianArcana,
          hp: played.players[1].hp,
          guardianState: played.battle.guardianState,
          effects: (played.battle.events.at(-1)?.effects || []).filter((effect) => effect.label === 'ビショップ')
        };
      };
      const first = runActivation('first');
      const second = runActivation('second', first.guardianState);
      return { first, second };
    });

    [audit.first, audit.second].forEach((activation) => {
      expect(activation.hp).toBe(10);
      expect(activation.effects).toHaveLength(1);
      expect(activation.effects[0]).toMatchObject({ targetIndex: 1, amount: 10 });
    });
    expect(audit.first.guardianState[0].v3.used.judgment).not.toBe(true);
    expect(audit.second.guardianState[0].v3.used.judgment).not.toBe(true);
  });

  test('schema 26 keeps guardian v4 while schema 27 enables guardian v5', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false });
      const template = debug.battlePublicState();
      const run = (schema) => {
        const payload = JSON.parse(JSON.stringify(template));
        payload.schema = schema;
        payload.state.rules.arcanaLoadoutEffectsVersion = 5;
        return debug.battleDeserialize(payload).rules.arcanaLoadoutEffectsVersion;
      };
      return { schema26: run(26), schema27: run(27) };
    });

    expect(audit).toEqual({ schema26: 4, schema27: 5 });
  });

  test('compact ailments and resonance number glow fit 390px and 900px layouts', async ({ page }) => {
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1200 });
      const audit = await page.evaluate(() => {
        const debug = window.TarotKingdomDebug;
        debug.battleScenario({
          withTrick: false,
          handsBySeat: [[
            { id: 'responsive-resonance', kind: 'minor', suit: 'Sword', number: 5 },
            { id: 'responsive-reserve', kind: 'minor', suit: 'Cup', number: 9 }
          ]]
        });
        debug.battleSetEffects({
          enemy: { poison: { key: 'poison', potency: 4 }, blind: { key: 'blind', potency: 25 } },
          party: { areaGuard: { key: 'areaGuard', potency: 30, charges: 1 } },
          players: [{
            guard: { key: 'guard', potency: 20, charges: 1 },
            sleep: { key: 'sleep', label: '睡眠', charges: 1 },
            freeze: { key: 'freeze', label: '凍結', charges: 1 }
          }, {}, {}, {}]
        });
        const nodes = Array.from(document.querySelectorAll('.tarot-card.is-resonant .tarot-card-number'));
        return {
          overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          resonanceMarkerCount: document.querySelectorAll('.tarot-card-resonance-mark').length,
          resonanceAnimations: nodes.map((node) => getComputedStyle(node).animationName),
          legacyStatusMarkerCount: document.querySelectorAll('.tarot-kingdom-status-tray, .tarot-kingdom-status-icon').length,
          ailmentLabels: Array.from(document.querySelectorAll('[data-player-index="0"] .tarot-kingdom-battle-status-icon')).map((node) => node.getAttribute('aria-label')),
          primaryStatus: document.querySelector('[data-player-index="0"] .tarot-kingdom-status-accent')?.dataset.status || '',
          boxes: nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          })
        };
       });
       expect(audit.overflowing).toBe(false);
       expect(audit.resonanceMarkerCount).toBe(0);
       expect(audit.resonanceAnimations).toEqual(['tarotKingdomResonanceNumberGlow']);
       expect(audit.legacyStatusMarkerCount).toBe(0);
       expect(audit.ailmentLabels).toEqual(['状態異常：凍結', '補助：防御']);
       expect(audit.primaryStatus).toBe('freeze');
      expect(audit.boxes.length).toBeGreaterThanOrEqual(1);
      audit.boxes.forEach((box) => {
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(width + 0.5);
        expect(box.width).toBeLessThanOrEqual(18);
        expect(box.height).toBeLessThanOrEqual(18);
      });
    }
  });

  test('enemy HP zero stops enemy damage but keeps player attack events', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        enemyHp: 0,
        rules: { enemyDefeatMode: 'hand-empty' },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const afterPass = debug.battlePass(1);

      debug.battleScenario({
        enemyHp: 0,
        rules: { enemyDefeatMode: 'hand-empty' },
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const afterPlay = debug.battlePlayOne(1, { resolve: false });
      return { afterPass, afterPlay };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.afterPass.players.map((player) => player.hp)).toEqual([100, 100, 100, 100]);
    expect(audit.afterPass.battle.events).toEqual([]);
    expect(audit.afterPass.battle.outcome).toBeNull();
    expect(audit.afterPlay.battle.events).toHaveLength(1);
    expect(audit.afterPlay.battle.events[0]).toMatchObject({ type: 'attack', damage: 0, attackStopped: true });
    expect(audit.afterPlay.transition.kind).toBe('play');
  });

  test('enemy HP zero clears immediately by default while rush mode waits for hand zero', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const hand = (prefix) => [
        { id: `${prefix}-attack`, kind: 'minor', suit: 'Cup', number: 4 },
        { id: `${prefix}-reserve`, kind: 'minor', suit: 'Cup', number: 6 }
      ];
      const run = (enemyDefeatMode) => {
        debug.battleScenario({
          withTrick: false,
          enemyHp: 1,
          enemyDefense: 0,
          handsBySeat: [hand(enemyDefeatMode)],
          rules: { enemyDefeatMode }
        });
        return debug.battlePlayOne(0);
      };
      const immediate = run('hp-zero');
      const rush = run('hand-empty');
      const hostPublicState = debug.battlePublicState();
      const legacy = debug.battleDeserialize({
        schema: 12,
        state: {
          rules: {
            initialHandSize: 8,
            handLimit: 8,
            playerCount: 4
          }
        }
      });
      return { immediate, rush, hostPublicState, legacy };
    });

    expect(audit.immediate.battle).toMatchObject({
      outcome: 'victory',
      resultReason: 'enemy-defeated'
    });
    expect(audit.immediate.players[0].hand).toHaveLength(1);
    expect(audit.immediate.phase).toBe('roundOutCinematic');
    expect(audit.immediate.battle.events.at(-1)).toMatchObject({
      type: 'victory',
      actorIndex: 0,
      finisher: true,
      enemyEscaped: false
    });

    expect(audit.rush.battle.enemy.hp).toBe(0);
    expect(audit.rush.battle.outcome).toBeNull();
    expect(audit.rush.players[0].hand).toHaveLength(1);
    expect(audit.rush.rules.enemyDefeatMode).toBe('hand-empty');
    expect(audit.hostPublicState.schema).toBe(30);
    expect(audit.hostPublicState.state.rules.enemyDefeatMode).toBe('hand-empty');
    expect(audit.legacy.rules.enemyDefeatMode).toBe('hand-empty');
  });

  test('HP-zero victory ranks remaining hands and carries one last-hit star into the next hand', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = (id, number) => ({ id, kind: 'minor', suit: 'Cup', number });
      const resolveWinner = (handsBySeat, lastHitIndex) => {
        debug.battleScenario({
          withTrick: false,
          handsBySeat,
          rules: { enemyDefeatMode: 'hp-zero' }
        });
        return debug.battleHpZeroWinner(lastHitIndex);
      };
      const comparisons = {
        handCount: resolveWinner([
          [card('count-0a', 14), card('count-0b', 13), card('count-0c', 12)],
          [card('count-1', 2)],
          [card('count-2a', 10), card('count-2b', 9)],
          [card('count-3a', 8), card('count-3b', 7)]
        ], 0),
        highCard: resolveWinner([
          [card('high-0a', 10), card('high-0b', 4)],
          [card('high-1a', 11), card('high-1b', 1)],
          [card('high-2a', 9), card('high-2b', 8)],
          [card('high-3a', 7), card('high-3b', 6)]
        ], 0),
        total: resolveWinner([
          [card('total-0a', 10), card('total-0b', 4)],
          [card('total-1a', 10), card('total-1b', 7)],
          [card('total-2a', 9), card('total-2b', 8)],
          [card('total-3a', 7), card('total-3b', 6)]
        ], 0),
        exactTie: resolveWinner([
          [card('tie-0a', 10), card('tie-0b', 7)],
          [card('tie-1a', 10), card('tie-1b', 7)],
          [card('tie-2a', 9), card('tie-2b', 8)],
          [card('tie-3a', 7), card('tie-3b', 6)]
        ], 1)
      };

      window.myPlayFabId = 'PF_HAND_RANK_OWNER';
      const stage = {
        stageNo: 1,
        stageId: 'tarot_stage_1',
        stageName: '珊瑚の浅瀬',
        monsters: [
          { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
          { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
          { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
          { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
        ]
      };
      debug.battleScenario({
        stage,
        withTrick: false,
        enemyHp: 1,
        enemyDefense: 0,
        handsBySeat: [
          [card('last-hit-attack', 14), card('last-hit-low-a', 2), card('last-hit-low-b', 3)],
          [card('hand-winner', 10)],
          [card('other-2a', 5), card('other-2b', 4)],
          [card('other-3a', 7), card('other-3b', 6)]
        ],
        rules: { enemyDefeatMode: 'hp-zero' }
      });
      const roundOut = debug.battlePlayOne(0);
      const victoryEvent = roundOut.battle.events.at(-1);
      const stageFinisher = roundOut.stage.finishers[0];
      const settled = debug.battleResolveTransition();
      const nextHand = debug.battleNextRound();
      return { comparisons, roundOut, victoryEvent, stageFinisher, settled, nextHand };
    });

    expect(audit.comparisons.handCount.winnerIndex).toBe(1);
    expect(audit.comparisons.highCard.winnerIndex).toBe(1);
    expect(audit.comparisons.total.winnerIndex).toBe(1);
    expect(audit.comparisons.exactTie.winnerIndex).toBe(1);
    expect(audit.victoryEvent).toMatchObject({
      type: 'victory',
      actorIndex: 1,
      lastHitIndex: 0,
      lastHitStarBonus: 1
    });
    expect(audit.stageFinisher).toMatchObject({
      playerIndex: 0,
      defeatMode: 'hp-zero'
    });
    expect(audit.stageFinisher.playFabId).not.toBe('');
    expect(audit.settled.roundSettlement).toMatchObject({
      winnerIndex: 1,
      victoryMethod: 'hp-zero-hand-rank',
      winnerHandCount: 1,
      winnerHighCard: 10,
      winnerNumberTotal: 10,
      lastHitIndex: 0,
      lastHitStarBonus: 1
    });
    expect(audit.settled.players.map((player) => player.stars)).toEqual([1, 0, 0, 0]);
    expect(audit.nextHand.players.map((player) => player.stars)).toEqual([2, 1, 1, 1]);
  });

  test('an opening 8 replaces the previous death sprite before petrification freezes the new monster', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const stage = {
        stageNo: 1,
        stageId: 'tarot_stage_1',
        stageName: '珊瑚の浅瀬',
        monsters: [
          { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
          { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
          { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
          { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
        ]
      };
      const sprite = document.getElementById('tarotKingdomEnemySprite');
      debug.battleScenario({
        stage,
        handNo: 0,
        enemyHp: 0,
        withTrick: false
      });
      debug.battleFinishRound(0);
      const deathImage = sprite.style.backgroundImage;

      const opening = debug.battleSetupHandWithOpening(8);
      const enterVisual = {
        image: sprite.style.backgroundImage,
        petrifiedClass: sprite.classList.contains('is-petrified')
      };
      debug.battleCardFlipPreview(0);
      const dealtVisual = {
        image: sprite.style.backgroundImage,
        petrifiedClass: sprite.classList.contains('is-petrified')
      };
      return { deathImage, opening, enterVisual, dealtVisual };
    });

    expect(audit.deathImage).toContain('/vol1/monster-07/death.png');
    expect(audit.opening.battle.enemy).toMatchObject({
      id: 'ismartal-vol3-monster-04',
      petrifiedUntilClear: true
    });
    expect(audit.enterVisual.image).toContain('/vol3/monster-04/idle.png');
    expect(audit.enterVisual.image).not.toBe(audit.deathImage);
    expect(audit.enterVisual.petrifiedClass).toBe(false);
    expect(audit.dealtVisual.image).toContain('/vol3/monster-04/idle.png');
    expect(audit.dealtVisual.petrifiedClass).toBe(true);
  });

  test('pet finishers retain the owner identity and the active defeat mode for recruitment', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const previousPlayFabId = window.myPlayFabId;
      window.myPlayFabId = 'PF_PET_OWNER';
      const stage = {
        stageNo: 1,
        stageId: 'tarot_stage_1',
        stageName: '珊瑚の浅瀬',
        monsters: [
          { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン' },
          { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' },
          { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル' },
          { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル' }
        ]
      };
      const pet = { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン' };
      const card = (id, number) => ({ id, kind: 'minor', suit: 'Cup', number });
      const run = (enemyDefeatMode, enemyHp, cards) => {
        debug.battleScenario({
          stage,
          pet,
          withTrick: false,
          turnIndex: 1,
          enemyHp,
          enemyDefense: 0,
          handsBySeat: [
            [card(`owner-${enemyDefeatMode}`, 2)],
            cards,
            [card(`mercenary-1-${enemyDefeatMode}`, 3)],
            [card(`mercenary-2-${enemyDefeatMode}`, 5)]
          ],
          rules: { enemyDefeatMode }
        });
        return debug.battlePlayOne(1).stage.finishers[0];
      };
      const hpZero = run('hp-zero', 1, [
        card('pet-hp-zero-attack', 14),
        card('pet-hp-zero-reserve', 4)
      ]);
      const handEmpty = run('hand-empty', 0, [
        card('pet-hand-empty-final', 4)
      ]);
      window.myPlayFabId = previousPlayFabId;
      return { hpZero, handEmpty };
    });

    expect(audit.hpZero).toMatchObject({
      playerIndex: 1,
      playFabId: 'PF_PET_OWNER',
      isNpc: true,
      isPet: true,
      defeatMode: 'hp-zero'
    });
    expect(audit.handEmpty).toMatchObject({
      playerIndex: 1,
      playFabId: 'PF_PET_OWNER',
      isNpc: true,
      isPet: true,
      defeatMode: 'hand-empty'
    });
  });

  test('raid transforms after the disguise reaches zero and ends after one hand', async ({ page }) => {
    const raid = {
      attemptId: 'raid-attempt-debug',
      raidId: 'raid-debug',
      nation: 'fire',
      bossId: 'ismartal-vol2-monster-07',
      bossName: 'バルガン',
      preFormMonsterId: 'ismartal-vol3-monster-01',
      preFormMonsterName: 'グラヴァ',
      bossMaxHp: 250000,
      bossHpAtStart: 250000
    };
    const card = (id, number) => ({ id, kind: 'minor', suit: 'Cup', number });
    const audit = await page.evaluate(({ raid, cards }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        enemyHp: 1,
        enemyDefense: 0,
        handsBySeat: [[cards[0], cards[1]]],
        raid
      });
      const transformed = debug.battlePlayOne(0);
      const transformVisual = {
        stageClass: document.querySelector('#tarotKingdomBattleStage')?.className || '',
        cutinClass: document.querySelector('#tarotKingdomCutin')?.className || '',
        cutinText: document.querySelector('#tarotKingdomCutin')?.textContent || ''
      };

      debug.battleScenario({
        withTrick: false,
        enemyHp: 1,
        enemyDefense: 0,
        handsBySeat: [[cards[0], cards[1]]],
        raid: { ...raid, phase: 'boss' }
      });
      const defeated = debug.battlePlayOne(0);
      const defeatedResult = debug.battleExplorationResult();
      const completedDefeat = debug.battleResolveTransition();

      debug.battleScenario({
        withTrick: false,
        enemyHp: 250000,
        enemyDefense: 0,
        handsBySeat: [[cards[0]]],
        raid: { ...raid, phase: 'boss' }
      });
      const escaped = debug.battlePlayOne(0);
      const escapedResult = debug.battleExplorationResult();
      const completedEscape = debug.battleResolveTransition();
      return {
        transformed,
        transformVisual,
        defeated,
        defeatedResult,
        completedDefeat,
        escaped,
        escapedResult,
        completedEscape
      };
    }, {
      raid,
      cards: [card('raid-attack', 14), card('raid-reserve', 2)]
    });

    expect(audit.transformed.raid).toMatchObject({
      phase: 'boss',
      damageDealt: 0,
      lastObservedBossHp: 250000
    });
    expect(audit.transformed.battle.enemy).toMatchObject({
      id: 'ismartal-vol2-monster-07',
      name: 'バルガン',
      maxHp: 250000,
      hp: 250000
    });
    expect(audit.transformed.battle.battlefield).toMatchObject({
      id: 'raid-eclipse-altar',
      surface: 'raid-stone',
      groundStartPercent: 36
    });
    expect(audit.transformed.battle.outcome).toBeNull();
    expect(audit.transformed.battle.events.at(-1)).toMatchObject({
      type: 'raid-transform',
      bossId: 'ismartal-vol2-monster-07'
    });
    expect(audit.transformed.transition).toMatchObject({
      kind: 'raidTransform',
      actorIndex: 0
    });
    expect(audit.transformVisual.stageClass).toContain('is-raid-transforming');
    expect(audit.transformVisual.stageClass).toContain('is-raid-battle');
    expect(audit.transformVisual.stageClass).toContain('is-raid-boss-phase');
    expect(audit.transformVisual.cutinClass).toContain('is-kingdom-raid-transform');
    expect(audit.transformVisual.cutinClass).toContain('is-tone-danger');
    expect(audit.transformVisual.cutinText).toContain('TRANSFORM');

    expect(audit.defeated.battle).toMatchObject({
      outcome: 'victory',
      resultReason: 'enemy-defeated'
    });
    expect(audit.defeated.players[0].hand).toHaveLength(1);
    expect(audit.defeatedResult.raid).toMatchObject({
      bossDefeatedLocally: true,
      escaped: false,
      damageDealt: 250000,
      finisher: expect.objectContaining({ playerIndex: 0, isNpc: false })
    });
    expect(audit.completedDefeat).toMatchObject({
      phase: 'done',
      handNo: 1,
      champion: null,
      roundSettlement: expect.objectContaining({ raid: true, matchDone: true })
    });

    expect(audit.escaped.battle).toMatchObject({
      outcome: 'victory',
      resultReason: 'enemy-escaped'
    });
    expect(audit.escapedResult.raid).toMatchObject({
      bossDefeatedLocally: false,
      escaped: true
    });
    expect(audit.completedEscape).toMatchObject({
      phase: 'done',
      handNo: 1,
      champion: null,
      roundSettlement: expect.objectContaining({ raid: true, matchDone: true })
    });
  });

  test('KO skips without retaliation, hand zero wins, and the last survivor retreats', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 0, 100, 100],
        combatBySeat
      });
      const forcedSkip = debug.battlePass(1);

      debug.battleScenario({
        turnIndex: 0,
        leaderIndex: 3,
        handCounts: [1, 3, 3, 3],
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const handWin = debug.battlePlayOne(0, { emptyHand: true });

      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [0, 1, 0, 100],
        combatBySeat
      });
      debug.battleSetExplorationSession(true);
      const partyLoss = debug.battlePass(1);
      const lethalAvatar = document.getElementById('tarotKingdomBattleAvatar-1');
      const lethalVisual = {
        hurt: lethalAvatar?.classList.contains('is-avatar-damaged') || false,
        ko: lethalAvatar?.classList.contains('is-avatar-defeated') || false,
        defeatStage: document.getElementById('tarotKingdomBattleStage')?.classList.contains('is-defeat') || false,
        restartVisible: document.getElementById('tarotKingdomRestartButton')?.offsetParent != null
      };
      return { forcedSkip, handWin, partyLoss, lethalVisual };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.forcedSkip.battle.events).toEqual([]);
    expect(audit.forcedSkip.players[1].hp).toBe(0);
    expect(audit.forcedSkip.turn).toBe(2);
    expect(audit.handWin.battle).toMatchObject({ outcome: 'victory', resultReason: 'enemy-escaped' });
    expect(audit.handWin.battle.enemy.hp).toBeGreaterThan(0);
    expect(audit.handWin.battle.events.at(-1)).toMatchObject({
      type: 'victory',
      finisher: false,
      enemyEscaped: true,
      escapeAnimation: 'idle'
    });
    expect(audit.handWin.phase).toBe('roundOutCinematic');
    expect(audit.partyLoss.battle).toMatchObject({
      outcome: 'defeat',
      resultReason: 'party-retreated',
      retreatingPlayerIndex: 3
    });
    expect(audit.partyLoss.phase).toBe('resolvingEnemy');
    expect(audit.partyLoss.battle.events.map((event) => event.type)).toEqual(['enemy-single', 'defeat']);
    expect(audit.partyLoss.transition).toMatchObject({ kind: 'terminalEnemyResponse', eventSeqs: [1, 2] });
    expect(audit.lethalVisual).toEqual({ hurt: false, ko: false, defeatStage: false, restartVisible: false });
    await page.waitForFunction(() => (
      document.getElementById('tarotKingdomBattleAvatar-1')?.classList.contains('is-avatar-damaged')
    ));
    const hurtLethalVisual = await page.evaluate(() => {
      const avatar = document.getElementById('tarotKingdomBattleAvatar-1');
      return {
        hurt: avatar?.classList.contains('is-avatar-damaged') || false,
        ko: avatar?.classList.contains('is-avatar-defeated') || false
      };
    });
    expect(hurtLethalVisual).toEqual({ hurt: true, ko: false });
    await page.waitForFunction(() => (
      document.getElementById('tarotKingdomBattleAvatar-1')?.classList.contains('is-avatar-defeated')
    ));
    const revealedLethalVisual = await page.evaluate(() => {
      const avatar = document.getElementById('tarotKingdomBattleAvatar-1');
      const deathSprite = avatar?.querySelector(':scope > .avatar-combat-death-sprite');
      return {
        hurt: avatar?.classList.contains('is-avatar-damaged') || false,
        ko: avatar?.classList.contains('is-avatar-defeated') || false,
        deathDisplay: deathSprite ? getComputedStyle(deathSprite).display : '',
        deathImage: deathSprite ? getComputedStyle(deathSprite).backgroundImage : '',
        layersHidden: Array.from(avatar?.querySelectorAll('.avatar-layer') || []).every((layer) => (
          getComputedStyle(layer).visibility === 'hidden'
        ))
      };
    });
    expect(revealedLethalVisual).toEqual({
      hurt: false,
      ko: true,
      deathDisplay: 'block',
      deathImage: expect.stringContaining('/Sprites/Characters/body/death.png'),
      layersHidden: true
    });
    await page.waitForFunction(() => (
      document.querySelector('#tarotKingdomBattleParty [data-player-index="3"]')?.classList.contains('is-retreating')
    ));
    const retreatVisual = await page.evaluate(() => {
      const row = document.querySelector('#tarotKingdomBattleParty [data-player-index="3"]');
      const avatar = document.getElementById('tarotKingdomBattleAvatar-3');
      return {
        retreating: row?.classList.contains('is-retreating') || false,
        motion: avatar?.dataset.avatarBodyMotion || '',
        animationName: avatar ? getComputedStyle(avatar).animationName : '',
        stageRetreat: document.getElementById('tarotKingdomBattleStage')?.classList.contains('is-retreat') || false
      };
    });
    expect(retreatVisual).toEqual({
      retreating: true,
      motion: 'walk',
      animationName: 'tarotKingdomPlayerRetreat',
      stageRetreat: true
    });
    const settlementConfirmButton = page.locator('#tarotKingdomSettlementConfirmButton');
    await expect(settlementConfirmButton).toBeHidden();
    await expect(settlementConfirmButton).toBeDisabled();
    await page.waitForFunction(() => document.getElementById('tarotKingdomBattleStage')?.classList.contains('is-defeat'));
    await page.waitForFunction(() => window.TarotKingdomDebug?.battleState?.()?.phase === 'done');
    await expect(page.locator('#tarotKingdomSelectedEffectText'))
      .toHaveText(/^.+は　にげだした！$/);
    await expect(settlementConfirmButton).toBeVisible();
    await expect(settlementConfirmButton).toBeEnabled();
    await expect(settlementConfirmButton).toHaveText('撤退');
    expect(audit.partyLoss.champion).toBeNull();
  });

  test('exploration party wipe also offers a retreat action', async ({ page }) => {
    await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      const upperRetreatButton = document.getElementById('tarotKingdomRetreatButton');
      window.__tarotKingdomUpperRetreatWasShownAfterWipe = false;
      const recordUpperRetreatVisibility = () => {
        if (upperRetreatButton && !upperRetreatButton.hidden) {
          window.__tarotKingdomUpperRetreatWasShownAfterWipe = true;
        }
      };
      const observer = new MutationObserver(recordUpperRetreatVisibility);
      if (upperRetreatButton) {
        observer.observe(upperRetreatButton, {
          attributes: true,
          attributeFilter: ['hidden']
        });
      }
      window.__tarotKingdomUpperRetreatObserver = observer;
      debug.battleScenario({
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [0, 1, 0, 0],
        combatBySeat
      });
      debug.battleSetExplorationSession(true);
      debug.battlePass(1);
    }, { combatBySeat: zeroDefenseParty });

    await page.waitForFunction(() => window.TarotKingdomDebug?.battleState?.()?.phase === 'done');
    const state = await page.evaluate(() => window.TarotKingdomDebug.battleState());
    expect(state.battle).toMatchObject({
      outcome: 'defeat',
      resultReason: 'party-defeated',
      retreatingPlayerIndex: null
    });
    const upperRetreatAudit = await page.evaluate(() => {
      window.__tarotKingdomUpperRetreatObserver?.disconnect();
      return {
        wasShown: window.__tarotKingdomUpperRetreatWasShownAfterWipe,
        hidden: document.getElementById('tarotKingdomRetreatButton')?.hidden
      };
    });
    expect(upperRetreatAudit).toEqual({ wasShown: false, hidden: true });
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('パーティは　ぜんめつした…');
    const retreatButton = page.locator('#tarotKingdomSettlementConfirmButton');
    await expect(retreatButton).toBeVisible();
    await expect(retreatButton).toBeEnabled();
    await expect(retreatButton).toHaveText('撤退');

    await page.evaluate(() => {
      window.__tarotKingdomRetreatResult = null;
      window.addEventListener('tarot-kingdom:exploration-complete', (event) => {
        window.__tarotKingdomRetreatResult = event.detail;
      }, { once: true });
    });
    await retreatButton.click();
    await page.waitForFunction(() => window.__tarotKingdomRetreatResult?.status === 'retreated');
    const retreatResult = await page.evaluate(() => window.__tarotKingdomRetreatResult);
    expect(retreatResult).toMatchObject({
      status: 'retreated',
      outcome: 'defeat'
    });
  });

  test('speed never changes seat order and negative chips do not stop the four-hand match', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        turnIndex: 0,
        leaderIndex: 3,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat: [
          { maxHp: 100, defense: 0, speed: 1 },
          { maxHp: 100, defense: 0, speed: 2 },
          { maxHp: 100, defense: 0, speed: 3 },
          { maxHp: 100, defense: 0, speed: 999 }
        ]
      });
      const afterPass = debug.battlePass(0);

      debug.battleScenario({ handNo: 0, chipsBySeat: [-20, 50, 50, 50] });
      const afterSettlement = debug.battleFinishRound(0);
      return { afterPass, afterSettlement };
    });

    expect(audit.afterPass.turn).toBe(1);
    expect(audit.afterPass.transition.resumeTurn).toBe(1);
    expect(audit.afterSettlement.handNo).toBe(1);
    expect(audit.afterSettlement.phase).toBe('roundEnd');
    expect(audit.afterSettlement.awaitRoundConfirm).toBe(true);
    expect(audit.afterSettlement.roundSettlement.matchDone).toBe(false);
    expect(audit.afterSettlement.champion).toBeNull();
  });

  test('concurrent start requests freeze one snapshot and deal only once', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleStartTwice());
    expect(audit.results).toEqual([true, true]);
    expect(audit.state.handNo).toBe(0);
    expect(audit.state.players.map((player) => player.hand.length)).toEqual([8, 8, 8, 8]);
    expect(audit.state.logs.filter((entry) => entry.includes('第1局開始'))).toHaveLength(1);
    expect(audit.state.characterSnapshotReady).toBe(true);
    expect(audit.state.battle.enemy).toMatchObject({
      maxHp: 515,
      hp: 515,
      passDamage: 27,
      areaDamage: 13,
      defense: 18,
      speed: 15
    });
  });

  test('78-card mixed deck, opening effects, and The World use the new major arcana rules', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleMajorArcanaAudit());

    expect(audit.deck).toEqual({
      count: 78,
      minorCount: 56,
      majorCount: 22,
      uniqueCount: 78,
      dealtCount: 32,
      openingFromSameDeck: true,
      openingAndHandsUnique: true,
      remainingCount: 45
    });

    expect(audit.openingEffects['1']).toMatchObject({
      openingNumber: 1,
      setPower: 1,
      syncedSetPower: 1
    });
    expect(audit.openingEffects['5']).toMatchObject({ openingNumber: 5, turn: 3, areaSealed: true });
    expect(audit.openingEffects['8']).toMatchObject({ openingNumber: 8, callOnly: true, petrified: true });
    expect(audit.openingEffects['11']).toMatchObject({ openingNumber: 11, reverse: true });
    expect(audit.openingEffects['14']).toMatchObject({ openingNumber: 14, lockSuit: null });
    expect(audit.openingEffects['20']).toMatchObject({ openingNumber: 20, reverse: true, judgmentPending: true });

    expect(audit.roles.validWorld).toMatchObject({ key: 'TheWorld', baseRate: 3, strength: 5 });
    expect(audit.roles.worldWithout21).toMatchObject({ key: 'Flush' });
    expect(audit.roles.worldWithMinor?.key).not.toBe('TheWorld');
    expect(audit.roles.fourMajors).toBeNull();
    expect(audit.roles.majorFlush).toMatchObject({ key: 'Flush' });
    expect(audit.roles.majorStraightFlush).toMatchObject({ key: 'StraightFlush', primary: [19] });
    expect(audit.roles.worldStraightFlushOverride).toMatchObject({ key: 'TheWorld', primary: [21] });
    expect(audit.roles.foolStraight).toMatchObject({ key: 'Straight' });
    expect(audit.roles.magicianStraightFlush).toMatchObject({ key: 'StraightFlush' });
    expect(audit.roles.devilFalseAceStraight).toBeNull();
    expect(audit.roles.minorAceStraight).toMatchObject({ key: 'Straight', primary: [5] });
    expect(audit.roles.devilHighStraight).toMatchObject({ key: 'Straight', primary: [15] });
    expect(audit.roles.fourAcesAndDevil).toMatchObject({ key: 'FourKind', primary: [15, 15] });
    expect(audit.roles.fourKingsAndFool).toMatchObject({ key: 'FiveKind', primary: [14] });
    expect(audit.roles.worldCallOk).toBe(true);
    expect(audit.roles.worldCallRole).toMatchObject({ key: 'TheWorld', baseRate: 3 });
    expect(audit.roles.majorFlushCall).toEqual({
      ok: false,
      reason: '大アルカナ場札は、ザ・ワールドのみコール可能です。'
    });
    expect(audit.roles.invalidMajorCall).toEqual({
      ok: false,
      reason: '大アルカナ場札は、ザ・ワールドのみコール可能です。'
    });
    expect(audit.roles.lockedCallWrongSuit.ok).toBe(false);
    expect(audit.roles.lockedCallWrongSuit.reason).toBe(
      'ロイヤルロック中：カップのみ。節制XIVで解除できます。'
    );
    expect(audit.roles.lockedCallSameSuit.ok).toBe(true);
    expect(audit.roles.towerSinglePower).toBe(16);
    expect(audit.roles.legacyTowerSinglePower).toBe(14);
    expect(audit.roles.worldSingleValid).toBe(true);
    expect(audit.effectless).toBe(true);
    expect(audit.major13LockSuit).toBeNull();
    expect(audit.major14LockSuit).toBeNull();
    expect(audit.minor13LockSuit).toBe('Wand');
    expect(audit.minor14LockSuit).toBe('Wand');
    expect(audit.major14Unlock).toEqual({ playableThroughLock: true, lockSuit: null });
    expect(audit.lockRestriction.sameSuitMinor.ok).toBe(true);
    expect(audit.lockRestriction.differentSuitMinor).toEqual({
      ok: false,
      reason: 'ロイヤルロック中：カップのみ。節制XIVで解除できます。'
    });
    expect(audit.lockRestriction.sameSuitMajor.ok).toBe(true);
    expect(audit.lockRestriction.differentSuitMajor.ok).toBe(false);
    expect(audit.lockRestriction.differentSuitMajor.reason).toContain('ロイヤルロック中：カップのみ');
    expect(audit.lockRestriction.noSuitMajor.ok).toBe(false);
    expect(audit.lockRestriction.noSuitMajor.reason).toContain('ロイヤルロック中：カップのみ');
    expect(audit.lockRestriction.temperance.ok).toBe(true);
    expect(audit.lockRestriction.mixedSuitRole.ok).toBe(false);
    expect(audit.lockRestriction.mixedSuitRole.reason).toContain('ロイヤルロック中：カップのみ');
    expect(audit.majorSuitGate.sameSuit).toMatchObject({ ok: true, setPower: 16 });
    expect(audit.majorSuitGate.differentSuit).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.differentSuit.reason).toContain('同じスート');
    expect(audit.majorSuitGate.ace).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.ace.reason).toBe('Aの能力：大アルカナでは返せません。');
    expect(audit.majorSuitGate.pair).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.pair.reason).toContain('1枚札');
    expect(audit.majorSuitGate.empty).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.empty.reason).toContain('場が空');
    expect(audit.majorSuitGate.lastFinish).toMatchObject({ ok: true, setPower: 16 });
    expect(audit.majorSuitGate.role).toEqual({ ok: true, key: 'StraightFlush' });
    expect(audit.majorSuits['1']).toEqual(['Wand', 'Cup', 'Sword', 'Pentacle']);
    expect(audit.majorSuits['16']).toEqual(['Sword']);
    expect(audit.majorSuits['17']).toEqual(['Cup']);
    expect(audit.majorSuits['18']).toEqual(['Pentacle']);
    expect(audit.majorSuits['19']).toEqual(['Wand']);
    expect(audit.majorSuitMasks).toMatchObject({
      1: 15,
      16: 4,
      17: 2,
      18: 8,
      19: 1
    });
    for (const number of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21]) {
      expect(audit.majorSuits[String(number)]).toEqual(['None']);
      expect(audit.majorSuitMasks[String(number)]).toBe(0);
    }
    expect(audit.judgmentToggle).toEqual({ reverse: false, pending: true });
    expect(audit.twoCardMajorCut).toEqual({ forceClear: true, petrified: true });
    expect(audit.roleEffectsSuppressed).toBe(true);
  });

  test('major 15, 20, 21 and blocked-leader retry follow schema 8 rules', async ({ page }) => {
    const audit = await page.evaluate(() => (
      window.TarotKingdomDebug.battleMajorArcanaSpecialAudit()
    ));

    expect(audit.devil.court.ok).toBe(true);
    expect(audit.devil.reverseCourt.ok).toBe(true);
    expect(audit.devil.numberTen.ok).toBe(false);
    expect(audit.devil.numberTen.reason).toContain('コート札');
    expect(audit.devil.majorCourtNumber.ok).toBe(false);
    expect(audit.devil.empty.ok).toBe(false);
    expect(audit.devil.pair.ok).toBe(false);
    expect(audit.devil.locked.ok).toBe(false);
    expect(audit.devil.locked.reason).toContain('ロイヤルロック中：カップのみ');

    expect(audit.judgment.onMinorAce.ok).toBe(false);
    expect(audit.judgment.onMinorAce.reason).toBe('Aの能力：大アルカナでは返せません。');
    expect(audit.judgment.onMagician.ok).toBe(true);
    expect(audit.judgment.finish.ok).toBe(true);

    expect(audit.finish.ace.ok).toBe(true);
    expect(audit.finish.world.ok).toBe(true);
    expect(audit.finish.tower.ok).toBe(true);
    expect(audit.finish.leaveAce.ok).toBe(true);
    expect(audit.finish.worldRole).toEqual({ ok: true, roleKey: 'TheWorld' });
    expect(audit.worldAgainstFiveCardRole.ok).toBe(false);
    expect(audit.worldAgainstFiveCardRole.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.worldOverMinorNormal.ok).toBe(false);
    expect(audit.worldReverse.worldOverMinorNormal.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.worldOverMinorReverse.ok).toBe(false);
    expect(audit.worldReverse.worldOverMajorNormal.ok).toBe(true);
    expect(audit.worldReverse.worldOverMajorReverse.ok).toBe(false);
    expect(audit.worldReverse.worldOverMajorReverse.reason).toContain('11バック中');
    expect(audit.worldReverse.worldOverMajorPair.ok).toBe(false);
    expect(audit.worldReverse.worldOverMajorPair.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.worldOverStrengthCut.ok).toBe(true);
    expect(audit.worldReverse.worldOverMinorEightCut.ok).toBe(false);
    expect(audit.worldReverse.worldOverMinorEightCut.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.minorOverWorldNormal.ok).toBe(false);
    expect(audit.worldReverse.minorOverWorldReverse.ok).toBe(true);
    expect(audit.strengthCut.majorStrength).toEqual({
      ok: false,
      reason: '8カット中: コールかパスのみ。'
    });
    expect(audit.npcStrengthCut).toEqual({ action: 'pass', cardNumber: 0 });
    expect(audit.schema7Compatibility.devilOnNumberTen.ok).toBe(true);
    expect(audit.schema7Compatibility.judgmentFinish.ok).toBe(true);
    expect(audit.schema7Compatibility.worldFinish.ok).toBe(true);
    expect(audit.schema7Compatibility.towerFinish.ok).toBe(true);
    expect(audit.descriptions['8']).toBe('8カット');

    expect(audit.worldSingle).toMatchObject({
      ok: true,
      handBefore: 2,
      handAfter: 1,
      deckBefore: 1,
      deckAfter: 1,
      starsBefore: 0,
      starsAfter: 1,
      trickCleared: true,
      turn: 0,
      phase: 'draw',
      pendingDraw: 0
    });
    expect(audit.worldOptionalDraw).toEqual({
      handCount: 2,
      deckCount: 0,
      phase: 'turn',
      pendingDraw: null,
      drawnCardId: 'special-world-forced'
    });
    expect(audit.worldEmptyDeck).toEqual({
      ok: true,
      handCount: 1,
      deckCount: 0,
      trickCleared: true,
      phase: 'turn'
    });
    expect(audit.worldJudgmentOrder).toEqual({
      handCountAfterClear: 1,
      deckCount: 1,
      pendingJudgment: 0,
      followup: 'world'
    });
    expect(audit.worldJudgmentThenDraw).toEqual({
      handCount: 2,
      deckCount: 1,
      phase: 'draw',
      pendingDraw: 0
    });

    expect(audit.forcedLeaderDraw).toEqual({
      turn: 0,
      handCount: 2,
      deckCount: 0,
      legal: true,
      blocked: [],
      battleEventCount: 0
    });
    expect(audit.fullMajorFlushOpening).toEqual({
      turn: 0,
      firstHandCount: 8,
      deckCount: 1,
      blocked: [],
      battleEventCount: 0
    });
    expect(audit.retryTransition.kind).toBe('roundDrawRetry');
    expect(audit.retryTransition.phase).toBe('roundDraw');
    expect(audit.retryTransition.blocked).toEqual([0, 1, 2, 3]);
    expect(audit.retryAfter).toMatchObject({
      handNo: audit.retryBefore.handNo,
      dealer: audit.retryBefore.dealer,
      chips: audit.retryBefore.chips,
      stars: audit.retryBefore.stars,
      enemyMaxHp: audit.retryBefore.enemyMaxHp,
      handCounts: [8, 8, 8, 8]
    });
    expect(['openingDeal', 'openingCinematic']).toContain(audit.retryAfter.phase);
    expect(audit.retryAfterEnemy).toMatchObject({
      initialTransition: 'enemyResponse',
      resumePhase: 'roundDraw',
      nextTransition: 'roundDrawRetry'
    });
    expect(['openingDeal', 'openingCinematic']).toContain(audit.retryAfterEnemy.finalPhase);

    expect(audit.descriptions['15']).toContain('コート専用 / 11バック無視');
    expect(audit.descriptions['15']).not.toContain('ブラッドペクト');
    expect(audit.descriptions['16']).not.toContain('カタストロフィ');
    expect(audit.descriptions['17']).not.toContain('ウィッシング・ドロップ');
    expect(audit.descriptions['18']).not.toContain('ミラージュ・幻影陣');
    expect(audit.descriptions['19']).not.toContain('ソーラーフレア');
    expect(audit.descriptions['20']).not.toContain('ラスト・レクイエム');
    expect(audit.descriptions['21']).not.toContain('タイム・ストップ');
    for (const number of [16, 17, 18, 19]) {
      expect(audit.descriptions[String(number)]).toContain('同スート場専用 / 初手不可');
    }
    expect(audit.descriptions['20']).toContain('11バック / 墓地回収');
    expect(audit.descriptions['20']).not.toContain('A不可');
    expect(audit.descriptions['21']).toContain('大アルカナ1枚に返して即クリア');
  });

  test('major Hierophant skips the next two living opponents while minor five keeps its normal count', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const run = ({ playerCount, hpBySeat, card }) => {
        debug.battleScenario({
          playerCount,
          tableCard: { id: `skip-field-${card.kind}-${playerCount}`, kind: 'minor', suit: 'Cup', number: 4 },
          turnIndex: 0,
          hpBySeat,
          handsBySeat: [[card, { id: `skip-reserve-${card.kind}-${playerCount}`, kind: 'minor', suit: 'Wand', number: 9 }]]
        });
        debug.battlePlayCards(0, [card.id], { resolve: false });
        const state = debug.battleResolveTransition();
        return {
          targetIndexes: state.skipNotice?.targetIndexes || [],
          turn: state.turn,
          message: state.message
        };
      };
      return {
        majorThree: run({
          playerCount: 3,
          hpBySeat: [100, 100, 100],
          card: { id: 'major-five-three', kind: 'major', suit: 'None', number: 5 }
        }),
        majorFour: run({
          playerCount: 4,
          hpBySeat: [100, 100, 100, 100],
          card: { id: 'major-five-four', kind: 'major', suit: 'None', number: 5 }
        }),
        majorKo: run({
          playerCount: 4,
          hpBySeat: [100, 0, 100, 0],
          card: { id: 'major-five-ko', kind: 'major', suit: 'None', number: 5 }
        }),
        minor: run({
          playerCount: 4,
          hpBySeat: [100, 100, 100, 100],
          card: { id: 'minor-five-four', kind: 'minor', suit: 'Cup', number: 5 }
        })
      };
    });

    expect(audit.majorThree.turn).toBe(0);
    expect(audit.majorFour.turn).toBe(3);
    expect(audit.majorKo.turn).toBe(0);
    expect(audit.minor.turn).toBe(2);
  });

  test('three consecutive blocked-leader draws knock out the player and a successful play resets the count', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const major = (number, suffix = '') => ({
        id: `forced-major-${number}${suffix}`,
        kind: 'major',
        suit: 'None',
        number
      });
      const minor = (number, suffix = '') => ({
        id: `forced-minor-${number}${suffix}`,
        kind: 'minor',
        suit: 'Wand',
        number
      });
      const buildBlockedScenario = (streak) => {
        debug.battleScenario({
          withTrick: false,
          handsBySeat: [
            [major(16, `-hand-${streak}`)],
            [minor(2, `-leader-${streak}`)],
            [minor(3, `-seat2-${streak}`)],
            [minor(4, `-seat3-${streak}`)]
          ],
          drawDeck: [major(17, `-draw-${streak}`)],
          forcedDrawStreakBySeat: [streak, 0, 0, 0]
        });
        return debug.battleResolveLeader(0);
      };

      const first = buildBlockedScenario(0);
      const third = buildBlockedScenario(2);
      const thirdRow = document.querySelector(
        '#tarotKingdomBattleParty [data-player-index="0"]'
      );
      const thirdPresentation = {
        rowIsKo: thirdRow?.classList.contains('is-ko') || false,
        handText: thirdRow?.querySelector('.tarot-kingdom-battle-player-hand-count')?.textContent || '',
        rootOverflow: Math.max(
          0,
          (document.getElementById('tarotKingdomRoot')?.scrollWidth || 0)
            - (document.getElementById('tarotKingdomRoot')?.clientWidth || 0)
        )
      };

      debug.battleScenario({
        handsBySeat: [
          [minor(2, '-reset-a'), minor(3, '-reset-b')],
          [minor(4, '-reset-1')],
          [minor(5, '-reset-2')],
          [minor(6, '-reset-3')]
        ],
        forcedDrawStreakBySeat: [2, 0, 0, 0]
      });
      const reset = debug.battlePlayOne(0, { resolve: false });
      debug.battleScenario({
        hpBySeat: [0, 100, 100, 100],
        forcedDrawStreakBySeat: [3, 0, 0, 0]
      });
      const revived = debug.battleResolveMajorEffect(1, 20).state;

      return {
        first: {
          hp: first.players[0].hp,
          streak: first.players[0].forcedDrawStreak,
          turn: first.turn
        },
        third: {
          hp: third.players[0].hp,
          streak: third.players[0].forcedDrawStreak,
          turn: third.turn,
          event: third.battle.events.at(-1),
          rowIsKo: thirdPresentation.rowIsKo,
          handText: thirdPresentation.handText,
          rootOverflow: thirdPresentation.rootOverflow
        },
        resetStreak: reset.players[0].forcedDrawStreak,
        revived: {
          hp: revived.players[0].hp,
          streak: revived.players[0].forcedDrawStreak
        }
      };
    });

    expect(audit.first).toMatchObject({ streak: 1, turn: 1 });
    expect(audit.first.hp).toBeGreaterThan(0);
    expect(audit.third).toMatchObject({
      hp: 0,
      streak: 3,
      turn: 1,
      rowIsKo: true
    });
    expect(audit.third.event).toMatchObject({
      type: 'forced-draw-ko',
      actorIndex: 0,
      targetIndexes: [0],
      knockedOutIndexes: [0],
      forcedDrawCount: 3,
      hpAfter: 0
    });
    expect(audit.third.handText).toContain('☠3/3');
    expect(audit.third.rootOverflow).toBeLessThanOrEqual(1);
    expect(audit.resetStreak).toBe(0);
    expect(audit.revived.hp).toBeGreaterThan(0);
    expect(audit.revived.streak).toBe(0);
  });

  test('Judgment 20 recovery follows the actual clearer, hand cap, unrestricted finish, and KO rules', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleJudgmentAudit());

    expect(audit.afterOvertakenClear).toEqual({ pendingJudgment: 2, reverse: false, handCount: 4 });
    expect(audit.afterPick).toEqual({ pendingDraw: 2, handCount: 5, candidateRemaining: false });
    expect(audit.afterDraw.handCount).toBe(6);
    expect(audit.afterDraw.drawnKind).toBe('major');
    expect(audit.afterDraw.stars).toBe(audit.afterDraw.starsBefore);
    expect(audit.fullHand).toEqual({ pendingJudgment: null, pendingDraw: null, candidateRemaining: true });
    expect(audit.noCandidate).toEqual({ pendingJudgment: null, pendingDraw: 2 });
    expect(audit.handZero).toMatchObject({
      outcome: null,
      reason: null,
      judgmentPending: false,
      pendingJudgment: null,
      playAllowed: true
    });
    expect(audit.handZero.validationReason).toBe('');
    expect(audit.koClearer).toEqual({ pendingJudgment: 3, resolvedTurn: 3 });
    expect(audit.selfDiscardRejected).toEqual({
      pendingJudgment: 2,
      handCount: 4,
      handUnchanged: true,
      candidateRemaining: true,
      selectableOptions: 0
    });
  });

  test('profile results are discarded when the online roster changes while loading', async ({ page }) => {
    const audit = await page.evaluate(() => (
      window.TarotKingdomDebug.battleRejectRosterChangeDuringProfileLoad()
    ));
    expect(audit.applied).toBe(false);
    expect(audit.characterSnapshotReady).toBe(false);
    expect(audit.message).toContain('参加者が変更');
    expect(audit.secondSeatHasCharacter).toBe(false);
  });

  test('all four hands continue, carry party HP, and retain the frozen profile', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleRunFourRounds());
    expect(audit.rounds.map((round) => round.completedHandNo)).toEqual([1, 2, 3, 4]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyMaxHp)).toEqual([595, 675, 755]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyPassDamage)).toEqual([29, 31, 33]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyAreaDamage)).toEqual([15, 17, 19]);
    for (const round of audit.rounds.slice(0, 3)) {
      expect(round.nextRound.hpBySeat).toEqual([1, 1, 1, 1]);
      expect(round.characterSnapshotCreatedAt).toBe(audit.snapshotCreatedAt);
    }
    expect(audit.rounds[3].matchDone).toBe(true);
    expect(audit.state.handNo).toBe(4);
    expect(audit.state.champion).toBe(0);
  });

  test('three- and four-player battles carry exact HP, including KO, into the next hand', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      return [3, 4].map((playerCount) => {
        const hpBySeat = [17, 0, 59, 83].slice(0, playerCount);
        debug.battleScenario({
          playerCount,
          handNo: 0,
          hpBySeat,
          handCounts: [0, 2, 2, 2].slice(0, playerCount),
          enemyHp: 0,
          withTrick: false
        });
        debug.battleFinishRound(0);
        const next = debug.battleNextRound();
        return {
          playerCount,
          hpBySeat,
          nextHpBySeat: next.players.map((player) => player.hp),
          carryVersion: next.rules.carryHpBetweenRoundsVersion
        };
      });
    });

    audit.forEach((entry) => {
      expect(entry.nextHpBySeat).toEqual(entry.hpBySeat);
      expect(entry.carryVersion).toBe(1);
    });
  });

  test('stage exploration switches enemies while carrying HP and consuming one ordered supply', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const stage = {
        stageNo: 1,
        stageId: 'tarot_stage_1',
        stageName: '珊瑚の浅瀬',
        battlefieldId: 'coral-island',
        atmosphereTone: 'sunlit-coral',
        monsters: [
          { monsterId: 'ismartal-vol1-monster-07', monsterName: 'マシュロン', archetype: 'balanced', threatLevel: 1 },
          { monsterId: 'ismartal-vol3-monster-04', monsterName: 'プルン', archetype: 'balanced', threatLevel: 2 },
          { monsterId: 'ismartal-vol1-monster-01', monsterName: 'トゲマル', archetype: 'guardian', threatLevel: 3 },
          { monsterId: 'ismartal-vol2-monster-02', monsterName: 'パピル', archetype: 'swift', threatLevel: 4 }
        ],
        supplyQueue: [
          { itemId: 'troy_menu_stage_test', displayName: 'テスト補給', effectiveUnits: 2 }
        ]
      };
      const first = debug.battleScenario({
        stage,
        handNo: 0,
        hpBySeat: [40, 0, 80, 100],
        handCounts: [0, 2, 2, 2],
        enemyHp: 0,
        withTrick: false
      });
      const settled = debug.battleFinishRound(0);
      const second = debug.battleNextRound();
      const enemyIds = [first.battle.enemy.id, second.battle.enemy.id];
      debug.battleFinishRound(0);
      const third = debug.battleNextRound();
      enemyIds.push(third.battle.enemy.id);
      debug.battleFinishRound(0);
      const fourth = debug.battleNextRound();
      enemyIds.push(fourth.battle.enemy.id);
      const arena = document.querySelector('.tarot-kingdom-battle-arena');
      return {
        first,
        settled,
        second,
        enemyIds,
        publicState: debug.battlePublicState(),
        atmosphereTone: document.body.dataset.tarotKingdomAtmosphereTone || '',
        atmosphereCss: arena
          ? getComputedStyle(arena).getPropertyValue('--tarot-kingdom-battlefield-atmosphere')
          : ''
      };
    });

    expect(audit.first.battle.enemy.id).toBe('ismartal-vol1-monster-07');
    expect(audit.first.battle.enemy).toMatchObject({
      maxHp: 260,
      passDamage: 14,
      areaDamage: 7,
      threatLevel: 1
    });
    expect(audit.settled.stage.finishers).toHaveLength(1);
    expect(audit.settled.stage.finishers[0]).toMatchObject({
      roundNo: 1,
      playerIndex: 0,
      monsterId: 'ismartal-vol1-monster-07'
    });
    expect(audit.second.battle.enemy.id).toBe('ismartal-vol3-monster-04');
    expect(audit.second.battle.enemy.threatLevel).toBe(2);
    expect(audit.enemyIds).toEqual([
      'ismartal-vol1-monster-07',
      'ismartal-vol3-monster-04',
      'ismartal-vol1-monster-01',
      'ismartal-vol2-monster-02'
    ]);
    audit.second.players.forEach((player, index) => {
      const hpBefore = [40, 0, 80, 100][index];
      const amount = Math.max(1, Math.round(player.maxHp * 0.2));
      const expected = hpBefore <= 0 ? amount : Math.min(player.maxHp, hpBefore + amount);
      expect(player.hp).toBe(expected);
    });
    expect(audit.second.stage.usedSupplies).toHaveLength(1);
    expect(audit.second.stage.usedSupplies[0]).toMatchObject({
      transitionNo: 1,
      itemId: 'troy_menu_stage_test',
      effectiveUnits: 2,
      healRate: 0.2
    });
    expect(audit.publicState.schema).toBe(30);
    expect(audit.publicState.state.stage.monsters).toHaveLength(4);
    expect(audit.atmosphereTone).toBe('sunlit-coral');
    expect(audit.atmosphereCss).toContain('74, 159, 196');
  });

  test('three-player exploration deals 24 cards and settles or rotates the dealer across three seats', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const dealt = debug.battleDealScenario(3);
      const settlementStart = debug.battleScenario({
        playerCount: 3,
        dealerIndex: 2,
        handNo: 0,
        handCounts: [0, 3, 2],
        chipsBySeat: [100, 100, 100],
        withTrick: false
      });
      const settled = debug.battleFinishRound(0);
      return { dealt, settlementStart, settled, published: debug.battlePublicState() };
    });

    expect(audit.dealt.rules.playerCount).toBe(3);
    expect(audit.dealt.players.map((player) => player.hand.length)).toEqual([8, 8, 8]);
    expect(audit.dealt.players.reduce((sum, player) => sum + player.hand.length, 0)).toBe(24);
    expect(audit.dealt.drawDeck).toHaveLength(53);
    expect(audit.settlementStart.players).toHaveLength(3);
    expect(audit.settled.roundSettlement.rows).toHaveLength(2);
    expect(audit.settled.dealer).toBe(0);
    expect(audit.published.schema).toBe(30);
    expect(audit.published.state.rules.playerCount).toBe(3);
    expect(audit.published.state.players).toHaveLength(3);
  });

  test('call rate, schema migration, action forgery, revisions, and transition locks are authoritative', async ({ page }) => {
    const invalidCards = [
      { id: 'bad-1', kind: 'minor', suit: 'Wand', number: 1 },
      { id: 'bad-2', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'bad-3', kind: 'minor', suit: 'Sword', number: 6 },
      { id: 'bad-4', kind: 'minor', suit: 'Pentacle', number: 9 },
      { id: 'bad-5', kind: 'minor', suit: 'Wand', number: 14 }
    ];
    const audit = await page.evaluate(({ invalidCards }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        revision: 4,
        handsBySeat: [invalidCards],
        combatBySeat: [{ intelligence: 0 }]
      });
      const forgedRole = debug.battleRebuildAction(0, {
        selectedCardIds: invalidCards.map((card) => card.id),
        role: { key: 'FiveKind', effectiveRate: 999 },
        actionId: 'forged-role'
      });
      const correctEnvelope = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', actionId: 'action-1', expectedRevision: 4
      });
      debug.battleRememberAction('action-1');
      const duplicateEnvelope = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', actionId: 'action-1', expectedRevision: 4
      });
      const forgedSeat = debug.battleValidateEnvelope({
        uid: 'debug-uid-1', seat: 0, type: 'pass', actionId: 'action-2', expectedRevision: 4
      });
      const staleRevision = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', actionId: 'action-3', expectedRevision: 3
      });
      const missingActionId = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', expectedRevision: 4
      });
      const stringRevision = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', actionId: 'action-string-revision', expectedRevision: '4'
      });
      const stringSeat = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: '0', type: 'pass', actionId: 'action-string-seat', expectedRevision: 4
      });

      const flushCards = [1, 2, 3, 4, 5].map((number) => ({
        id: `flush-${number}`, kind: 'minor', suit: 'Wand', number
      }));
      const callDamage = debug.battleDamageForPlay(0, {
        type: 'role', call: true,
        cardsHand: flushCards.slice(1),
        cardsTable: flushCards,
        role: { key: 'StraightFlush', effectiveRate: 2 }
      });
      const fullHouseCards = [
        { id: 'fh-1', kind: 'minor', suit: 'Wand', number: 7 },
        { id: 'fh-2', kind: 'minor', suit: 'Cup', number: 7 },
        { id: 'fh-3', kind: 'minor', suit: 'Sword', number: 7 },
        { id: 'fh-4', kind: 'minor', suit: 'Wand', number: 9 },
        { id: 'fh-5', kind: 'minor', suit: 'Cup', number: 9 }
      ];
      const zeroRateCallDamage = debug.battleDamageForPlay(0, {
        type: 'role', call: true,
        cardsHand: fullHouseCards.slice(1),
        cardsTable: fullHouseCards,
        role: { key: 'FullHouse', effectiveRate: 0 }
      });

      const callHand = [
        ...flushCards.slice(1),
        { id: 'call-remainder', kind: 'minor', suit: 'Pentacle', number: 9 }
      ];
      debug.battleScenario({
        handsBySeat: [callHand],
        tableCard: flushCards[0],
        starsBySeat: [0],
        turnIndex: 0
      });
      const freeCallBuilt = debug.battleRebuildAction(0, {
        selectedCardIds: flushCards.slice(1).map((card) => card.id),
        actionId: 'free-call'
      });
      const freeCallPlayed = debug.battlePlayCards(
        0,
        flushCards.slice(1).map((card) => card.id),
        { resolve: false }
      );

      debug.battleScenario({ revision: 4, handCounts: [2, 2, 2, 2] });
      const duringPlay = debug.battlePlayOne(0, { resolve: false });
      const transitionLocked = debug.battleValidateEnvelope({
        uid: 'debug-uid-0', seat: 0, type: 'pass', actionId: 'action-4', expectedRevision: 5
      });
      const recovered = debug.battleResolveTransition();

      const migrated = debug.battleDeserialize({
        schema: 1,
        state: {
          handNo: 1,
          roundActive: true,
          phase: 'turn',
          turn: 2,
          players: [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }],
          pass: [false, true, false, true]
        }
      });
      return {
        forgedRole,
        correctEnvelope,
        duplicateEnvelope,
        forgedSeat,
        staleRevision,
        missingActionId,
        stringRevision,
        stringSeat,
        callDamage,
        zeroRateCallDamage,
        freeCallBuilt,
        freeCallPlayed,
        duringPlay,
        transitionLocked,
        recovered,
        migrated
      };
    }, { invalidCards });

    expect(audit.forgedRole.ok).toBe(false);
    expect(audit.correctEnvelope.ok).toBe(true);
    expect(audit.duplicateEnvelope.reason).toBe('duplicate-action');
    expect(audit.forgedSeat.reason).toBe('seat-owner-mismatch');
    expect(audit.staleRevision.reason).toBe('stale-revision');
    expect(audit.missingActionId.reason).toBe('invalid-action-id');
    expect(audit.stringRevision.reason).toBe('stale-revision');
    expect(audit.stringSeat.reason).toBe('seat-owner-mismatch');
    expect(audit.callDamage).toMatchObject({
      kind: 'skill',
      baseDamage: 154,
      damage: 171,
      targetScope: 'stage',
      rangeLabel: '全体大攻撃'
    });
    expect(audit.zeroRateCallDamage).toMatchObject({ kind: 'skill', baseDamage: 144, damage: 159 });
    expect(audit.freeCallBuilt).toMatchObject({ ok: true, play: { call: true } });
    expect(audit.freeCallPlayed.ok).toBe(true);
    expect(audit.freeCallPlayed.state.players[0].stars).toBe(0);
    expect(audit.freeCallPlayed.state.players[0].hand).toHaveLength(1);
    expect(audit.duringPlay.transition.kind).toBe('play');
    expect(audit.transitionLocked.reason).toBe('transition-locked');
    expect(audit.recovered.transition).toBeNull();
    expect(audit.recovered.phase).toBe('turn');
    expect(audit.recovered.revision).toBeGreaterThan(audit.duringPlay.revision);
    expect(audit.migrated.revision).toBe(0);
    expect(audit.migrated.transition).toBeNull();
    expect(audit.migrated.battle.enemy).toMatchObject({ maxHp: 500, hp: 500, passDamage: 20, areaDamage: 12 });
    expect(audit.migrated.pass).toEqual([false, true, false, true]);
  });

  test('presentation cues stay public across render, cap history at eight, and bind the active transition', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      const hand = [
        { id: 'presentation-play', kind: 'minor', suit: 'Wand', number: 2 },
        { id: 'presentation-hold-1', kind: 'minor', suit: 'Cup', number: 6 },
        { id: 'presentation-hold-2', kind: 'minor', suit: 'Sword', number: 9 }
      ];
      debug.battleScenario({
        turnIndex: 0,
        leaderIndex: 0,
        handsBySeat: [hand],
        withTrick: false
      });
      const played = debug.battlePlayCards(0, ['presentation-play'], { resolve: false });
      const beforeRender = debug.battlePublicState();
      debug.battleRender();
      const afterRender = debug.battlePublicState();

      const ringEpoch = 'presentation-ring-test';
      const baseline = clone(afterRender);
      baseline.state.transition = null;
      baseline.state.presentation = { version: 1, epoch: ringEpoch, seq: 0, cues: [] };
      debug.battleApplyRemoteState(baseline, { localSeat: 1, forcePreview: true });
      const ringPayload = clone(baseline);
      ringPayload.state.presentation = {
        version: 1,
        epoch: ringEpoch,
        seq: 10,
        cues: Array.from({ length: 10 }, (_, index) => ({
          seq: index + 1,
          kind: 'action',
          actorIndex: index % 4,
          label: `CUE ${index + 1}`,
          options: { durationMs: 320, cutin: false },
          createdAt: Date.now() + index
        }))
      };
      debug.battleApplyRemoteState(ringPayload, { localSeat: 1, forcePreview: true });
      const ringPublic = debug.battlePublicState();
      debug.battleRender();
      const ringAfterRender = debug.battlePublicState();

      return { played, beforeRender, afterRender, ringPublic, ringAfterRender };
    });

    expect(audit.played.ok).toBe(true);
    expect(audit.beforeRender.state.presentation.cues.length).toBeGreaterThan(0);
    expect(audit.afterRender.state.presentation).toEqual(audit.beforeRender.state.presentation);
    expect(audit.beforeRender.state.transition.presentationSeq).toBe(
      audit.beforeRender.state.presentation.seq
    );
    expect(audit.ringPublic.state.presentation.cues).toHaveLength(8);
    expect(audit.ringPublic.state.presentation.cues.map((cue) => cue.seq)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10
    ]);
    expect(audit.ringAfterRender.state.presentation).toEqual(audit.ringPublic.state.presentation);
  });

  test('a guest plays an already seen presentation sequence only once', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      debug.battleScenario({ withTrick: false, handCounts: [3, 3, 3, 3] });
      const epoch = 'presentation-dedupe-test';
      const baseline = clone(debug.battlePublicState());
      baseline.state.transition = null;
      baseline.state.presentation = { version: 1, epoch, seq: 0, cues: [] };
      debug.battleApplyRemoteState(baseline, { localSeat: 1, forcePreview: true });
      debug.battleResetPresentationAudit();

      const payload = clone(baseline);
      payload.state.presentation = {
        version: 1,
        epoch,
        seq: 1,
        cues: [{
          seq: 1,
          kind: 'action',
          actorIndex: 0,
          label: 'PASS',
          options: { durationMs: 600, cutin: false },
          createdAt: Date.now()
        }]
      };
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      const afterFirstApply = debug.battlePresentationAudit();
      debug.battleApplyRemoteState(payload, { localSeat: 1, forcePreview: true });
      const afterDuplicateApply = debug.battlePresentationAudit();
      debug.battleRender();
      const afterRender = debug.battlePresentationAudit();
      return { afterFirstApply, afterDuplicateApply, afterRender };
    });

    expect(audit.afterFirstApply.starts).toHaveLength(1);
    expect(audit.afterFirstApply.starts[0]).toMatchObject({ seq: 1, kind: 'action' });
    expect(audit.afterDuplicateApply.starts).toHaveLength(1);
    expect(audit.afterRender.starts).toHaveLength(1);
    expect(audit.afterRender).toMatchObject({
      lastSeenSeq: 1,
      epoch: 'presentation-dedupe-test'
    });
  });

  test('host demotion without a transition preserves its presentation cursor and plays the next cue once', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      debug.battleScenario({ withTrick: false, handCounts: [3, 3, 3, 3] });

      const epoch = 'presentation-host-demotion-test';
      const hostPayload = clone(debug.battlePublicState());
      hostPayload.state.transition = null;
      hostPayload.state.presentation = {
        version: 1,
        epoch,
        seq: 4,
        cues: [{
          seq: 4,
          kind: 'action',
          actorIndex: 0,
          label: 'TURN',
          options: { durationMs: 600, cutin: false },
          createdAt: Date.now() - 1000
        }]
      };
      debug.battleDeserialize(hostPayload);
      const demoted = debug.battlePresentationRoleChange('guest');
      const afterDemotion = debug.battlePresentationAudit();
      debug.battleResetPresentationAudit();

      const nextPayload = clone(hostPayload);
      nextPayload.state.presentation = {
        version: 1,
        epoch,
        seq: 5,
        cues: [
          ...hostPayload.state.presentation.cues,
          {
            seq: 5,
            kind: 'action',
            actorIndex: 1,
            label: 'PASS',
            options: { durationMs: 600, cutin: false },
            createdAt: Date.now()
          }
        ]
      };
      debug.battleApplyRemoteState(nextPayload, { localSeat: 1, forcePreview: true });
      const afterFirstCue = debug.battlePresentationAudit();
      debug.battleApplyRemoteState(nextPayload, { localSeat: 1, forcePreview: true });
      const afterDuplicate = debug.battlePresentationAudit();
      return { demoted, afterDemotion, afterFirstCue, afterDuplicate };
    });

    expect(audit.demoted.activeSeq).toBe(0);
    expect(audit.demoted.activeKind).toBe('');
    expect(audit.afterDemotion).toMatchObject({
      starts: [],
      activeSeq: 0,
      activeKind: '',
      lastSeenSeq: 4,
      epoch: 'presentation-host-demotion-test'
    });
    expect(audit.afterFirstCue.starts).toHaveLength(1);
    expect(audit.afterFirstCue.starts[0]).toMatchObject({
      seq: 5,
      kind: 'action',
      actorIndex: 1
    });
    expect(audit.afterFirstCue).toMatchObject({
      lastSeenSeq: 5,
      epoch: 'presentation-host-demotion-test'
    });
    expect(audit.afterDuplicate.starts).toHaveLength(1);
  });

  test('an active presentation survives guest and host authority changes without replay or host-clock delay', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        handsBySeat: [[
          { id: 'role-change-play', kind: 'minor', suit: 'Sword', number: 6 },
          { id: 'role-change-keep-a', kind: 'minor', suit: 'Cup', number: 9 },
          { id: 'role-change-keep-b', kind: 'minor', suit: 'Pentacle', number: 12 }
        ]]
      });
      const played = debug.battlePlayCards(0, ['role-change-play'], { resolve: false });
      const hostPayload = clone(debug.battlePublicState());
      const epoch = 'presentation-role-change';
      const clockDeltaMs = 60_000;
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
        ].forEach((key) => {
          if (Number(timeline[key]) > 0) timeline[key] += clockDeltaMs;
        });
      };
      hostPayload.state.presentation.epoch = epoch;
      hostPayload.state.presentation.cues.forEach((cue) => {
        if (Number(cue.createdAt) > 0) cue.createdAt += clockDeltaMs;
        if (cue.kind !== 'transition') return;
        cue.transition.startedAt += clockDeltaMs;
        cue.transition.endsAt += clockDeltaMs;
        shiftTimeline(cue.transition.timeline);
        Object.values(cue.transition.eventTimelines || {}).forEach(shiftTimeline);
      });
      hostPayload.state.transition.startedAt += clockDeltaMs;
      hostPayload.state.transition.endsAt += clockDeltaMs;
      shiftTimeline(hostPayload.state.transition.timeline);
      Object.values(hostPayload.state.transition.eventTimelines || {}).forEach(shiftTimeline);

      debug.battleApplyRemoteState(hostPayload, { localSeat: 1, forcePreview: true });
      const guestAudit = debug.battlePresentationAudit();
      const promoted = debug.battlePresentationRoleChange('host');
      const promotedAudit = debug.battlePresentationAudit();
      const demoted = debug.battlePresentationRoleChange('guest');
      const demotedAudit = debug.battlePresentationAudit();
      return {
        played,
        guestAudit,
        promoted,
        promotedAudit,
        demoted,
        demotedAudit,
        now: Date.now()
      };
    });

    expect(audit.played.ok).toBe(true);
    expect(audit.guestAudit.activeKind).toBe('play');
    expect(audit.guestAudit.starts.filter((entry) => entry.kind === 'transition')).toHaveLength(1);
    expect(audit.promoted.state.transition.kind).toBe('play');
    expect(audit.promoted.state.transition.endsAt).toBeGreaterThan(audit.now);
    expect(audit.promoted.state.transition.endsAt).toBeLessThan(audit.now + 12_000);
    expect(audit.promotedAudit.starts).toEqual(audit.guestAudit.starts);
    expect(audit.demoted.activeKind).toBe('play');
    expect(audit.demoted.activeSeq).toBe(audit.guestAudit.activeSeq);
    expect(audit.demotedAudit.starts).toEqual(audit.guestAudit.starts);
  });

  test('presentation cues expose no private hand data or DOM coordinates and add no network revision', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const hand = [
        { id: 'private-play-card', kind: 'minor', suit: 'Cup', number: 2 },
        { id: 'private-held-card-a', kind: 'minor', suit: 'Sword', number: 7 },
        { id: 'private-held-card-b', kind: 'minor', suit: 'Pentacle', number: 12 }
      ];
      debug.battleScenario({
        withTrick: false,
        revision: 17,
        turnIndex: 0,
        leaderIndex: 0,
        handsBySeat: [hand]
      });
      const before = debug.battlePublicState();
      const played = debug.battlePlayCards(0, ['private-play-card'], { resolve: false });
      const afterAction = debug.battlePublicState();
      debug.battleRender();
      const afterRender = debug.battlePublicState();
      const cues = afterAction.state.presentation?.cues || [];
      const cueKeys = [];
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        Object.entries(value).forEach(([key, entry]) => {
          cueKeys.push(key);
          visit(entry);
        });
      };
      visit(cues);
      return {
        played,
        before,
        afterAction,
        afterRender,
        cueText: JSON.stringify(cues),
        cueKeys
      };
    });

    expect(audit.played.ok).toBe(true);
    // A submitted play already advances once for the action and once for its
    // transition. Presentation must ride that same state instead of adding a
    // third authority revision (and therefore another publishable snapshot).
    expect(audit.afterAction.state.revision).toBe(audit.before.state.revision + 2);
    expect(audit.afterRender.state.revision).toBe(audit.afterAction.state.revision);
    expect(audit.afterRender.state.presentation).toEqual(audit.afterAction.state.presentation);
    expect(audit.afterAction.state.presentation.seq).toBeGreaterThan(audit.before.state.presentation.seq);
    expect(audit.cueText).not.toContain('private-play-card');
    expect(audit.cueText).not.toContain('private-held-card-a');
    expect(audit.cueText).not.toContain('private-held-card-b');
    [
      'hand',
      'handsBySeat',
      'selectedCardIds',
      'sourcePoint',
      'targetPoint',
      'clientX',
      'clientY',
      'left',
      'top',
      'rect'
    ].forEach((privateKey) => {
      expect(audit.cueKeys).not.toContain(privateKey);
    });
  });

  test('schema 1 and 2 keep current hands while normalizing legacy decks into drawDeck', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const makePlayers = (prefix) => [0, 1, 2, 3].map((seat) => ({
        hand: [{ id: `${prefix}-hand-${seat}`, kind: 'minor', suit: 'Wand', number: seat + 2 }],
        discard: []
      }));
      const makeState = (prefix, privateStateVersion) => ({
        handNo: 1,
        roundActive: true,
        phase: 'turn',
        turn: 0,
        ...(privateStateVersion ? { privateStateVersion } : {}),
        players: makePlayers(prefix),
        minorDeck: [{ id: `${prefix}-minor`, kind: 'minor', suit: 'Cup', number: 9 }],
        majorDeck: [{ id: `${prefix}-major`, kind: 'major', number: 20 }],
        openOracleCard: { id: `${prefix}-oracle`, kind: 'major', number: 17 },
        openOracleRevealed: true,
        hermitPreview: { owner: 0 }
      });
      const schema1 = debug.battleDeserialize({ schema: 1, state: makeState('s1', 0) });
      const schema2 = debug.battleDeserialize({ schema: 2, state: makeState('s2', 1) });
      return { schema1, schema2 };
    });

    expect(audit.schema1.players.map((player) => player.hand[0].id)).toEqual([
      's1-hand-0', 's1-hand-1', 's1-hand-2', 's1-hand-3'
    ]);
    expect(audit.schema2.players.map((player) => player.hand[0].id)).toEqual([
      's2-hand-0', 's2-hand-1', 's2-hand-2', 's2-hand-3'
    ]);
    expect(audit.schema1.drawDeck.map((card) => card.id)).toEqual(['s1-major', 's1-minor']);
    expect(audit.schema2.drawDeck.map((card) => card.id)).toEqual(['s2-major', 's2-minor']);
    expect(audit.schema2.privateStateVersion).toBe(1);
    expect(audit.schema2.reversePersist).toBeUndefined();
    expect(audit.schema2.openOracleCard).toBeUndefined();
    expect(audit.schema2.hermitPreview).toBeUndefined();
  });

  test('schema 13 adds enemy defeat mode while preserving HP carry and older matches', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false });
      const currentPublic = debug.battlePublicState();
      const schema13Payload = JSON.parse(JSON.stringify(currentPublic));
      schema13Payload.schema = 13;
      delete schema13Payload.state.rules.damageGrowthVersion;
      const schema13 = debug.battleDeserialize(schema13Payload);
      const schema12Payload = JSON.parse(JSON.stringify(currentPublic));
      schema12Payload.schema = 12;
      delete schema12Payload.state.rules.enemyDefeatMode;
      const schema12 = debug.battleDeserialize(schema12Payload);
      const schema11Payload = JSON.parse(JSON.stringify(currentPublic));
      schema11Payload.schema = 11;
      delete schema11Payload.state.rules.carryHpBetweenRoundsVersion;
      const schema11 = debug.battleDeserialize(schema11Payload);
      const legacy = debug.battleDeserialize({
        schema: 4,
        state: {
          handNo: 0,
          roundActive: true,
          phase: 'turn',
          turn: 0,
          rules: { initialHandSize: 8, handLimit: 8 },
          players: [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }]
        }
      });
      const effectsOnly = debug.battleDeserialize({
        schema: 5,
        state: {
          handNo: 0,
          roundActive: true,
          phase: 'turn',
          turn: 0,
          rules: { initialHandSize: 8, handLimit: 8, combatEffectsVersion: 1 },
          players: [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }]
        }
      });
      const summonsOnly = debug.battleDeserialize({
        schema: 6,
        state: {
          handNo: 0,
          roundActive: true,
          phase: 'turn',
          turn: 0,
          rules: {
            initialHandSize: 8,
            handLimit: 8,
            combatEffectsVersion: 1,
            summonVersion: 1,
            majorArcanaGateVersion: 1
          },
          players: [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }]
        }
      });
      const schema7 = debug.battleDeserialize({
        schema: 7,
        state: {
          handNo: 0,
          roundActive: true,
          phase: 'turn',
          turn: 0,
          rules: {
            initialHandSize: 8,
            handLimit: 8,
            combatEffectsVersion: 1,
            summonVersion: 1,
            majorArcanaGateVersion: 1
          },
          players: [{ hand: [] }, { hand: [] }, { hand: [] }, { hand: [] }]
        }
      });
      const current = debug.battleDeserialize(currentPublic);
      return {
        currentPublic,
        schema13,
        schema12,
        schema11,
        legacy,
        effectsOnly,
        summonsOnly,
        schema7,
        current
      };
    });
    expect(audit.currentPublic.schema).toBe(30);
    expect(audit.currentPublic.state.rules).toMatchObject({
      playerCount: 4,
      combatEffectsVersion: 1,
      arcanaLoadoutEffectsVersion: 7,
      roleChainVersion: 1,
      summonVersion: 1,
      graveTimingVersion: 1,
      majorArcanaGateVersion: 1,
      majorArcanaSpecialVersion: 2,
      majorBattleEffectsVersion: 3,
      elementAffinityVersion: 2,
      carryHpBetweenRoundsVersion: 1,
      forcedDrawDeathVersion: 1,
      damageGrowthVersion: 1,
      enemyDefeatMode: 'hp-zero'
    });
    expect(audit.schema13.rules.damageGrowthVersion).toBe(0);
    expect(audit.schema12.rules.enemyDefeatMode).toBe('hand-empty');
    expect(audit.schema11.rules).toMatchObject({
      majorBattleEffectsVersion: 1,
      elementAffinityVersion: 1,
      carryHpBetweenRoundsVersion: 0,
      forcedDrawDeathVersion: 0
    });
    expect(audit.legacy.rules.combatEffectsVersion).toBe(0);
    expect(audit.legacy.rules.summonVersion).toBe(0);
    expect(audit.legacy.rules.graveTimingVersion).toBe(0);
    expect(audit.effectsOnly.rules).toMatchObject({ combatEffectsVersion: 1, summonVersion: 0 });
    expect(audit.effectsOnly.rules.graveTimingVersion).toBe(0);
    expect(audit.effectsOnly.rules.majorArcanaGateVersion).toBe(0);
    expect(audit.summonsOnly.rules).toMatchObject({
      combatEffectsVersion: 1,
      summonVersion: 1,
      majorArcanaGateVersion: 0,
      majorArcanaSpecialVersion: 0
    });
    expect(audit.schema7.rules.majorArcanaGateVersion).toBe(1);
    expect(audit.schema7.rules.majorArcanaSpecialVersion).toBe(0);
    expect(audit.current.rules.combatEffectsVersion).toBe(1);
    expect(audit.current.rules.summonVersion).toBe(1);
    expect(audit.current.rules.graveTimingVersion).toBe(1);
    expect(audit.current.rules.majorArcanaGateVersion).toBe(1);
    expect(audit.current.rules.majorArcanaSpecialVersion).toBe(2);
    expect(audit.current.rules.majorBattleEffectsVersion).toBe(3);
    expect(audit.current.rules.elementAffinityVersion).toBe(2);
    expect(audit.current.rules.enemyDefeatMode).toBe('hp-zero');
  });

  test('場札はクリアまで保持し、小アルカナだけを所有者の墓地へまとめて送る', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const openingMinor = { id: 'grave-opening-minor', kind: 'minor', suit: 'Cup', number: 4 };
      const initial = debug.battleScenario({
        leaderIndex: 0,
        turnIndex: 1,
        tableCard: openingMinor,
        handCounts: [2, 2, 2, 2]
      });
      const afterPlay = debug.battlePlayOne(1);
      const afterClear = debug.battleClearTrick(1);

      const openingMajor = { id: 'grave-opening-major', kind: 'major', number: 20 };
      debug.battleScenario({
        leaderIndex: 0,
        turnIndex: 1,
        tableCard: openingMajor,
        handCounts: [2, 2, 2, 2]
      });
      const afterMajorOvertake = debug.battlePlayOne(1);
      const afterMajorClear = debug.battleClearTrick(1);
      return { initial, afterPlay, afterClear, afterMajorOvertake, afterMajorClear };
    });

    expect(audit.initial.players.map((player) => player.discard.length)).toEqual([0, 0, 0, 0]);
    expect(audit.initial.trickPile).toEqual([]);

    expect(audit.afterPlay.players.map((player) => player.discard.length)).toEqual([0, 0, 0, 0]);
    expect(audit.afterPlay.trickPile.map((entry) => ({
      owner: entry.owner,
      id: entry.card.id
    }))).toEqual([{ owner: 0, id: 'grave-opening-minor' }]);

    expect(audit.afterClear.trick).toBeNull();
    expect(audit.afterClear.trickPile).toEqual([]);
    expect(audit.afterClear.players[0].discard.map((card) => card.id)).toEqual(['grave-opening-minor']);
    expect(audit.afterClear.players[1].discard).toHaveLength(1);

    expect(audit.afterMajorOvertake.players.map((player) => player.discard.length)).toEqual([0, 0, 0, 0]);
    expect(audit.afterMajorOvertake.trickPile[0]).toMatchObject({
      owner: 0,
      card: { id: 'grave-opening-major', kind: 'major' }
    });
    expect(audit.afterMajorClear.players[0].discard).toEqual([]);
    expect(audit.afterMajorClear.players[1].discard).toHaveLength(1);
  });

  test('公開stateから手札・山札・未公開情報を除き自席だけ同revisionで復元する', async ({ page }) => {
    await openBattleDebug(page);
    const audit = await page.evaluate(() => {
      window.TarotKingdomDebug.battleScenario({ revision: 7, handCounts: [3, 4, 5, 6] });
      return window.TarotKingdomDebug.battlePrivateStateAudit();
    });

    expect(audit.publicHasNoSecretKeys).toBe(true);
    expect(audit.publicContainsSecretCardId).toBe(false);
    expect(audit.publicHandCounts).toEqual([3, 4, 5, 6]);
    expect(audit.publicDeckCount).toBe(60);
    expect(audit.localBeforeWasRedacted).toBe(true);
    expect(audit.localApplied).toBe(true);
    expect(audit.localAfterCount).toBe(3);
    expect(audit.localAfterHasCards).toBe(true);
    expect(audit.staleRejected).toBe(true);
    expect(audit.privateSeatIsolation).toBe(true);
    expect(audit.authorityHasAllSeats).toBe(true);
    expect(audit.hostHydrated).toBe(true);
    expect(audit.hostHandCounts).toEqual([3, 4, 5, 6]);
    expect(audit.hostDeckCount).toBe(60);
    await expect(page.locator('#tarotKingdomOracleCardWrap, #tarotKingdomHiddenOracleCardWrap')).toHaveCount(0);
    await expect(page.locator('#tarotKingdomDrawMajorButton, #tarotKingdomDrawMinorButton')).toHaveCount(0);
  });

  test('手札0・山札枯渇でもauthority stateから新ホストが復旧できる', async ({ page }) => {
    await openBattleDebug(page);
    const audit = await page.evaluate(() => {
      window.TarotKingdomDebug.battleScenario({ revision: 9, handCounts: [1, 2, 3, 4] });
      return window.TarotKingdomDebug.battlePrivateStateAudit({ emptySeat: 0, emptyDecks: true });
    });

    expect(audit.publicHasNoSecretKeys).toBe(true);
    expect(audit.publicHandCounts).toEqual([0, 2, 3, 4]);
    expect(audit.publicDeckCount).toBe(0);
    expect(audit.localApplied).toBe(true);
    expect(audit.localAfterCount).toBe(0);
    expect(audit.hostHydrated).toBe(true);
    expect(audit.hostHandCounts).toEqual([0, 2, 3, 4]);
    expect(audit.hostDeckCount).toBe(0);
  });

  test('unchanged private hands and authority collections publish revision-only deltas', async ({ page }) => {
    await openBattleDebug(page);
    const audit = await page.evaluate(() => {
      window.TarotKingdomDebug.battleScenario({ revision: 12, handCounts: [8, 8, 8, 8] });
      return window.TarotKingdomDebug.battleSecretWritePlanAudit();
    });

    expect(audit.initialKeys).toEqual([
      'authorityState',
      'privateHands/0',
      'privateHands/1',
      'privateHands/2',
      'privateHands/3'
    ]);
    expect(audit.unchangedKeys).toEqual([
      'authorityState/revision',
      'privateHands/0/revision',
      'privateHands/1/revision',
      'privateHands/2/revision',
      'privateHands/3/revision'
    ]);
    expect(audit.changedKeys).toContain('authorityState/handsBySeat/seat0');
    expect(audit.changedKeys).toContain('authorityState/drawDeck');
    expect(audit.changedKeys).toContain('privateHands/0');
    expect(audit.changedKeys).toContain('privateHands/1/revision');
    expect(audit.changedKeys).not.toContain('authorityState');
    expect(audit.unchangedBytes).toBeLessThan(audit.initialBytes / 10);
  });
});
