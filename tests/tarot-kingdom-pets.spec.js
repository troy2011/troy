const { test, expect } = require('@playwright/test');
const manifest = require('../public/Sprites/pixel-monsters/manifest.json');
const {
  TAROT_KINGDOM_PET_RECRUIT_CHANCE,
  buildTarotKingdomPetOfferView,
  isTarotKingdomPetRecruitEligible,
  normalizeTarotKingdomPetState,
  resolveTarotKingdomPetChoice,
  rollTarotKingdomPetOffer,
  selectTarotKingdomStagePetCandidate
} = require('../server/tarotKingdomPets');

const normalMonster = manifest.find((monster) => monster.isBoss !== true);
const bossMonster = manifest.find((monster) => monster.isBoss === true);

function eligibleFinisher(overrides = {}) {
  return {
    roundNo: 4,
    playerIndex: 0,
    playFabId: 'PF_HUMAN',
    isNpc: false,
    mode: 'offline',
    ...overrides
  };
}

test.describe('Tarot Kingdom monster recruitment', () => {
  test('the roster exposes 47 recruitable monsters and excludes the three bosses', () => {
    expect(manifest.filter((monster) => monster.isBoss !== true)).toHaveLength(47);
    expect(manifest.filter((monster) => monster.isBoss === true)).toHaveLength(3);
  });

  test('eligibility requires the normal enemy, final round, offline human finisher and matching identity', () => {
    const encounter = { monsterId: normalMonster.id };
    expect(isTarotKingdomPetRecruitEligible({
      encounter,
      outcome: 'victory',
      finisher: eligibleFinisher(),
      authenticatedPlayFabId: 'PF_HUMAN'
    })).toBe(true);

    const rejected = [
      { encounter: { monsterId: bossMonster.id } },
      { outcome: 'defeat' },
      { finisher: eligibleFinisher({ roundNo: 3 }) },
      { finisher: eligibleFinisher({ isNpc: true }) },
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

  test('the five-percent roll creates one persistent offer and never rerolls while pending', () => {
    expect(TAROT_KINGDOM_PET_RECRUIT_CHANCE).toBe(0.05);
    const first = rollTarotKingdomPetOffer({
      state: null,
      encounter: { monsterId: normalMonster.id },
      explorationId: 'explore-1',
      random: () => 0.049
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
      encounter: { monsterId: normalMonster.id },
      explorationId: 'explore-3',
      random: () => 0.05
    });
    expect(miss.offer).toBeNull();
  });

  test('stage recruitment uniformly chooses only monsters personally finished by the offline owner', () => {
    const candidates = manifest.filter((monster) => monster.isBoss !== true).slice(0, 4);
    const encounter = {
      version: 2,
      monsters: candidates.map((monster, index) => ({ order: index + 1, monsterId: monster.id }))
    };
    const finishers = [
      { ...eligibleFinisher({ roundNo: 1 }), monsterId: candidates[0].id },
      { ...eligibleFinisher({ roundNo: 2, isNpc: true }), monsterId: candidates[1].id },
      { ...eligibleFinisher({ roundNo: 3, playFabId: 'PF_OTHER' }), monsterId: candidates[2].id },
      { ...eligibleFinisher({ roundNo: 4 }), monsterId: candidates[3].id }
    ];
    expect(selectTarotKingdomStagePetCandidate({
      encounter,
      finishers,
      authenticatedPlayFabId: 'PF_HUMAN',
      random: () => 0
    })?.id).toBe(candidates[0].id);
    expect(selectTarotKingdomStagePetCandidate({
      encounter,
      finishers,
      authenticatedPlayFabId: 'PF_HUMAN',
      currentPet: { monsterId: candidates[0].id },
      random: () => 0
    })?.id).toBe(candidates[3].id);
    expect(selectTarotKingdomStagePetCandidate({
      encounter,
      finishers: finishers.map((entry) => ({ ...entry, mode: 'online' })),
      authenticatedPlayFabId: 'PF_HUMAN',
      random: () => 0
    })).toBeNull();
    expect(selectTarotKingdomStagePetCandidate({
      encounter,
      finishers: [{ ...eligibleFinisher({ roundNo: 1 }), monsterId: candidates[3].id }],
      authenticatedPlayFabId: 'PF_HUMAN',
      random: () => 0
    })).toBeNull();
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
});
