const PIXEL_MONSTERS_ROSTER = require('../public/Sprites/pixel-monsters/manifest.json');
const {
    buildTarotKingdomGuardian,
    buildTarotKingdomMinorLoadout
} = require('./tarotKingdomArcanaLoadout');
const {
    TAROT_KINGDOM_PET_ARCANA_PROFILES
} = require('./tarotKingdomPetArcanaProfiles');

const TAROT_KINGDOM_PET_DATA_KEY = 'TarotKingdomPetState';
const TAROT_KINGDOM_PET_STATE_VERSION = 5;
const TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT = 16;
const TAROT_KINGDOM_PET_NAME_MAX_LENGTH = 12;
const TAROT_KINGDOM_PET_MAX_LEVEL = 50;
const TAROT_KINGDOM_PET_EXP_BASE = 100;
const TAROT_KINGDOM_PET_EXP_STEP = 50;
const TAROT_KINGDOM_PET_EXP_AWARD_HISTORY_LIMIT = 32;
const TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT = 5;
const TAROT_KINGDOM_PET_MINOR_SUITS = Object.freeze(['Wand', 'Cup', 'Sword', 'Pentacle']);
const TAROT_KINGDOM_PET_REBIRTHS = Object.freeze({
    'ismartal-vol1-monster-19': Object.freeze({ targetMonsterId: 'ismartal-vol1-monster-17', targetArchetype: 'swift' }),
    'ismartal-vol1-monster-18': Object.freeze({ targetMonsterId: 'ismartal-vol1-monster-16', targetArchetype: 'swift' }),
    'ismartal-vol1-monster-09': Object.freeze({ targetMonsterId: 'ismartal-vol1-monster-12', targetArchetype: 'swift' }),
    'ismartal-vol2-monster-01': Object.freeze({ targetMonsterId: 'ismartal-vol2-monster-03', targetArchetype: 'caster' })
});
const TAROT_KINGDOM_PET_REBIRTH_STAT_MULTIPLIERS = Object.freeze({
    hp: 0.5,
    power: 0.7,
    defense: 0.7,
    intelligence: 0.7,
    speed: 0.85
});

const MONSTER_BY_ID = new Map(
    PIXEL_MONSTERS_ROSTER.map((monster) => [String(monster?.id || '').trim(), monster])
);

function finiteTimestamp(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function finiteNonNegativeInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function getTarotKingdomPetExperienceToNextLevel(level = 1) {
    const safeLevel = Math.max(1, Math.min(TAROT_KINGDOM_PET_MAX_LEVEL, Math.floor(Number(level) || 1)));
    if (safeLevel >= TAROT_KINGDOM_PET_MAX_LEVEL) return 0;
    return TAROT_KINGDOM_PET_EXP_BASE + ((safeLevel - 1) * TAROT_KINGDOM_PET_EXP_STEP);
}

function normalizeTarotKingdomPetProgress(level = 1, experience = 0) {
    let safeLevel = Math.max(1, Math.min(TAROT_KINGDOM_PET_MAX_LEVEL, Math.floor(Number(level) || 1)));
    let safeExperience = finiteNonNegativeInteger(experience);
    while (safeLevel < TAROT_KINGDOM_PET_MAX_LEVEL) {
        const needed = getTarotKingdomPetExperienceToNextLevel(safeLevel);
        if (safeExperience < needed) break;
        safeExperience -= needed;
        safeLevel += 1;
    }
    if (safeLevel >= TAROT_KINGDOM_PET_MAX_LEVEL) safeExperience = 0;
    return { level: safeLevel, experience: safeExperience };
}

function getTarotKingdomPetBattleExperience(stageNo = 1) {
    const safeStageNo = Math.max(1, Math.min(10, Math.floor(Number(stageNo) || 1)));
    return 40 + (safeStageNo * 20);
}

function getTarotKingdomPetMonster(monsterId = '') {
    return MONSTER_BY_ID.get(String(monsterId || '').trim()) || null;
}

function getTarotKingdomPetRecruitChance(stageNo = 1) {
    const normalizedStageNo = Math.max(1, Math.min(10, Math.floor(Number(stageNo) || 1)));
    return Math.max(0, Math.min(1, (TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT - normalizedStageNo) / 100));
}

function normalizeTarotKingdomPetNickname(value) {
    const normalized = String(value || '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(normalized).slice(0, TAROT_KINGDOM_PET_NAME_MAX_LENGTH).join('');
}

function parseTarotKingdomPetNickname(value) {
    const normalized = String(value || '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized || Array.from(normalized).length > TAROT_KINGDOM_PET_NAME_MAX_LENGTH) return null;
    return normalized;
}

function normalizeTarotKingdomPetArcanaItemId(value) {
    return String(value || '').trim().slice(0, 180);
}

function normalizeTarotKingdomPetMinorArcanaItemIds(value) {
    const normalized = [];
    (Array.isArray(value) ? value : []).forEach((entry) => {
        const itemId = normalizeTarotKingdomPetArcanaItemId(entry);
        const match = itemId.match(/^minor-(wand|cup|sword|pentacle)-(\d{1,2})$/i);
        const rank = Number(match?.[2]);
        if (!match || rank < 1 || rank > 14) return;
        const canonicalItemId = `minor-${match[1].toLowerCase()}-${rank}`;
        if (!normalized.includes(canonicalItemId)) normalized.push(canonicalItemId);
    });
    return normalized.slice(0, TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT);
}

function getTarotKingdomPetArcanaProfile(monsterId = '') {
    const monster = getTarotKingdomPetMonster(monsterId);
    if (!monster || monster.isBoss === true) return null;
    const configured = TAROT_KINGDOM_PET_ARCANA_PROFILES[monster.id];
    if (!configured) return null;
    const suitWeights = configured.suitWeights;
    const preferredSuit = TAROT_KINGDOM_PET_MINOR_SUITS.reduce((best, suit) => (
        Number(suitWeights[suit]) > Number(suitWeights[best]) ? suit : best
    ), TAROT_KINGDOM_PET_MINOR_SUITS[0]);
    return {
        monsterId: monster.id,
        majorArcanaItemId: `arcana-${configured.majorArcanaNumber}`,
        preferredSuit,
        suitWeights: { ...suitWeights },
        evolvesIntoRaidBossId: String(configured.evolvesIntoRaidBossId || '') || null
    };
}

function readTarotKingdomPetRandom(random = Math.random) {
    const value = Number(typeof random === 'function' ? random() : Math.random());
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(0.999999999, value));
}

function createTarotKingdomPetSeededRandom(seedValue = '') {
    let state = 2166136261;
    Array.from(String(seedValue || '')).forEach((character) => {
        state ^= character.codePointAt(0);
        state = Math.imul(state, 16777619) >>> 0;
    });
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function rollTarotKingdomPetMinorSuit(profile, random) {
    const roll = readTarotKingdomPetRandom(random);
    let accumulatedWeight = 0;
    for (const suit of TAROT_KINGDOM_PET_MINOR_SUITS) {
        accumulatedWeight += Math.max(0, Number(profile?.suitWeights?.[suit]) || 0);
        if (roll < accumulatedWeight) return suit;
    }
    return profile?.preferredSuit || TAROT_KINGDOM_PET_MINOR_SUITS[0];
}

function rollTarotKingdomPetArcanaLoadout(monsterId = '', random = Math.random) {
    const profile = getTarotKingdomPetArcanaProfile(monsterId);
    if (!profile) return null;
    const minorArcanaItemIds = [];
    let attempts = 0;
    while (minorArcanaItemIds.length < TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT && attempts < 100) {
        attempts += 1;
        const suit = rollTarotKingdomPetMinorSuit(profile, random);
        const rank = 1 + Math.floor(readTarotKingdomPetRandom(random) * 14);
        const itemId = `minor-${suit.toLowerCase()}-${rank}`;
        if (!minorArcanaItemIds.includes(itemId)) minorArcanaItemIds.push(itemId);
    }
    const fallbackSuitOrder = [
        profile.preferredSuit,
        ...TAROT_KINGDOM_PET_MINOR_SUITS.filter((suit) => suit !== profile.preferredSuit)
    ];
    for (const suit of fallbackSuitOrder) {
        for (let rank = 1; rank <= 14; rank += 1) {
            if (minorArcanaItemIds.length >= TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT) break;
            const itemId = `minor-${suit.toLowerCase()}-${rank}`;
            if (!minorArcanaItemIds.includes(itemId)) minorArcanaItemIds.push(itemId);
        }
    }
    return {
        majorArcanaItemId: profile.majorArcanaItemId,
        minorArcanaItemIds
    };
}

function getTarotKingdomPetLegacyArcanaLoadout(value, monster) {
    const storedMinorArcanaItemIds = normalizeTarotKingdomPetMinorArcanaItemIds(value?.minorArcanaItemIds);
    const profile = getTarotKingdomPetArcanaProfile(monster?.id);
    if (storedMinorArcanaItemIds.length === TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT) {
        return {
            majorArcanaItemId: profile?.majorArcanaItemId || null,
            minorArcanaItemIds: storedMinorArcanaItemIds
        };
    }
    return rollTarotKingdomPetArcanaLoadout(
        monster?.id,
        createTarotKingdomPetSeededRandom([
            monster?.id,
            finiteTimestamp(value?.acquiredAtMs),
            String(value?.explorationId || '').trim()
        ].join(':'))
    );
}

function normalizeTarotKingdomCurrentPet(value) {
    if (!value || typeof value !== 'object') return null;
    const monster = getTarotKingdomPetMonster(value.monsterId);
    if (!monster || monster.isBoss === true) return null;
    const progress = normalizeTarotKingdomPetProgress(value.level, value.experience);
    const arcanaLoadout = getTarotKingdomPetLegacyArcanaLoadout(value, monster);
    return {
        monsterId: monster.id,
        acquiredAtMs: finiteTimestamp(value.acquiredAtMs),
        explorationId: String(value.explorationId || '').trim().slice(0, 128),
        nickname: normalizeTarotKingdomPetNickname(value.nickname),
        majorArcanaItemId: arcanaLoadout?.majorArcanaItemId || null,
        minorArcanaItemIds: arcanaLoadout?.minorArcanaItemIds || [],
        ...progress
    };
}

function normalizeTarotKingdomPetExperienceAward(value) {
    if (!value || typeof value !== 'object') return null;
    const awardId = String(value.awardId || '').trim().slice(0, 220);
    if (!awardId) return null;
    return {
        awardId,
        monsterId: String(value.monsterId || '').trim().slice(0, 128),
        gainedExperience: finiteNonNegativeInteger(value.gainedExperience),
        previousLevel: Math.max(1, Math.min(TAROT_KINGDOM_PET_MAX_LEVEL, Math.floor(Number(value.previousLevel) || 1))),
        level: Math.max(1, Math.min(TAROT_KINGDOM_PET_MAX_LEVEL, Math.floor(Number(value.level) || 1))),
        experience: finiteNonNegativeInteger(value.experience),
        awardedAtMs: finiteTimestamp(value.awardedAtMs),
        reason: String(value.reason || '').trim().slice(0, 64)
    };
}

function normalizeTarotKingdomPendingPetOffer(value) {
    if (!value || typeof value !== 'object') return null;
    const monster = getTarotKingdomPetMonster(value.monsterId);
    const explorationId = String(value.explorationId || '').trim().slice(0, 128);
    const offerId = String(value.offerId || '').trim().slice(0, 220);
    if (!monster || monster.isBoss === true || !explorationId || !offerId) return null;
    return {
        offerId,
        monsterId: monster.id,
        explorationId,
        rolledAtMs: finiteTimestamp(value.rolledAtMs)
    };
}

function normalizeTarotKingdomPetState(value) {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = null;
        }
    }
    if (Number(parsed?.version) !== TAROT_KINGDOM_PET_STATE_VERSION) parsed = null;
    const experienceAwards = (Array.isArray(parsed?.experienceAwards) ? parsed.experienceAwards : [])
        .map(normalizeTarotKingdomPetExperienceAward)
        .filter(Boolean)
        .slice(-TAROT_KINGDOM_PET_EXP_AWARD_HISTORY_LIMIT);
    return {
        version: TAROT_KINGDOM_PET_STATE_VERSION,
        currentPet: normalizeTarotKingdomCurrentPet(parsed?.currentPet),
        pendingOffer: normalizeTarotKingdomPendingPetOffer(parsed?.pendingOffer),
        experienceAwards
    };
}

function buildTarotKingdomPetPublicRecord(value, options = {}) {
    const pet = normalizeTarotKingdomCurrentPet(value);
    if (!pet) return null;
    const monster = getTarotKingdomPetMonster(pet.monsterId);
    const experienceToNextLevel = getTarotKingdomPetExperienceToNextLevel(pet.level);
    const catalogCache = options?.catalogCache && typeof options.catalogCache === 'object'
        ? options.catalogCache
        : {};
    const majorArcanaLevel = 1 + Math.floor(((pet.level - 1) * 24) / (TAROT_KINGDOM_PET_MAX_LEVEL - 1));
    const minorArcanaLevel = 1 + Math.floor(((pet.level - 1) * 14) / (TAROT_KINGDOM_PET_MAX_LEVEL - 1));
    const cardLevels = {
        [pet.majorArcanaItemId]: { level: majorArcanaLevel },
        ...Object.fromEntries(pet.minorArcanaItemIds.map((itemId) => [itemId, { level: minorArcanaLevel }]))
    };
    const rebirthConfig = TAROT_KINGDOM_PET_REBIRTHS[pet.monsterId] || null;
    const rebirthMonster = rebirthConfig ? getTarotKingdomPetMonster(rebirthConfig.targetMonsterId) : null;
    const rebirthArcanaProfile = rebirthMonster ? getTarotKingdomPetArcanaProfile(rebirthMonster.id) : null;
    const rebirthGuardianArcana = rebirthArcanaProfile?.majorArcanaItemId
        ? buildTarotKingdomGuardian(rebirthArcanaProfile.majorArcanaItemId, catalogCache, {
            [rebirthArcanaProfile.majorArcanaItemId]: { level: majorArcanaLevel }
        })
        : null;
    return {
        ...pet,
        monsterName: String(monster?.name || pet.monsterId),
        displayName: String(pet.nickname || monster?.name || pet.monsterId),
        volume: Math.max(1, Math.min(3, Math.floor(Number(monster?.volume) || 1))),
        number: Math.max(1, Math.floor(Number(monster?.number) || 1)),
        experienceToNextLevel,
        levelProgressPercent: experienceToNextLevel > 0
            ? Math.max(0, Math.min(100, Math.floor((pet.experience / experienceToNextLevel) * 100)))
            : 100,
        maxLevel: TAROT_KINGDOM_PET_MAX_LEVEL,
        guardianArcana: buildTarotKingdomGuardian(pet.majorArcanaItemId, catalogCache, cardLevels),
        tarotDeck: buildTarotKingdomMinorLoadout(pet.minorArcanaItemIds, catalogCache, cardLevels),
        ...(rebirthMonster
            ? {
                rebirth: {
                    targetMonsterId: rebirthMonster.id,
                    targetMonsterName: String(rebirthMonster.name || rebirthMonster.id),
                    targetArchetype: rebirthConfig.targetArchetype,
                    targetNumber: Math.max(1, Math.floor(Number(rebirthMonster.number) || 1)),
                    targetVolume: Math.max(1, Math.min(3, Math.floor(Number(rebirthMonster.volume) || 1))),
                    statMultipliers: TAROT_KINGDOM_PET_REBIRTH_STAT_MULTIPLIERS,
                    guardianArcana: rebirthGuardianArcana
                }
            }
            : {})
    };
}

function awardTarotKingdomPetExperience(state, {
    awardId = '',
    amount = 0,
    expectedMonsterId = '',
    now = Date.now()
} = {}) {
    const normalizedState = normalizeTarotKingdomPetState(state);
    const safeAwardId = String(awardId || '').trim().slice(0, 220);
    const safeExpectedMonsterId = String(expectedMonsterId || '').trim();
    if (!safeAwardId) {
        return { state: normalizedState, awarded: false, recorded: false, reason: 'invalid-award-id', progress: null };
    }
    const existing = normalizedState.experienceAwards.find((entry) => entry.awardId === safeAwardId);
    if (existing) {
        const experienceToNextLevel = getTarotKingdomPetExperienceToNextLevel(existing.level);
        return {
            state: normalizedState,
            awarded: existing.gainedExperience > 0,
            recorded: true,
            alreadyAwarded: true,
            reason: existing.reason || '',
            progress: {
                ...existing,
                levelsGained: Math.max(0, existing.level - existing.previousLevel),
                leveledUp: existing.level > existing.previousLevel,
                experienceToNextLevel,
                maxLevel: TAROT_KINGDOM_PET_MAX_LEVEL
            }
        };
    }

    const currentPet = normalizedState.currentPet;
    const safeAmount = Math.max(0, Math.min(100000, Math.floor(Number(amount) || 0)));
    let reason = '';
    if (!currentPet) reason = 'pet-not-found';
    else if (safeExpectedMonsterId && currentPet.monsterId !== safeExpectedMonsterId) reason = 'pet-changed';
    else if (safeAmount <= 0) reason = 'no-experience';
    else if (currentPet.level >= TAROT_KINGDOM_PET_MAX_LEVEL) reason = 'max-level';

    const previousLevel = currentPet?.level || 1;
    const gainedExperience = reason ? 0 : safeAmount;
    const nextProgress = currentPet
        ? normalizeTarotKingdomPetProgress(currentPet.level, currentPet.experience + gainedExperience)
        : { level: 1, experience: 0 };
    const award = normalizeTarotKingdomPetExperienceAward({
        awardId: safeAwardId,
        monsterId: currentPet?.monsterId || safeExpectedMonsterId,
        gainedExperience,
        previousLevel,
        level: nextProgress.level,
        experience: nextProgress.experience,
        awardedAtMs: now,
        reason
    });
    const nextState = {
        ...normalizedState,
        currentPet: currentPet
            ? { ...currentPet, ...nextProgress }
            : null,
        experienceAwards: [...normalizedState.experienceAwards, award]
            .filter(Boolean)
            .slice(-TAROT_KINGDOM_PET_EXP_AWARD_HISTORY_LIMIT)
    };
    const experienceToNextLevel = getTarotKingdomPetExperienceToNextLevel(nextProgress.level);
    return {
        state: nextState,
        awarded: gainedExperience > 0,
        recorded: true,
        alreadyAwarded: false,
        reason,
        progress: {
            ...award,
            levelsGained: Math.max(0, nextProgress.level - previousLevel),
            leveledUp: nextProgress.level > previousLevel,
            experienceToNextLevel,
            maxLevel: TAROT_KINGDOM_PET_MAX_LEVEL
        }
    };
}

function renameTarotKingdomCurrentPet(state, nickname) {
    const normalizedState = normalizeTarotKingdomPetState(state);
    const normalizedNickname = parseTarotKingdomPetNickname(nickname);
    if (!normalizedState.currentPet) {
        return { state: normalizedState, renamed: false, reason: 'pet-not-found' };
    }
    if (!normalizedNickname) {
        return { state: normalizedState, renamed: false, reason: 'invalid-name' };
    }
    return {
        state: {
            ...normalizedState,
            currentPet: {
                ...normalizedState.currentPet,
                nickname: normalizedNickname
            }
        },
        renamed: true
    };
}

function buildTarotKingdomPetOfferView(value, currentPet = null) {
    const offer = normalizeTarotKingdomPendingPetOffer(value);
    if (!offer) return null;
    const monster = getTarotKingdomPetMonster(offer.monsterId);
    return {
        ...offer,
        monsterName: String(monster?.name || offer.monsterId),
        currentPet: buildTarotKingdomPetPublicRecord(currentPet)
    };
}

function isTarotKingdomPetRecruitEligible({
    encounter = null,
    outcome = '',
    finisher = null,
    authenticatedPlayFabId = ''
} = {}) {
    const monster = getTarotKingdomPetMonster(encounter?.monsterId);
    const playFabId = String(authenticatedPlayFabId || '').trim();
    if (!monster || monster.isBoss === true || String(outcome || '').trim().toLowerCase() !== 'victory') return false;
    if (!playFabId || !finisher || typeof finisher !== 'object') return false;
    if (String(finisher.mode || '').trim().toLowerCase() !== 'offline') return false;
    const roundNo = Math.floor(Number(finisher.roundNo) || 0);
    const defeatMode = String(finisher.defeatMode || '').trim().toLowerCase();
    const isOwnerPet = finisher.isPet === true;
    if (!['hp-zero', 'hand-empty'].includes(defeatMode)) return false;
    if ((finisher.isNpc === true && !isOwnerPet) || roundNo < 1 || roundNo > 4) return false;
    return String(finisher.playFabId || '').trim() === playFabId;
}

function rollTarotKingdomPetOffer({
    state = null,
    encounter = null,
    explorationId = '',
    chance = getTarotKingdomPetRecruitChance(encounter?.stageNo),
    random = Math.random,
    now = Date.now()
} = {}) {
    const normalizedState = normalizeTarotKingdomPetState(state);
    if (normalizedState.pendingOffer) {
        return { state: normalizedState, offer: normalizedState.pendingOffer, created: false };
    }
    const monster = getTarotKingdomPetMonster(encounter?.monsterId);
    const safeExplorationId = String(explorationId || encounter?.explorationId || '').trim().slice(0, 128);
    if (!monster || monster.isBoss === true || !safeExplorationId) {
        return { state: normalizedState, offer: null, created: false };
    }
    if (normalizedState.currentPet?.monsterId === monster.id) {
        return { state: normalizedState, offer: null, created: false };
    }
    const roll = Math.max(0, Math.min(0.999999, Number(
        typeof random === 'function' ? random() : Math.random()
    ) || 0));
    const normalizedChance = Math.max(0, Math.min(1, Number(chance) || 0));
    if (roll >= normalizedChance) {
        return { state: normalizedState, offer: null, created: false };
    }
    const offer = {
        offerId: `tkpet-${safeExplorationId}-${monster.id}`.slice(0, 220),
        monsterId: monster.id,
        explorationId: safeExplorationId,
        rolledAtMs: finiteTimestamp(now, Date.now())
    };
    const nextState = {
        ...normalizedState,
        pendingOffer: offer
    };
    return { state: nextState, offer, created: true };
}

function resolveTarotKingdomPetChoice(state, offerId, accept, now = Date.now(), random = Math.random) {
    const normalizedState = normalizeTarotKingdomPetState(state);
    const normalizedOfferId = String(offerId || '').trim();
    const pending = normalizedState.pendingOffer;
    if (!pending) {
        const current = normalizedState.currentPet;
        const acceptedOfferId = current
            ? `tkpet-${current.explorationId}-${current.monsterId}`.slice(0, 220)
            : '';
        return {
            state: normalizedState,
            resolved: true,
            accepted: !!acceptedOfferId && acceptedOfferId === normalizedOfferId,
            alreadyResolved: true
        };
    }
    if (!normalizedOfferId || pending.offerId !== normalizedOfferId) {
        return { state: normalizedState, resolved: false, accepted: false, reason: 'offer-mismatch' };
    }
    const accepted = accept === true;
    const arcanaLoadout = accepted
        ? rollTarotKingdomPetArcanaLoadout(pending.monsterId, random)
        : null;
    return {
        state: {
            ...normalizedState,
            currentPet: accepted
                ? {
                    monsterId: pending.monsterId,
                    acquiredAtMs: finiteTimestamp(now, Date.now()),
                    explorationId: pending.explorationId,
                    level: 1,
                    experience: 0,
                    majorArcanaItemId: arcanaLoadout?.majorArcanaItemId || null,
                    minorArcanaItemIds: arcanaLoadout?.minorArcanaItemIds || []
                }
                : normalizedState.currentPet,
            pendingOffer: null
        },
        resolved: true,
        accepted,
        alreadyResolved: false
    };
}

async function readTarotKingdomPetState(playFabId, { promisifyPlayFab, PlayFabServer } = {}) {
    if (!playFabId || typeof promisifyPlayFab !== 'function' || !PlayFabServer?.GetUserReadOnlyData) {
        return normalizeTarotKingdomPetState(null);
    }
    const response = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [TAROT_KINGDOM_PET_DATA_KEY]
    });
    return normalizeTarotKingdomPetState(response?.Data?.[TAROT_KINGDOM_PET_DATA_KEY]?.Value);
}

async function writeTarotKingdomPetState(playFabId, state, { promisifyPlayFab, PlayFabServer } = {}) {
    if (!playFabId || typeof promisifyPlayFab !== 'function' || !PlayFabServer?.UpdateUserReadOnlyData) {
        throw new Error('Tarot Kingdom pet storage is unavailable.');
    }
    const normalized = normalizeTarotKingdomPetState(state);
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [TAROT_KINGDOM_PET_DATA_KEY]: JSON.stringify(normalized)
        }
    });
    return normalized;
}

module.exports = {
    TAROT_KINGDOM_PET_DATA_KEY,
    TAROT_KINGDOM_PET_EXP_BASE,
    TAROT_KINGDOM_PET_EXP_STEP,
    TAROT_KINGDOM_PET_MAX_LEVEL,
    TAROT_KINGDOM_PET_MINOR_ARCANA_LIMIT,
    TAROT_KINGDOM_PET_NAME_MAX_LENGTH,
    TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT,
    TAROT_KINGDOM_PET_STATE_VERSION,
    TAROT_KINGDOM_PET_REBIRTHS,
    TAROT_KINGDOM_PET_REBIRTH_STAT_MULTIPLIERS,
    awardTarotKingdomPetExperience,
    buildTarotKingdomPetOfferView,
    buildTarotKingdomPetPublicRecord,
    getTarotKingdomPetArcanaProfile,
    getTarotKingdomPetRecruitChance,
    getTarotKingdomPetBattleExperience,
    getTarotKingdomPetExperienceToNextLevel,
    getTarotKingdomPetMonster,
    isTarotKingdomPetRecruitEligible,
    normalizeTarotKingdomCurrentPet,
    normalizeTarotKingdomPetArcanaItemId,
    normalizeTarotKingdomPetMinorArcanaItemIds,
    normalizeTarotKingdomPetNickname,
    normalizeTarotKingdomPendingPetOffer,
    normalizeTarotKingdomPetState,
    parseTarotKingdomPetNickname,
    readTarotKingdomPetState,
    renameTarotKingdomCurrentPet,
    resolveTarotKingdomPetChoice,
    rollTarotKingdomPetArcanaLoadout,
    rollTarotKingdomPetOffer,
    writeTarotKingdomPetState
};
