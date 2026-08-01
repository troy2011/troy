// public/battle-client.js

// --- モジュール内グローバル変数 ---
let currentBattleId = null;
let battleStateListener = null;
let battleInterval = null;
let isMyActionReady = false;
let battleAutoCloseTimer = null;
const battleEventEmitted = new Set();
const battleLogAnimatedFor = new Set();
let battleLogRenderToken = 0;
let battleViewGeneration = 0;
let battleStateRenderSequence = 0;
let battleOpponentAvatarDetailsRequest = null;
const MELEE_REPLAY_ROLL_STEPS = 10;
const MELEE_REPLAY_ROLL_INTERVAL_MS = 42;
let battleAvatarCombat = null;
const battleAvatarCombatReady = import('./js/avatarCombat.js?v=20260801-weapon-motion1')
    .then((module) => {
        battleAvatarCombat = module;
        return module;
    })
    .catch((error) => {
        console.warn('[Battle] avatar combat module unavailable:', error);
        return null;
    });

// ★ v184: バトルループで常に最新の情報を参照するための変数
let localBattleState = null;

// --- main.jsから受け取る依存 ---
let myPlayFabId = null;
let myCurrentEquipment = {};
let myInventory = [];
let battleDependencies = null; // ★ v189: 依存関係をモジュール全体で保持する変数
let db = null; // Firebase Realtime Database instance
let dbRef, dbOnValue, dbSet, dbOnDisconnect; // Firebase v9 functions
const LEGACY_MELEE_BATTLE_ENTRY_ENABLED = false;

/**
 * main.jsから呼び出される初期化関数
 * @param {object} deps 依存関係をまとめたオブジェクト
 */
function initializeBattleSystem(deps) {
    myPlayFabId = deps.myPlayFabId;
    myCurrentEquipment = deps.myCurrentEquipment;
    myInventory = deps.myInventory;
    battleDependencies = deps; // ★ v189: 受け取った依存関係を保存
    db = deps.db; // DBインスタンスを受け取る

    // Firebase v9の関数を動的にインポートし、完了後に関連リスナーを初期化
    import('firebase/database').then(database => {
        dbRef = database.ref;
        dbOnValue = database.onValue;
        dbSet = database.set;
        dbOnDisconnect = database.onDisconnect;

        // イベントリスナーのセットアップ
        if (LEGACY_MELEE_BATTLE_ENTRY_ENABLED) {
            document.getElementById('btnScanBattle')?.addEventListener('click', startBattleScan);
            initializeInvitationListener(); // Firebaseモジュール読み込み後に実行
        }
    }).catch(e => console.error("Failed to load Firebase Database module in battle-client.js", e));
}

// --- バトル開始フロー ---

async function startBattleScan() {
    if (!LEGACY_MELEE_BATTLE_ENTRY_ENABLED) {
        if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('白兵戦は現在休止中です。');
        }
        return false;
    }
    const battleResultEl = document.getElementById('battleResult'); // 'deps' is not defined here, so we can't use it yet. This function is called by an event listener.
    if (!liff.isInClient()) {
        battleResultEl.innerText = 'QRスキャンはLINEアプリ内でのみ利用できます。';
        battleResultEl.style.color = 'red';
        return;
    }
    battleResultEl.innerText = '（QRコードをスキャン中...）';
    try {
        const result = await liff.scanCodeV2();
        if (!result || !result.value) {
            battleResultEl.innerText = '';
            return;
        }
        const opponentId = result.value;
        if (opponentId === myPlayFabId) {
            battleResultEl.innerText = '自分自身とは対戦できません。';
            return;
        }
        battleResultEl.innerText = '（サーバーでバトル実行中...）';
        const data = await battleDependencies.callApiWithLoader('/api/start-battle', { attackerId: myPlayFabId, defenderId: opponentId });
        if (data && data.battleId) {
            battleResultEl.innerText = '対戦が成立しました！';
            showBattleModal(data.battleId);
        } else {
            battleResultEl.innerText = 'バトル開始に失敗しました。';
        }
    } catch (error) {
        battleResultEl.innerText = `エラー: ${error.message}`;
    }
}

function initializeInvitationListener() {
    if (!myPlayFabId) return;
    const listenerStartTime = Date.now();
    const invitationsRef = dbRef(db, 'invitations');

    import('firebase/database').then(({ query, orderByChild, equalTo, onChildAdded }) => {
        const invitationsQuery = query(invitationsRef, orderByChild('to/id'), equalTo(myPlayFabId));
        onChildAdded(invitationsQuery, async (snapshot) => {
        const invitation = snapshot.val();
        const invitationId = snapshot.key;
        if (!invitation) return;
        if (invitation.createdAt && invitation.createdAt < listenerStartTime) {
            console.log("過去の招待のため無視します:", invitationId);
            return;
        }
        if (invitation.status === 'started' && invitation.battleId) {
            console.log(`バトル開始通知: ${invitationId}`);
            showBattleModal(invitation.battleId);
        }
        });
    });
}

function listenForBattleStart(invitationId) {
    const battleResultEl = document.getElementById('battleResult');
    const invitationRef = dbRef(db, 'invitations/' + invitationId);
    dbOnValue(invitationRef, (snapshot) => {
        const invitation = snapshot.val();
        if (invitation && invitation.status === 'started' && invitation.battleId) {
            import('firebase/database').then(({ off }) => off(invitationRef));
            battleResultEl.innerText = '対戦が成立しました！';
            setTimeout(() => showBattleModal(invitation.battleId), 1000);
        }
    });
}

function setBattleActiveWindow(durationMs) {
    const now = Date.now();
    const until = now + Math.max(0, Number(durationMs) || 0);
    const current = Number(window.__battleActiveUntil || 0);
    if (until > current) {
        window.__battleActiveUntil = until;
    }
}

async function emitBattleEventIfPossible(battleId, participantIds) {
    if (!battleId || !Array.isArray(participantIds) || participantIds.length === 0) return;
    const mapId = window.__currentMapId || window.__phaserPlayerInfo?.mapId || window.playerInfo?.mapId || null;
    if (!mapId || !window.firestore) return;
    try {
        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(window.firestore, 'ship_battle_events'), {
            battleId,
            mapId,
            participantIds: participantIds,
            emojis: ['⚔️', '💥'],
            durationMs: 5000,
            createdAt: Date.now()
        });
    } catch (error) {
        console.warn('[Battle] Failed to emit battle event:', error);
    }
}

// --- バトル中ロジック ---

function clearBattleAutoCloseTimer() {
    if (battleAutoCloseTimer) {
        clearTimeout(battleAutoCloseTimer);
        battleAutoCloseTimer = null;
    }
}

function stopBattleStateListener() {
    if (typeof battleStateListener === 'function') {
        try {
            battleStateListener();
        } catch (error) {
            console.warn('[Battle] Failed to stop battle listener:', error);
        }
    }
    battleStateListener = null;
}

function advanceBattleViewGeneration() {
    battleViewGeneration += 1;
    battleOpponentAvatarDetailsRequest = null;
    const opponentAvatar = document.getElementById('battle-avatar-A');
    if (opponentAvatar) delete opponentAvatar.dataset.avatarSnapshotPending;
    return battleViewGeneration;
}

function isBattleRenderContextCurrent(context) {
    return Boolean(
        context
        && currentBattleId === context.battleId
        && battleViewGeneration === context.generation
        && battleStateRenderSequence === context.renderSequence
    );
}

function showBattleModal(battleId) {
    const viewGeneration = advanceBattleViewGeneration();
    stopBattleStateListener();
    currentBattleId = battleId;
    const battleModal = document.getElementById('battleModal');
    battleModal.style.display = 'flex';
    battleModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-lock');
    setBattleActiveWindow(5000);
    clearBattleAutoCloseTimer();

    if (battleInterval) {
        clearInterval(battleInterval);
        battleInterval = null;
    }
    isMyActionReady = false;

    const battleRef = dbRef(db, 'battles/' + battleId);

    // ★★★ 修正: 自分のオンライン状態を管理し、切断時の処理を設定 ★★★
    const myPlayerOnlineRef = dbRef(db, `battles/${battleId}/players/${myPlayFabId}/online`);
    dbSet(myPlayerOnlineRef, true); // オンラインであることを示す
    dbOnDisconnect(myPlayerOnlineRef).set(false); // 切断されたらfalseにする


    battleStateListener = dbOnValue(battleRef, async (snapshot) => {
        const battleState = snapshot.val();
        if (!battleState) return;
        const renderContext = {
            battleId,
            generation: viewGeneration,
            renderSequence: battleStateRenderSequence + 1
        };
        battleStateRenderSequence = renderContext.renderSequence;
        if (!isBattleRenderContextCurrent(renderContext)) return;
        if (battleId && !battleEventEmitted.has(battleId)) {
            const playerIds = battleState?.players ? Object.keys(battleState.players) : [];
            if (playerIds.length > 0) {
                battleEventEmitted.add(battleId);
                emitBattleEventIfPossible(battleId, playerIds);
            }
        }

        // ★★★ 修正: サーバーからのデータでローカルステートを更新する ★★★
        // ATBゲージはクライアント側で独立して管理するため、ここでは単純に上書きする
        localBattleState = battleState;

        // ATBゲージの初期化 (初回のみ)
        if (!localBattleState.players[Object.keys(localBattleState.players)[0]].hasOwnProperty('atb')) {
            for (const playerId in localBattleState.players) {
                localBattleState.players[playerId].atb = 0;
            }
        }

        const playerIds = Object.keys(battleState.players);
        const myId = myPlayFabId;
        const opponentId = playerIds.find(id => id !== myId);
        if (!opponentId) return;

        const me = battleState.players[myId];
        const opponent = battleState.players[opponentId];

        updateBattleStatusDisplay('battlePlayerA', opponent, opponentId);
        updateBattleStatusDisplay('battlePlayerB', me, myId);

        await battleAvatarCombatReady;
        if (!isBattleRenderContextCurrent(renderContext)) return;
        const opponentAvatarIsCurrent = await renderOpponentAvatar(
            opponent,
            battleDependencies.callApiWithLoader,
            renderContext
        );
        if (!opponentAvatarIsCurrent || !isBattleRenderContextCurrent(renderContext)) return;
        renderMyAvatar(me);
        if (!isBattleRenderContextCurrent(renderContext)) return;

        const logContainer = document.getElementById('battleLogContainer');
        const commandArea = document.getElementById('battleCommandArea');
        if (commandArea) commandArea.innerHTML = '';
        const logMeta = {
            rounds: Array.isArray(battleState.rounds) ? battleState.rounds : [],
            winnerId: battleState.winner || null,
            players: battleState.players || {},
            melee: battleState.melee || null,
            viewerId: myPlayFabId
        };
        if (getMeleeReplayDuel(logMeta)) {
            resetBattleAvatarDefeatedStates();
        } else {
            syncBattleAvatarDefeatFromPlayerState(opponent, me);
        }
        const renderImmediate = () => {
            if (!isBattleRenderContextCurrent(renderContext)) return;
            renderBattleLog(logContainer, battleState.log || null, { animate: false, meta: logMeta });
        };
        const renderWithAnimation = () => {
            if (!isBattleRenderContextCurrent(renderContext)) return;
            const logCount = battleState.log ? Object.keys(battleState.log).length : 0;
            const extraMs = Math.min(12000, Math.max(6000, logCount * 380 + 2000));
            resetBattleAutoClose(extraMs);
            renderBattleLog(logContainer, battleState.log || null, {
                animate: true,
                meta: logMeta,
                onComplete: () => {
                    if (!isBattleRenderContextCurrent(renderContext)) return;
                    showBattleResult(commandArea, battleState, myId, myPlayerOnlineRef);
                }
            });
        };

        if (battleState.status === 'finished') {
            if (commandArea) {
                commandArea.innerHTML = '<p style="color: #94a3b8;">戦闘解析中...</p>';
            }
            if (!battleLogAnimatedFor.has(battleId)) {
                battleLogAnimatedFor.add(battleId);
                renderWithAnimation();
            } else {
                renderImmediate();
                if (isBattleRenderContextCurrent(renderContext)) {
                    showBattleResult(commandArea, battleState, myId, myPlayerOnlineRef);
                }
            }
            // (勝敗表示ロジック...ここはそのまま)
            return;
        }
        renderImmediate();

        // ★★★ 修正: 手動ボタンのロジックを削除し、ATBゲージの状況やメッセージを表示する ★★★
        if (!battleInterval) {
            if (!isBattleRenderContextCurrent(renderContext)) return;
            console.log("[Battle] Starting battle loop..."); // ★ デバッグログ
            startBattleLoop(battleState);
        }

        // オートバトル中であることを表示
        if (!isBattleRenderContextCurrent(renderContext)) return;
        if (document.getElementById('battleCommandArea').innerHTML.includes('ACTION!')) return; // ACTION!表示中は上書きしない
        if (commandArea) commandArea.innerHTML = '<p style="color: #cbd5e0; font-size: 0.9em;">オートバトル進行中...</p>';

    });
}

function closeBattleModalAndHandlePending() {
    advanceBattleViewGeneration();
    clearBattleAutoCloseTimer();
    stopBattleStateListener();
    battleLogRenderToken += 1;
    currentBattleId = null;
    localBattleState = null;
    if (battleInterval) {
        clearInterval(battleInterval);
        battleInterval = null;
    }
    const battleModal = document.getElementById('battleModal');
    if (battleModal) {
        battleModal.querySelectorAll('.avatar-combat-actor').forEach((avatar) => {
            battleAvatarCombat?.resetCombatAvatarState?.(avatar, { resumeIdle: false });
            delete avatar.dataset.avatarSnapshotKey;
            delete avatar.dataset.avatarSnapshotPending;
        });
        battleModal.querySelectorAll('.battle-action-effect, .battle-damage-number, .battle-replay-fx').forEach((node) => node.remove());
        battleModal.style.display = 'none';
        battleModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-lock');
    if (Number(window.__battleActiveUntil || 0) <= Date.now()) {
        window.__battleActiveUntil = 0;
    }
    reopenPendingIslandCommandAfterBattle();
}

function reopenPendingIslandCommandAfterBattle() {
    const pending = (typeof window !== 'undefined') ? window.__pendingIslandCommandAfterBattle : null;
    if (!pending || !pending.islandId) return;
    if (typeof window !== 'undefined') {
        window.__pendingIslandCommandAfterBattle = null;
    }
    if (typeof window !== 'undefined' && typeof window.showTab === 'function') {
        window.showTab('map');
    }
    setTimeout(async () => {
        try {
            const scene = (typeof window !== 'undefined') ? window.worldMapScene : null;
            if (!scene || typeof scene.reloadIslandFromFirestore !== 'function' || typeof scene.showIslandCommandMenu !== 'function') {
                return;
            }
            const latestIsland = await scene.reloadIslandFromFirestore(pending.islandId);
            if (!latestIsland) return;
            scene.collidingIsland = latestIsland;
            scene.showIslandCommandMenu(latestIsland);
        } catch (error) {
            console.warn('[Battle] Failed to reopen island command after battle:', error);
        }
    }, 180);
}

function resetBattleAutoClose(delayMs) {
    const battleModal = document.getElementById('battleModal');
    if (!battleModal) return;
    clearBattleAutoCloseTimer();
    battleAutoCloseTimer = setTimeout(() => {
        closeBattleModalAndHandlePending();
    }, delayMs);
}

const MELEE_TAROT_SPRITE_SRC = 'Sprites/Buildings/tarot.png';
const MELEE_TAROT_TILE_W = 48;
const MELEE_TAROT_TILE_H = 80;
const MELEE_TAROT_SHEET_W = 512;
const MELEE_TAROT_SHEET_H = 1024;
const MELEE_TAROT_BACK_INDEX = 110;
const MELEE_SLOT_TAROT_SCALE = 0.54;
const MELEE_MINOR_CUTIN_TAROT_SCALE = 1.86;
const MELEE_ATTACK_EFFECT_BASE = './Sprites/pixel_animations_gfxpack/animationsheets/';
const MELEE_ATTACK_EFFECT_FRAME = 64;
const MELEE_FEEDBACK_ICON_COLS = 16;
const MELEE_FEEDBACK_ICON_ROWS = 64;
const MELEE_FEEDBACK_ICON_INDEX = {
    damage: 136,
    miss: 223,
    parry: 203,
    weak: 136,
    resist: 207,
    heal: 0,
    burn: 144,
    wet: 149,
    fear: 230,
    confuse: 222,
    slow: 101,
    weaken: 97,
    poison: 144,
    paralysis: 222,
    sleep: 230,
    silence: 68,
    blind: 68,
    atkDown: 97,
    defDown: 74,
    speedDown: 101,
    accDown: 68,
    vulnUp: 223,
    guard: 203
};
const MELEE_PERSISTENT_STATUS_DEFS = [
    { key: 'burn', iconKey: 'burn', label: 'BURN', tone: 'ailment', isActive: (status) => Number(status.burn) > 0 },
    { key: 'slow', iconKey: 'slow', label: 'SLOW', tone: 'debuff', isActive: (status) => Number(status.slow) > 0 },
    { key: 'weaken', iconKey: 'weaken', label: 'WEAKEN', tone: 'debuff', isActive: (status) => Number(status.weaken) > 0 },
    { key: 'confuse', iconKey: 'confuse', label: 'CONFUSE', tone: 'ailment', isActive: (status) => Number(status.confusion) > 0 },
    { key: 'poison', iconKey: 'poison', label: 'POISON', tone: 'ailment', isActive: (status) => Number(status.poison) > 0 },
    { key: 'paralysis', iconKey: 'paralysis', label: 'PARALYSIS', tone: 'ailment', isActive: (status) => Number(status.paralysis) > 0 },
    { key: 'sleep', iconKey: 'sleep', label: 'SLEEP', tone: 'ailment', isActive: (status) => Number(status.sleep) > 0 },
    { key: 'silence', iconKey: 'silence', label: 'SILENCE', tone: 'ailment', isActive: (status) => Number(status.silence) > 0 },
    { key: 'blind', iconKey: 'blind', label: 'BLIND', tone: 'debuff', isActive: (status) => Number(status.blind) > 0 },
    { key: 'atkDown', iconKey: 'atkDown', label: 'ATK DOWN', tone: 'debuff', isActive: (status) => Number(status.attackMultiplier) < 1 },
    { key: 'defDown', iconKey: 'defDown', label: 'DEF DOWN', tone: 'debuff', isActive: (status) => Number(status.defenseMultiplier) < 1 },
    { key: 'speedDown', iconKey: 'speedDown', label: 'SPEED DOWN', tone: 'debuff', isActive: (status) => Number(status.speedMultiplier) < 1 },
    { key: 'accDown', iconKey: 'accDown', label: 'ACC DOWN', tone: 'debuff', isActive: (status) => Number(status.accuracyBonus) < 0 },
    { key: 'vulnUp', iconKey: 'vulnUp', label: 'VULN UP', tone: 'debuff', isActive: (status) => Number(status.damageTakenMultiplier) > 1 },
    { key: 'guard', iconKey: 'guard', label: 'GUARD', tone: 'buff', isActive: (status) => Number(status.guardCharges) > 0 || Number(status.damageTakenMultiplier) < 1 }
];
const MELEE_ELEMENTAL_EFFECTS = {
    fire: {
        file: 'fire.png', cols: 5, rows: 6, intervalMs: 42, scale: 2.35,
        patterns: [{ startFrame: 4, frames: 6 }, { startFrame: 10, frames: 6 }, { startFrame: 16, frames: 11 }]
    },
    wind: {
        file: 'wind.png', cols: 5, rows: 5, intervalMs: 38, scale: 2.35,
        patterns: [{ startFrame: 4, frames: 6 }, { startFrame: 10, frames: 9 }, { startFrame: 19, frames: 6 }]
    },
    earth: {
        file: 'earth1.png', cols: 5, rows: 6, intervalMs: 42, scale: 2.35,
        patterns: [{ startFrame: 0, frames: 12 }, { startFrame: 12, frames: 15 }]
    },
    water: {
        file: 'water.png', cols: 5, rows: 10, intervalMs: 34, scale: 2.35,
        patterns: [{ startFrame: 0, frames: 11 }, { startFrame: 22, frames: 12 }, { startFrame: 34, frames: 8 }, { startFrame: 42, frames: 7 }]
    }
};
const MELEE_WEAPON_EFFECTS = {
    sword: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 22, frames: 6, intervalMs: 34, scale: 2.18 },
    sword_big: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 28, frames: 6, intervalMs: 38, scale: 2.34 },
    dagger: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 0, frames: 6, intervalMs: 30, scale: 2.0 },
    polearm: { file: 'weapons_1.png', cols: 5, rows: 7, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.16 },
    axe: { file: 'weapons_2.png', cols: 5, rows: 6, startFrame: 0, frames: 6, intervalMs: 38, scale: 2.2 },
    axe_big: { file: 'weapons_2.png', cols: 5, rows: 6, startFrame: 0, frames: 6, intervalMs: 42, scale: 2.42 },
    blunt: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 15, frames: 6, intervalMs: 36, scale: 2.18 },
    shield: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 20, frames: 5, intervalMs: 36, scale: 2.02 },
    bow: { file: 'arrow.png', cols: 5, rows: 4, startFrame: 0, frames: 11, intervalMs: 32, scale: 2.0 },
    gun: { file: 'impact2.png', cols: 5, rows: 3, startFrame: 5, frames: 5, intervalMs: 32, scale: 2.06 },
    gun_big: { file: 'impact2.png', cols: 5, rows: 3, startFrame: 10, frames: 5, intervalMs: 34, scale: 2.24 },
    staff: { file: 'impact1.png', cols: 5, rows: 6, startFrame: 25, frames: 5, intervalMs: 36, scale: 2.04 },
    wand: { file: 'fire.png', cols: 5, rows: 6, startFrame: 4, frames: 6, intervalMs: 42, scale: 2.12 },
    claw: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.08 },
    bite: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 0, frames: 8, intervalMs: 34, scale: 2.04 },
    unarmed: { file: 'claw_bite.png', cols: 5, rows: 5, startFrame: 16, frames: 6, intervalMs: 34, scale: 2.08 }
};

function getMeleeReplayDuel(meta) {
    const duels = Array.isArray(meta?.melee?.duels) ? meta.melee.duels : [];
    if (duels.length === 0) return null;
    const viewerId = String(meta?.viewerId || '');
    if (viewerId) {
        const viewerDuel = duels.find((duel) => {
            const combatants = Array.isArray(duel?.setup?.combatants) ? duel.setup.combatants : [];
            return combatants.some((combatant) => String(combatant?.id || '') === viewerId);
        });
        if (viewerDuel) return viewerDuel;
    }
    return duels[0];
}

function formatMeleeReplayAction(event) {
    if (!event) return '戦闘開始';
    const die = Number(event.die) || '-';
    if (event.resultType === 'miss') {
        const reason = event.reason ? ` / ${event.reason}` : '';
        return `出目${die} ミス${reason}`;
    }
    const action = event.action || {};
    const source = event.resultType === 'minorArcana' ? '小アルカナ' : '武器型';
    const actionName = action.name || action.skillName || source;
    return `出目${die} ${source}: ${actionName}`;
}

function meleeReplayElementalLabel(event) {
    const explicit = String(event?.elementalLabel || '').trim();
    if (explicit) return explicit;
    const relation = String(event?.elementalRelation || '').trim().toLowerCase();
    if (relation === 'weak') return 'WEAK!';
    if (relation === 'resist') return 'RESIST...';
    return '';
}

function normalizeMeleeElementKey(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'wand' || key === 'wands') return 'fire';
    if (key === 'sword' || key === 'swords') return 'wind';
    if (key === 'pentacle' || key === 'pentacles' || key === 'coin' || key === 'coins') return 'earth';
    if (key === 'cup' || key === 'cups') return 'water';
    if (key === 'fire' || key === 'wind' || key === 'earth' || key === 'water') return key;
    return 'none';
}

function normalizeMeleeSpriteWeapon(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'gun-big' || key === 'large_gun' || key === 'large-gun') return 'gun_big';
    if (key === 'claws' || key === 'claw_bite' || key === 'claw-bite' || key === '爪') return 'claw';
    if (key === 'fang' || key === 'fangs' || key === '牙' || key === '噛みつき') return 'bite';
    return key || 'sword';
}

function normalizeMeleeTarotSuit(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key.includes('wand')) return 'wand';
    if (key.includes('pentacle') || key.includes('coin')) return 'pentacle';
    if (key.includes('cup')) return 'cup';
    if (key.includes('sword')) return 'sword';
    return '';
}

function getMeleeTarotSpriteIndexFromParts(suitValue, rankValue) {
    const suit = normalizeMeleeTarotSuit(suitValue);
    const rank = Math.max(1, Math.min(14, Number(rankValue) || 1)) - 1;
    if (suit === 'wand') return rank;
    if (suit === 'pentacle') return 20 + rank;
    if (suit === 'cup') return 40 + rank;
    if (suit === 'sword') return 60 + rank;
    return MELEE_TAROT_BACK_INDEX;
}

function setMeleeTarotArtSprite(artEl, spriteIndex, scale = MELEE_SLOT_TAROT_SCALE) {
    if (!artEl) return;
    const col = spriteIndex % 10;
    const row = Math.floor(spriteIndex / 10);
    artEl.style.setProperty('--tarot-sheet-w', `${MELEE_TAROT_SHEET_W * scale}px`);
    artEl.style.setProperty('--tarot-sheet-h', `${MELEE_TAROT_SHEET_H * scale}px`);
    artEl.style.setProperty('--tarot-x', `${col * MELEE_TAROT_TILE_W * scale}px`);
    artEl.style.setProperty('--tarot-y', `${row * MELEE_TAROT_TILE_H * scale}px`);
    artEl.style.setProperty('--tarot-art-w', `${MELEE_TAROT_TILE_W * scale}px`);
    artEl.style.setProperty('--tarot-art-h', `${MELEE_TAROT_TILE_H * scale}px`);
    artEl.style.setProperty('--tarot-sprite-src', `url('${MELEE_TAROT_SPRITE_SRC}')`);
}

function meleeReplayMinorCardFromEvent(event) {
    const action = event?.action || {};
    return {
        itemId: String(action.itemId || action.cardId || ''),
        cardName: String(action.cardName || ''),
        skillName: String(action.skillName || action.name || ''),
        suit: normalizeMeleeTarotSuit(action.suit),
        elementKey: normalizeMeleeElementKey(action.elementKey || event?.attackElementKey || action.suit),
        rank: Number.isFinite(Number(action.rank)) ? Number(action.rank) : null,
        effectText: String(action.effectText || '')
    };
}

function selectMeleeAttackEffectPattern(config, seed = 0) {
    const patterns = Array.isArray(config?.patterns) && config.patterns.length > 0
        ? config.patterns
        : [{ startFrame: Number(config?.startFrame) || 0, frames: Number(config?.frames) || 1 }];
    const index = Math.abs(Math.floor(Number(seed) || 0)) % patterns.length;
    return {
        ...config,
        startFrame: Number(patterns[index]?.startFrame) || 0,
        frames: Math.max(1, Math.floor(Number(patterns[index]?.frames) || 1))
    };
}

function setMeleeAttackEffectFrame(sprite, config, frameIndex) {
    if (!sprite || !config) return;
    const frame = Math.max(0, Math.min(config.frames - 1, Math.floor(Number(frameIndex) || 0)));
    const absoluteFrame = Math.max(0, (Number(config.startFrame) || 0) + frame);
    const scale = Number(config.scale) || 2.35;
    const col = absoluteFrame % config.cols;
    const row = Math.floor(absoluteFrame / config.cols);
    sprite.style.width = `${MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.height = `${MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.backgroundImage = `url('${MELEE_ATTACK_EFFECT_BASE}${config.file}')`;
    sprite.style.backgroundSize = `${config.cols * MELEE_ATTACK_EFFECT_FRAME * scale}px ${config.rows * MELEE_ATTACK_EFFECT_FRAME * scale}px`;
    sprite.style.backgroundPosition = `-${col * MELEE_ATTACK_EFFECT_FRAME * scale}px -${row * MELEE_ATTACK_EFFECT_FRAME * scale}px`;
}

function createMeleeSpriteAttackEffect(config, side, options = {}) {
    if (!config) return null;
    const selectedConfig = selectMeleeAttackEffectPattern(config, options.seed);
    const effect = document.createElement('div');
    effect.className = `melee-sprite-attack-effect ${options.className || ''} is-${side}-side`;
    if (options.elementKey) effect.dataset.element = options.elementKey;
    if (options.weaponType) effect.dataset.weapon = options.weaponType;
    const sprite = document.createElement('span');
    sprite.className = `melee-attack-effect-sprite ${options.spriteClassName || ''}`;
    sprite.setAttribute('aria-hidden', 'true');
    setMeleeAttackEffectFrame(sprite, selectedConfig, 0);
    effect.appendChild(sprite);
    return { effect, sprite, config: selectedConfig };
}

function createMeleeElementalAttackEffect(elementKey, side, seed = 0) {
    const key = normalizeMeleeElementKey(elementKey);
    return createMeleeSpriteAttackEffect(MELEE_ELEMENTAL_EFFECTS[key], side, {
        seed,
        elementKey: key,
        className: 'melee-elemental-attack-effect',
        spriteClassName: 'melee-elemental-effect-sprite'
    });
}

function createMeleeWeaponAttackEffect(weaponType, side, seed = 0) {
    const weapon = normalizeMeleeSpriteWeapon(weaponType);
    return createMeleeSpriteAttackEffect(MELEE_WEAPON_EFFECTS[weapon] || MELEE_WEAPON_EFFECTS.unarmed, side, {
        seed,
        weaponType: weapon,
        className: 'melee-weapon-attack-effect',
        spriteClassName: 'melee-weapon-effect-sprite'
    });
}

function playMeleeSpriteAttackEffect(effectParts) {
    if (!effectParts) return;
    const { effect, sprite, config } = effectParts;
    let frame = 0;
    let timer = null;
    const tick = () => {
        setMeleeAttackEffectFrame(sprite, config, frame);
        frame += 1;
        if (frame >= config.frames) {
            window.clearInterval(timer);
            window.setTimeout(() => effect.remove(), 220);
        }
    };
    tick();
    timer = window.setInterval(tick, config.intervalMs);
    window.setTimeout(() => {
        window.clearInterval(timer);
        effect.remove();
    }, config.frames * config.intervalMs + 520);
}

function createMeleeReplayMinorArcanaEffect(card, side) {
    const effect = document.createElement('div');
    effect.className = `melee-minor-arcana-effect is-${side}-side`;
    effect.dataset.cardName = String(card?.cardName || '');
    effect.dataset.suit = normalizeMeleeTarotSuit(card?.suit);
    effect.dataset.rank = String(card?.rank ?? '');
    effect.dataset.skillName = String(card?.skillName || '');

    const artWrap = document.createElement('div');
    artWrap.className = 'melee-minor-arcana-card';

    const art = document.createElement('span');
    art.className = 'tarot-card-art melee-minor-arcana-art';
    setMeleeTarotArtSprite(art, getMeleeTarotSpriteIndexFromParts(card?.suit, card?.rank), MELEE_MINOR_CUTIN_TAROT_SCALE);
    artWrap.appendChild(art);

    const name = document.createElement('div');
    name.className = 'melee-minor-arcana-name';
    name.textContent = card?.skillName || '小アルカナ';

    effect.appendChild(artWrap);
    effect.appendChild(name);
    return effect;
}

function createMeleeReplaySlotWeaponIcon(weaponType) {
    const icon = document.createElement('span');
    icon.className = 'melee-slot-icon weapon-sprite';
    icon.dataset.weapon = normalizeMeleeSpriteWeapon(weaponType);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createMeleeReplaySlotDieIcon(slotEl) {
    const icon = document.createElement('span');
    icon.className = 'melee-replay-slot-die dice-sprite';
    icon.dataset.die = String(slotEl?.dataset?.die || '');
    icon.setAttribute('aria-label', `D${slotEl?.dataset?.die || '-'}`);
    return icon;
}

function createMeleeReplaySlotTarotIcon(slotEl) {
    const icon = document.createElement('span');
    icon.className = 'melee-slot-icon melee-slot-tarot';
    icon.dataset.suit = slotEl.dataset.cardSuit || '';
    icon.dataset.rank = slotEl.dataset.cardRank || '';
    icon.setAttribute('aria-label', slotEl.dataset.cardName || 'minor arcana');

    const art = document.createElement('span');
    art.className = 'tarot-card-art';
    setMeleeTarotArtSprite(art, getMeleeTarotSpriteIndexFromParts(slotEl.dataset.cardSuit, slotEl.dataset.cardRank));
    icon.appendChild(art);
    return icon;
}

function setMeleeReplaySlotVisual(slotEl, visualType) {
    if (!slotEl || slotEl.dataset.slotVisual === visualType) return;
    slotEl.dataset.slotVisual = visualType;
    const dieIcon = createMeleeReplaySlotDieIcon(slotEl);
    if (visualType === 'tarot' && slotEl.dataset.hasCard === 'true') {
        slotEl.replaceChildren(dieIcon, createMeleeReplaySlotTarotIcon(slotEl));
        return;
    }
    slotEl.replaceChildren(dieIcon, createMeleeReplaySlotWeaponIcon(slotEl.dataset.weapon));
}

function normalizeMeleeReplaySlots(slotList) {
    const byDie = new Map((Array.isArray(slotList) ? slotList : [])
        .map((slot) => [Number(slot?.die) || 0, slot])
        .filter(([die]) => die >= 1 && die <= 6));
    return [1, 2, 3, 4, 5, 6].map((die) => byDie.get(die) || {
        die,
        initialUnlocked: false,
        weaponForm: null,
        card: null
    });
}

function getMeleeReplaySlotName(slot) {
    return slot?.card?.skillName
        || slot?.card?.name
        || slot?.weaponForm?.name
        || '武器型';
}

function getMeleeWeaponShakeProfile(weaponType) {
    return battleAvatarCombat?.getCombatWeaponMotionProfile?.(weaponType)?.shake || null;
}

function triggerMeleeWeaponShake(stage, weaponType) {
    const profile = getMeleeWeaponShakeProfile(weaponType);
    if (!stage || !profile) return;
    stage.style.setProperty('--melee-shake-x', `${profile.x}px`);
    stage.style.setProperty('--melee-shake-y', `${profile.y}px`);
    stage.style.setProperty('--melee-shake-duration', `${profile.duration}ms`);
    flashElementClass(stage, 'is-damage-shake', profile.duration);
    window.setTimeout(() => {
        stage.style.removeProperty('--melee-shake-x');
        stage.style.removeProperty('--melee-shake-y');
        stage.style.removeProperty('--melee-shake-duration');
    }, profile.duration + 80);
}

function getBattleAvatarForCombatant(viewerId, combatantId) {
    const isViewer = viewerId && String(combatantId || '') === String(viewerId);
    return document.getElementById(isViewer ? 'battle-avatar-B' : 'battle-avatar-A');
}

function setMeleeAvatarVictorious(avatar, victorious, side = '') {
    battleAvatarCombat?.setCombatAvatarVictory?.(avatar, victorious, { side });
}

function setMeleeAvatarDefeated(avatar, defeated, side = '') {
    battleAvatarCombat?.setCombatAvatarKo?.(avatar, defeated, { side });
}

function resetBattleAvatarDefeatedStates() {
    setMeleeAvatarVictorious(document.getElementById('battle-avatar-A'), false, 'enemy');
    setMeleeAvatarVictorious(document.getElementById('battle-avatar-B'), false, 'player');
    setMeleeAvatarDefeated(document.getElementById('battle-avatar-A'), false, 'enemy');
    setMeleeAvatarDefeated(document.getElementById('battle-avatar-B'), false, 'player');
}

function syncBattleAvatarDefeatFromPlayerState(opponent, me) {
    const opponentHp = Number(opponent?.hp);
    const myHp = Number(me?.hp);
    setMeleeAvatarDefeated(
        document.getElementById('battle-avatar-A'),
        Number.isFinite(opponentHp) && opponentHp <= 0,
        'enemy'
    );
    setMeleeAvatarDefeated(
        document.getElementById('battle-avatar-B'),
        Number.isFinite(myHp) && myHp <= 0,
        'player'
    );
}

function syncMeleeReplayAvatarDefeat(panel, hpById) {
    if (!panel || !(hpById instanceof Map)) return;
    const viewerId = String(panel.dataset.viewerId || '');
    panel.querySelectorAll('.melee-replay-combatant').forEach((combatantEl) => {
        const id = String(combatantEl.dataset.combatantId || '');
        if (!id) return;
        const hp = Number(hpById.get(id));
        const side = combatantEl.classList.contains('is-player-side') ? 'player' : 'enemy';
        setMeleeAvatarDefeated(
            getBattleAvatarForCombatant(viewerId, id),
            Number.isFinite(hp) && hp <= 0,
            side
        );
    });
}

function syncMeleeReplayAvatarVictory(panel, hpById, isFinalFrame, winnerId = '') {
    if (!panel) return;
    const viewerId = String(panel.dataset.viewerId || '');
    const explicitWinnerId = String(winnerId || panel.dataset.winnerId || '');
    panel.querySelectorAll('.melee-replay-combatant').forEach((combatantEl) => {
        const id = String(combatantEl.dataset.combatantId || '');
        if (!id) return;
        const side = combatantEl.classList.contains('is-player-side') ? 'player' : 'enemy';
        const hp = Number(hpById instanceof Map ? hpById.get(id) : NaN);
        const isWinner = isFinalFrame && explicitWinnerId && id === explicitWinnerId && (!Number.isFinite(hp) || hp > 0);
        setMeleeAvatarVictorious(getBattleAvatarForCombatant(viewerId, id), isWinner, side);
    });
}

function syncBattleAvatarVictoryFromWinner(winnerId, viewerId) {
    const winner = String(winnerId || '');
    const viewer = String(viewerId || '');
    if (!winner) {
        setMeleeAvatarVictorious(document.getElementById('battle-avatar-A'), false, 'enemy');
        setMeleeAvatarVictorious(document.getElementById('battle-avatar-B'), false, 'player');
        return;
    }
    setMeleeAvatarVictorious(document.getElementById('battle-avatar-A'), winner !== viewer, 'enemy');
    setMeleeAvatarVictorious(document.getElementById('battle-avatar-B'), winner === viewer, 'player');
}

function getMeleeReplayCombatantElement(panel, combatantId) {
    const id = String(combatantId || '');
    return Array.from(panel?.querySelectorAll?.('.melee-replay-combatant') || [])
        .find((element) => String(element.dataset.combatantId || '') === id) || null;
}

function flashElementClass(element, className, duration = 240) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
}

function normalizeMeleeFeedbackIconKey(text, type = 'damage') {
    const label = String(text || '').trim().toUpperCase();
    if (type === 'damage') return 'damage';
    if (type === 'heal') return 'heal';
    if (label === 'MISS') return 'miss';
    if (label === 'PARRY') return 'parry';
    if (label.startsWith('WEAK')) return 'weak';
    if (label.startsWith('RESIST')) return 'resist';
    if (label === 'BURN') return 'burn';
    if (label === 'WET') return 'wet';
    if (label === 'FEAR') return 'fear';
    if (label === 'CONFUSE') return 'confuse';
    if (label === 'SLOW') return 'slow';
    if (label === 'WEAKEN') return 'weaken';
    if (label === 'POISON') return 'poison';
    if (label === 'PARALYSIS') return 'paralysis';
    if (label === 'SLEEP') return 'sleep';
    if (label === 'SILENCE') return 'silence';
    if (label === 'BLIND') return 'blind';
    if (label === 'ATK DOWN') return 'atkDown';
    if (label === 'DEF DOWN') return 'defDown';
    if (label === 'SPEED DOWN') return 'speedDown';
    if (label === 'ACC DOWN') return 'accDown';
    if (label === 'VULN UP') return 'vulnUp';
    if (label === 'GUARD') return 'guard';
    return '';
}

function getMeleeFeedbackTone(iconKey, type = 'damage') {
    if (type === 'damage') return 'damage';
    if (type === 'heal') return 'heal';
    if (type === 'miss') return 'miss';
    if (iconKey === 'guard' || iconKey === 'parry') return 'buff';
    if (iconKey === 'weak') return 'advantage';
    if (iconKey === 'resist') return 'resist';
    if (iconKey === 'burn' || iconKey === 'wet' || iconKey === 'fear' || iconKey === 'confuse' || iconKey === 'poison' || iconKey === 'paralysis' || iconKey === 'sleep' || iconKey === 'silence') return 'ailment';
    if (iconKey === 'slow' || iconKey === 'weaken' || iconKey === 'blind' || iconKey === 'atkDown' || iconKey === 'defDown' || iconKey === 'speedDown' || iconKey === 'accDown' || iconKey === 'vulnUp') return 'debuff';
    return type === 'status' ? 'status' : type;
}

function appendMeleeFeedbackText(labelEl, text, type = 'damage') {
    const value = String(text || '');
    if (type !== 'damage' && type !== 'heal') {
        labelEl.textContent = value;
        return;
    }
    value.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.className = /[0-9]/.test(char) ? 'melee-feedback-digit' : 'melee-feedback-sign';
        span.style.setProperty('--digit-delay', `${index * 34}ms`);
        span.textContent = char;
        labelEl.appendChild(span);
    });
}

function createMeleeFeedbackIcon(iconKey) {
    const index = MELEE_FEEDBACK_ICON_INDEX[iconKey];
    if (!Number.isFinite(index)) return null;
    const col = index % MELEE_FEEDBACK_ICON_COLS;
    const row = Math.floor(index / MELEE_FEEDBACK_ICON_COLS);
    const icon = document.createElement('span');
    icon.className = 'melee-feedback-icon';
    icon.dataset.iconKey = iconKey;
    icon.dataset.iconIndex = String(index);
    icon.style.setProperty('--icon-col', String(col));
    icon.style.setProperty('--icon-row', String(row));
    icon.style.setProperty('--icon-col-pos', `${(col / (MELEE_FEEDBACK_ICON_COLS - 1)) * 100}%`);
    icon.style.setProperty('--icon-row-pos', `${(row / (MELEE_FEEDBACK_ICON_ROWS - 1)) * 100}%`);
    return icon;
}

function normalizeMeleeStatusSnapshot(source = {}) {
    const numberOr = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const positive = (value) => Math.max(0, Math.floor(numberOr(value, 0)));
    return {
        morale: numberOr(source.morale, 0),
        burn: positive(source.burn ?? source.burnTurns),
        slow: positive(source.slow ?? source.slowTurns ?? source.flood ?? source.floodTurns),
        weaken: positive(source.weaken ?? source.weakenTurns ?? source.fear ?? source.fearTurns),
        confusion: positive(source.confusion ?? source.confusionTurns),
        poison: positive(source.poison ?? source.poisonTurns),
        paralysis: positive(source.paralysis ?? source.paralysisTurns),
        sleep: positive(source.sleep ?? source.sleepTurns),
        silence: positive(source.silence ?? source.silenceTurns),
        blind: positive(source.blind ?? source.blindTurns),
        attackMultiplier: numberOr(source.attackMultiplier, 1),
        defenseMultiplier: numberOr(source.defenseMultiplier, 1),
        speedMultiplier: numberOr(source.speedMultiplier, 1),
        accuracyBonus: numberOr(source.accuracyBonus, 0),
        damageTakenMultiplier: numberOr(source.damageTakenMultiplier, 1),
        guardCharges: positive(source.guardCharges ?? source.nextDamageTakenCharges),
        counter: positive(source.counter ?? source.counterTurns),
        evasion: positive(source.evasion ?? source.evasionTurns),
        parryCharges: positive(source.parryCharges)
    };
}

function getMeleePersistentStatusForLabel(label) {
    const iconKey = normalizeMeleeFeedbackIconKey(label, 'status');
    if (!iconKey || iconKey === 'parry' || iconKey === 'weak' || iconKey === 'resist') return null;
    const statusIconKey = iconKey === 'wet' ? 'slow' : iconKey === 'fear' ? 'weaken' : iconKey;
    return MELEE_PERSISTENT_STATUS_DEFS.find((entry) => entry.iconKey === statusIconKey) || null;
}

function isMeleePersistentStatusLabel(label) {
    return !!getMeleePersistentStatusForLabel(label);
}

function getMeleeActiveStatusIcons(status) {
    const normalized = normalizeMeleeStatusSnapshot(status);
    return MELEE_PERSISTENT_STATUS_DEFS.filter((entry) => {
        try {
            return entry.isActive(normalized);
        } catch (error) {
            return false;
        }
    });
}

function createMeleePersistentStatusIcon(entry) {
    const icon = createMeleeFeedbackIcon(entry?.iconKey);
    if (!icon) return null;
    icon.classList.add('melee-status-icon');
    icon.dataset.statusKey = entry.key;
    icon.dataset.feedbackTone = entry.tone || '';
    icon.title = entry.label;
    icon.setAttribute('aria-label', entry.label);
    return icon;
}

function renderMeleePersistentStatusIcons(root, status) {
    if (!root) return;
    const icons = getMeleeActiveStatusIcons(status)
        .map(createMeleePersistentStatusIcon)
        .filter(Boolean);
    root.replaceChildren(...icons);
    root.dataset.statusCount = String(icons.length);
    root.classList.toggle('is-empty', icons.length === 0);
}

function ensureMeleeReplayStatusTray(stage, side) {
    if (!stage) return null;
    const normalizedSide = side === 'player' ? 'player' : 'enemy';
    const selector = `.melee-status-tray.is-${normalizedSide}-side`;
    let tray = stage.querySelector(selector);
    if (tray) return tray;
    tray = document.createElement('div');
    tray.className = `melee-status-tray is-${normalizedSide}-side is-empty`;
    tray.dataset.side = normalizedSide;
    stage.appendChild(tray);
    return tray;
}

function applyMeleeReplayStatusChange(status, change) {
    if (!status || !change) return;
    const rawKey = String(change.key || '');
    const key = rawKey === 'flood' ? 'slow' : rawKey === 'fear' ? 'weaken' : rawKey;
    const value = Number(change.after);
    if (!Number.isFinite(value)) return;
    if (['burn', 'slow', 'weaken', 'confusion', 'poison', 'paralysis', 'sleep', 'silence', 'blind'].includes(key)) {
        status[key] = Math.max(0, Math.floor(value));
        return;
    }
    if ([
        'morale',
        'attackMultiplier',
        'defenseMultiplier',
        'speedMultiplier',
        'accuracyBonus',
        'damageTakenMultiplier',
        'guardCharges',
        'counter',
        'evasion',
        'parryCharges'
    ].includes(key)) {
        status[key] = value;
    }
}

function getMeleeReplayStatusSnapshots(duel, lastFrame) {
    const setup = duel?.setup || {};
    const combatants = Array.isArray(setup.combatants) ? setup.combatants : [];
    const timeline = Array.isArray(duel?.timeline) ? duel.timeline : [];
    const statusById = new Map();
    combatants.forEach((combatant) => {
        const id = String(combatant?.id || '');
        if (id) statusById.set(id, normalizeMeleeStatusSnapshot(combatant?.status || {}));
    });
    const setSnapshot = (combatantId, snapshot) => {
        const id = String(combatantId || '');
        if (!id || !snapshot) return;
        statusById.set(id, normalizeMeleeStatusSnapshot(snapshot));
    };
    const applyFallbackChanges = (event) => {
        (Array.isArray(event?.statusChanges) ? event.statusChanges : []).forEach((change) => {
            const combatantId = change.target === 'actor' ? event.actorId : event.targetId;
            const id = String(combatantId || '');
            if (!id) return;
            const current = statusById.get(id) || normalizeMeleeStatusSnapshot();
            applyMeleeReplayStatusChange(current, change);
            statusById.set(id, current);
        });
    };
    for (let index = 0; index <= lastFrame && index < timeline.length; index += 1) {
        const event = timeline[index];
        if (!event) continue;
        setSnapshot(event.actorId, event.attackerStatusBefore);
        setSnapshot(event.targetId, event.defenderStatusBefore);
        if (event.attackerStatusAfter || event.defenderStatusAfter) {
            setSnapshot(event.actorId, event.attackerStatusAfter);
            setSnapshot(event.targetId, event.defenderStatusAfter);
        } else {
            applyFallbackChanges(event);
        }
    }
    return statusById;
}

function syncMeleeReplayStatusIcons(panel, duel, lastFrame) {
    if (!panel || !duel) return;
    const stage = document.getElementById('battleStage');
    if (!stage) return;
    const statusById = getMeleeReplayStatusSnapshots(duel, lastFrame);
    const activeSides = new Set();
    panel.querySelectorAll('.melee-replay-combatant').forEach((combatantEl) => {
        const id = String(combatantEl.dataset.combatantId || '');
        const side = combatantEl.classList.contains('is-player-side') ? 'player' : 'enemy';
        const tray = ensureMeleeReplayStatusTray(stage, side);
        if (!tray) return;
        activeSides.add(side);
        tray.dataset.combatantId = id;
        renderMeleePersistentStatusIcons(tray, statusById.get(id) || {});
    });
    ['enemy', 'player'].forEach((side) => {
        if (activeSides.has(side)) return;
        const tray = stage.querySelector(`.melee-status-tray.is-${side}-side`);
        if (tray) renderMeleePersistentStatusIcons(tray, {});
    });
}

function createMeleeReplayFeedbackPopup(combatantId, text, viewerId = '', type = 'damage', stackIndex = 0) {
    const stage = document.getElementById('battleStage');
    if (!stage || !text) return;
    const isViewer = viewerId && String(combatantId || '') === viewerId;
    const stack = Math.max(0, Number(stackIndex) || 0);
    const popup = document.createElement('span');
    popup.className = `melee-damage-pop is-${type} ${isViewer ? 'is-player-side' : 'is-enemy-side'}`;
    popup.dataset.feedbackType = type;
    const iconKey = normalizeMeleeFeedbackIconKey(text, type);
    const tone = getMeleeFeedbackTone(iconKey, type);
    if (iconKey) popup.dataset.feedbackKey = iconKey;
    if (tone) popup.dataset.feedbackTone = tone;
    const numericAmount = Math.abs(Number(String(text).replace(/[^0-9.-]/g, '')) || 0);
    if (numericAmount >= 50) popup.classList.add('is-heavy-hit');
    popup.style.setProperty('--feedback-stack-y', `${type === 'status' ? stack * -18 : 0}px`);
    popup.style.setProperty('--feedback-x', `${type === 'status' ? (isViewer ? -8 : 8) : 0}px`);
    const icon = type === 'damage' ? null : createMeleeFeedbackIcon(iconKey);
    if (icon) popup.appendChild(icon);
    const label = document.createElement('span');
    label.className = 'melee-feedback-text';
    appendMeleeFeedbackText(label, text, type);
    popup.appendChild(label);
    stage.appendChild(popup);
    window.setTimeout(() => popup.remove(), type === 'status' ? 2800 : 2400);
}

function createMeleeReplayDamagePopup(combatantId, amount = 0, viewerId = '') {
    if (amount <= 0) return;
    createMeleeReplayFeedbackPopup(combatantId, `-${Math.ceil(amount)}`, viewerId, 'damage');
}

function createMeleeReplayHealingPopup(combatantId, amount = 0, viewerId = '') {
    if (amount <= 0) return;
    createMeleeReplayFeedbackPopup(combatantId, `+${Math.ceil(amount)}`, viewerId, 'heal');
}

function meleeReplayStatusChangeLabel(change) {
    const rawKey = String(change?.key || '');
    const key = rawKey === 'flood' ? 'slow' : rawKey === 'fear' ? 'weaken' : rawKey;
    const before = Number(change?.before);
    const after = Number(change?.after);
    const increased = Number.isFinite(before) && Number.isFinite(after) && after > before;
    const decreased = Number.isFinite(before) && Number.isFinite(after) && after < before;
    if ((key === 'burn' || key === 'slow' || key === 'weaken' || key === 'confusion' || key === 'poison' || key === 'paralysis' || key === 'sleep' || key === 'silence' || key === 'blind') && increased) {
        return ({ burn: 'BURN', slow: 'SLOW', weaken: 'WEAKEN', confusion: 'CONFUSE', poison: 'POISON', paralysis: 'PARALYSIS', sleep: 'SLEEP', silence: 'SILENCE', blind: 'BLIND' })[key];
    }
    if (key === 'attackMultiplier' && decreased) return 'ATK DOWN';
    if (key === 'defenseMultiplier' && decreased) return 'DEF DOWN';
    if (key === 'speedMultiplier' && decreased) return 'SPEED DOWN';
    if (key === 'accuracyBonus' && decreased) return 'ACC DOWN';
    if (key === 'damageTakenMultiplier' && increased) return 'VULN UP';
    if (key === 'guardCharges' && increased) return 'GUARD';
    return '';
}

function isMeleeReplayMissEvent(event) {
    if (!event) return false;
    if (event.parried) return false;
    if (event.resultType === 'miss') return true;
    const action = event.action || {};
    const looksLikeAttack = action.kind === 'attack' || action.power != null || action.accuracy != null;
    return looksLikeAttack && !event.anyHit && Number(event.damage) <= 0 && Number(event.healing) <= 0;
}

function isMeleeReplayMinorArcanaEvent(event) {
    return !!event && event.resultType === 'minorArcana';
}

function createMeleeReplayPanel(duel, meta = {}) {
    const setup = duel?.setup || {};
    const combatants = Array.isArray(setup.combatants) ? setup.combatants : [];
    const viewerId = String(meta?.viewerId || '');
    const panel = document.createElement('section');
    panel.id = 'battleMeleeReplay';
    panel.className = 'melee-replay-panel';
    panel.dataset.viewerId = viewerId;
    panel.dataset.winnerId = String(duel?.winnerId || meta?.winnerId || '');

    const header = document.createElement('div');
    header.className = 'melee-replay-header';

    const title = document.createElement('div');
    title.className = 'melee-replay-title';
    title.innerText = '白兵戦リプレイ';

    const roundLabel = document.createElement('div');
    roundLabel.className = 'melee-replay-round';
    roundLabel.innerText = `第${duel?.round || 1}戦`;

    header.appendChild(title);
    header.appendChild(roundLabel);
    panel.appendChild(header);

    const actionArea = document.createElement('div');
    actionArea.className = 'melee-replay-action';

    const die = document.createElement('div');
    die.className = 'melee-replay-die dice-sprite';
    die.innerText = 'D6';
    die.setAttribute('aria-label', '出目なし');

    const actionText = document.createElement('div');
    actionText.className = 'melee-replay-action-text';

    const actionTitle = document.createElement('div');
    actionTitle.className = 'melee-replay-action-title';
    actionTitle.innerText = '戦闘開始';

    const actionMeta = document.createElement('div');
    actionMeta.className = 'melee-replay-action-meta';
    actionMeta.innerText = '出目2〜6は小アルカナスロット';

    actionText.appendChild(actionTitle);
    actionText.appendChild(actionMeta);
    actionArea.appendChild(die);
    actionArea.appendChild(actionText);
    panel.appendChild(actionArea);

    const board = document.createElement('div');
    board.className = 'melee-replay-board';
    combatants.slice(0, 2).forEach((combatant) => {
        const combatantId = String(combatant?.id || '');
        const isViewer = !!viewerId && combatantId === viewerId;
        const card = document.createElement('div');
        card.className = 'melee-replay-combatant';
        card.classList.add(isViewer ? 'is-player-side' : 'is-enemy-side');
        card.dataset.combatantId = combatantId;
        card.dataset.side = isViewer ? 'player' : 'enemy';
        card.dataset.weapon = normalizeMeleeSpriteWeapon(combatant?.weaponType);
        card.dataset.element = combatant?.elementKey || 'none';
        if (combatant?.elementLabel) card.dataset.elementLabel = combatant.elementLabel;

        const row = document.createElement('div');
        row.className = 'melee-replay-combatant-row';

        const identity = document.createElement('div');
        identity.className = 'melee-replay-combatant-identity';

        const name = document.createElement('div');
        name.className = 'melee-replay-name';
        name.innerText = combatant?.name || '???';

        const weapon = document.createElement('div');
        weapon.className = 'melee-replay-weapon';
        weapon.innerText = combatant?.weaponLabel || combatant?.weaponType || '武器';

        identity.appendChild(name);
        row.appendChild(identity);
        row.appendChild(weapon);

        const hp = document.createElement('div');
        hp.className = 'melee-replay-hp';
        const hpFill = document.createElement('div');
        hpFill.className = 'melee-replay-hp-fill';
        hp.appendChild(hpFill);

        const hpText = document.createElement('div');
        hpText.className = 'melee-replay-hp-text';

        const slots = document.createElement('div');
        slots.className = 'melee-replay-slots';
        const slotList = normalizeMeleeReplaySlots(combatant?.slots);
        slotList.forEach((slot) => {
            const slotEl = document.createElement('div');
            const slotCard = slot?.card || null;
            slotEl.className = 'melee-replay-slot';
            slotEl.dataset.die = String(slot?.die || '');
            slotEl.dataset.weapon = normalizeMeleeSpriteWeapon(combatant?.weaponType);
            slotEl.dataset.hasCard = slotCard ? 'true' : 'false';
            slotEl.dataset.initialUnlocked = slot?.initialUnlocked ? 'true' : 'false';
            slotEl.dataset.resultType = slot?.initialUnlocked ? 'minorArcana' : 'weaponForm';
            if (slotCard) {
                slotEl.dataset.cardSuit = normalizeMeleeTarotSuit(slotCard.suit);
                slotEl.dataset.cardRank = String(slotCard.rank ?? slotCard.number ?? '');
                slotEl.dataset.cardName = slotCard.cardName || slotCard.name || slotCard.skillName || '';
                slotEl.classList.add('has-card');
            }
            if (slot?.initialUnlocked) slotEl.classList.add('is-unlocked');
            slotEl.title = `D${slot?.die || '-'}: ${slotCard?.cardName || slotCard?.skillName || slot?.weaponForm?.name || ''}`;
            setMeleeReplaySlotVisual(slotEl, slot?.initialUnlocked ? 'tarot' : 'weapon');
            slots.appendChild(slotEl);
        });

        card.appendChild(row);
        card.appendChild(hp);
        card.appendChild(hpText);
        card.appendChild(slots);
        board.appendChild(card);
    });
    panel.appendChild(board);

    return panel;
}

function triggerMeleeReplayTechniqueBanner(panel, event, frameIndex) {
    if (!panel || !event || !event?.action) return;
    const key = String(frameIndex);
    if (panel.dataset.bannerFrame === key) return;
    panel.dataset.bannerFrame = key;
    const stage = document.getElementById('battleStage');
    if (!stage) return;
    const viewerId = String(panel.dataset.viewerId || '');
    const isViewer = viewerId && String(event.actorId || '') === viewerId;
    const side = isViewer ? 'player' : 'enemy';
    const techniqueText = event.action?.name || event.action?.skillName || '攻撃';
    stage.querySelectorAll('.melee-technique-banner').forEach((node) => node.remove());
    const banner = document.createElement('div');
    banner.className = `melee-technique-banner is-${side}-side`;
    banner.textContent = techniqueText;
    stage.appendChild(banner);
    window.setTimeout(() => banner.remove(), 1100);
}

function triggerMeleeReplayAvatarMotion(panel, event, frameIndex) {
    if (!panel || !event || event.resultType === 'miss') return;
    if (event?.action?.kind !== 'attack') return;
    const key = String(frameIndex);
    if (panel.dataset.motionFrame === key) return;
    panel.dataset.motionFrame = key;
    const viewerId = String(panel.dataset.viewerId || '');
    const isViewer = viewerId && String(event.actorId || '') === viewerId;
    const avatar = getBattleAvatarForCombatant(viewerId, event.actorId);
    if (!avatar || avatar.classList.contains('is-avatar-defeated')) return;
    const direction = isViewer ? 'left' : 'right';
    const combatantEl = getMeleeReplayCombatantElement(panel, event.actorId);
    const weaponType = combatantEl?.dataset.weapon;
    void battleAvatarCombat?.playCombatAvatarAttack?.(avatar, weaponType, {
        direction,
        bodyMotion: false
    });
}

function triggerMeleeReplayMinorArcanaEffect(panel, event, frameIndex) {
    if (!panel || !isMeleeReplayMinorArcanaEvent(event)) return;
    const key = String(frameIndex);
    if (panel.dataset.minorArcanaFrame === key) return;
    panel.dataset.minorArcanaFrame = key;
    const stage = document.getElementById('battleStage');
    if (!stage) return;
    const viewerId = String(panel.dataset.viewerId || '');
    const isViewer = viewerId && String(event.actorId || '') === viewerId;
    const side = isViewer ? 'player' : 'enemy';
    const card = meleeReplayMinorCardFromEvent(event);
    stage.querySelectorAll(`.melee-minor-arcana-effect.is-${side}-side`).forEach((node) => node.remove());
    const effect = createMeleeReplayMinorArcanaEffect(card, side);
    stage.appendChild(effect);
    window.setTimeout(() => effect.remove(), 2600);
}

function triggerMeleeReplayElementalAttackEffect(panel, event, frameIndex) {
    if (!panel || !isMeleeReplayMinorArcanaEvent(event)) return;
    if (event?.action?.kind !== 'attack') return;
    if (!event.anyHit && Number(event.damage) <= 0) return;
    const elementKey = normalizeMeleeElementKey(event.attackElementKey || event.action?.elementKey || event.action?.suit);
    if (!MELEE_ELEMENTAL_EFFECTS[elementKey]) return;
    const key = `${frameIndex}:${event.actorId || ''}:${event.targetId || ''}:${elementKey}`;
    if (panel.dataset.elementalFrame === key) return;
    panel.dataset.elementalFrame = key;
    const stage = document.getElementById('battleStage');
    if (!stage) return;
    const viewerId = String(panel.dataset.viewerId || '');
    const side = viewerId && String(event.targetId || '') === viewerId ? 'player' : 'enemy';
    stage.querySelectorAll(`.melee-elemental-attack-effect.is-${side}-side`).forEach((node) => node.remove());
    const effectParts = createMeleeElementalAttackEffect(elementKey, side, event.action?.rank || event.die || frameIndex);
    if (!effectParts) return;
    stage.appendChild(effectParts.effect);
    playMeleeSpriteAttackEffect(effectParts);
}

function triggerMeleeReplayWeaponAttackEffect(panel, event, frameIndex) {
    if (!panel || !event || event.resultType !== 'weaponForm') return;
    if (event?.action?.kind !== 'attack') return;
    if (!event.anyHit && Number(event.damage) <= 0) return;
    const stage = document.getElementById('battleStage');
    if (!stage) return;
    const viewerId = String(panel.dataset.viewerId || '');
    const side = viewerId && String(event.targetId || '') === viewerId ? 'player' : 'enemy';
    const combatantEl = getMeleeReplayCombatantElement(panel, event.actorId);
    const weaponType = normalizeMeleeSpriteWeapon(combatantEl?.dataset.weapon || event.action?.weaponType || '');
    const key = `${frameIndex}:${event.actorId || ''}:${event.targetId || ''}:${weaponType}`;
    if (panel.dataset.weaponEffectFrame === key) return;
    panel.dataset.weaponEffectFrame = key;
    stage.querySelectorAll(`.melee-weapon-attack-effect.is-${side}-side`).forEach((node) => node.remove());
    const effectParts = createMeleeWeaponAttackEffect(weaponType, side, event.die || frameIndex);
    if (!effectParts) return;
    stage.appendChild(effectParts.effect);
    playMeleeSpriteAttackEffect(effectParts);
}

function triggerMeleeReplayDamageFeedback(panel, event, frameIndex) {
    if (!panel || !event) return;
    const key = String(frameIndex);
    if (panel.dataset.damageFrame === key) return;
    panel.dataset.damageFrame = key;
    const viewerId = String(panel.dataset.viewerId || '');
    const flashByCombatant = (combatantId) => {
        if (!combatantId) return;
        const avatar = getBattleAvatarForCombatant(viewerId, combatantId);
        battleAvatarCombat?.flashCombatAvatarHurt?.(avatar);
    };
    if (Number(event.damage) > 0) {
        flashByCombatant(event.targetId);
        createMeleeReplayDamagePopup(event.targetId, Number(event.damage), viewerId);
    }
    if (Number(event.selfDamage) > 0) {
        flashByCombatant(event.actorId);
        createMeleeReplayDamagePopup(event.actorId, Number(event.selfDamage), viewerId);
    }
    if (Number(event.healing) > 0) {
        createMeleeReplayHealingPopup(event.actorId, Number(event.healing), viewerId);
    }
    if (Number(event.damage) > 0 || Number(event.selfDamage) > 0) {
        const stage = document.getElementById('battleStage');
        flashElementClass(stage, event.isCritical ? 'is-camera-hit-zoom-crit' : 'is-camera-hit-zoom', event.isCritical ? 420 : 260);
        const combatantEl = getMeleeReplayCombatantElement(panel, event.actorId);
        triggerMeleeWeaponShake(stage, combatantEl?.dataset.weapon);
    }
    const shownStatus = new Set();
    const statusStacks = new Map();
    if (event.parried) {
        const targetId = event.targetId || event.actorId;
        const stackIndex = statusStacks.get(targetId) || 0;
        statusStacks.set(targetId, stackIndex + 1);
        createMeleeReplayFeedbackPopup(targetId, 'PARRY', viewerId, 'status', stackIndex);
    }
    if (isMeleeReplayMissEvent(event)) {
        createMeleeReplayFeedbackPopup(event.targetId || event.actorId, 'MISS', viewerId, 'miss');
    }
    const elementalLabel = meleeReplayElementalLabel(event);
    if (elementalLabel && Number(event.damage) > 0) {
        const targetId = event.targetId || event.actorId;
        const stackIndex = statusStacks.get(targetId) || 0;
        statusStacks.set(targetId, stackIndex + 1);
        createMeleeReplayFeedbackPopup(targetId, elementalLabel, viewerId, 'status', stackIndex);
    }
    (Array.isArray(event.statusChanges) ? event.statusChanges : []).forEach((change) => {
        const label = meleeReplayStatusChangeLabel(change);
        if (!label || shownStatus.has(`${change.target}:${label}`)) return;
        if (isMeleePersistentStatusLabel(label)) return;
        shownStatus.add(`${change.target}:${label}`);
        const targetId = change.target === 'actor' ? event.actorId : event.targetId;
        const stackIndex = statusStacks.get(targetId) || 0;
        statusStacks.set(targetId, stackIndex + 1);
        createMeleeReplayFeedbackPopup(targetId, label, viewerId, 'status', stackIndex);
    });
}

function setMeleeReplayDie(panel, die, label = null) {
    const dieEl = panel?.querySelector?.('.melee-replay-die');
    if (!dieEl) return;
    if (die == null) {
        delete dieEl.dataset.die;
        dieEl.innerText = 'D6';
        dieEl.setAttribute('aria-label', label || '出目なし');
        return;
    }
    dieEl.dataset.die = String(die);
    dieEl.innerText = '';
    dieEl.setAttribute('aria-label', label || `出目${die}`);
}

function animateMeleeReplayDie(panel, finalDie, token) {
    const dieEl = panel?.querySelector?.('.melee-replay-die');
    if (finalDie == null) {
        setMeleeReplayDie(panel, null, '出目なし');
        dieEl?.classList?.remove('is-rolling');
        return 0;
    }
    const normalizedFinalDie = Math.max(1, Math.min(6, Math.floor(Number(finalDie) || 1)));
    if (!dieEl) return 0;
    let step = 0;
    dieEl.classList.add('is-rolling');
    const tickRoll = () => {
        if (token !== battleLogRenderToken) {
            dieEl.classList.remove('is-rolling');
            return;
        }
        const die = step >= MELEE_REPLAY_ROLL_STEPS - 1
            ? normalizedFinalDie
            : (step % 6) + 1;
        setMeleeReplayDie(panel, die, step >= MELEE_REPLAY_ROLL_STEPS - 1 ? `出目${die}` : 'サイコロを振っている');
        step += 1;
        if (step >= MELEE_REPLAY_ROLL_STEPS) {
            dieEl.classList.remove('is-rolling');
            return;
        }
        setTimeout(tickRoll, MELEE_REPLAY_ROLL_INTERVAL_MS);
    };
    tickRoll();
    return MELEE_REPLAY_ROLL_STEPS * MELEE_REPLAY_ROLL_INTERVAL_MS;
}

function renderMeleeReplayFrameWindup(panel, duel, frameIndex) {
    if (!panel || !duel) return;
    const setup = duel.setup || {};
    const timeline = Array.isArray(duel.timeline) ? duel.timeline : [];
    const lastFrame = Math.min(Math.max(-1, frameIndex), timeline.length - 1);
    const event = lastFrame >= 0 ? timeline[lastFrame] : null;
    triggerMeleeReplayAvatarMotion(panel, event, lastFrame);
    triggerMeleeReplayWeaponAttackEffect(panel, event, lastFrame);
    triggerMeleeReplayElementalAttackEffect(panel, event, lastFrame);
    triggerMeleeReplayTechniqueBanner(panel, event, lastFrame);
    const roundLabel = panel.querySelector('.melee-replay-round');
    if (roundLabel) {
        const step = lastFrame >= 0 ? ` / ${lastFrame + 1}手目` : '';
        roundLabel.innerText = `第${event?.round || duel.round || 1}戦${step}`;
    }
    const dieEl = panel.querySelector('.melee-replay-die');
    if (dieEl) {
        dieEl.classList.remove('is-rolling');
        if (event) {
            setMeleeReplayDie(panel, event.die);
        } else {
            setMeleeReplayDie(panel, null);
        }
    }
    const titleEl = panel.querySelector('.melee-replay-action-title');
    if (titleEl) titleEl.innerText = formatMeleeReplayAction(event);
    const metaEl = panel.querySelector('.melee-replay-action-meta');
    if (metaEl) {
        if (!event) {
            metaEl.innerText = '出目2〜6は小アルカナスロット';
        } else if (event.resultType === 'miss') {
            metaEl.innerText = 'ダメージなし';
        } else {
            const parts = [];
            const elementalLabel = meleeReplayElementalLabel(event);
            if (Number(event.damage) > 0) parts.push(`${event.targetName || '相手'}へ${event.damage}ダメージ`);
            if (Number(event.healing) > 0) parts.push(`${event.actorName || '自分'}が${event.healing}回復`);
            if (Number(event.selfDamage) > 0) parts.push(`反動${event.selfDamage}`);
            if (isMeleeReplayMissEvent(event)) parts.push('MISS');
            if (elementalLabel) parts.push(elementalLabel);
            const statusLabels = [];
            (Array.isArray(event.statusChanges) ? event.statusChanges : []).forEach((change) => {
                const label = meleeReplayStatusChangeLabel(change);
                if (label && !statusLabels.includes(label)) statusLabels.push(label);
            });
            parts.push(...statusLabels);
            metaEl.innerText = parts.length > 0 ? parts.join(' / ') : '効果発動';
        }
    }
}

function renderMeleeReplayFrame(panel, duel, frameIndex) {
    if (!panel || !duel) return;
    const setup = duel.setup || {};
    const combatants = Array.isArray(setup.combatants) ? setup.combatants : [];
    const timeline = Array.isArray(duel.timeline) ? duel.timeline : [];
    const lastFrame = Math.min(Math.max(-1, frameIndex), timeline.length - 1);
    const hpById = new Map();
    const maxHpById = new Map();

    combatants.forEach((combatant) => {
        const id = String(combatant?.id || '');
        const maxHp = Math.max(1, Number(combatant?.maxHp) || 1);
        const currentHp = Number(combatant?.currentHp);
        hpById.set(id, Math.max(0, Number.isFinite(currentHp) ? currentHp : maxHp));
        maxHpById.set(id, maxHp);
    });

    for (let index = 0; index <= lastFrame; index += 1) {
        const event = timeline[index];
        if (!event) continue;
        if (event.actorId && Number.isFinite(Number(event.attackerHpAfter))) {
            hpById.set(String(event.actorId || ''), Math.max(0, Number(event.attackerHpAfter) || 0));
        }
        if (event.targetId && Number.isFinite(Number(event.defenderHpAfter))) {
            hpById.set(String(event.targetId || ''), Math.max(0, Number(event.defenderHpAfter) || 0));
        }
    }

    const event = lastFrame >= 0 ? timeline[lastFrame] : null;
    panel.dataset.resultType = event?.resultType || 'ready';
    const actorAvatar = event ? getBattleAvatarForCombatant(String(panel.dataset.viewerId || ''), event.actorId) : null;
    if (event?.action?.kind === 'attack') {
        actorAvatar?.getAnimations?.().forEach((anim) => anim.pause());
    }
    triggerMeleeReplayAvatarMotion(panel, event, lastFrame);
    triggerMeleeReplayWeaponAttackEffect(panel, event, lastFrame);
    triggerMeleeReplayElementalAttackEffect(panel, event, lastFrame);
    triggerMeleeReplayDamageFeedback(panel, event, lastFrame);
    if (event?.action?.kind === 'attack') {
        const hitStopMs = event?.isCritical ? 165 : 80;
        window.setTimeout(() => {
            actorAvatar?.getAnimations?.().forEach((anim) => anim.play());
        }, hitStopMs);
    }
    const roundLabel = panel.querySelector('.melee-replay-round');
    if (roundLabel) {
        const step = lastFrame >= 0 ? ` / ${lastFrame + 1}手目` : '';
        roundLabel.innerText = `第${event?.round || duel.round || 1}戦${step}`;
    }

    const dieEl = panel.querySelector('.melee-replay-die');
    if (dieEl) {
        dieEl.classList.remove('is-rolling');
        if (event) {
            setMeleeReplayDie(panel, event.die);
        } else {
            setMeleeReplayDie(panel, null);
        }
    }

    const titleEl = panel.querySelector('.melee-replay-action-title');
    if (titleEl) titleEl.innerText = formatMeleeReplayAction(event);

    const metaEl = panel.querySelector('.melee-replay-action-meta');
    if (metaEl) {
        if (!event) {
            metaEl.innerText = '出目2〜6は小アルカナスロット';
        } else if (event.resultType === 'miss') {
            metaEl.innerText = 'ダメージなし';
        } else {
            const parts = [];
            const elementalLabel = meleeReplayElementalLabel(event);
            if (Number(event.damage) > 0) parts.push(`${event.targetName || '相手'}へ${event.damage}ダメージ`);
            if (Number(event.healing) > 0) parts.push(`${event.actorName || '自分'}が${event.healing}回復`);
            if (Number(event.selfDamage) > 0) parts.push(`反動${event.selfDamage}`);
            if (isMeleeReplayMissEvent(event)) parts.push('MISS');
            if (elementalLabel) parts.push(elementalLabel);
            const statusLabels = [];
            (Array.isArray(event.statusChanges) ? event.statusChanges : []).forEach((change) => {
                const label = meleeReplayStatusChangeLabel(change);
                if (label && !statusLabels.includes(label)) statusLabels.push(label);
            });
            parts.push(...statusLabels);
            metaEl.innerText = parts.length > 0 ? parts.join(' / ') : '効果発動';
        }
    }

    panel.querySelectorAll('.melee-replay-combatant').forEach((combatantEl) => {
        const id = String(combatantEl.dataset.combatantId || '');
        const hp = hpById.get(id) ?? 0;
        const maxHp = maxHpById.get(id) || 1;
        const percent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
        const fill = combatantEl.querySelector('.melee-replay-hp-fill');
        if (fill) fill.style.width = `${percent}%`;
        const text = combatantEl.querySelector('.melee-replay-hp-text');
        if (text) text.innerText = `${Math.ceil(hp)}/${maxHp}`;
        combatantEl.classList.toggle('is-acting', !!event && String(event.actorId || '') === id);
        combatantEl.querySelectorAll('.melee-replay-slot').forEach((slotEl) => {
            const die = Number(slotEl.dataset.die) || 0;
            const hasCard = slotEl.dataset.hasCard === 'true';
            const initialUnlocked = hasCard && slotEl.dataset.initialUnlocked === 'true';
            let visualType = initialUnlocked ? 'tarot' : 'weapon';
            let resultType = initialUnlocked ? 'minorArcana' : 'weaponForm';
            slotEl.classList.remove('is-active', 'is-spent', 'is-unlocked');
            if (initialUnlocked) slotEl.classList.add('is-unlocked');
            for (let index = 0; index <= lastFrame; index += 1) {
                const past = timeline[index];
                if (!past || String(past.actorId || '') !== id || Number(past.die) !== die) continue;
                const isCurrentFrame = index === lastFrame;
                if (past.resultType === 'minorArcana') {
                    slotEl.classList.add('is-unlocked');
                    visualType = hasCard ? 'tarot' : 'weapon';
                } else if (past.resultType === 'weaponForm') {
                    slotEl.classList.add('is-spent');
                    visualType = hasCard && !isCurrentFrame ? 'tarot' : 'weapon';
                } else {
                    visualType = hasCard && slotEl.classList.contains('is-unlocked') ? 'tarot' : 'weapon';
                }
                resultType = String(past.resultType || resultType || '');
            }
            if (event && String(event.actorId || '') === id && Number(event.die) === die) {
                slotEl.classList.add('is-active');
                resultType = String(event.resultType || resultType || '');
                visualType = event.resultType === 'minorArcana' && hasCard ? 'tarot' : 'weapon';
            }
            slotEl.dataset.resultType = resultType;
            setMeleeReplaySlotVisual(slotEl, visualType);
        });
    });
    syncMeleeReplayStatusIcons(panel, duel, lastFrame);
    syncMeleeReplayAvatarDefeat(panel, hpById);
    syncMeleeReplayAvatarVictory(
        panel,
        hpById,
        timeline.length > 0 && lastFrame >= timeline.length - 1,
        duel?.winnerId || panel.dataset.winnerId || ''
    );
}

function renderBattleLog(container, logData, { animate = false, onComplete = null, meta = null } = {}) {
    if (!container) return;
    battleLogRenderToken += 1;
    const token = battleLogRenderToken;
    container.innerHTML = '';
    const battleStage = document.getElementById('battleStage');
    battleStage?.querySelector('#battleMeleeReplay')?.remove();
    battleStage?.querySelectorAll('.melee-minor-arcana-effect, .melee-elemental-attack-effect, .melee-weapon-attack-effect, .melee-damage-pop, .melee-status-tray').forEach((node) => node.remove());
    const meleeDuel = getMeleeReplayDuel(meta);
    const meleePanel = meleeDuel ? createMeleeReplayPanel(meleeDuel, meta) : null;
    if (meleePanel) {
        (battleStage || container).appendChild(meleePanel);
        resetBattleAvatarDefeatedStates();
        const timeline = Array.isArray(meleeDuel.timeline) ? meleeDuel.timeline : [];
        renderMeleeReplayFrame(meleePanel, meleeDuel, animate ? -1 : timeline.length - 1);
    }
    if (meta && Array.isArray(meta.rounds) && meta.rounds.length > 0) {
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.background = 'rgba(15,23,42,0.6)';
        header.style.border = '1px solid rgba(148,163,184,0.25)';
        header.style.borderRadius = '8px';
        header.style.padding = '6px 10px';
        header.style.marginBottom = '8px';

        const roundsLabel = document.createElement('div');
        roundsLabel.style.fontWeight = '700';
        roundsLabel.style.color = '#f8fafc';
        roundsLabel.style.fontSize = '12px';
        roundsLabel.innerText = `連戦: ${meta.rounds.length}戦`;

        const winnerName = meta.winnerId && meta.players?.[meta.winnerId]?.name
            ? meta.players[meta.winnerId].name
            : '';
        const winnerLabel = document.createElement('div');
        winnerLabel.style.fontSize = '11px';
        winnerLabel.style.color = '#cbd5f5';
        winnerLabel.innerText = winnerName ? `勝者: ${winnerName}` : '';

        header.appendChild(roundsLabel);
        header.appendChild(winnerLabel);
        container.appendChild(header);

        const summary = document.createElement('div');
        summary.style.background = 'rgba(15,23,42,0.35)';
        summary.style.border = '1px solid rgba(148,163,184,0.2)';
        summary.style.borderRadius = '8px';
        summary.style.padding = '6px 10px';
        summary.style.marginBottom = '10px';

        const summaryTitle = document.createElement('div');
        summaryTitle.style.fontSize = '11px';
        summaryTitle.style.fontWeight = '700';
        summaryTitle.style.color = '#e2e8f0';
        summaryTitle.style.marginBottom = '6px';
        summaryTitle.innerText = 'ラウンド結果';
        summary.appendChild(summaryTitle);

        meta.rounds.forEach((roundInfo) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.fontSize = '11px';
            row.style.color = '#cbd5f5';
            row.style.padding = '2px 0';
            const winnerName = meta.players?.[roundInfo.winnerId]?.name || roundInfo.winnerId || '???';
            const loserName = meta.players?.[roundInfo.loserId]?.name || roundInfo.loserId || '???';
            row.innerText = `第${roundInfo.round}戦: ${winnerName} 勝利 / ${loserName}`;
            summary.appendChild(row);
        });
        container.appendChild(summary);
    }
    const entries = logData ? Object.keys(logData).sort().map(key => logData[key]) : [];
    const createLineElement = (line) => {
        const p = document.createElement('p');
        p.innerText = line;
        p.style.margin = '2px 0';
        if (typeof line === 'string' && line.startsWith('【連戦')) {
            p.style.marginTop = '10px';
            p.style.padding = '4px 8px';
            p.style.borderRadius = '6px';
            p.style.background = 'rgba(251,191,36,0.12)';
            p.style.border = '1px solid rgba(251,191,36,0.35)';
            p.style.color = '#fde68a';
            p.style.fontWeight = '700';
        }
        return p;
    };
    if (!animate) {
        entries.forEach(line => {
            container.appendChild(createLineElement(line));
        });
        container.scrollTop = container.scrollHeight;
        if (typeof onComplete === 'function') onComplete();
        return;
    }
    const baseDelay = 320;
    if (meleePanel && meleeDuel) {
        const timeline = Array.isArray(meleeDuel.timeline) ? meleeDuel.timeline : [];
        const rollDuration = MELEE_REPLAY_ROLL_STEPS * MELEE_REPLAY_ROLL_INTERVAL_MS;
        const frameDelay = Math.max(820, baseDelay + rollDuration);
        timeline.forEach((event, index) => {
            setTimeout(() => {
                if (token !== battleLogRenderToken) return;
                animateMeleeReplayDie(meleePanel, event?.die, token);
                setTimeout(() => {
                    if (token !== battleLogRenderToken) return;
                    renderMeleeReplayFrameWindup(meleePanel, meleeDuel, index);
                    const hitStopMs = event?.isCritical ? 165 : 80;
                    setTimeout(() => {
                        if (token !== battleLogRenderToken) return;
                        renderMeleeReplayFrame(meleePanel, meleeDuel, index);
                    }, hitStopMs);
                }, rollDuration);
            }, frameDelay * index);
        });
    }
    entries.forEach((line, index) => {
        setTimeout(() => {
            if (token !== battleLogRenderToken) return;
            container.appendChild(createLineElement(line));
            container.scrollTop = container.scrollHeight;
        }, baseDelay * index);
    });
    const timelineLength = Array.isArray(meleeDuel?.timeline) ? meleeDuel.timeline.length : 0;
    const logDuration = entries.length > 0 ? baseDelay * (entries.length - 1) : 0;
    const replayFrameDelay = Math.max(820, baseDelay + (MELEE_REPLAY_ROLL_STEPS * MELEE_REPLAY_ROLL_INTERVAL_MS));
    const meleeDuration = timelineLength > 0
        ? (replayFrameDelay * (timelineLength - 1)) + (MELEE_REPLAY_ROLL_STEPS * MELEE_REPLAY_ROLL_INTERVAL_MS)
        : 0;
    setTimeout(() => {
        if (token !== battleLogRenderToken) return;
        if (typeof onComplete === 'function') onComplete();
    }, Math.max(logDuration, meleeDuration) + 160);
}

function showBattleResult(commandArea, battleState, myId, myPlayerOnlineRef) {
    if (!commandArea || !battleState) return;
    if (battleInterval) {
        // ★★★ 修正: バトル終了時にonDisconnectハンドラを解除 ★★★
        dbOnDisconnect(myPlayerOnlineRef).cancel();
        dbSet(myPlayerOnlineRef, false); // 正常終了時もオフラインにする

        clearInterval(battleInterval);
        battleInterval = null;
    }
    syncBattleAvatarVictoryFromWinner(battleState.winner, myId);
    const resultMsg = (battleState.winner === myId) ? '<h3 class="battle-result-title battle-result-title-win">YOU WIN!</h3>' : '<h3 class="battle-result-title battle-result-title-lose">YOU LOSE...</h3>';
    commandArea.innerHTML = resultMsg + '<button onclick="returnToMapAfterBattle()">戻る</button>';
    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
        const msg = (battleState.winner === myId)
            ? (window.rpgSay?.battleWin ? window.rpgSay.battleWin() : 'しょうり！')
            : (window.rpgSay?.battleLose ? window.rpgSay.battleLose() : 'まけてしまった…');
        window.showRpgMessage(msg);
    }
}

function startBattleLoop(initialBattleState) {
    // ★★★ 修正: setIntervalをsetTimeoutを使った再帰ループに書き換える ★★★
    // これにより、非同期処理の完了を待ってから次のループが実行されるようになる
    const loop = async () => {
        try {
            if (!localBattleState || localBattleState.status === 'finished') {
                console.log("[Battle Loop] Loop stopped because battle is finished or state is null.");
                if (battleInterval) clearTimeout(battleInterval);
                battleInterval = null;
                return;
            }

            // 各プレイヤーのATBゲージを更新
            for (const playerId in localBattleState.players) {
                const player = localBattleState.players[playerId];
                if (!player || !player.stats) continue;

                if (player.atb < 100) {
                    player.atb += (player.stats.すばやさ || 10) * 0.1;
                    if (player.atb > 100) player.atb = 100;
                }
                const barId = (playerId === myPlayFabId) ? 'battlePlayerBAtbBar' : 'battlePlayerAAtbBar';
                const atbBar = document.getElementById(barId);
                if (atbBar) atbBar.style.width = `${player.atb}%`;
            }

            // 自分の行動ゲージが100%になったかチェック
            const myPlayer = localBattleState.players[myPlayFabId];
            if (myPlayer && myPlayer.atb >= 100 && !isMyActionReady) {
                console.log("[Battle Loop] My turn! Preparing to attack.");
                isMyActionReady = true; // 行動開始フラグ
                document.getElementById('battleCommandArea').innerHTML = '<p class="battle-action-callout">ACTION!</p>';
                
                await sendBattleAction('attack', battleDependencies.callApiWithLoader);
                
                // 攻撃後、ゲージをリセットしてフラグを戻す
                myPlayer.atb = 0;
                isMyActionReady = false; // 行動完了フラグ
            }
        } finally {
            // 50ミリ秒後に次のループをスケジュールする
            battleInterval = setTimeout(loop, 50);
        }
    };
    loop(); // 最初のループを開始
}

function updateBattleStatusDisplay(prefix, playerData, playerId = '') {
    const nameEl = document.getElementById(`${prefix}Name`);
    if (nameEl) {
        nameEl.innerText = playerData.name;
        if (typeof window !== 'undefined' && typeof window.decoratePlayerTriggerElement === 'function') {
            window.decoratePlayerTriggerElement(nameEl, playerId, { label: playerData.name, className: 'player-link-inline' });
        }
    }

    const hpTextEl = document.getElementById(`${prefix}HpText`);
    if (hpTextEl) hpTextEl.innerText = `${playerData.hp}/${playerData.maxHp}`;

    const hpBarEl = document.getElementById(`${prefix}HpBar`);
    if (hpBarEl) {
        const hpPercent = playerData.maxHp > 0 ? (playerData.hp / playerData.maxHp) * 100 : 0;
        hpBarEl.style.width = `${hpPercent}%`;
    }
}

async function sendBattleAction(actionType, callApiWithLoader) {
    console.log(`[Battle Action] Sending action: ${actionType} for battle ${currentBattleId}`); // ★ デバッグログ
    // ★★★ 修正: isSilentオプションを3番目の引数として正しく渡す ★★★
    await callApiWithLoader('/api/battle-action', {
        playFabId: myPlayFabId,
        battleId: currentBattleId,
        action: actionType
    }, { isSilent: true });
}

const BATTLE_AVATAR_EQUIPMENT_SLOTS = ['RightHand', 'LeftHand', 'Armor', 'Accessory'];

function getBattleAvatarEquipmentReferenceIds(value) {
    if (!value) return [];
    if (typeof value !== 'object') {
        const id = String(value || '').trim();
        return id ? [id] : [];
    }
    return [
        value.itemId,
        value.ItemId,
        value.id,
        value.Id,
        value.instanceId,
        value.InstanceId,
        value.instanceID,
        value.InstanceID,
        value.itemInstanceId,
        value.ItemInstanceId,
        value.ItemInstanceID,
        value?.Item?.Id,
        value?.Item?.itemId
    ]
        .map((referenceId) => String(referenceId || '').trim())
        .filter(Boolean);
}

function getBattleAvatarInventoryItemReferenceIds(item) {
    return [
        item?.itemId,
        item?.ItemId,
        item?.id,
        item?.Id,
        ...(Array.isArray(item?.instances) ? item.instances : []),
        item?.instanceId,
        item?.InstanceId,
        item?.itemInstanceId,
        item?.ItemInstanceId
    ]
        .map((referenceId) => String(referenceId || '').trim())
        .filter(Boolean);
}

function resolveBattleAvatarEquipmentItem(reference, itemSource) {
    if (!reference) return null;
    if (typeof reference === 'object' && reference.customData) return reference;
    const referenceIds = getBattleAvatarEquipmentReferenceIds(reference);
    if (referenceIds.length === 0) return null;
    if (Array.isArray(itemSource)) {
        return itemSource.find((item) => {
            const itemReferenceIds = getBattleAvatarInventoryItemReferenceIds(item);
            return referenceIds.some((referenceId) => itemReferenceIds.includes(referenceId));
        }) || null;
    }
    if (itemSource && typeof itemSource === 'object') {
        for (const referenceId of referenceIds) {
            if (itemSource[referenceId]) return itemSource[referenceId];
        }
        return Object.values(itemSource).find((item) => {
            const itemReferenceIds = getBattleAvatarInventoryItemReferenceIds(item);
            return referenceIds.some((referenceId) => itemReferenceIds.includes(referenceId));
        }) || null;
    }
    return null;
}

function canonicalizeBattleAvatarSnapshot(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    let canonical;
    if (Array.isArray(value)) {
        canonical = value.map((entry) => canonicalizeBattleAvatarSnapshot(entry, seen));
    } else {
        canonical = {};
        Object.keys(value).sort().forEach((key) => {
            canonical[key] = canonicalizeBattleAvatarSnapshot(value[key], seen);
        });
    }
    seen.delete(value);
    return canonical;
}

function getBattleAvatarEquipmentDetailsSnapshot(equipment, itemSource) {
    const slots = BATTLE_AVATAR_EQUIPMENT_SLOTS.map((slot) => {
        const reference = equipment?.[slot] || null;
        const referenceIds = getBattleAvatarEquipmentReferenceIds(reference).sort();
        const item = resolveBattleAvatarEquipmentItem(reference, itemSource);
        const ready = !reference || Boolean(item && item.customData && typeof item.customData === 'object');
        return {
            slot,
            referenceIds,
            ready,
            item: item ? {
                referenceIds: getBattleAvatarInventoryItemReferenceIds(item).sort(),
                name: item.displayName || item.DisplayName || item.name || item.Name || null,
                customData: item.customData || null
            } : null
        };
    });
    return {
        ready: slots.every((slot) => slot.ready),
        slots
    };
}

// 自分用のアバター描画ヘルパー
function getBattleAvatarSnapshotKey(playerData, equipment, itemSource = null, options = {}) {
    try {
        const snapshot = {
            avatar: playerData?.avatar || {},
            equipment: equipment || {}
        };
        if (options.includeItemDetails) {
            snapshot.itemDetails = getBattleAvatarEquipmentDetailsSnapshot(equipment || {}, itemSource);
        }
        return JSON.stringify(canonicalizeBattleAvatarSnapshot(snapshot));
    } catch (_) {
        return '';
    }
}

function renderMyAvatar(playerData) {
    if (!playerData || !playerData.avatar) return;
    // 自分側はローカル装備/インベントリ（後からロードされることがある）を常に最新で参照する
    const equipment = (battleDependencies && typeof battleDependencies.getMyCurrentEquipment === 'function')
        ? battleDependencies.getMyCurrentEquipment()
        : myCurrentEquipment;
    const inventory = (battleDependencies && typeof battleDependencies.getMyInventory === 'function')
        ? battleDependencies.getMyInventory()
        : myInventory;
    const avatarRoot = document.getElementById('battle-avatar-B');
    const snapshotKey = getBattleAvatarSnapshotKey(playerData, equipment, inventory, { includeItemDetails: true });
    if (avatarRoot?.dataset.avatarSnapshotKey === snapshotKey) return;
    const rendered = battleAvatarCombat?.renderCombatAvatar?.(
        'battle-avatar-B',
        playerData.avatar,
        equipment || {},
        inventory || [],
        { isOpponent: false }
    );
    if (rendered && avatarRoot) avatarRoot.dataset.avatarSnapshotKey = snapshotKey;
}

// 相手用のアバター描画ヘルパー
async function renderOpponentAvatar(playerData, callApiWithLoader, renderContext) {
    if (!playerData || !playerData.avatar || !isBattleRenderContextCurrent(renderContext)) return false;

    const equipment = playerData.equipment || {};
    const avatarRoot = document.getElementById('battle-avatar-A');
    const snapshotKey = getBattleAvatarSnapshotKey(playerData, equipment);
    if (avatarRoot?.dataset.avatarSnapshotKey === snapshotKey) return true;
    const requestToken = `${renderContext.generation}:${snapshotKey}`;
    const itemIds = BATTLE_AVATAR_EQUIPMENT_SLOTS.flatMap((slot) => {
        const reference = equipment[slot];
        if (typeof reference === 'object' && reference?.customData) return [];
        return getBattleAvatarEquipmentReferenceIds(reference);
    }).filter((itemId, index, allItemIds) => allItemIds.indexOf(itemId) === index);

    if (itemIds.length === 0) {
        if (!isBattleRenderContextCurrent(renderContext)) return false;
        // 装備なしの場合は素体だけ描画
        battleAvatarCombat?.renderCombatAvatar?.(
            'battle-avatar-A',
            playerData.avatar,
            equipment,
            {},
            { isOpponent: true }
        );
        if (avatarRoot) {
            avatarRoot.dataset.avatarSnapshotKey = snapshotKey;
            if (avatarRoot.dataset.avatarSnapshotPending === requestToken) {
                delete avatarRoot.dataset.avatarSnapshotPending;
            }
        }
        return true;
    }

    if (avatarRoot) avatarRoot.dataset.avatarSnapshotPending = requestToken;
    let detailsRequest = battleOpponentAvatarDetailsRequest;
    if (!detailsRequest || detailsRequest.token !== requestToken) {
        const promise = Promise.resolve()
            .then(() => callApiWithLoader('/api/get-item-details', { itemIds }))
            .then((details) => ({ ok: true, details: details || {} }))
            .catch((error) => ({ ok: false, error }));
        detailsRequest = { token: requestToken, promise };
        battleOpponentAvatarDetailsRequest = detailsRequest;
    }
    const result = await detailsRequest.promise;
    if (
        !isBattleRenderContextCurrent(renderContext)
        || avatarRoot?.dataset.avatarSnapshotPending !== requestToken
    ) return false;

    if (result.ok) {
        battleAvatarCombat?.renderCombatAvatar?.(
            'battle-avatar-A',
            playerData.avatar,
            equipment,
            result.details,
            { isOpponent: true }
        );
        if (avatarRoot) avatarRoot.dataset.avatarSnapshotKey = snapshotKey;
    } else {
        if (battleOpponentAvatarDetailsRequest === detailsRequest) {
            battleOpponentAvatarDetailsRequest = null;
        }
        console.error("敵装備の取得エラー", result.error);
        // エラー時も素体だけは描画する。キーは確定せず、次の同期で装備詳細を再取得する。
        battleAvatarCombat?.renderCombatAvatar?.(
            'battle-avatar-A',
            playerData.avatar,
            {},
            {},
            { isOpponent: true }
        );
    }
    if (avatarRoot?.dataset.avatarSnapshotPending === requestToken) {
        delete avatarRoot.dataset.avatarSnapshotPending;
    }
    return true;
}

// WorldMapScene 等から相手IDを指定してバトル開始する
function buildBattleStartPayload(opponentId, options = {}) {
    const payload = { attackerId: myPlayFabId, defenderId: opponentId };
    const context = options && typeof options === 'object' ? options : {};
    if (context.source || context.navalOutcome || context.boardedPlayerId || context.boardingPlayerId) {
        payload.battleContext = {
            source: context.source || 'navalPlunder',
            navalOutcome: context.navalOutcome || context.outcome || null,
            boardedPlayerId: context.boardedPlayerId || null,
            boardingPlayerId: context.boardingPlayerId || null,
            navalBoardingState: context.navalBoardingState || null
        };
    }
    return payload;
}

async function startBattleWithOpponent(opponentId, options = {}) {
    if (!opponentId) return;
    if (!battleDependencies || !battleDependencies.callApiWithLoader) {
        console.warn('[Battle] Dependencies not ready yet.');
        return;
    }
    if (!myPlayFabId) {
        console.warn('[Battle] myPlayFabId not initialized yet.');
        return;
    }
    const activeUntil = Number(window.__battleActiveUntil || 0);
    if (activeUntil > Date.now()) {
        const battleResultEl = document.getElementById('battleResult');
        const msg = '戦闘中のため新しいバトルを開始できません。';
        if (battleResultEl) {
            battleResultEl.innerText = msg;
            battleResultEl.style.color = 'orange';
        }
        if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(msg);
        }
        return;
    }

    const attemptStartBattle = async (attempt = 1) => {
        try {
            const data = await battleDependencies.callApiWithLoader('/api/start-battle', buildBattleStartPayload(opponentId, options));
            if (data && data.battleId) {
                if (typeof window !== 'undefined') {
                    window.__pendingIslandCommandAfterBattle = null;
                }
                showBattleModal(data.battleId);
                return true;
            }
            console.warn('[Battle] start-battle returned no battleId:', data);
        } catch (error) {
            console.error('[Battle] startBattleWithOpponent error:', error);
        }
        return false;
    };
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const ok = await attemptStartBattle(attempt);
        if (ok) return;
        if (attempt < maxAttempts) {
            const delayMs = 400 * attempt;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    const battleResultEl = document.getElementById('battleResult');
    const fallback = '乗り込みに失敗しました。';
    const rawError = String(battleResultEl?.innerText || '').trim();
    const message = rawError
        ? rawError.replace(/^エラー:\s*/u, '')
        : fallback;
    if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
        window.showRpgMessage(message);
    }
}

async function startIslandCaptureBattleWithOpponent(opponentId, islandId, mapId) {
    if (!opponentId || !islandId || !mapId) return false;
    if (!battleDependencies || !battleDependencies.callApiWithLoader) {
        console.warn('[Battle] Dependencies not ready yet.');
        return false;
    }
    if (!myPlayFabId) {
        console.warn('[Battle] myPlayFabId not initialized yet.');
        return false;
    }
    const activeUntil = Number(window.__battleActiveUntil || 0);
    if (activeUntil > Date.now()) {
        const msg = '戦闘中のため新しい戦闘を開始できません。';
        if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(msg);
        }
        return false;
    }

    try {
        const data = await battleDependencies.callApiWithLoader('/api/start-island-capture-battle', {
            attackerId: myPlayFabId,
            opponentId,
            islandId,
            mapId
        });
        if (data && data.battleId) {
            if (typeof window !== 'undefined') {
                window.__pendingIslandCommandAfterBattle = { islandId, mapId };
            }
            showBattleModal(data.battleId);
            return true;
        }
        console.warn('[Battle] start-island-capture-battle returned no battleId:', data);
    } catch (error) {
        console.error('[Battle] startIslandCaptureBattleWithOpponent error:', error);
    }
    return false;
}

async function startCapitalCaptureBattleWithOpponent(opponentId, islandId, mapId) {
    if (!opponentId || !islandId || !mapId) return false;
    if (!battleDependencies || !battleDependencies.callApiWithLoader) {
        console.warn('[Battle] Dependencies not ready yet.');
        return false;
    }
    if (!myPlayFabId) {
        console.warn('[Battle] myPlayFabId not initialized yet.');
        return false;
    }
    const activeUntil = Number(window.__battleActiveUntil || 0);
    if (activeUntil > Date.now()) {
        const msg = '戦闘中のため新しい戦闘を開始できません。';
        if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage(msg);
        }
        return false;
    }

    try {
        const data = await battleDependencies.callApiWithLoader('/api/start-capital-capture-battle', {
            attackerId: myPlayFabId,
            opponentId,
            islandId,
            mapId
        });
        if (data && data.battleId) {
            if (typeof window !== 'undefined') {
                window.__pendingIslandCommandAfterBattle = { islandId, mapId };
            }
            showBattleModal(data.battleId);
            return true;
        }
        console.warn('[Battle] start-capital-capture-battle returned no battleId:', data);
    } catch (error) {
        console.error('[Battle] startCapitalCaptureBattleWithOpponent error:', error);
    }
    return false;
}
function returnToMapAfterBattle() {
    closeBattleModalAndHandlePending();
}

window.returnToMapAfterBattle = returnToMapAfterBattle;


// expose helper globally
window.startBattleWithOpponent = startBattleWithOpponent;
window.startIslandCaptureBattleWithOpponent = startIslandCaptureBattleWithOpponent;
window.startCapitalCaptureBattleWithOpponent = startCapitalCaptureBattleWithOpponent;
