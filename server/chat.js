// server/chat.js
// チャット関連のAPI

const GLOBAL_CHAT_LIMIT = 200;
const NEARBY_CHAT_LIMIT = 200;
const NEARBY_CHAT_RANGE = 500;
const NEARBY_CHAT_TTL_MS = 10 * 60 * 1000;
const globalChatMessages = [];
const nearbyChatMessages = [];

function trimChat(list, limit) {
    while (list.length > limit) list.shift();
}

function normalizeChatMessage(entry) {
    return {
        message: entry.message,
        displayName: entry.displayName || 'Player',
        timestamp: entry.timestamp
    };
}

function initializeChatRoutes(app) {
    // グローバルチャット取得
    app.post('/api/get-global-chat', async (_req, res) => {
        res.json({ success: true, messages: globalChatMessages.map(normalizeChatMessage) });
    });

    // グローバルチャット送信
    app.post('/api/send-global-chat', async (req, res) => {
        const { message, displayName } = req.body || {};
        const text = String(message || '').trim();
        if (!text) return res.status(400).json({ error: 'Message is required' });
        globalChatMessages.push({
            message: text,
            displayName: String(displayName || 'Player'),
            timestamp: Date.now()
        });
        trimChat(globalChatMessages, GLOBAL_CHAT_LIMIT);
        res.json({ success: true });
    });

    // 近くのチャット取得
    app.post('/api/get-nearby-chat', async (req, res) => {
        const x = Number(req?.body?.x);
        const y = Number(req?.body?.y);
        const now = Date.now();
        const list = nearbyChatMessages.filter((msg) => (now - msg.timestamp) <= NEARBY_CHAT_TTL_MS);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return res.json({ success: true, messages: list.map(normalizeChatMessage) });
        }
        const filtered = list.filter((msg) => {
            const dx = (Number(msg.x) || 0) - x;
            const dy = (Number(msg.y) || 0) - y;
            return Math.sqrt(dx * dx + dy * dy) <= NEARBY_CHAT_RANGE;
        });
        res.json({ success: true, messages: filtered.map(normalizeChatMessage) });
    });

    // 近くのチャット送信
    app.post('/api/send-nearby-chat', async (req, res) => {
        const { message, displayName } = req.body || {};
        const text = String(message || '').trim();
        if (!text) return res.status(400).json({ error: 'Message is required' });
        const x = Number(req?.body?.x);
        const y = Number(req?.body?.y);
        nearbyChatMessages.push({
            message: text,
            displayName: String(displayName || 'Player'),
            timestamp: Date.now(),
            x: Number.isFinite(x) ? x : null,
            y: Number.isFinite(y) ? y : null
        });
        trimChat(nearbyChatMessages, NEARBY_CHAT_LIMIT);
        res.json({ success: true });
    });
}

function addGlobalChatMessage(message, displayName = 'System') {
    const text = String(message || '').trim();
    if (!text) return;
    globalChatMessages.push({
        message: text,
        displayName: String(displayName || 'System'),
        timestamp: Date.now()
    });
    trimChat(globalChatMessages, GLOBAL_CHAT_LIMIT);
}

module.exports = {
    GLOBAL_CHAT_LIMIT,
    NEARBY_CHAT_LIMIT,
    NEARBY_CHAT_RANGE,
    NEARBY_CHAT_TTL_MS,
    initializeChatRoutes,
    addGlobalChatMessage
};
