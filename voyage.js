// voyage.js (v2) - 航海PvPバトル機能の追加

// ★ v42: battle.js (v42) の共通関数を require する
const battle = require('./battle');

// ----------------------------------------------------
// ★ v42: モジュールレベル変数の定義
// ----------------------------------------------------
let _promisifyPlayFab = null;
let _PlayFabServer = null;
let _lineClient = null;
let _catalogCache = null;
let _GACHA_CATALOG_VERSION = null;

// ★★★ 改良案: ロック用のタイトルデータキー ★★★
const VOYAGE_BATTLE_LOCK_KEY = 'VoyageBattleLock';
// ★ v42: 航海中プレイヤーを示す統計情報名
const VOYAGE_STATISTIC_NAME = 'Voyaging';
// ★ v42: 遭遇バトルの発生確率 (0.5 = 50%)
const BATTLE_ENCOUNTER_CHANCE = 0.5; 

// ----------------------------------------------------
// ★ v1: 航海ミッションの定義 (変更なし)
// ----------------------------------------------------
const VOYAGE_MISSIONS = {
// ... (v1 と同じ) ...
    "Mission_10min": {
        durationSec: 600, // 片道10分 (600秒)
        destination: "近海の小島",
        rewardTableId: "DT-Voyage-10min" // 報酬テーブル
    },
    "Mission_1hour": {
        durationSec: 3600, // 片道1時間 (3600秒)
        destination: "嵐の海域",
        rewardTableId: "DT-Voyage-1hour" // 報酬テーブル
    }
};

// ----------------------------------------------------
// ★ v42: 航海ステータスをリセットする共通関数
// ----------------------------------------------------
async function resetVoyageStatus(playFabId, keysToRemove) {
    if (!_promisifyPlayFab || !_PlayFabServer) return;
    
    try {
        // ★ v65: 航海データをリセットするロジックを修正
        // Voyage_Status のみ "Idle" に更新し、他のキーは KeysToRemove で削除する
        await _promisifyPlayFab(_PlayFabServer.UpdateUserReadOnlyData, {
            PlayFabId: playFabId, 
            Data: { "Voyage_Status": "Idle" }, // ステータスをIdleに更新
            KeysToRemove: keysToRemove // 不要なキーを削除
        });
        // 航海中フラグをリセット
        await _promisifyPlayFab(_PlayFabServer.UpdatePlayerStatistics, {
            PlayFabId: playFabId, Statistics: [{ StatisticName: VOYAGE_STATISTIC_NAME, Value: 0 }]
        });
        console.log(`[航海リセット] ${playFabId} の航海データをリセットしました。`);
    } catch (error) {
        console.error(`[航海リセットエラー] ${playFabId}:`, error.errorMessage);
    }
}


// ----------------------------------------------------
// ★ v42: ログイン時にトリガーされる「航海バトル判定」 (exports)
// ----------------------------------------------------
async function triggerRandomVoyageBattle() {
    if (!_promisifyPlayFab || !_PlayFabServer || !_lineClient) {
        console.error('triggerRandomVoyageBattle: voyage.js が初期化されていません。');
        return;
    }
    
    console.log('[航海バトル] 判定を開始します...');

    // ★★★ 改良案: ロック処理 ★★★
    try {
        // 1. ロックを試みる
        await _promisifyPlayFab(_PlayFabServer.SetTitleData, {
            Key: VOYAGE_BATTLE_LOCK_KEY,
            Value: new Date().toISOString()
        });
    } catch (lockError) {
        // SetTitleDataは、キーが既に存在するとエラーになる場合がある。
        // これを利用して、他のプロセスが処理中であると判断する。
        console.log('[航海バトル] 他のプロセスが判定中のためスキップします。');
        return;
    }

    try {
        // 2. 航海中のプレイヤーリストを取得
        const leaderboardResult = await _promisifyPlayFab(_PlayFabServer.GetLeaderboard, {
            StatisticName: VOYAGE_STATISTIC_NAME,
            StartPosition: 0,
            MaxResultsCount: 50, // 最大50人まで取得
            ProfileConstraints: { ShowDisplayName: true }
        });

        const voyagingPlayers = leaderboardResult.Leaderboard.filter(p => p.StatValue === 1);

        if (voyagingPlayers.length < 2) {
            console.log('[航海バトル] 航海中のプレイヤーが2人未満のため、バトルは発生しません。');
            return; // finallyブロックでロックが解放される
        }

        // 3. 遭遇確率の判定
        if (Math.random() > BATTLE_ENCOUNTER_CHANCE) {
            console.log(`[航海バトル] 遭遇判定に失敗しました (確率: ${BATTLE_ENCOUNTER_CHANCE})`);
            return; // finallyブロックでロックが解放される
        }

        // 3. ランダムに2者を選出
        const indexA = Math.floor(Math.random() * voyagingPlayers.length);
        let indexB = Math.floor(Math.random() * voyagingPlayers.length);
        while (indexA === indexB) {
            indexB = Math.floor(Math.random() * voyagingPlayers.length);
        }
        
        const playerAData = voyagingPlayers[indexA];
        const playerBData = voyagingPlayers[indexB];

        console.log(`[航海バトル] 遭遇！ ${playerAData.DisplayName} (A) vs ${playerBData.DisplayName} (B)`);

        // 4. バトル実行 (v42 共通関数を使用)
        const playerA = await battle.getPlayerFullProfile(playerAData.PlayFabId);
        const playerB = await battle.getPlayerFullProfile(playerBData.PlayFabId);

        // ※lineUserIdが無くても battle.runBattle は動作する (v42)
        const battleResult = await battle.runBattle(playerA, playerB);
        const winner = battleResult.winner;
        const loser = battleResult.loser;

        // 5. 結果を保存
        await battle.savePlayerHpMp(winner);
        await battle.savePlayerHpMp(loser);

        // 6. 敗北者の航海を中断
        // ★ v65: 削除するキーリストから Voyage_Status を除外
        await resetVoyageStatus(loser.id, ["Voyage_MissionId", "Voyage_Destination", "Voyage_RewardTable", "Voyage_DurationSec", "Voyage_StartTimeISO", "Voyage_ReturnStartTimeISO"]);
        
        console.log(`[航海バトル] 決着！ 勝者: ${winner.stats.DisplayName}, 敗者: ${loser.stats.DisplayName} (航海中断)`);

        // 7. 敗北者にLINE通知
        if (loser.lineUserId) {
            try {
                await _lineClient.pushMessage(loser.lineUserId, { 
                    type: 'text', 
                    text: `航海中に ${winner.stats.DisplayName} に襲撃され、敗北しました...\n航海は中断され、港に戻されました。`
                });
            } catch (pushError) {
                console.error("[航海バトル] 敗北者へのLINE通知に失敗:", pushError.originalError ? pushError.originalError.response.data : pushError);
            }
        }
    } catch (error) {
        console.error('[航海バトル] トリガー処理中に予期せぬエラーが発生しました:', error.errorMessage || error.message);
    } finally {
        // ★★★ 改良案: 必ずロックを解放する ★★★
        try {
            await _promisifyPlayFab(_PlayFabServer.SetTitleData, { Key: VOYAGE_BATTLE_LOCK_KEY, Value: null });
            console.log('[航海バトル] ロックを解放しました。');
        } catch (unlockError) {
            console.error('[航海バトル] ロックの解放に失敗しました。', unlockError.errorMessage);
        }
    }
}


// ----------------------------------------------------
// ★ v42: server.js から呼び出される初期化関数
// ----------------------------------------------------
function initializeVoyageRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin, lineClient, catalogCache, constants) {

    // ★ v42: モジュールレベル変数に代入
    _promisifyPlayFab = promisifyPlayFab;
    _PlayFabServer = PlayFabServer;
    _lineClient = lineClient;
    _catalogCache = catalogCache;
    _GACHA_CATALOG_VERSION = constants.GACHA_CATALOG_VERSION; // v1互換

    // ----------------------------------------------------
    // API 13: 航海ミッションを開始する (v42: 統計情報更新を追加)
    // ----------------------------------------------------
    app.post('/api/start-voyage', async (req, res) => {
        const { playFabId, missionId } = req.body;

        if (!playFabId || !missionId) return res.status(400).json({ error: 'IDまたはミッションIDがありません。' });
        
        const mission = VOYAGE_MISSIONS[missionId];
        if (!mission) return res.status(400).json({ error: '無効なミッションIDです。' });

        console.log(`[航海開始] ${playFabId} が ${mission.destination} ( ${missionId} ) へ出航します。`);

        try {
            // 1. 現在の航海ステータスをチェック
            const currentData = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId, Keys: ["Voyage_Status"]
            });

            if (currentData.Data && currentData.Data.Voyage_Status && currentData.Data.Voyage_Status.Value !== "Idle") {
                return res.status(400).json({ error: '既に出航中です。' });
            }

            // 2. 航海データをPlayFabに保存
// ... (v1と同じ) ...
            const voyageData = {
                "Voyage_Status": "Outbound", // 往路
                "Voyage_MissionId": missionId,
                "Voyage_Destination": mission.destination,
                "Voyage_RewardTable": mission.rewardTableId,
                "Voyage_DurationSec": String(mission.durationSec), // PlayFabは文字列型を推奨
                "Voyage_StartTimeISO": new Date().toISOString()
            };

            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId, Data: voyageData
            });

            // ★ v42: 航海中フラグ(統計情報)を立てる
            await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                PlayFabId: playFabId, Statistics: [{ StatisticName: VOYAGE_STATISTIC_NAME, Value: 1 }]
            });

            console.log(`[航海開始] ${playFabId} のデータ保存完了。`);
            
// ... (v1と同じ) ...
            const remainingMs = mission.durationSec * 1000;
            res.json({
                status: "Outbound",
                destination: mission.destination,
                remainingMs: remainingMs,
                message: `${mission.destination} へ出航しました！`
            });

        } catch (error) {
            console.error('[航海開始エラー]', error.errorMessage);
            res.status(500).json({ error: '出航処理に失敗しました。', details: error.errorMessage });
        }
    });

    // ----------------------------------------------------
    // ★ v61: API 17: 帰港を開始する
    // ----------------------------------------------------
    app.post('/api/return-to-port', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'IDがありません。' });

        console.log(`[帰港開始] ${playFabId} が帰港を開始します。`);

        try {
            // 1. 現在のステータスが "Arrived" であることを確認
            const currentData = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId, Keys: ["Voyage_Status", "Voyage_Destination", "Voyage_DurationSec"]
            });

            if (!currentData.Data || !currentData.Data.Voyage_Status || currentData.Data.Voyage_Status.Value !== "Arrived") {
                return res.status(400).json({ error: '帰港できる状態ではありません。' });
            }

            // 2. ステータスを "Returning" に更新し、帰港開始時刻を記録
            const returnData = {
                "Voyage_Status": "Returning",
                "Voyage_ReturnStartTimeISO": new Date().toISOString() // 帰港開始時刻を保存
            };
            await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                PlayFabId: playFabId, Data: returnData
            });

            const durationSec = parseInt(currentData.Data.Voyage_DurationSec.Value, 10);
            const destination = currentData.Data.Voyage_Destination.Value;

            res.json({ status: "Returning", destination: destination, remainingMs: durationSec * 1000 });
        } catch (error) {
            console.error('[帰港開始エラー]', error.errorMessage);
            res.status(500).json({ error: '帰港処理に失敗しました。', details: error.errorMessage });
        }
    });

    // ----------------------------------------------------
    // API 14: 航海ステータスを確認・報酬を受け取る (v42: 統計情報更新を追加)
    // ----------------------------------------------------
    app.post('/api/check-voyage-status', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'IDがありません。' });

        try {
            // 1. 航海データをすべて読み込む
            const keys = ["Voyage_Status", "Voyage_Destination", "Voyage_RewardTable", "Voyage_DurationSec", "Voyage_StartTimeISO", "Voyage_ReturnStartTimeISO"];
            const result = await promisifyPlayFab(PlayFabServer.GetUserReadOnlyData, {
                PlayFabId: playFabId, Keys: keys
            });

            if (!result.Data || !result.Data.Voyage_Status) {
                // ★ v42: 統計情報もリセットしておく (念のため)
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: playFabId, Statistics: [{ StatisticName: VOYAGE_STATISTIC_NAME, Value: 0 }]
                });
                return res.json({ status: "Idle", message: "航海していません。" });
            }

            const status = result.Data.Voyage_Status.Value;
            if (status === "Idle") {
                // ★ v42: 統計情報もリセットしておく (念のため)
                await promisifyPlayFab(PlayFabServer.UpdatePlayerStatistics, {
                    PlayFabId: playFabId, Statistics: [{ StatisticName: VOYAGE_STATISTIC_NAME, Value: 0 }]
                });
                return res.json({ status: "Idle", message: "航海していません。" });
            }

// ... (v1と同じ 時間計算) ...
            const destination = result.Data.Voyage_Destination ? result.Data.Voyage_Destination.Value : "（不明な場所）";
            const rewardTableId = result.Data.Voyage_RewardTable ? result.Data.Voyage_RewardTable.Value : null;
            const durationSec = result.Data.Voyage_DurationSec ? parseInt(result.Data.Voyage_DurationSec.Value, 10) : 0;
            const startTimeISO = result.Data.Voyage_StartTimeISO ? result.Data.Voyage_StartTimeISO.Value : new Date().toISOString();
            const startTimeMs = new Date(startTimeISO).getTime();
            const nowMs = new Date().getTime();
            
            // --- [ 往路 ] ---
            if (status === "Outbound") {
                // ★ v62: 到着時刻の計算をここで行う
                const arrivalTimeMs = startTimeMs + (durationSec * 1000);
                if (nowMs < arrivalTimeMs) {
                    // (まだ往路の途中)
                    const remainingMs = arrivalTimeMs - nowMs;
                    return res.json({ status: "Outbound", destination: destination, remainingMs: remainingMs });
                } else {
                    // ★ v61: (目的地に到着！ "Arrived" ステータスに切り替える)
                    console.log(`[航海状況] ${playFabId} が ${destination} に到着。帰港待ち状態に移行。`);
                    await promisifyPlayFab(PlayFabServer.UpdateUserReadOnlyData, {
                        PlayFabId: playFabId, Data: { "Voyage_Status": "Arrived" }
                    });
                    return res.json({ status: "Arrived", destination: destination });
                }
            }

            // --- [ ★ v61: 目的地に到着済み ] ---
            if (status === "Arrived") {
                return res.json({ status: "Arrived", destination: destination });
            }

            // --- [ 復路 ] ---
            if (status === "Returning") {
                const returnStartTimeISO = result.Data.Voyage_ReturnStartTimeISO ? result.Data.Voyage_ReturnStartTimeISO.Value : startTimeISO;
                const returnStartTimeMs = new Date(returnStartTimeISO).getTime();
                const returnTimeMs = returnStartTimeMs + (durationSec * 1000); // 帰港時刻

                if (nowMs < returnTimeMs) {
                    // (まだ復路の途中)
                    const remainingMs = returnTimeMs - nowMs;
                    return res.json({ status: "Returning", destination: destination, remainingMs: remainingMs });
                } else {
                    // (帰港！ 報酬ゲット！)
                    console.log(`[航海状況] ${playFabId} が帰港！ 報酬処理を開始。`);
                    
                    if (!rewardTableId) throw new Error('報酬テーブルID(Voyage_RewardTable)が見つかりません。');
                    // ★ v42: モジュール変数を使用
                    if (!_GACHA_CATALOG_VERSION) throw new Error('CatalogVersionが定義されていません。');
                    
// ... (v1と同じ 報酬テーブル評価) ...
                    const evalResult = await promisifyPlayFab(PlayFabServer.EvaluateRandomResultTable, {
                        TableId: rewardTableId, 
                        CatalogVersion: _GACHA_CATALOG_VERSION // ★ v42
                    });

                    // ★ v63: 抽選されたアイテムIDを取得する処理を追加
                    const grantedItemId = evalResult.ResultItemId;
                    if (!grantedItemId) throw new Error(`報酬テーブル(${rewardTableId})からアイテムが抽選されませんでした。`);

// ... (v1と同じ アイテム付与) ...
                    const grantResult = await promisifyPlayFab(PlayFabServer.GrantItemsToUser, {
                        PlayFabId: playFabId, 
                        CatalogVersion: _GACHA_CATALOG_VERSION, // ★ v42
                        ItemIds: [ grantedItemId ]
                    });

// ... (v1と同じ) ...
                    const grantedItem = grantResult.ItemGrantResults[0];
                    const itemName = grantedItem.DisplayName || grantedItem.ItemId;
                    console.log(`[航海報酬] ${playFabId} が ${itemName} を獲得。`);
                    
                    // 5-3. 航海ステータスをリセット (★ v65: 削除するキーリストから Voyage_Status を除外)
                    await resetVoyageStatus(playFabId, ["Voyage_MissionId", "Voyage_Destination", "Voyage_RewardTable", "Voyage_DurationSec", "Voyage_StartTimeISO", "Voyage_ReturnStartTimeISO"]);
                    
                    return res.json({ 
                        status: "Reward",
                        message: `${destination} から帰還し、報酬として「${itemName}」を手に入れた！`,
                        grantedItem: grantedItem
// ... (v1と同じ) ...
                    });
                }
            }

            // ★ v64: 万が一、不明なステータスだった場合はリセットしてIdleを返す
            console.warn(`[航海状況] 予期せぬステータス "${status}" を検出したため、航海データをリセットします。`);
            // ★ v65: 削除するキーリストから Voyage_Status を除外
            const keysToReset = ["Voyage_MissionId", "Voyage_Destination", "Voyage_RewardTable", "Voyage_DurationSec", "Voyage_StartTimeISO", "Voyage_ReturnStartTimeISO"];
            await resetVoyageStatus(playFabId, keysToReset);
            return res.json({ status: "Idle", message: "航海状況をリセットしました。" });

        } catch (error) {
            console.error('[航海状況確認エラー]', error.errorMessage || error.message);
            // エラーが発生した場合、航海ステータスをリセットする（ハマり防止）
            // ★ v65: 削除するキーリストから Voyage_Status を除外
            await resetVoyageStatus(playFabId, ["Voyage_MissionId", "Voyage_Destination", "Voyage_RewardTable", "Voyage_DurationSec", "Voyage_StartTimeISO", "Voyage_ReturnStartTimeISO"]);
            
            res.status(500).json({ error: '航海状況の確認または報酬の付与に失敗しました。', details: error.errorMessage || error.message });
        }
    });

}

// ★ v42: exports にトリガー関数を追加
module.exports = {
    initializeVoyageRoutes,
    triggerRandomVoyageBattle
};