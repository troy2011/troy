// public/js/battleRoomClient.js
// バトルルームクライアント
//  - Firestore リアルタイムリスナー（ルーム状態・イベント）
//  - 決定論的 NPC シミュレーション（サーバー書き込みなし）
//  - アルカナ回収・建物発動・シンボル攻撃 API ラッパー

import {
    collectArcana,
    damageBuilding,
    strikeSymbol,
    reportKill,
    resolveBattleRoom,
    getActiveBattleRoom,
    updateNpcSnapshot,
    updateBattlePosition,
    attackBattlePlayer,
    respawnBattle,
} from './playfabClient.js?v=20260825-playfab-read-coalescing-v1';

// ── 決定論的乱数（サーバーと同一アルゴリズム）───────────────
function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

// ── 定数 ────────────────────────────────────────────────────
const NPC_TICK_MS       = 500;
const NPC_SPEED_BASE    = 80;     // px/s
const BATTLEFIELD_W     = 1000;
const BATTLEFIELD_H     = 1000;
const ATTACKER_SPAWN_X  = 80;
const DEFENDER_SPAWN_X  = 920;
const SPAWN_Y           = 500;
const NPC_PATROL_RADIUS = 150;
const ARCANA_MODE_COST  = 200;    // サーバーと一致させる（300→200に変更）

// NPC がアルカナ回収を試みる建物接近距離
const BUILDING_COLLECT_RANGE = 100;

// ── ルームクライアント本体 ────────────────────────────────────
export class BattleRoomClient {
    constructor({ firestore, playFabId, onStateChange, onEvent, onNpcUpdate, onPositionsUpdate }) {
        this._db                = firestore;
        this._playFabId         = playFabId;
        this._onStateChange     = onStateChange     || (() => {});
        this._onEvent           = onEvent           || (() => {});
        this._onNpcUpdate       = onNpcUpdate       || (() => {});
        this._onPositionsUpdate = onPositionsUpdate || (() => {});

        this._roomId        = null;
        this._roomData      = null;
        this._side          = null;   // 'attacker' | 'defender' | null
        this._npcStates     = {};
        this._npcTicker     = null;
        this._unsubRoom     = null;
        this._unsubEvents   = null;
        this._unsubPositions = null;
        this._lastEventTs   = 0;
        this._resolveTimer  = null;
        this._otherPositions = {};   // { [playFabId]: { x, y } }

        // API call guard: 同時重複呼び出しを防ぐ
        this._pendingCollect  = false;
        this._pendingStrike   = false;
        this._pendingActivate = {};
        this._pendingKill     = false;
        this._pendingAttack   = false;
        this._pendingRespawn  = false;
    }

    // ── ルームを購読開始 ────────────────────────────────────
    subscribe(roomId) {
        this.unsubscribe();
        this._roomId = roomId;

        this._unsubRoom = this._db
            .collection('battleRooms')
            .doc(roomId)
            .onSnapshot((snap) => {
                if (!snap.exists) return;
                this._roomData = snap.data();
                this._resolveSide();
                this._onStateChange(this._roomData);
                this._handleRoomUpdate(this._roomData);
            });

        this._unsubEvents = this._db
            .collection('battleRooms')
            .doc(roomId)
            .collection('events')
            .orderBy('ts', 'asc')
            .where('ts', '>', Date.now() - 60000)
            .onSnapshot((qs) => {
                qs.docChanges().forEach((ch) => {
                    if (ch.type === 'added') {
                        const ev = ch.doc.data();
                        if (ev.ts > this._lastEventTs) {
                            this._lastEventTs = ev.ts;
                            this._onEvent(ev);
                        }
                    }
                });
            });

        // 他プレイヤーの位置をリアルタイム購読
        // 全プレイヤー位置を1ドキュメント(snapshot)にまとめることで
        // 書き込み1回→読み取り1回 に抑制（N人分バラバラより大幅に削減）
        this._unsubPositions = this._db
            .collection('battleRooms')
            .doc(roomId)
            .collection('positions')
            .doc('snapshot')
            .onSnapshot((docSnap) => {
                if (!docSnap.exists) return;
                const data = docSnap.data();
                const newPositions = {};
                Object.entries(data).forEach(([pid, pos]) => {
                    if (pid !== this._playFabId && pos?.x !== undefined) {
                        newPositions[pid] = { x: pos.x, y: pos.y };
                    }
                });
                this._otherPositions = newPositions;
                if (this._onPositionsUpdate) this._onPositionsUpdate({ ...newPositions });
            });
    }

    unsubscribe() {
        if (this._unsubRoom)      { this._unsubRoom();      this._unsubRoom      = null; }
        if (this._unsubEvents)    { this._unsubEvents();    this._unsubEvents    = null; }
        if (this._unsubPositions) { this._unsubPositions(); this._unsubPositions = null; }
        this._stopNpcTicker();
        if (this._resolveTimer) { clearTimeout(this._resolveTimer); this._resolveTimer = null; }
        this._roomId         = null;
        this._roomData       = null;
        this._side           = null;
        this._npcStates      = {};
        this._otherPositions = {};
        this._pendingCollect  = false;
        this._pendingStrike   = false;
        this._pendingActivate = {};
        this._pendingKill     = false;
        this._pendingAttack   = false;
        this._pendingRespawn  = false;
        this.unsubscribeShipEffects();
    }

    // ── 自分のサイドを判定 ───────────────────────────────────
    _resolveSide() {
        if (!this._roomData || !this._playFabId) return;
        const inAttackers = (this._roomData.attackers || []).some((a) => a.playFabId === this._playFabId);
        this._side = inAttackers ? 'attacker' : 'defender';
    }

    get side() { return this._side; }

    // ── ルーム状態変化ハンドラ ──────────────────────────────
    _handleRoomUpdate(room) {
        if (room.status === 'active' && !this._npcTicker) {
            this._initNpcStates(room);
            this._startNpcTicker(room);
            this._scheduleAutoResolve(room);
        }
        if (room.status !== 'active') {
            this._stopNpcTicker();
        }
    }

    // ── アルカナ回収 API ────────────────────────────────────
    async tryCollectArcana(buildingId) {
        if (!this._roomId || this._pendingCollect) return null;
        this._pendingCollect = true;
        try {
            const res = await collectArcana(this._playFabId, this._roomId, buildingId, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            this._pendingCollect = false;
        }
    }

    // ── 建物ダメージ API（攻撃側）────────────────────────────
    async tryDamageBuilding(buildingId, damage = 50) {
        if (!this._roomId || this._pendingActivate[buildingId]) return null;
        this._pendingActivate[buildingId] = true;
        try {
            const res = await damageBuilding(this._playFabId, this._roomId, buildingId, damage, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            delete this._pendingActivate[buildingId];
        }
    }

    // ── キル報告 API（アルカナ移譲）──────────────────────────
    async tryReportKill(killedPlayFabId) {
        if (!this._roomId || this._pendingKill) return null;
        this._pendingKill = true;
        try {
            const res = await reportKill(this._playFabId, this._roomId, killedPlayFabId, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            this._pendingKill = false;
        }
    }

    // ── シンボル攻撃 API（攻撃側アルカナモード時）─────────────
    async tryStrikeSymbol() {
        if (!this._roomId || this._pendingStrike) return null;
        this._pendingStrike = true;
        try {
            const res = await strikeSymbol(this._playFabId, this._roomId, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            this._pendingStrike = false;
        }
    }

    // ── プレイヤーのアルカナ状態を取得 ──────────────────────
    getMyArcanaState() {
        if (!this._roomData || !this._playFabId) return null;
        const list = this._side === 'attacker'
            ? (this._roomData.attackers || [])
            : (this._roomData.defenders || []);
        return list.find((p) => p.playFabId === this._playFabId) || null;
    }

    // ── NPC 初期状態生成 ────────────────────────────────────
    _initNpcStates(room) {
        this._npcStates = {};
        const npcs = room.npcs || [];
        npcs.forEach((npc) => {
            this._npcStates[npc.id] = {
                id:          npc.id,
                side:        npc.side,
                behavior:    npc.behavior || 'guard',
                x:           npc.spawnX,
                y:           npc.spawnY,
                hp:          npc.hp,
                maxHp:       npc.hp,
                atk:         npc.atk,
                arcanaCharge: npc.arcanaCharge || 0,
                speed:       NPC_SPEED_BASE,
                alive:       true,
                patrolAngle: 0,
                targetBuildingId: null,
            };
        });
    }

    // ── NPC ティッカー ──────────────────────────────────────
    _startNpcTicker(room) {
        const rand = seededRand(room.seed || 0);
        Object.values(this._npcStates).forEach((npc) => {
            npc.patrolAngle = rand() * Math.PI * 2;
        });

        this._npcTicker = setInterval(() => {
            if (!this._roomData || this._roomData.status !== 'active') {
                this._stopNpcTicker();
                return;
            }
            this._tickNpcs();
            this._onNpcUpdate({ ...this._npcStates });
        }, NPC_TICK_MS);
    }

    _stopNpcTicker() {
        if (this._npcTicker) { clearInterval(this._npcTicker); this._npcTicker = null; }
    }

    _tickNpcs() {
        const dt = NPC_TICK_MS / 1000;
        const buildings = this._getBuildingPositions();
        Object.values(this._npcStates).forEach((npc) => {
            if (!npc.alive) return;
            this._moveNpc(npc, dt, buildings);
            this._tickNpcArcana(npc, dt, buildings);
        });
    }

    // 建物の座標マップを生成
    // サーバー側 buildInitialBuildingStates と同じ式を使う
    // （ルームデータに x/y が入っていればそちらを優先）
    _getBuildingPositions() {
        const buildings = this._roomData?.buildings || {};
        const ids = Object.keys(buildings);
        const positions = {};
        ids.forEach((id, i) => {
            const b = buildings[id];
            if (b.x !== undefined && b.y !== undefined) {
                positions[id] = { x: b.x, y: b.y };
            } else {
                // フォールバック: 1000px マップ用2列配置
                const col = i % 2;
                const row = Math.floor(i / 2);
                positions[id] = {
                    x: 200 + col * 600,
                    y: 200 + row * 200,
                };
            }
        });
        return positions;
    }

    _moveNpc(npc, dt, buildingPositions) {
        const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
        const moveToward = (npc, tx, ty, threshold = 60) => {
            const d = dist(npc.x, npc.y, tx, ty);
            if (d > threshold) {
                npc.x += (tx - npc.x) / d * npc.speed * dt;
                npc.y += (ty - npc.y) / d * npc.speed * dt;
            }
        };

        if (npc.behavior === 'aggressive') {
            if (npc.arcanaCharge >= ARCANA_MODE_COST) {
                // アルカナMAX → シンボル中央へ
                moveToward(npc, BATTLEFIELD_W / 2, BATTLEFIELD_H / 2);
            } else {
                // 最寄り建物へ移動（攻撃側・守備側どちらのNPCも建物を目指す）
                this._moveToNearestBuilding(npc, dt, buildingPositions);
            }
        } else if (npc.behavior === 'patrol') {
            // 守備側: シンボル周辺を巡回
            npc.patrolAngle += dt * 0.4;
            const cx = BATTLEFIELD_W / 2;
            npc.x = cx + Math.cos(npc.patrolAngle) * NPC_PATROL_RADIUS;
            npc.y = BATTLEFIELD_H / 2 + Math.sin(npc.patrolAngle) * NPC_PATROL_RADIUS * 0.6;
        }
        // guard: 動かない

        npc.x = Math.max(0, Math.min(BATTLEFIELD_W, npc.x));
        npc.y = Math.max(0, Math.min(BATTLEFIELD_H, npc.y));
    }

    _moveToNearestBuilding(npc, dt, buildingPositions) {
        const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
        let nearestId   = null;
        let nearestDist = Infinity;
        for (const [id, pos] of Object.entries(buildingPositions)) {
            const d = dist(npc.x, npc.y, pos.x, pos.y);
            if (d < nearestDist) { nearestDist = d; nearestId = id; }
        }
        if (!nearestId) return;
        const pos = buildingPositions[nearestId];
        npc.targetBuildingId = nearestId;
        if (nearestDist > BUILDING_COLLECT_RANGE) {
            const d = nearestDist;
            npc.x += (pos.x - npc.x) / d * npc.speed * dt;
            npc.y += (pos.y - npc.y) / d * npc.speed * dt;
        }
    }

    // NPC アルカナ蓄積シミュレーション（クライアント側推定値）
    // 新設計: 建物の arcanaRate（/秒）で蓄積。攻撃側NPCが占領建物に近接中のみ加算。
    _tickNpcArcana(npc, dt, buildingPositions) {
        if (npc.behavior !== 'aggressive') return;
        const buildings = this._roomData?.buildings || {};
        const targetId = npc.targetBuildingId;
        if (!targetId || !buildings[targetId]) return;

        const building = buildings[targetId];
        const pos = buildingPositions[targetId];
        if (!pos) return;

        const d = Math.hypot(npc.x - pos.x, npc.y - pos.y);
        if (d > BUILDING_COLLECT_RANGE) return;

        const fogActive = (this._roomData.activeEffects || []).some(
            (e) => e.type === 'fog' && e.targetSide === 'attacker' && e.endsAt > Date.now()
        );
        const multiplier = fogActive ? 0.7 : 1.0;
        const arcanaRate = building.arcanaRate || 5;  // 建物定義の /秒 速度を使用

        npc.arcanaCharge = Math.min(
            ARCANA_MODE_COST,
            npc.arcanaCharge + arcanaRate * dt * multiplier
        );
    }

    // ── タイムアウト自動解決 ────────────────────────────────
    _scheduleAutoResolve(room) {
        if (this._resolveTimer) return;
        const remaining = (room.createdAt + 10 * 60 * 1000) - Date.now();
        if (remaining <= 0) return;

        // 最小 playFabId の攻撃側プレイヤーが解決権を持つ
        const attackers = (room.attackers || []).map((a) => a.playFabId).sort();
        if (attackers[0] !== this._playFabId) return;

        this._resolveTimer = setTimeout(async () => {
            try { await resolveBattleRoom(room.roomId); } catch { /* ignore */ }
        }, remaining + 2000);
    }

    // ── 自分の位置を snapshot ドキュメントに直接書き込み ──────
    // positions/snapshot の自分フィールドだけ merge 更新
    // 1書き込み → 他5人の読み取りが1回 に抑制
    async updateMyPosition(x, y) {
        if (!this._roomId || !this._playFabId || !this._db) return;
        const lx = Math.max(0, Math.min(1000, Number(x) || 0));
        const ly = Math.max(0, Math.min(1000, Number(y) || 0));
        try {
            await this._db
                .collection('battleRooms').doc(this._roomId)
                .collection('positions').doc('snapshot')
                .set({ [this._playFabId]: { x: lx, y: ly, ts: Date.now() } }, { merge: true });
        } catch { /* ignore */ }
    }

    // ── 対人攻撃 API ──────────────────────────────────────
    async tryAttackPlayer(targetPlayFabId) {
        if (!this._roomId || this._pendingAttack) return null;
        this._pendingAttack = true;
        try {
            const res = await attackBattlePlayer(this._playFabId, this._roomId, targetPlayFabId, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            this._pendingAttack = false;
        }
    }

    // ── リスポーン API ─────────────────────────────────────
    async tryRespawn() {
        if (!this._roomId || this._pendingRespawn) return null;
        this._pendingRespawn = true;
        try {
            const res = await respawnBattle(this._playFabId, this._roomId, { silent: true });
            return res;
        } catch {
            return null;
        } finally {
            this._pendingRespawn = false;
        }
    }

    get otherPositions() { return this._otherPositions; }

    // ── ships/{myId} リスナー（被弾エフェクト受信）───────────────
    subscribeShipEffects(myId, onEffectReceived) {
        this.unsubscribeShipEffects();
        if (!myId || !this._db) return;
        this._unsubShipEffects = this._db
            .collection('ships').doc(myId)
            .onSnapshot((snap) => {
                if (snap.exists) onEffectReceived(snap.data());
            });
    }

    unsubscribeShipEffects() {
        if (this._unsubShipEffects) { this._unsubShipEffects(); this._unsubShipEffects = null; }
    }

    // ── 船スキル発動 API ────────────────────────────────────────
    async useShipSkill(cardItemId, context = {}) {
        if (!this._playFabId) return null;
        try {
            const res = await fetch('/api/ship-skill-use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playFabId: this._playFabId, cardItemId, ...context })
            });
            return await res.json();
        } catch { return null; }
    }

    // ── NPC スナップショット自動更新 ────────────────────────
    async pushSnapshot(snapshotData) {
        if (!this._playFabId) return;
        try {
            await updateNpcSnapshot(this._playFabId, snapshotData, { silent: true });
        } catch { /* ignore */ }
    }

    get roomData() { return this._roomData; }
    get npcStates() { return this._npcStates; }
    get roomId() { return this._roomId; }
}

// ── アクティブルーム検索ユーティリティ ──────────────────────
export async function findOrCreateRoom(playFabId, territoryId) {
    const res = await getActiveBattleRoom(territoryId);
    return res?.room || null;
}
