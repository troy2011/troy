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

  test('normal pass causes one counter and the final pass adds exactly one area attack', async ({ page }) => {
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
    expect(audit.normal.players.map((player) => player.hp)).toEqual([100, 82, 100, 100]);
    expect(audit.normal.transition).toMatchObject({ kind: 'enemyResponse', eventSeqs: [1] });

    expect(audit.finalPass.battle.events.map((event) => event.type)).toEqual(['enemy-single', 'enemy-area']);
    expect(audit.finalPass.players.map((player) => player.hp)).toEqual([90, 72, 90, 90]);
    expect(audit.finalPass.transition).toMatchObject({ kind: 'enemyResponse', eventSeqs: [1, 2] });
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

    await page.waitForTimeout(1220);
    const duringArea = await page.evaluate(() => (
      Array.from(document.querySelectorAll('#tarotKingdomBattleParty > .tarot-kingdom-battle-player'))
        .map((row) => ({
          ko: row.classList.contains('is-ko'),
          hp: row.querySelector('.tarot-kingdom-battle-player-hp-track')?.getAttribute('aria-valuenow') || ''
        }))
    ));
    expect(duringArea[0]).toMatchObject({ ko: true, hp: '0' });
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
      const originalRandom = Math.random;
      Math.random = () => 0;
      const afterConfusedPass = debug.battlePass(1);
      Math.random = originalRandom;

      debug.battleScenario({ leaderIndex: 0, turnIndex: 0, handsBySeat: hands(5), combatBySeat });
      const afterFive = debug.battlePlayOne(0);
      debug.battlePass(1);
      debug.battleResolveTransition();
      debug.battlePass(2);
      debug.battleResolveTransition();
      const afterFiveClear = debug.battlePass(3);

      return { afterEight, afterPetrifiedPass, afterEightClear, afterEleven, afterConfusedPass, afterFive, afterFiveClear };
    }, { combatBySeat: zeroDefenseParty });

    expect(audit.afterEight.battle.enemy.petrifiedUntilClear).toBe(true);
    expect(audit.afterPetrifiedPass.players[1].hp).toBe(100);
    expect(audit.afterPetrifiedPass.battle.events.map((event) => event.type)).toEqual(['attack']);
    expect(audit.afterEightClear.battle.enemy.petrifiedUntilClear).toBe(false);

    expect(audit.afterEleven.reverse).toBe(true);
    expect(audit.afterConfusedPass.players[1].hp).toBe(100);
    expect(audit.afterConfusedPass.battle.enemy.hp).toBe(audit.afterEleven.battle.enemy.hp - 18);
    expect(audit.afterConfusedPass.battle.events.at(-1)).toMatchObject({ type: 'enemy-self', attackKind: 'single', damage: 18 });

    expect(audit.afterFive.battle.enemy.areaAttackSealedUntilClear).toBe(true);
    expect(audit.afterFiveClear.battle.enemy.areaAttackSealedUntilClear).toBe(false);
    expect(audit.afterFiveClear.battle.events.filter((event) => event.type === 'enemy-single')).toHaveLength(3);
    expect(audit.afterFiveClear.battle.events.some((event) => event.type === 'enemy-area')).toBe(false);
    expect(audit.afterFiveClear.players.map((player) => player.hp)).toEqual([100, 82, 82, 82]);
  });

  test('enemy HP zero stops enemy damage but keeps player attack events', async ({ page }) => {
    const audit = await page.evaluate(({ combatBySeat }) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        enemyHp: 0,
        turnIndex: 1,
        leaderIndex: 0,
        hpBySeat: [100, 100, 100, 100],
        combatBySeat
      });
      const afterPass = debug.battlePass(1);

      debug.battleScenario({
        enemyHp: 0,
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

  test('KO skips without retaliation, hand zero wins, and party zero loses', async ({ page }) => {
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
        hpBySeat: [0, 1, 0, 0],
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
    expect(audit.handWin.battle).toMatchObject({ outcome: 'victory', resultReason: 'hand-empty' });
    expect(audit.handWin.phase).toBe('roundOutCinematic');
    expect(audit.partyLoss.battle).toMatchObject({ outcome: 'defeat', resultReason: 'party-defeated' });
    expect(audit.partyLoss.phase).toBe('resolvingEnemy');
    expect(audit.partyLoss.battle.events.map((event) => event.type)).toEqual(['enemy-single', 'defeat']);
    expect(audit.partyLoss.transition).toMatchObject({ kind: 'terminalEnemyResponse', eventSeqs: [1, 2] });
    expect(audit.lethalVisual).toEqual({ hurt: false, ko: false, defeatStage: false, restartVisible: false });
    await page.waitForTimeout(350);
    const hurtLethalVisual = await page.evaluate(() => {
      const avatar = document.getElementById('tarotKingdomBattleAvatar-1');
      return {
        hurt: avatar?.classList.contains('is-avatar-damaged') || false,
        ko: avatar?.classList.contains('is-avatar-defeated') || false
      };
    });
    expect(hurtLethalVisual).toEqual({ hurt: true, ko: false });
    await page.waitForTimeout(140);
    const revealedLethalVisual = await page.evaluate(() => {
      const avatar = document.getElementById('tarotKingdomBattleAvatar-1');
      return {
        hurt: avatar?.classList.contains('is-avatar-damaged') || false,
        ko: avatar?.classList.contains('is-avatar-defeated') || false
      };
    });
    expect(revealedLethalVisual).toEqual({ hurt: false, ko: true });
    const settlementConfirmButton = page.locator('#tarotKingdomSettlementConfirmButton');
    await expect(settlementConfirmButton).toBeHidden();
    await expect(settlementConfirmButton).toBeDisabled();
    await page.waitForFunction(() => document.getElementById('tarotKingdomBattleStage')?.classList.contains('is-defeat'));
    await page.waitForFunction(() => window.TarotKingdomDebug?.battleState?.()?.phase === 'done');
    await expect(settlementConfirmButton).toBeVisible();
    await expect(settlementConfirmButton).toBeEnabled();
    await expect(settlementConfirmButton).toHaveText('もう一度ゲームを始める');
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
    expect(audit.state.battle.enemy).toMatchObject({ maxHp: 420, hp: 420 });
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
    expect(audit.roles.towerSinglePower).toBe(14);
    expect(audit.roles.worldSingleValid).toBe(true);
    expect(audit.effectless).toBe(true);
    expect(audit.major14LockSuit).toBe('Wand');
    expect(audit.judgmentToggle).toEqual({ reverse: false, pending: true });
    expect(audit.twoCardMajorCut).toEqual({ forceClear: true, petrified: true });
    expect(audit.roleEffectsSuppressed).toBe(true);
  });

  test('Judgment 20 recovery follows the actual clearer, hand cap, draw, win, and KO rules', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleJudgmentAudit());

    expect(audit.afterOvertakenClear).toEqual({ pendingJudgment: 2, reverse: false, handCount: 4 });
    expect(audit.afterPick).toEqual({ pendingDraw: 2, handCount: 5, candidateRemaining: false });
    expect(audit.afterDraw.handCount).toBe(6);
    expect(audit.afterDraw.drawnKind).toBe('major');
    expect(audit.afterDraw.stars).toBe(audit.afterDraw.starsBefore);
    expect(audit.fullHand).toEqual({ pendingJudgment: null, pendingDraw: null, candidateRemaining: true });
    expect(audit.noCandidate).toEqual({ pendingJudgment: null, pendingDraw: 2 });
    expect(audit.handZero).toMatchObject({
      outcome: 'victory',
      reason: 'hand-empty',
      judgmentPending: false,
      pendingJudgment: null
    });
    expect(audit.koClearer).toEqual({ pendingJudgment: 3, resolvedTurn: 3 });
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

  test('all four hands continue, heal the party, and retain the frozen profile', async ({ page }) => {
    const audit = await page.evaluate(() => window.TarotKingdomDebug.battleRunFourRounds());
    expect(audit.rounds.map((round) => round.completedHandNo)).toEqual([1, 2, 3, 4]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyMaxHp)).toEqual([500, 580, 660]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyPassDamage)).toEqual([20, 22, 24]);
    expect(audit.rounds.slice(0, 3).map((round) => round.nextRound.enemyAreaDamage)).toEqual([12, 14, 16]);
    for (const round of audit.rounds.slice(0, 3)) {
      expect(round.nextRound.hpBySeat).toEqual(round.nextRound.maxHpBySeat);
      expect(round.characterSnapshotCreatedAt).toBe(audit.snapshotCreatedAt);
    }
    expect(audit.rounds[3].matchDone).toBe(true);
    expect(audit.state.handNo).toBe(4);
    expect(audit.state.champion).toBe(0);
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
    expect(audit.callDamage).toMatchObject({ kind: 'skill', baseDamage: 108, damage: 108 });
    expect(audit.zeroRateCallDamage).toMatchObject({ kind: 'skill', baseDamage: 90, damage: 90 });
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
});
