// battle.js (v42 - 共通関数をexportsするように変更)
require('dotenv').config();

// ----------------------------------------------------
// ★ v42: モジュールレベル変数の定義
// ----------------------------------------------------
// initializeBattleRoutes 実行時に、server.js から渡されるオブジェクトを保持する
let _promisifyPlayFab = null;
let _PlayFabServer = null;
let _PlayFabEconomy = null;
let _lineClient = null;
let _catalogCache = null;

async function getEntityKeyForPlayFabId(playFabId) {
    const result = await _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId,
        ProfileConstraints: { ShowEntity: true }
    });
    return result?.PlayerProfile?.Entity || null;
}

async function getAllInventoryItems(playFabId) {
    const entityKey = await getEntityKeyForPlayFabId(playFabId);
    if (!entityKey?.Id || !entityKey?.Type) return [];
    const items = [];
    let token = null;
    do {
        const result = await _promisifyPlayFab(_PlayFabEconomy.GetInventoryItems, {
            Entity: entityKey,
            Count: 100,
            ContinuationToken: token || undefined
        });
        const page = Array.isArray(result?.Items) ? result.Items : [];
        items.push(...page);
        token = result?.ContinuationToken || null;
    } while (token);
    return items;
}

function getCurrencyBalanceFromItems(items, currencyId) {
    return (items || []).reduce((sum, item) => {
        const id = item?.Id || item?.ItemId;
        if (id !== currencyId) return sum;
        return sum + (Number(item?.Amount ?? item?.amount ?? 0) || 0);
    }, 0);
}

async function addEconomyItem(playFabId, itemId, amount) {
    const entityKey = await getEntityKeyForPlayFabId(playFabId);
    if (!entityKey?.Id || !entityKey?.Type) {
        throw new Error('EntityKeyNotFound');
    }
    await _promisifyPlayFab(_PlayFabEconomy.AddInventoryItems, {
        Entity: entityKey,
        Item: { Id: itemId },
        Amount: Number(amount)
    });
}

async function subtractEconomyItem(playFabId, itemId, amount) {
    const entityKey = await getEntityKeyForPlayFabId(playFabId);
    if (!entityKey?.Id || !entityKey?.Type) {
        throw new Error('EntityKeyNotFound');
    }
    await _promisifyPlayFab(_PlayFabEconomy.SubtractInventoryItems, {
        Entity: entityKey,
        Item: { Id: itemId },
        Amount: Number(amount)
    });
}

// ----------------------------------------------------
// ★ v42: プレイヤーHP/MPを保存する共通関数
// ----------------------------------------------------
async function savePlayerHpMp(player) {
    if (!_promisifyPlayFab || !_PlayFabServer) {
        console.error('savePlayerHpMp: battle.js が初期化されていません。');
        return;
    }

    // バトル後のHP/MPを計算 (最低1)
    const finalHP = Math.min(player.stats.CurrentHP <= 0 ? 1 : player.stats.CurrentHP, player.stats.MaxHP);
    const finalMP = Math.min(player.stats.CurrentMP || player.stats.MP, player.stats.MaxMP);

    const statsToUpdate = [
        { StatisticName: "HP", Value: finalHP },
        { StatisticName: "MP", Value: finalMP }
    ];

    try {
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: player.id, Statistics: statsToUpdate
        });
        console.log(`[バトル保存] ${player.id} のHP/MPを更新しました。 (HP: ${finalHP}, MP: ${finalMP})`);
    } catch (error) {
        console.error(`[バトル保存エラー] ${player.id} のHP/MP保存に失敗:`, error.errorMessage);
    }
}

// ----------------------------------------------------
// ★ v42: プレイヤー情報を取得する共通関数 (exports)
// ----------------------------------------------------
async function getPlayerFullProfile(playFabId) {
    if (!_promisifyPlayFab || !_PlayFabServer || !_catalogCache) {
        console.error('getPlayerFullProfile: battle.js が初期化されていません。');
        throw new Error('battle.js is not initialized.');
    }

    const statsPromise = _promisifyPlayFab(_PlayFabServer.GetPlayerStatistics, { PlayFabId: playFabId });
    const equipmentPromise = _promisifyPlayFab(_PlayFabServer.GetUserReadOnlyData, {
        // ★ v122: アバター情報も取得するようにキーを追加
        PlayFabId: playFabId, Keys: [
            "Equipped_RightHand", "Equipped_LeftHand", "Equipped_Armor", "lineUserId",
            "Race", "AvatarColor", "SkinColorIndex", "FaceIndex", "HairStyleIndex"
        ]
    });
    const profilePromise = _promisifyPlayFab(_PlayFabServer.GetPlayerProfile, {
        PlayFabId: playFabId, ProfileConstraints: { ShowDisplayName: true }
    });
    // ★★★ 修正点: インベントリ全体を取得して、InstanceId と ItemId の対応表を作る ★★★
    const inventoryPromise = getAllInventoryItems(playFabId);

    const [statsResult, equipmentResult, profileResult, inventoryResult] = await Promise.all([statsPromise, equipmentPromise, profilePromise, inventoryPromise]);

    // InstanceId をキー、ItemId を値とするマップを作成
    const instanceIdToItemIdMap = {};
    if (Array.isArray(inventoryResult)) {
        inventoryResult.forEach(item => {
            if (item?.StackId && item?.Id) {
                instanceIdToItemIdMap[item.StackId] = item.Id;
            }
        });
    }

    const stats = {};
    if (statsResult.Statistics) {
        statsResult.Statistics.forEach(stat => { stats[stat.StatisticName] = stat.Value; });
    }
    if (!stats.MaxHP) stats.MaxHP = stats.HP;
    if (!stats.MaxMP) stats.MaxMP = stats.MP;
    stats.CurrentHP = stats.HP;
    stats.CurrentMP = stats.MP;
    stats.DisplayName = profileResult.PlayerProfile.DisplayName || '（名前なし）';

    const equipment = {}; // ここには最終的に ItemId を格納する
    const avatar = {}; // ★ v122: アバター情報を格納するオブジェクト
    let lineUserId = null;
    if (equipmentResult.Data) {
        // ★★★ 修正点: InstanceId から ItemId に変換して格納する ★★★
        const rightHandInstanceId = equipmentResult.Data.Equipped_RightHand ? equipmentResult.Data.Equipped_RightHand.Value : null;
        if (rightHandInstanceId) equipment.RightHand = instanceIdToItemIdMap[rightHandInstanceId];

        const leftHandInstanceId = equipmentResult.Data.Equipped_LeftHand ? equipmentResult.Data.Equipped_LeftHand.Value : null;
        if (leftHandInstanceId) equipment.LeftHand = instanceIdToItemIdMap[leftHandInstanceId];

        const armorInstanceId = equipmentResult.Data.Equipped_Armor ? equipmentResult.Data.Equipped_Armor.Value : null;
        if (armorInstanceId) equipment.Armor = instanceIdToItemIdMap[armorInstanceId];

        if (equipmentResult.Data.lineUserId) lineUserId = equipmentResult.Data.lineUserId.Value;

        // ★ v122: アバター情報を取得
        if (equipmentResult.Data.Race) avatar.Race = equipmentResult.Data.Race.Value;
        if (equipmentResult.Data.AvatarColor) avatar.AvatarColor = equipmentResult.Data.AvatarColor.Value;
        if (equipmentResult.Data.SkinColorIndex) avatar.SkinColorIndex = equipmentResult.Data.SkinColorIndex.Value;
        if (equipmentResult.Data.FaceIndex) avatar.FaceIndex = equipmentResult.Data.FaceIndex.Value;
        if (equipmentResult.Data.HairStyleIndex) avatar.HairStyleIndex = equipmentResult.Data.HairStyleIndex.Value;
    }

    const equipmentStats = { Power: 0, Defense: 0 };
    // ★★★ 修正点: equipment には ItemId が入っているので、それで catalogCache を引く ★★★
    if (equipment.RightHand && _catalogCache[equipment.RightHand]) {
        const itemData = _catalogCache[equipment.RightHand];
        if (itemData.Power) equipmentStats.Power += itemData.Power;
    }
    if (equipment.LeftHand && _catalogCache[equipment.LeftHand]) {
        const itemData = _catalogCache[equipment.LeftHand];
        if (itemData.Power) equipmentStats.Power += itemData.Power; // シールドにもPowerがある場合を考慮
        if (itemData.Defense) equipmentStats.Defense += itemData.Defense; // シールドの防御力を加算
    }
    if (equipment.Armor && _catalogCache[equipment.Armor]) {
        const armorData = _catalogCache[equipment.Armor];
        if (armorData.Category === 'Armor' && armorData.Defense) equipmentStats.Defense = armorData.Defense;
    }

    return { id: playFabId, lineUserId: lineUserId, stats: stats, equipment: equipment, equipmentStats: equipmentStats, avatar: avatar, level: stats.Level };
}

// ----------------------------------------------------
// ★ v42: バトル計算を実行する共通関数 (exports)
// ----------------------------------------------------
async function runBattle(playerA, playerB) {
    if (!_lineClient) {
        console.error('runBattle: battle.js が初期化されていません。');
        throw new Error('battle.js is not initialized.');
    }

    // ★★★ 改良案: 逃走判定 ★★★
    // すばやさが高い方が、その差に応じて逃げやすくなる
    const agilityA = playerA.stats.すばやさ || 1;
    const agilityB = playerB.stats.すばやさ || 1;
    const escapeChance = (agilityA > agilityB)
        ? (agilityA - agilityB) / agilityA * 0.5 // すばやさの差が大きいほど確率UP (最大50%)
        : (agilityB - agilityA) / agilityB * 0.5;

    if (Math.random() < escapeChance) {
        const escaper = (agilityA > agilityB) ? playerA : playerB;
        const pursuer = (agilityA > agilityB) ? playerB : playerA;
        const log = `${escaper.stats.DisplayName} は ${pursuer.stats.DisplayName} からうまく逃げきった！`;
        console.log(`[バトルログ] ${log}`);
        return { winner: null, loser: null, logs: [log], escaped: true }; // 逃走成功
    }

    const logs = [];
    const sendLogToBoth = async (messageText) => {
        logs.push(messageText);
        // 航海中のバトルではLINE通知が過剰になる可能性があるため、通知を（任意で）無効化
        /*
        try {
            if (playerA.lineUserId && playerB.lineUserId) {
                await Promise.all([
                    _lineClient.pushMessage(playerA.lineUserId, { type: 'text', text: messageText }),
                    _lineClient.pushMessage(playerB.lineUserId, { type: 'text', text: messageText })
                ]);
            }
        } catch (pushError) {
            console.error("プッシュメッセージの送信に失敗:", pushError.originalError ? pushError.originalError.response.data : pushError);
        }
        */
        console.log(`[バトルログ] ${messageText}`); // サーバーコンソールにはログを残す
    };

    let attacker, defender;
    if (playerA.stats.すばやさ >= playerB.stats.すばやさ) {
        attacker = playerA; defender = playerB;
    } else {
        attacker = playerB; defender = playerA;
    }

    await sendLogToBoth(`戦闘開始！ ${attacker.stats.DisplayName} の先攻！`);

    for (let i = 0; i < 20; i++) {
        const weaponPower = attacker.equipmentStats.Power || 0;
        const enemyDefense = (defender.stats.みのまもり || 0) + (defender.equipmentStats.Defense || 0);
        const skillPower = 1.0;
        const baseDamage = (weaponPower * skillPower) - enemyDefense;
        const multiplier = ((attacker.stats.ちから * attacker.stats.Level / 128) + 2);
        // ダメージ計算結果がマイナスにならないようにし、最低でも1ダメージは保証する
        const finalDamage = Math.max(1, Math.floor(baseDamage * multiplier));

        defender.stats.CurrentHP -= finalDamage;

        await sendLogToBoth(`${attacker.stats.DisplayName} のこうげき！ ${defender.stats.DisplayName} に ${finalDamage} のダメージ！ (残りHP: ${defender.stats.CurrentHP})`);

        if (defender.stats.CurrentHP <= 0) {
            await sendLogToBoth(`${defender.stats.DisplayName} はたおれた！`);
            return { winner: attacker, loser: defender, logs: logs };
        }

        [attacker, defender] = [defender, attacker];
    }

    await sendLogToBoth("決着がつかなかった...！");

    if (playerA.stats.CurrentHP >= playerB.stats.CurrentHP) {
        return { winner: playerA, loser: playerB, logs: logs };
    } else {
        return { winner: playerB, loser: playerA, logs: logs };
    }
}


// ----------------------------------------------------
// ★ v42: server.js から呼び出される初期化関数
// ----------------------------------------------------
function initializeBattleRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, PlayFabEconomy, lineClient, catalogCache, constants) {

    // ★ v42: モジュールレベル変数に代入
    _promisifyPlayFab = promisifyPlayFab;
    _PlayFabServer = PlayFabServer;
    _PlayFabEconomy = PlayFabEconomy;
    _catalogCache = catalogCache;
    // ★ v120: Firebase Adminのdatabaseインスタンスを取得
    const db = require('firebase-admin').database();

    const {
        VIRTUAL_CURRENCY_CODE,
        LEADERBOARD_NAME,
        BATTLE_REWARD_POINTS
    } = constants;

    // ----------------------------------------------------
    // API 11: バトル実行 (★ v120: リアルタイムバトル開始処理に変更)
    // ----------------------------------------------------
    app.post('/api/start-battle', async (req, res) => {
        const { attackerId, defenderId } = req.body;
        if (!attackerId || !defenderId) return res.status(400).json({ error: 'プレイヤーIDが不足しています。' });
        if (attackerId === defenderId) return res.status(400).json({ error: '自分自身とは対戦できません。' });

        console.log(`[バトル開始] ${attackerId} vs ${defenderId}`);
        try {
            // --- 1. 両プレイヤーの全ステータスを読み込む ---
            const playerA = await getPlayerFullProfile(attackerId);
            const playerB = await getPlayerFullProfile(defenderId);

            // --- 2. Firebase Realtime Databaseに「対戦招待」を作成 ---
            const invitationRef = db.ref('invitations').push(); // 新しい招待IDを生成
            const invitationId = invitationRef.key;

            const invitationData = {
                status: 'pending', // pending, accepted, started
                from: {
                    id: playerA.id,
                    name: playerA.stats.DisplayName
                },
                to: {
                    id: playerB.id,
                    name: playerB.stats.DisplayName
                },
                createdAt: require('firebase-admin').database.ServerValue.TIMESTAMP // ★ v143: 正しいタイムスタンプの取得方法に修正
            };

            await invitationRef.set(invitationData);
            console.log(`[対戦招待] 招待を作成しました: ${invitationId}`);

            // --- 3. クライアントに招待IDを返す ---
            res.json({
                status: "Invitation Sent",
                invitationId: invitationId
            });

        } catch (error) {
            console.error('[バトル招待作成エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'バトル招待の作成中にエラーが発生しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API 18: 対戦招待を承諾し、バトルを開始する (★ v123で追加, v141で復活)
    // ----------------------------------------------------
    app.post('/api/accept-battle', async (req, res) => {
        const { playFabId, invitationId } = req.body;
        if (!playFabId || !invitationId) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }

        console.log(`[招待承諾] invitationId: ${invitationId}, player: ${playFabId}`);

        const invitationRef = db.ref(`invitations/${invitationId}`);

        try {
            const snapshot = await invitationRef.once('value');
            const invitation = snapshot.val();

            if (!invitation || invitation.status !== 'pending' || invitation.to.id !== playFabId) {
                return res.status(400).json({ error: '無効な招待、または既に処理されています。' });
            }

            // --- 1. 両プレイヤーの全ステータスを読み込む ---
            const playerA = await getPlayerFullProfile(invitation.from.id); // 攻撃者
            const playerB = await getPlayerFullProfile(invitation.to.id);   // 防御者

            // --- 2. Firebase Realtime Databaseに「バトル部屋」を作成 ---
            const battleRef = db.ref('battles').push();
            const battleId = battleRef.key;

            // ★ v137: ATBゲージの初期化
            const initialPlayers = {
                [playerA.id]: {
                    name: playerA.stats.DisplayName,
                    hp: playerA.stats.CurrentHP,
                    maxHp: playerA.stats.MaxHP,
                    online: true, // ★★★ 修正: オンライン状態フラグを追加
                    level: playerA.level, // ★★★ 修正: レベル情報を追加
                    stats: { すばやさ: playerA.stats.すばやさ }, // ATB計算に必要なステータス
                    avatar: playerA.avatar,
                    equipment: playerA.equipment // ★ v147: アイテムIDのみを保存
                },
                [playerB.id]: {
                    name: playerB.stats.DisplayName,
                    hp: playerB.stats.CurrentHP,
                    maxHp: playerB.stats.MaxHP,
                    online: true, // ★★★ 修正: オンライン状態フラグを追加
                    level: playerB.level, // ★★★ 修正: レベル情報を追加
                    stats: { すばやさ: playerB.stats.すばやさ },
                    avatar: playerB.avatar,
                    equipment: playerB.equipment // ★ v147: アイテムIDのみを保存
                }
            };

            const initialBattleState = {
                status: 'active',
                winner: null,
                lastActionPlayer: null, // ★ v139: 最後に行動したプレイヤー
                players: initialPlayers,
                log: {
                    [Date.now()]: `戦闘開始！`
                }
            };

            await battleRef.set(initialBattleState);
            console.log(`[リアルタイムバトル] バトル部屋を作成しました: ${battleId}`);

            // --- 3. 招待ステータスを更新し、両クライアントに通知 ---
            await invitationRef.update({
                status: 'started',
                battleId: battleId
            });

            // --- 4. 使用済みの招待をDBから削除する ---
            await invitationRef.remove();
            console.log(`[招待削除] 使用済みの招待 ${invitationId} を削除しました。`);

            // --- 5. 承諾したクライアントにバトルIDを返す ---
            res.json({
                status: "Battle Ready",
                battleId: battleId
            });

        } catch (error) {
            console.error('[招待承諾エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '招待の承諾処理中にエラーが発生しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API 19: アイテム詳細情報を取得する (★ v147で追加)
    // ----------------------------------------------------
    app.post('/api/get-item-details', (req, res) => {
        const { itemIds } = req.body;
        if (!Array.isArray(itemIds)) {
            return res.status(400).json({ error: 'itemIdsは配列である必要があります。' });
        }

        const itemDetails = {};
        itemIds.forEach(id => {
            if (id && _catalogCache[id]) {
                const item = _catalogCache[id];
                itemDetails[id] = {
                    itemId: id,
                    name: item.DisplayName,
                    // ★ 修正: catalogCache の構造に合わせる
                    // catalogCache は DisplayName とカスタムデータがフラットに格納されている
                    // customData プロパティとして、item オブジェクト全体を渡す
                    customData: item
                };
            }
        });
        res.json(itemDetails);
    });

    // ----------------------------------------------------
    // API 17: リアルタイムバトルアクション実行 (★ v121で追加)
    // ----------------------------------------------------
    app.post('/api/battle-action', async (req, res) => {
        const { playFabId, battleId, action } = req.body;
        if (!playFabId || !battleId || !action) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }

        console.log(`[バトルアクション] battleId: ${battleId}, player: ${playFabId}, action: ${action}`);

        const battleRef = db.ref(`battles/${battleId}`);
 
        // ★★★ v182: トランザクションを使って同時攻撃を防ぎ、安全に処理する ★★★
        // --- トランザクションの外で、時間のかかるプロフィール取得を先に行う ---
        try {
            const attackerId = playFabId;
            // ★★★ 修正: defenderIdを先に取得するために一度DBを読み込む ★★★
            const initialSnapshot = await battleRef.once('value');
            const initialBattleState = initialSnapshot.val();
            if (!initialBattleState || !initialBattleState.players) {
                return res.status(404).json({ error: 'バトルが見つかりません。' });
            }
            const defenderId = Object.keys(initialBattleState.players).find(id => id !== attackerId);
            if (!defenderId) {
                 return res.status(404).json({ error: '対戦相手が見つかりません。' });
            }

            const attackerProfile = await getPlayerFullProfile(attackerId);
            const defenderProfile = await getPlayerFullProfile(defenderId);

            // --- ダメージ計算 ---
            const weaponPower = attackerProfile.equipmentStats.Power || 0;
            const enemyDefense = (defenderProfile.stats.みのまもり || 0) + (defenderProfile.equipmentStats.Defense || 0);
            const baseDamage = weaponPower - enemyDefense;
            const multiplier = ((attackerProfile.stats.ちから * attackerProfile.stats.Level / 128) + 2);
            const finalDamage = Math.max(1, Math.floor(baseDamage * multiplier));

            // --- トランザクションで、チェックと更新をアトミックに行う ---
            battleRef.transaction((currentBattleState) => {
                if (!currentBattleState) {
                    return null; // リトライを促す
                }
                if (currentBattleState.status === 'finished') {
                    console.log('[トランザクション] 中断: バトル終了済み');
                    return; // 中断
                }
                if (currentBattleState.players[attackerId].hp <= 0) {
                    console.log('[トランザクション] 中断: 攻撃者HPが0');
                    return; // 中断
                }

                // ★★★ ここでダメージを反映 ★★★
                const newDefenderHp = Math.max(0, currentBattleState.players[defenderId].hp - finalDamage);
                currentBattleState.players[defenderId].hp = newDefenderHp;
                currentBattleState.log[Date.now()] = `${attackerProfile.stats.DisplayName} のこうげき！ ${defenderProfile.stats.DisplayName} に ${finalDamage} のダメージ！`;
                currentBattleState.lastActionPlayer = attackerId;

                if (newDefenderHp <= 0) {
                    currentBattleState.status = 'finished';
                    currentBattleState.winner = attackerId;
                    currentBattleState.log[Date.now() + 1] = `${defenderProfile.stats.DisplayName} はたおれた！`;
                }
                return currentBattleState;

            }).then(result => {
                if (!result.committed) {
                    console.log(`[バトルアクション] トランザクション中断 (競合または条件不一致): ${battleId}`);
                    return res.status(409).json({ error: 'アクションを処理できませんでした（競合発生）。' });
                }

                console.log(`[バトルアクション] トランザクション成功: ${battleId}`);

                // ★★★ ここから報酬処理を追加 ★★★
                const finalBattleState = result.snapshot.val();
                // このアクションでバトルが終了したかチェック
                if (finalBattleState && finalBattleState.status === 'finished') {
                    const winnerId = finalBattleState.winner;
                    const loserId = Object.keys(finalBattleState.players).find(id => id !== winnerId);

                    if (winnerId && loserId) {
                        // 非同期で報酬処理を実行（クライアントへの応答をブロックしない）
                        handleBattleRewards(battleId, winnerId, loserId).catch(rewardError => {
                            console.error(`[報酬処理エラー] battleId: ${battleId}`, rewardError);
                        });
                    }
                }

                res.json({ status: 'success', message: 'アクションを処理しました。' });

            }).catch(error => {
                console.error('[バトルアクション] トランザクションで致命的なエラーが発生しました:', error);
                res.status(500).json({ error: 'バトルアクション処理中にサーバーエラーが発生しました。' });
            });

        } catch (error) {
            console.error('[バトルアクション] プロフィール取得または事前処理でエラー:', error);
            res.status(500).json({ error: 'バトルアクション処理中にサーバーエラーが発生しました。' });
        }
    });

    // ★★★ 修正: 相手の切断による不戦勝を処理するAPIを追加 ★★★
    app.post('/api/claim-win-by-disconnect', async (req, res) => {
        const { playFabId, battleId } = req.body;
        if (!playFabId || !battleId) {
            return res.status(400).json({ error: 'リクエスト情報が不足しています。' });
        }

        console.log(`[不戦勝処理] ${playFabId} が相手の切断を申告。 battleId: ${battleId}`);

        const battleRef = db.ref(`battles/${battleId}`);

        try {
            const snapshot = await battleRef.once('value');
            const battleState = snapshot.val();

            if (!battleState || battleState.status === 'finished') {
                console.log('[不戦勝処理] バトルは既に終了しています。');
                return res.json({ status: 'already_finished' });
            }

            const opponentId = Object.keys(battleState.players).find(id => id !== playFabId);
            if (!opponentId || !battleState.players[opponentId]) {
                return res.status(404).json({ error: '対戦相手が見つかりません。' });
            }

            // 相手が本当にオフラインか確認
            if (battleState.players[opponentId].online === true) {
                console.log('[不戦勝処理] 相手はまだオンラインです。処理を中断します。');
                return res.status(400).json({ error: '相手はまだオンラインです。' });
            }

            // --- 不戦勝が確定 ---
            console.log(`[不戦勝処理] ${opponentId} の切断を確認。${playFabId} の勝利とします。`);

            // バトルを終了させる
            const updates = {};
            updates[`/status`] = 'finished';
            updates[`/winner`] = playFabId;
            updates[`/log/${Date.now()}`] = `${battleState.players[opponentId].name} の接続が切れました。`;
            updates[`/log/${Date.now() + 1}`] = `${battleState.players[playFabId].name} の不戦勝です！`;
            await battleRef.update(updates);

            // 報酬処理を実行
            handleBattleRewards(battleId, playFabId, opponentId).catch(rewardError => {
                console.error(`[報酬処理エラー@不戦勝] battleId: ${battleId}`, rewardError);
            });

            res.json({ status: 'success', message: '不戦勝が確定しました。' });

        } catch (error) {
            console.error('[不戦勝処理エラー]', error);
            res.status(500).json({ error: '不戦勝処理中にサーバーエラーが発生しました。' });
        }
    });


    // ★★★ 報酬処理用の非同期関数を追加 ★★★
    async function handleBattleRewards(battleId, winnerId, loserId) {
        console.log(`[報酬処理] 開始。 勝者: ${winnerId}, 敗者: ${loserId}`);
        const loserInventory = await getAllInventoryItems(loserId);
        const loserPs = getCurrencyBalanceFromItems(loserInventory, 'PS');
        // 笘・・笘・菫ｮ豁｣: 謨苓・・諛ｸ雉樣≡(BT)繧ょ叙蠕・笘・・笘・
        const loserBounty = getCurrencyBalanceFromItems(loserInventory, 'BT');

        // ★★★ 修正: 奪う金額の計算ロジックを変更 ★★★
        // 1. 所持金(Ps)の10%～30%を計算
        const randomRate = Math.random() * (0.3 - 0.1) + 0.1;
        const pointsToStealFromPs = Math.floor(loserPs * randomRate);

        // 2. 「Psから計算した額」と「懸賞金(BT)」の高い方を、実際に奪う額とする
        const pointsToSteal = Math.max(pointsToStealFromPs, loserBounty);

        if (pointsToSteal <= 0) {
            console.log('[報酬処理] 奪う金額が0のため、報酬はありません。');
            const battleRef = db.ref(`battles/${battleId}`);
            await battleRef.child('log').update({ [Date.now()]: `しかし、奪えるものが何もなかった！` });
            return;
        }

        // 敗者から減算
        await subtractEconomyItem(loserId, 'PS', pointsToSteal);



        // ★★★ 修正: 勝者の懸賞金(BT)を奪った額だけ上げる ★★★
        await addEconomyItem(winnerId, 'BT', pointsToSteal);




        console.log(`[報酬処理] ${winnerId} の懸賞金が ${pointsToSteal}BT 上がった！`);

        console.log(`[報酬処理] ${winnerId} が ${loserId} から ${pointsToSteal}Ps を奪った！`);

        // バトルログに報酬情報を追記
        const battleRef = db.ref(`battles/${battleId}`);
        await battleRef.child('log').update({
            [Date.now()]: `勝者は ${pointsToSteal}Ps を奪った！`
        });

        // 両者のランキングスコアを更新
        const winnerInventory = await getAllInventoryItems(winnerId);
        const winnerNewBalance = getCurrencyBalanceFromItems(winnerInventory, 'PS');
        const loserNewBalance = loserPs - pointsToSteal;
        // 笘・・笘・菫ｮ豁｣: 諛ｸ雉樣≡(BT)縺ｮ譁ｰ縺励＞谿矩ｫ倥ｂ蜿門ｾ・笘・・笘・
        const winnerNewBounty = getCurrencyBalanceFromItems(winnerInventory, 'BT');

        // ★★★ 修正: Psランキングと懸賞金ランキングを同時に更新 ★★★
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, { PlayFabId: winnerId, Statistics: [
            { StatisticName: 'points_ranking', Value: winnerNewBalance },
            { StatisticName: 'bounty_ranking', Value: winnerNewBounty }
        ] });
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, { PlayFabId: loserId, Statistics: [{ StatisticName: 'points_ranking', Value: loserNewBalance }] });
        console.log('[報酬処理] 両者のランキングスコアを更新しました。');
    }
}

// ★ v42: 共通関数を exports する
module.exports = {
    initializeBattleRoutes,
    getPlayerFullProfile,
    runBattle,
    savePlayerHpMp
};
