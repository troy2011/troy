'use strict';

const TROY_CALENDAR_COLLECTION = 'troy_business_calendar';
const TROY_CALENDAR_MAX_VISIBLE_ENTRIES = 80;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const TROY_CALENDAR_STATUSES = new Set(['open', 'closed', 'private', 'tentative']);

function getJstStartOfTodayMs(nowMs = Date.now()) {
    const jst = new Date(Number(nowMs || Date.now()) + JST_OFFSET_MS);
    return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS;
}

function normalizeStrictTroyCalendarStatus(value) {
    const key = String(value || '').trim().slice(0, 20).toLowerCase();
    return TROY_CALENDAR_STATUSES.has(key) ? key : '';
}

function normalizeStrictTimeText(value) {
    const raw = String(value || '').trim().slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(raw)) return '';
    const [hours, minutes] = raw.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return '';
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? raw : '';
}

function normalizeDateText(value) {
    const raw = String(value || '').trim().slice(0, 10);
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

async function listUpcomingCalendarDocs(firestore, { publicOnly = false } = {}) {
    let query = firestore.collection(TROY_CALENDAR_COLLECTION)
        .where('startsAtMs', '>=', getJstStartOfTodayMs())
        .orderBy('startsAtMs', 'asc')
        .limit(TROY_CALENDAR_MAX_VISIBLE_ENTRIES);
    if (publicOnly) query = query.select('date', 'status', 'openTime', 'closeTime', 'publicHelmName');
    const snapshot = await query.get();
    return snapshot.docs;
}

function createPublicCalendarHandler(firestore) {
    return async (_req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const docs = await listUpcomingCalendarDocs(firestore, { publicOnly: true });
            const calendar = docs.flatMap((doc) => {
                const row = doc.data() || {};
                const date = normalizeDateText(row.date);
                const status = normalizeStrictTroyCalendarStatus(row.status || 'open');
                if (!date || !status) return [];
                const showsHours = status === 'open' || status === 'tentative';
                const publicHelmName = status === 'open' ? normalizePublicHelmName(row.publicHelmName) : '';
                return [{
                    date,
                    status,
                    openTime: showsHours ? normalizeStrictTimeText(row.openTime) : '',
                    closeTime: showsHours ? normalizeStrictTimeText(row.closeTime) : '',
                    ...(publicHelmName ? { publicHelmName } : {})
                }];
            });
            res.json({ calendar });
        } catch (error) {
            const safeCode = Number.isInteger(error?.code) ? ` (${error.code})` : '';
            console.error(`[troy-calendar/public] Firestore read failed${safeCode}`);
            res.status(503).json({ error: 'FailedToLoadTroyCalendar' });
        }
    };
}

function normalizePublicHelmName(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 24);
}

module.exports = {
    TROY_CALENDAR_COLLECTION, TROY_CALENDAR_MAX_VISIBLE_ENTRIES, getJstStartOfTodayMs,
    normalizeStrictTroyCalendarStatus, normalizeStrictTimeText, normalizeDateText,
    listUpcomingCalendarDocs, createPublicCalendarHandler, normalizePublicHelmName
};
