// server/routes/npcSnapshotRoutes.js
// NPC スナップショット（プレイヤーデータコピー）管理
//
// POST /api/npc-snapshot/update   自分のスナップショットを保存・更新
// GET  /api/npc-snapshot/:playFabId  スナップショット取得（バトルルーム生成時用）

const admin = require('firebase-admin');

const SNAPSHOT_COLLECTION = 'npcSnapshots';
const SNAPSHOT_MAX_SHIP_SKILLS = 5;
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日間有効

// ────────────────────────────────────────────────────────────
// スナップショット構造ビルダー
// ────────────────────────────────────────────────────────────
function buildSnapshot(playFabId, body) {
    const now = Date.now();
    return {
        playFabId:   String(playFabId || '').toUpperCase(),
        displayName: String(body.displayName || ''),
        nation:      String(body.nation || 'neutral'),
        shipId:      String(body.shipId || ''),
        shipName:    String(body.shipName || ''),
        atk:         Math.max(0, Number(body.atk) || 0),
        def:         Math.max(0, Number(body.def) || 0),
        hp:          Math.max(1, Number(body.hp) || 100),
        speed:       Math.max(0, Number(body.speed) || 1),
        shipSkills:  buildShipSkills(body.shipSkills),
        updatedAt:   now,
        expiresAt:   now + SNAPSHOT_TTL_MS
    };
}

function buildShipSkills(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, SNAPSHOT_MAX_SHIP_SKILLS).map((s) => ({
        cardItemId:  String(s.cardItemId || ''),
        skillName:   String(s.skillName || ''),
        element:     String(s.element || 'none'),
        activationType: String(s.activationType || 'manual'),
        cooldown:    Math.max(0, Number(s.cooldown) || 0),
        effect:      s.effect && typeof s.effect === 'object' ? s.effect : {}
    }));
}

// ────────────────────────────────────────────────────────────
// ルート初期化
// ────────────────────────────────────────────────────────────
function initializeNpcSnapshotRoutes(app, promisifyPlayFab, PlayFabServer, authTools = {}) {
    const firestore = admin.firestore();
    const { requireAuthenticatedPlayFabId } = authTools;

    // ── スナップショット更新 ──────────────────────────────────
    app.post('/api/npc-snapshot/update', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = req.authenticatedPlayFabId;
        if (!playFabId) return res.status(401).json({ error: 'Unauthorized' });

        const snapshot = buildSnapshot(playFabId, req.body);

        try {
            await firestore
                .collection(SNAPSHOT_COLLECTION)
                .doc(playFabId)
                .set(snapshot, { merge: false });

            return res.json({ success: true, snapshot });
        } catch (err) {
            console.error('[npcSnapshot] update error:', err?.message || err);
            return res.status(500).json({ error: 'Snapshot update failed' });
        }
    });

    // ── スナップショット取得 ─────────────────────────────────
    app.get('/api/npc-snapshot/:playFabId', async (req, res) => {
        const targetId = String(req.params.playFabId || '').toUpperCase();
        if (!targetId) return res.status(400).json({ error: 'playFabId required' });

        try {
            const snap = await firestore.collection(SNAPSHOT_COLLECTION).doc(targetId).get();
            if (!snap.exists) return res.status(404).json({ error: 'Snapshot not found' });

            const data = snap.data();
            if (data.expiresAt < Date.now()) {
                // 期限切れ — 削除して404
                await snap.ref.delete().catch(() => {});
                return res.status(404).json({ error: 'Snapshot expired' });
            }
            return res.json({ snapshot: data });
        } catch (err) {
            console.error('[npcSnapshot] get error:', err?.message || err);
            return res.status(500).json({ error: 'Snapshot fetch failed' });
        }
    });

    // ── 国内プレイヤーのスナップショット一覧（NPC選定用）──────
    app.get('/api/npc-snapshot/nation/:nation', async (req, res) => {
        const nation = String(req.params.nation || '').toLowerCase();
        const limit  = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
        const now    = Date.now();

        try {
            const query = await firestore
                .collection(SNAPSHOT_COLLECTION)
                .where('nation', '==', nation)
                .where('expiresAt', '>', now)
                .orderBy('expiresAt', 'desc')
                .limit(limit)
                .get();

            const snapshots = query.docs.map((d) => d.data());
            return res.json({ snapshots });
        } catch (err) {
            console.error('[npcSnapshot] nation list error:', err?.message || err);
            return res.status(500).json({ error: 'Snapshot list failed' });
        }
    });
}

module.exports = { initializeNpcSnapshotRoutes };
