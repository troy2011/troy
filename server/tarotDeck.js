// server/tarotDeck.js
// タロットデッキ管理
// 白兵戦用の小アルカナデッキを管理する
// 最大5枚。小アルカナはスート順・ランク順で自動整列し、5枚役を評価する

const { enrichTarotCatalogData, getCanonicalTarotCategory } = require('./tarotCards');
const { evaluateTarotRole, getTarotRoleBonus } = require('./tarotRoles');
const {
    getStoredTarotItemId,
    getTarotItemIdAliases,
    resolveTarotCatalogItemId
} = require('./tarotItemIds');
const {
    TAROT_GUARDIAN_DATA_KEY,
    buildTarotKingdomGuardian,
    isMajorItem,
    parseTarotGuardian,
    serializeTarotGuardian
} = require('./tarotKingdomArcanaLoadout');

const TAROT_DECK_DATA_KEY = 'TarotDeck';
const MELEE_DECK_DATA_KEY = 'TarotMeleeDeck';
const SHIP_DECK_DATA_KEY  = 'TarotShipDeck';
const DECK_MAX_CARDS = 5;
const tarotLoadoutMutationTails = new Map();
const MINOR_ARCANA_SUIT_ORDER = Object.freeze({ wand: 1, sword: 2, cup: 3, pentacle: 4 });
const MINOR_ARCANA_FACE_RANKS = Object.freeze({ A: 1, ACE: 1, PAGE: 11, KNIGHT: 12, QUEEN: 13, KING: 14 });

function runTarotLoadoutMutation(playFabId, operation) {
    const key = String(playFabId || '').trim();
    const previous = tarotLoadoutMutationTails.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    tarotLoadoutMutationTails.set(key, current);
    return current.finally(() => {
        if (tarotLoadoutMutationTails.get(key) === current) {
            tarotLoadoutMutationTails.delete(key);
        }
    });
}

function resolveExpectedGuardianItemId(value, resolveItemId) {
    const rawItemId = String(value || '').trim();
    return rawItemId ? (resolveTarotCatalogItemId(rawItemId, resolveItemId) || null) : null;
}

// orientation → deckType
function getDeckType(orientation) {
    return 'tarot';
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

function normalizeDeckList(deck, resolveItemId) {
    const unique = [];
    (Array.isArray(deck) ? deck : []).forEach((itemRef) => {
        const id = resolveTarotCatalogItemId(getStoredTarotItemId(itemRef), resolveItemId);
        if (id && !unique.includes(id)) unique.push(id);
    });
    return unique.slice(0, DECK_MAX_CARDS);
}

function getTarotDeckSortKey(itemId, catalogCache) {
    const itemData = enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {});
    const fallback = String(itemId || '').match(/^(?:tarot[_-])?minor[_-](wand|sword|cup|pentacle)[_-]0*(\d{1,2})$/i);
    const rawSuitKey = String(itemData?.ArcanaSuit || itemData?.Suit || fallback?.[1] || '').trim().toLowerCase();
    const suitKey = { wands: 'wand', swords: 'sword', cups: 'cup', pentacles: 'pentacle' }[rawSuitKey] || rawSuitKey;
    const rawRank = String(itemData?.ArcanaRank || itemData?.Rank || itemData?.CardRank || itemData?.CardNumber || fallback?.[2] || '').trim();
    const numericRank = Number(rawRank);
    return {
        suitOrder: MINOR_ARCANA_SUIT_ORDER[suitKey] || 99,
        rankOrder: Number.isFinite(numericRank) ? numericRank : (MINOR_ARCANA_FACE_RANKS[rawRank.toUpperCase()] || 99),
        itemId: String(itemId || '')
    };
}

function sortTarotDeck(deck, catalogCache, resolveItemId) {
    return normalizeDeckList(deck, resolveItemId).sort((left, right) => {
        const leftKey = getTarotDeckSortKey(left, catalogCache);
        const rightKey = getTarotDeckSortKey(right, catalogCache);
        return (leftKey.suitOrder - rightKey.suitOrder)
            || (leftKey.rankOrder - rightKey.rankOrder)
            || leftKey.itemId.localeCompare(rightKey.itemId);
    });
}

function isMinorArcanaItem(itemId, catalogCache) {
    const itemData = enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {});
    const category = getCanonicalTarotCategory(itemData?.Category);
    return category === 'TarotMinor';
}

function filterMinorDeckIds(deck, catalogCache, resolveItemId) {
    const minorDeck = normalizeDeckList(deck, resolveItemId)
        .filter((itemId) => isMinorArcanaItem(itemId, catalogCache));
    return sortTarotDeck(minorDeck, catalogCache, resolveItemId);
}

function mergeLegacyDecks(primaryDeck, secondaryDeck, resolveItemId) {
    return normalizeDeckList([...(primaryDeck || []), ...(secondaryDeck || [])], resolveItemId);
}

function getInventoryItemAmount(items, itemId, resolveItemId) {
    const expectedIds = getTarotItemIdAliases(itemId, resolveItemId);
    return (items || []).reduce((total, item) => {
        const currentId = String(item?.Id || item?.ItemId || '').trim();
        const ownedIds = getTarotItemIdAliases(currentId, resolveItemId);
        if (!Array.from(ownedIds).some((alias) => expectedIds.has(alias))) return total;
        return total + (Number(item?.Amount ?? item?.amount ?? 0) || 0);
    }, 0);
}

function isTarotCardItem(itemId, catalogCache) {
    return isMinorArcanaItem(itemId, catalogCache);
}

function areDeckListsEqual(left, right) {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function readDecksFromData(data = {}, resolveItemId) {
    const hasCommonDeck = Object.prototype.hasOwnProperty.call(data, TAROT_DECK_DATA_KEY);
    const rawCommonDeck = normalizeDeckList(parseJsonSafe(data?.[TAROT_DECK_DATA_KEY]?.Value));
    const rawMeleeDeck = normalizeDeckList(parseJsonSafe(data?.[MELEE_DECK_DATA_KEY]?.Value));
    const rawShipDeck = normalizeDeckList(parseJsonSafe(data?.[SHIP_DECK_DATA_KEY]?.Value));
    const rawLegacyDeck = mergeLegacyDecks(rawMeleeDeck, rawShipDeck);
    // Some early builds created an empty common key before copying the still-valid
    // melee/ship loadout. Treat that state as unfinished migration, not as an
    // intentional request to erase the player's deck.
    const sourceDeck = hasCommonDeck && (rawCommonDeck.length > 0 || rawLegacyDeck.length === 0)
        ? rawCommonDeck
        : rawLegacyDeck;
    const tarotDeck = normalizeDeckList(sourceDeck, resolveItemId);
    const parsedGuardian = parseTarotGuardian(data?.[TAROT_GUARDIAN_DATA_KEY]?.Value);
    const guardianItemId = resolveTarotCatalogItemId(parsedGuardian.itemId, resolveItemId) || null;
    const guardian = { ...parsedGuardian, itemId: guardianItemId };
    const needsDeckMigration = (
        (!hasCommonDeck && tarotDeck.length > 0)
        || !areDeckListsEqual(rawCommonDeck, tarotDeck)
        || !areDeckListsEqual(rawMeleeDeck, tarotDeck)
        || !areDeckListsEqual(rawShipDeck, tarotDeck)
    );
    const needsGuardianMigration = Boolean(parsedGuardian.itemId)
        && parsedGuardian.itemId !== guardianItemId;
    return {
        tarotDeck,
        meleeDeck: tarotDeck,
        shipDeck: tarotDeck,
        guardian,
        needsDeckMigration,
        needsGuardianMigration
    };
}

async function readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId) {
    const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
        PlayFabId: playFabId,
        Keys: [TAROT_DECK_DATA_KEY, MELEE_DECK_DATA_KEY, SHIP_DECK_DATA_KEY, TAROT_GUARDIAN_DATA_KEY]
    });
    return readDecksFromData(result?.Data || {}, resolveItemId);
}

async function writeDecks(playFabId, decks, promisifyPlayFab, PlayFabServer, resolveItemId, catalogCache) {
    const unsortedDeck = decks.tarotDeck !== undefined
        ? normalizeDeckList(decks.tarotDeck, resolveItemId)
        : decks.meleeDeck !== undefined
            ? normalizeDeckList(decks.meleeDeck, resolveItemId)
            : decks.shipDeck !== undefined
                ? normalizeDeckList(decks.shipDeck, resolveItemId)
                : null;
    if (!unsortedDeck) return;
    const nextDeck = sortTarotDeck(unsortedDeck, catalogCache, resolveItemId);
    const encoded = JSON.stringify(nextDeck);
    const updateData = {
        [TAROT_DECK_DATA_KEY]: encoded,
        [MELEE_DECK_DATA_KEY]: encoded,
        [SHIP_DECK_DATA_KEY]: encoded
    };
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: updateData,
        Permission: 'Public'
    });
}

async function writeGuardian(playFabId, itemId, promisifyPlayFab, PlayFabServer, resolveItemId) {
    const resolvedItemId = resolveTarotCatalogItemId(itemId, resolveItemId) || null;
    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
        PlayFabId: playFabId,
        Data: {
            [TAROT_GUARDIAN_DATA_KEY]: serializeTarotGuardian(resolvedItemId)
        },
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
    const bonus = getTarotRoleBonus(role);
    return { ...role, filledCount, bonus, bonusText: bonus.bonusText || '役ボーナスなし' };
}

function initializeTarotDeckRoutes(app, deps) {
    const {
        promisifyPlayFab,
        PlayFabServer,
        catalogCache,
        getEntityKeyForPlayFabId,
        getAllInventoryItems,
        requireAuthenticatedPlayFabId,
        resolveItemId
    } = deps;

    async function requireAuthedPlayFabId(req, res, expectedPlayFabId) {
        if (typeof requireAuthenticatedPlayFabId !== 'function') {
            return String(expectedPlayFabId || '').trim();
        }
        return requireAuthenticatedPlayFabId(req, res, expectedPlayFabId);
    }

    async function requireOwnedTarotCard(playFabId, cardItemId) {
        const resolvedItemId = resolveTarotCatalogItemId(cardItemId, resolveItemId);
        if (!isTarotCardItem(resolvedItemId, catalogCache)) {
            return { ok: false, status: 400, error: 'MinorArcanaCardRequired' };
        }
        if (typeof getEntityKeyForPlayFabId !== 'function' || typeof getAllInventoryItems !== 'function') {
            throw new Error('InventoryDepsMissing');
        }
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const items = await getAllInventoryItems(entityKey);
        if (getInventoryItemAmount(items, resolvedItemId, resolveItemId) <= 0) {
            return { ok: false, status: 403, error: 'CardNotOwned' };
        }
        return { ok: true };
    }

    async function requireOwnedGuardianCard(playFabId, cardItemId) {
        const resolvedItemId = resolveTarotCatalogItemId(cardItemId, resolveItemId);
        const itemData = enrichTarotCatalogData(resolvedItemId, catalogCache?.[resolvedItemId] || {});
        if (!isMajorItem(itemData)) {
            return { ok: false, status: 400, error: 'MajorArcanaCardRequired' };
        }
        if (typeof getEntityKeyForPlayFabId !== 'function' || typeof getAllInventoryItems !== 'function') {
            throw new Error('InventoryDepsMissing');
        }
        const entityKey = await getEntityKeyForPlayFabId(playFabId);
        const items = await getAllInventoryItems(entityKey);
        if (getInventoryItemAmount(items, resolvedItemId, resolveItemId) <= 0) {
            return { ok: false, status: 403, error: 'CardNotOwned' };
        }
        return { ok: true };
    }

    function buildDeckResponse(decks) {
        const normalizedDeck = normalizeDeckList(
            decks?.tarotDeck || decks?.meleeDeck || decks?.shipDeck || [],
            resolveItemId
        );
        const tarotDeck = filterMinorDeckIds(normalizedDeck, catalogCache, resolveItemId);
        const tarotRole = evaluateDeckRole(tarotDeck.map((itemId) => enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {})));
        const guardianItemId = resolveTarotCatalogItemId(decks?.guardian?.itemId, resolveItemId);
        const guardian = buildTarotKingdomGuardian(guardianItemId, catalogCache);
        return {
            tarotDeck,
            meleeDeck: tarotDeck,
            shipDeck: tarotDeck,
            guardian,
            tarotRole,
            meleeRole: tarotRole,
            shipRole: tarotRole
        };
    }

    // デッキ取得
    app.post('/api/tarot-deck-get', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
            const response = buildDeckResponse(decks);
            if (decks.needsDeckMigration || !areDeckListsEqual(response.tarotDeck, decks.tarotDeck)) {
                await writeDecks(playFabId, { tarotDeck: response.tarotDeck }, promisifyPlayFab, PlayFabServer, resolveItemId, catalogCache);
            }
            if (decks.needsGuardianMigration && response.guardian?.itemId) {
                await writeGuardian(playFabId, response.guardian.itemId, promisifyPlayFab, PlayFabServer, resolveItemId);
            }
            return res.json({ ok: true, ...response });
        } catch (error) {
            console.error('[tarot-deck-get] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToGetTarotDecks' });
        }
    });

    // カードをデッキに装備
    app.post('/api/tarot-deck-equip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const cardItemId = String(req.body?.cardItemId || '').trim();
        const deckType   = String(req.body?.deckType   || 'tarot').trim(); // 'tarot' | legacy 'melee' | 'ship'
        if (!requestedPlayFabId)  return res.status(400).json({ error: 'playFabId is required' });
        if (!cardItemId) return res.status(400).json({ error: 'cardItemId is required' });
        if (deckType !== 'tarot' && deckType !== 'melee' && deckType !== 'ship') {
            return res.status(400).json({ error: 'deckType must be tarot, melee or ship' });
        }
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            return await runTarotLoadoutMutation(playFabId, async () => {
                const resolvedCardItemId = resolveTarotCatalogItemId(cardItemId, resolveItemId);
                const ownership = await requireOwnedTarotCard(playFabId, resolvedCardItemId);
                if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
                const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                const current = filterMinorDeckIds(decks.tarotDeck, catalogCache, resolveItemId);
                const result = equipCardToDeck(current, resolvedCardItemId);
                if (!result.ok) return res.status(400).json({ error: result.error });
                const updatedDeck = sortTarotDeck(result.deck, catalogCache, resolveItemId);
                const updated = { tarotDeck: updatedDeck, meleeDeck: updatedDeck, shipDeck: updatedDeck };
                await writeDecks(playFabId, { tarotDeck: updatedDeck }, promisifyPlayFab, PlayFabServer, resolveItemId, catalogCache);
                return res.json({ ok: true, ...buildDeckResponse(updated) });
            });
        } catch (error) {
            console.error('[tarot-deck-equip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToEquipTarotCard' });
        }
    });

    // カードをデッキから外す
    app.post('/api/tarot-deck-unequip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const cardItemId = String(req.body?.cardItemId || '').trim();
        const deckType   = String(req.body?.deckType   || 'tarot').trim();
        if (!requestedPlayFabId)  return res.status(400).json({ error: 'playFabId is required' });
        if (!cardItemId) return res.status(400).json({ error: 'cardItemId is required' });
        if (deckType !== 'tarot' && deckType !== 'melee' && deckType !== 'ship') {
            return res.status(400).json({ error: 'deckType must be tarot, melee or ship' });
        }
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            return await runTarotLoadoutMutation(playFabId, async () => {
                const resolvedCardItemId = resolveTarotCatalogItemId(cardItemId, resolveItemId);
                const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                const current = filterMinorDeckIds(decks.tarotDeck, catalogCache, resolveItemId);
                const result = unequipCardFromDeck(current, resolvedCardItemId);
                const updatedDeck = sortTarotDeck(result.deck, catalogCache, resolveItemId);
                const updated = { tarotDeck: updatedDeck, meleeDeck: updatedDeck, shipDeck: updatedDeck };
                await writeDecks(playFabId, { tarotDeck: updatedDeck }, promisifyPlayFab, PlayFabServer, resolveItemId, catalogCache);
                return res.json({ ok: true, ...buildDeckResponse(updated) });
            });
        } catch (error) {
            console.error('[tarot-deck-unequip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToUnequipTarotCard' });
        }
    });

    app.post('/api/tarot-guardian-equip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const cardItemId = String(req.body?.cardItemId || '').trim();
        const hasExpectedGuardian = Object.prototype.hasOwnProperty.call(req.body || {}, 'expectedGuardianItemId');
        const expectedGuardianItemId = hasExpectedGuardian
            ? resolveExpectedGuardianItemId(req.body?.expectedGuardianItemId, resolveItemId)
            : null;
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!cardItemId) return res.status(400).json({ error: 'cardItemId is required' });
        if (!hasExpectedGuardian) return res.status(400).json({ error: 'expectedGuardianItemId is required' });
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            return await runTarotLoadoutMutation(playFabId, async () => {
                const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                const currentGuardianItemId = String(decks.guardian?.itemId || '') || null;
                if (currentGuardianItemId !== expectedGuardianItemId) {
                    return res.status(409).json({
                        error: 'GuardianChanged',
                        ...buildDeckResponse(decks)
                    });
                }
                const resolvedCardItemId = resolveTarotCatalogItemId(cardItemId, resolveItemId);
                const ownership = await requireOwnedGuardianCard(playFabId, resolvedCardItemId);
                if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
                await writeGuardian(playFabId, resolvedCardItemId, promisifyPlayFab, PlayFabServer, resolveItemId);
                const updatedDecks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                return res.json({ ok: true, ...buildDeckResponse(updatedDecks) });
            });
        } catch (error) {
            console.error('[tarot-guardian-equip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToEquipTarotGuardian' });
        }
    });

    app.post('/api/tarot-guardian-unequip', async (req, res) => {
        const requestedPlayFabId = String(req.body?.playFabId || '').trim();
        const hasExpectedGuardian = Object.prototype.hasOwnProperty.call(req.body || {}, 'expectedGuardianItemId');
        const expectedGuardianItemId = hasExpectedGuardian
            ? resolveExpectedGuardianItemId(req.body?.expectedGuardianItemId, resolveItemId)
            : null;
        if (!requestedPlayFabId) return res.status(400).json({ error: 'playFabId is required' });
        if (!hasExpectedGuardian || !expectedGuardianItemId) {
            return res.status(400).json({ error: 'expectedGuardianItemId is required' });
        }
        const playFabId = await requireAuthedPlayFabId(req, res, requestedPlayFabId);
        if (!playFabId) return;
        try {
            return await runTarotLoadoutMutation(playFabId, async () => {
                const decks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                const currentGuardianItemId = String(decks.guardian?.itemId || '') || null;
                if (currentGuardianItemId !== expectedGuardianItemId) {
                    return res.status(409).json({
                        error: 'GuardianChanged',
                        ...buildDeckResponse(decks)
                    });
                }
                await writeGuardian(playFabId, null, promisifyPlayFab, PlayFabServer, resolveItemId);
                const updatedDecks = await readDecks(playFabId, promisifyPlayFab, PlayFabServer, resolveItemId);
                return res.json({ ok: true, ...buildDeckResponse(updatedDecks) });
            });
        } catch (error) {
            console.error('[tarot-guardian-unequip] Error:', error?.message || error);
            return res.status(500).json({ error: 'FailedToUnequipTarotGuardian' });
        }
    });
}

module.exports = {
    TAROT_DECK_DATA_KEY,
    MELEE_DECK_DATA_KEY,
    SHIP_DECK_DATA_KEY,
    TAROT_GUARDIAN_DATA_KEY,
    DECK_MAX_CARDS,
    getDeckType,
    readDecks,
    readDecksFromData,
    writeDecks,
    writeGuardian,
    equipCardToDeck,
    unequipCardFromDeck,
    sortTarotDeck,
    filterMinorDeckIds,
    isMinorArcanaItem,
    buildDeckRoleCards,
    evaluateDeckRole,
    initializeTarotDeckRoutes
};
