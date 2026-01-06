// guild.js - ギルド機能のサーバー側API
// PlayFab Groups APIを使用したギルド管理

const PlayFabGroups = require('playfab-sdk/Scripts/PlayFab/PlayFabGroups');
const PlayFabData = require('playfab-sdk/Scripts/PlayFab/PlayFabData');
const PlayFabAuthentication = require('playfab-sdk/Scripts/PlayFab/PlayFabAuthentication');

// ギルドレベルシステムの設定
const GUILD_LEVEL_CONFIG = {
    1: { requiredExp: 0, maxMembers: 10 },
    2: { requiredExp: 100, maxMembers: 15 },
    3: { requiredExp: 300, maxMembers: 20 },
    4: { requiredExp: 600, maxMembers: 25 },
    5: { requiredExp: 1000, maxMembers: 30 },
    6: { requiredExp: 1500, maxMembers: 35 },
    7: { requiredExp: 2100, maxMembers: 40 },
    8: { requiredExp: 2800, maxMembers: 45 },
    9: { requiredExp: 3600, maxMembers: 50 },
    10: { requiredExp: 4500, maxMembers: 60 }
};

/**
 * ギルドレベルを計算
 * @param {number} exp - 現在の経験値
 * @returns {number} - ギルドレベル
 */
function calculateGuildLevel(exp) {
    let level = 1;
    for (let lvl = 10; lvl >= 1; lvl--) {
        if (exp >= GUILD_LEVEL_CONFIG[lvl].requiredExp) {
            level = lvl;
            break;
        }
    }
    return level;
}

/**
 * ギルドデータを取得（PlayFab Objects APIを使用）
 * @param {string} guildId - ギルドID
 * @returns {Object} - ギルドデータ
 */
async function getGuildData(guildId, promisifyPlayFab) {
    try {
        const result = await promisifyPlayFab(PlayFabData.GetObjects, {
            Entity: { Id: guildId, Type: 'group' },
            EscapeObject: false
        });

        if (result.Objects && result.Objects.GuildData) {
            return JSON.parse(result.Objects.GuildData.DataObject);
        }

        // デフォルトのギルドデータ
        return {
            level: 1,
            exp: 0,
            treasury: 0, // ギルド資金
            warehouse: [], // アイテム倉庫
            pendingApplications: [] // 加入申請リスト
        };
    } catch (error) {
        console.warn('[getGuildData] データ取得失敗、デフォルト値を返します:', error.message);
        return {
            level: 1,
            exp: 0,
            treasury: 0,
            warehouse: [],
            pendingApplications: []
        };
    }
}

/**
 * ギルドデータを保存（PlayFab Objects APIを使用）
 * @param {string} guildId - ギルドID
 * @param {Object} data - 保存するデータ
 */
async function saveGuildData(guildId, data, promisifyPlayFab) {
    await promisifyPlayFab(PlayFabData.SetObjects, {
        Entity: { Id: guildId, Type: 'group' },
        Objects: [
            {
                ObjectName: 'GuildData',
                DataObject: data
            }
        ]
    });
}

/**
 * ギルド関連のAPIルートを初期化
 * @param {Express} app - Expressアプリケーション
 * @param {Function} promisifyPlayFab - PlayFab APIのPromiseラッパー
 * @param {Object} PlayFabServer - PlayFab Server API
 * @param {Object} PlayFabAdmin - PlayFab Admin API
 */
function initializeGuildRoutes(app, promisifyPlayFab, PlayFabServer, PlayFabAdmin) {

    // ----------------------------------------------------
    // API: ギルド情報を取得
    // ----------------------------------------------------
    app.post('/api/get-guild-info', async (req, res) => {
        const { playFabId, entityKey } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });

        console.log(`[ギルド情報取得] ${playFabId} のギルド情報を取得します...`);

        try {
            // Ensure a valid title entity token before calling Groups API.
            await promisifyPlayFab(PlayFabAuthentication.GetEntityToken, {});

            // プレイヤーのEntityKeyを取得
            let resolvedEntity = entityKey && entityKey.Id && entityKey.Type ? entityKey : null;
            if (!resolvedEntity) {
                const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                    PlayFabId: playFabId,
                    ProfileConstraints: { ShowEntity: true }
                });
                const entityId = entityResult?.PlayerProfile?.Entity?.Id || null;
                const entityType = entityResult?.PlayerProfile?.Entity?.Type || null;
                if (entityId && entityType) {
                    resolvedEntity = { Id: entityId, Type: entityType };
                }
            }
            if (!resolvedEntity) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            // プレイヤーが所属するグループを取得
            const membershipResult = await promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: resolvedEntity
            });

            if (!membershipResult.Groups || membershipResult.Groups.length === 0) {
                // ギルドに未加入
                console.log(`[ギルド情報取得] ${playFabId} はどのギルドにも所属していません。`);
                return res.json({ guild: null });
            }

            // 最初のグループを取得（1人のプレイヤーは1つのギルドにのみ所属）
            const group = membershipResult.Groups[0];
            const guildId = group.Group.Id;
            const guildName = group.GroupName;
            const memberRole = group.RoleName || 'メンバー';

            // メンバー数を取得するために、グループメンバーを取得
            const membersResult = await promisifyPlayFab(PlayFabGroups.ListGroupMembers, {
                Group: { Id: guildId, Type: 'group' }
            });

            const memberCount = membersResult.Members ? membersResult.Members.length : 0;

            // ギルドデータを取得（レベル、経験値、資金など）
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const currentLevel = calculateGuildLevel(guildData.exp);

            // 次のレベルまでの必要経験値を計算
            const nextLevel = currentLevel < 10 ? currentLevel + 1 : 10;
            const nextLevelExp = GUILD_LEVEL_CONFIG[nextLevel].requiredExp;
            const currentLevelExp = GUILD_LEVEL_CONFIG[currentLevel].requiredExp;
            const expProgress = guildData.exp - currentLevelExp;
            const expRequired = nextLevelExp - currentLevelExp;

            console.log(`[ギルド情報取得] 成功: ${guildName} (ID: ${guildId}, Lv.${currentLevel})`);

            res.json({
                guild: {
                    guildId: guildId,
                    name: guildName,
                    memberCount: memberCount,
                    level: currentLevel,
                    exp: guildData.exp,
                    expProgress: expProgress,
                    expRequired: expRequired,
                    treasury: guildData.treasury || 0,
                    maxMembers: GUILD_LEVEL_CONFIG[currentLevel].maxMembers,
                    role: memberRole,
                    pendingApplicationsCount: (guildData.pendingApplications || []).length
                }
            });

        } catch (error) {
            console.error('[ギルド情報取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド情報の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドを作成
    // ----------------------------------------------------
    app.post('/api/create-guild', async (req, res) => {
        const { playFabId, guildName } = req.body;
        if (!playFabId || !guildName) {
            return res.status(400).json({ error: 'IDまたはギルド名がありません。' });
        }

        if (guildName.trim().length === 0) {
            return res.status(400).json({ error: 'ギルド名を入力してください。' });
        }

        if (guildName.length > 30) {
            return res.status(400).json({ error: 'ギルド名は30文字以内で入力してください。' });
        }

        console.log(`[ギルド作成] ${playFabId} がギルド「${guildName}」を作成します...`);

        try {
            // プレイヤーのEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowLinkedAccounts: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const entityKey = {
                Id: entityResult.PlayerProfile.PlayerId,
                Type: 'title_player_account'
            };

            // 既にギルドに所属していないか確認
            const membershipResult = await promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: entityKey
            });

            if (membershipResult.Groups && membershipResult.Groups.length > 0) {
                return res.status(400).json({ error: '既にギルドに所属しています。' });
            }

            // ギルドを作成
            const createResult = await promisifyPlayFab(PlayFabGroups.CreateGroup, {
                GroupName: guildName.trim(),
                Entity: entityKey
            });

            const guildId = createResult.Group.Id;

            // 初期ギルドデータを保存
            const initialGuildData = {
                level: 1,
                exp: 0,
                treasury: 0,
                warehouse: [],
                pendingApplications: [],
                chatMessages: [] // チャットメッセージ履歴
            };
            await saveGuildData(guildId, initialGuildData, promisifyPlayFab);

            console.log(`[ギルド作成] 成功: ${guildName} (ID: ${guildId})`);

            res.json({
                success: true,
                guildId: guildId,
                guildName: guildName.trim()
            });

        } catch (error) {
            console.error('[ギルド作成エラー]', error.errorMessage || error.message);

            // エラーメッセージを解析してユーザーフレンドリーなメッセージを返す
            let errorMsg = 'ギルドの作成に失敗しました。';
            if (error.errorMessage && error.errorMessage.includes('already exists')) {
                errorMsg = '同じ名前のギルドが既に存在します。';
            }

            res.status(500).json({ error: errorMsg, details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドに加入
    // ----------------------------------------------------
    app.post('/api/join-guild', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }

        console.log(`[ギルド加入] ${playFabId} がギルド ${guildId} に加入申請します...`);

        try {
            // プレイヤーのEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowLinkedAccounts: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const entityKey = {
                Id: entityResult.PlayerProfile.PlayerId,
                Type: 'title_player_account'
            };

            // 既にギルドに所属していないか確認
            const membershipResult = await promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: entityKey
            });

            if (membershipResult.Groups && membershipResult.Groups.length > 0) {
                return res.status(400).json({ error: '既にギルドに所属しています。' });
            }

            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            // ギルドに加入申請（QRコードを読み取った場合は、申請せずに直接招待として扱う）
            // まず、招待を使って加入を試みる
            try {
                // 招待として処理（Admin権限でメンバーを追加）
                await promisifyPlayFab(PlayFabGroups.AddMembers, {
                    Group: groupEntity,
                    Members: [entityKey],
                    RoleId: 'members' // デフォルトのメンバーロール
                });

                console.log(`[ギルド加入] 成功: ${playFabId} がギルド ${guildId} に加入しました。`);

                // ギルド名を取得
                let guildName = 'Unknown Guild';
                try {
                    const groupResult = await promisifyPlayFab(PlayFabGroups.GetGroup, {
                        Group: groupEntity
                    });
                    guildName = groupResult.GroupName || 'Unknown Guild';
                } catch (e) {
                    console.warn('[ギルド加入] ギルド名の取得に失敗しました。', e.message);
                }

                res.json({
                    success: true,
                    guildId: guildId,
                    guildName: guildName
                });

            } catch (addError) {
                // AddMembersが失敗した場合は、ApplyToGroupで申請を行う
                console.log(`[ギルド加入] AddMembersに失敗。申請方式に切り替えます...`);

                await promisifyPlayFab(PlayFabGroups.ApplyToGroup, {
                    Group: groupEntity,
                    Entity: entityKey
                });

                console.log(`[ギルド加入] 申請成功: ${playFabId} がギルド ${guildId} に加入申請しました。`);
                res.json({
                    success: true,
                    pending: true,
                    message: 'ギルドへの加入申請を送信しました。承認をお待ちください。'
                });
            }

        } catch (error) {
            console.error('[ギルド加入エラー]', error.errorMessage || error.message);

            let errorMsg = 'ギルドへの加入に失敗しました。';
            if (error.errorMessage && error.errorMessage.includes('not found')) {
                errorMsg = 'ギルドが見つかりませんでした。';
            }

            res.status(500).json({ error: errorMsg, details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドから脱退
    // ----------------------------------------------------
    app.post('/api/leave-guild', async (req, res) => {
        const { playFabId } = req.body;
        if (!playFabId) return res.status(400).json({ error: 'PlayFab ID がありません。' });

        console.log(`[ギルド脱退] ${playFabId} がギルドから脱退します...`);

        try {
            // プレイヤーのEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowLinkedAccounts: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: 'プレイヤー情報の取得に失敗しました。' });
            }

            const entityKey = {
                Id: entityResult.PlayerProfile.PlayerId,
                Type: 'title_player_account'
            };

            // 現在所属しているギルドを取得
            const membershipResult = await promisifyPlayFab(PlayFabGroups.ListMembership, {
                Entity: entityKey
            });

            if (!membershipResult.Groups || membershipResult.Groups.length === 0) {
                return res.status(400).json({ error: 'ギルドに所属していません。' });
            }

            const group = membershipResult.Groups[0];
            const guildId = group.Group.Id;

            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            // ギルドから脱退
            await promisifyPlayFab(PlayFabGroups.RemoveMembers, {
                Group: groupEntity,
                Members: [entityKey]
            });

            console.log(`[ギルド脱退] 成功: ${playFabId} がギルド ${guildId} から脱退しました。`);

            res.json({
                success: true,
                message: 'ギルドから脱退しました。'
            });

        } catch (error) {
            console.error('[ギルド脱退エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルドからの脱退に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドメンバー一覧を取得
    // ----------------------------------------------------
    app.post('/api/get-guild-members', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }

        console.log(`[ギルドメンバー取得] ギルド ${guildId} のメンバー一覧を取得します...`);

        try {
            const groupEntity = {
                Id: guildId,
                Type: 'group'
            };

            // ギルドメンバーを取得
            const membersResult = await promisifyPlayFab(PlayFabGroups.ListGroupMembers, {
                Group: groupEntity
            });

            if (!membersResult.Members || membersResult.Members.length === 0) {
                console.log(`[ギルドメンバー取得] ギルド ${guildId} にメンバーがいません。`);
                return res.json({ members: [] });
            }

            // メンバー情報を整形
            const members = [];
            for (const member of membersResult.Members) {
                // EntityからPlayFabIdを取得し、プロフィール情報を取得する
                const entityId = member.Members[0].Key.Id;
                const roleName = member.RoleId || 'members';

                try {
                    // EntityIDからプレイヤープロフィールを取得
                    const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                        PlayFabId: entityId,
                        ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                    });

                    if (profileResult.PlayerProfile) {
                        members.push({
                            playFabId: entityId,
                            displayName: profileResult.PlayerProfile.DisplayName || 'Unknown',
                            avatarUrl: profileResult.PlayerProfile.AvatarUrl || null,
                            role: roleName === 'admins' ? 'リーダー' : 'メンバー'
                        });
                    }
                } catch (profileError) {
                    console.warn(`[ギルドメンバー取得] Entity ${entityId} のプロフィール取得に失敗:`, profileError.message);
                    // プロフィール取得に失敗しても、メンバーリストには追加
                    members.push({
                        playFabId: entityId,
                        displayName: 'Unknown',
                        avatarUrl: null,
                        role: roleName === 'admins' ? 'リーダー' : 'メンバー'
                    });
                }
            }

            console.log(`[ギルドメンバー取得] 成功: ${members.length} 人のメンバーを取得しました。`);

            res.json({
                members: members
            });

        } catch (error) {
            console.error('[ギルドメンバー取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'メンバー一覧の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請一覧を取得（リーダー用）
    // ----------------------------------------------------
    app.post('/api/get-guild-applications', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }

        console.log(`[加入申請取得] ギルド ${guildId} の加入申請を取得します...`);

        try {
            const groupEntity = { Id: guildId, Type: 'group' };

            // PlayFab Groups APIで申請リストを取得
            const applicationsResult = await promisifyPlayFab(PlayFabGroups.ListGroupApplications, {
                Group: groupEntity
            });

            const applications = [];
            if (applicationsResult.Applications && applicationsResult.Applications.length > 0) {
                for (const app of applicationsResult.Applications) {
                    const entityId = app.Entity.Id;

                    try {
                        const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                            PlayFabId: entityId,
                            ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
                        });

                        if (profileResult.PlayerProfile) {
                            applications.push({
                                playFabId: entityId,
                                displayName: profileResult.PlayerProfile.DisplayName || 'Unknown',
                                avatarUrl: profileResult.PlayerProfile.AvatarUrl || null,
                                appliedAt: app.Created || new Date().toISOString()
                            });
                        }
                    } catch (profileError) {
                        console.warn(`[加入申請取得] Entity ${entityId} のプロフィール取得に失敗:`, profileError.message);
                    }
                }
            }

            console.log(`[加入申請取得] 成功: ${applications.length} 件の申請を取得しました。`);

            res.json({
                applications: applications
            });

        } catch (error) {
            console.error('[加入申請取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請を承認
    // ----------------------------------------------------
    app.post('/api/approve-guild-application', async (req, res) => {
        const { playFabId, guildId, applicantId } = req.body;
        if (!playFabId || !guildId || !applicantId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        console.log(`[加入申請承認] ${applicantId} の申請を承認します...`);

        try {
            // 申請者のEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: applicantId,
                ProfileConstraints: { ShowLinkedAccounts: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: '申請者情報の取得に失敗しました。' });
            }

            const applicantEntityKey = {
                Id: entityResult.PlayerProfile.PlayerId,
                Type: 'title_player_account'
            };

            const groupEntity = { Id: guildId, Type: 'group' };

            // 申請を承認
            await promisifyPlayFab(PlayFabGroups.AcceptGroupApplication, {
                Group: groupEntity,
                Entity: applicantEntityKey
            });

            console.log(`[加入申請承認] 成功: ${applicantId} をギルドに追加しました。`);

            res.json({
                success: true,
                message: '加入申請を承認しました。'
            });

        } catch (error) {
            console.error('[加入申請承認エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の承認に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: 加入申請を拒否
    // ----------------------------------------------------
    app.post('/api/reject-guild-application', async (req, res) => {
        const { playFabId, guildId, applicantId } = req.body;
        if (!playFabId || !guildId || !applicantId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        console.log(`[加入申請拒否] ${applicantId} の申請を拒否します...`);

        try {
            // 申請者のEntityKeyを取得
            const entityResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: applicantId,
                ProfileConstraints: { ShowLinkedAccounts: true }
            });

            if (!entityResult.PlayerProfile || !entityResult.PlayerProfile.PlayerId) {
                return res.status(500).json({ error: '申請者情報の取得に失敗しました。' });
            }

            const applicantEntityKey = {
                Id: entityResult.PlayerProfile.PlayerId,
                Type: 'title_player_account'
            };

            const groupEntity = { Id: guildId, Type: 'group' };

            // 申請を拒否（削除）
            await promisifyPlayFab(PlayFabGroups.RemoveGroupApplication, {
                Group: groupEntity,
                Entity: applicantEntityKey
            });

            console.log(`[加入申請拒否] 成功: ${applicantId} の申請を削除しました。`);

            res.json({
                success: true,
                message: '加入申請を拒否しました。'
            });

        } catch (error) {
            console.error('[加入申請拒否エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: '加入申請の拒否に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドチャットメッセージを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-chat', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }

        console.log(`[ギルドチャット取得] ギルド ${guildId} のチャットを取得します...`);

        try {
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const messages = guildData.chatMessages || [];

            // 最新100件のみ返す
            const recentMessages = messages.slice(-100);

            res.json({
                messages: recentMessages
            });

        } catch (error) {
            console.error('[ギルドチャット取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'チャットメッセージの取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドチャットメッセージを送信
    // ----------------------------------------------------
    app.post('/api/send-guild-chat', async (req, res) => {
        const { playFabId, guildId, message } = req.body;
        if (!playFabId || !guildId || !message) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        if (message.trim().length === 0) {
            return res.status(400).json({ error: 'メッセージを入力してください。' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'メッセージは500文字以内で入力してください。' });
        }

        console.log(`[ギルドチャット送信] ${playFabId} がメッセージを送信します...`);

        try {
            // プレイヤー名を取得
            const profileResult = await promisifyPlayFab(PlayFabServer.GetPlayerProfile, {
                PlayFabId: playFabId,
                ProfileConstraints: { ShowDisplayName: true, ShowAvatarUrl: true }
            });

            const displayName = profileResult.PlayerProfile.DisplayName || 'Unknown';
            const avatarUrl = profileResult.PlayerProfile.AvatarUrl || null;

            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 新しいメッセージを追加
            const newMessage = {
                playFabId: playFabId,
                displayName: displayName,
                avatarUrl: avatarUrl,
                message: message.trim(),
                timestamp: new Date().toISOString()
            };

            guildData.chatMessages = guildData.chatMessages || [];
            guildData.chatMessages.push(newMessage);

            // メッセージは最新1000件のみ保持
            if (guildData.chatMessages.length > 1000) {
                guildData.chatMessages = guildData.chatMessages.slice(-1000);
            }

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルドチャット送信] 成功: メッセージを保存しました。`);

            res.json({
                success: true,
                message: newMessage
            });

        } catch (error) {
            console.error('[ギルドチャット送信エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'メッセージの送信に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫のアイテムを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-warehouse', async (req, res) => {
        const { playFabId, guildId } = req.body;
        if (!playFabId || !guildId) {
            return res.status(400).json({ error: 'IDまたはギルドIDがありません。' });
        }

        console.log(`[ギルド倉庫取得] ギルド ${guildId} の倉庫を取得します...`);

        try {
            const guildData = await getGuildData(guildId, promisifyPlayFab);
            const warehouse = guildData.warehouse || [];

            res.json({
                warehouse: warehouse,
                treasury: guildData.treasury || 0
            });

        } catch (error) {
            console.error('[ギルド倉庫取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド倉庫の取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫にアイテムを寄付
    // ----------------------------------------------------
    app.post('/api/donate-to-guild-warehouse', async (req, res) => {
        const { playFabId, guildId, itemInstanceId, itemId } = req.body;
        if (!playFabId || !guildId || !itemInstanceId || !itemId) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        console.log(`[ギルド倉庫寄付] ${playFabId} がアイテムを寄付します...`);

        try {
            // プレイヤーからアイテムを消費
            await promisifyPlayFab(PlayFabServer.ConsumeItem, {
                PlayFabId: playFabId,
                ItemInstanceId: itemInstanceId,
                ConsumeCount: 1
            });

            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 倉庫にアイテムを追加
            const donatedItem = {
                itemId: itemId,
                donatedBy: playFabId,
                donatedAt: new Date().toISOString()
            };

            guildData.warehouse = guildData.warehouse || [];
            guildData.warehouse.push(donatedItem);

            // ギルド経験値を追加（寄付のボーナス）
            guildData.exp = (guildData.exp || 0) + 10;

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド倉庫寄付] 成功: アイテムを寄付しました。`);

            res.json({
                success: true,
                message: 'アイテムをギルド倉庫に寄付しました。',
                guildExp: guildData.exp
            });

        } catch (error) {
            console.error('[ギルド倉庫寄付エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'アイテムの寄付に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルド倉庫からアイテムを取得
    // ----------------------------------------------------
    app.post('/api/withdraw-from-guild-warehouse', async (req, res) => {
        const { playFabId, guildId, warehouseIndex } = req.body;
        if (!playFabId || !guildId || warehouseIndex === undefined) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        console.log(`[ギルド倉庫引き出し] ${playFabId} がアイテムを引き出します...`);

        try {
            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            if (!guildData.warehouse || !guildData.warehouse[warehouseIndex]) {
                return res.status(400).json({ error: '指定されたアイテムが見つかりません。' });
            }

            const item = guildData.warehouse[warehouseIndex];

            // プレイヤーにアイテムを付与
            await promisifyPlayFab(PlayFabServer.GrantItemsToUser, {
                PlayFabId: playFabId,
                CatalogVersion: 'main_catalog',
                ItemIds: [item.itemId]
            });

            // 倉庫からアイテムを削除
            guildData.warehouse.splice(warehouseIndex, 1);

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド倉庫引き出し] 成功: アイテムを引き出しました。`);

            res.json({
                success: true,
                message: 'アイテムをギルド倉庫から引き出しました。'
            });

        } catch (error) {
            console.error('[ギルド倉庫引き出しエラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'アイテムの引き出しに失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドランキングを取得
    // ----------------------------------------------------
    app.post('/api/get-guild-ranking', async (req, res) => {
        console.log('[ギルドランキング取得] ギルドランキングを取得します...');

        try {
            // すべてのギルドを取得してランキングを作成する
            // 注意: PlayFab Groups APIにはギルド一覧を取得するAPIがないため、
            // 実際のシステムでは別途ギルド一覧を管理する必要があります
            // ここでは簡易実装として、リクエストした際にエラーを返します

            // TODO: 本格的な実装では、Firestore等にギルド一覧を保存し、
            // それをベースにランキングを生成する必要があります

            res.json({
                ranking: [],
                message: 'ギルドランキング機能は現在開発中です。'
            });

        } catch (error) {
            console.error('[ギルドランキング取得エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルドランキングの取得に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    // ----------------------------------------------------
    // API: ギルドに経験値を追加（イベント報酬などで使用）
    // ----------------------------------------------------
    app.post('/api/add-guild-exp', async (req, res) => {
        const { playFabId, guildId, exp } = req.body;
        if (!playFabId || !guildId || !exp) {
            return res.status(400).json({ error: '必要な情報が不足しています。' });
        }

        console.log(`[ギルド経験値追加] ギルド ${guildId} に ${exp} EXP を追加します...`);

        try {
            // ギルドデータを取得
            const guildData = await getGuildData(guildId, promisifyPlayFab);

            // 経験値を追加
            const oldExp = guildData.exp || 0;
            const newExp = oldExp + exp;
            guildData.exp = newExp;

            // レベルアップチェック
            const oldLevel = calculateGuildLevel(oldExp);
            const newLevel = calculateGuildLevel(newExp);

            const leveledUp = newLevel > oldLevel;

            // 保存
            await saveGuildData(guildId, guildData, promisifyPlayFab);

            console.log(`[ギルド経験値追加] 成功: ${oldExp} -> ${newExp} EXP${leveledUp ? ` (Lv.${oldLevel} -> Lv.${newLevel})` : ''}`);

            res.json({
                success: true,
                oldExp: oldExp,
                newExp: newExp,
                oldLevel: oldLevel,
                newLevel: newLevel,
                leveledUp: leveledUp
            });

        } catch (error) {
            console.error('[ギルド経験値追加エラー]', error.errorMessage || error.message);
            res.status(500).json({ error: 'ギルド経験値の追加に失敗しました。', details: error.errorMessage || error.message });
        }
    });

    console.log('[ギルドAPI] ギルド関連のAPIルートを初期化しました。');
}

module.exports = { initializeGuildRoutes };
