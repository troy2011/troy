const cron = require('node-cron');
const { createHash, randomUUID } = require('node:crypto');

const {
    GoogleBusinessProfileError,
    buildDesiredSpecialHours,
    canonicalizeSpecialHourPeriods,
    createGoogleBusinessProfileClient,
    dateObjectToKey,
    hashSpecialHourPeriods,
    mergeSpecialHourPeriods,
    normalizeLocationName,
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
const GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION = 'gbp-special-hours-v1';
const REVIEW_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

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
        enabled: config.enabled === true,
        configured: config.configured === true,
        locationName: config.locationName,
        allowedLocationName: config.allowedLocationName,
        validateOnly: config.validateOnly === true,
        validateBeforeUpdate: config.validateBeforeUpdate === true,
        productionWritesEnabled: config.productionWritesEnabled === true
    })).digest('hex').slice(0, 32);
}

function normalizeSpecialHoursHash(value) {
    const hash = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function normalizeOperationId(value) {
    const operationId = String(value || '').trim();
    return /^[A-Za-z0-9_-]{8,100}$/.test(operationId) ? operationId : '';
}

function normalizeDateKey(value) {
    const dateKey = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : '';
}

function normalizeDateKeys(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(normalizeDateKey)
        .filter(Boolean))].sort();
}

function specialHourPeriodsForManagedDates(periods, managedDates) {
    const dateSet = new Set(
        (Array.isArray(managedDates) ? managedDates : [])
            .map(normalizeDateKey)
            .filter(Boolean)
    );
    return canonicalizeSpecialHourPeriods(periods).filter((period) => (
        dateSet.has(dateObjectToKey(period?.startDate))
    ));
}

function fieldMaskIncludesSpecialHours(value) {
    return String(value || '')
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
        .some((field) => field === 'specialHours'
            || field.startsWith('specialHours.')
            || field === 'location.specialHours'
            || field.startsWith('location.specialHours.'));
}

function calendarEntryHasCurrentGoogleApproval(
    entry,
    config,
    expectedGeneration = 1,
    expectedFingerprint = configFingerprint(config, expectedGeneration)
) {
    return entry?.googleBusinessProfileConsent === true
        && entry?.googleBusinessProfileConsentVersion === GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION
        && !!normalizeOperationId(entry?.googleBusinessProfileOperationId)
        && normalizeLocationName(entry?.googleBusinessProfileLocationName) === config.locationName
        && entry?.googleBusinessProfileAuthorization === 'staff_playfab_allowlist_and_king'
        && Number(entry?.googleBusinessProfileConfigGeneration) === expectedGeneration
        && String(entry?.googleBusinessProfileConfigFingerprint || '') === expectedFingerprint;
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

    function deletedStateField() {
        return typeof fieldValue?.delete === 'function' ? fieldValue.delete() : null;
    }

    function clearedLegacyRemoteContentState() {
        return {
            lastObservedRemoteSpecialHoursHash: deletedStateField(),
            lastValidatedRemoteSpecialHoursHash: deletedStateField(),
            lastValidatedDesiredSpecialHoursHash: deletedStateField(),
            lastValidatedRevision: deletedStateField(),
            lastAppliedSpecialHoursHash: deletedStateField(),
            lastAppliedSpecialHoursRevision: deletedStateField(),
            lastAppliedSpecialHoursLocationName: deletedStateField(),
            lastPeriodCount: deletedStateField(),
            reviewRequiredRemoteSpecialHoursHash: deletedStateField(),
            reviewRequiredCurrentSpecialHoursHash: deletedStateField(),
            reviewRequiredGoogleUpdatedSpecialHoursHash: deletedStateField()
        };
    }

    function clearedApprovedReviewHashState() {
        return {
            reviewedRemoteSpecialHoursHash: deletedStateField(),
            reviewedGoogleUpdatedSpecialHoursHash: deletedStateField(),
            reviewedRemoteSpecialHoursHashApprovedAtMs: deletedStateField(),
            reviewedRemoteSpecialHoursHashExpiresAtMs: deletedStateField(),
            reviewedRemoteSpecialHoursHashSourceRevision: deletedStateField(),
            reviewedRemoteSpecialHoursReason: deletedStateField()
        };
    }

    function clearedRemoteContentState() {
        return {
            ...clearedLegacyRemoteContentState(),
            ...clearedApprovedReviewHashState(),
            reviewRequiredExpiresAtMs: deletedStateField()
        };
    }

    function currentReviewedHash(state, fieldName) {
        const hash = normalizeSpecialHoursHash(state?.[fieldName]);
        const approvedAtMs = Number(state?.reviewedRemoteSpecialHoursHashApprovedAtMs || 0);
        const expiresAtMs = Number(state?.reviewedRemoteSpecialHoursHashExpiresAtMs || 0);
        const currentMs = now();
        if (!hash
            || !Number.isFinite(approvedAtMs)
            || !Number.isFinite(expiresAtMs)
            || approvedAtMs <= 0
            || expiresAtMs <= currentMs
            || expiresAtMs > approvedAtMs + REVIEW_SNAPSHOT_TTL_MS) return '';
        return hash;
    }

    function reviewSnapshotExpiry(state) {
        const createdAtMs = Number(state?.reviewRequiredAtMs || 0);
        const expiresAtMs = Number(state?.reviewRequiredExpiresAtMs || 0);
        if (!Number.isFinite(createdAtMs)
            || !Number.isFinite(expiresAtMs)
            || createdAtMs <= 0
            || expiresAtMs <= createdAtMs
            || expiresAtMs > createdAtMs + REVIEW_SNAPSHOT_TTL_MS) return 0;
        return expiresAtMs;
    }

    function approvedRemovalDatesForState(state) {
        if (state?.locationName !== config.locationName
            || Number(state?.requestedConfigGeneration || 0) !== generation
            || String(state?.requestedConfigFingerprint || '') !== fingerprint) return [];
        const previouslyManaged = new Set(normalizeDateKeys(state?.managedDates));
        return normalizeDateKeys(state?.approvedRemovalDates)
            .filter((dateKey) => previouslyManaged.has(dateKey));
    }

    function buildApprovedMerge(remotePeriods, desired, state) {
        const removalDates = approvedRemovalDatesForState(state);
        const replacementDates = normalizeDateKeys([
            ...desired.managedDates,
            ...removalDates
        ]);
        const proposedSpecialHours = canonicalizeSpecialHourPeriods(mergeSpecialHourPeriods(
            remotePeriods,
            desired.specialHourPeriods,
            [],
            replacementDates
        ));
        return { proposedSpecialHours, removalDates, replacementDates };
    }

    function reviewCompositeHash({
        reason,
        revision,
        expiresAtMs,
        remotePeriods,
        reviewPeriods,
        proposedPeriods,
        removalDates
    }) {
        return createHash('sha256').update(JSON.stringify({
            schema: 'troy-gbp-review-v2',
            reason: String(reason || ''),
            configGeneration: generation,
            configFingerprint: fingerprint,
            locationName: config.locationName,
            revision: Number(revision || 0),
            expiresAtMs: Number(expiresAtMs || 0),
            removalDates: normalizeDateKeys(removalDates),
            remotePeriods: canonicalizeSpecialHourPeriods(remotePeriods),
            reviewPeriods: canonicalizeSpecialHourPeriods(reviewPeriods),
            proposedPeriods: canonicalizeSpecialHourPeriods(proposedPeriods)
        })).digest('hex');
    }

    async function buildCurrentReviewSnapshot(state, reason, expiresAtMs, revision) {
        const entries = await loadApprovedCalendarEntries();
        const desired = buildDesiredSpecialHours(entries, { nowMs: now() });
        const location = await client.getLocation();
        const remotePeriods = canonicalizeSpecialHourPeriods(
            location?.specialHours?.specialHourPeriods || []
        );
        let reviewPeriods = remotePeriods;
        if (reason === 'google_updated_special_hours') {
            const googleUpdated = await client.getGoogleUpdatedLocation();
            if (!fieldMaskIncludesSpecialHours(googleUpdated?.diffMask)
                || fieldMaskIncludesSpecialHours(googleUpdated?.pendingMask)) {
                throw new GoogleBusinessProfileError(
                    'The Google special-hours review snapshot changed.',
                    {
                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                        status: 409,
                        retryable: false
                    }
                );
            }
            reviewPeriods = canonicalizeSpecialHourPeriods(
                googleUpdated?.location?.specialHours?.specialHourPeriods || []
            );
        }
        const merge = buildApprovedMerge(remotePeriods, desired, state);
        return {
            ...merge,
            desired,
            remotePeriods,
            reviewPeriods,
            reviewHash: reviewCompositeHash({
                reason,
                revision,
                expiresAtMs,
                remotePeriods,
                reviewPeriods,
                proposedPeriods: merge.proposedSpecialHours,
                removalDates: merge.removalDates
            })
        };
    }

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

    function approvalMetadata(metadata = {}) {
        const operationId = normalizeOperationId(metadata.operationId);
        const consentVersion = String(metadata.consentVersion || '').trim();
        const locationName = normalizeLocationName(metadata.locationName);
        const approved = !!operationId
            && consentVersion === GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION
            && locationName === config.locationName;
        return { approved, operationId, consentVersion, locationName };
    }

    function approvalRequiredResult() {
        return {
            status: 'approval_required',
            configured: true,
            enabled: true,
            queued: false,
            dryRun: config.validateOnly === true,
            code: 'GBP_EXPLICIT_APPROVAL_REQUIRED',
            consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION
        };
    }

    function getApprovalContext() {
        return {
            consentVersion: GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
            locationName: config.locationName,
            configGeneration: generation,
            configFingerprint: fingerprint
        };
    }

    function pendingStateData(reason, metadata = {}, {
        reviewedRemoteSpecialHoursHash = '',
        reviewedGoogleUpdatedSpecialHoursHash = '',
        reviewExpiresAtMs = 0,
        reviewReason = '',
        reviewRevision = 0
    } = {}) {
        const approval = approvalMetadata(metadata);
        const reviewedRemoteHash = normalizeSpecialHoursHash(reviewedRemoteSpecialHoursHash);
        const reviewedGoogleUpdatedHash = normalizeSpecialHoursHash(
            reviewedGoogleUpdatedSpecialHoursHash
        );
        const currentMs = now();
        const requestedReviewExpiry = Number(reviewExpiresAtMs || 0);
        const currentReviewExpiry = (reviewedRemoteHash || reviewedGoogleUpdatedHash)
            && Number.isFinite(requestedReviewExpiry)
            && requestedReviewExpiry > currentMs
            && requestedReviewExpiry <= currentMs + REVIEW_SNAPSHOT_TTL_MS
            ? Math.floor(requestedReviewExpiry)
            : 0;
        const data = {
            ...clearedRemoteContentState(),
            pending: true,
            status: 'pending',
            revision: fieldValue.increment(1),
            explicitlyApproved: true,
            requestedConfigGeneration: generation,
            requestedConfigFingerprint: fingerprint,
            requestedOperationId: approval.operationId,
            requestedConsentVersion: approval.consentVersion,
            requestedLocationName: approval.locationName,
            reviewRequiredReason: null,
            approvalRequiredReason: null,
            lastError: null,
            lastErrorCode: null,
            requestedReason: String(reason || 'calendar_update').slice(0, 80),
            requestedAtMs: currentMs,
            requestedAt: fieldValue.serverTimestamp()
        };
        if (currentReviewExpiry) {
            data.reviewedRemoteSpecialHoursHash = reviewedRemoteHash || deletedStateField();
            data.reviewedGoogleUpdatedSpecialHoursHash = reviewedGoogleUpdatedHash || deletedStateField();
            data.reviewedRemoteSpecialHoursHashApprovedAtMs = currentMs;
            data.reviewedRemoteSpecialHoursHashExpiresAtMs = currentReviewExpiry;
            data.reviewedRemoteSpecialHoursHashSourceRevision = Number(reviewRevision || 0);
            data.reviewedRemoteSpecialHoursReason = String(reviewReason || '').slice(0, 100);
        }
        if (metadata.requestedBy) data.requestedBy = String(metadata.requestedBy).slice(0, 100);
        if (metadata.calendarId) data.requestedCalendarId = String(metadata.calendarId).slice(0, 100);
        if (metadata.action) data.requestedAction = String(metadata.action).slice(0, 40);
        data.requestedDate = normalizeDateKey(metadata.requestedDate) || null;
        const requestedRemovalDates = normalizeDateKeys(metadata.removalDates);
        if (metadata.action === 'delete' && data.requestedDate) {
            requestedRemovalDates.push(data.requestedDate);
        }
        const uniqueRemovalDates = normalizeDateKeys(requestedRemovalDates);
        if (uniqueRemovalDates.length > 0 && typeof fieldValue?.arrayUnion === 'function') {
            data.approvedRemovalDates = fieldValue.arrayUnion(...uniqueRemovalDates);
        }
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
        if (!approvalMetadata(metadata).approved) return approvalRequiredResult();
        if (!stateRef || !fieldValue || typeof batch?.set !== 'function') {
            throw new Error('Firestore batch is required to queue Google Business Profile sync atomically.');
        }
        batch.set(stateRef, pendingStateData(reason, metadata), { merge: true });
        return queuedResult();
    }

    async function markPending(reason = 'calendar_update', metadata = {}) {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!approvalMetadata(metadata).approved) return approvalRequiredResult();
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

    async function approveReview(metadata = {}) {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        const approval = approvalMetadata(metadata);
        const submittedReviewHash = normalizeSpecialHoursHash(
            metadata.reviewHash || metadata.reviewedRemoteSpecialHoursHash
        );
        if (!approval.approved || !submittedReviewHash) {
            return {
                ...approvalRequiredResult(),
                code: !submittedReviewHash
                    ? 'GBP_REVIEW_HASH_REQUIRED'
                    : 'GBP_EXPLICIT_APPROVAL_REQUIRED'
            };
        }
        if (!stateRef || !fieldValue) return unavailableStateStatus();

        let outcome = {
            status: 'review_conflict',
            configured: true,
            enabled: true,
            queued: false,
            dryRun: config.validateOnly === true,
            code: 'GBP_REVIEW_STATE_MISMATCH'
        };
        try {
            const initialSnapshot = await stateRef.get();
            const initialState = initialSnapshot.data() || {};
            const reviewReason = String(initialState.reviewRequiredReason || '');
            const capturedRevision = Number(initialState.revision || 0);
            const expiresAtMs = reviewSnapshotExpiry(initialState);
            if (configurationRelation(initialState) !== 'current'
                || initialState.status !== 'conflict_requires_review') {
                return outcome;
            }
            if (!expiresAtMs || expiresAtMs <= now()) {
                return {
                    ...outcome,
                    code: 'GBP_REVIEW_SNAPSHOT_EXPIRED'
                };
            }

            const reviewSnapshot = await buildCurrentReviewSnapshot(
                initialState,
                reviewReason,
                expiresAtMs,
                capturedRevision
            );
            if (reviewSnapshot.reviewHash !== submittedReviewHash) {
                return {
                    ...outcome,
                    code: 'GBP_REVIEW_SNAPSHOT_CHANGED'
                };
            }

            await firestore.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(stateRef);
                const state = snapshot.data() || {};
                const currentExpiry = reviewSnapshotExpiry(state);
                if (configurationRelation(state) !== 'current'
                    || state.status !== 'conflict_requires_review'
                    || Number(state.revision || 0) !== capturedRevision
                    || String(state.reviewRequiredReason || '') !== reviewReason
                    || currentExpiry !== expiresAtMs
                    || currentExpiry <= now()) {
                    return;
                }
                const pendingMetadata = {
                    ...metadata,
                    requestedBy: metadata.requestedBy || state.requestedBy,
                    calendarId: metadata.calendarId || state.requestedCalendarId,
                    action: state.requestedAction || metadata.action,
                    requestedDate: state.requestedDate
                };
                transaction.set(stateRef, pendingStateData(
                    'remote_special_hours_review_approved',
                    pendingMetadata,
                    reviewReason === 'google_updated_special_hours'
                        ? {
                            reviewedGoogleUpdatedSpecialHoursHash: submittedReviewHash,
                            reviewExpiresAtMs: expiresAtMs,
                            reviewReason,
                            reviewRevision: capturedRevision
                        }
                        : {
                            reviewedRemoteSpecialHoursHash: submittedReviewHash,
                            reviewExpiresAtMs: expiresAtMs,
                            reviewReason,
                            reviewRevision: capturedRevision
                        }
                ), { merge: true });
                outcome = {
                    ...queuedResult(),
                    reviewExpiresAtMs: expiresAtMs
                };
            });
            if (outcome.queued) scheduleFlush();
            return outcome;
        } catch (error) {
            logger.warn('[google-business-profile] Failed to approve remote review:', error?.message || error);
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
            activeProductionWritesEnabled: config.productionWritesEnabled === true,
            configActivatedAtMs: now(),
            configActivatedAt: fieldValue.serverTimestamp()
        };
    }

    function hasApprovedPendingForCurrentConfiguration(state) {
        return state?.pending === true
            && state?.explicitlyApproved === true
            && normalizeOperationId(state?.requestedOperationId)
            && state?.requestedConsentVersion === GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION
            && normalizeLocationName(state?.requestedLocationName) === config.locationName
            && Number(state?.requestedConfigGeneration || 0) === generation
            && String(state?.requestedConfigFingerprint || '') === fingerprint;
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
                const hasCurrentApprovedReview = hasApprovedPendingForCurrentConfiguration(state)
                    && !!(currentReviewedHash(state, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(state, 'reviewedGoogleUpdatedSpecialHoursHash'));
                transaction.set(stateRef, {
                    ...clearedLegacyRemoteContentState(),
                    ...(!hasCurrentApprovedReview ? clearedApprovedReviewHashState() : {})
                }, { merge: true });
                outcome = {
                    status: 'current',
                    pending: hasApprovedPendingForCurrentConfiguration(state)
                };
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
            const approvedPending = hasApprovedPendingForCurrentConfiguration(state);
            const discardedUnapprovedPending = state.pending === true && !approvedPending;
            const nextState = {
                ...bindingStateData(),
                ...(!approvedPending ? clearedRemoteContentState() : {}),
                pending: approvedPending,
                status: approvedPending
                    ? 'pending'
                    : (discardedUnapprovedPending ? 'approval_required' : 'idle'),
                nextAttemptAtMs: 0,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                ...(!approvedPending ? { approvedRemovalDates: deletedStateField() } : {})
            };
            if (discardedUnapprovedPending) {
                nextState.explicitlyApproved = false;
                nextState.lastErrorCode = 'GBP_EXPLICIT_APPROVAL_REQUIRED';
                nextState.lastError = 'A new explicit approval is required for the active configuration.';
                nextState.approvalRequiredReason = String(reason || 'configuration_activation').slice(0, 80);
            }
            transaction.set(stateRef, nextState, { merge: true });
            outcome = {
                status: discardedUnapprovedPending ? 'approval_required' : 'activated',
                pending: approvedPending
            };
        });
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

            if (relation === 'unbound' || relation === 'newer') {
                bindingWrite = bindingStateData();
                if (!hasApprovedPendingForCurrentConfiguration(state)) {
                    const discardedUnapprovedPending = state.pending === true;
                    transaction.set(stateRef, {
                        ...bindingWrite,
                        ...clearedRemoteContentState(),
                        pending: false,
                        status: discardedUnapprovedPending ? 'approval_required' : 'idle',
                        explicitlyApproved: false,
                        nextAttemptAtMs: 0,
                        leaseOwner: null,
                        leaseToken: null,
                        leaseUntilMs: 0,
                        approvedRemovalDates: deletedStateField(),
                        ...(discardedUnapprovedPending ? {
                            lastErrorCode: 'GBP_EXPLICIT_APPROVAL_REQUIRED',
                            lastError: 'A new explicit approval is required for the active configuration.'
                        } : {})
                    }, { merge: true });
                    claim = {
                        status: discardedUnapprovedPending ? 'approval_required' : 'idle',
                        pending: false
                    };
                    return;
                }
                state = { ...state, ...bindingWrite };
            }

            if (state.pending === true && !hasApprovedPendingForCurrentConfiguration(state)) {
                transaction.set(stateRef, {
                    pending: false,
                    status: 'approval_required',
                    explicitlyApproved: false,
                    nextAttemptAtMs: 0,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseUntilMs: 0,
                    lastErrorCode: 'GBP_EXPLICIT_APPROVAL_REQUIRED',
                    lastError: 'A new explicit approval is required before this outbox item can be drained.'
                }, { merge: true });
                claim = { status: 'approval_required', pending: false };
                return;
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
                || latest.leaseToken !== claim.leaseToken
                || Number(latest.revision || 0) !== claim.capturedRevision) return 0;
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

    async function finalizeReviewRequired({
        claim,
        reason,
        code
    }) {
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
            const newerRequestExists = Number(latest.revision || 0) !== claim.capturedRevision;
            outcome = {
                stale: false,
                pending: newerRequestExists,
                newerRequestExists,
                reviewExpiresAtMs: newerRequestExists ? 0 : currentMs + REVIEW_SNAPSHOT_TTL_MS
            };
            const reviewState = {
                pending: newerRequestExists,
                status: newerRequestExists ? 'pending' : 'conflict_requires_review',
                explicitlyApproved: newerRequestExists
                    ? hasApprovedPendingForCurrentConfiguration(latest)
                    : false,
                attemptCount: 0,
                nextAttemptAtMs: newerRequestExists ? currentMs : 0,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                lastError: 'Google Business Profile special hours require explicit review before an update.',
                lastErrorCode: String(code || 'GBP_REMOTE_SPECIAL_HOURS_CONFLICT').slice(0, 100)
            };
            if (!newerRequestExists) {
                Object.assign(reviewState, clearedRemoteContentState(), {
                    reviewRequiredReason: String(reason || 'remote_conflict').slice(0, 100),
                    reviewRequiredAtMs: currentMs,
                    reviewRequiredAt: fieldValue.serverTimestamp(),
                    reviewRequiredExpiresAtMs: currentMs + REVIEW_SNAPSHOT_TTL_MS
                });
            }
            transaction.set(stateRef, reviewState, { merge: true });
        });
        return outcome;
    }

    async function finalizeSuccess({
        claim,
        managedDates,
        changeDetected,
        managedHash
    }) {
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
            const successState = {
                ...clearedRemoteContentState(),
                pending,
                status: pending ? 'pending' : terminalStatus,
                explicitlyApproved: pending
                    ? hasApprovedPendingForCurrentConfiguration(latest)
                    : false,
                reviewedRemoteSpecialHoursHash: pending
                    ? (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash') || deletedStateField())
                    : deletedStateField(),
                reviewedGoogleUpdatedSpecialHoursHash: pending
                    ? (currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash') || deletedStateField())
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashApprovedAtMs: pending
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashApprovedAtMs
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashExpiresAtMs: pending
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashExpiresAtMs
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashSourceRevision: pending
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashSourceRevision
                    : deletedStateField(),
                reviewedRemoteSpecialHoursReason: pending
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursReason
                    : deletedStateField(),
                locationName: config.locationName,
                lastAppliedRevision: claim.capturedRevision,
                lastUpdatedRemote: changeDetected && !dryRun,
                lastWouldUpdateRemote: changeDetected,
                attemptCount: 0,
                nextAttemptAtMs,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                lastError: null,
                lastErrorCode: null,
                reviewRequiredReason: null,
                lastSuccessAtMs: currentMs,
                lastSuccessAt: fieldValue.serverTimestamp()
            };
            if (!dryRun) {
                const capturedRemovalDates = new Set(normalizeDateKeys(claim.state.approvedRemovalDates));
                const remainingRemovalDates = normalizeDateKeys(latest.approvedRemovalDates)
                    .filter((dateKey) => !capturedRemovalDates.has(dateKey));
                successState.approvedRemovalDates = remainingRemovalDates.length > 0
                    ? remainingRemovalDates
                    : deletedStateField();
                successState.managedDates = managedDates;
                successState.lastAppliedManagedSpecialHoursHash = managedHash;
                successState.lastAppliedManagedSpecialHoursRevision = claim.capturedRevision;
                successState.lastAppliedManagedSpecialHoursLocationName = config.locationName;
            }
            transaction.set(stateRef, successState, { merge: true });
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
                ...clearedRemoteContentState(),
                pending,
                status: retryable ? 'retrying' : (newerRequestExists ? 'pending' : 'blocked'),
                explicitlyApproved: pending
                    ? hasApprovedPendingForCurrentConfiguration(latest)
                    : false,
                reviewedRemoteSpecialHoursHash: newerRequestExists
                    ? (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash') || deletedStateField())
                    : deletedStateField(),
                reviewedGoogleUpdatedSpecialHoursHash: newerRequestExists
                    ? (currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash') || deletedStateField())
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashApprovedAtMs: newerRequestExists
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashApprovedAtMs
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashExpiresAtMs: newerRequestExists
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashExpiresAtMs
                    : deletedStateField(),
                reviewedRemoteSpecialHoursHashSourceRevision: newerRequestExists
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursHashSourceRevision
                    : deletedStateField(),
                reviewedRemoteSpecialHoursReason: newerRequestExists
                    && (currentReviewedHash(latest, 'reviewedRemoteSpecialHoursHash')
                        || currentReviewedHash(latest, 'reviewedGoogleUpdatedSpecialHoursHash'))
                    ? latest.reviewedRemoteSpecialHoursReason
                    : deletedStateField(),
                attemptCount: claim.attemptCount,
                nextAttemptAtMs,
                leaseOwner: null,
                leaseToken: null,
                leaseUntilMs: 0,
                reviewRequiredReason: null,
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

    async function loadApprovedCalendarEntries() {
        const calendarSnapshot = await firestore
            .collection(TROY_CALENDAR_COLLECTION)
            .where('startsAtMs', '>=', getJstStartOfTodayMs(now()) - (24 * 60 * 60 * 1000))
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
        return entries.filter((entry) => (
            calendarEntryHasCurrentGoogleApproval(entry, config, generation, fingerprint)
        ));
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
        if (claim.status === 'approval_required') {
            return publicResult({
                status: 'approval_required',
                pending: false,
                retryable: false,
                code: 'GBP_EXPLICIT_APPROVAL_REQUIRED'
            });
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

        async function stopForReview({
            reason,
            code
        }) {
            const outcome = await finalizeReviewRequired({
                claim,
                reason,
                code
            });
            if (outcome.stale) {
                if (outcome.pending) scheduleAt(outcome.waitUntilMs || now() + BASE_RETRY_DELAY_MS);
                return publicResult({ status: 'deferred', pending: outcome.pending, reason: 'stale_lease' });
            }
            if (outcome.pending) scheduleAt(now());
            logger.warn('[google-business-profile] Remote special hours require explicit review:', code);
            return publicResult({
                status: outcome.pending ? 'queued' : 'conflict_requires_review',
                pending: outcome.pending,
                retryable: false,
                reviewRequired: !outcome.pending,
                reason,
                code,
                reviewExpiresAtMs: outcome.reviewExpiresAtMs || null
            });
        }

        try {
            const entries = await loadApprovedCalendarEntries();
            let desired = buildDesiredSpecialHours(entries, { nowMs: now() });
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
            const before = canonicalizeSpecialHourPeriods(remotePeriods);
            const remoteHash = hashSpecialHourPeriods(before);
            const reviewedRemoteHash = currentReviewedHash(
                claim.state,
                'reviewedRemoteSpecialHoursHash'
            );
            const reviewedGoogleUpdatedHash = currentReviewedHash(
                claim.state,
                'reviewedGoogleUpdatedSpecialHoursHash'
            );
            const reviewExpiresAtMs = Number(
                claim.state.reviewedRemoteSpecialHoursHashExpiresAtMs || 0
            );
            const reviewSourceRevision = Number(
                claim.state.reviewedRemoteSpecialHoursHashSourceRevision || 0
            );
            let approvedMerge = buildApprovedMerge(before, desired, claim.state);
            let mergedPeriods = approvedMerge.proposedSpecialHours;
            let after = canonicalizeSpecialHourPeriods(mergedPeriods);
            let desiredHash = hashSpecialHourPeriods(after);
            let evaluatedRemotePeriods = before;
            let changeDetected = remoteHash !== desiredHash;
            let googleReviewCoversCurrentSnapshot = false;
            if (location?.metadata?.hasGoogleUpdated === true
                || location?.metadata?.hasPendingEdits === true) {
                const googleUpdated = await client.getGoogleUpdatedLocation();
                const googleUpdatedPeriods = canonicalizeSpecialHourPeriods(
                    googleUpdated?.location?.specialHours?.specialHourPeriods || []
                );
                const googleReviewCompositeHash = reviewCompositeHash({
                    reason: 'google_updated_special_hours',
                    revision: reviewSourceRevision,
                    expiresAtMs: reviewExpiresAtMs,
                    remotePeriods: before,
                    reviewPeriods: googleUpdatedPeriods,
                    proposedPeriods: approvedMerge.proposedSpecialHours,
                    removalDates: approvedMerge.removalDates
                });
                if (fieldMaskIncludesSpecialHours(googleUpdated?.diffMask)
                    && (reviewedGoogleUpdatedHash !== googleReviewCompositeHash
                        || claim.state.reviewedRemoteSpecialHoursReason !== 'google_updated_special_hours')) {
                    return stopForReview({
                        reason: 'google_updated_special_hours',
                        code: 'GBP_GOOGLE_UPDATED_SPECIAL_HOURS_REQUIRES_REVIEW'
                    });
                }
                googleReviewCoversCurrentSnapshot = fieldMaskIncludesSpecialHours(googleUpdated?.diffMask)
                    && reviewedGoogleUpdatedHash === googleReviewCompositeHash
                    && claim.state.reviewedRemoteSpecialHoursReason === 'google_updated_special_hours';
                if (fieldMaskIncludesSpecialHours(googleUpdated?.pendingMask)) {
                    throw new GoogleBusinessProfileError(
                        'Google Business Profile is still processing a special-hours update.',
                        {
                            code: 'GBP_GOOGLE_SPECIAL_HOURS_UPDATE_PENDING',
                            status: 409,
                            retryable: true
                        }
                    );
                }
            }
            const previousManagedDates = claim.state.locationName === config.locationName
                && Array.isArray(claim.state.managedDates)
                ? claim.state.managedDates
                : [];
            const lastAppliedManagedHash = claim.state.lastAppliedManagedSpecialHoursLocationName === config.locationName
                ? normalizeSpecialHoursHash(claim.state.lastAppliedManagedSpecialHoursHash)
                : '';
            const currentRemoteManagedHash = hashSpecialHourPeriods(
                specialHourPeriodsForManagedDates(before, previousManagedDates)
            );
            const remoteConflict = !!lastAppliedManagedHash
                && currentRemoteManagedHash !== lastAppliedManagedHash;
            const initialProductionBaseline = config.validateOnly !== true && !lastAppliedManagedHash;

            if (changeDetected && (remoteConflict || initialProductionBaseline)) {
                const reason = remoteConflict
                    ? 'remote_special_hours_changed'
                    : 'initial_production_baseline';
                const code = remoteConflict
                    ? 'GBP_REMOTE_SPECIAL_HOURS_CONFLICT'
                    : 'GBP_INITIAL_SYNC_REQUIRES_REVIEW';
                const reviewHash = reviewCompositeHash({
                    reason,
                    revision: reviewSourceRevision,
                    expiresAtMs: reviewExpiresAtMs,
                    remotePeriods: before,
                    reviewPeriods: before,
                    proposedPeriods: approvedMerge.proposedSpecialHours,
                    removalDates: approvedMerge.removalDates
                });
                if (!googleReviewCoversCurrentSnapshot
                    && (reviewedRemoteHash !== reviewHash
                        || claim.state.reviewedRemoteSpecialHoursReason !== reason)) {
                    return stopForReview({ reason, code });
                }
            }

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
                if (reviewedRemoteHash || reviewedGoogleUpdatedHash) {
                    const reviewReason = String(claim.state.reviewedRemoteSpecialHoursReason || '');
                    const freshReview = await buildCurrentReviewSnapshot(
                        claim.state,
                        reviewReason,
                        reviewExpiresAtMs,
                        reviewSourceRevision
                    );
                    const expectedReviewHash = reviewReason === 'google_updated_special_hours'
                        ? reviewedGoogleUpdatedHash
                        : reviewedRemoteHash;
                    if (!expectedReviewHash || freshReview.reviewHash !== expectedReviewHash) {
                        return stopForReview({
                            reason: reviewReason || 'remote_special_hours_changed',
                            code: 'GBP_REVIEW_SNAPSHOT_CHANGED'
                        });
                    }
                    desired = freshReview.desired;
                    approvedMerge = {
                        proposedSpecialHours: freshReview.proposedSpecialHours,
                        removalDates: freshReview.removalDates,
                        replacementDates: freshReview.replacementDates
                    };
                    evaluatedRemotePeriods = canonicalizeSpecialHourPeriods(freshReview.remotePeriods);
                    mergedPeriods = freshReview.proposedSpecialHours;
                    after = canonicalizeSpecialHourPeriods(mergedPeriods);
                    desiredHash = hashSpecialHourPeriods(after);
                    changeDetected = hashSpecialHourPeriods(evaluatedRemotePeriods) !== desiredHash;
                }
                if (changeDetected) {
                    const approvedReviewReason = String(
                        claim.state.reviewedRemoteSpecialHoursReason || ''
                    );
                    const approvedReviewHash = approvedReviewReason === 'google_updated_special_hours'
                        ? reviewedGoogleUpdatedHash
                        : reviewedRemoteHash;
                    const evaluatedRemoteHash = hashSpecialHourPeriods(evaluatedRemotePeriods);
                    const validatedManagedHash = hashSpecialHourPeriods(desired.specialHourPeriods);
                    const validatedManagedDates = normalizeDateKeys(desired.managedDates);
                    const validatedRemovalDates = normalizeDateKeys(approvedMerge.removalDates);
                    const validatedReviewExpiresAtMs = reviewExpiresAtMs;
                    const validatedReviewSourceRevision = reviewSourceRevision;
                    async function verifyProductionWrite(causeError = null) {
                        let verifiedLocation;
                        try {
                            verifiedLocation = await client.getLocation();
                        } catch (error) {
                            throw new GoogleBusinessProfileError(
                                'Google Business Profile production update could not be verified.',
                                {
                                    code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED',
                                    status: 409,
                                    retryable: false,
                                    details: {
                                        reviewReason: 'post_write_verification_required',
                                        causeCode: error?.code || causeError?.code || null
                                    }
                                }
                            );
                        }
                        const verifiedPeriods = canonicalizeSpecialHourPeriods(
                            verifiedLocation?.specialHours?.specialHourPeriods || []
                        );
                        if (hashSpecialHourPeriods(verifiedPeriods) !== desiredHash) {
                            throw new GoogleBusinessProfileError(
                                'Google Business Profile accepted the update request but has not returned the requested special hours yet.',
                                {
                                    code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED',
                                    status: 409,
                                    retryable: false,
                                    details: {
                                        reviewReason: 'post_write_verification_required',
                                        causeCode: causeError?.code || null
                                    }
                                }
                            );
                        }
                        let verifiedGoogleUpdated;
                        try {
                            verifiedGoogleUpdated = await client.getGoogleUpdatedLocation();
                        } catch (error) {
                            throw new GoogleBusinessProfileError(
                                'Google Business Profile accepted the update request, but its Google-updated state could not be confirmed.',
                                {
                                    code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED',
                                    status: 409,
                                    retryable: false,
                                    details: {
                                        reviewReason: 'post_write_verification_required',
                                        causeCode: error?.code || causeError?.code || null
                                    }
                                }
                            );
                        }
                        if (fieldMaskIncludesSpecialHours(verifiedGoogleUpdated?.pendingMask)
                            || fieldMaskIncludesSpecialHours(verifiedGoogleUpdated?.diffMask)) {
                            throw new GoogleBusinessProfileError(
                                'Google Business Profile returned pending or different special hours after the update request.',
                                {
                                    code: 'GBP_POST_UPDATE_VERIFICATION_REQUIRED',
                                    status: 409,
                                    retryable: false,
                                    details: {
                                        reviewReason: 'post_write_verification_required',
                                        causeCode: causeError?.code || null
                                    }
                                }
                            );
                        }
                    }

                    let productionWriteArmed = false;
                    let productionWriteVerifiedAfterError = false;
                    try {
                        await client.updateSpecialHours(mergedPeriods, {
                            beforeProductionWrite: async () => {
                            const lastChanceLocation = await client.getLocation();
                            const lastChanceRemotePeriods = canonicalizeSpecialHourPeriods(
                                lastChanceLocation?.specialHours?.specialHourPeriods || []
                            );
                            if (hashSpecialHourPeriods(lastChanceRemotePeriods) !== evaluatedRemoteHash) {
                                throw new GoogleBusinessProfileError(
                                    'Google special hours changed after validation.',
                                    {
                                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                        status: 409,
                                        retryable: false,
                                        details: { reviewReason: 'remote_special_hours_changed' }
                                    }
                                );
                            }

                            let lastChanceGoogleUpdated;
                            try {
                                lastChanceGoogleUpdated = await client.getGoogleUpdatedLocation();
                            } catch (error) {
                                throw new GoogleBusinessProfileError(
                                    'The Google-updated special-hours snapshot could not be confirmed after validation.',
                                    {
                                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                        status: 409,
                                        retryable: false,
                                        details: {
                                            reviewReason: 'google_updated_special_hours',
                                            causeCode: error?.code || null
                                        }
                                    }
                                );
                            }
                            const googleDiffIncludesSpecialHours = fieldMaskIncludesSpecialHours(
                                lastChanceGoogleUpdated?.diffMask
                            );
                            const googlePendingIncludesSpecialHours = fieldMaskIncludesSpecialHours(
                                lastChanceGoogleUpdated?.pendingMask
                            );
                            if (googlePendingIncludesSpecialHours) {
                                throw new GoogleBusinessProfileError(
                                    'Google has a pending special-hours edit after validation.',
                                    {
                                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                        status: 409,
                                        retryable: false,
                                        details: { reviewReason: 'google_updated_special_hours' }
                                    }
                                );
                            }

                            const lastChanceEntries = await loadApprovedCalendarEntries();
                            const lastChanceDesired = buildDesiredSpecialHours(lastChanceEntries, {
                                nowMs: now()
                            });
                            const latestStateSnapshot = await stateRef.get();
                            const latestState = latestStateSnapshot.data() || {};
                            if (!stateMatchesCurrentConfiguration(latestState)
                                || !hasApprovedPendingForCurrentConfiguration(latestState)
                                || latestState.leaseOwner !== syncInstanceId
                                || latestState.leaseToken !== claim.leaseToken
                                || Number(latestState.revision || 0) !== claim.capturedRevision) {
                                throw new GoogleBusinessProfileError(
                                    'The Google Business Profile sync state changed after validation.',
                                    {
                                        code: 'GBP_SYNC_STATE_CHANGED_DURING_VALIDATION',
                                        status: 409,
                                        retryable: true
                                    }
                                );
                            }
                            const lastChanceMerge = buildApprovedMerge(
                                lastChanceRemotePeriods,
                                lastChanceDesired,
                                latestState
                            );
                            if (hashSpecialHourPeriods(lastChanceMerge.proposedSpecialHours) !== desiredHash
                                || hashSpecialHourPeriods(lastChanceDesired.specialHourPeriods)
                                    !== validatedManagedHash
                                || JSON.stringify(normalizeDateKeys(lastChanceDesired.managedDates))
                                    !== JSON.stringify(validatedManagedDates)
                                || JSON.stringify(normalizeDateKeys(lastChanceMerge.removalDates))
                                    !== JSON.stringify(validatedRemovalDates)) {
                                throw new GoogleBusinessProfileError(
                                    'The proposed Google special hours changed after validation.',
                                    {
                                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                        status: 409,
                                        retryable: false,
                                        details: {
                                            reviewReason: approvedReviewReason
                                                || 'remote_special_hours_changed'
                                        }
                                    }
                                );
                            }

                            if (approvedReviewHash) {
                                const reviewPeriods = approvedReviewReason === 'google_updated_special_hours'
                                    ? canonicalizeSpecialHourPeriods(
                                        lastChanceGoogleUpdated?.location?.specialHours?.specialHourPeriods || []
                                    )
                                    : lastChanceRemotePeriods;
                                const lastChanceReviewHash = reviewCompositeHash({
                                    reason: approvedReviewReason,
                                    revision: validatedReviewSourceRevision,
                                    expiresAtMs: validatedReviewExpiresAtMs,
                                    remotePeriods: lastChanceRemotePeriods,
                                    reviewPeriods,
                                    proposedPeriods: lastChanceMerge.proposedSpecialHours,
                                    removalDates: lastChanceMerge.removalDates
                                });
                                if (lastChanceReviewHash !== approvedReviewHash
                                    || (approvedReviewReason === 'google_updated_special_hours'
                                        && !googleDiffIncludesSpecialHours)
                                    || (approvedReviewReason !== 'google_updated_special_hours'
                                        && googleDiffIncludesSpecialHours)) {
                                    throw new GoogleBusinessProfileError(
                                        'The approved Google special-hours review changed after validation.',
                                        {
                                            code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                            status: 409,
                                            retryable: false,
                                            details: {
                                                reviewReason: approvedReviewReason
                                                    || 'remote_special_hours_changed'
                                            }
                                        }
                                    );
                                }
                            } else if (googleDiffIncludesSpecialHours) {
                                throw new GoogleBusinessProfileError(
                                    'Google proposed special hours appeared after validation.',
                                    {
                                        code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                        status: 409,
                                        retryable: false,
                                        details: { reviewReason: 'google_updated_special_hours' }
                                    }
                                );
                            }

                            const renewedUntilMs = await firestore.runTransaction(async (transaction) => {
                                const snapshot = await transaction.get(stateRef);
                                const state = snapshot.data() || {};
                                if (!stateMatchesCurrentConfiguration(state)
                                    || !hasApprovedPendingForCurrentConfiguration(state)
                                    || state.leaseOwner !== syncInstanceId
                                    || state.leaseToken !== claim.leaseToken
                                    || Number(state.revision || 0) !== claim.capturedRevision) {
                                    throw new GoogleBusinessProfileError(
                                        'The Google Business Profile sync state changed immediately before the production write.',
                                        {
                                            code: 'GBP_SYNC_STATE_CHANGED_DURING_VALIDATION',
                                            status: 409,
                                            retryable: true
                                        }
                                    );
                                }
                                const stateReviewHash = approvedReviewReason === 'google_updated_special_hours'
                                    ? currentReviewedHash(state, 'reviewedGoogleUpdatedSpecialHoursHash')
                                    : currentReviewedHash(state, 'reviewedRemoteSpecialHoursHash');
                                if ((approvedReviewHash && stateReviewHash !== approvedReviewHash)
                                    || (!approvedReviewHash && (
                                        currentReviewedHash(state, 'reviewedRemoteSpecialHoursHash')
                                        || currentReviewedHash(state, 'reviewedGoogleUpdatedSpecialHoursHash')
                                    ))
                                    || String(state.reviewedRemoteSpecialHoursReason || '')
                                        !== approvedReviewReason
                                    || Number(state.reviewedRemoteSpecialHoursHashExpiresAtMs || 0)
                                        !== validatedReviewExpiresAtMs
                                    || Number(state.reviewedRemoteSpecialHoursHashSourceRevision || 0)
                                        !== validatedReviewSourceRevision
                                    || JSON.stringify(normalizeDateKeys(approvedRemovalDatesForState(state)))
                                        !== JSON.stringify(validatedRemovalDates)) {
                                    throw new GoogleBusinessProfileError(
                                        'The approved Google special-hours review changed immediately before the production write.',
                                        {
                                            code: 'GBP_REVIEW_SNAPSHOT_CHANGED',
                                            status: 409,
                                            retryable: false,
                                            details: {
                                                reviewReason: approvedReviewReason
                                                    || 'remote_special_hours_changed'
                                            }
                                        }
                                    );
                                }
                                const leaseUntilMs = now() + leaseDurationMs;
                                transaction.set(stateRef, { leaseUntilMs }, { merge: true });
                                return leaseUntilMs;
                            });
                                claim.leaseUntilMs = renewedUntilMs;
                                productionWriteArmed = config.validateOnly !== true;
                            }
                        });
                    } catch (error) {
                        if (!productionWriteArmed) throw error;
                        await verifyProductionWrite(error);
                        productionWriteVerifiedAfterError = true;
                    }

                    if (config.validateOnly !== true && !productionWriteVerifiedAfterError) {
                        await verifyProductionWrite();
                    }
                }
            }

            const outcome = await finalizeSuccess({
                claim,
                managedDates: desired.managedDates,
                changeDetected,
                managedHash: hashSpecialHourPeriods(desired.specialHourPeriods)
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
                managedPeriodCount: desired.specialHourPeriods.length
            });
        } catch (rawError) {
            const error = normalizeError(rawError);
            if (error.code === 'GBP_REVIEW_SNAPSHOT_CHANGED'
                || error.code === 'GBP_POST_UPDATE_VERIFICATION_REQUIRED') {
                return stopForReview({
                    reason: String(error.details?.reviewReason || 'remote_special_hours_changed'),
                    code: error.code
                });
            }
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

    async function requestSync(reason = 'calendar_update', metadata = {}) {
        const queued = await markPending(reason, metadata);
        if (queued.queued !== true) return queued;
        scheduleFlush(0);
        return queued;
    }

    function reviewUnavailableResult(code = 'GBP_REVIEW_NOT_REQUIRED') {
        return {
            status: 'review_unavailable',
            configured: true,
            enabled: true,
            dryRun: config.validateOnly === true,
            reviewRequired: false,
            code
        };
    }

    async function getReviewDetails() {
        if (configurationStatus.status !== 'configured') return configurationStatus;
        if (!stateRef || !client) return unavailableStateStatus();

        const initialSnapshot = await stateRef.get();
        const initialState = initialSnapshot.data() || {};
        if (!stateMatchesCurrentConfiguration(initialState)
            || initialState.status !== 'conflict_requires_review') {
            return reviewUnavailableResult();
        }

        const reason = String(initialState.reviewRequiredReason || 'remote_conflict');
        const capturedRevision = Number(initialState.revision || 0);
        let reviewExpiresAtMs = reviewSnapshotExpiry(initialState);
        if (!reviewExpiresAtMs || reviewExpiresAtMs <= now()) {
            let refreshedExpiry = 0;
            await firestore.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(stateRef);
                const state = snapshot.data() || {};
                if (!stateMatchesCurrentConfiguration(state)
                    || state.status !== 'conflict_requires_review'
                    || Number(state.revision || 0) !== capturedRevision
                    || String(state.reviewRequiredReason || 'remote_conflict') !== reason) return;
                const currentMs = now();
                refreshedExpiry = currentMs + REVIEW_SNAPSHOT_TTL_MS;
                transaction.set(stateRef, {
                    reviewRequiredAtMs: currentMs,
                    reviewRequiredAt: fieldValue.serverTimestamp(),
                    reviewRequiredExpiresAtMs: refreshedExpiry
                }, { merge: true });
            });
            if (!refreshedExpiry) {
                return reviewUnavailableResult('GBP_REVIEW_SNAPSHOT_CHANGED');
            }
            reviewExpiresAtMs = refreshedExpiry;
        }

        let reviewSnapshot;
        try {
            reviewSnapshot = await buildCurrentReviewSnapshot(
                initialState,
                reason,
                reviewExpiresAtMs,
                capturedRevision
            );
        } catch (error) {
            if (error?.code === 'GBP_REVIEW_SNAPSHOT_CHANGED') {
                return reviewUnavailableResult('GBP_REVIEW_SNAPSHOT_CHANGED');
            }
            throw error;
        }

        const finalSnapshot = await stateRef.get();
        const finalState = finalSnapshot.data() || {};
        if (!stateMatchesCurrentConfiguration(finalState)
            || finalState.status !== 'conflict_requires_review'
            || Number(finalState.revision || 0) !== capturedRevision
            || String(finalState.reviewRequiredReason || 'remote_conflict') !== reason
            || reviewSnapshotExpiry(finalState) !== reviewExpiresAtMs
            || reviewExpiresAtMs <= now()) {
            return reviewUnavailableResult('GBP_REVIEW_SNAPSHOT_CHANGED');
        }

        return {
            status: 'review_required',
            configured: true,
            enabled: true,
            dryRun: config.validateOnly === true,
            reviewRequired: true,
            reviewHash: reviewSnapshot.reviewHash,
            reviewExpiresAtMs,
            reason,
            remoteSpecialHours: reviewSnapshot.reviewPeriods,
            proposedSpecialHours: reviewSnapshot.proposedSpecialHours
        };
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
                reviewRequired: status === 'conflict_requires_review' || status === 'approval_required',
                reviewRequiredReason: state.reviewRequiredReason || state.approvalRequiredReason || null,
                reviewExpiresAtMs: status === 'conflict_requires_review'
                    ? (reviewSnapshotExpiry(state) || null)
                    : null,
                revision: Number(state.revision || 0),
                lastAppliedRevision: Number(state.lastAppliedRevision || 0),
                lastAppliedManagedSpecialHoursHash:
                    normalizeSpecialHoursHash(state.lastAppliedManagedSpecialHoursHash) || null,
                lastAppliedManagedSpecialHoursRevision:
                    Number(state.lastAppliedManagedSpecialHoursRevision || 0),
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
                flush().catch((error) => {
                    logger.warn('[google-business-profile] Startup outbox drain failed:', error?.message || error);
                });
            }, STARTUP_SYNC_DELAY_MS);
            startupTimer.unref?.();
        }
        if (!dailyTask) {
            dailyTask = cron.schedule('41 4 * * *', () => {
                flush().catch((error) => {
                    logger.warn('[google-business-profile] Daily outbox drain failed:', error?.message || error);
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
        approveReview,
        flush,
        getApprovalContext,
        getReviewDetails,
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
        GOOGLE_BUSINESS_PROFILE_CONSENT_VERSION,
        calendarEntryHasCurrentGoogleApproval,
        configFingerprint,
        errorForState,
        fieldMaskIncludesSpecialHours,
        getJstStartOfTodayMs,
        normalizeError,
        normalizeOperationId,
        normalizeSpecialHoursHash,
        publicConfigStatus,
        retryDelayMs
    }
};
