// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    leaveTroy
} from './playfabClient.js';

let _wired = false;
let _questWired = false;
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

const DIFFICULTY_LABELS = {
    easy: '易',
    normal: '普',
    hard: '難'
};

const TROY_QUESTS = [
    {
        game: 'ビリヤード',
        name: '精密ショット',
        detail: '9ボールでノーミス勝利',
        gachaType: 'sword',
        questKey: 'billiard-9',
        difficulty: 'normal',
        flavor: '船長の狙いを一撃で示せ。'
    },
    {
        game: 'ビリヤード',
        name: '白波ブレイク',
        detail: '9ボールでブレイク成功を2連続',
        gachaType: 'axe',
        questKey: 'billiard-9',
        difficulty: 'easy',
        flavor: '荒波を割るように最初の一打を決めろ。'
    },
    {
        game: 'ビリヤード',
        name: '狙撃の一閃',
        detail: '9ボールでロングショット3回成功',
        gachaType: 'gun',
        questKey: 'billiard-9',
        difficulty: 'hard',
        flavor: '遠距離でも迷わぬ砲撃が海賊の誉れ。'
    },
    {
        game: 'ビリヤード',
        name: '舵取りセーフ',
        detail: '9ボールでセーフティ成功を2回',
        gachaType: 'shield',
        questKey: 'billiard-9',
        difficulty: 'easy',
        flavor: '防御の構えも勝利の航路。'
    },
    {
        game: 'ビリヤード',
        name: '重戦車ブレイク',
        detail: '8ボールで3連続ブレイク成功',
        gachaType: 'axe',
        questKey: 'billiard-8',
        difficulty: 'normal',
        flavor: '港を揺らす一撃で流れを奪え。'
    },
    {
        game: 'ビリヤード',
        name: '船底ポケット',
        detail: '8ボールでバンクショット2回成功',
        gachaType: 'spear',
        questKey: 'billiard-8',
        difficulty: 'easy',
        flavor: '槍のように角度を突け。'
    },
    {
        game: 'ビリヤード',
        name: '砲門ロック',
        detail: '8ボールで終盤の8番を一発沈め',
        gachaType: 'helmet',
        questKey: 'billiard-8',
        difficulty: 'normal',
        flavor: '兜を締め、決定打を逃すな。'
    },
    {
        game: 'ビリヤード',
        name: '逆転の連鎖',
        detail: '8ボールで残り1球から逆転勝利',
        gachaType: 'sword',
        questKey: 'billiard-8',
        difficulty: 'hard',
        flavor: '土壇場でも刃は鈍らない。'
    },
    {
        game: 'ビリヤード',
        name: '技巧の連鎖',
        detail: 'ボーラードで120点以上',
        gachaType: 'spear',
        questKey: 'billiard-bowrad',
        difficulty: 'normal',
        flavor: '槍の連撃で点を積み上げろ。'
    },
    {
        game: 'ビリヤード',
        name: '静寂の測定',
        detail: 'ボーラードでミス2回以内',
        gachaType: 'staff',
        questKey: 'billiard-bowrad',
        difficulty: 'normal',
        flavor: '魔導士のように静かに狙いを定める。'
    },
    {
        game: 'ビリヤード',
        name: '霧中の計算',
        detail: 'ボーラードでバンクショット3回成功',
        gachaType: 'item',
        questKey: 'billiard-bowrad',
        difficulty: 'hard',
        flavor: '霧の海でも道具を使いこなせ。'
    },
    {
        game: 'カラオケ',
        name: '音の射抜き',
        detail: 'シングルで90点以上',
        gachaType: 'gun',
        questKey: 'karaoke-single',
        difficulty: 'easy',
        flavor: '歌声は海賊の銃声。'
    },
    {
        game: 'カラオケ',
        name: '波止場の独唱',
        detail: 'シングルで連続高音判定S',
        gachaType: 'staff',
        questKey: 'karaoke-single',
        difficulty: 'normal',
        flavor: '港の灯りに響く魔法の独唱。'
    },
    {
        game: 'カラオケ',
        name: '赤旗ハイトーン',
        detail: 'シングルで95点以上',
        gachaType: 'sword',
        questKey: 'karaoke-single',
        difficulty: 'hard',
        flavor: '高音で赤旗を掲げろ。'
    },
    {
        game: 'カラオケ',
        name: '響きの護符',
        detail: 'デュエットでハモリ判定S',
        gachaType: 'helmet',
        questKey: 'karaoke-duet',
        difficulty: 'easy',
        flavor: '兜に誓った絆の音色。'
    },
    {
        game: 'カラオケ',
        name: '双帆のハーモニー',
        detail: 'デュエットで安定度90%以上',
        gachaType: 'shield',
        questKey: 'karaoke-duet',
        difficulty: 'normal',
        flavor: '盾を合わせて荒波を越えろ。'
    },
    {
        game: 'カラオケ',
        name: '契約の重唱',
        detail: 'デュエットでコンボ30以上',
        gachaType: 'axe',
        questKey: 'karaoke-duet',
        difficulty: 'hard',
        flavor: '斧の重さで契りを刻め。'
    },
    {
        game: 'ダーツ',
        name: '集中の一投',
        detail: 'カウントアップで450点以上',
        gachaType: 'shield',
        questKey: 'darts-countup',
        difficulty: 'easy',
        flavor: '盾の集中で的を守り抜け。'
    },
    {
        game: 'ダーツ',
        name: '風読みの矢',
        detail: 'カウントアップでトリプル3回成功',
        gachaType: 'gun',
        questKey: 'darts-countup',
        difficulty: 'normal',
        flavor: '風を読めば矢は真っ直ぐ飛ぶ。'
    },
    {
        game: 'ダーツ',
        name: '碇のリズム',
        detail: 'カウントアップで連続得点5回',
        gachaType: 'staff',
        questKey: 'darts-countup',
        difficulty: 'easy',
        flavor: '碇の鼓動で狙いを整える。'
    },
    {
        game: 'ダーツ',
        name: '船長の合図',
        detail: 'カウントアップで500点以上',
        gachaType: 'sword',
        questKey: 'darts-countup',
        difficulty: 'hard',
        flavor: '船長の合図で勝負は決まる。'
    },
    {
        game: 'ダーツ',
        name: 'ゼロワン猛追',
        detail: '01を15ラウンド以内でクリア',
        gachaType: 'spear',
        questKey: 'darts-01',
        difficulty: 'normal',
        flavor: '槍のように一直線で追い詰めろ。'
    },
    {
        game: 'ダーツ',
        name: '早駆け帰港',
        detail: '01を10ラウンド以内でクリア',
        gachaType: 'axe',
        questKey: 'darts-01',
        difficulty: 'hard',
        flavor: '斧の一振りで港へ帰れ。'
    },
    {
        game: 'ダーツ',
        name: '独航の一矢',
        detail: '01でダブルフィニッシュ成功',
        gachaType: 'gun',
        questKey: 'darts-01',
        difficulty: 'normal',
        flavor: '孤高の一矢を見せつけろ。'
    },
    {
        game: 'ダーツ',
        name: '陣地制圧',
        detail: 'クリケットで全クローズ達成',
        gachaType: 'staff',
        questKey: 'darts-cricket',
        difficulty: 'normal',
        flavor: '魔導師の陣形で領域を守れ。'
    },
    {
        game: 'ダーツ',
        name: '砦割り三連',
        detail: 'クリケットで3連続クローズ',
        gachaType: 'axe',
        questKey: 'darts-cricket',
        difficulty: 'hard',
        flavor: '斧で砦を割るように攻めろ。'
    },
    {
        game: 'ダーツ',
        name: '盾壁キープ',
        detail: 'クリケットで相手にスコアを与えない',
        gachaType: 'shield',
        questKey: 'darts-cricket',
        difficulty: 'easy',
        flavor: '盾壁を崩さず守り抜け。'
    },
    {
        game: 'ダーツ',
        name: '変化球',
        detail: 'その他ルールで連勝',
        gachaType: 'item',
        questKey: 'darts-other',
        difficulty: 'easy',
        flavor: '道具で勝負の流れを変える。'
    },
    {
        game: 'ダーツ',
        name: '波間の奇襲',
        detail: 'その他ルールでダブル3回成功',
        gachaType: 'spear',
        questKey: 'darts-other',
        difficulty: 'normal',
        flavor: '槍の奇襲で波間を裂け。'
    },
    {
        game: 'ダーツ',
        name: '灯台サイン',
        detail: 'その他ルールでフィニッシュを2連続',
        gachaType: 'helmet',
        questKey: 'darts-other',
        difficulty: 'hard',
        flavor: '灯台の光のように正確に締めろ。'
    },
    {
        game: 'トランプ',
        name: '王の一手',
        detail: 'ポーカーでフラッシュ成立',
        gachaType: 'sword',
        questKey: 'cards-poker',
        difficulty: 'normal',
        flavor: '刃のように鋭い一手を放て。'
    },
    {
        game: 'トランプ',
        name: '密輸のブラフ',
        detail: 'ポーカーでブラフ勝利を2回',
        gachaType: 'item',
        questKey: 'cards-poker',
        difficulty: 'normal',
        flavor: '密輸船のように姿を隠せ。'
    },
    {
        game: 'トランプ',
        name: '船団のレイズ',
        detail: 'ポーカーでレイズ3回成功',
        gachaType: 'axe',
        questKey: 'cards-poker',
        difficulty: 'hard',
        flavor: '船団の勢いで勝負を押し切れ。'
    },
    {
        game: 'トランプ',
        name: '黒の祝福',
        detail: 'ブラックジャックで21ジャスト',
        gachaType: 'helmet',
        questKey: 'cards-blackjack',
        difficulty: 'easy',
        flavor: '兜に宿る幸運を引き寄せろ。'
    },
    {
        game: 'トランプ',
        name: '21の舵',
        detail: 'ブラックジャックで2連勝',
        gachaType: 'shield',
        questKey: 'cards-blackjack',
        difficulty: 'normal',
        flavor: '舵を握るように流れを制す。'
    },
    {
        game: 'トランプ',
        name: '熱風のダブル',
        detail: 'ブラックジャックでダブルダウン成功',
        gachaType: 'gun',
        questKey: 'cards-blackjack',
        difficulty: 'hard',
        flavor: '熱風の中でも引き金を引け。'
    },
    {
        game: 'トランプ',
        name: '富の凱旋',
        detail: '大富豪で2連勝',
        gachaType: 'sword',
        questKey: 'cards-daifugo',
        difficulty: 'normal',
        flavor: '剣の誉れを掲げて凱旋せよ。'
    },
    {
        game: 'トランプ',
        name: '奪回の切り札',
        detail: '大富豪で革命成功',
        gachaType: 'spear',
        questKey: 'cards-daifugo',
        difficulty: 'hard',
        flavor: '槍の一突きで秩序を覆せ。'
    },
    {
        game: 'トランプ',
        name: '王都の税回収',
        detail: '大富豪で上がりを3回達成',
        gachaType: 'item',
        questKey: 'cards-daifugo',
        difficulty: 'easy',
        flavor: '道具を集めて財を築け。'
    },
    {
        game: 'その他',
        name: '盤上の知恵',
        detail: 'ボードゲームでノーミス勝利',
        gachaType: 'staff',
        questKey: 'other-board',
        difficulty: 'normal',
        flavor: '魔導の盤面で知恵を示せ。'
    },
    {
        game: 'その他',
        name: '海図の策略',
        detail: 'ボードゲームで2連勝',
        gachaType: 'helmet',
        questKey: 'other-board',
        difficulty: 'easy',
        flavor: '兜の内で海図を読み解け。'
    },
    {
        game: 'その他',
        name: '港町の防衛戦',
        detail: 'ボードゲームで防衛側勝利',
        gachaType: 'shield',
        questKey: 'other-board',
        difficulty: 'hard',
        flavor: '盾を掲げて港町を守れ。'
    },
    {
        game: 'その他',
        name: '連勝街道',
        detail: 'ミニゲームで3連勝',
        gachaType: 'item',
        questKey: 'other-mini',
        difficulty: 'easy',
        flavor: '道具を手に勝利の道を走れ。'
    },
    {
        game: 'その他',
        name: '砲撃チャレンジ',
        detail: 'ミニゲームで高得点を獲得',
        gachaType: 'gun',
        questKey: 'other-mini',
        difficulty: 'normal',
        flavor: '砲撃の精度で賞賛を得よ。'
    },
    {
        game: 'その他',
        name: '風読み勝負',
        detail: 'ミニゲームで無傷クリア',
        gachaType: 'spear',
        questKey: 'other-mini',
        difficulty: 'hard',
        flavor: '槍先で風を読み勝負に挑め。'
    },
    {
        game: 'その他',
        name: '黒ひげ回避',
        detail: '黒ひげで王冠を回避',
        gachaType: 'helmet',
        questKey: 'other-kurohige',
        difficulty: 'easy',
        flavor: '兜をかぶり運命の刃を避けろ。'
    },
    {
        game: 'その他',
        name: '火薬の覚悟',
        detail: '黒ひげでセーフゾーンを3回通す',
        gachaType: 'staff',
        questKey: 'other-kurohige',
        difficulty: 'normal',
        flavor: '火薬の気配を読んで耐えよ。'
    },
    {
        game: 'その他',
        name: '撤退判断',
        detail: '黒ひげで連続セーフを達成',
        gachaType: 'item',
        questKey: 'other-kurohige',
        difficulty: 'hard',
        flavor: '道具を手に撤退の判断を下せ。'
    }
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
    const quests = Array.isArray(list) ? list : [];
    if (!quests.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-quest-empty';
        empty.textContent = '該当するクエストはありません';
        container.appendChild(empty);
        return;
    }
    quests.forEach((quest, index) => {
        const card = document.createElement('div');
        card.className = 'troy-quest-card is-animated';
        card.dataset.gachaType = quest.gachaType;
        card.style.animationDelay = `${index * 40}ms`;

        const game = document.createElement('div');
        game.className = 'troy-quest-game';
        game.textContent = quest.game;

        const difficulty = document.createElement('div');
        const difficultyKey = quest.difficulty || 'normal';
        const difficultyLabel = DIFFICULTY_LABELS[difficultyKey] || difficultyKey;
        difficulty.className = `troy-quest-difficulty troy-quest-difficulty-${difficultyKey}`;
        difficulty.textContent = `難易度: ${difficultyLabel}`;

        const meta = document.createElement('div');
        meta.className = 'troy-quest-meta';
        meta.appendChild(game);
        meta.appendChild(difficulty);

        const name = document.createElement('div');
        name.className = 'troy-quest-name';
        name.textContent = quest.name;

        const detail = document.createElement('div');
        detail.className = 'troy-quest-detail';
        detail.textContent = quest.detail;

        const flavor = document.createElement('div');
        flavor.className = 'troy-quest-flavor';
        flavor.textContent = quest.flavor || '';

        const gacha = document.createElement('div');
        gacha.className = 'troy-quest-gacha';
        const label = TROY_GACHA_LABELS[quest.gachaType] || quest.gachaType;
        gacha.textContent = `報酬: ${label}`;

        card.appendChild(meta);
        card.appendChild(name);
        card.appendChild(detail);
        if (quest.flavor) {
            card.appendChild(flavor);
        }
        card.appendChild(gacha);
        container.appendChild(card);
    });
}

function updateQuestFilterLabel(text) {
    const filter = document.getElementById('troyQuestFilter');
    if (filter) {
        filter.textContent = text;
    }
}

function getQuestPanelElements() {
    return {
        panel: document.getElementById('troyQuestPanel'),
        title: document.getElementById('troyQuestTitle'),
        close: document.getElementById('troyQuestClose')
    };
}

function closeQuestPanel(items) {
    const { panel, title } = getQuestPanelElements();
    if (panel) panel.classList.remove('active');
    if (title) title.textContent = '未選択';
    updateQuestFilterLabel('クエスト一覧: 未選択');
    renderQuestList([]);
    items.forEach((node) => node.classList.remove('is-active'));
}

function wireQuestFilters() {
    if (_questWired) return;
    _questWired = true;
    const questItems = Array.from(document.querySelectorAll('.troy-menu-subitems li[data-quest-key]'));
    const { panel, title, close } = getQuestPanelElements();
    if (close) {
        close.addEventListener('click', () => closeQuestPanel(questItems));
    }
    if (!questItems.length) return;
    questItems.forEach((item) => {
        item.classList.add('troy-quest-item');
        item.addEventListener('click', () => {
            const key = item.dataset.questKey;
            const label = item.dataset.questLabel || item.textContent.trim();
            const filtered = TROY_QUESTS.filter((quest) => quest.questKey === key);
            questItems.forEach((node) => node.classList.toggle('is-active', node === item));
            if (panel) panel.classList.add('active');
            if (title) title.textContent = label;
            updateQuestFilterLabel(`クエスト一覧: ${label}`);
            renderQuestList(filtered);
        });
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
    wireQuestFilters();
    updateQuestFilterLabel('クエスト一覧: 未選択');
    renderQuestList([]);
    await refreshStatus(playFabId);
    startPolling(playFabId);
}
