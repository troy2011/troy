// c:/Users/ikeda/my-liff-app/public/js/nationKing.js

import {
    getNationKingPage,
    setNationAnnouncement,
    setNationTaxRate,
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

function _taxPreview(amount, taxRateBps) {
    const gross = Math.max(0, Math.floor(Number(amount) || 0));
    const bps = Math.max(0, Math.min(5000, Math.floor(Number(taxRateBps) || 0)));
    const tax = Math.floor((gross * bps) / 10000);
    const net = Math.max(0, gross - tax);
    return { gross, tax, net, bps };
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
    const taxInputEl = document.getElementById('kingTaxRateInput');
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

    if (taxInputEl) {
        const bps = typeof data.taxRateBps === 'number' ? data.taxRateBps : 0;
        taxInputEl.value = String((bps / 100).toFixed(1)).replace(/\.0$/, '');
    }
    if (treasuryEl) {
        const taxPercent = (typeof data.taxRateBps === 'number') ? (data.taxRateBps / 100) : 0;
        const treasuryPs = (typeof data.treasuryPs === 'number') ? data.treasuryPs : 0;
        treasuryEl.innerText = `現在の税率: ${taxPercent}% / 国庫: ${treasuryPs} Ps`;
    }
    if (previewEl && grantAmountEl) {
        const p = _taxPreview(grantAmountEl.value, data.taxRateBps);
        previewEl.innerText = p.gross > 0 ? `受取人: ${p.net} Ps / 税金: ${p.tax} Ps（総額: ${p.gross} Ps）` : '';
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
    const taxSaveBtn = document.getElementById('btnKingSetTaxRate');
    const taxInputEl = document.getElementById('kingTaxRateInput');
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

    if (taxSaveBtn) {
        taxSaveBtn.addEventListener('click', async () => {
            const raw = taxInputEl ? taxInputEl.value : '0';
            const taxRatePercent = Number(raw);
            const result = await setNationTaxRate(playFabId, taxRatePercent);
            if (result) {
                _setMessage('税率を保存しました。');
                await loadKingPage(playFabId);
            }
        });
    }

    if (grantAmountEl && previewEl) {
        grantAmountEl.addEventListener('input', () => {
            const bps = _lastPageData && typeof _lastPageData.taxRateBps === 'number' ? _lastPageData.taxRateBps : 0;
            const p = _taxPreview(grantAmountEl.value, bps);
            previewEl.innerText = p.gross > 0 ? `受取人: ${p.net} Ps / 税金: ${p.tax} Ps（総額: ${p.gross} Ps）` : '';
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
            if (!confirm(`王の所持金から ${Math.floor(amount)} Ps を支払い、受取人に付与します。実行しますか？`)) return;

            const result = await grantPs(playFabId, receiverPlayFabId, Math.floor(amount));
            if (result) {
                _setMessage(`付与しました（受取: ${result.netAmount} Ps / 税: ${result.taxAmount} Ps）。`);
                await loadKingPage(playFabId);
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
