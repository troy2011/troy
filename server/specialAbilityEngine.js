const crypto = require('crypto');

const catalog = require('./data/special-abilities.json');
const creatureAssessment = require('./data/special-ability-creatures.json');

const ABILITY_BY_ID = new Map(catalog.abilities.map((ability) => [ability.id, ability]));
const PUBLIC_AFFINITY_LABELS = new Set(['操作', '特質', '変化', '具現化', '強化', '放出']);

const AXES = Object.freeze(['E', 'S', 'T', 'J']);
const ASSESSMENT_VERSION = 3;
const TOTAL_ROUNDS = 12;
const TOP_CANDIDATE_COUNT = 12;
const ASSIGNMENT_ELIGIBLE_COUNT = 3;
const MIN_RESPONSE_SECONDS = 1;
const MAX_RESPONSE_SECONDS = 20;
const MAX_WEIGHT = 1.10;
const MIN_WEIGHT = 0.90;
const MIN_RESPONSE_RATIO = 0.60;
const MAX_RESPONSE_RATIO = 1.60;
const SCENE_PRIMARY_SCORE = 0.75;
const SCENE_SECONDARY_SCORE = 0.25;
const CREATURE_TRAIT_WEIGHT = 0.25;
const COMPLEXITY_REFERENCE_SECONDS = Object.freeze({
    symbolic: 4,
    environmental: 6,
    intricate: 8
});
const QUESTION_PROMPT = 'いちばん心が引かれる空想生物を、直感で一体選んでください';

function vector(E = 0, S = 0, T = 0, J = 0) {
    return Object.freeze({ E, S, T, J });
}

function scoredVector(primaryAxis, primaryScore, secondaryAxis, secondaryScore) {
    const scores = Object.fromEntries(AXES.map((axis) => [axis, 0]));
    scores[primaryAxis] = primaryScore;
    scores[secondaryAxis] = secondaryScore;
    return vector(scores.E, scores.S, scores.T, scores.J);
}

function addVectors(left, right) {
    return vector(...AXES.map((axis) => Number(left?.[axis] || 0) + Number(right?.[axis] || 0)));
}

function creatureTraitVector(rawVector) {
    return vector(...AXES.map((axis) => clamp(rawVector?.[axis], -1, 1) * CREATURE_TRAIT_WEIGHT));
}

function createRound(definition) {
    const { id, axis, secondaryAxis, complexityTier } = definition;
    const scoreSigns = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
    ];
    return {
        id,
        axis,
        secondaryAxis,
        complexityTier,
        prompt: QUESTION_PROMPT,
        options: scoreSigns.map(([primarySign, secondarySign], optionIndex) => {
            const letter = String.fromCharCode(97 + optionIndex);
            const creature = definition.options?.[optionIndex];
            const sceneScore = scoredVector(
                axis,
                primarySign * SCENE_PRIMARY_SCORE,
                secondaryAxis,
                secondarySign * SCENE_SECONDARY_SCORE
            );
            const creatureScore = creatureTraitVector(creature?.traitVector);
            return {
                id: `${id}-${letter}`,
                imageUrl: `/assets/special-ability/${id}-${letter}.webp`,
                creatureId: creature?.creatureId,
                creatureName: creature?.creatureName,
                sceneScore,
                creatureScore,
                score: addVectors(sceneScore, creatureScore)
            };
        })
    };
}

const ROUNDS = Object.freeze(creatureAssessment.rounds.map(createRound).map((round) => Object.freeze({
    ...round,
    options: Object.freeze(round.options.map((option) => Object.freeze({
        ...option,
        sceneScore: Object.freeze(option.sceneScore),
        creatureScore: Object.freeze(option.creatureScore),
        score: Object.freeze(option.score)
    })))
})));

const ROUND_BY_ID = new Map(ROUNDS.map((round) => [round.id, round]));

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

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
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
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
    return [...items].sort((left, right) => {
        const leftRank = deterministicRank(seed, left.id);
        const rightRank = deterministicRank(seed, right.id);
        return leftRank.localeCompare(rightRank);
    });
}

function getQuestion(roundIndex, assessmentId) {
    const index = Math.trunc(Number(roundIndex));
    const round = ROUNDS[index];
    if (!round) return null;
    const options = deterministicShuffle(round.options, `${assessmentId}|${round.id}`).map((option, optionIndex) => ({
        id: option.id,
        imageUrl: `${option.imageUrl}?v=${ASSESSMENT_VERSION}`,
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
    const seconds = clamp(rawAnswer?.seconds, MIN_RESPONSE_SECONDS, MAX_RESPONSE_SECONDS);
    return {
        roundId: round.id,
        optionId: option.id,
        seconds,
        complexityTier: round.complexityTier,
        score: option.score
    };
}

function resolveAxisLetter(axis, score, answers) {
    const positiveLetter = axis;
    const negativeLetter = { E: 'I', S: 'N', T: 'F', J: 'P' }[axis];
    if (score > 1e-9) return positiveLetter;
    if (score < -1e-9) return negativeLetter;

    const fastestRelevant = answers
        .map((answer, index) => ({ ...answer, index }))
        .filter((answer) => Number(answer.score?.[axis] || 0) !== 0)
        .sort((left, right) => (
            Number(left.responseRatio ?? left.seconds) - Number(right.responseRatio ?? right.seconds)
            || left.seconds - right.seconds
            || left.index - right.index
        ))[0];
    return Number(fastestRelevant?.score?.[axis] || 0) >= 0 ? positiveLetter : negativeLetter;
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
    const scores = Object.fromEntries(AXES.map((axis) => [axis, 0]));
    for (const answer of weightedAnswers) {
        for (const axis of AXES) scores[axis] += Number(answer.score[axis] || 0) * answer.weight;
    }
    const type = AXES.map((axis) => resolveAxisLetter(axis, scores[axis], weightedAnswers)).join('');
    const medianSeconds = median(weightedAnswers.map((answer) => answer.seconds));
    const normalizedMedianRatio = median(weightedAnswers.map((answer) => answer.complexityRatio));
    const tempo = clamp(
        (normalizedMedianRatio - MIN_RESPONSE_RATIO) / (MAX_RESPONSE_RATIO - MIN_RESPONSE_RATIO),
        0,
        1
    );
    return { answers: weightedAnswers, scores, type, medianSeconds, normalizedMedianRatio, tempo, tierMedians };
}

function selectAffinity(type, tempo) {
    const affinities = catalog.typeAffinities?.[type];
    if (!Array.isArray(affinities) || affinities.length < 1) throw new Error(`Unknown ability type: ${type}`);
    const boundedTempo = clamp(tempo, 0, 1);
    const index = Math.min(affinities.length - 1, Math.floor(boundedTempo * affinities.length));
    return affinities[index];
}

function getTypeVector(type) {
    return {
        E: type.includes('E') ? 1 : -1,
        S: type.includes('S') ? 1 : -1,
        T: type.includes('T') ? 1 : -1,
        J: type.includes('J') ? 1 : -1
    };
}

function scoreAbility(ability, type, affinity, tempo) {
    if (ability?.affinity !== affinity || !ability?.compatibleTypes?.includes(type)) return Number.NEGATIVE_INFINITY;
    const typeVector = getTypeVector(type);
    const traitVector = ability.traitVector || {};
    const axisAlignment = AXES.reduce((score, axis) => (
        score + (Math.sign(Number(traitVector[axis] || 0)) === typeVector[axis] ? 1 : 0)
    ), 0);
    const targetBonus = ability.targetType === type ? 4 : 0;
    const tempoFit = 2 * (1 - Math.abs(clamp(ability.tempoTarget, 0, 1) - clamp(tempo, 0, 1)));
    return targetBonus + axisAlignment + tempoFit;
}

function rankAbilityCandidates(type, affinity, tempo, limit = TOP_CANDIDATE_COUNT) {
    return catalog.abilities
        .map((ability) => ({ ability, score: scoreAbility(ability, type, affinity, tempo) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => right.score - left.score || left.ability.id.localeCompare(right.ability.id))
        .slice(0, Math.max(1, Math.trunc(Number(limit) || TOP_CANDIDATE_COUNT)));
}

function selectLeastUsedAbility(candidates, assignmentCounts = {}, assessmentId = '') {
    if (!Array.isArray(candidates) || !candidates.length) throw new Error('No compatible abilities were found');
    const eligible = candidates
        .slice(0, ASSIGNMENT_ELIGIBLE_COUNT)
        .map((entry) => entry.ability || entry)
        .filter(Boolean);
    const minimumCount = Math.min(...eligible.map((ability) => Math.max(0, Number(assignmentCounts[ability.id]) || 0)));
    return eligible
        .filter((ability) => Math.max(0, Number(assignmentCounts[ability.id]) || 0) === minimumCount)
        .sort((left, right) => (
            deterministicRank(assessmentId, left.id).localeCompare(deterministicRank(assessmentId, right.id))
            || left.id.localeCompare(right.id)
        ))[0];
}

function getPublicAbility(rawAbility) {
    const catalogAbility = ABILITY_BY_ID.get(String(rawAbility?.abilityId || rawAbility?.id || '').trim());
    const name = String(catalogAbility?.name || rawAbility?.name || '').trim().slice(0, 40);
    const alias = String(catalogAbility?.alias || rawAbility?.alias || '').trim().slice(0, 60);
    const effect = String(catalogAbility?.effect || rawAbility?.effect || '').trim().slice(0, 240);
    const rule = String(catalogAbility?.rule || rawAbility?.rule || '').trim().slice(0, 160);
    const affinity = String(catalogAbility?.affinityLabel || rawAbility?.affinityLabel || '').trim();
    return name && alias && effect && rule && PUBLIC_AFFINITY_LABELS.has(affinity)
        ? { name, alias, effect, rule, affinity }
        : null;
}

function deriveAssessment(rawAnswers, assessmentId) {
    const evaluation = evaluateAnswers(rawAnswers);
    const affinity = selectAffinity(evaluation.type, evaluation.tempo);
    const candidates = rankAbilityCandidates(evaluation.type, affinity, evaluation.tempo);
    if (candidates.length < TOP_CANDIDATE_COUNT) throw new Error('Ability candidate coverage is insufficient');
    return { ...evaluation, affinity, candidates };
}

module.exports = {
    ASSESSMENT_VERSION,
    ASSIGNMENT_ELIGIBLE_COUNT,
    AXES,
    MAX_RESPONSE_SECONDS,
    MIN_RESPONSE_SECONDS,
    ROUNDS,
    TOP_CANDIDATE_COUNT,
    TOTAL_ROUNDS,
    catalog,
    deriveAssessment,
    deterministicRank,
    evaluateAnswers,
    getComplexityAdjustedRatio,
    getPublicAbility,
    getQuestion,
    getResponseRatio,
    getResponseWeight,
    median,
    normalizeAnswer,
    rankAbilityCandidates,
    resolveAxisLetter,
    scoreAbility,
    selectAffinity,
    selectLeastUsedAbility
};
