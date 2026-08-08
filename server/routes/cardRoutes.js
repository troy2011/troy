// server/routes/cardRoutes.js
// タロットカードのレベル・育成管理
//
// GET  /api/cards          所有カード一覧（PlayFab量 + Firestoreレベル合算）
// POST /api/cards/levelup  シャード消費でカードをレベルアップ

const admin = require('firebase-admin');
const { enrichTarotCatalogData, isTarotMajorCategory, isTarotMinorCategory } = require('../tarotCards');
const { getPublicTarotBattleSkills } = require('../tarotBattleSkills');

const LEVELS_PER_STAGE = 5;
const MAJOR_MAX_STAGES = 5;
const MINOR_MAX_STAGES = 3;

// ステージ数からレベル上限を計算
function getMaxLevel(isMajor, quantity) {
    const maxStages = isMajor ? MAJOR_MAX_STAGES : MINOR_MAX_STAGES;
    return Math.min(quantity, maxStages) * LEVELS_PER_STAGE;
}

// 次のレベルに上げるシャードコスト（Lv n → n+1）
function shardCost(currentLevel) {
    return (currentLevel + 1) * 10;
}

// Firestoreのカードドキュメントを取得（なければ空のmap）
async function getCardDoc(playFabId) {
    const ref = admin.firestore().collection('playerCards').doc(playFabId);
    const snap = await ref.get();
    return snap.exists ? snap.data() : { cards: {} };
}

// ── ルート登録 ────────────────────────────────────────────────
function initializeCardRoutes(app, deps) {
    const {
        promisifyPlayFab,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        catalogCache,
        requireAuthenticatedPlayFabId,
    } = deps;

    async function getEntityKey(playFabId) {
        return getEntityKeyFromPlayFabId(playFabId);
    }

    async function fetchInventoryCards(entityKey) {
        const items = [];
        let token = null;
        do {
            const result = await promisifyPlayFab(PlayFabEconomy.GetInventoryItems, {
                Entity: entityKey,
                Count: 50,
                ContinuationToken: token || undefined,
            });
            const page = Array.isArray(result?.Items) ? result.Items : [];
            items.push(...page);
            token = result?.ContinuationToken || null;
        } while (token);

        // タロットカードのみ抽出
        return items.filter((item) => {
            const cat = String(enrichTarotCatalogData(item.Id, catalogCache[item.Id] || {}).Category || '').trim();
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
                getCardDoc(playFabId),
            ]);
            const levels = cardDoc.cards || {};

            const cards = inventoryItems.map((item) => {
                const itemId   = item.Id;
                const quantity = Number(item.Amount ?? 0);
                const catalogData = enrichTarotCatalogData(itemId, catalogCache[itemId] || {});
                const cat      = String(catalogData.Category || '').trim();
                const isMajor  = isTarotMajorCategory(cat);
                const level    = levels[itemId]?.level ?? 0;
                const maxLevel = getMaxLevel(isMajor, quantity);
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
            const cat      = String(enrichTarotCatalogData(itemId, catalogCache[itemId] || {}).Category || '').trim();
            const isMajor  = isTarotMajorCategory(cat);
            const maxLevel = getMaxLevel(isMajor, quantity);

            // Firestoreのシャードとレベルをトランザクションで更新
            const db = admin.firestore();
            const cardRef  = db.collection('playerCards').doc(playFabId);
            const statRef  = db.collection('playerStats').doc(playFabId);

            const result = await db.runTransaction(async (tx) => {
                const [cardSnap, statSnap] = await Promise.all([
                    tx.get(cardRef),
                    tx.get(statRef),
                ]);

                const cards         = cardSnap.exists ? (cardSnap.data().cards || {}) : {};
                const currentLevel  = cards[itemId]?.level ?? 0;
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

                return { newLevel, cost, maxLevel, shardsAfter: shards - cost };
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

module.exports = { initializeCardRoutes };
