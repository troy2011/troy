const { addGlobalChatMessage } = require('./chat');

const EVENT_COLLECTION = 'store_events';
const RESERVATION_COLLECTION = 'store_reservations';
const TROY_CALENDAR_COLLECTION = 'troy_business_calendar';
const VIRTUAL_CURRENCY_CODE = process.env.VIRTUAL_CURRENCY_CODE || 'PS';
const configuredHostFee = Number(process.env.EVENT_HOST_FEE_PS);
const DEFAULT_HOST_FEE = Math.max(0, Math.floor(Number.isFinite(configuredHostFee) ? configuredHostFee : 1000));
const RESERVATION_MAX_ACTIVE_PER_PLAYER = 3;
const RESERVATION_MIN_LEAD_MS = 60 * 60 * 1000;
const RESERVATION_MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const PRIVATE_RESERVATION_MIN_PARTY_SIZE = 10;
const EVENT_TYPES = new Set(['darts', 'billiards', 'karaoke', 'tabletennis', 'poker', 'other']);
const EVENT_TYPE_LABELS = {
    darts: 'ダーツ',
    billiards: 'ビリヤード',
    karaoke: 'カラオケ',
    tabletennis: '卓球',
    poker: 'ポーカー',
    other: 'その他'
};
const RESERVATION_PURPOSES = new Set(['visit', 'darts', 'billiards', 'private', 'consultation', 'other']);
const RESERVATION_PURPOSE_LABELS = {
    visit: '通常来店',
    darts: 'ダーツ',
    billiards: 'ビリヤード',
    private: '貸切',
    consultation: '相談',
    other: 'その他'
};
const TROY_CALENDAR_STATUSES = new Set(['open', 'closed', 'private', 'tentative']);
const NATION_GROUP_BY_NATION = {
    fire: { groupName: 'nation_fire_island' },
    earth: { groupName: 'nation_earth_island' },
    wind: { groupName: 'nation_wind_island' },
    water: { groupName: 'nation_water_island' }
};
const DEFAULT_SPONSOR_NOTE = '王国協賛あり';

function normalizeString(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeEventType(value) {
    const key = normalizeString(value, 40).toLowerCase();
    return EVENT_TYPES.has(key) ? key : 'other';
}

function normalizeReservationPurpose(value) {
    const key = normalizeString(value, 40).toLowerCase();
    return RESERVATION_PURPOSES.has(key) ? key : 'visit';
}

function normalizePositiveInt(value, fallback = 0, max = 1_000_000) {
    const num = Math.floor(Number(value) || 0);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return Math.min(num, max);
}

function normalizeNationKey(value) {
    const key = normalizeString(value, 20).toLowerCase();
    return NATION_GROUP_BY_NATION[key] ? key : '';
}

function normalizeTroyCalendarStatus(value) {
    const key = normalizeString(value, 20).toLowerCase();
    return TROY_CALENDAR_STATUSES.has(key) ? key : 'open';
}

function normalizeTimeText(value, fallback = '19:00') {
    const raw = normalizeString(value, 5);
    if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;
    const [hh, mm] = raw.split(':').map((part) => Number(part));
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
    return raw;
}

function normalizeDateText(value) {
    const raw = normalizeString(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function troyCalendarStartsAtMs(date, openTime) {
    const safeDate = normalizeDateText(date);
    if (!safeDate) return 0;
    const safeTime = normalizeTimeText(openTime);
    return toMillis(`${safeDate}T${safeTime}:00+09:00`);
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

function getReservationPurposeLabel(data) {
    return data.purposeLabel || RESERVATION_PURPOSE_LABELS[data.purpose] || '予約';
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

function reservationDocToPayload(doc, viewerId = '', isKing = false) {
    const data = doc.data() || {};
    const ownerId = String(data.playFabId || '');
    const isOwner = !!viewerId && ownerId === viewerId;
    const status = data.status || 'pending';
    const canReview = isKing && status === 'pending';
    const canCancel = isOwner && ['pending', 'approved'].includes(status) && Number(data.startsAtMs || 0) > Date.now();
    return {
        id: doc.id,
        startsAtMs: Number(data.startsAtMs || 0),
        partySize: Number(data.partySize || 0),
        purpose: data.purpose || 'visit',
        purposeLabel: data.purposeLabel || '',
        status,
        nation: data.nation || '',
        displayName: isOwner || isKing ? (data.displayName || ownerId) : '',
        note: isOwner || isKing ? (data.note || '') : '',
        isOwner,
        canReview,
        canCancel,
        createdAtMs: Number(data.createdAtMs || 0)
    };
}

function troyCalendarDocToPayload(doc) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        nation: data.nation || '',
        date: data.date || '',
        openTime: data.openTime || '',
        closeTime: data.closeTime || '',
        status: data.status || 'open',
        title: data.title || '',
        note: data.note || '',
        startsAtMs: Number(data.startsAtMs || 0),
        updatedAtMs: Number(data.updatedAtMs || 0),
        updatedBy: data.updatedBy || ''
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

async function getLineUserId(playFabId, deps) {
    if (!playFabId) return '';
    try {
        const result = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['lineUserId']
        });
        return result?.Data?.lineUserId?.Value ? String(result.Data.lineUserId.Value) : '';
    } catch {
        return '';
    }
}

async function getNationForPlayer(playFabId, deps) {
    if (!playFabId) return '';
    try {
        const ro = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
            PlayFabId: playFabId,
            Keys: ['Nation']
        });
        return ro?.Data?.Nation?.Value ? String(ro.Data.Nation.Value).trim().toLowerCase() : '';
    } catch {
        return '';
    }
}

async function resolveReservationKingPlayFabId(nation, firestore) {
    const mapping = NATION_GROUP_BY_NATION[String(nation || '').trim().toLowerCase()];
    if (!mapping || !firestore) return '';
    const roomSnap = await firestore.collection('troy_rooms').doc(mapping.groupName).get();
    const roomKingId = String(roomSnap.data()?.updatedBy || '').trim();
    if (roomKingId) return roomKingId;
    const groupSnap = await firestore.collection('nation_groups').doc(mapping.groupName).get();
    return String(groupSnap.data()?.kingPlayFabId || '').trim();
}

async function notifyReservationRequestToKing(reservation, deps) {
    const { firestore, lineClient } = deps;
    if (!firestore || !lineClient) return;
    try {
        const kingPlayFabId = await resolveReservationKingPlayFabId(reservation.nation, firestore);
        if (!kingPlayFabId) return;
        const kingLineUserId = await getLineUserId(kingPlayFabId, deps);
        if (!kingLineUserId) return;
        const message = [
            '【店舗予約申請】',
            `日時: ${formatEventDate(reservation.startsAtMs)}`,
            `人数: ${reservation.partySize}名`,
            `用途: ${getReservationPurposeLabel(reservation)}`,
            `申請者: ${reservation.displayName || reservation.playFabId}`,
            reservation.note ? `メモ: ${reservation.note}` : '',
            'イベントタブで承認/却下してください。'
        ].filter(Boolean).join('\n');
        await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
    } catch (error) {
        console.warn('[reservations/create] Line notify failed:', error?.message || error);
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

    app.post('/api/troy-calendar/list', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const playFabId = requestedPlayFabId ? await requireAuthed(req, res, requestedPlayFabId) : '';
        if (requestedPlayFabId && !playFabId) return;
        try {
            const requestedNation = normalizeNationKey(req.body?.nation || req.body?.troyNation);
            const playerNation = playFabId ? normalizeNationKey(await getNationForPlayer(playFabId, deps)) : '';
            const targetNation = requestedNation || playerNation;
            if (!targetNation) return res.json({ success: true, nation: '', calendar: [] });

            const now = Date.now();
            const snap = await firestore
                .collection(TROY_CALENDAR_COLLECTION)
                .where('nation', '==', targetNation)
                .limit(200)
                .get();
            const calendar = snap.docs
                .map(troyCalendarDocToPayload)
                .filter((entry) => Number(entry.startsAtMs || 0) >= now - (24 * 60 * 60 * 1000))
                .sort((a, b) => Number(a.startsAtMs || 0) - Number(b.startsAtMs || 0))
                .slice(0, 80);
            res.json({
                success: true,
                nation: targetNation,
                calendar
            });
        } catch (error) {
            console.error('[troy-calendar/list] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToLoadTroyCalendar' });
        }
    });

    app.post('/api/troy-calendar/save', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            if (!viewerIsKing) return res.status(403).json({ error: '王のみ操作できます。' });
            const kingNation = normalizeNationKey(await getNationForPlayer(playFabId, deps));
            if (!kingNation) return res.status(400).json({ error: 'NationNotSet' });

            const date = normalizeDateText(req.body?.date);
            const openTime = normalizeTimeText(req.body?.openTime, '19:00');
            const closeTime = normalizeTimeText(req.body?.closeTime, '23:59');
            const startsAtMs = troyCalendarStartsAtMs(date, openTime);
            if (!date || !startsAtMs) return res.status(400).json({ error: '営業日を入力してください。' });

            const calendarId = normalizeString(req.body?.calendarId || req.body?.id, 100);
            const ref = calendarId
                ? firestore.collection(TROY_CALENDAR_COLLECTION).doc(calendarId)
                : firestore.collection(TROY_CALENDAR_COLLECTION).doc();
            if (calendarId) {
                const before = await ref.get();
                if (!before.exists) return res.status(404).json({ error: 'CalendarEntryNotFound' });
                if (normalizeNationKey(before.data()?.nation) !== kingNation) {
                    return res.status(403).json({ error: 'OtherNationCalendarEntry' });
                }
            }

            const payload = {
                nation: kingNation,
                date,
                openTime,
                closeTime,
                status: normalizeTroyCalendarStatus(req.body?.status),
                title: normalizeString(req.body?.title, 80) || 'TROY営業',
                note: normalizeString(req.body?.note, 300),
                startsAtMs,
                updatedBy: playFabId,
                updatedAtMs: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (!calendarId) {
                payload.createdBy = playFabId;
                payload.createdAtMs = Date.now();
                payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
            }
            await ref.set(payload, { merge: true });
            res.json({ success: true, nation: kingNation, entry: troyCalendarDocToPayload(await ref.get()) });
        } catch (error) {
            console.error('[troy-calendar/save] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToSaveTroyCalendar' });
        }
    });

    app.post('/api/troy-calendar/delete', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const calendarId = normalizeString(req.body?.calendarId || req.body?.id, 100);
        if (!requestedPlayFabId || !calendarId) return res.status(400).json({ error: 'playFabId and calendarId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            if (!viewerIsKing) return res.status(403).json({ error: '王のみ操作できます。' });
            const kingNation = normalizeNationKey(await getNationForPlayer(playFabId, deps));
            if (!kingNation) return res.status(400).json({ error: 'NationNotSet' });
            const ref = firestore.collection(TROY_CALENDAR_COLLECTION).doc(calendarId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: 'CalendarEntryNotFound' });
            if (normalizeNationKey(snap.data()?.nation) !== kingNation) {
                return res.status(403).json({ error: 'OtherNationCalendarEntry' });
            }
            await ref.delete();
            res.json({ success: true, deleted: true, calendarId });
        } catch (error) {
            console.error('[troy-calendar/delete] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToDeleteTroyCalendar' });
        }
    });

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

    app.post('/api/reservations/list', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const playFabId = requestedPlayFabId ? await requireAuthed(req, res, requestedPlayFabId) : '';
        if (requestedPlayFabId && !playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            const now = Date.now();
            const snap = await firestore
                .collection(RESERVATION_COLLECTION)
                .where('startsAtMs', '>=', now - (24 * 60 * 60 * 1000))
                .orderBy('startsAtMs', 'asc')
                .limit(80)
                .get();
            const reservations = snap.docs
                .map((doc) => reservationDocToPayload(doc, playFabId, viewerIsKing))
                .filter((reservation) => reservation.status === 'approved' || viewerIsKing || reservation.isOwner);
            res.json({ success: true, isKing: viewerIsKing, reservations });
        } catch (error) {
            console.error('[reservations/list] failed:', error?.message || error);
            res.status(500).json({ error: '予約の取得に失敗しました。' });
        }
    });

    app.post('/api/reservations/create', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;

        const startsAtMs = toMillis(req.body?.startsAtMs || req.body?.startsAt);
        const partySize = normalizePositiveInt(req.body?.partySize, 1, 20);
        const purpose = normalizeReservationPurpose(req.body?.purpose);
        const now = Date.now();
        if (!startsAtMs || startsAtMs < now + RESERVATION_MIN_LEAD_MS) return res.status(400).json({ error: '予約日時は1時間後以降を指定してください。' });
        if (startsAtMs > now + RESERVATION_MAX_AHEAD_MS) return res.status(400).json({ error: '予約は30日先まで申請できます。' });
        if (partySize < 1) return res.status(400).json({ error: '人数を入力してください。' });
        if (purpose === 'private' && partySize < PRIVATE_RESERVATION_MIN_PARTY_SIZE) {
            return res.status(400).json({ error: '貸切予約は10名以上から申請できます。' });
        }

        try {
            const activeSnap = await firestore
                .collection(RESERVATION_COLLECTION)
                .where('playFabId', '==', playFabId)
                .limit(20)
                .get();
            const activeCount = activeSnap.docs
                .map((doc) => doc.data() || {})
                .filter((row) => Number(row.startsAtMs || 0) >= now)
                .filter((row) => ['pending', 'approved'].includes(String(row.status || 'pending')))
                .length;
            if (activeCount >= RESERVATION_MAX_ACTIVE_PER_PLAYER) {
                return res.status(400).json({ error: '未完了の予約は3件までです。' });
            }
            const nation = normalizeString(req.body?.nation, 20).toLowerCase() || await getNationForPlayer(playFabId, deps);
            const displayName = normalizeString(req.body?.displayName, 80) || await getDisplayName(playFabId, deps) || playFabId;
            const reservation = {
                playFabId,
                displayName,
                nation,
                startsAtMs,
                partySize,
                purpose,
                purposeLabel: normalizeString(req.body?.purposeLabel, 40),
                note: normalizeString(req.body?.note, 500),
                status: 'pending',
                createdAtMs: now,
                updatedAtMs: now,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            const ref = firestore.collection(RESERVATION_COLLECTION).doc();
            await ref.set(reservation);
            await notifyReservationRequestToKing(reservation, deps);
            res.json({ success: true, reservation: reservationDocToPayload(await ref.get(), playFabId, await isKing(playFabId, deps)) });
        } catch (error) {
            console.error('[reservations/create] failed:', error?.message || error);
            res.status(500).json({ error: '予約申請に失敗しました。' });
        }
    });

    app.post('/api/reservations/review', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const reservationId = normalizeString(req.body?.reservationId, 100);
        const approve = req.body?.approve !== false;
        if (!requestedPlayFabId || !reservationId) return res.status(400).json({ error: 'playFabId and reservationId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const viewerIsKing = await isKing(playFabId, deps);
            if (!viewerIsKing) return res.status(403).json({ error: '王のみ操作できます。' });
            const ref = firestore.collection(RESERVATION_COLLECTION).doc(reservationId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: '予約が見つかりません。' });
            await ref.update({
                status: approve ? 'approved' : 'rejected',
                reviewedBy: playFabId,
                reviewedAtMs: Date.now(),
                updatedAtMs: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ success: true, reservation: reservationDocToPayload(await ref.get(), playFabId, true) });
        } catch (error) {
            console.error('[reservations/review] failed:', error?.message || error);
            res.status(500).json({ error: '予約の承認処理に失敗しました。' });
        }
    });

    app.post('/api/reservations/cancel', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const reservationId = normalizeString(req.body?.reservationId, 100);
        if (!requestedPlayFabId || !reservationId) return res.status(400).json({ error: 'playFabId and reservationId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const ref = firestore.collection(RESERVATION_COLLECTION).doc(reservationId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ error: '予約が見つかりません。' });
            const data = snap.data() || {};
            if (String(data.playFabId || '') !== playFabId) return res.status(403).json({ error: '自分の予約だけキャンセルできます。' });
            if (!['pending', 'approved'].includes(String(data.status || 'pending'))) return res.status(400).json({ error: 'この予約はキャンセルできません。' });
            await ref.update({
                status: 'cancelled',
                cancelledAtMs: Date.now(),
                updatedAtMs: Date.now(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ success: true, reservation: reservationDocToPayload(await ref.get(), playFabId, await isKing(playFabId, deps)) });
        } catch (error) {
            console.error('[reservations/cancel] failed:', error?.message || error);
            res.status(500).json({ error: '予約キャンセルに失敗しました。' });
        }
    });
}

module.exports = {
    initializeEventRoutes
};
