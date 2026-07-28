const { test, expect } = require('@playwright/test');
const {
  TAROT_KINGDOM_RAID_BOSSES,
  TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT,
  TAROT_KINGDOM_RAID_GLOBAL_DOC_ID,
  applyTarotKingdomRaidDamage,
  buildTarotKingdomRaidPublicState,
  createTarotKingdomRaidSpawnState,
  getTarotKingdomRaidDayKey
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

  test('daily attempts reset on the JST date boundary and stop at four', () => {
    expect(getTarotKingdomRaidDayKey(Date.UTC(2026, 6, 27, 14, 59, 59))).toBe('2026-07-27');
    expect(getTarotKingdomRaidDayKey(Date.UTC(2026, 6, 27, 15, 0, 0))).toBe('2026-07-28');
    const state = buildTarotKingdomRaidPublicState(null, {
      nation: 'fire',
      attemptsUsed: 99,
      dayKey: '2026-07-28'
    });
    expect(state.attemptsUsed).toBe(TAROT_KINGDOM_RAID_DAILY_ATTEMPT_LIMIT);
    expect(state.attemptsRemaining).toBe(0);
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
