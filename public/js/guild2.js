// c:/Users/ikeda/my-liff-app/public/js/guild.js
// ギルド機能を管理するモジュール

import { callApiWithLoader } from 'api';

// ギルド情報をキャッシュ
let currentGuildInfo = null;
let guildChatPollingInterval = null;

/**
 * ギルド情報を取得して表示する
 * @param {string} playFabId - プレイヤーID
 */
export async function loadGuildInfo(playFabId) {
    console.log('[Guild] Loading guild info for player:', playFabId);

    try {
        // サーバーAPIを呼び出してギルド情報を取得
        const data = await callApiWithLoader('/api/get-guild-info', { playFabId }, { isSilent: true });

        if (data && data.guild) {
            // ギルドに加入している場合
            currentGuildInfo = data.guild;
            showGuildJoinedView(data.guild);
        } else {
            // ギルドに加入していない場合
            currentGuildInfo = null;
            showGuildNotJoinedView();
        }
    } catch (error) {
        console.error('[Guild] Error loading guild info:', error);
        showGuildNotJoinedView();
    }
}

/**
 * ギルド未加入時の表示
 */
function showGuildNotJoinedView() {
    document.getElementById('guildNotJoined').style.display = 'block';
    document.getElementById('guildJoined').style.display = 'none';
}

/**
 * ギルド加入済み時の表示
 * @param {Object} guildInfo - ギルド情報
 */
function showGuildJoinedView(guildInfo) {
    document.getElementById('guildNotJoined').style.display = 'none';
    document.getElementById('guildJoined').style.display = 'block';

    // ギルド情報を表示
    document.getElementById('guildName').textContent = guildInfo.name || 'Unknown Guild';
    document.getElementById('guildMemberCount').textContent = guildInfo.memberCount || 0;
    document.getElementById('guildMaxMembers').textContent = guildInfo.maxMembers || 10;
    document.getElementById('guildLevel').textContent = guildInfo.level || 1;
    document.getElementById('guildRole').textContent = guildInfo.role || 'メンバー';
    document.getElementById('guildTreasury').textContent = guildInfo.treasury || 0;

    // 経験値バーを更新
    const expProgress = guildInfo.expProgress || 0;
    const expRequired = guildInfo.expRequired || 100;
    const expPercentage = expRequired > 0 ? (expProgress / expRequired) * 100 : 0;

    document.getElementById('guildExpProgress').textContent = expProgress;
    document.getElementById('guildExpRequired').textContent = expRequired;
    document.getElementById('guildExpBar').style.width = `${expPercentage}%`;

    // 加入申請数を表示（リーダーのみ）
    const isLeader = guildInfo.role === 'admins' || guildInfo.role === 'リーダー';
    const pendingCount = guildInfo.pendingApplicationsCount || 0;

    if (isLeader && pendingCount > 0) {
        document.getElementById('guildPendingApplicationsDiv').style.display = 'block';
        document.getElementById('guildPendingApplications').textContent = pendingCount;
        document.getElementById('btnViewGuildApplications').style.display = 'block';
    } else {
        document.getElementById('guildPendingApplicationsDiv').style.display = 'none';
        document.getElementById('btnViewGuildApplications').style.display = 'none';
    }

    // ギルド招待QRコードを生成
    generateGuildInviteQR(guildInfo.guildId);
}

/**
 * ギルド招待用のQRコードを生成
 * @param {string} guildId - ギルドID
 */
function generateGuildInviteQR(guildId) {
    const canvas = document.getElementById('guildQrCanvas');
    if (canvas && guildId) {
        // QRコードの内容: "guild:{guildId}" 形式
        const qrValue = `guild:${guildId}`;
        new QRious({
            element: canvas,
            value: qrValue,
            size: 150
        });
    }
}

/**
 * ギルド作成モーダルを表示
 */
export function showCreateGuildModal() {
    document.getElementById('guildCreateModal').style.display = 'flex';
    document.getElementById('guildNameInput').value = '';
    document.getElementById('guildCreateMessage').textContent = '';
}

/**
 * ギルドを作成
 * @param {string} playFabId - プレイヤーID
 * @param {string} guildName - ギルド名
 */
export async function createGuild(playFabId, guildName) {
    if (!guildName || guildName.trim().length === 0) {
        document.getElementById('guildCreateMessage').textContent = 'ギルド名を入力してください';
        return;
    }

    if (guildName.length > 30) {
        document.getElementById('guildCreateMessage').textContent = 'ギルド名は30文字以内で入力してください';
        return;
    }

    document.getElementById('guildCreateMessage').textContent = '作成中...';

    try {
        const data = await callApiWithLoader('/api/create-guild', {
            playFabId,
            guildName: guildName.trim()
        });

        if (data && data.success) {
            document.getElementById('guildCreateModal').style.display = 'none';
            document.getElementById('guildCreateMessage').textContent = '';

            // ギルド情報を再読み込み
            await loadGuildInfo(playFabId);

            // 成功メッセージを表示
            showMessage(`ギルド「${guildName}」を作成しました！`);
        } else {
            document.getElementById('guildCreateMessage').textContent = data?.error || 'ギルド作成に失敗しました';
        }
    } catch (error) {
        console.error('[Guild] Error creating guild:', error);
        document.getElementById('guildCreateMessage').textContent = 'エラーが発生しました';
    }
}

/**
 * QRコードスキャンでギルドに加入
 * @param {string} playFabId - プレイヤーID
 */
export async function scanJoinGuild(playFabId) {
    if (!liff.isInClient()) {
        alert('QRスキャンはLINEアプリ内でのみ利用できます。');
        return;
    }

    try {
        const result = await liff.scanCodeV2();

        if (result && result.value) {
            // QRコードの内容を解析: "guild:{guildId}" 形式
            if (result.value.startsWith('guild:')) {
                const guildId = result.value.substring(6); // "guild:" を除去
                await joinGuild(playFabId, guildId);
            } else {
                alert('無効なギルド招待QRコードです');
            }
        }
    } catch (error) {
        console.error('[Guild] QR scan error:', error);
        alert('QRスキャンに失敗しました');
    }
}

/**
 * ギルドに加入
 * @param {string} playFabId - プレイヤーID
 * @param {string} guildId - ギルドID
 */
async function joinGuild(playFabId, guildId) {
    try {
        const data = await callApiWithLoader('/api/join-guild', {
            playFabId,
            guildId
        });

        if (data && data.success) {
            // ギルド情報を再読み込み
            await loadGuildInfo(playFabId);

            // 成功メッセージを表示
            showMessage(`ギルド「${data.guildName}」に加入しました！`);
        } else {
            alert(data?.error || 'ギルド加入に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error joining guild:', error);
        alert('エラーが発生しました');
    }
}

/**
 * ギルドから脱退
 * @param {string} playFabId - プレイヤーID
 */
export async function leaveGuild(playFabId) {
    if (!confirm('本当にギルドから脱退しますか？')) {
        return;
    }

    try {
        const data = await callApiWithLoader('/api/leave-guild', { playFabId });

        if (data && data.success) {
            // ギルド情報を再読み込み
            await loadGuildInfo(playFabId);

            // 成功メッセージを表示
            showMessage('ギルドから脱退しました');
        } else {
            alert(data?.error || 'ギルド脱退に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error leaving guild:', error);
        alert('エラーが発生しました');
    }
}

/**
 * ギルドメンバー一覧を表示
 * @param {string} playFabId - プレイヤーID
 */
export async function showGuildMembers(playFabId) {
    if (!currentGuildInfo || !currentGuildInfo.guildId) {
        alert('ギルド情報が取得できません');
        return;
    }

    try {
        const data = await callApiWithLoader('/api/get-guild-members', {
            playFabId,
            guildId: currentGuildInfo.guildId
        });

        if (data && data.members) {
            renderGuildMembers(data.members);
            document.getElementById('guildMembersModal').style.display = 'flex';
        } else {
            alert('メンバー情報の取得に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error loading guild members:', error);
        alert('エラーが発生しました');
    }
}

/**
 * ギルドメンバーリストをレンダリング
 * @param {Array} members - メンバーリスト
 */
function renderGuildMembers(members) {
    const container = document.getElementById('guildMembersList');
    container.innerHTML = '';

    if (!members || members.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-sub);">メンバーがいません</p>';
        return;
    }

    members.forEach((member) => {
        const memberDiv = document.createElement('div');
        memberDiv.style.cssText = 'background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = member.displayName || 'Unknown';
        nameSpan.style.cssText = 'font-weight: bold; color: var(--text-main);';

        const roleSpan = document.createElement('span');
        roleSpan.textContent = member.role || 'メンバー';
        roleSpan.style.cssText = 'font-size: 12px; color: var(--text-sub);';

        memberDiv.appendChild(nameSpan);
        memberDiv.appendChild(roleSpan);
        container.appendChild(memberDiv);
    });
}

/**
 * ギルドチャットを表示
 * @param {string} playFabId - プレイヤーID
 */
export async function showGuildChat(playFabId) {
    if (!currentGuildInfo || !currentGuildInfo.guildId) {
        alert('ギルド情報が取得できません');
        return;
    }

    try {
        // チャットメッセージを取得
        const data = await callApiWithLoader('/api/get-guild-chat', {
            playFabId,
            guildId: currentGuildInfo.guildId
        }, { isSilent: true });

        if (data && data.messages) {
            renderGuildChat(data.messages);
            document.getElementById('guildChatModal').style.display = 'flex';

            // ポーリングを開始（5秒ごとに更新）
            startChatPolling(playFabId);
        } else {
            alert('チャットメッセージの取得に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error loading guild chat:', error);
        alert('エラーが発生しました');
    }
}

/**
 * チャットメッセージをレンダリング
 * @param {Array} messages - メッセージリスト
 */
function renderGuildChat(messages) {
    const container = document.getElementById('guildChatMessages');
    container.innerHTML = '';

    if (!messages || messages.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-sub);">メッセージがありません</p>';
        return;
    }

    messages.forEach((msg) => {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = 'margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px;';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = msg.displayName || 'Unknown';
        nameSpan.style.cssText = 'font-weight: bold; color: var(--accent-color); font-size: 14px;';

        const timeSpan = document.createElement('span');
        const msgTime = new Date(msg.timestamp);
        timeSpan.textContent = msgTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        timeSpan.style.cssText = 'font-size: 11px; color: var(--text-sub);';

        header.appendChild(nameSpan);
        header.appendChild(timeSpan);

        const contentDiv = document.createElement('div');
        contentDiv.textContent = msg.message;
        contentDiv.style.cssText = 'color: var(--text-main); font-size: 14px; word-wrap: break-word;';

        messageDiv.appendChild(header);
        messageDiv.appendChild(contentDiv);
        container.appendChild(messageDiv);
    });

    // 最下部にスクロール
    container.scrollTop = container.scrollHeight;
}

/**
 * チャットポーリングを開始
 * @param {string} playFabId - プレイヤーID
 */
function startChatPolling(playFabId) {
    // 既存のポーリングをクリア
    if (guildChatPollingInterval) {
        clearInterval(guildChatPollingInterval);
    }

    // 5秒ごとにチャットを更新
    guildChatPollingInterval = setInterval(async () => {
        if (document.getElementById('guildChatModal').style.display !== 'flex') {
            clearInterval(guildChatPollingInterval);
            guildChatPollingInterval = null;
            return;
        }

        try {
            const data = await callApiWithLoader('/api/get-guild-chat', {
                playFabId,
                guildId: currentGuildInfo.guildId
            }, { isSilent: true });

            if (data && data.messages) {
                renderGuildChat(data.messages);
            }
        } catch (error) {
            console.error('[Guild] Error polling chat:', error);
        }
    }, 5000);
}

/**
 * チャットメッセージを送信
 * @param {string} playFabId - プレイヤーID
 */
export async function sendGuildChatMessage(playFabId) {
    if (!currentGuildInfo || !currentGuildInfo.guildId) {
        alert('ギルド情報が取得できません');
        return;
    }

    const input = document.getElementById('guildChatInput');
    const message = input.value.trim();

    if (message.length === 0) {
        return;
    }

    try {
        const data = await callApiWithLoader('/api/send-guild-chat', {
            playFabId,
            guildId: currentGuildInfo.guildId,
            message: message
        });

        if (data && data.success) {
            input.value = '';

            // チャットを再読み込み
            const chatData = await callApiWithLoader('/api/get-guild-chat', {
                playFabId,
                guildId: currentGuildInfo.guildId
            }, { isSilent: true });

            if (chatData && chatData.messages) {
                renderGuildChat(chatData.messages);
            }
        } else {
            alert(data?.error || 'メッセージの送信に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error sending chat message:', error);
        alert('エラーが発生しました');
    }
}

/**
 * ギルド倉庫を表示
 * @param {string} playFabId - プレイヤーID
 */
export async function showGuildWarehouse(playFabId) {
    if (!currentGuildInfo || !currentGuildInfo.guildId) {
        alert('ギルド情報が取得できません');
        return;
    }

    try {
        const data = await callApiWithLoader('/api/get-guild-warehouse', {
            playFabId,
            guildId: currentGuildInfo.guildId
        });

        if (data) {
            renderGuildWarehouse(data.warehouse, data.treasury);
            document.getElementById('guildWarehouseModal').style.display = 'flex';
        } else {
            alert('ギルド倉庫の取得に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error loading guild warehouse:', error);
        alert('エラーが発生しました');
    }
}

/**
 * ギルド倉庫をレンダリング
 * @param {Array} warehouse - 倉庫アイテムリスト
 * @param {number} treasury - ギルド資金
 */
function renderGuildWarehouse(warehouse, treasury) {
    document.getElementById('warehouseTreasury').textContent = treasury || 0;

    const container = document.getElementById('guildWarehouseList');
    container.innerHTML = '';

    if (!warehouse || warehouse.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-sub);">倉庫は空です</p>';
        return;
    }

    warehouse.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';

        const infoDiv = document.createElement('div');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.itemId;
        nameSpan.style.cssText = 'font-weight: bold; color: var(--text-main); display: block;';

        const donatedSpan = document.createElement('span');
        donatedSpan.textContent = `寄付者: ${item.donatedBy}`;
        donatedSpan.style.cssText = 'font-size: 12px; color: var(--text-sub);';

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(donatedSpan);

        const withdrawBtn = document.createElement('button');
        withdrawBtn.textContent = '引き出す';
        withdrawBtn.style.cssText = 'padding: 8px 16px; background: var(--hp-color);';
        withdrawBtn.onclick = () => withdrawFromWarehouse(window.myPlayFabId, index);

        itemDiv.appendChild(infoDiv);
        itemDiv.appendChild(withdrawBtn);
        container.appendChild(itemDiv);
    });
}

/**
 * ギルド倉庫からアイテムを引き出す
 * @param {string} playFabId - プレイヤーID
 * @param {number} warehouseIndex - 倉庫インデックス
 */
async function withdrawFromWarehouse(playFabId, warehouseIndex) {
    if (!confirm('このアイテムを引き出しますか？')) {
        return;
    }

    try {
        const data = await callApiWithLoader('/api/withdraw-from-guild-warehouse', {
            playFabId,
            guildId: currentGuildInfo.guildId,
            warehouseIndex: warehouseIndex
        });

        if (data && data.success) {
            showMessage('アイテムを引き出しました');
            // 倉庫を再読み込み
            showGuildWarehouse(playFabId);
        } else {
            alert(data?.error || 'アイテムの引き出しに失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error withdrawing from warehouse:', error);
        alert('エラーが発生しました');
    }
}

/**
 * 加入申請管理を表示（リーダー用）
 * @param {string} playFabId - プレイヤーID
 */
export async function showGuildApplications(playFabId) {
    if (!currentGuildInfo || !currentGuildInfo.guildId) {
        alert('ギルド情報が取得できません');
        return;
    }

    try {
        const data = await callApiWithLoader('/api/get-guild-applications', {
            playFabId,
            guildId: currentGuildInfo.guildId
        });

        if (data && data.applications) {
            renderGuildApplications(data.applications, playFabId);
            document.getElementById('guildApplicationsModal').style.display = 'flex';
        } else {
            alert('加入申請の取得に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error loading guild applications:', error);
        alert('エラーが発生しました');
    }
}

/**
 * 加入申請リストをレンダリング
 * @param {Array} applications - 申請リスト
 * @param {string} playFabId - プレイヤーID
 */
function renderGuildApplications(applications, playFabId) {
    const container = document.getElementById('guildApplicationsList');
    container.innerHTML = '';

    if (!applications || applications.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-sub);">加入申請はありません</p>';
        return;
    }

    applications.forEach((app) => {
        const appDiv = document.createElement('div');
        appDiv.style.cssText = 'background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = app.displayName || 'Unknown';
        nameSpan.style.cssText = 'font-weight: bold; color: var(--text-main); display: block; margin-bottom: 8px;';

        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

        const approveBtn = document.createElement('button');
        approveBtn.textContent = '✓ 承認';
        approveBtn.style.cssText = 'background: var(--hp-color);';
        approveBtn.onclick = () => approveApplication(playFabId, app.playFabId);

        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = '✗ 拒否';
        rejectBtn.style.cssText = 'background: var(--danger-color);';
        rejectBtn.onclick = () => rejectApplication(playFabId, app.playFabId);

        buttonsDiv.appendChild(approveBtn);
        buttonsDiv.appendChild(rejectBtn);

        appDiv.appendChild(nameSpan);
        appDiv.appendChild(buttonsDiv);
        container.appendChild(appDiv);
    });
}

/**
 * 加入申請を承認
 * @param {string} playFabId - プレイヤーID
 * @param {string} applicantId - 申請者ID
 */
async function approveApplication(playFabId, applicantId) {
    try {
        const data = await callApiWithLoader('/api/approve-guild-application', {
            playFabId,
            guildId: currentGuildInfo.guildId,
            applicantId: applicantId
        });

        if (data && data.success) {
            showMessage('加入申請を承認しました');
            // 申請リストを再読み込み
            showGuildApplications(playFabId);
            // ギルド情報も再読み込み
            await loadGuildInfo(playFabId);
        } else {
            alert(data?.error || '加入申請の承認に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error approving application:', error);
        alert('エラーが発生しました');
    }
}

/**
 * 加入申請を拒否
 * @param {string} playFabId - プレイヤーID
 * @param {string} applicantId - 申請者ID
 */
async function rejectApplication(playFabId, applicantId) {
    if (!confirm('この加入申請を拒否しますか？')) {
        return;
    }

    try {
        const data = await callApiWithLoader('/api/reject-guild-application', {
            playFabId,
            guildId: currentGuildInfo.guildId,
            applicantId: applicantId
        });

        if (data && data.success) {
            showMessage('加入申請を拒否しました');
            // 申請リストを再読み込み
            showGuildApplications(playFabId);
            // ギルド情報も再読み込み
            await loadGuildInfo(playFabId);
        } else {
            alert(data?.error || '加入申請の拒否に失敗しました');
        }
    } catch (error) {
        console.error('[Guild] Error rejecting application:', error);
        alert('エラーが発生しました');
    }
}

/**
 * メッセージを表示（簡易版）
 * @param {string} message - メッセージ
 */
function showMessage(message) {
    // 既存のshowMessage関数があればそれを使用、なければアラート
    if (window.showMessage && typeof window.showMessage === 'function') {
        window.showMessage(message);
    } else {
        alert(message);
    }
}
