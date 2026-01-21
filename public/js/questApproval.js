import { approveTroyQuest } from './playfabClient.js';
import { showRpgMessage } from './rpgMessages.js';

let _wired = false;

function setApprovalMessage(text, isError = false) {
    const el = document.getElementById('questApproveMessage');
    if (!el) return;
    el.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    el.textContent = text || '';
}

async function scanQrValue() {
    if (!window.liff) throw new Error('LIFF が初期化されていません。');
    if (typeof window.liff.scanCodeV2 === 'function') {
        const result = await window.liff.scanCodeV2();
        return result && result.value ? String(result.value).trim() : '';
    }
    if (typeof window.liff.scanCode === 'function') {
        const result = await window.liff.scanCode();
        return result && result.value ? String(result.value).trim() : '';
    }
    throw new Error('この環境では QR 読み取りが利用できません。');
}

function wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const input = document.getElementById('questApproveQrValue');
    const scanBtn = document.getElementById('btnScanQuestApproval');
    const approveBtn = document.getElementById('btnApproveQuest');

    if (scanBtn && input) {
        scanBtn.addEventListener('click', async () => {
            try {
                const value = await scanQrValue();
                if (value) input.value = value;
            } catch (error) {
                const msg = error?.message || String(error);
                setApprovalMessage(msg, true);
                showRpgMessage(msg);
            }
        });
    }

    if (approveBtn && input) {
        approveBtn.addEventListener('click', async () => {
            const qrValue = String(input.value || '').trim();
            if (!qrValue) {
                setApprovalMessage('QRコードの値が空です。', true);
                return;
            }
            approveBtn.disabled = true;
            const previousLabel = approveBtn.textContent;
            approveBtn.textContent = '承認中...';
            setApprovalMessage('');
            try {
                const result = await approveTroyQuest(playFabId, qrValue);
                if (result?.success) {
                    const rewardLabel = result?.rewardLabel ? `報酬: ${result.rewardLabel}` : '承認しました。';
                    setApprovalMessage(rewardLabel);
                    showRpgMessage(rewardLabel);
                } else {
                    const errorText = result?.error || '承認に失敗しました。';
                    setApprovalMessage(errorText, true);
                }
            } catch (error) {
                const msg = error?.message || String(error);
                setApprovalMessage(msg, true);
            } finally {
                approveBtn.disabled = false;
                approveBtn.textContent = previousLabel;
            }
        });
    }
}

export async function loadQuestApproval(playFabId) {
    if (!playFabId) return;
    wireHandlers(playFabId);
}
