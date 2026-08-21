// server/routes/cardRoutes.js
// タロットカードのレベル・育成管理
//
// GET  /api/cards          所有カード一覧（PlayFab量 + Firestoreレベル合算）
// POST /api/cards/levelup  シャード消費でカードをレベルアップ

const admin = require('firebase-admin');
const { enrichTarotCatalogData, isTarotMajorCategory, isTarotMinorCategory } = require('../tarotCards');
const { getPublicTarotBattleSkills } = require('../tarotBattleSkills');

const BASE_MAX_LEVEL = 10;
const LEVELS_PER_EXTRA_COPY = 5;
const MAJOR_MAX_LEVEL = 25;
const MINOR_MAX_LEVEL = 15;

// 1枚でLv10まで。余剰カードは上限だけを拡張し、消費しない。
function getMaxLevel(isMajor, quantity) {
    const copies = Math.max(1, Math.floor(Number(quantity) || 0));
    const extraCopies = isMajor
        ? Math.min(3, Math.max(0, copies - 1))
        : Math.min(1, Math.max(0, copies - 1));
    const maxLevel = BASE_MAX_LEVEL + (extraCopies * LEVELS_PER_EXTRA_COPY);
    return Math.min(isMajor ? MAJOR_MAX_LEVEL : MINOR_MAX_LEVEL, maxLevel);
}

function normalizeCardLevel(value, maxLevel = Infinity) {
    const level = Math.max(1, Math.floor(Number(value) || 1));
    return Math.min(level, Math.max(1, Number(maxLevel) || 1));
}

// 次のレベルに上げるシャードコスト（2Lvごとに1ずつ増加）
function shardCost(currentLevel) {
    return Math.max(1, Math.ceil(normalizeCardLevel(currentLevel) / 2));
}

// Firestoreのカードドキュメントを取得（なければ空のmap）
async function getCardDoc(playFabId, firestore) {
    if (!firestore || typeof firestore.collection !== 'function') {
        return { cards: {} };
    }
    const ref = firestore.collection('playerCards').doc(playFabId);
    const snap = await ref.get();
    return snap.exists ? snap.data() : { cards: {} };
}

// ── ルート登録 ────────────────────────────────────────────────
function initializeCardRoutes(app, deps) {
    const {
        getEntityKeyFromPlayFabId,
        getAllInventoryItems,
        catalogCache,
        firestore,
        requireAuthenticatedPlayFabId,
    } = deps;

    async function getEntityKey(playFabId) {
        return getEntityKeyFromPlayFabId(playFabId);
    }

    async function fetchInventoryCards(entityKey) {
        if (typeof getAllInventoryItems !== 'function') {
            throw new Error('Shared Economy V2 inventory accessor is unavailable.');
        }
        const items = await getAllInventoryItems(entityKey);

        return (Array.isArray(items) ? items : []).filter((item) => {
            const itemId = String(item?.Id || '').trim();
            if (!itemId) return false;
            const cat = String(enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {}).Category || '').trim();
            return isTarotMajorCategory(cat) || isTarotMinorCategory(cat);
        });
    }

    // ── 所有カード一覧 ────────────────────────────────────────
    app.get('/api/tarot-battle-skills', (_req, res) => {
        res.json({
            ok: true,
            cards: getPublicTarotBattleSkills()
        });
    });

    // ── 所有カード一覧 ────────────────────────────────────────
    app.get('/api/cards', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = req.authenticatedPlayFabId;
        try {
            const entityKey = await getEntityKey(playFabId);
            const [inventoryItems, cardDoc] = await Promise.all([
                fetchInventoryCards(entityKey),
                getCardDoc(playFabId, firestore).catch((error) => {
                    console.warn('[cards] level data unavailable; returning owned cards without levels:', error?.message || error);
                    return { cards: {} };
                }),
            ]);
            const levels = cardDoc.cards || {};

            const cards = inventoryItems.map((item) => {
                const itemId   = item.Id;
                const quantity = Number(item.Amount ?? 0);
                const catalogData = enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {});
                const cat      = String(catalogData.Category || '').trim();
                const isMajor  = isTarotMajorCategory(cat);
                const maxLevel = getMaxLevel(isMajor, quantity);
                const level    = normalizeCardLevel(levels[itemId]?.level, maxLevel);
                const nextCost = level < maxLevel ? shardCost(level) : null;

                return {
                    itemId,
                    quantity,
                    level,
                    maxLevel,
                    isMajor,
                    nextLevelCost: nextCost,
                    displayName: catalogData.DisplayName ?? itemId,
                };
            });

            res.json({ cards });
        } catch (err) {
            console.error('[cards] list error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── レベルアップ ──────────────────────────────────────────
    app.post('/api/cards/levelup', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = req.authenticatedPlayFabId;
        const { itemId } = req.body;
        if (!itemId) return res.status(400).json({ error: 'itemId は必須です' });

        try {
            const entityKey = await getEntityKey(playFabId);

            // PlayFabインベントリから該当カードの quantity 取得
            const inventoryItems = await fetchInventoryCards(entityKey);
            const owned = inventoryItems.find((i) => i.Id === itemId);
            if (!owned) return res.status(404).json({ error: 'カードを所持していません' });

            const quantity = Number(owned.Amount ?? 0);
            const cat      = String(enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {}).Category || '').trim();
            const isMajor  = isTarotMajorCategory(cat);
            const maxLevel = getMaxLevel(isMajor, quantity);

            // Firestoreのシャードとレベルをトランザクションで更新
            const db = firestore || admin.firestore();
            const cardRef  = db.collection('playerCards').doc(playFabId);
            const statRef  = db.collection('playerStats').doc(playFabId);

            const result = await db.runTransaction(async (tx) => {
                const [cardSnap, statSnap] = await Promise.all([
                    tx.get(cardRef),
                    tx.get(statRef),
                ]);

                const cards         = cardSnap.exists ? (cardSnap.data().cards || {}) : {};
                const currentLevel  = normalizeCardLevel(cards[itemId]?.level, maxLevel);
                const shards        = statSnap.exists ? (statSnap.data().arcanaShards ?? 0) : 0;

                if (currentLevel >= maxLevel) {
                    throw Object.assign(new Error('レベル上限に達しています'), { code: 'MAX_LEVEL' });
                }

                const cost = shardCost(currentLevel);
                if (shards < cost) {
                    throw Object.assign(new Error(`シャードが不足しています（必要: ${cost}、所持: ${shards}）`), { code: 'INSUFFICIENT_SHARDS' });
                }

                const newLevel = currentLevel + 1;
                tx.set(cardRef, {
                    cards: { ...cards, [itemId]: { level: newLevel } },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                tx.set(statRef, {
                    arcanaShards: admin.firestore.FieldValue.increment(-cost),
                }, { merge: true });

                return {
                    newLevel,
                    cost,
                    maxLevel,
                    shardsAfter: shards - cost,
                    nextLevelCost: newLevel < maxLevel ? shardCost(newLevel) : null
                };
            });

            res.json({ success: true, itemId, ...result });
        } catch (err) {
            if (err.code === 'MAX_LEVEL' || err.code === 'INSUFFICIENT_SHARDS') {
                return res.status(400).json({ error: err.message });
            }
            console.error('[cards] levelup error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });
}

module.exports = { initializeCardRoutes, getMaxLevel, normalizeCardLevel, shardCost };
