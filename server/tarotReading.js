const { randomUUID } = require('crypto');

const MAX_RESULT_TEXT_LENGTH = 3200;
const TROY_GLOBAL_ROOM_ID = 'global';
const STORE_CUSTOMER_LIMIT = 50;
const FIRESTORE_IN_LIMIT = 30;

function cleanText(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

function maskLineUserId(lineUserId) {
    const value = cleanText(lineUserId, 80);
    if (value.length <= 10) return value ? '***' : '';
    return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function normalizeStoreCustomerRef(rawValue) {
    const value = cleanText(rawValue, 160);
    const match = value.match(/^TROY:([^/\\?#\s]+)$/i);
    return match ? cleanText(match[1], 120) : '';
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

function toEpochMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return Math.max(0, Number(value.toMillis()) || 0);
    if (value instanceof Date) return Math.max(0, value.getTime());
    return Math.max(0, Number(value) || 0);
}

function chunkValues(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

async function getStoreTarotCustomers(deps) {
    if (!deps?.firestore) throw new Error('Firestore is not configured');
    const roomRef = deps.firestore.collection('troy_rooms').doc(TROY_GLOBAL_ROOM_ID);
    const [roomSnap, membersSnap] = await Promise.all([
        roomRef.get(),
        roomRef.collection('members').orderBy('joinedAt', 'asc').limit(STORE_CUSTOMER_LIMIT).get()
    ]);
    const isOpen = !!roomSnap?.data?.()?.isOpen;
    if (!isOpen) return { isOpen: false, customers: [] };

    const members = (membersSnap?.docs || []).map((doc) => {
        const data = doc.data?.() || {};
        const playFabId = cleanText(doc.id || data.playFabId, 120);
        return {
            playFabId,
            customerRef: playFabId ? `TROY:${playFabId}` : '',
            displayName: cleanText(data.displayName, 40) || playFabId || 'Player',
            joinedAtMs: toEpochMs(data.joinedAt)
        };
    }).filter((customer) => customer.playFabId);

    const linkedPlayFabIds = new Set();
    const batches = chunkValues(members.map((customer) => customer.playFabId), FIRESTORE_IN_LIMIT);
    await Promise.all(batches.map(async (batch) => {
        if (!batch.length) return;
        const linksSnap = await deps.firestore.collection('line_user_links')
            .where('playFabId', 'in', batch)
            .get();
        (linksSnap?.docs || []).forEach((doc) => {
            const playFabId = cleanText(doc.data?.()?.playFabId, 120);
            if (playFabId) linkedPlayFabIds.add(playFabId);
        });
    }));

    return {
        isOpen: true,
        customers: members.map((customer) => ({
            customerRef: customer.customerRef,
            displayName: customer.displayName,
            joinedAtMs: customer.joinedAtMs,
            lineLinked: linkedPlayFabIds.has(customer.playFabId)
        }))
    };
}

async function resolveStoreCustomerLineUserId(customerRef, deps) {
    const playFabId = normalizeStoreCustomerRef(customerRef);
    if (!playFabId) {
        return { lineUserId: '', playFabId: '', source: 'store', error: 'お客様を店内リストから選択してください' };
    }
    if (!deps?.firestore) {
        return { lineUserId: '', playFabId, source: 'store', error: '店内リストを確認できません' };
    }

    const roomRef = deps.firestore.collection('troy_rooms').doc(TROY_GLOBAL_ROOM_ID);
    const [roomSnap, memberSnap] = await Promise.all([
        roomRef.get(),
        roomRef.collection('members').doc(playFabId).get()
    ]);
    if (!roomSnap?.data?.()?.isOpen || !memberSnap?.exists) {
        return { lineUserId: '', playFabId, source: 'store', error: '選択したお客様は現在の店内リストにいません' };
    }

    const lineUserId = await getLineUserIdByPlayFabId(playFabId, deps);
    if (!lineUserId) {
        return {
            lineUserId: '',
            playFabId,
            source: 'store',
            error: '選択したお客様はLINE未連携です'
        };
    }
    return {
        lineUserId,
        playFabId,
        displayName: cleanText(memberSnap.data?.()?.displayName, 40) || playFabId,
        source: 'store'
    };
}

function buildTarotReadingLineMessage(payload = {}) {
    return cleanText(payload.resultText, MAX_RESULT_TEXT_LENGTH);
}

function normalizeReadingCards(cardsInput, fallback = {}) {
    const rawCards = Array.isArray(cardsInput) && cardsInput.length
        ? cardsInput.slice(0, 3)
        : fallback.cardId ? [fallback] : [];
    return rawCards.map((card, index) => ({
        position: Math.max(1, Math.min(3, Number(card?.position) || index + 1)),
        positionId: cleanText(card?.positionId, 60),
        positionLabel: cleanText(card?.positionLabel, 80),
        cardId: cleanText(card?.cardId, 80),
        cardLabel: cleanText(card?.cardLabel, 80),
        orientation: cleanText(card?.orientation, 20),
        orientationLabel: cleanText(card?.orientationLabel, 20)
    })).filter((card) => card.cardId && card.cardLabel);
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
    app.get('/api/tarot-reading/customers', async (_req, res) => {
        try {
            const result = await getStoreTarotCustomers(deps);
            return res.json({ success: true, ...result });
        } catch (error) {
            console.warn('[tarot-reading] Failed to load store customers:', error?.message || error);
            return res.status(503).json({
                success: false,
                error: '店内リストを読み込めませんでした'
            });
        }
    });

    app.post('/api/tarot-reading/send', async (req, res) => {
        const body = req.body || {};
        if (!deps.lineClient || typeof deps.lineClient.pushMessage !== 'function') {
            return res.status(503).json({ success: false, error: 'LINE client is not configured' });
        }

        const resultText = cleanText(body.resultText, MAX_RESULT_TEXT_LENGTH);
        if (!resultText) {
            return res.status(400).json({ success: false, error: 'resultText is required' });
        }

        const spreadMode = body.spreadMode === 'triple' ? 'triple' : 'single';
        const cards = normalizeReadingCards(body.cards, {
            position: 1,
            positionId: 'single',
            positionLabel: '1枚引き',
            cardId: body.cardId,
            cardLabel: body.cardLabel,
            orientation: body.orientation,
            orientationLabel: body.orientationLabel
        });
        if (spreadMode === 'triple' && (cards.length !== 3 || new Set(cards.map((card) => card.cardId)).size !== 3)) {
            return res.status(400).json({ success: false, error: 'three-card reading requires three unique cards' });
        }

        const resolved = await resolveStoreCustomerLineUserId(body.customerRef, deps);
        if (!resolved.lineUserId) {
            return res.status(400).json({
                success: false,
                error: resolved.error || 'LINE user ID was not found'
            });
        }

        const readingId = cleanText(body.requestId, 80) || `tarot-${randomUUID()}`;
        const messageText = buildTarotReadingLineMessage({
            resultText
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
                customerDisplayName: resolved.displayName || '',
                topicId: cleanText(body.topicId, 40),
                topicLabel: cleanText(body.topicLabel, 40),
                subtopicId: cleanText(body.subtopicId, 40),
                subtopicLabel: cleanText(body.subtopicLabel, 80),
                spreadMode,
                spreadModeLabel: cleanText(body.spreadModeLabel, 40),
                cards,
                cardId: cleanText(body.cardId, 80),
                cardLabel: cleanText(body.cardLabel, 80),
                orientation: cleanText(body.orientation, 20),
                orientationLabel: cleanText(body.orientationLabel, 20),
                resultText
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
    getStoreTarotCustomers,
    normalizeReadingCards,
    cleanText,
    maskLineUserId,
    normalizeStoreCustomerRef,
    resolveStoreCustomerLineUserId
};
