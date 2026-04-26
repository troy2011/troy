// server/routes/territoryRoutes.js
// 領海占領状態管理 API
//
// GET  /api/territory                    全領海の現在状態
// GET  /api/territory/:territoryId       特定領海の状態
// GET  /api/territory/:territoryId/history  占領履歴（最新20件）

const admin = require('firebase-admin');
const { getTerritoryIds, getTerritory } = require('../tarotTerritories');

// ── Firestore 参照 ────────────────────────────────────────────
function db() {
    return admin.firestore();
}

// ── 領海ドキュメントの初期値 ─────────────────────────────────
function defaultTerritoryDoc(territoryId) {
    const territory = getTerritory(territoryId);
    return {
        territoryId,
        name:        territory?.name                 || territoryId,
        arcanaName:  territory?.symbolDef?.arcana    || '',
        symbolName:  territory?.symbolDef?.name      || '',
        element:     territory?.element              || 'neutral',
        symbol:      territory?.symbol               || '',
        isCapital:   territory?.isCapital            || false,
        ownerNation: territory?.ownerNation          || null,
        ownerPlayFabId: null,
        ownerDisplayName: null,
        capturedAt:  null,
        captureCount: 0,
        levels:      territory?.defaultLevels        || { military: 1, economy: 1, support: 1 },
    };
}

// ── 全領海状態取得 ────────────────────────────────────────────
async function getAllTerritories() {
    const ids  = getTerritoryIds();
    const snap = await db().collection('territories').get();

    const stored = {};
    snap.forEach((doc) => { stored[doc.id] = doc.data(); });

    return ids.map((id) => ({
        ...defaultTerritoryDoc(id),
        ...(stored[id] || {}),
    }));
}

// ── 単一領海状態取得 ──────────────────────────────────────────
async function getOneTerritoryState(territoryId) {
    const doc = await db().collection('territories').doc(territoryId).get();
    return {
        ...defaultTerritoryDoc(territoryId),
        ...(doc.exists ? doc.data() : {}),
    };
}

// ── ルート登録 ────────────────────────────────────────────────
function initializeTerritoryRoutes(app, _promisifyPlayFab, _PlayFabServer, authTools) {
    const { requireAuthenticatedPlayFabId } = authTools;

    // 全領海一覧
    app.get('/api/territory', async (req, res) => {
        try {
            const territories = await getAllTerritories();
            res.json({ territories });
        } catch (err) {
            console.error('[territory] GET /api/territory error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // 特定領海
    app.get('/api/territory/:territoryId', async (req, res) => {
        const { territoryId } = req.params;
        if (!getTerritory(territoryId)) {
            return res.status(404).json({ error: '領海が見つかりません' });
        }
        try {
            const territory = await getOneTerritoryState(territoryId);
            res.json({ territory });
        } catch (err) {
            console.error('[territory] GET error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // 占領履歴
    app.get('/api/territory/:territoryId/history', async (req, res) => {
        const { territoryId } = req.params;
        if (!getTerritory(territoryId)) {
            return res.status(404).json({ error: '領海が見つかりません' });
        }
        try {
            const snap = await db()
                .collection('territories')
                .doc(territoryId)
                .collection('history')
                .orderBy('capturedAt', 'desc')
                .limit(20)
                .get();

            const history = snap.docs.map((d) => d.data());
            res.json({ history });
        } catch (err) {
            console.error('[territory] history error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });
}

module.exports = { initializeTerritoryRoutes };
