const crypto = require('crypto');

const {
    ASSESSMENT_VERSION,
    TOTAL_ROUNDS,
    catalog,
    deriveAssessment,
    getPublicAbility,
    getQuestion,
    selectLeastUsedAbility
} = require('./specialAbilityEngine');
const { resolveStoreCustomer } = require('./tarotReading');

const PLAYFAB_DATA_KEY = 'SpecialAbilityJudgmentV3';
const TOKEN_AUDIENCE = 'troy-special-ability';
const TERMINAL_SESSION_AUDIENCE = 'troy-special-ability-terminal';
const TERMINAL_BOOTSTRAP_HEADER = 'x-troy-ability-terminal';
const TERMINAL_SESSION_HEADER = 'x-troy-ability-session';
const TOKEN_TTL_MS = 20 * 60 * 1000;
const TERMINAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 2 * 60 * 1000;
const MAX_TOKEN_LENGTH = 24_000;
const MIN_CLIENT_ELAPSED_MS = 0;
const MAX_CLIENT_ELAPSED_MS = 120_000;
const CLIENT_SERVER_TOLERANCE_MS = 5_000;
const JUDGMENT_COLLECTION = 'special_ability_judgments';
const ASSIGNMENT_STATE_COLLECTION = 'special_ability_state';
const ASSIGNMENT_STATE_DOCUMENT = 'assignment-v3';

class SpecialAbilityError extends Error {
    constructor(status, message, code = '') {
        super(message);
        this.name = 'SpecialAbilityError';
        this.status = status;
        this.code = code;
    }
}

function isFeatureEnabled(env = process.env) {
    return ['1', 'true', 'yes', 'on'].includes(String(env?.SPECIAL_ABILITY_ENABLED || '').trim().toLowerCase());
}

function getSigningSecret(env = process.env) {
    return String(env?.SPECIAL_ABILITY_SIGNING_SECRET || '').trim();
}

function getTerminalToken(env = process.env) {
    return String(env?.SPECIAL_ABILITY_TERMINAL_TOKEN || '').trim();
}

function encodeBase64Url(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signTerminalSession(secret, nowMs = Date.now()) {
    const payload = {
        aud: TERMINAL_SESSION_AUDIENCE,
        issuedAt: nowMs,
        expiresAt: nowMs + TERMINAL_SESSION_TTL_MS,
        nonce: crypto.randomUUID()
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

function verifyTerminalSession(token, secret, nowMs = Date.now()) {
    const value = String(token || '').trim();
    const [encodedPayload, providedSignature, extra] = value.split('.');
    if (!encodedPayload || !providedSignature || extra) return false;
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    if (!constantTimeEqual(expectedSignature, providedSignature)) return false;
    try {
        const payload = JSON.parse(decodeBase64Url(encodedPayload));
        return payload?.aud === TERMINAL_SESSION_AUDIENCE
            && Number.isFinite(payload?.expiresAt)
            && nowMs <= payload.expiresAt;
    } catch (_error) {
        return false;
    }
}

function signToken(payload, secret) {
    if (!secret) throw new Error('SPECIAL_ABILITY_SIGNING_SECRET is required');
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

function verifyToken(token, secret, nowMs = Date.now()) {
    const value = String(token || '').trim();
    if (!value || value.length > MAX_TOKEN_LENGTH) {
        throw new SpecialAbilityError(400, '判定データが正しくありません', 'invalid_token');
    }
    const parts = value.split('.');
    if (parts.length !== 2) throw new SpecialAbilityError(400, '判定データが正しくありません', 'invalid_token');
    const [encodedPayload, providedSignature] = parts;
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        throw new SpecialAbilityError(400, '判定データが改ざんされています', 'tampered_token');
    }

    let payload;
    try {
        payload = JSON.parse(decodeBase64Url(encodedPayload));
    } catch (_error) {
        throw new SpecialAbilityError(400, '判定データが正しくありません', 'invalid_token');
    }
    if (payload?.aud !== TOKEN_AUDIENCE || payload?.version !== ASSESSMENT_VERSION) {
        throw new SpecialAbilityError(400, '判定データの形式が古いか、正しくありません', 'invalid_token');
    }
    if (!Number.isFinite(payload?.expiresAt) || nowMs > payload.expiresAt) {
        throw new SpecialAbilityError(410, '判定の有効時間が切れました。最初からやり直してください', 'expired_token');
    }
    if (!payload.assessmentId || !payload.playFabId || !Number.isInteger(payload.roundIndex)) {
        throw new SpecialAbilityError(400, '判定データが正しくありません', 'invalid_token');
    }
    return payload;
}

function toEpochMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return Math.max(0, Number(value.toMillis()) || 0);
    if (value instanceof Date) return Math.max(0, value.getTime());
    return Math.max(0, Number(value) || 0);
}

function parseStoredAbilityValue(rawValue) {
    if (!rawValue) return null;
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (Number(parsed?.version) !== ASSESSMENT_VERSION) return null;
        const publicAbility = getPublicAbility(parsed);
        if (!publicAbility) return null;
        return {
            version: ASSESSMENT_VERSION,
            abilityId: String(parsed?.abilityId || '').trim().slice(0, 100),
            assignedAt: String(parsed?.assignedAt || '').trim().slice(0, 80),
            ...publicAbility
        };
    } catch (_error) {
        return null;
    }
}

async function readPlayFabAbility(playFabId, deps) {
    if (!deps?.promisifyPlayFab || !deps?.PlayFabServer?.GetUserReadOnlyData) {
        throw new Error('PlayFab read-only data is not configured');
    }
    const result = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [PLAYFAB_DATA_KEY]
    });
    return parseStoredAbilityValue(result?.Data?.[PLAYFAB_DATA_KEY]?.Value);
}

async function writePlayFabAbility(playFabId, ability, assignedAt, deps) {
    if (!deps?.promisifyPlayFab || !deps?.PlayFabServer?.UpdateUserReadOnlyData) {
        throw new Error('PlayFab read-only data is not configured');
    }
    const payload = {
        version: ASSESSMENT_VERSION,
        abilityId: ability.id,
        name: ability.name,
        alias: ability.alias,
        effect: ability.effect,
        rule: ability.rule,
        affinityLabel: ability.affinityLabel,
        assignedAt
    };
    await deps.promisifyPlayFab(deps.PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: { [PLAYFAB_DATA_KEY]: JSON.stringify(payload) },
        Permission: 'Public'
    });
    return parseStoredAbilityValue(payload);
}

function getFirestoreRefs(playFabId, deps) {
    const judgmentRef = deps.firestore.collection(JUDGMENT_COLLECTION).doc(playFabId);
    const stateRef = deps.firestore.collection(ASSIGNMENT_STATE_COLLECTION).doc(ASSIGNMENT_STATE_DOCUMENT);
    return { judgmentRef, stateRef };
}

function decrementCount(counts, abilityId) {
    if (!abilityId) return counts;
    counts[abilityId] = Math.max(0, (Number(counts[abilityId]) || 0) - 1);
    return counts;
}

async function reserveJudgment({ playFabId, assessmentId, derivation, reservationNonce, nowMs, deps }) {
    const { judgmentRef, stateRef } = getFirestoreRefs(playFabId, deps);
    return deps.firestore.runTransaction(async (transaction) => {
        const judgmentSnap = await transaction.get(judgmentRef);
        const existing = judgmentSnap?.exists ? (judgmentSnap.data?.() || {}) : null;
        if (existing?.status === 'confirmed') {
            return { state: 'confirmed', ability: parseStoredAbilityValue(existing) };
        }
        if (existing?.status === 'reserved' && nowMs - toEpochMs(existing.reservedAt) <= RESERVATION_TTL_MS) {
            return { state: 'busy' };
        }

        const stateSnap = await transaction.get(stateRef);
        const stateData = stateSnap?.exists ? (stateSnap.data?.() || {}) : {};
        const counts = { ...(stateData.counts || {}) };
        if (existing?.status === 'reserved') decrementCount(counts, String(existing.abilityId || ''));

        const selectedAbility = selectLeastUsedAbility(derivation.candidates, counts, assessmentId);
        counts[selectedAbility.id] = Math.max(0, Number(counts[selectedAbility.id]) || 0) + 1;
        const assignedAt = new Date(nowMs).toISOString();
        const judgment = {
            version: ASSESSMENT_VERSION,
            catalogVersion: String(catalog.version || ''),
            status: 'reserved',
            assessmentId,
            reservationNonce,
            playFabId,
            abilityId: selectedAbility.id,
            name: selectedAbility.name,
            alias: selectedAbility.alias,
            effect: selectedAbility.effect,
            rule: selectedAbility.rule,
            affinity: selectedAbility.affinity,
            affinityLabel: selectedAbility.affinityLabel,
            assignedAt,
            reservedAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
            internal: {
                type: derivation.type,
                affinity: derivation.affinity,
                tempo: derivation.tempo,
                medianSeconds: derivation.medianSeconds,
                scores: derivation.scores
            }
        };
        transaction.set(stateRef, {
            version: ASSESSMENT_VERSION,
            catalogVersion: String(catalog.version || ''),
            counts,
            updatedAt: new Date(nowMs)
        }, { merge: true });
        transaction.set(judgmentRef, judgment);
        return { state: 'reserved', ability: selectedAbility, judgment };
    });
}

async function confirmJudgment(playFabId, assessmentId, reservationNonce, nowMs, deps) {
    const { judgmentRef } = getFirestoreRefs(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(judgmentRef);
        const data = snap?.exists ? (snap.data?.() || {}) : null;
        if (!data || data.assessmentId !== assessmentId || data.reservationNonce !== reservationNonce) return;
        transaction.set(judgmentRef, {
            status: 'confirmed',
            confirmedAt: new Date(nowMs),
            updatedAt: new Date(nowMs)
        }, { merge: true });
    });
}

async function releaseReservation(playFabId, assessmentId, reservationNonce, nowMs, deps) {
    const { judgmentRef, stateRef } = getFirestoreRefs(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const judgmentSnap = await transaction.get(judgmentRef);
        const judgment = judgmentSnap?.exists ? (judgmentSnap.data?.() || {}) : null;
        if (!judgment
            || judgment.status !== 'reserved'
            || judgment.assessmentId !== assessmentId
            || judgment.reservationNonce !== reservationNonce) return;
        const stateSnap = await transaction.get(stateRef);
        const stateData = stateSnap?.exists ? (stateSnap.data?.() || {}) : {};
        const counts = decrementCount({ ...(stateData.counts || {}) }, String(judgment.abilityId || ''));
        transaction.set(stateRef, { counts, updatedAt: new Date(nowMs) }, { merge: true });
        transaction.delete(judgmentRef);
    });
}

async function repairConfirmedJudgment(playFabId, storedAbility, nowMs, deps) {
    if (!storedAbility || !deps?.firestore) return;
    const { judgmentRef, stateRef } = getFirestoreRefs(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const judgmentSnap = await transaction.get(judgmentRef);
        const existing = judgmentSnap?.exists ? (judgmentSnap.data?.() || {}) : null;
        const abilityId = String(storedAbility.abilityId || existing?.abilityId || '').trim();
        const isAlreadyConsistent = existing?.status === 'confirmed'
            && Number(existing.version) === ASSESSMENT_VERSION
            && String(existing.playFabId || '') === playFabId
            && String(existing.abilityId || '') === abilityId
            && String(existing.name || '') === storedAbility.name
            && String(existing.alias || '') === storedAbility.alias
            && String(existing.effect || '') === storedAbility.effect
            && String(existing.rule || '') === storedAbility.rule
            && String(existing.affinityLabel || '') === storedAbility.affinity;
        if (isAlreadyConsistent) return false;

        const stateSnap = await transaction.get(stateRef);
        const stateData = stateSnap?.exists ? (stateSnap.data?.() || {}) : {};
        const counts = { ...(stateData.counts || {}) };
        let countsChanged = false;
        if (!existing && abilityId) {
            counts[abilityId] = Math.max(0, Number(counts[abilityId]) || 0) + 1;
            countsChanged = true;
        } else if (existing?.abilityId && existing.abilityId !== abilityId) {
            decrementCount(counts, String(existing.abilityId || ''));
            if (abilityId) counts[abilityId] = Math.max(0, Number(counts[abilityId]) || 0) + 1;
            countsChanged = true;
        }
        if (countsChanged) transaction.set(stateRef, { counts, updatedAt: new Date(nowMs) }, { merge: true });
        transaction.set(judgmentRef, {
            ...(existing || {}),
            version: ASSESSMENT_VERSION,
            status: 'confirmed',
            playFabId,
            abilityId,
            name: storedAbility.name,
            alias: storedAbility.alias,
            effect: storedAbility.effect,
            rule: storedAbility.rule,
            affinityLabel: storedAbility.affinity,
            assignedAt: storedAbility.assignedAt || existing?.assignedAt || new Date(nowMs).toISOString(),
            confirmedAt: existing?.confirmedAt || new Date(nowMs),
            updatedAt: new Date(nowMs)
        });
        return true;
    });
}

async function clearStaleReservation(playFabId, nowMs, deps) {
    const { judgmentRef, stateRef } = getFirestoreRefs(playFabId, deps);
    const snap = await judgmentRef.get();
    const data = snap?.exists ? (snap.data?.() || {}) : null;
    if (!data) return null;
    if (data.status === 'confirmed') {
        await deps.firestore.runTransaction(async (transaction) => {
            const judgmentSnap = await transaction.get(judgmentRef);
            const judgment = judgmentSnap?.exists ? (judgmentSnap.data?.() || {}) : null;
            if (!judgment || judgment.status !== 'confirmed') return;
            const stateSnap = await transaction.get(stateRef);
            const stateData = stateSnap?.exists ? (stateSnap.data?.() || {}) : {};
            const counts = decrementCount({ ...(stateData.counts || {}) }, String(judgment.abilityId || ''));
            transaction.set(stateRef, { counts, updatedAt: new Date(nowMs) }, { merge: true });
            transaction.delete(judgmentRef);
        });
        return null;
    }
    if (data.status !== 'reserved') return data;
    if (nowMs - toEpochMs(data.reservedAt) <= RESERVATION_TTL_MS) return data;
    await releaseReservation(playFabId, data.assessmentId, data.reservationNonce, nowMs, deps);
    return null;
}

function validateElapsedTime(payload, clientElapsedMs, nowMs) {
    const elapsedMs = Number(clientElapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_CLIENT_ELAPSED_MS || elapsedMs > MAX_CLIENT_ELAPSED_MS) {
        throw new SpecialAbilityError(400, '回答時間が正しくありません', 'invalid_elapsed_time');
    }
    const serverElapsedMs = nowMs - Number(payload.questionStartedAt || 0);
    if (!Number.isFinite(serverElapsedMs) || serverElapsedMs < 0 || serverElapsedMs > MAX_CLIENT_ELAPSED_MS) {
        throw new SpecialAbilityError(400, '回答時間が正しくありません', 'invalid_elapsed_time');
    }
    const tolerance = Math.max(CLIENT_SERVER_TOLERANCE_MS, serverElapsedMs * 0.5);
    if (Math.abs(serverElapsedMs - elapsedMs) > tolerance) {
        throw new SpecialAbilityError(400, '回答時間を確認できませんでした。もう一度やり直してください', 'elapsed_time_mismatch');
    }
    return Math.min(20, Math.max(1, elapsedMs / 1000));
}

function sendError(res, error) {
    if (error instanceof SpecialAbilityError) {
        return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    console.error('[special-ability] Unexpected error:', error?.errorMessage || error?.message || error);
    return res.status(500).json({ success: false, error: '特殊能力判定を処理できませんでした' });
}

function initializeSpecialAbilityRoutes(app, deps = {}, options = {}) {
    const env = options.env || process.env;
    const enabled = options.enabled ?? isFeatureEnabled(env);
    const signingSecret = options.signingSecret || getSigningSecret(env);
    const terminalToken = options.terminalToken || getTerminalToken(env);
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    if (enabled && !signingSecret) {
        throw new Error('SPECIAL_ABILITY_SIGNING_SECRET is required when SPECIAL_ABILITY_ENABLED=true');
    }
    if (enabled && terminalToken.length < 24) {
        throw new Error('SPECIAL_ABILITY_TERMINAL_TOKEN with at least 24 characters is required when SPECIAL_ABILITY_ENABLED=true');
    }
    if (enabled && (!deps?.firestore || !deps?.promisifyPlayFab || !deps?.PlayFabServer)) {
        throw new Error('Firestore and PlayFab are required for special ability assessment');
    }

    function requireEnabled(_req, res, next) {
        if (!enabled) return res.status(404).json({ success: false, enabled: false, error: 'Not found' });
        return next();
    }

    function requireTerminalSession(req, res, next) {
        const token = req.get?.(TERMINAL_SESSION_HEADER) || req.headers?.[TERMINAL_SESSION_HEADER] || '';
        if (!verifyTerminalSession(token, signingSecret, now())) {
            return res.status(403).json({
                success: false,
                error: 'この操作は登録された店舗端末からのみ実行できます',
                code: 'terminal_authorization_required'
            });
        }
        return next();
    }

    app.get('/api/special-ability/config', (req, res) => {
        if (!enabled) {
            return res.json({ success: true, enabled: false, totalRounds: undefined, assetVersion: undefined });
        }
        const sessionToken = req.get?.(TERMINAL_SESSION_HEADER) || req.headers?.[TERMINAL_SESSION_HEADER] || '';
        const bootstrapToken = req.get?.(TERMINAL_BOOTSTRAP_HEADER) || req.headers?.[TERMINAL_BOOTSTRAP_HEADER] || '';
        const authorized = verifyTerminalSession(sessionToken, signingSecret, now())
            || constantTimeEqual(bootstrapToken, terminalToken);
        if (!authorized) return res.json({ success: true, enabled: false });
        return res.json({
            success: true,
            enabled,
            totalRounds: TOTAL_ROUNDS,
            assetVersion: ASSESSMENT_VERSION,
            terminalSession: signTerminalSession(signingSecret, now())
        });
    });

    app.post('/api/special-ability/status', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const customer = await resolveStoreCustomer(req.body?.customerRef, deps);
            if (!customer.playFabId || customer.error) throw new SpecialAbilityError(400, customer.error || 'お客様を選択してください', 'invalid_customer');
            const nowMs = now();
            const ability = await readPlayFabAbility(customer.playFabId, deps);
            if (ability) {
                await repairConfirmedJudgment(customer.playFabId, ability, nowMs, deps);
                return res.json({ success: true, state: 'completed', ability: getPublicAbility(ability) });
            }
            const pending = await clearStaleReservation(customer.playFabId, nowMs, deps);
            return res.json({
                success: true,
                state: pending?.status === 'reserved' ? 'finalizing' : 'available',
                ability: null
            });
        } catch (error) {
            return sendError(res, error);
        }
    });

    app.post('/api/special-ability/start', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const customer = await resolveStoreCustomer(req.body?.customerRef, deps);
            if (!customer.playFabId || customer.error) throw new SpecialAbilityError(400, customer.error || 'お客様を選択してください', 'invalid_customer');
            const nowMs = now();
            const existingAbility = await readPlayFabAbility(customer.playFabId, deps);
            if (existingAbility) {
                await repairConfirmedJudgment(customer.playFabId, existingAbility, nowMs, deps);
                throw new SpecialAbilityError(409, 'このお客様はすでに特殊能力判定を完了しています', 'already_completed');
            }
            const pending = await clearStaleReservation(customer.playFabId, nowMs, deps);
            if (pending?.status === 'reserved') {
                throw new SpecialAbilityError(409, '判定結果を保存しています。少し待ってから確認してください', 'finalizing');
            }

            const assessmentId = crypto.randomUUID();
            const payload = {
                aud: TOKEN_AUDIENCE,
                version: ASSESSMENT_VERSION,
                assessmentId,
                playFabId: customer.playFabId,
                customerRef: `TROY:${customer.playFabId}`,
                roundIndex: 0,
                answers: [],
                issuedAt: nowMs,
                expiresAt: nowMs + TOKEN_TTL_MS,
                questionStartedAt: nowMs
            };
            return res.json({
                success: true,
                state: 'in_progress',
                token: signToken(payload, signingSecret),
                question: getQuestion(0, assessmentId)
            });
        } catch (error) {
            return sendError(res, error);
        }
    });

    app.post('/api/special-ability/answer', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const nowMs = now();
            const payload = verifyToken(req.body?.token, signingSecret, nowMs);
            if (payload.roundIndex < 0 || payload.roundIndex >= TOTAL_ROUNDS || payload.answers?.length !== payload.roundIndex) {
                throw new SpecialAbilityError(400, '問題の順序が正しくありません', 'invalid_round_order');
            }
            const currentQuestion = getQuestion(payload.roundIndex, payload.assessmentId);
            if (!currentQuestion || req.body?.questionId !== currentQuestion.id) {
                throw new SpecialAbilityError(400, '問題の順序が正しくありません', 'invalid_round_order');
            }
            if (!currentQuestion.options.some((option) => option.id === req.body?.optionId)) {
                throw new SpecialAbilityError(400, '選択肢が正しくありません', 'invalid_option');
            }
            const seconds = validateElapsedTime(payload, req.body?.elapsedMs, nowMs);
            const answers = [
                ...(Array.isArray(payload.answers) ? payload.answers : []),
                { roundId: currentQuestion.id, optionId: req.body.optionId, seconds }
            ];
            const nextRoundIndex = payload.roundIndex + 1;
            if (nextRoundIndex < TOTAL_ROUNDS) {
                const nextPayload = {
                    ...payload,
                    roundIndex: nextRoundIndex,
                    answers,
                    questionStartedAt: nowMs
                };
                return res.json({
                    success: true,
                    state: 'in_progress',
                    token: signToken(nextPayload, signingSecret),
                    question: getQuestion(nextRoundIndex, payload.assessmentId)
                });
            }

            const customer = await resolveStoreCustomer(payload.customerRef, deps);
            if (!customer.playFabId || customer.error || customer.playFabId !== payload.playFabId) {
                throw new SpecialAbilityError(403, '選択したお客様は現在の店内リストにいません', 'customer_left_store');
            }

            const existingAbility = await readPlayFabAbility(payload.playFabId, deps);
            if (existingAbility) {
                await repairConfirmedJudgment(payload.playFabId, existingAbility, nowMs, deps);
                return res.json({ success: true, state: 'completed', ability: getPublicAbility(existingAbility) });
            }

            const derivation = deriveAssessment(answers, payload.assessmentId);
            const reservationNonce = crypto.randomUUID();
            const reservation = await reserveJudgment({
                playFabId: payload.playFabId,
                assessmentId: payload.assessmentId,
                derivation,
                reservationNonce,
                nowMs,
                deps
            });
            if (reservation.state === 'confirmed' && reservation.ability) {
                return res.json({ success: true, state: 'completed', ability: getPublicAbility(reservation.ability) });
            }
            if (reservation.state === 'busy') {
                throw new SpecialAbilityError(409, '別の確定処理が進行中です。少し待ってから確認してください', 'finalizing');
            }

            let storedAbility;
            try {
                storedAbility = await writePlayFabAbility(
                    payload.playFabId,
                    reservation.ability,
                    reservation.judgment.assignedAt,
                    deps
                );
            } catch (writeError) {
                const reconciledAbility = await readPlayFabAbility(payload.playFabId, deps).catch(() => null);
                if (reconciledAbility) {
                    await repairConfirmedJudgment(payload.playFabId, reconciledAbility, now(), deps);
                    return res.json({ success: true, state: 'completed', ability: getPublicAbility(reconciledAbility) });
                }
                await releaseReservation(payload.playFabId, payload.assessmentId, reservationNonce, now(), deps);
                console.error('[special-ability] PlayFab save failed:', writeError?.errorMessage || writeError?.message || writeError);
                throw new SpecialAbilityError(502, '判定結果を保存できませんでした。もう一度やり直してください', 'save_failed');
            }
            await confirmJudgment(payload.playFabId, payload.assessmentId, reservationNonce, now(), deps);
            return res.json({ success: true, state: 'completed', ability: getPublicAbility(storedAbility) });
        } catch (error) {
            return sendError(res, error);
        }
    });

    return { enabled };
}

module.exports = {
    ASSIGNMENT_STATE_DOCUMENT,
    ASSESSMENT_VERSION,
    PLAYFAB_DATA_KEY,
    RESERVATION_TTL_MS,
    TERMINAL_BOOTSTRAP_HEADER,
    TERMINAL_SESSION_HEADER,
    TERMINAL_SESSION_TTL_MS,
    TOKEN_TTL_MS,
    SpecialAbilityError,
    clearStaleReservation,
    confirmJudgment,
    initializeSpecialAbilityRoutes,
    isFeatureEnabled,
    parseStoredAbilityValue,
    readPlayFabAbility,
    releaseReservation,
    repairConfirmedJudgment,
    reserveJudgment,
    signToken,
    signTerminalSession,
    validateElapsedTime,
    verifyToken,
    verifyTerminalSession,
    writePlayFabAbility
};
