const { test, expect } = require('@playwright/test');
const {
  TAROT_KINGDOM_RAID_BOSSES,
  TAROT_KINGDOM_RAID_ENCOUNTER_RATE,
  TAROT_KINGDOM_RAID_GLOBAL_DOC_ID,
  applyTarotKingdomRaidDamage,
  buildTarotKingdomRaidPublicState,
  createTarotKingdomRaidSpawnState,
  isTarotKingdomRaidPartyEligible,
  rollTarotKingdomRaidEncounter
} = require('../server/tarotKingdomRaid');

test.describe('Tarot Kingdom raid server rules', () => {
  test('all nations share one global raid HP document', () => {
    expect(TAROT_KINGDOM_RAID_GLOBAL_DOC_ID).toBe('global');
  });

  test('large bosses use the intended pre-transformation monsters', () => {
    expect(TAROT_KINGDOM_RAID_BOSSES).toEqual([
      expect.objectContaining({
        name: 'バルガン',
        preFormMonsterName: 'グラヴァ',
        maxHp: 250000
      }),
      expect.objectContaining({
        name: 'アビソス',
        preFormMonsterName: 'ネブラ',
        maxHp: 400000
      }),
      expect.objectContaining({
        name: 'オルビス',
        preFormMonsterName: 'メカノ',
        maxHp: 600000
      })
    ]);
  });

  test('raid attempts are unlimited and encounters use a low fixed probability', () => {
    const state = buildTarotKingdomRaidPublicState(null, {
      nation: 'fire',
      attemptsUsed: 999
    });
    expect(state).toMatchObject({
      unlimitedAttempts: true,
      attemptsUsed: null,
      attemptsRemaining: null,
      dailyAttemptLimit: null
    });
    expect(TAROT_KINGDOM_RAID_ENCOUNTER_RATE).toBe(0.05);
    expect(rollTarotKingdomRaidEncounter(0)).toBe(true);
    expect(rollTarotKingdomRaidEncounter(0.049999)).toBe(true);
    expect(rollTarotKingdomRaidEncounter(0.05)).toBe(false);
    expect(rollTarotKingdomRaidEncounter(0.9)).toBe(false);
  });

  test('raid requires four seats containing only players or pets', () => {
    const player = (playFabId) => ({ isNpc: false, isPet: false, playFabId });
    const pet = (ownerPlayFabId) => ({ isNpc: true, isPet: true, petOwnerPlayFabId: ownerPlayFabId });
    const npc = () => ({ isNpc: true, isPet: false });
    expect(isTarotKingdomRaidPartyEligible([
      player('P1'),
      pet('P1'),
      player('P2'),
      pet('P2')
    ])).toBe(true);
    expect(isTarotKingdomRaidPartyEligible([
      player('P1'),
      player('P2'),
      player('P3'),
      player('P4')
    ])).toBe(true);
    expect(isTarotKingdomRaidPartyEligible([
      player('P1'),
      pet('P1'),
      player('P2'),
      npc()
    ])).toBe(false);
    expect(isTarotKingdomRaidPartyEligible([
      player('P1'),
      player('P2'),
      player('P3')
    ])).toBe(false);
  });

  test('shared HP applies damage once and only the zeroing update becomes the finisher', () => {
    const spawned = createTarotKingdomRaidSpawnState({
      nation: 'water',
      bossId: 'ismartal-vol2-monster-07',
      actorPlayFabId: 'KING',
      nowMs: 1000
    });
    const first = applyTarotKingdomRaidDamage(spawned, 249900, {
      playFabId: 'P1',
      displayName: '先行'
    }, 2000);
    expect(first).toMatchObject({
      appliedDamage: 249900,
      hpBefore: 250000,
      hpAfter: 100,
      defeatedNow: false
    });
    const last = applyTarotKingdomRaidDamage(first.writeState, 500, {
      playFabId: 'P2',
      displayName: 'とどめ'
    }, 3000);
    expect(last).toMatchObject({
      appliedDamage: 100,
      hpBefore: 100,
      hpAfter: 0,
      defeatedNow: true
    });
    expect(last.writeState).toMatchObject({
      active: false,
      defeatedByPlayFabId: 'P2',
      defeatedByDisplayName: 'とどめ'
    });
    const duplicate = applyTarotKingdomRaidDamage(last.writeState, 500, {
      playFabId: 'P3',
      displayName: '遅延'
    }, 4000);
    expect(duplicate).toMatchObject({
      appliedDamage: 0,
      defeatedNow: false
    });
  });
});

test.describe('Tarot Kingdom raid battle damage protection', () => {
  test('Death uses its grave-based major tier in raids and stays below the 999 cap', async ({ page }) => {
    await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');

    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        turnIndex: 0,
        combatBySeat: [{
          intelligence: 200,
          equipmentMagicPower: 100
        }],
        handsBySeat: [[
          { id: 'raid-death', kind: 'major', suit: 'None', number: 13 },
          { id: 'raid-reserve', kind: 'minor', suit: 'Cup', number: 2 }
        ]],
        raid: {
          version: 1,
          attemptId: 'raid-damage-cap',
          raidId: 'global',
          bossId: 'ismartal-vol2-monster-07',
          preFormMonsterId: 'ismartal-vol3-monster-01',
          bossMaxHp: 250000,
          bossHpAtStart: 250000,
          phase: 'boss'
        }
      });
      debug.battleSetCombatRandom(0);
      const played = debug.battlePlayCards(0, ['raid-death'], { resolve: false });
      const events = played.state.battle.events;
      const event = events[events.length - 1];
      const death = event.effects.find((entry) => entry.kind === 'major-damage');
      return { event, death, rules: played.state.rules };
    });

    expect(audit.rules.damageGrowthVersion).toBe(1);
    expect(audit.event.damage).toBeGreaterThan(0);
    expect(audit.event.damage).toBeLessThanOrEqual(999);
    expect(audit.event.hpBefore - audit.event.hpAfter).toBe(audit.event.damage);
    expect(audit.death).toBeTruthy();
    expect(audit.death.amount).toBeLessThanOrEqual(999);
  });
});
