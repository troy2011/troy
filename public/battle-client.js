// public/battle-client.js

// --- モジュール内グローバル変数 ---
let currentBattleId = null;
let battleStateListener = null;
let battleInterval = null;
let isMyActionReady = false;
let battleAutoCloseTimer = null;
const battleEventEmitted = new Set();

// ★ v184: バトルループで常に最新の情報を参照するための変数
let localBattleState = null;

// --- main.jsから受け取る依存 ---
let myPlayFabId = null;
let myCurrentEquipment = {};
let myInventory = [];
let battleDependencies = null; // ★ v189: 依存関係をモジュール全体で保持する変数
let db = null; // Firebase Realtime Database instance
let dbRef, dbOnValue, dbSet, dbOnDisconnect; // Firebase v9 functions

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
        document.getElementById('btnScanBattle').addEventListener('click', startBattleScan);
        initializeInvitationListener(); // Firebaseモジュール読み込み後に実行
    }).catch(e => console.error("Failed to load Firebase Database module in battle-client.js", e));
}

// --- バトル開始フロー ---

async function startBattleScan() {
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

function showBattleModal(battleId) {
    currentBattleId = battleId;
    const battleModal = document.getElementById('battleModal');
    battleModal.style.display = 'flex';
    setBattleActiveWindow(5000);

    if (battleAutoCloseTimer) {
        clearTimeout(battleAutoCloseTimer);
        battleAutoCloseTimer = null;
    }
    battleAutoCloseTimer = setTimeout(() => {
        battleModal.style.display = 'none';
        if (Number(window.__battleActiveUntil || 0) <= Date.now()) {
            window.__battleActiveUntil = 0;
        }
    }, 5000);

    if (battleInterval) {
        clearInterval(battleInterval);
        battleInterval = null;
    }
    isMyActionReady = false;

    if (battleStateListener) {
        // ★ v184: 既存のリスナーを確実に解除
        import('firebase/database').then(({ off }) => off(dbRef(db, 'battles/' + currentBattleId), 'value', battleStateListener));
        battleStateListener = null;
    }

    const battleRef = dbRef(db, 'battles/' + battleId);

    // ★★★ 修正: 自分のオンライン状態を管理し、切断時の処理を設定 ★★★
    const myPlayerOnlineRef = dbRef(db, `battles/${battleId}/players/${myPlayFabId}/online`);
    dbSet(myPlayerOnlineRef, true); // オンラインであることを示す
    dbOnDisconnect(myPlayerOnlineRef).set(false); // 切断されたらfalseにする


    battleStateListener = dbOnValue(battleRef, async (snapshot) => {
        const battleState = snapshot.val();
        if (!battleState) return;
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

        updateBattleStatusDisplay('battlePlayerA', opponent);
        updateBattleStatusDisplay('battlePlayerB', me);

        // ★ v184: renderBattleAvatarを介さず、直接renderAvatarを呼び出す
        await renderOpponentAvatar(opponent, battleDependencies.renderAvatar, battleDependencies.callApiWithLoader);
        await renderMyAvatar(me, battleDependencies.renderAvatar);

        const logContainer = document.getElementById('battleLogContainer');
        logContainer.innerHTML = '';
        if (battleState.log) {
            Object.keys(battleState.log).sort().forEach(key => {
                const p = document.createElement('p');
                p.innerText = battleState.log[key];
                logContainer.appendChild(p);
            });
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        const commandArea = document.getElementById('battleCommandArea');
        commandArea.innerHTML = '';
        if (battleState.status === 'finished') {
            // (勝敗表示ロジック...ここはそのまま)
            if (battleInterval) {
                // ★★★ 修正: バトル終了時にonDisconnectハンドラを解除 ★★★
                dbOnDisconnect(myPlayerOnlineRef).cancel();
                dbSet(myPlayerOnlineRef, false); // 正常終了時もオフラインにする

                clearInterval(battleInterval);
                battleInterval = null;
            }
            const resultMsg = (battleState.winner === myId) ? '<h3 style="color: gold;">YOU WIN!</h3>' : '<h3 style="color: red;">YOU LOSE...</h3>';
            commandArea.innerHTML = resultMsg + '<button onclick="returnToMapAfterBattle()">戻る</button>';
            if (typeof window !== 'undefined' && typeof window.showRpgMessage === 'function') {
                const msg = (battleState.winner === myId)
                    ? (window.rpgSay?.battleWin ? window.rpgSay.battleWin() : 'しょうり！')
                    : (window.rpgSay?.battleLose ? window.rpgSay.battleLose() : 'まけてしまった…');
                window.showRpgMessage(msg);
            }
            return;
        }

        // ★★★ 修正: 相手の切断を検知して不戦勝を申告する ★★★
        if (opponent && opponent.online === false) {
            console.log('[Battle] Opponent disconnected. Claiming win...');
            if (battleInterval) clearInterval(battleInterval); // 念のためループを止める
            // サーバーに不戦勝を申告
            await battleDependencies.callApiWithLoader('/api/claim-win-by-disconnect', {
                playFabId: myPlayFabId,
                battleId: currentBattleId
            }, { isSilent: true });
            return; // サーバーからの更新を待つため、以降の処理は行わない
        }

        // ★★★ 修正: 手動ボタンのロジックを削除し、ATBゲージの状況やメッセージを表示する ★★★
        if (!battleInterval) {
            console.log("[Battle] Starting battle loop..."); // ★ デバッグログ
            startBattleLoop(battleState);
        }

        // オートバトル中であることを表示
        if (document.getElementById('battleCommandArea').innerHTML.includes('ACTION!')) return; // ACTION!表示中は上書きしない
        commandArea.innerHTML = '<p style="color: #cbd5e0; font-size: 0.9em;">オートバトル進行中...</p>';

    });
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
                document.getElementById('battleCommandArea').innerHTML = '<p style="color: gold;">ACTION!</p>';
                
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

function updateBattleStatusDisplay(prefix, playerData) {
    const nameEl = document.getElementById(`${prefix}Name`);
    if (nameEl) nameEl.innerText = playerData.name;

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

// ★ v184: 自分用のアバター描画ヘルパー
function renderMyAvatar(playerData, renderAvatar) {
    if (!playerData || !playerData.avatar) return;
    // 自分側はローカル装備/インベントリ（後からロードされることがある）を常に最新で参照する
    const equipment = (battleDependencies && typeof battleDependencies.getMyCurrentEquipment === 'function')
        ? battleDependencies.getMyCurrentEquipment()
        : myCurrentEquipment;
    const inventory = (battleDependencies && typeof battleDependencies.getMyInventory === 'function')
        ? battleDependencies.getMyInventory()
        : myInventory;
    renderAvatar('battle-avatar-B', playerData.avatar, equipment || {}, inventory || [], false);
}

// ★ v184: 相手用のアバター描画ヘルパー
async function renderOpponentAvatar(playerData, renderAvatar, callApiWithLoader) {
    if (!playerData || !playerData.avatar) return;

    const equipment = playerData.equipment || {};
    const itemIds = [equipment.RightHand, equipment.LeftHand, equipment.Armor].filter(v => v);

    if (itemIds.length > 0) {
        try {
            // 相手の装備詳細はAPIから取得する
            const details = await callApiWithLoader('/api/get-item-details', { itemIds });
            renderAvatar('battle-avatar-A', playerData.avatar, equipment, details || {}, true);
        } catch (e) {
            console.error("敵装備の取得エラー", e);
            // エラー時も素体だけは描画する
            renderAvatar('battle-avatar-A', playerData.avatar, {}, {}, true);
        }
    } else {
        // 装備なしの場合は素体だけ描画
        renderAvatar('battle-avatar-A', playerData.avatar, {}, {}, true);
    }
}

// WorldMapScene 等から相手IDを指定してバトル開始する
async function startBattleWithOpponent(opponentId) {
    if (!opponentId) return;
    if (!battleDependencies || !battleDependencies.callApiWithLoader) {
        console.warn('[Battle] Dependencies not ready yet.');
        return;
    }
    if (!myPlayFabId) {
        console.warn('[Battle] myPlayFabId not initialized yet.');
        return;
    }

    try {
        const data = await battleDependencies.callApiWithLoader('/api/start-battle', { attackerId: myPlayFabId, defenderId: opponentId });
        if (data && data.battleId) {
            showBattleModal(data.battleId);
        } else {
            console.warn('[Battle] start-battle returned no battleId:', data);
        }
    } catch (error) {
        console.error('[Battle] startBattleWithOpponent error:', error);
    }
}
function returnToMapAfterBattle() {
    const battleModal = document.getElementById('battleModal');
    if (battleModal) battleModal.style.display = 'none';
    if (typeof window !== 'undefined' && typeof window.showTab === 'function') {
        window.showTab('map');
    }
}

window.returnToMapAfterBattle = returnToMapAfterBattle;


// expose helper globally
window.startBattleWithOpponent = startBattleWithOpponent;
