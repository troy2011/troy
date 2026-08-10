const crypto = require('node:crypto');

const {
    ARCHETYPES,
    ASSESSMENT_VERSION,
    ASSET_VERSION,
    AXES,
    MOTIFS,
    TOTAL_ROUNDS,
    buildCompatibility,
    catalog,
    deriveAssessment,
    getDestinyProfile,
    getQuestion
} = require('./personalityAssessmentEngine');
const { resolveStoreCustomer } = require('./tarotReading');

const PLAYFAB_DATA_KEY = 'PersonalityDestinyV2';
const TOKEN_AUDIENCE = 'troy-personality-assessment';
const TERMINAL_SESSION_AUDIENCE = 'troy-personality-assessment-terminal';
const TERMINAL_BOOTSTRAP_HEADER = 'x-troy-personality-terminal';
const TERMINAL_SESSION_HEADER = 'x-troy-personality-session';
const TOKEN_TTL_MS = 20 * 60 * 1000;
const TERMINAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 2 * 60 * 1000;
const MAX_TOKEN_LENGTH = 24_000;
const MIN_CLIENT_ELAPSED_MS = 0;
const MAX_CLIENT_ELAPSED_MS = 120_000;
const CLIENT_SERVER_TOLERANCE_MS = 5_000;
const ASSESSMENT_COLLECTION = 'personality_assessments_v2';

class PersonalityAssessmentError extends Error {
    constructor(status, message, code = '') {
        super(message);
        this.name = 'PersonalityAssessmentError';
        this.status = status;
        this.code = code;
    }
}

function isFeatureEnabled(env = process.env) {
    const value = env?.PERSONALITY_ASSESSMENT_ENABLED ?? env?.SPECIAL_ABILITY_ENABLED;
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function getSigningSecret(env = process.env) {
    return String(env?.PERSONALITY_ASSESSMENT_SIGNING_SECRET ?? env?.SPECIAL_ABILITY_SIGNING_SECRET ?? '').trim();
}

function getTerminalToken(env = process.env) {
    return String(env?.PERSONALITY_ASSESSMENT_TERMINAL_TOKEN ?? env?.SPECIAL_ABILITY_TERMINAL_TOKEN ?? '').trim();
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
    if (!secret) throw new Error('PERSONALITY_ASSESSMENT_SIGNING_SECRET is required');
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

function verifyToken(token, secret, nowMs = Date.now()) {
    const value = String(token || '').trim();
    if (!value || value.length > MAX_TOKEN_LENGTH) {
        throw new PersonalityAssessmentError(400, '判定データが正しくありません', 'invalid_token');
    }
    const [encodedPayload, providedSignature, extra] = value.split('.');
    if (!encodedPayload || !providedSignature || extra) {
        throw new PersonalityAssessmentError(400, '判定データが正しくありません', 'invalid_token');
    }
    const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    if (!constantTimeEqual(expectedSignature, providedSignature)) {
        throw new PersonalityAssessmentError(400, '判定データが改ざんされています', 'tampered_token');
    }
    let payload;
    try {
        payload = JSON.parse(decodeBase64Url(encodedPayload));
    } catch (_error) {
        throw new PersonalityAssessmentError(400, '判定データが正しくありません', 'invalid_token');
    }
    if (payload?.aud !== TOKEN_AUDIENCE || payload?.version !== ASSESSMENT_VERSION) {
        throw new PersonalityAssessmentError(400, '判定データの形式が古いか、正しくありません', 'invalid_token');
    }
    if (!Number.isFinite(payload?.expiresAt) || nowMs > payload.expiresAt) {
        throw new PersonalityAssessmentError(410, '判定の有効時間が切れました。最初からやり直してください', 'expired_token');
    }
    if (!payload.assessmentId || !payload.playFabId || !Number.isInteger(payload.roundIndex)) {
        throw new PersonalityAssessmentError(400, '判定データが正しくありません', 'invalid_token');
    }
    return payload;
}

function toEpochMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return Math.max(0, Number(value.toMillis()) || 0);
    if (value instanceof Date) return Math.max(0, value.getTime());
    return Math.max(0, Number(value) || 0);
}

function sanitizeVector(rawValue, keys, min = -1, max = 1) {
    if (!rawValue || typeof rawValue !== 'object') return null;
    const result = Object.fromEntries(keys.map((key) => [key, Number(rawValue[key])]));
    if (Object.values(result).some((value) => !Number.isFinite(value) || value < min || value > max)) return null;
    return result;
}

function parseStoredDestinyValue(rawValue) {
    if (!rawValue) return null;
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (Number(parsed?.version) !== ASSESSMENT_VERSION) return null;
        const animalId = String(parsed?.animalId || '').trim().slice(0, 100);
        const resultHash = String(parsed?.resultHash || '').trim().toLowerCase();
        const axisScores = sanitizeVector(parsed?.axisScores, AXES);
        const motifAffinities = sanitizeVector(parsed?.motifAffinities, MOTIFS, 0, 1);
        const archetypeAffinities = sanitizeVector(parsed?.archetypeAffinities, ARCHETYPES, 0, 1);
        const tempo = Number(parsed?.tempo);
        const destinyProfile = getDestinyProfile({ animalId }, { detail: 'full' });
        if (!destinyProfile
            || !/^[a-f0-9]{64}$/.test(resultHash)
            || !axisScores
            || !motifAffinities
            || !archetypeAffinities
            || !Number.isFinite(tempo)
            || tempo < 0
            || tempo > 1) return null;
        return {
            version: ASSESSMENT_VERSION,
            catalogVersion: String(parsed?.catalogVersion || catalog.catalogVersion || '').trim().slice(0, 80),
            animalId,
            assignedAt: String(parsed?.assignedAt || '').trim().slice(0, 80),
            resultHash,
            axisScores,
            motifAffinities,
            archetypeAffinities,
            tempo,
            destinyProfile,
            publicDestinyProfile: getDestinyProfile({ animalId }, { detail: 'summary' })
        };
    } catch (_error) {
        return null;
    }
}

async function readPlayFabDestiny(playFabId, deps) {
    if (!deps?.promisifyPlayFab || !deps?.PlayFabServer?.GetUserReadOnlyData) {
        throw new Error('PlayFab read-only data is not configured');
    }
    const result = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [PLAYFAB_DATA_KEY]
    });
    return parseStoredDestinyValue(result?.Data?.[PLAYFAB_DATA_KEY]?.Value);
}

function buildStoredPayload(derivation, assignedAt) {
    return {
        version: ASSESSMENT_VERSION,
        catalogVersion: catalog.catalogVersion,
        animalId: derivation.selectedAnimal.id,
        assignedAt,
        resultHash: derivation.resultHash,
        axisScores: derivation.axisScores,
        motifAffinities: derivation.motifAffinities,
        archetypeAffinities: derivation.archetypeAffinities,
        tempo: derivation.tempo
    };
}

async function writePlayFabDestiny(playFabId, derivation, assignedAt, deps) {
    if (!deps?.promisifyPlayFab || !deps?.PlayFabServer?.UpdateUserReadOnlyData) {
        throw new Error('PlayFab read-only data is not configured');
    }
    const payload = buildStoredPayload(derivation, assignedAt);
    await deps.promisifyPlayFab(deps.PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: { [PLAYFAB_DATA_KEY]: JSON.stringify(payload) },
        Permission: 'Private'
    });
    return parseStoredDestinyValue(payload);
}

async function restorePlayFabDestiny(playFabId, storedDestiny, deps) {
    const validated = parseStoredDestinyValue(storedDestiny);
    if (!validated) throw new Error('Confirmed personality result is incomplete');
    const payload = {
        version: ASSESSMENT_VERSION,
        catalogVersion: validated.catalogVersion || catalog.catalogVersion,
        animalId: validated.animalId,
        assignedAt: validated.assignedAt,
        resultHash: validated.resultHash,
        axisScores: validated.axisScores,
        motifAffinities: validated.motifAffinities,
        archetypeAffinities: validated.archetypeAffinities,
        tempo: validated.tempo
    };
    await deps.promisifyPlayFab(deps.PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: { [PLAYFAB_DATA_KEY]: JSON.stringify(payload) },
        Permission: 'Private'
    });
    return parseStoredDestinyValue(payload);
}

function getAssessmentRef(playFabId, deps) {
    return deps.firestore.collection(ASSESSMENT_COLLECTION).doc(playFabId);
}

async function reserveAssessment({ playFabId, assessmentId, derivation, reservationNonce, nowMs, deps }) {
    const assessmentRef = getAssessmentRef(playFabId, deps);
    return deps.firestore.runTransaction(async (transaction) => {
        const assessmentSnap = await transaction.get(assessmentRef);
        const existing = assessmentSnap?.exists ? (assessmentSnap.data?.() || {}) : null;
        if (existing?.status === 'confirmed') {
            return { state: 'confirmed', destiny: parseStoredDestinyValue(existing) };
        }
        if (existing?.status === 'reserved' && nowMs - toEpochMs(existing.reservedAt) <= RESERVATION_TTL_MS) {
            return { state: 'busy' };
        }
        const assignedAt = new Date(nowMs).toISOString();
        const storedPayload = buildStoredPayload(derivation, assignedAt);
        const assessment = {
            ...storedPayload,
            status: 'reserved',
            assessmentId,
            reservationNonce,
            playFabId,
            reservedAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
            audit: {
                medianSeconds: derivation.medianSeconds,
                selectedFit: derivation.selectedFit
            }
        };
        transaction.set(assessmentRef, assessment);
        return { state: 'reserved', assessment };
    });
}

async function confirmAssessment(playFabId, assessmentId, reservationNonce, nowMs, deps) {
    const assessmentRef = getAssessmentRef(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(assessmentRef);
        const data = snapshot?.exists ? (snapshot.data?.() || {}) : null;
        if (!data || data.assessmentId !== assessmentId || data.reservationNonce !== reservationNonce) return;
        transaction.set(assessmentRef, {
            status: 'confirmed',
            confirmedAt: new Date(nowMs),
            updatedAt: new Date(nowMs)
        }, { merge: true });
    });
}

async function releaseReservation(playFabId, assessmentId, reservationNonce, _nowMs, deps) {
    const assessmentRef = getAssessmentRef(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(assessmentRef);
        const data = snapshot?.exists ? (snapshot.data?.() || {}) : null;
        if (!data
            || data.status !== 'reserved'
            || data.assessmentId !== assessmentId
            || data.reservationNonce !== reservationNonce) return;
        transaction.delete(assessmentRef);
    });
}

async function repairConfirmedAssessment(playFabId, storedDestiny, nowMs, deps) {
    if (!storedDestiny || !deps?.firestore) return;
    const assessmentRef = getAssessmentRef(playFabId, deps);
    await deps.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(assessmentRef);
        const existing = snapshot?.exists ? (snapshot.data?.() || {}) : null;
        const consistent = existing?.status === 'confirmed'
            && Number(existing.version) === ASSESSMENT_VERSION
            && String(existing.playFabId || '') === playFabId
            && String(existing.animalId || '') === storedDestiny.animalId
            && String(existing.resultHash || '') === storedDestiny.resultHash;
        if (consistent) return;
        transaction.set(assessmentRef, {
            version: ASSESSMENT_VERSION,
            catalogVersion: storedDestiny.catalogVersion,
            status: 'confirmed',
            playFabId,
            animalId: storedDestiny.animalId,
            assignedAt: storedDestiny.assignedAt || new Date(nowMs).toISOString(),
            resultHash: storedDestiny.resultHash,
            axisScores: storedDestiny.axisScores,
            motifAffinities: storedDestiny.motifAffinities,
            archetypeAffinities: storedDestiny.archetypeAffinities,
            tempo: storedDestiny.tempo,
            confirmedAt: existing?.confirmedAt || new Date(nowMs),
            updatedAt: new Date(nowMs)
        });
    });
}

async function clearStaleReservation(playFabId, nowMs, deps) {
    const assessmentRef = getAssessmentRef(playFabId, deps);
    const snapshot = await assessmentRef.get();
    const data = snapshot?.exists ? (snapshot.data?.() || {}) : null;
    if (!data) return null;
    if (data.status === 'confirmed') return data;
    if (data.status !== 'reserved') return data;
    if (nowMs - toEpochMs(data.reservedAt) <= RESERVATION_TTL_MS) return data;
    await releaseReservation(playFabId, data.assessmentId, data.reservationNonce, nowMs, deps);
    return null;
}

function validateElapsedTime(payload, clientElapsedMs, nowMs) {
    const elapsedMs = Number(clientElapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_CLIENT_ELAPSED_MS || elapsedMs > MAX_CLIENT_ELAPSED_MS) {
        throw new PersonalityAssessmentError(400, '回答時間が正しくありません', 'invalid_elapsed_time');
    }
    const serverElapsedMs = nowMs - Number(payload.questionStartedAt || 0);
    if (!Number.isFinite(serverElapsedMs) || serverElapsedMs < 0 || serverElapsedMs > MAX_CLIENT_ELAPSED_MS) {
        throw new PersonalityAssessmentError(400, '回答時間が正しくありません', 'invalid_elapsed_time');
    }
    const tolerance = Math.max(CLIENT_SERVER_TOLERANCE_MS, serverElapsedMs * 0.5);
    if (Math.abs(serverElapsedMs - elapsedMs) > tolerance) {
        throw new PersonalityAssessmentError(400, '回答時間を確認できませんでした。もう一度やり直してください', 'elapsed_time_mismatch');
    }
    return Math.min(20, Math.max(1, elapsedMs / 1000));
}

function sendError(res, error) {
    if (error instanceof PersonalityAssessmentError) {
        return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    console.error('[personality-assessment] Unexpected error:', error?.errorMessage || error?.message || error);
    return res.status(500).json({ success: false, error: '性格診断を処理できませんでした' });
}

function initializePersonalityAssessmentRoutes(app, deps = {}, options = {}) {
    const env = options.env || process.env;
    const enabled = options.enabled ?? isFeatureEnabled(env);
    const signingSecret = options.signingSecret || getSigningSecret(env);
    const terminalToken = options.terminalToken || getTerminalToken(env);
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    if (enabled && !signingSecret) {
        throw new Error('PERSONALITY_ASSESSMENT_SIGNING_SECRET is required when PERSONALITY_ASSESSMENT_ENABLED=true');
    }
    if (enabled && terminalToken.length < 24) {
        throw new Error('PERSONALITY_ASSESSMENT_TERMINAL_TOKEN with at least 24 characters is required when PERSONALITY_ASSESSMENT_ENABLED=true');
    }
    if (enabled && (!deps?.firestore || !deps?.promisifyPlayFab || !deps?.PlayFabServer)) {
        throw new Error('Firestore and PlayFab are required for personality assessment');
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

    app.get('/api/personality-assessment/config', (req, res) => {
        if (!enabled) return res.json({ success: true, enabled: false });
        const sessionToken = req.get?.(TERMINAL_SESSION_HEADER) || req.headers?.[TERMINAL_SESSION_HEADER] || '';
        const bootstrapToken = req.get?.(TERMINAL_BOOTSTRAP_HEADER) || req.headers?.[TERMINAL_BOOTSTRAP_HEADER] || '';
        const authorized = verifyTerminalSession(sessionToken, signingSecret, now())
            || constantTimeEqual(bootstrapToken, terminalToken);
        if (!authorized) return res.json({ success: true, enabled: false });
        return res.json({
            success: true,
            enabled: true,
            totalRounds: TOTAL_ROUNDS,
            assetVersion: ASSET_VERSION,
            terminalSession: signTerminalSession(signingSecret, now())
        });
    });

    app.post('/api/personality-assessment/status', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const customer = await resolveStoreCustomer(req.body?.customerRef, deps);
            if (!customer.playFabId || customer.error) {
                throw new PersonalityAssessmentError(400, customer.error || 'お客様を選択してください', 'invalid_customer');
            }
            const nowMs = now();
            const destiny = await readPlayFabDestiny(customer.playFabId, deps);
            if (destiny) {
                await repairConfirmedAssessment(customer.playFabId, destiny, nowMs, deps);
                return res.json({ success: true, state: 'completed', destinyProfile: destiny.destinyProfile });
            }
            const pending = await clearStaleReservation(customer.playFabId, nowMs, deps);
            if (pending?.status === 'confirmed') {
                const confirmedDestiny = parseStoredDestinyValue(pending);
                if (!confirmedDestiny) {
                    throw new PersonalityAssessmentError(409, 'このお客様の診断は確定済みですが、結果を読み込めません。管理者へ確認してください', 'confirmed_result_invalid');
                }
                try {
                    await restorePlayFabDestiny(customer.playFabId, confirmedDestiny, deps);
                } catch (restoreError) {
                    console.error('[personality-assessment] PlayFab recovery failed:', restoreError?.errorMessage || restoreError?.message || restoreError);
                }
                return res.json({ success: true, state: 'completed', destinyProfile: confirmedDestiny.destinyProfile });
            }
            return res.json({
                success: true,
                state: pending?.status === 'reserved' ? 'finalizing' : 'available',
                destinyProfile: null
            });
        } catch (error) {
            return sendError(res, error);
        }
    });

    app.post('/api/personality-assessment/start', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const customer = await resolveStoreCustomer(req.body?.customerRef, deps);
            if (!customer.playFabId || customer.error) {
                throw new PersonalityAssessmentError(400, customer.error || 'お客様を選択してください', 'invalid_customer');
            }
            const nowMs = now();
            const existing = await readPlayFabDestiny(customer.playFabId, deps);
            if (existing) {
                await repairConfirmedAssessment(customer.playFabId, existing, nowMs, deps);
                throw new PersonalityAssessmentError(409, 'このお客様はすでに性格診断を完了しています', 'already_completed');
            }
            const pending = await clearStaleReservation(customer.playFabId, nowMs, deps);
            if (pending?.status === 'confirmed') {
                throw new PersonalityAssessmentError(409, 'このお客様はすでに性格診断を完了しています', 'already_completed');
            }
            if (pending?.status === 'reserved') {
                throw new PersonalityAssessmentError(409, '判定結果を保存しています。少し待ってから確認してください', 'finalizing');
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

    app.post('/api/personality-assessment/answer', requireEnabled, requireTerminalSession, async (req, res) => {
        try {
            const nowMs = now();
            const payload = verifyToken(req.body?.token, signingSecret, nowMs);
            if (payload.roundIndex < 0 || payload.roundIndex >= TOTAL_ROUNDS || payload.answers?.length !== payload.roundIndex) {
                throw new PersonalityAssessmentError(400, '問題の順序が正しくありません', 'invalid_round_order');
            }
            const currentQuestion = getQuestion(payload.roundIndex, payload.assessmentId);
            if (!currentQuestion || req.body?.questionId !== currentQuestion.id) {
                throw new PersonalityAssessmentError(400, '問題の順序が正しくありません', 'invalid_round_order');
            }
            if (!currentQuestion.options.some((option) => option.id === req.body?.optionId)) {
                throw new PersonalityAssessmentError(400, '選択肢が正しくありません', 'invalid_option');
            }
            const seconds = validateElapsedTime(payload, req.body?.elapsedMs, nowMs);
            const answers = [
                ...(Array.isArray(payload.answers) ? payload.answers : []),
                { roundId: currentQuestion.id, optionId: req.body.optionId, seconds }
            ];
            const nextRoundIndex = payload.roundIndex + 1;
            if (nextRoundIndex < TOTAL_ROUNDS) {
                return res.json({
                    success: true,
                    state: 'in_progress',
                    token: signToken({ ...payload, roundIndex: nextRoundIndex, answers, questionStartedAt: nowMs }, signingSecret),
                    question: getQuestion(nextRoundIndex, payload.assessmentId)
                });
            }
            const customer = await resolveStoreCustomer(payload.customerRef, deps);
            if (!customer.playFabId || customer.error || customer.playFabId !== payload.playFabId) {
                throw new PersonalityAssessmentError(403, '選択したお客様は現在の店内リストにいません', 'customer_left_store');
            }
            const existing = await readPlayFabDestiny(payload.playFabId, deps);
            if (existing) {
                await repairConfirmedAssessment(payload.playFabId, existing, nowMs, deps);
                return res.json({ success: true, state: 'completed', destinyProfile: existing.destinyProfile });
            }
            const derivation = deriveAssessment(answers);
            const reservationNonce = crypto.randomUUID();
            const reservation = await reserveAssessment({
                playFabId: payload.playFabId,
                assessmentId: payload.assessmentId,
                derivation,
                reservationNonce,
                nowMs,
                deps
            });
            if (reservation.state === 'confirmed' && reservation.destiny) {
                return res.json({ success: true, state: 'completed', destinyProfile: reservation.destiny.destinyProfile });
            }
            if (reservation.state === 'busy') {
                throw new PersonalityAssessmentError(409, '別の確定処理が進行中です。少し待ってから確認してください', 'finalizing');
            }
            let storedDestiny;
            try {
                storedDestiny = await writePlayFabDestiny(
                    payload.playFabId,
                    derivation,
                    reservation.assessment.assignedAt,
                    deps
                );
            } catch (writeError) {
                const reconciled = await readPlayFabDestiny(payload.playFabId, deps).catch(() => null);
                if (reconciled) {
                    await repairConfirmedAssessment(payload.playFabId, reconciled, now(), deps);
                    return res.json({ success: true, state: 'completed', destinyProfile: reconciled.destinyProfile });
                }
                await releaseReservation(payload.playFabId, payload.assessmentId, reservationNonce, now(), deps);
                console.error('[personality-assessment] PlayFab save failed:', writeError?.errorMessage || writeError?.message || writeError);
                throw new PersonalityAssessmentError(502, '判定結果を保存できませんでした。もう一度やり直してください', 'save_failed');
            }
            await confirmAssessment(payload.playFabId, payload.assessmentId, reservationNonce, now(), deps);
            return res.json({ success: true, state: 'completed', destinyProfile: storedDestiny.destinyProfile });
        } catch (error) {
            return sendError(res, error);
        }
    });

    app.post('/api/player-compatibility', async (req, res) => {
        try {
            let playFabId = String(req.body?.playFabId || '').trim();
            const targetPlayFabId = String(req.body?.targetPlayFabId || '').trim();
            if (!playFabId || !targetPlayFabId) {
                return res.status(400).json({ success: false, error: 'プレイヤーIDが不足しています。' });
            }
            if (typeof deps.requireAuthenticatedPlayFabId !== 'function') {
                return res.status(503).json({ success: false, error: '認証を確認できません。' });
            }
            playFabId = await deps.requireAuthenticatedPlayFabId(req, res, playFabId);
            if (!playFabId) return undefined;
            const [leftDestiny, rightDestiny] = await Promise.all([
                readPlayFabDestiny(playFabId, deps),
                readPlayFabDestiny(targetPlayFabId, deps)
            ]);
            if (!leftDestiny || !rightDestiny) {
                return res.json({
                    success: true,
                    available: false,
                    reason: '相性を見るには、二人とも店舗の性格診断を完了している必要があります。'
                });
            }
            const compatibility = buildCompatibility(leftDestiny, rightDestiny);
            if (!compatibility) throw new Error('Compatibility data is incomplete');
            return res.json({ success: true, available: true, compatibility });
        } catch (error) {
            console.error('[player-compatibility] Unexpected error:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ success: false, error: '相性を判定できませんでした。' });
        }
    });

    return { enabled };
}

module.exports = {
    ASSESSMENT_COLLECTION,
    ASSESSMENT_VERSION,
    PLAYFAB_DATA_KEY,
    RESERVATION_TTL_MS,
    TERMINAL_BOOTSTRAP_HEADER,
    TERMINAL_SESSION_HEADER,
    TERMINAL_SESSION_TTL_MS,
    TOKEN_TTL_MS,
    PersonalityAssessmentError,
    buildStoredPayload,
    clearStaleReservation,
    confirmAssessment,
    initializePersonalityAssessmentRoutes,
    isFeatureEnabled,
    parseStoredDestinyValue,
    readPlayFabDestiny,
    releaseReservation,
    repairConfirmedAssessment,
    reserveAssessment,
    restorePlayFabDestiny,
    signTerminalSession,
    signToken,
    validateElapsedTime,
    verifyTerminalSession,
    verifyToken,
    writePlayFabDestiny
};
