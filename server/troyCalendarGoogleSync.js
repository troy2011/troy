const cron = require('node-cron');
const { createHash, randomUUID } = require('node:crypto');

const {
    GoogleBusinessProfileError,
    buildDesiredSpecialHours,
    canonicalizeSpecialHourPeriods,
    createGoogleBusinessProfileClient,
    mergeSpecialHourPeriods,
    readGoogleBusinessProfileConfig
} = require('./googleBusinessProfile');

const TROY_CALENDAR_COLLECTION = 'troy_business_calendar';
const INTEGRATION_STATE_COLLECTION = 'integration_states';
const INTEGRATION_STATE_DOCUMENT = 'troy_google_business_profile_special_hours';
const MAX_CALENDAR_DOCS = 500;
const STARTUP_SYNC_DELAY_MS = 15_000;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
const DEFAULT_CHANGE_DEBOUNCE_MS = 8_000;
const DEFAULT_MIN_REMOTE_UPDATE_INTERVAL_MS = 15_000;
const MIN_LEASE_DURATION_MS = 90_000;
const MIN_REMOTE_UPDATE_INTERVAL_MS = 15_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getJstStartOfTodayMs(nowMs) {
    const jst = new Date(Number(nowMs || Date.now()) + JST_OFFSET_MS);
    return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS;
}

function normalizeError(error) {
    if (error instanceof GoogleBusinessProfileError) return error;
    const wrapped = new GoogleBusinessProfileError(
        error?.message || 'Google Business Profile sync failed.',
        {
            code: error?.code || 'GBP_SYNC_FAILED',
            status: Number(error?.status || 0),
            retryable: error?.retryable !== false
        }
    );
    return wrapped;
}

function publicConfigStatus(config) {
    if (!config?.enabled) {
        return {
            status: 'disabled',
            configured: false,
            enabled: false
        };
    }
    if (!config.configured) {
        return {
            status: 'not_configured',
            configured: false,
            enabled: true,
            missing: Array.isArray(config.missing) ? config.missing : []
        };
    }
    return {
        status: 'configured',
        configured: true,
        enabled: true,
        dryRun: config.validateOnly === true
    };
}

function errorForState(error) {
    return String(error?.message || 'Google Business Profile sync failed.').slice(0, 500);
}

function retryDelayMs(attempt, random = Math.random) {
    const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
    const exponential = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** Math.min(6, safeAttempt - 1)));
    const jitter = 0.75 + (Math.max(0, Math.min(1, Number(random()) || 0)) * 0.5);
    return Math.max(BASE_RETRY_DELAY_MS, Math.floor(exponential * jitter));
}

function readBoundedMs(value, fallback, { min = 0, max = 60 * 60 * 1000 } = {}) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(candidate)));
}

function configFingerprint(config, generation) {
    return createHash('sha256').update(JSON.stringify({
        generation,
        locationName: config.locationName,
        validateOnly: config.validateOnly === true,
        validateBeforeUpdate: config.validateBeforeUpdate === true
    })).digest('hex').slice(0, 32);
}

function createTroyCalendarGoogleSync({
    firestore,
    admin,
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console,
    now = () => Date.now(),
    random = Math.random,
    instanceId = randomUUID()
} = {}) {
    const config = readGoogleBusinessProfileConfig(env);
    const configurationStatus = publicConfigStatus(config);
    const fieldValue = admin?.firestore?.FieldValue;
    const stateRef = firestore
        ? firestore.collection(INTEGRATION_STATE_COLLECTION).doc(INTEGRATION_STATE_DOCUMENT)
        : null;
    const client = config.configured
        ? createGoogleBusinessProfileClient({ config, fetchImpl, now })
        : null;
    const syncInstanceId = String(instanceId || randomUUID()).slice(0, 100);
    const configuredGeneration = Math.floor(Number(env.GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION));
    const generation = Number.isInteger(configuredGeneration) && configuredGeneration >= 1
        ? configuredGeneration
        : 1;
    const fingerprint = configFingerprint(config, generation);
    const changeDebounceMs = readBoundedMs(
        env.GOOGLE_BUSINESS_PROFILE_CHANGE_DEBOUNCE_MS,
        DEFAULT_CHANGE_DEBOUNCE_MS,
        { min: 0, max: 60_000 }
    );
    const minRemoteUpdateIntervalMs = readBoundedMs(
        env.GOOGLE_BUSINESS_PROFILE_MIN_UPDATE_INTERVAL_MS,
        DEFAULT_MIN_REMOTE_UPDATE_INTERVAL_MS,
        { min: MIN_REMOTE_UPDATE_INTERVAL_MS, max: 60_000 }
    );
    const leaseDurationMs = readBoundedMs(
        env.GOOGLE_BUSINESS_PROFILE_LEASE_MS,
        Math.max(MIN_LEASE_DURATION_MS, Number(config.timeoutMs || 0) * 6),
        { min: Math.max(MIN_LEASE_DURATION_MS, Number(config.timeoutMs || 0) * 6), max: 15 * 60_000 }
    );

    let runningPromise = null;
    let workTimer = null;
    let scheduledAtMs = 0;
    let startupTimer = null;
    let dailyTask = null;
    let drainTask = null;

    function clearWorkTimer() {
        if (workTimer) clearTimeout(workTimer);
        workTimer = null;
        scheduledAtMs = 0;
    }

    function scheduleAt(targetMs) {
        if (configurationStatus.status !== 'configured') return;
        const safeTargetMs = Math.max(now(), Math.floor(Number(targetMs) || now()));
        if (workTimer && scheduledAtMs <= safeTargetMs) return;
        clearWorkTimer();
        scheduledAtMs = safeTargetMs;
        workTimer = setTimeout(() => {
            workTimer = null;
            scheduledAtMs = 0;
            flush().catch((error) => {
                logger.warn('[google-business-profile] Scheduled sync failed:', error?.message || error);
            });
        }, Math.max(0, safeTargetMs - now()));
        workTimer.unref?.();
    }

    function scheduleFlush(delayMs = changeDebounceMs) {
        scheduleAt(now() + Math.max(0, Math.floor(Number(delayMs) || 0)));
        return configurationStatus;
    }

    function queuedResult() {
        return {
            status: 'queued',
            configured: true,
            enabled: true,
            queued: true,
            dryRun: config.validateOnly === true
        };
    }

    function pendingStateData(reason, metadata = {}) {
        const data = {
            pending: true,
            status: 'pending',
            revision: fieldValue.increment(1),
            requestedReason: String(reason || 'calendar_update').slice(0, 80),
            requestedAtMs: now(),
            requestedAt: fieldValue.serverTimestamp()
        };
        if (metadata.requestedBy) data.requestedBy = String(metadata.requestedBy).slice(0, 100);
        if (metadata.calendarId) data.requestedCalendarId = String(metadata.calendarId).slice(0, 100);
        if (metadata.action) data.requestedAction = String(metadata.action).slice(0, 40);
        return data;
    }

    function unavailableStateStatus() {
        return {
            status: 'not_configured',
            configured: false,
            enabled: true,
            missing: ['Firestore integration state']
        };
    }

    function markPendingInBatch(batch, reason = 'calendar_update', metadata = {}) {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!stateRef || !fieldValue || typeof batch?.set !== 'function') {
            throw new Error('Firestore batch is required to queue Google Business Profile sync atomically.');
        }
        batch.set(stateRef, pendingStateData(reason, metadata), { merge: true });
        return queuedResult();
    }

    async function markPending(reason = 'calendar_update', metadata = {}) {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!stateRef || !fieldValue) {
            return unavailableStateStatus();
        }
        try {
            if (typeof firestore.batch === 'function') {
                const batch = firestore.batch();
                markPendingInBatch(batch, reason, metadata);
                await batch.commit();
            } else {
                await stateRef.set(pendingStateData(reason, metadata), { merge: true });
            }
            scheduleFlush();
            return queuedResult();
        } catch (error) {
            logger.warn('[google-business-profile] Failed to queue sync:', error?.message || error);
            return {
                status: 'queue_failed',
                configured: true,
                enabled: true,
                queued: false,
                retryable: true,
                code: 'GBP_SYNC_QUEUE_FAILED'
            };
        }
    }

    function bindingStateData() {
        return {
            activeConfigGeneration: generation,
            activeConfigFingerprint: fingerprint,
            activeLocationName: config.locationName,
            activeValidateOnly: config.validateOnly === true,
            activeValidateBeforeUpdate: config.validateBeforeUpdate === true,
            configActivatedAtMs: now(),
            configActivatedAt: fieldValue.serverTimestamp()
        };
    }

    function configurationRelation(state) {
        const activeFingerprint = String(state?.activeConfigFingerprint || '');
        const activeGeneration = Math.max(0, Number(state?.activeConfigGeneration || 0));
        if (!activeFingerprint) return 'unbound';
        if (activeGeneration === generation && activeFingerprint === fingerprint) return 'current';
        if (generation > activeGeneration) return 'newer';
        if (generation < activeGeneration) return 'stale';
        return 'conflict';
    }

    function stateMatchesCurrentConfiguration(state) {
        return configurationRelation(state) === 'current';
    }

    async function activateConfiguration(reason = 'configuration_activation') {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        let outcome = { status: 'current' };
        await firestore.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(stateRef);
            const state = snapshot.data() || {};
            const relation = configurationRelation(state);
            if (relation === 'current') {
                outcome = { status: 'current' };
                return;
            }
            if (relation === 'stale' || relation === 'conflict') {
                outcome = {
                    status: 'configuration_conflict',
                    relation,
                    activeGeneration: Number(state.activeConfigGeneration || 0)
                };
                return;
            }
            const revision = Math.max(0, Number(state.revision || 0)) + 1;
            transaction.set(stateRef, {
                ...bindingStateData(),
                pending: true,
                status: 'pending',
                revision,
                attemptCount: 0,
                nextAttemptAtMs: 0,
                requestedReason: String(reason || 'configuration_activation').slice(0, 80),
                requestedAtMs: now(),
                requestedAt: fieldValue.serverTimestamp()
            }, { merge: true });
            outcome = { status: 'activated', revision };
        });
        if (outcome.status === 'activated') scheduleFlush(0);
        return outcome;
    }

    async function claimPending() {
        let claim = null;
        await firestore.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(stateRef);
            let state = snapshot.data() || {};
            const currentMs = now();
            const relation = configurationRelation(state);
            let bindingWrite = null;

            if (relation === 'stale' || relation === 'conflict') {
                claim = state.pending === true
                    ? {
                        status: 'configuration_conflict',
                        pending: true,
                        reason: relation,
                        activeGeneration: Number(state.activeConfigGeneration || 0)
                    }
                    : { status: 'idle', pending: false };
                return;
            }

            if (relation === 'unbound') {
                bindingWrite = bindingStateData();
                if (state.pending !== true) {
                    state = {
                        ...state,
                        ...bindingWrite,
                        pending: true,
                        status: 'pending',
                        revision: Math.max(0, Number(state.revision || 0)) + 1,
                        attemptCount: 0,
                        nextAttemptAtMs: 0
                    };
                    bindingWrite = state;
                } else {
                    state = { ...state, ...bindingWrite };
                }
            } else if (relation === 'newer') {
                state = {
                    ...state,
                    ...bindingStateData(),
                    pending: true,
                    status: 'pending',
                    revision: Math.max(0, Number(state.revision || 0)) + 1,
                    attemptCount: 0,
                    nextAttemptAtMs: 0
                };
                bindingWrite = state;
            }

            if (state.pending !== true) {
                if (bindingWrite) transaction.set(stateRef, bindingWrite, { merge: true });
                claim = { status: 'idle', pending: false };
                return;
            }
            const leaseUntilMs = Number(state.leaseUntilMs || 0);
            if (leaseUntilMs > currentMs) {
                if (bindingWrite) transaction.set(stateRef, bindingWrite, { merge: true });
                claim = {
                    status: 'deferred',
                    pending: true,
                    reason: 'leased',
                    waitUntilMs: leaseUntilMs
                };
                return;
            }
            const nextAttemptAtMs = Number(state.nextAttemptAtMs || 0);
            if (nextAttemptAtMs > currentMs) {
                if (bindingWrite) transaction.set(stateRef, bindingWrite, { merge: true });
                claim = {
                    status: 'deferred',
                    pending: true,
                    reason: 'backoff',
                    waitUntilMs: nextAttemptAtMs
                };
                return;
            }

            const leaseToken = randomUUID();
            const attemptCount = Math.max(0, Number(state.attemptCount || 0)) + 1;
            claim = {
                status: 'claimed',
                pending: true,
                capturedRevision: Number(state.revision || 0),
                attemptCount,
                leaseToken,
                leaseUntilMs: currentMs + leaseDurationMs,
                state
            };
            transaction.set(stateRef, {
                ...(bindingWrite || {}),
                status: 'syncing',
                attemptCount,
                leaseOwner: syncInstanceId,
                leaseToken,
                leaseUntilMs: claim.leaseUntilMs,
                lastAttemptAtMs: currentMs,
                lastAttemptAt: fieldValue.serverTimestamp()
            }, { merge: true });
        });
        return claim || { status: 'idle', pending: false };
    }

    async function renewLease(claim) {
        const renewedUntilMs = await firestore.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(stateRef);
            const latest = snapshot.data() || {};
            if (!stateMatchesCurrentConfiguration(latest)
                || latest.leaseOwner !== syncInstanceId
                || latest.leaseToken !== claim.leaseToken) return 0;
            const leaseUntilMs = now() + leaseDurationMs;
            transaction.set(stateRef, {
                leaseUntilMs
            }, { merge: true });
            return leaseUntilMs;
        });
        if (!renewedUntilMs) return false;
        claim.leaseUntilMs = renewedUntilMs;
        return true;
    }

    async function finalizeSuccess({ claim, managedDates, changeDetected, periodCount }) {
        let outcome = { stale: true, pending: true };
        await firestore.runTransaction(async (transaction) => {
            const latestSnapshot = await transaction.get(stateRef);
            const latest = latestSnapshot.data() || {};
            if (!stateMatchesCurrentConfiguration(latest)
                || latest.leaseOwner !== syncInstanceId
                || latest.leaseToken !== claim.leaseToken) {
                outcome = {
                    stale: true,
                    pending: latest.pending === true,
                    waitUntilMs: Math.max(Number(latest.nextAttemptAtMs || 0), Number(latest.leaseUntilMs || 0))
                };
                return;
            }

            const currentMs = now();
            const pending = Number(latest.revision || 0) !== claim.capturedRevision;
            const dryRun = config.validateOnly === true;
            const terminalStatus = dryRun && changeDetected
                ? 'validated'
                : (changeDetected ? 'synced' : 'up_to_date');
            const nextAttemptAtMs = changeDetected
                ? Math.max(Number(latest.nextAttemptAtMs || 0), currentMs + minRemoteUpdateIntervalMs)
                : Number(latest.nextAttemptAtMs || 0);
            outcome = { stale: false, pending, nextAttemptAtMs, terminalStatus };
            transaction.set(stateRef, {
                pending,
                status: pending ? 'pending' : terminalStatus,
                locationName: config.locationName,
                managedDates,
                lastAppliedRevision: claim.capturedRevision,
                lastUpdatedRemote: changeDetected && !dryRun,
                lastWouldUpdateRemote: changeDetected,
                lastPeriodCount: periodCount,
                attemptCount: 0,
                nextAttemptAtMs,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                lastError: null,
                lastErrorCode: null,
                lastSuccessAtMs: currentMs,
                lastSuccessAt: fieldValue.serverTimestamp()
            }, { merge: true });
        });
        return outcome;
    }

    async function finalizeFailure({ claim, error }) {
        let outcome = { stale: true, pending: true };
        await firestore.runTransaction(async (transaction) => {
            const latestSnapshot = await transaction.get(stateRef);
            const latest = latestSnapshot.data() || {};
            if (!stateMatchesCurrentConfiguration(latest)
                || latest.leaseOwner !== syncInstanceId
                || latest.leaseToken !== claim.leaseToken) {
                outcome = {
                    stale: true,
                    pending: latest.pending === true,
                    waitUntilMs: Math.max(Number(latest.nextAttemptAtMs || 0), Number(latest.leaseUntilMs || 0))
                };
                return;
            }

            const currentMs = now();
            const retryable = error.retryable === true;
            const newerRequestExists = Number(latest.revision || 0) !== claim.capturedRevision;
            const pending = retryable || newerRequestExists;
            const nextAttemptAtMs = retryable
                ? currentMs + retryDelayMs(claim.attemptCount, random)
                : (newerRequestExists ? currentMs : 0);
            outcome = {
                stale: false,
                pending,
                retryable,
                nextAttemptAtMs,
                newerRequestExists
            };
            transaction.set(stateRef, {
                pending,
                status: retryable ? 'retrying' : (newerRequestExists ? 'pending' : 'blocked'),
                attemptCount: claim.attemptCount,
                nextAttemptAtMs,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                lastError: errorForState(error),
                lastErrorCode: String(error.code || 'GBP_SYNC_FAILED').slice(0, 100),
                lastHttpStatus: Number(error.status || 0),
                lastFailureAtMs: currentMs,
                lastFailureAt: fieldValue.serverTimestamp()
            }, { merge: true });
        });
        return outcome;
    }

    function publicResult(values = {}) {
        return {
            configured: true,
            enabled: true,
            dryRun: config.validateOnly === true,
            ...values
        };
    }

    async function runOnce() {
        let claim;
        try {
            claim = await claimPending();
        } catch (rawError) {
            const error = normalizeError(rawError);
            scheduleAt(now() + BASE_RETRY_DELAY_MS);
            logger.warn('[google-business-profile] Failed to claim sync work:', error?.message || error);
            return publicResult({
                status: 'retrying',
                pending: true,
                retryable: true,
                code: 'GBP_SYNC_CLAIM_FAILED'
            });
        }

        if (claim.status === 'idle') {
            return publicResult({ status: 'idle', pending: false });
        }
        if (claim.status === 'deferred') {
            scheduleAt(claim.waitUntilMs);
            return publicResult({
                status: 'deferred',
                pending: true,
                retryable: true,
                reason: claim.reason,
                nextAttemptAtMs: claim.waitUntilMs
            });
        }
        if (claim.status === 'configuration_conflict') {
            logger.warn(
                '[google-business-profile] This worker cannot consume the active configuration generation:',
                claim.reason,
                claim.activeGeneration
            );
            return publicResult({
                status: 'configuration_conflict',
                pending: true,
                retryable: false,
                code: 'GBP_CONFIG_GENERATION_CONFLICT',
                activeGeneration: claim.activeGeneration
            });
        }

        try {
            const calendarSnapshot = await firestore
                .collection(TROY_CALENDAR_COLLECTION)
                .where('startsAtMs', '>=', getJstStartOfTodayMs(now()))
                .orderBy('startsAtMs', 'asc')
                .limit(MAX_CALENDAR_DOCS + 1)
                .get();
            if (calendarSnapshot.docs.length > MAX_CALENDAR_DOCS) {
                throw new GoogleBusinessProfileError(
                    `同期対象の営業予定が${MAX_CALENDAR_DOCS}件を超えています。`,
                    {
                        code: 'GBP_CALENDAR_LIMIT_EXCEEDED',
                        status: 400,
                        retryable: false
                    }
                );
            }
            const entries = calendarSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() || {})
            }));
            const desired = buildDesiredSpecialHours(entries, { nowMs: now() });
            const location = await client.getLocation();
            const regularPeriods = location?.regularHours?.periods;
            if (!Array.isArray(regularPeriods) || regularPeriods.length === 0) {
                throw new GoogleBusinessProfileError(
                    'Google Business Profileに通常営業時間が設定されていないため、特別営業時間を同期できません。',
                    {
                        code: 'GBP_REGULAR_HOURS_REQUIRED',
                        status: 400,
                        retryable: false
                    }
                );
            }

            const remotePeriods = Array.isArray(location?.specialHours?.specialHourPeriods)
                ? location.specialHours.specialHourPeriods
                : [];
            const previousManagedDates = claim.state.locationName === config.locationName && Array.isArray(claim.state.managedDates)
                ? claim.state.managedDates
                : [];
            const mergedPeriods = mergeSpecialHourPeriods(
                remotePeriods,
                desired.specialHourPeriods,
                previousManagedDates,
                desired.managedDates
            );
            const before = canonicalizeSpecialHourPeriods(remotePeriods);
            const after = canonicalizeSpecialHourPeriods(mergedPeriods);
            const changeDetected = JSON.stringify(before) !== JSON.stringify(after);

            if (changeDetected) {
                const renewed = await renewLease(claim);
                if (!renewed) {
                    scheduleAt(claim.leaseUntilMs);
                    return publicResult({
                        status: 'deferred',
                        pending: true,
                        retryable: true,
                        reason: 'lease_lost'
                    });
                }
                await client.updateSpecialHours(mergedPeriods);
            }

            const outcome = await finalizeSuccess({
                claim,
                managedDates: desired.managedDates,
                changeDetected,
                periodCount: mergedPeriods.length
            });
            if (outcome.stale) {
                if (outcome.pending) scheduleAt(outcome.waitUntilMs || now() + BASE_RETRY_DELAY_MS);
                return publicResult({ status: 'deferred', pending: outcome.pending, reason: 'stale_lease' });
            }
            if (outcome.pending && outcome.nextAttemptAtMs > now()) scheduleAt(outcome.nextAttemptAtMs);
            const action = config.validateOnly && changeDetected
                ? 'Validated'
                : (changeDetected ? 'Updated' : 'Already current');
            logger.info(`[google-business-profile] ${action} (${mergedPeriods.length} periods).`);
            return publicResult({
                status: outcome.pending ? 'queued' : outcome.terminalStatus,
                pending: outcome.pending,
                updated: changeDetected && config.validateOnly !== true,
                wouldUpdate: changeDetected,
                managedDateCount: desired.managedDates.length,
                periodCount: mergedPeriods.length
            });
        } catch (rawError) {
            const error = normalizeError(rawError);
            let outcome;
            try {
                outcome = await finalizeFailure({ claim, error });
            } catch (stateError) {
                scheduleAt(Math.max(claim.leaseUntilMs, now() + BASE_RETRY_DELAY_MS));
                logger.warn('[google-business-profile] Failed to persist sync failure:', stateError?.message || stateError);
                return publicResult({
                    status: 'retrying',
                    pending: true,
                    retryable: true,
                    code: 'GBP_SYNC_STATE_WRITE_FAILED'
                });
            }
            if (outcome.pending) {
                scheduleAt(outcome.nextAttemptAtMs || outcome.waitUntilMs || now() + BASE_RETRY_DELAY_MS);
            }
            logger.warn('[google-business-profile] Sync failed:', error.code, error.message);
            if (outcome.stale) {
                return publicResult({ status: 'deferred', pending: outcome.pending, reason: 'stale_lease' });
            }
            const status = outcome.retryable
                ? 'retrying'
                : (outcome.newerRequestExists ? 'queued' : 'blocked');
            return publicResult({
                status,
                pending: outcome.pending,
                retryable: error.retryable === true,
                code: error.code || 'GBP_SYNC_FAILED',
                httpStatus: Number(error.status || 0)
            });
        }
    }

    async function flush() {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!stateRef || !fieldValue || typeof firestore?.runTransaction !== 'function') return unavailableStateStatus();
        if (runningPromise) return runningPromise;
        clearWorkTimer();
        runningPromise = (async () => {
            let result = await runOnce();
            let loops = 0;
            while (result.pending === true && result.status === 'queued' && loops < 8) {
                loops += 1;
                result = await runOnce();
            }
            if (result.pending === true && result.status === 'queued') scheduleAt(now());
            return result;
        })();
        try {
            return await runningPromise;
        } finally {
            runningPromise = null;
        }
    }

    async function requestSync(reason = 'calendar_update') {
        const queued = await markPending(reason);
        if (queued.queued !== true) return queued;
        scheduleFlush(0);
        return queued;
    }

    async function getStatus() {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!stateRef) return unavailableStateStatus();
        try {
            const snapshot = await stateRef.get();
            const state = snapshot.data() || {};
            const rawStatus = String(state.status || 'idle');
            const mappedStatus = rawStatus === 'pending'
                ? 'queued'
                : rawStatus;
            const relation = configurationRelation(state);
            const status = relation === 'stale' || relation === 'conflict'
                ? 'configuration_conflict'
                : mappedStatus;
            return {
                status,
                configured: true,
                enabled: true,
                pending: state.pending === true,
                retryable: status === 'retrying',
                dryRun: state.activeConfigFingerprint
                    ? state.activeValidateOnly === true
                    : config.validateOnly === true,
                code: state.lastErrorCode || null,
                revision: Number(state.revision || 0),
                lastAppliedRevision: Number(state.lastAppliedRevision || 0),
                lastUpdatedRemote: state.lastUpdatedRemote === true,
                lastWouldUpdateRemote: state.lastWouldUpdateRemote === true,
                configurationMismatch: relation === 'stale' || relation === 'conflict',
                activeGeneration: Number(state.activeConfigGeneration || generation)
            };
        } catch (error) {
            logger.warn('[google-business-profile] Failed to read sync status:', error?.message || error);
            return {
                status: 'status_unavailable',
                configured: true,
                enabled: true,
                retryable: true,
                code: 'GBP_SYNC_STATUS_UNAVAILABLE'
            };
        }
    }

    function start() {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        activateConfiguration().then((outcome) => {
            if (outcome.status === 'configuration_conflict') {
                logger.warn(
                    '[google-business-profile] Configuration generation conflict; increment GOOGLE_BUSINESS_PROFILE_CONFIG_GENERATION.',
                    outcome.relation,
                    outcome.activeGeneration
                );
            }
        }).catch((error) => {
            logger.warn('[google-business-profile] Failed to activate configuration:', error?.message || error);
        });
        if (!startupTimer) {
            startupTimer = setTimeout(() => {
                startupTimer = null;
                requestSync('startup_reconciliation').catch((error) => {
                    logger.warn('[google-business-profile] Startup reconciliation failed:', error?.message || error);
                });
            }, STARTUP_SYNC_DELAY_MS);
            startupTimer.unref?.();
        }
        if (!dailyTask) {
            dailyTask = cron.schedule('41 4 * * *', () => {
                requestSync('daily_reconciliation').catch((error) => {
                    logger.warn('[google-business-profile] Daily reconciliation failed:', error?.message || error);
                });
            }, { timezone: 'Asia/Tokyo' });
        }
        if (!drainTask) {
            drainTask = cron.schedule('* * * * *', () => {
                flush().catch((error) => {
                    logger.warn('[google-business-profile] Durable outbox drain failed:', error?.message || error);
                });
            }, { timezone: 'Asia/Tokyo' });
        }
        return configurationStatus;
    }

    function stop() {
        clearWorkTimer();
        if (startupTimer) clearTimeout(startupTimer);
        startupTimer = null;
        dailyTask?.stop?.();
        dailyTask = null;
        drainTask?.stop?.();
        drainTask = null;
    }

    return {
        config: configurationStatus,
        activateConfiguration,
        flush,
        getStatus,
        markPending,
        markPendingInBatch,
        requestSync,
        scheduleFlush,
        start,
        stop
    };
}

module.exports = {
    createTroyCalendarGoogleSync,
    __test: {
        errorForState,
        getJstStartOfTodayMs,
        normalizeError,
        publicConfigStatus,
        retryDelayMs
    }
};
