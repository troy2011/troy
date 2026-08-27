const crypto = require('crypto');
const JOB_MASTERY = require('../public/js/tarotKingdomJobMastery.shared.js');
const {
    buildTarotKingdomGuardian,
    getMajorNumber
} = require('./tarotKingdomArcanaLoadout');
const { enrichTarotCatalogData } = require('./tarotCards');

const TAROT_KINGDOM_JOB_MASTERY_DATA_KEY = 'TarotKingdomJobMasteryState';
const TAROT_KINGDOM_JOB_MASTERY_STATE_VERSION = JOB_MASTERY.STATE_VERSION;
const TAROT_KINGDOM_JOB_MASTERY_AWARD_HISTORY_LIMIT = 128;
const masteryLocks = new Map();

function normalizeItemId(value) {
    return String(value || '').trim().slice(0, 160);
}

function normalizeAwardId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^h:[a-f0-9]{32}$/i.test(raw)) return raw.toLowerCase();
    return `h:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

function parseState(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch {
        return null;
    }
}

function normalizeTarotKingdomJobMasteryState(value) {
    const parsed = parseState(value);
    const rawRecords = parsed?.records && typeof parsed.records === 'object' ? parsed.records : {};
    const records = {};
    Object.entries(rawRecords).forEach(([rawItemId, rawRecord]) => {
        const itemId = normalizeItemId(rawItemId);
        const number = Math.floor(Number(rawRecord?.number));
        const job = JOB_MASTERY.getJob(number);
        if (!itemId || !job) return;
        const abp = JOB_MASTERY.clampAbp(rawRecord?.abp, job.requiredAbp);
        records[itemId] = {
            itemId,
            number,
            abp,
            requiredAbp: job.requiredAbp,
            masteredAtMs: abp >= job.requiredAbp
                ? Math.max(1, Math.floor(Number(rawRecord?.masteredAtMs) || 1))
                : 0
        };
    });
    const awardHistory = Array.from(new Set(
        (Array.isArray(parsed?.awardHistory) ? parsed.awardHistory : [])
            .map(normalizeAwardId)
            .filter(Boolean)
    )).slice(-TAROT_KINGDOM_JOB_MASTERY_AWARD_HISTORY_LIMIT);
    const selectedInheritedItemId = normalizeItemId(parsed?.selectedInheritedItemId);
    return {
        version: TAROT_KINGDOM_JOB_MASTERY_STATE_VERSION,
        selectedInheritedItemId: records[selectedInheritedItemId]?.masteredAtMs > 0
            ? selectedInheritedItemId
            : null,
        records,
        awardHistory
    };
}

function getMajorArcanaNumber(itemId, catalogCache = {}) {
    const normalizedItemId = normalizeItemId(itemId);
    if (!normalizedItemId) return null;
    const itemData = enrichTarotCatalogData(normalizedItemId, catalogCache?.[normalizedItemId] || {});
    const number = getMajorNumber(normalizedItemId, itemData);
    return JOB_MASTERY.getJob(number) ? number : null;
}

function ensureMasteryRecord(state, itemId, catalogCache = {}) {
    const normalized = normalizeTarotKingdomJobMasteryState(state);
    const normalizedItemId = normalizeItemId(itemId);
    const number = getMajorArcanaNumber(normalizedItemId, catalogCache);
    const job = JOB_MASTERY.getJob(number);
    if (!normalizedItemId || !job) return { state: normalized, record: null };
    const current = normalized.records[normalizedItemId];
    normalized.records[normalizedItemId] = current || {
        itemId: normalizedItemId,
        number,
        abp: 0,
        requiredAbp: job.requiredAbp,
        masteredAtMs: 0
    };
    return { state: normalized, record: normalized.records[normalizedItemId] };
}

function awardTarotKingdomJobAbp(state, options = {}) {
    const awardId = normalizeAwardId(options.awardId);
    const amount = Math.max(0, Math.floor(Number(options.amount) || 0));
    const ensured = ensureMasteryRecord(state, options.itemId, options.catalogCache);
    const normalized = ensured.state;
    const record = ensured.record;
    if (!awardId || !record || amount <= 0) {
        return { state: normalized, awarded: 0, mastered: false, alreadyAwarded: false, record };
    }
    if (normalized.awardHistory.includes(awardId)) {
        return { state: normalized, awarded: 0, mastered: false, alreadyAwarded: true, record };
    }
    normalized.awardHistory.push(awardId);
    normalized.awardHistory = normalized.awardHistory.slice(-TAROT_KINGDOM_JOB_MASTERY_AWARD_HISTORY_LIMIT);
    if (record.masteredAtMs > 0 || record.abp >= record.requiredAbp) {
        return { state: normalized, awarded: 0, mastered: false, alreadyAwarded: false, record };
    }
    const previousAbp = record.abp;
    record.abp = JOB_MASTERY.clampAbp(previousAbp + amount, record.requiredAbp);
    const mastered = previousAbp < record.requiredAbp && record.abp >= record.requiredAbp;
    if (mastered) {
        record.masteredAtMs = Math.max(1, Math.floor(Number(options.nowMs) || Date.now()));
        if (!normalized.selectedInheritedItemId) normalized.selectedInheritedItemId = record.itemId;
    }
    return {
        state: normalized,
        awarded: record.abp - previousAbp,
        mastered,
        alreadyAwarded: false,
        record
    };
}

function selectTarotKingdomInheritedAbility(state, itemId) {
    const normalized = normalizeTarotKingdomJobMasteryState(state);
    const normalizedItemId = normalizeItemId(itemId);
    if (!normalizedItemId) {
        normalized.selectedInheritedItemId = null;
        return { state: normalized, selectedInheritedItemId: null };
    }
    if (!normalized.records[normalizedItemId]?.masteredAtMs) {
        const error = new Error('MASTER済みのジョブ能力だけを引き継げます。');
        error.code = 'NOT_MASTERED';
        throw error;
    }
    normalized.selectedInheritedItemId = normalizedItemId;
    return { state: normalized, selectedInheritedItemId: normalizedItemId };
}

async function readTarotKingdomJobMasteryState(playFabId, deps = {}) {
    if (!playFabId || typeof deps.promisifyPlayFab !== 'function' || !deps.PlayFabServer?.GetUserReadOnlyData) {
        return normalizeTarotKingdomJobMasteryState(null);
    }
    const response = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]
    });
    return normalizeTarotKingdomJobMasteryState(
        response?.Data?.[TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]?.Value
    );
}

async function writeTarotKingdomJobMasteryState(playFabId, state, deps = {}) {
    if (!playFabId || typeof deps.promisifyPlayFab !== 'function' || !deps.PlayFabServer?.UpdateUserReadOnlyData) {
        throw new Error('Tarot Kingdom job mastery storage is unavailable.');
    }
    const normalized = normalizeTarotKingdomJobMasteryState(state);
    await deps.promisifyPlayFab(deps.PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: { [TAROT_KINGDOM_JOB_MASTERY_DATA_KEY]: JSON.stringify(normalized) }
    });
    return normalized;
}

async function withTarotKingdomJobMasteryLock(playFabId, task) {
    const key = String(playFabId || '').trim();
    const previous = masteryLocks.get(key) || Promise.resolve();
    const current = previous.catch(() => null).then(task);
    masteryLocks.set(key, current);
    try {
        return await current;
    } finally {
        if (masteryLocks.get(key) === current) masteryLocks.delete(key);
    }
}

function buildPublicState(state) {
    const normalized = normalizeTarotKingdomJobMasteryState(state);
    return {
        version: normalized.version,
        selectedInheritedItemId: normalized.selectedInheritedItemId,
        jobs: JOB_MASTERY.JOBS.map((job) => {
            const record = Object.values(normalized.records).find((entry) => entry.number === job.number) || null;
            return {
                number: job.number,
                name: job.name,
                requiredAbp: job.requiredAbp,
                itemId: record?.itemId || null,
                abp: record?.abp || 0,
                masteredAtMs: record?.masteredAtMs || 0,
                mastered: Number(record?.masteredAtMs) > 0
            };
        })
    };
}

function buildInheritedGuardian(state, catalogCache = {}, cardLevels = {}) {
    const normalized = normalizeTarotKingdomJobMasteryState(state);
    const itemId = normalized.selectedInheritedItemId;
    if (!itemId || !normalized.records[itemId]?.masteredAtMs) return null;
    return buildTarotKingdomGuardian(itemId, catalogCache, cardLevels);
}

function initializeTarotKingdomJobMasteryRoutes(app, deps = {}) {
    const requireAuthed = async (req, res, playFabId) => {
        if (typeof deps.requireAuthenticatedPlayFabId !== 'function') return playFabId;
        return deps.requireAuthenticatedPlayFabId(req, res, playFabId);
    };
    const sendState = async (req, res) => {
        let playFabId = String(req.body?.playFabId || req.query?.playFabId || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return null;
        try {
            const state = await readTarotKingdomJobMasteryState(playFabId, deps);
            return res.json({ success: true, mastery: buildPublicState(state) });
        } catch (error) {
            console.error('[tarot-job-mastery] read failed:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: 'ジョブ習熟度を取得できませんでした。' });
        }
    };
    app.get('/api/tarot-job-mastery', sendState);
    app.post('/api/tarot-job-mastery', sendState);
    app.post('/api/tarot-job-mastery/select', async (req, res) => {
        let playFabId = String(req.body?.playFabId || '').trim();
        if (!playFabId) return res.status(400).json({ error: 'playFabId is required' });
        playFabId = await requireAuthed(req, res, playFabId);
        if (!playFabId) return;
        try {
            const result = await withTarotKingdomJobMasteryLock(playFabId, async () => {
                const current = await readTarotKingdomJobMasteryState(playFabId, deps);
                const selected = selectTarotKingdomInheritedAbility(current, req.body?.itemId);
                selected.state = await writeTarotKingdomJobMasteryState(playFabId, selected.state, deps);
                return selected;
            });
            return res.json({ success: true, mastery: buildPublicState(result.state) });
        } catch (error) {
            if (error?.code === 'NOT_MASTERED') return res.status(409).json({ error: error.message });
            console.error('[tarot-job-mastery/select] failed:', error?.errorMessage || error?.message || error);
            return res.status(500).json({ error: '引継ぎ能力を変更できませんでした。' });
        }
    });
}

module.exports = {
    JOB_MASTERY,
    TAROT_KINGDOM_JOB_MASTERY_DATA_KEY,
    TAROT_KINGDOM_JOB_MASTERY_STATE_VERSION,
    awardTarotKingdomJobAbp,
    buildInheritedGuardian,
    buildPublicState,
    ensureMasteryRecord,
    initializeTarotKingdomJobMasteryRoutes,
    normalizeTarotKingdomJobMasteryState,
    readTarotKingdomJobMasteryState,
    selectTarotKingdomInheritedAbility,
    withTarotKingdomJobMasteryLock,
    writeTarotKingdomJobMasteryState
};
