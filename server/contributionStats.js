const PLAYER_CONTRIBUTION_STAT = 'NationContribution';
const PLAYER_DAILY_CONTRIBUTION_STAT = 'NationContributionDaily';
const DAILY_CONTRIBUTION_STATE_COLLECTION = 'system_state';
const DAILY_CONTRIBUTION_STATE_DOC = 'nationContributionDaily';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_CONTRIBUTION_LOCK_TIMEOUT_MS = 30 * 1000;
const DAILY_CONTRIBUTION_LOCK_RETRY_MS = 150;
const DAILY_CONTRIBUTION_LOCK_RETRY_COUNT = 20;
const DAILY_CONTRIBUTION_MAX_CATCHUP_DAYS = 400;

function getJstDateKey(nowMs = Date.now()) {
    const jstMs = Number(nowMs || Date.now()) + JST_OFFSET_MS;
    return new Date(jstMs).toISOString().slice(0, 10);
}

function parseDayKey(dayKey) {
    const raw = String(dayKey || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return Date.UTC(year, month - 1, day);
}

function addDayKeyDays(dayKey, diffDays) {
    const baseMs = parseDayKey(dayKey);
    if (!Number.isFinite(baseMs)) return '';
    const diff = Math.trunc(Number(diffDays) || 0);
    return new Date(baseMs + (diff * DAY_MS)).toISOString().slice(0, 10);
}

function getPreviousJstDateKey(input = null) {
    if (typeof input === 'string') {
        return addDayKeyDays(input, -1);
    }
    return addDayKeyDays(getJstDateKey(input), -1);
}

function diffDayKeys(fromDayKey, toDayKey) {
    const fromMs = parseDayKey(fromDayKey);
    const toMs = parseDayKey(toDayKey);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
    return Math.floor((toMs - fromMs) / DAY_MS);
}

function normalizeVersionNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor(parsed));
}

function normalizeDayKey(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeDailyContributionState(raw) {
    const state = raw && typeof raw === 'object' ? raw : {};
    return {
        activeDayKey: normalizeDayKey(state.activeDayKey),
        activeVersion: normalizeVersionNumber(state.activeVersion),
        previousDayKey: normalizeDayKey(state.previousDayKey),
        previousVersion: normalizeVersionNumber(state.previousVersion),
        rolloverToken: String(state.rolloverToken || '').trim(),
        rolloverTargetDayKey: normalizeDayKey(state.rolloverTargetDayKey),
        rolloverStartedAtMs: Math.max(0, Math.floor(Number(state.rolloverStartedAtMs) || 0))
    };
}

function isDailyContributionRolloverLocked(state, nowMs = Date.now()) {
    if (!state?.rolloverToken || !state?.rolloverTargetDayKey) return false;
    const ageMs = Math.max(0, Number(nowMs || Date.now()) - (Number(state.rolloverStartedAtMs) || 0));
    return ageMs < DAILY_CONTRIBUTION_LOCK_TIMEOUT_MS;
}

function getDailyContributionStateRef(firestore) {
    if (!firestore) {
        throw new Error('Firestore is required for daily contribution state');
    }
    return firestore.collection(DAILY_CONTRIBUTION_STATE_COLLECTION).doc(DAILY_CONTRIBUTION_STATE_DOC);
}

function buildDailyContributionResult(state, todayKey) {
    const normalized = normalizeDailyContributionState(state);
    return {
        todayKey,
        activeDayKey: normalized.activeDayKey || todayKey,
        activeVersion: normalized.activeVersion,
        rewardDayKey: normalized.previousDayKey || getPreviousJstDateKey(todayKey),
        rewardVersion: normalized.previousVersion
    };
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(Number(ms) || 0))));
}

async function getLatestStatisticVersion(promisifyPlayFab, PlayFabServer, statisticName) {
    const result = await promisifyPlayFab(PlayFabServer.GetPlayerStatisticVersions, {
        StatisticName: statisticName
    });
    const versions = Array.isArray(result?.StatisticVersions) ? result.StatisticVersions : [];
    let latest = null;
    versions.forEach((entry) => {
        const version = normalizeVersionNumber(entry?.Version);
        if (!Number.isFinite(version)) return;
        if (!latest || version > latest) latest = version;
    });
    return Number.isFinite(latest) ? latest : 0;
}

async function waitForDailyContributionState(ref, todayKey) {
    for (let i = 0; i < DAILY_CONTRIBUTION_LOCK_RETRY_COUNT; i += 1) {
        await sleep(DAILY_CONTRIBUTION_LOCK_RETRY_MS);
        const snap = await ref.get();
        const state = normalizeDailyContributionState(snap.data());
        if (!isDailyContributionRolloverLocked(state) && (state.activeDayKey === todayKey || state.activeDayKey > todayKey)) {
            return buildDailyContributionResult(state, todayKey);
        }
    }
    return null;
}

async function releaseDailyContributionLock(ref, admin, patch = {}) {
    await ref.set({
        ...patch,
        rolloverToken: admin.firestore.FieldValue.delete(),
        rolloverTargetDayKey: admin.firestore.FieldValue.delete(),
        rolloverStartedAtMs: admin.firestore.FieldValue.delete(),
        rolloverStartedAt: admin.firestore.FieldValue.delete()
    }, { merge: true });
}

async function ensureDailyContributionVersionForToday(deps, options = {}) {
    const { firestore, admin, promisifyPlayFab, PlayFabServer, PlayFabAdmin } = deps || {};
    if (!firestore || !admin || typeof promisifyPlayFab !== 'function' || !PlayFabServer || !PlayFabAdmin) {
        throw new Error('Missing dependencies for daily contribution rollover');
    }

    const todayKey = normalizeDayKey(options.todayKey) || getJstDateKey(options.nowMs);
    const ref = getDailyContributionStateRef(firestore);

    for (let attempt = 0; attempt < DAILY_CONTRIBUTION_LOCK_RETRY_COUNT; attempt += 1) {
        const attemptNowMs = Math.max(0, Math.floor(Number(options.nowMs) || Date.now()));
        const token = `daily-contribution-${todayKey}-${attemptNowMs}-${attempt}-${Math.random().toString(36).slice(2, 10)}`;
        let outcome = null;

        await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const state = normalizeDailyContributionState(snap.data());
            const hasActiveVersion = Number.isFinite(state.activeVersion);
            const locked = isDailyContributionRolloverLocked(state, attemptNowMs);

            if ((state.activeDayKey === todayKey || state.activeDayKey > todayKey) && hasActiveVersion && !locked) {
                outcome = { action: 'ready', state };
                return;
            }
            if (locked && state.rolloverTargetDayKey === todayKey) {
                outcome = { action: 'wait' };
                return;
            }

            tx.set(ref, {
                rolloverToken: token,
                rolloverTargetDayKey: todayKey,
                rolloverStartedAtMs: attemptNowMs,
                rolloverStartedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            outcome = { action: 'owner', state };
        });

        if (outcome?.action === 'ready') {
            return buildDailyContributionResult(outcome.state, todayKey);
        }
        if (outcome?.action === 'wait') {
            const waited = await waitForDailyContributionState(ref, todayKey);
            if (waited) return waited;
            continue;
        }
        if (outcome?.action !== 'owner') {
            continue;
        }

        try {
            const latestVersion = await getLatestStatisticVersion(promisifyPlayFab, PlayFabServer, PLAYER_DAILY_CONTRIBUTION_STAT);
            const lockedState = normalizeDailyContributionState(outcome.state);
            let activeVersion = Number.isFinite(lockedState.activeVersion) ? lockedState.activeVersion : latestVersion;
            let nextState = {
                activeDayKey: lockedState.activeDayKey || todayKey,
                activeVersion,
                previousDayKey: lockedState.previousDayKey,
                previousVersion: lockedState.previousVersion
            };

            if (!lockedState.activeDayKey) {
                nextState = {
                    activeDayKey: todayKey,
                    activeVersion,
                    previousDayKey: '',
                    previousVersion: null
                };
            } else {
                const gapDays = Math.max(0, Math.min(DAILY_CONTRIBUTION_MAX_CATCHUP_DAYS, diffDayKeys(lockedState.activeDayKey, todayKey)));
                if (gapDays > 0) {
                    for (let i = 0; i < gapDays; i += 1) {
                        const incrementResult = await promisifyPlayFab(PlayFabAdmin.IncrementPlayerStatisticVersion, {
                            StatisticName: PLAYER_DAILY_CONTRIBUTION_STAT
                        });
                        const incrementedVersion = normalizeVersionNumber(incrementResult?.StatisticVersion?.Version);
                        if (Number.isFinite(incrementedVersion)) {
                            activeVersion = incrementedVersion;
                        } else {
                            activeVersion += 1;
                        }
                    }
                    nextState = {
                        activeDayKey: todayKey,
                        activeVersion,
                        previousDayKey: getPreviousJstDateKey(todayKey),
                        previousVersion: Math.max(0, activeVersion - 1)
                    };
                }
            }

            await releaseDailyContributionLock(ref, admin, {
                activeDayKey: nextState.activeDayKey,
                activeVersion: nextState.activeVersion,
                previousDayKey: nextState.previousDayKey || admin.firestore.FieldValue.delete(),
                previousVersion: Number.isFinite(nextState.previousVersion) ? nextState.previousVersion : admin.firestore.FieldValue.delete(),
                lastRolledAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return buildDailyContributionResult(nextState, todayKey);
        } catch (error) {
            await releaseDailyContributionLock(ref, admin, {
                lastRolloverError: String(error?.errorMessage || error?.message || error),
                lastRolloverErrorAt: admin.firestore.FieldValue.serverTimestamp()
            });
            throw error;
        }
    }

    const finalSnap = await ref.get();
    const finalState = normalizeDailyContributionState(finalSnap.data());
    if (Number.isFinite(finalState.activeVersion)) {
        return buildDailyContributionResult(finalState, todayKey);
    }
    throw new Error('DailyContributionRolloverUnavailable');
}

module.exports = {
    PLAYER_CONTRIBUTION_STAT,
    PLAYER_DAILY_CONTRIBUTION_STAT,
    getJstDateKey,
    getPreviousJstDateKey,
    addDayKeyDays,
    diffDayKeys,
    ensureDailyContributionVersionForToday
};
