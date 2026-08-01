function normalizeServiceErrorMessage(error) {
    const candidates = [
        error?.errorMessage,
        error?.message,
        error?.error,
        error?.status
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        if (candidate && typeof candidate === 'object') {
            try {
                const serialized = JSON.stringify(candidate);
                if (serialized && serialized !== '{}') return serialized;
            } catch (_) {
            }
        }
    }
    try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== '{}') return serialized;
    } catch (_) {
    }
    return String(error || 'Unknown service error');
}

function buildUnavailableLineFriendBonusStatus(rewardAmount, addFriendUrl) {
    return {
        eligible: false,
        linkedLineUserId: false,
        rewardAmount,
        claimed: false,
        claimedAt: '',
        claimedAmount: 0,
        addFriendUrl,
        temporarilyUnavailable: true
    };
}

async function loadLineFriendBonusStatus(playFabId, deps, options = {}) {
    const {
        promisifyPlayFab,
        PlayFabServer,
        rewardAmount = 0,
        addFriendUrl = ''
    } = deps || {};
    const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts || 2) || 2));
    const retryDelayMs = Math.max(0, Math.floor(Number(options.retryDelayMs ?? 120) || 0));
    const wait = typeof options.wait === 'function'
        ? options.wait
        : (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const readOnly = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId,
                Keys: ['LineFriendBonusClaimedAt', 'LineFriendBonusAmount', 'lineUserId']
            });
            const claimedAt = String(readOnly?.Data?.LineFriendBonusClaimedAt?.Value || '').trim();
            const claimedAmount = Math.max(0, Math.floor(Number(readOnly?.Data?.LineFriendBonusAmount?.Value || 0) || 0));
            const linkedLineUserId = String(readOnly?.Data?.lineUserId?.Value || '').trim();
            return {
                status: {
                    eligible: !!linkedLineUserId && rewardAmount > 0,
                    linkedLineUserId: !!linkedLineUserId,
                    rewardAmount,
                    claimed: !!claimedAt,
                    claimedAt: claimedAt || '',
                    claimedAmount,
                    addFriendUrl,
                    temporarilyUnavailable: false
                },
                error: null
            };
        } catch (error) {
            lastError = error;
            if (attempt + 1 < maxAttempts && retryDelayMs > 0) {
                await wait(retryDelayMs);
            }
        }
    }

    return {
        status: buildUnavailableLineFriendBonusStatus(rewardAmount, addFriendUrl),
        error: lastError
    };
}

module.exports = {
    buildUnavailableLineFriendBonusStatus,
    loadLineFriendBonusStatus,
    normalizeServiceErrorMessage
};
