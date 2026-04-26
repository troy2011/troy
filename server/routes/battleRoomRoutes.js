// server/routes/battleRoomRoutes.js  v2.0
// バトルルームシステム（建物HP破壊 + パッシブアルカナ自動蓄積）
//
// POST /api/battle-room/create               出陣（ルーム生成）
// POST /api/battle-room/join                 参戦
// POST /api/battle-room/damage-building      建物にダメージ（攻撃側）
// POST /api/battle-room/collect-arcana       占領済み建物からアルカナ手動回収（攻撃側）
// POST /api/battle-room/strike-symbol        アルカナモードでシンボル攻撃（攻撃側）
// POST /api/battle-room/resolve              時間切れ解決
// GET  /api/battle-room/active/:territoryId  アクティブルーム一覧
// GET  /api/battle-room/:roomId              ルーム状態取得

const admin = require('firebase-admin');
const { addGlobalChatMessage } = require('../chat');
const economy = require('../economy');
const {
    getTerritory,
    getBuildingDef,
    getBuildingDefsForLevels,
    ARCANA_MODE_COST,
    SYMBOL_ATTACK_DAMAGE_BASE,
    SYMBOL_ATTACK_DAMAGE_BONUS,
} = require('../tarotTerritories');

// ── 定数 ─────────────────────────────────────────────────────
const ROOM_DURATION_MS      = 10 * 60 * 1000;  // 10分
const REWARD_CURRENCY       = 'GO';
const PLAYER_HP_DEFAULT     = 300;
const PLAYER_ATTACK_DAMAGE  = 50;
const PLAYER_RESPAWN_MS     = 10 * 1000;       // 10秒
const PLAYER_ATTACK_COOLDOWN_MS = 5 * 1000;    // 攻撃クールダウン5秒

// 建物スキル効果時間デフォルト（秒）— 建物定義に duration がなければこれを使う
const DEFAULT_EFFECT_DURATION_SEC = 20;

// バトルフィールド座標
const BF = {
    width:  1000, height: 1000,
    attackerSpawnX: 80,  defenderSpawnX: 920,
    spawnY: 500,
    symbolX: 500, symbolY: 500,  // 中央固定
};

// 各陣営の定員
const SIDE_CAPACITY = 3;

// ── ユーティリティ ────────────────────────────────────────────
function normalizeId(v) {
    return String(v || '').trim().replace(/^playfab:/i, '').toUpperCase();
}
function generateRoomId(playFabId) {
    return `br_${playFabId}_${Date.now()}`;
}
function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

// ── パッシブアルカナ計算 ─────────────────────────────────────
// 建物ステートから現在のアルカナ量を計算（サーバー権威値）
function calcBuildingArcana(buildingState, now) {
    const elapsed = Math.max(0, now - (buildingState.lastResetAt || 0));
    return Math.min(
        buildingState.arcanaMax,
        (elapsed * buildingState.arcanaRate) / 1000
    );
}

// ── 自動発火チェック ─────────────────────────────────────────
// 守備側保持の建物でアルカナが満タンになったものを自動発動し、
// 更新後の buildings と追加エフェクトを返す
function applyAutoFire(room, now) {
    const updatedBuildings = Object.assign({}, room.buildings);
    const newEffects = [];
    const firedEvents = [];

    for (const [bId, bState] of Object.entries(updatedBuildings)) {
        if (bState.controller !== 'defender') continue;
        if (calcBuildingArcana(bState, now) < bState.arcanaMax) continue;

        const endsAt = now + DEFAULT_EFFECT_DURATION_SEC * 1000;
        const effect = {
            type: bState.effect,
            targetSide: 'attacker',
            endsAt,
            buildingId: bId,
            autoFired: true,
        };

        // BIND: ランダムに攻撃側1名を指定
        if (bState.effect === 'bind') {
            const targets = (room.attackers || []).filter((p) => !p.isNpc);
            if (targets.length > 0) {
                effect.boundPlayFabId = targets[Math.floor(Math.random() * targets.length)].playFabId;
            }
        }

        newEffects.push(effect);
        firedEvents.push({ buildingId: bId, effect: bState.effect });
        updatedBuildings[bId] = { ...bState, lastResetAt: now };
    }

    return { updatedBuildings, newEffects, firedEvents };
}

// ── 建物初期ステート生成 ──────────────────────────────────────
// territory の実レベルを Firestore から取得してから呼ぶ
function buildInitialBuildingStates(buildingDefs, seed, now) {
    const rng = seededRand(seed);
    const states = {};

    // ランダム座標（1000×1000マップ、シンボルは中央固定）
    // 2列レイアウト: col=0 は左エリア(X≈200)、col=1 は右エリア(X≈800)
    const positions = buildingDefs.map((_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const baseX = 200 + col * 600;
        const baseY = 150 + row * 200;
        const ox = Math.round((rng() - 0.5) * 80);
        const oy = Math.round((rng() - 0.5) * 60);
        return { x: baseX + ox, y: baseY + oy };
    });

    buildingDefs.forEach((def, i) => {
        const pos = positions[i];
        states[def.id] = {
            id:          def.id,
            name:        def.name,
            effect:      def.effect,
            arcanaRate:  def.arcanaRate,
            arcanaMax:   def.arcanaMax,
            maxHp:       def.maxHp,
            currentHp:   def.maxHp,
            controller:  'defender',
            lastResetAt: now,
            activeEffect: null,
            x:           pos.x,
            y:           pos.y,
        };
    });

    return states;
}

// ── NPC エントリー生成 ────────────────────────────────────────
// side: 'attacker' | 'defender'、count: 生成数
function buildNpcEntries(territoryId, seed, side, count) {
    if (count <= 0) return [];
    const saltedSeed = seed ^ (side === 'attacker' ? 0x1234ABCD : 0xABCD1234);
    const rng = seededRand(saltedSeed);
    const spawnX = side === 'attacker' ? BF.attackerSpawnX : BF.defenderSpawnX;
    // 攻撃側NPC は aggressive 固定、守備側は guard/patrol ランダム
    const defenderBehaviors = ['guard', 'patrol', 'guard'];

    return Array.from({ length: count }, (_, i) => {
        const behavior = side === 'attacker'
            ? 'aggressive'
            : defenderBehaviors[Math.floor(rng() * defenderBehaviors.length)];
        return {
            id:          `npc_${side}_${territoryId}_${seed}_${i}`,
            side,
            isNpc:       true,
            behavior,
            spawnX:      spawnX + Math.round(rng() * 100 - 50),
            spawnY:      BF.spawnY + Math.round(rng() * 300 - 150),
            shipHp:      500, playerHp: 300, arcanaCharge: 0,
        };
    });
}

// ── 報酬計算 ─────────────────────────────────────────────────
function calcReward(winner, symbolHpPct) {
    return winner === 'attacker'
        ? Math.round(200 + (1 - symbolHpPct) * 100)
        : Math.round(150 + symbolHpPct * 100);
}

// ── シャード報酬テーブル（1日5回上限） ────────────────────────
// [win_vs_human, win_vs_npc, lose]
const SHARD_TABLE = [
    [10, 6, 4],  // 1回目
    [ 8, 5, 3],  // 2回目
    [ 6, 4, 2],  // 3回目
    [ 4, 3, 2],  // 4回目
    [ 3, 2, 1],  // 5回目
];
const DAILY_BATTLE_LIMIT = 5;

function calcShards(battleIndex, isWin, vsNpc) {
    const row = SHARD_TABLE[Math.min(battleIndex, SHARD_TABLE.length - 1)];
    if (!isWin)  return row[2];
    if (vsNpc)   return row[1];
    return row[0];
}

// 今日の日付文字列（JST）
function todayJST() {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

// ── シャード報酬付与 ──────────────────────────────────────────
async function grantShardsToPlayers(playerEntries, isWinnerSide, hasHumanOpponent, firestore) {
    await Promise.allSettled(playerEntries.map(async ({ playFabId }) => {
        const dateStr   = todayJST();
        const statRef   = firestore.collection('playerDailyStats').doc(`${playFabId}_${dateStr}`);
        const statSnap  = await statRef.get();
        const count     = statSnap.exists ? (statSnap.data().battleCount || 0) : 0;
        if (count >= DAILY_BATTLE_LIMIT) return;  // 上限に達している

        const vsNpc    = !hasHumanOpponent;
        const shards   = calcShards(count, isWinnerSide, vsNpc);

        await firestore.runTransaction(async (tx) => {
            const freshSnap = await tx.get(statRef);
            const freshCount = freshSnap.exists ? (freshSnap.data().battleCount || 0) : 0;
            if (freshCount >= DAILY_BATTLE_LIMIT) return;
            tx.set(statRef, {
                playFabId,
                date: dateStr,
                battleCount:  admin.firestore.FieldValue.increment(1),
                shardsEarned: admin.firestore.FieldValue.increment(shards),
            }, { merge: true });
            const playerRef = firestore.collection('playerStats').doc(playFabId);
            tx.set(playerRef, {
                arcanaShards: admin.firestore.FieldValue.increment(shards),
            }, { merge: true });
        });
    }));
}

// ── PlayFab 報酬付与 ──────────────────────────────────────────
async function grantRewards(playFabIds, amount, idempotencyBase, economyTools) {
    const {
        promisifyPlayFab,
        PlayFabEconomy,
        getEntityKeyFromPlayFabId,
        resolveItemId
    } = economyTools || {};
    if (!promisifyPlayFab || !PlayFabEconomy || !getEntityKeyFromPlayFabId) {
        throw new Error('EconomyV2RewardDepsMissing');
    }
    await Promise.allSettled(
        playFabIds.map((id) =>
            economy.addEconomyItem(id, REWARD_CURRENCY, amount, {
                promisifyPlayFab,
                PlayFabEconomy,
                getEntityKeyFromPlayFabId,
                resolveItemId,
                idempotencyId: `${idempotencyBase}-${id}-${amount}`
            }).catch(() => {})
        )
    );
}

// ── 緊急通知 ─────────────────────────────────────────────────
async function sendEmergencyNotification(territory, displayName, firestore, lineClient) {
    const msg = `⚔ 緊急招集！${territory.symbol}「${territory.name}」が攻撃を受けています！守備に参加してください。`;
    await addGlobalChatMessage(msg).catch(() => {});
    if (!lineClient) return;
    try {
        const snap = await firestore.collection('line_user_links')
            .where('nation', '==', territory.element).limit(50).get();
        const lineIds = snap.docs.map((d) => d.data()?.lineUserId).filter(Boolean);
        if (lineIds.length > 0) {
            await lineClient.multicast(lineIds, [{ type: 'text', text: msg }]).catch(() => {});
        }
    } catch { /* ignore */ }
}

// ── ルーム解決 ────────────────────────────────────────────────
async function resolveRoom(roomId, winner, firestore, promisifyPlayFab, PlayFabServer, economyTools) {
    const roomRef = firestore.collection('battleRooms').doc(roomId);
    const snap = await roomRef.get();
    if (!snap.exists) return;
    const room = snap.data();
    if (room.status !== 'active') return;

    const now = Date.now();
    const symbolHpPct = room.symbolHp / room.symbolHpMax;
    const attackerEntries = (room.attackers || []).filter((p) => !p.isNpc);
    const defenderEntries = (room.defenders || []).filter((p) => !p.isNpc);
    const attackerIds = attackerEntries.map((p) => p.playFabId);
    const defenderIds = defenderEntries.map((p) => p.playFabId);
    const winnerIds   = winner === 'attacker' ? attackerIds : defenderIds;
    const reward      = calcReward(winner, symbolHpPct);
    const hasHumanOpponent = winner === 'attacker' ? defenderEntries.length > 0 : attackerEntries.length > 0;

    await roomRef.update({ status: 'resolved', winner, resolvedAt: now });

    if (winner === 'attacker' && room.attackerNation) {
        await firestore.collection('territories').doc(room.territoryId).set({
            territoryId:  room.territoryId,
            ownerNation:  room.attackerNation,
            capturedAt:   now,
            captureCount: admin.firestore.FieldValue.increment(1),
        }, { merge: true });

        await firestore.collection('territories').doc(room.territoryId)
            .collection('history').add({
                ownerNation: room.attackerNation,
                capturedAt:  now,
                capturedBy:  `battle_room:${roomId}`,
            });

        const emojis = { fire: '🔥', water: '🌙', wind: '🌀', earth: '🌍' };
        await addGlobalChatMessage(
            `${emojis[room.attackerNation] || '⚔'} 「${room.territoryName}」を制覇しました！`
        ).catch(() => {});
    }

    if (winnerIds.length > 0) {
        await grantRewards(winnerIds, reward, `battle-room-reward-${roomId}-${winner}`, economyTools);
    }

    // シャード付与（全参加者・勝敗で金額が変わる）
    const allAttackers = attackerEntries.map((p) => ({ playFabId: p.playFabId }));
    const allDefenders = defenderEntries.map((p) => ({ playFabId: p.playFabId }));
    await Promise.allSettled([
        grantShardsToPlayers(allAttackers, winner === 'attacker', hasHumanOpponent, firestore),
        grantShardsToPlayers(allDefenders, winner === 'defender', hasHumanOpponent, firestore),
    ]);

    // 週次争奪コンテストへのダメージ報告
    await reportWeeklyContestDamage(room, winner, firestore);
}

// 週次争奪ウィンドウへダメージを記録する
// 攻撃側が拠点に与えたダメージ (symbolHpMax - symbolHp) を damageByNation に加算する
async function reportWeeklyContestDamage(room, winner, firestore) {
    if (!room.attackerNation || winner !== 'attacker') return;

    const damageDealt = (room.symbolHpMax || 0) - (room.symbolHp || 0);
    if (damageDealt <= 0) return;

    try {
        const snap = await firestore.collection('weeklyContests')
            .where('status', '==', 'open')
            .where('territoryId', '==', room.territoryId)
            .limit(1)
            .get();
        if (snap.empty) return;

        const contestRef = firestore.collection('weeklyContests').doc(snap.docs[0].id);
        await contestRef.update({
            [`damageByNation.${room.attackerNation}`]: admin.firestore.FieldValue.increment(damageDealt),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
        console.error('[battle-room] weekly contest damage report error:', err);
    }
}

// ── ルート初期化 ─────────────────────────────────────────────
function initializeBattleRoomRoutes(app, promisifyPlayFab, PlayFabServer, authTools = {}, lineClient = null, economyTools = {}) {
    const firestore = admin.firestore();
    const { requireAuthenticatedPlayFabId } = authTools;

    // ── ルーム作成 ─────────────────────────────────────────
    app.post('/api/battle-room/create', requireAuthenticatedPlayFabId, async (req, res) => {
        const attackerPlayFabId = normalizeId(req.authenticatedPlayFabId);
        const { territoryId, displayName, nation } = req.body;

        const territory = getTerritory(territoryId);
        if (!territory) return res.status(400).json({ error: '無効な領海IDです' });
        if (territory.isCapital) return res.status(403).json({ error: '首都海域は侵攻できません' });

        const existing = await firestore.collection('battleRooms')
            .where('territoryId', '==', territoryId)
            .where('status', '==', 'active')
            .limit(1).get();
        if (!existing.empty) {
            return res.status(409).json({ error: '既にアクティブなルームがあります', roomId: existing.docs[0].id });
        }

        // 領海の現在レベルを Firestore から取得（なければ defaultLevels）
        const terriDoc = await firestore.collection('territories').doc(territoryId).get();
        const levels = terriDoc.exists
            ? (terriDoc.data()?.levels || territory.defaultLevels)
            : territory.defaultLevels;

        const now  = Date.now();
        const seed = now & 0xFFFFFFFF;
        const buildingDefs = getBuildingDefsForLevels(levels);
        const symbolDef    = territory.symbolDef;

        const room = {
            roomId:        generateRoomId(attackerPlayFabId),
            territoryId,
            territoryName:  territory.name,
            attackerNation: String(nation || 'neutral').toLowerCase(),
            status:         'active',
            seed,
            createdAt:      now,
            expiresAt:      now + ROOM_DURATION_MS,
            attackers: [{ playFabId: attackerPlayFabId, displayName: displayName || '', arcanaCharge: 0, arcanaMode: false, playerHp: PLAYER_HP_DEFAULT, currentPlayerHp: PLAYER_HP_DEFAULT, alive: true, respawnAt: null }],
            defenders: [],
            // 攻撃側1名参加済み → 攻撃側NPC=2、守備側NPC=3 で合計3人ずつ
            npcs: [
                ...buildNpcEntries(territoryId, seed, 'attacker', SIDE_CAPACITY - 1),
                ...buildNpcEntries(territoryId, seed, 'defender', SIDE_CAPACITY),
            ],
            buildings: buildInitialBuildingStates(buildingDefs, seed, now),
            // シンボル建物（中央固定）
            symbolHp:          symbolDef.maxHp,
            symbolHpMax:       symbolDef.maxHp,
            symbolArcanaRate:  symbolDef.arcanaRate,
            symbolArcanaMax:   symbolDef.arcanaMax,
            symbolArcanaResetAt: now,
            symbolEffect:      symbolDef.effect,
            symbolName:        symbolDef.name,
            activeEffects:     [],
        };

        await firestore.collection('battleRooms').doc(room.roomId).set(room);
        sendEmergencyNotification(territory, displayName || attackerPlayFabId, firestore, lineClient).catch(() => {});

        return res.json({ room });
    });

    // ── 参戦 ───────────────────────────────────────────────
    app.post('/api/battle-room/join', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, displayName, side = 'defender' } = req.body;

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'ルームが存在しません' });
        const room = snap.data();
        if (room.status !== 'active') return res.status(409).json({ error: 'ルームはアクティブではありません' });

        const sideList  = side === 'attacker' ? room.attackers : room.defenders;
        const otherList = side === 'attacker' ? room.defenders : room.attackers;

        if (sideList.some((p) => p.playFabId === playFabId)) {
            return res.json({ room, side, message: '既に参戦済み' });
        }
        if (otherList.some((p) => p.playFabId === playFabId)) {
            return res.status(409).json({ error: '反対チームに既に参加しています' });
        }
        const realCount = sideList.filter((p) => !p.isNpc).length;
        if (realCount >= SIDE_CAPACITY) {
            return res.status(409).json({ error: 'このチームは満員です' });
        }

        const entry = { playFabId, displayName: displayName || '', arcanaCharge: 0, arcanaMode: false, playerHp: PLAYER_HP_DEFAULT, currentPlayerHp: PLAYER_HP_DEFAULT, alive: true, respawnAt: null };

        // リアルプレイヤーが1人増えた分、そのサイドのNPCを1体除く（定員3を維持）
        const npcToRemoveIdx = room.npcs.findLastIndex((n) => n.isNpc && n.side === side);
        const updatedNpcs = npcToRemoveIdx >= 0
            ? room.npcs.filter((_, i) => i !== npcToRemoveIdx)
            : room.npcs;

        const update = side === 'attacker'
            ? { attackers: [...room.attackers, entry], npcs: updatedNpcs }
            : { defenders: [...room.defenders, entry], npcs: updatedNpcs };

        await roomRef.update(update);
        await roomRef.collection('events').add({ type: 'player_joined', ts: Date.now(), playFabId, side });

        const updated = (await roomRef.get()).data();
        return res.json({ room: updated, side });
    });

    // ── 建物ダメージ（攻撃側） ─────────────────────────────
    app.post('/api/battle-room/damage-building', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, buildingId, damage = 50 } = req.body;

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();

        const isAttacker = room.attackers.some((p) => p.playFabId === playFabId);
        if (!isAttacker) return res.status(403).json({ error: '攻撃側のみ建物を攻撃できます' });

        const bState = room.buildings?.[buildingId];
        if (!bState) return res.status(400).json({ error: '建物が存在しません' });
        if (bState.controller === 'attacker') {
            return res.status(409).json({ error: '既に占領済みの建物です' });
        }

        const now    = Date.now();
        const dmg    = Math.max(1, Math.round(Number(damage) || 50));
        const newHp  = Math.max(0, bState.currentHp - dmg);
        const captured = newHp <= 0;

        // 自動発火チェック（守備側建物のアルカナ満タン判定）
        const { updatedBuildings, newEffects, firedEvents } = applyAutoFire(room, now);

        // 対象建物を更新
        updatedBuildings[buildingId] = {
            ...updatedBuildings[buildingId],
            currentHp:  newHp,
            controller: captured ? 'attacker' : 'defender',
            // 占領時はアルカナをリセット（攻撃側が蓄積開始）
            lastResetAt: captured ? now : updatedBuildings[buildingId].lastResetAt,
        };

        const cleanedEffects = (room.activeEffects || []).filter((e) => e.endsAt > now);
        const updatedEffects = [...cleanedEffects, ...newEffects];

        await roomRef.update({ buildings: updatedBuildings, activeEffects: updatedEffects });

        // 自動発火イベント記録
        for (const fe of firedEvents) {
            await roomRef.collection('events').add({ type: 'auto_fire', ts: now, ...fe });
        }

        // 建物ダメージイベント
        await roomRef.collection('events').add({
            type: 'building_damaged', ts: now,
            playFabId, buildingId, damage: dmg, newHp, captured,
        });

        return res.json({ newHp, captured, autoFired: firedEvents });
    });

    // ── アルカナ手動回収（占領建物から、攻撃側） ──────────
    app.post('/api/battle-room/collect-arcana', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, buildingId } = req.body;

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();

        const isAttacker = room.attackers.some((p) => p.playFabId === playFabId);
        if (!isAttacker) return res.status(403).json({ error: '攻撃側のみアルカナを回収できます' });

        const bState = room.buildings?.[buildingId];
        if (!bState) return res.status(400).json({ error: '建物が存在しません' });
        if (bState.controller !== 'attacker') {
            return res.status(409).json({ error: 'この建物を占領していません' });
        }

        const now = Date.now();

        // FOG エフェクト確認（回収量 -30%）
        const fogActive = (room.activeEffects || []).some(
            (e) => e.type === 'fog' && e.endsAt > now
        );

        let arcanaGain = calcBuildingArcana(bState, now);
        if (fogActive) arcanaGain = Math.round(arcanaGain * 0.7);
        arcanaGain = Math.round(arcanaGain);

        if (arcanaGain <= 0) {
            return res.status(409).json({ error: 'まだアルカナが溜まっていません' });
        }

        // プレイヤーチャージ更新
        const player    = room.attackers.find((p) => p.playFabId === playFabId);
        const newCharge = Math.min(ARCANA_MODE_COST, (player.arcanaCharge || 0) + arcanaGain);
        const modeReady = newCharge >= ARCANA_MODE_COST;

        const updatedAttackers = room.attackers.map((p) =>
            p.playFabId === playFabId
                ? { ...p, arcanaCharge: newCharge, arcanaMode: p.arcanaMode || modeReady }
                : p
        );

        // 建物アルカナリセット
        const updatedBuildings = {
            ...room.buildings,
            [buildingId]: { ...bState, lastResetAt: now },
        };

        await roomRef.update({ attackers: updatedAttackers, buildings: updatedBuildings });

        await roomRef.collection('events').add({
            type: 'arcana_collected', ts: now,
            playFabId, buildingId, arcanaGain, newCharge, modeReady,
        });

        return res.json({ arcanaGain, newCharge, modeReady });
    });

    // ── シンボル攻撃（アルカナモード） ────────────────────
    app.post('/api/battle-room/strike-symbol', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId } = req.body;

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();

        const isAttacker = room.attackers.some((p) => p.playFabId === playFabId);
        if (!isAttacker) return res.status(403).json({ error: '攻撃側のみシンボルを攻撃できます' });

        const player = room.attackers.find((p) => p.playFabId === playFabId);
        if ((player.arcanaCharge || 0) < ARCANA_MODE_COST) {
            return res.status(409).json({ error: `アルカナ不足（必要: ${ARCANA_MODE_COST}、現在: ${player.arcanaCharge || 0}）` });
        }

        const now = Date.now();

        // アルカナモード封印チェック（judgement エフェクト）
        const sealActive = (room.activeEffects || []).some(
            (e) => e.type === 'judgement' && e.endsAt > now
        );
        if (sealActive) {
            return res.status(409).json({ error: 'アルカナモードが封印されています' });
        }

        // バリア / タワーストライクコスト増チェック
        const barrierActive = (room.activeEffects || []).some(
            (e) => e.type === 'barrier' && e.endsAt > now
        );
        const curseActive = (room.activeEffects || []).some(
            (e) => (e.type === 'curse' || e.type === 'tower_strike') && e.endsAt > now
        );

        let damage = SYMBOL_ATTACK_DAMAGE_BASE + SYMBOL_ATTACK_DAMAGE_BONUS;
        if (barrierActive) damage = Math.round(damage * 0.5);
        if (curseActive)   damage = Math.round(damage * 0.85);

        const newSymbolHp = Math.max(0, room.symbolHp - damage);

        // シンボル自動発火チェック（アルカナが満タンになっているか）
        const symbolCurrentArcana = Math.min(
            room.symbolArcanaMax,
            ((now - (room.symbolArcanaResetAt || 0)) * room.symbolArcanaRate) / 1000
        );
        const symbolAutoFired = symbolCurrentArcana >= room.symbolArcanaMax;
        const symbolEffects = [];
        let symbolArcanaResetAt = room.symbolArcanaResetAt;

        if (symbolAutoFired) {
            const endsAt = now + DEFAULT_EFFECT_DURATION_SEC * 1000;
            symbolEffects.push({ type: room.symbolEffect, targetSide: 'attacker', endsAt, buildingId: 'symbol', autoFired: true });
            symbolArcanaResetAt = now;
        }

        // プレイヤーチャージリセット
        const updatedAttackers = room.attackers.map((p) =>
            p.playFabId === playFabId
                ? { ...p, arcanaCharge: 0, arcanaMode: false }
                : p
        );

        const cleanedEffects = (room.activeEffects || []).filter((e) => e.endsAt > now);
        const updatedEffects  = [...cleanedEffects, ...symbolEffects];

        await roomRef.update({
            symbolHp:           newSymbolHp,
            symbolArcanaResetAt,
            attackers:          updatedAttackers,
            activeEffects:      updatedEffects,
        });

        await roomRef.collection('events').add({
            type: 'symbol_struck', ts: now,
            playFabId, damage, newSymbolHp, barrierActive,
        });

        if (symbolAutoFired) {
            await roomRef.collection('events').add({
                type: 'auto_fire', ts: now,
                buildingId: 'symbol', effect: room.symbolEffect,
            });
        }

        if (newSymbolHp <= 0) {
            await resolveRoom(roomId, 'attacker', firestore, promisifyPlayFab, PlayFabServer, economyTools);
            return res.json({ damage, newSymbolHp, resolved: true, winner: 'attacker' });
        }

        return res.json({ damage, newSymbolHp, resolved: false, symbolAutoFired });
    });

    // ── プレイヤーキル報告（アルカナ移譲） ───────────────────
    // 乗り込み戦闘でプレイヤーを倒したとき、クライアントが呼ぶ
    // killedPlayFabId のアルカナを全て killer に移譲する
    app.post('/api/battle-room/report-kill', requireAuthenticatedPlayFabId, async (req, res) => {
        const killerPlayFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, killedPlayFabId } = req.body;
        if (!killedPlayFabId) return res.status(400).json({ error: 'killedPlayFabId required' });

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();
        const now  = Date.now();

        // killed / killer を両陣営から検索
        const allPlayers = [...(room.attackers || []), ...(room.defenders || [])];
        const killed = allPlayers.find((p) => p.playFabId === killedPlayFabId);
        const killer = allPlayers.find((p) => p.playFabId === killerPlayFabId);
        if (!killed || !killer) return res.status(400).json({ error: 'プレイヤーが見つかりません' });

        const transferred = killed.arcanaCharge || 0;
        const killerNewCharge = Math.min(ARCANA_MODE_COST, (killer.arcanaCharge || 0) + transferred);
        const modeReady = killerNewCharge >= ARCANA_MODE_COST;

        // 両陣営のリストを更新
        function updateList(list) {
            return list.map((p) => {
                if (p.playFabId === killedPlayFabId)  return { ...p, arcanaCharge: 0, arcanaMode: false };
                if (p.playFabId === killerPlayFabId)  return { ...p, arcanaCharge: killerNewCharge, arcanaMode: p.arcanaMode || modeReady };
                return p;
            });
        }

        await roomRef.update({
            attackers: updateList(room.attackers || []),
            defenders: updateList(room.defenders || []),
        });

        await roomRef.collection('events').add({
            type: 'player_killed', ts: now,
            killerPlayFabId, killedPlayFabId, transferred, killerNewCharge, modeReady,
        });

        return res.json({ transferred, killerNewCharge, modeReady });
    });

    // ── プレイヤー位置更新 ─────────────────────────────────
    app.post('/api/battle-room/move', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, x, y } = req.body;
        if (!roomId) return res.status(400).json({ error: 'roomId required' });

        const lx = Math.max(0, Math.min(BF.width,  Number(x) || 0));
        const ly = Math.max(0, Math.min(BF.height, Number(y) || 0));

        await firestore.collection('battleRooms').doc(roomId)
            .collection('positions').doc('snapshot')
            .set({ [playFabId]: { x: lx, y: ly, ts: Date.now() } }, { merge: true });

        return res.json({ ok: true });
    });

    // ── 対人攻撃 ───────────────────────────────────────────
    app.post('/api/battle-room/attack-player', requireAuthenticatedPlayFabId, async (req, res) => {
        const attackerPlayFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId, targetPlayFabId } = req.body;
        if (!targetPlayFabId) return res.status(400).json({ error: 'targetPlayFabId required' });

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap    = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();
        const now  = Date.now();

        const inList = (list, id) => (list || []).some((p) => p.playFabId === id);
        const attackerSideKey = inList(room.attackers, attackerPlayFabId) ? 'attackers' : 'defenders';
        const targetSideKey   = inList(room.attackers, targetPlayFabId)   ? 'attackers' : 'defenders';

        if (attackerSideKey === targetSideKey) return res.status(409).json({ error: '同じ陣営は攻撃できません' });

        const attacker = room[attackerSideKey].find((p) => p.playFabId === attackerPlayFabId);
        const target   = room[targetSideKey].find((p) => p.playFabId === targetPlayFabId);
        if (!attacker || !target) return res.status(400).json({ error: 'プレイヤーが見つかりません' });
        if (attacker.alive === false) return res.status(409).json({ error: '撃沈中です' });
        if (target.alive === false)   return res.status(409).json({ error: '対象は既に撃沈済みです' });

        // 攻撃クールダウン
        const ctKey = `attackCt_${attackerPlayFabId}`;
        if ((room[ctKey] || 0) > now - PLAYER_ATTACK_COOLDOWN_MS) {
            return res.status(429).json({ error: '攻撃クールダウン中です' });
        }

        const maxHp    = target.playerHp     || PLAYER_HP_DEFAULT;
        const curHp    = target.currentPlayerHp ?? maxHp;
        const newHp    = Math.max(0, curHp - PLAYER_ATTACK_DAMAGE);
        const killed   = newHp <= 0;
        const respawnAt = killed ? now + PLAYER_RESPAWN_MS : null;

        const updatedTargetSide = room[targetSideKey].map((p) =>
            p.playFabId !== targetPlayFabId ? p :
            { ...p, currentPlayerHp: newHp, alive: !killed, respawnAt }
        );

        const update = { [targetSideKey]: updatedTargetSide, [ctKey]: now };

        // キル: アルカナ移譲
        let transferred = 0;
        if (killed) {
            transferred = target.arcanaCharge || 0;
            update[attackerSideKey] = room[attackerSideKey].map((p) =>
                p.playFabId !== attackerPlayFabId ? p :
                { ...p, arcanaCharge: Math.min(ARCANA_MODE_COST, (p.arcanaCharge || 0) + transferred) }
            );
            await roomRef.collection('events').add({
                type: 'player_killed', ts: now,
                killerPlayFabId: attackerPlayFabId, killedPlayFabId: targetPlayFabId,
                transferred, respawnAt,
            });
        }

        await roomRef.update(update);
        return res.json({ damage: PLAYER_ATTACK_DAMAGE, newHp, killed, transferred, respawnAt });
    });

    // ── リスポーン ─────────────────────────────────────────
    app.post('/api/battle-room/respawn', requireAuthenticatedPlayFabId, async (req, res) => {
        const playFabId = normalizeId(req.authenticatedPlayFabId);
        const { roomId } = req.body;

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap    = await roomRef.get();
        if (!snap.exists || snap.data().status !== 'active') {
            return res.status(409).json({ error: 'ルームが無効です' });
        }
        const room = snap.data();
        const now  = Date.now();

        const inAttackers = (room.attackers || []).some((p) => p.playFabId === playFabId);
        const sideKey     = inAttackers ? 'attackers' : 'defenders';
        const spawnX      = inAttackers ? BF.attackerSpawnX : BF.defenderSpawnX;

        const player = (room[sideKey] || []).find((p) => p.playFabId === playFabId);
        if (!player)              return res.status(400).json({ error: 'プレイヤーが見つかりません' });
        if (player.alive !== false) return res.status(409).json({ error: 'まだ生きています' });
        if (player.respawnAt && now < player.respawnAt) {
            const remain = Math.ceil((player.respawnAt - now) / 1000);
            return res.status(425).json({ error: `リスポーン待機中 残り${remain}秒`, remain });
        }

        const maxHp    = player.playerHp || PLAYER_HP_DEFAULT;
        const respawnHp = Math.floor(maxHp * 0.5);

        const updated = room[sideKey].map((p) =>
            p.playFabId !== playFabId ? p :
            { ...p, alive: true, currentPlayerHp: respawnHp, respawnAt: null }
        );

        await roomRef.update({ [sideKey]: updated });
        await firestore.collection('battleRooms').doc(roomId)
            .collection('positions').doc('snapshot')
            .set({ [playFabId]: { x: spawnX, y: BF.spawnY, ts: now } }, { merge: true });

        return res.json({ ok: true, x: spawnX, y: BF.spawnY, currentPlayerHp: respawnHp });
    });

    // ── タイムアウト解決 ────────────────────────────────────
    app.post('/api/battle-room/resolve', async (req, res) => {
        const { roomId } = req.body;
        if (!roomId) return res.status(400).json({ error: 'roomId required' });

        const roomRef = firestore.collection('battleRooms').doc(roomId);
        const snap = await roomRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'ルームが存在しません' });
        const room = snap.data();
        if (room.status !== 'active') return res.json({ message: '既に解決済み' });

        if (Date.now() < room.expiresAt) {
            return res.status(409).json({ error: 'まだ時間切れではありません' });
        }

        await resolveRoom(roomId, 'defender', firestore, promisifyPlayFab, PlayFabServer, economyTools);
        return res.json({ winner: 'defender' });
    });

    // ── アクティブルーム取得（領海別） ────────────────────
    app.get('/api/battle-room/active/:territoryId', async (req, res) => {
        const territoryId = String(req.params.territoryId || '');
        const snap = await firestore.collection('battleRooms')
            .where('territoryId', '==', territoryId)
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(5).get();
        const rooms = snap.docs.map((d) => d.data());
        return res.json({ rooms });
    });

    // ── ルーム状態取得 ─────────────────────────────────────
    app.get('/api/battle-room/:roomId', async (req, res) => {
        const roomId = req.params.roomId;
        const snap = await firestore.collection('battleRooms').doc(roomId).get();
        if (!snap.exists) return res.status(404).json({ error: 'ルームが存在しません' });
        const room = snap.data();

        // クライアント向けに現在のアルカナ量を計算して付加
        const now = Date.now();
        const buildingsWithArcana = {};
        for (const [id, b] of Object.entries(room.buildings || {})) {
            buildingsWithArcana[id] = {
                ...b,
                currentArcana: Math.round(calcBuildingArcana(b, now)),
            };
        }

        return res.json({
            room: {
                ...room,
                buildings: buildingsWithArcana,
                symbolCurrentArcana: Math.round(Math.min(
                    room.symbolArcanaMax,
                    ((now - (room.symbolArcanaResetAt || 0)) * room.symbolArcanaRate) / 1000
                )),
            }
        });
    });
}

module.exports = { initializeBattleRoomRoutes };
