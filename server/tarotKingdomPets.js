const PIXEL_MONSTERS_ROSTER = require('../public/Sprites/pixel-monsters/manifest.json');

const TAROT_KINGDOM_PET_DATA_KEY = 'TarotKingdomPetState';
const TAROT_KINGDOM_PET_STATE_VERSION = 1;
const TAROT_KINGDOM_PET_RECRUIT_CHANCE = 0.05;

const MONSTER_BY_ID = new Map(
    PIXEL_MONSTERS_ROSTER.map((monster) => [String(monster?.id || '').trim(), monster])
);

function finiteTimestamp(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function getTarotKingdomPetMonster(monsterId = '') {
    return MONSTER_BY_ID.get(String(monsterId || '').trim()) || null;
}

function normalizeTarotKingdomCurrentPet(value) {
    if (!value || typeof value !== 'object') return null;
    const monster = getTarotKingdomPetMonster(value.monsterId);
    if (!monster || monster.isBoss === true) return null;
    return {
        monsterId: monster.id,
        acquiredAtMs: finiteTimestamp(value.acquiredAtMs),
        explorationId: String(value.explorationId || '').trim().slice(0, 128)
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
    return {
        version: TAROT_KINGDOM_PET_STATE_VERSION,
        currentPet: normalizeTarotKingdomCurrentPet(parsed?.currentPet),
        pendingOffer: normalizeTarotKingdomPendingPetOffer(parsed?.pendingOffer)
    };
}

function buildTarotKingdomPetPublicRecord(value) {
    const pet = normalizeTarotKingdomCurrentPet(value);
    if (!pet) return null;
    const monster = getTarotKingdomPetMonster(pet.monsterId);
    return {
        ...pet,
        monsterName: String(monster?.name || pet.monsterId),
        volume: Math.max(1, Math.min(3, Math.floor(Number(monster?.volume) || 1))),
        number: Math.max(1, Math.floor(Number(monster?.number) || 1))
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
    if (finisher.isNpc === true || Number(finisher.roundNo) !== 4) return false;
    return String(finisher.playFabId || '').trim() === playFabId;
}

function selectTarotKingdomStagePetCandidate({
    encounter = null,
    finishers = [],
    authenticatedPlayFabId = '',
    currentPet = null,
    random = Math.random
} = {}) {
    if (Number(encounter?.version) < 2 || !Array.isArray(encounter?.monsters)) return null;
    const playFabId = String(authenticatedPlayFabId || '').trim();
    if (!playFabId) return null;
    const stageMonsterByRound = new Map(encounter.monsters.map((entry, index) => [
        Math.max(1, Math.min(4, Math.floor(Number(entry?.order) || index + 1))),
        String(entry?.monsterId || '').trim()
    ]));
    const currentMonsterId = String(currentPet?.monsterId || '').trim();
    const eligibleIds = Array.from(new Set((Array.isArray(finishers) ? finishers : [])
        .filter((entry) => (
            entry?.isNpc !== true
            && String(entry?.mode || '').trim().toLowerCase() === 'offline'
            && String(entry?.playFabId || '').trim() === playFabId
            && stageMonsterByRound.get(Math.floor(Number(entry?.roundNo) || 0))
                === String(entry?.monsterId || '').trim()
        ))
        .map((entry) => String(entry?.monsterId || '').trim())
        .filter((monsterId) => monsterId !== currentMonsterId)))
        .filter((monsterId) => {
            const monster = getTarotKingdomPetMonster(monsterId);
            return !!monster && monster.isBoss !== true;
        });
    if (eligibleIds.length === 0) return null;
    const roll = Math.max(0, Math.min(0.999999, Number(
        typeof random === 'function' ? random() : Math.random()
    ) || 0));
    return getTarotKingdomPetMonster(eligibleIds[Math.floor(roll * eligibleIds.length)]);
}

function rollTarotKingdomPetOffer({
    state = null,
    encounter = null,
    explorationId = '',
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
    if (roll >= TAROT_KINGDOM_PET_RECRUIT_CHANCE) {
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

function resolveTarotKingdomPetChoice(state, offerId, accept, now = Date.now()) {
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
    return {
        state: {
            version: TAROT_KINGDOM_PET_STATE_VERSION,
            currentPet: accepted
                ? {
                    monsterId: pending.monsterId,
                    acquiredAtMs: finiteTimestamp(now, Date.now()),
                    explorationId: pending.explorationId
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
    TAROT_KINGDOM_PET_RECRUIT_CHANCE,
    buildTarotKingdomPetOfferView,
    buildTarotKingdomPetPublicRecord,
    getTarotKingdomPetMonster,
    isTarotKingdomPetRecruitEligible,
    normalizeTarotKingdomCurrentPet,
    normalizeTarotKingdomPendingPetOffer,
    normalizeTarotKingdomPetState,
    readTarotKingdomPetState,
    resolveTarotKingdomPetChoice,
    rollTarotKingdomPetOffer,
    selectTarotKingdomStagePetCandidate,
    writeTarotKingdomPetState
};
