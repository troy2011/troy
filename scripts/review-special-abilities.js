const catalog = require('../server/data/special-abilities.json');

const AFFINITY_CONTRACTS = Object.freeze({
    manipulation: /操|動|運|歩|進|行|演奏|整|移|飛ば|再現|集め|そろ|戻|曲げ|固定|上下|温度|合図|導|開閉|編|削|止め|追従|同調|案内|配置|実行させ|任せ|起こさせ/,
    specialization: /先|予知|虚偽|未来|明日|過去|記憶|感情|夢|時間|運命|可能|因果|真|意味|存在|距離|空間|願望|危険|痛み|性格|才能|約束|選択|決断|偶然|声紋|縁|思考|生命|心|魂|役割|名前|出来事|集中|注目|予兆|痕跡|感覚|意志|規則|結末|領域|成長|体調|余力|意欲|疲れ|手掛かり|安心|確信|責任|好機|現実的|影|証言|問題|突破口/,
    transmutation: /変え|与え/,
    conjuration: /作|呼び出|出す|建て|置く|架け|呼ぶ|広げ|伸ばす/,
    enhancement: /高め|強化|伸ばし|広げ|集め|覚えさせ|引き上げ|定着|明確に分け|保つ|見分け|察知|捉え|整え/,
    emission: /放|送り|送る|届け|射出|投影|伝える|飛ば|打ち込/
});
const SCOPE_PATTERN = /一|二|三|四|五|七|十|百|秒|分|時|回|人|枚|本|歩|間|だけ|前|後|まで|必要|すると|時に/;

function normalize(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\s、。・「」『』（）()!?！？:：ー-]/g, '');
}

function trigrams(value) {
    const text = normalize(value);
    const result = new Set();
    for (let index = 0; index <= text.length - 3; index += 1) result.add(text.slice(index, index + 3));
    return result;
}

function similarity(left, right) {
    let intersection = 0;
    left.forEach((value) => {
        if (right.has(value)) intersection += 1;
    });
    return intersection / (left.size + right.size - intersection);
}

const abilities = Array.isArray(catalog.abilities) ? catalog.abilities : [];
const grams = abilities.map((ability) => trigrams(ability.effect));
const maximumSimilarities = abilities.map((_ability, index) => {
    let maximum = 0;
    abilities.forEach((_candidate, candidateIndex) => {
        if (candidateIndex === index) return;
        maximum = Math.max(maximum, similarity(grams[index], grams[candidateIndex]));
    });
    return maximum;
});

function scoreAbility(ability, index) {
    let score = 0;
    const findings = [];
    const effect = String(ability.effect || '');
    const rule = String(ability.rule || '');
    const nameLength = Array.from(String(ability.name || '')).length;
    const alias = String(ability.alias || '');
    const aliasLength = Array.from(alias.replace(/・/g, '')).length;

    const effectIsSingleSentence = (effect.match(/。/g) || []).length === 1 && effect.endsWith('。');
    const effectIsReadableLength = normalize(effect).length >= 25 && normalize(effect).length <= 70;
    const effectExplainsMechanismAndOutcome = effect.includes('、') && effect.length <= 90;
    if (effectIsSingleSentence && effectIsReadableLength && effectExplainsMechanismAndOutcome) score += 2;
    else findings.push('効果の明瞭さ');

    const affinityPattern = AFFINITY_CONTRACTS[ability.affinity];
    if (affinityPattern?.test(`${ability.name}${effect}`) && ability.compatibleTypes?.includes(ability.targetType)) score += 2;
    else findings.push('系統との整合');

    const ruleHasConditionalScope = SCOPE_PATTERN.test(rule)
        || /発動|最初|対象|相手|物|場所|地点|範囲|方向|条件|用途|目標|目的地|着地点|受取人|全体|材料|高さ|幅|現在地|匂い|光|到着点|当事者|足裏|構造|中心|内側|曲がる側|届け先|文字|髪|土|木|地面|衣服/.test(rule);
    const ruleIsConcrete = (rule.match(/。/g) || []).length === 1
        && normalize(rule).length >= 18
        && ruleHasConditionalScope;
    if (ruleIsConcrete) score += 2;
    else findings.push('発動条件の具体性');

    if (maximumSimilarities[index] < 0.35) score += 2;
    else if (maximumSimilarities[index] < 0.55) score += 1;
    else findings.push('効果の独自性');

    const aliasIsTalkable = /^[ァ-ヶー]+(?:・[ァ-ヶー]+)+$/.test(alias)
        && aliasLength >= 5
        && aliasLength <= 24;
    if (nameLength >= 3 && nameLength <= 7 && aliasIsTalkable && effect.length + rule.length <= 120) score += 2;
    else findings.push('名称と話しやすさ');

    return { id: ability.id, name: ability.name, score, findings, maximumSimilarity: maximumSimilarities[index] };
}

const reviews = abilities.map(scoreAbility);
const average = reviews.reduce((sum, review) => sum + review.score, 0) / Math.max(1, reviews.length);
const minimum = Math.min(...reviews.map((review) => review.score));
const failed = reviews.filter((review) => review.score < 9);
if (abilities.length !== 365 || failed.length) {
    failed.forEach((review) => {
        console.error(`[special-ability-quality] ${review.id} ${review.name}: ${review.score.toFixed(1)} (${review.findings.join('、')})`);
    });
    throw new Error(`quality gate failed: total=${abilities.length} average=${average.toFixed(2)} minimum=${minimum.toFixed(2)}`);
}

console.log(`[special-ability-quality] OK total:${abilities.length} average:${average.toFixed(2)} minimum:${minimum.toFixed(2)} max-effect-similarity:${Math.max(...maximumSimilarities).toFixed(3)}`);
