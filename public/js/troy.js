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
            "name": "初球の航路",
            "detail": "9ボールで1球以上入れる",
            "gachaType": "hat",
            "questKey": "billiard-9",
            "difficulty": 2,
            "flavor": "まずは航路を開け。"
        },
    {
            "game": "ビリヤード",
            "name": "港の一打",
            "detail": "8ボールで1球以上入れる",
            "gachaType": "blunt",
            "questKey": "billiard-8",
            "difficulty": 2,
            "flavor": "港で一打、流れを掴め。"
        },
    {
            "game": "ビリヤード",
            "name": "見張りの護り",
            "detail": "ボーラードで1フレーム完走（勝敗不問）",
            "gachaType": "leather",
            "questKey": "billiard-bowrad",
            "difficulty": 2,
            "flavor": "見張りの任務は完走から。"
        },
    {
            "game": "ビリヤード",
            "name": "舵の勝利",
            "detail": "9ボールで1勝する",
            "gachaType": "polearm",
            "questKey": "billiard-9",
            "difficulty": 4,
            "flavor": "舵を握り勝利へ導け。"
        },
    {
            "game": "ビリヤード",
            "name": "黒旗ブレイク",
            "detail": "8ボールでブレイク成功",
            "gachaType": "axe",
            "questKey": "billiard-8",
            "difficulty": 4,
            "flavor": "黒旗の一撃で流れを割れ。"
        },
    {
            "game": "ビリヤード",
            "name": "静かな連続",
            "detail": "ボーラードで2フレーム連続で得点する",
            "gachaType": "wand",
            "questKey": "billiard-bowrad",
            "difficulty": 4,
            "flavor": "静けさの中で連続を刻め。"
        },
    {
            "game": "ビリヤード",
            "name": "狙撃の締め",
            "detail": "9ボールでノーミス勝利",
            "gachaType": "gun",
            "questKey": "billiard-9",
            "difficulty": 6,
            "flavor": "狙撃の精度で締めくくれ。"
        },
    {
            "game": "ビリヤード",
            "name": "鋼の逆転",
            "detail": "8ボールで残り2球から逆転勝利",
            "gachaType": "metal",
            "questKey": "billiard-8",
            "difficulty": 6,
            "flavor": "鋼の胆力で逆転を奪え。"
        },
    {
            "game": "ビリヤード",
            "name": "剣の連鎖",
            "detail": "ボーラードで120点以上",
            "gachaType": "sword",
            "questKey": "billiard-bowrad",
            "difficulty": 6,
            "flavor": "剣の連鎖で点を積め。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "連携ブレイク",
            "detail": "9ボールでチームがブレイク成功を1回達成",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "連携ブレイク",
            "questKey": "billiard-9",
            "difficulty": 2,
            "flavor": "合図を揃えて戦端を開け。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "合図の連続",
            "detail": "9ボールでチーム連続ポケット2回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "連携射撃",
            "questKey": "billiard-9",
            "difficulty": 2,
            "flavor": "合図の一撃で連続を決めろ。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "護りの帆",
            "detail": "ボーラードをチームで1フレーム完走",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "防衛連携",
            "questKey": "billiard-bowrad",
            "difficulty": 2,
            "flavor": "守りの帆で陣形を保て。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "旗艦の勝利",
            "detail": "9ボールでチーム勝利",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "旗艦号令",
            "questKey": "billiard-9",
            "difficulty": 4,
            "flavor": "旗艦の号令で勝利を掴め。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "包囲の8番",
            "detail": "8ボールでチーム勝利",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "包囲突破",
            "questKey": "billiard-8",
            "difficulty": 4,
            "flavor": "包囲網を破り8番を沈めよ。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "波間の積算",
            "detail": "ボーラードでチーム合計100点以上",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "集中加速",
            "questKey": "billiard-bowrad",
            "difficulty": 4,
            "flavor": "波間の積算で優位を築け。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "沈黙の掃討",
            "detail": "9ボールでチームノーミス勝利",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "一斉射撃",
            "questKey": "billiard-9",
            "difficulty": 6,
            "flavor": "沈黙の掃討で敵を沈めろ。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "逆転の同盟",
            "detail": "8ボールで残り2球から逆転勝利",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "逆転旗印",
            "questKey": "billiard-8",
            "difficulty": 6,
            "flavor": "同盟の力で逆転を掴め。"
        },
    {
            "game": "ビリヤード",
            "mode": "battle",
            "name": "精密隊列",
            "detail": "ボーラードでチーム合計140点以上",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "精密陣形",
            "questKey": "billiard-bowrad",
            "difficulty": 6,
            "flavor": "精密な隊列で点を稼げ。"
        },
    {
            "game": "カラオケ",
            "name": "潮騒の一曲",
            "detail": "シングルで歌い切る（完走）",
            "gachaType": "hat",
            "questKey": "karaoke-single",
            "difficulty": 2,
            "flavor": "潮騒に合わせて歌い切れ。"
        },
    {
            "game": "カラオケ",
            "name": "甲板の合図",
            "detail": "シングルで採点結果を表示する",
            "gachaType": "leather",
            "questKey": "karaoke-single",
            "difficulty": 2,
            "flavor": "甲板で合図を出すように歌え。"
        },
    {
            "game": "カラオケ",
            "name": "波乗りの声",
            "detail": "シングルで70点以上",
            "gachaType": "wand",
            "questKey": "karaoke-single",
            "difficulty": 2,
            "flavor": "波に乗る声を響かせろ。"
        },
    {
            "game": "カラオケ",
            "name": "帆走のリズム",
            "detail": "シングルで80点以上",
            "gachaType": "polearm",
            "questKey": "karaoke-single",
            "difficulty": 4,
            "flavor": "帆走のリズムを揃えよ。"
        },
    {
            "game": "カラオケ",
            "name": "航海のコンボ",
            "detail": "シングルでコンボ10以上",
            "gachaType": "dagger",
            "questKey": "karaoke-single",
            "difficulty": 4,
            "flavor": "連続の刃で航海を進め。"
        },
    {
            "game": "カラオケ",
            "name": "灯台の高音",
            "detail": "シングルで抑揚70%以上",
            "gachaType": "staff",
            "questKey": "karaoke-single",
            "difficulty": 4,
            "flavor": "灯台の高音で道を照らせ。"
        },
    {
            "game": "カラオケ",
            "name": "覇者の歌",
            "detail": "シングルで90点以上",
            "gachaType": "sword",
            "questKey": "karaoke-single",
            "difficulty": 6,
            "flavor": "覇者の剣は歌で輝く。"
        },
    {
            "game": "カラオケ",
            "name": "嵐越え",
            "detail": "シングルでコンボ30以上",
            "gachaType": "gun",
            "questKey": "karaoke-single",
            "difficulty": 6,
            "flavor": "嵐を越える声を撃て。"
        },
    {
            "game": "カラオケ",
            "name": "鋼のビブラート",
            "detail": "シングルでロングトーン成功3回",
            "gachaType": "metal",
            "questKey": "karaoke-single",
            "difficulty": 6,
            "flavor": "鋼のビブラートで耐え抜け。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "合唱の帆",
            "detail": "デュエットで完走する",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "合唱支援",
            "questKey": "karaoke-duet",
            "difficulty": 2,
            "flavor": "帆を揃えて合唱せよ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "掛け声一斉",
            "detail": "デュエットで採点結果を表示する",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "コール強化",
            "questKey": "karaoke-duet",
            "difficulty": 2,
            "flavor": "掛け声で波を揃えろ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "揃う波",
            "detail": "デュエットで70点以上",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "調律パッシブ",
            "questKey": "karaoke-duet",
            "difficulty": 2,
            "flavor": "揃う波で調律せよ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "双帆の旋律",
            "detail": "デュエットで80点以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "連携ビブラート",
            "questKey": "karaoke-duet",
            "difficulty": 4,
            "flavor": "双帆の旋律で得点を重ねろ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "旗揚げコール",
            "detail": "デュエットでコンボ15以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "旗揚げ",
            "questKey": "karaoke-duet",
            "difficulty": 4,
            "flavor": "旗揚げのコールで連携せよ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "共鳴の航路",
            "detail": "デュエットで安定度80%以上",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "共鳴強化",
            "questKey": "karaoke-duet",
            "difficulty": 4,
            "flavor": "共鳴の航路で進め。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "大合唱の覇権",
            "detail": "デュエットで90点以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "覇者の合唱",
            "questKey": "karaoke-duet",
            "difficulty": 6,
            "flavor": "大合唱で覇権を示せ。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "嵐越えハモり",
            "detail": "デュエットで安定度90%以上",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "嵐越え",
            "questKey": "karaoke-duet",
            "difficulty": 6,
            "flavor": "嵐越えのハモりで耐え抜け。"
        },
    {
            "game": "カラオケ",
            "mode": "battle",
            "name": "勝鬨コンボ",
            "detail": "デュエットでコンボ30以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "勝鬨",
            "questKey": "karaoke-duet",
            "difficulty": 6,
            "flavor": "勝鬨のコンボで締めよ。"
        },
    {
            "game": "ダーツ",
            "name": "風向き一投",
            "detail": "カウントアップで150点以上",
            "gachaType": "hat",
            "questKey": "darts-countup",
            "difficulty": 2,
            "flavor": "風向きを読む一投で始めよう。"
        },
    {
            "game": "ダーツ",
            "name": "海図の01",
            "detail": "01を1ゲーム完走（勝敗不問）",
            "gachaType": "leather",
            "questKey": "darts-01",
            "difficulty": 2,
            "flavor": "海図の航路を完走せよ。"
        },
    {
            "game": "ダーツ",
            "name": "初クローズ",
            "detail": "クリケットで任意ナンバー1つクローズ",
            "gachaType": "wand",
            "questKey": "darts-cricket",
            "difficulty": 2,
            "flavor": "初クローズで陣地を開け。"
        },
    {
            "game": "ダーツ",
            "name": "照準の一閃",
            "detail": "カウントアップで250点以上",
            "gachaType": "gun",
            "questKey": "darts-countup",
            "difficulty": 4,
            "flavor": "照準の一閃で点を刻め。"
        },
    {
            "game": "ダーツ",
            "name": "舵取りフィニッシュ",
            "detail": "01でダブルフィニッシュ成功",
            "gachaType": "polearm",
            "questKey": "darts-01",
            "difficulty": 4,
            "flavor": "舵取りの二重で決めろ。"
        },
    {
            "game": "ダーツ",
            "name": "陣地制圧",
            "detail": "クリケットで3クローズ達成",
            "gachaType": "shield",
            "questKey": "darts-cricket",
            "difficulty": 4,
            "flavor": "陣地制圧で守りを固めろ。"
        },
    {
            "game": "ダーツ",
            "name": "疾風連打",
            "detail": "カウントアップで350点以上",
            "gachaType": "axe",
            "questKey": "darts-countup",
            "difficulty": 6,
            "flavor": "疾風の連打で切り開け。"
        },
    {
            "game": "ダーツ",
            "name": "砲撃フィニッシュ",
            "detail": "01で10ラウンド以内に勝利",
            "gachaType": "sword",
            "questKey": "darts-01",
            "difficulty": 6,
            "flavor": "砲撃の速さで決着を。"
        },
    {
            "game": "ダーツ",
            "name": "完全封鎖",
            "detail": "クリケットで全クローズ達成",
            "gachaType": "metal",
            "questKey": "darts-cricket",
            "difficulty": 6,
            "flavor": "鋼の封鎖で陣地を守れ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "援護射撃",
            "detail": "カウントアップでチーム合計250点以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "援護射撃",
            "questKey": "darts-countup",
            "difficulty": 2,
            "flavor": "援護射撃で点を重ねろ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "連携フィニッシュ",
            "detail": "01でチーム合計フィニッシュ成功",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "終幕連携",
            "questKey": "darts-01",
            "difficulty": 2,
            "flavor": "連携の終幕で仕留めろ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "共有クローズ",
            "detail": "クリケットでチーム合計2クローズ",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "共有陣地",
            "questKey": "darts-cricket",
            "difficulty": 2,
            "flavor": "陣地を共有して押し切れ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "旗印の連射",
            "detail": "カウントアップでチーム合計350点以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "旗印連射",
            "questKey": "darts-countup",
            "difficulty": 4,
            "flavor": "旗印の連射で優位を築け。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "包囲01",
            "detail": "01でチーム合計12ラウンド以内に勝利",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "包囲陣形",
            "questKey": "darts-01",
            "difficulty": 4,
            "flavor": "包囲陣形で早期決着を狙え。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "防衛ライン",
            "detail": "クリケットでチーム合計4クローズ",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "防衛ライン",
            "questKey": "darts-cricket",
            "difficulty": 4,
            "flavor": "防衛ラインを敷いて守れ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "制圧の嵐",
            "detail": "カウントアップでチーム合計450点以上",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "制圧砲撃",
            "questKey": "darts-countup",
            "difficulty": 6,
            "flavor": "制圧の嵐で主導権を奪え。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "決戦フィニッシュ",
            "detail": "01でダブルフィニッシュ成功",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "決戦フィニッシュ",
            "questKey": "darts-01",
            "difficulty": 6,
            "flavor": "決戦の一矢で決めろ。"
        },
    {
            "game": "ダーツ",
            "mode": "battle",
            "name": "完全封鎖",
            "detail": "クリケットで全クローズ達成",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "完全封鎖",
            "questKey": "darts-cricket",
            "difficulty": 6,
            "flavor": "完全封鎖で勝利を固めろ。"
        },
    {
            "game": "トランプ",
            "name": "船乗りの手札",
            "detail": "ポーカーでワンペア以上を1回成立",
            "gachaType": "dagger",
            "questKey": "cards-poker",
            "difficulty": 2,
            "flavor": "船乗りの手札で勝負せよ。"
        },
    {
            "game": "トランプ",
            "name": "静かな勝負",
            "detail": "ブラックジャックで1勝",
            "gachaType": "shield",
            "questKey": "cards-blackjack",
            "difficulty": 2,
            "flavor": "静かな勝負で守り切れ。"
        },
    {
            "game": "トランプ",
            "name": "波間の一抜け",
            "detail": "大富豪で1回上がる",
            "gachaType": "blunt",
            "questKey": "cards-daifugo",
            "difficulty": 2,
            "flavor": "波間の一抜けで先手を取れ。"
        },
    {
            "game": "トランプ",
            "name": "旗揚げストレート",
            "detail": "ポーカーでストレート以上を1回成立",
            "gachaType": "polearm",
            "questKey": "cards-poker",
            "difficulty": 4,
            "flavor": "旗揚げの一列で勝負を決めろ。"
        },
    {
            "game": "トランプ",
            "name": "21の一撃",
            "detail": "ブラックジャックで21を1回達成",
            "gachaType": "gun",
            "questKey": "cards-blackjack",
            "difficulty": 4,
            "flavor": "一撃の21で決めろ。"
        },
    {
            "game": "トランプ",
            "name": "連勝の航路",
            "detail": "大富豪で連勝2回",
            "gachaType": "axe",
            "questKey": "cards-daifugo",
            "difficulty": 4,
            "flavor": "連勝の航路で押し切れ。"
        },
    {
            "game": "トランプ",
            "name": "王手のフルハウス",
            "detail": "ポーカーでフルハウス以上を1回成立",
            "gachaType": "sword",
            "questKey": "cards-poker",
            "difficulty": 6,
            "flavor": "王手の剣で勝負を終えよ。"
        },
    {
            "game": "トランプ",
            "name": "守護の連勝",
            "detail": "ブラックジャックで2連勝",
            "gachaType": "metal",
            "questKey": "cards-blackjack",
            "difficulty": 6,
            "flavor": "守護の連勝で相手を封じろ。"
        },
    {
            "game": "トランプ",
            "name": "覇権の大富豪",
            "detail": "大富豪で1位を2回",
            "gachaType": "staff",
            "questKey": "cards-daifugo",
            "difficulty": 6,
            "flavor": "覇権の席を譲るな。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "連携ワンペア",
            "detail": "ポーカーでチーム合計ワンペア以上2回",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "連携札読み",
            "questKey": "cards-poker",
            "difficulty": 2,
            "flavor": "札を読み合い連携せよ。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "護衛BJ",
            "detail": "ブラックジャックでチーム合計1勝",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "護衛の構え",
            "questKey": "cards-blackjack",
            "difficulty": 2,
            "flavor": "護衛の構えで勝利を守れ。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "協力上がり",
            "detail": "大富豪でチーム合計1回上がり",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "協力上がり",
            "questKey": "cards-daifugo",
            "difficulty": 2,
            "flavor": "協力上がりで先手を掴め。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "隊列ストレート",
            "detail": "ポーカーでチーム合計ストレート1回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "隊列整列",
            "questKey": "cards-poker",
            "difficulty": 4,
            "flavor": "隊列を揃えて札を並べろ。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "艦隊21",
            "detail": "ブラックジャックでチーム合計21を1回達成",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "艦隊の強運",
            "questKey": "cards-blackjack",
            "difficulty": 4,
            "flavor": "艦隊の強運で21を掴め。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "連携大富豪",
            "detail": "大富豪でチーム合計2回上がり",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "連携突撃",
            "questKey": "cards-daifugo",
            "difficulty": 4,
            "flavor": "連携で上がりを重ねよ。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "王手の艦隊",
            "detail": "ポーカーでフルハウス以上を1回成立",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "王手号令",
            "questKey": "cards-poker",
            "difficulty": 6,
            "flavor": "王手の号令で締めくくれ。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "逆転ブラックジャック",
            "detail": "ブラックジャックでチーム連勝2回",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "逆転手",
            "questKey": "cards-blackjack",
            "difficulty": 6,
            "flavor": "逆転手で連勝を刻め。"
        },
    {
            "game": "トランプ",
            "mode": "battle",
            "name": "覇権の上がり",
            "detail": "大富豪でチーム合計3回上がり",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "覇権掌握",
            "questKey": "cards-daifugo",
            "difficulty": 6,
            "flavor": "覇権の上がりで差を広げよ。"
        },
    {
            "game": "その他",
            "name": "港の演習",
            "detail": "ボードゲームを1回プレイ",
            "gachaType": "hat",
            "questKey": "other-board",
            "difficulty": 2,
            "flavor": "港で演習をこなせ。"
        },
    {
            "game": "その他",
            "name": "小舟の冒険",
            "detail": "ミニゲームを1回クリア",
            "gachaType": "dagger",
            "questKey": "other-mini",
            "difficulty": 2,
            "flavor": "小舟の冒険で腕を磨け。"
        },
    {
            "game": "その他",
            "name": "黒ひげの試し",
            "detail": "黒ひげでセーフを1回出す",
            "gachaType": "leather",
            "questKey": "other-kurohige",
            "difficulty": 2,
            "flavor": "黒ひげの試しを乗り越えよ。"
        },
    {
            "game": "その他",
            "name": "防衛の勝利",
            "detail": "ボードゲームで1勝",
            "gachaType": "shield",
            "questKey": "other-board",
            "difficulty": 4,
            "flavor": "防衛の勝利で士気を上げろ。"
        },
    {
            "game": "その他",
            "name": "潮流突破",
            "detail": "ミニゲームで時間内クリア",
            "gachaType": "polearm",
            "questKey": "other-mini",
            "difficulty": 4,
            "flavor": "潮流を突破して進め。"
        },
    {
            "game": "その他",
            "name": "綱渡り",
            "detail": "黒ひげで連続セーフ2回",
            "gachaType": "blunt",
            "questKey": "other-kurohige",
            "difficulty": 4,
            "flavor": "綱渡りの集中で乗り切れ。"
        },
    {
            "game": "その他",
            "name": "大海防衛線",
            "detail": "ボードゲームで連勝2回",
            "gachaType": "sword",
            "questKey": "other-board",
            "difficulty": 6,
            "flavor": "大海防衛線で押し切れ。"
        },
    {
            "game": "その他",
            "name": "疾風の航路",
            "detail": "ミニゲームでノーダメージクリア",
            "gachaType": "gun",
            "questKey": "other-mini",
            "difficulty": 6,
            "flavor": "疾風の航路で無傷を狙え。"
        },
    {
            "game": "その他",
            "name": "黒旗の運命",
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
            "detail": "ボードゲームで協力勝利",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "協力防衛",
            "questKey": "other-board",
            "difficulty": 2,
            "flavor": "協力防衛で港を守れ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "連携小舟",
            "detail": "ミニゲームでチーム合計クリア1回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "小舟支援",
            "questKey": "other-mini",
            "difficulty": 2,
            "flavor": "連携小舟で道を開け。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "黒ひげ援護",
            "detail": "黒ひげでチーム合計セーフ2回",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "援護板",
            "questKey": "other-kurohige",
            "difficulty": 2,
            "flavor": "黒ひげ援護で危機を避けろ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "港湾迎撃",
            "detail": "ボードゲームで連勝2回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "迎撃隊形",
            "questKey": "other-board",
            "difficulty": 4,
            "flavor": "港湾迎撃で連勝せよ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "潮流突破",
            "detail": "ミニゲームでチーム合計時間内クリア",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "潮流突破",
            "questKey": "other-mini",
            "difficulty": 4,
            "flavor": "潮流突破で進路を確保せよ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "黒ひげ包囲",
            "detail": "黒ひげで連続セーフ3回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "包囲網",
            "questKey": "other-kurohige",
            "difficulty": 4,
            "flavor": "包囲網で黒ひげを攻略せよ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "大海防衛線",
            "detail": "ボードゲームで完全勝利",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "防衛線強化",
            "questKey": "other-board",
            "difficulty": 6,
            "flavor": "大海防衛線で完全勝利を掴め。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "疾風連携",
            "detail": "ミニゲームで連続パーフェクト2回",
            "gachaType": "skill",
            "skillType": "weapon",
            "skillName": "疾風連携",
            "questKey": "other-mini",
            "difficulty": 6,
            "flavor": "疾風連携で一気に駆け抜けろ。"
        },
    {
            "game": "その他",
            "mode": "battle",
            "name": "黒旗の運命",
            "detail": "黒ひげでセーフのみで勝利",
            "gachaType": "skill",
            "skillType": "passive",
            "skillName": "黒旗の運命",
            "questKey": "other-kurohige",
            "difficulty": 6,
            "flavor": "黒旗の運命を味方にせよ。"
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
