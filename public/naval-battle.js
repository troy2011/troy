// =====================================================================
// 略奪海戦（同時入力式）
// ホームタブの「略奪に出る」から起動し、操舵不能時に白兵戦へ引き継ぐ。
// =====================================================================
(() => {
'use strict';

const STEERING_MAX = 3;
const INITIAL_DISTANCE = 1;
const BOW_DAMAGE = 1;
const BROADSIDE_DAMAGE = 2;
const LIGHT_BOW_DAMAGE = 0.5;
const LIGHT_BROADSIDE_DAMAGE = 1;
const ASSAULT_DAMAGE = 1;
const MISREAD_DAMAGE = 0;
const RELOAD_TURNS = 1;
const STEERING_STEP = 0.5;
const EVASION_RATE = Object.freeze({
    front: 0.2,
    side: 0.05,
    back: 0,
    assault: 0,
    rudderBonus: 0.15,
    rudderMax: 0.35
});

const PLUNDER_LIMITS = {
    victory: { chips: 30, cargo: 2, exploration: 1 },
    cargoRaid: { chips: 12, cargo: 1, exploration: 1 }
};
const REPAIR_RISK = { chips: 20, cooldownMinutes: 5 };

const FACING_LABEL = {
    front: '正面',
    starboard: '右舷向き',
    port: '左舷向き',
    back: '後ろ向き',
    side: '右舷向き'
};
const SIDE_FACINGS = new Set(['starboard', 'port', 'side']);
const SHIP_FORM_LABEL = {
    boat: 'ボート',
    common: 'ボート',
    explorer: '探索船',
    defender: '防衛船',
    fighter: '戦闘船',
    merchant: '商船',
    guild: '旗艦'
};
const SHIP_FORM_MAX_STEERING = {
    boat: 1,
    common: 1,
    explorer: 2,
    defender: 3,
    fighter: 3,
    merchant: 3,
    guild: 3
};
const SHIP_FORM_WEAPON_CLASS = {
    boat: 'small',
    common: 'small',
    explorer: 'small',
    defender: 'cannon',
    fighter: 'cannon',
    merchant: 'cannon',
    guild: 'cannon'
};
const SHIP_FORM_MODIFIER = {
    boat: { attack: 0, defense: 0, speed: 0, cargo: 0 },
    common: { attack: 0, defense: 0, speed: 0, cargo: 0 },
    explorer: { attack: 0, defense: 0, speed: 1, cargo: 0 },
    defender: { attack: 0, defense: 1, speed: 0, cargo: 0 },
    fighter: { attack: 1, defense: 0, speed: 0, cargo: 0 },
    merchant: { attack: 0, defense: 0, speed: 0, cargo: 2 },
    guild: { attack: 1, defense: 1, speed: 0, cargo: 1 }
};
const ELEMENT_LABEL = {
    fire: '火',
    water: '水',
    wind: '風',
    earth: '地',
    none: '無属性'
};
const ELEMENT_ADVANTAGE = {
    fire: 'wind',
    wind: 'earth',
    earth: 'water',
    water: 'fire'
};
const NAVAL_SHIP_TRAITS = Object.freeze({
    ship_human_explorer: { name: '追い風加速', type: 'rudder-evasion', bonus: 0.2, max: 0.55 },
    ship_elf_explorer: { name: '高度視認', type: 'bow-evasion-pierce' },
    ship_goblin_explorer: { name: '泥沼散布', type: 'reduce-assault-hit', reduce: 0.5 },
    ship_orc_explorer: { name: '岩皮突進', type: 'assault-boost-guard', damageBonus: 0.5, broadsideGuard: 0.5 },
    ship_human_defender: { name: '艦隊防壁', type: 'first-hit-reduce', reduce: 1 },
    ship_elf_defender: { name: '疾風の渦', type: 'broadside-lock-rudder', turns: 1 },
    ship_goblin_defender: { name: '砂嵐ノイズ', type: 'broadside-boost', damageBonus: 0.5 },
    ship_orc_defender: { name: '水中捕捉', type: 'broadside-force-front' },
    ship_human_fighter: { name: '火炎噴射', type: 'bow-boost', damageBonus: 0.5 },
    ship_elf_fighter: { name: '毒ガス空爆', type: 'bow-boost-evasion-pierce', damageBonus: 0.5 },
    ship_goblin_fighter: { name: 'ドリル突撃', type: 'assault-boost', damageBonus: 0.5 },
    ship_orc_fighter: { name: '直撃砲', type: 'bow-boost', damageBonus: 1 },
    ship_human_merchant: { name: '水上滑走', type: 'cannon-evasion', bonus: 0.2, max: 0.45 },
    ship_elf_merchant: { name: '視界縮小', type: 'reduce-bow-hit', reduce: 0.5 },
    ship_goblin_merchant: { name: '水爆設置', type: 'counter-assault-hit', damage: 0.5 },
    ship_orc_merchant: { name: '装甲展開', type: 'assault-cannon-reduce', reduce: 1 }
});

const NAVAL_ARCANA_GEAR = Object.freeze({
    'arcana-0': { equipmentName: '風まかせの予備帆', shipGearName: '風まかせの予備帆', gearPart: 'sail', gearPartLabel: '帆', ultimateName: '風まかせ離脱', roleLabel: '回避', shortDescription: '初回被弾時、1以下の負荷を回避。2以上なら0.5軽減して正面へ戻る。', activationLog: '風まかせの予備帆が風をつかみ、舵を正面へ戻した。', navalEffect: { type: 'fool-evade', evadeMax: 1, reduce: 0.5, setFacing: 'front' } },
    'arcana-1': { equipmentName: '四元素の魔導舵', shipGearName: '四元素の魔導舵', gearPart: 'rudder', gearPartLabel: '舵', ultimateName: '四元素即応', roleLabel: '操舵', shortDescription: '初回の面舵/取舵で発生する読み違い負荷を0にする。', activationLog: '四元素の魔導舵が航路を組み替え、読み違いを打ち消した。', navalEffect: { type: 'cancel-rudder-misread' } },
    'arcana-2': { equipmentName: '深潮の索敵羅針', shipGearName: '深潮の索敵羅針', gearPart: 'compass', gearPartLabel: '羅針盤', arcanaElement: 'water', ultimateName: '深潮看破', roleLabel: '索敵', shortDescription: '開幕に敵の初回防御艤装を1つ無効化する。', activationLog: '深潮の索敵羅針が敵船の守りを読み切った。', navalEffect: { type: 'opening-pierce-defense' } },
    'arcana-3': { equipmentName: '黄金穀倉の船倉', shipGearName: '黄金穀倉の船倉', gearPart: 'hold', gearPartLabel: '船倉', arcanaElement: 'earth', ultimateName: '豊穣補給', roleLabel: '回復', shortDescription: '操舵が半分以下になった時、0.5回復する。', activationLog: '黄金穀倉の船倉から補給が流れ込み、船体を立て直した。', navalEffect: { type: 'low-hp-heal', threshold: 0.5, heal: 0.5 } },
    'arcana-4': { equipmentName: '皇砲の大砲架', shipGearName: '皇砲の大砲架', gearPart: 'cannon_mount', gearPartLabel: '大砲架', arcanaElement: 'fire', ultimateName: '皇砲斉射', roleLabel: '射撃', shortDescription: '初回の船首砲/前方銃撃/舷側砲/側面銃撃の命中負荷+0.5。', activationLog: '皇砲の大砲架が砲門を固定し、重い一撃を放った。', navalEffect: { type: 'first-cannon-boost', damageBonus: 0.5 } },
    'arcana-5': { equipmentName: '誓約の鐘楼', shipGearName: '誓約の鐘楼', gearPart: 'bell_tower', gearPartLabel: '鐘楼', arcanaElement: 'wind', ultimateName: '誓約の防鐘', roleLabel: '防御', shortDescription: '敵の初回射撃命中負荷-0.5。', activationLog: '誓約の鐘楼が鳴り、敵船の射撃が鈍った。', navalEffect: { type: 'reduce-first-shot', reduce: 0.5 } },
    'arcana-6': { equipmentName: '双胴の絆鎖', shipGearName: '双胴の絆鎖', gearPart: 'chain', gearPartLabel: '鎖', ultimateName: '接舷拘束', roleLabel: '拘束', shortDescription: '初回突撃命中時、敵の次の面舵/取舵を1回封じる。', activationLog: '双胴の絆鎖が敵船を絡め取り、操舵を縛った。', navalEffect: { type: 'lock-rudder-on-assault', commands: ['starboardRudder', 'portRudder'], turns: 1 } },
    'arcana-7': { equipmentName: '雷鳴の船首衝角', shipGearName: '雷鳴の船首衝角', gearPart: 'ram', gearPartLabel: '衝角', arcanaElement: 'wind', ultimateName: '雷鳴突撃', roleLabel: '突撃', shortDescription: '初回突撃の命中負荷+0.5。舷側迎撃を受けた場合、その被弾も0.5軽減。', activationLog: '雷鳴の船首衝角が海面を裂き、敵船へ突き進んだ。', navalEffect: { type: 'ram-boost', damageBonus: 0.5, broadsideGuard: 0.5 } },
    'arcana-8': { equipmentName: '獅子の補強竜骨', shipGearName: '獅子の補強竜骨', gearPart: 'keel', gearPartLabel: '竜骨', ultimateName: '獅子の踏ん張り', roleLabel: '反撃準備', shortDescription: '初回1.5以上被弾を0.5軽減し、次の射撃命中負荷+0.5。', activationLog: '獅子の補強竜骨が衝撃を受け止め、反撃の力を蓄えた。', navalEffect: { type: 'halve-big-hit', minDamage: 1.5, reduce: 0.5, nextCannonBonus: 0.5 } },
    'arcana-9': { equipmentName: '灯台隠し帆', shipGearName: '灯台隠し帆', gearPart: 'sail', gearPartLabel: '帆', ultimateName: '灯台隠航', roleLabel: '隠密', shortDescription: '自分が横向きの時、敵の初回射撃を外させる。それ以外では0.5軽減。', activationLog: '灯台隠し帆が船影を消し、敵砲を空へ撃たせた。', navalEffect: { type: 'enemy-first-cannon-miss', sideOnly: true, fallbackReduce: 0.5 } },
    'arcana-10': { equipmentName: '大潮流の輪舵', shipGearName: '大潮流の輪舵', gearPart: 'wheel', gearPartLabel: '輪舵', ultimateName: '潮流反転', roleLabel: '逆転', shortDescription: '操舵不利になった初回、正面へ戻り再装填を解除する。', activationLog: '大潮流の輪舵が海流を反転させ、戦況をひっくり返した。', navalEffect: { type: 'fate-turn', clearReload: true } },
    'arcana-11': { equipmentName: '天秤の船首剣', shipGearName: '天秤の船首剣', gearPart: 'prow_blade', gearPartLabel: '船首剣', ultimateName: '裁きの切先', roleLabel: '追撃', shortDescription: '横向き/後ろ向きの敵への初回命中負荷+0.5。', activationLog: '天秤の船首剣が逃げ角を裁き、傷口を広げた。', navalEffect: { type: 'flank-hit-boost', damageBonus: 0.5 } },
    'arcana-12': { equipmentName: '身代わりの大錨', shipGearName: '身代わりの大錨', gearPart: 'anchor', gearPartLabel: '錨', ultimateName: '身代わり投錨', roleLabel: '踏みとどまり', shortDescription: '初回操舵0時、0.5で踏みとどまる。', activationLog: '身代わりの大錨が衝撃を海底へ逃がした。', navalEffect: { type: 'cancel-first-stun', hp: 0.5 } },
    'arcana-13': { equipmentName: '冥海の黒衝角', shipGearName: '冥海の黒衝角', gearPart: 'ram', gearPartLabel: '衝角', ultimateName: '冥海追討', roleLabel: '処刑', shortDescription: '操舵1以下の敵への初回命中負荷+0.5。', activationLog: '冥海の黒衝角が弱った船体へ死線を刻んだ。', navalEffect: { type: 'execute-hit', threshold: 1, damageBonus: 0.5 } },
    'arcana-14': { equipmentName: '錬金酒の整備樽', shipGearName: '錬金酒の整備樽', gearPart: 'barrel', gearPartLabel: '整備樽', arcanaElement: 'water', ultimateName: '即席整備', roleLabel: '整備', shortDescription: '操舵0.5以下になった初回、0.5回復して再装填を解除する。', activationLog: '錬金酒の整備樽が甲板を走り、損傷と混乱を洗い流した。', navalEffect: { type: 'cleanse-control', threshold: 0.5, heal: 0.5, clearReload: true } },
    'arcana-15': { equipmentName: '契約の黒鎖帆', shipGearName: '契約の黒鎖帆', gearPart: 'chain_sail', gearPartLabel: '鎖帆', ultimateName: '黒鎖封鎖', roleLabel: '封鎖', shortDescription: '敵の初回接舷を無効化する。', activationLog: '契約の黒鎖帆が敵船の甲板を縛り、好機を封じた。', navalEffect: { type: 'block-enemy-opportunity', commands: ['boarding'] } },
    'arcana-16': { equipmentName: '巨大な避雷マスト', shipGearName: '巨大な避雷マスト', gearPart: 'mast', gearPartLabel: 'マスト', arcanaElement: 'wind', ultimateName: '落雷反撃', roleLabel: '反撃', shortDescription: '初回被弾後、攻撃した敵へ0.5反撃する。', activationLog: '巨大な避雷マストが落雷を集め、敵船へ叩き返した。', navalEffect: { type: 'counter-on-hit', damage: 0.5 } },
    'arcana-17': { equipmentName: '星灯りの救難旗', shipGearName: '星灯りの救難旗', gearPart: 'flag', gearPartLabel: '救難旗', ultimateName: '星灯救援', roleLabel: '救援', shortDescription: '操舵1以下で0.5回復し、次被弾を0.5防ぐシールドを付与。', activationLog: '星灯りの救難旗が夜海に輝き、船を守った。', navalEffect: { type: 'star-rescue', threshold: 1, heal: 0.5, shield: 0.5 } },
    'arcana-18': { equipmentName: '幻月の霧帆', shipGearName: '幻月の霧帆', gearPart: 'fog_sail', gearPartLabel: '霧帆', arcanaElement: 'water', ultimateName: '幻月霧航', roleLabel: '幻惑', shortDescription: '初回1.5以上被弾を0.5まで軽減する。', activationLog: '幻月の霧帆が月霧を広げ、砲撃を飲み込んだ。', navalEffect: { type: 'fog-danger-shot', minDamage: 1.5, reduceTo: 0.5 } },
    'arcana-19': { equipmentName: '太陽砲の甲板炉', shipGearName: '太陽砲の甲板炉', gearPart: 'deck_furnace', gearPartLabel: '甲板炉', arcanaElement: 'fire', ultimateName: '灼熱砲火', roleLabel: '船首射撃', shortDescription: '初回船首砲/前方銃撃の命中負荷+0.5。', activationLog: '太陽砲の甲板炉が砲身を白熱させた。', navalEffect: { type: 'sun-cannon', damageBonus: 0.5 } },
    'arcana-20': { equipmentName: '復活の号鐘', shipGearName: '復活の号鐘', gearPart: 'bell', gearPartLabel: '号鐘', ultimateName: '審判の帰還', roleLabel: '復帰', shortDescription: '初回操舵0時、0.5で復帰する。', activationLog: '復活の号鐘が制御を失いかけた船を呼び戻した。', navalEffect: { type: 'revive-on-ko', hp: 0.5 } },
    'arcana-21': { equipmentName: '世界航路の環羅針', shipGearName: '世界航路の環羅針', gearPart: 'world_compass', gearPartLabel: '環羅針', ultimateName: '世界航路開通', roleLabel: '読み勝ち', shortDescription: '初回「自分だけが命中した読み勝ち」時、追加0.5負荷を与え、再装填を解除する。', activationLog: '世界航路の環羅針が次の航路を開き、読み勝ちを押し広げた。', navalEffect: { type: 'extra-action-after-command', winningReadBonus: 0.5, clearReload: true } }
});

const COMMAND_TYPE_LABEL = {
    cannon: '砲撃',
    move: '操船',
    rudder: '操舵',
    feint: '牽制',
    boarding: '接舷'
};

const COMMANDS = {
    assault: {
        id: 'assault',
        label: '突撃',
        type: 'move',
        icon: './assets/ui/icons/024.png',
        desc: '敵船方向へ突っ込む。空砲や旋回に強い'
    },
    bowCannon: {
        id: 'bowCannon',
        label: '船首砲',
        type: 'cannon',
        icon: './assets/ui/icons/034.png',
        desc: '正面の基本砲撃。突撃を止めやすい'
    },
    broadside: {
        id: 'broadside',
        label: '舷側砲',
        type: 'cannon',
        icon: './assets/ui/icons/060.png',
        desc: '横向き専用の強砲撃。外すと再装填'
    },
    starboardRudder: {
        id: 'starboardRudder',
        label: '面舵',
        type: 'rudder',
        icon: './assets/ui/icons/021.png',
        desc: '右舷を向ける。船首砲や舷側砲を読んで避ける'
    },
    portRudder: {
        id: 'portRudder',
        label: '取舵',
        type: 'rudder',
        icon: './assets/ui/icons/094.png',
        desc: '元の向きへ戻る'
    },
    blankShot: {
        id: 'blankShot',
        label: '空砲',
        type: 'feint',
        icon: './assets/ui/icons/095.png',
        desc: '回避読みの牽制。相手の無駄な操舵を誘う'
    },
    boarding: {
        id: 'boarding',
        label: '接舷！',
        type: 'boarding',
        icon: './assets/ui/icons/075.png',
        desc: '操舵不能の相手へ乗り込む'
    }
};

const ENEMY_PLANS = [
    { name: '突撃型', assault: 0.4, bow: 0.25, sideGun: 0.45, feint: 0.2 },
    { name: '砲撃型', assault: 0.22, bow: 0.45, sideGun: 0.62, feint: 0.18 },
    { name: '攪乱型', assault: 0.28, bow: 0.25, sideGun: 0.35, feint: 0.5 }
];

const NAVAL_VISUAL_EFFECT_MS = 1400;
const NAVAL_SURGE_MOTION_MS = 1180;
const NAVAL_BOARDING_MOTION_MS = 1550;
const SHIP_SPRITE_FRAME_SIZE = 64;
const SHIP_SPRITE_GROUP_X = {
    boat: 0,
    common: 0,
    explorer: -384,
    defender: -768,
    fighter: -1152,
    merchant: -1536,
    guild: 0
};
const SHIP_SPRITE_FRAMES = {
    player: {
        front: { x: -64, y: -64 },
        back: { x: -64, y: -128 },
        starboard: { x: -64, y: -192 },
        port: { x: -64, y: 0 },
        diagonalDownLeft: { x: -256, y: 0 },
        diagonalDownRight: { x: -256, y: -64 },
        diagonalUpLeft: { x: -256, y: -128 },
        diagonalUpRight: { x: -256, y: -192 }
    },
    enemy: {
        front: { x: -64, y: -128 },
        back: { x: -64, y: -64 },
        starboard: { x: -64, y: 0 },
        port: { x: -64, y: -192 },
        diagonalDownLeft: { x: -256, y: 0 },
        diagonalDownRight: { x: -256, y: -64 },
        diagonalUpLeft: { x: -256, y: -128 },
        diagonalUpRight: { x: -256, y: -192 }
    }
};

let battle = null;
let navalVisualClearTimer = null;
let navalBoardingTimer = null;

function clampNumber(value, min, max, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function roundSteeringValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number / STEERING_STEP) * STEERING_STEP;
}

function clampSteeringValue(value, min, max, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, roundSteeringValue(number)));
}

function formatSteeringValue(value) {
    const rounded = roundSteeringValue(value);
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatRatePercent(rate) {
    return `${Math.round(clampNumber(rate, 0, 1, 0) * 100)}%`;
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function isSideFacing(facing) {
    return SIDE_FACINGS.has(String(facing || 'front'));
}

function normalizeFacing(value) {
    const raw = String(value || 'front');
    if (raw === 'side') return 'starboard';
    return FACING_LABEL[raw] ? raw : 'front';
}

function normalizeElement(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'none' || raw === 'neutral') return 'none';
    if (raw === 'fire' || raw === 'flame' || raw === '炎' || raw === '火') return 'fire';
    if (raw === 'water' || raw === 'aqua' || raw === '水') return 'water';
    if (raw === 'wind' || raw === 'air' || raw === '風') return 'wind';
    if (raw === 'earth' || raw === 'ground' || raw === '地' || raw === '土' || raw === '大地') return 'earth';
    return 'none';
}

function normalizeRace(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'human' || raw === 'humans' || raw === '人間') return 'human';
    if (raw === 'elf' || raw === 'elves' || raw === 'エルフ') return 'elf';
    if (raw === 'goblin' || raw === 'goblins' || raw === 'ゴブリン') return 'goblin';
    if (raw === 'orc' || raw === 'orcs' || raw === 'オーク') return 'orc';
    return '';
}

function normalizeShipTraitKey(value) {
    const key = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (!key) return '';
    if (NAVAL_SHIP_TRAITS[key]) return key;
    const embedded = Object.keys(NAVAL_SHIP_TRAITS).find((traitKey) => key.includes(traitKey));
    return embedded || '';
}

function resolveShipTraitKey(publicProfile = {}, shipProfile = {}, form = '') {
    const candidates = [
        shipProfile.itemId,
        shipProfile.ItemId,
        shipProfile.FriendlyId,
        shipProfile.friendlyId,
        shipProfile.id,
        shipProfile.catalogItemId,
        shipProfile.CatalogItemId
    ];
    for (const candidate of candidates) {
        const key = normalizeShipTraitKey(candidate);
        if (key) return key;
    }
    const race = normalizeRace(
        publicProfile.race
        || publicProfile.Race
        || publicProfile.species
        || publicProfile.Species
    );
    const normalizedForm = normalizeShipForm({ form });
    const fallback = race && normalizedForm ? `ship_${race}_${normalizedForm}` : '';
    return NAVAL_SHIP_TRAITS[fallback] ? fallback : '';
}

function maxSteeringForForm(form) {
    return SHIP_FORM_MAX_STEERING[form] || SHIP_FORM_MAX_STEERING.boat;
}

function weaponClassForForm(form) {
    return SHIP_FORM_WEAPON_CLASS[form] || SHIP_FORM_WEAPON_CLASS.boat;
}

function weaponLabelForClass(weaponClass) {
    return weaponClass === 'small' ? '銃撃' : '砲撃';
}

function cannonCommandLabel(ship, commandId) {
    const small = ship?.weaponClass === 'small';
    if (commandId === 'bowCannon') return small ? '前方銃撃' : '船首砲';
    if (commandId === 'broadside') return small ? '側面銃撃' : '舷側砲';
    return COMMANDS[commandId]?.label || commandId || '行動';
}

function cannonDamageForShip(ship, commandId) {
    const small = ship?.weaponClass === 'small';
    if (commandId === 'bowCannon') return small ? LIGHT_BOW_DAMAGE : BOW_DAMAGE;
    if (commandId === 'broadside') return small ? LIGHT_BROADSIDE_DAMAGE : BROADSIDE_DAMAGE;
    return 0;
}

function cannonDamageLabel(ship, commandId, variant = '') {
    const base = cannonCommandLabel(ship, commandId);
    if (variant === 'intercept') return `${base}迎撃`;
    if (variant === 'interceptOf') return `${base}の迎撃`;
    if (variant === 'exchange') return `${base}撃ち合い`;
    if (variant === 'turning') return `旋回中の${base}`;
    return base;
}

function hasElementAdvantage(sourceElement, targetElement) {
    const source = normalizeElement(sourceElement);
    const target = normalizeElement(targetElement);
    return source !== 'none' && target !== 'none' && ELEMENT_ADVANTAGE[source] === target;
}

function isAttackCommand(commandId) {
    return commandId === 'assault' || commandId === 'bowCannon' || commandId === 'broadside';
}

function isRudderCommand(commandId) {
    return commandId === 'starboardRudder' || commandId === 'portRudder';
}

function evasionRateForShip(defender, attackerCommandId, defenderCommandId = defender?.lastResolvingCommandId) {
    if (!defender || !isCannonCommand(attackerCommandId)) return 0;
    const activeCommandId = normalizeCommandId(defenderCommandId);
    if (activeCommandId === 'assault') return EVASION_RATE.assault;
    const facing = normalizeFacing(defender.facing);
    let rate = EVASION_RATE.back;
    if (facing === 'front') rate = EVASION_RATE.front;
    else if (isSideFacing(facing)) rate = EVASION_RATE.side;
    if (isRudderCommand(activeCommandId)) {
        rate = Math.min(EVASION_RATE.rudderMax, rate + EVASION_RATE.rudderBonus);
    }
    return clampNumber(rate, 0, 1, 0);
}

function nextEvasionRoll(b) {
    const rolls = Array.isArray(b?.options?.evasionRolls) ? b.options.evasionRolls : null;
    if (rolls) {
        const index = Math.max(0, Math.floor(Number(b.evasionRollIndex || 0)));
        b.evasionRollIndex = index + 1;
        return clampNumber(rolls[index], 0, 1, 1);
    }
    return clampNumber(Math.random(), 0, 1, 1);
}

function recordEvasionResult(b, attacker, defender, commandId, rate, roll) {
    if (!b || !defender) return;
    b.turnEvasions = Array.isArray(b.turnEvasions) ? b.turnEvasions : [];
    b.turnEvasions.push({
        target: defender.isPlayer ? 'player' : 'enemy',
        source: attacker?.isPlayer ? 'player' : 'enemy',
        commandId,
        rate,
        roll
    });
}

function maybeEvadeDamageByPosture(b, attacker, defender, allowRandomEvasion = true) {
    if (!allowRandomEvasion || !attacker || !defender) return false;
    const attackerCommandId = normalizeCommandId(attacker.lastResolvingCommandId);
    const defenderCommandId = normalizeCommandId(defender.lastResolvingCommandId);
    let rate = evasionRateForShip(defender, attackerCommandId, defenderCommandId);
    const hasTraitEvasion = canApplyShipTraitEvasionBonus(defender, attackerCommandId, defenderCommandId);
    if (maybePiercePostureEvasionByShipTrait(b, attacker, attackerCommandId, rate || (hasTraitEvasion ? 1 : 0))) return false;
    rate = applyShipTraitEvasionBonus(b, defender, attackerCommandId, defenderCommandId, rate);
    if (rate <= 0) return false;
    const roll = nextEvasionRoll(b);
    if (roll >= rate) return false;
    recordEvasionResult(b, attacker, defender, attackerCommandId, rate, roll);
    log(b, `${defender.label}は回避した（回避率${formatRatePercent(rate)}）`);
    return true;
}

function visualShipForm(ship) {
    const form = String(ship?.shipForm || 'boat');
    return SHIP_SPRITE_GROUP_X[form] !== undefined ? form : 'boat';
}

function rudderDodgeDirection(side, commandId, currentFacing = 'front') {
    if (!isRudderCommand(commandId)) return '';
    const pose = rudderTransitionPose(side, commandId, currentFacing);
    if (pose.includes('Up')) return 'up';
    if (pose.includes('Down')) return 'down';
    return '';
}

function facingDirectionForSide(side, facing) {
    const normalized = normalizeFacing(facing);
    if (side === 'enemy') {
        if (normalized === 'front') return 'right';
        if (normalized === 'back') return 'left';
        if (normalized === 'starboard') return 'down';
        if (normalized === 'port') return 'up';
        return 'right';
    }
    if (normalized === 'front') return 'left';
    if (normalized === 'back') return 'right';
    if (normalized === 'starboard') return 'up';
    if (normalized === 'port') return 'down';
    return 'left';
}

function diagonalPoseBetweenDirections(a, b) {
    const directions = new Set([a, b]);
    if (directions.has('down') && directions.has('left')) return 'diagonalDownLeft';
    if (directions.has('down') && directions.has('right')) return 'diagonalDownRight';
    if (directions.has('up') && directions.has('left')) return 'diagonalUpLeft';
    if (directions.has('up') && directions.has('right')) return 'diagonalUpRight';
    return '';
}

function rudderTransitionPose(side, commandId, currentFacing = 'front') {
    if (!isRudderCommand(commandId)) return '';
    const facing = normalizeFacing(currentFacing);
    if (commandId === 'portRudder' && !isSideFacing(facing)) return '';
    const nextFacing = sideAfterRudder(commandId, facing);
    return diagonalPoseBetweenDirections(
        facingDirectionForSide(side, facing),
        facingDirectionForSide(side, nextFacing)
    );
}

function visualPoseForCommand(side, commandId, facing = 'front') {
    if (isRudderCommand(commandId)) return rudderTransitionPose(side, commandId, facing);
    if (commandId === 'assault') return 'front';
    return '';
}

function shipSpriteFrame(ship, side, visualPose = '') {
    const form = visualShipForm(ship);
    const groupX = SHIP_SPRITE_GROUP_X[form] || 0;
    const frames = SHIP_SPRITE_FRAMES[side] || SHIP_SPRITE_FRAMES.player;
    const pose = visualPose || normalizeFacing(ship?.facing);
    const frame = frames[pose] || frames.front;
    return {
        x: groupX + frame.x,
        y: frame.y
    };
}

function normalizeArcanaGearId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.match(/^arcana-(\d+)$/i);
    if (direct) return `arcana-${Math.max(0, Math.min(21, Number(direct[1]) || 0))}`;
    const loose = raw.match(/(?:arcana-|_)(\d+)$/i);
    return loose ? `arcana-${Math.max(0, Math.min(21, Number(loose[1]) || 0))}` : '';
}

function buildArcanaGearState(entry, slotIndex = 0) {
    const source = asObject(entry);
    const itemId = normalizeArcanaGearId(
        typeof entry === 'string'
            ? entry
            : (source.itemId || source.cardItemId || source.id || source.ItemId)
    );
    const fallbackGear = NAVAL_ARCANA_GEAR[itemId];
    const sourceGear = asObject(source.shipGear || source.gear || source);
    const gear = fallbackGear ? { ...fallbackGear, ...sourceGear } : sourceGear;
    if (!itemId || !gear?.navalEffect?.type) return null;
    const arcanaNumber = Number(itemId.split('-')[1]);
    const arcanaElement = normalizeElement(gear.arcanaElement || sourceGear.arcanaElement);
    const equipmentName = gear.equipmentName || sourceGear.equipmentName || gear.shipGearName || sourceGear.shipGearName || itemId;
    return {
        itemId,
        arcanaNumber,
        slotIndex,
        key: `${itemId}:${slotIndex}`,
        equipmentName,
        gearPart: gear.gearPart || sourceGear.gearPart || '',
        gearPartLabel: gear.gearPartLabel || sourceGear.gearPartLabel || '',
        arcanaElement,
        arcanaElementLabel: arcanaElement === 'none' ? '' : (ELEMENT_LABEL[arcanaElement] || ''),
        shipGearName: gear.shipGearName || sourceGear.shipGearName || equipmentName,
        ultimateName: gear.ultimateName || sourceGear.ultimateName || 'アルカナ艤装',
        roleLabel: gear.roleLabel || sourceGear.roleLabel || '',
        shortDescription: gear.shortDescription || sourceGear.shortDescription || '',
        activationLog: gear.activationLog || sourceGear.activationLog || `${equipmentName}が発動した。`,
        navalEffect: { ...(gear.navalEffect || {}) },
        used: Boolean(source.used),
        arcanaElementUsed: Boolean(source.arcanaElementUsed)
    };
}

function resolveArcanaGearsFromShipProfile(shipProfile = {}) {
    const profile = asObject(shipProfile);
    const explicit = Array.isArray(profile.majorArcanaGear)
        ? profile.majorArcanaGear
        : Array.isArray(profile.majorArcana)
            ? profile.majorArcana
            : [];
    const ids = Array.isArray(profile.majorArcanaItemIds) ? profile.majorArcanaItemIds : [];
    const source = explicit.length ? explicit : ids;
    return source.map((entry, index) => buildArcanaGearState(entry, index)).filter(Boolean).slice(0, 3);
}

function cloneArcanaGearState(entry, slotIndex = 0) {
    const gear = buildArcanaGearState(entry, slotIndex);
    if (!gear) return null;
    gear.used = Boolean(entry?.used);
    gear.arcanaElementUsed = Boolean(entry?.arcanaElementUsed);
    return gear;
}

function findArcanaGear(ship, type, { includeUsed = false } = {}) {
    return (ship?.arcanaGears || []).find((gear) => (
        gear?.navalEffect?.type === type && (includeUsed || !gear.used)
    )) || null;
}

function normalizeShipForm(shipProfile = {}) {
    const raw = String(
        shipProfile.form
        || shipProfile.shipClass
        || shipProfile.class
        || shipProfile.Class
        || shipProfile.itemId
        || ''
    ).toLowerCase();
    if (raw.includes('guild')) return 'guild';
    if (raw.includes('merchant')) return 'merchant';
    if (raw.includes('fighter')) return 'fighter';
    if (raw.includes('defender')) return 'defender';
    if (raw.includes('explorer')) return 'explorer';
    if (raw.includes('common')) return 'common';
    return 'boat';
}

function getStatValue(stats = {}, keys = []) {
    const source = asObject(stats);
    for (const key of keys) {
        const value = Number(source[key] ?? source[key.toUpperCase()] ?? source[key.toLowerCase()]);
        if (Number.isFinite(value)) return value;
    }
    return 0;
}

function readCargoMap(profile = {}, shipProfile = {}) {
    const candidates = [
        profile.cargoResources,
        profile.cargo,
        profile.shipCargo,
        profile.resourceCargo,
        shipProfile.cargoResources,
        shipProfile.cargo,
        shipProfile.ResourceCargo,
        shipProfile.resourceCargo
    ];
    const found = candidates.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    return found ? { ...found } : {};
}

function summarizeCargo(cargoMap = {}, fallbackBonus = 0) {
    const entries = Object.entries(cargoMap)
        .map(([id, amount]) => ({ id: String(id), amount: Math.max(0, Math.floor(Number(amount) || 0)) }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (!entries.length) {
        return {
            total: Math.max(0, fallbackBonus),
            text: fallbackBonus > 0 ? `積載余力 +${fallbackBonus}` : '空',
            topItem: null
        };
    }
    const top = entries[0];
    return {
        total,
        text: `${top.id} x${top.amount}${entries.length > 1 ? ` ほか${entries.length - 1}種` : ''}`,
        topItem: top
    };
}

function normalizeShipProfile(profile = {}, explicitShipProfile = {}) {
    const publicProfile = asObject(profile);
    const shipProfile = {
        ...asObject(publicProfile.playerShip),
        ...asObject(explicitShipProfile)
    };
    const form = normalizeShipForm(shipProfile);
    const modifier = SHIP_FORM_MODIFIER[form] || SHIP_FORM_MODIFIER.boat;
    const stats = asObject(publicProfile.stats);
    const level = clampNumber(publicProfile.level ?? stats.level ?? stats.PlayerLevel, 1, 99, 1);
    const shipLevel = clampNumber(shipProfile.level ?? shipProfile.Level, 1, 10, 1);
    const attackStat = getStatValue(stats, ['str', 'STR', 'attack', 'ATK']);
    const defenseStat = getStatValue(stats, ['def', 'DEF', 'defense']);
    const speedStat = getStatValue(stats, ['agi', 'AGI', 'speed']);
    const cargo = summarizeCargo(readCargoMap(publicProfile, shipProfile), modifier.cargo);
    const label = String(shipProfile.name || shipProfile.DisplayName || SHIP_FORM_LABEL[form] || '船').slice(0, 16);
    const element = normalizeElement(publicProfile.nation || publicProfile.Nation);
    const weaponClass = weaponClassForForm(form);
    const shipTraitKey = resolveShipTraitKey(publicProfile, shipProfile, form);
    const shipTrait = NAVAL_SHIP_TRAITS[shipTraitKey] || null;
    return {
        form,
        formLabel: SHIP_FORM_LABEL[form] || '船',
        name: label,
        level,
        shipLevel,
        maxSteering: maxSteeringForForm(form),
        weaponClass,
        weaponLabel: weaponLabelForClass(weaponClass),
        shipTraitKey,
        shipTraitName: shipTrait?.name || '',
        element,
        elementLabel: ELEMENT_LABEL[element] || ELEMENT_LABEL.none,
        attackBonus: clampNumber(modifier.attack + Math.floor(attackStat / 12), 0, 1, 0),
        defenseBonus: clampNumber(modifier.defense + Math.floor(defenseStat / 14), 0, 1, 0),
        speed: clampNumber(modifier.speed + Math.floor(speedStat / 18), 0, 1, 0),
        cargoTotal: cargo.total,
        cargoText: cargo.text,
        topCargo: cargo.topItem,
        profile
    };
}

function createShip(label, isPlayer, profile = {}, shipProfile = {}) {
    const spec = normalizeShipProfile(profile, shipProfile);
    return {
        label,
        isPlayer,
        hp: spec.maxSteering,
        maxHp: spec.maxSteering,
        shipForm: spec.form,
        shipType: spec.formLabel,
        shipName: spec.name,
        shipLevel: spec.shipLevel,
        playerLevel: spec.level,
        element: spec.element,
        elementLabel: spec.elementLabel,
        weaponClass: spec.weaponClass,
        weaponLabel: spec.weaponLabel,
        shipTraitKey: spec.shipTraitKey,
        shipTraitName: spec.shipTraitName,
        shipTraitUsed: false,
        roleTraitUsed: false,
        elementAdvantageUsed: false,
        attackBonus: spec.attackBonus,
        defenseBonus: spec.defenseBonus,
        speed: spec.speed,
        cargoTotal: spec.cargoTotal,
        cargoText: spec.cargoText,
        topCargo: spec.topCargo,
        arcanaGears: resolveArcanaGearsFromShipProfile(shipProfile),
        arcanaShield: 0,
        arcanaNextCannonBonus: 0,
        arcanaIgnoreNextDefense: false,
        arcanaCommandLocks: {},
        facing: 'front',
        reload: 0,
        pendingCommandId: null,
        lastCommandId: null,
        stun: 0,
        rudderCooldown: 0,
        command: null
    };
}

function hashString(value) {
    return String(value || '').split('').reduce((hash, ch) => (
        ((hash << 5) - hash + ch.charCodeAt(0)) >>> 0
    ), 0);
}

function createEnemyPlan(options = {}) {
    const seed = options.opponentId || options.opponentName || 'enemy';
    return ENEMY_PLANS[hashString(seed) % ENEMY_PLANS.length];
}

function cloneShipState(source, fallbackLabel, isPlayer) {
    const ship = createShip(source?.label || fallbackLabel, isPlayer);
    const rawForm = String(source?.shipForm || source?.form || source?.shipClass || source?.class || '');
    ship.shipForm = rawForm ? normalizeShipForm({ form: rawForm }) : String(ship.shipForm || 'boat');
    ship.shipType = String(source?.shipType || SHIP_FORM_LABEL[ship.shipForm] || ship.shipType || '船');
    ship.shipName = String(source?.shipName || ship.shipName || ship.shipType || '船');
    ship.maxHp = clampSteeringValue(source?.maxHp ?? source?.maxSteering ?? maxSteeringForForm(ship.shipForm), 0.5, STEERING_MAX, maxSteeringForForm(ship.shipForm));
    ship.hp = clampSteeringValue(source?.hp ?? source?.steering ?? ship.maxHp, 0, ship.maxHp, ship.maxHp);
    ship.shipLevel = Math.max(1, Number(source?.shipLevel || ship.shipLevel || 1) || 1);
    ship.playerLevel = Math.max(1, Number(source?.playerLevel || ship.playerLevel || 1) || 1);
    ship.element = normalizeElement(source?.element || source?.nation || ship.element);
    ship.elementLabel = String(source?.elementLabel || ELEMENT_LABEL[ship.element] || ELEMENT_LABEL.none);
    ship.weaponClass = source?.weaponClass === 'cannon' || source?.weaponClass === 'small'
        ? source.weaponClass
        : weaponClassForForm(ship.shipForm);
    ship.weaponLabel = String(source?.weaponLabel || weaponLabelForClass(ship.weaponClass));
    ship.shipTraitKey = normalizeShipTraitKey(
        source?.shipTraitKey
        || source?.itemId
        || source?.ItemId
        || source?.friendlyId
        || source?.FriendlyId
    );
    ship.shipTraitName = String(source?.shipTraitName || NAVAL_SHIP_TRAITS[ship.shipTraitKey]?.name || '');
    ship.shipTraitUsed = Boolean(source?.shipTraitUsed ?? (ship.shipTraitKey ? source?.roleTraitUsed : false));
    ship.roleTraitUsed = Boolean(source?.roleTraitUsed);
    ship.elementAdvantageUsed = Boolean(source?.elementAdvantageUsed);
    ship.attackBonus = clampNumber(source?.attackBonus, 0, 1, ship.attackBonus || 0);
    ship.defenseBonus = clampNumber(source?.defenseBonus, 0, 1, ship.defenseBonus || 0);
    ship.speed = clampNumber(source?.speed, 0, 1, ship.speed || 0);
    ship.cargoTotal = Math.max(0, Number(source?.cargoTotal || ship.cargoTotal || 0) || 0);
    ship.cargoText = String(source?.cargoText || ship.cargoText || '空');
    ship.topCargo = source?.topCargo || ship.topCargo || null;
    ship.arcanaGears = Array.isArray(source?.arcanaGears)
        ? source.arcanaGears.map((entry, index) => cloneArcanaGearState(entry, index)).filter(Boolean).slice(0, 3)
        : [];
    ship.arcanaShield = Math.max(0, Number(source?.arcanaShield || 0) || 0);
    ship.arcanaNextCannonBonus = Math.max(0, Number(source?.arcanaNextCannonBonus || 0) || 0);
    ship.arcanaIgnoreNextDefense = Boolean(source?.arcanaIgnoreNextDefense);
    ship.arcanaCommandLocks = { ...asObject(source?.arcanaCommandLocks) };
    ship.facing = normalizeFacing(source?.facing);
    ship.reload = Math.max(0, Number(source?.reload || 0) || 0);
    ship.pendingCommandId = source?.pendingCommandId || null;
    ship.lastCommandId = source?.lastCommandId || null;
    return ship;
}

function serializeShipState(ship) {
    return {
        label: ship.label,
        hp: ship.hp,
        steering: ship.hp,
        maxHp: ship.maxHp,
        shipForm: ship.shipForm,
        shipType: ship.shipType,
        shipName: ship.shipName,
        shipLevel: ship.shipLevel,
        playerLevel: ship.playerLevel,
        element: ship.element || 'none',
        elementLabel: ship.elementLabel || ELEMENT_LABEL.none,
        weaponClass: ship.weaponClass || weaponClassForForm(ship.shipForm),
        weaponLabel: ship.weaponLabel || weaponLabelForClass(ship.weaponClass),
        shipTraitKey: ship.shipTraitKey || '',
        shipTraitName: ship.shipTraitName || NAVAL_SHIP_TRAITS[ship.shipTraitKey]?.name || '',
        shipTraitUsed: Boolean(ship.shipTraitUsed),
        roleTraitUsed: Boolean(ship.roleTraitUsed || ship.shipTraitUsed),
        elementAdvantageUsed: Boolean(ship.elementAdvantageUsed),
        attackBonus: ship.attackBonus,
        defenseBonus: ship.defenseBonus,
        speed: ship.speed,
        cargoTotal: ship.cargoTotal,
        cargoText: ship.cargoText,
        topCargo: ship.topCargo || null,
        arcanaGears: (ship.arcanaGears || []).map((gear) => ({
            itemId: gear.itemId,
            arcanaNumber: gear.arcanaNumber,
            slotIndex: gear.slotIndex,
            key: gear.key,
            equipmentName: gear.equipmentName,
            gearPart: gear.gearPart,
            gearPartLabel: gear.gearPartLabel,
            arcanaElement: gear.arcanaElement || 'none',
            arcanaElementLabel: gear.arcanaElementLabel || '',
            shipGearName: gear.shipGearName,
            ultimateName: gear.ultimateName,
            roleLabel: gear.roleLabel,
            shortDescription: gear.shortDescription,
            activationLog: gear.activationLog,
            navalEffect: gear.navalEffect,
            used: Boolean(gear.used),
            arcanaElementUsed: Boolean(gear.arcanaElementUsed)
        })),
        arcanaShield: Math.max(0, Number(ship.arcanaShield || 0) || 0),
        arcanaNextCannonBonus: Math.max(0, Number(ship.arcanaNextCannonBonus || 0) || 0),
        arcanaIgnoreNextDefense: Boolean(ship.arcanaIgnoreNextDefense),
        arcanaCommandLocks: { ...asObject(ship.arcanaCommandLocks) },
        facing: ship.facing,
        reload: ship.reload,
        pendingCommandId: ship.pendingCommandId || null,
        lastCommandId: ship.lastCommandId || null,
        stun: ship.hp <= 0 ? 1 : 0,
        rudderCooldown: 0,
        command: null
    };
}

function serializeBattleState(b) {
    if (!b) return null;
    return {
        mode: 'simultaneous',
        count: b.count,
        turn: b.turn,
        distance: b.distance,
        player: serializeShipState(b.player),
        enemy: serializeShipState(b.enemy),
        enemyPlan: b.enemyPlan?.name || '',
        reward: b.reward || null,
        rewardResult: b.rewardResult || null,
        lastArcanaActivation: b.lastArcanaActivation || null,
        logs: Array.isArray(b.logs) ? b.logs.slice(0, 30) : [],
        finished: Boolean(b.finished),
        outcome: b.outcome || null
    };
}

function resolveEnemyPlanByName(name) {
    return ENEMY_PLANS.find((plan) => plan.name === name) || ENEMY_PLANS[0];
}

function transformSnapshotForPerspective(snapshot, perspective = 'player') {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (perspective !== 'enemy') return snapshot;
    const outcomeMap = {
        victory: 'defeat',
        defeat: 'victory',
        escape: 'enemyEscaped',
        enemyEscaped: 'escape',
        boarding: 'boarded',
        boarded: 'boarding',
        cargoRaid: 'enemyCargoRaid',
        enemyCargoRaid: 'cargoRaid',
        standoff: 'standoff'
    };
    return {
        ...snapshot,
        player: snapshot.enemy,
        enemy: snapshot.player,
        outcome: outcomeMap[snapshot.outcome] || snapshot.outcome,
        reward: null,
        rewardResult: null,
        lastArcanaActivation: snapshot.lastArcanaActivation
            ? {
                ...snapshot.lastArcanaActivation,
                side: snapshot.lastArcanaActivation.side === 'player' ? 'enemy' : 'player'
            }
            : null,
        logs: Array.isArray(snapshot.logs) ? snapshot.logs : []
    };
}

function notifyStateChanged(b) {
    if (!b || typeof b.options.onStateChange !== 'function') return;
    b.options.onStateChange(serializeBattleState(b));
}

function log(b, message) {
    b.logs.unshift(message);
    if (b.logs.length > 30) b.logs.length = 30;
    const el = document.getElementById('navalBattleLog');
    if (el) el.innerHTML = b.logs.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
}

function showArcanaCutin(title, body, side = 'player') {
    const el = document.getElementById('navalArcanaCutin');
    if (!el) return;
    el.className = `naval-arcana-cutin is-${side}`;
    el.innerHTML = `
        <div class="naval-arcana-cutin-kicker">ARCANA RIGGING</div>
        <strong>${escapeHtml(title || 'アルカナ艤装')}</strong>
        <span>${escapeHtml(body || '')}</span>
    `;
    el.hidden = false;
    clearTimeout(showArcanaCutin._timer);
    showArcanaCutin._timer = setTimeout(() => {
        el.hidden = true;
    }, 1400);
}

function activateArcanaGear(b, owner, gear, message = '') {
    if (!b || !owner || !gear || gear.used) return false;
    gear.used = true;
    const side = owner.isPlayer ? 'player' : 'enemy';
    const title = gear.equipmentName || gear.shipGearName || 'アルカナ艤装';
    const body = gear.ultimateName || '';
    b.lastArcanaActivation = {
        id: `${b.count || 0}:${side}:${gear.key}:${Date.now()}`,
        side,
        title,
        body
    };
    log(b, `${owner.label}の${title}「${body}」！ ${message || gear.activationLog || ''}`.trim());
    showArcanaCutin(title, body, side);
    return true;
}

function isCannonCommand(commandId) {
    return commandId === 'bowCannon' || commandId === 'broadside';
}

function normalizeCommandId(commandId) {
    if (commandId === 'advance' || commandId === 'ram') return 'assault';
    if (commandId === 'rudderToSide') return 'starboardRudder';
    if (commandId === 'rudderToFront' || commandId === 'rudderToBack') return 'portRudder';
    if (commandId === 'zeroBroadside') return 'broadside';
    return COMMANDS[commandId] ? commandId : '';
}

function commandIntent(commandId) {
    if (commandId === 'starboardRudder' || commandId === 'portRudder') return 'rudder';
    return commandId;
}

function sideAfterRudder(commandId, currentFacing) {
    if (commandId === 'portRudder') return 'front';
    if (commandId === 'starboardRudder') return 'starboard';
    return normalizeFacing(currentFacing);
}

function commandLabel(commandId, ship = null) {
    if (isCannonCommand(commandId)) return cannonCommandLabel(ship, commandId);
    return COMMANDS[commandId]?.label || commandId || '行動';
}

function commandDescription(def, ship = null) {
    if (!def) return '';
    if (def.id === 'bowCannon' && ship?.weaponClass === 'small') {
        return '正面の基本銃撃。威力は低いが突撃を止めやすい';
    }
    if (def.id === 'broadside' && ship?.weaponClass === 'small') {
        return '横向き専用の側面銃撃。砲撃船の半分の負荷を与える';
    }
    return def.desc || '';
}

function commandCallout(commandId, ship = null) {
    const id = normalizeCommandId(commandId);
    if (id === 'assault') return '突撃だああ！！';
    if (id === 'bowCannon') return ship?.weaponClass === 'small'
        ? '前方銃撃、撃てえ！！'
        : '船首砲、撃てえ！！';
    if (id === 'broadside') return ship?.weaponClass === 'small'
        ? '側面銃撃、撃てえ！！'
        : '舷側砲、一斉射あ！！';
    if (id === 'starboardRudder') return 'おもかじいっぱああい！！';
    if (id === 'portRudder') return 'とりかじいっぱああい！！';
    if (id === 'blankShot') return '空砲、鳴らせえ！！';
    if (id === 'boarding') return '乗り込めええ！！';
    return '';
}

function commandTypeLabel(def, ship = null) {
    if (isCannonCommand(def?.id)) return ship?.weaponLabel || '砲撃';
    return COMMAND_TYPE_LABEL[def?.type] || '行動';
}

function canSelect(b, self, foe, def) {
    if (!b || b.finished || !self || !def) return false;
    if (self.pendingCommandId) return false;
    if (self.hp <= 0) return false;
    if ((def.id === 'starboardRudder' || def.id === 'portRudder') && Number(self.arcanaCommandLocks?.rudder || 0) > 0) return false;
    if (def.id === 'boarding') return foe?.hp <= 0;
    if (def.id === 'assault' && isSideFacing(self.facing)) return false;
    if (isCannonCommand(def.id) && self.reload > 0) return false;
    if (def.id === 'bowCannon' && isSideFacing(self.facing)) return false;
    if (def.id === 'broadside' && !isSideFacing(self.facing)) return false;
    if (def.id === 'blankShot' && !isSideFacing(self.facing)) return false;
    return true;
}

function availableCommands(b, self, foe) {
    if (!b || b.finished) return [];
    if (foe?.hp <= 0 && self?.hp > 0) return [COMMANDS.boarding];
    if (self?.hp <= 0) return [];
    const ids = isSideFacing(self.facing)
        ? ['broadside', 'blankShot', 'portRudder']
        : ['assault', 'bowCannon', 'starboardRudder'];
    return ids.map((id) => COMMANDS[id]).filter((def) => def && canSelect(b, self, foe, def));
}

function healShip(ship, amount) {
    const value = Math.max(0, roundSteeringValue(Number(amount) || 0));
    if (!ship || value <= 0) return 0;
    const before = ship.hp;
    ship.hp = clampSteeringValue(ship.hp + value, 0, ship.maxHp, ship.hp);
    return roundSteeringValue(ship.hp - before);
}

function arcanaBonusValue(value) {
    const number = Math.max(0, roundSteeringValue(Number(value) || 0));
    return number > 1 ? 1 : number;
}

function arcanaDisplayName(gear) {
    return gear?.equipmentName || gear?.shipGearName || gear?.ultimateName || 'アルカナ艤装';
}

function arcanaElementBonus(b, owner, target, gear, mode = 'attack') {
    if (!owner || !target || !gear || gear.arcanaElementUsed) return 0;
    const element = normalizeElement(gear.arcanaElement);
    if (element === 'none' || !hasElementAdvantage(element, target.element)) return 0;
    gear.arcanaElementUsed = true;
    const source = ELEMENT_LABEL[element] || '';
    const targetLabel = target.elementLabel || ELEMENT_LABEL[target.element] || ELEMENT_LABEL.none;
    const text = mode === 'defense' ? '追加0.5軽減' : '追加+0.5負荷';
    log(b, `${owner.label}の${arcanaDisplayName(gear)}属性優勢: ${source}は${targetLabel}に強く、${text}`);
    return 0.5;
}

function shouldPierceArcanaDefense(b, attacker, defender, gear) {
    if (!attacker?.arcanaIgnoreNextDefense || !defender || !gear || gear.used) return false;
    const defensiveTypes = new Set([
        'fool-evade',
        'enemy-first-cannon-miss',
        'fog-danger-shot',
        'halve-big-hit',
        'cancel-first-stun',
        'revive-on-ko',
        'reduce-first-shot'
    ]);
    if (!defensiveTypes.has(gear.navalEffect?.type)) return false;
    attacker.arcanaIgnoreNextDefense = false;
    gear.used = true;
    log(b, `${attacker.label}の索敵が${defender.label}の${arcanaDisplayName(gear)}を封じた`);
    return true;
}

function setArcanaCommandLock(ship, lockName, turns) {
    if (!ship || !lockName) return;
    ship.arcanaCommandLocks = { ...asObject(ship.arcanaCommandLocks) };
    ship.arcanaCommandLocks[lockName] = Math.max(
        ship.arcanaCommandLocks[lockName] || 0,
        Math.max(1, Math.floor(Number(turns) || 1))
    );
}

function tickArcanaCommandLocks(ship) {
    const locks = asObject(ship?.arcanaCommandLocks);
    Object.keys(locks).forEach((key) => {
        const next = Math.max(0, Math.floor(Number(locks[key]) || 0) - 1);
        if (next > 0) locks[key] = next;
        else delete locks[key];
    });
    if (ship) ship.arcanaCommandLocks = locks;
}

function maybeCancelRudderMisread(b, defender, targetCommandId, amount, entry) {
    if (entry?.kind !== 'misread' || commandIntent(targetCommandId) !== 'rudder') return amount;
    const cancelGear = findArcanaGear(defender, 'cancel-rudder-misread');
    if (cancelGear) {
        activateArcanaGear(b, defender, cancelGear);
        log(b, `${defender.label}は旋回の読み違い負荷を受け流した`);
        return 0;
    }
    return amount;
}

function getAvailableShipTrait(ship, type = '') {
    const trait = NAVAL_SHIP_TRAITS[ship?.shipTraitKey];
    if (!trait || ship?.shipTraitUsed) return null;
    if (type && trait.type !== type) return null;
    return trait;
}

function activateShipTrait(b, ship, message = '') {
    const trait = getAvailableShipTrait(ship);
    if (!b || !ship || !trait) return null;
    ship.shipTraitUsed = true;
    ship.roleTraitUsed = true;
    log(b, `${ship.label}の${trait.name}: ${message || '固有能力が発動'}`);
    return trait;
}

function maybeUseShipTraitAttackBoost(b, attacker, commandId, amount, entry) {
    if (entry?.kind !== 'attack' || !attacker || amount <= 0) return amount;
    const trait = getAvailableShipTrait(attacker);
    if (!trait) return amount;
    const bow = commandId === 'bowCannon';
    const broadside = commandId === 'broadside';
    const assault = commandId === 'assault';
    if (bow && (trait.type === 'bow-boost' || trait.type === 'bow-boost-evasion-pierce')) {
        activateShipTrait(b, attacker, `船首砲の負荷 +${formatSteeringValue(trait.damageBonus || 0)}`);
        if (trait.type === 'bow-boost-evasion-pierce') attacker.shipTraitBypassEvasion = true;
        return amount + arcanaBonusValue(trait.damageBonus || 0);
    }
    if (broadside && trait.type === 'broadside-boost') {
        activateShipTrait(b, attacker, `舷側砲の負荷 +${formatSteeringValue(trait.damageBonus || 0)}`);
        return amount + arcanaBonusValue(trait.damageBonus || 0);
    }
    if (assault && (trait.type === 'assault-boost' || trait.type === 'assault-boost-guard')) {
        activateShipTrait(b, attacker, `突撃の負荷 +${formatSteeringValue(trait.damageBonus || 0)}`);
        if (trait.type === 'assault-boost-guard') {
            attacker.shipTraitAssaultBroadsideGuard = Math.max(
                attacker.shipTraitAssaultBroadsideGuard || 0,
                arcanaBonusValue(trait.broadsideGuard || 0)
            );
        }
        return amount + arcanaBonusValue(trait.damageBonus || 0);
    }
    return amount;
}

function maybePiercePostureEvasionByShipTrait(b, attacker, attackerCommandId, rate) {
    if (!attacker || attacker.shipTraitBypassEvasion) return Boolean(attacker?.shipTraitBypassEvasion);
    if (attackerCommandId !== 'bowCannon' || rate <= 0) return false;
    const trait = getAvailableShipTrait(attacker, 'bow-evasion-pierce');
    if (!trait) return false;
    activateShipTrait(b, attacker, '相手の姿勢回避を見切った');
    attacker.shipTraitBypassEvasion = true;
    return true;
}

function canApplyShipTraitEvasionBonus(defender, attackerCommandId, defenderCommandId) {
    if (!defender || !isCannonCommand(attackerCommandId)) return false;
    const activeCommandId = normalizeCommandId(defenderCommandId);
    if (activeCommandId === 'assault') return false;
    const trait = getAvailableShipTrait(defender);
    if (!trait) return false;
    return (trait.type === 'rudder-evasion' && isRudderCommand(activeCommandId))
        || trait.type === 'cannon-evasion';
}

function applyShipTraitEvasionBonus(b, defender, attackerCommandId, defenderCommandId, rate) {
    if (!defender || !isCannonCommand(attackerCommandId)) return rate;
    const activeCommandId = normalizeCommandId(defenderCommandId);
    if (activeCommandId === 'assault') return rate;
    const trait = getAvailableShipTrait(defender);
    if (!trait) return rate;
    if (trait.type === 'rudder-evasion' && isRudderCommand(activeCommandId)) {
        activateShipTrait(b, defender, `旋回中の回避率 +${formatRatePercent(trait.bonus || 0)}`);
        return Math.min(Number(trait.max || rate), rate + Number(trait.bonus || 0));
    }
    if (trait.type === 'cannon-evasion') {
        activateShipTrait(b, defender, `砲撃回避率 +${formatRatePercent(trait.bonus || 0)}`);
        return Math.min(Number(trait.max || rate), rate + Number(trait.bonus || 0));
    }
    return rate;
}

function maybeReduceDamageByShipTrait(b, attacker, defender, value) {
    if (!attacker || !defender || value <= 0) return value;
    const trait = getAvailableShipTrait(defender);
    if (!trait) return value;
    const attackerCommandId = normalizeCommandId(attacker.lastResolvingCommandId);
    const defenderCommandId = normalizeCommandId(defender.lastResolvingCommandId);
    let reduce = 0;
    if (trait.type === 'first-hit-reduce') reduce = trait.reduce || 0;
    else if (trait.type === 'reduce-assault-hit' && attackerCommandId === 'assault') reduce = trait.reduce || 0;
    else if (trait.type === 'reduce-bow-hit' && attackerCommandId === 'bowCannon') reduce = trait.reduce || 0;
    else if (trait.type === 'assault-cannon-reduce' && defenderCommandId === 'assault' && isCannonCommand(attackerCommandId)) reduce = trait.reduce || 0;
    if (reduce <= 0) return value;
    activateShipTrait(b, defender, `被弾負荷 -${formatSteeringValue(reduce)}`);
    return Math.max(0, roundSteeringValue(value - arcanaBonusValue(reduce)));
}

function maybeCounterAssaultByShipTrait(b, attacker, defender, dealtDamage) {
    if (!attacker || !defender || dealtDamage <= 0) return;
    const trait = getAvailableShipTrait(defender, 'counter-assault-hit');
    if (!trait || normalizeCommandId(attacker.lastResolvingCommandId) !== 'assault') return;
    activateShipTrait(b, defender, `突撃した敵へ${formatSteeringValue(trait.damage || 0)}反撃`);
    const counterDamage = arcanaBonusValue(trait.damage || 0.5);
    attacker.hp = clampSteeringValue(attacker.hp - counterDamage, 0, attacker.maxHp, 0);
    log(b, `${trait.name}: ${attacker.label}の操舵ゲージ -${formatSteeringValue(counterDamage)}`);
    checkLowSteeringArcana(b, attacker, defender);
}

function maybeApplyShipTraitAfterDamage(b, attacker, defender, commandId, dealtDamage) {
    if (!attacker || !defender || dealtDamage <= 0 || commandId !== 'broadside') return;
    const trait = getAvailableShipTrait(attacker);
    if (!trait) return;
    if (trait.type === 'broadside-lock-rudder') {
        activateShipTrait(b, attacker, '敵の次の面舵/取舵を封じた');
        setArcanaCommandLock(defender, 'rudder', trait.turns || 1);
    } else if (trait.type === 'broadside-force-front') {
        activateShipTrait(b, attacker, '敵船を正面へ引き戻した');
        defender.arcanaForceFacing = 'front';
    }
}

function maybeUseElementAdvantage(b, attacker, defender, commandId, amount, entry) {
    if (!attacker || !defender || attacker.elementAdvantageUsed) return amount;
    if (entry?.kind !== 'attack' || !isAttackCommand(commandId) || amount <= 0) return amount;
    if (!hasElementAdvantage(attacker.element, defender.element)) return amount;
    attacker.elementAdvantageUsed = true;
    const source = attacker.elementLabel || ELEMENT_LABEL[attacker.element] || '';
    const target = defender.elementLabel || ELEMENT_LABEL[defender.element] || '';
    log(b, `${attacker.label}の属性優勢: ${source}は${target}に強く、初回命中の負荷 +1`);
    return amount + 1;
}

function maybeBoostAttack(b, attacker, defender, commandId, targetCommandId, damage, entry = {}) {
    let next = damage;
    next = maybeCancelRudderMisread(b, defender, targetCommandId, next, entry);
    if (next <= 0) return 0;
    next = maybeUseShipTraitAttackBoost(b, attacker, commandId, next, entry);
    next = maybeUseElementAdvantage(b, attacker, defender, commandId, next, entry);
    if (commandId === 'assault') {
        const ramGear = findArcanaGear(attacker, 'ram-boost');
        if (ramGear) {
            activateArcanaGear(b, attacker, ramGear);
            next += arcanaBonusValue(ramGear.navalEffect.damageBonus);
            next += arcanaElementBonus(b, attacker, defender, ramGear, 'attack');
            attacker.arcanaAssaultBroadsideGuard = arcanaBonusValue(ramGear.navalEffect.broadsideGuard);
        }
    }
    if (isCannonCommand(commandId)) {
        const cannonBoost = findArcanaGear(attacker, 'first-cannon-boost');
        if (cannonBoost) {
            activateArcanaGear(b, attacker, cannonBoost);
            next += arcanaBonusValue(cannonBoost.navalEffect.damageBonus);
            next += arcanaElementBonus(b, attacker, defender, cannonBoost, 'attack');
        }
        const sunCannon = commandId === 'bowCannon' ? findArcanaGear(attacker, 'sun-cannon') : null;
        if (sunCannon) {
            activateArcanaGear(b, attacker, sunCannon);
            next += arcanaBonusValue(sunCannon.navalEffect.damageBonus);
            next += arcanaElementBonus(b, attacker, defender, sunCannon, 'attack');
        }
        if (attacker.arcanaNextCannonBonus > 0) {
            next += arcanaBonusValue(attacker.arcanaNextCannonBonus);
            attacker.arcanaNextCannonBonus = 0;
        }
    }
    if (!isAttackCommand(commandId)) return next;
    const flankGear = (isSideFacing(defender.facing) || defender.facing === 'back')
        ? findArcanaGear(attacker, 'flank-hit-boost')
        : null;
    if (flankGear) {
        activateArcanaGear(b, attacker, flankGear);
        next += arcanaBonusValue(flankGear.navalEffect.damageBonus);
    }
    const executeGear = defender.hp <= Number(findArcanaGear(attacker, 'execute-hit')?.navalEffect?.threshold || 0)
        ? findArcanaGear(attacker, 'execute-hit')
        : null;
    if (executeGear) {
        activateArcanaGear(b, attacker, executeGear);
        next += arcanaBonusValue(executeGear.navalEffect.damageBonus);
    }
    const reduceShot = isCannonCommand(commandId) ? findArcanaGear(defender, 'reduce-first-shot') : null;
    if (reduceShot) {
        if (!shouldPierceArcanaDefense(b, attacker, defender, reduceShot)) {
            activateArcanaGear(b, defender, reduceShot);
            const reduce = arcanaBonusValue(reduceShot.navalEffect.reduce || 0.5)
                + arcanaElementBonus(b, defender, attacker, reduceShot, 'defense');
            next = Math.max(0, roundSteeringValue(next - reduce));
        }
    }
    return next;
}

function applyDamageToShip(b, attacker, defender, amount, label, { allowEvade = true, allowRandomEvasion = true } = {}) {
    let value = Math.max(0, roundSteeringValue(Number(amount) || 0));
    if (!defender || value <= 0) return 0;
    const attackerCommandId = attacker?.lastResolvingCommandId;
    if (maybeEvadeDamageByPosture(b, attacker, defender, allowRandomEvasion)) return 0;
    if (allowEvade) {
        const foolGear = findArcanaGear(defender, 'fool-evade');
        if (foolGear && !shouldPierceArcanaDefense(b, attacker, defender, foolGear)) {
            activateArcanaGear(b, defender, foolGear);
            if (value <= Number(foolGear.navalEffect.evadeMax || 1)) {
                defender.arcanaForceFacing = normalizeFacing(foolGear.navalEffect.setFacing || defender.facing);
                log(b, `${defender.label}は${formatSteeringValue(value)}負荷を回避した`);
                return 0;
            }
            const reduce = arcanaBonusValue(foolGear.navalEffect.reduce || 0.5)
                + arcanaElementBonus(b, defender, attacker, foolGear, 'defense');
            value = Math.max(0, roundSteeringValue(value - reduce));
            defender.arcanaForceFacing = normalizeFacing(foolGear.navalEffect.setFacing || defender.facing);
        }
        const enemyMissGear = isCannonCommand(attackerCommandId) ? findArcanaGear(defender, 'enemy-first-cannon-miss') : null;
        if (enemyMissGear && !shouldPierceArcanaDefense(b, attacker, defender, enemyMissGear)) {
            activateArcanaGear(b, defender, enemyMissGear);
            if (!enemyMissGear.navalEffect.sideOnly || isSideFacing(defender.facing)) return 0;
            const reduce = arcanaBonusValue(enemyMissGear.navalEffect.fallbackReduce || 0.5)
                + arcanaElementBonus(b, defender, attacker, enemyMissGear, 'defense');
            value = Math.max(0, roundSteeringValue(value - reduce));
        }
        const fogGear = value >= Number(findArcanaGear(defender, 'fog-danger-shot')?.navalEffect?.minDamage || 999)
            ? findArcanaGear(defender, 'fog-danger-shot')
            : null;
        if (fogGear && !shouldPierceArcanaDefense(b, attacker, defender, fogGear)) {
            activateArcanaGear(b, defender, fogGear);
            const reduceTo = arcanaBonusValue(fogGear.navalEffect.reduceTo ?? 0.5);
            const extraReduce = arcanaElementBonus(b, defender, attacker, fogGear, 'defense');
            value = Math.max(0, roundSteeringValue(Math.min(value, reduceTo) - extraReduce));
        }
    }
    const halveGear = value >= Number(findArcanaGear(defender, 'halve-big-hit')?.navalEffect?.minDamage || 999)
        ? findArcanaGear(defender, 'halve-big-hit')
        : null;
    if (halveGear && !shouldPierceArcanaDefense(b, attacker, defender, halveGear)) {
        activateArcanaGear(b, defender, halveGear);
        const reduce = arcanaBonusValue(halveGear.navalEffect.reduce || 0.5)
            + arcanaElementBonus(b, defender, attacker, halveGear, 'defense');
        value = Math.max(0, roundSteeringValue(value - reduce));
        defender.arcanaNextCannonBonus = Math.max(
            defender.arcanaNextCannonBonus || 0,
            arcanaBonusValue(halveGear.navalEffect.nextCannonBonus || 0.5)
        );
    }
    value = maybeReduceDamageByShipTrait(b, attacker, defender, value);
    if (defender.arcanaShield > 0) {
        const blocked = Math.min(value, defender.arcanaShield);
        value = roundSteeringValue(value - blocked);
        defender.arcanaShield = roundSteeringValue(defender.arcanaShield - blocked);
        if (blocked > 0) log(b, `${defender.label}の星灯りが${formatSteeringValue(blocked)}負荷を防いだ`);
    }
    if (defender.defenseBonus > 0 && value > 1) value -= defender.defenseBonus;
    value = Math.max(0, roundSteeringValue(value));
    defender.hp = clampSteeringValue(defender.hp - value, 0, defender.maxHp, 0);
    if (value > 0) log(b, `${label || '攻撃'}: ${defender.label}の操舵ゲージ -${formatSteeringValue(value)}`);
    maybeCounterAssaultByShipTrait(b, attacker, defender, value);
    const counterGear = value > 0 ? findArcanaGear(defender, 'counter-on-hit') : null;
    if (counterGear && attacker) {
        activateArcanaGear(b, defender, counterGear);
        const counterDamage = arcanaBonusValue(counterGear.navalEffect.damage || 0.5)
            + arcanaElementBonus(b, defender, attacker, counterGear, 'attack');
        attacker.hp = clampSteeringValue(attacker.hp - counterDamage, 0, attacker.maxHp, 0);
        log(b, `${arcanaDisplayName(counterGear)}: ${attacker.label}の操舵ゲージ -${formatSteeringValue(counterDamage)}`);
        checkLowSteeringArcana(b, attacker, defender);
    }
    checkLowSteeringArcana(b, defender, attacker);
    return value;
}

function checkLowSteeringArcana(b, ship, attacker = null) {
    if (!ship || ship.hp <= 0) return;
    const lowHeal = findArcanaGear(ship, 'low-hp-heal');
    if (lowHeal && ship.hp <= Math.max(0.5, roundSteeringValue(ship.maxHp * Number(lowHeal.navalEffect.threshold || 0.5)))) {
        activateArcanaGear(b, ship, lowHeal);
        const healed = healShip(ship, arcanaBonusValue(lowHeal.navalEffect.heal || 0.5)
            + arcanaElementBonus(b, ship, attacker, lowHeal, 'defense'));
        if (healed > 0) log(b, `${ship.label}は操舵ゲージを${formatSteeringValue(healed)}回復した`);
    }
    const star = findArcanaGear(ship, 'star-rescue');
    if (star && ship.hp <= Number(star.navalEffect.threshold || 1)) {
        activateArcanaGear(b, ship, star);
        const healed = healShip(ship, arcanaBonusValue(star.navalEffect.heal || 0.5)
            + arcanaElementBonus(b, ship, attacker, star, 'defense'));
        ship.arcanaShield = Math.max(ship.arcanaShield || 0, arcanaBonusValue(star.navalEffect.shield || 0.5));
        if (healed > 0) log(b, `${ship.label}は操舵ゲージを${formatSteeringValue(healed)}回復した`);
    }
    const cleanse = findArcanaGear(ship, 'cleanse-control');
    if (cleanse && ship.hp <= Number(cleanse.navalEffect.threshold || 0.5)) {
        activateArcanaGear(b, ship, cleanse);
        const healed = healShip(ship, arcanaBonusValue(cleanse.navalEffect.heal || 0.5)
            + arcanaElementBonus(b, ship, attacker, cleanse, 'defense'));
        if (cleanse.navalEffect.clearReload) ship.reload = 0;
        if (healed > 0) log(b, `${ship.label}は操舵ゲージを${formatSteeringValue(healed)}回復した`);
    }
}

function applyOpeningArcana(b, ship) {
    const gear = findArcanaGear(ship, 'opening-pierce-defense');
    if (!gear) return;
    activateArcanaGear(b, ship, gear);
    ship.arcanaIgnoreNextDefense = true;
}

function actionCategory(commandId, facing) {
    if (commandId === 'assault') return 'assault';
    if (commandId === 'bowCannon') return 'bow';
    if (commandId === 'broadside') return 'broadside';
    if (commandId === 'blankShot') return 'blank';
    if (commandId === 'portRudder') return isSideFacing(facing) ? 'return' : 'blank';
    if (commandId === 'starboardRudder') return isSideFacing(facing) ? 'return' : 'turn';
    if (commandIntent(commandId) === 'rudder') {
        return isSideFacing(facing) ? 'return' : 'turn';
    }
    return 'blank';
}

function addDamage(result, target, amount, label, source, kind = 'attack') {
    const value = Math.max(0, roundSteeringValue(amount));
    if (value <= 0) return;
    result.damages.push({ target, amount: value, label, source, kind });
}

function resolveActionMatrix(b, playerCommandId, enemyCommandId) {
    const result = {
        playerFacing: b.player.facing,
        enemyFacing: b.enemy.facing,
        damages: [],
        firedPlayer: isCannonCommand(playerCommandId),
        firedEnemy: isCannonCommand(enemyCommandId),
        logs: []
    };
    const pSide = isSideFacing(b.player.facing);
    const eSide = isSideFacing(b.enemy.facing);
    const p = actionCategory(playerCommandId, b.player.facing);
    const e = actionCategory(enemyCommandId, b.enemy.facing);
    const shipForSide = (side) => (side === 'player' ? b.player : b.enemy);
    const cannonDamage = (side, commandId) => cannonDamageForShip(shipForSide(side), commandId);
    const cannonLabel = (side, commandId, variant = '') => cannonDamageLabel(shipForSide(side), commandId, variant);
    const cannonBase = (side, commandId) => cannonCommandLabel(shipForSide(side), commandId);

    const setTurnFacing = (side, commandId, currentFacing) => {
        if (side === 'player') result.playerFacing = sideAfterRudder(commandId, currentFacing);
        else result.enemyFacing = sideAfterRudder(commandId, currentFacing);
    };
    const setFront = (side) => {
        if (side === 'player') result.playerFacing = 'front';
        else result.enemyFacing = 'front';
    };

    if (!pSide && !eSide) {
        if (p === 'assault' && e === 'assault') {
            addDamage(result, 'player', ASSAULT_DAMAGE, '正面衝突', 'enemy');
            addDamage(result, 'enemy', ASSAULT_DAMAGE, '正面衝突', 'player');
            result.logs.push('両船が正面衝突した。');
        } else if (p === 'assault' && e === 'bow') {
            addDamage(result, 'player', cannonDamage('enemy', 'bowCannon'), cannonLabel('enemy', 'bowCannon', 'intercept'), 'enemy');
        } else if (p === 'bow' && e === 'assault') {
            addDamage(result, 'enemy', cannonDamage('player', 'bowCannon'), cannonLabel('player', 'bowCannon', 'intercept'), 'player');
        } else if (p === 'assault' && e === 'turn') {
            addDamage(result, 'enemy', ASSAULT_DAMAGE, '突撃で旋回中断', 'player');
            setFront('player');
            setFront('enemy');
        } else if (p === 'turn' && e === 'assault') {
            addDamage(result, 'player', ASSAULT_DAMAGE, '突撃で旋回中断', 'enemy');
            setFront('player');
            setFront('enemy');
        } else if (p === 'bow' && e === 'bow') {
            addDamage(result, 'player', cannonDamage('enemy', 'bowCannon'), cannonLabel('enemy', 'bowCannon', 'exchange'), 'enemy');
            addDamage(result, 'enemy', cannonDamage('player', 'bowCannon'), cannonLabel('player', 'bowCannon', 'exchange'), 'player');
        } else if (p === 'bow' && e === 'turn') {
            setTurnFacing('enemy', enemyCommandId, b.enemy.facing);
            result.logs.push(`${b.enemy.label}は${cannonBase('player', 'bowCannon')}を回避した。`);
        } else if (p === 'turn' && e === 'bow') {
            setTurnFacing('player', playerCommandId, b.player.facing);
            result.logs.push(`${b.player.label}は${cannonBase('enemy', 'bowCannon')}を回避した。`);
        } else if (p === 'turn' && e === 'turn') {
            setTurnFacing('player', playerCommandId, b.player.facing);
            setTurnFacing('enemy', enemyCommandId, b.enemy.facing);
        } else if (p === 'turn') {
            setTurnFacing('player', playerCommandId, b.player.facing);
        } else if (e === 'turn') {
            setTurnFacing('enemy', enemyCommandId, b.enemy.facing);
        }
        return result;
    }

    const resolveFrontVsSide = (frontSide, frontCommandId, frontFacing, sideCommandId, sideFacing) => {
        const frontAction = actionCategory(frontCommandId, frontFacing);
        const sideAction = actionCategory(sideCommandId, sideFacing);
        const frontTarget = frontSide;
        const sideTarget = frontSide === 'player' ? 'enemy' : 'player';
        const setFrontFacing = (facing) => {
            if (frontSide === 'player') result.playerFacing = facing;
            else result.enemyFacing = facing;
        };
        const setSideFacing = (facing) => {
            if (sideTarget === 'player') result.playerFacing = facing;
            else result.enemyFacing = facing;
        };
        const frontLabel = frontSide === 'player' ? b.player.label : b.enemy.label;
        if (frontAction === 'assault' && sideAction === 'broadside') {
            addDamage(result, frontTarget, cannonDamage(sideTarget, 'broadside'), cannonLabel(sideTarget, 'broadside', 'interceptOf'), sideTarget);
            result.logs.push(`${frontLabel}の突撃は${cannonBase(sideTarget, 'broadside')}に止められた。`);
        } else if (frontAction === 'assault' && sideAction === 'blank') {
            addDamage(result, sideTarget, ASSAULT_DAMAGE, '空砲への突撃', frontTarget);
            setFrontFacing('front');
            setSideFacing('front');
        } else if (frontAction === 'assault' && sideAction === 'return') {
            addDamage(result, sideTarget, ASSAULT_DAMAGE, '突撃で方向転換中断', frontTarget);
            setFrontFacing('front');
            setSideFacing('front');
        } else if (frontAction === 'bow' && sideAction === 'broadside') {
            addDamage(result, frontTarget, cannonDamage(sideTarget, 'broadside'), cannonLabel(sideTarget, 'broadside'), sideTarget);
            addDamage(result, sideTarget, cannonDamage(frontTarget, 'bowCannon'), cannonLabel(frontTarget, 'bowCannon'), frontTarget);
        } else if (frontAction === 'bow' && sideAction === 'blank') {
            addDamage(result, sideTarget, cannonDamage(frontTarget, 'bowCannon'), cannonLabel(frontTarget, 'bowCannon'), frontTarget);
        } else if (frontAction === 'bow' && sideAction === 'return') {
            setSideFacing('front');
            result.logs.push(`${frontSide === 'player' ? b.enemy.label : b.player.label}は${cannonBase(frontTarget, 'bowCannon')}を回避して正面へ戻った。`);
        } else if (frontAction === 'turn' && sideAction === 'broadside') {
            setFrontFacing(sideAfterRudder(frontCommandId, frontFacing));
            result.logs.push(`${frontLabel}は${cannonBase(sideTarget, 'broadside')}を読んで回避した。`);
        } else if (frontAction === 'turn' && sideAction === 'blank') {
            addDamage(result, frontTarget, MISREAD_DAMAGE, '空砲への無駄な回避', sideTarget, 'misread');
            setFrontFacing(sideAfterRudder(frontCommandId, frontFacing));
        } else if (frontAction === 'turn' && sideAction === 'return') {
            setFrontFacing(sideAfterRudder(frontCommandId, frontFacing));
            setSideFacing('front');
        } else if (frontAction === 'turn') {
            setFrontFacing(sideAfterRudder(frontCommandId, frontFacing));
        } else if (sideAction === 'return') {
            setSideFacing('front');
        }
    };

    if (!pSide && eSide) {
        resolveFrontVsSide('player', playerCommandId, b.player.facing, enemyCommandId, b.enemy.facing);
        return result;
    }
    if (pSide && !eSide) {
        resolveFrontVsSide('enemy', enemyCommandId, b.enemy.facing, playerCommandId, b.player.facing);
        return result;
    }

    if (p === 'broadside' && e === 'broadside') {
        addDamage(result, 'player', cannonDamage('enemy', 'broadside'), cannonLabel('enemy', 'broadside', 'exchange'), 'enemy');
        addDamage(result, 'enemy', cannonDamage('player', 'broadside'), cannonLabel('player', 'broadside', 'exchange'), 'player');
    } else if (p === 'broadside' && e === 'blank') {
        addDamage(result, 'enemy', cannonDamage('player', 'broadside'), cannonLabel('player', 'broadside'), 'player');
    } else if (p === 'blank' && e === 'broadside') {
        addDamage(result, 'player', cannonDamage('enemy', 'broadside'), cannonLabel('enemy', 'broadside'), 'enemy');
    } else if (p === 'broadside' && e === 'return') {
        setFront('enemy');
        result.logs.push(`${b.enemy.label}は${cannonBase('player', 'broadside')}を回避して正面へ戻った。`);
    } else if (p === 'return' && e === 'broadside') {
        setFront('player');
        result.logs.push(`${b.player.label}は${cannonBase('enemy', 'broadside')}を回避して正面へ戻った。`);
    } else if (p === 'blank' && e === 'return') {
        addDamage(result, 'enemy', MISREAD_DAMAGE, '空砲への無駄な回避', 'player', 'misread');
        setFront('enemy');
    } else if (p === 'return' && e === 'blank') {
        addDamage(result, 'player', MISREAD_DAMAGE, '空砲への無駄な回避', 'enemy', 'misread');
        setFront('player');
    } else if (p === 'return' && e === 'return') {
        setFront('player');
        setFront('enemy');
    } else if (p === 'assault' && e === 'broadside') {
        addDamage(result, 'player', cannonDamage('enemy', 'broadside'), cannonLabel('enemy', 'broadside', 'interceptOf'), 'enemy');
    } else if (p === 'broadside' && e === 'assault') {
        addDamage(result, 'enemy', cannonDamage('player', 'broadside'), cannonLabel('player', 'broadside', 'interceptOf'), 'player');
    } else if (p === 'assault' && e === 'blank') {
        addDamage(result, 'enemy', ASSAULT_DAMAGE, '空砲への突撃', 'player');
        setFront('player');
        setFront('enemy');
    } else if (p === 'blank' && e === 'assault') {
        addDamage(result, 'player', ASSAULT_DAMAGE, '空砲への突撃', 'enemy');
        setFront('player');
        setFront('enemy');
    } else if (p === 'assault' && e === 'return') {
        addDamage(result, 'enemy', ASSAULT_DAMAGE, '突撃で方向転換中断', 'player');
        setFront('player');
        setFront('enemy');
    } else if (p === 'return' && e === 'assault') {
        addDamage(result, 'player', ASSAULT_DAMAGE, '突撃で方向転換中断', 'enemy');
        setFront('player');
        setFront('enemy');
    } else if (p === 'assault' && e === 'assault') {
        addDamage(result, 'player', ASSAULT_DAMAGE, '正面衝突', 'enemy');
        addDamage(result, 'enemy', ASSAULT_DAMAGE, '正面衝突', 'player');
        setFront('player');
        setFront('enemy');
    }
    return result;
}

function createCommandMatrixShip(label, facing) {
    return {
        label,
        facing: normalizeFacing(facing),
        weaponClass: 'cannon',
        weaponLabel: '砲撃',
        shipForm: 'fighter',
        reload: 0
    };
}

function analyzeCommandMatrixPair(playerFacing, enemyFacing, playerCommandId, enemyCommandId) {
    const base = {
        player: createCommandMatrixShip('自船', playerFacing),
        enemy: createCommandMatrixShip('敵船', enemyFacing)
    };
    const result = resolveActionMatrix(base, playerCommandId, enemyCommandId);
    const playerDamage = result.damages
        .filter((entry) => entry.target === 'player')
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const enemyDamage = result.damages
        .filter((entry) => entry.target === 'enemy')
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const score = roundSteeringValue(enemyDamage - playerDamage);
    const playerDodgedShot = result.firedEnemy && playerDamage <= 0 && commandIntent(playerCommandId) === 'rudder';
    const enemyDodgedShot = result.firedPlayer && enemyDamage <= 0 && commandIntent(enemyCommandId) === 'rudder';
    const tacticalScore = roundSteeringValue(score + (playerDodgedShot ? 0.5 : 0) - (enemyDodgedShot ? 0.5 : 0));
    let outcome = 'draw';
    if (tacticalScore > 0) outcome = 'win';
    if (tacticalScore < 0) outcome = 'loss';
    return {
        playerCommandId,
        playerCommandLabel: commandLabel(playerCommandId, base.player),
        enemyCommandId,
        enemyCommandLabel: commandLabel(enemyCommandId, base.enemy),
        playerDamage: roundSteeringValue(playerDamage),
        enemyDamage: roundSteeringValue(enemyDamage),
        score,
        tacticalScore,
        outcome,
        playerDodgedShot,
        enemyDodgedShot,
        nextPlayerFacing: normalizeFacing(result.playerFacing),
        nextPlayerFacingLabel: FACING_LABEL[normalizeFacing(result.playerFacing)] || '正面',
        nextEnemyFacing: normalizeFacing(result.enemyFacing),
        nextEnemyFacingLabel: FACING_LABEL[normalizeFacing(result.enemyFacing)] || '正面',
        playerReload: result.firedPlayer ? RELOAD_TURNS : 0,
        enemyReload: result.firedEnemy ? RELOAD_TURNS : 0
    };
}

function summarizeCommandMatrixRow(cells) {
    const count = Math.max(1, cells.length);
    const averageScore = roundSteeringValue(cells.reduce((sum, cell) => sum + Number(cell.score || 0), 0) / count);
    const worstScore = roundSteeringValue(Math.min(...cells.map((cell) => Number(cell.score || 0))));
    const averageTacticalScore = roundSteeringValue(cells.reduce((sum, cell) => sum + Number(cell.tacticalScore || 0), 0) / count);
    const worstTacticalScore = roundSteeringValue(Math.min(...cells.map((cell) => Number(cell.tacticalScore || 0))));
    let verdict = 'normal';
    let verdictLabel = '';
    if (averageTacticalScore >= 0.5 && worstTacticalScore >= -0.5) {
        verdict = 'strong';
        verdictLabel = '定石候補';
    } else if (averageTacticalScore <= -0.5 || worstTacticalScore <= -1.5) {
        verdict = 'weak';
        verdictLabel = '不利候補';
    }
    return {
        averageScore,
        worstScore,
        averageTacticalScore,
        worstTacticalScore,
        verdict,
        verdictLabel
    };
}

function analyzeCommandMatrix() {
    const frontCommands = ['assault', 'bowCannon', 'starboardRudder'];
    const sideCommands = ['broadside', 'blankShot', 'portRudder'];
    const states = [
        { id: 'front_front', label: '正面 vs 正面', playerFacing: 'front', enemyFacing: 'front', playerCommands: frontCommands, enemyCommands: frontCommands },
        { id: 'front_side', label: '正面 vs 横向き', playerFacing: 'front', enemyFacing: 'starboard', playerCommands: frontCommands, enemyCommands: sideCommands },
        { id: 'side_front', label: '横向き vs 正面', playerFacing: 'starboard', enemyFacing: 'front', playerCommands: sideCommands, enemyCommands: frontCommands },
        { id: 'side_side', label: '横向き vs 横向き', playerFacing: 'starboard', enemyFacing: 'starboard', playerCommands: sideCommands, enemyCommands: sideCommands }
    ];
    return {
        mode: 'basic',
        note: '基本ルールのみ。実戦では回避率・艤装・船能力で変化します。',
        states: states.map((state) => {
            const enemyCommands = state.enemyCommands.map((commandId) => ({
                id: commandId,
                label: commandLabel(commandId, createCommandMatrixShip('敵船', state.enemyFacing))
            }));
            const rows = state.playerCommands.map((commandId) => {
                const cells = state.enemyCommands.map((enemyCommandId) => (
                    analyzeCommandMatrixPair(state.playerFacing, state.enemyFacing, commandId, enemyCommandId)
                ));
                return {
                    commandId,
                    label: commandLabel(commandId, createCommandMatrixShip('自船', state.playerFacing)),
                    summary: summarizeCommandMatrixRow(cells),
                    cells
                };
            });
            return {
                id: state.id,
                label: state.label,
                playerFacing: state.playerFacing,
                playerFacingLabel: FACING_LABEL[state.playerFacing] || '正面',
                enemyFacing: state.enemyFacing,
                enemyFacingLabel: FACING_LABEL[state.enemyFacing] || '正面',
                enemyCommands,
                rows
            };
        })
    };
}

function checkReviveOrCancel(b, ship, foe) {
    if (!ship || ship.hp > 0) return;
    const cancel = findArcanaGear(ship, 'cancel-first-stun');
    if (cancel) {
        if (shouldPierceArcanaDefense(b, foe, ship, cancel)) return;
        activateArcanaGear(b, ship, cancel);
        ship.hp = Math.min(arcanaBonusValue(cancel.navalEffect.hp || 0.5), ship.maxHp);
        return;
    }
    const revive = findArcanaGear(ship, 'revive-on-ko');
    if (revive) {
        if (shouldPierceArcanaDefense(b, foe, ship, revive)) return;
        activateArcanaGear(b, ship, revive);
        ship.hp = Math.min(arcanaBonusValue(revive.navalEffect.hp || 0.5), ship.maxHp);
        if (foe) foe.hp = clampSteeringValue(foe.hp - arcanaBonusValue(revive.navalEffect.enemyStun || 0), 0, foe.maxHp, 0);
    }
}

function checkBattleTransition(b) {
    checkReviveOrCancel(b, b.player, b.enemy);
    checkReviveOrCancel(b, b.enemy, b.player);
    if (b.player.hp <= 0 && b.enemy.hp <= 0) {
        log(b, '両船が制御を失った。対等条件で白兵戦へ移行する。');
        finishBattle(b, 'boarding');
        return true;
    }
    if (b.enemy.hp <= 0) {
        log(b, `${b.enemy.label}が操舵不能。接舷できる！`);
        return false;
    }
    if (b.player.hp <= 0) {
        log(b, `${b.player.label}が操舵不能。敵船が接舷してくる！`);
        finishBattle(b, 'boarded');
        return true;
    }
    return false;
}

function completeReload(ship, firedThisTurn) {
    if (firedThisTurn) {
        ship.reload = RELOAD_TURNS;
    } else if (ship.reload > 0) {
        ship.reload = Math.max(0, ship.reload - 1);
    }
}

function maybeBlockOpportunity(b, actor, target, commandId) {
    const gear = findArcanaGear(target, 'block-enemy-opportunity');
    if (!gear) return false;
    const commands = Array.isArray(gear.navalEffect.commands) ? gear.navalEffect.commands : ['boarding'];
    if (!commands.includes(commandId)) return false;
    activateArcanaGear(b, target, gear);
    log(b, `${actor.label}の${commandLabel(commandId, actor)}は${target.label}の封鎖艤装に止められた`);
    return true;
}

function maybeLockRudderAfterAssault(b, attacker, defender, commandId, dealtDamage) {
    if (commandId !== 'assault' || dealtDamage <= 0) return;
    const gear = findArcanaGear(attacker, 'lock-rudder-on-assault');
    if (!gear) return;
    activateArcanaGear(b, attacker, gear);
    setArcanaCommandLock(defender, 'rudder', gear.navalEffect.turns || 1);
    log(b, `${defender.label}の次の面舵/取舵が封じられた`);
}

function applyWorldReadingBonus(b, owner, target, dealtByOwner, dealtByTarget) {
    if (!owner || !target || dealtByOwner <= 0 || dealtByTarget > 0) return 0;
    const gear = findArcanaGear(owner, 'extra-action-after-command');
    if (!gear) return 0;
    activateArcanaGear(b, owner, gear);
    if (gear.navalEffect.clearReload) owner.reload = 0;
    return applyDamageToShip(
        b,
        owner,
        target,
        arcanaBonusValue(gear.navalEffect.winningReadBonus || 0.5),
        arcanaDisplayName(gear),
        { allowEvade: false, allowRandomEvasion: false }
    );
}

function createTurnVisualState(b, playerCommandId, enemyCommandId, damageByTarget = {}, dealtBySource = {}, previousFacing = {}, evadedByTarget = {}) {
    if (!b) return null;
    const playerPose = visualPoseForCommand('player', playerCommandId, previousFacing.player || b.player.facing);
    const enemyPose = visualPoseForCommand('enemy', enemyCommandId, previousFacing.enemy || b.enemy.facing);
    const effects = [];
    const addCallout = (source, commandId) => {
        const ship = source === 'player' ? b.player : b.enemy;
        const text = commandCallout(commandId, ship);
        if (!text) return;
        effects.push({
            type: 'callout',
            source,
            text
        });
    };
    const addShot = (source, sourceCommandId, target, targetCommandId) => {
        if (!isCannonCommand(sourceCommandId)) return;
        const dealt = Number(dealtBySource[source] || 0);
        const pendingDamage = Number(damageByTarget[target] || 0);
        const dodgeDirection = rudderDodgeDirection(target, targetCommandId, previousFacing[target]);
        const postureEvaded = (evadedByTarget[target] || []).some((entry) => (
            entry.source === source && entry.commandId === sourceCommandId
        ));
        const dodged = (Boolean(dodgeDirection) && dealt <= 0 && pendingDamage <= 0) || postureEvaded;
        effects.push({
            type: 'shot',
            source,
            target,
            commandId: sourceCommandId,
            miss: dodged,
            dodgeDirection
        });
    };

    addCallout('player', playerCommandId);
    addCallout('enemy', enemyCommandId);
    addShot('player', playerCommandId, 'enemy', enemyCommandId);
    addShot('enemy', enemyCommandId, 'player', playerCommandId);

    return {
        token: `${Date.now()}:${b.turn}:${playerCommandId}:${enemyCommandId}`,
        playerPose,
        enemyPose,
        playerHit: Number(damageByTarget.player || 0) > 0,
        enemyHit: Number(damageByTarget.enemy || 0) > 0,
        playerSurge: playerCommandId === 'assault',
        enemySurge: enemyCommandId === 'assault',
        impactShake: Number(dealtBySource.player || 0) > 0 || Number(dealtBySource.enemy || 0) > 0,
        effects
    };
}

function createBoardingVisualState(b, outcome) {
    const playerBoards = outcome === 'boarding';
    return {
        token: `${Date.now()}:${b?.turn || 0}:${outcome}:boarding`,
        type: 'boarding',
        playerPose: 'front',
        enemyPose: 'front',
        playerBoarding: playerBoards,
        enemyBoarding: !playerBoards,
        playerHit: false,
        enemyHit: false,
        impactShake: true,
        effects: [
            {
                type: 'callout',
                source: playerBoards ? 'player' : 'enemy',
                text: commandCallout('boarding', playerBoards ? b.player : b.enemy)
            },
            {
                type: 'boarding',
                source: playerBoards ? 'player' : 'enemy'
            }
        ]
    };
}

function playBoardingTransition(b, outcome) {
    if (!b) return;
    if (navalBoardingTimer) {
        clearTimeout(navalBoardingTimer);
        navalBoardingTimer = null;
    }
    b.visualState = createBoardingVisualState(b, outcome);
    render(b);
    notifyStateChanged(b);
    navalBoardingTimer = setTimeout(() => {
        navalBoardingTimer = null;
        if (battle !== b || !b.finished || b.outcome !== outcome) return;
        closeNavalBattle();
        startMeleeCombat();
    }, NAVAL_BOARDING_MOTION_MS);
}

function resolveSimultaneousCommands(b) {
    if (!b || b.finished) return false;
    const playerCommandId = normalizeCommandId(b.player.pendingCommandId);
    const enemyCommandId = normalizeCommandId(b.enemy.pendingCommandId);
    if (!playerCommandId || !enemyCommandId) return false;
    const previousFacing = {
        player: normalizeFacing(b.player.facing),
        enemy: normalizeFacing(b.enemy.facing)
    };

    if (playerCommandId === 'boarding' && b.enemy.hp <= 0) {
        if (maybeBlockOpportunity(b, b.player, b.enemy, playerCommandId)) {
            b.player.pendingCommandId = null;
            b.enemy.pendingCommandId = null;
            render(b);
            notifyStateChanged(b);
            return true;
        }
        log(b, `${b.player.label}が接舷した！ 白兵戦へ移行する`);
        finishBattle(b, 'boarding');
        return true;
    }
    if (enemyCommandId === 'boarding' && b.player.hp <= 0) {
        if (maybeBlockOpportunity(b, b.enemy, b.player, enemyCommandId)) {
            b.player.pendingCommandId = null;
            b.enemy.pendingCommandId = null;
            render(b);
            notifyStateChanged(b);
            return true;
        }
        log(b, `${b.enemy.label}が接舷した！ 白兵戦へ移行する`);
        finishBattle(b, 'boarded');
        return true;
    }
    tickArcanaCommandLocks(b.player);
    tickArcanaCommandLocks(b.enemy);
    b.count += 1;
    b.turn += 1;
    b.player.lastCommandId = playerCommandId;
    b.enemy.lastCommandId = enemyCommandId;
    b.player.lastResolvingCommandId = playerCommandId;
    b.enemy.lastResolvingCommandId = enemyCommandId;
    b.player.arcanaAssaultBroadsideGuard = 0;
    b.enemy.arcanaAssaultBroadsideGuard = 0;
    b.player.shipTraitBypassEvasion = false;
    b.enemy.shipTraitBypassEvasion = false;
    b.player.shipTraitAssaultBroadsideGuard = 0;
    b.enemy.shipTraitAssaultBroadsideGuard = 0;
    b.turnEvasions = [];

    log(b, `第${b.turn}合: ${b.player.label}「${commandLabel(playerCommandId, b.player)}」 / ${b.enemy.label}「${commandLabel(enemyCommandId, b.enemy)}」`);
    const result = resolveActionMatrix(b, playerCommandId, enemyCommandId);
    result.logs.forEach((entry) => log(b, entry));

    const damageByTarget = { player: 0, enemy: 0 };
    const labelsByTarget = { player: [], enemy: [] };
    result.damages.forEach((entry) => {
        const sourceShip = entry.source === 'player' ? b.player : b.enemy;
        const targetShip = entry.target === 'player' ? b.player : b.enemy;
        const sourceCommand = entry.source === 'player' ? playerCommandId : enemyCommandId;
        const targetCommand = entry.target === 'player' ? playerCommandId : enemyCommandId;
        let nextAmount = maybeBoostAttack(b, sourceShip, targetShip, sourceCommand, targetCommand, entry.amount, entry);
        if (sourceCommand === 'broadside' && targetCommand === 'assault') {
            const ramGear = findArcanaGear(targetShip, 'ram-boost');
            if (ramGear) {
                activateArcanaGear(b, targetShip, ramGear);
                targetShip.arcanaAssaultBroadsideGuard = arcanaBonusValue(ramGear.navalEffect.broadsideGuard || 0.5)
                    + arcanaElementBonus(b, targetShip, sourceShip, ramGear, 'defense');
            }
            if (targetShip.arcanaAssaultBroadsideGuard > 0) {
                const guarded = Math.min(nextAmount, targetShip.arcanaAssaultBroadsideGuard);
                nextAmount = Math.max(0, roundSteeringValue(nextAmount - guarded));
                log(b, `${targetShip.label}の衝角艤装が舷側迎撃を${formatSteeringValue(guarded)}軽減した`);
                targetShip.arcanaAssaultBroadsideGuard = 0;
            }
            if (targetShip.shipTraitAssaultBroadsideGuard > 0) {
                const guarded = Math.min(nextAmount, targetShip.shipTraitAssaultBroadsideGuard);
                nextAmount = Math.max(0, roundSteeringValue(nextAmount - guarded));
                log(b, `${targetShip.label}の${targetShip.shipTraitName || '固有能力'}が舷側迎撃を${formatSteeringValue(guarded)}軽減した`);
                targetShip.shipTraitAssaultBroadsideGuard = 0;
            }
        }
        const appliedAmount = roundSteeringValue(nextAmount);
        if (appliedAmount > 0) {
            damageByTarget[entry.target] += appliedAmount;
            if (entry.label) labelsByTarget[entry.target].push(entry.label);
        }
    });

    const dealtBySource = { player: 0, enemy: 0 };
    if (damageByTarget.player > 0) {
        const dealt = applyDamageToShip(b, b.enemy, b.player, damageByTarget.player, labelsByTarget.player.join(' / ') || '海戦結果');
        dealtBySource.enemy += dealt;
        maybeLockRudderAfterAssault(b, b.enemy, b.player, enemyCommandId, dealt);
        maybeApplyShipTraitAfterDamage(b, b.enemy, b.player, enemyCommandId, dealt);
    }
    if (damageByTarget.enemy > 0) {
        const dealt = applyDamageToShip(b, b.player, b.enemy, damageByTarget.enemy, labelsByTarget.enemy.join(' / ') || '海戦結果');
        dealtBySource.player += dealt;
        maybeLockRudderAfterAssault(b, b.player, b.enemy, playerCommandId, dealt);
        maybeApplyShipTraitAfterDamage(b, b.player, b.enemy, playerCommandId, dealt);
    }
    const evadedByTarget = { player: [], enemy: [] };
    (Array.isArray(b.turnEvasions) ? b.turnEvasions : []).forEach((entry) => {
        if (entry?.target === 'player' || entry?.target === 'enemy') {
            evadedByTarget[entry.target].push(entry);
        }
    });

    b.player.facing = normalizeFacing(b.player.arcanaForceFacing || result.playerFacing);
    b.enemy.facing = normalizeFacing(b.enemy.arcanaForceFacing || result.enemyFacing);
    b.player.arcanaForceFacing = null;
    b.enemy.arcanaForceFacing = null;
    completeReload(b.player, result.firedPlayer);
    completeReload(b.enemy, result.firedEnemy);
    b.player.pendingCommandId = null;
    b.enemy.pendingCommandId = null;
    b.player.lastResolvingCommandId = null;
    b.enemy.lastResolvingCommandId = null;

    const fatePlayer = findArcanaGear(b.player, 'fate-turn');
    if (fatePlayer && b.player.hp < b.enemy.hp) {
        activateArcanaGear(b, b.player, fatePlayer);
        b.player.facing = 'front';
        if (fatePlayer.navalEffect.clearReload) b.player.reload = 0;
    }
    const fateEnemy = findArcanaGear(b.enemy, 'fate-turn');
    if (fateEnemy && b.enemy.hp < b.player.hp) {
        activateArcanaGear(b, b.enemy, fateEnemy);
        b.enemy.facing = 'front';
        if (fateEnemy.navalEffect.clearReload) b.enemy.reload = 0;
    }
    dealtBySource.player += applyWorldReadingBonus(b, b.player, b.enemy, dealtBySource.player, dealtBySource.enemy);
    dealtBySource.enemy += applyWorldReadingBonus(b, b.enemy, b.player, dealtBySource.enemy, dealtBySource.player);
    b.visualState = createTurnVisualState(b, playerCommandId, enemyCommandId, damageByTarget, dealtBySource, previousFacing, evadedByTarget);

    if (checkBattleTransition(b)) return true;
    render(b);
    notifyStateChanged(b);
    return true;
}

function chooseAiCommand(b) {
    const self = b.enemy;
    const foe = b.player;
    const commands = availableCommands(b, self, foe);
    if (!commands.length) return '';
    if (foe.hp <= 0) return 'boarding';
    const plan = b.enemyPlan || ENEMY_PLANS[0];
    if (isSideFacing(self.facing)) {
        if (self.reload <= 0 && Math.random() < plan.sideGun && commands.some((def) => def.id === 'broadside')) return 'broadside';
        if (Math.random() < plan.feint && commands.some((def) => def.id === 'blankShot')) return 'blankShot';
        if (commands.some((def) => def.id === 'portRudder')) return 'portRudder';
    }
    if (self.reload <= 0 && Math.random() < plan.bow && commands.some((def) => def.id === 'bowCannon')) return 'bowCannon';
    if (Math.random() < plan.assault && commands.some((def) => def.id === 'assault')) return 'assault';
    const rudders = commands.filter((def) => def.id === 'starboardRudder' || def.id === 'portRudder');
    if (rudders.length) return rudders[Math.floor(Math.random() * rudders.length)].id;
    return commands[0].id;
}

function selectCommand(b, self, foe, def) {
    if (!canSelect(b, self, foe, def)) return false;
    const commandId = normalizeCommandId(def.id);
    if (commandId === 'boarding') {
        if (maybeBlockOpportunity(b, self, foe, commandId)) {
            render(b);
            notifyStateChanged(b);
            return true;
        }
        log(b, `${self.label}が接舷した！ 白兵戦へ移行する`);
        finishBattle(b, self.isPlayer ? 'boarding' : 'boarded');
        return true;
    }
    self.pendingCommandId = commandId;
    log(b, `${self.label}が「${commandLabel(commandId, self)}」を選択`);
    if (!b.options.disableAi && self.isPlayer && !foe.pendingCommandId && foe.hp > 0) {
        const aiCommand = chooseAiCommand(b);
        if (aiCommand) {
            foe.pendingCommandId = aiCommand;
            log(b, `${foe.label}が「${commandLabel(aiCommand, foe)}」を選択`);
        }
    }
    resolveSimultaneousCommands(b);
    render(b);
    notifyStateChanged(b);
    return true;
}

function normalizeExplorationCandidates(profile = {}) {
    const source = asObject(profile);
    const candidates = [
        source.explorationCandidates,
        source.explorationRewards,
        source.reports,
        source.destinations,
        source.playerShip?.explorationCandidates
    ].find(Array.isArray) || [];
    return candidates
        .map((entry) => String(entry?.name || entry?.destinationName || entry?.label || entry?.id || entry || '').trim())
        .filter(Boolean)
        .slice(0, 3);
}

function resolveChipPool(profile = {}) {
    const source = asObject(profile);
    const value = Number(
        source.chips
        ?? source.chip
        ?? source.points
        ?? source.balance
        ?? source.troyChips
        ?? 0
    );
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function createRewardModel(options = {}, playerShip, enemyShip) {
    const opponentProfile = asObject(options.opponentProfile || options.rewardProfile);
    const chipPool = resolveChipPool(opponentProfile);
    const explorationCandidates = normalizeExplorationCandidates(opponentProfile);
    return {
        chipPool,
        targetShip: enemyShip?.shipType || '船',
        targetCargoText: enemyShip?.cargoText || '空',
        targetCargoTotal: Math.max(0, Number(enemyShip?.cargoTotal || 0) || 0),
        topCargo: enemyShip?.topCargo || null,
        explorationCandidates,
        limits: PLUNDER_LIMITS,
        risk: REPAIR_RISK,
        note: '実資産の移動はサーバー検証API接続後に確定'
    };
}

function estimateChipReward(model, limit) {
    if (model.chipPool > 0) {
        return Math.min(limit.chips, Math.max(1, Math.floor(model.chipPool * 0.08)));
    }
    return limit.chips;
}

function estimateCargoReward(model, limit) {
    const top = model.topCargo;
    if (top?.id && top.amount > 0) {
        return {
            id: top.id,
            amount: Math.min(limit.cargo, Math.max(1, Math.floor(top.amount * 0.25)))
        };
    }
    if (model.targetCargoTotal > 0) {
        return { id: '貨物', amount: Math.min(limit.cargo, Math.max(1, Math.floor(model.targetCargoTotal * 0.2))) };
    }
    return { id: '貨物候補', amount: limit.cargo };
}

function resolveOutcomeReward(b, outcome) {
    const model = b.reward || createRewardModel(b.options, b.player, b.enemy);
    if (outcome === 'victory' || outcome === 'cargoRaid') {
        const limit = PLUNDER_LIMITS[outcome === 'victory' ? 'victory' : 'cargoRaid'];
        const cargo = estimateCargoReward(model, limit);
        const exploration = model.explorationCandidates.slice(0, limit.exploration);
        return {
            outcome,
            label: outcome === 'victory' ? '制圧勝利' : '撤退',
            chips: estimateChipReward(model, limit),
            cargo,
            exploration,
            capped: true,
            note: '店内ゲーム用に少量上限で計算'
        };
    }
    if (outcome === 'defeat' || outcome === 'boarded' || outcome === 'enemyCargoRaid') {
        return {
            outcome,
            label: outcome === 'enemyCargoRaid' ? '略奪された' : '敗北リスク',
            repairChips: REPAIR_RISK.chips,
            cooldownMinutes: REPAIR_RISK.cooldownMinutes,
            note: '修理費/クールダウン候補'
        };
    }
    if (outcome === 'standoff') {
        return { outcome, label: '双方離脱', note: '決着せず離脱。戦利品なし。' };
    }
    return {
        outcome,
        label: '白兵戦へ移行',
        note: '接舷後の勝敗は白兵戦側で判定'
    };
}

function formatRewardResult(result) {
    if (!result) return '';
    if (result.outcome === 'victory' || result.outcome === 'cargoRaid') {
        const cargo = result.cargo ? `${result.cargo.id} x${result.cargo.amount}` : '貨物なし';
        const exploration = result.exploration?.length ? ` / ${result.exploration.join('、')}` : '';
        return `戦利品候補: チップ${result.chips} / ${cargo}${exploration}。${result.note}`;
    }
    if (result.repairChips) {
        return `リスク: 修理費チップ${result.repairChips}、クールダウン${result.cooldownMinutes}分。${result.note}`;
    }
    return result.note || '';
}

const OUTCOME_TEXT = {
    victory: { title: '制圧勝利！', body: '敵船の操舵を奪い、船倉を確保した。' },
    defeat: { title: '敗北…', body: '自船が操舵不能になった。修理と再出撃準備が必要。' },
    escape: { title: '離脱成功', body: '敵から離脱した。戦利品はないが損失も最小。' },
    enemyEscaped: { title: '敵に離脱された', body: '相手は海域から離脱した。' },
    cargoRaid: { title: '撤退', body: '深追いせず撤退した。' },
    enemyCargoRaid: { title: '敵が撤退', body: '相手が深追いせず撤退した。' },
    boarding: { title: '接舷成功！', body: '白兵戦へ移行する！' },
    boarded: { title: '接舷された！', body: '敵が乗り込んでくる！ 白兵戦へ移行する！' },
    standoff: { title: '双方離脱', body: '決着がつかず、互いに距離を取った。' }
};

function showBattleResultOverlay(b) {
    if (!b || b.outcome === 'boarding' || b.outcome === 'boarded') return;
    const text = OUTCOME_TEXT[b.outcome] || { title: '海戦終了', body: '' };
    const overlay = document.getElementById('navalBattleResult');
    if (overlay) {
        overlay.querySelector('.naval-result-title').textContent = text.title;
        overlay.querySelector('.naval-result-body').textContent = [text.body, formatRewardResult(b.rewardResult)].filter(Boolean).join('\n');
        overlay.hidden = false;
    }
}

function finishBattle(b, outcome) {
    if (b.finished) return;
    b.finished = true;
    b.outcome = outcome;
    b.rewardResult = resolveOutcomeReward(b, outcome);

    if (outcome === 'boarding' || outcome === 'boarded') {
        playBoardingTransition(b, outcome);
        return;
    }
    render(b);
    notifyStateChanged(b);
    showBattleResultOverlay(b);
}

function handleResultClose() {
    const b = battle;
    closeNavalBattle();
    if (!b) return;
    const callbacks = {
        victory: b.options.onVictory,
        defeat: b.options.onDefeat,
        escape: b.options.onEscape,
        enemyEscaped: b.options.onEnemyEscaped,
        cargoRaid: b.options.onCargoRaid,
        enemyCargoRaid: b.options.onEnemyCargoRaid,
        standoff: b.options.onStandoff
    };
    const cb = callbacks[b.outcome];
    if (typeof cb === 'function') cb(b.options.opponentId, b.rewardResult);
}

function getTacticalMessage(b) {
    if (!b || b.finished) return '';
    if (b.player.pendingCommandId) return '相手の入力を待っています。';
    if (b.enemy.hp <= 0) return '接舷好機：相手が操舵不能。';
    if (b.player.hp <= 1) return '操舵危険：次の被弾で接舷される可能性が高い。';
    if (hasElementAdvantage(b.player.element, b.enemy.element) && !b.player.elementAdvantageUsed) return '属性優勢：初回命中に+1負荷。';
    if (hasElementAdvantage(b.enemy.element, b.player.element) && !b.enemy.elementAdvantageUsed) return '属性不利：相手の初回命中+1に注意。';
    if (isSideFacing(b.enemy.facing) && b.enemy.reload <= 0) return `横腹警戒：相手の${cannonCommandLabel(b.enemy, 'broadside')}は${formatSteeringValue(cannonDamageForShip(b.enemy, 'broadside'))}負荷。取舵や面舵で読める。`;
    if (isSideFacing(b.player.facing) && b.player.reload <= 0) return `${cannonCommandLabel(b.player, 'broadside')}好機：横向きから強い攻撃を狙える。`;
    if (b.player.reload > 0) return '再装填中：この手は射撃不可。突撃・操舵・空砲で読む。';
    return `読み合い：突撃は旋回に強く、${cannonCommandLabel(b.player, 'bowCannon')}は突撃に強く、面舵は正面射撃を避ける。`;
}

function startMeleeCombat() {
    console.log('[NavalBattle] startMeleeCombat() — 白兵戦システムへ移行');
    const b = battle;
    if (b && typeof b.options.onBoarding === 'function') {
        const playerId = b.options.playerId || b.options.selfId || b.options.playFabId || null;
        const opponentId = b.options.opponentId || null;
        const boardedPlayerId = b.outcome === 'boarding' ? opponentId : playerId;
        const boardingPlayerId = b.outcome === 'boarding' ? playerId : opponentId;
        b.options.onBoarding(opponentId, {
            source: 'navalPlunder',
            navalOutcome: b.outcome || null,
            boardedPlayerId: boardedPlayerId || null,
            boardingPlayerId: boardingPlayerId || null
        });
    }
}

function closeNavalBattle() {
    const modal = document.getElementById('navalBattleModal');
    if (modal) modal.classList.remove('is-open');
    document.body.classList.remove('naval-battle-lock');
    if (navalBoardingTimer) {
        clearTimeout(navalBoardingTimer);
        navalBoardingTimer = null;
    }
    if (navalVisualClearTimer) {
        clearTimeout(navalVisualClearTimer);
        navalVisualClearTimer = null;
    }
}

const NAVAL_CSS = `
#navalBattleModal { position: fixed; inset: 0; z-index: 6000; display: none; align-items: center; justify-content: center; background: rgba(4, 12, 18, 0.86); padding: 12px; }
#navalBattleModal.is-open { display: flex; }
body.naval-battle-lock { overflow: hidden; }
.naval-shell { width: min(620px, 100%); max-height: min(96vh, 920px); overflow-y: auto; border: 1px solid transparent; border-image: url("./assets/ui/panels/panel-dark-gold.png") 32 fill / 14px / 0 stretch; border-radius: 8px; padding: 14px; color: #edf7f4; font-size: 13px; background: radial-gradient(ellipse at 18% 0%, rgba(253, 230, 138, 0.18), transparent 36%), linear-gradient(180deg, rgba(16, 11, 7, 0.42), rgba(2, 4, 7, 0.88)); box-shadow: 0 22px 60px rgba(0,0,0,0.42); }
.naval-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.naval-title-block { min-width: 0; }
.naval-head h3 { margin: 0; font-size: 17px; letter-spacing: 0; }
.naval-subtitle { margin-top: 2px; color: #a9c6bf; font-size: 11px; }
.naval-close { width: 34px; height: 34px; display: grid; place-items: center; background: #152724; border: 1px solid #4a6661; border-radius: 8px; color: #d7e7e2; font-size: 20px; cursor: pointer; padding: 0; flex: 0 0 auto; }
.naval-close:hover { background: #203631; }
.naval-round { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: rgba(8, 19, 25, 0.82); border: 1px solid rgba(244, 211, 126, 0.32); border-radius: 8px; margin-bottom: 10px; padding: 8px 10px; color: #f4d37e; font-weight: 800; }
.naval-round small { color: #9fc2ba; font-weight: 700; }
.naval-battle-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 8px; }
.naval-sea { position: relative; min-height: 306px; border: 1px solid transparent; border-image: url("./assets/ui/panels/panel-navy-wide.png") 34 / 12px / 0 stretch; border-radius: 6px; background: linear-gradient(180deg, rgba(8, 47, 73, 0.06) 0%, rgba(5, 12, 18, 0.1) 42%, rgba(6, 24, 36, 0.28) 100%), url("./Sprites/background/sea.webp") center -50px / auto 150% no-repeat; overflow: hidden; isolation: isolate; }
.naval-sea.is-impact-shake { animation: navalImpactShake 360ms cubic-bezier(0.18, 0.84, 0.24, 1) both; }
.naval-sea::before { content: ""; position: absolute; inset: 8px; border-radius: 4px; box-shadow: inset 0 0 42px rgba(0, 0, 0, 0.46), inset 0 0 0 1px rgba(255, 240, 180, 0.08); pointer-events: none; z-index: 1; }
.naval-sea::after { content: ""; position: absolute; left: -20%; right: -20%; bottom: 18px; height: 80px; background: repeating-linear-gradient(172deg, rgba(219, 246, 239, 0.18) 0 2px, transparent 2px 24px); opacity: 0.46; animation: navalSeaDrift 5s linear infinite; pointer-events: none; z-index: 0; }
.naval-distance-label { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); min-width: 120px; text-align: center; color: #ffe5a3; background: rgba(9, 26, 31, 0.72); border: 1px solid rgba(244, 211, 126, 0.36); border-radius: 999px; font-size: 12px; font-weight: 700; padding: 3px 10px; z-index: 4; }
.naval-effect-layer { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.naval-ship { position: absolute; width: 112px; text-align: center; transition: left 240ms ease, top 240ms ease, transform 240ms ease; z-index: 3; }
.naval-ship-sprite-wrap { position: relative; width: 88px; height: 82px; margin: 0 auto; display: grid; place-items: center; }
.naval-ship-shadow { position: absolute; left: 14px; right: 14px; bottom: 7px; height: 18px; border-radius: 50%; background: rgba(0, 0, 0, 0.3); filter: blur(2px); transform: scaleX(1.25); }
.naval-ship-wake { position: absolute; left: 12px; right: 12px; bottom: 4px; height: 16px; border-radius: 50%; border-top: 2px solid rgba(210, 246, 240, 0.42); opacity: 0.68; }
.naval-ship-sprite { position: relative; width: 64px; height: 64px; z-index: 2; background: url("./Sprites/Ships/ships.png") var(--naval-ship-sprite-x, -64px) var(--naval-ship-sprite-y, -128px) / 2048px 1024px no-repeat; image-rendering: pixelated; transform: scale(1.45); transform-origin: center center; filter: drop-shadow(0 13px 12px rgba(0, 0, 0, 0.38)); }
.naval-ship:not(.is-surging):not(.is-hit):not(.is-stunned) .naval-ship-sprite { animation: navalShipFrameStep 360ms steps(3) infinite; }
.naval-ship-smoke { position: absolute; left: 34px; top: 2px; width: 30px; height: 42px; opacity: 0; pointer-events: none; z-index: 4; }
.naval-ship-smoke::before, .naval-ship-smoke::after { content: ""; position: absolute; bottom: 0; width: 18px; height: 18px; border-radius: 50%; background: rgba(42, 47, 52, 0.74); filter: blur(1px); animation: navalSmokePuff 1.25s ease-out infinite; }
.naval-ship-smoke::after { left: 12px; animation-delay: 0.42s; background: rgba(92, 95, 95, 0.58); }
.naval-ship .naval-ship-name { display: inline-block; max-width: 112px; font-size: 11px; color: #edf8f4; margin-top: 2px; padding: 2px 6px; border-radius: 999px; background: rgba(3, 12, 16, 0.56); text-shadow: 0 1px 2px #000; overflow-wrap: anywhere; }
.naval-ship .naval-ship-facing { font-size: 10px; color: #c4e4dc; text-shadow: 0 1px 2px #000; }
.naval-ship.is-turning-up .naval-ship-sprite-wrap,
.naval-ship.is-turning-down .naval-ship-sprite-wrap { animation: none; }
.naval-ship.is-surging .naval-ship-sprite-wrap { animation: navalSurge ${NAVAL_SURGE_MOTION_MS}ms cubic-bezier(0.18, 0.62, 0.18, 1) both; }
.naval-ship.is-boarding-motion { animation-duration: ${NAVAL_BOARDING_MOTION_MS}ms; animation-timing-function: cubic-bezier(0.18, 0.62, 0.18, 1); animation-fill-mode: both; }
.naval-ship.is-boarding-motion.is-player { animation-name: navalBoardingPlayer; }
.naval-ship.is-boarding-motion.is-enemy { animation-name: navalBoardingEnemy; }
.naval-ship.is-boarding-motion .naval-ship-sprite-wrap { animation: navalBoardingRock ${NAVAL_BOARDING_MOTION_MS}ms ease-out both; }
.naval-ship.is-hit .naval-ship-sprite-wrap { animation: navalHitShake 430ms ease-out both; }
.naval-ship.is-surging.is-hit .naval-ship-sprite-wrap { animation: navalSurge ${NAVAL_SURGE_MOTION_MS}ms cubic-bezier(0.18, 0.62, 0.18, 1) both; }
.naval-ship.is-boarding-motion.is-hit .naval-ship-sprite-wrap { animation: navalBoardingRock ${NAVAL_BOARDING_MOTION_MS}ms ease-out both; }
.naval-ship.is-hit .naval-ship-sprite { filter: brightness(1.35) drop-shadow(0 0 10px rgba(255, 235, 168, 0.7)) drop-shadow(0 13px 12px rgba(0, 0, 0, 0.38)); }
.naval-ship.is-stunned .naval-ship-sprite-wrap { animation: navalStunnedShake 0.46s infinite; }
.naval-ship.is-stunned .naval-ship-sprite { filter: grayscale(0.55) brightness(0.78) drop-shadow(0 13px 12px rgba(0,0,0,0.48)); }
.naval-ship.is-stunned .naval-ship-smoke { opacity: 1; }
.naval-cannon-shot { position: absolute; left: 50%; top: var(--naval-shot-track-top, 58%); width: 72px; height: 4px; border-radius: 999px; background: linear-gradient(90deg, rgba(255, 251, 217, 0), rgba(255, 240, 170, 0.95), rgba(255, 107, 46, 0.9)); box-shadow: 0 0 12px rgba(255, 206, 104, 0.75); transform-origin: center; opacity: 0; animation-delay: var(--naval-shot-delay, 0ms); }
.naval-cannon-shot::after { content: ""; position: absolute; right: -7px; top: 50%; width: 10px; height: 10px; border-radius: 50%; background: #fff1a8; transform: translateY(-50%); box-shadow: 0 0 16px #f97316; }
.naval-cannon-shot.is-player { animation: navalShotPlayerHit 640ms ease-out both; }
.naval-cannon-shot.is-enemy { animation: navalShotEnemyHit 640ms ease-out both; }
.naval-cannon-shot.is-player.is-miss.miss-up { animation-name: navalShotPlayerMissUp; }
.naval-cannon-shot.is-player.is-miss.miss-down { animation-name: navalShotPlayerMissDown; }
.naval-cannon-shot.is-enemy.is-miss.miss-up { animation-name: navalShotEnemyMissUp; }
.naval-cannon-shot.is-enemy.is-miss.miss-down { animation-name: navalShotEnemyMissDown; }
.naval-cannon-shot.is-broadside { width: 58px; height: 3px; box-shadow: 0 0 10px rgba(255, 206, 104, 0.7); }
.naval-cannon-shot.volley-1 { --naval-shot-track-top: 48%; --naval-shot-delay: 0ms; }
.naval-cannon-shot.volley-2 { --naval-shot-track-top: 52%; --naval-shot-delay: 16ms; }
.naval-cannon-shot.volley-3 { --naval-shot-track-top: 56%; --naval-shot-delay: 32ms; }
.naval-cannon-shot.volley-4 { --naval-shot-track-top: 60%; --naval-shot-delay: 48ms; }
.naval-cannon-shot.volley-5 { --naval-shot-track-top: 64%; --naval-shot-delay: 64ms; }
.naval-cannon-shot.volley-6 { --naval-shot-track-top: 68%; --naval-shot-delay: 80ms; }
.naval-boarding-line { position: absolute; left: 31%; right: 31%; top: 49%; height: 3px; border-radius: 999px; background: linear-gradient(90deg, transparent, rgba(244, 211, 126, 0.86), transparent); box-shadow: 0 0 12px rgba(244, 211, 126, 0.72); opacity: 0; animation: navalBoardingLine ${NAVAL_BOARDING_MOTION_MS}ms ease-out both; }
.naval-boarding-clash { position: absolute; left: 50%; top: 49%; transform: translate(-50%, -50%) scale(0.9); min-width: 86px; text-align: center; border: 1px solid rgba(244, 211, 126, 0.72); border-radius: 999px; background: rgba(28, 18, 8, 0.86); color: #ffe7a6; font-size: 13px; font-weight: 900; padding: 5px 12px; text-shadow: 0 1px 2px #000; opacity: 0; animation: navalBoardingClash ${NAVAL_BOARDING_MOTION_MS}ms ease-out both; }
.naval-command-callout { position: absolute; top: 68px; max-width: 180px; border: 1px solid rgba(255, 236, 174, 0.78); border-radius: 999px; background: rgba(16, 21, 18, 0.9); color: #fff2c2; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 14px rgba(244, 211, 126, 0.22); font-size: 13px; font-weight: 900; line-height: 1.25; padding: 7px 12px; text-align: center; text-shadow: 0 1px 2px #000; opacity: 0; transform: translateY(8px) scale(0.96); animation: navalCommandCallout 980ms cubic-bezier(0.18, 0.72, 0.22, 1) both; z-index: 8; pointer-events: none; }
.naval-command-callout.is-player { right: 7%; }
.naval-command-callout.is-enemy { left: 7%; }
.naval-command-callout::after { content: ""; position: absolute; top: 100%; width: 10px; height: 10px; background: rgba(16, 21, 18, 0.9); border-right: 1px solid rgba(255, 236, 174, 0.78); border-bottom: 1px solid rgba(255, 236, 174, 0.78); transform: translateY(-3px) rotate(45deg); }
.naval-command-callout.is-player::after { right: 28px; }
.naval-command-callout.is-enemy::after { left: 28px; }
@keyframes navalSeaDrift { from { transform: translateX(0); } to { transform: translateX(56px); } }
@keyframes navalImpactShake { 0%,100% { transform: translate3d(0, 0, 0); } 14% { transform: translate3d(-5px, 2px, 0); } 28% { transform: translate3d(5px, -2px, 0); } 42% { transform: translate3d(-4px, 1px, 0); } 58% { transform: translate3d(4px, 0, 0); } 74% { transform: translate3d(-2px, -1px, 0); } }
@keyframes navalShipFrameStep { from { background-position: var(--naval-ship-animation-x, 0px) var(--naval-ship-sprite-y, -128px); } to { background-position: var(--naval-ship-animation-end-x, -192px) var(--naval-ship-sprite-y, -128px); } }
@keyframes navalDodgeLean { 0% { transform: scale(1.45) translateY(0); } 42% { transform: scale(1.45) translateY(-5px); } 100% { transform: scale(1.45) translateY(0); } }
@keyframes navalDodgeUp { 0%,100% { transform: none; } }
@keyframes navalDodgeDown { 0%,100% { transform: none; } }
@keyframes navalSurge { 0% { transform: translateX(0) translateY(0); } 22% { transform: translateX(var(--naval-surge-start-x, 12px)) translateY(1px); } 54% { transform: translateX(var(--naval-surge-mid-x, 84px)) translateY(2px); } 68% { transform: translateX(var(--naval-surge-x, 96px)) translateY(3px); } 82% { transform: translateX(var(--naval-surge-settle-x, 86px)) translateY(2px); } 100% { transform: translateX(0) translateY(0); } }
@keyframes navalBoardingPlayer { 0% { transform: translateX(0); } 28% { transform: translateX(var(--naval-boarding-start-x, -32px)); } 66% { transform: translateX(var(--naval-boarding-overshoot-x, -150px)); } 84% { transform: translateX(var(--naval-boarding-bounce-x, -132px)); } 100% { transform: translateX(var(--naval-boarding-x, -144px)); } }
@keyframes navalBoardingEnemy { 0% { transform: translateX(0); } 28% { transform: translateX(var(--naval-boarding-start-x, 32px)); } 66% { transform: translateX(var(--naval-boarding-overshoot-x, 150px)); } 84% { transform: translateX(var(--naval-boarding-bounce-x, 132px)); } 100% { transform: translateX(var(--naval-boarding-x, 144px)); } }
@keyframes navalBoardingRock { 0% { transform: translateY(0) rotate(0); } 34% { transform: translateY(1px) rotate(0); } 66% { transform: translateY(3px) rotate(-1deg); } 84% { transform: translateY(1px) rotate(1deg); } 100% { transform: translateY(0) rotate(0); } }
@keyframes navalBoardingLine { 0%,34% { opacity: 0; transform: scaleX(0.18); } 54%,86% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0; transform: scaleX(1.04); } }
@keyframes navalBoardingClash { 0%,40% { opacity: 0; transform: translate(-50%, -50%) scale(0.86); } 58%,86% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.03); } }
@keyframes navalCommandCallout { 0% { opacity: 0; transform: translateY(8px) scale(0.96); } 14%,70% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-4px) scale(0.98); } }
@keyframes navalHitShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 42% { transform: translateX(4px); } 64% { transform: translateX(-3px); } }
@keyframes navalStunnedShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@keyframes navalSmokePuff { 0% { transform: translateY(12px) scale(0.58); opacity: 0; } 18% { opacity: 0.8; } 100% { transform: translateY(-18px) scale(1.35); opacity: 0; } }
@keyframes navalShotPlayerHit { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0) rotate(180deg); } 14% { opacity: 1; } 82% { opacity: 1; } 100% { left: 29%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0) rotate(180deg); } }
@keyframes navalShotEnemyHit { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0); } 14% { opacity: 1; } 82% { opacity: 1; } 100% { left: 66%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0); } }
@keyframes navalShotPlayerMissUp { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } 14% { opacity: 1; } 100% { left: 24%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } }
@keyframes navalShotPlayerMissDown { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } 14% { opacity: 1; } 100% { left: 24%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } }
@keyframes navalShotEnemyMissUp { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } 14% { opacity: 1; } 100% { left: 71%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } }
@keyframes navalShotEnemyMissDown { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } 14% { opacity: 1; } 100% { left: 71%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } }
.naval-status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.naval-status-card { background: rgba(5, 12, 18, 0.72); border: 1px solid rgba(84, 118, 111, 0.72); border-radius: 8px; padding: 8px; min-width: 0; }
.naval-status-card h4 { margin: 0 0 6px; font-size: 12px; line-height: 1.2; overflow-wrap: anywhere; }
.naval-status-card.is-player h4 { color: #7ee3cf; }
.naval-status-card.is-enemy h4 { color: #ffaaa0; }
.naval-hp-bar { height: 9px; background: #1d2d2b; border-radius: 999px; overflow: hidden; margin: 4px 0 7px; }
.naval-hp-fill { height: 100%; background: linear-gradient(90deg, #50d6a5, #1fae83); transition: width 300ms ease; }
.naval-hp-fill.is-low { background: linear-gradient(90deg, #f87171, #dc2626); }
.naval-status-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: #b8cec8; padding: 1px 0; }
.naval-status-row b { color: #fff; text-align: right; overflow-wrap: anywhere; }
.naval-status-row.is-detail { display: none; }
.naval-status-compact { display: flex; flex-wrap: wrap; gap: 4px; }
.naval-status-chip { display: inline-flex; align-items: center; gap: 3px; min-width: 0; max-width: 100%; border: 1px solid rgba(244, 211, 126, 0.24); border-radius: 999px; padding: 2px 7px; background: rgba(5, 12, 18, 0.58); color: #e7f6f2; font-size: 10px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.naval-status-row b.naval-arcana-empty { color: #758f88; font-weight: 600; }
.naval-arcana-list { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 210px; }
.naval-arcana-chip { display: inline-flex; align-items: center; max-width: 100%; border: 1px solid rgba(244, 211, 126, 0.42); border-radius: 999px; padding: 1px 6px; color: #ffe7a6; background: rgba(31, 25, 10, 0.68); font-size: 10px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.naval-arcana-chip small { margin-left: 4px; color: #9ee7ff; font-weight: 800; }
.naval-arcana-chip.is-used { opacity: 0.45; filter: grayscale(0.25); }
.naval-stun-badge { color: #fbbf24; font-weight: bold; }
.naval-arcana-cutin { position: absolute; left: 50%; top: 118px; transform: translate(-50%, -50%); z-index: 4; width: min(420px, 88%); border: 1px solid rgba(244, 211, 126, 0.82); border-radius: 8px; padding: 13px 16px; background: linear-gradient(135deg, rgba(32, 21, 9, 0.96), rgba(10, 28, 31, 0.94)); color: #fff4c7; box-shadow: 0 14px 40px rgba(0,0,0,0.45); animation: navalArcanaCutin 1.4s ease both; pointer-events: none; }
.naval-arcana-cutin[hidden] { display: none; }
.naval-arcana-cutin.is-enemy { border-color: rgba(255, 146, 134, 0.78); color: #ffd6d1; }
.naval-arcana-cutin-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0; color: #f4d37e; }
.naval-arcana-cutin strong { display: block; margin-top: 2px; font-size: 18px; line-height: 1.2; }
.naval-arcana-cutin span { display: block; margin-top: 4px; color: #e8d7a9; font-size: 12px; line-height: 1.35; }
@keyframes navalArcanaCutin { 0% { opacity: 0; transform: translate(-50%, -54%) scale(0.96); } 16% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 82% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -47%) scale(1.02); } }
.naval-win-routes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.naval-route { border: 1px solid #345b54; border-radius: 8px; background: #0d1d20; padding: 7px; min-width: 0; }
.naval-route strong { display: block; color: #f4d37e; font-size: 12px; overflow-wrap: anywhere; }
.naval-route span { display: block; margin-top: 2px; color: #a9c6bf; font-size: 10px; line-height: 1.25; overflow-wrap: anywhere; }
.naval-route.is-ready { border-color: #d7b35c; background: #211d11; }
.naval-route.is-danger { border-color: #9c4648; background: #231416; }
.naval-route.is-done { border-color: #51b893; background: #10261e; }
.naval-loot-panel, .naval-intel, .naval-win-routes { display: none; }
.naval-commands { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-bottom: 8px; }
.naval-command-btn { min-width: 0; min-height: 62px; background: rgba(18, 35, 31, 0.92); border: 1px solid #3f6a62; color: #edf7f4; border-radius: 8px; padding: 7px 8px; cursor: pointer; text-align: left; display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 7px; align-items: center; }
.naval-command-btn:disabled { opacity: 0.42; cursor: default; filter: grayscale(0.25); }
.naval-command-btn:not(:disabled):hover { background: #19352e; border-color: #7ccbb9; }
.naval-command-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 7px; background: radial-gradient(circle at 50% 38%, rgba(255, 244, 194, 0.18), rgba(4, 12, 18, 0.58)); border: 1px solid rgba(244, 211, 126, 0.2); overflow: hidden; }
.naval-command-icon img { width: 31px; height: 31px; object-fit: contain; image-rendering: auto; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5)); }
.naval-command-body { min-width: 0; display: grid; gap: 4px; }
.naval-command-btn b { display: block; font-size: 15px; line-height: 1.2; overflow-wrap: anywhere; }
.naval-command-btn small { display: none; }
.naval-command-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: #f4d37e; font-size: 10px; font-weight: 700; }
.naval-command-kind { color: #0b1816; background: #f4d37e; border-radius: 999px; padding: 2px 7px; }
.naval-command-btn.is-cannon { border-color: #577a89; }
.naval-command-btn.is-move { border-color: #a95d4d; }
.naval-command-btn.is-rudder { border-color: #4f9b88; }
.naval-command-btn.is-feint { border-color: #8b9161; }
.naval-command-btn.is-boarding { border-color: #b76d76; }
.naval-command-note { font-size: 11px; color: #f4d37e; min-height: 16px; margin-bottom: 6px; overflow-wrap: anywhere; }
#navalBattleLog { height: 92px; overflow-y: auto; background: #07141b; border: 1px solid #2f534d; border-radius: 8px; padding: 7px 9px; font-size: 11px; line-height: 1.5; color: #b8cec8; }
#navalBattleResult { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(4, 9, 18, 0.82); border-radius: 12px; z-index: 3; }
#navalBattleResult[hidden] { display: none; }
.naval-result-card { width: min(420px, 92%); background: #11211f; border: 2px solid #6b8060; border-radius: 10px; padding: 20px 24px; text-align: center; box-shadow: 0 18px 46px rgba(0,0,0,0.35); }
.naval-result-title { font-size: 18px; margin: 0 0 8px; }
.naval-result-body { font-size: 13px; color: #c8ded8; margin: 0 0 14px; white-space: pre-line; line-height: 1.55; }
.naval-result-close { background: #1f7a69; color: #fff; border: none; border-radius: 8px; padding: 8px 24px; cursor: pointer; }
.naval-result-close:hover { background: #26947f; }
@media (max-width: 640px) {
    #navalBattleModal { padding: 6px; align-items: stretch; }
    .naval-shell { width: 100%; max-height: 100%; border-radius: 8px; padding: 10px; }
    .naval-battle-grid { display: block; margin-bottom: 10px; }
    .naval-sea { min-height: 218px; margin-bottom: 10px; }
    .naval-ship { width: 100px; transform: scale(0.92); transform-origin: center bottom; }
    .naval-ship .naval-ship-name { max-width: 100px; }
    .naval-win-routes { grid-template-columns: 1fr; }
    .naval-commands { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .naval-command-btn { min-height: 58px; }
}
`;

function ensureModal() {
    let modal = document.getElementById('navalBattleModal');
    if (modal) return modal;
    const style = document.createElement('style');
    style.id = 'navalBattleStyle';
    style.textContent = NAVAL_CSS;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'navalBattleModal';
    modal.innerHTML = `
        <div class="naval-shell" role="dialog" aria-modal="true" aria-labelledby="navalBattleTitle" style="position: relative;">
            <div id="navalArcanaCutin" class="naval-arcana-cutin" hidden></div>
            <div class="naval-head">
                <div class="naval-title-block">
                    <h3 id="navalBattleTitle">略奪海戦</h3>
                    <div class="naval-subtitle">同時入力の読み合い船バトル</div>
                </div>
                <button type="button" class="naval-close" aria-label="海戦をやめる" data-naval-close>×</button>
            </div>
            <div class="naval-round" id="navalRoundStatus">
                <span>第1合</span>
                <small>突撃・砲撃・操舵を同時に読み合う</small>
            </div>
            <div class="naval-battle-grid">
                <div class="naval-sea" id="navalSea">
                    <div class="naval-distance-label" id="navalDistanceLabel"></div>
                    <div class="naval-effect-layer" id="navalEffectLayer" aria-hidden="true"></div>
                    <div class="naval-ship is-enemy" id="navalShipEnemy">
                        <span class="naval-ship-sprite-wrap" aria-hidden="true">
                            <span class="naval-ship-shadow"></span>
                            <span class="naval-ship-wake"></span>
                            <span class="naval-ship-sprite"></span>
                            <span class="naval-ship-smoke"></span>
                        </span>
                        <div class="naval-ship-name" id="navalShipEnemyName"></div>
                        <div class="naval-ship-facing" id="navalShipEnemyFacing"></div>
                    </div>
                    <div class="naval-ship is-player" id="navalShipPlayer">
                        <span class="naval-ship-sprite-wrap" aria-hidden="true">
                            <span class="naval-ship-shadow"></span>
                            <span class="naval-ship-wake"></span>
                            <span class="naval-ship-sprite"></span>
                            <span class="naval-ship-smoke"></span>
                        </span>
                        <div class="naval-ship-name">自分の船</div>
                        <div class="naval-ship-facing" id="navalShipPlayerFacing"></div>
                    </div>
                </div>
                <div class="naval-status">
                    <div class="naval-status-card is-enemy">
                        <h4 id="navalEnemyTitle">敵船</h4>
                        <div class="naval-hp-bar"><div class="naval-hp-fill" id="navalHpEnemy"></div></div>
                        <div class="naval-status-row"><span>操舵</span><b id="navalHpEnemyText"></b></div>
                        <div class="naval-status-compact">
                            <span class="naval-status-chip" id="navalWeaponEnemy"></span>
                            <span class="naval-status-chip" id="navalElementEnemy"></span>
                            <span class="naval-status-chip" id="navalFacingEnemy"></span>
                            <span class="naval-status-chip" id="navalReloadEnemy"></span>
                        </div>
                        <div class="naval-status-row is-detail"><span>船型</span><b id="navalTypeEnemy"></b></div>
                        <div class="naval-status-row is-detail"><span>特性</span><b id="navalTraitEnemy"></b></div>
                        <div class="naval-status-row is-detail"><span>補正</span><b id="navalSpecEnemy"></b></div>
                        <div class="naval-status-row is-detail"><span>戦法</span><b id="navalEnemyPlan"></b></div>
                        <div class="naval-status-row is-detail"><span>入力</span><b id="navalPendingEnemy"></b></div>
                        <div class="naval-status-row is-detail"><span>船倉</span><b id="navalCargoEnemy"></b></div>
                        <div class="naval-status-row is-detail"><span>艤装</span><b id="navalArcanaEnemy"></b></div>
                    </div>
                    <div class="naval-status-card is-player">
                        <h4>自分の船</h4>
                        <div class="naval-hp-bar"><div class="naval-hp-fill" id="navalHpPlayer"></div></div>
                        <div class="naval-status-row"><span>操舵</span><b id="navalHpPlayerText"></b></div>
                        <div class="naval-status-compact">
                            <span class="naval-status-chip" id="navalWeaponPlayer"></span>
                            <span class="naval-status-chip" id="navalElementPlayer"></span>
                            <span class="naval-status-chip" id="navalFacingPlayer"></span>
                            <span class="naval-status-chip" id="navalReloadPlayer"></span>
                        </div>
                        <div class="naval-status-row is-detail"><span>船型</span><b id="navalTypePlayer"></b></div>
                        <div class="naval-status-row is-detail"><span>特性</span><b id="navalTraitPlayer"></b></div>
                        <div class="naval-status-row is-detail"><span>補正</span><b id="navalSpecPlayer"></b></div>
                        <div class="naval-status-row is-detail"><span>入力</span><b id="navalPendingPlayer"></b></div>
                        <div class="naval-status-row is-detail"><span>船倉</span><b id="navalCargoPlayer"></b></div>
                        <div class="naval-status-row is-detail"><span>艤装</span><b id="navalArcanaPlayer"></b></div>
                    </div>
                </div>
            </div>
            <div class="naval-win-routes" id="navalWinRoutes"></div>
            <div class="naval-loot-panel" id="navalLootPanel"></div>
            <div class="naval-intel" id="navalIntel"></div>
            <div class="naval-command-note" id="navalCommandNote"></div>
            <div class="naval-commands" id="navalCommands"></div>
            <div id="navalBattleLog"></div>
            <div id="navalBattleResult" hidden>
                <div class="naval-result-card">
                    <h3 class="naval-result-title"></h3>
                    <p class="naval-result-body"></p>
                    <button type="button" class="naval-result-close">閉じる</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('[data-naval-close]').addEventListener('click', closeNavalBattle);
    modal.querySelector('.naval-result-close').addEventListener('click', handleResultClose);
    return modal;
}

function renderShipPositions(b) {
    const playerEl = document.getElementById('navalShipPlayer');
    const enemyEl = document.getElementById('navalShipEnemy');
    const seaEl = document.getElementById('navalSea');
    if (!playerEl || !enemyEl) return;
    const playerVisual = b.visualState || {};
    const enemyVisual = b.visualState || {};
    if (seaEl) {
        seaEl.className = `naval-sea${b.visualState?.impactShake ? ' is-impact-shake' : ''}`;
    }
    enemyEl.style.left = '8%';
    enemyEl.style.top = '96px';
    playerEl.style.left = 'calc(92% - 112px)';
    playerEl.style.top = '96px';
    if (seaEl) {
        const seaWidth = Math.max(280, seaEl.getBoundingClientRect?.().width || 620);
        const shipWidth = 112;
        const enemyLeft = seaWidth * 0.08;
        const playerLeft = (seaWidth * 0.92) - shipWidth;
        const overlap = shipWidth * 0.5;
        const playerBoardingX = (enemyLeft + overlap) - playerLeft;
        const enemyBoardingX = (playerLeft - overlap) - enemyLeft;
        setBoardingMotionDistance(playerEl, playerBoardingX);
        setBoardingMotionDistance(enemyEl, enemyBoardingX);
    }
    applyShipSprite(playerEl, b.player, 'player', playerVisual.playerPose, {
        hit: playerVisual.playerHit,
        surge: playerVisual.playerSurge,
        boarding: playerVisual.playerBoarding
    });
    applyShipSprite(enemyEl, b.enemy, 'enemy', enemyVisual.enemyPose, {
        hit: enemyVisual.enemyHit,
        surge: enemyVisual.enemySurge,
        boarding: enemyVisual.enemyBoarding
    });
    renderNavalVisualEffects(b);
    scheduleNavalVisualClear(b);
    const label = document.getElementById('navalDistanceLabel');
    if (label) label.textContent = '読み合い交戦中';
}

function setBoardingMotionDistance(element, distance) {
    if (!element) return;
    const x = Math.round(Number(distance) || 0);
    element.style.setProperty('--naval-boarding-x', `${x}px`);
    element.style.setProperty('--naval-boarding-start-x', `${Math.round(x * 0.22)}px`);
    element.style.setProperty('--naval-boarding-overshoot-x', `${Math.round(x * 1.06)}px`);
    element.style.setProperty('--naval-boarding-bounce-x', `${Math.round(x * 0.92)}px`);
}

function applyShipSprite(container, ship, side, visualPose = '', flags = {}) {
    if (!container || !ship) return;
    const sprite = container.querySelector('.naval-ship-sprite');
    const frame = shipSpriteFrame(ship, side, visualPose);
    if (sprite) {
        sprite.style.setProperty('--naval-ship-sprite-x', `${frame.x}px`);
        sprite.style.setProperty('--naval-ship-sprite-y', `${frame.y}px`);
        sprite.style.setProperty('--naval-ship-animation-x', `${frame.x + SHIP_SPRITE_FRAME_SIZE}px`);
        sprite.style.setProperty('--naval-ship-animation-end-x', `${frame.x - (SHIP_SPRITE_FRAME_SIZE * 2)}px`);
    }
    const form = visualShipForm(ship);
    container.className = [
        'naval-ship',
        `is-${side}`,
        `is-${form}`,
        visualPose ? 'is-turning' : '',
        visualPose.includes('Up') ? 'is-turning-up' : '',
        visualPose.includes('Down') ? 'is-turning-down' : '',
        flags.hit ? 'is-hit' : '',
        flags.surge ? 'is-surging' : '',
        flags.boarding ? 'is-boarding-motion' : '',
        ship.hp <= 0 ? 'is-stunned' : ''
    ].filter(Boolean).join(' ');
    const surgeX = side === 'player' ? -156 : 156;
    container.style.setProperty('--naval-surge-x', `${surgeX}px`);
    container.style.setProperty('--naval-surge-start-x', `${Math.round(surgeX * 0.12)}px`);
    container.style.setProperty('--naval-surge-mid-x', `${Math.round(surgeX * 0.88)}px`);
    container.style.setProperty('--naval-surge-settle-x', `${Math.round(surgeX * 0.9)}px`);
}

function renderNavalVisualEffects(b) {
    const layer = document.getElementById('navalEffectLayer');
    if (!layer) return;
    const effects = Array.isArray(b?.visualState?.effects) ? b.visualState.effects : [];
    layer.innerHTML = effects.map((effect) => {
        if (effect?.type === 'callout') {
            const source = effect.source === 'enemy' ? 'enemy' : 'player';
            return `<span class="naval-command-callout is-${source}" aria-hidden="true">${escapeHtml(effect.text || '')}</span>`;
        }
        if (effect?.type === 'boarding') {
            return '<span class="naval-boarding-line" aria-hidden="true"></span><span class="naval-boarding-clash" aria-hidden="true">接舷</span>';
        }
        if (effect?.type !== 'shot') return '';
        const shotCount = effect.commandId === 'broadside' ? 6 : 1;
        return Array.from({ length: shotCount }, (_, index) => {
            const classes = [
                'naval-cannon-shot',
                `is-${effect.source === 'enemy' ? 'enemy' : 'player'}`,
                effect.commandId === 'broadside' ? 'is-broadside' : '',
                shotCount > 1 ? `volley-${index + 1}` : '',
                effect.miss ? 'is-miss' : 'is-hit',
                effect.dodgeDirection ? `miss-${effect.dodgeDirection}` : ''
            ].filter(Boolean).join(' ');
            return `<span class="${classes}" aria-hidden="true"></span>`;
        }).join('');
    }).join('');
}

function scheduleNavalVisualClear(b) {
    if (navalVisualClearTimer) {
        clearTimeout(navalVisualClearTimer);
        navalVisualClearTimer = null;
    }
    if (!b?.visualState?.token) return;
    if (b.visualState.type === 'boarding') return;
    const token = b.visualState.token;
    navalVisualClearTimer = setTimeout(() => {
        if (battle === b && b.visualState?.token === token) {
            b.visualState = null;
            render(b);
        }
    }, NAVAL_VISUAL_EFFECT_MS);
}

function weaponStatusText(ship) {
    const bow = formatSteeringValue(cannonDamageForShip(ship, 'bowCannon'));
    const side = formatSteeringValue(cannonDamageForShip(ship, 'broadside'));
    return `${ship?.weaponLabel || '砲撃'} 前${bow}/側${side}`;
}

function elementStatusText(ship, foe) {
    const element = normalizeElement(ship?.element);
    const label = ELEMENT_LABEL[element] || ELEMENT_LABEL.none;
    if (element === 'none') return label;
    if (hasElementAdvantage(element, foe?.element)) return `${label} / 有利`;
    if (hasElementAdvantage(foe?.element, element)) return `${label} / 不利`;
    return `${label} / 相性なし`;
}

function shipTraitStatusText(ship) {
    const name = ship?.shipTraitName || NAVAL_SHIP_TRAITS[ship?.shipTraitKey]?.name || '';
    if (!name) return '-';
    return `${name} ${ship?.shipTraitUsed ? '使用済み' : '未使用'}`;
}

function renderArcanaGearText(ship, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const gears = Array.isArray(ship?.arcanaGears) ? ship.arcanaGears : [];
    el.classList.toggle('naval-arcana-empty', gears.length === 0);
    if (!gears.length) {
        el.textContent = '-';
        return;
    }
    el.innerHTML = `
        <span class="naval-arcana-list">
            ${gears.map((gear) => `
                <span class="naval-arcana-chip ${gear.used ? 'is-used' : ''}" title="${escapeHtml(gear.shortDescription || gear.ultimateName || arcanaDisplayName(gear))}">
                    ${escapeHtml(arcanaDisplayName(gear))}
                    ${gear.arcanaElement && gear.arcanaElement !== 'none' ? `<small>${escapeHtml(gear.arcanaElementLabel || ELEMENT_LABEL[gear.arcanaElement] || '')}</small>` : ''}
                </span>
            `).join('')}
        </span>
    `;
}

function renderStatus(b) {
    const cards = [
        { ship: b.player, foe: b.enemy, hp: 'navalHpPlayer', hpText: 'navalHpPlayerText', type: 'navalTypePlayer', weapon: 'navalWeaponPlayer', element: 'navalElementPlayer', trait: 'navalTraitPlayer', spec: 'navalSpecPlayer', cargo: 'navalCargoPlayer', arcana: 'navalArcanaPlayer', facing: 'navalFacingPlayer', reload: 'navalReloadPlayer', pending: 'navalPendingPlayer', shipFacing: 'navalShipPlayerFacing' },
        { ship: b.enemy, foe: b.player, hp: 'navalHpEnemy', hpText: 'navalHpEnemyText', type: 'navalTypeEnemy', weapon: 'navalWeaponEnemy', element: 'navalElementEnemy', trait: 'navalTraitEnemy', spec: 'navalSpecEnemy', cargo: 'navalCargoEnemy', arcana: 'navalArcanaEnemy', facing: 'navalFacingEnemy', reload: 'navalReloadEnemy', pending: 'navalPendingEnemy', shipFacing: 'navalShipEnemyFacing' }
    ];
    cards.forEach(({ ship, foe, hp, hpText, type, weapon, element, trait, spec, cargo, arcana, facing, reload, pending, shipFacing }) => {
        const fill = document.getElementById(hp);
        if (fill) {
            const ratio = ship.hp / ship.maxHp;
            fill.style.width = `${Math.max(0, ratio * 100)}%`;
            fill.classList.toggle('is-low', ratio <= 0.34);
        }
        const hpEl = document.getElementById(hpText);
        if (hpEl) hpEl.textContent = `${formatSteeringValue(ship.hp)} / ${formatSteeringValue(ship.maxHp)}`;
        const typeEl = document.getElementById(type);
        if (typeEl) typeEl.textContent = `${ship.shipName || ship.shipType || '船'} / ${ship.shipType || '船'} Lv${ship.shipLevel || 1}`;
        const weaponEl = document.getElementById(weapon);
        if (weaponEl) weaponEl.textContent = weaponStatusText(ship);
        const elementEl = document.getElementById(element);
        if (elementEl) elementEl.textContent = elementStatusText(ship, foe);
        const traitEl = document.getElementById(trait);
        if (traitEl) traitEl.textContent = shipTraitStatusText(ship);
        const specEl = document.getElementById(spec);
        if (specEl) specEl.textContent = `攻+${ship.attackBonus || 0} 防+${ship.defenseBonus || 0} 速+${ship.speed || 0}`;
        const cargoEl = document.getElementById(cargo);
        if (cargoEl) cargoEl.textContent = ship.cargoText || '空';
        renderArcanaGearText(ship, arcana);
        const facingEl = document.getElementById(facing);
        if (facingEl) facingEl.textContent = FACING_LABEL[ship.facing] || '正面';
        const reloadEl = document.getElementById(reload);
        if (reloadEl) reloadEl.textContent = ship.reload > 0 ? '再装填中' : `${ship.weaponLabel || '砲撃'}可`;
        const pendingEl = document.getElementById(pending);
        if (pendingEl) pendingEl.textContent = ship.pendingCommandId ? '入力済み' : '-';
        const shipFacingEl = document.getElementById(shipFacing);
        if (shipFacingEl) shipFacingEl.textContent = FACING_LABEL[ship.facing] || '正面';
    });
    const enemyPlan = document.getElementById('navalEnemyPlan');
    if (enemyPlan) enemyPlan.textContent = b.enemyPlan?.name || '標準型';
    const round = document.getElementById('navalRoundStatus');
    if (round) {
        round.innerHTML = `<span>第${Math.max(1, b.turn + 1)}合</span><small>${b.player.pendingCommandId ? '相手入力待ち' : 'コマンドを選択'}</small>`;
    }
    const intel = document.getElementById('navalIntel');
    if (intel) intel.textContent = getTacticalMessage(b);
    const loot = document.getElementById('navalLootPanel');
    if (loot) {
        const model = b.reward || createRewardModel(b.options, b.player, b.enemy);
        const victory = PLUNDER_LIMITS.victory;
        loot.textContent = `戦利品上限: 制圧 チップ${victory.chips}/貨物${victory.cargo}。対象船倉: ${model.targetCargoText}。敗北時: 修理費候補チップ${model.risk.chips}/CD${model.risk.cooldownMinutes}分。`;
    }
}

function renderWinRoutes(b) {
    const container = document.getElementById('navalWinRoutes');
    if (!container) return;
    const boardingReady = b.enemy.hp <= 0;
    const routes = [
        {
            key: 'steering',
            title: '操舵不能',
            text: `敵操舵 ${formatSteeringValue(b.enemy.hp)}/${formatSteeringValue(b.enemy.maxHp)}`,
            state: boardingReady ? 'ready' : ''
        },
        {
            key: 'boarding',
            title: '接舷',
            text: boardingReady ? '白兵戦へ移行可能' : '相手操舵0で可能',
            state: boardingReady ? 'ready' : ''
        }
    ];
    container.innerHTML = routes.map((route) => `
        <div class="naval-route ${route.state ? `is-${route.state}` : ''}" data-route="${escapeHtml(route.key)}">
            <strong>${escapeHtml(route.title)}</strong>
            <span>${escapeHtml(route.text)}</span>
        </div>
    `).join('');
}

function renderCommands(b) {
    const container = document.getElementById('navalCommands');
    const note = document.getElementById('navalCommandNote');
    if (!container) return;
    container.innerHTML = '';
    const self = b.player;
    const foe = b.enemy;
    const commands = availableCommands(b, self, foe);
    commands.forEach((def) => {
        const label = commandLabel(def.id, self);
        const desc = commandDescription(def, self);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `naval-command-btn is-${def.type}`;
        button.dataset.navalCommand = def.id;
        button.innerHTML = `
            <span class="naval-command-icon" aria-hidden="true">
                ${def.icon ? `<img src="${escapeHtml(def.icon)}" alt="">` : ''}
            </span>
            <span class="naval-command-body">
                <span class="naval-command-meta">
                    <span class="naval-command-kind">${escapeHtml(commandTypeLabel(def, self))}</span>
                    <span>${isCannonCommand(def.id) ? (self.reload > 0 ? '再装填中' : `${escapeHtml(self.weaponLabel || '砲撃')}可`) : '制限なし'}</span>
                </span>
                <b>${escapeHtml(label)}</b>
                <small>${escapeHtml(desc)}</small>
            </span>
        `;
        button.disabled = !canSelect(b, self, foe, def);
        button.setAttribute('aria-label', label);
        button.addEventListener('click', () => {
            if (typeof b.options.onCommandSelect === 'function') {
                const handled = b.options.onCommandSelect(def.id, {
                    command: def,
                    canSelect: canSelect(b, self, foe, def),
                    state: serializeBattleState(b)
                });
                if (handled !== false) return;
            }
            selectCommand(b, self, foe, def);
        });
        container.appendChild(button);
    });
    if (note) {
        if (b.finished) note.textContent = '';
        else if (self.hp <= 0) note.textContent = '操舵不能。白兵戦に備えてください。';
        else if (self.pendingCommandId) note.textContent = `「${commandLabel(self.pendingCommandId, self)}」入力済み。相手を待っています。`;
        else note.textContent = 'コマンドを選択してください';
    }
}

function render(b) {
    renderShipPositions(b);
    renderStatus(b);
    renderWinRoutes(b);
    renderCommands(b);
}

function startNavalBattle(options = {}) {
    if (navalBoardingTimer) {
        clearTimeout(navalBoardingTimer);
        navalBoardingTimer = null;
    }
    if (navalVisualClearTimer) {
        clearTimeout(navalVisualClearTimer);
        navalVisualClearTimer = null;
    }
    const modal = ensureModal();
    const enemyPlan = options.enemyPlan ? resolveEnemyPlanByName(options.enemyPlan) : createEnemyPlan(options);
    battle = {
        options,
        mode: 'simultaneous',
        count: 0,
        turn: 0,
        distance: INITIAL_DISTANCE,
        enemyPlan,
        player: createShip(
            options.playerName ? `${options.playerName}の船` : '自分の船',
            true,
            options.playerProfile,
            options.playerShipProfile
        ),
        enemy: createShip(
            options.opponentName ? `${options.opponentName}の船` : '敵船',
            false,
            options.opponentProfile,
            options.opponentShipProfile
        ),
        logs: [],
        finished: false,
        outcome: null,
        reward: null,
        rewardResult: null,
        visualState: null,
        turnEvasions: [],
        evasionRollIndex: 0,
        timer: null
    };
    battle.reward = createRewardModel(options, battle.player, battle.enemy);
    applyOpeningArcana(battle, battle.player);
    applyOpeningArcana(battle, battle.enemy);
    const enemyTitle = document.getElementById('navalEnemyTitle');
    if (enemyTitle) enemyTitle.textContent = battle.enemy.label;
    const enemyName = document.getElementById('navalShipEnemyName');
    if (enemyName) enemyName.textContent = battle.enemy.label;
    const result = document.getElementById('navalBattleResult');
    if (result) result.hidden = true;
    const logEl = document.getElementById('navalBattleLog');
    if (logEl) logEl.innerHTML = '';
    log(battle, `${battle.enemy.label}と接敵！ 同時入力の海戦開始（${battle.enemyPlan.name}）`);
    if (hasElementAdvantage(battle.player.element, battle.enemy.element)) {
        log(battle, `属性相性: ${battle.player.elementLabel}が${battle.enemy.elementLabel}に有利`);
    } else if (hasElementAdvantage(battle.enemy.element, battle.player.element)) {
        log(battle, `属性相性: ${battle.enemy.elementLabel}が${battle.player.elementLabel}に有利`);
    }
    modal.classList.add('is-open');
    document.body.classList.add('naval-battle-lock');
    render(battle);
    return battle;
}

function applyNavalBattleSnapshot(snapshot, perspective = 'player') {
    if (!battle) return null;
    const next = transformSnapshotForPerspective(snapshot, perspective);
    if (!next) return null;
    const previousArcanaActivationId = battle.lastArcanaActivation?.id || null;
    battle.mode = 'simultaneous';
    battle.count = Math.max(0, Number(next.count) || 0);
    battle.turn = Math.max(0, Number(next.turn ?? next.count) || 0);
    battle.distance = Math.max(0, Number(next.distance ?? INITIAL_DISTANCE) || 0);
    battle.player = cloneShipState(next.player, '自分の船', true);
    battle.enemy = cloneShipState(next.enemy, '敵船', false);
    battle.enemyPlan = resolveEnemyPlanByName(next.enemyPlan);
    battle.reward = next.reward || createRewardModel(battle.options, battle.player, battle.enemy);
    battle.rewardResult = next.rewardResult || null;
    battle.lastArcanaActivation = next.lastArcanaActivation || null;
    battle.logs = Array.isArray(next.logs) ? next.logs.slice(0, 30) : [];
    battle.finished = Boolean(next.finished);
    battle.outcome = next.outcome || null;
    if (battle.finished) battle.rewardResult = resolveOutcomeReward(battle, battle.outcome);
    const enemyTitle = document.getElementById('navalEnemyTitle');
    if (enemyTitle) enemyTitle.textContent = battle.enemy.label;
    const enemyName = document.getElementById('navalShipEnemyName');
    if (enemyName) enemyName.textContent = battle.enemy.label;
    const logEl = document.getElementById('navalBattleLog');
    if (logEl) logEl.innerHTML = battle.logs.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
    render(battle);
    if (battle.lastArcanaActivation?.id && battle.lastArcanaActivation.id !== previousArcanaActivationId) {
        showArcanaCutin(
            battle.lastArcanaActivation.title,
            battle.lastArcanaActivation.body,
            battle.lastArcanaActivation.side
        );
    }
    if (battle.finished) showBattleResultOverlay(battle);
    return battle;
}

function applyNavalBattleCommand(commandId, side = 'player') {
    if (!battle || battle.finished) return false;
    const normalized = normalizeCommandId(commandId);
    const def = COMMANDS[normalized];
    if (!def) return false;
    const self = side === 'enemy' ? battle.enemy : battle.player;
    const foe = side === 'enemy' ? battle.player : battle.enemy;
    return selectCommand(battle, self, foe, def);
}

function stepNavalBattle() {
    if (!battle || battle.finished) return false;
    if (!battle.options.disableAi && battle.player.pendingCommandId && !battle.enemy.pendingCommandId) {
        const aiCommand = chooseAiCommand(battle);
        if (aiCommand) battle.enemy.pendingCommandId = aiCommand;
        resolveSimultaneousCommands(battle);
        render(battle);
        notifyStateChanged(battle);
        return true;
    }
    return false;
}

window.startNavalBattle = startNavalBattle;
if (typeof window.startMeleeCombat !== 'function') {
    window.startMeleeCombat = startMeleeCombat;
}

window.__navalBattleDebug = {
    getState: () => battle,
    serialize: () => serializeBattleState(battle),
    applySnapshot: applyNavalBattleSnapshot,
    applyCommand: applyNavalBattleCommand,
    step: stepNavalBattle,
    getCommandMatrix: analyzeCommandMatrix,
    resolveEvasionRate: ({ defenderFacing = 'front', defenderCommandId = '', attackerCommandId = '', defenderShipTraitKey = '' } = {}) => {
        const defender = {
            facing: defenderFacing,
            lastResolvingCommandId: defenderCommandId,
            shipTraitKey: normalizeShipTraitKey(defenderShipTraitKey),
            shipTraitUsed: false
        };
        let rate = evasionRateForShip(defender, attackerCommandId, defenderCommandId);
        const trait = getAvailableShipTrait(defender);
        if (trait?.type === 'rudder-evasion' && isRudderCommand(normalizeCommandId(defenderCommandId)) && isCannonCommand(attackerCommandId)) {
            rate = Math.min(Number(trait.max || rate), rate + Number(trait.bonus || 0));
        } else if (trait?.type === 'cannon-evasion' && normalizeCommandId(defenderCommandId) !== 'assault' && isCannonCommand(attackerCommandId)) {
            rate = Math.min(Number(trait.max || rate), rate + Number(trait.bonus || 0));
        }
        return clampNumber(rate, 0, 1, 0);
    },
    mutate: (fn) => {
        if (!battle || typeof fn !== 'function') return null;
        fn(battle);
        battle.player.facing = normalizeFacing(battle.player.facing);
        battle.enemy.facing = normalizeFacing(battle.enemy.facing);
        render(battle);
        notifyStateChanged(battle);
        return battle;
    },
    forceBoarding: () => { if (battle && !battle.finished) finishBattle(battle, 'boarding'); },
    forceOutcome: (outcome) => { if (battle && !battle.finished) finishBattle(battle, outcome); }
};
})();
