// server/routes/cardRoutes.js
// タロットカードのレベル・育成管理
//
// GET  /api/cards          所有カード一覧（PlayFab量 + Firestoreレベル合算）
// POST /api/cards/levelup  同名カードをレベルに応じた枚数だけ消費してレベルアップ

const admin = require('firebase-admin');
const { enrichTarotCatalogData, isTarotMajorCategory, isTarotMinorCategory } = require('../tarotCards');
const { getPublicTarotBattleSkills } = require('../tarotBattleSkills');

const MAJOR_MAX_LEVEL = 25;
const MINOR_MAX_LEVEL = 15;
const cardLevelMutationTails = new Map();

function getMaxLevel(isMajor) {
    return isMajor ? MAJOR_MAX_LEVEL : MINOR_MAX_LEVEL;
}

function normalizeCardLevel(value, maxLevel = Infinity) {
    const level = Math.max(1, Math.floor(Number(value) || 1));
    return Math.min(level, Math.max(1, Number(maxLevel) || 1));
}

function getDuplicateCount(quantity) {
    return Math.max(0, Math.floor(Number(quantity) || 0) - 1);
}

// Lv1-5は1枚、以後5Lvごとに必要な同名カードを1枚ずつ増やす。
function getDuplicateCost(currentLevel) {
    const level = normalizeCardLevel(currentLevel);
    return 1 + Math.floor((level - 1) / 5);
}

function getDuplicateRequirementError(duplicateCost) {
    const required = Math.max(1, Math.floor(Number(duplicateCost) || 1));
    return `同じカードの予備が${required}枚必要です。最後の1枚は残ります。`;
}

function getCardLevelOperationId(playFabId, itemId, currentLevel) {
    return `${String(playFabId || '').trim()}:${String(itemId || '').trim()}:${Math.max(1, Math.floor(Number(currentLevel) || 1))}`;
}

function isInsufficientInventoryError(error) {
    const code = String(error?.apiErrorInfo?.apiError || error?.code || '').toLowerCase();
    const message = String(error?.errorMessage || error?.message || '').toLowerCase();
    return code.includes('insufficient')
        || message.includes('insufficient')
        || message.includes('not enough');
}

function runCardLevelMutation(playFabId, operation) {
    const key = String(playFabId || '').trim();
    const previous = cardLevelMutationTails.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    cardLevelMutationTails.set(key, current);
    return current.finally(() => {
        if (cardLevelMutationTails.get(key) === current) {
            cardLevelMutationTails.delete(key);
        }
    });
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
        subtractEconomyItem,
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

    function buildCardPayload(item, levels = {}) {
        const itemId = String(item?.Id || '').trim();
        const quantity = Math.max(0, Math.floor(Number(item?.Amount ?? 0) || 0));
        const catalogData = enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {});
        const category = String(catalogData.Category || '').trim();
        const isMajor = isTarotMajorCategory(category);
        const maxLevel = getMaxLevel(isMajor);
        const level = normalizeCardLevel(levels[itemId]?.level, maxLevel);
        const duplicateCount = getDuplicateCount(quantity);
        const duplicateCost = level < maxLevel ? getDuplicateCost(level) : null;

        return {
            itemId,
            quantity,
            level,
            maxLevel,
            isMajor,
            duplicateCount,
            duplicateCost,
            canLevelUp: duplicateCost !== null && duplicateCount >= duplicateCost,
            displayName: catalogData.DisplayName ?? itemId,
        };
    }

    // ── タロットバトルスキル一覧 ──────────────────────────────
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
            const cards = inventoryItems.map((item) => buildCardPayload(item, levels));

            res.json({ cards });
        } catch (err) {
            console.error('[cards] list error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── レベルアップ ──────────────────────────────────────────
    app.post('/api/cards/levelup', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = req.authenticatedPlayFabId;
        const itemId = String(req.body?.itemId || '').trim();
        if (!itemId) return res.status(400).json({ error: 'itemId は必須です' });
        if (typeof subtractEconomyItem !== 'function') {
            return res.status(500).json({ error: 'カード素材を消費する処理を利用できません。' });
        }

        try {
            const result = await runCardLevelMutation(playFabId, async () => {
                const entityKey = await getEntityKey(playFabId);
                const inventoryItems = await fetchInventoryCards(entityKey);
                const owned = inventoryItems.find((item) => String(item?.Id || '').trim() === itemId);
                if (!owned) {
                    throw Object.assign(new Error('カードを所持していません'), { code: 'CARD_NOT_OWNED' });
                }

                const catalogData = enrichTarotCatalogData(itemId, catalogCache?.[itemId] || {});
                const category = String(catalogData.Category || '').trim();
                const isMajor = isTarotMajorCategory(category);
                const maxLevel = getMaxLevel(isMajor);
                const quantity = Math.max(0, Math.floor(Number(owned.Amount ?? 0) || 0));
                const db = firestore || admin.firestore();
                const cardRef = db.collection('playerCards').doc(playFabId);

                const cardSnap = await cardRef.get();
                const cards = cardSnap.exists ? (cardSnap.data().cards || {}) : {};
                const currentLevel = normalizeCardLevel(cards[itemId]?.level, maxLevel);
                if (currentLevel >= maxLevel) {
                    throw Object.assign(new Error('レベル上限に達しています'), { code: 'MAX_LEVEL' });
                }
                const duplicateCost = getDuplicateCost(currentLevel);

                const operationId = getCardLevelOperationId(playFabId, itemId, currentLevel);
                const operationRef = db.collection('playerCardLevelOperations').doc(operationId);
                const preparation = await db.runTransaction(async (tx) => {
                    const [freshCardSnap, operationSnap] = await Promise.all([
                        tx.get(cardRef),
                        tx.get(operationRef),
                    ]);
                    const freshCards = freshCardSnap.exists ? (freshCardSnap.data().cards || {}) : {};
                    const freshLevel = normalizeCardLevel(freshCards[itemId]?.level, maxLevel);
                    const existingOperation = operationSnap.exists ? (operationSnap.data() || {}) : null;

                    if (existingOperation) {
                        return {
                            alreadyCompleted: existingOperation.status === 'completed',
                            currentLevel: freshLevel,
                            operation: existingOperation,
                        };
                    }
                    if (freshLevel !== currentLevel) {
                        return { currentLevel: freshLevel, retry: true };
                    }
                    if (getDuplicateCount(quantity) < duplicateCost) {
                        throw Object.assign(new Error(getDuplicateRequirementError(duplicateCost)), { code: 'INSUFFICIENT_DUPLICATES' });
                    }

                    const operation = {
                        status: 'pending',
                        playFabId,
                        itemId,
                        baseLevel: currentLevel,
                        newLevel: currentLevel + 1,
                        maxLevel,
                        duplicateCost,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    tx.set(operationRef, operation);
                    return { currentLevel, operation };
                });

                if (preparation.retry) {
                    throw Object.assign(new Error('カードの状態が更新されました。もう一度お試しください。'), { code: 'CARD_STATE_CHANGED' });
                }

                const operation = preparation.operation;
                if (preparation.alreadyCompleted) {
                    const materialsConsumed = Math.max(1, Math.floor(Number(operation.duplicateCost) || duplicateCost));
                    const quantityAfter = Math.max(0, quantity - materialsConsumed);
                    const newLevel = Math.max(1, Number(operation.newLevel) || currentLevel);
                    const nextDuplicateCost = newLevel < maxLevel ? getDuplicateCost(newLevel) : null;
                    return {
                        newLevel,
                        maxLevel,
                        quantity: quantityAfter,
                        duplicateCount: getDuplicateCount(quantityAfter),
                        duplicateCost: nextDuplicateCost,
                        canLevelUp: nextDuplicateCost !== null && getDuplicateCount(quantityAfter) >= nextDuplicateCost,
                        duplicateConsumed: true,
                        materialsConsumed,
                        alreadyCompleted: true,
                    };
                }

                const idempotencyId = `card-levelup-${operationId}`;
                await subtractEconomyItem(playFabId, itemId, duplicateCost, {
                    entityKeyOverride: entityKey,
                    idempotencyId,
                });

                const completed = await db.runTransaction(async (tx) => {
                    const [freshCardSnap, freshOperationSnap] = await Promise.all([
                        tx.get(cardRef),
                        tx.get(operationRef),
                    ]);
                    const freshCards = freshCardSnap.exists ? (freshCardSnap.data().cards || {}) : {};
                    const freshLevel = normalizeCardLevel(freshCards[itemId]?.level, maxLevel);
                    const freshOperation = freshOperationSnap.exists ? (freshOperationSnap.data() || {}) : operation;
                    const newLevel = Math.max(1, Number(freshOperation.newLevel) || currentLevel + 1);

                    if (freshOperation.status !== 'completed' && freshLevel < newLevel) {
                        tx.set(cardRef, {
                            cards: { ...freshCards, [itemId]: { level: newLevel } },
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true });
                    }
                    if (freshOperation.status !== 'completed') {
                        tx.set(operationRef, {
                            ...freshOperation,
                            status: 'completed',
                            completedAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true });
                    }
                    return { newLevel: Math.max(freshLevel, newLevel) };
                });

                const quantityAfter = Math.max(0, quantity - duplicateCost);
                const nextDuplicateCost = completed.newLevel < maxLevel ? getDuplicateCost(completed.newLevel) : null;
                return {
                    newLevel: completed.newLevel,
                    maxLevel,
                    quantity: quantityAfter,
                    duplicateCount: getDuplicateCount(quantityAfter),
                    duplicateCost: nextDuplicateCost,
                    canLevelUp: nextDuplicateCost !== null && getDuplicateCount(quantityAfter) >= nextDuplicateCost,
                    duplicateConsumed: true,
                    materialsConsumed: duplicateCost,
                };
            });

            res.json({ success: true, itemId, ...result });
        } catch (err) {
            if (['CARD_NOT_OWNED', 'MAX_LEVEL', 'INSUFFICIENT_DUPLICATES', 'CARD_STATE_CHANGED'].includes(err.code)) {
                return res.status(400).json({ error: err.message });
            }
            if (isInsufficientInventoryError(err)) {
                return res.status(400).json({ error: '必要な同名カードが不足しています。最後の1枚は残ります。' });
            }
            console.error('[cards] levelup error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });
}

module.exports = {
    initializeCardRoutes,
    getMaxLevel,
    normalizeCardLevel,
    getDuplicateCount,
    getDuplicateCost,
    getDuplicateRequirementError,
    getCardLevelOperationId,
    isInsufficientInventoryError,
};
