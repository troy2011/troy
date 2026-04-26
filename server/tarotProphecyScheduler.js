// server/tarotProphecyScheduler.js
// タロット予言イベントスケジューラ
//
// Firestore の prophecyEvents/schedule ドキュメントを監視し、
// cronExpr に従ってイベントルームを自動生成する。
// 管理者は Firebase Console からドキュメントを編集するだけで
// スケジュールを変更できる。

const cron  = require('node-cron');
const admin = require('firebase-admin');

const { getTerritory, getTerritoryIds, SYMBOL_ATTACK_DAMAGE_BASE, SYMBOL_ATTACK_DAMAGE_BONUS } = require('./tarotTerritories');
const { addGlobalChatMessage } = require('./chat');

// ── 定数 ─────────────────────────────────────────────────────
const CONFIG_DOC_PATH  = 'prophecyEvents/schedule';
const ROOMS_COLLECTION = 'battleRooms';
const SYMBOL_HP_MAX    = 3000;
const NPC_COUNT        = 3;
const ROOM_DURATION_MS = 60 * 60 * 1000;  // 1時間（デフォルト）

// 国 → 属性マッピング
const NATION_ELEMENTS = { fire: 'fire', water: 'water', wind: 'wind', earth: 'earth' };

// ── スケジューラ本体 ──────────────────────────────────────────
class ProphecyScheduler {
    constructor(firestore) {
        this._db       = firestore;
        this._jobs     = {};   // eventId → cron.ScheduledTask
        this._unsubscribe = null;
    }

    // ── 起動 ────────────────────────────────────────────────
    start() {
        // 起動時に一度ロード + リアルタイム監視
        this._unsubscribe = this._db
            .doc(CONFIG_DOC_PATH)
            .onSnapshot(
                (snap) => {
                    const config = snap.exists ? snap.data() : null;
                    this._reloadSchedule(config);
                },
                (err) => console.error('[ProphecyScheduler] Config watch error:', err)
            );
        console.log('[ProphecyScheduler] Started. Watching:', CONFIG_DOC_PATH);
    }

    stop() {
        this._cancelAllJobs();
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        console.log('[ProphecyScheduler] Stopped.');
    }

    // ── スケジュール再構築 ───────────────────────────────────
    _reloadSchedule(config) {
        this._cancelAllJobs();

        const events = Array.isArray(config?.events) ? config.events : [];
        const enabled = events.filter((e) => e.enabled && e.cronExpr && e.id && e.pairA && e.pairB);

        if (!enabled.length) {
            console.log('[ProphecyScheduler] No enabled events in config.');
            return;
        }

        enabled.forEach((ev) => {
            if (!cron.validate(ev.cronExpr)) {
                console.warn(`[ProphecyScheduler] Invalid cronExpr for event "${ev.id}":`, ev.cronExpr);
                return;
            }
            this._jobs[ev.id] = cron.schedule(ev.cronExpr, () => {
                console.log(`[ProphecyScheduler] Firing event: ${ev.id}`);
                this._fireEvent(ev).catch((err) =>
                    console.error(`[ProphecyScheduler] Event "${ev.id}" error:`, err)
                );
            }, { timezone: ev.timezone || 'Asia/Tokyo' });

            console.log(`[ProphecyScheduler] Scheduled "${ev.id}" → ${ev.cronExpr} (${ev.timezone || 'Asia/Tokyo'})`);
        });
    }

    _cancelAllJobs() {
        Object.values(this._jobs).forEach((job) => job.stop());
        this._jobs = {};
    }

    // ── イベント発火 ─────────────────────────────────────────
    async _fireEvent(eventConfig) {
        const { id: eventId, pairA, pairB, durationMinutes, territoryIds } = eventConfig;
        const durationMs = (Number(durationMinutes) || 60) * 60 * 1000;

        // 対象領海を決定（指定あり → その領海 / なし → 中立領海をすべて）
        const targetIds = await this._resolveTargetTerritories(territoryIds);
        if (!targetIds.length) {
            console.log(`[ProphecyScheduler] "${eventId}": no target territories found.`);
            return;
        }

        // 各領海にルームを1つ作成
        const created = [];
        for (const territoryId of targetIds) {
            try {
                const roomId = await this._createProphecyRoom(territoryId, pairA, pairB, eventId, durationMs);
                created.push(roomId);
                console.log(`[ProphecyScheduler] Created room ${roomId} for territory ${territoryId}`);
            } catch (err) {
                console.error(`[ProphecyScheduler] Failed to create room for ${territoryId}:`, err);
            }
        }

        if (!created.length) return;

        // グローバルチャットに告知
        const emojis = { fire: '🔥', water: '🌙', wind: '🌀', earth: '🌍' };
        const msg = `🌟 タロット予言イベント開始！ ${emojis[pairA] || '⚔'} ${pairA}の国 vs ${emojis[pairB] || '⚔'} ${pairB}の国。占領戦が始まった！`;
        await addGlobalChatMessage(msg).catch(() => {});

        // イベント終了後に集計を実行
        setTimeout(() => {
            this._tallyEvent(eventId, targetIds, pairA, pairB).catch((err) =>
                console.error(`[ProphecyScheduler] Tally error for "${eventId}":`, err)
            );
        }, durationMs + 10000); // 10秒余裕
    }

    // ── 対象領海解決 ─────────────────────────────────────────
    async _resolveTargetTerritories(territoryIds) {
        // 明示指定がある場合はそのまま使用
        if (Array.isArray(territoryIds) && territoryIds.length) {
            return territoryIds.filter((id) => !!getTerritory(id));
        }

        // 未指定の場合は中立（未占領）領海を自動取得
        const allIds  = getTerritoryIds();
        const snap    = await this._db.collection('territories').get();
        const occupied = new Set(snap.docs.map((d) => d.id).filter((id) => {
            const data = snap.docs.find((d) => d.id === id)?.data();
            return !!data?.ownerNation;
        }));

        // 首都海域（wands/swords/cups/pentacles）は除外
        const HOME_TERRITORIES = new Set(['wands', 'swords', 'cups', 'pentacles']);
        return allIds.filter((id) => !occupied.has(id) && !HOME_TERRITORIES.has(id));
    }

    // ── 予言ルーム作成 ───────────────────────────────────────
    async _createProphecyRoom(territoryId, nationA, nationB, eventId, durationMs) {
        const territory = getTerritory(territoryId);
        if (!territory) throw new Error(`Unknown territory: ${territoryId}`);

        const roomId  = `prophecy_${eventId}_${territoryId}_${Date.now()}`;
        const now     = Date.now();
        const seed    = now & 0xFFFFFFFF;

        // 建物初期状態（守備側なし → neutral）
        const buildings = Object.fromEntries(
            territory.buildings.map((b) => [b.id, {
                id: b.id, name: b.name, effect: b.effect,
                arcanaValue: b.arcanaValue, cooldownSec: b.cooldownSec,
                controller: 'neutral', lastActivatedAt: 0, activeEffect: null,
            }])
        );

        const roomDoc = {
            roomId,
            territoryId,
            territoryName:  territory.name,
            eventType:      'prophecy',
            eventId,
            nationA,
            nationB,
            status:         'active',
            seed,
            createdAt:      now,
            expiresAt:      now + durationMs,
            // 両チームとも攻撃側として扱う
            teamA:          [],   // nationA プレイヤー
            teamB:          [],   // nationB プレイヤー
            // チーム別シンボルHP（ダメージ量 = SYMBOL_HP_MAX - symbolHpX）
            symbolHpA:      SYMBOL_HP_MAX,
            symbolHpB:      SYMBOL_HP_MAX,
            symbolHpMax:    SYMBOL_HP_MAX,
            buildings,
            activeEffects:  [],
            npcs:           [],
        };

        await this._db.collection(ROOMS_COLLECTION).doc(roomId).set(roomDoc);
        return roomId;
    }

    // ── 集計・占領判定 ──────────────────────────────────────
    async _tallyEvent(eventId, territoryIds, nationA, nationB) {
        console.log(`[ProphecyScheduler] Tallying event "${eventId}"...`);

        for (const territoryId of territoryIds) {
            try {
                await this._tallyTerritory(eventId, territoryId, nationA, nationB);
            } catch (err) {
                console.error(`[ProphecyScheduler] Tally failed for ${territoryId}:`, err);
            }
        }
    }

    async _tallyTerritory(eventId, territoryId, nationA, nationB) {
        // この領海・このイベントの全ルームを取得
        const snap = await this._db.collection(ROOMS_COLLECTION)
            .where('eventType',   '==', 'prophecy')
            .where('eventId',     '==', eventId)
            .where('territoryId', '==', territoryId)
            .get();

        if (snap.empty) return;

        let damageA = 0;
        let damageB = 0;

        snap.forEach((doc) => {
            const r = doc.data();
            // ダメージ量 = SYMBOL_HP_MAX - 残りHP
            damageA += Math.max(0, SYMBOL_HP_MAX - (r.symbolHpA ?? SYMBOL_HP_MAX));
            damageB += Math.max(0, SYMBOL_HP_MAX - (r.symbolHpB ?? SYMBOL_HP_MAX));
        });

        const winner = damageA > damageB ? nationA
                     : damageB > damageA ? nationB
                     : null; // 引き分け

        console.log(`[ProphecyScheduler] ${territoryId}: ${nationA}=${damageA} vs ${nationB}=${damageB} → winner=${winner || 'draw'}`);

        if (winner) {
            const now = Date.now();
            await this._db.collection('territories').doc(territoryId).set({
                territoryId,
                ownerNation:  winner,
                capturedAt:   now,
                captureCount: admin.firestore.FieldValue.increment(1),
            }, { merge: true });

            // 履歴
            await this._db.collection('territories').doc(territoryId)
                .collection('history').add({
                    ownerNation: winner,
                    capturedAt:  now,
                    capturedBy:  `prophecy_event:${eventId}`,
                    damageA, damageB,
                });

            const territory = getTerritory(territoryId);
            const emojis = { fire: '🔥', water: '🌙', wind: '🌀', earth: '🌍' };
            const msg = `${emojis[winner] || '⚔'} ${winner}の国が「${territory?.name || territoryId}」を占領しました！`;
            await addGlobalChatMessage(msg).catch(() => {});
        } else {
            console.log(`[ProphecyScheduler] ${territoryId}: Draw — no territory change.`);
        }
    }
}

// ── 初期化エクスポート ────────────────────────────────────────
let schedulerInstance = null;

function initializeProphecyScheduler() {
    const firestore = admin.firestore();
    schedulerInstance = new ProphecyScheduler(firestore);
    schedulerInstance.start();
    return schedulerInstance;
}

function stopProphecyScheduler() {
    schedulerInstance?.stop();
    schedulerInstance = null;
}

module.exports = { initializeProphecyScheduler, stopProphecyScheduler };
