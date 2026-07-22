const { addGlobalChatMessage } = require('./chat');
const { createTroyCalendarGoogleSync } = require('./troyCalendarGoogleSync');
const { normalizeLocationName } = require('./googleBusinessProfile');
const { createHash } = require('node:crypto');

const cron = require('node-cron');

const EVENT_COLLECTION = 'store_events';
const RESERVATION_COLLECTION = 'store_reservations';
const TROY_CALENDAR_COLLECTION = 'troy_business_calendar';
const TROY_CALENDAR_GLOBAL_NATION = 'global';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const STORE_SCHEDULE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TROY_CALENDAR_AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const TROY_CALENDAR_AUDIT_COLLECTION = 'troy_business_calendar_audit';
const TROY_CALENDAR_DATE_INDEX_COLLECTION = 'troy_business_calendar_dates';
const TROY_CALENDAR_CONTROL_COLLECTION = 'integration_states';
const TROY_CALENDAR_CONTROL_DOCUMENT = 'troy_business_calendar_write_control';
const TROY_CALENDAR_GOOGLE_SYNC_DOCUMENT = 'troy_google_business_profile_special_hours';
const TROY_CALENDAR_MAX_VISIBLE_ENTRIES = 80;
const TROY_CALENDAR_MAX_FUTURE_DAYS = 366;
const TROY_CALENDAR_MUTATION_WINDOW_MS = 10 * 60 * 1000;
const TROY_CALENDAR_MAX_MUTATIONS_PER_WINDOW = 20;
const GBP_CONSENT_VERSION = 'gbp-special-hours-v1';
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
let storeScheduleCleanupStarted = false;

function normalizeString(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function getJstStartOfTodayMs(nowMs = Date.now()) {
    const jst = new Date(Number(nowMs || Date.now()) + JST_OFFSET_MS);
    return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS;
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

function isEditableTroyCalendarNation(value, kingNation) {
    const raw = normalizeString(value, 20).toLowerCase();
    return raw === TROY_CALENDAR_GLOBAL_NATION || (!!kingNation && raw === kingNation);
}

function normalizeStrictTroyCalendarStatus(value) {
    const key = normalizeString(value, 20).toLowerCase();
    return TROY_CALENDAR_STATUSES.has(key) ? key : '';
}

function normalizeTimeText(value, fallback = '19:00') {
    const raw = normalizeString(value, 5);
    if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;
    const [hh, mm] = raw.split(':').map((part) => Number(part));
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
    return raw;
}

function normalizeStrictTimeText(value) {
    const raw = normalizeString(value, 5);
    if (!/^\d{2}:\d{2}$/.test(raw)) return '';
    const [hours, minutes] = raw.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return '';
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? raw : '';
}

function normalizeDateText(value) {
    const raw = normalizeString(value, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return '';
    const daysInMonth = [
        31,
        year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    return day <= daysInMonth[month - 1] ? raw : '';
}

function normalizeCalendarRequestId(value) {
    const raw = String(value || '').trim();
    return /^[A-Za-z0-9_-]{8,92}$/.test(raw) ? raw : '';
}

function normalizeCalendarDocumentId(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 200 || raw.includes('/') || /[\u0000-\u001f\u007f]/.test(raw)) return '';
    return raw;
}

function parseGoogleBusinessProfileStaffIds(value) {
    return new Set(
        String(value || '')
            .split(/[\s,;]+/)
            .map((id) => id.trim())
            .filter((id) => /^[A-Za-z0-9_-]{3,64}$/.test(id))
    );
}

function normalizeGoogleBusinessProfileConsent(body) {
    const operationId = normalizeCalendarRequestId(body?.operationId);
    const consentVersion = normalizeString(body?.consentVersion, 64);
    if (body?.googleBusinessProfileConsent !== true
        || consentVersion !== GBP_CONSENT_VERSION
        || !operationId) {
        return null;
    }
    return { operationId, consentVersion };
}

function hasGoogleBusinessProfileConsentSignal(body) {
    return body?.googleBusinessProfileConsent === true
        || body?.consentVersion !== undefined
        || body?.operationId !== undefined;
}

function normalizeGoogleBusinessProfileSpecialHoursHash(value) {
    const hash = String(value || '').trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function hasValidGoogleOpenHours(openTime, closeTime) {
    const [openHours, openMinutes] = openTime.split(':').map(Number);
    const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
    const openTotal = (openHours * 60) + openMinutes;
    const closeTotal = (closeHours * 60) + closeMinutes;
    if (closeTotal > openTotal) return true;
    const durationMinutes = (24 * 60 - openTotal) + closeTotal;
    return closeTotal < 12 * 60 && durationMinutes < 24 * 60;
}

function calendarPayloadMatches(existing, candidate) {
    const fields = [
        'nation',
        'date',
        'openTime',
        'closeTime',
        'status',
        'title',
        'note',
        'googleBusinessProfileConsent',
        'googleBusinessProfileOperationId',
        'googleBusinessProfileConsentVersion',
        'googleBusinessProfileLocationName',
        'googleBusinessProfileAuthorization',
        'googleBusinessProfileConfigGeneration',
        'googleBusinessProfileConfigFingerprint'
    ];
    return fields.every((field) => String(existing?.[field] ?? '') === String(candidate?.[field] ?? ''));
}

function calendarAuditSnapshot(data) {
    if (!data) return null;
    return {
        nation: String(data.nation || ''),
        date: String(data.date || ''),
        openTime: String(data.openTime || ''),
        closeTime: String(data.closeTime || ''),
        status: String(data.status || ''),
        title: String(data.title || ''),
        note: String(data.note || '')
    };
}

function nextTroyCalendarMutationWindows(controlData, playFabId, nowMs = Date.now()) {
    const key = createHash('sha256').update(String(playFabId || '')).digest('hex').slice(0, 32);
    const cutoffMs = nowMs - TROY_CALENDAR_MUTATION_WINDOW_MS;
    const source = controlData?.mutationWindows && typeof controlData.mutationWindows === 'object'
        ? controlData.mutationWindows
        : {};
    const mutationWindows = {};
    for (const [storedKey, timestamps] of Object.entries(source)) {
        const recentTimestamps = (Array.isArray(timestamps) ? timestamps : [])
            .map(Number)
            .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= cutoffMs);
        if (recentTimestamps.length > 0) mutationWindows[storedKey] = recentTimestamps;
    }
    const recent = mutationWindows[key] || [];
    if (recent.length >= TROY_CALENDAR_MAX_MUTATIONS_PER_WINDOW) {
        return { allowed: false, mutationWindows };
    }
    recent.push(nowMs);
    mutationWindows[key] = recent;
    return { allowed: true, mutationWindows };
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
            '王タブのカレンダーで承認/却下してください。'
        ].filter(Boolean).join('\n');
        await lineClient.pushMessage(kingLineUserId, { type: 'text', text: message });
    } catch (error) {
        console.warn('[reservations/create] Line notify failed:', error?.message || error);
    }
}

async function deleteExpiredStoreScheduleDocs(
    firestore,
    collectionName,
    cutoffMs,
    label,
    timestampField = 'startsAtMs'
) {
    let deleted = 0;
    for (let i = 0; i < 5; i += 1) {
        const snap = await firestore
            .collection(collectionName)
            .where(timestampField, '<', cutoffMs)
            .limit(200)
            .get();
        if (snap.empty) break;
        if (collectionName === TROY_CALENDAR_COLLECTION) {
            const deletedThisPass = await firestore.runTransaction(async (transaction) => {
                const currentSnapshots = await Promise.all(snap.docs.map((doc) => transaction.get(doc.ref)));
                const currentDocs = currentSnapshots.filter((doc) => (
                    doc.exists && Number(doc.data()?.startsAtMs || 0) < cutoffMs
                ));
                const indexRefs = currentDocs.map((doc) => {
                    const date = normalizeDateText(doc.data()?.date);
                    return date ? firestore.collection(TROY_CALENDAR_DATE_INDEX_COLLECTION).doc(date) : null;
                });
                const indexSnapshots = await Promise.all(indexRefs.map((ref) => (ref ? transaction.get(ref) : null)));
                const controlRef = firestore
                    .collection(TROY_CALENDAR_CONTROL_COLLECTION)
                    .doc(TROY_CALENDAR_CONTROL_DOCUMENT);
                const controlSnapshot = await transaction.get(controlRef);

                currentDocs.forEach((doc, index) => {
                    transaction.delete(doc.ref);
                    const indexSnapshot = indexSnapshots[index];
                    if (indexSnapshot?.exists && String(indexSnapshot.data()?.calendarId || '') === doc.id) {
                        transaction.delete(indexRefs[index]);
                    }
                });
                const controlData = controlSnapshot.data() || {};
                if (controlSnapshot.exists && controlData.schemaVersion === 1 && currentDocs.length > 0) {
                    transaction.set(controlRef, {
                        schemaVersion: 1,
                        entryCount: Math.max(0, Number(controlData.entryCount || 0) - currentDocs.length),
                        updatedAtMs: Date.now()
                    }, { merge: true });
                }
                return currentDocs.length;
            });
            deleted += deletedThisPass;
        } else {
            const batch = firestore.batch();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            deleted += snap.size;
        }
        if (snap.size < 200) break;
    }
    if (deleted > 0) {
        console.log(`[store-schedule-cleanup] Deleted ${deleted} ${label} docs older than ${new Date(cutoffMs).toISOString()}`);
    }
    return deleted;
}

async function cleanupExpiredStoreSchedules(firestore) {
    if (!firestore) return { calendars: 0, reservations: 0, calendarAudits: 0 };
    const cutoffMs = Date.now() - STORE_SCHEDULE_RETENTION_MS;
    const auditCutoffMs = Date.now() - TROY_CALENDAR_AUDIT_RETENTION_MS;
    const [calendars, reservations, calendarAudits] = await Promise.all([
        deleteExpiredStoreScheduleDocs(firestore, TROY_CALENDAR_COLLECTION, cutoffMs, 'calendar'),
        deleteExpiredStoreScheduleDocs(firestore, RESERVATION_COLLECTION, cutoffMs, 'reservation'),
        deleteExpiredStoreScheduleDocs(
            firestore,
            TROY_CALENDAR_AUDIT_COLLECTION,
            auditCutoffMs,
            'calendar audit',
            'occurredAtMs'
        )
    ]);
    return { calendars, reservations, calendarAudits };
}

function startStoreScheduleCleanupJob(firestore) {
    if (storeScheduleCleanupStarted || !firestore) return;
    storeScheduleCleanupStarted = true;
    const run = () => {
        cleanupExpiredStoreSchedules(firestore).catch((error) => {
            console.warn('[store-schedule-cleanup] failed:', error?.message || error);
        });
    };
    cron.schedule('17 5 * * *', run, { timezone: 'Asia/Tokyo' });
    setTimeout(run, 30_000).unref?.();
}

function initializeEventRoutes(app, deps) {
    const { firestore, admin, requireAuthenticatedPlayFabId, subtractEconomyItem, getCurrencyBalance } = deps;
    if (!firestore || !admin) {
        console.warn('[events] Firestore deps missing. Event routes disabled.');
        return;
    }
    startStoreScheduleCleanupJob(firestore);
    const runtimeEnv = deps.env || process.env;
    const troyCalendarGoogleSync = deps.troyCalendarGoogleSync || createTroyCalendarGoogleSync({
        firestore,
        admin,
        env: runtimeEnv
    });
    troyCalendarGoogleSync.start();
    const googleBusinessProfileApprovalContext = typeof troyCalendarGoogleSync.getApprovalContext === 'function'
        ? troyCalendarGoogleSync.getApprovalContext()
        : null;
    const googleBusinessProfileStaffIds = parseGoogleBusinessProfileStaffIds(
        runtimeEnv.GOOGLE_BUSINESS_PROFILE_STAFF_PLAYFAB_IDS
    );
    const googleBusinessProfileLocationName = normalizeLocationName(
        runtimeEnv.GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME
    );
    const configuredGoogleBusinessProfileLocationName = normalizeLocationName(
        runtimeEnv.GOOGLE_BUSINESS_PROFILE_LOCATION_NAME
            || runtimeEnv.GOOGLE_BUSINESS_PROFILE_LOCATION_ID
    );
    const googleBusinessProfileLocationIsAllowed = !!googleBusinessProfileLocationName
        && googleBusinessProfileLocationName === configuredGoogleBusinessProfileLocationName;
    const googleBusinessProfileApprovalContextIsValid = googleBusinessProfileApprovalContext?.consentVersion === GBP_CONSENT_VERSION
        && normalizeLocationName(googleBusinessProfileApprovalContext?.locationName) === googleBusinessProfileLocationName
        && Number.isInteger(Number(googleBusinessProfileApprovalContext?.configGeneration))
        && Number(googleBusinessProfileApprovalContext?.configGeneration) >= 1
        && /^[a-f0-9]{32}$/.test(String(googleBusinessProfileApprovalContext?.configFingerprint || ''));

    function calendarEntryHasCurrentGoogleApproval(entry) {
        return googleBusinessProfileApprovalContextIsValid
            && entry?.googleBusinessProfileConsent === true
            && entry?.googleBusinessProfileConsentVersion === GBP_CONSENT_VERSION
            && !!normalizeCalendarRequestId(entry?.googleBusinessProfileOperationId)
            && normalizeLocationName(entry?.googleBusinessProfileLocationName) === googleBusinessProfileLocationName
            && entry?.googleBusinessProfileAuthorization === 'staff_playfab_allowlist_and_king'
            && Number(entry?.googleBusinessProfileConfigGeneration)
                === Number(googleBusinessProfileApprovalContext.configGeneration)
            && String(entry?.googleBusinessProfileConfigFingerprint || '')
                === String(googleBusinessProfileApprovalContext.configFingerprint || '');
    }

    function activeGoogleBusinessProfileConfigMatches(snapshot) {
        if (!snapshot?.exists || !googleBusinessProfileApprovalContextIsValid) return false;
        const activeConfig = snapshot.data() || {};
        return Number.isInteger(activeConfig.activeConfigGeneration)
            && activeConfig.activeConfigGeneration
                === Number(googleBusinessProfileApprovalContext.configGeneration)
            && String(activeConfig.activeConfigFingerprint || '')
                === String(googleBusinessProfileApprovalContext.configFingerprint || '')
            && String(activeConfig.activeLocationName || '') === googleBusinessProfileLocationName;
    }

    async function requireAuthed(req, res, playFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            res.status(503).json({ error: 'AuthenticationDependencyUnavailable' });
            return '';
        }
        return requireAuthenticatedPlayFabId(req, res, playFabId);
    }

    async function requireGoogleBusinessProfileStaff(playFabId, res) {
        if (!await isKing(playFabId, deps) || !googleBusinessProfileStaffIds.has(playFabId)) {
            res.status(403).json({ error: 'Google営業時間は許可された店舗スタッフのみ操作できます。' });
            return false;
        }
        if (!googleBusinessProfileLocationIsAllowed) {
            res.status(503).json({ error: 'Google営業時間の同期先店舗が固定許可設定と一致していません。' });
            return false;
        }
        if (!googleBusinessProfileApprovalContextIsValid) {
            res.status(503).json({ error: 'Google営業時間の同意対象設定を確認できません。' });
            return false;
        }
        return true;
    }

    app.post('/api/troy-calendar/list', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const playFabId = requestedPlayFabId ? await requireAuthed(req, res, requestedPlayFabId) : '';
        if (requestedPlayFabId && !playFabId) return;
        try {
            const displayFromMs = getJstStartOfTodayMs();
            const snap = await firestore
                .collection(TROY_CALENDAR_COLLECTION)
                .where('startsAtMs', '>=', displayFromMs)
                .orderBy('startsAtMs', 'asc')
                .limit(TROY_CALENDAR_MAX_VISIBLE_ENTRIES)
                .get();
            const calendar = snap.docs
                .map(troyCalendarDocToPayload)
                .sort((a, b) => Number(a.startsAtMs || 0) - Number(b.startsAtMs || 0));
            res.json({
                success: true,
                nation: TROY_CALENDAR_GLOBAL_NATION,
                calendar
            });
        } catch (error) {
            console.error('[troy-calendar/list] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToLoadTroyCalendar' });
        }
    });

    app.post('/api/troy-calendar/google-sync-status', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            if (!await requireGoogleBusinessProfileStaff(playFabId, res)) return;
            const kingNation = normalizeNationKey(await getNationForPlayer(playFabId, deps));
            if (!kingNation) return res.status(400).json({ error: 'NationNotSet' });
            const googleBusinessProfileSync = await troyCalendarGoogleSync.getStatus();
            res.json({ success: true, googleBusinessProfileSync });
        } catch (error) {
            console.error('[troy-calendar/google-sync-status] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToLoadGoogleBusinessProfileSyncStatus' });
        }
    });

    app.post('/api/troy-calendar/google-sync-review-details', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'PlayFabIdRequired' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            if (!await requireGoogleBusinessProfileStaff(playFabId, res)) return;
            if (typeof troyCalendarGoogleSync.getReviewDetails !== 'function') {
                return res.status(503).json({ error: 'GoogleBusinessProfileReviewUnavailable' });
            }
            const googleBusinessProfileReview = await troyCalendarGoogleSync.getReviewDetails();
            if (googleBusinessProfileReview?.status !== 'review_required') {
                const reviewChanged = googleBusinessProfileReview?.status === 'review_unavailable';
                return res.status(reviewChanged ? 409 : 503).json({
                    error: reviewChanged
                        ? 'GoogleBusinessProfileReviewStateChanged'
                        : 'GoogleBusinessProfileReviewUnavailable',
                    googleBusinessProfileReview
                });
            }
            if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
            else if (typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-store');
            return res.json({ success: true, googleBusinessProfileReview });
        } catch (error) {
            console.error('[troy-calendar/google-sync-review-details] failed:', error?.message || error);
            return res.status(500).json({ error: 'FailedToLoadGoogleBusinessProfileReview' });
        }
    });

    app.post('/api/troy-calendar/google-sync-review-approve', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'PlayFabIdRequired' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            if (!await requireGoogleBusinessProfileStaff(playFabId, res)) return;
            const googleConsent = normalizeGoogleBusinessProfileConsent(req.body);
            if (!googleConsent) {
                return res.status(400).json({ error: 'Googleビジネスプロフィールの差分反映への明示同意が必要です。' });
            }
            const reviewHash = normalizeGoogleBusinessProfileSpecialHoursHash(
                req.body?.reviewHash || req.body?.reviewedRemoteSpecialHoursHash
            );
            if (!reviewHash) {
                return res.status(400).json({ error: 'Googleビジネスプロフィールの確認済み差分が必要です。' });
            }
            if (typeof troyCalendarGoogleSync.approveReview !== 'function') {
                return res.status(503).json({ error: 'GoogleBusinessProfileReviewUnavailable' });
            }
            const googleBusinessProfileSync = await troyCalendarGoogleSync.approveReview({
                requestedBy: playFabId,
                action: 'remote_special_hours_review_approve',
                operationId: googleConsent.operationId,
                consentVersion: googleConsent.consentVersion,
                locationName: googleBusinessProfileLocationName,
                reviewHash
            });
            if (googleBusinessProfileSync?.queued !== true) {
                const status = googleBusinessProfileSync?.status;
                const httpStatus = status === 'review_conflict' ? 409 : 503;
                return res.status(httpStatus).json({
                    error: status === 'review_conflict'
                        ? 'GoogleBusinessProfileReviewStateChanged'
                        : 'GoogleBusinessProfileReviewNotQueued',
                    googleBusinessProfileSync
                });
            }
            return res.json({ success: true, googleBusinessProfileSync });
        } catch (error) {
            console.error('[troy-calendar/google-sync-review-approve] failed:', error?.message || error);
            return res.status(500).json({ error: 'FailedToApproveGoogleBusinessProfileReview' });
        }
    });

    app.post('/api/troy-calendar/save', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            if (!await isKing(playFabId, deps)) return res.status(403).json({ error: '王のみ操作できます。' });
            const kingNation = normalizeNationKey(await getNationForPlayer(playFabId, deps));
            if (!kingNation) return res.status(400).json({ error: 'NationNotSet' });
            const googleSyncRequested = hasGoogleBusinessProfileConsentSignal(req.body);
            const googleConsent = googleSyncRequested
                ? normalizeGoogleBusinessProfileConsent(req.body)
                : null;
            if (googleSyncRequested) {
                if (!googleConsent) {
                    return res.status(400).json({ error: 'Googleビジネスプロフィールへ反映する内容への明示同意が必要です。' });
                }
                if (!await requireGoogleBusinessProfileStaff(playFabId, res)) return;
            }

            const date = normalizeDateText(req.body?.date);
            const openTime = normalizeStrictTimeText(req.body?.openTime);
            const closeTime = normalizeStrictTimeText(req.body?.closeTime);
            const status = normalizeStrictTroyCalendarStatus(req.body?.status);
            if (!date) return res.status(400).json({ error: '実在する営業日を入力してください。' });
            if (!openTime || !closeTime) return res.status(400).json({ error: 'OPENとCLOSEをHH:mm形式で入力してください。' });
            if (!status) return res.status(400).json({ error: '営業状態が不正です。' });
            if (status === 'open' && !hasValidGoogleOpenHours(openTime, closeTime)) {
                return res.status(400).json({ error: '日またぎ営業は24時間未満かつ翌日11:59までにしてください。' });
            }

            const calendarDayMs = troyCalendarStartsAtMs(date, '00:00');
            const displayFromMs = getJstStartOfTodayMs();
            const lastWritableDayMs = displayFromMs + (TROY_CALENDAR_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000);
            if (!calendarDayMs || calendarDayMs < displayFromMs || calendarDayMs > lastWritableDayMs) {
                return res.status(400).json({ error: `営業日は今日から${TROY_CALENDAR_MAX_FUTURE_DAYS}日以内で入力してください。` });
            }
            const startsAtMs = troyCalendarStartsAtMs(date, openTime);

            const rawCalendarId = String(req.body?.calendarId || req.body?.id || '').trim();
            const calendarId = normalizeCalendarDocumentId(rawCalendarId);
            if (rawCalendarId && !calendarId) return res.status(400).json({ error: 'calendarId is invalid' });
            const requestId = calendarId ? '' : normalizeCalendarRequestId(req.body?.requestId);
            if (!calendarId && !requestId) return res.status(400).json({ error: '新規保存には有効なrequestIdが必要です。' });
            const requestedDocumentId = calendarId || `request-${requestId}`;
            const ref = firestore.collection(TROY_CALENDAR_COLLECTION).doc(requestedDocumentId);
            const auditRef = firestore.collection(TROY_CALENDAR_AUDIT_COLLECTION).doc();
            const dateIndexRef = firestore.collection(TROY_CALENDAR_DATE_INDEX_COLLECTION).doc(date);
            const controlRef = firestore
                .collection(TROY_CALENDAR_CONTROL_COLLECTION)
                .doc(TROY_CALENDAR_CONTROL_DOCUMENT);
            const googleSyncStateRef = firestore
                .collection(TROY_CALENDAR_CONTROL_COLLECTION)
                .doc(TROY_CALENDAR_GOOGLE_SYNC_DOCUMENT);
            const mutationAtMs = Date.now();
            const basePayload = {
                nation: TROY_CALENDAR_GLOBAL_NATION,
                date,
                openTime,
                closeTime,
                status,
                title: normalizeString(req.body?.title, 80) || 'TROY営業',
                note: normalizeString(req.body?.note, 300),
                startsAtMs,
                updatedBy: playFabId,
                googleBusinessProfileConsent: !!googleConsent,
                googleBusinessProfileOperationId: googleConsent?.operationId || null,
                googleBusinessProfileConsentVersion: googleConsent?.consentVersion || null,
                googleBusinessProfileLocationName: googleConsent ? googleBusinessProfileLocationName : null,
                googleBusinessProfileAuthorization: googleConsent
                    ? 'staff_playfab_allowlist_and_king'
                    : 'local_calendar_only',
                googleBusinessProfileConfigGeneration: googleConsent
                    ? Number(googleBusinessProfileApprovalContext.configGeneration)
                    : null,
                googleBusinessProfileConfigFingerprint: googleConsent
                    ? googleBusinessProfileApprovalContext.configFingerprint
                    : null,
                googleBusinessProfileConsentAtMs: googleConsent ? mutationAtMs : null,
                updatedAtMs: mutationAtMs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            const transactionResult = await firestore.runTransaction(async (transaction) => {
                const [before, googleSyncStateSnapshot] = await Promise.all([
                    transaction.get(ref),
                    googleConsent ? transaction.get(googleSyncStateRef) : Promise.resolve(null)
                ]);
                if (googleConsent && !activeGoogleBusinessProfileConfigMatches(googleSyncStateSnapshot)) {
                    return {
                        kind: 'error',
                        httpStatus: 503,
                        error: 'Google連携の設定反映中です。少し待ってから再度確認・同意してください。'
                    };
                }
                if (calendarId && !before.exists) {
                    return { kind: 'error', httpStatus: 404, error: 'CalendarEntryNotFound' };
                }
                if (before.exists && !isEditableTroyCalendarNation(before.data()?.nation, kingNation)) {
                    return { kind: 'error', httpStatus: 403, error: 'OtherNationCalendarEntry' };
                }
                if (!calendarId && before.exists) {
                    if (!calendarPayloadMatches(before.data(), basePayload)) {
                        return { kind: 'error', httpStatus: 409, error: 'CalendarRequestConflict' };
                    }
                    return { kind: 'duplicate', entry: troyCalendarDocToPayload(before) };
                }

                const isNewEntry = before.exists !== true;
                const beforeData = before.data() || {};
                const oldDate = normalizeDateText(beforeData.date);
                const oldDateIndexRef = oldDate
                    ? firestore.collection(TROY_CALENDAR_DATE_INDEX_COLLECTION).doc(oldDate)
                    : null;
                const sameDateQuery = firestore
                    .collection(TROY_CALENDAR_COLLECTION)
                    .where('date', '==', date)
                    .limit(2);
                const [dateIndexSnapshot, oldDateIndexSnapshot, controlSnapshot, sameDateSnapshot] = await Promise.all([
                    transaction.get(dateIndexRef),
                    oldDateIndexRef && oldDateIndexRef.id !== dateIndexRef.id
                        ? transaction.get(oldDateIndexRef)
                        : Promise.resolve(null),
                    transaction.get(controlRef),
                    transaction.get(sameDateQuery)
                ]);

                const indexedCalendarId = String(dateIndexSnapshot.data()?.calendarId || '');
                const indexedCalendarRef = indexedCalendarId && indexedCalendarId !== ref.id
                    ? firestore.collection(TROY_CALENDAR_COLLECTION).doc(indexedCalendarId)
                    : null;
                const indexedCalendarSnapshot = indexedCalendarRef
                    ? await transaction.get(indexedCalendarRef)
                    : null;
                const controlData = controlSnapshot.data() || {};
                const hasStoredCount = controlData.schemaVersion === 1
                    && Number.isFinite(Number(controlData.entryCount));
                const countSnapshot = hasStoredCount
                    ? null
                    : await transaction.get(firestore.collection(TROY_CALENDAR_COLLECTION).limit(TROY_CALENDAR_MAX_VISIBLE_ENTRIES + 1));
                const entryCount = hasStoredCount
                    ? Math.max(0, Number(controlData.entryCount))
                    : countSnapshot.docs.length;
                const quota = nextTroyCalendarMutationWindows(controlData, playFabId, mutationAtMs);
                if (!quota.allowed) {
                    return {
                        kind: 'error',
                        httpStatus: 429,
                        error: '営業予定の更新回数が多すぎます。しばらく待ってください。'
                    };
                }
                const conflictingDateEntry = sameDateSnapshot.docs.find((doc) => doc.id !== ref.id);
                if (conflictingDateEntry || indexedCalendarSnapshot?.exists) {
                    return {
                        kind: 'error',
                        httpStatus: 409,
                        error: 'この日付には既に営業予定があります。既存予定を編集してください。'
                    };
                }
                if (isNewEntry && entryCount >= TROY_CALENDAR_MAX_VISIBLE_ENTRIES) {
                    return {
                        kind: 'error',
                        httpStatus: 409,
                        error: `営業予定は最大${TROY_CALENDAR_MAX_VISIBLE_ENTRIES}件です。既存予定を整理してください。`
                    };
                }
                if (!isNewEntry && oldDate !== date && entryCount > TROY_CALENDAR_MAX_VISIBLE_ENTRIES) {
                    return {
                        kind: 'error',
                        httpStatus: 409,
                        error: '営業予定が上限を超えているため、先に不要な予定を削除してください。'
                    };
                }

                const payload = { ...basePayload };
                if (isNewEntry) {
                    payload.createdBy = playFabId;
                    payload.createdAtMs = mutationAtMs;
                    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
                }
                transaction.set(ref, payload, { merge: true });
                transaction.set(auditRef, {
                    action: isNewEntry ? 'create' : 'update',
                    calendarId: ref.id,
                    actorPlayFabId: playFabId,
                    actorNation: kingNation,
                    googleBusinessProfileConsent: !!googleConsent,
                    googleBusinessProfileConsentVersion: googleConsent?.consentVersion || null,
                    googleBusinessProfileOperationId: googleConsent?.operationId || null,
                    googleBusinessProfileLocationName: googleConsent ? googleBusinessProfileLocationName : null,
                    googleBusinessProfileAuthorization: googleConsent
                        ? 'staff_playfab_allowlist_and_king'
                        : 'local_calendar_only',
                    googleBusinessProfileConfigGeneration: googleConsent
                        ? Number(googleBusinessProfileApprovalContext.configGeneration)
                        : null,
                    googleBusinessProfileConfigFingerprint: googleConsent
                        ? googleBusinessProfileApprovalContext.configFingerprint
                        : null,
                    before: calendarAuditSnapshot(beforeData),
                    after: calendarAuditSnapshot(payload),
                    occurredAtMs: mutationAtMs,
                    occurredAt: admin.firestore.FieldValue.serverTimestamp()
                });
                const googleBusinessProfileSync = googleConsent
                    ? troyCalendarGoogleSync.markPendingInBatch(
                        transaction,
                        'calendar_save',
                        {
                            requestedBy: playFabId,
                            calendarId: ref.id,
                            action: 'save',
                            operationId: googleConsent.operationId,
                            consentVersion: googleConsent.consentVersion,
                            locationName: googleBusinessProfileLocationName,
                            requestedDate: date,
                            removalDates: oldDate
                                && oldDate !== date
                                && calendarEntryHasCurrentGoogleApproval(beforeData)
                                ? [oldDate]
                                : []
                        }
                    )
                    : { status: 'not_requested', configured: false, enabled: false, queued: false };
                transaction.set(dateIndexRef, { calendarId: ref.id, date }, { merge: false });
                if (oldDateIndexRef
                    && oldDateIndexRef.id !== dateIndexRef.id
                    && oldDateIndexSnapshot?.exists
                    && String(oldDateIndexSnapshot.data()?.calendarId || '') === ref.id) {
                    transaction.delete(oldDateIndexRef);
                }
                transaction.set(controlRef, {
                    schemaVersion: 1,
                    entryCount: entryCount + (isNewEntry ? 1 : 0),
                    mutationWindows: quota.mutationWindows,
                    updatedAtMs: mutationAtMs,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return {
                    kind: 'saved',
                    entry: troyCalendarDocToPayload({ id: ref.id, data: () => payload }),
                    googleBusinessProfileSync
                };
            });

            if (transactionResult.kind === 'error') {
                return res.status(transactionResult.httpStatus).json({ error: transactionResult.error });
            }
            if (transactionResult.kind === 'duplicate') {
                let googleBusinessProfileSync = googleConsent
                    ? { status: 'queued', configured: true, enabled: true, queued: true }
                    : { status: 'not_requested', configured: false, enabled: false, queued: false };
                try {
                    if (googleConsent && typeof troyCalendarGoogleSync.getStatus === 'function') {
                        googleBusinessProfileSync = await troyCalendarGoogleSync.getStatus();
                    }
                } catch (error) {
                    console.warn('[google-business-profile] Duplicate save status read failed:', error?.message || error);
                }
                return res.json({
                    success: true,
                    duplicate: true,
                    nation: TROY_CALENDAR_GLOBAL_NATION,
                    entry: transactionResult.entry,
                    googleBusinessProfileSync
                });
            }
            if (transactionResult.googleBusinessProfileSync?.queued === true) {
                try {
                    troyCalendarGoogleSync.scheduleFlush();
                } catch (error) {
                    console.warn('[google-business-profile] Calendar save queued; local wake-up failed:', error?.message || error);
                }
            }
            res.json({
                success: true,
                nation: TROY_CALENDAR_GLOBAL_NATION,
                entry: transactionResult.entry,
                googleBusinessProfileSync: transactionResult.googleBusinessProfileSync
            });
        } catch (error) {
            console.error('[troy-calendar/save] failed:', error?.message || error);
            res.status(500).json({ error: 'FailedToSaveTroyCalendar' });
        }
    });

    app.post('/api/troy-calendar/delete', async (req, res) => {
        const requestedPlayFabId = normalizeString(req.body?.playFabId, 64);
        const calendarId = normalizeCalendarDocumentId(req.body?.calendarId || req.body?.id);
        if (!requestedPlayFabId || !calendarId) return res.status(400).json({ error: 'playFabId and calendarId are required' });
        const playFabId = await requireAuthed(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            if (!await isKing(playFabId, deps)) return res.status(403).json({ error: '王のみ操作できます。' });
            const kingNation = normalizeNationKey(await getNationForPlayer(playFabId, deps));
            if (!kingNation) return res.status(400).json({ error: 'NationNotSet' });
            const googleSyncRequested = hasGoogleBusinessProfileConsentSignal(req.body);
            const googleConsent = googleSyncRequested
                ? normalizeGoogleBusinessProfileConsent(req.body)
                : null;
            if (googleSyncRequested) {
                if (!googleConsent) {
                    return res.status(400).json({ error: 'Googleビジネスプロフィールへ反映する内容への明示同意が必要です。' });
                }
                if (!await requireGoogleBusinessProfileStaff(playFabId, res)) return;
            }
            const ref = firestore.collection(TROY_CALENDAR_COLLECTION).doc(calendarId);
            const auditRef = firestore.collection(TROY_CALENDAR_AUDIT_COLLECTION).doc();
            const controlRef = firestore
                .collection(TROY_CALENDAR_CONTROL_COLLECTION)
                .doc(TROY_CALENDAR_CONTROL_DOCUMENT);
            const googleSyncStateRef = firestore
                .collection(TROY_CALENDAR_CONTROL_COLLECTION)
                .doc(TROY_CALENDAR_GOOGLE_SYNC_DOCUMENT);
            const mutationAtMs = Date.now();
            const transactionResult = await firestore.runTransaction(async (transaction) => {
                const [snap, googleSyncStateSnapshot] = await Promise.all([
                    transaction.get(ref),
                    googleConsent ? transaction.get(googleSyncStateRef) : Promise.resolve(null)
                ]);
                if (googleConsent && !activeGoogleBusinessProfileConfigMatches(googleSyncStateSnapshot)) {
                    return {
                        kind: 'error',
                        httpStatus: 503,
                        error: 'Google連携の設定反映中です。少し待ってから再度確認・同意してください。'
                    };
                }
                if (!snap.exists) return { kind: 'error', httpStatus: 404, error: 'CalendarEntryNotFound' };
                if (!isEditableTroyCalendarNation(snap.data()?.nation, kingNation)) {
                    return { kind: 'error', httpStatus: 403, error: 'OtherNationCalendarEntry' };
                }
                const beforeData = snap.data() || {};
                const date = normalizeDateText(beforeData.date);
                const dateIndexRef = date
                    ? firestore.collection(TROY_CALENDAR_DATE_INDEX_COLLECTION).doc(date)
                    : null;
                const [dateIndexSnapshot, controlSnapshot] = await Promise.all([
                    dateIndexRef ? transaction.get(dateIndexRef) : Promise.resolve(null),
                    transaction.get(controlRef)
                ]);
                const controlData = controlSnapshot.data() || {};
                const hasStoredCount = controlData.schemaVersion === 1
                    && Number.isFinite(Number(controlData.entryCount));
                const countSnapshot = hasStoredCount
                    ? null
                    : await transaction.get(firestore.collection(TROY_CALENDAR_COLLECTION).limit(TROY_CALENDAR_MAX_VISIBLE_ENTRIES + 1));
                const entryCount = hasStoredCount
                    ? Math.max(0, Number(controlData.entryCount))
                    : countSnapshot.docs.length;
                const quota = nextTroyCalendarMutationWindows(controlData, playFabId, mutationAtMs);
                if (!quota.allowed) {
                    return {
                        kind: 'error',
                        httpStatus: 429,
                        error: '営業予定の更新回数が多すぎます。しばらく待ってください。'
                    };
                }

                transaction.delete(ref);
                if (dateIndexRef
                    && dateIndexSnapshot?.exists
                    && String(dateIndexSnapshot.data()?.calendarId || '') === calendarId) {
                    transaction.delete(dateIndexRef);
                }
                transaction.set(auditRef, {
                    action: 'delete',
                    calendarId,
                    actorPlayFabId: playFabId,
                    actorNation: kingNation,
                    googleBusinessProfileConsent: !!googleConsent,
                    googleBusinessProfileConsentVersion: googleConsent?.consentVersion || null,
                    googleBusinessProfileOperationId: googleConsent?.operationId || null,
                    googleBusinessProfileLocationName: googleConsent ? googleBusinessProfileLocationName : null,
                    googleBusinessProfileAuthorization: googleConsent
                        ? 'staff_playfab_allowlist_and_king'
                        : 'local_calendar_only',
                    googleBusinessProfileConfigGeneration: googleConsent
                        ? Number(googleBusinessProfileApprovalContext.configGeneration)
                        : null,
                    googleBusinessProfileConfigFingerprint: googleConsent
                        ? googleBusinessProfileApprovalContext.configFingerprint
                        : null,
                    before: calendarAuditSnapshot(beforeData),
                    after: null,
                    occurredAtMs: mutationAtMs,
                    occurredAt: admin.firestore.FieldValue.serverTimestamp()
                });
                const googleBusinessProfileSync = googleConsent
                    ? troyCalendarGoogleSync.markPendingInBatch(
                        transaction,
                        'calendar_delete',
                        {
                            requestedBy: playFabId,
                            calendarId,
                            action: 'delete',
                            operationId: googleConsent.operationId,
                            consentVersion: googleConsent.consentVersion,
                            locationName: googleBusinessProfileLocationName,
                            requestedDate: date,
                            removalDates: date && calendarEntryHasCurrentGoogleApproval(beforeData)
                                ? [date]
                                : []
                        }
                    )
                    : { status: 'not_requested', configured: false, enabled: false, queued: false };
                transaction.set(controlRef, {
                    schemaVersion: 1,
                    entryCount: Math.max(0, entryCount - 1),
                    mutationWindows: quota.mutationWindows,
                    updatedAtMs: mutationAtMs,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                return { kind: 'deleted', googleBusinessProfileSync };
            });
            if (transactionResult.kind === 'error') {
                return res.status(transactionResult.httpStatus).json({ error: transactionResult.error });
            }
            if (transactionResult.googleBusinessProfileSync?.queued === true) {
                try {
                    troyCalendarGoogleSync.scheduleFlush();
                } catch (error) {
                    console.warn('[google-business-profile] Calendar delete queued; local wake-up failed:', error?.message || error);
                }
            }
            res.json({
                success: true,
                deleted: true,
                calendarId,
                googleBusinessProfileSync: transactionResult.googleBusinessProfileSync
            });
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
            const displayFromMs = getJstStartOfTodayMs();
            const snap = await firestore
                .collection(RESERVATION_COLLECTION)
                .where('startsAtMs', '>=', displayFromMs)
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
