// c:/Users/ikeda/my-liff-app/public/js/config.js

// Firebaseの初期化設定
export const firebaseConfig = {
    apiKey: "AIzaSyAIS8rDyfb3xZ5clhDLA2TfoLSfflqiGTQ",
    authDomain: "my-liff-app-ee704.firebaseapp.com",
    databaseURL: "https://my-liff-app-ee704-default-rtdb.firebaseio.com",
    projectId: "my-liff-app-ee704",
    storageBucket: "my-liff-app-ee704.firebasestorage.app",
    messagingSenderId: "258309007800",
    appId: "1:258309007800:web:b37bcaac51dd0e45ba474d"
};

// Express が静的クライアントと API を同じ origin で配信する。
export const API_BASE_URL = '';
window.API_BASE_URL = API_BASE_URL;

// 種族ごとの色定義（16進数カラーコード）
export const RACE_COLORS = {
    'Human': 0xff0000, // 赤
    'Elf': 0x00ff00, // 緑
    'Orc': 0x0000ff, // 青
    'Goblin': 0x808080, // グレー
};

// アバターパーツの位置オフセット
export const AVATAR_PART_OFFSETS = {
    armor: { x: 0, y: -5 },
    handRight: { x: -5, y: 30 },
    handLeft: { x: 28, y: 34 },
    rightHandItem: { x: -18, y: 0 },
    leftHandItem: { x: 15, y: 5 },
    tallWeapon: { y: 5 },
    shield: { x: 0, y: 15 },
    handLeftTwoHanded: { x: 0, y: 35 }
};

export const CURRENCY_EMOJI = {
    PS: 'G',
    RR: '🧨',
    RG: '🪨',
    RY: '🍄',
    RB: '🫙',
    RT: '🪾',
    RS: '🪵'
};

export function formatCurrencyLabel(code) {
    const key = String(code || '').toUpperCase();
    return CURRENCY_EMOJI[key] || key;
}

export const RESOURCE_USAGE_INFO = {
    RR: { short: '舷側砲', detail: '大砲の火薬' },
    RG: { short: '船修理', detail: '船の補修材' },
    RY: { short: 'HP回復', detail: 'HP回復用の薬材' },
    RB: { short: 'MP回復', detail: 'MP回復用のミネラル' },
    RT: { short: '建物材', detail: '建物用の一般建材' },
    RS: { short: '骨材', detail: '竜骨や建築の中核骨材' }
};

export const RESOURCE_SOURCE_INFO = {
    RR: '火山島で採取',
    RG: '岩場島で採取',
    RY: 'キノコ島で採取',
    RB: '湖島で採取',
    RT: '森林島で採取',
    RS: '聖域島で採取'
};

export function getResourceUsageInfo(code) {
    const key = String(code || '').toUpperCase();
    return RESOURCE_USAGE_INFO[key] || { short: '用途未設定', detail: 'まだ用途が設定されていません' };
}

export function getResourceSourceInfo(code) {
    const key = String(code || '').toUpperCase();
    return RESOURCE_SOURCE_INFO[key] || '入手先未設定';
}
