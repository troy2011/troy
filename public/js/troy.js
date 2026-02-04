// c:/Users/ikeda/my-liff-app/public/js/troy.js

import {
    getTroyStatus,
    joinTroy,
    claimTroyQuest,
    getTroyQuestClears,
    usePoints,
    sendTroyCheckout
} from './playfabClient.js';
import { isKing, refreshKingNav } from './nationKing.js';

let _wired = false;
let _questWired = false;
let _menuWired = false;
let _pollTimer = null;
let _lastStatus = null;
let _questBetAmount = 10;
let _lastQuestList = [];
let _questClears = {};
let _questMode = 'solo';
let _activeQuestGameKey = '';
let _activeQuestGameLabel = '未選択';
let _questSelections = {};
let _questSelectionTimer = null;
let _orderTotal = 0;
let _orderItems = [];
let _pendingOrder = null;
let _checkoutSession = null;
let _checkoutLocked = false;

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

const QUEST_BET_OPTIONS = [10, 50, 100, 300, 500, 1000];
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

const QUEST_CONTENT_FLAVOR = {
    solo: [
        'ハイスコアで装備の鍛造が進む。',
        '結果が積み上がるほど完成に近づく。',
        '高記録が職人の仕上げになる。'
    ],
    battle: [
        '勝負中の妙技でスキルが刻まれる。',
        'トリック成功が新たな技を呼ぶ。',
        '駆け引きの一手が技の鍵になる。'
    ]
};

const QUEST_CONTENT_MAP = {
    solo: {
        'ビリヤード': [
            // 判定：スタッフが見ている前でショット成功、またはゲームクリア
            [
                { name: '出航の第一打', detail: '任意のゲームでブレイクショットを行い、手球をスクラッチさせない' },
                { name: '直線航路', detail: 'センターショット（または真っ直ぐな配置）を1回成功させる' },
                { name: '最初の獲物', detail: '9ボールまたは8ボールでボールを1個ポケットする' }
            ],
            [
                { name: '波間の砲撃', detail: 'サイドポケットにボールを1個沈める' },
                { name: '連続被弾', detail: 'ミスをせずに連続で2個ボールをポケットする' },
                { name: '操舵の基本', detail: 'バンクショット（クッション利用）を1回成功させる' }
            ],
            [
                { name: '船長の指名', detail: 'コールショット（指定したポケット）を成功させる' },
                { name: '二連砲', detail: 'ミスをせずに連続で3個ボールをポケットする' },
                { name: '障害突破', detail: '他のボールに当ててポケットする（キャノン/コンビ）' }
            ],
            [
                { name: '長距離砲撃', detail: '対角線上のロングショットを成功させる' },
                { name: '熟練の操舵', detail: 'バンクショットを「指定して」成功させる' },
                { name: '海戦の勝利', detail: '9ボールまたは8ボールをCPU戦（またはソロ練習）で上がりきる' }
            ],
            [
                { name: '精密射撃', detail: '手球をスクラッチせずに1ゲーム完了する' },
                { name: '嵐の連撃', detail: 'ミスをせずに連続で4個ボールをポケットする' },
                { name: 'エースの証明', detail: 'ボウラード（またはカウントアップ形式）でストライクを出す' }
            ],
            [
                { name: '伝説の掃討', detail: 'ブレイクランアウト（相手に回さず取り切り）を達成' },
                { name: '神業の操舵', detail: 'ジャンプショットまたはマッセで的球に当てる（要店舗許可）' },
                { name: '海賊王の凱旋', detail: 'ボウラードでスコア100点以上（またはハイスコア更新）' }
            ]
        ],
        'カラオケ': [
            // 判定：歌唱後の採点画面のみで完結させる（機種依存パラメータの排除）
            [
                { name: '酒場の鼻歌', detail: '任意の曲を最後まで歌い切る' },
                { name: '荒くれの咆哮', detail: '採点で75点以上を出す' },
                { name: '船乗りの宴', detail: 'アップテンポな曲で盛り上げる（スタッフ判定）' }
            ],
            [
                { name: '甲板の歌声', detail: '採点で80点以上を出す' },
                { name: 'ラッキーセブン', detail: '得点の末尾が「7」で終わる（例：81.7点）' },
                { name: 'セイレーンの誘い', detail: 'バラード曲を歌い切る' }
            ],
            [
                { name: '副長の美声', detail: '採点で85点以上を出す' },
                { name: 'ゾロ目の奇跡', detail: '得点の整数部分がゾロ目になる（例：88点）' },
                { name: '熱唱の渦', detail: '消費カロリーが10kcal以上（機種による）または83点以上' }
            ],
            [
                { name: '船長の独壇場', detail: '採点で90点以上を出す' },
                { name: '精密なる音程', detail: '「音程」バーが85%以上（または金評価）' },
                { name: '完全なるゾロ目', detail: '得点の整数と小数が一致（例：85.85点）' }
            ],
            [
                { name: '伝説の歌姫', detail: '採点で93点以上を出す' },
                { name: '嵐を呼ぶ声', detail: '全国平均点より5点以上高く取る' },
                { name: '完ぺきな音程', detail: '「音程」バーが90%以上（または虹評価）' }
            ],
            [
                { name: '海神の歌声', detail: '採点で95点以上を出す' },
                { name: '神の領域', detail: '採点で98点以上、または100点を出す' },
                { name: 'ランキング制覇', detail: '店内の履歴ランキングで1位を記録する' }
            ]
        ],
        'ダーツ': [
            // 判定：マシンのリザルト画面。点数は現実的なラインに調整。
            [
                { name: '見習いの手投げ', detail: 'カウントアップで300点以上' },
                { name: '中心への一撃', detail: '1ラウンド中に1回でもBULLに入れる' },
                { name: 'カバ狩り', detail: 'ANIMAL BATTLE等で初級CPUに勝利' }
            ],
            [
                { name: '略奪の成果', detail: 'カウントアップで400点以上' },
                { name: '一斉射撃', detail: 'Low Ton（1ラウンド100点以上）を出す' },
                { name: 'キリン狩り', detail: 'ANIMAL BATTLE等で中級CPUに勝利' }
            ],
            [
                { name: '狙撃手の眼', detail: 'カウントアップで500点以上' },
                { name: '三連砲撃', detail: 'ハットトリック（BULL×3）を達成' },
                { name: '01の完走', detail: '301または501をバーストせずにフィニッシュ' }
            ],
            [
                { name: '熟練の略奪', detail: 'カウントアップで600点以上' },
                { name: '上級砲撃', detail: 'High Ton（1ラウンド150点以上）を出す' },
                { name: 'ライオン狩り', detail: 'ANIMAL BATTLE等で上級CPUに勝利' }
            ],
            [
                { name: '海賊の意地', detail: 'カウントアップで700点以上' },
                { name: '黒の三連星', detail: 'スリー・イン・ザ・ブラック（内側のBULL×3）達成' },
                { name: 'クリケット制圧', detail: 'クリケットでスタッツ2.5以上（または勝利）' }
            ],
            [
                { name: '英雄のスコア', detail: 'カウントアップで800点以上' },
                { name: '白馬の奇跡', detail: 'ホワイトホース（異なるトリプル×3）達成' },
                { name: '完全なる勝利', detail: '701を10ラウンド以内でフィニッシュ' }
            ]
        ],
        'トランプ': [
            // 判定：ポーカーソリティア推奨だが、通常のトランプ遊びでも判定可能なもの
            [
                { name: '配られた運命', detail: 'ポーカーソリティア（またはドロー）でワンペアを作る' },
                { name: '黒と赤の遊戯', detail: 'ハイ＆ローを一回当てる' },
                { name: 'ジャックの洗礼', detail: 'J（ジャック）を含む手札で勝利する' }
            ],
            [
                { name: '二重の計略', detail: 'ポーカー役でツーペアを作る' },
                { name: '21の導き', detail: 'ブラックジャックでバーストせずにスタンドする' },
                { name: '女王の微笑み', detail: 'Q（クイーン）を含む手札で勝利する' }
            ],
            [
                { name: '三位一体', detail: 'ポーカー役でスリーカードを作る' },
                { name: '幸運の勝利', detail: 'ブラックジャックで「21」を出して勝利' },
                { name: '王の威厳', detail: 'K（キング）を含む手札で勝利する' }
            ],
            [
                { name: '直線の航路', detail: 'ポーカー役でストレートを作る' },
                { name: '倍賭けの度胸', detail: 'ダブルダウンをして勝利する' },
                { name: 'エースの特権', detail: 'A（エース）を含む手札で勝利する' }
            ],
            [
                { name: '同色の結束', detail: 'ポーカー役でフラッシュを作る' },
                { name: 'フルハウス', detail: 'ポーカー役でフルハウスを作る' },
                { name: 'スプリット攻略', detail: 'スプリットをして両方の手で勝利（または引き分け以上）' }
            ],
            [
                { name: '四天王の降臨', detail: 'ポーカー役でフォーカードを作る' },
                { name: 'ロイヤルの輝き', detail: 'ストレートフラッシュ（またはロイヤル）を作る' },
                { name: '黒きジャック', detail: 'ブラックジャック（AとJ/Q/K）で勝利' }
            ]
        ],
        'その他': [
            // 判定：運ゲーは「回数」ではなく「結果」または「プレイ体験」にフォーカス
            [
                { name: '酒場の小手調べ', detail: '黒ひげ危機一発を1回遊ぶ' },
                { name: '盤上の挨拶', detail: 'ボードゲームを1回遊ぶ' },
                { name: 'コイントス', detail: 'コイントス等の単純な賭けで勝つ' }
            ],
            [
                { name: '樽の生存者', detail: '黒ひげ危機一発で自分が飛ばさずにゲームを終える' },
                { name: '盤上の勝利', detail: 'ボードゲームで1回勝利する' },
                { name: 'バランス感覚', detail: 'ジェンガ等で3巡以上倒さずに続ける' }
            ],
            [
                { name: '強運の樽', detail: '黒ひげ危機一発で、残り5本以下になるまで飛ばない' },
                { name: '盤上の連勝', detail: 'ボードゲームで2回勝利する（累積可）' },
                { name: 'ミニゲームの星', detail: '店内のミニゲームでクリア条件を満たす' }
            ],
            [
                { name: '樽の支配者', detail: '黒ひげ危機一発で、最後の1本まで飛ばずに残る（完全制覇）' },
                { name: '盤上の策士', detail: '戦略系ボードゲームで勝利する' },
                { name: 'ワニの歯磨き', detail: 'ワニワニパニック系で噛まれずに最後まで押し切る' }
            ],
            [
                { name: '酒場の英雄', detail: '店内の誰かとゲームをして勝利し、乾杯する' },
                { name: '完全なる運', detail: 'サイコロ勝負でゾロ目を出す' },
                { name: '難攻不落', detail: 'ジェンガ等を限界の高さ（スタッフ認定）まで積む' }
            ],
            [
                { name: '伝説のギャンブラー', detail: '複数のゲームで勝利を収める' },
                { name: 'グランドスラム', detail: 'ビリヤード、ダーツ、ボードゲーム全てを1回ずつ遊ぶ' },
                { name: '酒場の王', detail: '店内の「ボス（店長や強い常連）」に勝利する' }
            ]
        ]
    },
    battle: {
        'ビリヤード': [
            // 判定：対人戦の結果のみ。シンプルに。
            [
                { name: '開戦の合図', detail: '対戦を行い、最後までプレイする（勝敗不問）' },
                { name: '初勝利', detail: 'ナインボールまたはエイトボールで勝利する' },
                { name: 'ハンデ戦の勝利', detail: 'ハンデをもらって勝利する' }
            ],
            [
                { name: '接戦の制圧', detail: 'フルセット（または最終ラック）までもつれて勝利' },
                { name: '9番の奪取', detail: 'ナインボールで9番を入れて勝利' },
                { name: '8番の確保', detail: 'エイトボールで8番を入れて勝利' }
            ],
            [
                { name: '連勝の波', detail: '対戦相手を変えて（または同じ相手に）2連勝する' },
                { name: 'コンビネーション', detail: '9番（または8番）を途中のボールに当てて入れて勝利' },
                { name: 'バンクフィニッシュ', detail: '最後のボールをバンクショットで決めて勝利' }
            ],
            [
                { name: '圧倒的火力', detail: '相手にリーチをかけさせずに勝利' },
                { name: 'リベンジ', detail: '一度負けた相手に再戦して勝利する' },
                { name: '3連勝の壁', detail: '対人戦で3連勝を達成' }
            ],
            [
                { name: 'マスワリ', detail: 'ブレイクランアウトを達成して勝利' },
                { name: '完封勝利', detail: '相手に1ゲームも取らせずにセット勝利（例：3-0）' },
                { name: '大会の覇者', detail: 'ハウストーナメント等で入賞する' }
            ],
            [
                { name: '海賊王の風格', detail: 'Aクラス（上級者）プレイヤーに勝利する' },
                { name: '伝説の連勝', detail: '対人戦で5連勝以上を達成' },
                { name: '完全制圧', detail: '全てのショットをコールして勝利する（紳士協定）' }
            ]
        ],
        'カラオケ': [
            // 判定：採点バトルの結果
            [
                { name: '歌合戦の開幕', detail: '精密採点等の対戦モードをプレイする（勝敗不問）' },
                { name: '初勝利の歌', detail: '対戦相手より高い点数を出す' },
                { name: '僅差の勝利', detail: '1点差以内で勝利する' }
            ],
            [
                { name: '80点の攻防', detail: '80点以上を出して勝利する' },
                { name: '安定の勝利', detail: '対戦相手に2連勝する' },
                { name: 'リベンジソング', detail: '以前負けた相手（または曲）で勝利する' }
            ],
            [
                { name: '90点の壁', detail: '90点以上を出して勝利する' },
                { name: '圧倒的歌唱力', detail: '相手に5点以上の差をつけて勝利する' },
                { name: 'チーム勝利', detail: 'チーム戦（紅白戦など）で自チームが勝利する' }
            ],
            [
                { name: '完封リサイタル', detail: '3曲勝負で全勝する' },
                { name: '高得点バトル', detail: '双方が90点以上出し、その上で勝利する' },
                { name: '十八番の勝利', detail: '自分の持ち歌（登録曲）で95点以上出して勝つ' }
            ],
            [
                { name: '歌神の降臨', detail: '98点以上を出して勝利する' },
                { name: '100点の奇跡', detail: '100点を出して勝利する' },
                { name: '店内最強', detail: '店内のカラオケランキング1位のスコアを更新する' }
            ],
            [
                { name: '伝説のデュエット', detail: 'デュエット曲で相性診断90%以上を出す' },
                { name: 'サバイバル勝者', detail: 'パーティモード等の勝ち残り戦で優勝する' },
                { name: '終わらないアンコール', detail: '5連勝以上を達成する' }
            ]
        ],
        'ダーツ': [
            // 判定：メドレーやパーティゲームの勝敗
            [
                { name: '小手調べ', detail: 'カウントアップで対戦相手より高い点を出す' },
                { name: 'ゼロワン勝利', detail: '01ゲームで対戦して勝利する' },
                { name: 'クリケット勝利', detail: 'クリケットで対戦して勝利する' }
            ],
            [
                { name: '海賊船撃沈', detail: 'PIRATES等のパーティゲームで勝利する' },
                { name: '連勝の風', detail: '対戦で2連勝する' },
                { name: 'メドレー初勝利', detail: 'メドレー（3レグ勝負）で勝利する' }
            ],
            [
                { name: '完全撃破', detail: 'メドレーでストレート勝ち（2-0等）する' },
                { name: '逆転の狼煙', detail: '先攻を取られたゲームでブレイクして勝利' },
                { name: 'チームの絆', detail: 'ダブルスで勝利する' }
            ],
            [
                { name: '圧倒的火力', detail: 'High Ton（150点）以上を出して勝利する' },
                { name: 'ハットトリック勝利', detail: 'ハットトリックを決めたゲームで勝利する' },
                { name: '砦の防衛', detail: 'クリケットで相手のエリアを全てクローズして勝利' }
            ],
            [
                { name: '上級者の意地', detail: 'レーティングが上の相手に勝利する（ジャイアントキリング）' },
                { name: '鋼のメンタル', detail: '01で残り数点からバーストせずに一発で決めて勝つ' },
                { name: '5連勝の覇気', detail: '対人戦で5連勝を達成' }
            ],
            [
                { name: '海賊王の証明', detail: 'プロ（または店舗スタッフ最強）に勝利する' },
                { name: 'ブラック・フィニッシュ', detail: 'インナーブル（黒）に入れてフィニッシュし勝利' },
                { name: 'パーフェクトゲーム', detail: 'ノーミス（または80%以上のスタッツ）で圧勝する' }
            ]
        ],
        'トランプ': [
            // 判定：1vs1の勝負
            [
                { name: '決闘の始まり', detail: '1対1のポーカーまたはブラックジャックで勝利' },
                { name: '大富豪の勝利', detail: '大富豪で1位（富豪以上）になる' },
                { name: 'スピード決着', detail: 'スピード等の反射神経ゲームで勝利' }
            ],
            [
                { name: '連勝の街道', detail: 'カードゲームで2連勝する' },
                { name: 'ババ抜きの生還', detail: 'ババ抜きで最後までJOKERを持たずに上がる' },
                { name: 'ダウトの見極め', detail: 'ダウトを見破って勝利する' }
            ],
            [
                { name: '心理戦の勝者', detail: 'インディアンポーカー等でブラフを通して勝つ' },
                { name: '革命の旗', detail: '大富豪で革命を起こして勝利する' },
                { name: 'ブラックジャック', detail: 'BJでナチュラル21を出して勝つ' }
            ],
            [
                { name: '完全なる記憶', detail: '神経衰弱で相手より多くペアを取る' },
                { name: '王都の陥落', detail: '大富豪で都落ちさせた上で勝利する' },
                { name: 'ロイヤルガード', detail: 'ポーカーでスリーカード以上の強い役で勝つ' }
            ],
            [
                { name: 'ギャンブラーの連勝', detail: 'カードゲームで3連勝以上' },
                { name: '逆転の切り札', detail: '圧倒的不利な状況から逆転勝利する（自己申告可）' },
                { name: '総取り', detail: 'チップ等を賭けた勝負で相手をパンクさせる' }
            ],
            [
                { name: 'カードマスター', detail: '異なる種類のカードゲーム3つで勝利する' },
                { name: '不敗神話', detail: '一晩（来店中）カードゲームで無敗（3戦以上）' },
                { name: 'イカサマ知らず', detail: '全員が納得する完全な実力で圧勝する' }
            ]
        ],
        'その他': [
            // 判定：パーティゲームバトル
            [
                { name: '盤上の決闘', detail: 'オセロやチェス等の1対1ボードゲームで勝利' },
                { name: '反射神経の勝利', detail: 'アクション系ゲームで勝利' },
                { name: '運命のサイコロ', detail: 'チンチロリン等で相手より強い目を出す' }
            ],
            [
                { name: '知略の勝利', detail: '戦略系ボードゲームで勝利' },
                { name: 'バランスの勝利', detail: 'ジェンガ等で相手が倒して勝利' },
                { name: '間違い探し', detail: '間違い探し等で相手より早く見つける' }
            ],
            [
                { name: '連戦連勝', detail: 'ボードゲームで2連勝する' },
                { name: 'ハンデ粉砕', detail: 'ハンデを与えた状態で勝利する' },
                { name: 'タイムアタック', detail: 'パズル等を相手より早く解く' }
            ],
            [
                { name: '完全論破', detail: '人狼やワードウルフ等の会話ゲームで自陣営を勝利に導く' },
                { name: '無傷の勝利', detail: 'HP制のゲーム等でノーダメージ勝利' },
                { name: 'グランドチャンピオン', detail: '店内のボードゲーム大会で優勝する' }
            ],
            [
                { name: 'ゲーム王', detail: '店にあるボードゲーム全種類で1回以上勝利（長期目標）' },
                { name: '不敗の帝王', detail: '来店中、誰からの挑戦も退け続ける（5戦以上）' },
                { name: '伝説の一夜', detail: 'その場にいる全員参加のゲームで単独優勝する' }
            ],
            [
                { name: '酒場の守護神', detail: 'スタッフからの挑戦を受けて勝利する' },
                { name: '全知全能', detail: 'クイズゲーム等で全問正解して勝利' },
                { name: '殿堂入り', detail: '店舗独自の「強い人リスト」に名を刻む' }
            ]
        ]
    }
};

function refineQuestContent(quests) {
    const counters = new Map();
    return quests.map((quest) => {
        const modeKey = quest.mode === 'battle' || quest.gachaType === 'skill' ? 'battle' : 'solo';
        const catalog = QUEST_CONTENT_MAP[modeKey] && QUEST_CONTENT_MAP[modeKey][quest.game];
        if (!catalog) return quest;
        const diffIndex = Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, Number(quest.difficulty || DIFFICULTY_FALLBACK))) - 1;
        const bucket = catalog[diffIndex];
        if (!bucket || !bucket.length) return quest;
        const key = `${modeKey}|${quest.game}|${diffIndex}`;
        const used = counters.get(key) || 0;
        if (used >= bucket.length) return quest;
        counters.set(key, used + 1);
        const entry = bucket[used];
        const flavorPool = QUEST_CONTENT_FLAVOR[modeKey];
        const flavor = entry.flavor || flavorPool[used % flavorPool.length];
        const detail = modeKey === 'battle' && !entry.detail.includes('勝利必須')
            ? `${entry.detail}（勝利必須）`
            : entry.detail;
        return { ...quest, name: entry.name, detail, flavor };
    });
}

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

const TROY_QUESTS = refineQuestContent([
    {
        "game": "ビリヤード",
        "name": "見張りの完走",
        "detail": "ストップショットで白球を当てた場所に止める",
        "gachaType": "dagger",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "止めの精度で見張りを任せろ。"
    },
    {
        "game": "ビリヤード",
        "name": "港の得点",
        "detail": "ボーラードで1フレームで1点以上",
        "gachaType": "wand",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "港の得点で流れを掴め。"
    },
    {
        "game": "ビリヤード",
        "name": "初球の確認",
        "detail": "センターショットで的球を真っ直ぐ入れる",
        "gachaType": "hat",
        "questKey": "billiard-bowrad",
        "difficulty": 1,
        "flavor": "真っ直ぐの一球で航路を示せ。"
    },
    {
        "game": "ビリヤード",
        "name": "岸への返し",
        "detail": "クッションに当てて白球を手前ぎりぎりに戻す",
        "gachaType": "staff",
        "questKey": "billiard-bowrad",
        "difficulty": 2,
        "flavor": "岸への返しで距離感を掴め。"
    },
    {
        "game": "ビリヤード",
        "name": "手前止めの基本",
        "detail": "ストップショットで白球を手前の手球長以内に止める",
        "gachaType": "leather",
        "questKey": "billiard-bowrad",
        "difficulty": 2,
        "flavor": "止めの基本で航路を整えよ。"
    },
    {
        "game": "ビリヤード",
        "name": "芯のセンター",
        "detail": "センターショットで的球を2回連続で入れる",
        "gachaType": "wand",
        "questKey": "billiard-bowrad",
        "difficulty": 2,
        "flavor": "芯を射抜く一撃で道を示せ。"
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
        "detail": "センターショット連続成功2回",
        "gachaType": "blunt",
        "questKey": "billiard-bowrad",
        "difficulty": 3,
        "flavor": "静けさの中で精度を重ねろ。"
    },
    {
        "game": "ビリヤード",
        "name": "波間の計算",
        "detail": "手前戻し（ドロー）で白球を手前に戻す",
        "gachaType": "shield",
        "questKey": "billiard-bowrad",
        "difficulty": 3,
        "flavor": "引きの計算で波間を制せ。"
    },
    {
        "game": "ビリヤード",
        "name": "フォローの伸び",
        "detail": "フォローショットで白球を奥に送ってポジションを取る",
        "gachaType": "polearm",
        "questKey": "billiard-bowrad",
        "difficulty": 4,
        "flavor": "伸びる一球で優位を掴め。"
    },
    {
        "game": "ビリヤード",
        "name": "舵の連打",
        "detail": "クッションバンクで的球を入れる",
        "gachaType": "sword",
        "questKey": "billiard-bowrad",
        "difficulty": 4,
        "flavor": "舵の切り返しで道を開け。"
    },
    {
        "game": "ビリヤード",
        "name": "薄当ての配置",
        "detail": "薄い当てで白球を中央付近に止める",
        "gachaType": "axe",
        "questKey": "billiard-bowrad",
        "difficulty": 4,
        "flavor": "薄当ての配置で航路を作れ。"
    },
    {
        "game": "ビリヤード",
        "name": "剣の連鎖",
        "detail": "センターショット連続3回成功",
        "gachaType": "sword",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "剣の連鎖で精度を刻め。"
    },
    {
        "game": "ビリヤード",
        "name": "二枚クッション",
        "detail": "2クッションで的球を入れる",
        "gachaType": "blunt",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "二枚の反射で道を拓け。"
    },
    {
        "game": "ビリヤード",
        "name": "帆走の維持",
        "detail": "フォローで白球を奥に送るショット2回成功",
        "gachaType": "leather",
        "questKey": "billiard-bowrad",
        "difficulty": 5,
        "flavor": "帆走を維持して航路を伸ばせ。"
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
        "name": "狙撃の締め",
        "detail": "ロングショットで的球を入れる",
        "gachaType": "gun",
        "questKey": "billiard-bowrad",
        "difficulty": 6,
        "flavor": "狙撃の精度で締めくくれ。"
    },
    {
        "game": "ビリヤード",
        "name": "砲門の精度",
        "detail": "クッションバンク2回成功",
        "gachaType": "polearm",
        "questKey": "billiard-bowrad",
        "difficulty": 6,
        "flavor": "反射の読みで砲門を貫け。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "開戦の一打",
        "detail": "9ボールで1球以上入れる",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "開戦の一打",
        "skillWeapon": "sword",
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
        "skillWeapon": "sword",
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
        "skillWeapon": "sword",
        "questKey": "billiard-9",
        "difficulty": 1,
        "flavor": "初動の一撃で主導権を取れ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "ブレイク追撃",
        "detail": "9ボールでブレイク後に連続で1球入れる",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "ブレイク追撃",
        "skillWeapon": "sword",
        "questKey": "billiard-9",
        "difficulty": 2,
        "flavor": "追撃の一球で差をつけろ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "黒旗の勝利",
        "detail": "8ボールで1勝する",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の勝利",
        "skillWeapon": "sword",
        "questKey": "billiard-8",
        "difficulty": 2,
        "flavor": "黒旗を掲げて勝利を掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "二球先取",
        "detail": "9ボールで2球以上入れる",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "二球先取",
        "skillWeapon": "sword",
        "questKey": "billiard-9",
        "difficulty": 2,
        "flavor": "先取の二球で流れを掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "攻めの継続",
        "detail": "9ボールでブレイク後に連続ポケット2回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "攻めの継続",
        "skillWeapon": "sword",
        "questKey": "billiard-9",
        "difficulty": 3,
        "flavor": "攻めの継続で盤面を支配せよ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "色の確保",
        "detail": "8ボールで自分の色を3球入れる",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "色の確保",
        "skillWeapon": "sword",
        "questKey": "billiard-8",
        "difficulty": 3,
        "flavor": "色を確保して主導権を取れ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "舵の勝利",
        "detail": "9ボールで1勝する",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "舵の勝利",
        "skillWeapon": "axe",
        "questKey": "billiard-9",
        "difficulty": 3,
        "flavor": "舵を握り勝利へ導け。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "色の制圧",
        "detail": "8ボールで自分の色を5球入れる",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "色の制圧",
        "skillWeapon": "axe",
        "questKey": "billiard-8",
        "difficulty": 4,
        "flavor": "色の制圧で道を切り開け。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "連続ポケット",
        "detail": "9ボールで連続ポケット2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "連続ポケット",
        "skillWeapon": "polearm",
        "questKey": "billiard-9",
        "difficulty": 4,
        "flavor": "連続の一撃で差を広げよ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "連続三球",
        "detail": "9ボールで連続ポケット3回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "連続三球",
        "skillWeapon": "gun",
        "questKey": "billiard-9",
        "difficulty": 4,
        "flavor": "連続の三球で主導権を奪え。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "旗艦連勝",
        "detail": "9ボールで2連勝",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗艦連勝",
        "skillWeapon": "dagger",
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
        "skillWeapon": "axe",
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
        "skillWeapon": "staff",
        "questKey": "billiard-8",
        "difficulty": 5,
        "flavor": "連続ブレイクで押し切れ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "一閃の制圧",
        "detail": "9ボールでブレイクラン成功",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "一閃の制圧",
        "skillWeapon": "gun",
        "questKey": "billiard-9",
        "difficulty": 6,
        "flavor": "一閃の制圧で決着をつけろ。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "鋼の決着",
        "detail": "8ボールでノーミス勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "鋼の決着",
        "skillWeapon": "axe",
        "questKey": "billiard-8",
        "difficulty": 6,
        "flavor": "鋼の決着で勝利を掴め。"
    },
    {
        "game": "ビリヤード",
        "mode": "battle",
        "name": "沈黙の掃討",
        "detail": "9ボールでノーミス勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "沈黙の掃討",
        "skillWeapon": "wand",
        "questKey": "billiard-9",
        "difficulty": 6,
        "flavor": "沈黙の掃討で敵を沈めろ。"
    },
    {
        "game": "カラオケ",
        "name": "甲板の合図",
        "detail": "シングルで採点結果を表示する",
        "gachaType": "wand",
        "questKey": "karaoke-single",
        "difficulty": 1,
        "flavor": "甲板で合図を出すように歌え。"
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
        "name": "波乗りの声",
        "detail": "シングルで65点以上",
        "gachaType": "dagger",
        "questKey": "karaoke-single",
        "difficulty": 1,
        "flavor": "波に乗る声を響かせろ。"
    },
    {
        "game": "カラオケ",
        "name": "小波のコンボ",
        "detail": "シングルでコンボ5以上",
        "gachaType": "dagger",
        "questKey": "karaoke-single",
        "difficulty": 2,
        "flavor": "小波の連打で流れを作れ。"
    },
    {
        "game": "カラオケ",
        "name": "息継ぎの安定",
        "detail": "シングルで安定度65%以上",
        "gachaType": "staff",
        "questKey": "karaoke-single",
        "difficulty": 2,
        "flavor": "安定した息で航路を守れ。"
    },
    {
        "game": "カラオケ",
        "name": "潮風の声",
        "detail": "シングルで70点以上",
        "gachaType": "hat",
        "questKey": "karaoke-single",
        "difficulty": 2,
        "flavor": "潮風の声で士気を上げよ。"
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
        "gachaType": "blunt",
        "questKey": "karaoke-single",
        "difficulty": 3,
        "flavor": "灯台の高音で道を照らせ。"
    },
    {
        "game": "カラオケ",
        "name": "帆走のリズム",
        "detail": "シングルで75点以上",
        "gachaType": "sword",
        "questKey": "karaoke-single",
        "difficulty": 3,
        "flavor": "帆走のリズムを揃えよ。"
    },
    {
        "game": "カラオケ",
        "name": "響きの連鎖",
        "detail": "シングルでコンボ18以上",
        "gachaType": "axe",
        "questKey": "karaoke-single",
        "difficulty": 4,
        "flavor": "響きの連鎖で一気に畳みかけろ。"
    },
    {
        "game": "カラオケ",
        "name": "波越えの声",
        "detail": "シングルで80点以上",
        "gachaType": "wand",
        "questKey": "karaoke-single",
        "difficulty": 4,
        "flavor": "波越えの声で頂を狙え。"
    },
    {
        "game": "カラオケ",
        "name": "抑揚の灯",
        "detail": "シングルで抑揚75%以上",
        "gachaType": "metal",
        "questKey": "karaoke-single",
        "difficulty": 4,
        "flavor": "抑揚の灯で道を照らせ。"
    },
    {
        "game": "カラオケ",
        "name": "航海の誓い",
        "detail": "シングルで85点以上",
        "gachaType": "shield",
        "questKey": "karaoke-single",
        "difficulty": 5,
        "flavor": "航海の誓いを高らかに。"
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
        "name": "嵐越え",
        "detail": "シングルでコンボ25以上",
        "gachaType": "polearm",
        "questKey": "karaoke-single",
        "difficulty": 5,
        "flavor": "嵐を越える声を撃て。"
    },
    {
        "game": "カラオケ",
        "name": "極みの抑揚",
        "detail": "シングルで抑揚90%以上",
        "gachaType": "gun",
        "questKey": "karaoke-single",
        "difficulty": 6,
        "flavor": "極みの抑揚で王座を掴め。"
    },
    {
        "game": "カラオケ",
        "name": "疾風の一声",
        "detail": "シングルでコンボ40以上",
        "gachaType": "polearm",
        "questKey": "karaoke-single",
        "difficulty": 6,
        "flavor": "疾風の一声で突き抜けろ。"
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
        "mode": "battle",
        "name": "初戦の旋律",
        "detail": "1対1で65点以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "初戦の旋律",
        "skillWeapon": "axe",
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
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 1,
        "flavor": "小波の連打でテンポを掴め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "対戦の合図",
        "detail": "1対1で採点結果を表示する",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "対戦の合図",
        "skillWeapon": "axe",
        "questKey": "karaoke-battle",
        "difficulty": 1,
        "flavor": "合図の一声で勝負を始めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "鼓動のコンボ",
        "detail": "1対1でコンボ10以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "鼓動のコンボ",
        "skillWeapon": "axe",
        "questKey": "karaoke-battle",
        "difficulty": 2,
        "flavor": "鼓動の連打で差をつけろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "対戦の旋律",
        "detail": "1対1で70点以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "対戦の旋律",
        "skillWeapon": "axe",
        "questKey": "karaoke-battle",
        "difficulty": 2,
        "flavor": "対戦の旋律で先手を取れ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "帆走の安定",
        "detail": "1対1で安定度70%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "帆走の安定",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 2,
        "flavor": "帆走の安定で揺れを抑えよ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "安定の帆",
        "detail": "1対1で安定度75%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "安定の帆",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 3,
        "flavor": "安定の帆で揺れを抑えよ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "旗揚げコール",
        "detail": "1対1で75点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗揚げコール",
        "skillWeapon": "sword",
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
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 3,
        "flavor": "共鳴の航路で勝負を進めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "旗声の80",
        "detail": "1対1で80点以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "旗声の80",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 4,
        "flavor": "旗声で主導権を奪え。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "抑揚の波",
        "detail": "1対1で抑揚80%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "抑揚の波",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 4,
        "flavor": "抑揚の波で響きを刻め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "嵐越えの20",
        "detail": "1対1でコンボ20以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "嵐越えの20",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 4,
        "flavor": "嵐越えの連打で押し切れ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "響き合わせ",
        "detail": "1対1で抑揚85%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "響き合わせ",
        "skillWeapon": "blunt",
        "questKey": "karaoke-battle",
        "difficulty": 5,
        "flavor": "響きを合わせて勝利を掴め。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "双帆の旋律",
        "detail": "1対1で85点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "双帆の旋律",
        "skillWeapon": "axe",
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
        "skillWeapon": "polearm",
        "questKey": "karaoke-battle",
        "difficulty": 5,
        "flavor": "嵐越えの声で押し切れ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "極限抑揚",
        "detail": "1対1で抑揚95%以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "極限抑揚",
        "skillWeapon": "dagger",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "極限の抑揚で圧倒せよ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "勝鬨コンボ",
        "detail": "1対1でコンボ45以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "勝鬨コンボ",
        "skillWeapon": "dagger",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "勝鬨の連打で勝負を決めろ。"
    },
    {
        "game": "カラオケ",
        "mode": "battle",
        "name": "覇者の合唱",
        "detail": "1対1で95点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "覇者の合唱",
        "skillWeapon": "staff",
        "questKey": "karaoke-battle",
        "difficulty": 6,
        "flavor": "覇者の合唱で王座を奪え。"
    },
    {
        "game": "ダーツ",
        "name": "海図の01",
        "detail": "01を1ゲーム完走（勝敗不問）",
        "gachaType": "wand",
        "questKey": "darts-01",
        "difficulty": 1,
        "flavor": "海図の航路を完走せよ。"
    },
    {
        "game": "ダーツ",
        "name": "初クローズ",
        "detail": "クリケットで任意ナンバー1つクローズ",
        "gachaType": "dagger",
        "questKey": "darts-cricket",
        "difficulty": 1,
        "flavor": "初クローズで陣地を開け。"
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
        "name": "航路のダブル",
        "detail": "01でダブルに1回当てる",
        "gachaType": "polearm",
        "questKey": "darts-01",
        "difficulty": 2,
        "flavor": "航路の二重で流れを作れ。"
    },
    {
        "game": "ダーツ",
        "name": "二重クローズ",
        "detail": "クリケットで2クローズ達成",
        "gachaType": "leather",
        "questKey": "darts-cricket",
        "difficulty": 2,
        "flavor": "二重クローズで陣地を固めろ。"
    },
    {
        "game": "ダーツ",
        "name": "風向き二投",
        "detail": "カウントアップで170点以上",
        "gachaType": "blunt",
        "questKey": "darts-countup",
        "difficulty": 2,
        "flavor": "二投の風向きで道を作れ。"
    },
    {
        "game": "ダーツ",
        "name": "照準の一閃",
        "detail": "カウントアップで220点以上",
        "gachaType": "sword",
        "questKey": "darts-countup",
        "difficulty": 3,
        "flavor": "照準の一閃で点を刻め。"
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
        "name": "舵取りフィニッシュ",
        "detail": "01でダブルフィニッシュ成功",
        "gachaType": "axe",
        "questKey": "darts-01",
        "difficulty": 3,
        "flavor": "舵取りの二重で決めろ。"
    },
    {
        "game": "ダーツ",
        "name": "四つの封鎖",
        "detail": "クリケットで4クローズ達成",
        "gachaType": "metal",
        "questKey": "darts-cricket",
        "difficulty": 4,
        "flavor": "四つの封鎖で守りを固めろ。"
    },
    {
        "game": "ダーツ",
        "name": "疾風の照準",
        "detail": "カウントアップで300点以上",
        "gachaType": "staff",
        "questKey": "darts-countup",
        "difficulty": 4,
        "flavor": "疾風の照準で差を広げよ。"
    },
    {
        "game": "ダーツ",
        "name": "速攻01",
        "detail": "01で13ラウンド以内に勝利",
        "gachaType": "wand",
        "questKey": "darts-01",
        "difficulty": 4,
        "flavor": "速攻の一矢で決着を狙え。"
    },
    {
        "game": "ダーツ",
        "name": "疾風連打",
        "detail": "カウントアップで320点以上",
        "gachaType": "shield",
        "questKey": "darts-countup",
        "difficulty": 5,
        "flavor": "疾風の連打で切り開け。"
    },
    {
        "game": "ダーツ",
        "name": "砲撃フィニッシュ",
        "detail": "01で15ラウンド以内にクリア",
        "gachaType": "polearm",
        "questKey": "darts-01",
        "difficulty": 5,
        "flavor": "砲撃の速さで決着を。"
    },
    {
        "game": "ダーツ",
        "name": "防衛線",
        "detail": "クリケットで5クローズ達成",
        "gachaType": "shield",
        "questKey": "darts-cricket",
        "difficulty": 5,
        "flavor": "防衛線を敷いて守れ。"
    },
    {
        "game": "ダーツ",
        "name": "完全封鎖",
        "detail": "クリケットで全クローズ達成",
        "gachaType": "gun",
        "questKey": "darts-cricket",
        "difficulty": 6,
        "flavor": "完全封鎖で勝利を固めろ。"
    },
    {
        "game": "ダーツ",
        "name": "決戦フィニッシュ",
        "detail": "01で10ラウンド以内に勝利",
        "gachaType": "staff",
        "questKey": "darts-01",
        "difficulty": 6,
        "flavor": "決戦の一矢で決めろ。"
    },
    {
        "game": "ダーツ",
        "name": "制圧の嵐",
        "detail": "カウントアップで450点以上",
        "gachaType": "metal",
        "questKey": "darts-countup",
        "difficulty": 6,
        "flavor": "制圧の嵐で主導権を奪え。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "援護射撃",
        "detail": "1対1でカウントアップ180点以上",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "援護射撃",
        "skillWeapon": "dagger",
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
        "skillWeapon": "gun",
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
        "skillWeapon": "dagger",
        "questKey": "darts-cricket",
        "difficulty": 1,
        "flavor": "陣地を共有して押し切れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "ブルの先制",
        "detail": "1対1でクリケットでブルを1回ヒット",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "ブルの先制",
        "skillWeapon": "dagger",
        "questKey": "darts-cricket",
        "difficulty": 2,
        "flavor": "ブルの先制で主導権を取れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "援護射撃・改",
        "detail": "1対1でカウントアップ220点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "援護射撃・改",
        "skillWeapon": "dagger",
        "questKey": "darts-countup",
        "difficulty": 2,
        "flavor": "援護射撃で点を刻め。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "包囲01・改",
        "detail": "1対1で01を18ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "包囲01・改",
        "skillWeapon": "dagger",
        "questKey": "darts-01",
        "difficulty": 2,
        "flavor": "包囲の形で早期決着を狙え。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "旗印の連射",
        "detail": "1対1でカウントアップ260点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗印連射",
        "skillWeapon": "wand",
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
        "skillWeapon": "dagger",
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
        "skillWeapon": "shield",
        "questKey": "darts-cricket",
        "difficulty": 3,
        "flavor": "防衛ラインを敷いて守れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "旗印の連射・改",
        "detail": "1対1でカウントアップ300点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "旗印の連射・改",
        "skillWeapon": "polearm",
        "questKey": "darts-countup",
        "difficulty": 4,
        "flavor": "旗印の連射で押し切れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "四重封鎖",
        "detail": "1対1でクリケット4クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "四重封鎖",
        "skillWeapon": "shield",
        "questKey": "darts-cricket",
        "difficulty": 4,
        "flavor": "四重封鎖で勝利を固めよ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "包囲01・強",
        "detail": "1対1で01を13ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "包囲01・強",
        "skillWeapon": "shield",
        "questKey": "darts-01",
        "difficulty": 4,
        "flavor": "包囲を強めて早期決着へ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "完全封鎖",
        "detail": "1対1でクリケット5クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "完全封鎖",
        "skillWeapon": "shield",
        "questKey": "darts-cricket",
        "difficulty": 5,
        "flavor": "完全封鎖で勝利を固めろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "決戦フィニッシュ",
        "detail": "1対1で01を12ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決戦フィニッシュ",
        "skillWeapon": "blunt",
        "questKey": "darts-01",
        "difficulty": 5,
        "flavor": "決戦の一矢で決めろ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "制圧の嵐",
        "detail": "1対1でカウントアップ360点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "制圧砲撃",
        "skillWeapon": "sword",
        "questKey": "darts-countup",
        "difficulty": 5,
        "flavor": "制圧の嵐で主導権を奪え。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "完全封鎖・極",
        "detail": "1対1でクリケット全クローズ達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "完全封鎖・極",
        "skillWeapon": "shield",
        "questKey": "darts-cricket",
        "difficulty": 6,
        "flavor": "極限の封鎖で勝ち切れ。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "決戦フィニッシュ・極",
        "detail": "1対1で01を10ラウンド以内に勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決戦フィニッシュ・極",
        "skillWeapon": "axe",
        "questKey": "darts-01",
        "difficulty": 6,
        "flavor": "極限の決戦で勝利を掴め。"
    },
    {
        "game": "ダーツ",
        "mode": "battle",
        "name": "制圧の嵐・極",
        "detail": "1対1でカウントアップ500点以上",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "制圧砲撃・極",
        "skillWeapon": "polearm",
        "questKey": "darts-countup",
        "difficulty": 6,
        "flavor": "極限の制圧で突き放せ。"
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
        "name": "船乗りの手札",
        "detail": "ポーカーでワンペア以上を1回成立",
        "gachaType": "hat",
        "questKey": "cards-poker",
        "difficulty": 1,
        "flavor": "船乗りの手札で勝負せよ。"
    },
    {
        "game": "トランプ",
        "name": "波間の一抜け",
        "detail": "大富豪で1回上がる",
        "gachaType": "dagger",
        "questKey": "cards-daifugo",
        "difficulty": 1,
        "flavor": "波間の一抜けで先手を取れ。"
    },
    {
        "game": "トランプ",
        "name": "20の堅守",
        "detail": "ブラックジャックで20以上を1回達成",
        "gachaType": "leather",
        "questKey": "cards-blackjack",
        "difficulty": 2,
        "flavor": "堅守の20で勝負を支えよ。"
    },
    {
        "game": "トランプ",
        "name": "二重旗",
        "detail": "ポーカーでツーペア以上を1回成立",
        "gachaType": "hat",
        "questKey": "cards-poker",
        "difficulty": 2,
        "flavor": "二重旗で勝負の流れを作れ。"
    },
    {
        "game": "トランプ",
        "name": "波間の二抜け",
        "detail": "大富豪で2回上がる",
        "gachaType": "staff",
        "questKey": "cards-daifugo",
        "difficulty": 2,
        "flavor": "二抜けで主導権を掴め。"
    },
    {
        "game": "トランプ",
        "name": "21の一撃",
        "detail": "ブラックジャックで21を1回達成",
        "gachaType": "axe",
        "questKey": "cards-blackjack",
        "difficulty": 3,
        "flavor": "一撃の21で決めろ。"
    },
    {
        "game": "トランプ",
        "name": "旗揚げストレート",
        "detail": "ポーカーでストレート以上を1回成立",
        "gachaType": "sword",
        "questKey": "cards-poker",
        "difficulty": 3,
        "flavor": "旗揚げの一列で勝負を決めろ。"
    },
    {
        "game": "トランプ",
        "name": "連勝の航路",
        "detail": "大富豪で連勝2回",
        "gachaType": "blunt",
        "questKey": "cards-daifugo",
        "difficulty": 3,
        "flavor": "連勝の航路で押し切れ。"
    },
    {
        "game": "トランプ",
        "name": "21の勝利",
        "detail": "ブラックジャックで21を出して勝利",
        "gachaType": "axe",
        "questKey": "cards-blackjack",
        "difficulty": 4,
        "flavor": "勝利の21で決めろ。"
    },
    {
        "game": "トランプ",
        "name": "潮流フラッシュ",
        "detail": "ポーカーでフラッシュ以上を1回成立",
        "gachaType": "wand",
        "questKey": "cards-poker",
        "difficulty": 4,
        "flavor": "潮流のフラッシュで切り開け。"
    },
    {
        "game": "トランプ",
        "name": "連覇の合図",
        "detail": "大富豪で2連勝",
        "gachaType": "metal",
        "questKey": "cards-daifugo",
        "difficulty": 4,
        "flavor": "連覇の合図で流れを掴め。"
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
        "gachaType": "shield",
        "questKey": "cards-blackjack",
        "difficulty": 5,
        "flavor": "守護の連勝で相手を封じろ。"
    },
    {
        "game": "トランプ",
        "name": "覇権の大富豪",
        "detail": "大富豪で1位を2回",
        "gachaType": "leather",
        "questKey": "cards-daifugo",
        "difficulty": 5,
        "flavor": "覇権の席を譲るな。"
    },
    {
        "game": "トランプ",
        "name": "王手の四枚",
        "detail": "ポーカーでフォーカード以上を1回成立",
        "gachaType": "metal",
        "questKey": "cards-poker",
        "difficulty": 6,
        "flavor": "王手の四枚で決着をつけろ。"
    },
    {
        "game": "トランプ",
        "name": "覇権の戴冠",
        "detail": "大富豪で1位を3回",
        "gachaType": "gun",
        "questKey": "cards-daifugo",
        "difficulty": 6,
        "flavor": "覇権の戴冠で栄冠を掴め。"
    },
    {
        "game": "トランプ",
        "name": "覇者の連勝",
        "detail": "ブラックジャックで3連勝",
        "gachaType": "staff",
        "questKey": "cards-blackjack",
        "difficulty": 6,
        "flavor": "覇者の連勝で勝ち切れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘のワンペア",
        "detail": "1対1ポーカーでワンペア以上を1回成立",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "決闘の札読み",
        "skillWeapon": "shield",
        "questKey": "cards-poker",
        "difficulty": 1,
        "flavor": "決闘の札読みで先手を取れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘上がり",
        "detail": "1対1大富豪で1回上がり",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "決闘上がり",
        "skillWeapon": "polearm",
        "questKey": "cards-daifugo",
        "difficulty": 1,
        "flavor": "決闘の上がりで先手を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "護衛BJ",
        "detail": "1対1ブラックジャックで1勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "護衛の構え",
        "skillWeapon": "polearm",
        "questKey": "cards-blackjack",
        "difficulty": 1,
        "flavor": "護衛の構えで勝利を守れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘ツーペア",
        "detail": "1対1ポーカーでツーペア以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決闘ツーペア",
        "skillWeapon": "staff",
        "questKey": "cards-poker",
        "difficulty": 2,
        "flavor": "決闘の二重札で流れを掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘二抜け",
        "detail": "1対1大富豪で2回上がり",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "決闘二抜け",
        "skillWeapon": "polearm",
        "questKey": "cards-daifugo",
        "difficulty": 2,
        "flavor": "二抜けで優位を築け。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "堅守20",
        "detail": "1対1ブラックジャックで20以上を1回達成",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "堅守20",
        "skillWeapon": "polearm",
        "questKey": "cards-blackjack",
        "difficulty": 2,
        "flavor": "堅守の20で勝利を呼べ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "艦隊21",
        "detail": "1対1ブラックジャックで21を1回達成",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "艦隊の強運",
        "skillWeapon": "dagger",
        "questKey": "cards-blackjack",
        "difficulty": 3,
        "flavor": "艦隊の強運で21を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "隊列ストレート",
        "detail": "1対1ポーカーでストレート以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "隊列整列",
        "skillWeapon": "staff",
        "questKey": "cards-poker",
        "difficulty": 3,
        "flavor": "隊列を揃えて札を並べろ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "連携大富豪",
        "detail": "1対1大富豪で1位を1回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "連携突撃",
        "skillWeapon": "polearm",
        "questKey": "cards-daifugo",
        "difficulty": 3,
        "flavor": "一対一の上がりで優位を取れ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "決闘フラッシュ",
        "detail": "1対1ポーカーでフラッシュ以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "決闘フラッシュ",
        "skillWeapon": "wand",
        "questKey": "cards-poker",
        "difficulty": 4,
        "flavor": "決闘のフラッシュで勝負を決めろ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "勝利の21",
        "detail": "1対1ブラックジャックで21を出して勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "勝利の21",
        "skillWeapon": "polearm",
        "questKey": "cards-blackjack",
        "difficulty": 4,
        "flavor": "勝利の21で王座を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇権の連勝",
        "detail": "1対1大富豪で2連勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "覇権の連勝",
        "skillWeapon": "staff",
        "questKey": "cards-daifugo",
        "difficulty": 4,
        "flavor": "覇権の連勝で差を広げよ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "王手のフルハウス",
        "detail": "1対1ポーカーでフルハウス以上を1回成立",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "王手号令",
        "skillWeapon": "gun",
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
        "skillWeapon": "staff",
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
        "skillWeapon": "wand",
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
        "skillWeapon": "blunt",
        "questKey": "cards-poker",
        "difficulty": 6,
        "flavor": "王手の四枚で決着をつけろ。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇権の戴冠",
        "detail": "1対1大富豪で1位を3回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "覇権の戴冠",
        "skillWeapon": "sword",
        "questKey": "cards-daifugo",
        "difficulty": 6,
        "flavor": "覇権の戴冠で栄冠を掴め。"
    },
    {
        "game": "トランプ",
        "mode": "battle",
        "name": "覇者の連勝",
        "detail": "1対1ブラックジャックで3連勝",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "覇者の連勝",
        "skillWeapon": "staff",
        "questKey": "cards-blackjack",
        "difficulty": 6,
        "flavor": "覇者の連勝で勝ち切れ。"
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
        "name": "黒ひげの試し",
        "detail": "黒ひげでセーフを1回出す",
        "gachaType": "dagger",
        "questKey": "other-kurohige",
        "difficulty": 1,
        "flavor": "黒ひげの試しを乗り越えよ。"
    },
    {
        "game": "その他",
        "name": "小舟の冒険",
        "detail": "ミニゲームを1回クリア",
        "gachaType": "wand",
        "questKey": "other-mini",
        "difficulty": 1,
        "flavor": "小舟の冒険で腕を磨け。"
    },
    {
        "game": "その他",
        "name": "港の再戦",
        "detail": "ボードゲームを2回プレイ",
        "gachaType": "blunt",
        "questKey": "other-board",
        "difficulty": 2,
        "flavor": "再戦の港で準備を整えよ。"
    },
    {
        "game": "その他",
        "name": "黒ひげ二避",
        "detail": "黒ひげでセーフ2回",
        "gachaType": "leather",
        "questKey": "other-kurohige",
        "difficulty": 2,
        "flavor": "二避で危機を避けよ。"
    },
    {
        "game": "その他",
        "name": "小舟の連続",
        "detail": "ミニゲームを2回連続でクリア",
        "gachaType": "polearm",
        "questKey": "other-mini",
        "difficulty": 2,
        "flavor": "小舟の連続で流れを掴め。"
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
        "name": "潮流突破",
        "detail": "ミニゲームで時間内クリア",
        "gachaType": "axe",
        "questKey": "other-mini",
        "difficulty": 3,
        "flavor": "潮流を突破して進め。"
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
        "name": "黒ひげ三避",
        "detail": "黒ひげでセーフ3回",
        "gachaType": "leather",
        "questKey": "other-kurohige",
        "difficulty": 4,
        "flavor": "三避で試練を超えよ。"
    },
    {
        "game": "その他",
        "name": "潮流三連",
        "detail": "ミニゲームを連続クリア3回",
        "gachaType": "gun",
        "questKey": "other-mini",
        "difficulty": 4,
        "flavor": "潮流三連で勢いを掴め。"
    },
    {
        "game": "その他",
        "name": "防衛の連勝",
        "detail": "ボードゲームで2連勝",
        "gachaType": "staff",
        "questKey": "other-board",
        "difficulty": 4,
        "flavor": "防衛の連勝で陣地を守れ。"
    },
    {
        "game": "その他",
        "name": "黒旗の運命",
        "detail": "黒ひげで連続セーフ3回",
        "gachaType": "leather",
        "questKey": "other-kurohige",
        "difficulty": 5,
        "flavor": "黒旗の運命を味方にせよ。"
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
        "name": "大海防衛線",
        "detail": "ボードゲームで連勝2回",
        "gachaType": "shield",
        "questKey": "other-board",
        "difficulty": 5,
        "flavor": "大海防衛線で押し切れ。"
    },
    {
        "game": "その他",
        "name": "黒旗の運命・極",
        "detail": "黒ひげでセーフのみで勝利",
        "gachaType": "gun",
        "questKey": "other-kurohige",
        "difficulty": 6,
        "flavor": "黒旗の運命を味方にせよ。"
    },
    {
        "game": "その他",
        "name": "疾風の航路・極",
        "detail": "ミニゲームで連続パーフェクト2回",
        "gachaType": "staff",
        "questKey": "other-mini",
        "difficulty": 6,
        "flavor": "疾風の航路で完璧を刻め。"
    },
    {
        "game": "その他",
        "name": "大海防衛線・極",
        "detail": "ボードゲームで完全勝利",
        "gachaType": "shield",
        "questKey": "other-board",
        "difficulty": 6,
        "flavor": "完全勝利で防衛線を守り切れ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "協力防衛",
        "detail": "1対1でボードゲームを1回プレイ",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "防衛構え",
        "skillWeapon": "staff",
        "questKey": "other-board",
        "difficulty": 1,
        "flavor": "1対1の演習で準備を整えよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ援護",
        "detail": "1対1で黒ひげセーフ1回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "援護板",
        "skillWeapon": "staff",
        "questKey": "other-kurohige",
        "difficulty": 1,
        "flavor": "援護板で危機を避けろ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "連携小舟",
        "detail": "1対1でミニゲームを1回クリア",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "小舟支援",
        "skillWeapon": "axe",
        "questKey": "other-mini",
        "difficulty": 1,
        "flavor": "小舟支援で先に進め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "港湾演習・改",
        "detail": "1対1でボードゲームを2回プレイ",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "港湾演習・改",
        "skillWeapon": "sword",
        "questKey": "other-board",
        "difficulty": 2,
        "flavor": "港湾演習で備えを整えよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ援護・改",
        "detail": "1対1で黒ひげセーフ2回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒ひげ援護・改",
        "skillWeapon": "staff",
        "questKey": "other-kurohige",
        "difficulty": 2,
        "flavor": "援護の板で危機を避けよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "小舟連携・改",
        "detail": "1対1でミニゲームを2回クリア",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "小舟連携・改",
        "skillWeapon": "gun",
        "questKey": "other-mini",
        "difficulty": 2,
        "flavor": "小舟連携で前へ進め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "港湾迎撃",
        "detail": "1対1でボードゲームに勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "迎撃隊形",
        "skillWeapon": "polearm",
        "questKey": "other-board",
        "difficulty": 3,
        "flavor": "港湾迎撃で勝利を掴め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ包囲",
        "detail": "1対1で黒ひげ連続セーフ2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "包囲網",
        "skillWeapon": "dagger",
        "questKey": "other-kurohige",
        "difficulty": 3,
        "flavor": "包囲網で黒ひげを攻略せよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "潮流突破",
        "detail": "1対1でミニゲーム時間内クリア",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "潮流突破",
        "skillWeapon": "gun",
        "questKey": "other-mini",
        "difficulty": 3,
        "flavor": "潮流突破で進路を確保せよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "港湾迎撃・強",
        "detail": "1対1でボードゲーム1勝＋追加プレイ1回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "港湾迎撃・強",
        "skillWeapon": "gun",
        "questKey": "other-board",
        "difficulty": 4,
        "flavor": "迎撃の連戦で守り切れ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒ひげ包囲・弐",
        "detail": "1対1で黒ひげセーフ3回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒ひげ包囲・弐",
        "skillWeapon": "gun",
        "questKey": "other-kurohige",
        "difficulty": 4,
        "flavor": "包囲の圧で勝利を掴め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "疾風連携・弐",
        "detail": "1対1でミニゲームをパーフェクト1回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "疾風連携・弐",
        "skillWeapon": "gun",
        "questKey": "other-mini",
        "difficulty": 4,
        "flavor": "疾風連携で完璧を刻め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒旗の運命",
        "detail": "1対1で黒ひげ連続セーフ3回",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の運命",
        "skillWeapon": "gun",
        "questKey": "other-kurohige",
        "difficulty": 5,
        "flavor": "黒旗の運命を味方にせよ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "疾風連携",
        "detail": "1対1でミニゲームノーダメージクリア",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "疾風連携",
        "skillWeapon": "staff",
        "questKey": "other-mini",
        "difficulty": 5,
        "flavor": "疾風連携で無傷を狙え。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "大海防衛線",
        "detail": "1対1でボードゲーム連勝2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "防衛線強化",
        "skillWeapon": "gun",
        "questKey": "other-board",
        "difficulty": 5,
        "flavor": "防衛線を強化して勝ち切れ。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "黒旗の運命・極",
        "detail": "1対1で黒ひげセーフのみで勝利",
        "gachaType": "skill",
        "skillType": "passive",
        "skillName": "黒旗の運命・極",
        "skillWeapon": "gun",
        "questKey": "other-kurohige",
        "difficulty": 6,
        "flavor": "黒旗の運命で勝利を掴め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "疾風連携・極",
        "detail": "1対1でミニゲーム連続パーフェクト2回",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "疾風連携・極",
        "skillWeapon": "wand",
        "questKey": "other-mini",
        "difficulty": 6,
        "flavor": "疾風連携で完璧を刻め。"
    },
    {
        "game": "その他",
        "mode": "battle",
        "name": "大海防衛線・極",
        "detail": "1対1でボードゲーム完全勝利",
        "gachaType": "skill",
        "skillType": "weapon",
        "skillName": "防衛線強化・極",
        "skillWeapon": "blunt",
        "questKey": "other-board",
        "difficulty": 6,
        "flavor": "完全勝利で海を守り切れ。"
    }
]);

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

function getQuestDifficultyByBetAmount(amount) {
    switch (Number(amount)) {
        case 10:
            return 1;
        case 50:
            return 2;
        case 100:
            return 3;
        case 300:
            return 4;
        case 500:
            return 5;
        case 1000:
            return 6;
        default:
            return normalizeQuestDifficultyValue(DIFFICULTY_FALLBACK);
    }
}

function getQuestBetLabel() {
    const difficulty = getQuestDifficultyByBetAmount(_questBetAmount);
    return `難易度: ${getQuestDifficultyStars(difficulty)}`;
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

function getOrderElements() {
    return {
        total: document.getElementById('troyOrderTotal'),
        list: document.getElementById('troyOrderList'),
        status: document.getElementById('troyCheckoutStatus'),
        checkoutBtn: document.getElementById('btnTroyCheckout')
    };
}

function isTroyMember(status, playFabId) {
    const members = status?.members;
    if (!Array.isArray(members) || !playFabId) return false;
    const target = String(playFabId).toLowerCase();
    return members.some((member) => String(member?.playFabId || member?.id || '').toLowerCase() === target);
}

function updateOrderAvailability(isMember) {
    const menuButtons = document.querySelectorAll('.troy-menu-item-button[data-menu-id]');
    const canOrder = isMember && !_checkoutLocked;
    menuButtons.forEach((button) => {
        button.style.display = canOrder ? '' : 'none';
    });
    if (!canOrder) {
        closeMenuModal();
        closeOrderModal();
    }
    updateCheckoutStatus();
}

function updateTroyRoleUI() {
    const kingControls = document.getElementById('troyKingControls');
    const menuSection = document.getElementById('troyMenuSection');
    const questPanel = document.getElementById('troyQuestPanel');
    const questModal = document.getElementById('troyQuestQrModal');
    const isKingUser = isKing();

    if (kingControls) {
        kingControls.style.display = isKingUser ? 'block' : 'none';
    }
    if (menuSection) {
        menuSection.style.display = isKingUser ? 'none' : 'block';
    }
    if (questPanel) {
        questPanel.style.display = isKingUser ? 'none' : '';
        if (isKingUser) questPanel.classList.remove('active');
    }
    if (questModal && isKingUser) {
        questModal.style.display = 'none';
    }
}

function formatYen(value) {
    const amount = Number(value) || 0;
    return `¥${amount.toLocaleString('ja-JP')}`;
}

function updatePointsDisplays(points) {
    const value = Number(points);
    if (!Number.isFinite(value)) return;
    const currentPointsEl = document.getElementById('currentPoints');
    if (currentPointsEl) currentPointsEl.innerText = String(value);
    const globalPointsEl = document.getElementById('globalPoints');
    if (globalPointsEl) globalPointsEl.innerText = String(value);
}

function parseYenPrice(value) {
    const raw = String(value || '').replace(/[^\d]/g, '');
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : 0;
}

function renderOrderSummary() {
    const { total, list } = getOrderElements();
    if (total) total.textContent = formatYen(_orderTotal);
    if (!list) return;
    list.innerHTML = '';
    if (!_orderItems.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-checkout-empty';
        empty.textContent = '注文はまだありません';
        list.appendChild(empty);
        updateCheckoutStatus();
        return;
    }
    _orderItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'troy-checkout-item';
        const name = document.createElement('span');
        name.textContent = item.name;
        const price = document.createElement('span');
        price.textContent = formatYen(item.price * item.quantity);
        row.appendChild(name);
        row.appendChild(price);
        list.appendChild(row);
    });
    updateCheckoutStatus();
}

function updateCheckoutStatus() {
    const { status, checkoutBtn } = getOrderElements();
    const isMember = isTroyMember(_lastStatus, window.myPlayFabId);
    const pending = _checkoutLocked && _checkoutSession?.status === 'pending';
    if (status) {
        status.textContent = pending ? '承認待ち' : '未会計';
    }
    if (checkoutBtn) {
        const hasOrder = _orderTotal > 0;
        checkoutBtn.disabled = pending || !isMember || !hasOrder;
        checkoutBtn.textContent = pending ? '承認待ち' : '会計する';
    }
}

function applyCheckoutFromStatus(data) {
    const checkout = data?.checkout || null;
    const wasLocked = _checkoutLocked;
    const wasPending = _checkoutSession?.status === 'pending';

    if (checkout && checkout.status === 'pending') {
        _checkoutSession = checkout;
        _checkoutLocked = true;
        _orderItems = Array.isArray(checkout.items) ? checkout.items : [];
        _orderTotal = Number(checkout.total || 0);
        renderOrderSummary();
        return;
    }

    if (checkout && checkout.status === 'approved') {
        _checkoutSession = checkout;
        _checkoutLocked = false;
        resetOrderSummary();
        if (wasPending && typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計が承認されました。退店しました。');
        }
        return;
    }

    if (wasLocked && wasPending && !checkout) {
        _checkoutSession = null;
        _checkoutLocked = false;
        resetOrderSummary();
    }
}

function resetOrderSummary() {
    _orderTotal = 0;
    _orderItems = [];
    renderOrderSummary();
}

function addOrderItemLocal(name, price, quantity = 1) {
    const normalizedPrice = Number(price) || 0;
    if (!normalizedPrice) return;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    _orderTotal += normalizedPrice * qty;
    _orderItems.push({ name, price: normalizedPrice, quantity: qty });
    renderOrderSummary();
}

function getOrderModalElements() {
    return {
        modal: document.getElementById('troyOrderModal'),
        name: document.getElementById('troyOrderItemName'),
        price: document.getElementById('troyOrderItemPrice'),
        close: document.getElementById('troyOrderModalClose'),
        confirm: document.getElementById('troyOrderConfirm'),
        cancel: document.getElementById('troyOrderCancel')
    };
}

function openOrderModal(item) {
    const { modal, name, price } = getOrderModalElements();
    if (!modal || !name || !price) return;
    _pendingOrder = item;
    name.textContent = item.name;
    price.textContent = formatYen(item.price);
    modal.style.display = 'flex';
}

function closeOrderModal() {
    const { modal } = getOrderModalElements();
    if (modal) modal.style.display = 'none';
    _pendingOrder = null;
}

async function confirmOrder(playFabId) {
    if (!_pendingOrder) return;
    if (_checkoutLocked) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計待ちのため注文を追加できません。');
        }
        closeOrderModal();
        return;
    }
    if (!isTroyMember(_lastStatus, playFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから注文できます。');
        } else {
            alert('入店してから注文できます。');
        }
        closeOrderModal();
        return;
    }
    const item = _pendingOrder;
    const quantity = item.quantity || 1;
    const nextTotal = _orderTotal + item.price * quantity;
    _orderTotal = nextTotal;
    _orderItems.push({ name: item.name, price: item.price, quantity });
    renderOrderSummary();
    closeOrderModal();
    if (typeof window.showRpgMessage === 'function') {
        window.showRpgMessage('注文を追加しました。');
    }
}

async function submitCheckout(playFabId) {
    if (_checkoutLocked) return;
    if (!isTroyMember(_lastStatus, playFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから会計できます。');
        } else {
            alert('入店してから会計できます。');
        }
        return;
    }
    if (!_orderItems.length || _orderTotal <= 0) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計する注文がありません。');
        } else {
            alert('会計する注文がありません。');
        }
        return;
    }
    try {
        const result = await sendTroyCheckout(playFabId, {
            items: _orderItems,
            total: _orderTotal,
            displayName: getDisplayName()
        });
        if (result?.checkout) {
            _checkoutSession = result.checkout;
            _checkoutLocked = true;
            renderOrderSummary();
            updateOrderAvailability(isTroyMember(_lastStatus, playFabId));
            if (typeof window.showRpgMessage === 'function') {
                window.showRpgMessage('会計を送信しました。承認待ちです。');
            }
        }
    } catch (error) {
        console.warn('[TroyCheckout] Failed:', error?.message || error);
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計送信に失敗しました。');
        } else {
            alert('会計送信に失敗しました。');
        }
    }
}

function openMenuModal(menuId) {
    if (!isTroyMember(_lastStatus, window.myPlayFabId)) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('入店してから注文できます。');
        } else {
            alert('入店してから注文できます。');
        }
        return;
    }
    if (_checkoutLocked) {
        if (typeof window.showRpgMessage === 'function') {
            window.showRpgMessage('会計待ちのため注文できません。');
        }
        return;
    }
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
        const priceValue = parseYenPrice(item.price);
        row.addEventListener('click', () => {
            if (!priceValue) return;
            closeMenuModal();
            openOrderModal({ name: item.name, price: priceValue, quantity: 1 });
        });
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
    const orderModal = getOrderModalElements();
    if (close) {
        close.addEventListener('click', closeMenuModal);
    }
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeMenuModal();
        });
    }
    if (orderModal.close) {
        orderModal.close.addEventListener('click', closeOrderModal);
    }
    if (orderModal.cancel) {
        orderModal.cancel.addEventListener('click', closeOrderModal);
    }
    if (orderModal.modal) {
        orderModal.modal.addEventListener('click', (event) => {
            if (event.target === orderModal.modal) closeOrderModal();
        });
    }
    const menuButtons = Array.from(document.querySelectorAll('.troy-menu-item-button[data-menu-id]'));
    menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
            openMenuModal(button.dataset.menuId);
        });
    });
    if (orderModal.confirm) {
        orderModal.confirm.addEventListener('click', () => {
            confirmOrder(window.myPlayFabId);
        });
    }
    renderOrderSummary();
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
    const betDifficulty = getQuestDifficultyByBetAmount(_questBetAmount);
    const filteredQuests = quests.filter((quest) => resolveQuestDifficulty(quest) === betDifficulty);
    const expired = clearExpiredQuestSelections();
    if (expired) {
        saveQuestSelections(window.myPlayFabId);
    }
    if (!filteredQuests.length) {
        const empty = document.createElement('div');
        empty.className = 'troy-quest-empty';
        empty.textContent = '該当クエストがありません';
        container.appendChild(empty);
        return;
    }
    const sections = [{
        tier: 'bet',
        label: getQuestBetLabel(),
        quests: filteredQuests
    }];

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
            const isWeaponSkill = quest.skillType === 'weapon';
            const skillKind = isWeaponSkill ? '武器固定スキル' : 'パッシブスキル';
            const skillName = quest.skillName || '未設定スキル';
            const weaponLabel = isWeaponSkill
                ? TROY_GACHA_LABELS[quest.skillWeapon] || quest.skillWeapon || ''
                : '';
            const weaponSuffix = weaponLabel ? `（${weaponLabel}）` : '';
            gacha.textContent = `報酬: ${skillKind}『${skillName}』${weaponSuffix}`;
        } else {
            const label = TROY_GACHA_LABELS[quest.gachaType] || quest.gachaType;
            gacha.textContent = `報酬: ${label}`;
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
        const result = await usePoints(playFabId, betAmount, { isSilent: true });
        _questSelections[quest.questId] = {
            selectedAt: Date.now(),
            betAmount
        };
        saveQuestSelections(playFabId);
        scheduleQuestSelectionRefresh();
        if (_lastQuestList.length) {
            renderQuestList(_lastQuestList);
        }
        if (Number.isFinite(result?.newBalance)) {
            updatePointsDisplays(result.newBalance);
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
        const skillMeta = quest.gachaType === 'skill'
            ? {
                skillName: quest.skillName || '',
                skillType: quest.skillType || '',
                skillWeapon: quest.skillWeapon || ''
            }
            : {};
        const result = await claimTroyQuest(playFabId, quest.questId, quest.gameKey, quest.gachaType, {
            difficulty: resolveQuestDifficulty(quest),
            betAmount,
            ...skillMeta
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
    return `クエスト一覧: ${label} / ${getQuestModeLabel(_questMode)} / ${getQuestBetLabel()}`;
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

function wireQuestPanelPullToClose(panel, body, items) {
    if (!panel || !body) return;
    let pulling = false;
    let canPull = false;
    let startY = 0;
    let lastPull = 0;
    let baseOffset = 0;
    const closeThreshold = 70;
    const maxPull = 110;

    const onStart = (event) => {
        if (!panel.classList.contains('active')) return;
        if (body.scrollTop > 0) {
            canPull = false;
            return;
        }
        const touch = event.touches[0];
        if (!touch) return;
        pulling = true;
        canPull = true;
        startY = touch.clientY;
        lastPull = 0;
        baseOffset = panel.classList.contains('active') ? -16 : 0;
        panel.style.transition = 'none';
    };

    const onMove = (event) => {
        if (!pulling || !canPull) return;
        const touch = event.touches[0];
        if (!touch) return;
        const delta = touch.clientY - startY;
        if (delta <= 0) return;
        event.preventDefault();
        lastPull = Math.min(delta, maxPull);
        panel.style.transform = `translateY(${baseOffset + lastPull}px)`;
    };

    const onEnd = () => {
        if (!pulling) return;
        pulling = false;
        canPull = false;
        panel.style.transition = '';
        panel.style.transform = '';
        if (lastPull >= closeThreshold) {
            closeQuestPanel(items);
        }
        lastPull = 0;
    };

    body.addEventListener('touchstart', onStart, { passive: true });
    body.addEventListener('touchmove', onMove, { passive: false });
    body.addEventListener('touchend', onEnd, { passive: true });
    body.addEventListener('touchcancel', onEnd, { passive: true });
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
    const questPanelBody = document.querySelector('#troyQuestPanel .troy-quest-panel-body');
    wireQuestPanelPullToClose(panel, questPanelBody, questItems);
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
        joinBtn: document.getElementById('btnTroyJoin')
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
    if (!data?.isOpen) {
        renderEntryList([]);
    } else {
        renderEntryList(data?.members);
    }
    const isMember = isTroyMember(data, window.myPlayFabId);
    applyCheckoutFromStatus(data);
    updateOrderAvailability(isMember);
    if (!isMember && !_checkoutLocked) {
        resetOrderSummary();
    }
    updateTroyRoleUI();
}

async function refreshStatus(playFabId, options = {}) {
    if (!playFabId) return;
    const data = await getTroyStatus(playFabId, options);
    if (data) renderStatus(data);
}

function wireHandlers(playFabId) {
    if (_wired) return;
    _wired = true;

    const { joinBtn } = getTroyElements();
    const { checkoutBtn } = getOrderElements();
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            const name = getDisplayName();
            const wasMember = isTroyMember(_lastStatus, playFabId);
            const result = await joinTroy(playFabId, name);
            if (result) {
                await refreshStatus(playFabId, { isSilent: true });
                const isMember = isTroyMember(_lastStatus, playFabId);
                if (!wasMember && isMember) {
                    const entryPrice = 500;
                    addOrderItemLocal('入店チャージ', entryPrice, 1);
                }
            }
        });
    }
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async () => {
            await submitCheckout(playFabId);
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
    await refreshKingNav(playFabId);
    await refreshStatus(playFabId);
    updateTroyRoleUI();
    startPolling(playFabId);
}
