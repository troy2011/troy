const PIXEL_MONSTERS_ROSTER = require('../public/Sprites/pixel-monsters/manifest.json');

const TAROT_KINGDOM_PET_DATA_KEY = 'TarotKingdomPetState';
const TAROT_KINGDOM_PET_STATE_VERSION = 2;
const TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT = 16;
const TAROT_KINGDOM_PET_NAME_MAX_LENGTH = 12;

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

function getTarotKingdomPetRecruitChance(stageNo = 1) {
    const normalizedStageNo = Math.max(1, Math.min(11, Math.floor(Number(stageNo) || 1)));
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

function normalizeTarotKingdomCurrentPet(value) {
    if (!value || typeof value !== 'object') return null;
    const monster = getTarotKingdomPetMonster(value.monsterId);
    if (!monster || monster.isBoss === true) return null;
    return {
        monsterId: monster.id,
        acquiredAtMs: finiteTimestamp(value.acquiredAtMs),
        explorationId: String(value.explorationId || '').trim().slice(0, 128),
        nickname: normalizeTarotKingdomPetNickname(value.nickname)
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
        displayName: String(pet.nickname || monster?.name || pet.monsterId),
        volume: Math.max(1, Math.min(3, Math.floor(Number(monster?.volume) || 1))),
        number: Math.max(1, Math.floor(Number(monster?.number) || 1))
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
    if (finisher.isNpc === true || roundNo < 1 || roundNo > 4) return false;
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
    TAROT_KINGDOM_PET_NAME_MAX_LENGTH,
    TAROT_KINGDOM_PET_RECRUIT_BASE_PERCENT,
    buildTarotKingdomPetOfferView,
    buildTarotKingdomPetPublicRecord,
    getTarotKingdomPetRecruitChance,
    getTarotKingdomPetMonster,
    isTarotKingdomPetRecruitEligible,
    normalizeTarotKingdomCurrentPet,
    normalizeTarotKingdomPetNickname,
    normalizeTarotKingdomPendingPetOffer,
    normalizeTarotKingdomPetState,
    parseTarotKingdomPetNickname,
    readTarotKingdomPetState,
    renameTarotKingdomCurrentPet,
    resolveTarotKingdomPetChoice,
    rollTarotKingdomPetOffer,
    writeTarotKingdomPetState
};
