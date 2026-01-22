// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    leaveTroy,
    claimTroyQuest,
    getTroyQuestClears,
    usePoints
} from './playfabClient.js';

let _wired = false;
let _questWired = false;
let _menuWired = false;
let _pollTimer = null;
let _lastStatus = null;
let _questBetAmount = 50;
let _lastQuestList = [];
let _questClears = {};
let _questMode = 'solo';
let _activeQuestGameKey = '';
let _activeQuestGameLabel = '未選択';
let _questSelections = {};
let _questSelectionTimer = null;

const TROY_GACHA_LABELS = {
    hat: '布帽子',
    wand: 'ワンド',
    dagger: 'ナイフ',
    sword: 'ソード',
    axe: '斧',
    blunt: 'こん棒',
    shield: '盾',
    polearm: '槍',
    leather: '革兜',
    metal: '鉄兜',
    staff: '杖',
    gun: '銃（弓）'
};

const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 6;
const DIFFICULTY_FALLBACK = 4;
const DIFFICULTY_ALIASES = {
    easy: 2,
    normal: 4,
    hard: 6
};

const QUEST_REWARD_TIERS = ['コモン', 'レア', 'エピック'];
const QUEST_BET_OPTIONS = [50, 100, 500, 1000];
const QUEST_BET_THRESHOLDS = {
    bonus1: 500,
    bonus2: 1000
};
const QUEST_BET_MAX = 100000;
const QUEST_SELECTION_TTL_MS = 30 * 60 * 1000;
const QUEST_TIER_ORDER = ['beginner', 'intermediate', 'advanced'];
const QUEST_TIER_LABELS = {
    beginner: '初級',
    intermediate: '中級',
    advanced: '上級'
};
const QUEST_MODE_LABELS = {
    solo: 'ソロ/チーム',
    battle: 'バトル'
};

const TROY_PRODUCT_MENUS = {
    'drink-alcohol': {
        title: 'ドリンク/アルコール',
        items: [
            { name: 'ラムコーク', price: '¥900' },
            { name: 'ハイボール', price: '¥850' },
            { name: '赤ワイン', price: '¥950' },
            { name: 'カクテル各種', price: '¥900' }
        ]
    },
    'soft-drink': {
        title: 'ソフトドリンク',
        items: [
            { name: 'コーラ', price: '¥400' },
            { name: 'ジンジャーエール', price: '¥400' },
            { name: 'ウーロン茶', price: '¥350' },
            { name: 'フルーツジュース', price: '¥450' }
        ]
    },
    food: {
        title: 'フード',
        items: [
            { name: '海賊ナッツ', price: '¥500' },
            { name: 'スパイシーチキン', price: '¥850' },
            { name: '塩焼きポテト', price: '¥600' },
            { name: '日替わりプレート', price: '¥1200' }
        ]
    },
    goods: {
        title: 'グッズ',
        items: [
            { name: 'TROYロゴT', price: '¥2800' },
            { name: '航海マグ', price: '¥1600' },
            { name: 'バンダナ', price: '¥1200' },
            { name: '限定バッジ', price: '¥900' }
        ]
    },
    points: {
        title: 'ポイント',
        items: [
            { name: '600Ps', price: '￥5000' },
            { name: '350Ps', price: '￥3000' },
            { name: '100Ps', price: '￥1000' }
        ]
    }
};

const TROY_QUESTS = [
    {
        "game": "ビリヤード",
        "name": "初球の確認",
        "detail": "ボーラードで1球以上入れる",
        "gachaType": "hat",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "まずは一球、航路を示せ。"
    },
    {
        "game": "ビリヤード",
        "name": "港の得点",
        "detail": "ボーラードで1フレームで1点以上",
        "gachaType": "blunt",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "港の得点で流れを掴め。"
    },
    {
        "game": "ビリヤード",
        "name": "見張りの完走",
        "detail": "ボーラードで1フレーム完走（勝敗不問）",
        "gachaType": "leather",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "見張りの任務は完走から。"
    },
    {
        "game": "ビリヤード",
        "name": "舵の連打",
        "detail": "ボーラードで連続得点2回",
        "gachaType": "polearm",
        "questKey": "billiard-bowrad",
        "difficulty": 3,
        "flavor": "舵の連打で点を刻め。"
    },
    {
        "game": "ビリヤード",
        "name": "黒旗の積算",
        "detail": "ボーラードで合計40点以上",
        "gachaType": "axe",
        "questKey": "billiard-bowrad",
        "difficulty": 3,
        "flavor": "黒旗の積算で優位を築け。"
    },
    {
        "game": "ビリヤード",
        "name": "静かな連続",
        "detail": "ボーラードで2フレーム連続得点",
        "gachaType": "wand",
        "questKey": "billiard-bowrad",
        "difficulty": 3,
        "flavor": "静けさの中で連続を刻め。"
    },
    {
        "game": "ビリヤード",
        "name": "波間の計算",
        "detail": "ボーラードで合計80点以上",
        "gachaType": "shield",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "波間の計算で点を積め。"
    },
    {
        "game": "ビリヤード",
        "name": "砲門の精度",
        "detail": "ボーラードでストライク1回",
        "gachaType": "dagger",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "精度の砲門で卓を制せ。"
    },
    {
        "game": "ビリヤード",
        "name": "帆走の維持",
        "detail": "ボーラードで3フレーム連続得点",
        "gachaType": "staff",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "帆走を維持して航路を守れ。"
    },
    {
        "game": "ビリヤード",
        "name": "狙撃の締め",
        "detail": "ボーラードで120点以上",
        "gachaType": "gun",
        "questKey": "billiard-bowrad",
        "difficulty": 6,
        "flavor": "狙撃の精度で締めくくれ。"
    },
    {
        "game": "ビリヤード",
        "name": "鋼の逆転",
        "detail": "ボーラードで最終フレームで逆転勝利",
        "gachaType": "metal",
        "questKey": "billiard-bowrad",
        "difficulty": 6,
        "flavor": "鋼の胆力で逆転を奪え。"
    },
    {
        "game": "ビリヤード",
        "name": "剣の連鎖",
        "detail": "ボーラードでストライク2回",
        "gachaType": "sword",
        "questKey": "billiard-bowrad",
        "difficulty": 6,
        "flavor": "剣の連鎖で卓を制圧せよ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "開戦の一打",
        "detail": "9ボールで1球以上入れる",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "開戦の一打",
        "questKey": "billiard-9",
        "difficulty": 1,
        "flavor": "一対一の一打で流れを掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "港の一球",
        "detail": "8ボールで1球以上入れる",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "港の一球",
        "questKey": "billiard-8",
        "difficulty": 1,
        "flavor": "港の一球で戦端を開け。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "初動ブレイク",
        "detail": "9ボールでブレイク成功",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "初動ブレイク",
        "questKey": "billiard-9",
        "difficulty": 1,
        "flavor": "初動の一撃で主導権を取れ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "舵の勝利",
        "detail": "9ボールで1勝する",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "舵の勝利",
        "questKey": "billiard-9",
        "difficulty": 3,
        "flavor": "舵を握り勝利へ導け。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "黒旗の勝利",
        "detail": "8ボールで1勝する",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の勝利",
        "questKey": "billiard-8",
        "difficulty": 3,
        "flavor": "黒旗を掲げて勝利を掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "連続ポケット",
        "detail": "9ボールで連続ポケット2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "連続ポケット",
        "questKey": "billiard-9",
        "difficulty": 3,
        "flavor": "連続の一撃で差を広げよ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "旗艦連勝",
        "detail": "9ボールで2連勝",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗艦連勝",
        "questKey": "billiard-9",
        "difficulty": 5,
        "flavor": "旗艦の連勝で支配せよ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "包囲の8番",
        "detail": "8ボールで2連勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "包囲の8番",
        "questKey": "billiard-8",
        "difficulty": 5,
        "flavor": "包囲の8番で勝利を重ねろ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "連続ブレイク",
        "detail": "8ボールでブレイク後に連続ポケット2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "連続ブレイク",
        "questKey": "billiard-8",
        "difficulty": 5,
        "flavor": "連続ブレイクで押し切れ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "沈黙の掃討",
        "detail": "9ボールでノーミス勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "沈黙の掃討",
        "questKey": "billiard-9",
        "difficulty": 6,
        "flavor": "沈黙の掃討で敵を沈めろ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "鋼の決着",
        "detail": "8ボールでノーミス勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "鋼の決着",
        "questKey": "billiard-8",
        "difficulty": 6,
        "flavor": "鋼の決着で勝利を掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "一閃の制圧",
        "detail": "9ボールでブレイクラン成功",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "一閃の制圧",
        "questKey": "billiard-9",
        "difficulty": 6,
        "flavor": "一閃の制圧で決着をつけろ。"
    },
    {
        "game": "カラオケ",
        "name": "潮騒の一曲",
        "detail": "シングルで歌い切る（完走）",
        "gachaType": "hat",
        "questKey": "karaoke-single",
        "difficulty": 1,
        "flavor": "潮騒に合わせて歌い切れ。"
    },
    {
        "game": "カラオケ",
        "name": "甲板の合図",
        "detail": "シングルで採点結果を表示する",
        "gachaType": "leather",
        "questKey": "karaoke-single",
        "difficulty": 1,
        "flavor": "甲板で合図を出すように歌え。"
    },
    {
        "game": "カラオケ",
        "name": "波乗りの声",
        "detail": "シングルで65点以上",
        "gachaType": "wand",
        "questKey": "karaoke-single",
        "difficulty": 1,
        "flavor": "波に乗る声を響かせろ。"
    },
    {
        "game": "カラオケ",
        "name": "帆走のリズム",
        "detail": "シングルで75点以上",
        "gachaType": "polearm",
        "questKey": "karaoke-single",
        "difficulty": 3,
        "flavor": "帆走のリズムを揃えよ。"
    },
    {
        "game": "カラオケ",
        "name": "航海のコンボ",
        "detail": "シングルでコンボ10以上",
        "gachaType": "dagger",
        "questKey": "karaoke-single",
        "difficulty": 3,
        "flavor": "連続の刃で航海を進め。"
    },
    {
        "game": "カラオケ",
        "name": "灯台の高音",
        "detail": "シングルで安定度70%以上",
        "gachaType": "staff",
        "questKey": "karaoke-single",
        "difficulty": 3,
        "flavor": "灯台の高音で道を照らせ。"
    },
    {
        "game": "カラオケ",
        "name": "航海の誓い",
        "detail": "シングルで85点以上",
        "gachaType": "sword",
        "questKey": "karaoke-single",
        "difficulty": 5,
        "flavor": "航海の誓いを高らかに。"
    },
    {
        "game": "カラオケ",
        "name": "嵐越え",
        "detail": "シングルでコンボ25以上",
        "gachaType": "gun",
        "questKey": "karaoke-single",
        "difficulty": 5,
        "flavor": "嵐を越える声を撃て。"
    },
    {
        "game": "カラオケ",
        "name": "鋼の響き",
        "detail": "シングルで抑揚80%以上",
        "gachaType": "metal",
        "questKey": "karaoke-single",
        "difficulty": 5,
        "flavor": "鋼の響きで耐え抜け。"
    },
    {
        "game": "カラオケ",
        "name": "覇者の歌",
        "detail": "シングルで95点以上",
        "gachaType": "sword",
        "questKey": "karaoke-single",
        "difficulty": 6,
        "flavor": "覇者の剣は歌で輝く。"
    },
    {
        "game": "カラオケ",
        "name": "疾風の一声",
        "detail": "シングルでコンボ40以上",
        "gachaType": "gun",
        "questKey": "karaoke-single",
        "difficulty": 6,
        "flavor": "疾風の一声で突き抜けろ。"
    },
    {
        "game": "カラオケ",
        "name": "極みの抑揚",
        "detail": "シングルで抑揚90%以上",
        "gachaType": "metal",
        "questKey": "karaoke-single",
        "difficulty": 6,
        "flavor": "極みの抑揚で王座を掴め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "対戦の合図",
        "detail": "1対1で採点結果を表示する",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "対戦の合図",
        "questKey": "karaoke-battle",
        "difficulty": 1,
        "flavor": "合図の一声で勝負を始めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "初戦の旋律",
        "detail": "1対1で65点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "初戦の旋律",
        "questKey": "karaoke-battle",
        "difficulty": 1,
        "flavor": "初戦の旋律で響きを示せ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "小波の連打",
        "detail": "1対1でコンボ5以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "小波連打",
        "questKey": "karaoke-battle",
        "difficulty": 1,
        "flavor": "小波の連打でテンポを掴め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "旗揚げコール",
        "detail": "1対1で75点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗揚げコール",
        "questKey": "karaoke-battle",
        "difficulty": 3,
        "flavor": "旗揚げの声で差をつけろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "共鳴の航路",
        "detail": "1対1でコンボ15以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "共鳴の航路",
        "questKey": "karaoke-battle",
        "difficulty": 3,
        "flavor": "共鳴の航路で勝負を進めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "安定の帆",
        "detail": "1対1で安定度75%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "安定の帆",
        "questKey": "karaoke-battle",
        "difficulty": 3,
        "flavor": "安定の帆で揺れを抑えよ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "双帆の旋律",
        "detail": "1対1で85点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "双帆の旋律",
        "questKey": "karaoke-battle",
        "difficulty": 5,
        "flavor": "双帆の旋律で差を広げろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "嵐越え",
        "detail": "1対1でコンボ30以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "嵐越え",
        "questKey": "karaoke-battle",
        "difficulty": 5,
        "flavor": "嵐越えの声で押し切れ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "響き合わせ",
        "detail": "1対1で抑揚85%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "響き合わせ",
        "questKey": "karaoke-battle",
        "difficulty": 5,
        "flavor": "響きを合わせて勝利を掴め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "覇者の合唱",
        "detail": "1対1で95点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "覇者の合唱",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "覇者の合唱で王座を奪え。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "勝鬨コンボ",
        "detail": "1対1でコンボ45以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "勝鬨コンボ",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "勝鬨の連打で勝負を決めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "極限抑揚",
        "detail": "1対1で抑揚95%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "極限抑揚",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "極限の抑揚で圧倒せよ。"
    },
    {
        "game": "ダーツ",
        "name": "風向き一投",
        "detail": "カウントアップで120点以上",
        "gachaType": "hat",
        "questKey": "darts-countup",
        "difficulty": 1,
        "flavor": "風向きの一投で始めよう。"
    },
    {
        "game": "ダーツ",
        "name": "海図の01",
        "detail": "01を1ゲーム完走（勝敗不問）",
        "gachaType": "leather",
        "questKey": "darts-01",
        "difficulty": 1,
        "flavor": "海図の航路を完走せよ。"
    },
    {
        "game": "ダーツ",
        "name": "初クローズ",
        "detail": "クリケットで任意ナンバー1つクローズ",
        "gachaType": "wand",
        "questKey": "darts-cricket",
        "difficulty": 1,
        "flavor": "初クローズで陣地を開け。"
    },
    {
        "game": "ダーツ",
        "name": "照準の一閃",
        "detail": "カウントアップで220点以上",
        "gachaType": "gun",
        "questKey": "darts-countup",
        "difficulty": 3,
        "flavor": "照準の一閃で点を刻め。"
    },
    {
        "game": "ダーツ",
        "name": "舵取りフィニッシュ",
        "detail": "01でダブルフィニッシュ成功",
        "gachaType": "polearm",
        "questKey": "darts-01",
        "difficulty": 3,
        "flavor": "舵取りの二重で決めろ。"
    },
    {
        "game": "ダーツ",
        "name": "陣地制圧",
        "detail": "クリケットで3クローズ達成",
        "gachaType": "shield",
        "questKey": "darts-cricket",
        "difficulty": 3,
        "flavor": "陣地制圧で守りを固めろ。"
    },
    {
        "game": "ダーツ",
        "name": "疾風連打",
        "detail": "カウントアップで320点以上",
        "gachaType": "axe",
        "questKey": "darts-countup",
        "difficulty": 5,
        "flavor": "疾風の連打で切り開け。"
    },
    {
        "game": "ダーツ",
        "name": "砲撃フィニッシュ",
        "detail": "01で15ラウンド以内にクリア",
        "gachaType": "sword",
        "questKey": "darts-01",
        "difficulty": 5,
        "flavor": "砲撃の速さで決着を。"
    },
    {
        "game": "ダーツ",
        "name": "防衛線",
        "detail": "クリケットで5クローズ達成",
        "gachaType": "metal",
        "questKey": "darts-cricket",
        "difficulty": 5,
        "flavor": "防衛線を敷いて守れ。"
    },
    {
        "game": "ダーツ",
        "name": "制圧の嵐",
        "detail": "カウントアップで450点以上",
        "gachaType": "gun",
        "questKey": "darts-countup",
        "difficulty": 6,
        "flavor": "制圧の嵐で主導権を奪え。"
    },
    {
        "game": "ダーツ",
        "name": "決戦フィニッシュ",
        "detail": "01で10ラウンド以内に勝利",
        "gachaType": "sword",
        "questKey": "darts-01",
        "difficulty": 6,
        "flavor": "決戦の一矢で決めろ。"
    },
    {
        "game": "ダーツ",
        "name": "完全封鎖",
        "detail": "クリケットで全クローズ達成",
        "gachaType": "metal",
        "questKey": "darts-cricket",
        "difficulty": 6,
        "flavor": "完全封鎖で勝利を固めろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "援護射撃",
        "detail": "1対1でカウントアップ180点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "援護射撃",
        "questKey": "darts-countup",
        "difficulty": 1,
        "flavor": "援護射撃で点を重ねろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "初戦フィニッシュ",
        "detail": "1対1で01勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "初戦フィニッシュ",
        "questKey": "darts-01",
        "difficulty": 1,
        "flavor": "初戦の一矢で勝利を掴め。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "陣地共有",
        "detail": "1対1でクリケット2クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "陣地共有",
        "questKey": "darts-cricket",
        "difficulty": 1,
        "flavor": "陣地を共有して押し切れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "旗印の連射",
        "detail": "1対1でカウントアップ260点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗印連射",
        "questKey": "darts-countup",
        "difficulty": 3,
        "flavor": "旗印の連射で優位を築け。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "包囲01",
        "detail": "1対1で01を15ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "包囲01",
        "questKey": "darts-01",
        "difficulty": 3,
        "flavor": "包囲陣形で早期決着を狙え。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "防衛ライン",
        "detail": "1対1でクリケット3クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "防衛ライン",
        "questKey": "darts-cricket",
        "difficulty": 3,
        "flavor": "防衛ラインを敷いて守れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "制圧の嵐",
        "detail": "1対1でカウントアップ360点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "制圧砲撃",
        "questKey": "darts-countup",
        "difficulty": 5,
        "flavor": "制圧の嵐で主導権を奪え。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "決戦フィニッシュ",
        "detail": "1対1で01を12ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決戦フィニッシュ",
        "questKey": "darts-01",
        "difficulty": 5,
        "flavor": "決戦の一矢で決めろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "完全封鎖",
        "detail": "1対1でクリケット5クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "完全封鎖",
        "questKey": "darts-cricket",
        "difficulty": 5,
        "flavor": "完全封鎖で勝利を固めろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "制圧の嵐・極",
        "detail": "1対1でカウントアップ500点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "制圧砲撃・極",
        "questKey": "darts-countup",
        "difficulty": 6,
        "flavor": "極限の制圧で突き放せ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "決戦フィニッシュ・極",
        "detail": "1対1で01を10ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決戦フィニッシュ・極",
        "questKey": "darts-01",
        "difficulty": 6,
        "flavor": "極限の決戦で勝利を掴め。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "完全封鎖・極",
        "detail": "1対1でクリケット全クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "完全封鎖・極",
        "questKey": "darts-cricket",
        "difficulty": 6,
        "flavor": "極限の封鎖で勝ち切れ。"
    },
    {
        "game": "トランプ",
        "name": "船乗りの手札",
        "detail": "ポーカーでワンペア以上を1回成立",
        "gachaType": "dagger",
        "questKey": "cards-poker",
        "difficulty": 1,
        "flavor": "船乗りの手札で勝負せよ。"
    },
    {
        "game": "トランプ",
        "name": "静かな勝負",
        "detail": "ブラックジャックで1勝",
        "gachaType": "shield",
        "questKey": "cards-blackjack",
        "difficulty": 1,
        "flavor": "静かな勝負で守り切れ。"
    },
    {
        "game": "トランプ",
        "name": "波間の一抜け",
        "detail": "大富豪で1回上がる",
        "gachaType": "blunt",
        "questKey": "cards-daifugo",
        "difficulty": 1,
        "flavor": "波間の一抜けで先手を取れ。"
    },
    {
        "game": "トランプ",
        "name": "旗揚げストレート",
        "detail": "ポーカーでストレート以上を1回成立",
        "gachaType": "polearm",
        "questKey": "cards-poker",
        "difficulty": 3,
        "flavor": "旗揚げの一列で勝負を決めろ。"
    },
    {
        "game": "トランプ",
        "name": "21の一撃",
        "detail": "ブラックジャックで21を1回達成",
        "gachaType": "gun",
        "questKey": "cards-blackjack",
        "difficulty": 3,
        "flavor": "一撃の21で決めろ。"
    },
    {
        "game": "トランプ",
        "name": "連勝の航路",
        "detail": "大富豪で連勝2回",
        "gachaType": "axe",
        "questKey": "cards-daifugo",
        "difficulty": 3,
        "flavor": "連勝の航路で押し切れ。"
    },
    {
        "game": "トランプ",
        "name": "王手のフルハウス",
        "detail": "ポーカーでフルハウス以上を1回成立",
        "gachaType": "sword",
        "questKey": "cards-poker",
        "difficulty": 5,
        "flavor": "王手の剣で勝負を終えよ。"
    },
    {
        "game": "トランプ",
        "name": "守護の連勝",
        "detail": "ブラックジャックで2連勝",
        "gachaType": "metal",
        "questKey": "cards-blackjack",
        "difficulty": 5,
        "flavor": "守護の連勝で相手を封じろ。"
    },
    {
        "game": "トランプ",
        "name": "覇権の大富豪",
        "detail": "大富豪で1位を2回",
        "gachaType": "staff",
        "questKey": "cards-daifugo",
        "difficulty": 5,
        "flavor": "覇権の席を譲るな。"
    },
    {
        "game": "トランプ",
        "name": "王手の四枚",
        "detail": "ポーカーでフォーカード以上を1回成立",
        "gachaType": "sword",
        "questKey": "cards-poker",
        "difficulty": 6,
        "flavor": "王手の四枚で決着をつけろ。"
    },
    {
        "game": "トランプ",
        "name": "覇者の連勝",
        "detail": "ブラックジャックで3連勝",
        "gachaType": "metal",
        "questKey": "cards-blackjack",
        "difficulty": 6,
        "flavor": "覇者の連勝で勝ち切れ。"
    },
    {
        "game": "トランプ",
        "name": "覇権の戴冠",
        "detail": "大富豪で1位を3回",
        "gachaType": "staff",
        "questKey": "cards-daifugo",
        "difficulty": 6,
        "flavor": "覇権の戴冠で栄冠を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘のワンペア",
        "detail": "1対1ポーカーでワンペア以上を1回成立",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "決闘の札読み",
        "questKey": "cards-poker",
        "difficulty": 1,
        "flavor": "決闘の札読みで先手を取れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "護衛BJ",
        "detail": "1対1ブラックジャックで1勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "護衛の構え",
        "questKey": "cards-blackjack",
        "difficulty": 1,
        "flavor": "護衛の構えで勝利を守れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘上がり",
        "detail": "1対1大富豪で1回上がり",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決闘上がり",
        "questKey": "cards-daifugo",
        "difficulty": 1,
        "flavor": "決闘の上がりで先手を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "隊列ストレート",
        "detail": "1対1ポーカーでストレート以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "隊列整列",
        "questKey": "cards-poker",
        "difficulty": 3,
        "flavor": "隊列を揃えて札を並べろ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "艦隊21",
        "detail": "1対1ブラックジャックで21を1回達成",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "艦隊の強運",
        "questKey": "cards-blackjack",
        "difficulty": 3,
        "flavor": "艦隊の強運で21を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "連携大富豪",
        "detail": "1対1大富豪で1位を1回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "連携突撃",
        "questKey": "cards-daifugo",
        "difficulty": 3,
        "flavor": "一対一の上がりで優位を取れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "王手のフルハウス",
        "detail": "1対1ポーカーでフルハウス以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "王手号令",
        "questKey": "cards-poker",
        "difficulty": 5,
        "flavor": "王手の号令で締めくくれ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "逆転ブラックジャック",
        "detail": "1対1ブラックジャックで2連勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "逆転手",
        "questKey": "cards-blackjack",
        "difficulty": 5,
        "flavor": "逆転手で連勝を刻め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇権の上がり",
        "detail": "1対1大富豪で1位を2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "覇権掌握",
        "questKey": "cards-daifugo",
        "difficulty": 5,
        "flavor": "覇権の上がりで差を広げよ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "王手の四枚",
        "detail": "1対1ポーカーでフォーカード以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "王手の四枚",
        "questKey": "cards-poker",
        "difficulty": 6,
        "flavor": "王手の四枚で決着をつけろ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇者の連勝",
        "detail": "1対1ブラックジャックで3連勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "覇者の連勝",
        "questKey": "cards-blackjack",
        "difficulty": 6,
        "flavor": "覇者の連勝で勝ち切れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇権の戴冠",
        "detail": "1対1大富豪で1位を3回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "覇権の戴冠",
        "questKey": "cards-daifugo",
        "difficulty": 6,
        "flavor": "覇権の戴冠で栄冠を掴め。"
    },
    {
        "game": "その他",
        "name": "港の演習",
        "detail": "ボードゲームを1回プレイ",
        "gachaType": "hat",
        "questKey": "other-board",
        "difficulty": 1,
        "flavor": "港で演習をこなせ。"
    },
    {
        "game": "その他",
        "name": "小舟の冒険",
        "detail": "ミニゲームを1回クリア",
        "gachaType": "dagger",
        "questKey": "other-mini",
        "difficulty": 1,
        "flavor": "小舟の冒険で腕を磨け。"
    },
    {
        "game": "その他",
        "name": "黒ひげの試し",
        "detail": "黒ひげでセーフを1回出す",
        "gachaType": "leather",
        "questKey": "other-kurohige",
        "difficulty": 1,
        "flavor": "黒ひげの試しを乗り越えよ。"
    },
    {
        "game": "その他",
        "name": "防衛の勝利",
        "detail": "ボードゲームで1勝",
        "gachaType": "shield",
        "questKey": "other-board",
        "difficulty": 3,
        "flavor": "防衛の勝利で士気を上げろ。"
    },
    {
        "game": "その他",
        "name": "潮流突破",
        "detail": "ミニゲームで時間内クリア",
        "gachaType": "polearm",
        "questKey": "other-mini",
        "difficulty": 3,
        "flavor": "潮流を突破して進め。"
    },
    {
        "game": "その他",
        "name": "綱渡り",
        "detail": "黒ひげで連続セーフ2回",
        "gachaType": "blunt",
        "questKey": "other-kurohige",
        "difficulty": 3,
        "flavor": "綱渡りの集中で乗り切れ。"
    },
    {
        "game": "その他",
        "name": "大海防衛線",
        "detail": "ボードゲームで連勝2回",
        "gachaType": "sword",
        "questKey": "other-board",
        "difficulty": 5,
        "flavor": "大海防衛線で押し切れ。"
    },
    {
        "game": "その他",
        "name": "疾風の航路",
        "detail": "ミニゲームでノーダメージクリア",
        "gachaType": "gun",
        "questKey": "other-mini",
        "difficulty": 5,
        "flavor": "疾風の航路で無傷を狙え。"
    },
    {
        "game": "その他",
        "name": "黒旗の運命",
        "detail": "黒ひげで連続セーフ3回",
        "gachaType": "metal",
        "questKey": "other-kurohige",
        "difficulty": 5,
        "flavor": "黒旗の運命を味方にせよ。"
    },
    {
        "game": "その他",
        "name": "大海防衛線・極",
        "detail": "ボードゲームで完全勝利",
        "gachaType": "sword",
        "questKey": "other-board",
        "difficulty": 6,
        "flavor": "完全勝利で防衛線を守り切れ。"
    },
    {
        "game": "その他",
        "name": "疾風の航路・極",
        "detail": "ミニゲームで連続パーフェクト2回",
        "gachaType": "gun",
        "questKey": "other-mini",
        "difficulty": 6,
        "flavor": "疾風の航路で完璧を刻め。"
    },
    {
        "game": "その他",
        "name": "黒旗の運命・極",
        "detail": "黒ひげでセーフのみで勝利",
        "gachaType": "metal",
        "questKey": "other-kurohige",
        "difficulty": 6,
        "flavor": "黒旗の運命を味方にせよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "協力防衛",
        "detail": "1対1でボードゲームを1回プレイ",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "防衛構え",
        "questKey": "other-board",
        "difficulty": 1,
        "flavor": "1対1の演習で準備を整えよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "連携小舟",
        "detail": "1対1でミニゲームを1回クリア",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "小舟支援",
        "questKey": "other-mini",
        "difficulty": 1,
        "flavor": "小舟支援で先に進め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ援護",
        "detail": "1対1で黒ひげセーフ1回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "援護板",
        "questKey": "other-kurohige",
        "difficulty": 1,
        "flavor": "援護板で危機を避けろ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "港湾迎撃",
        "detail": "1対1でボードゲームに勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "迎撃隊形",
        "questKey": "other-board",
        "difficulty": 3,
        "flavor": "港湾迎撃で勝利を掴め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "潮流突破",
        "detail": "1対1でミニゲーム時間内クリア",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "潮流突破",
        "questKey": "other-mini",
        "difficulty": 3,
        "flavor": "潮流突破で進路を確保せよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ包囲",
        "detail": "1対1で黒ひげ連続セーフ2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "包囲網",
        "questKey": "other-kurohige",
        "difficulty": 3,
        "flavor": "包囲網で黒ひげを攻略せよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "大海防衛線",
        "detail": "1対1でボードゲーム連勝2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "防衛線強化",
        "questKey": "other-board",
        "difficulty": 5,
        "flavor": "防衛線を強化して勝ち切れ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "疾風連携",
        "detail": "1対1でミニゲームノーダメージクリア",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "疾風連携",
        "questKey": "other-mini",
        "difficulty": 5,
        "flavor": "疾風連携で無傷を狙え。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒旗の運命",
        "detail": "1対1で黒ひげ連続セーフ3回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の運命",
        "questKey": "other-kurohige",
        "difficulty": 5,
        "flavor": "黒旗の運命を味方にせよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "大海防衛線・極",
        "detail": "1対1でボードゲーム完全勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "防衛線強化・極",
        "questKey": "other-board",
        "difficulty": 6,
        "flavor": "完全勝利で海を守り切れ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "疾風連携・極",
        "detail": "1対1でミニゲーム連続パーフェクト2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "疾風連携・極",
        "questKey": "other-mini",
        "difficulty": 6,
        "flavor": "疾風連携で完璧を刻め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒旗の運命・極",
        "detail": "1対1で黒ひげセーフのみで勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の運命・極",
        "questKey": "other-kurohige",
        "difficulty": 6,
        "flavor": "黒旗の運命で勝利を掴め。"
    }
];

const TROY_GAME_KEYS = {
    ビリヤード: 'billiard',
    カラオケ: 'karaoke',
    ダーツ: 'darts',
    トランプ: 'cards',
    その他: 'other'
};

const TROY_GAME_ORDER = ['ビリヤード', 'カラオケ', 'ダーツ', 'トランプ', 'その他'];
const QUEST_MODE_ORDER = ['solo', 'battle'];
function normalizeQuestDifficultyValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(value)));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (DIFFICULTY_ALIASES[trimmed]) {
            return DIFFICULTY_ALIASES[trimmed];
        }
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(numeric)));
        }
    }
    return DIFFICULTY_FALLBACK;
}

function getQuestDifficultyTierIndex(difficulty) {
    if (difficulty <= 2) return 0;
    if (difficulty <= 4) return 1;
    return 2;
}

function getQuestDifficultyTierKey(difficulty) {
    const index = getQuestDifficultyTierIndex(difficulty);
    return ['easy', 'normal', 'hard'][index] || 'normal';
}

function compareByOrder(value, order) {
    const index = order.indexOf(value);
    return index === -1 ? order.length : index;
}

function sortTroyQuests(list) {
    list.sort((a, b) => {
        const gameDiff = compareByOrder(a.game, TROY_GAME_ORDER) - compareByOrder(b.game, TROY_GAME_ORDER);
        if (gameDiff !== 0) return gameDiff;
        const modeDiff = compareByOrder(a.mode || 'solo', QUEST_MODE_ORDER) - compareByOrder(b.mode || 'solo', QUEST_MODE_ORDER);
        if (modeDiff !== 0) return modeDiff;
        const difficultyDiff = normalizeQuestDifficultyValue(a.difficulty) - normalizeQuestDifficultyValue(b.difficulty);
        if (difficultyDiff !== 0) return difficultyDiff;
        return (a.name || '').localeCompare(b.name || '', 'ja');
    });
}

function buildQuestId(quest, gameKey) {
    const key = quest.questKey || 'quest';
    const name = quest.name || 'quest';
    return encodeURIComponent(`${gameKey}-${key}-${name}`);
}

function assignQuestMeta(list) {
    list.forEach((quest) => {
        const gameKey = TROY_GAME_KEYS[quest.game] || 'other';
        quest.gameKey = quest.gameKey || gameKey;
        quest.mode = quest.mode || 'solo';
        quest.difficulty = normalizeQuestDifficultyValue(quest.difficulty);
        const tier =
            quest.tier ||
            (quest.difficulty <= 2 ? 'beginner' : quest.difficulty <= 4 ? 'intermediate' : 'advanced');
        quest.tier = tier;
        quest.questId = quest.questId || buildQuestId(quest, quest.gameKey || gameKey);
    });
}

sortTroyQuests(TROY_QUESTS);
assignQuestMeta(TROY_QUESTS);

function normalizeQuestBetAmount(value) {
    const amount = Math.floor(Number(value) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return QUEST_BET_OPTIONS[0];
    const allowed = QUEST_BET_OPTIONS.includes(amount) ? amount : QUEST_BET_OPTIONS[0];
    return Math.min(allowed, QUEST_BET_MAX);
}

function getQuestBetTier(amount) {
    if (amount >= QUEST_BET_THRESHOLDS.bonus2) return 2;
    if (amount >= QUEST_BET_THRESHOLDS.bonus1) return 1;
    return 0;
}

function getQuestRewardTierIndex(difficulty, betAmount) {
    const normalized = normalizeQuestDifficultyValue(difficulty);
    const baseTier = getQuestDifficultyTierIndex(normalized);
    return Math.min(2, baseTier + getQuestBetTier(betAmount));
}

function getQuestRewardTierKey(difficulty, betAmount) {
    const key = ['common', 'rare', 'epic'][getQuestRewardTierIndex(difficulty, betAmount)];
    return key || 'common';
}

function getQuestRewardTierLabel(difficulty, betAmount) {
    const index = getQuestRewardTierIndex(difficulty, betAmount);
    return QUEST_REWARD_TIERS[index] || QUEST_REWARD_TIERS[0];
}

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

function updateQuestBetControls() {
    const input = document.getElementById('troyQuestBetInput');
    if (input && document.activeElement !== input) {
        input.value = String(_questBetAmount);
    }
    const buttons = document.querySelectorAll('.troy-quest-bet-btn');
    buttons.forEach((button) => {
        const value = Number(button.dataset.bet || 0);
        button.classList.toggle('is-active', value === _questBetAmount);
    });
}

function setQuestBetAmount(value) {
    _questBetAmount = normalizeQuestBetAmount(value);
    updateQuestBetControls();
    if (_lastQuestList.length) {
        renderQuestList(_lastQuestList);
    }
}

function getQuestSelectionStorageKey(playFabId) {
    return `troyQuestSelection:${playFabId}`;
}

function loadQuestSelections(playFabId) {
    if (!playFabId) {
        _questSelections = {};
        return;
    }
    try {
        const raw = localStorage.getItem(getQuestSelectionStorageKey(playFabId));
        _questSelections = raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('[TroyQuest] Failed to load selections:', error);
        _questSelections = {};
    }
}

function saveQuestSelections(playFabId) {
    if (!playFabId) return;
    try {
        localStorage.setItem(getQuestSelectionStorageKey(playFabId), JSON.stringify(_questSelections));
    } catch (error) {
        console.warn('[TroyQuest] Failed to save selections:', error);
    }
}

function getQuestSelection(questId) {
    const selection = _questSelections[questId];
    if (!selection) return null;
    const elapsed = Date.now() - selection.selectedAt;
    if (elapsed > QUEST_SELECTION_TTL_MS) {
        delete _questSelections[questId];
        return null;
    }
    return selection;
}

function clearExpiredQuestSelections() {
    let changed = false;
    Object.keys(_questSelections).forEach((questId) => {
        const selection = _questSelections[questId];
        if (!selection) return;
        const elapsed = Date.now() - selection.selectedAt;
        if (elapsed > QUEST_SELECTION_TTL_MS) {
            delete _questSelections[questId];
            changed = true;
        }
    });
    return changed;
}

function scheduleQuestSelectionRefresh() {
    if (_questSelectionTimer) {
        clearTimeout(_questSelectionTimer);
        _questSelectionTimer = null;
    }
    const timestamps = Object.values(_questSelections)
        .map((selection) => selection?.selectedAt)
        .filter((value) => typeof value === 'number');
    if (!timestamps.length) return;
    const nextExpiry = Math.min(...timestamps.map((ts) => ts + QUEST_SELECTION_TTL_MS));
    const delay = Math.max(1000, nextExpiry - Date.now());
    _questSelectionTimer = setTimeout(() => {
        const changed = clearExpiredQuestSelections();
        if (changed) {
            saveQuestSelections(window.myPlayFabId);
            if (_lastQuestList.length) {
                renderQuestList(_lastQuestList);
            }
        }
        scheduleQuestSelectionRefresh();
    }, delay);
}

function isQuestCleared(questId) {
    return !!_questClears[questId];
}

function resolveQuestDifficulty(quest) {
    return normalizeQuestDifficultyValue(quest?.difficulty);
}

function getQuestDifficultyStars(difficultyValue) {
    const count = normalizeQuestDifficultyValue(difficultyValue);
    return '★'.repeat(count);
}

async function refreshQuestClears(playFabId) {
    if (!playFabId) return;
    try {
        const result = await getTroyQuestClears(playFabId, { isSilent: true });
        _questClears = result?.clears && typeof result.clears === 'object' ? result.clears : {};
    } catch (error) {
        console.warn('[TroyQuest] Failed to load quest clears:', error);
        _questClears = {};
    }
}

function getMenuModalElements() {
    return {
        modal: document.getElementById('troyMenuModal'),
        title: document.getElementById('troyMenuModalTitle'),
        list: document.getElementById('troyMenuModalList'),
        close: document.getElementById('troyMenuModalClose')
    };
}

function openMenuModal(menuId) {
    const data = TROY_PRODUCT_MENUS[menuId];
    if (!data) return;
    const { modal, title, list } = getMenuModalElements();
    if (!modal || !list) return;
    if (title) title.textContent = data.title;
    list.innerHTML = '';
    data.items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'troy-menu-modal-item';
        const name = document.createElement('span');
        name.textContent = item.name;
        const price = document.createElement('span');
        price.className = 'troy-menu-modal-price';
        price.textContent = item.price;
        row.appendChild(name);
        row.appendChild(price);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function closeMenuModal() {
    const { modal } = getMenuModalElements();
    if (modal) modal.style.display = 'none';
}

function wireMenuPopups() {
    if (_menuWired) return;
    _menuWired = true;
    const { modal, close } = getMenuModalElements();
    if (close) {
        close.addEventListener('click', closeMenuModal);
    }
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeMenuModal();
        });
    }
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
            openMenuModal(button.dataset.menuId);
        });
    });
}

function isTierUnlocked(quests, tier) {
    if (tier === 'beginner') return true;
    if (tier === 'intermediate') {
        const beginner = quests.filter((quest) => quest.tier === 'beginner');
        return beginner.length > 0 && beginner.every((quest) => isQuestCleared(quest.questId));
    }
    if (tier === 'advanced') {
        const intermediate = quests.filter((quest) => quest.tier === 'intermediate');
        return intermediate.length > 0 && intermediate.every((quest) => isQuestCleared(quest.questId));
    }
    return false;
}

function buildQuestSections(quests) {
    const sections = [];
    QUEST_TIER_ORDER.forEach((tier) => {
        const tierQuests = quests.filter((quest) => quest.tier === tier);
        if (!tierQuests.length) return;
        if (!isTierUnlocked(quests, tier)) return;
        sections.push({
            tier,
            label: QUEST_TIER_LABELS[tier] || tier,
            quests: tierQuests
        });
    });
    return sections;
}

function renderQuestList(list) {
    const container = document.getElementById('troyQuestList');
    if (!container) return;
    container.innerHTML = '';
    const quests = Array.isArray(list) ? list : [];
    _lastQuestList = quests;
    const expired = clearExpiredQuestSelections();
    if (expired) {
        saveQuestSelections(window.myPlayFabId);
    }
    const sections = buildQuestSections(quests);
    if (!sections.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-quest-empty';
        empty.textContent = 'クエストがありません';
        container.appendChild(empty);
        return;
    }

    sections.forEach((section) => {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'troy-quest-section';
        sectionHeader.textContent = section.label;
        container.appendChild(sectionHeader);
        section.quests.forEach((quest, index) => {
            const card = document.createElement('div');
            card.className = 'troy-quest-card is-animated';
            card.dataset.gachaType = quest.gachaType;
            card.style.animationDelay = `${index * 40}ms`;

        const game = document.createElement('div');
        game.className = 'troy-quest-game';
        game.textContent = quest.game;

        const difficulty = document.createElement('div');
        const difficultyValue = resolveQuestDifficulty(quest);
        const difficultyTierKey = getQuestDifficultyTierKey(difficultyValue);
        difficulty.className = `troy-quest-difficulty troy-quest-difficulty-${difficultyTierKey}`;
        difficulty.textContent = `難易度: ${getQuestDifficultyStars(difficultyValue)}`;

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
        const isBattleMode = quest.mode === 'battle' || quest.gachaType === 'skill';
        if (isBattleMode) {
            const skillKind = quest.skillType === 'weapon' ? '武器固定スキル' : 'パッシブスキル';
            const skillName = quest.skillName || '未設定スキル';
            gacha.textContent = `報酬: ${skillKind}『${skillName}』`;
        } else {
            const label = TROY_GACHA_LABELS[quest.gachaType] || quest.gachaType;
            gacha.textContent = `報酬: ${label}`;
        }

        let rewardTier = null;
        if (!isBattleMode) {
            const rewardTierKey = getQuestRewardTierKey(difficultyValue, _questBetAmount);
            const rewardTierLabel = getQuestRewardTierLabel(difficultyValue, _questBetAmount);
            rewardTier = document.createElement('div');
            rewardTier.className = `troy-quest-reward-tier troy-quest-reward-tier-${rewardTierKey}`;
            rewardTier.textContent = `ランク: ${rewardTierLabel}`;
        }

        const actions = document.createElement('div');
        actions.className = 'troy-quest-actions';

        const selection = getQuestSelection(quest.questId);
        const qrBtn = document.createElement('button');
        qrBtn.className = 'troy-quest-qr';
        qrBtn.textContent = selection ? '承認QR' : '選択';
        if (selection) {
            qrBtn.addEventListener('click', () => requestQuestClaim(quest, selection.betAmount));
        } else {
            qrBtn.addEventListener('click', () => selectQuest(quest));
        }

        actions.appendChild(qrBtn);
        card.appendChild(meta);
        card.appendChild(name);
        card.appendChild(detail);
        if (quest.flavor) {
            card.appendChild(flavor);
        }
        card.appendChild(gacha);
        if (rewardTier) {
            card.appendChild(rewardTier);
        }
        card.appendChild(actions);
        container.appendChild(card);
        });
    });
}

function openQuestQrModal(quest, qrValue, expiresAt) {
    const modal = document.getElementById('troyQuestQrModal');
    const canvas = document.getElementById('troyQuestQrCanvas');
    const title = document.getElementById('troyQuestQrTitle');
    const expires = document.getElementById('troyQuestQrExpires');
    if (!modal || !canvas) return;
    if (title) title.textContent = '未選択';
    if (expires) {
        expires.textContent = expiresAt ? new Date(expiresAt).toLocaleString('ja-JP') : '';
    }
    if (typeof window.QRious === 'function') {
        new window.QRious({
            element: canvas,
            value: qrValue,
            size: 190
        });
    }
    modal.style.display = 'flex';
}

function closeQuestQrModal() {
    const modal = document.getElementById('troyQuestQrModal');
    if (modal) modal.style.display = 'none';
}

async function selectQuest(quest) {
    const playFabId = window.myPlayFabId;
    if (!playFabId) {
        if (window.showRpgMessage) window.showRpgMessage('プレイヤーIDがありません');
        return;
    }
    const betAmount = normalizeQuestBetAmount(_questBetAmount);
    const ok = window.confirm(`BET ${betAmount}PS を消費して「${quest.name}」を選択しますか？`);
    if (!ok) return;
    try {
        await usePoints(playFabId, betAmount, { isSilent: true });
        _questSelections[quest.questId] = {
            selectedAt: Date.now(),
            betAmount
        };
        saveQuestSelections(playFabId);
        scheduleQuestSelectionRefresh();
        if (_lastQuestList.length) {
            renderQuestList(_lastQuestList);
        }
        if (window.showRpgMessage) window.showRpgMessage(`BET ${betAmount}PS を消費しました。`);
    } catch (error) {
        console.error('[TroyQuest] bet failed:', error);
        if (window.showRpgMessage) {
            window.showRpgMessage(error?.error || 'ポイントが不足しています。');
        }
    }
}

async function requestQuestClaim(quest, betAmountOverride) {
    const playFabId = window.myPlayFabId;
    if (!playFabId) {
        if (window.showRpgMessage) window.showRpgMessage('プレイヤーIDがありません');
        return;
    }
    const betAmount = normalizeQuestBetAmount(betAmountOverride ?? _questBetAmount);
    try {
        const result = await claimTroyQuest(playFabId, quest.questId, quest.gameKey, quest.gachaType, {
            difficulty: resolveQuestDifficulty(quest),
            betAmount
        });
        if (!result?.qrValue) {
            if (window.showRpgMessage) window.showRpgMessage(result?.error || '承認QRの生成に失敗しました');
            return;
        }
        openQuestQrModal(quest, result.qrValue, result.expiresAt);
    } catch (error) {
        console.error('[TroyQuest] claim failed:', error);
        if (window.showRpgMessage) window.showRpgMessage('承認QRの生成に失敗しました');
    }
}

function getQuestModeLabel(mode) {
    return QUEST_MODE_LABELS[mode] || QUEST_MODE_LABELS.solo;
}

function buildQuestFilterLabel(label) {
    return `クエスト一覧: ${label} / ${getQuestModeLabel(_questMode)}`;
}

function updateQuestFilterLabel(label) {
    const filter = document.getElementById('troyQuestFilter');
    if (filter) {
        filter.textContent = buildQuestFilterLabel(label);
    }
}

function updateQuestModeButtons() {
    const buttons = Array.from(document.querySelectorAll('.troy-menu-toggle-btn[data-quest-mode]'));
    buttons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.questMode === _questMode);
    });
}

function getQuestsForGame(gameKey) {
    return TROY_QUESTS.filter((quest) => quest.gameKey === gameKey && quest.mode === _questMode);
}

function setQuestMode(mode) {
    const next = QUEST_MODE_LABELS[mode] ? mode : 'solo';
    if (_questMode === next) return;
    _questMode = next;
    updateQuestModeButtons();
    if (_activeQuestGameKey) {
        const filtered = getQuestsForGame(_activeQuestGameKey);
        updateQuestFilterLabel(_activeQuestGameLabel);
        renderQuestList(filtered);
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
    _activeQuestGameKey = '';
    _activeQuestGameLabel = '未選択';
    updateQuestFilterLabel('未選択');
    renderQuestList([]);
    items.forEach((node) => node.classList.remove('is-active'));
}

function wireQuestFilters() {
    if (_questWired) return;
    _questWired = true;
    const questItems = Array.from(document.querySelectorAll('.troy-menu-items li[data-game-key]'));
    const modeButtons = Array.from(document.querySelectorAll('.troy-menu-toggle-btn[data-quest-mode]'));
    const { panel, title, close } = getQuestPanelElements();
    loadQuestSelections(window.myPlayFabId);
    clearExpiredQuestSelections();
    scheduleQuestSelectionRefresh();
    if (close) {
        close.addEventListener('click', () => closeQuestPanel(questItems));
    }
    const qrClose = document.getElementById('troyQuestQrClose');
    if (qrClose) {
        qrClose.addEventListener('click', closeQuestQrModal);
    }
    const betInput = document.getElementById('troyQuestBetInput');
    const betButtons = Array.from(document.querySelectorAll('.troy-quest-bet-btn'));
    if (betInput) {
        betInput.addEventListener('change', () => setQuestBetAmount(betInput.value));
        betInput.addEventListener('blur', () => setQuestBetAmount(betInput.value));
    }
    betButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setQuestBetAmount(button.dataset.bet || 0);
        });
    });
    modeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setQuestMode(button.dataset.questMode);
        });
    });
    updateQuestBetControls();
    updateQuestModeButtons();
    if (!questItems.length) return;
    questItems.forEach((item) => {
        item.classList.add('troy-quest-item');
        item.addEventListener('click', async () => {
            const key = item.dataset.gameKey;
            const label = item.textContent.trim();
            _activeQuestGameKey = key;
            _activeQuestGameLabel = label;
            const filtered = getQuestsForGame(key);
            questItems.forEach((node) => node.classList.toggle('is-active', node === item));
            if (panel) panel.classList.add('active');
            if (title) title.textContent = label;
            updateQuestFilterLabel(label);
            await refreshQuestClears(window.myPlayFabId);
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
    wireMenuPopups();
    wireQuestFilters();
    updateQuestFilterLabel('クエスト一覧: 未選択');
    await refreshQuestClears(playFabId);
    renderQuestList([]);
    await refreshStatus(playFabId);
    startPolling(playFabId);
}
