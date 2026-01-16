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

// API base (Render)
export const API_BASE_URL = 'https://troy-xetw.onrender.com';
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
    PS: 'PS',
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
