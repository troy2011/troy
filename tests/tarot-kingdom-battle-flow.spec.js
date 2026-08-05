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
    expect(audit.roleDamage.map((entry) => entry.baseDamage)).toEqual([
      baseDamage,
      Math.floor(baseDamage * 1.25),
      Math.floor(baseDamage * 1.5),
      Math.floor(baseDamage * 1.75)
    ]);
    expect(audit.published.schema).toBe(21);
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

  test('Magician I and a minor Ace cannot form a two-card set', async ({ page }) => {
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
      return { pair, reversedPair, minorPair, triple, played };
    });

    expect(audit.pair).toEqual({ ok: false, reason: '魔術師IとAは2枚組にできません。' });
    expect(audit.reversedPair).toEqual(audit.pair);
    expect(audit.minorPair).toMatchObject({ ok: true, play: { type: 'set', count: 2 } });
    expect(audit.triple).toMatchObject({ ok: true, play: { type: 'set', count: 3 } });
    expect(audit.played).toMatchObject({
      ok: false,
      reason: '魔術師IとAは2枚組にできません。'
    });
    expect(audit.played.state.players[0].hand).toHaveLength(4);
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

  test('demo enemy selection also switches stats and ailment profile', async ({ page }) => {
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
        statusKey: 'poison',
        scope: 'single'
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
    expect(audit.poison.battle.effects.players[0].poison.charges).toBe(1);
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
    expect(audit.fear.battle.events.at(-1)).toMatchObject({ damage: 0, attackBlocked: true });
    expect(audit.confusion.battle.events.at(-1)).toMatchObject({ damage: 0, attackBlocked: true });
    expect(audit.confusion.players[0].hp).toBeLessThan(100);
    expect(audit.weaken.battle.events.at(-1).damage)
      .toBeLessThan(audit.baseline.battle.events.at(-1).damage);
    expect(audit.wet.battle.events.at(-1).damage)
      .toBeLessThan(audit.baseline.battle.events.at(-1).damage);
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
      potency: 4,
      charges: 3,
      expiresOn: 'action'
    });
    expect(audit.inflicted.battle.events.at(-1).effects).toContainEqual(expect.objectContaining({
      kind: 'enemy-ailment',
      targetIndex: 1,
      statusKey: 'poison',
      success: true
    }));
    expect(audit.cleared.battle.effects.players[1].poison).toBeTruthy();
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
      debug.battleScenario({ turnIndex: 1, leaderIndex: 0, hpBySeat: [100, 100, 100, 100], combatBySeat });
      debug.battleSetEffects({
        enemy: {
          poison: { key: 'poison', potency: 5, charges: null },
          paralysis: { key: 'paralysis', potency: 1, charges: 1 }
        },
        party: {}, players: [{}, {}, {}, {}]
      });
      const stopped = debug.battlePass(1);

      debug.battleScenario({ turnIndex: 1, leaderIndex: 0, hpBySeat: [100, 100, 100, 100], combatBySeat });
      debug.battleSetEffects({
        enemy: { blind: { key: 'blind', potency: 25, charges: null } },
        party: { cover: { key: 'cover', potency: 27, charges: 1, coverIndex: 0 } },
        players: [{}, {}, {}, {}]
      });
      const covered = debug.battlePass(1);

      debug.battleScenario({
        turnIndex: 1, leaderIndex: 0, pass: [false, false, true, true],
        hpBySeat: [100, 100, 100, 100], combatBySeat
      });
      debug.battleSetEffects({
        enemy: {}, party: { areaGuard: { key: 'areaGuard', potency: 30, charges: 1 } },
        players: [{}, {}, {}, {}]
      });
      const guardedArea = debug.battlePass(1);
      return { stopped, covered, guardedArea };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.stopped.battle.enemy.hp).toBe(510);
    expect(audit.stopped.players.map((player) => player.hp)).toEqual([100, 100, 100, 100]);
    expect(audit.stopped.battle.events.at(-1)).toMatchObject({ type: 'enemy-status' });
    expect(audit.stopped.battle.effects.enemy.poison).toBeTruthy();
    expect(audit.stopped.battle.effects.enemy.paralysis).toBeUndefined();

    expect(audit.covered.players.map((player) => player.hp)).toEqual([86, 100, 100, 100]);
    expect(audit.covered.battle.events[0].effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'blind', potency: 25 }),
      expect.objectContaining({ kind: 'cover', potency: 27 })
    ]));

    expect(audit.guardedArea.players.map((player) => player.hp)).toEqual([100, 64, 91, 91]);
    expect(audit.guardedArea.battle.events.at(-1)).toMatchObject({
      type: 'enemy-area',
      targetIndexes: [1, 2, 3],
      protectedPlayerIndex: 0
    });
    expect(audit.guardedArea.battle.effects.party.areaGuard).toBeUndefined();
  });

  test('weapon and equipped-card resonance share one event without persistent status markers', async ({ page }) => {
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
      resonanceName: '盾割り',
      weaponEffectName: '有効打'
    });
    expect(result.battle.resonanceTriggers).toEqual([]);
    expect(result.transition.endsAt - result.transition.startedAt).toBe(1204);
    await expect(page.locator('.tarot-kingdom-status-tray, .tarot-kingdom-status-icon')).toHaveCount(0);
    await page.waitForTimeout(810);
    await expect(page.locator('.tarot-kingdom-effect-banner')).toHaveText('盾割り');
  });

  test('selected card effects replace the guardian passive in the compact arcana navigation', async ({ page }) => {
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
    await expect(exactCard.locator('.tarot-card-resonance-mark')).toHaveText('共');
    await expect(exactCard.locator('[aria-label="装備カード共鳴 100%"]')).toHaveCount(1);
    await exactCard.click();
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('V / 5スキップ');
    await expect(page.locator('#tarotKingdomGuardianPassiveLabel')).toHaveText('共鳴');
    await expect(page.locator('#tarotKingdomGuardianPassiveName')).toBeHidden();
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('盾割り');
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('共鳴100%');
    await expect(page.locator('#tarotKingdomArcanaNav')).toContainText('R0：54ダメージ');

    await exactCard.click();
    const awakenedCard = page.locator('#tarotKingdomHand [data-card-id="hud-major-5"]');
    await expect(awakenedCard.locator('.tarot-card-resonance-mark')).toHaveCount(1);
    await expect(awakenedCard.locator('[aria-label="同じ数字の装備カード共鳴 50%"]')).toHaveText('共');
    await expect(awakenedCard.locator('[aria-label="守護アルカナ覚醒"]')).toHaveCount(0);
    await awakenedCard.click();
    await expect(page.locator('#tarotKingdomSelectedEffectText')).toHaveText('法王 / 5スキップ');
    await expect(page.locator('#tarotKingdomSelectedEffectText')).not.toContainText('共鳴');
    await expect(page.locator('#tarotKingdomGuardianPassiveLabel')).toHaveText('共鳴');
    await expect(page.locator('#tarotKingdomGuardianPassiveName')).toBeHidden();
    await expect(page.locator('#tarotKingdomArcanaNav')).not.toContainText('盾割り');
    await expect(page.locator('#tarotKingdomGuardianPassiveText')).toContainText('R0：27ダメージ');
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

    expect(audit.currentRules.arcanaLoadoutEffectsVersion).toBe(3);
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
      return { priestess, temperance, temperanceAttemptOk: temperanceAttempt.ok, temperanceAttemptReason: temperanceAttempt.reason };
    });

    expect(audit.priestess.players[0].hp).toBe(55);
    expect(audit.priestess.battle.events.at(-1).effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'guardian-passive', label: '聖杯の叡智', amount: 5 })
    ]));
    expect({ ok: audit.temperanceAttemptOk, reason: audit.temperanceAttemptReason }).toEqual({ ok: true, reason: undefined });
    expect(audit.temperance.players.map((player) => player.hp)).toEqual([65, 65, 65, 65]);
    expect(audit.temperance.battle.effects.players.every((effects) => effects.hpShield?.shieldHp === 15)).toBe(true);
  });

  test('guardian Temperance copies the previous confirmed minor result once at half strength', async ({ page }) => {
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
          character([{ slot: 0, suit: 'Sword', rank: 14, cardLevel: 1, resonanceId: 'sword-14' }], {
            itemId: 'tarot_major_14', number: 14, cardLevel: 1, passiveId: 'guardian-v3-14'
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
        copiedEffects: copied.battle.events.at(-1).effects.filter((effect) => effect.source === 'guardian-14-copy')
      };
    });

    expect(audit.sourceEffect.amount).toBeGreaterThan(0);
    expect({ ok: audit.copiedAttemptOk, reason: audit.copiedAttemptReason }).toEqual({ ok: true, reason: undefined });
    expect(audit.copiedEffects).toHaveLength(1);
    expect(audit.copiedEffects[0]).toMatchObject({ copied: true, success: true });
    expect(audit.copiedEffects[0].displayAmount).toBe(Math.max(1, Math.floor(audit.sourceEffect.displayAmount * 0.5)));
  });

  test('compact ailments and resonance marks fit 390px and 900px layouts', async ({ page }) => {
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
        const nodes = Array.from(document.querySelectorAll('.tarot-card-resonance-mark'));
        return {
          overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          legacyStatusMarkerCount: document.querySelectorAll('.tarot-kingdom-status-tray, .tarot-kingdom-status-icon').length,
          ailmentLabels: Array.from(document.querySelectorAll('.tarot-kingdom-battle-status-icon')).map((node) => node.getAttribute('aria-label')),
          primaryStatus: document.querySelector('[data-player-index="0"] .tarot-kingdom-status-aura')?.dataset.status || '',
          boxes: nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          })
        };
       });
       expect(audit.overflowing).toBe(false);
       expect(audit.legacyStatusMarkerCount).toBe(0);
       expect(audit.ailmentLabels).toEqual(['睡眠', '凍結']);
       expect(audit.primaryStatus).toBe('sleep');
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
    expect(audit.hostPublicState.schema).toBe(21);
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
    await expect(settlementConfirmButton).toHaveText('もう一度遊ぶ');
    expect(audit.partyLoss.champion).toBeNull();
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
    expect(audit.openingEffects['5']).toMatchObject({ openingNumber: 5, turn: 2, areaSealed: true });
    expect(audit.openingEffects['8']).toMatchObject({ openingNumber: 8, callOnly: true, petrified: true });
    expect(audit.openingEffects['11']).toMatchObject({ openingNumber: 11, reverse: true });
    expect(audit.openingEffects['14']).toMatchObject({ openingNumber: 14, lockSuit: null });
    expect(audit.openingEffects['20']).toMatchObject({ openingNumber: 20, reverse: true, judgmentPending: true });

    expect(audit.roles.validWorld).toMatchObject({ key: 'TheWorld', baseRate: 3, strength: 5 });
    expect(audit.roles.worldWithout21?.key).not.toBe('TheWorld');
    expect(audit.roles.worldWithMinor?.key).not.toBe('TheWorld');
    expect(audit.roles.fourMajors).toBeNull();
    expect(audit.roles.foolStraight).toMatchObject({ key: 'Straight' });
    expect(audit.roles.magicianStraightFlush).toMatchObject({ key: 'StraightFlush' });
    expect(audit.roles.worldCallOk).toBe(true);
    expect(audit.roles.worldCallRole).toMatchObject({ key: 'TheWorld', baseRate: 3 });
    expect(audit.roles.invalidMajorCall).toEqual({
      ok: false,
      reason: '大アルカナ場札は、ザ・ワールドのみコール可能です。'
    });
    expect(audit.roles.lockedCallWrongSuit.ok).toBe(false);
    expect(audit.roles.lockedCallWrongSuit.reason).toBe(
      '14ロック中: 場札を含む5枚すべてカップが必要です。'
    );
    expect(audit.roles.lockedCallSameSuit.ok).toBe(true);
    expect(audit.roles.towerSinglePower).toBe(16);
    expect(audit.roles.legacyTowerSinglePower).toBe(14);
    expect(audit.roles.worldSingleValid).toBe(true);
    expect(audit.effectless).toBe(true);
    expect(audit.major14LockSuit).toBeNull();
    expect(audit.minor14LockSuit).toBe('Wand');
    expect(audit.major14Unlock).toEqual({ playableThroughLock: true, lockSuit: null });
    expect(audit.majorSuitGate.sameSuit).toMatchObject({ ok: true, setPower: 16 });
    expect(audit.majorSuitGate.differentSuit).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.differentSuit.reason).toContain('同じスート');
    expect(audit.majorSuitGate.ace).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.ace.reason).toContain('Aには');
    expect(audit.majorSuitGate.pair).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.pair.reason).toContain('1枚札');
    expect(audit.majorSuitGate.empty).toMatchObject({ ok: false, setPower: 16 });
    expect(audit.majorSuitGate.empty.reason).toContain('場が空');
    expect(audit.majorSuitGate.lastFinish).toMatchObject({ ok: true, setPower: 16 });
    expect(audit.majorSuitGate.role).toEqual({ ok: true, key: 'Straight' });
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
    expect(audit.devil.locked.reason).toContain('スート縛り');

    expect(audit.judgment.onMinorAce.ok).toBe(false);
    expect(audit.judgment.onMinorAce.reason).toContain('Aには');
    expect(audit.judgment.onMagician.ok).toBe(true);
    expect(audit.judgment.finish.ok).toBe(false);
    expect(audit.judgment.finish.reason).toContain('単独上がり');

    expect(audit.finish.ace.ok).toBe(false);
    expect(audit.finish.world.ok).toBe(false);
    expect(audit.finish.tower.ok).toBe(true);
    expect(audit.finish.leaveAce.ok).toBe(true);
    expect(audit.finish.worldRole).toEqual({ ok: true, roleKey: 'TheWorld' });
    expect(audit.worldAgainstFiveCardRole.ok).toBe(false);
    expect(audit.worldAgainstFiveCardRole.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.worldOverMinorNormal.ok).toBe(false);
    expect(audit.worldReverse.worldOverMinorNormal.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.worldOverMinorReverse.ok).toBe(false);
    expect(audit.worldReverse.worldOverMajorNormal.ok).toBe(true);
    expect(audit.worldReverse.worldOverMajorReverse.ok).toBe(true);
    expect(audit.worldReverse.worldOverMajorPair.ok).toBe(false);
    expect(audit.worldReverse.worldOverMajorPair.reason).toContain('大アルカナ1枚');
    expect(audit.worldReverse.minorOverWorldNormal.ok).toBe(false);
    expect(audit.worldReverse.minorOverWorldReverse.ok).toBe(true);
    expect(audit.schema7Compatibility.devilOnNumberTen.ok).toBe(true);
    expect(audit.schema7Compatibility.judgmentFinish.ok).toBe(true);
    expect(audit.schema7Compatibility.worldFinish.ok).toBe(true);
    expect(audit.schema7Compatibility.towerFinish.ok).toBe(false);

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
      phase: 'turn'
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

    expect(audit.forcedLeaderDraw).toEqual({
      turn: 0,
      handCount: 2,
      deckCount: 0,
      legal: true,
      blocked: [],
      battleEventCount: 0
    });
    expect(audit.parentTransfer).toEqual({
      turn: 1,
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
    expect(audit.descriptions['20']).toContain('A不可 / 11バック / 墓地回収');
    expect(audit.descriptions['21']).toContain('大アルカナ1枚に返して即クリア');
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

  test('Judgment 20 recovery follows the actual clearer, hand cap, finish ban, and KO rules', async ({ page }) => {
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
      playAllowed: false
    });
    expect(audit.handZero.validationReason).toContain('単独上がり');
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
      maxHp: 237,
      passDamage: 11,
      areaDamage: 6,
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
    expect(audit.publicState.schema).toBe(21);
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
    expect(audit.published.schema).toBe(21);
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
    expect(audit.callDamage).toMatchObject({ kind: 'skill', baseDamage: 172, damage: 190 });
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
    expect(audit.currentPublic.schema).toBe(21);
    expect(audit.currentPublic.state.rules).toMatchObject({
      playerCount: 4,
      combatEffectsVersion: 1,
      arcanaLoadoutEffectsVersion: 3,
      roleChainVersion: 1,
      summonVersion: 1,
      graveTimingVersion: 1,
      majorArcanaGateVersion: 1,
      majorArcanaSpecialVersion: 1,
      majorBattleEffectsVersion: 2,
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
    expect(audit.current.rules.majorArcanaSpecialVersion).toBe(1);
    expect(audit.current.rules.majorBattleEffectsVersion).toBe(2);
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
