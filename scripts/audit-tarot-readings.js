#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const vm = require('vm');

const SOURCE_PATH = 'public/js/tarotReading.js';
const TOPIC_TABLES = {
    love: ['LOVE_MAJOR_READINGS', 'LOVE_MINOR_READINGS'],
    work: ['WORK_MAJOR_READINGS', 'WORK_MINOR_READINGS'],
    relation: ['RELATION_MAJOR_READINGS', 'RELATION_MINOR_READINGS'],
    future: ['FUTURE_MAJOR_READINGS', 'FUTURE_MINOR_READINGS']
};
const TOPIC_IDS = Object.keys(TOPIC_TABLES);
const SUBTOPIC_IDS = {
    love: ['feelings', 'direction', 'reconciliation', 'encounter', 'commitment'],
    work: ['current', 'evaluation', 'career_change', 'business', 'negotiation'],
    relation: ['friends', 'family', 'difficult', 'position', 'continue'],
    future: ['near', 'goal', 'choice', 'turning_point', 'preparation']
};
const MAJOR_KEYS = Array.from({ length: 22 }, (_, index) => String(index));
const SUITS = ['wand', 'cup', 'sword', 'pentacle'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'page', 'knight', 'queen', 'king'];
const ORIENTATIONS = ['upright', 'reversed'];
const VERDICT_BANDS = ['critical', 'warning', 'mixed', 'favorable', 'excellent'];
const VAGUE_ACTION_TEXT = ['頑張ってください', '前向きに考えてください', '意識してください', '気をつけてください'];
const HARD_STAFF_TEXT = [
    '局面', '許容範囲', '不確実性', '実現性', '継続性', '自己犠牲',
    'リソース', '再設計', '照合', '独善', '内省', '探求', '刷新', '終焉', '露呈',
    '節制', '帳尻', '萎縮', '因縁', '詰め甘さ', '継続量', '資源', '露見', '不誠実',
    '余波', '熟練', '境界線', '確認基準', '完了条件', '成り行き', '馴れ合い',
    '均衡', '拮抗', '専門性', '明文化', '相互理解'
];
const STAFF_GRAMMAR_FLAGS = [
    'するする', 'バレるする', 'ことしてください', 'はっきりしたに',
    '嘘・裏切りさ', 'をあるものとして', '自分からの自分からの',
    '見比べし', '大もと的', '大もと要因', '怖気づくして', 'はっきり決めする',
    'はっきり決めでき', 'やり直しする', '目的になってしています',
    '我慢や自分だけの我慢', '友人や仲間や状況',
    'その方法だけがそのやり方しか', '今すぐ使える時間・体力・資金',
    '費やしたものした', '必要な二人が', '転職がはっきり決め',
    'の受け取る余地', '投入した直近', '続けられるかが安定',
    '続けられるかが弱く', '過去の費やしたもの',
    '現在の改善した行動', '得た改善した行動',
    'をはっきりする', 'をはっきりして', 'がはっきりなり',
    '一つの約束を一つ', '一つの行動を一つ', '一つの役割を一つ'
];
const RED_FLAGS = {
    love: ['仕事', '職場', '業務', '事業', '会社', '売上', '利益', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '人間関係', 'コミュニティ', 'グループ', '人脈'],
    work: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', 'ワンナイト', '愛情', '伴侶'],
    relation: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談'],
    future: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '監査', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談']
};
const STAFF_TOPIC_VOCAB_FLAGS = {
    love: ['作業', '交渉', '資金', '予算', '報酬', '顧客', '成果', '担当', '責任者', '数値', '撤退基準', '追加投入', '投資', '所有', '品質', '技能', '道具'],
    work: ['好意', '愛情', '寂しさ', '恋心', '相思相愛', '純愛', '気持ちの有無より', '分かってくれるはず', '自分の感情が空'],
    relation: ['作業', '交渉', '資金', '予算', '報酬', '顧客', '成果', '担当', '責任者', '数値', '撤退基準', '追加投入', '投資', '所有', '品質', '技能', '売上', '利益'],
    future: ['好意', '愛情', '相思相愛', '純愛', '顧客', '部下', '上司', '気持ちの有無より', '分かってくれるはず']
};
const TEXT_QUALITY_FLAGS = [
    '向向見ず',
    '中取り半端',
    '見死なぬ',
    '気づした',
    '最悪 of 最悪',
    'ガラクラ',
    '読み干',
    '往期',
    '早めにに',
    '大きくも悪くも',
    '最初の費やしたもの',
    'このまま進むと、押し続けると',
    '将来の話がはっきり決め',
    '引き直すどこまで許すか',
    '隠し事がバレる・'
];
const LINE_FORBIDDEN_TEXT = [
    'このカードの意味',
    '結論:',
    '現在地:',
    '次の一手:',
    '禁じ手:',
    '船長からの一言',
    '船長の結び',
    '一言判定',
    'お客様へ伝える鑑定',
    'スタッフ補助',
    '追記:'
];
const STAFF_FORBIDDEN_TEXT = [
    'お前さん',
    'ククク',
    '一言判定',
    '船長からの一言',
    '船長の結び',
    'スタッフ補助'
];
const SUBTOPIC_CONTEXT_FLAGS = {
    'love.feelings': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.direction': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.reconciliation': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'love.encounter': ['今の２人', '付き合ったり結ばれたり', 'パートナーとの絆', '冷めきった関係', '手に入れた相手', '２人の状況', '家庭内の財産争い', '目の前の相手を絶対に手に入れたい', 'この関係を進めたいなら'],
    'love.commitment': ['新しい出会い', 'お見合い', '次の恋へ', '別の獲物'],
    'work.current': ['経営者から自滅', '新規投資を止め', 'キャッシュを傷つけず'],
    'work.evaluation': ['転職や撤退', '次のキャリア', '会社が事実上の破産', '倒産のどん底', '不採算部門や合わない職場', '新規投資', '黒字倒産', '資金ショート', '部下や取引先に対して毅然'],
    'work.career_change': ['資金繰り', '予算を動かしな', '新規事業', '事業計画', '売上という分け前', '部下ども', 'クライアント', '自社のリソース', 'プロジェクト運営'],
    'work.negotiation': ['チームビルディング', 'プロジェクト運営', '部下にどんな', 'パワハラ上司', '一斉離職', '転職や撤退', '昇進のチャンス'],
    'relation.friends': ['相手の感情の引き具合', 'ドン引きの暗礁', '恋人からすれば'],
    'relation.family': ['新たな出会い', '新しい出会い', 'あのグループ', '新しい人脈', 'コミュニティ', '新しい友達', 'グループから', '仲間たち', '仲間だと思って', '新天地（新しい人間関係）', '幻影の仲間', '合わないグループ', '派手な人脈', '周囲の仲間', '異なるグループ', 'ポジションや友人', '別の楽そうなコミュニティ'],
    'relation.continue': ['新たな出会い', 'あのグループ', '新しい人脈']
};

const SUBTOPIC_STAFF_CONTEXT_FLAGS = {
    'love.feelings': ['目的、現在地、次の確認地点', '相手が動ける形', '支出、時間、援助', '使えるものや気力', '新しい約束を止め、最も損', '育てたい対象を一つ', '自分で維持できているもの', '得られた進展を一つ認め', '条件、手数料、責任、見返り', '相手の長所を一つ認め', '注目を集めることが目的', '何に脅威を感じたのか', '不機嫌で周囲を動かす', '最も効果の高い次に自分から取る行動', '周囲の準備を見ずに突進', '次の動きを一度止め、相手の反応', '勢いを勇気と取り違えると、自分だけでなく周囲', '動き始めた兆候を一つ選び、準備済みの案', '自分が差し出すものと相手に求めるもの', '気持ちが通じたと感じただけで', '隠し事はバレるものとして', '言い訳を増やすほど', '守りたい約束や関係を一つ選び', '伝統が続いている理由'],
    'love.direction': ['支えてくれた人へ感謝', '確認できた事実、選択肢、失うもの'],
    'love.reconciliation': ['元の相手が意見を言える余地', '一人で考える時間を確保', '動き始めた兆候を一つ選び', '人に見せる成功を外しても', '空白を贅沢や賞賛で', '利用できる支援を一つ調べ', 'プライドで助けを拒むと', '最優先の決断を一つ下し', '速さの中で元の相手'],
    'love.encounter': ['二人が次に何をするか', '復縁を現実にする', '交際や結婚の約束', 'これから出会う相手が動ける', '未完了の項目', 'これから出会う相手の反応', '負う責任を同じ基準', 'これから出会う相手を負かす', '反応する前にこれから出会う相手の要求', '続ける最低条件と確認期限', 'これから出会う相手を制限', '方向性が違う点を一つ選び', '接触や使用の上限', '守るものを一つだけ選び', '全員に良い顔をすると', '理想を一つの行動', '希望だけを守って行動', '望んでいる結果と現在の紹介', '疑いそのものが今ある関係や判断', '連絡、相談、援助のうち', 'これから出会う相手を落ち着かせる', '感情的な要求にも即答せず', '冷静さを保つことと、本音を隠して'],
    'love.commitment': ['得意な人へ正しく任せ', '権威で反対を消す', '残せる資産・経験・関係', '育てたい対象を一つ', '恵まれている時ほど管理', '二人の将来をはっきり決める話し合いを決め', '失敗しても戻せる最小単位まで二人の将来', '失ったものと残っているものを二列', '喪失を見続けると'],
    'work.career_change': ['予算を動かす', '顧客を増やす', '部下へ任せる', '商談をまとめる', '接触や関与を段階的', '変えていない手順を一つ選び', '同じ転職先や採用側へ', '自分が差し出すものと転職先', '守るものを一つだけ選び', '残っている危険を一つに絞り', '曖昧な提案へ具体的な返答期限', '届いた提案や申し出を一つ選び', '人に見せる成功を外しても', '空白を贅沢や賞賛で', '得られた成果を一つ認め', '満足を停止の理由', '受けられる支援を一つ受け取り', '改善の兆しを完全回復'],
    'work.evaluation': ['自分が何を感じているかを正確に扱う', '人や使えるものを縛る', '自分が差し出すものと評価を決める相手', '残った選択肢から、最も確実に試せる', '感情的な要求にも即答せず', '冷静さを保つことと、本音を隠して', '将来へつながる最初の投入や着手', '使われない使えるもの', '不足している資金・技能・合意', '早く取り戻そうと条件の悪い話', '離れる理由と戻らない条件', '罪悪感だけで残ると'],
    'work.business': ['収入・体力・信頼', '今の状況から持っていくもの', '動けない原因を一つ特定し、場所を変える前', '環境だけを変えても、未処理の問題', '戻らない事実を一つ認め', '過去を正解に変えようと', '感情的な要求にも即答せず', '冷静さを保つことと、本音を隠して'],
    'work.current': ['残せる資産・経験・関係', '方向性が違う点を一つ選び', '守るものを一つだけ選び', '全員に良い顔をすると', '失敗しても戻せる最小単位まで最優先の作業', '次の動きを一度止め、関係者の反応', '勢いを勇気と取り違えると、自分だけでなく周囲'],
    'work.negotiation': ['伸ばす技能を一つに絞り', '不足している資金・技能・合意', '必要な技能、担当、完成基準', '任せる・止める・後へ回す', '愚痴や陰口が中心', '仲間外れを恐れて', '続けたい未来像', '平和を守るために違い', '人に見せる成功を外して', '空白を贅沢や賞賛で', '支えてくれた人へ感謝', '保留している片づけ・連絡・解約', '使える人・道具・経験', '準備や説明だけを増やす', '湧いている意欲を一言', '意欲が強いことを正しさ'],
    'relation.friends': ['相手の感情の引き具合', '未完了の項目', '準備済みの案をすぐ試せる形', '最も効果の高い信頼を確かめる', '今の状況から持っていくもの', '振り返るたびに戻ると', '動けない原因を一つ特定し、場所を変える前', '環境だけを変えても、未処理の問題', '公開する情報、守る情報', '戦略を言い訳に嘘や裏切り', '隠し事はバレるものとして', '言い訳を増やすほど', '続ける行動を一つに絞り', '残っている危険を一つに絞り', '全方向を警戒し続ける', '戻らない事実を一つ認め', '過去を正解に変えようと'],
    'relation.position': ['将来へつながる最初の働きかけ', '変えていない手順を一つ選び', '絶対に守るものと、使うことで価値', '失う恐れから人や使えるものを縛る', '支出、時間、援助のうち', '見栄や一時的な安心のための流出', '利用できる支援を一つ調べ', 'プライドで助けを拒むと', '受けられる支援を一つ受け取り', '改善の兆しを完全回復'],
    'relation.family': ['家族や仲間だから', '仲間外れを恐れて', '噂と確かな情報', '最も効果の高い家族と決め直す役割', '周囲の準備を見ずに突進', '次の動きを一度止め、家族の反応', '勢いを勇気と取り違えると、自分だけでなく周囲', '危機を招いた原因を一つ除き', '助かった安心で以前の形へ戻る'],
    'relation.difficult': ['家族や仲間だから', '仲間外れを恐れて', '最優先の一件だけを再開', '候補を比べ、選ぶ理由', '候補を本当にできるか', '自分が差し出すものと苦手な相手', '達成できた理由を一つ記録', '安心して見張りを止める', '何に脅威を感じたのか', '不機嫌で周囲を動かす', '苦手な相手の長所を一つ認め', '注目を集めることが目的', '二つの選択肢の損を比べ', '判断に必要な情報と期限', '見ないことで平穏を保つ', '動けない原因を一つ特定し、場所を変える前', '環境だけを変えても、未処理の問題', '約束した内容と実際に出せるもの', '小さな不足を隠すために', '隠し事はバレるものとして', '言い訳を増やすほど', '得意なこと、役割、約束の基準', '協力という名で責任を曖昧'],
    'relation.continue': ['家族や仲間だから', '仲間外れを恐れて', '収入・体力・信頼', '候補を本当にできるか', '始められない自分', '速さの中で縁を続けるか', '受け入れられた行動を記録', '称賛を実力の保証', '後回しにした約束を一つ終え', '楽な方法へ次々と移る', '反応が弱い理由を縁を続けるか'],
    'future.near': ['今すぐ使える時間・体力・資金', 'の中で最も重要な一線', '収入・体力・信頼', '伸ばす技能を一つに絞り', '積み上がり始めた信用', '未完成の作業を一つ終え', '楽な方法へ次々と移る', '動き始めた兆候を一つ選び、準備済みの案', '目標、先にやる順番、やらないこと', '遅れを環境や直近で関わる人'],
    'future.choice': ['選択に関わる人に求める', '完全に分かり合えた', '最も効果の高い選択肢を比べる', '連絡、相談、援助のうち', '選択に関わる人を落ち着かせる', '愚痴や陰口が中心の場', '未完成の作業を一つ終え', '受け入れないこととその理由を一つ', '未完了の項目を一つに絞り', '完了した条件を確認し', '止まっている理由を能力・環境・恐れ', '始められない自分という思い込み', '選択肢を比べる具体的な確認項目', '勢いを宣言だけで使い切る', '危機を招いた原因を一つ除き', '助かった安心で以前の形へ戻る', '反応が弱い理由を選択に関わる人'],
    'future.turning_point': ['期限と責任者', '新しい出会いや別れ', '譲れない成果と失いたくない信頼', '変化に関わる相手を負かす', '自分が差し出すものと変化に関わる相手', '直結しない作業や交渉', '伸ばす技能を一つに絞り', '未完成の作業を一つ終え', '利用できる支援を一つ調べ', '受けられる支援を一つ受け取り', '何に脅威を感じたのか', '不機嫌で周囲を動かす', '支出、時間、援助のうち漏れ', '見栄や一時的な安心', '未完了の項目を一つに絞り', 'ほぼ完成という言葉で止めると'],
    'future.goal': ['最初の投入や着手', '使われない使えるもの', '使えるものを集中', '残っている危険を一つに絞り', '何が起きたかを評価や推測', '痛みを返すことへ', '連絡、相談、援助のうち', '目標に関わる人を落ち着かせる'],
    'future.preparation': ['受け入れないこととその理由', '今ある関係や判断', '誰が何を持ち、決め、負担するか', '最も近い関係から壊れます', '先に補う一つの弱点', '収入・体力・信頼', '候補を二つまでに絞り、それぞれで得られるもの', '残った選択肢から、最も確実に試せる', '候補を本当にできるか、代償、続けられるか', '方向性が違う点を一つ選び', '仲良く見せることを優先', '周囲の人と大切にしたい価値', '平和を守るために違いを隠す', '続ける最低条件と確認期限', '一度築いたものを理由に残る', '恐れていることを事実と想像', '先に攻撃して身を守ろう', '未完了の項目を一つに絞り', 'ほぼ完成という言葉で止めると', '失ったものと残っているものを二列', '喪失を見続けると']
};

function loadTables() {
    const code = fs.readFileSync(SOURCE_PATH, 'utf8');
    const context = {
        window: {},
        document: {
            querySelectorAll: () => [],
            querySelector: () => null,
            getElementById: () => null,
            createElement: () => ({})
        },
        console,
        setTimeout,
        clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(`${code}
this.__tarotAudit = {
  LOVE_MAJOR_READINGS,
  LOVE_MINOR_READINGS,
  WORK_MAJOR_READINGS,
  WORK_MINOR_READINGS,
  RELATION_MAJOR_READINGS,
  RELATION_MINOR_READINGS,
  FUTURE_MAJOR_READINGS,
  FUTURE_MINOR_READINGS,
  MAJOR_CARD_WORDS,
  MINOR_CARD_WORDS,
  STAFF_TOPIC_FRAMES,
  STAFF_SIMPLE_MEANING_CONTEXTS,
  SUBTOPIC_STAFF_CONTEXTS,
  SUBTOPICS,
  SUBTOPIC_READING_FRAMES,
  SUBTOPIC_VERDICTS,
  SUBTOPIC_FORECASTS,
  SUBTOPIC_WEATHER_OVERRIDES,
  SUBTOPIC_LINE_BODY_OVERRIDES,
  THREE_CARD_SPREAD_FRAMES,
  THREE_CARD_FLOW_TEXT,
  MAJOR_STAFF_GUIDANCE,
  MINOR_STAFF_GUIDANCE,
  MAJOR_WEATHER_LEVELS,
  MINOR_WEATHER_LEVELS,
  TOPICS,
  allCards,
  getWeatherStatus,
  getReadingWeatherStatus,
  getVerdictBand,
  getSubtopicVerdict,
  getSubtopicForecast,
  getSubtopicLineBody,
  getThreeCardSpreadFrame,
  getThreeCardWeatherStatus,
  getThreeCardFlow,
  getThreeCardPattern,
  getThreeCardVerdict,
  getThreeCardPositionReading,
  getStaffGuidance,
  makeStaffTextPlain,
  takePlainStaffSentences,
  getSubtopicReadingFrame,
  getSpecialReadingBody,
  buildStaffReading,
  buildLineReading,
  buildThreeCardStaffReading,
  buildThreeCardLineReading,
  buildThreeCardNearFuture,
  buildThreeCardLineClosing
};`, context);
    return context.__tarotAudit;
}

function collectSourceReadings(tables) {
    const readings = [];
    Object.entries(TOPIC_TABLES).forEach(([topicId, [majorName, minorName]]) => {
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                readings.push({
                    topicId,
                    loc: `major_${number.padStart(2, '0')}`,
                    orientation,
                    text: String(tables[majorName]?.[number]?.[orientation] || '').trim()
                });
            });
        });
        SUITS.forEach((suit) => {
            RANKS.forEach((rank) => {
                ORIENTATIONS.forEach((orientation) => {
                    readings.push({
                        topicId,
                        loc: `${suit}_${rank}`,
                        orientation,
                        text: String(tables[minorName]?.[suit]?.[rank]?.[orientation] || '').trim()
                    });
                });
            });
        });
    });
    return readings;
}

function collectGeneratedReadings(tables) {
    const generated = [];
    tables.TOPICS.forEach((topic) => {
        topic.subtopics.forEach((subtopic) => {
            tables.allCards.forEach((card) => {
                ORIENTATIONS.forEach((orientation) => {
                    const sourceText = String(tables.getSpecialReadingBody(topic.id, card, orientation) || '').trim();
                    generated.push({
                        topicId: topic.id,
                        subtopicId: subtopic.id,
                        subtopicLabel: subtopic.label,
                        loc: card.id,
                        orientation,
                        sourceText,
                        lineBody: String(tables.getSubtopicLineBody(topic.id, subtopic, card, orientation, sourceText) || '').trim(),
                        readingWeather: tables.getReadingWeatherStatus(topic.id, subtopic, card, orientation),
                        verdict: tables.getSubtopicVerdict(topic.id, subtopic, card, orientation),
                        forecast: tables.getSubtopicForecast(topic.id, subtopic, card, orientation),
                        staffText: String(tables.buildStaffReading(topic, card, orientation, subtopic) || '').trim(),
                        lineText: String(tables.buildLineReading(card, orientation, sourceText, topic, subtopic) || '').trim()
                    });
                });
            });
        });
    });
    return generated;
}

function createThreeCardSelections(tables, candidate, orientation, candidatePosition) {
    const companionIds = ['major-14', 'cup-2', 'sword-6', 'pentacle-8', 'wand-4'];
    const used = new Set([candidate.id]);
    const selections = Array(3).fill(null);
    selections[candidatePosition] = { card: candidate, orientation };
    for (let index = 0; index < selections.length; index += 1) {
        if (selections[index]) continue;
        const companionId = companionIds.find((cardId) => !used.has(cardId));
        const card = tables.allCards.find((entry) => entry.id === companionId);
        used.add(companionId);
        selections[index] = { card, orientation: index === 1 ? 'reversed' : 'upright' };
    }
    return selections;
}

function collectGeneratedThreeCardReadings(tables) {
    const generated = [];
    tables.TOPICS.forEach((topic) => {
        topic.subtopics.forEach((subtopic) => {
            const positions = tables.getThreeCardSpreadFrame(topic.id, subtopic);
            tables.allCards.forEach((card) => {
                ORIENTATIONS.forEach((orientation) => {
                    positions.forEach((position, candidatePosition) => {
                        const selections = createThreeCardSelections(tables, card, orientation, candidatePosition);
                        const weather = tables.getThreeCardWeatherStatus(topic.id, subtopic, selections);
                        generated.push({
                            topicId: topic.id,
                            subtopicId: subtopic.id,
                            subtopicLabel: subtopic.label,
                            loc: card.id,
                            orientation,
                            candidatePosition,
                            positions,
                            selections,
                            positionReading: tables.getThreeCardPositionReading(
                                topic,
                                subtopic,
                                selections[candidatePosition],
                                position,
                                candidatePosition
                            ),
                            weather,
                            flow: tables.getThreeCardFlow(weather?.levels),
                            pattern: tables.getThreeCardPattern(selections),
                            verdict: tables.getThreeCardVerdict(topic.id, subtopic, weather?.level),
                            staffText: String(tables.buildThreeCardStaffReading(topic, selections, subtopic) || '').trim(),
                            lineText: String(tables.buildThreeCardLineReading(topic, selections, subtopic) || '').trim()
                        });
                    });
                });
            });
        });
    });
    return generated;
}

function findDuplicateTexts(entries, key) {
    const duplicates = [];
    const seen = new Map();
    entries.forEach((entry) => {
        const value = entry[key];
        if (!value) return;
        const identity = `${entry.topicId}:${entry.subtopicId || '-'}:${entry.loc}:${entry.orientation}`;
        if (seen.has(value)) duplicates.push([seen.get(value), identity]);
        else seen.set(value, identity);
    });
    return duplicates;
}

function collectCoverageGaps(tables) {
    const gaps = [];
    TOPIC_IDS.forEach((topicId) => {
        ['meaningContext', 'pointLead', 'actionLead', 'cautionLead', 'subject', 'target', 'evidence', 'step', 'resource', 'boundary', 'result', 'support'].forEach((field) => {
            if (!String(tables.STAFF_TOPIC_FRAMES?.[topicId]?.[field] || '').trim()) gaps.push(`frame:${topicId}.${field}`);
        });
        const expectedSubtopics = SUBTOPIC_IDS[topicId];
        const actualSubtopics = (tables.SUBTOPICS?.[topicId] || []).map((subtopic) => subtopic.id);
        if (actualSubtopics.join(',') !== expectedSubtopics.join(',')) {
            gaps.push(`subtopics:${topicId}:${actualSubtopics.join(',') || 'empty'}`);
        }
        expectedSubtopics.forEach((subtopicId) => {
            const frame = tables.SUBTOPIC_READING_FRAMES?.[topicId]?.[subtopicId];
            const staffContext = tables.SUBTOPIC_STAFF_CONTEXTS?.[topicId]?.[subtopicId];
            ['meaningContext', 'pointLead', 'actionLead', 'cautionLead', 'subject', 'target', 'evidence', 'step', 'resource', 'boundary', 'result', 'support'].forEach((field) => {
                if (!String(frame?.[field] || '').trim()) gaps.push(`subtopic-frame:${topicId}.${subtopicId}.${field}`);
            });
            ['major', ...SUITS].forEach((cardGroup) => {
                const focus = frame?.focus?.[cardGroup];
                if (!Array.isArray(focus) || focus.length !== 2 || focus.some((text) => !String(text || '').trim())) {
                    gaps.push(`subtopic-focus:${topicId}.${subtopicId}.${cardGroup}`);
                }
            });
            ['action', 'caution'].forEach((field) => {
                if (!String(staffContext?.[field] || '').trim()) gaps.push(`subtopic-staff-context:${topicId}.${subtopicId}.${field}`);
            });
            VERDICT_BANDS.forEach((band) => {
                const verdict = tables.SUBTOPIC_VERDICTS?.[topicId]?.[subtopicId]?.[band];
                if (!String(verdict?.staff || '').trim()) gaps.push(`subtopic-verdict:${topicId}.${subtopicId}.${band}.staff`);
                if (!String(verdict?.line || '').trim()) gaps.push(`subtopic-verdict:${topicId}.${subtopicId}.${band}.line`);
                if (!String(tables.SUBTOPIC_FORECASTS?.[topicId]?.[subtopicId]?.[band] || '').trim()) {
                    gaps.push(`subtopic-forecast:${topicId}.${subtopicId}.${band}`);
                }
            });
            const threeCardFrame = tables.THREE_CARD_SPREAD_FRAMES?.[topicId]?.[subtopicId];
            if (!Array.isArray(threeCardFrame) || threeCardFrame.length !== 3) {
                gaps.push(`three-card-frame:${topicId}.${subtopicId}`);
            } else {
                const positionIds = new Set();
                threeCardFrame.forEach((position, index) => {
                    ['id', 'role', 'label', 'focus'].forEach((field) => {
                        if (!String(position?.[field] || '').trim()) gaps.push(`three-card-frame:${topicId}.${subtopicId}.${index}.${field}`);
                    });
                    if (positionIds.has(position.id)) gaps.push(`three-card-frame-duplicate:${topicId}.${subtopicId}.${position.id}`);
                    if (!['state', 'hidden', 'obstacle', 'action', 'outcome', 'resource', 'cost', 'decision'].includes(position.role)) {
                        gaps.push(`three-card-frame-role:${topicId}.${subtopicId}.${index}.${position.role}`);
                    }
                    positionIds.add(position.id);
                });
            }
        });
    });
    ['favorable', 'difficult', 'recovery', 'decline', 'volatile', 'steady', 'mixed'].forEach((flowId) => {
        if (!String(tables.THREE_CARD_FLOW_TEXT?.[flowId]?.staff || '').trim()) gaps.push(`three-card-flow:${flowId}.staff`);
        if (!String(tables.THREE_CARD_FLOW_TEXT?.[flowId]?.line || '').trim()) gaps.push(`three-card-flow:${flowId}.line`);
    });
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            ORIENTATIONS.forEach((orientation) => {
                const weatherLevel = tables.MINOR_WEATHER_LEVELS?.[suit]?.[rank]?.[orientation];
                if (!Number.isInteger(weatherLevel) || weatherLevel < 1 || weatherLevel > 10) {
                    gaps.push(`weather:${suit}_${rank}:${orientation}`);
                }
                if (!String(tables.MINOR_CARD_WORDS?.[suit]?.[rank]?.[orientation] || '').trim()) {
                    gaps.push(`word:${suit}_${rank}:${orientation}`);
                }
                ['point', 'action', 'caution'].forEach((field) => {
                    if (!String(tables.MINOR_STAFF_GUIDANCE?.[suit]?.[rank]?.[orientation]?.[field] || '').trim()) {
                        gaps.push(`guidance:${suit}_${rank}:${orientation}.${field}`);
                    }
                });
            });
        });
    });
    MAJOR_KEYS.forEach((number) => {
        ORIENTATIONS.forEach((orientation) => {
            const weatherLevel = tables.MAJOR_WEATHER_LEVELS?.[number]?.[orientation];
            if (!Number.isInteger(weatherLevel) || weatherLevel < 1 || weatherLevel > 10) {
                gaps.push(`weather:major_${number}:${orientation}`);
            }
            if (!String(tables.MAJOR_CARD_WORDS?.[Number(number)]?.[orientation] || '').trim()) {
                gaps.push(`word:major_${number}:${orientation}`);
            }
            ['point', 'action', 'caution'].forEach((field) => {
                if (!String(tables.MAJOR_STAFF_GUIDANCE?.[Number(number)]?.[orientation]?.[field] || '').trim()) {
                    gaps.push(`guidance:major_${number}:${orientation}.${field}`);
                }
            });
        });
    });
    Object.entries(tables.SUBTOPIC_WEATHER_OVERRIDES || {}).forEach(([topicId, subtopics]) => {
        Object.entries(subtopics || {}).forEach(([subtopicId, entries]) => {
            if (!SUBTOPIC_IDS[topicId]?.includes(subtopicId)) gaps.push(`weather-override-subtopic:${topicId}.${subtopicId}`);
            Object.entries(entries || {}).forEach(([key, level]) => {
                const separatorIndex = key.lastIndexOf(':');
                const cardId = key.slice(0, separatorIndex);
                const orientation = key.slice(separatorIndex + 1);
                if (!tables.allCards.some((card) => card.id === cardId) || !ORIENTATIONS.includes(orientation)) {
                    gaps.push(`weather-override-card:${topicId}.${subtopicId}.${key}`);
                }
                if (!Number.isInteger(level) || level < 1 || level > 10) gaps.push(`weather-override-level:${topicId}.${subtopicId}.${key}`);
            });
        });
    });
    Object.entries(tables.SUBTOPIC_LINE_BODY_OVERRIDES || {}).forEach(([topicId, subtopics]) => {
        Object.entries(subtopics || {}).forEach(([subtopicId, entries]) => {
            if (!SUBTOPIC_IDS[topicId]?.includes(subtopicId)) gaps.push(`line-override-subtopic:${topicId}.${subtopicId}`);
            Object.entries(entries || {}).forEach(([key, body]) => {
                const separatorIndex = key.lastIndexOf(':');
                const cardId = key.slice(0, separatorIndex);
                const orientation = key.slice(separatorIndex + 1);
                if (!tables.allCards.some((card) => card.id === cardId) || !ORIENTATIONS.includes(orientation)) {
                    gaps.push(`line-override-card:${topicId}.${subtopicId}.${key}`);
                }
                if (!String(body || '').trim()) gaps.push(`line-override-body:${topicId}.${subtopicId}.${key}`);
            });
        });
    });
    return gaps;
}

function parseStaffSections(text) {
    const sections = {};
    String(text || '').split(/\n{2,}/).forEach((section) => {
        const separatorIndex = section.indexOf(':');
        if (separatorIndex <= 0) return;
        sections[section.slice(0, separatorIndex)] = section.slice(separatorIndex + 1).trim();
    });
    return sections;
}

function hasAdjacentDuplicateSentence(text) {
    const sentences = String(text || '')
        .match(/[^。！？!?\n]+[。！？!?]?/g)?.map((sentence) => sentence.trim().replace(/^[^:：]+[:：]\s*/, ''))
        .filter((sentence) => sentence.length >= 8) || [];
    return sentences.some((sentence, index) => index > 0 && sentence === sentences[index - 1]);
}

function containsAllSentences(text, expected) {
    const sentences = String(expected || '').match(/[^。！？!?]+[。！？!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
    return sentences.length > 0 && sentences.every((sentence) => String(text || '').includes(sentence));
}

function scoreGeneratedReading(entry, tables) {
    const sections = parseStaffSections(entry.staffText);
    const topic = tables.TOPICS.find((item) => item.id === entry.topicId);
    const subtopic = tables.SUBTOPICS[entry.topicId]?.find((item) => item.id === entry.subtopicId);
    const card = tables.allCards.find((item) => item.id === entry.loc);
    const frame = tables.getSubtopicReadingFrame(entry.topicId, entry.subtopicId);
    const guidance = tables.getStaffGuidance(entry.topicId, card, entry.orientation, subtopic);
    const cardGroup = card?.kind === 'major' ? 'major' : card?.suitId;
    const focus = tables.takePlainStaffSentences(frame?.focus?.[cardGroup]?.[0]);
    const lineFocus = frame?.focus?.[cardGroup]?.[1]?.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim() || '';
    const lineBody = entry.lineBody.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim() || '';
    const context = tables.SUBTOPIC_STAFF_CONTEXTS?.[entry.topicId]?.[entry.subtopicId];
    let score = 0;

    if (sections['結論']?.startsWith(`現在の風向きは${entry.readingWeather?.windLabel}です。`)) score += 0.75;
    if (containsAllSentences(sections['結論'], tables.takePlainStaffSentences(entry.verdict?.staff, 2))) score += 0.75;
    if (sections['現状と理由']?.includes(`${tables.STAFF_SIMPLE_MEANING_CONTEXTS?.[entry.topicId]?.[entry.subtopicId]}「`)) score += 0.5;
    if (focus && sections['現状と理由']?.includes(focus)) score += 0.75;
    if (guidance?.cardPoint && containsAllSentences(sections['現状と理由'], guidance.cardPoint)) score += 0.75;
    if (sections['近未来'] === tables.makeStaffTextPlain(entry.forecast)) score += 1.5;
    if (context?.action && sections['対策']?.startsWith(context.action)) score += 0.75;
    if (/ください。?$/.test(sections['対策'] || '')) score += 0.5;
    if ((sections['対策']?.match(/。/g)?.length || 0) >= 2) score += 0.25;
    if (context?.caution && sections['注意点']?.startsWith(context.caution)) score += 0.75;
    if (guidance?.caution && containsAllSentences(sections['注意点'], guidance.caution)) score += 0.5;
    if ((sections['注意点']?.match(/。/g)?.length || 0) >= 2) score += 0.25;
    if (entry.lineText.startsWith(`風向き: ${entry.readingWeather?.windLabel}\n\n`)) score += 0.5;
    if (containsAllSentences(entry.lineText, entry.verdict?.line)) score += 0.5;
    if (lineFocus && entry.lineText.includes(lineFocus)) score += 0.5;
    if (lineBody && entry.lineText.includes(lineBody)) score += 0.5;

    if (!topic || !subtopic || STAFF_GRAMMAR_FLAGS.some((word) => entry.staffText.includes(word))) score = Math.min(score, 7.5);
    return Math.round(score * 100) / 100;
}

function scoreThreeCardReading(entry, tables) {
    const sections = entry.staffText.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
    const topic = tables.TOPICS.find((item) => item.id === entry.topicId);
    const subtopic = tables.SUBTOPICS[entry.topicId]?.find((item) => item.id === entry.subtopicId);
    const readings = entry.positions.map((position, index) => tables.getThreeCardPositionReading(
        topic,
        subtopic,
        entry.selections[index],
        position,
        index
    ));
    const expectedForecast = tables.buildThreeCardNearFuture(topic, subtopic, readings, entry.weather);
    const expectedClosing = tables.buildThreeCardLineClosing(readings, entry.flow?.line);
    let score = 0;

    if (sections[1]?.startsWith(`結論: 現在の風向きは${entry.weather?.windLabel}です。`)) score += 0.5;
    if (containsAllSentences(sections[1], tables.takePlainStaffSentences(entry.verdict?.staff, 2))) score += 0.5;
    if (containsAllSentences(sections[1], tables.takePlainStaffSentences(entry.flow?.staff))) score += 0.5;
    readings.forEach((reading, index) => {
        if (sections[2]?.includes(`${index + 1}枚目・${tables.makeStaffTextPlain(reading.position.label)}: ${reading.card.label} /`)) score += 0.5;
    });
    if (sections[2]?.includes('三枚をつなぐと、')) score += 0.5;
    if (!entry.pattern?.staff || containsAllSentences(sections[2], entry.pattern.staff)) score += 0.5;
    if (sections[3] === `近未来: ${expectedForecast}`) score += 1.5;
    if (sections[4] === `対策: ${readings[2]?.action}`) score += 1.5;
    if (sections[5] === `注意点: ${readings[1]?.warning}`) score += 1.5;
    if (entry.lineText.startsWith(`風向き: ${entry.weather?.windLabel}\n\n`)) score += 0.5;
    if (readings.every((reading, index) => entry.lineText.includes(`${index + 1}枚目「${reading.position.label}」`) && entry.lineText.includes(reading.line))) score += 0.5;
    if (expectedClosing && entry.lineText.endsWith(expectedClosing)) score += 0.5;

    if (!topic || !subtopic || STAFF_GRAMMAR_FLAGS.some((word) => entry.staffText.includes(word))) score = Math.min(score, 7.5);
    return Math.round(score * 100) / 100;
}

function summarizeScores(scores) {
    return {
        average: Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100,
        minimum: Math.min(...scores)
    };
}

function main() {
    const tables = loadTables();
    const sourceReadings = collectSourceReadings(tables);
    const generated = collectGeneratedReadings(tables);
    const generatedThreeCard = collectGeneratedThreeCardReadings(tables);
    const errors = [];
    const details = [];
    const expectedTopics = TOPIC_IDS.join(',');
    const actualTopics = tables.TOPICS.map((topic) => topic.id).join(',');

    if (actualTopics !== expectedTopics) errors.push(`store topics are ${actualTopics || 'empty'}, expected ${expectedTopics}`);
    if (sourceReadings.length !== 624) errors.push(`source readings: ${sourceReadings.length}, expected 624`);
    if (generated.length !== 3120) errors.push(`generated readings: ${generated.length}, expected 3120`);
    if (generatedThreeCard.length !== 9360) errors.push(`three-card readings: ${generatedThreeCard.length}, expected 9360`);

    const singleScores = summarizeScores(generated.map((entry) => scoreGeneratedReading(entry, tables)));
    const threeCardScores = summarizeScores(generatedThreeCard.map((entry) => scoreThreeCardReading(entry, tables)));
    if (singleScores.average < 9 || singleScores.minimum < 8) {
        errors.push(`single quality score avg:${singleScores.average} min:${singleScores.minimum}, expected avg >= 9 and min >= 8`);
    }
    if (threeCardScores.average < 9 || threeCardScores.minimum < 8) {
        errors.push(`three-card quality score avg:${threeCardScores.average} min:${threeCardScores.minimum}, expected avg >= 9 and min >= 8`);
    }

    const missingSource = sourceReadings.filter((entry) => !entry.text);
    const duplicateSource = findDuplicateTexts(sourceReadings, 'text');
    const duplicateStaff = findDuplicateTexts(generated, 'staffText');
    const duplicateLine = findDuplicateTexts(generated, 'lineText');
    const coverageGaps = collectCoverageGaps(tables);
    if (missingSource.length) errors.push(`${missingSource.length} source readings are missing`);
    if (duplicateSource.length) errors.push(`${duplicateSource.length} source readings are duplicated`);
    if (duplicateStaff.length) errors.push(`${duplicateStaff.length} staff readings are duplicated`);
    if (duplicateLine.length) errors.push(`${duplicateLine.length} LINE readings are duplicated`);
    if (coverageGaps.length) errors.push(`${coverageGaps.length} data coverage gaps found`);

    tables.allCards.forEach((card) => {
        ORIENTATIONS.forEach((orientation) => {
            const weather = tables.getWeatherStatus(card, orientation);
            if (!Number.isInteger(weather?.level) || weather.level < 1 || weather.level > 10 || !weather.windLabel) {
                details.push(`weather:${card.id}:${orientation}`);
            }
        });
    });

    const generatedSections = generated.map((entry) => ({ ...entry, sections: parseStaffSections(entry.staffText) }));
    const uniqueCurrentReasons = new Set(generatedSections.map((entry) => entry.sections['現状と理由'])).size;
    const uniqueForecasts = new Set(generatedSections.map((entry) => entry.sections['近未来'])).size;
    const uniqueActions = new Set(generatedSections.map((entry) => entry.sections['対策'])).size;
    const uniqueCautions = new Set(generatedSections.map((entry) => entry.sections['注意点'])).size;
    if (uniqueCurrentReasons < 3000) errors.push(`staff current reasons are too repetitive: ${uniqueCurrentReasons} unique, expected at least 3000`);
    if (uniqueForecasts !== 3120) errors.push(`staff forecasts: ${uniqueForecasts} unique, expected 3120`);
    if (uniqueActions < 3000) errors.push(`staff actions are too repetitive: ${uniqueActions} unique, expected at least 3000`);
    if (uniqueCautions < 3000) errors.push(`staff cautions are too repetitive: ${uniqueCautions} unique, expected at least 3000`);

    const minorStateGroups = new Map();
    generatedSections.filter((entry) => !entry.loc.startsWith('major-')).forEach((entry) => {
        const key = `${entry.loc}:${entry.orientation}`;
        if (!minorStateGroups.has(key)) minorStateGroups.set(key, new Set());
        minorStateGroups.get(key).add(entry.sections['結論']);
    });
    const expectedSubtopicCount = Object.values(SUBTOPIC_IDS).flat().length;
    const sharedMinorStates = [...minorStateGroups.entries()].filter(([, values]) => values.size !== expectedSubtopicCount);
    if (sharedMinorStates.length) errors.push(`${sharedMinorStates.length} minor card states are not subtopic-specific`);

    sourceReadings.forEach((entry) => {
        const redFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.text.includes(word));
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => entry.text.includes(word));
        if (redFlags.length) details.push(`source-category:${entry.topicId}:${entry.loc}:${entry.orientation} [${redFlags.join(', ')}]`);
        if (qualityFlags.length) details.push(`source-quality:${entry.topicId}:${entry.loc}:${entry.orientation} [${qualityFlags.join(', ')}]`);
        if (entry.text.includes('今日')) details.push(`source-today:${entry.topicId}:${entry.loc}:${entry.orientation}`);
    });

    generatedSections.forEach((entry) => {
        const identity = `${entry.topicId}:${entry.subtopicId}:${entry.loc}:${entry.orientation}`;
        if (!entry.sourceText || !entry.staffText || !entry.lineText) details.push(`generated-missing:${identity}`);
        if (!entry.verdict?.staff || !entry.verdict?.line) details.push(`generated-verdict:${identity}`);
        const expectedBand = tables.getVerdictBand(entry.readingWeather?.level);
        const expectedVerdict = tables.SUBTOPIC_VERDICTS?.[entry.topicId]?.[entry.subtopicId]?.[expectedBand];
        if (!entry.readingWeather?.windLabel || entry.verdict?.staff !== expectedVerdict?.staff || entry.verdict?.line !== expectedVerdict?.line) {
            details.push(`generated-weather-verdict:${identity}`);
        }
        if (entry.lineText.length > 3200) details.push(`line-too-long:${identity}:${entry.lineText.length}`);
        if (!/^風向き: [^\n]+\n\n[^\n]/.test(entry.lineText)) details.push(`line-format:${identity}`);
        if (!entry.lineText.startsWith(`風向き: ${entry.readingWeather?.windLabel}\n\n`)) details.push(`line-weather:${identity}`);
        const lineSections = entry.lineText.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
        if (entry.verdict?.line && !containsAllSentences(lineSections[1], entry.verdict.line)) details.push(`line-verdict-order:${identity}`);
        const forbiddenLine = LINE_FORBIDDEN_TEXT.filter((word) => entry.lineText.includes(word));
        if (forbiddenLine.length) details.push(`line-mixed:${identity} [${forbiddenLine.join(', ')}]`);
        const firstLineBodySentence = entry.lineBody.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstLineBodySentence && !entry.lineText.includes(firstLineBodySentence)) details.push(`line-source:${identity}`);
        const forbiddenStaff = STAFF_FORBIDDEN_TEXT.filter((word) => entry.staffText.includes(word));
        if (forbiddenStaff.length) details.push(`staff-voice:${identity} [${forbiddenStaff.join(', ')}]`);
        if (entry.staffText.includes('今日') || entry.lineText.includes('今日')) details.push(`generated-today:${identity}`);
        if (entry.staffText.split(/\r?\n/).filter(Boolean).length !== 6) details.push(`staff-format:${identity}`);
        if (/\{[a-z]+\}/.test(entry.staffText)) details.push(`staff-placeholder:${identity}`);
        if (hasAdjacentDuplicateSentence(entry.staffText) || hasAdjacentDuplicateSentence(entry.lineText)) details.push(`generated-repetition:${identity}`);
        const subtopicFrame = tables.getSubtopicReadingFrame(entry.topicId, entry.subtopicId);
        if (!entry.staffText.includes(`【${tables.TOPICS.find((topic) => topic.id === entry.topicId)?.label}・${entry.subtopicLabel}鑑定】`)) {
            details.push(`staff-heading-subtopic:${identity}`);
        }
        const meaningContext = tables.STAFF_SIMPLE_MEANING_CONTEXTS?.[entry.topicId]?.[entry.subtopicId];
        if (!entry.sections['現状と理由']?.includes(`${meaningContext}「`)) {
            details.push(`staff-meaning-subtopic:${identity}`);
        }
        const card = tables.allCards.find((candidate) => candidate.id === entry.loc);
        const cardGroup = card?.kind === 'major' ? 'major' : card?.suitId;
        const staffFocus = subtopicFrame?.focus?.[cardGroup]?.[0];
        const lineFocus = subtopicFrame?.focus?.[cardGroup]?.[1];
        const plainVerdict = tables.takePlainStaffSentences(entry.verdict?.staff);
        if (!entry.sections['結論']?.startsWith(`現在の風向きは${entry.readingWeather?.windLabel}です。`)) {
            details.push(`staff-weather-order:${identity}`);
        }
        if (plainVerdict && !entry.sections['結論']?.includes(plainVerdict)) {
            details.push(`staff-verdict-order:${identity}`);
        }
        const plainStaffFocus = tables.takePlainStaffSentences(staffFocus);
        if (plainStaffFocus && !entry.sections['現状と理由']?.includes(plainStaffFocus)) {
            details.push(`staff-focus-subtopic:${identity}`);
        }
        const expectedForecast = tables.makeStaffTextPlain(entry.forecast);
        if (!expectedForecast || entry.sections['近未来'] !== expectedForecast) {
            details.push(`staff-forecast-subtopic:${identity}`);
        }
        const firstLineFocusSentence = lineFocus?.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstLineFocusSentence && !entry.lineText.includes(firstLineFocusSentence)) {
            details.push(`line-focus-subtopic:${identity}`);
        }
        ['結論', '現状と理由', '近未来', '対策', '注意点'].forEach((label) => {
            const minimumLength = label === '結論' ? 10 : 12;
            if (String(entry.sections[label] || '').length < minimumLength) details.push(`staff-section:${identity}:${label}`);
            const maximumLength = label === '現状と理由' ? 360 : 240;
            if (String(entry.sections[label] || '').length > maximumLength) details.push(`staff-section-long:${identity}:${label}`);
        });
        const actionText = String(entry.sections['対策'] || '');
        if (!/ください。?$/.test(actionText) || VAGUE_ACTION_TEXT.some((word) => actionText.endsWith(word))) {
            details.push(`staff-action-vague:${identity}`);
        }
        const staffBody = entry.staffText.split(/\r?\n/).slice(1).join('\n');
        const hardStaffWords = HARD_STAFF_TEXT.filter((word) => staffBody.includes(word));
        if (hardStaffWords.length) details.push(`staff-hard-word:${identity} [${hardStaffWords.join(', ')}]`);
        const grammarFlags = STAFF_GRAMMAR_FLAGS.filter((word) => staffBody.includes(word));
        if (grammarFlags.length) details.push(`staff-grammar:${identity} [${grammarFlags.join(', ')}]`);
        if (/[。！？!?][ \t]+\S/.test(staffBody)) details.push(`staff-punctuation-space:${identity}`);
        if (/を見ます。|かを見ます。/.test(String(entry.sections['現状と理由'] || ''))) {
            details.push(`staff-meta-reason:${identity}`);
        }
        ['結論', '現状と理由', '近未来', '対策', '注意点'].forEach((label) => {
            const sentenceCount = String(entry.sections[label] || '').match(/[^。！？!?]+[。！？!?]?/g)?.filter(Boolean).length || 0;
            const maxSentences = label === '現状と理由' ? 4 : label === '結論' ? 3 : label === '近未来' ? 3 : label === '対策' ? 2 : 3;
            if (sentenceCount > maxSentences) details.push(`staff-sentence-count:${identity}:${label}:${sentenceCount}`);
        });
        const redFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => staffBody.includes(word));
        if (redFlags.length) details.push(`staff-category:${identity} [${redFlags.join(', ')}]`);
        const staffTopicVocabFlags = (STAFF_TOPIC_VOCAB_FLAGS[entry.topicId] || [])
            .filter((word) => staffBody.includes(word));
        if (staffTopicVocabFlags.length) details.push(`staff-topic-vocab:${identity} [${staffTopicVocabFlags.join(', ')}]`);
        const lineRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.lineText.includes(word));
        if (lineRedFlags.length) details.push(`line-category:${identity} [${lineRedFlags.join(', ')}]`);
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => `${entry.staffText}\n${entry.lineText}`.includes(word));
        if (qualityFlags.length) details.push(`generated-quality:${identity} [${qualityFlags.join(', ')}]`);
        const contextFlags = (SUBTOPIC_CONTEXT_FLAGS[`${entry.topicId}.${entry.subtopicId}`] || [])
            .filter((word) => entry.lineBody.includes(word));
        if (contextFlags.length) details.push(`subtopic-context:${identity} [${contextFlags.join(', ')}]`);
        const staffContextFlags = (SUBTOPIC_STAFF_CONTEXT_FLAGS[`${entry.topicId}.${entry.subtopicId}`] || [])
            .filter((word) => staffBody.includes(word));
        if (staffContextFlags.length) details.push(`staff-subtopic-context:${identity} [${staffContextFlags.join(', ')}]`);
    });

    generatedThreeCard.forEach((entry) => {
        const identity = `${entry.topicId}:${entry.subtopicId}:slot-${entry.candidatePosition + 1}:${entry.loc}:${entry.orientation}`;
        if (!entry.positionReading?.staff || !entry.positionReading?.keywords) details.push(`three-card-position:${identity}`);
        if (!entry.staffText || !entry.lineText) details.push(`three-card-missing:${identity}`);
        if (!entry.weather?.windLabel || !Number.isInteger(entry.weather?.level) || entry.weather.level < 1 || entry.weather.level > 10) {
            details.push(`three-card-weather:${identity}`);
        }
        if (!Array.isArray(entry.weather?.levels) || entry.weather.levels.length !== 3) details.push(`three-card-levels:${identity}`);
        if (!Array.isArray(entry.weather?.rawLevels) || entry.weather.rawLevels.length !== 3) details.push(`three-card-raw-levels:${identity}`);
        if (!entry.flow?.staff || !entry.flow?.line) details.push(`three-card-flow:${identity}`);
        if (!entry.verdict?.staff || !entry.verdict?.line) details.push(`three-card-verdict:${identity}`);
        const expectedVerdict = tables.SUBTOPIC_VERDICTS?.[entry.topicId]?.[entry.subtopicId]?.[tables.getVerdictBand(entry.weather?.level)];
        if (entry.verdict?.staff !== expectedVerdict?.staff || entry.verdict?.line !== expectedVerdict?.line) {
            details.push(`three-card-weather-verdict:${identity}`);
        }
        const cardIds = entry.selections.map((selection) => selection.card.id);
        if (new Set(cardIds).size !== 3) details.push(`three-card-duplicate:${identity}`);
        if (!entry.lineText.startsWith(`風向き: ${entry.weather?.windLabel}\n\n`)) details.push(`three-card-line-weather:${identity}`);
        if (entry.lineText.length > 3200) details.push(`three-card-line-too-long:${identity}:${entry.lineText.length}`);
        const staffSections = entry.staffText.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
        if (staffSections.length !== 6) details.push(`three-card-staff-format:${identity}:${staffSections.length}`);
        if (!staffSections[1]?.startsWith(`結論: 現在の風向きは${entry.weather?.windLabel}です。`)) details.push(`three-card-conclusion-order:${identity}`);
        if (!staffSections[2]?.startsWith('現状と理由:')) details.push(`three-card-current-order:${identity}`);
        if (!staffSections[3]?.startsWith('近未来:')) details.push(`three-card-forecast-order:${identity}`);
        if (!staffSections[4]?.startsWith('対策:')) details.push(`three-card-action-order:${identity}`);
        if (!staffSections[5]?.startsWith('注意点:')) details.push(`three-card-caution-order:${identity}`);
        if (/[。！？!?][ \t]+\S/.test(entry.staffText)) details.push(`three-card-staff-punctuation-space:${identity}`);
        const staffSectionSentenceLimits = [4, 28, 3, 2, 3];
        staffSections.slice(1).forEach((section, index) => {
            const maximumLength = index === 1 ? 1000 : 300;
            if (section.length > maximumLength) details.push(`three-card-staff-long:${identity}:${index + 1}:${section.length}`);
            const sentenceCount = section.match(/[^。！？!?]+[。！？!?]?/g)?.filter(Boolean).length || 0;
            const maxSentences = staffSectionSentenceLimits[index] || 5;
            if (sentenceCount > maxSentences) details.push(`three-card-staff-sentences:${identity}:${index + 1}:${sentenceCount}`);
        });
        const topic = tables.TOPICS.find((item) => item.id === entry.topicId);
        const positionReadings = entry.positions.map((position, index) => tables.getThreeCardPositionReading(
            topic,
            entry.subtopicId,
            entry.selections[index],
            position,
            index
        ));
        const expectedForecast = tables.buildThreeCardNearFuture(topic, tables.SUBTOPICS[entry.topicId].find((item) => item.id === entry.subtopicId), positionReadings, entry.weather);
        if (staffSections[3] !== `近未来: ${expectedForecast}`) details.push(`three-card-forecast:${identity}`);
        if (/(?:強みを活かせば|問題を先に整えれば|扱い方を決めれば)、[^。]*(?:れば|ければ|なら)/.test(staffSections[3] || '')) {
            details.push(`three-card-forecast-double-condition:${identity}`);
        }
        const actionBody = String(staffSections[4] || '').replace(/^対策:\s*/, '');
        const cautionBody = String(staffSections[5] || '').replace(/^注意点:\s*/, '');
        if (containsAllSentences(staffSections[2], actionBody)) details.push(`three-card-action-repeated:${identity}`);
        if (containsAllSentences(staffSections[2], cautionBody)) details.push(`three-card-caution-repeated:${identity}`);
        entry.positions.forEach((position, index) => {
            const card = entry.selections[index].card;
            const orientation = entry.selections[index].orientation;
            const cardSection = staffSections[2] || '';
            if (!cardSection.includes(`${index + 1}枚目・${tables.makeStaffTextPlain(position.label)}: ${card.label} /`)) {
                details.push(`three-card-position-order:${identity}:${index + 1}`);
            }
            if (!entry.lineText.includes(`${index + 1}枚目「${position.label}」`)) {
                details.push(`three-card-line-position:${identity}:${index + 1}`);
            }
            const positionReading = tables.getThreeCardPositionReading(
                tables.TOPICS.find((topic) => topic.id === entry.topicId),
                entry.subtopicId,
                entry.selections[index],
                position,
                index
            );
            if (!positionReading?.line || !entry.lineText.includes(positionReading.line)) {
                details.push(`three-card-line-position-reading:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'obstacle' && positionReading.tone === 'favorable' && (
                !positionReading.staff.includes('行きすぎが弱点')
                || !positionReading.staff.includes(positionReading.warning.replace(/^.*?。/, ''))
            )) {
                details.push(`three-card-obstacle-favorable:${identity}:${index + 1}`);
            }
            if (
                (positionReading?.role === 'obstacle' || positionReading?.role === 'cost')
                && positionReading.tone === 'favorable'
                && entry.weather.levels[index] > 6
            ) {
                details.push(`three-card-role-weather:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'obstacle' && positionReading.tone === 'difficult' && !positionReading.staff.includes('そのまま表れています')) {
                details.push(`three-card-obstacle-difficult:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'action' && positionReading.tone === 'favorable' && !positionReading.staff.includes('活かすことが突破口')) {
                details.push(`three-card-action-favorable:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'action' && positionReading.tone === 'difficult' && !positionReading.staff.includes('問題を先に整える必要')) {
                details.push(`three-card-action-difficult:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'outcome' && !positionReading.staff.startsWith(`${position.label}には`)) {
                details.push(`three-card-outcome:${identity}:${index + 1}`);
            }
            if (positionReading?.role === 'decision' && positionReading.tone === 'difficult' && !positionReading.line.includes('だけで決めるな')) {
                details.push(`three-card-decision-difficult:${identity}:${index + 1}`);
            }
        });
        const expectedClosing = tables.buildThreeCardLineClosing(positionReadings, entry.flow.line);
        if (!expectedClosing || !entry.lineText.endsWith(expectedClosing)) details.push(`three-card-line-closing:${identity}`);
        if (positionReadings[1]?.role === 'decision' && positionReadings[1]?.tone === 'difficult' && expectedClosing?.includes('を判断の軸にしな')) {
            details.push(`three-card-decision-closing:${identity}`);
        }
        const forbiddenLine = LINE_FORBIDDEN_TEXT.filter((word) => entry.lineText.includes(word));
        if (forbiddenLine.length) details.push(`three-card-line-mixed:${identity} [${forbiddenLine.join(', ')}]`);
        const forbiddenStaff = STAFF_FORBIDDEN_TEXT.filter((word) => entry.staffText.includes(word));
        if (forbiddenStaff.length) details.push(`three-card-staff-voice:${identity} [${forbiddenStaff.join(', ')}]`);
        const staffBodyWithoutCardNames = entry.selections.reduce(
            (text, selection) => text.split(selection.card.label).join(''),
            entry.staffText
        );
        const hardStaffWords = HARD_STAFF_TEXT.filter((word) => staffBodyWithoutCardNames.includes(word));
        if (hardStaffWords.length) details.push(`three-card-staff-hard-word:${identity} [${hardStaffWords.join(', ')}]`);
        const grammarFlags = STAFF_GRAMMAR_FLAGS.filter((word) => staffBodyWithoutCardNames.includes(word));
        if (grammarFlags.length) details.push(`three-card-staff-grammar:${identity} [${grammarFlags.join(', ')}]`);
        if (entry.staffText.includes('今日') || entry.lineText.includes('今日')) details.push(`three-card-today:${identity}`);
        if (/\{[a-z]+\}/.test(entry.staffText)) details.push(`three-card-placeholder:${identity}`);
        if (hasAdjacentDuplicateSentence(entry.staffText) || hasAdjacentDuplicateSentence(entry.lineText)) {
            details.push(`three-card-repetition:${identity}`);
        }
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => `${entry.staffText}\n${entry.lineText}`.includes(word));
        if (qualityFlags.length) details.push(`three-card-quality:${identity} [${qualityFlags.join(', ')}]`);
        const staffCategoryBody = staffBodyWithoutCardNames;
        const staffRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => staffCategoryBody.includes(word));
        if (staffRedFlags.length) details.push(`three-card-staff-category:${identity} [${staffRedFlags.join(', ')}]`);
        const staffTopicVocabFlags = (STAFF_TOPIC_VOCAB_FLAGS[entry.topicId] || [])
            .filter((word) => staffCategoryBody.includes(word));
        if (staffTopicVocabFlags.length) details.push(`three-card-staff-topic-vocab:${identity} [${staffTopicVocabFlags.join(', ')}]`);
        const staffContextFlags = (SUBTOPIC_STAFF_CONTEXT_FLAGS[`${entry.topicId}.${entry.subtopicId}`] || [])
            .filter((word) => staffCategoryBody.includes(word));
        if (staffContextFlags.length) details.push(`three-card-staff-subtopic-context:${identity} [${staffContextFlags.join(', ')}]`);
        const lineRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.lineText.includes(word));
        if (lineRedFlags.length) details.push(`three-card-line-category:${identity} [${lineRedFlags.join(', ')}]`);

        const levels = entry.weather?.levels || [];
        const criticalCount = levels.filter((level) => level <= 2).length;
        if (levels[2] <= 2 && entry.weather.level > 3) details.push(`three-card-rule-final-critical:${identity}`);
        if (criticalCount >= 2 && entry.weather.level > 2) details.push(`three-card-rule-double-critical:${identity}`);
        if (levels.every((level) => level >= 7) && entry.weather.level < 8) details.push(`three-card-rule-all-favorable:${identity}`);
        if (levels.every((level) => level <= 4) && entry.weather.level > 3) details.push(`three-card-rule-all-difficult:${identity}`);
        if (levels[0] <= 3 && levels[2] >= 7 && (entry.weather.level < 6 || entry.weather.level > 7)) {
            details.push(`three-card-rule-recovery:${identity}`);
        }
    });

    if (details.length) errors.push(`${details.length} detailed validation failures found`);
    if (errors.length) {
        console.error('[tarot-audit] FAILED');
        errors.forEach((error) => console.error(`- ${error}`));
        missingSource.slice(0, 20).forEach((entry) => console.error(`missing:${entry.topicId}:${entry.loc}:${entry.orientation}`));
        duplicateSource.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-source:${first} == ${second}`));
        duplicateStaff.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-staff:${first} == ${second}`));
        duplicateLine.slice(0, 20).forEach(([first, second]) => console.error(`duplicate-line:${first} == ${second}`));
        coverageGaps.slice(0, 20).forEach((entry) => console.error(entry));
        details.slice(0, 40).forEach((entry) => console.error(entry));
        process.exit(1);
    }

    const levels = [...new Set(tables.allCards.flatMap((card) => ORIENTATIONS.map((orientation) => tables.getWeatherStatus(card, orientation).level)))].sort((a, b) => a - b);
    console.log(`[tarot-audit] OK source:${sourceReadings.length} single:${generated.length} triple:${generatedThreeCard.length} topics:${actualTopics} levels:${levels.join(',')} unique:${uniqueCurrentReasons}/${uniqueForecasts}/${uniqueActions}/${uniqueCautions} quality:single-${singleScores.average}/${singleScores.minimum} triple-${threeCardScores.average}/${threeCardScores.minimum}`);
}

if (require.main === module) main();

module.exports = {
    loadTables,
    collectGeneratedReadings,
    collectGeneratedThreeCardReadings,
    parseStaffSections,
    containsAllSentences
};
