// c:/Users/ikeda/my-liff-app/public/js/nationKing.js

import {
    getNationKingPage,
    setNationAnnouncement,
    setNationGrantMultiplier,
    grantPs,
    transferKing,
    exileKing
} from './playfabClient.js';
import { showRpgMessage, rpgSay } from './rpgMessages.js';

let _isKing = false;
let _lastPageData = null;

function _setMessage(text, isError = false) {
    const el = document.getElementById('kingPageMessage');
    if (!el) return;
    el.style.color = isError ? 'var(--danger-color)' : 'var(--accent-color)';
    el.innerText = text || '';
}

function _formatEpochMs(ms) {
    if (!ms) return '';
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return '';
    }
}

function _grantPreview(amount, multiplier) {
    const gross = Math.max(0, Math.floor(Number(amount) || 0));
    const multi = Math.max(0, Number(multiplier) || 0);
    const grant = Math.floor(gross * 0.1 * multi);
    return { gross, grant, multiplier: multi };
}

function _extractErrorMessage(error, fallback = '付与に失敗しました。') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    return error.message || error.errorMessage || fallback;
}

async function _scanQrValue() {
    if (!window.liff) throw new Error('LIFF が初期化されていません。');
    if (typeof window.liff.scanCodeV2 === 'function') {
        const r = await window.liff.scanCodeV2();
        return r && r.value ? String(r.value).trim() : '';
    }
    if (typeof window.liff.scanCode === 'function') {
        const r = await window.liff.scanCode();
        return r && r.value ? String(r.value).trim() : '';
    }
    throw new Error('この環境では QR 読み取り（scanCode）が利用できません。');
}

export function isKing() {
    return _isKing;
}

export async function refreshKingNav(playFabId) {
    const nav = document.getElementById('navKing');
    if (!nav) return false;

    const data = await getNationKingPage(playFabId, { isSilent: true });
    _isKing = !!data;
    nav.style.display = _isKing ? '' : 'none';
    return _isKing;
}

export async function loadKingPage(playFabId) {
    _setMessage('');

    const data = await getNationKingPage(playFabId);
    if (!data) return;
    _lastPageData = data;

    const currentEl = document.getElementById('kingAnnouncementCurrent');
    const metaEl = document.getElementById('kingAnnouncementMeta');
    const inputEl = document.getElementById('kingAnnouncementInput');
    const grantMultiplierInputEl = document.getElementById('kingGrantMultiplierInput');
    const treasuryEl = document.getElementById('kingTreasuryInfo');
    const previewEl = document.getElementById('kingGrantPreview');
    const grantAmountEl = document.getElementById('kingGrantAmount');

    if (currentEl) currentEl.innerText = (data.announcement && data.announcement.message) ? data.announcement.message : '(未設定)';
    if (metaEl) {
        const updatedAt = (data.announcement && data.announcement.updatedAt) ? _formatEpochMs(data.announcement.updatedAt) : '';
        const memberCount = (typeof data.memberCount === 'number') ? ` / メンバー数: ${data.memberCount}` : '';
        metaEl.innerText = updatedAt ? `更新: ${updatedAt}${memberCount}` : (memberCount ? memberCount.trim() : '');
    }
    if (inputEl) inputEl.value = (data.announcement && data.announcement.message) ? data.announcement.message : '';

    if (grantMultiplierInputEl) {
        const multiplier = Number.isFinite(Number(data.grantMultiplier)) ? Number(data.grantMultiplier) : 1;
        grantMultiplierInputEl.value = String(multiplier);
    }
    if (treasuryEl) {
        const treasuryPs = (typeof data.treasuryPs === 'number') ? data.treasuryPs : 0;
        treasuryEl.innerText = `国庫: ${treasuryPs} Ps`;
    }
    if (previewEl && grantAmountEl) {
        const p = _grantPreview(grantAmountEl.value, data.grantMultiplier);
        previewEl.innerText = p.gross > 0 ? `受取人: ${p.grant} Ps / 国庫: ${p.gross} Ps` : '';
    }

    _wireHandlers(playFabId);
}

let _wired = false;
function _wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const saveBtn = document.getElementById('btnKingSaveAnnouncement');
    const reloadBtn = document.getElementById('btnKingReload');
    const reloadBtn2 = document.getElementById('btnKingReload2');
    const inputEl = document.getElementById('kingAnnouncementInput');
    const grantMultiplierSaveBtn = document.getElementById('btnKingSetGrantMultiplier');
    const grantMultiplierInputEl = document.getElementById('kingGrantMultiplierInput');
    const grantReceiverEl = document.getElementById('kingGrantReceiverId');
    const grantAmountEl = document.getElementById('kingGrantAmount');
    const grantBtn = document.getElementById('btnKingGrantPs');
    const scanReceiverBtn = document.getElementById('btnKingScanReceiver');
    const clearReceiverBtn = document.getElementById('btnKingClearReceiver');
    const transferTargetEl = document.getElementById('kingTransferTargetId');
    const scanTransferBtn = document.getElementById('btnKingScanTransferTarget');
    const transferBtn = document.getElementById('btnKingTransfer');
    const exileTargetEl = document.getElementById('kingExileTargetId');
    const scanExileBtn = document.getElementById('btnKingScanExileTarget');
    const exileBtn = document.getElementById('btnKingExile');
    const previewEl = document.getElementById('kingGrantPreview');

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const message = inputEl ? String(inputEl.value || '') : '';
            const result = await setNationAnnouncement(playFabId, message);
            if (result) {
                _setMessage('告知を更新しました。');
                await loadKingPage(playFabId);
            }
        });
    }

    if (reloadBtn) {
        reloadBtn.addEventListener('click', async () => {
            await loadKingPage(playFabId);
        });
    }

    if (reloadBtn2) {
        reloadBtn2.addEventListener('click', async () => {
            await loadKingPage(playFabId);
        });
    }

    if (grantMultiplierSaveBtn) {
        grantMultiplierSaveBtn.addEventListener('click', async () => {
            const raw = grantMultiplierInputEl ? grantMultiplierInputEl.value : '1';
            const grantMultiplier = Number(raw);
            const result = await setNationGrantMultiplier(playFabId, grantMultiplier);
            if (result) {
                _setMessage('付与倍率を保存しました。');
                await loadKingPage(playFabId);
            }
        });
    }

    if (grantAmountEl && previewEl) {
        grantAmountEl.addEventListener('input', () => {
            const multiplier = _lastPageData && Number.isFinite(Number(_lastPageData.grantMultiplier))
                ? Number(_lastPageData.grantMultiplier)
                : 1;
            const p = _grantPreview(grantAmountEl.value, multiplier);
            previewEl.innerText = p.gross > 0 ? `受取人: ${p.grant} Ps / 国庫: ${p.gross} Ps` : '';
        });
    }

    if (scanReceiverBtn && grantReceiverEl) {
        scanReceiverBtn.addEventListener('click', async () => {
            try {
                const value = await _scanQrValue();
                if (value) grantReceiverEl.value = value;
            } catch (e) {
                _setMessage(e.message || String(e), true);
            }
        });
    }

    if (clearReceiverBtn && grantReceiverEl) {
        clearReceiverBtn.addEventListener('click', () => {
            grantReceiverEl.value = '';
        });
    }

    if (grantBtn) {
        grantBtn.addEventListener('click', async () => {
            const receiverPlayFabId = grantReceiverEl ? String(grantReceiverEl.value || '').trim() : '';
            const amount = grantAmountEl ? Number(grantAmountEl.value) : 0;
            if (!receiverPlayFabId) {
                _setMessage('受取人PlayFabIdが空です。', true);
                return;
            }
            if (!amount || amount <= 0) {
                _setMessage('付与総額は1以上を入力してください。', true);
                return;
            }
            if (!confirm(`¥${Math.floor(amount)} を受領し、受取人に PS を付与します。実行しますか？`)) return;

            const nextAmount = Math.floor(amount);
            const previousLabel = grantBtn.innerText;
            grantBtn.disabled = true;
            grantBtn.innerText = '処理中...';
            _setMessage('');
            try {
                const result = await grantPs(playFabId, receiverPlayFabId, nextAmount);
                if (result) {
                    const baseMessage = `付与しました（受取: ${result.grantAmount} Ps / 国庫: ${result.receivedAmount} Ps）。`;
                    if (result.treasuryUpdated === false) {
                        _setMessage(`${baseMessage} 国庫更新に失敗しました: ${result.treasuryError || 'Unknown error'}`, true);
                    } else {
                        _setMessage(baseMessage);
                    }
                    if (grantAmountEl) {
                        grantAmountEl.value = '0';
                    }
                    if (previewEl) {
                        previewEl.innerText = '';
                    }
                    await loadKingPage(playFabId);
                }
            } catch (error) {
                _setMessage(_extractErrorMessage(error), true);
            } finally {
                grantBtn.disabled = false;
                grantBtn.innerText = previousLabel;
            }
        });
    }

    if (scanTransferBtn && transferTargetEl) {
        scanTransferBtn.addEventListener('click', async () => {
            try {
                const value = await _scanQrValue();
                if (value) transferTargetEl.value = value;
            } catch (e) {
                _setMessage(e.message || String(e), true);
            }
        });
    }

    if (transferBtn) {
        transferBtn.addEventListener('click', async () => {
            const newKingPlayFabId = transferTargetEl ? String(transferTargetEl.value || '').trim() : '';
            if (!newKingPlayFabId) {
                _setMessage('次の王のPlayFabIdが空です。', true);
                return;
            }
            if (!confirm(`本当に王を ${newKingPlayFabId} に譲渡しますか？（取り消し不可）`)) return;

            const result = await transferKing(playFabId, newKingPlayFabId);
            if (result) {
                _setMessage('王を譲渡しました。');
                _isKing = false;
                const nav = document.getElementById('navKing');
                if (nav) nav.style.display = 'none';
            }
        });
    }

    if (scanExileBtn && exileTargetEl) {
        scanExileBtn.addEventListener('click', async () => {
            try {
                const value = await _scanQrValue();
                if (value) exileTargetEl.value = value;
            } catch (e) {
                _setMessage(e.message || String(e), true);
            }
        });
    }

    if (exileBtn) {
        exileBtn.addEventListener('click', async () => {
            const targetPlayFabId = exileTargetEl ? String(exileTargetEl.value || '').trim() : '';
            if (!targetPlayFabId) {
                _setMessage('Target PlayFabId is required.', true);
                return;
            }
            if (!confirm(`Proceed exile?\nTarget: ${targetPlayFabId}\nOwned islands will be removed.`)) return;

            const result = await exileKing(playFabId, targetPlayFabId);
            if (result) {
                const transferred = typeof result.transferredIslands === 'number' ? ` / islands: ${result.transferredIslands}` : '';
                _setMessage(`Exile completed.${transferred}`);
                showRpgMessage(rpgSay.exileDone());
            }
        });
    }
}
