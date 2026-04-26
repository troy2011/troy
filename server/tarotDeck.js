// server/tarotDeck.js
// タロットデッキ管理
// 正位置カード → 白兵戦デッキ（meleeDeck）
// 逆位置カード → 船デッキ（shipDeck）
// 各デッキ最大5枚、ポーカーハンド評価を両デッキに適用

const { getCanonicalTarotCategory, getMajorArcanaSuitInfo } = require('./tarotCards');
const { evaluateTarotRole, getTarotRoleBonus } = require('./tarotRoles');

const MELEE_DECK_DATA_KEY = 'TarotMeleeDeck';
const SHIP_DECK_DATA_KEY  = 'TarotShipDeck';
const DECK_MAX_CARDS = 5;

// orientation → deckType
function getDeckType(orientation) {
    return orientation === 'reversed' ? 'ship' : 'melee';
}

function parseJsonSafe(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getInventoryItemAmount(items, itemId) {
    return (items || []).reduce((total, item) => {
        const currentId = String(item?.Id || item?.ItemId || '').trim();
        if (currentId !== itemId) return total;
        return total + (Number(item?.Amount ?? item?.amount ?? 0) || 0);
    }, 0);
}

function isTarotCardItem(itemId, catalogCache) {
    const itemData = catalogCache?.[itemId];
    const category = getCanonicalTarotCategory(itemData?.Category);
    return category === 'TarotMajor' || category === 'TarotMinor';
}

async function readDecks(playFabId, promisifyPlayFab, PlayFabServer) {
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [MELEE_DECK_DATA_KEY, SHIP_DECK_DATA_KEY]
    });
    return {
        meleeDeck: parseJsonSafe(result?.Data?.[MELEE_DECK_DATA_KEY]?.Value),
        shipDeck:  parseJsonSafe(result?.Data?.[SHIP_DECK_DATA_KEY]?.Value)
    };
}

async function writeDecks(playFabId, decks, promisifyPlayFab, PlayFabServer) {
    const updateData = {};
    if (decks.meleeDeck !== undefined) {
        updateData[MELEE_DECK_DATA_KEY] = JSON.stringify(decks.meleeDeck);
    }
    if (decks.shipDeck !== undefined) {
        updateData[SHIP_DECK_DATA_KEY] = JSON.stringify(decks.shipDeck);
    }
    if (!Object.keys(updateData).length) return;
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: updateData,
        Permission: 'Public'
    });
}

// デッキにカードを装備（重複は除去してから末尾追加）
// returns { ok, deck } or { ok: false, error, deck }
function equipCardToDeck(deck, cardItemId) {
    const filtered = deck.filter((id) => id !== cardItemId);
    if (filtered.length >= DECK_MAX_CARDS) {
        return { ok: false, error: 'DeckFull', deck };
    }
    return { ok: true, deck: [...filtered, cardItemId] };
}

// デッキからカードを外す
function unequipCardFromDeck(deck, cardItemId) {
    return { ok: true, deck: deck.filter((id) => id !== cardItemId) };
}

// カタログデータの配列からポーカーハンド評価用カードを組み立てる
function buildDeckRoleCards(deckItemDataList) {
    const SUIT_MAP = { wand: 'Wand', sword: 'Sword', cup: 'Cup', pentacle: 'Pentacle', all: 'All', none: 'None' };
    const FACE_ORDER = { PAGE: 11, KNIGHT: 12, QUEEN: 13, KING: 14 };
    return deckItemDataList.map((itemData) => {
        if (!itemData) return null;
        const category = getCanonicalTarotCategory(itemData?.Category);
        if (category === 'TarotMajor') {
            const number = Number(itemData?.ArcanaNumber ?? itemData?.CardNumber);
            if (!Number.isFinite(number)) return null;
            const suitInfo = getMajorArcanaSuitInfo(itemData);
            return {
                kind: 'major',
                number,
                suit: SUIT_MAP[suitInfo.key] || 'None',
                name: String(itemData?.ArcanaName || itemData?.DisplayName || '').trim()
            };
        }
        if (category === 'TarotMinor') {
            const raw = String(
                itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || ''
            ).trim();
            const parsed = Number(raw);
            const number = Number.isFinite(parsed) ? parsed : (FACE_ORDER[raw.toUpperCase()] || null);
            const suitRaw = String(itemData?.ArcanaSuit || itemData?.Suit || '').trim().toLowerCase();
            const suit = SUIT_MAP[suitRaw] || 'None';
            if (!number || suit === 'None') return null;
            return {
                kind: 'minor',
                number,
                suit,
                name: String(itemData?.DisplayName || '').trim()
            };
        }
        return null;
    });
}

// デッキのポーカーハンドとボーナスを評価する
// deckItemDataList: catalogCache[itemId] 相当のオブジェクト配列（5要素）
function evaluateDeckRole(deckItemDataList) {
    const emptyBonus = { Power: 0, Defense: 0, Agi: 0, Int: 0, total: 0, resonanceSuit: '', resonanceSuitLabel: '' };
    const cards = buildDeckRoleCards(deckItemDataList);
    const filledCount = cards.filter(Boolean).length;
    if (filledCount < 5) {
        return { key: 'Incomplete', label: '未成立', strength: 0, filledCount, bonus: emptyBonus };
    }
    const role = evaluateTarotRole(cards);
    if (!role) {
        return { key: 'NoRole', label: '役なし', strength: 0, filledCount, bonus: emptyBonus };
    }
    return { ...role, filledCount, bonus: getTarotRoleBonus(role) };
}

function initializeTarotDeckRoutes(app, deps) {
    const {
        promisifyPlayFab,
        PlayFabServer,
        catalogCache,
        getEntityKeyForPlayFabId,
        getAllInventoryItems,
        requireAuthenticatedPlayFabId
    } = deps;

    async function requireAuthedPlayFabId(req, res, expectedPlayFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return String(expectedPlayFabId || '').trim();
        }
        return requireAuthenticatedPlayFabId(req, res, expectedPlayFabId);
    }

    async function requireOwnedTarotCard(playFabId, cardItemId) {
        if (!isTarotCardItem(cardItemId, catalogCache)) {
            return { ok: false, status: 400, error: 'CardItemRequired' };
        }
        if (typeof getEntityKeyForPlayFabId !== 'function' || typeof getAllInventoryItems !== 'function') {
            throw new Error('InventoryDepsMissing');
        }
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const items = await getAllInventoryItems(entityKey);
        if (getInventoryItemAmount(items, cardItemId) <= 0) {
            return { ok: false, status: 403, error: 'CardNotOwned' };
        }
        return { ok: true };
    }

    // デッキ取得
    app.post('/api/tarot-deck-get', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer);
            return res.json({ ok: true, ...decks });
        } catch (error) {
            console.error('[tarot-deck-get] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToGetTarotDecks' });
        }
    });

    // カードをデッキに装備
    app.post('/api/tarot-deck-equip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const cardItemId = String(req.body?.cardItemId || '').trim();
        const deckType   = String(req.body?.deckType   || '').trim(); // 'melee' | 'ship'
        if (!requestedPlayFabId)  return res.status(400).json({ error: 'playFabId is required' });
        if (!cardItemId) return res.status(400).json({ error: 'cardItemId is required' });
        if (deckType !== 'melee' && deckType !== 'ship') {
            return res.status(400).json({ error: 'deckType must be melee or ship' });
        }
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const ownership = await requireOwnedTarotCard(playFabId, cardItemId);
            if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
            const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer);
            const current = deckType === 'ship' ? decks.shipDeck : decks.meleeDeck;
            const result = equipCardToDeck(current, cardItemId);
            if (!result.ok) return res.status(400).json({ error: result.error });
            const updated = deckType === 'ship'
                ? { meleeDeck: decks.meleeDeck, shipDeck: result.deck }
                : { meleeDeck: result.deck,     shipDeck: decks.shipDeck };
            await writeDecks(playFabId, { [deckType === 'ship' ? 'shipDeck' : 'meleeDeck']: result.deck }, promisifyPlayFab, PlayFabServer);
            return res.json({ ok: true, ...updated });
        } catch (error) {
            console.error('[tarot-deck-equip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToEquipTarotCard' });
        }
    });

    // カードをデッキから外す
    app.post('/api/tarot-deck-unequip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const cardItemId = String(req.body?.cardItemId || '').trim();
        const deckType   = String(req.body?.deckType   || '').trim();
        if (!requestedPlayFabId)  return res.status(400).json({ error: 'playFabId is required' });
        if (!cardItemId) return res.status(400).json({ error: 'cardItemId is required' });
        if (deckType !== 'melee' && deckType !== 'ship') {
            return res.status(400).json({ error: 'deckType must be melee or ship' });
        }
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer);
            const current = deckType === 'ship' ? decks.shipDeck : decks.meleeDeck;
            const result = unequipCardFromDeck(current, cardItemId);
            const updated = deckType === 'ship'
                ? { meleeDeck: decks.meleeDeck, shipDeck: result.deck }
                : { meleeDeck: result.deck,     shipDeck: decks.shipDeck };
            await writeDecks(playFabId, { [deckType === 'ship' ? 'shipDeck' : 'meleeDeck']: result.deck }, promisifyPlayFab, PlayFabServer);
            return res.json({ ok: true, ...updated });
        } catch (error) {
            console.error('[tarot-deck-unequip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToUnequipTarotCard' });
        }
    });
}

module.exports = {
    MELEE_DECK_DATA_KEY,
    SHIP_DECK_DATA_KEY,
    DECK_MAX_CARDS,
    getDeckType,
    readDecks,
    writeDecks,
    equipCardToDeck,
    unequipCardFromDeck,
    buildDeckRoleCards,
    evaluateDeckRole,
    initializeTarotDeckRoutes
};
