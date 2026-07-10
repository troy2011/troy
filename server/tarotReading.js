const { randomUUID, timingSafeEqual } = require('crypto');

const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i;
const MAX_RESULT_TEXT_LENGTH = 3200;
const MAX_LINE_MESSAGE_LENGTH = 4900;

function cleanText(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function maskLineUserId(lineUserId) {
    const value = cleanText(lineUserId, 80);
    if (value.length <= 10) return value ? '***' : '';
    return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function safeTimingEquals(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyStaffPin(staffPin) {
    const configuredPin = cleanText(process.env.TAROT_READING_STAFF_PIN, 80);
    if (!configuredPin) {
        if (process.env.NODE_ENV === 'production') {
            return {
                ok: false,
                status: 503,
                error: 'TAROT_READING_STAFF_PIN is not configured'
            };
        }
        return { ok: true };
    }
    if (!safeTimingEquals(cleanText(staffPin, 80), configuredPin)) {
        return {
            ok: false,
            status: 401,
            error: 'staffPin is invalid'
        };
    }
    return { ok: true };
}

function extractCustomerRef(rawValue) {
    let value = cleanText(rawValue, 500);
    if (!value) return '';

    try {
        const url = new URL(value);
        const dataPayload = cleanText(url.searchParams.get('data'), 500);
        if (/^(TROY|LINE):/i.test(dataPayload)) return dataPayload;
        const playFabId = cleanText(
            url.searchParams.get('playFabId')
            || url.searchParams.get('playerId')
            || url.searchParams.get('targetPlayFabId'),
            80
        );
        if (playFabId) return `TROY:${playFabId}`;
        const lineUserId = cleanText(url.searchParams.get('lineUserId'), 80);
        if (lineUserId) return `LINE:${lineUserId}`;
    } catch {
        // Not a URL. Keep the scanned value as-is.
    }

    value = value.replace(/^["']|["']$/g, '').trim();
    return value;
}

function normalizeCustomerRef(rawValue) {
    const value = extractCustomerRef(rawValue);
    const typed = value.match(/^(TROY|LINE):(.+)$/i);
    if (typed) {
        const kind = typed[1].toUpperCase();
        const id = cleanText(typed[2], 120);
        if (kind === 'LINE') return { kind: 'line', lineUserId: id, original: value };
        return { kind: 'playfab', playFabId: id, original: value };
    }
    if (LINE_USER_ID_PATTERN.test(value)) {
        return { kind: 'line', lineUserId: value, original: value };
    }
    return { kind: 'playfab', playFabId: cleanText(value, 120), original: value };
}

async function getLineUserIdByPlayFabId(playFabId, deps) {
    const id = cleanText(playFabId, 120);
    if (!id) return '';

    try {
        if (deps?.promisifyPlayFab && deps?.PlayFabServer?.GetUserReadOnlyData) {
            const data = await deps.promisifyPlayFab(deps.PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: id,
                Keys: ['lineUserId']
            });
            const lineUserId = cleanText(data?.Data?.lineUserId?.Value, 80);
            if (lineUserId) return lineUserId;
        }
    } catch (error) {
        console.warn('[tarot-reading] Failed to read PlayFab lineUserId:', error?.errorMessage || error?.message || error);
    }

    try {
        if (deps?.firestore) {
            const snap = await deps.firestore.collection('line_user_links')
                .where('playFabId', '==', id)
                .limit(1)
                .get();
            const doc = snap?.docs?.[0];
            const lineUserId = cleanText(doc?.id, 80);
            if (lineUserId) return lineUserId;
        }
    } catch (error) {
        console.warn('[tarot-reading] Failed to query line_user_links:', error?.message || error);
    }

    return '';
}

async function resolveCustomerLineUserId(customerRef, deps) {
    const ref = normalizeCustomerRef(customerRef);
    if (!ref.original) {
        return { lineUserId: '', playFabId: '', source: '', error: 'customerRef is required' };
    }
    if (ref.kind === 'line') {
        if (!LINE_USER_ID_PATTERN.test(ref.lineUserId)) {
            return { lineUserId: '', playFabId: '', source: 'line', error: 'LINE user ID is invalid' };
        }
        return { lineUserId: ref.lineUserId, playFabId: '', source: 'line' };
    }

    const lineUserId = await getLineUserIdByPlayFabId(ref.playFabId, deps);
    if (!lineUserId) {
        return {
            lineUserId: '',
            playFabId: ref.playFabId,
            source: 'playfab',
            error: 'LINE user ID was not found for this PlayFab ID'
        };
    }
    return { lineUserId, playFabId: ref.playFabId, source: 'playfab' };
}

function buildTarotReadingLineMessage(payload = {}) {
    const topicLabel = cleanText(payload.topicLabel || payload.topicId || 'タロット', 40);
    const cardLabel = cleanText(payload.cardLabel || '未選択のカード', 80);
    const orientationLabel = cleanText(payload.orientationLabel || '', 20);
    const staffName = cleanText(payload.staffName, 40);
    const resultText = cleanText(payload.resultText, MAX_RESULT_TEXT_LENGTH);
    const note = cleanText(payload.note, 240);
    const cardLine = [cardLabel, orientationLabel].filter(Boolean).join(' / ');
    const lines = [
        '【TROY 海賊タロット】',
        `占い: ${topicLabel}`,
        `引いたカード: ${cardLine}`,
        staffName ? `占い手: ${staffName}` : '',
        '',
        resultText
    ].filter((line, index, array) => line !== '' || array[index - 1] !== '');
    if (note) {
        lines.push('', `追記: ${note}`);
    }
    lines.push('', '甘やかさない占い。でも、見捨てない占い。');

    return lines.join('\n').trim().slice(0, MAX_LINE_MESSAGE_LENGTH);
}

async function logTarotReading(deps, entry) {
    if (!deps?.firestore) return;
    try {
        const serverTimestamp = deps.admin?.firestore?.FieldValue?.serverTimestamp
            ? deps.admin.firestore.FieldValue.serverTimestamp()
            : new Date().toISOString();
        await deps.firestore.collection('tarot_reading_logs').doc(entry.readingId).set({
            ...entry,
            createdAt: serverTimestamp
        }, { merge: true });
    } catch (error) {
        console.warn('[tarot-reading] Failed to write log:', error?.message || error);
    }
}

function initializeTarotReadingRoutes(app, deps = {}) {
    app.post('/api/tarot-reading/send', async (req, res) => {
        const body = req.body || {};
        const pinCheck = verifyStaffPin(body.staffPin);
        if (!pinCheck.ok) {
            return res.status(pinCheck.status || 401).json({ success: false, error: pinCheck.error });
        }
        if (!deps.lineClient || typeof deps.lineClient.pushMessage !== 'function') {
            return res.status(503).json({ success: false, error: 'LINE client is not configured' });
        }

        const resultText = cleanText(body.resultText, MAX_RESULT_TEXT_LENGTH);
        if (!resultText) {
            return res.status(400).json({ success: false, error: 'resultText is required' });
        }

        const resolved = await resolveCustomerLineUserId(body.customerRef, deps);
        if (!resolved.lineUserId) {
            return res.status(404).json({
                success: false,
                error: resolved.error || 'LINE user ID was not found'
            });
        }

        const readingId = cleanText(body.requestId, 80) || `tarot-${randomUUID()}`;
        const messageText = buildTarotReadingLineMessage({
            topicId: body.topicId,
            topicLabel: body.topicLabel,
            cardLabel: body.cardLabel,
            orientationLabel: body.orientationLabel,
            staffName: body.staffName,
            resultText,
            note: body.note
        });

        try {
            await deps.lineClient.pushMessage(resolved.lineUserId, { type: 'text', text: messageText });
            await logTarotReading(deps, {
                readingId,
                customerRef: cleanText(body.customerRef, 500),
                lineUserId: resolved.lineUserId,
                lineUserIdMasked: maskLineUserId(resolved.lineUserId),
                playFabId: resolved.playFabId || '',
                source: resolved.source || '',
                staffName: cleanText(body.staffName, 40),
                topicId: cleanText(body.topicId, 40),
                topicLabel: cleanText(body.topicLabel, 40),
                cardId: cleanText(body.cardId, 80),
                cardLabel: cleanText(body.cardLabel, 80),
                orientation: cleanText(body.orientation, 20),
                orientationLabel: cleanText(body.orientationLabel, 20),
                resultText,
                note: cleanText(body.note, 240)
            });
            return res.json({
                success: true,
                sent: true,
                readingId,
                lineUserIdMasked: maskLineUserId(resolved.lineUserId)
            });
        } catch (error) {
            console.warn('[tarot-reading] LINE push failed:', error?.message || error);
            return res.status(502).json({
                success: false,
                error: 'LINE push failed',
                details: error?.message || ''
            });
        }
    });
}

module.exports = {
    initializeTarotReadingRoutes,
    buildTarotReadingLineMessage,
    cleanText,
    extractCustomerRef,
    maskLineUserId,
    normalizeCustomerRef,
    resolveCustomerLineUserId
};
