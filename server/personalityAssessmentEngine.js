const crypto = require('node:crypto');

const catalog = require('./data/past-life-animals.json');
const creatureAssessment = require('./data/personality-assessment-creatures.json');

const AXES = Object.freeze(['E', 'S', 'T', 'J']);
const MOTIFS = Object.freeze(['beast', 'wing', 'scale', 'water', 'swarm']);
const ARCHETYPES = Object.freeze(['guardian', 'explorer', 'nurturer', 'strategist', 'transformer']);
const COMPATIBILITY_CATEGORIES = Object.freeze({
    love: '恋愛',
    friendship: '友情',
    work: '仕事',
    conflict: '衝突時'
});
const CATEGORY_KEYS = Object.freeze(Object.keys(COMPATIBILITY_CATEGORIES));

const ASSESSMENT_VERSION = 2;
const ASSET_VERSION = Math.max(1, Number(creatureAssessment.version) || 1);
const TOTAL_ROUNDS = 12;
const TOP_CANDIDATE_COUNT = 12;
const MIN_RESPONSE_SECONDS = 1;
const MAX_RESPONSE_SECONDS = 20;
const MAX_WEIGHT = 1.10;
const MIN_WEIGHT = 0.90;
const MIN_RESPONSE_RATIO = 0.60;
const MAX_RESPONSE_RATIO = 1.60;
const SCENE_PRIMARY_SCORE = 0.75;
const SCENE_SECONDARY_SCORE = 0.25;
const CREATURE_TRAIT_WEIGHT = 0.25;
const FIT_WEIGHTS = Object.freeze({ axes: 0.60, motif: 0.20, archetype: 0.15, tempo: 0.05 });
const COMPLEXITY_REFERENCE_SECONDS = Object.freeze({
    symbolic: 4,
    environmental: 6,
    intricate: 8
});
const QUESTION_PROMPT = 'いちばん心が引かれる空想生物を、直感で一体選んでください';

const ANIMAL_BY_ID = new Map(catalog.animals.map((animal) => [animal.id, animal]));

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundNumber(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function makeVector(keys, rawVector = {}, min = -1, max = 1) {
    return Object.freeze(Object.fromEntries(keys.map((key) => [key, clamp(rawVector?.[key], min, max)])));
}

function scoredAxisVector(primaryAxis, primaryScore, secondaryAxis, secondaryScore) {
    const scores = Object.fromEntries(AXES.map((axis) => [axis, 0]));
    scores[primaryAxis] = primaryScore;
    scores[secondaryAxis] = secondaryScore;
    return makeVector(AXES, scores);
}

function addVectors(keys, left, right) {
    return makeVector(keys, Object.fromEntries(keys.map((key) => [
        key,
        Number(left?.[key] || 0) + Number(right?.[key] || 0)
    ])));
}

function createRound(definition) {
    const { id, axis, secondaryAxis, complexityTier } = definition;
    const scoreSigns = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return {
        id,
        axis,
        secondaryAxis,
        complexityTier,
        prompt: QUESTION_PROMPT,
        options: scoreSigns.map(([primarySign, secondarySign], optionIndex) => {
            const letter = String.fromCharCode(97 + optionIndex);
            const creature = definition.options?.[optionIndex];
            const sceneScore = scoredAxisVector(
                axis,
                primarySign * SCENE_PRIMARY_SCORE,
                secondaryAxis,
                secondarySign * SCENE_SECONDARY_SCORE
            );
            const creatureScore = makeVector(AXES, Object.fromEntries(AXES.map((axisKey) => [
                axisKey,
                clamp(creature?.traitVector?.[axisKey], -1, 1) * CREATURE_TRAIT_WEIGHT
            ])));
            return {
                id: `${id}-${letter}`,
                imageUrl: `/assets/personality-assessment/${id}-${letter}.webp`,
                creatureId: creature?.creatureId,
                creatureName: creature?.creatureName,
                sceneScore,
                creatureScore,
                axisVector: addVectors(AXES, sceneScore, creatureScore),
                motifVector: makeVector(MOTIFS, creature?.motifVector, 0, 1),
                archetypeVector: makeVector(ARCHETYPES, creature?.archetypeVector, 0, 1),
                tempo: clamp(creature?.tempo, 0, 1)
            };
        })
    };
}

const ROUNDS = Object.freeze(creatureAssessment.rounds.map(createRound).map((round) => Object.freeze({
    ...round,
    options: Object.freeze(round.options.map((option) => Object.freeze(option)))
})));

const AXIS_CAPACITY = Object.freeze(Object.fromEntries(AXES.map((axis) => [
    axis,
    ROUNDS.reduce((sum, round) => (
        sum + Math.max(...round.options.map((option) => Math.abs(Number(option.axisVector[axis] || 0))))
    ), 0) * MAX_WEIGHT
])));

function getResponseRatio(seconds, referenceSeconds) {
    const clampedSeconds = clamp(seconds, MIN_RESPONSE_SECONDS, MAX_RESPONSE_SECONDS);
    const clampedReference = clamp(referenceSeconds, MIN_RESPONSE_SECONDS, MAX_RESPONSE_SECONDS) || clampedSeconds;
    return clamp(clampedSeconds / clampedReference, MIN_RESPONSE_RATIO, MAX_RESPONSE_RATIO);
}

function getResponseWeight(seconds, referenceSeconds = seconds) {
    const ratio = getResponseRatio(seconds, referenceSeconds);
    if (ratio <= 1) {
        const progress = (1 - ratio) / (1 - MIN_RESPONSE_RATIO);
        return 1 + ((MAX_WEIGHT - 1) * progress);
    }
    const progress = (ratio - 1) / (MAX_RESPONSE_RATIO - 1);
    return 1 - ((1 - MIN_WEIGHT) * progress);
}

function getComplexityAdjustedRatio(seconds, complexityTier) {
    const referenceSeconds = COMPLEXITY_REFERENCE_SECONDS[complexityTier];
    if (!referenceSeconds) throw new Error(`Unknown complexity tier: ${complexityTier}`);
    return getResponseRatio(seconds, referenceSeconds);
}

function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function deterministicRank(seed, value) {
    return crypto.createHash('sha256').update(`${seed}|${value}`).digest('hex');
}

function deterministicShuffle(items, seed) {
    return [...items].sort((left, right) => (
        deterministicRank(seed, left.id).localeCompare(deterministicRank(seed, right.id))
    ));
}

function getQuestion(roundIndex, assessmentId) {
    const index = Math.trunc(Number(roundIndex));
    const round = ROUNDS[index];
    if (!round) return null;
    const options = deterministicShuffle(round.options, `${assessmentId}|${round.id}`).map((option, optionIndex) => ({
        id: option.id,
        imageUrl: `${option.imageUrl}?v=${ASSET_VERSION}`,
        alt: `選択肢 ${optionIndex + 1}`
    }));
    return {
        id: round.id,
        number: index + 1,
        total: TOTAL_ROUNDS,
        prompt: round.prompt,
        options
    };
}

function normalizeAnswer(rawAnswer, expectedRoundIndex) {
    const round = ROUNDS[expectedRoundIndex];
    if (!round || rawAnswer?.roundId !== round.id) throw new Error('回答する問題の順序が正しくありません');
    const option = round.options.find((entry) => entry.id === rawAnswer?.optionId);
    if (!option) throw new Error('選択肢が正しくありません');
    return {
        roundId: round.id,
        optionId: option.id,
        seconds: clamp(rawAnswer?.seconds, MIN_RESPONSE_SECONDS, MAX_RESPONSE_SECONDS),
        complexityTier: round.complexityTier,
        axisVector: option.axisVector,
        motifVector: option.motifVector,
        archetypeVector: option.archetypeVector,
        optionTempo: option.tempo
    };
}

function averageVectors(keys, answers, property) {
    const totalWeight = answers.reduce((sum, answer) => sum + answer.weight, 0) || 1;
    return Object.fromEntries(keys.map((key) => [
        key,
        roundNumber(answers.reduce((sum, answer) => (
            sum + (Number(answer[property]?.[key] || 0) * answer.weight)
        ), 0) / totalWeight)
    ]));
}

function evaluateAnswers(rawAnswers) {
    if (!Array.isArray(rawAnswers) || rawAnswers.length !== TOTAL_ROUNDS) {
        throw new Error(`${TOTAL_ROUNDS}問すべての回答が必要です`);
    }
    const answers = rawAnswers.map((answer, index) => normalizeAnswer(answer, index));
    const tierMedians = Object.fromEntries(
        [...new Set(answers.map((answer) => answer.complexityTier))].map((tier) => [
            tier,
            median(answers.filter((answer) => answer.complexityTier === tier).map((answer) => answer.seconds))
        ])
    );
    const weightedAnswers = answers.map((answer) => {
        const referenceSeconds = tierMedians[answer.complexityTier];
        return {
            ...answer,
            responseRatio: getResponseRatio(answer.seconds, referenceSeconds),
            complexityRatio: getComplexityAdjustedRatio(answer.seconds, answer.complexityTier),
            weight: getResponseWeight(answer.seconds, referenceSeconds)
        };
    });
    const rawAxisScores = Object.fromEntries(AXES.map((axis) => [axis, 0]));
    for (const answer of weightedAnswers) {
        for (const axis of AXES) {
            rawAxisScores[axis] += Number(answer.axisVector[axis] || 0) * answer.weight;
        }
    }
    const axisScores = Object.fromEntries(AXES.map((axis) => [
        axis,
        roundNumber(clamp(rawAxisScores[axis] / AXIS_CAPACITY[axis], -1, 1))
    ]));
    const motifAffinities = averageVectors(MOTIFS, weightedAnswers, 'motifVector');
    const archetypeAffinities = averageVectors(ARCHETYPES, weightedAnswers, 'archetypeVector');
    const medianSeconds = median(weightedAnswers.map((answer) => answer.seconds));
    const normalizedMedianRatio = median(weightedAnswers.map((answer) => answer.complexityRatio));
    const responseTempo = 1 - clamp(
        (normalizedMedianRatio - MIN_RESPONSE_RATIO) / (MAX_RESPONSE_RATIO - MIN_RESPONSE_RATIO),
        0,
        1
    );
    const imageTempo = weightedAnswers.reduce((sum, answer) => (
        sum + (answer.optionTempo * answer.weight)
    ), 0) / (weightedAnswers.reduce((sum, answer) => sum + answer.weight, 0) || 1);
    const tempo = roundNumber(clamp((responseTempo * 0.7) + (imageTempo * 0.3), 0, 1));
    return {
        answers: weightedAnswers,
        rawAxisScores,
        axisScores,
        motifAffinities,
        archetypeAffinities,
        medianSeconds: roundNumber(medianSeconds),
        normalizedMedianRatio: roundNumber(normalizedMedianRatio),
        tempo,
        tierMedians
    };
}

function vectorFit(keys, observed, target) {
    return keys.reduce((sum, key) => (
        sum + (1 - (Math.abs(Number(observed?.[key] || 0) - Number(target?.[key] || 0)) / 2))
    ), 0) / keys.length;
}

function affinityFit(keys, observed, target) {
    return keys.reduce((sum, key) => (
        sum + (1 - Math.abs(Number(observed?.[key] || 0) - Number(target?.[key] || 0)))
    ), 0) / keys.length;
}

function scoreAnimal(animal, evaluation) {
    const axes = vectorFit(AXES, evaluation.axisScores, animal?.selection?.axes);
    const motif = affinityFit(MOTIFS, evaluation.motifAffinities, animal?.selection?.motif);
    const archetype = affinityFit(ARCHETYPES, evaluation.archetypeAffinities, animal?.selection?.archetype);
    const tempo = 1 - Math.abs(clamp(evaluation.tempo, 0, 1) - clamp(animal?.selection?.tempo, 0, 1));
    return {
        total: roundNumber((axes * FIT_WEIGHTS.axes)
            + (motif * FIT_WEIGHTS.motif)
            + (archetype * FIT_WEIGHTS.archetype)
            + (tempo * FIT_WEIGHTS.tempo), 8),
        axes: roundNumber(axes, 8),
        motif: roundNumber(motif, 8),
        archetype: roundNumber(archetype, 8),
        tempo: roundNumber(tempo, 8)
    };
}

function compareCandidateScores(left, right) {
    return right.fit.total - left.fit.total
        || right.fit.axes - left.fit.axes
        || right.fit.archetype - left.fit.archetype
        || right.fit.motif - left.fit.motif
        || right.fit.tempo - left.fit.tempo
        || left.animal.id.localeCompare(right.animal.id);
}

function rankAnimalCandidates(evaluation, limit = TOP_CANDIDATE_COUNT) {
    return catalog.animals
        .map((animal) => ({ animal, fit: scoreAnimal(animal, evaluation) }))
        .sort(compareCandidateScores)
        .slice(0, Math.max(1, Math.trunc(Number(limit) || TOP_CANDIDATE_COUNT)));
}

function createResultHash(evaluation, animalId) {
    const signature = {
        answers: evaluation.answers.map((answer) => ({
            optionId: answer.optionId,
            responseRatio: roundNumber(answer.responseRatio, 3)
        })),
        axisScores: evaluation.axisScores,
        motifAffinities: evaluation.motifAffinities,
        archetypeAffinities: evaluation.archetypeAffinities,
        tempo: evaluation.tempo,
        animalId
    };
    return crypto.createHash('sha256').update(JSON.stringify(signature)).digest('hex');
}

function deriveAssessment(rawAnswers) {
    const evaluation = evaluateAnswers(rawAnswers);
    const candidates = rankAnimalCandidates(evaluation);
    const selectedAnimal = candidates[0]?.animal;
    if (!selectedAnimal || candidates.length < TOP_CANDIDATE_COUNT) {
        throw new Error('Animal candidate coverage is insufficient');
    }
    return {
        ...evaluation,
        selectedAnimal,
        selectedFit: candidates[0].fit,
        candidates,
        resultHash: createResultHash(evaluation, selectedAnimal.id)
    };
}

function normalizeStoredAnimalId(rawResult) {
    return String(rawResult?.animalId || rawResult?.animal?.id || '').trim();
}

function getDestinyProfile(rawResult, { detail = 'full' } = {}) {
    const animal = ANIMAL_BY_ID.get(normalizeStoredAnimalId(rawResult));
    if (!animal) return null;
    const summary = {
        traits: animal.traits,
        animal: {
            id: animal.id,
            name: animal.name,
            imageUrl: animal.imageUrl,
            core: animal.core
        },
        arcanaDay: {
            value: animal.arcanaDay.value,
            label: animal.arcanaDay.label,
            omen: animal.arcanaDay.omen
        },
        disclaimer: catalog.disclaimer
    };
    if (detail !== 'full') return summary;
    return {
        ...summary,
        animal: {
            ...summary.animal,
            pastLifeMemory: animal.pastLifeMemory,
            strength: animal.strength,
            weakness: animal.weakness,
            relationships: animal.relationships,
            advice: animal.advice
        },
        arcanaDay: { ...animal.arcanaDay },
        readingVersion: catalog.catalogVersion
    };
}

function getPublicDestinyProfile(rawResult, options = {}) {
    return getDestinyProfile(rawResult, options);
}

function similarity(left, right) {
    return clamp(100 - (50 * Math.abs(Number(left || 0) - Number(right || 0))), 0, 100);
}

function complement(left, right) {
    return clamp(50 + (25 * Math.abs(Number(left || 0) - Number(right || 0))), 0, 100);
}

function average(...values) {
    return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function compatibilityTerms(leftAnimal, rightAnimal, category) {
    const left = leftAnimal.relationVector || {};
    const right = rightAnimal.relationVector || {};
    const leftAxes = leftAnimal.selection?.axes || {};
    const rightAxes = rightAnimal.selection?.axes || {};
    const decision = similarity(leftAxes.T, rightAxes.T);
    const pace = similarity(leftAxes.J, rightAxes.J);
    const perception = similarity(leftAxes.S, rightAxes.S);
    const decisionAndPace = average(decision, pace);
    const formulas = {
        love: [
            [similarity(left.warmth, right.warmth), 0.25],
            [similarity(left.loyalty, right.loyalty), 0.20],
            [similarity(left.independence, right.independence), 0.20],
            [complement(left.energy, right.energy), 0.15],
            [decision, 0.20]
        ],
        friendship: [
            [similarity(left.energy, right.energy), 0.25],
            [similarity(left.flexibility, right.flexibility), 0.20],
            [similarity(left.loyalty, right.loyalty), 0.20],
            [similarity(left.directness, right.directness), 0.15],
            [perception, 0.20]
        ],
        work: [
            [similarity(left.order, right.order), 0.25],
            [similarity(left.directness, right.directness), 0.20],
            [complement(left.energy, right.energy), 0.15],
            [complement(left.flexibility, right.flexibility), 0.15],
            [decisionAndPace, 0.25]
        ],
        conflict: [
            [similarity(left.directness, right.directness), 0.20],
            [similarity(left.recovery, right.recovery), 0.20],
            [similarity(left.independence, right.independence), 0.15],
            [similarity(left.warmth, right.warmth), 0.15],
            [decisionAndPace, 0.30]
        ]
    };
    const terms = formulas[category];
    if (!terms) throw new Error(`Unknown compatibility category: ${category}`);
    return terms;
}

function spreadCompatibilityScore(rawScore) {
    return Math.round(clamp(52 + ((Number(rawScore) - 50) * 1.15), 35, 98));
}

function compatibilitySummary(score) {
    if (score >= 90) return '互いの違いが自然に役割分担へ変わる、非常に強い組み合わせです。近さに甘えず、言葉でも確認すると長く続きます。';
    if (score >= 82) return '互いの長所が無理なく働く、かなり良い組み合わせです。得意なことを任せ合うほど、二人の力が安定します。';
    if (score >= 72) return '歩調を言葉で確かめれば、着実に育つ組み合わせです。違いを直そうとせず、役割として使うことが鍵になります。';
    if (score >= 62) return '役割と距離を具体的に決めるほど、良さが表に出る組み合わせです。察してもらうより、必要なことを伝えてください。';
    return '同じやり方を求めると消耗しやすく、違いの扱い方を決める必要がある組み合わせです。時間と境界を先に整えてください。';
}

function categoryNarrative(category, leftAnimal, rightAnimal, score) {
    const left = leftAnimal.compatibilityHooks;
    const right = rightAnimal.compatibilityHooks;
    if (category === 'love') {
        return score >= 72
            ? `${leftAnimal.name}が差し出す「${left.offers}」と、${rightAnimal.name}が求める「${right.needs}」が噛み合います。好意を察して済ませず、言葉でも確かめるほど深まります。`
            : `${leftAnimal.name}の「${left.needs}」と、${rightAnimal.name}の「${right.needs}」は満たし方が異なります。愛情の量ではなく、伝え方を先に合わせてください。`;
    }
    if (category === 'friendship') {
        return score >= 72
            ? `${leftAnimal.name}は「${left.trusts}」相手を信じ、${rightAnimal.name}は「${right.trusts}」相手を信じます。約束の形を共有すれば、気楽さと頼もしさが両立します。`
            : `信頼の入口が、${leftAnimal.name}は「${left.trusts}」、${rightAnimal.name}は「${right.trusts}」です。自分の常識を押しつけず、相手の合図を覚えてください。`;
    }
    if (category === 'work') {
        return score >= 72
            ? `${leftAnimal.name}の「${left.workStyle}」と、${rightAnimal.name}の「${right.workStyle}」が役割分担になります。担当と締切を明文化すると、互いの強みが途切れません。`
            : `${leftAnimal.name}は「${left.workStyle}」、${rightAnimal.name}は「${right.workStyle}」という進め方のため、ぶつかりやすい組み合わせです。決定権と確認時刻を最初に分けてください。`;
    }
    return score >= 72
        ? `${leftAnimal.name}は衝突すると「${left.conflictPattern}」、${rightAnimal.name}は「${right.conflictPattern}」傾向があります。互いに必要な「${left.repairNeed}」と「${right.repairNeed}」を順番に満たせば戻れます。`
        : `衝突時は、${leftAnimal.name}が「${left.conflictPattern}」、${rightAnimal.name}が「${right.conflictPattern}」という傾向のため、追うほど悪化します。まず時間を区切り、その後に一題だけ話してください。`;
}

function buildCompatibility(leftResult, rightResult) {
    const leftAnimal = ANIMAL_BY_ID.get(normalizeStoredAnimalId(leftResult));
    const rightAnimal = ANIMAL_BY_ID.get(normalizeStoredAnimalId(rightResult));
    if (!leftAnimal || !rightAnimal) return null;
    const [firstAnimal, secondAnimal] = [leftAnimal, rightAnimal].sort((left, right) => left.id.localeCompare(right.id));
    const categories = Object.fromEntries(CATEGORY_KEYS.map((category) => {
        const rawScore = compatibilityTerms(firstAnimal, secondAnimal, category)
            .reduce((sum, [score, weight]) => sum + (score * weight), 0);
        const score = spreadCompatibilityScore(rawScore);
        return [category, {
            label: COMPATIBILITY_CATEGORIES[category],
            score,
            summary: categoryNarrative(category, firstAnimal, secondAnimal, score)
        }];
    }));
    const overall = Math.round(average(...CATEGORY_KEYS.map((category) => categories[category].score)));
    return {
        overall,
        summary: compatibilitySummary(overall),
        categories,
        strength: `${firstAnimal.name}の「${firstAnimal.compatibilityHooks.offers}」と、${secondAnimal.name}の「${secondAnimal.compatibilityHooks.offers}」を交換できることが、この二人の強みです。`,
        friction: `${firstAnimal.name}は「${firstAnimal.compatibilityHooks.needs}」、${secondAnimal.name}は「${secondAnimal.compatibilityHooks.needs}」を欠くと余裕を失います。片方だけの我慢で埋めないでください。`,
        advice: `関係を整える合図は、${firstAnimal.name}には「${firstAnimal.compatibilityHooks.repairNeed}」、${secondAnimal.name}には「${secondAnimal.compatibilityHooks.repairNeed}」です。二つを同時に求めず、順番に満たしてください。`
    };
}

module.exports = {
    ARCHETYPES,
    ASSESSMENT_VERSION,
    ASSET_VERSION,
    AXES,
    CATEGORY_KEYS,
    COMPATIBILITY_CATEGORIES,
    FIT_WEIGHTS,
    MOTIFS,
    ROUNDS,
    TOP_CANDIDATE_COUNT,
    TOTAL_ROUNDS,
    buildCompatibility,
    catalog,
    compareCandidateScores,
    createResultHash,
    deriveAssessment,
    deterministicRank,
    deterministicShuffle,
    evaluateAnswers,
    getComplexityAdjustedRatio,
    getDestinyProfile,
    getPublicDestinyProfile,
    getQuestion,
    getResponseRatio,
    getResponseWeight,
    rankAnimalCandidates,
    scoreAnimal,
    spreadCompatibilityScore
};
