// server/routes/weeklyContestRoutes.js
// 週次争奪ウィンドウ API
//
// GET  /api/weekly-contest/status            現在の争奪状態
// POST /api/weekly-contest/damage            拠点ダメージを記録
// POST /api/weekly-contest/open              ウィンドウ開放（管理者/Cron）
// POST /api/weekly-contest/close             ウィンドウ終了・勝者確定（管理者/Cron）
// GET  /api/weekly-contest/passives/:nation  国家が受けるアルカナパッシブ一覧
// GET  /api/weekly-contest/season            現在のシーズン情報
// POST /api/weekly-contest/season-end        シーズン強制終了（管理者）

const admin = require('firebase-admin');
const { getTerritory, getNationPassives } = require('../tarotTerritories');
const { addGlobalChatMessage } = require('../chat');

const NATIONS = ['fire', 'water', 'wind', 'earth'];
const SEASON_LENGTH = 22; // 大アルカナ22領海 = 1シーズン

function db() { return admin.firestore(); }

// ── ウィンドウ時刻計算 ────────────────────────────────────────
function getNextSundayWindow() {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jst = new Date(now.getTime() + jstOffset);
    const day = jst.getUTCDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    const nextSunday = new Date(jst);
    nextSunday.setUTCDate(jst.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(12, 0, 0, 0); // 21:00 JST = 12:00 UTC
    return new Date(nextSunday.getTime() - jstOffset);
}

// ── アクティブ争奪ドキュメント取得 ────────────────────────────
async function getActiveContest() {
    const snap = await db().collection('weeklyContests')
        .where('status', '==', 'open')
        .orderBy('windowStart', 'desc')
        .limit(1)
        .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── アクティブシーズン取得 ────────────────────────────────────
async function getActiveSeason() {
    const snap = await db().collection('seasons')
        .where('status', '==', 'active')
        .orderBy('startedAt', 'desc')
        .limit(1)
        .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// アクティブシーズンを取得、なければ新規作成
async function getOrCreateSeason() {
    const existing = await getActiveSeason();
    if (existing) return existing;

    const lastSnap = await db().collection('seasons')
        .orderBy('seasonNumber', 'desc')
        .limit(1)
        .get();
    const lastNumber = lastSnap.empty ? 0 : (lastSnap.docs[0].data().seasonNumber || 0);

    const ref = await db().collection('seasons').add({
        status: 'active',
        seasonNumber: lastNumber + 1,
        contestCount: 0,
        winner: null,
        nationTerritoryCount: null,
        territorySnapshot: null,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        endedAt: null,
    });
    console.log(`[weekly-contest] Season ${lastNumber + 1} started (${ref.id})`);
    return { id: ref.id, seasonNumber: lastNumber + 1, contestCount: 0 };
}

// ── シーズン終了処理 ──────────────────────────────────────────
async function endSeason(seasonId, seasonNumber) {
    // 大アルカナ領海の ownerNation を集計
    const terrSnap = await db().collection('territories')
        .where('isCapital', '==', false)
        .get();

    const count = { fire: 0, water: 0, wind: 0, earth: 0 };
    const snapshot = {};
    terrSnap.docs.forEach((d) => {
        const data = d.data();
        snapshot[data.territoryId] = data.ownerNation || null;
        if (NATIONS.includes(data.ownerNation)) count[data.ownerNation]++;
    });

    // 最多領海保有国を勝者に
    const winner = NATIONS.reduce((best, n) => count[n] > (count[best] || 0) ? n : best, NATIONS[0]);
    const maxCount = count[winner];
    // 同数の場合は引き分け扱い
    const isTie = NATIONS.filter((n) => count[n] === maxCount).length > 1;

    await db().collection('seasons').doc(seasonId).update({
        status: 'closed',
        winner: isTie ? null : winner,
        nationTerritoryCount: count,
        territorySnapshot: snapshot,
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const NATION_NAMES = { fire: '炎の国', water: '水の国', wind: '風の国', earth: '大地の国' };
    const NATION_EMOJIS = { fire: '🔥', water: '🌙', wind: '🌀', earth: '🌍' };

    let announcement;
    if (isTie) {
        const tiedNations = NATIONS.filter((n) => count[n] === maxCount)
            .map((n) => NATION_NAMES[n]).join('・');
        announcement = `🏆 シーズン${seasonNumber}終了！${tiedNations}が${maxCount}領海で同率首位！引き分けです。`;
    } else {
        announcement = `🏆 シーズン${seasonNumber}終了！${NATION_EMOJIS[winner]} ${NATION_NAMES[winner]}が${maxCount}領海で優勝！`;
    }

    await addGlobalChatMessage(announcement).catch(() => {});
    console.log(`[weekly-contest] ${announcement}`);

    return { winner: isTie ? null : winner, nationTerritoryCount: count, isTie };
}

// ── 領海キューから次の候補を取得 ──────────────────────────────
async function getNextQueuedTerritory() {
    const snap = await db().collection('weeklyContests')
        .where('status', '==', 'queued')
        .orderBy('queuedAt', 'asc')
        .limit(1)
        .get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };

    const territorySnap = await db().collection('territories')
        .where('ownerNation', '==', null)
        .where('isCapital', '==', false)
        .get();
    if (territorySnap.empty) return null;

    const docs = territorySnap.docs.map((d) => d.data());
    const pick = docs[Math.floor(Math.random() * docs.length)];
    return { territoryId: pick.territoryId };
}

// ── ルート登録 ────────────────────────────────────────────────
function initializeWeeklyContestRoutes(app, _promisifyPlayFab, _PlayFabServer, authTools) {
    const { requireAuthenticatedPlayFabId } = authTools;

    // ── 現在の争奪状態 ────────────────────────────────────────
    app.get('/api/weekly-contest/status', async (req, res) => {
        try {
            const contest = await getActiveContest();
            if (!contest) {
                const next = getNextSundayWindow();
                return res.json({ status: 'closed', nextWindowAt: next.toISOString() });
            }
            const territory = getTerritory(contest.territoryId);
            res.json({
                status: 'open',
                contest: { ...contest, territoryName: territory?.name || contest.territoryId },
            });
        } catch (err) {
            console.error('[weekly-contest] status error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── 現在のシーズン情報 ────────────────────────────────────
    app.get('/api/weekly-contest/season', async (req, res) => {
        try {
            const season = await getActiveSeason();
            if (!season) {
                const lastSnap = await db().collection('seasons')
                    .orderBy('seasonNumber', 'desc')
                    .limit(1)
                    .get();
                if (lastSnap.empty) return res.json({ status: 'no_season' });
                return res.json({ status: 'between_seasons', lastSeason: { id: lastSnap.docs[0].id, ...lastSnap.docs[0].data() } });
            }
            res.json({
                status: 'active',
                season: {
                    ...season,
                    contestsRemaining: Math.max(0, SEASON_LENGTH - (season.contestCount || 0)),
                },
            });
        } catch (err) {
            console.error('[weekly-contest] season error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── 拠点ダメージ記録 ──────────────────────────────────────
    app.post('/api/weekly-contest/damage', requireAuthenticatedPlayFabId, async (req, res) => {
        const { playFabId, nation, damage } = req.body;
        if (!playFabId || !nation || typeof damage !== 'number' || damage <= 0) {
            return res.status(400).json({ error: 'パラメータ不正' });
        }
        try {
            const contest = await getActiveContest();
            if (!contest) return res.status(404).json({ error: '争奪ウィンドウが開いていません' });

            await db().collection('weeklyContests').doc(contest.id).update({
                [`damageByNation.${nation}`]: admin.firestore.FieldValue.increment(damage),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            res.json({ success: true, contestId: contest.id });
        } catch (err) {
            console.error('[weekly-contest] damage error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── ウィンドウ開放（管理者 or Cron） ──────────────────────
    app.post('/api/weekly-contest/open', async (req, res) => {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: '管理者専用' });
        }
        try {
            const existing = await getActiveContest();
            if (existing) return res.status(409).json({ error: '既に争奪ウィンドウが開いています' });

            const next = await getNextQueuedTerritory();
            if (!next) return res.status(404).json({ error: '争奪可能な領海がありません' });

            // シーズンを取得 or 作成
            const season = await getOrCreateSeason();

            const windowStart = admin.firestore.Timestamp.now();
            const windowEnd   = admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

            const contestRef = await db().collection('weeklyContests').add({
                territoryId:    next.territoryId,
                status:         'open',
                seasonId:       season.id,
                windowStart,
                windowEnd,
                damageByNation: { fire: 0, water: 0, wind: 0, earth: 0 },
                winner:         null,
                createdAt:      admin.firestore.FieldValue.serverTimestamp(),
                updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
            });

            if (next.id) {
                await db().collection('weeklyContests').doc(next.id).delete();
            }

            res.json({ success: true, contestId: contestRef.id, territoryId: next.territoryId, seasonId: season.id });
        } catch (err) {
            console.error('[weekly-contest] open error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── ウィンドウ終了・勝者確定 ──────────────────────────────
    app.post('/api/weekly-contest/close', async (req, res) => {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: '管理者専用' });
        }
        try {
            const contest = await getActiveContest();
            if (!contest) return res.status(404).json({ error: '開いている争奪ウィンドウがありません' });

            // 勝者決定
            const dmg = contest.damageByNation || {};
            const totalDamage = Object.values(dmg).reduce((s, v) => s + v, 0);
            const winner = totalDamage > 0
                ? Object.entries(dmg).reduce((best, [n, v]) => v > (dmg[best] || 0) ? n : best, NATIONS[0])
                : null;

            const batch = db().batch();
            const contestRef = db().collection('weeklyContests').doc(contest.id);
            batch.update(contestRef, {
                status:   'closed',
                winner,
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            if (totalDamage > 0 && winner) {
                const territoryRef = db().collection('territories').doc(contest.territoryId);
                batch.update(territoryRef, {
                    ownerNation:  winner,
                    capturedAt:   admin.firestore.FieldValue.serverTimestamp(),
                    captureCount: admin.firestore.FieldValue.increment(1),
                    weeklyContest: null,
                });
            } else {
                await db().collection('weeklyContests').add({
                    territoryId: contest.territoryId,
                    status:      'queued',
                    queuedAt:    admin.firestore.FieldValue.serverTimestamp(),
                    reason:      'no_participants',
                });
            }

            await batch.commit();

            // シーズンの争奪回数を更新し、22回到達でシーズン終了
            let seasonResult = null;
            if (contest.seasonId) {
                const seasonRef = db().collection('seasons').doc(contest.seasonId);
                const seasonSnap = await seasonRef.get();
                if (seasonSnap.exists) {
                    const newCount = (seasonSnap.data().contestCount || 0) + 1;
                    await seasonRef.update({ contestCount: newCount });

                    if (newCount >= SEASON_LENGTH) {
                        const seasonData = seasonSnap.data();
                        seasonResult = await endSeason(contest.seasonId, seasonData.seasonNumber || newCount);
                    }
                }
            }

            res.json({
                success:       true,
                contestId:     contest.id,
                territoryId:   contest.territoryId,
                winner,
                damageByNation: dmg,
                seasonEnded:   seasonResult !== null,
                seasonResult,
            });
        } catch (err) {
            console.error('[weekly-contest] close error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── シーズン強制終了（管理者） ────────────────────────────
    app.post('/api/weekly-contest/season-end', async (req, res) => {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: '管理者専用' });
        }
        try {
            const season = await getActiveSeason();
            if (!season) return res.status(404).json({ error: 'アクティブなシーズンがありません' });

            const result = await endSeason(season.id, season.seasonNumber);
            res.json({ success: true, seasonId: season.id, ...result });
        } catch (err) {
            console.error('[weekly-contest] season-end error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });

    // ── 国家パッシブ一覧 ──────────────────────────────────────
    app.get('/api/weekly-contest/passives/:nation', async (req, res) => {
        const { nation } = req.params;
        if (!NATIONS.includes(nation)) {
            return res.status(400).json({ error: '国家指定が不正' });
        }
        try {
            const snap = await db().collection('territories')
                .where('ownerNation', '==', nation)
                .where('isCapital', '==', false)
                .get();
            const territories = snap.docs.map((d) => d.data());
            const passives = getNationPassives(nation, territories);
            res.json({ nation, passives });
        } catch (err) {
            console.error('[weekly-contest] passives error:', err);
            res.status(500).json({ error: 'サーバーエラー' });
        }
    });
}

module.exports = { initializeWeeklyContestRoutes };
