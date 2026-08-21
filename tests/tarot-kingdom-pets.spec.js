const { test, expect } = require('@playwright/test');
const manifest = require('../public/Sprites/pixel-monsters/manifest.json');
const {
  TAROT_KINGDOM_PET_MAX_LEVEL,
  TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT,
  awardTarotKingdomPetExperience,
  buildTarotKingdomPetOfferView,
  buildTarotKingdomPetPublicRecord,
  getTarotKingdomPetRecruitChance,
  getTarotKingdomPetBattleExperience,
  getTarotKingdomPetExperienceToNextLevel,
  isTarotKingdomPetRecruitEligible,
  normalizeTarotKingdomPetState,
  parseTarotKingdomPetNickname,
  renameTarotKingdomCurrentPet,
  resolveTarotKingdomPetChoice,
  rollTarotKingdomPetOffer
} = require('../server/tarotKingdomPets');

const normalMonster = manifest.find((monster) => monster.isBoss !== true);
const bossMonster = manifest.find((monster) => monster.isBoss === true);

function eligibleFinisher(overrides = {}) {
  return {
    roundNo: 4,
    playerIndex: 0,
    playFabId: 'PF_HUMAN',
    isNpc: false,
    isPet: false,
    defeatMode: 'hp-zero',
    mode: 'offline',
    ...overrides
  };
}

test.describe('Tarot Kingdom monster recruitment', () => {
  test('the roster exposes 47 recruitable monsters and excludes the three bosses', () => {
    expect(manifest.filter((monster) => monster.isBoss !== true)).toHaveLength(47);
    expect(manifest.filter((monster) => monster.isBoss === true)).toHaveLength(3);
  });

  test('eligibility accepts only the owner or owner pet as the offline finisher in either defeat mode', () => {
    const encounter = { monsterId: normalMonster.id };
    [1, 2, 3, 4].forEach((roundNo) => {
      ['hp-zero', 'hand-empty'].forEach((defeatMode) => {
        expect(isTarotKingdomPetRecruitEligible({
          encounter,
          outcome: 'victory',
          finisher: eligibleFinisher({ roundNo, defeatMode }),
          authenticatedPlayFabId: 'PF_HUMAN'
        })).toBe(true);
        expect(isTarotKingdomPetRecruitEligible({
          encounter,
          outcome: 'victory',
          finisher: eligibleFinisher({ roundNo, defeatMode, isNpc: true, isPet: true }),
          authenticatedPlayFabId: 'PF_HUMAN'
        })).toBe(true);
      });
    });

    const rejected = [
      { encounter: { monsterId: bossMonster.id } },
      { outcome: 'defeat' },
      { finisher: eligibleFinisher({ roundNo: 0 }) },
      { finisher: eligibleFinisher({ roundNo: 5 }) },
      { finisher: eligibleFinisher({ isNpc: true }) },
      { finisher: eligibleFinisher({ isNpc: true, isPet: false }) },
      { finisher: eligibleFinisher({ defeatMode: '' }) },
      { finisher: eligibleFinisher({ defeatMode: 'unknown' }) },
      { finisher: eligibleFinisher({ mode: 'online' }) },
      { finisher: eligibleFinisher({ playFabId: 'PF_OTHER' }) }
    ];
    rejected.forEach((overrides) => {
      expect(isTarotKingdomPetRecruitEligible({
        encounter,
        outcome: 'victory',
        finisher: eligibleFinisher(),
        authenticatedPlayFabId: 'PF_HUMAN',
        ...overrides
      })).toBe(false);
    });
  });

  test('recruitment chance decreases from 15 percent to 5 percent by stage', () => {
    expect(TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT).toBe(16);
    for (let stageNo = 1; stageNo <= 11; stageNo += 1) {
      expect(getTarotKingdomPetRecruitChance(stageNo)).toBe((16 - stageNo) / 100);
    }
  });

  test('the stage-weighted roll creates one persistent offer and never rerolls while pending', () => {
    const first = rollTarotKingdomPetOffer({
      state: null,
      encounter: { monsterId: normalMonster.id, stageNo: 1 },
      explorationId: 'explore-1',
      random: () => 0.149
    });
    expect(first.created).toBe(true);
    expect(first.offer).toMatchObject({
      monsterId: normalMonster.id,
      explorationId: 'explore-1'
    });

    const retry = rollTarotKingdomPetOffer({
      state: first.state,
      encounter: { monsterId: manifest.find((monster) => monster.isBoss !== true && monster.id !== normalMonster.id).id },
      explorationId: 'explore-2',
      random: () => 0
    });
    expect(retry.created).toBe(false);
    expect(retry.offer).toEqual(first.offer);

    const miss = rollTarotKingdomPetOffer({
      state: null,
      encounter: { monsterId: normalMonster.id, stageNo: 11 },
      explorationId: 'explore-3',
      random: () => 0.05
    });
    expect(miss.offer).toBeNull();
  });

  test('accept replaces the one pet, decline preserves it, and response retries are idempotent', () => {
    const oldMonster = manifest.find((monster) => monster.isBoss !== true && monster.id !== normalMonster.id);
    const initial = normalizeTarotKingdomPetState({
      currentPet: {
        monsterId: oldMonster.id,
        acquiredAtMs: 100,
        explorationId: 'old-exploration'
      },
      pendingOffer: {
        offerId: `tkpet-new-exploration-${normalMonster.id}`,
        monsterId: normalMonster.id,
        explorationId: 'new-exploration',
        rolledAtMs: 200
      }
    });

    const declined = resolveTarotKingdomPetChoice(initial, initial.pendingOffer.offerId, false, 300);
    expect(declined.state.currentPet.monsterId).toBe(oldMonster.id);
    expect(declined.state.pendingOffer).toBeNull();

    const accepted = resolveTarotKingdomPetChoice(initial, initial.pendingOffer.offerId, true, 400);
    expect(accepted.state.currentPet).toMatchObject({
      monsterId: normalMonster.id,
      explorationId: 'new-exploration',
      acquiredAtMs: 400
    });
    expect(accepted.state.pendingOffer).toBeNull();

    const retry = resolveTarotKingdomPetChoice(accepted.state, initial.pendingOffer.offerId, true, 500);
    expect(retry).toMatchObject({ resolved: true, accepted: true, alreadyResolved: true });
    expect(retry.state.currentPet.acquiredAtMs).toBe(400);

    const view = buildTarotKingdomPetOfferView(initial.pendingOffer, initial.currentPet);
    expect(view.monsterName).toBe(normalMonster.name);
    expect(view.currentPet.monsterName).toBe(oldMonster.name);
  });

  test('pet nicknames persist safely and become the public display name', () => {
    const initial = normalizeTarotKingdomPetState({
      version: 1,
      currentPet: {
        monsterId: normalMonster.id,
        acquiredAtMs: 100,
        explorationId: 'nickname-test'
      }
    });
    const renamed = renameTarotKingdomCurrentPet(initial, '  ルナ  ');
    expect(renamed).toMatchObject({
      renamed: true,
      state: {
        version: 3,
        currentPet: {
          monsterId: normalMonster.id,
          nickname: 'ルナ'
        }
      }
    });
    expect(buildTarotKingdomPetPublicRecord(renamed.state.currentPet)).toMatchObject({
      monsterName: normalMonster.name,
      nickname: 'ルナ',
      displayName: 'ルナ'
    });
    expect(parseTarotKingdomPetNickname('１２３')).toBe('123');
    expect(parseTarotKingdomPetNickname('')).toBeNull();
    expect(parseTarotKingdomPetNickname('1234567890123')).toBeNull();
  });

  test('pet experience is persistent, idempotent and can raise multiple levels', () => {
    const initial = normalizeTarotKingdomPetState({
      version: 2,
      currentPet: {
        monsterId: normalMonster.id,
        acquiredAtMs: 100,
        explorationId: 'level-test'
      }
    });
    expect(initial).toMatchObject({
      version: 3,
      currentPet: { level: 1, experience: 0 },
      experienceAwards: []
    });
    expect(getTarotKingdomPetBattleExperience(1)).toBe(60);
    expect(getTarotKingdomPetBattleExperience(11)).toBe(260);
    expect(getTarotKingdomPetExperienceToNextLevel(1)).toBe(100);

    const first = awardTarotKingdomPetExperience(initial, {
      awardId: 'exploration-pet-exp-1',
      amount: 60,
      expectedMonsterId: normalMonster.id,
      now: 200
    });
    expect(first).toMatchObject({
      awarded: true,
      alreadyAwarded: false,
      progress: {
        gainedExperience: 60,
        previousLevel: 1,
        level: 1,
        experience: 60,
        leveledUp: false
      },
      state: { currentPet: { level: 1, experience: 60 } }
    });

    const retry = awardTarotKingdomPetExperience(first.state, {
      awardId: 'exploration-pet-exp-1',
      amount: 9999,
      expectedMonsterId: normalMonster.id,
      now: 300
    });
    expect(retry).toMatchObject({
      alreadyAwarded: true,
      progress: { gainedExperience: 60, level: 1, experience: 60 }
    });
    expect(retry.state.currentPet.experience).toBe(60);

    const multiLevel = awardTarotKingdomPetExperience(retry.state, {
      awardId: 'exploration-pet-exp-2',
      amount: 300,
      expectedMonsterId: normalMonster.id,
      now: 400
    });
    expect(multiLevel).toMatchObject({
      awarded: true,
      progress: {
        previousLevel: 1,
        level: 3,
        levelsGained: 2,
        experience: 110,
        experienceToNextLevel: 200,
        leveledUp: true,
        maxLevel: TAROT_KINGDOM_PET_MAX_LEVEL
      }
    });
    expect(buildTarotKingdomPetPublicRecord(multiLevel.state.currentPet)).toMatchObject({
      level: 3,
      experience: 110,
      experienceToNextLevel: 200,
      levelProgressPercent: 55,
      maxLevel: TAROT_KINGDOM_PET_MAX_LEVEL
    });
  });
});
