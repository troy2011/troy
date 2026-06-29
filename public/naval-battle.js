// =====================================================================
// 略奪海戦（同時入力式）
// ホームタブの「略奪に出る」から起動し、操舵不能時に白兵戦へ引き継ぐ。
// =====================================================================
(() => {
'use strict';

const STEERING_MAX = 3;
const NAVAL_DURABILITY_MAX = 5;
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
    front: 0.5,
    side: 0,
    back: 0,
    assault: 0,
    rudderHitReduction: 0.5
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
    guild: '王の船'
};
const SHIP_FORM_MAX_STEERING = {
    boat: 1,
    common: 1,
    explorer: 2,
    defender: 3,
    fighter: 3,
    merchant: 3,
    guild: 5
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
    guild: { attack: 0, defense: 0, speed: 0, cargo: 0 }
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
const SHIP_DOMAIN_LABEL = Object.freeze({
    surface: '海上',
    air: '飛行',
    underwater: '水中'
});
const NAVAL_SHIP_META = Object.freeze({
    boat: { name: '手漕ぎボート', form: 'boat', domain: 'surface', maxSteering: 1, lowFirepower: true, passiveName: '小さな船影', passiveKey: 'small-silhouette', passiveMode: 'continuous' },
    guild_ship: { name: '王の船', form: 'guild', domain: 'surface', maxSteering: 5, passiveName: '', passiveKey: '', passiveMode: '' },
    ship_human_explorer: { name: '帆付きボート', form: 'explorer', domain: 'surface', maxSteering: 1.5, lowFirepower: true, passiveName: '素直な舵', passiveKey: 'honest-rudder', passiveMode: 'continuous' },
    ship_human_defender: { name: '帆船', form: 'defender', domain: 'surface', maxSteering: 3, passiveName: '火炎弾', passiveKey: 'human-broadside-fire', passiveMode: 'continuous' },
    ship_human_fighter: { name: '海賊船', form: 'fighter', domain: 'surface', maxSteering: 3, passiveName: '焼夷弾', passiveKey: 'human-bow-fire', passiveMode: 'continuous' },
    ship_human_merchant: { name: '水上馬車', form: 'merchant', domain: 'surface', maxSteering: 3, passiveName: '馬衝角', passiveKey: 'human-assault-ram', passiveMode: 'continuous' },
    ship_elf_explorer: { name: '気球', form: 'explorer', domain: 'air', maxSteering: 2, lowFirepower: true, passiveName: '高空退避', passiveKey: 'balloon-retreat', passiveMode: 'once' },
    ship_elf_defender: { name: '海賊飛行船', form: 'defender', domain: 'air', maxSteering: 2, passiveName: '絨毯爆撃', passiveKey: 'elf-broadside-fear', passiveMode: 'continuous' },
    ship_elf_fighter: { name: '海賊飛空艇', form: 'fighter', domain: 'air', maxSteering: 2, passiveName: '爆弾投下', passiveKey: 'elf-bow-bomb', passiveMode: 'continuous' },
    ship_elf_merchant: { name: '飛行船', form: 'merchant', domain: 'air', maxSteering: 2, passiveName: '急降下', passiveKey: 'elf-assault-dive', passiveMode: 'pending' },
    ship_orc_explorer: { name: '石のボート', form: 'explorer', domain: 'surface', maxSteering: 1.5, lowFirepower: true, passiveName: '石造船殻', passiveKey: 'stone-hull', passiveMode: 'once' },
    ship_orc_defender: { name: '潜水艦', form: 'defender', domain: 'underwater', maxSteering: 4, passiveName: '水圧魚雷', passiveKey: 'pressure-torpedo', passiveMode: 'continuous' },
    ship_orc_fighter: { name: '水上戦車', form: 'fighter', domain: 'surface', maxSteering: 3, passiveName: '巨大砲', passiveKey: 'bow-mirror-null', passiveMode: 'once' },
    ship_orc_merchant: { name: '水上バス', form: 'merchant', domain: 'surface', maxSteering: 3, passiveName: '突進', passiveKey: 'assault-mirror-null', passiveMode: 'once' },
    ship_goblin_explorer: { name: 'キャタピラ・ボート', form: 'explorer', domain: 'surface', maxSteering: 1.5, lowFirepower: true, passiveName: '波風旋回', passiveKey: 'wave-turn', passiveMode: 'pending' },
    ship_goblin_defender: { name: '潜水艦・望遠鏡', form: 'defender', domain: 'underwater', maxSteering: 4, passiveName: '無泡魚雷', passiveKey: 'bubbleless-torpedo', passiveMode: 'continuous' },
    ship_goblin_fighter: { name: 'ドリルタンク', form: 'fighter', domain: 'surface', maxSteering: 3, passiveName: 'ドリル', passiveKey: 'goblin-assault-flood', passiveMode: 'continuous' },
    ship_goblin_merchant: { name: '水瓶船', form: 'merchant', domain: 'surface', maxSteering: 3, passiveName: '水爆弾', passiveKey: 'goblin-bow-flood', passiveMode: 'continuous' }
});
const NAVAL_SHIP_TRAITS = NAVAL_SHIP_META;

const NAVAL_ARCANA_GEAR_LEGACY = Object.freeze({
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

const NAVAL_ARCANA_GEAR_BY_NUMBER = Object.freeze({
    0: { equipmentName: '風まかせの予備舵', shipGearName: '風まかせの予備舵', gearPart: 'rudder', gearPartLabel: '舵', replacementCommand: 'portRudder', priority: 0, ultimateName: '愚者の自在取舵', roleLabel: '完全回避', shortDescription: '取舵を必ず成功させ、このターンの直接攻撃と付随効果を回避する。恐怖・混乱・ロックオンを解除する。', activationLog: '風まかせの予備舵が波を読み、攻撃を受け流した。', navalEffect: { type: 'fool-port-evade', replacementCommand: 'portRudder', forceRudderSuccess: true, avoidDirectThisTurn: true, cleanse: ['fear', 'confusion'], clearLockOn: true } },
    1: { equipmentName: '四元素の魔導砲', shipGearName: '四元素の魔導砲', gearPart: 'bow_cannon', gearPartLabel: '船首砲', replacementCommand: 'bowCannon', priority: 1, ultimateName: '魔術師の魔砲', roleLabel: '連射', shortDescription: '船首砲と同じ威力の魔砲を撃つ。次のターンも船首砲を使用できる。', activationLog: '四元素の魔導砲が通常砲とは別系統の砲撃を放った。', navalEffect: { type: 'magician-magic-bow', replacementCommand: 'bowCannon', keepBowReady: true } },
    2: { equipmentName: '潮祓いの聖羅針', shipGearName: '潮祓いの聖羅針', gearPart: 'compass', gearPartLabel: '羅針盤', arcanaElement: 'water', replacementCommand: 'starboardRudder', priority: 2, ultimateName: '女教皇の浄航', roleLabel: '浄化', shortDescription: '面舵成功後、炎上・浸水・恐怖・混乱を解除する。解除対象がなければ船を0.5回復する。', activationLog: '潮祓いの聖羅針が荒れた船内を鎮めた。', navalEffect: { type: 'priestess-cleanse-starboard', replacementCommand: 'starboardRudder', onRudderSuccess: { cleanse: ['fire', 'flood', 'fear', 'confusion'], fallbackHeal: 0.5 } } },
    3: { equipmentName: '豊穣の救護船倉', shipGearName: '豊穣の救護船倉', gearPart: 'hold', gearPartLabel: '船倉', replacementCommand: 'portRudder', priority: 3, ultimateName: '女帝の大補給', roleLabel: '大回復', shortDescription: '取舵成功後、船を1.5回復し、船員を全回復する。', activationLog: '豊穣の救護船倉から補給班が一斉に飛び出した。', navalEffect: { type: 'empress-port-heal', replacementCommand: 'portRudder', onRudderSuccess: { heal: 1.5, crewFullHeal: true } } },
    4: { equipmentName: '皇帝の鋼盾砲架', shipGearName: '皇帝の鋼盾砲架', gearPart: 'cannon_mount', gearPartLabel: '砲架', replacementCommand: 'bowCannon', priority: 4, ultimateName: '皇帝の盾砲', roleLabel: '盾化', shortDescription: '船首砲命中後、2ターンの間シールド状態になる。次に受ける直接攻撃の基本ダメージを半減する。', activationLog: '皇帝の鋼盾砲架が砲撃の反動を盾へ変えた。', navalEffect: { type: 'emperor-shield-bow', replacementCommand: 'bowCannon', onHitShield: { turns: 2, halveDirect: true } } },
    5: { equipmentName: '教皇の封印鐘', shipGearName: '教皇の封印鐘', gearPart: 'bell', gearPartLabel: '鐘', replacementCommand: 'bowCannon', priority: 5, ultimateName: '教皇の封印砲', roleLabel: '封印', shortDescription: '船首砲命中後、相手は次の1ターンだけ置換型大アルカナを使用できない。', activationLog: '教皇の封印鐘が敵船の大アルカナを沈黙させた。', navalEffect: { type: 'hierophant-seal-bow', replacementCommand: 'bowCannon', onHitLockReplacement: 1 } },
    6: { equipmentName: '恋人の双胴鎖', shipGearName: '恋人の双胴鎖', gearPart: 'chain', gearPartLabel: '鎖', replacementCommand: 'assault', priority: 6, ultimateName: '恋人の連結', roleLabel: '双拘束', shortDescription: '両船を連結する。次のターンは双方とも面舵・取舵を使用できない。', activationLog: '恋人の双胴鎖が両船を結び、互いの舵を封じた。', navalEffect: { type: 'lovers-bind-assault', replacementCommand: 'assault', bothRudderLock: 1 } },
    7: { equipmentName: '戦車の破浪衝角', shipGearName: '戦車の破浪衝角', gearPart: 'ram', gearPartLabel: '衝角', replacementCommand: 'assault', priority: 7, ultimateName: '戦車の制圧突撃', roleLabel: '突撃勝利', shortDescription: '命中した敵に浸水を付与する。敵も突撃だった場合は勝利扱いとなり、自分は衝突ダメージを受けない。', activationLog: '戦車の破浪衝角が正面衝突を押し勝った。', navalEffect: { type: 'chariot-assault', replacementCommand: 'assault', onHitStatus: { flood: 2 }, winAssaultMirror: true } },
    8: { equipmentName: '獅子の士気竜骨', shipGearName: '獅子の士気竜骨', gearPart: 'keel', gearPartLabel: '竜骨', replacementCommand: 'assault', priority: 8, ultimateName: '力の鼓舞突撃', roleLabel: '士気', shortDescription: '自分の恐怖・混乱を解除し、士気を1段階上昇。敵の旋回を止めた場合、敵の舵輪を次のターン終了まで損傷させる。', activationLog: '獅子の士気竜骨が船員を奮い立たせた。', navalEffect: { type: 'strength-assault', replacementCommand: 'assault', cleanse: ['fear', 'confusion'], morale: 1, rudderDamageOnStop: 1 } },
    9: { equipmentName: '隠者の消灯帆', shipGearName: '隠者の消灯帆', gearPart: 'sail', gearPartLabel: '帆', replacementCommand: 'blankShot', priority: 9, ultimateName: '隠者の霧隠れ', roleLabel: '砲撃回避', shortDescription: '自分へのロックオンを解除し、次ターン終了時まで最初に受ける敵砲撃の命中率を20ポイント低下させる。', activationLog: '隠者の消灯帆が船影を消した。', navalEffect: { type: 'hermit-blank', replacementCommand: 'blankShot', clearLockOn: true, nextCannonHitDown: 0.2, turns: 1 } },
    10: { equipmentName: '運命輪の逆潮舵', shipGearName: '運命輪の逆潮舵', gearPart: 'wheel', gearPartLabel: '輪舵', replacementCommand: 'starboardRudder', priority: 10, ultimateName: '運命輪の面舵', roleLabel: '反動', shortDescription: '面舵は必ず成功する。敵の砲撃が外れた場合、敵へ反動ダメージ0.5を与える。', activationLog: '運命輪の逆潮舵が砲撃の流れを跳ね返した。', navalEffect: { type: 'wheel-starboard', replacementCommand: 'starboardRudder', forceRudderSuccess: true, cannonMissRecoil: 0.5 } },
    11: { equipmentName: '正義の写し衝角', shipGearName: '正義の写し衝角', gearPart: 'ram', gearPartLabel: '衝角', replacementCommand: 'assault', priority: 11, ultimateName: '正義の反照突撃', roleLabel: '状態反射', shortDescription: '命中した敵に、自分と同じ状態異常を同じ持続時間で付与する。自分の状態は解除されない。', activationLog: '正義の写し衝角が自船の災いを敵船へ映した。', navalEffect: { type: 'justice-assault', replacementCommand: 'assault', reflectOwnStatuses: true } },
    12: { equipmentName: '吊男の身代わり錨', shipGearName: '吊男の身代わり錨', gearPart: 'anchor', gearPartLabel: '錨', replacementCommand: 'blankShot', priority: 12, ultimateName: '吊男の犠牲煙幕', roleLabel: '半減', shortDescription: '敵へ恐怖を付与する。このターンに受ける直接攻撃の基本ダメージを半減し、状態異常も受けない。', activationLog: '吊男の身代わり錨が被害を肩代わりした。', navalEffect: { type: 'hanged-blank', replacementCommand: 'blankShot', targetStatus: { fear: 2 }, halveDirectThisTurn: true, statusImmuneThisTurn: true } },
    13: { equipmentName: '死神の時限黒砲', shipGearName: '死神の時限黒砲', gearPart: 'broadside_cannon', gearPartLabel: '舷側砲', replacementCommand: 'broadside', priority: 13, ultimateName: '死神の遅延砲', roleLabel: '遅延', shortDescription: '命中した敵へ死の刻印を付け、3ターン後に1ダメージを与える。', activationLog: '死神の時限黒砲が敵船に遅れて弾ける刻印を刻んだ。', navalEffect: { type: 'death-broadside', replacementCommand: 'broadside', delayedDamage: { turns: 3, damage: 1 } } },
    14: { equipmentName: '節制の整備樽', shipGearName: '節制の整備樽', gearPart: 'barrel', gearPartLabel: '整備樽', replacementCommand: 'blankShot', priority: 14, ultimateName: '節制の整備号令', roleLabel: '整備', shortDescription: '自分の状態異常を解除する。士気は中立になる。', activationLog: '節制の整備樽が船内の混乱を整えた。', navalEffect: { type: 'temperance-blank', replacementCommand: 'blankShot', cleanseAllStatuses: true, moraleToNeutral: true } },
    15: { equipmentName: '悪魔の業火舷砲', shipGearName: '悪魔の業火舷砲', gearPart: 'broadside_cannon', gearPartLabel: '舷側砲', replacementCommand: 'broadside', priority: 15, ultimateName: '悪魔の混炎砲', roleLabel: '混乱炎上', shortDescription: '命中した敵を混乱と炎上にする。', activationLog: '悪魔の業火舷砲が敵船を混乱と炎で包んだ。', navalEffect: { type: 'devil-broadside', replacementCommand: 'broadside', onHitStatus: { confusion: 2, fire: 2 } } },
    16: { equipmentName: '塔の雷撃マスト', shipGearName: '塔の雷撃マスト', gearPart: 'mast', gearPartLabel: 'マスト', replacementCommand: 'broadside', priority: 16, ultimateName: '塔の雷撃砲', roleLabel: '設備損傷', shortDescription: '雷撃砲になる。命中時、敵船員へ10%ダメージを与え、2ターンのマスト損傷を付与する。', activationLog: '塔の雷撃マストが雷を砲弾へ落とし込んだ。', navalEffect: { type: 'tower-broadside', replacementCommand: 'broadside', crewDamagePercent: 10, mastDamage: 2 } },
    17: { equipmentName: '星灯りの照準旗', shipGearName: '星灯りの照準旗', gearPart: 'flag', gearPartLabel: '旗', replacementCommand: 'blankShot', priority: 17, ultimateName: '星の照準祈願', roleLabel: '照準', shortDescription: '自分の霧・命中率低下を解除。2ターン以内の次砲撃の命中率+20ポイント。命中時に船体を1回復する。', activationLog: '星灯りの照準旗が次の砲撃へ道筋を示した。', navalEffect: { type: 'star-blank', replacementCommand: 'blankShot', clearAimDown: true, nextCannonHitUp: 0.2, turns: 2, healOnCannonHit: 1 } },
    18: { equipmentName: '月影の幻霧帆', shipGearName: '月影の幻霧帆', gearPart: 'fog_sail', gearPartLabel: '霧帆', replacementCommand: 'blankShot', priority: 18, ultimateName: '月の幻影', roleLabel: '幻影', shortDescription: '幻影を1体作る。次に受ける最初の砲撃または単体妨害を50%で幻影に吸わせる。突撃には無効。', activationLog: '月影の幻霧帆が本物そっくりの船影を作った。', navalEffect: { type: 'moon-blank', replacementCommand: 'blankShot', illusionChance: 0.5, hideHp: true } },
    19: { equipmentName: '太陽の浄火炉', shipGearName: '太陽の浄火炉', gearPart: 'deck_furnace', gearPartLabel: '甲板炉', replacementCommand: 'blankShot', priority: 19, ultimateName: '太陽の照破', roleLabel: '照破', shortDescription: 'ターン終了後、敵の隠密・幻影と戦場の霧を解除。2ターン以内の次砲撃命中で敵を炎上させる。', activationLog: '太陽の浄火炉が幻を焼き払い、次弾に熱を宿した。', navalEffect: { type: 'sun-blank', replacementCommand: 'blankShot', clearEnemyConcealment: true, nextCannonStatus: { fire: 2 }, turns: 2 } },
    20: { equipmentName: '審判の修復号鐘', shipGearName: '審判の修復号鐘', gearPart: 'bell', gearPartLabel: '号鐘', replacementCommand: 'blankShot', priority: 20, ultimateName: '審判の復旧', roleLabel: '復旧', shortDescription: '自分の恐怖・混乱を解除し、船員を20%回復。さらに設備を修復する。炎上・浸水は解除しない。', activationLog: '審判の修復号鐘が船員と設備を立て直した。', navalEffect: { type: 'judgement-blank', replacementCommand: 'blankShot', cleanse: ['fear', 'confusion'], crewHealPercent: 20, repairEquipment: true } },
    21: { equipmentName: '世界航路の照準環', shipGearName: '世界航路の照準環', gearPart: 'world_compass', gearPartLabel: '環羅針', replacementCommand: 'broadside', priority: 21, ultimateName: '世界の完全ロックオン', roleLabel: '完全照準', shortDescription: '敵を完全ロックオンする。3ターン以内の次砲撃は最終命中率90%未満にならず、霧・隠密・幻影を無視する。', activationLog: '世界航路の照準環が敵船の逃げ道を閉ざした。', navalEffect: { type: 'world-broadside', replacementCommand: 'broadside', completeLockOnTurns: 3, minFinalHitRate: 0.9, ignoreConcealment: true } }
});
const NAVAL_ARCANA_GEAR = Object.freeze(Object.fromEntries(
    Object.entries(NAVAL_ARCANA_GEAR_BY_NUMBER).map(([number, gear]) => [`arcana-${number}`, gear])
));

const COMMAND_TYPE_LABEL = {
    cannon: '砲撃',
    move: '操船',
    rudder: '操舵',
    feint: '牽制',
    boarding: '接舷',
    repair: '修理'
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
    repair: {
        id: 'repair',
        label: '修理',
        type: 'repair',
        icon: './assets/ui/icons/083.png',
        desc: 'マスト損傷と舵輪損傷を修復する。状態異常は解除しない'
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
const NAVAL_AUTO_BOARDING_DELAY_MS = NAVAL_VISUAL_EFFECT_MS + 120;
const NAVAL_SHIP_SURFACE_TOP = 112;
const NAVAL_SHIP_AIR_TOP = 82;
const NAVAL_TAROT_SPRITE = Object.freeze({
    path: './Sprites/Buildings/tarot.png',
    width: 48,
    height: 80,
    cols: 10
});
const SHIP_SPRITE_FRAME_SIZE = 64;
const SHIP_SPRITE_GROUP_X = {
    boat: 0,
    common: 0,
    explorer: -384,
    defender: -768,
    fighter: -1152,
    merchant: -1536,
    guild: -768
};
const SHIP_SPRITE_DEFAULT_ASSET = Object.freeze({
    path: './Sprites/Ships/ships.png',
    frameSize: 64,
    sheetWidth: 2048,
    sheetHeight: 1024,
    scale: 1.45
});
const SHIP_SPRITE_RACE_SHEETS = Object.freeze({
    human: './Sprites/Ships/ships_blue.png',
    elf: './Sprites/Ships/ships_green.png',
    goblin: './Sprites/Ships/ships_yellow.png',
    orc: './Sprites/Ships/ships_red.png'
});
const SHIP_SPRITE_BLOCK_SIZE = Object.freeze({ width: 384, height: 256 });
const SHIP_SPRITE_BLOCKS = Object.freeze({
    boat: { row: 0, col: 0 },
    common: { row: 0, col: 0 },
    explorer: { row: 0, col: 1 },
    defender: { row: 0, col: 2 },
    fighter: { row: 0, col: 3 },
    merchant: { row: 0, col: 4 },
    guild: { row: 0, col: 2 },
    guild_ship: { row: 0, col: 2 },
    ship_human_explorer: { row: 0, col: 1 },
    ship_human_defender: { row: 0, col: 2 },
    ship_human_fighter: { row: 0, col: 3 },
    ship_human_merchant: { row: 0, col: 4 },
    ship_elf_explorer: { row: 1, col: 1 },
    ship_elf_fighter: { row: 1, col: 2 },
    ship_elf_defender: { row: 1, col: 3 },
    ship_elf_merchant: { row: 1, col: 4 },
    ship_orc_explorer: { row: 2, col: 1 },
    ship_orc_defender: { row: 2, col: 2 },
    ship_orc_fighter: { row: 2, col: 3 },
    ship_orc_merchant: { row: 2, col: 4 },
    ship_goblin_explorer: { row: 3, col: 1 },
    ship_goblin_defender: { row: 3, col: 2 },
    ship_goblin_fighter: { row: 3, col: 3 },
    ship_goblin_merchant: { row: 3, col: 4 }
});
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
let navalBoardingDelayTimer = null;

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

function durationValue(entry) {
    if (typeof entry === 'number') return Math.max(0, Math.floor(entry));
    return Math.max(0, Math.floor(Number(asObject(entry).turns || 0) || 0));
}

function normalizeDurationMap(source = {}) {
    const map = {};
    Object.entries(asObject(source)).forEach(([key, value]) => {
        const turns = durationValue(value);
        if (turns > 0) map[key] = { ...asObject(value), turns, fresh: Boolean(asObject(value).fresh) };
    });
    return map;
}

function durationMapForSnapshot(source = {}) {
    const map = {};
    Object.entries(asObject(source)).forEach(([key, value]) => {
        const turns = durationValue(value);
        if (turns > 0) map[key] = { ...asObject(value), turns, fresh: Boolean(asObject(value).fresh) };
    });
    return map;
}

function hasDuration(source, key) {
    return durationValue(asObject(source)[key]) > 0;
}

function setDuration(source, key, turns, extra = {}) {
    if (!source || !key) return;
    const nextTurns = Math.max(durationValue(source[key]), Math.floor(Number(turns) || 0));
    if (nextTurns > 0) source[key] = { ...extra, turns: nextTurns, fresh: true };
}

function clearDuration(source, key) {
    if (source && key) delete source[key];
}

function setPendingEffect(ship, key, value, turns = 1, extra = {}) {
    if (!ship || !key) return;
    ship.pendingShotEffects = { ...asObject(ship.pendingShotEffects) };
    ship.pendingShotEffects[key] = { ...extra, value, turns: Math.max(1, Math.floor(Number(turns) || 1)), fresh: true };
}

function pendingEffectValue(ship, key, fallback = 0) {
    const entry = asObject(ship?.pendingShotEffects)[key];
    if (entry && typeof entry === 'object') return Number(entry.value ?? fallback) || fallback;
    return Number(entry ?? fallback) || fallback;
}

function pendingEffectPayload(ship, key) {
    const entry = asObject(ship?.pendingShotEffects)[key];
    if (!entry) return null;
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) return entry.value;
    return entry;
}

function consumePendingEffect(ship, key) {
    if (ship?.pendingShotEffects) delete ship.pendingShotEffects[key];
}

function clampPercent(value, fallback = 100) {
    return clampNumber(value, 0, 100, fallback);
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
    if (key === 'ship_common_boat' || key === 'common' || key === 'boat') return 'boat';
    if (NAVAL_SHIP_META[key]) return key;
    const embedded = Object.keys(NAVAL_SHIP_META).find((traitKey) => traitKey !== 'boat' && key.includes(traitKey));
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
    if (normalizedForm === 'guild') return 'guild_ship';
    if (normalizedForm === 'boat' || normalizedForm === 'common') return 'boat';
    const fallback = race && normalizedForm ? `ship_${race}_${normalizedForm}` : '';
    return NAVAL_SHIP_META[fallback] ? fallback : '';
}

function shipMetaForKey(key, form = '') {
    const normalizedKey = normalizeShipTraitKey(key);
    if (NAVAL_SHIP_META[normalizedKey]) return NAVAL_SHIP_META[normalizedKey];
    if (!String(form || '').trim()) return null;
    const normalizedForm = normalizeShipForm({ form });
    if (normalizedForm === 'boat' || normalizedForm === 'common') return NAVAL_SHIP_META.boat;
    return null;
}

function maxSteeringForForm(form) {
    return SHIP_FORM_MAX_STEERING[form] || SHIP_FORM_MAX_STEERING.boat;
}

function maxSteeringForShip(form, meta = null) {
    return clampSteeringValue(meta?.maxSteering ?? maxSteeringForForm(form), 0.5, NAVAL_DURABILITY_MAX, maxSteeringForForm(form));
}

function weaponClassForForm(form, meta = null) {
    if (meta?.lowFirepower) return 'small';
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
    if (commandId === 'bowCannon') return BOW_DAMAGE;
    if (commandId === 'broadside') return BROADSIDE_DAMAGE;
    return 0;
}

function previewCannonDamageForShip(ship, commandId) {
    const base = cannonDamageForShip(ship, commandId);
    if (!ship?.lowFirepower || base <= 0) return base;
    return Math.max(STEERING_STEP, roundSteeringValue(base / 2));
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

function isDirectAttackCommand(commandId) {
    return isAttackCommand(commandId);
}

function isRudderCommand(commandId) {
    return commandId === 'starboardRudder' || commandId === 'portRudder';
}

function evasionRateForShip(defender, attackerCommandId, defenderCommandId = defender?.lastResolvingCommandId, attacker = null) {
    if (!defender || !isCannonCommand(attackerCommandId)) return 0;
    const activeCommandId = normalizeCommandId(defenderCommandId);
    if (activeCommandId === 'assault') return EVASION_RATE.assault;
    const facing = normalizeFacing(defender.facing);
    let rate = EVASION_RATE.back;
    if (facing === 'front') rate = EVASION_RATE.front;
    else if (isSideFacing(facing)) rate = EVASION_RATE.side;
    if (isRudderCommand(activeCommandId)) {
        const baseHitRate = Math.max(0, 1 - rate);
        let reduction = hasDuration(defender.equipmentDamage, 'mast')
            ? EVASION_RATE.rudderHitReduction / 2
            : EVASION_RATE.rudderHitReduction;
        if (hasDuration(defender.statuses, 'flood')) reduction = Math.max(0, reduction - 0.1);
        rate = 1 - Math.max(0, baseHitRate - reduction);
    }
    if (defender.shipDomain === 'air') rate += 0.3;
    if (defender.shipDomain === 'underwater') rate -= 0.3;
    if (shipHasPassive(defender, 'small-silhouette')) rate += 0.05;
    if (shipHasPassive(defender, 'honest-rudder') && isRudderCommand(activeCommandId)) rate += 0.1;
    if (shipHasPassive(attacker, 'bubbleless-torpedo') && attackerCommandId === 'broadside') rate -= 0.2;
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
    const worldLock = asObject(attacker.pendingShotEffects?.worldLock);
    const ignoreConcealment = Boolean(worldLock.turns > 0 && isCannonCommand(attackerCommandId));
    if (!ignoreConcealment && defender.illusion && isCannonCommand(attackerCommandId)) {
        const chance = clampNumber(defender.illusion.chance, 0, 1, 0.5);
        const roll = nextEvasionRoll(b);
        defender.illusion = null;
        if (roll < chance) {
            recordEvasionResult(b, attacker, defender, attackerCommandId, 1, roll);
            log(b, `${defender.label}の幻影が砲撃を吸い込んだ`);
            return true;
        }
    }
    let rate = evasionRateForShip(defender, attackerCommandId, defenderCommandId, attacker);
    if (hasDuration(attacker.statuses, 'fire')) rate += 0.1;
    if (pendingEffectValue(defender, 'incomingCannonHitDown') > 0 && isCannonCommand(attackerCommandId)) {
        rate += pendingEffectValue(defender, 'incomingCannonHitDown');
        consumePendingEffect(defender, 'incomingCannonHitDown');
    }
    if (pendingEffectValue(attacker, 'nextCannonHitUp') > 0 && isCannonCommand(attackerCommandId)) {
        rate -= pendingEffectValue(attacker, 'nextCannonHitUp');
    }
    if (pendingShipPassiveValue(defender, 'waveTurn') > 0 && isCannonCommand(attackerCommandId)) {
        const value = pendingShipPassiveValue(defender, 'waveTurn');
        consumeShipPassivePending(defender, 'waveTurn');
        rate += value;
        logShipPassive(b, defender, `波風旋回で砲撃命中率 -${formatRatePercent(value)}`);
    }
    if (shipHasPassive(defender, 'balloon-retreat')
        && isCannonCommand(attackerCommandId)
        && !shipPassiveWasUsed(defender, 'balloon-retreat')) {
        markShipPassiveUsed(b, defender, 'balloon-retreat', `最初の砲撃命中率 -${formatRatePercent(0.2)}`);
        rate += 0.2;
    }
    if (shipHasPassive(defender, 'pressure-torpedo')
        && defenderCommandId === 'broadside'
        && isCannonCommand(attackerCommandId)) {
        rate = Math.max(rate, 0.2);
    }
    if (ignoreConcealment) {
        rate = Math.min(rate, Math.max(0, 1 - Number(worldLock.minFinalHitRate || 0.9)));
        consumePendingEffect(attacker, 'worldLock');
    }
    rate = clampNumber(rate, 0, 1, 0);
    if (rate <= 0) return false;
    if (rate >= 1) {
        recordEvasionResult(b, attacker, defender, attackerCommandId, rate, 0);
        log(b, `${defender.label}は回避した（回避率${formatRatePercent(rate)}）`);
        return true;
    }
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

function shipSpriteAsset(ship) {
    const key = String(ship?.shipTraitKey || '').toLowerCase();
    const race = key.match(/^ship_(human|elf|goblin|orc)_/)?.[1] || '';
    return {
        ...SHIP_SPRITE_DEFAULT_ASSET,
        path: SHIP_SPRITE_RACE_SHEETS[race] || SHIP_SPRITE_DEFAULT_ASSET.path
    };
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
    const asset = shipSpriteAsset(ship);
    const form = visualShipForm(ship);
    const key = String(ship?.shipTraitKey || '').toLowerCase();
    const block = SHIP_SPRITE_BLOCKS[key] || SHIP_SPRITE_BLOCKS[form] || SHIP_SPRITE_BLOCKS.boat;
    const groupX = -(block.col * SHIP_SPRITE_BLOCK_SIZE.width);
    const groupY = -(block.row * SHIP_SPRITE_BLOCK_SIZE.height);
    const frames = SHIP_SPRITE_FRAMES[side] || SHIP_SPRITE_FRAMES.player;
    const pose = visualPose || normalizeFacing(ship?.facing);
    const frame = frames[pose] || frames.front;
    return {
        x: groupX + frame.x,
        y: groupY + frame.y,
        asset,
        frameSize: asset.frameSize
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

function normalizeArcanaSpriteIndex(value, fallback = 0) {
    const number = Number(value);
    if (Number.isFinite(number)) return Math.max(0, Math.floor(number));
    return Math.max(0, Math.floor(Number(fallback) || 0));
}

function arcanaSpriteInfo(source = {}) {
    const gear = asObject(source);
    const width = Math.max(1, Math.floor(Number(gear.spriteWidth || NAVAL_TAROT_SPRITE.width) || NAVAL_TAROT_SPRITE.width));
    const height = Math.max(1, Math.floor(Number(gear.spriteHeight || NAVAL_TAROT_SPRITE.height) || NAVAL_TAROT_SPRITE.height));
    const cols = Math.max(1, Math.floor(Number(gear.spriteCols || NAVAL_TAROT_SPRITE.cols) || NAVAL_TAROT_SPRITE.cols));
    const index = normalizeArcanaSpriteIndex(gear.spriteIndex ?? gear.sprite_index, gear.arcanaNumber);
    return {
        spritePath: gear.spritePath || NAVAL_TAROT_SPRITE.path,
        spriteIndex: index,
        spriteWidth: width,
        spriteHeight: height,
        spriteCols: cols
    };
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
    const sprite = arcanaSpriteInfo({
        ...gear,
        ...sourceGear,
        ...source,
        arcanaNumber,
        spriteIndex: source.spriteIndex ?? source.sprite_index ?? sourceGear.spriteIndex ?? sourceGear.sprite_index ?? gear.spriteIndex ?? gear.sprite_index
    });
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
        replacementCommand: normalizeCommandId(gear.replacementCommand || sourceGear.replacementCommand || gear.navalEffect?.replacementCommand),
        priority: Number.isFinite(Number(gear.priority ?? sourceGear.priority)) ? Number(gear.priority ?? sourceGear.priority) : arcanaNumber,
        navalEffect: { ...(gear.navalEffect || {}) },
        spritePath: sprite.spritePath,
        spriteIndex: sprite.spriteIndex,
        spriteWidth: sprite.spriteWidth,
        spriteHeight: sprite.spriteHeight,
        spriteCols: sprite.spriteCols,
        used: Boolean(source.used),
        arcanaElementUsed: Boolean(source.arcanaElementUsed)
    };
}

function resolveArcanaGearsFromShipProfile(shipProfile = {}) {
    const profile = asObject(shipProfile);
    if (normalizeShipForm(profile) === 'guild') return [];
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

function arcanaReplacementCommand(gear) {
    return normalizeCommandId(gear?.replacementCommand || gear?.navalEffect?.replacementCommand);
}

function isArcanaReplacementSuppressed(ship) {
    return Number(ship?.arcanaCommandLocks?.replacement || 0) > 0;
}

function activeArcanaForCommand(ship, commandId) {
    const normalized = normalizeCommandId(commandId);
    if (!ship || !normalized || isArcanaReplacementSuppressed(ship)) return null;
    return (ship.arcanaGears || [])
        .filter((gear) => gear && !gear.used && arcanaReplacementCommand(gear) === normalized)
        .sort((a, b) => (Number(a.priority ?? a.arcanaNumber) - Number(b.priority ?? b.arcanaNumber)) || (a.slotIndex - b.slotIndex))[0] || null;
}

function pendingArcanaForCommand(ship, commandId) {
    const normalized = normalizeCommandId(commandId);
    const key = ship?.pendingArcanaKey || '';
    if (!key) return null;
    return (ship.arcanaGears || []).find((gear) => gear?.key === key && !gear.used && arcanaReplacementCommand(gear) === normalized) || null;
}

function hasEquipmentDamage(ship) {
    return hasDuration(ship?.equipmentDamage, 'mast') || hasDuration(ship?.equipmentDamage, 'rudder');
}

function adjustMorale(ship, delta) {
    if (!ship || !delta) return;
    ship.morale = clampNumber((Number(ship.morale) || 0) + delta, -2, 2, 0);
}

function damageCrew(ship, percent) {
    if (!ship) return 0;
    const before = clampPercent(ship.crewHpPercent, 100);
    ship.crewHpPercent = clampPercent(before - Math.max(0, Number(percent) || 0), 100);
    return Math.max(0, before - ship.crewHpPercent);
}

function drainCrewMp(ship, percent) {
    if (!ship) return 0;
    const before = clampPercent(ship.crewMpPercent, 100);
    ship.crewMpPercent = clampPercent(before - Math.max(0, Number(percent) || 0), 100);
    return Math.max(0, before - ship.crewMpPercent);
}

function healCrew(ship, percent) {
    if (!ship) return 0;
    const before = clampPercent(ship.crewHpPercent, 100);
    ship.crewHpPercent = clampPercent(before + Math.max(0, Number(percent) || 0), 100);
    return Math.max(0, ship.crewHpPercent - before);
}

function cleanseStatuses(ship, names = []) {
    if (!ship) return 0;
    ship.statuses = normalizeDurationMap(ship.statuses);
    const targets = names.length ? names : Object.keys(ship.statuses);
    let removed = 0;
    targets.forEach((name) => {
        if (hasDuration(ship.statuses, name)) {
            delete ship.statuses[name];
            removed += 1;
        }
    });
    return removed;
}

function repairEquipment(ship) {
    if (!ship) return 0;
    const before = Object.keys(normalizeDurationMap(ship.equipmentDamage)).length;
    ship.equipmentDamage = {};
    return before;
}

function addStatus(b, ship, name, turns, source = null) {
    if (!ship || !name || Number(ship.battleFlags?.statusImmuneThisTurn || 0) > 0) return false;
    ship.statuses = normalizeDurationMap(ship.statuses);
    setDuration(ship.statuses, name, turns, { source: source?.label || '' });
    if (b) log(b, `${ship.label}に${statusLabel(name)}が付与された`);
    return true;
}

function addStatuses(b, ship, statuses = {}, source = null) {
    let applied = 0;
    Object.entries(asObject(statuses)).forEach(([name, turns]) => {
        if (addStatus(b, ship, name, turns, source)) applied += 1;
    });
    return applied;
}

function addEquipmentDamage(b, ship, name, turns) {
    if (!ship || !name) return false;
    ship.equipmentDamage = normalizeDurationMap(ship.equipmentDamage);
    setDuration(ship.equipmentDamage, name, turns);
    if (b) log(b, `${ship.label}の${equipmentDamageLabel(name)}が損傷した`);
    return true;
}

function tickDurationMap(map = {}) {
    const next = {};
    Object.entries(normalizeDurationMap(map)).forEach(([key, value]) => {
        if (value.fresh) {
            next[key] = { ...value, fresh: false };
            return;
        }
        const turns = durationValue(value) - 1;
        if (turns > 0) next[key] = { ...value, turns, fresh: false };
    });
    return next;
}

function tickPendingEffects(effects = {}) {
    const next = {};
    Object.entries(asObject(effects)).forEach(([key, value]) => {
        const entry = value && typeof value === 'object' ? { ...value } : { value };
        const turns = Math.max(0, Math.floor(Number(entry.turns || 0) || 0));
        if (!turns) {
            next[key] = entry;
            return;
        }
        if (entry.fresh) {
            next[key] = { ...entry, fresh: false };
            return;
        }
        if (turns > 1) next[key] = { ...entry, turns: turns - 1, fresh: false };
    });
    return next;
}

function statusLabel(name) {
    return {
        fire: '炎上',
        flood: '浸水',
        confusion: '混乱',
        fear: '恐怖'
    }[name] || name;
}

function equipmentDamageLabel(name) {
    return {
        mast: 'マスト',
        rudder: '舵輪'
    }[name] || name;
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
    const shipTraitKey = resolveShipTraitKey(publicProfile, shipProfile, form);
    const shipMeta = shipMetaForKey(shipTraitKey, form);
    const weaponClass = weaponClassForForm(form, shipMeta);
    const domain = shipMeta?.domain || 'surface';
    return {
        form,
        formLabel: shipMeta?.name || SHIP_FORM_LABEL[form] || '船',
        name: label,
        level,
        shipLevel,
        maxSteering: maxSteeringForShip(form, shipMeta),
        weaponClass,
        weaponLabel: weaponLabelForClass(weaponClass),
        shipTraitKey,
        shipTraitName: shipMeta?.passiveName || '',
        shipDomain: domain,
        shipDomainLabel: SHIP_DOMAIN_LABEL[domain] || SHIP_DOMAIN_LABEL.surface,
        lowFirepower: Boolean(shipMeta?.lowFirepower || weaponClass === 'small'),
        shipPassiveKey: shipMeta?.passiveKey || '',
        shipPassiveName: shipMeta?.passiveName || '',
        shipPassiveMode: shipMeta?.passiveMode || '',
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
        shipDomain: spec.shipDomain,
        shipDomainLabel: spec.shipDomainLabel,
        lowFirepower: spec.lowFirepower,
        shipPassiveKey: spec.shipPassiveKey,
        shipPassiveName: spec.shipPassiveName,
        shipPassiveMode: spec.shipPassiveMode,
        shipPassiveUses: {},
        shipPassivePending: {},
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
        arcanaDamageShield: null,
        arcanaNextCannonBonus: 0,
        arcanaIgnoreNextDefense: false,
        arcanaCommandLocks: {},
        morale: 0,
        crewHpPercent: 100,
        crewMpPercent: 100,
        statuses: {},
        equipmentDamage: {},
        lockOn: null,
        illusion: null,
        pendingShotEffects: {},
        delayedEffects: [],
        battleFlags: {},
        facing: 'front',
        reload: 0,
        pendingCommandId: null,
        pendingArcanaKey: null,
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
    const resolvedTraitKey = normalizeShipTraitKey(
        source?.shipTraitKey
        || source?.itemId
        || source?.ItemId
        || source?.friendlyId
        || source?.FriendlyId
    ) || (ship.shipForm === 'boat' ? 'boat' : '');
    const shipMeta = shipMetaForKey(resolvedTraitKey, ship.shipForm);
    ship.shipType = String(source?.shipType || shipMeta?.name || SHIP_FORM_LABEL[ship.shipForm] || ship.shipType || '船');
    ship.shipName = String(source?.shipName || ship.shipName || ship.shipType || '船');
    ship.maxHp = clampSteeringValue(source?.maxHp ?? source?.maxSteering ?? maxSteeringForShip(ship.shipForm, shipMeta), 0.5, NAVAL_DURABILITY_MAX, maxSteeringForShip(ship.shipForm, shipMeta));
    ship.hp = clampSteeringValue(source?.hp ?? source?.steering ?? ship.maxHp, 0, ship.maxHp, ship.maxHp);
    ship.shipLevel = Math.max(1, Number(source?.shipLevel || ship.shipLevel || 1) || 1);
    ship.playerLevel = Math.max(1, Number(source?.playerLevel || ship.playerLevel || 1) || 1);
    ship.element = normalizeElement(source?.element || source?.nation || ship.element);
    ship.elementLabel = String(source?.elementLabel || ELEMENT_LABEL[ship.element] || ELEMENT_LABEL.none);
    ship.weaponClass = source?.weaponClass === 'cannon' || source?.weaponClass === 'small'
        ? source.weaponClass
        : weaponClassForForm(ship.shipForm, shipMeta);
    ship.weaponLabel = String(source?.weaponLabel || weaponLabelForClass(ship.weaponClass));
    const domain = source?.shipDomain || shipMeta?.domain || 'surface';
    ship.shipDomain = domain;
    ship.shipDomainLabel = String(source?.shipDomainLabel || SHIP_DOMAIN_LABEL[domain] || SHIP_DOMAIN_LABEL.surface);
    ship.lowFirepower = Boolean(source?.lowFirepower ?? (shipMeta?.lowFirepower || ship.weaponClass === 'small'));
    ship.shipPassiveKey = String(source?.shipPassiveKey || shipMeta?.passiveKey || '');
    ship.shipPassiveName = String(source?.shipPassiveName || source?.shipTraitName || shipMeta?.passiveName || '');
    ship.shipPassiveMode = String(source?.shipPassiveMode || shipMeta?.passiveMode || '');
    ship.shipPassiveUses = { ...asObject(source?.shipPassiveUses) };
    ship.shipPassivePending = { ...asObject(source?.shipPassivePending) };
    ship.shipTraitKey = resolvedTraitKey;
    ship.shipTraitName = ship.shipPassiveName;
    ship.shipTraitUsed = Boolean(source?.shipTraitUsed ?? (source?.roleTraitUsed || Object.keys(ship.shipPassiveUses).length > 0));
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
    ship.arcanaDamageShield = source?.arcanaDamageShield ? { ...asObject(source.arcanaDamageShield) } : null;
    ship.arcanaNextCannonBonus = Math.max(0, Number(source?.arcanaNextCannonBonus || 0) || 0);
    ship.arcanaIgnoreNextDefense = Boolean(source?.arcanaIgnoreNextDefense);
    ship.arcanaCommandLocks = { ...asObject(source?.arcanaCommandLocks) };
    ship.morale = clampNumber(source?.morale, -2, 2, 0);
    ship.crewHpPercent = clampPercent(source?.crewHpPercent, 100);
    ship.crewMpPercent = clampPercent(source?.crewMpPercent, 100);
    ship.statuses = normalizeDurationMap(source?.statuses);
    ship.equipmentDamage = normalizeDurationMap(source?.equipmentDamage);
    ship.lockOn = source?.lockOn ? { ...asObject(source.lockOn) } : null;
    ship.illusion = source?.illusion ? { ...asObject(source.illusion) } : null;
    ship.pendingShotEffects = { ...asObject(source?.pendingShotEffects) };
    ship.delayedEffects = Array.isArray(source?.delayedEffects) ? source.delayedEffects.map((entry) => ({ ...asObject(entry) })) : [];
    ship.battleFlags = { ...asObject(source?.battleFlags) };
    ship.facing = normalizeFacing(source?.facing);
    ship.reload = Math.max(0, Number(source?.reload || 0) || 0);
    ship.rudderCooldown = Math.max(0, Number(source?.rudderCooldown || 0) || 0);
    ship.pendingCommandId = source?.pendingCommandId || null;
    ship.pendingArcanaKey = source?.pendingArcanaKey || null;
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
        shipDomain: ship.shipDomain || 'surface',
        shipDomainLabel: ship.shipDomainLabel || SHIP_DOMAIN_LABEL[ship.shipDomain] || SHIP_DOMAIN_LABEL.surface,
        lowFirepower: Boolean(ship.lowFirepower),
        shipPassiveKey: ship.shipPassiveKey || '',
        shipPassiveName: ship.shipPassiveName || '',
        shipPassiveMode: ship.shipPassiveMode || '',
        shipPassiveUses: { ...asObject(ship.shipPassiveUses) },
        shipPassivePending: { ...asObject(ship.shipPassivePending) },
        shipTraitKey: ship.shipTraitKey || '',
        shipTraitName: ship.shipTraitName || ship.shipPassiveName || NAVAL_SHIP_TRAITS[ship.shipTraitKey]?.passiveName || '',
        shipTraitUsed: Boolean(ship.shipTraitUsed || Object.keys(asObject(ship.shipPassiveUses)).length > 0),
        roleTraitUsed: Boolean(ship.roleTraitUsed || ship.shipTraitUsed || Object.keys(asObject(ship.shipPassiveUses)).length > 0),
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
            replacementCommand: gear.replacementCommand || '',
            priority: gear.priority ?? gear.arcanaNumber,
            navalEffect: gear.navalEffect,
            spritePath: gear.spritePath || NAVAL_TAROT_SPRITE.path,
            spriteIndex: normalizeArcanaSpriteIndex(gear.spriteIndex, gear.arcanaNumber),
            spriteWidth: Math.max(1, Math.floor(Number(gear.spriteWidth || NAVAL_TAROT_SPRITE.width) || NAVAL_TAROT_SPRITE.width)),
            spriteHeight: Math.max(1, Math.floor(Number(gear.spriteHeight || NAVAL_TAROT_SPRITE.height) || NAVAL_TAROT_SPRITE.height)),
            spriteCols: Math.max(1, Math.floor(Number(gear.spriteCols || NAVAL_TAROT_SPRITE.cols) || NAVAL_TAROT_SPRITE.cols)),
            used: Boolean(gear.used),
            arcanaElementUsed: Boolean(gear.arcanaElementUsed)
        })),
        arcanaShield: Math.max(0, Number(ship.arcanaShield || 0) || 0),
        arcanaDamageShield: ship.arcanaDamageShield ? { ...asObject(ship.arcanaDamageShield) } : null,
        arcanaNextCannonBonus: Math.max(0, Number(ship.arcanaNextCannonBonus || 0) || 0),
        arcanaIgnoreNextDefense: Boolean(ship.arcanaIgnoreNextDefense),
        arcanaCommandLocks: { ...asObject(ship.arcanaCommandLocks) },
        morale: clampNumber(ship.morale, -2, 2, 0),
        crewHpPercent: clampPercent(ship.crewHpPercent, 100),
        crewMpPercent: clampPercent(ship.crewMpPercent, 100),
        statuses: durationMapForSnapshot(ship.statuses),
        equipmentDamage: durationMapForSnapshot(ship.equipmentDamage),
        lockOn: ship.lockOn ? { ...asObject(ship.lockOn) } : null,
        illusion: ship.illusion ? { ...asObject(ship.illusion) } : null,
        pendingShotEffects: { ...asObject(ship.pendingShotEffects) },
        delayedEffects: Array.isArray(ship.delayedEffects) ? ship.delayedEffects.map((entry) => ({ ...asObject(entry) })) : [],
        battleFlags: { ...asObject(ship.battleFlags) },
        facing: ship.facing,
        reload: ship.reload,
        rudderCooldown: Math.max(0, Number(ship.rudderCooldown || 0) || 0),
        pendingCommandId: ship.pendingCommandId || null,
        pendingArcanaKey: ship.pendingArcanaKey || null,
        lastCommandId: ship.lastCommandId || null,
        stun: ship.hp <= 0 ? 1 : 0,
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
        lastTurnSummary: b.lastTurnSummary || '',
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
    const sprite = arcanaSpriteInfo(gear);
    b.lastArcanaActivation = {
        id: `${b.count || 0}:${side}:${gear.key}:${Date.now()}`,
        side,
        title,
        body,
        ...sprite
    };
    if (Array.isArray(b.turnArcanaVisuals)) {
        b.turnArcanaVisuals.push({
            type: 'arcanaCard',
            source: side,
            title,
            body,
            key: gear.key,
            ...sprite
        });
    }
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
    const arcana = pendingArcanaForCommand(ship, commandId) || activeArcanaForCommand(ship, commandId);
    if (arcana) return arcana.ultimateName || arcanaDisplayName(arcana);
    if (isCannonCommand(commandId)) return cannonCommandLabel(ship, commandId);
    return COMMANDS[commandId]?.label || commandId || '行動';
}

function commandDescription(def, ship = null) {
    if (!def) return '';
    const arcana = activeArcanaForCommand(ship, def.id);
    if (arcana) return arcana.shortDescription || arcana.activationLog || '';
    if (def.id === 'bowCannon' && ship?.weaponClass === 'small') {
        return '正面の基本銃撃。威力は低いが突撃を止めやすい';
    }
    if (def.id === 'broadside' && ship?.weaponClass === 'small') {
        return '横向き専用の側面銃撃。砲撃船の半分の負荷を与える';
    }
    return def.desc || '';
}

function firstEffectSentence(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const sentence = text.match(/^(.+?[。.!?])/);
    return sentence ? sentence[1] : text;
}

function commandPreviewText(def, ship = null) {
    const id = normalizeCommandId(def?.id);
    const arcana = activeArcanaForCommand(ship, id);
    if (arcana) return firstEffectSentence(arcana.shortDescription || arcana.activationLog) || arcana.ultimateName || arcanaDisplayName(arcana);
    if (id === 'assault') return '回頭を止める / 砲撃に弱い';
    if (id === 'bowCannon') return '突撃を止める';
    if (id === 'broadside') return '横から大ダメージ';
    if (id === 'starboardRudder') return '砲撃を避ける';
    if (id === 'portRudder') return '正面へ戻る';
    if (id === 'blankShot') return '空撃ち / 読み外し狙い';
    if (id === 'repair') return '設備損傷を直す';
    if (id === 'boarding') return '白兵戦へ移る';
    return '';
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
    if (id === 'repair') return '応急修理、急げえ！！';
    if (id === 'boarding') return '乗り込めええ！！';
    return '';
}

function commandTypeLabel(def, ship = null) {
    if (activeArcanaForCommand(ship, def?.id)) return '大アルカナ';
    if (isCannonCommand(def?.id)) return ship?.weaponLabel || '砲撃';
    return COMMAND_TYPE_LABEL[def?.type] || '行動';
}

function commandAvailabilityLabel(def, ship = null) {
    if (activeArcanaForCommand(ship, def?.id)) return '置換';
    if (isCannonCommand(def?.id)) return Number(ship?.reload || 0) > 0 ? '再装填中' : `${ship?.weaponLabel || '砲撃'}可`;
    if (isRudderCommand(def?.id)) {
        if (Number(ship?.rudderCooldown || 0) > 0) return '回頭直後';
        if (Number(ship?.arcanaCommandLocks?.rudder || 0) > 0) return '操舵封じ';
        if (hasDuration(ship?.equipmentDamage, 'rudder')) return '舵輪損傷';
    }
    if (def?.id === 'repair') return hasEquipmentDamage(ship) ? '損傷あり' : '損傷なし';
    return '制限なし';
}

function canSelect(b, self, foe, def) {
    if (!b || b.finished || !self || !def) return false;
    if (self.pendingCommandId) return false;
    if (self.hp <= 0) return false;
    if (def.id === 'repair') return hasEquipmentDamage(self);
    if (isRudderCommand(def.id) && Number(self.rudderCooldown || 0) > 0) return false;
    if ((def.id === 'starboardRudder' || def.id === 'portRudder') && Number(self.arcanaCommandLocks?.rudder || 0) > 0) return false;
    if ((def.id === 'starboardRudder' || def.id === 'portRudder') && hasDuration(self.equipmentDamage, 'rudder')) return false;
    if (def.id === 'boarding') return foe?.hp <= 0;
    if (def.id === 'assault' && isSideFacing(self.facing)) return false;
    if (isCannonCommand(def.id) && self.reload > 0) return false;
    if (def.id === 'bowCannon' && isSideFacing(self.facing)) return false;
    if (def.id === 'broadside' && !isSideFacing(self.facing)) return false;
    if (def.id === 'blankShot' && !isSideFacing(self.facing)) return false;
    return true;
}

function commandOptionsForState(b, self, foe) {
    if (!b || b.finished) return [];
    if (foe?.hp <= 0 && self?.hp > 0) return [COMMANDS.boarding];
    if (self?.hp <= 0) return [];
    const ids = isSideFacing(self.facing)
        ? ['broadside', 'blankShot', 'portRudder']
        : ['assault', 'bowCannon', 'starboardRudder'];
    if (hasEquipmentDamage(self)) ids.push('repair');
    return ids.map((id) => COMMANDS[id]).filter(Boolean);
}

function availableCommands(b, self, foe) {
    return commandOptionsForState(b, self, foe).filter((def) => canSelect(b, self, foe, def));
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

function markArcanaSuccess(b, owner, gear, target = null) {
    if (!owner || !gear || gear.successMarked) return;
    gear.successMarked = true;
    adjustMorale(owner, 1);
    if (target) adjustMorale(target, -1);
    if (b) log(b, `${owner.label}の${arcanaDisplayName(gear)}が成功した。士気 ${owner.morale}`);
}

function applyRoundStartStatusEffects(b, ship) {
    if (!ship) return;
    if (hasDuration(ship.statuses, 'fire')) {
        const drained = damageCrew(ship, 10);
        if (drained > 0) log(b, `${ship.label}は炎上で船員HP -${drained}%`);
    }
    if (hasDuration(ship.statuses, 'flood')) {
        const drained = drainCrewMp(ship, 10);
        if (drained > 0) log(b, `${ship.label}は浸水で船員MP -${drained}%`);
    }
}

function resetTurnBattleFlags(ship) {
    if (!ship) return;
    ship.battleFlags = {};
}

function maybeApplyConfusionSelfDamage(b, ship, commandId) {
    if (!ship || !isAttackCommand(commandId) || !hasDuration(ship.statuses, 'confusion')) return 0;
    const roll = nextEvasionRoll(b);
    if (roll >= 0.5) return 0;
    const damage = 0.5;
    ship.hp = clampSteeringValue(ship.hp - damage, 0, ship.maxHp, 0);
    log(b, `${ship.label}は混乱して自船に${formatSteeringValue(damage)}ダメージ`);
    return damage;
}

function applySelectedArcanaStart(b, owner, target, commandId, gear) {
    if (!gear) return;
    activateArcanaGear(b, owner, gear);
    owner.activeArcanaThisTurn = gear;
    const effect = asObject(gear.navalEffect);
    const type = effect.type;
    if (effect.clearLockOn) owner.lockOn = null;
    if (Array.isArray(effect.cleanse)) cleanseStatuses(owner, effect.cleanse);
    if (type === 'fool-port-evade') {
        owner.battleFlags.directEvadeThisTurn = true;
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'strength-assault') {
        adjustMorale(owner, Number(effect.morale || 0));
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'hermit-blank') {
        setPendingEffect(owner, 'incomingCannonHitDown', Number(effect.nextCannonHitDown || 0.2), effect.turns || 1);
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'lovers-bind-assault') {
        setArcanaCommandLock(owner, 'rudder', effect.bothRudderLock || 1);
        setArcanaCommandLock(target, 'rudder', effect.bothRudderLock || 1);
        markArcanaSuccess(b, owner, gear, target);
    } else if (type === 'hanged-blank') {
        addStatuses(b, target, effect.targetStatus, owner);
        owner.battleFlags.halveDirectThisTurn = true;
        owner.battleFlags.statusImmuneThisTurn = true;
        markArcanaSuccess(b, owner, gear, target);
    } else if (type === 'temperance-blank') {
        cleanseStatuses(owner);
        if (effect.moraleToNeutral) owner.morale = 0;
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'star-blank') {
        consumePendingEffect(owner, 'incomingCannonHitDown');
        setPendingEffect(owner, 'nextCannonHitUp', Number(effect.nextCannonHitUp || 0.2), effect.turns || 2, { healOnCannonHit: effect.healOnCannonHit || 1 });
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'moon-blank') {
        owner.illusion = { chance: clampNumber(effect.illusionChance, 0, 1, 0.5), hideHp: Boolean(effect.hideHp) };
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'sun-blank') {
        if (target) {
            target.illusion = null;
            target.lockOn = null;
        }
        b.battleFog = null;
        setPendingEffect(owner, 'nextCannonStatus', effect.nextCannonStatus || { fire: 2 }, effect.turns || 2);
        markArcanaSuccess(b, owner, gear, target);
    } else if (type === 'judgement-blank') {
        cleanseStatuses(owner, effect.cleanse || ['fear', 'confusion']);
        healCrew(owner, Number(effect.crewHealPercent || 20));
        if (effect.repairEquipment) repairEquipment(owner);
        markArcanaSuccess(b, owner, gear);
    } else if (type === 'world-broadside') {
        setPendingEffect(owner, 'worldLock', 1, effect.completeLockOnTurns || 3, {
            minFinalHitRate: effect.minFinalHitRate || 0.9,
            ignoreConcealment: Boolean(effect.ignoreConcealment)
        });
        if (target) target.lockOn = { by: owner.label, turns: effect.completeLockOnTurns || 3 };
        markArcanaSuccess(b, owner, gear, target);
    }
}

function forceArcanaRudderSuccess(ship, commandId, previousFacing, currentFacing, gear) {
    if (!gear?.navalEffect?.forceRudderSuccess || !isRudderCommand(commandId)) return currentFacing;
    return sideAfterRudder(commandId, previousFacing);
}

function applyArcanaRudderSuccessEffects(b, owner, target, commandId, previousFacing, gear) {
    if (!gear || !isRudderCommand(commandId)) return;
    if (normalizeFacing(owner.facing) === normalizeFacing(previousFacing)) return;
    const effect = asObject(gear.navalEffect);
    const payload = asObject(effect.onRudderSuccess);
    if (!Object.keys(payload).length) {
        markArcanaSuccess(b, owner, gear, target);
        return;
    }
    const removed = Array.isArray(payload.cleanse) ? cleanseStatuses(owner, payload.cleanse) : 0;
    let healed = 0;
    if (payload.heal) healed = healShip(owner, payload.heal);
    if (payload.crewFullHeal) {
        owner.crewHpPercent = 100;
        owner.crewMpPercent = 100;
    }
    if (!removed && !healed && payload.fallbackHeal) healed = healShip(owner, payload.fallbackHeal);
    if (removed || healed || payload.crewFullHeal) markArcanaSuccess(b, owner, gear);
}

function applyArcanaAfterDamage(b, attacker, defender, commandId, defenderCommandId, gear, dealtDamage) {
    if (!gear || dealtDamage <= 0) return;
    const effect = asObject(gear.navalEffect);
    const type = effect.type;
    if (type === 'emperor-shield-bow') {
        attacker.arcanaDamageShield = { turns: effect.onHitShield?.turns || 2, fresh: true };
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'hierophant-seal-bow') {
        setArcanaCommandLock(defender, 'replacement', effect.onHitLockReplacement || 1);
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'chariot-assault') {
        addStatuses(b, defender, effect.onHitStatus, attacker);
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'strength-assault') {
        if (isRudderCommand(defenderCommandId)) addEquipmentDamage(b, defender, 'rudder', effect.rudderDamageOnStop || 1);
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'justice-assault') {
        const reflected = {};
        Object.entries(normalizeDurationMap(attacker.statuses)).forEach(([name, value]) => { reflected[name] = durationValue(value); });
        if (Object.keys(reflected).length) addStatuses(b, defender, reflected, attacker);
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'death-broadside') {
        defender.delayedEffects = Array.isArray(defender.delayedEffects) ? defender.delayedEffects : [];
        defender.delayedEffects.push({ type: 'damage', turns: effect.delayedDamage?.turns || 3, damage: effect.delayedDamage?.damage || 1, source: attacker.label, fresh: true });
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'devil-broadside') {
        addStatuses(b, defender, effect.onHitStatus, attacker);
        markArcanaSuccess(b, attacker, gear, defender);
    } else if (type === 'tower-broadside') {
        damageCrew(defender, effect.crewDamagePercent || 10);
        addEquipmentDamage(b, defender, 'mast', effect.mastDamage || 2);
        markArcanaSuccess(b, attacker, gear, defender);
    }
    const shotStatus = pendingEffectPayload(attacker, 'nextCannonStatus');
    if (isCannonCommand(commandId) && shotStatus && typeof shotStatus === 'object') {
        addStatuses(b, defender, shotStatus, attacker);
        consumePendingEffect(attacker, 'nextCannonStatus');
    }
    const hitUp = asObject(attacker.pendingShotEffects?.nextCannonHitUp);
    if (isCannonCommand(commandId) && Object.keys(hitUp).length) {
        const heal = Number(hitUp.healOnCannonHit || 0);
        if (heal > 0) {
            const healed = healShip(attacker, heal);
            if (!healed) healCrew(attacker, 1);
        }
        consumePendingEffect(attacker, 'nextCannonHitUp');
    }
}

function applyWheelRecoilIfNeeded(b, owner, attacker, ownerCommandId, attackerCommandId, ownerArcana, pendingDamageToOwner, dealtByAttacker) {
    if (ownerArcana?.navalEffect?.type !== 'wheel-starboard') return 0;
    if (!isCannonCommand(attackerCommandId) || pendingDamageToOwner <= 0 || dealtByAttacker > 0) return 0;
    const damage = Math.max(0, roundSteeringValue(ownerArcana.navalEffect.cannonMissRecoil || 0.5));
    if (damage <= 0) return 0;
    attacker.hp = clampSteeringValue(attacker.hp - damage, 0, attacker.maxHp, 0);
    log(b, `${owner.label}の${arcanaDisplayName(ownerArcana)}が砲撃反動を返した: ${attacker.label} -${formatSteeringValue(damage)}`);
    markArcanaSuccess(b, owner, ownerArcana, attacker);
    checkLowSteeringArcana(b, attacker, owner);
    return damage;
}

function applyEndOfRoundEffects(b, ship, foe) {
    if (!ship) return;
    ship.statuses = tickDurationMap(ship.statuses);
    ship.equipmentDamage = tickDurationMap(ship.equipmentDamage);
    ship.pendingShotEffects = tickPendingEffects(ship.pendingShotEffects);
    ship.shipPassivePending = tickShipPassivePending(ship.shipPassivePending);
    if (ship.arcanaDamageShield) {
        const next = tickDurationMap({ shield: ship.arcanaDamageShield }).shield;
        ship.arcanaDamageShield = next || null;
    }
    const delayed = [];
    (Array.isArray(ship.delayedEffects) ? ship.delayedEffects : []).forEach((entry) => {
        const current = { ...asObject(entry) };
        if (current.fresh) {
            delayed.push({ ...current, fresh: false });
            return;
        }
        const turns = Math.max(0, Math.floor(Number(current.turns || 0) || 0) - 1);
        if (turns > 0) delayed.push({ ...current, turns, fresh: false });
        else if (current.type === 'damage') {
            const damage = Math.max(0, roundSteeringValue(Number(current.damage || 0)));
            if (damage > 0) {
                ship.hp = clampSteeringValue(ship.hp - damage, 0, ship.maxHp, 0);
                log(b, `${ship.label}の死の刻印が発動: 操舵ゲージ -${formatSteeringValue(damage)}`);
                checkLowSteeringArcana(b, ship, foe);
            }
        }
    });
    ship.delayedEffects = delayed;
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

function shipPassiveKey(ship) {
    return String(ship?.shipPassiveKey || shipMetaForKey(ship?.shipTraitKey, ship?.shipForm)?.passiveKey || '');
}

function shipPassiveName(ship) {
    return String(ship?.shipPassiveName || ship?.shipTraitName || shipMetaForKey(ship?.shipTraitKey, ship?.shipForm)?.passiveName || '');
}

function shipHasPassive(ship, key) {
    return shipPassiveKey(ship) === key;
}

function shipPassiveUseCount(ship, key = shipPassiveKey(ship)) {
    return Math.max(0, Number(asObject(ship?.shipPassiveUses)[key] || 0) || 0);
}

function shipPassiveWasUsed(ship, key = shipPassiveKey(ship)) {
    return shipPassiveUseCount(ship, key) > 0;
}

function markShipPassiveUsed(b, ship, key = shipPassiveKey(ship), message = '') {
    if (!ship || !key) return false;
    ship.shipPassiveUses = { ...asObject(ship.shipPassiveUses) };
    ship.shipPassiveUses[key] = shipPassiveUseCount(ship, key) + 1;
    ship.shipTraitUsed = true;
    ship.roleTraitUsed = true;
    if (b) log(b, `${ship.label}の${shipPassiveName(ship) || '固有パッシブ'}: ${message || '発動'}`);
    return true;
}

function logShipPassive(b, ship, message = '') {
    if (b && ship && message) log(b, `${ship.label}の${shipPassiveName(ship) || '固有パッシブ'}: ${message}`);
}

function setShipPassivePending(ship, key, value = true, turns = 1, extra = {}) {
    if (!ship || !key) return;
    ship.shipPassivePending = { ...asObject(ship.shipPassivePending) };
    ship.shipPassivePending[key] = { ...extra, value, turns: Math.max(1, Math.floor(Number(turns) || 1)), fresh: true };
}

function consumeShipPassivePending(ship, key) {
    if (ship?.shipPassivePending) delete ship.shipPassivePending[key];
}

function pendingShipPassiveValue(ship, key, fallback = 0) {
    const entry = asObject(ship?.shipPassivePending)[key];
    if (entry && typeof entry === 'object') return Number(entry.value ?? fallback) || fallback;
    return Number(entry ?? fallback) || fallback;
}

function tickShipPassivePending(pending = {}) {
    return tickPendingEffects(pending);
}

function rollShipPassiveChance(b, chance) {
    return nextEvasionRoll(b) < clampNumber(chance, 0, 1, 0);
}

function maybeUseShipPassiveAttackBoost(b, attacker, commandId, amount, entry) {
    if (entry?.kind !== 'attack' || !attacker || amount <= 0) return amount;
    if (commandId === 'assault' && shipHasPassive(attacker, 'human-assault-ram')) {
        const turnStartHp = Number(attacker.turnStartHp ?? attacker.hp ?? 0) || 0;
        const maxHp = Math.max(0.5, Number(attacker.maxHp || 0) || 0.5);
        if (turnStartHp >= maxHp / 2) {
            logShipPassive(b, attacker, `耐久50%以上の馬衝角で負荷 +${formatSteeringValue(0.5)}`);
            return amount + 0.5;
        }
    }
    return amount;
}

function applyLowFirepowerDamage(b, attacker, commandId, amount, entry) {
    if (!attacker?.lowFirepower || entry?.kind !== 'attack' || !isDirectAttackCommand(commandId) || amount <= 0) return amount;
    const next = Math.max(STEERING_STEP, roundSteeringValue(amount / 2));
    if (next < amount) logShipPassive(b, attacker, `低火力により直接負荷 ${formatSteeringValue(amount)} -> ${formatSteeringValue(next)}`);
    return next;
}

function maybeReduceDamageByShipPassive(b, attacker, defender, value) {
    if (!attacker || !defender || value <= 0) return value;
    const attackerCommandId = normalizeCommandId(attacker.lastResolvingCommandId);
    const defenderCommandId = normalizeCommandId(defender.lastResolvingCommandId);
    if (!isDirectAttackCommand(attackerCommandId)) return value;
    let next = value;
    if (shipHasPassive(defender, 'stone-hull') && !shipPassiveWasUsed(defender, 'stone-hull')) {
        markShipPassiveUsed(b, defender, 'stone-hull', `初回直接被弾を${formatSteeringValue(0.5)}軽減`);
        next = Math.max(STEERING_STEP, roundSteeringValue(next - 0.5));
    }
    const diveGuard = pendingShipPassiveValue(defender, 'diveGuard');
    if (diveGuard > 0) {
        consumeShipPassivePending(defender, 'diveGuard');
        logShipPassive(b, defender, `急降下後の姿勢で直接被弾を${formatSteeringValue(diveGuard)}軽減`);
        next = Math.max(STEERING_STEP, roundSteeringValue(next - diveGuard));
    }
    if (shipHasPassive(defender, 'bow-mirror-null')
        && attackerCommandId === 'bowCannon'
        && defenderCommandId === 'bowCannon'
        && !shipPassiveWasUsed(defender, 'bow-mirror-null')) {
        markShipPassiveUsed(b, defender, 'bow-mirror-null', '船首砲同士の初回被弾を無効化');
        return 0;
    }
    if (shipHasPassive(defender, 'assault-mirror-null')
        && attackerCommandId === 'assault'
        && defenderCommandId === 'assault'
        && !shipPassiveWasUsed(defender, 'assault-mirror-null')) {
        markShipPassiveUsed(b, defender, 'assault-mirror-null', '突撃同士の初回被弾を無効化');
        return 0;
    }
    return next;
}

function maybeCounterAssaultByShipTrait() {}

function maybeApplyShipPassiveAfterDamage(b, attacker, defender, commandId, dealtDamage) {
    if (!attacker || !defender || dealtDamage <= 0) return;
    const addProcStatus = (key, chance, status, turns) => {
        if (!shipHasPassive(attacker, key)) return;
        if (!rollShipPassiveChance(b, chance)) return;
        logShipPassive(b, attacker, `${statusLabel(status)}を付与`);
        addStatus(b, defender, status, turns, attacker);
    };
    if (commandId === 'broadside') {
        addProcStatus('human-broadside-fire', 0.2, 'fire', 2);
        addProcStatus('elf-broadside-fear', 0.2, 'fear', 2);
    }
    if (commandId === 'bowCannon') {
        addProcStatus('human-bow-fire', 0.15, 'fire', 2);
        addProcStatus('goblin-bow-flood', 0.15, 'flood', 2);
        if (shipHasPassive(attacker, 'elf-bow-bomb') && rollShipPassiveChance(b, 0.15)) {
            const extra = 0.5;
            defender.hp = clampSteeringValue(defender.hp - extra, 0, defender.maxHp, 0);
            logShipPassive(b, attacker, `爆弾投下が追加負荷 ${formatSteeringValue(extra)}`);
            checkLowSteeringArcana(b, defender, attacker);
        }
    }
    if (commandId === 'assault') {
        addProcStatus('goblin-assault-flood', 0.15, 'flood', 2);
        if (shipHasPassive(attacker, 'elf-assault-dive')) {
            setShipPassivePending(attacker, 'diveGuard', 0.5, 1);
            logShipPassive(b, attacker, '次の直接被弾を0.5軽減する姿勢に入った');
        }
    }
}

function maybeApplyShipTraitAfterDamage(b, attacker, defender, commandId, dealtDamage) {
    maybeApplyShipPassiveAfterDamage(b, attacker, defender, commandId, dealtDamage);
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
    next = maybeUseShipPassiveAttackBoost(b, attacker, commandId, next, entry);
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
    if (hasDuration(attacker?.statuses, 'fear')) {
        next = Math.max(0.5, roundSteeringValue(next / 2));
    }
    next = applyLowFirepowerDamage(b, attacker, commandId, next, entry);
    return next;
}

function applyDamageToShip(b, attacker, defender, amount, label, { allowEvade = true, allowRandomEvasion = true } = {}) {
    let value = Math.max(0, roundSteeringValue(Number(amount) || 0));
    if (!defender || value <= 0) return 0;
    const attackerCommandId = attacker?.lastResolvingCommandId;
    if (defender.battleFlags?.directEvadeThisTurn && isDirectAttackCommand(attackerCommandId)) {
        log(b, `${defender.label}は大アルカナで直接攻撃を回避した`);
        return 0;
    }
    if (maybeEvadeDamageByPosture(b, attacker, defender, allowRandomEvasion)) return 0;
    if (defender.battleFlags?.halveDirectThisTurn && isDirectAttackCommand(attackerCommandId)) {
        value = Math.max(0.5, roundSteeringValue(value / 2));
    }
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
    value = maybeReduceDamageByShipPassive(b, attacker, defender, value);
    if (defender.arcanaDamageShield && isDirectAttackCommand(attackerCommandId)) {
        const before = value;
        value = Math.max(0.5, roundSteeringValue(value / 2));
        defender.arcanaDamageShield = null;
        log(b, `${defender.label}の大アルカナシールドが${formatSteeringValue(before - value)}負荷を軽減した`);
    }
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
    if (commandId === 'repair') return 'repair';
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
            addDamage(result, 'enemy', cannonDamage('player', 'bowCannon'), cannonLabel('player', 'bowCannon', 'turning'), 'player');
            setTurnFacing('enemy', enemyCommandId, b.enemy.facing);
        } else if (p === 'turn' && e === 'bow') {
            addDamage(result, 'player', cannonDamage('enemy', 'bowCannon'), cannonLabel('enemy', 'bowCannon', 'turning'), 'enemy');
            setTurnFacing('player', playerCommandId, b.player.facing);
        } else if ((p === 'assault' || p === 'bow') && e === 'repair') {
            addDamage(result, 'enemy', p === 'assault' ? ASSAULT_DAMAGE : cannonDamage('player', 'bowCannon'), p === 'assault' ? '修理中への突撃' : cannonLabel('player', 'bowCannon'), 'player');
        } else if (p === 'repair' && (e === 'assault' || e === 'bow')) {
            addDamage(result, 'player', e === 'assault' ? ASSAULT_DAMAGE : cannonDamage('enemy', 'bowCannon'), e === 'assault' ? '修理中への突撃' : cannonLabel('enemy', 'bowCannon'), 'enemy');
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
            addDamage(result, sideTarget, cannonDamage(frontTarget, 'bowCannon'), cannonLabel(frontTarget, 'bowCannon', 'turning'), frontTarget);
            setSideFacing('front');
        } else if (frontAction === 'bow' && sideAction === 'repair') {
            addDamage(result, sideTarget, cannonDamage(frontTarget, 'bowCannon'), cannonLabel(frontTarget, 'bowCannon'), frontTarget);
        } else if (frontAction === 'assault' && sideAction === 'repair') {
            addDamage(result, sideTarget, ASSAULT_DAMAGE, '修理中への突撃', frontTarget);
            setFrontFacing('front');
            setSideFacing('front');
        } else if (frontAction === 'repair' && sideAction === 'broadside') {
            addDamage(result, frontTarget, cannonDamage(sideTarget, 'broadside'), cannonLabel(sideTarget, 'broadside'), sideTarget);
        } else if (frontAction === 'repair' && sideAction === 'return') {
            setSideFacing('front');
        } else if (frontAction === 'turn' && sideAction === 'broadside') {
            addDamage(result, frontTarget, cannonDamage(sideTarget, 'broadside'), cannonLabel(sideTarget, 'broadside', 'turning'), sideTarget);
            setFrontFacing(sideAfterRudder(frontCommandId, frontFacing));
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
        addDamage(result, 'enemy', cannonDamage('player', 'broadside'), cannonLabel('player', 'broadside', 'turning'), 'player');
        setFront('enemy');
    } else if (p === 'return' && e === 'broadside') {
        addDamage(result, 'player', cannonDamage('enemy', 'broadside'), cannonLabel('enemy', 'broadside', 'turning'), 'enemy');
        setFront('player');
    } else if (p === 'broadside' && e === 'repair') {
        addDamage(result, 'enemy', cannonDamage('player', 'broadside'), cannonLabel('player', 'broadside'), 'player');
    } else if (p === 'repair' && e === 'broadside') {
        addDamage(result, 'player', cannonDamage('enemy', 'broadside'), cannonLabel('enemy', 'broadside'), 'enemy');
    } else if (p === 'repair' && e === 'return') {
        setFront('enemy');
    } else if (p === 'return' && e === 'repair') {
        setFront('player');
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

function applyChariotAssaultMirror(result, playerCommandId, enemyCommandId, playerArcana, enemyArcana) {
    if (!result || playerCommandId !== 'assault' || enemyCommandId !== 'assault') return;
    const playerChariot = playerArcana?.navalEffect?.type === 'chariot-assault';
    const enemyChariot = enemyArcana?.navalEffect?.type === 'chariot-assault';
    if (playerChariot && !enemyChariot) {
        result.damages = result.damages.filter((entry) => !(entry.target === 'player' && entry.source === 'enemy'));
    } else if (enemyChariot && !playerChariot) {
        result.damages = result.damages.filter((entry) => !(entry.target === 'enemy' && entry.source === 'player'));
    }
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

function expectedCommandMatrixDamage(base, entry, playerCommandId, enemyCommandId) {
    const targetSide = entry?.target === 'enemy' ? 'enemy' : 'player';
    const sourceSide = entry?.source === 'enemy' ? 'enemy' : 'player';
    const defender = targetSide === 'player' ? base.player : base.enemy;
    const attackerCommandId = sourceSide === 'player' ? playerCommandId : enemyCommandId;
    const defenderCommandId = targetSide === 'player' ? playerCommandId : enemyCommandId;
    const rate = evasionRateForShip(
        { ...defender, lastResolvingCommandId: defenderCommandId },
        attackerCommandId,
        defenderCommandId
    );
    return roundSteeringValue(Number(entry?.amount || 0) * Math.max(0, 1 - rate));
}

function analyzeCommandMatrixPair(playerFacing, enemyFacing, playerCommandId, enemyCommandId) {
    const base = {
        player: createCommandMatrixShip('自船', playerFacing),
        enemy: createCommandMatrixShip('敵船', enemyFacing)
    };
    const result = resolveActionMatrix(base, playerCommandId, enemyCommandId);
    const playerDamage = result.damages
        .filter((entry) => entry.target === 'player')
        .reduce((sum, entry) => sum + expectedCommandMatrixDamage(base, entry, playerCommandId, enemyCommandId), 0);
    const enemyDamage = result.damages
        .filter((entry) => entry.target === 'enemy')
        .reduce((sum, entry) => sum + expectedCommandMatrixDamage(base, entry, playerCommandId, enemyCommandId), 0);
    const score = roundSteeringValue(enemyDamage - playerDamage);
    const playerDodgedShot = result.firedEnemy && playerDamage <= 0 && commandIntent(playerCommandId) === 'rudder';
    const enemyDodgedShot = result.firedPlayer && enemyDamage <= 0 && commandIntent(enemyCommandId) === 'rudder';
    const tacticalScore = roundSteeringValue(score + (playerDodgedShot ? 0.5 : 0) - (enemyDodgedShot ? 0.5 : 0));
    const nextPlayerFacing = normalizeFacing(result.playerFacing);
    const nextEnemyFacing = normalizeFacing(result.enemyFacing);
    const playerRudderCooldown = isRudderCommand(playerCommandId)
        && normalizeFacing(playerFacing) !== nextPlayerFacing;
    const enemyRudderCooldown = isRudderCommand(enemyCommandId)
        && normalizeFacing(enemyFacing) !== nextEnemyFacing;
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
        nextPlayerFacing,
        nextPlayerFacingLabel: FACING_LABEL[nextPlayerFacing] || '正面',
        nextEnemyFacing,
        nextEnemyFacingLabel: FACING_LABEL[nextEnemyFacing] || '正面',
        playerReload: result.firedPlayer ? RELOAD_TURNS : 0,
        enemyReload: result.firedEnemy ? RELOAD_TURNS : 0,
        playerRudderCooldown,
        enemyRudderCooldown
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
        note: '基本ルールのみ。砲撃は回避率込みの期待負荷。大砲は再装填が必要。面舵/取舵で姿勢が変わった次の1手は連続操舵不可。実戦では艤装・船能力で変化します。',
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
        finishBattle(b, 'boarding', { deferBoarding: true });
        return true;
    }
    if (b.enemy.hp <= 0) {
        log(b, `${b.enemy.label}が操舵不能。接舷できる！`);
        return false;
    }
    if (b.player.hp <= 0) {
        log(b, `${b.player.label}が操舵不能。敵船が接舷してくる！`);
        finishBattle(b, 'boarded', { deferBoarding: true });
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

function completeRudderCooldown(b, ship, commandId, previousFacing) {
    if (!ship) return;
    const changedByRudder = isRudderCommand(commandId)
        && normalizeFacing(previousFacing) !== normalizeFacing(ship.facing);
    ship.rudderCooldown = changedByRudder ? 1 : 0;
    if (changedByRudder && shipHasPassive(ship, 'wave-turn') && rollShipPassiveChance(b, 0.3)) {
        setShipPassivePending(ship, 'waveTurn', 0.3, 1);
        logShipPassive(b, ship, `次ターン最初の被砲撃命中率 -${formatRatePercent(0.3)}`);
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

function commandSummaryLabel(commandId, ship = null) {
    if (isCannonCommand(commandId)) return cannonCommandLabel(ship, commandId);
    return COMMANDS[commandId]?.label || commandId || '';
}

function statusAdditionsSince(ship, previousStatuses = {}) {
    const before = normalizeDurationMap(previousStatuses);
    return Object.entries(normalizeDurationMap(ship?.statuses)).filter(([name, value]) => {
        const previousTurns = durationValue(before[name]);
        return durationValue(value) > previousTurns;
    }).map(([name]) => statusLabel(name));
}

function buildResultChipEffects(b, damageByTarget = {}, dealtBySource = {}, evadedByTarget = {}, assaultFailed = {}, previousStatuses = {}) {
    const chips = [];
    const add = (target, text, tone = '') => {
        if (!text || chips.length >= 2) return;
        chips.push({ type: 'resultChip', target, text, tone });
    };
    if (Number(dealtBySource.player || 0) > 0) add('enemy', `命中 -${formatSteeringValue(dealtBySource.player)}`, 'hit');
    if (Number(dealtBySource.enemy || 0) > 0) add('player', `命中 -${formatSteeringValue(dealtBySource.enemy)}`, 'hit');
    if ((evadedByTarget.player || []).length) add('player', '回避', 'evade');
    if ((evadedByTarget.enemy || []).length) add('enemy', '回避', 'evade');
    if (assaultFailed.player) add('player', '突撃失敗', 'fail');
    if (assaultFailed.enemy) add('enemy', '突撃失敗', 'fail');
    statusAdditionsSince(b?.player, previousStatuses.player).forEach((label) => add('player', label, 'status'));
    statusAdditionsSince(b?.enemy, previousStatuses.enemy).forEach((label) => add('enemy', label, 'status'));
    if (!chips.length && (Number(damageByTarget.player || 0) > 0 || Number(damageByTarget.enemy || 0) > 0)) {
        if (Number(damageByTarget.enemy || 0) > 0) add('enemy', `命中 -${formatSteeringValue(damageByTarget.enemy)}`, 'hit');
        if (Number(damageByTarget.player || 0) > 0) add('player', `命中 -${formatSteeringValue(damageByTarget.player)}`, 'hit');
    }
    return chips;
}

function buildTurnSummary(b, playerCommandId, enemyCommandId, dealtBySource = {}, evadedByTarget = {}, assaultFailed = {}) {
    const playerLabel = commandSummaryLabel(playerCommandId, b?.player);
    const enemyLabel = commandSummaryLabel(enemyCommandId, b?.enemy);
    const playerDamage = Number(dealtBySource.player || 0);
    const enemyDamage = Number(dealtBySource.enemy || 0);
    if (playerDamage > 0 && enemyDamage > 0) {
        return `自船 ${playerLabel} 命中 -${formatSteeringValue(playerDamage)} / 敵 ${enemyLabel} 命中 -${formatSteeringValue(enemyDamage)}`;
    }
    if (playerDamage > 0) return `自船 ${playerLabel} 命中 / 敵 -${formatSteeringValue(playerDamage)}`;
    if (enemyDamage > 0) return `敵 ${enemyLabel} 命中 / 自船 -${formatSteeringValue(enemyDamage)}`;
    if ((evadedByTarget.player || []).length) return `敵砲撃 回避 / ${playerLabel}成功`;
    if ((evadedByTarget.enemy || []).length) return `自船砲撃 回避された / ${enemyLabel}`;
    if (assaultFailed.player) return `自船 突撃失敗 / ${enemyLabel}で止められた`;
    if (assaultFailed.enemy) return `敵 突撃失敗 / ${playerLabel}で止めた`;
    return `自船 ${playerLabel} / 敵 ${enemyLabel}`;
}

function createTurnVisualState(b, playerCommandId, enemyCommandId, damageByTarget = {}, dealtBySource = {}, previousFacing = {}, evadedByTarget = {}, previousStatuses = {}) {
    if (!b) return null;
    const playerPose = visualPoseForCommand('player', playerCommandId, previousFacing.player || b.player.facing);
    const enemyPose = visualPoseForCommand('enemy', enemyCommandId, previousFacing.enemy || b.enemy.facing);
    const playerAssaultFailed = playerCommandId === 'assault'
        && Number(damageByTarget.player || 0) > 0
        && Number(dealtBySource.player || 0) <= 0;
    const enemyAssaultFailed = enemyCommandId === 'assault'
        && Number(damageByTarget.enemy || 0) > 0
        && Number(dealtBySource.enemy || 0) <= 0;
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
    const addAssaultFail = (source) => {
        effects.push({
            type: 'assaultFail',
            source
        });
    };

    addCallout('player', playerCommandId);
    addCallout('enemy', enemyCommandId);
    if (Array.isArray(b.turnArcanaVisuals)) {
        effects.push(...b.turnArcanaVisuals);
        b.turnArcanaVisuals = [];
    }
    addShot('player', playerCommandId, 'enemy', enemyCommandId);
    addShot('enemy', enemyCommandId, 'player', playerCommandId);
    if (playerAssaultFailed) addAssaultFail('player');
    if (enemyAssaultFailed) addAssaultFail('enemy');
    const assaultFailed = { player: playerAssaultFailed, enemy: enemyAssaultFailed };
    effects.push(...buildResultChipEffects(b, damageByTarget, dealtBySource, evadedByTarget, assaultFailed, previousStatuses));
    b.lastTurnSummary = buildTurnSummary(b, playerCommandId, enemyCommandId, dealtBySource, evadedByTarget, assaultFailed);

    return {
        token: `${Date.now()}:${b.turn}:${playerCommandId}:${enemyCommandId}`,
        playerPose,
        enemyPose,
        playerHit: Number(dealtBySource.enemy || 0) > 0,
        enemyHit: Number(dealtBySource.player || 0) > 0,
        playerSurge: playerCommandId === 'assault',
        enemySurge: enemyCommandId === 'assault',
        playerAssaultFailed,
        enemyAssaultFailed,
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
    const playerArcana = pendingArcanaForCommand(b.player, playerCommandId);
    const enemyArcana = pendingArcanaForCommand(b.enemy, enemyCommandId);

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
    resetTurnBattleFlags(b.player);
    resetTurnBattleFlags(b.enemy);
    b.player.turnStartHp = b.player.hp;
    b.enemy.turnStartHp = b.enemy.hp;
    applyRoundStartStatusEffects(b, b.player);
    applyRoundStartStatusEffects(b, b.enemy);
    const previousStatuses = {
        player: durationMapForSnapshot(b.player.statuses),
        enemy: durationMapForSnapshot(b.enemy.statuses)
    };
    b.count += 1;
    b.turn += 1;
    b.player.lastCommandId = playerCommandId;
    b.enemy.lastCommandId = enemyCommandId;
    b.player.lastResolvingCommandId = playerCommandId;
    b.enemy.lastResolvingCommandId = enemyCommandId;
    b.player.arcanaAssaultBroadsideGuard = 0;
    b.enemy.arcanaAssaultBroadsideGuard = 0;
    b.turnEvasions = [];
    b.turnArcanaVisuals = [];

    log(b, `第${b.turn}合: ${b.player.label}「${commandLabel(playerCommandId, b.player)}」 / ${b.enemy.label}「${commandLabel(enemyCommandId, b.enemy)}」`);
    if (playerCommandId === 'repair') {
        const repaired = repairEquipment(b.player);
        if (repaired) log(b, `${b.player.label}は設備を修理した`);
    }
    if (enemyCommandId === 'repair') {
        const repaired = repairEquipment(b.enemy);
        if (repaired) log(b, `${b.enemy.label}は設備を修理した`);
    }
    maybeApplyConfusionSelfDamage(b, b.player, playerCommandId);
    maybeApplyConfusionSelfDamage(b, b.enemy, enemyCommandId);
    applySelectedArcanaStart(b, b.player, b.enemy, playerCommandId, playerArcana);
    applySelectedArcanaStart(b, b.enemy, b.player, enemyCommandId, enemyArcana);
    const result = resolveActionMatrix(b, playerCommandId, enemyCommandId);
    applyChariotAssaultMirror(result, playerCommandId, enemyCommandId, playerArcana, enemyArcana);
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
        applyArcanaAfterDamage(b, b.enemy, b.player, enemyCommandId, playerCommandId, enemyArcana, dealt);
    }
    if (damageByTarget.enemy > 0) {
        const dealt = applyDamageToShip(b, b.player, b.enemy, damageByTarget.enemy, labelsByTarget.enemy.join(' / ') || '海戦結果');
        dealtBySource.player += dealt;
        maybeLockRudderAfterAssault(b, b.player, b.enemy, playerCommandId, dealt);
        maybeApplyShipTraitAfterDamage(b, b.player, b.enemy, playerCommandId, dealt);
        applyArcanaAfterDamage(b, b.player, b.enemy, playerCommandId, enemyCommandId, playerArcana, dealt);
    }
    dealtBySource.player += applyWheelRecoilIfNeeded(b, b.player, b.enemy, playerCommandId, enemyCommandId, playerArcana, damageByTarget.player, dealtBySource.enemy);
    dealtBySource.enemy += applyWheelRecoilIfNeeded(b, b.enemy, b.player, enemyCommandId, playerCommandId, enemyArcana, damageByTarget.enemy, dealtBySource.player);
    const evadedByTarget = { player: [], enemy: [] };
    (Array.isArray(b.turnEvasions) ? b.turnEvasions : []).forEach((entry) => {
        if (entry?.target === 'player' || entry?.target === 'enemy') {
            evadedByTarget[entry.target].push(entry);
        }
    });

    const playerResolvedFacing = forceArcanaRudderSuccess(b.player, playerCommandId, previousFacing.player, result.playerFacing, playerArcana);
    const enemyResolvedFacing = forceArcanaRudderSuccess(b.enemy, enemyCommandId, previousFacing.enemy, result.enemyFacing, enemyArcana);
    b.player.facing = normalizeFacing(b.player.arcanaForceFacing || playerResolvedFacing);
    b.enemy.facing = normalizeFacing(b.enemy.arcanaForceFacing || enemyResolvedFacing);
    b.player.arcanaForceFacing = null;
    b.enemy.arcanaForceFacing = null;
    completeReload(b.player, result.firedPlayer);
    completeReload(b.enemy, result.firedEnemy);
    if (playerArcana?.navalEffect?.keepBowReady && playerCommandId === 'bowCannon') b.player.reload = 0;
    if (enemyArcana?.navalEffect?.keepBowReady && enemyCommandId === 'bowCannon') b.enemy.reload = 0;
    applyArcanaRudderSuccessEffects(b, b.player, b.enemy, playerCommandId, previousFacing.player, playerArcana);
    applyArcanaRudderSuccessEffects(b, b.enemy, b.player, enemyCommandId, previousFacing.enemy, enemyArcana);
    b.player.pendingCommandId = null;
    b.enemy.pendingCommandId = null;
    b.player.pendingArcanaKey = null;
    b.enemy.pendingArcanaKey = null;
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
    completeRudderCooldown(b, b.player, playerCommandId, previousFacing.player);
    completeRudderCooldown(b, b.enemy, enemyCommandId, previousFacing.enemy);
    applyEndOfRoundEffects(b, b.player, b.enemy);
    applyEndOfRoundEffects(b, b.enemy, b.player);
    b.visualState = createTurnVisualState(b, playerCommandId, enemyCommandId, damageByTarget, dealtBySource, previousFacing, evadedByTarget, previousStatuses);

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
    const commandId = normalizeCommandId(def.id);
    if (isRudderCommand(commandId) && Number(self?.rudderCooldown || 0) > 0) {
        log(b, `${self.label}は回頭直後のため、この手は面舵/取舵を使えない`);
        render(b);
        notifyStateChanged(b);
        return false;
    }
    if (!canSelect(b, self, foe, def)) return false;
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
    if (commandId === 'repair') {
        self.pendingCommandId = commandId;
        self.pendingArcanaKey = null;
    } else {
        const arcana = activeArcanaForCommand(self, commandId);
        self.pendingCommandId = commandId;
        self.pendingArcanaKey = arcana?.key || null;
    }
    log(b, `${self.label}が「${commandLabel(commandId, self)}」を選択`);
    if (!b.options.disableAi && self.isPlayer && !foe.pendingCommandId && foe.hp > 0) {
        const aiCommand = chooseAiCommand(b);
        if (aiCommand) {
            foe.pendingCommandId = aiCommand;
            foe.pendingArcanaKey = activeArcanaForCommand(foe, aiCommand)?.key || null;
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

function finishBattle(b, outcome, options = {}) {
    if (b.finished) return;
    b.finished = true;
    b.outcome = outcome;
    b.rewardResult = resolveOutcomeReward(b, outcome);

    if (outcome === 'boarding' || outcome === 'boarded') {
        if (options.deferBoarding) {
            scheduleBoardingTransitionAfterVisual(b, outcome);
            return;
        }
        playBoardingTransition(b, outcome);
        return;
    }
    render(b);
    notifyStateChanged(b);
    showBattleResultOverlay(b);
}

function scheduleBoardingTransitionAfterVisual(b, outcome) {
    if (!b) return;
    b.pendingBoardingOutcome = outcome;
    if (navalBoardingDelayTimer) {
        clearTimeout(navalBoardingDelayTimer);
        navalBoardingDelayTimer = null;
    }
    navalBoardingDelayTimer = setTimeout(() => {
        navalBoardingDelayTimer = null;
        if (battle !== b || b.outcome !== outcome || b.pendingBoardingOutcome !== outcome) return;
        b.pendingBoardingOutcome = null;
        playBoardingTransition(b, outcome);
    }, NAVAL_AUTO_BOARDING_DELAY_MS);
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
    if (isSideFacing(b.enemy.facing) && b.enemy.reload <= 0) return `横腹警戒：相手の${cannonCommandLabel(b.enemy, 'broadside')}は${formatSteeringValue(previewCannonDamageForShip(b.enemy, 'broadside'))}負荷。取舵や面舵で読める。`;
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
        try {
            const result = b.options.onBoarding(opponentId, {
                source: 'navalPlunder',
                navalOutcome: b.outcome || null,
                boardedPlayerId: boardedPlayerId || null,
                boardingPlayerId: boardingPlayerId || null,
                navalBoardingState: {
                    player: {
                        morale: b.player.morale,
                        crewHpPercent: b.player.crewHpPercent,
                        crewMpPercent: b.player.crewMpPercent,
                        statuses: durationMapForSnapshot(b.player.statuses)
                    },
                    enemy: {
                        morale: b.enemy.morale,
                        crewHpPercent: b.enemy.crewHpPercent,
                        crewMpPercent: b.enemy.crewMpPercent,
                        statuses: durationMapForSnapshot(b.enemy.statuses)
                    }
                }
            });
            if (result && typeof result.catch === 'function') {
                result.catch((error) => {
                    console.warn('[NavalBattle] onBoarding callback failed:', error);
                });
            }
        } catch (error) {
            console.warn('[NavalBattle] onBoarding callback failed:', error);
        }
    }
}

function closeNavalBattle() {
    const modal = document.getElementById('navalBattleModal');
    if (modal) modal.classList.remove('is-open');
    document.body.classList.remove('naval-battle-lock');
    if (navalBoardingDelayTimer) {
        clearTimeout(navalBoardingDelayTimer);
        navalBoardingDelayTimer = null;
    }
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
.naval-ship-sprite { position: relative; width: var(--naval-ship-frame-w, 64px); height: var(--naval-ship-frame-h, 64px); z-index: 2; background-image: url("./Sprites/Ships/ships.png"); background-position: var(--naval-ship-sprite-x, -64px) var(--naval-ship-sprite-y, -128px); background-size: var(--naval-ship-sheet-w, 2048px) var(--naval-ship-sheet-h, 1024px); background-repeat: no-repeat; image-rendering: pixelated; transform: scale(var(--naval-ship-scale, 1.45)); transform-origin: center center; filter: drop-shadow(0 13px 12px rgba(0, 0, 0, 0.38)); }
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
.naval-ship.is-surging.is-assault-failed .naval-ship-sprite-wrap { animation: navalSurgeFailed ${NAVAL_SURGE_MOTION_MS}ms cubic-bezier(0.16, 0.64, 0.2, 1) both; }
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
.naval-dodge-label,
.naval-assault-fail,
.naval-result-chip { position: absolute; z-index: 9; min-width: 54px; text-align: center; border-radius: 999px; border: 1px solid rgba(255, 244, 194, 0.72); background: rgba(5, 19, 23, 0.88); color: #e7fff7; font-size: 13px; font-weight: 900; line-height: 1.2; padding: 5px 10px; text-shadow: 0 1px 2px #000; pointer-events: none; opacity: 0; }
.naval-dodge-label { --naval-dodge-label-offset: 0px; top: 124px; animation: navalDodgeLabel 940ms ease-out both; }
.naval-dodge-label.is-player { right: 16%; }
.naval-dodge-label.is-enemy { left: 16%; }
.naval-dodge-label.miss-up { --naval-dodge-label-offset: -18px; }
.naval-dodge-label.miss-down { --naval-dodge-label-offset: 18px; }
.naval-assault-fail { top: 154px; color: #ffe7a6; border-color: rgba(255, 164, 118, 0.82); background: rgba(39, 17, 11, 0.9); animation: navalAssaultFailLabel 1120ms ease-out both; }
.naval-assault-fail.is-player { right: 14%; }
.naval-assault-fail.is-enemy { left: 14%; }
.naval-result-chip { top: 42%; min-width: 72px; border-color: rgba(126, 227, 207, 0.72); background: rgba(3, 20, 24, 0.92); animation: navalResultChip 1200ms ease-out both; z-index: 12; }
.naval-result-chip.is-player { right: 19%; }
.naval-result-chip.is-enemy { left: 19%; }
.naval-result-chip.is-hit { color: #ffe9a6; border-color: rgba(244, 211, 126, 0.82); }
.naval-result-chip.is-evade { color: #b8fff2; border-color: rgba(126, 227, 207, 0.82); }
.naval-result-chip.is-fail { color: #ffc2a6; border-color: rgba(255, 164, 118, 0.82); }
.naval-result-chip.is-status { color: #ffd4e0; border-color: rgba(248, 113, 113, 0.72); }
.naval-arcana-card-effect { position: absolute; left: 58%; top: 52%; z-index: 13; width: 92px; display: grid; justify-items: center; gap: 6px; transform: translate(-50%, -50%); pointer-events: none; opacity: 0; animation: navalArcanaCardEffect 1360ms cubic-bezier(0.18, 0.72, 0.22, 1) both; filter: drop-shadow(0 18px 22px rgba(0, 0, 0, 0.48)); }
.naval-arcana-card-effect.is-enemy { left: 42%; }
.naval-arcana-card-sprite { width: var(--naval-arcana-card-w, 48px); height: var(--naval-arcana-card-h, 80px); border-radius: 6px; border: 1px solid rgba(255, 236, 174, 0.86); background-image: var(--naval-arcana-card-bg); background-position: var(--naval-arcana-card-x, 0px) var(--naval-arcana-card-y, 0px); background-repeat: no-repeat; transform: scale(1.18); transform-origin: center; box-shadow: 0 0 0 2px rgba(35, 20, 8, 0.74), 0 0 18px rgba(244, 211, 126, 0.44); image-rendering: auto; }
.naval-arcana-card-name { max-width: 120px; border: 1px solid rgba(244, 211, 126, 0.54); border-radius: 999px; background: rgba(18, 12, 5, 0.86); color: #ffe8a8; font-size: 11px; font-weight: 900; line-height: 1.2; padding: 4px 8px; text-align: center; text-shadow: 0 1px 2px #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes navalSeaDrift { from { transform: translateX(0); } to { transform: translateX(56px); } }
@keyframes navalImpactShake { 0%,100% { transform: translate3d(0, 0, 0); } 14% { transform: translate3d(-5px, 2px, 0); } 28% { transform: translate3d(5px, -2px, 0); } 42% { transform: translate3d(-4px, 1px, 0); } 58% { transform: translate3d(4px, 0, 0); } 74% { transform: translate3d(-2px, -1px, 0); } }
@keyframes navalShipFrameStep { from { background-position: var(--naval-ship-animation-x, 0px) var(--naval-ship-sprite-y, -128px); } to { background-position: var(--naval-ship-animation-end-x, -192px) var(--naval-ship-sprite-y, -128px); } }
@keyframes navalDodgeLean { 0% { transform: scale(var(--naval-ship-scale, 1.45)) translateY(0); } 42% { transform: scale(var(--naval-ship-scale, 1.45)) translateY(-5px); } 100% { transform: scale(var(--naval-ship-scale, 1.45)) translateY(0); } }
@keyframes navalDodgeUp { 0%,100% { transform: none; } }
@keyframes navalDodgeDown { 0%,100% { transform: none; } }
@keyframes navalSurge { 0% { transform: translateX(0) translateY(0); } 22% { transform: translateX(var(--naval-surge-start-x, 12px)) translateY(1px); } 54% { transform: translateX(var(--naval-surge-mid-x, 84px)) translateY(2px); } 68% { transform: translateX(var(--naval-surge-x, 96px)) translateY(3px); } 82% { transform: translateX(var(--naval-surge-settle-x, 86px)) translateY(2px); } 100% { transform: translateX(0) translateY(0); } }
@keyframes navalSurgeFailed { 0% { transform: translateX(0) translateY(0); } 24% { transform: translateX(var(--naval-surge-start-x, 12px)) translateY(1px); } 48% { transform: translateX(var(--naval-surge-mid-x, 84px)) translateY(2px); } 58% { transform: translateX(var(--naval-surge-x, 96px)) translateY(3px); } 70% { transform: translateX(var(--naval-surge-recoil-x, -34px)) translateY(2px); } 84% { transform: translateX(var(--naval-surge-rebound-x, 12px)) translateY(1px); } 100% { transform: translateX(0) translateY(0); } }
@keyframes navalBoardingPlayer { 0% { transform: translateX(0); } 28% { transform: translateX(var(--naval-boarding-start-x, -32px)); } 66% { transform: translateX(var(--naval-boarding-overshoot-x, -150px)); } 84% { transform: translateX(var(--naval-boarding-bounce-x, -132px)); } 100% { transform: translateX(var(--naval-boarding-x, -144px)); } }
@keyframes navalBoardingEnemy { 0% { transform: translateX(0); } 28% { transform: translateX(var(--naval-boarding-start-x, 32px)); } 66% { transform: translateX(var(--naval-boarding-overshoot-x, 150px)); } 84% { transform: translateX(var(--naval-boarding-bounce-x, 132px)); } 100% { transform: translateX(var(--naval-boarding-x, 144px)); } }
@keyframes navalBoardingRock { 0% { transform: translateY(0) rotate(0); } 34% { transform: translateY(1px) rotate(0); } 66% { transform: translateY(3px) rotate(-1deg); } 84% { transform: translateY(1px) rotate(1deg); } 100% { transform: translateY(0) rotate(0); } }
@keyframes navalBoardingLine { 0%,34% { opacity: 0; transform: scaleX(0.18); } 54%,86% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0; transform: scaleX(1.04); } }
@keyframes navalBoardingClash { 0%,40% { opacity: 0; transform: translate(-50%, -50%) scale(0.86); } 58%,86% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.03); } }
@keyframes navalCommandCallout { 0% { opacity: 0; transform: translateY(8px) scale(0.96); } 14%,70% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-4px) scale(0.98); } }
@keyframes navalDodgeLabel { 0%,16% { opacity: 0; transform: translateY(calc(var(--naval-dodge-label-offset, 0px) + 8px)) scale(0.92); } 30%,72% { opacity: 1; transform: translateY(var(--naval-dodge-label-offset, 0px)) scale(1); } 100% { opacity: 0; transform: translateY(calc(var(--naval-dodge-label-offset, 0px) - 10px)) scale(1.04); } }
@keyframes navalAssaultFailLabel { 0%,24% { opacity: 0; transform: translateY(8px) scale(0.92); } 38%,78% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-8px) scale(1.04); } }
@keyframes navalResultChip { 0%,18% { opacity: 0; transform: translateY(10px) scale(0.92); } 32%,78% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-10px) scale(1.04); } }
@keyframes navalArcanaCardEffect { 0% { opacity: 0; transform: translate(-50%, -44%) scale(0.9) rotate(-2deg); } 18% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0); } 72% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -56%) scale(1.04) rotate(1deg); } }
@keyframes navalHitShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 42% { transform: translateX(4px); } 64% { transform: translateX(-3px); } }
@keyframes navalStunnedShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@keyframes navalSmokePuff { 0% { transform: translateY(12px) scale(0.58); opacity: 0; } 18% { opacity: 0.8; } 100% { transform: translateY(-18px) scale(1.35); opacity: 0; } }
@keyframes navalShotPlayerHit { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0) rotate(180deg); } 14% { opacity: 1; } 82% { opacity: 1; } 100% { left: 29%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0) rotate(180deg); } }
@keyframes navalShotEnemyHit { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0); } 14% { opacity: 1; } 82% { opacity: 1; } 100% { left: 66%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: translate(0, 0); } }
@keyframes navalShotPlayerMissUp { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } 14% { opacity: 1; } 58% { opacity: 1; } 100% { left: -8%; top: calc(var(--naval-shot-track-top, 58%) - 12px); opacity: 0; transform: rotate(180deg); } }
@keyframes navalShotPlayerMissDown { 0% { left: 69%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(180deg); } 14% { opacity: 1; } 58% { opacity: 1; } 100% { left: -8%; top: calc(var(--naval-shot-track-top, 58%) + 12px); opacity: 0; transform: rotate(180deg); } }
@keyframes navalShotEnemyMissUp { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } 14% { opacity: 1; } 58% { opacity: 1; } 100% { left: 108%; top: calc(var(--naval-shot-track-top, 58%) - 12px); opacity: 0; transform: rotate(0deg); } }
@keyframes navalShotEnemyMissDown { 0% { left: 26%; top: var(--naval-shot-track-top, 58%); opacity: 0; transform: rotate(0deg); } 14% { opacity: 1; } 58% { opacity: 1; } 100% { left: 108%; top: calc(var(--naval-shot-track-top, 58%) + 12px); opacity: 0; transform: rotate(0deg); } }
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
.naval-turn-summary { min-height: 24px; margin-top: -2px; margin-bottom: 7px; border: 1px solid rgba(126, 227, 207, 0.26); border-radius: 999px; background: rgba(3, 18, 23, 0.76); color: #d9fff7; font-size: 12px; font-weight: 800; line-height: 1.2; padding: 5px 10px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.naval-arcana-cutin { position: absolute; left: 50%; top: 84px; transform: translate(-50%, -50%); z-index: 4; width: min(300px, 78%); border: 1px solid rgba(244, 211, 126, 0.68); border-radius: 8px; padding: 8px 11px; background: linear-gradient(135deg, rgba(32, 21, 9, 0.9), rgba(10, 28, 31, 0.88)); color: #fff4c7; box-shadow: 0 10px 28px rgba(0,0,0,0.36); animation: navalArcanaCutin 1.4s ease both; pointer-events: none; }
.naval-arcana-cutin[hidden] { display: none; }
.naval-arcana-cutin.is-enemy { border-color: rgba(255, 146, 134, 0.78); color: #ffd6d1; }
.naval-arcana-cutin-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0; color: #f4d37e; }
.naval-arcana-cutin strong { display: block; margin-top: 2px; font-size: 13px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
.naval-command-preview { display: block; min-width: 0; color: #b7d8d0; font-size: 10px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.naval-command-btn small { display: none; }
.naval-command-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: #f4d37e; font-size: 10px; font-weight: 700; }
.naval-command-kind { color: #0b1816; background: #f4d37e; border-radius: 999px; padding: 2px 7px; }
.naval-command-btn.is-cannon { border-color: #577a89; }
.naval-command-btn.is-move { border-color: #a95d4d; }
.naval-command-btn.is-rudder { border-color: #4f9b88; }
.naval-command-btn.is-feint { border-color: #8b9161; }
.naval-command-btn.is-boarding { border-color: #b76d76; }
.naval-command-btn.is-repair { border-color: #9a8f63; }
.naval-command-btn.is-arcana { border-color: #d8b45e; background: rgba(42, 31, 12, 0.94); }
.naval-command-btn.is-arcana .naval-command-kind { background: #f8d77c; color: #221708; }
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
    .naval-arcana-card-effect { top: 50%; width: 82px; }
    .naval-arcana-card-effect.is-player { left: 60%; }
    .naval-arcana-card-effect.is-enemy { left: 40%; }
    .naval-result-chip.is-player { right: 13%; }
    .naval-result-chip.is-enemy { left: 13%; }
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
                <div class="naval-turn-summary" id="navalTurnSummary">コマンドを選ぶ</div>
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
                            <span class="naval-status-chip" id="navalStateEnemy"></span>
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
                            <span class="naval-status-chip" id="navalStatePlayer"></span>
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
    enemyEl.style.top = `${shipVisualTop(b.enemy)}px`;
    playerEl.style.left = 'calc(92% - 112px)';
    playerEl.style.top = `${shipVisualTop(b.player)}px`;
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
        assaultFailed: playerVisual.playerAssaultFailed,
        boarding: playerVisual.playerBoarding
    });
    applyShipSprite(enemyEl, b.enemy, 'enemy', enemyVisual.enemyPose, {
        hit: enemyVisual.enemyHit,
        surge: enemyVisual.enemySurge,
        assaultFailed: enemyVisual.enemyAssaultFailed,
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

function shipVisualTop(ship) {
    return String(ship?.shipDomain || '').toLowerCase() === 'air'
        ? NAVAL_SHIP_AIR_TOP
        : NAVAL_SHIP_SURFACE_TOP;
}

function applyShipSprite(container, ship, side, visualPose = '', flags = {}) {
    if (!container || !ship) return;
    const sprite = container.querySelector('.naval-ship-sprite');
    const frame = shipSpriteFrame(ship, side, visualPose);
    if (sprite) {
        const asset = frame.asset || SHIP_SPRITE_DEFAULT_ASSET;
        const frameSize = frame.frameSize || asset.frameSize || SHIP_SPRITE_FRAME_SIZE;
        sprite.style.backgroundImage = `url("${asset.path}")`;
        sprite.style.setProperty('--naval-ship-frame-w', `${frameSize}px`);
        sprite.style.setProperty('--naval-ship-frame-h', `${frameSize}px`);
        sprite.style.setProperty('--naval-ship-sheet-w', `${asset.sheetWidth || SHIP_SPRITE_DEFAULT_ASSET.sheetWidth}px`);
        sprite.style.setProperty('--naval-ship-sheet-h', `${asset.sheetHeight || SHIP_SPRITE_DEFAULT_ASSET.sheetHeight}px`);
        sprite.style.setProperty('--naval-ship-scale', `${asset.scale || SHIP_SPRITE_DEFAULT_ASSET.scale}`);
        sprite.style.setProperty('--naval-ship-sprite-x', `${frame.x}px`);
        sprite.style.setProperty('--naval-ship-sprite-y', `${frame.y}px`);
        sprite.style.setProperty('--naval-ship-animation-x', `${frame.x + frameSize}px`);
        sprite.style.setProperty('--naval-ship-animation-end-x', `${frame.x - (frameSize * 2)}px`);
    }
    const form = visualShipForm(ship);
    const traitKey = String(ship?.shipTraitKey || '').replace(/[^a-z0-9_-]/gi, '');
    container.className = [
        'naval-ship',
        `is-${side}`,
        `is-${form}`,
        traitKey ? `is-${traitKey}` : '',
        visualPose ? 'is-turning' : '',
        visualPose.includes('Up') ? 'is-turning-up' : '',
        visualPose.includes('Down') ? 'is-turning-down' : '',
        flags.hit ? 'is-hit' : '',
        flags.surge ? 'is-surging' : '',
        flags.assaultFailed ? 'is-assault-failed' : '',
        flags.boarding ? 'is-boarding-motion' : '',
        ship.hp <= 0 ? 'is-stunned' : ''
    ].filter(Boolean).join(' ');
    container.dataset.shipKey = ship?.shipTraitKey || '';
    container.dataset.shipName = ship?.shipName || ship?.shipType || '';
    container.title = ship?.shipName || ship?.shipType || '';
    const nameEl = container.querySelector('.naval-ship-name');
    if (nameEl) nameEl.textContent = ship?.shipName || ship?.shipType || (side === 'player' ? '自船' : '敵船');
    const surgeX = side === 'player' ? -156 : 156;
    container.style.setProperty('--naval-surge-x', `${surgeX}px`);
    container.style.setProperty('--naval-surge-start-x', `${Math.round(surgeX * 0.12)}px`);
    container.style.setProperty('--naval-surge-mid-x', `${Math.round(surgeX * 0.88)}px`);
    container.style.setProperty('--naval-surge-settle-x', `${Math.round(surgeX * 0.9)}px`);
    container.style.setProperty('--naval-surge-recoil-x', `${Math.round(surgeX * -0.26)}px`);
    container.style.setProperty('--naval-surge-rebound-x', `${Math.round(surgeX * 0.08)}px`);
}

function renderArcanaCardEffect(effect) {
    const source = effect?.source === 'enemy' ? 'enemy' : 'player';
    const sprite = arcanaSpriteInfo(effect);
    const col = sprite.spriteIndex % sprite.spriteCols;
    const row = Math.floor(sprite.spriteIndex / sprite.spriteCols);
    const safeSpritePath = String(sprite.spritePath || NAVAL_TAROT_SPRITE.path).replace(/[)"\\\n\r]/g, '');
    const style = [
        `--naval-arcana-card-x: ${-(col * sprite.spriteWidth)}px`,
        `--naval-arcana-card-y: ${-(row * sprite.spriteHeight)}px`,
        `--naval-arcana-card-w: ${sprite.spriteWidth}px`,
        `--naval-arcana-card-h: ${sprite.spriteHeight}px`,
        `--naval-arcana-card-bg: url(${safeSpritePath})`
    ].join('; ');
    return `
        <span class="naval-arcana-card-effect is-${source}" data-arcana-card data-arcana-side="${source}" aria-hidden="true">
            <span class="naval-arcana-card-sprite" style="${escapeHtml(style)}"></span>
            <span class="naval-arcana-card-name">${escapeHtml(effect.body || effect.title || '大アルカナ')}</span>
        </span>
    `;
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
        if (effect?.type === 'assaultFail') {
            const source = effect.source === 'enemy' ? 'enemy' : 'player';
            return `<span class="naval-assault-fail is-${source}" aria-hidden="true">突撃失敗</span>`;
        }
        if (effect?.type === 'resultChip') {
            const target = effect.target === 'enemy' ? 'enemy' : 'player';
            const tone = effect.tone ? ` is-${effect.tone}` : '';
            return `<span class="naval-result-chip is-${target}${tone}" data-result-chip data-result-target="${target}" aria-hidden="true">${escapeHtml(effect.text || '')}</span>`;
        }
        if (effect?.type === 'arcanaCard') return renderArcanaCardEffect(effect);
        if (effect?.type !== 'shot') return '';
        const shotCount = effect.commandId === 'broadside' ? 6 : 1;
        const shots = Array.from({ length: shotCount }, (_, index) => {
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
        if (!effect.miss) return shots;
        const target = effect.target === 'enemy' ? 'enemy' : 'player';
        const direction = effect.dodgeDirection ? `miss-${effect.dodgeDirection}` : '';
        return `${shots}<span class="naval-dodge-label is-${target} ${direction}" aria-hidden="true">回避</span>`;
    }).join('');
}

function scheduleNavalVisualClear(b) {
    if (navalVisualClearTimer) {
        clearTimeout(navalVisualClearTimer);
        navalVisualClearTimer = null;
    }
    if (!b?.visualState?.token) return;
    if (b.visualState.type === 'boarding') return;
    if (b.pendingBoardingOutcome) return;
    const token = b.visualState.token;
    navalVisualClearTimer = setTimeout(() => {
        if (battle === b && b.visualState?.token === token) {
            b.visualState = null;
            render(b);
        }
    }, NAVAL_VISUAL_EFFECT_MS);
}

function weaponStatusText(ship) {
    const bow = formatSteeringValue(previewCannonDamageForShip(ship, 'bowCannon'));
    const side = formatSteeringValue(previewCannonDamageForShip(ship, 'broadside'));
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
    const name = shipPassiveName(ship);
    if (!name) return '-';
    const pending = Object.keys(asObject(ship?.shipPassivePending)).length > 0;
    if (pending) return `${name} 待機中`;
    const mode = String(ship?.shipPassiveMode || shipMetaForKey(ship?.shipTraitKey, ship?.shipForm)?.passiveMode || '');
    if (mode === 'continuous' || mode === 'pending') return `${name} 常時`;
    return `${name} ${shipPassiveWasUsed(ship) ? '使用済み' : '未使用'}`;
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

function shipConditionText(ship) {
    const chunks = [
        `領域${ship?.shipDomainLabel || SHIP_DOMAIN_LABEL[ship?.shipDomain] || SHIP_DOMAIN_LABEL.surface}`,
        `海戦耐久${formatSteeringValue(ship?.hp || 0)}/${formatSteeringValue(ship?.maxHp || 0)}`
    ];
    if (ship?.lowFirepower) chunks.push('低火力');
    chunks.push(`士気${clampNumber(ship?.morale, -2, 2, 0)}`);
    chunks.push(`船員HP${Math.round(clampPercent(ship?.crewHpPercent, 100))}%`);
    chunks.push(`MP${Math.round(clampPercent(ship?.crewMpPercent, 100))}%`);
    Object.entries(normalizeDurationMap(ship?.statuses)).forEach(([name, value]) => {
        chunks.push(`${statusLabel(name)}${durationValue(value)}`);
    });
    Object.entries(normalizeDurationMap(ship?.equipmentDamage)).forEach(([name, value]) => {
        chunks.push(`${equipmentDamageLabel(name)}損傷${durationValue(value)}`);
    });
    if (ship?.illusion) chunks.push('幻影');
    if (ship?.lockOn) chunks.push('ロックオン');
    if (ship?.arcanaDamageShield) chunks.push('シールド');
    return chunks.join(' / ');
}

function renderStatus(b) {
    const cards = [
        { ship: b.player, foe: b.enemy, hp: 'navalHpPlayer', hpText: 'navalHpPlayerText', type: 'navalTypePlayer', weapon: 'navalWeaponPlayer', element: 'navalElementPlayer', trait: 'navalTraitPlayer', spec: 'navalSpecPlayer', cargo: 'navalCargoPlayer', arcana: 'navalArcanaPlayer', facing: 'navalFacingPlayer', reload: 'navalReloadPlayer', state: 'navalStatePlayer', pending: 'navalPendingPlayer', shipFacing: 'navalShipPlayerFacing' },
        { ship: b.enemy, foe: b.player, hp: 'navalHpEnemy', hpText: 'navalHpEnemyText', type: 'navalTypeEnemy', weapon: 'navalWeaponEnemy', element: 'navalElementEnemy', trait: 'navalTraitEnemy', spec: 'navalSpecEnemy', cargo: 'navalCargoEnemy', arcana: 'navalArcanaEnemy', facing: 'navalFacingEnemy', reload: 'navalReloadEnemy', state: 'navalStateEnemy', pending: 'navalPendingEnemy', shipFacing: 'navalShipEnemyFacing' }
    ];
    cards.forEach(({ ship, foe, hp, hpText, type, weapon, element, trait, spec, cargo, arcana, facing, reload, state, pending, shipFacing }) => {
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
        const stateEl = document.getElementById(state);
        if (stateEl) stateEl.textContent = shipConditionText(ship);
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
    const turnSummary = document.getElementById('navalTurnSummary');
    if (turnSummary) {
        turnSummary.textContent = b.lastTurnSummary || 'コマンドを選ぶ';
    }
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
    const commands = commandOptionsForState(b, self, foe);
    commands.forEach((def) => {
        const arcana = activeArcanaForCommand(self, def.id);
        const label = commandLabel(def.id, self);
        const desc = commandDescription(def, self);
        const preview = commandPreviewText(def, self);
        const selectable = canSelect(b, self, foe, def);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `naval-command-btn is-${def.type}${arcana ? ' is-arcana' : ''}`;
        button.dataset.navalCommand = def.id;
        button.innerHTML = `
            <span class="naval-command-icon" aria-hidden="true">
                ${def.icon ? `<img src="${escapeHtml(def.icon)}" alt="">` : ''}
            </span>
            <span class="naval-command-body">
                <span class="naval-command-meta">
                    <span class="naval-command-kind">${escapeHtml(commandTypeLabel(def, self))}</span>
                    <span>${escapeHtml(commandAvailabilityLabel(def, self))}</span>
                </span>
                <b>${escapeHtml(label)}</b>
                <span class="naval-command-preview">${escapeHtml(preview)}</span>
                <small>${escapeHtml(arcana ? `${COMMANDS[def.id]?.label || def.id}: ${desc}` : desc)}</small>
            </span>
        `;
        button.disabled = !selectable;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', () => {
            if (typeof b.options.onCommandSelect === 'function') {
                const handled = b.options.onCommandSelect(def.id, {
                    command: def,
                    canSelect: selectable,
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
        else if (Number(self.rudderCooldown || 0) > 0) note.textContent = '回頭直後: 次の一手は面舵/取舵を使えません。';
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
        lastTurnSummary: '',
        turnArcanaVisuals: [],
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
    battle.lastTurnSummary = next.lastTurnSummary || '';
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
        if (aiCommand) {
            battle.enemy.pendingCommandId = aiCommand;
            battle.enemy.pendingArcanaKey = activeArcanaForCommand(battle.enemy, aiCommand)?.key || null;
        }
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
    resolveEvasionRate: ({ defenderFacing = 'front', defenderCommandId = '', attackerCommandId = '', defenderShipTraitKey = '', defenderShipPassiveKey = '', defenderShipDomain = '', attackerShipTraitKey = '', attackerShipPassiveKey = '' } = {}) => {
        const defenderMeta = shipMetaForKey(defenderShipTraitKey, '');
        const attackerMeta = shipMetaForKey(attackerShipTraitKey, '');
        const defender = {
            facing: defenderFacing,
            lastResolvingCommandId: defenderCommandId,
            shipTraitKey: normalizeShipTraitKey(defenderShipTraitKey),
            shipPassiveKey: defenderShipPassiveKey || defenderMeta?.passiveKey || '',
            shipDomain: defenderShipDomain || defenderMeta?.domain || 'surface',
            shipPassiveUses: {}
        };
        const attacker = {
            shipTraitKey: normalizeShipTraitKey(attackerShipTraitKey),
            shipPassiveKey: attackerShipPassiveKey || attackerMeta?.passiveKey || ''
        };
        let rate = evasionRateForShip(defender, attackerCommandId, defenderCommandId, attacker);
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
