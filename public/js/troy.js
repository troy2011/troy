// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    leaveTroy
} from './playfabClient.js';

let _wired = false;
let _pollTimer = null;
let _lastStatus = null;

const TROY_GACHA_LABELS = {
    sword: '剣',
    axe: '斧',
    spear: '槍',
    staff: '杖',
    gun: '銃(弓)',
    helmet: '兜',
    shield: '盾',
    item: '道具'
};

const TROY_QUESTS = [
    { game: 'ビリヤード', name: '精密ショット', detail: '9ボールでノーミス勝利', gachaType: 'sword' },
    { game: 'ビリヤード', name: '重戦車ブレイク', detail: '8ボールで3連続ブレイク成功', gachaType: 'axe' },
    { game: 'ビリヤード', name: '技巧の連鎖', detail: 'ボーラードで120点以上', gachaType: 'spear' },
    { game: 'カラオケ', name: '音の射抜き', detail: 'シングルで90点以上', gachaType: 'gun' },
    { game: 'カラオケ', name: '響きの護符', detail: 'デュエットでハモリ判定S', gachaType: 'helmet' },
    { game: 'ダーツ', name: '集中の一投', detail: 'カウントアップで450点以上', gachaType: 'shield' },
    { game: 'ダーツ', name: 'ゼロワン猛追', detail: '01を15ラウンド以内でクリア', gachaType: 'spear' },
    { game: 'ダーツ', name: '陣地制圧', detail: 'クリケットで全クローズ達成', gachaType: 'staff' },
    { game: 'ダーツ', name: '変化球', detail: 'その他ルールで連勝', gachaType: 'item' },
    { game: 'トランプ', name: '王の一手', detail: 'ポーカーでフラッシュ成立', gachaType: 'sword' },
    { game: 'トランプ', name: '黒の祝福', detail: 'ブラックジャックで21ジャスト', gachaType: 'helmet' },
    { game: 'トランプ', name: '富の凱旋', detail: '大富豪で2連勝', gachaType: 'axe' },
    { game: 'その他', name: '黒ひげ回避', detail: '黒ひげで王冠を回避', gachaType: 'shield' },
    { game: 'その他', name: '連勝街道', detail: 'ミニゲームで3連勝', gachaType: 'item' },
    { game: 'その他', name: '盤上の知恵', detail: 'ボードゲームでノーミス勝利', gachaType: 'staff' }
];

function normalizeGachaType(type) {
    if (!type) return null;
    const key = String(type).toLowerCase();
    return TROY_GACHA_LABELS[key] ? key : null;
}

export function getTroyQuestsByGachaType(type) {
    const key = normalizeGachaType(type);
    if (!key) return [];
    return TROY_QUESTS.filter((quest) => quest.gachaType === key);
}

function renderQuestList(list) {
    const container = document.getElementById('troyQuestList');
    if (!container) return;
    container.innerHTML = '';
    list.forEach((quest) => {
        const card = document.createElement('div');
        card.className = 'troy-quest-card';
        card.dataset.gachaType = quest.gachaType;

        const game = document.createElement('div');
        game.className = 'troy-quest-game';
        game.textContent = quest.game;

        const name = document.createElement('div');
        name.className = 'troy-quest-name';
        name.textContent = quest.name;

        const detail = document.createElement('div');
        detail.className = 'troy-quest-detail';
        detail.textContent = quest.detail;

        const gacha = document.createElement('div');
        gacha.className = 'troy-quest-gacha';
        const label = TROY_GACHA_LABELS[quest.gachaType] || quest.gachaType;
        gacha.textContent = `ガチャ: ${label}`;

        card.appendChild(game);
        card.appendChild(name);
        card.appendChild(detail);
        card.appendChild(gacha);
        container.appendChild(card);
    });
}

function getTroyElements() {
    return {
        badge: document.getElementById('troyOpenBadge'),
        section: document.getElementById('troyEntrySection'),
        list: document.getElementById('troyEntryList'),
        empty: document.getElementById('troyEntryEmpty'),
        joinBtn: document.getElementById('btnTroyJoin'),
        leaveBtn: document.getElementById('btnTroyLeave')
    };
}

function getDisplayName() {
    return window.myPlayFabDisplayName || window.myLineProfile?.displayName || window.myPlayFabId || 'Player';
}

function renderEntryList(members) {
    const { list, empty } = getTroyElements();
    if (!list || !empty) return;
    list.innerHTML = '';
    const entries = Array.isArray(members) ? members : [];
    if (entries.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    entries.forEach((member) => {
        const row = document.createElement('div');
        row.className = 'troy-entry-item';
        const name = document.createElement('b');
        name.textContent = member.displayName || member.playFabId || 'Player';
        const meta = document.createElement('span');
        meta.textContent = member.joinedAt ? new Date(member.joinedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
        row.appendChild(name);
        row.appendChild(meta);
        list.appendChild(row);
    });
}

function renderStatus(data) {
    _lastStatus = data;
    const { badge, section } = getTroyElements();
    if (badge) {
        const isOpen = !!data?.isOpen;
        badge.textContent = isOpen ? 'OPEN' : 'CLOSE';
        badge.classList.toggle('open', isOpen);
    }
    if (section) {
        section.style.display = data?.isOpen ? 'block' : 'none';
    }
    renderEntryList(data?.members);
}

async function refreshStatus(playFabId, options = {}) {
    if (!playFabId) return;
    const data = await getTroyStatus(playFabId, options);
    if (data) renderStatus(data);
}

function wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const { joinBtn, leaveBtn } = getTroyElements();
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            const name = getDisplayName();
            const result = await joinTroy(playFabId, name);
            if (result) {
                await refreshStatus(playFabId, { isSilent: true });
            }
        });
    }

    if (leaveBtn) {
        leaveBtn.addEventListener('click', async () => {
            const result = await leaveTroy(playFabId);
            if (result) {
                await refreshStatus(playFabId, { isSilent: true });
            }
        });
    }
}

function startPolling(playFabId) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
        const tab = document.getElementById('tabContentTroy');
        if (!tab || tab.style.display === 'none') return;
        refreshStatus(playFabId, { isSilent: true });
    }, 5000);
}

export async function loadTroyPage(playFabId) {
    wireHandlers(playFabId);
    renderQuestList(TROY_QUESTS);
    await refreshStatus(playFabId);
    startPolling(playFabId);
}
