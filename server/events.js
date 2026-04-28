const { addGlobalChatMessage } = require('./chat');

const EVENT_COLLECTION = 'store_events';
const VIRTUAL_CURRENCY_CODE = process.env.VIRTUAL_CURRENCY_CODE || 'PS';
const configuredHostFee = Number(process.env.EVENT_HOST_FEE_PS);
const DEFAULT_HOST_FEE = Math.max(0, Math.floor(Number.isFinite(configuredHostFee) ? configuredHostFee : 1000));
const EVENT_TYPES = new Set(['darts', 'billiards', 'karaoke', 'tabletennis', 'poker', 'other']);
const EVENT_TYPE_LABELS = {
    darts: 'ダーツ',
    billiards: 'ビリヤード',
    karaoke: 'カラオケ',
    tabletennis: '卓球',
    poker: 'ポーカー',
    other: 'その他'
};
const DEFAULT_SPONSOR_NOTE = '王国協賛あり';

function normalizeString(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeEventType(value) {
    const key = normalizeString(value, 40).toLowerCase();
    return EVENT_TYPES.has(key) ? key : 'other';
}

function normalizePositiveInt(value, fallback = 0, max = 1_000_000) {
    const num = Math.floor(Number(value) || 0);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return Math.min(num, max);
}

function toMillis(value) {
    const raw = typeof value === 'number' ? value : Date.parse(String(value || ''));
    return Number.isFinite(raw) ? raw : 0;
}

function formatEventDate(ms) {
    const value = Number(ms || 0);
    if (!value) return '日時未定';
    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function getEventTypeLabel(data) {
    return data.typeLabel || EVENT_TYPE_LABELS[data.type] || 'イベント';
}

function announceApprovedEvent(data) {
    const title = normalizeString(data?.title, 80) || 'イベント';
    const typeLabel = getEventTypeLabel(data || {});
    const dateLabel = formatEventDate(data?.startsAtMs);
    const entryFee = Math.max(0, Math.floor(Number(data?.entryFee) || 0));
    const capacity = Math.max(0, Math.floor(Number(data?.capacity) || 0));
    const sponsor = normalizeString(data?.sponsorNote, 120) || DEFAULT_SPONSOR_NOTE;
    const parts = [
        `【イベント告知】${dateLabel} ${typeLabel}「${title}」`,
        entryFee > 0 ? `参加費 ${entryFee}G` : '参加費無料',
        capacity > 0 ? `定員 ${capacity}名` : '',
        sponsor
    ].filter(Boolean);
    addGlobalChatMessage(parts.join(' / '), 'イベント');
}

function eventDocToPayload(doc, viewerId = '', isKing = false) {
    const data = doc.data() || {};
    const participants = Array.isArray(data.participants) ? data.participants : [];
    const participantCount = participants.length;
    const isParticipant = !!viewerId && participants.some((entry) => String(entry?.playFabId || '') === viewerId);
    const canApprove = isKing && data.status === 'pending';
    const canJoin = data.status === 'approved'
        && !!viewerId
        && !isParticipant
        && participantCount < Number(data.capacity || 0);
    return {
        id: doc.id,
        title: data.title || '',
        type: data.type || 'other',
        typeLabel: data.typeLabel || '',
        startsAtMs: Number(data.startsAtMs || 0),
        description: data.description || '',
        hostPlayFabId: data.hostPlayFabId || '',
        hostDisplayName: data.hostDisplayName || data.hostPlayFabId || '',
        status: data.status || 'pending',
        official: data.official === true,
        hostFee: Number(data.hostFee || 0),
        entryFee: Number(data.entryFee || 0),
        prize: Number(data.prize || 0),
        collectedEntryFeePs: Number(data.collectedEntryFeePs || 0),
        sponsorNote: data.sponsorNote || DEFAULT_SPONSOR_NOTE,
        sponsorEnabled: true,
        capacity: Number(data.capacity || 0),
        participantCount,
        isParticipant,
        canJoin,
        canApprove,
        participants: participants.map((entry) => ({
            playFabId: entry.playFabId,
            displayName: entry.displayName || entry.playFabId,
            joinedAtMs: Number(entry.joinedAtMs || 0)
        }))
    };
}

async function getDisplayName(playFabId, deps) {
    if (!playFabId) return '';
    try {
        const profile = await deps.promisifyPlayFab(deps.PlayFabServer.GetPlayerProfile, {
            PlayFabId: playFabId,
            ProfileConstraints: { ShowDisplayName: true }
        });
        return normalizeString(profile?.PlayerProfile?.DisplayName || playFabId, 80);
    } catch {
        return playFabId;
    }
}

async function isKing(playFabId, deps) {
    if (!playFabId) return false;
    try {
        const readOnly = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['IsKing']
        });
        const raw = String(readOnly?.Data?.IsKing?.Value || '').trim().toLowerCase();
        return raw === 'true' || raw === '1' || raw === 'yes';
    } catch {
        return false;
    }
}

function initializeEventRoutes(app, deps) {
    const { firestore, admin, requireAuthenticatedPlayFabId, subtractEconomyItem, getCurrencyBalance } = deps;
    if (!firestore || !admin) {
        console.warn('[events] Firestore deps missing. Event routes disabled.');
        return;
    }

    async function requireAuthed(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') return playFabId;
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    app.post('/api/events/list', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const playFabId = requestedPlayFabId ? await requireAuthed(req, res, requestedPlayFabId) : '';
        if (requestedPlayFabId && !playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            const now = Date.now();
            const snap = await firestore
                .collection(EVENT_COLLECTION)
                .where('startsAtMs', '>=', now - (24 * 60 * 60 * 1000))
                .orderBy('startsAtMs', 'asc')
                .limit(80)
                .get();
            const events = snap.docs
                .map((doc) => eventDocToPayload(doc, playFabId, viewerIsKing))
                .filter((event) => event.status === 'approved' || viewerIsKing || event.hostPlayFabId === playFabId);
            res.json({ success: true, isKing: viewerIsKing, hostFee: DEFAULT_HOST_FEE, events });
        } catch (error) {
            console.error('[events/list] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToLoadEvents' });
        }
    });

    app.post('/api/events/create', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;

        const title = normalizeString(req.body?.title, 80);
        const startsAtMs = toMillis(req.body?.startsAtMs || req.body?.startsAt);
        const capacity = normalizePositiveInt(req.body?.capacity, 8, 64);
        const entryFee = normalizePositiveInt(req.body?.entryFee, 0, 100_000);
        const prize = normalizePositiveInt(req.body?.prize, 0, 1_000_000);
        if (!title) return res.status(400).json({ error: 'タイトルを入力してください。' });
        if (!startsAtMs || startsAtMs < Date.now() - 60_000) return res.status(400).json({ error: '開催日時が正しくありません。' });
        if (capacity <= 0) return res.status(400).json({ error: '定員を入力してください。' });

        try {
            const hostIsKing = await isKing(playFabId, deps);
            const hostFee = hostIsKing ? 0 : DEFAULT_HOST_FEE;
            if (hostFee > 0) {
                await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, hostFee, {
                    idempotencyId: normalizeString(req.body?.requestId, 100) || null
                });
            }
            const hostDisplayName = await getDisplayName(playFabId, deps);
            const ref = firestore.collection(EVENT_COLLECTION).doc();
            const event = {
                title,
                type: normalizeEventType(req.body?.type),
                typeLabel: normalizeString(req.body?.typeLabel, 40),
                startsAtMs,
                description: normalizeString(req.body?.description, 800),
                hostPlayFabId: playFabId,
                hostDisplayName,
                hostFee,
                entryFee,
                prize,
                collectedEntryFeePs: 0,
                sponsorNote: normalizeString(req.body?.sponsorNote, 120) || DEFAULT_SPONSOR_NOTE,
                sponsorEnabled: true,
                capacity,
                official: hostIsKing,
                status: hostIsKing ? 'approved' : 'pending',
                participants: [],
                createdAtMs: Date.now(),
                updatedAtMs: Date.now(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await ref.set(event);
            if (hostIsKing) {
                announceApprovedEvent(event);
                await ref.update({
                    announcedAtMs: Date.now(),
                    updatedAtMs: Date.now(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            const balance = typeof getCurrencyBalance === 'function'
                ? await getCurrencyBalance(playFabId, VIRTUAL_CURRENCY_CODE)
                : null;
            res.json({ success: true, event: eventDocToPayload(await ref.get(), playFabId, hostIsKing), balance });
        } catch (error) {
            if (error?.apiErrorInfo?.apiError === 'InsufficientFunds') {
                return res.status(400).json({ error: 'ゴールドが不足しています。' });
            }
            console.error('[events/create] failed:', error?.errorMessage || error?.message || error);
            res.status(500).json({ error: 'イベント作成に失敗しました。' });
        }
    });

    app.post('/api/events/join', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const eventId = normalizeString(req.body?.eventId, 100);
        if (!requestedPlayFabId || !eventId) return res.status(400).json({ error: 'playFabId and eventId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        const ref = firestore.collection(EVENT_COLLECTION).doc(eventId);
        const joinedAtMs = Date.now();
        let reserved = false;
        let paymentFailed = false;
        const cleanupReservation = async () => {
            if (!reserved) return;
            try {
                await firestore.runTransaction(async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists) return;
                    const data = snap.data() || {};
                    const participants = Array.isArray(data.participants) ? data.participants : [];
                    tx.update(ref, {
                        participants: participants.filter((entry) => String(entry?.playFabId || '') !== playFabId),
                        updatedAtMs: Date.now(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
            } catch (cleanupError) {
                console.warn('[events/join] failed to cleanup unpaid reservation:', cleanupError?.message || cleanupError);
            }
        };
        try {
            let entryFee = 0;
            await firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) throw new Error('EventNotFound');
                const data = snap.data() || {};
                if (data.status !== 'approved') throw new Error('EventNotApproved');
                if (Number(data.startsAtMs || 0) < Date.now()) throw new Error('EventAlreadyStarted');
                const participants = Array.isArray(data.participants) ? data.participants : [];
                if (participants.some((entry) => String(entry?.playFabId || '') === playFabId)) throw new Error('AlreadyJoined');
                if (participants.length >= Number(data.capacity || 0)) throw new Error('EventFull');
                entryFee = Number(data.entryFee || 0) || 0;
                tx.update(ref, {
                    participants: [
                        ...participants,
                        {
                            playFabId,
                            displayName: normalizeString(req.body?.displayName, 80) || playFabId,
                            joinedAtMs
                        }
                    ],
                    updatedAtMs: Date.now(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            reserved = true;
            if (entryFee > 0) {
                try {
                    await subtractEconomyItem(playFabId, VIRTUAL_CURRENCY_CODE, entryFee, {
                        idempotencyId: normalizeString(req.body?.requestId, 100) || null
                    });
                } catch (paymentError) {
                    paymentFailed = true;
                    await cleanupReservation();
                    throw paymentError;
                }
                await ref.update({
                    collectedEntryFeePs: admin.firestore.FieldValue.increment(entryFee),
                    updatedAtMs: Date.now(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            res.json({ success: true, event: eventDocToPayload(await ref.get(), playFabId, await isKing(playFabId, deps)) });
        } catch (error) {
            const message = String(error?.message || error);
            if (message === 'EventNotFound') return res.status(404).json({ error: 'イベントが見つかりません。' });
            if (message === 'EventNotApproved') return res.status(400).json({ error: 'まだ承認されていません。' });
            if (message === 'EventAlreadyStarted') return res.status(400).json({ error: '開始済みです。' });
            if (message === 'AlreadyJoined') return res.status(400).json({ error: '参加済みです。' });
            if (message === 'EventFull') return res.status(400).json({ error: '定員に達しています。' });
            if (paymentFailed || error?.apiErrorInfo?.apiError === 'InsufficientFunds') return res.status(400).json({ error: 'ゴールドが不足しています。' });
            console.error('[events/join] failed:', error?.message || error);
            res.status(500).json({ error: '参加処理に失敗しました。' });
        }
    });

    app.post('/api/events/approve', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const eventId = normalizeString(req.body?.eventId, 100);
        const approve = req.body?.approve !== false;
        if (!requestedPlayFabId || !eventId) return res.status(400).json({ error: 'playFabId and eventId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            if (!viewerIsKing) return res.status(403).json({ error: '王のみ操作できます。' });
            const ref = firestore.collection(EVENT_COLLECTION).doc(eventId);
            const before = await ref.get();
            if (!before.exists) return res.status(404).json({ error: 'イベントが見つかりません。' });
            const previous = before.data() || {};
            const sponsorNote = normalizeString(req.body?.sponsorNote, 120) || previous.sponsorNote || DEFAULT_SPONSOR_NOTE;
            const updatePayload = {
                status: approve ? 'approved' : 'rejected',
                reviewedBy: playFabId,
                reviewedAtMs: Date.now(),
                updatedAtMs: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (approve) {
                updatePayload.sponsorNote = sponsorNote;
                updatePayload.sponsorEnabled = true;
            }
            await ref.update({
                ...updatePayload
            });
            const after = await ref.get();
            const nextData = after.data() || {};
            if (approve && previous.status !== 'approved' && !nextData.announcedAtMs) {
                announceApprovedEvent(nextData);
                await ref.update({
                    announcedAtMs: Date.now(),
                    updatedAtMs: Date.now(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            res.json({ success: true, event: eventDocToPayload(await ref.get(), playFabId, true) });
        } catch (error) {
            console.error('[events/approve] failed:', error?.message || error);
            res.status(500).json({ error: '承認処理に失敗しました。' });
        }
    });
}

module.exports = {
    initializeEventRoutes
};
