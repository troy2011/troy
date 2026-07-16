const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
    ASSESSMENT_VERSION,
    AXES,
    ROUNDS,
    TOTAL_ROUNDS
} = require('../server/specialAbilityEngine');
const creatureAssessment = require('../server/data/special-ability-creatures.json');
const { SPECIAL_ABILITY_PROFILES } = require('./special-ability-profiles');

const CATALOG_PATH = path.resolve(__dirname, '..', 'server', 'data', 'special-abilities.json');
const IMAGE_DIRECTORY = path.resolve(__dirname, '..', 'public', 'assets', 'special-ability');
const EXPECTED_TYPES = Object.freeze([
    'ENFJ', 'ENFP', 'ENTJ', 'ENTP',
    'ESFJ', 'ESFP', 'ESTJ', 'ESTP',
    'INFJ', 'INFP', 'INTJ', 'INTP',
    'ISFJ', 'ISFP', 'ISTJ', 'ISTP'
]);
const EXPECTED_COUNTS = Object.freeze({
    manipulation: 55,
    specialization: 78,
    transmutation: 78,
    conjuration: 66,
    enhancement: 44,
    emission: 44
});
const BANNED_TERMS = [
    'ハンター', '念能力', 'スタンド', '悪魔の実', '領域展開', '写輪眼', '卍解', 'ゴムゴム', 'ザ・ワールド'
];
const BORROWED_ALIAS_TERMS = [
    'ディープ・パープル', 'バンジー・ガム', 'スキル・ハンター', 'ゴッドスピード',
    'ドラゴン・ダイヴ', 'パーフェクト・プラン', 'ハイド・アンド・シーク'
];
const LEGACY_FORMULA_TERMS = ['その制御により', 'その形式により', 'その形を生かし', 'その構造により', 'その強化により', 'その放ち方により'];
const RULE_TRIGGER_PATTERN = /発動|触れ|当て|置|描|呼|言|聞|見|持|握|立|止|続|決め|選|指定|告げ|書|閉|開|入れ|放|向け|作|変|測|集|示|覆|保|使|追|返|通|歩|眠|投|鳴|打|吸|吹|踏|乗|覚|思|なぞ|並|とど|かざ|伸|しゃが|取|さら|質問|囲|付け|固定|刺|巻|確かめ|だけ|必要|すると|時に|前に|後に|まで/;

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s、。・「」『』（）()!?！？:：ー-]/g, '');
}

function trigrams(value) {
    const text = normalizeText(value);
    const grams = new Set();
    for (let index = 0; index <= text.length - 3; index += 1) {
        grams.add(text.slice(index, index + 3));
    }
    return grams;
}

function jaccard(left, right) {
    if (!left.size && !right.size) return 1;
    let intersection = 0;
    left.forEach((item) => {
        if (right.has(item)) intersection += 1;
    });
    return intersection / (left.size + right.size - intersection);
}

function fail(message) {
    throw new Error(`[special-ability-audit] ${message}`);
}

function readUInt24LE(buffer, offset) {
    return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readWebpDimensions(buffer) {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const type = buffer.subarray(offset, offset + 4).toString('ascii');
        const size = buffer.readUInt32LE(offset + 4);
        const dataOffset = offset + 8;
        if (type === 'VP8X' && dataOffset + 10 <= buffer.length) {
            return {
                width: readUInt24LE(buffer, dataOffset + 4) + 1,
                height: readUInt24LE(buffer, dataOffset + 7) + 1
            };
        }
        if (type === 'VP8 ' && dataOffset + 10 <= buffer.length) {
            return {
                width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
                height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
            };
        }
        if (type === 'VP8L' && dataOffset + 5 <= buffer.length && buffer[dataOffset] === 0x2f) {
            const b1 = buffer[dataOffset + 1];
            const b2 = buffer[dataOffset + 2];
            const b3 = buffer[dataOffset + 3];
            const b4 = buffer[dataOffset + 4];
            return {
                width: 1 + b1 + ((b2 & 0x3f) << 8),
                height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
            };
        }
        offset = dataOffset + size + (size % 2);
    }
    return null;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const abilities = Array.isArray(catalog?.abilities) ? catalog.abilities : [];
if (abilities.length !== 365) fail(`expected 365 abilities, got ${abilities.length}`);

const ids = new Set();
const names = new Set();
const aliases = new Set();
const effects = new Set();
const rules = new Set();
const firstSentences = new Set();
const counts = {};
const targetTypeCounts = {};
const tempoBandCounts = { instinctive: 0, balanced: 0, deliberate: 0 };
const effectGrams = [];

abilities.forEach((ability, index) => {
    const label = ability?.id || `index:${index}`;
    if (!ability?.id || ids.has(ability.id)) fail(`duplicate or empty id: ${label}`);
    ids.add(ability.id);
    const normalizedName = normalizeText(ability.name);
    const normalizedAlias = normalizeText(ability.alias);
    const aliasLength = Array.from(String(ability.alias || '').replace(/・/g, '')).length;
    const normalizedEffect = normalizeText(ability.effect);
    const normalizedRule = normalizeText(ability.rule);
    if (normalizedName.length < 3 || normalizedName.length > 30) fail(`invalid name length: ${label}`);
    if (aliasLength < 5 || aliasLength > 24) fail(`invalid alias length: ${label}`);
    if (!/^[ァ-ヶー・]+$/.test(String(ability.alias || ''))) fail(`alias must use katakana: ${label}`);
    if (normalizedEffect.length < 25 || normalizedEffect.length > 70) fail(`invalid effect length: ${label}`);
    if (normalizedRule.length < 18 || normalizedRule.length > 55) fail(`invalid rule length: ${label}`);
    if (String(ability.name).includes('・')) fail(`name still uses the retired motif/form pattern: ${label}`);
    if (names.has(normalizedName)) fail(`duplicate name: ${ability.name}`);
    if (aliases.has(normalizedAlias)) fail(`duplicate alias: ${ability.alias}`);
    if (effects.has(normalizedEffect)) fail(`duplicate effect: ${label}`);
    if (rules.has(normalizedRule)) fail(`duplicate activation rule: ${label}`);
    const normalizedFirstSentence = normalizeText(String(ability.effect).split('。')[0]);
    if (firstSentences.has(normalizedFirstSentence)) fail(`duplicate core mechanism: ${label}`);
    names.add(normalizedName);
    aliases.add(normalizedAlias);
    effects.add(normalizedEffect);
    rules.add(normalizedRule);
    firstSentences.add(normalizedFirstSentence);
    const sentenceCount = (String(ability.effect).match(/。/g) || []).length;
    if (sentenceCount !== 1) fail(`effect must be exactly one sentence: ${label}`);
    if (!String(ability.effect).endsWith('。')) fail(`effect must end with a full stop: ${label}`);
    const ruleSentenceCount = (String(ability.rule).match(/。/g) || []).length;
    if (ruleSentenceCount !== 1 || !String(ability.rule).endsWith('。')) {
        fail(`activation rule must be exactly one sentence: ${label}`);
    }
    if (!RULE_TRIGGER_PATTERN.test(String(ability.rule))) fail(`activation rule lacks a concrete trigger: ${label}`);
    [...BANNED_TERMS, ...LEGACY_FORMULA_TERMS].forEach((term) => {
        if (`${ability.name}${ability.alias}${ability.effect}${ability.rule}`.includes(term)) fail(`banned term ${term}: ${label}`);
    });
    BORROWED_ALIAS_TERMS.forEach((term) => {
        if (String(ability.alias).includes(term)) fail(`borrowed ability alias ${term}: ${label}`);
    });
    if (!EXPECTED_COUNTS[ability.affinity]) fail(`unknown affinity: ${label}`);
    counts[ability.affinity] = (counts[ability.affinity] || 0) + 1;
    if (!Array.isArray(ability.compatibleTypes) || ability.compatibleTypes.length < 1) fail(`missing compatible types: ${label}`);
    if (!ability.compatibleTypes.includes(ability.targetType)) fail(`target type is incompatible: ${label}`);
    if (!ability.traitVector || !['E', 'S', 'T', 'J'].every((axis) => [-1, 1].includes(ability.traitVector[axis]))) {
        fail(`invalid trait vector: ${label}`);
    }
    if (!Number.isFinite(ability.tempoTarget) || ability.tempoTarget < 0 || ability.tempoTarget > 1) {
        fail(`invalid tempo target: ${label}`);
    }
    const profile = SPECIAL_ABILITY_PROFILES[ability.name];
    if (!profile) fail(`missing authored source profile: ${label}`);
    if (profile.affinity !== ability.affinity
        || profile.alias !== ability.alias
        || profile.rule !== ability.rule
        || profile.targetType !== ability.targetType
        || profile.tempoTarget !== ability.tempoTarget) {
        fail(`generated metadata differs from authored profile: ${label}`);
    }
    targetTypeCounts[ability.affinity] ||= {};
    targetTypeCounts[ability.affinity][ability.targetType] = (targetTypeCounts[ability.affinity][ability.targetType] || 0) + 1;
    const tempoBand = ability.tempoTarget < 0.34
        ? 'instinctive'
        : ability.tempoTarget < 0.67 ? 'balanced' : 'deliberate';
    tempoBandCounts[tempoBand] += 1;
    effectGrams.push({ label, grams: trigrams(ability.effect) });
});

Object.entries(EXPECTED_COUNTS).forEach(([affinity, expected]) => {
    if (counts[affinity] !== expected) fail(`${affinity} expected ${expected}, got ${counts[affinity] || 0}`);
});
if (Object.keys(SPECIAL_ABILITY_PROFILES).length !== abilities.length) {
    fail(`expected one authored profile per ability, got ${Object.keys(SPECIAL_ABILITY_PROFILES).length}`);
}
Object.entries(targetTypeCounts).forEach(([affinity, typeCounts]) => {
    const expectedTargetTypes = [...new Set(abilities
        .filter((ability) => ability.affinity === affinity)
        .flatMap((ability) => ability.compatibleTypes))];
    expectedTargetTypes.forEach((type) => {
        if ((typeCounts[type] || 0) < 3) fail(`${affinity}/${type} has fewer than three primary-fit abilities`);
    });
});
Object.entries(tempoBandCounts).forEach(([band, count]) => {
    if (count < 50) fail(`tempo band ${band} has only ${count} abilities`);
});

const typeAffinities = catalog?.typeAffinities || {};
const actualTypes = Object.keys(typeAffinities).sort();
if (JSON.stringify(actualTypes) !== JSON.stringify(EXPECTED_TYPES)) {
    fail(`expected all 16 types, got ${actualTypes.join(',')}`);
}
let typeAffinityCombinationCount = 0;
Object.entries(typeAffinities).forEach(([type, affinities]) => {
    if (!Array.isArray(affinities) || new Set(affinities).size !== affinities.length) {
        fail(`${type} has invalid or duplicate affinities`);
    }
    affinities.forEach((affinity) => {
        typeAffinityCombinationCount += 1;
        if (!EXPECTED_COUNTS[affinity]) fail(`${type} has unknown affinity ${affinity}`);
        const candidateCount = abilities.filter((ability) => (
            ability.affinity === affinity && ability.compatibleTypes.includes(type)
        )).length;
        if (candidateCount < 12) fail(`${type}/${affinity} has only ${candidateCount} candidates`);
    });
});
if (typeAffinityCombinationCount !== 33) {
    fail(`expected 33 type-affinity combinations, got ${typeAffinityCombinationCount}`);
}

if (ROUNDS.length !== TOTAL_ROUNDS || TOTAL_ROUNDS !== 12) {
    fail(`expected 12 assessment rounds, got ${ROUNDS.length}`);
}
if (creatureAssessment.version !== ASSESSMENT_VERSION) {
    fail(`creature assessment version must be ${ASSESSMENT_VERSION}`);
}
const primaryAxisCounts = Object.fromEntries(AXES.map((axis) => [axis, 0]));
const secondaryAxisCounts = Object.fromEntries(AXES.map((axis) => [axis, 0]));
const axisPairs = new Set();
const creatureIds = new Set();
const creatureNames = new Set();
const creatureTypeCounts = {};
let alignedRelevantCreatureTraits = 0;
let totalRelevantCreatureTraits = 0;
const tierCounts = { symbolic: 0, environmental: 0, intricate: 0 };
ROUNDS.forEach((round, roundIndex) => {
    const expectedId = `r${String(roundIndex + 1).padStart(2, '0')}`;
    if (round.id !== expectedId) fail(`invalid round id at index ${roundIndex}: ${round.id}`);
    if (!AXES.includes(round.axis) || !AXES.includes(round.secondaryAxis) || round.axis === round.secondaryAxis) {
        fail(`invalid axis pairing: ${round.id}`);
    }
    primaryAxisCounts[round.axis] += 1;
    secondaryAxisCounts[round.secondaryAxis] += 1;
    const axisPair = `${round.axis}>${round.secondaryAxis}`;
    if (axisPairs.has(axisPair)) fail(`duplicate ordered axis pair: ${axisPair}`);
    axisPairs.add(axisPair);
    const expectedTier = roundIndex < 4 ? 'symbolic' : roundIndex < 8 ? 'environmental' : 'intricate';
    if (round.complexityTier !== expectedTier) fail(`invalid complexity tier: ${round.id}`);
    tierCounts[round.complexityTier] = (tierCounts[round.complexityTier] || 0) + 1;
    if (!Array.isArray(round.options) || round.options.length !== 4) fail(`${round.id} must have four options`);
    const scenePairs = [];
    round.options.forEach((option, optionIndex) => {
        const expectedOptionId = `${round.id}-${String.fromCharCode(97 + optionIndex)}`;
        if (option.id !== expectedOptionId) fail(`invalid option id: ${option.id}`);
        if (!option.creatureId || creatureIds.has(option.creatureId)) fail(`duplicate or missing creature id: ${option.id}`);
        if (!option.creatureName || creatureNames.has(option.creatureName)) fail(`duplicate or missing creature name: ${option.id}`);
        creatureIds.add(option.creatureId);
        creatureNames.add(option.creatureName);
        const scenePrimary = Number(option.sceneScore?.[round.axis]);
        const sceneSecondary = Number(option.sceneScore?.[round.secondaryAxis]);
        if (![0.75, -0.75].includes(scenePrimary) || ![0.25, -0.25].includes(sceneSecondary)) {
            fail(`invalid scene score: ${option.id}`);
        }
        const creatureLetters = [];
        AXES.forEach((axis) => {
            const creatureScore = Number(option.creatureScore?.[axis]);
            if (![0.25, -0.25].includes(creatureScore)) fail(`invalid creature trait score: ${option.id}/${axis}`);
            const combinedScore = Number(option.score?.[axis]);
            const expectedScore = Number(option.sceneScore?.[axis] || 0) + creatureScore;
            if (Math.abs(combinedScore - expectedScore) > 1e-9) fail(`combined score mismatch: ${option.id}/${axis}`);
            const positiveLetter = axis;
            const negativeLetter = { E: 'I', S: 'N', T: 'F', J: 'P' }[axis];
            creatureLetters.push(creatureScore > 0 ? positiveLetter : negativeLetter);
        });
        const creatureType = creatureLetters.join('');
        creatureTypeCounts[creatureType] = (creatureTypeCounts[creatureType] || 0) + 1;
        [round.axis, round.secondaryAxis].forEach((axis) => {
            alignedRelevantCreatureTraits += Math.sign(option.creatureScore[axis]) === Math.sign(option.sceneScore[axis]) ? 1 : 0;
            totalRelevantCreatureTraits += 1;
        });
        scenePairs.push(`${scenePrimary}:${sceneSecondary}`);
        if (path.basename(option.imageUrl) !== `${option.id}.webp`) fail(`image mapping mismatch: ${option.id}`);
    });
    const expectedPairs = ['-0.75:-0.25', '-0.75:0.25', '0.75:-0.25', '0.75:0.25'];
    if (JSON.stringify(scenePairs.sort()) !== JSON.stringify(expectedPairs.sort())) {
        fail(`scene score balance is invalid: ${round.id}`);
    }
});
AXES.forEach((axis) => {
    if (primaryAxisCounts[axis] !== 3) fail(`${axis} must be primary exactly three times`);
    if (secondaryAxisCounts[axis] !== 3) fail(`${axis} must be secondary exactly three times`);
});
if (axisPairs.size !== 12) fail(`expected 12 unique ordered axis pairs, got ${axisPairs.size}`);
if (creatureIds.size !== 48 || creatureNames.size !== 48) fail('all 48 options must use distinct fantasy creatures');
if (alignedRelevantCreatureTraits >= totalRelevantCreatureTraits) {
    fail('creature traits must be authored independently from the scene score signs');
}
if (Object.keys(creatureTypeCounts).length !== 16
    || Object.values(creatureTypeCounts).some((count) => count !== 3)) {
    fail(`creature trait types must cover all 16 combinations exactly three times: ${JSON.stringify(creatureTypeCounts)}`);
}
Object.entries(tierCounts).forEach(([tier, count]) => {
    if (count !== 4) fail(`${tier} must contain exactly four rounds`);
});
creatureAssessment.rounds.flatMap((round) => round.options).forEach((option) => {
    if (!String(option.concept || '').trim()) fail(`missing creature concept: ${option.id}`);
});

for (let leftIndex = 0; leftIndex < effectGrams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < effectGrams.length; rightIndex += 1) {
        const similarity = jaccard(effectGrams[leftIndex].grams, effectGrams[rightIndex].grams);
        if (similarity >= 0.88) {
            fail(`effects too similar (${similarity.toFixed(3)}): ${effectGrams[leftIndex].label} / ${effectGrams[rightIndex].label}`);
        }
    }
}

const expectedImageNames = Array.from({ length: TOTAL_ROUNDS }, (_, roundIndex) => (
    ['a', 'b', 'c', 'd'].map((letter) => `r${String(roundIndex + 1).padStart(2, '0')}-${letter}.webp`)
)).flat();
const actualImageNames = fs.readdirSync(IMAGE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith('.webp'))
    .sort();
if (JSON.stringify(actualImageNames) !== JSON.stringify(expectedImageNames)) {
    fail(`expected 48 assessment images, got ${actualImageNames.length}`);
}
const imageHashes = new Set();
actualImageNames.forEach((name) => {
    const data = fs.readFileSync(path.join(IMAGE_DIRECTORY, name));
    if (data.length < 20_000) fail(`image is unexpectedly small: ${name}`);
    if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
        fail(`image is not a valid WebP container: ${name}`);
    }
    const dimensions = readWebpDimensions(data);
    if (dimensions?.width !== 768 || dimensions?.height !== 768) {
        fail(`image must be 768x768: ${name} (${dimensions?.width || 0}x${dimensions?.height || 0})`);
    }
    const imageHash = crypto.createHash('sha256').update(data).digest('hex');
    if (imageHashes.has(imageHash)) fail(`duplicate image content: ${name}`);
    imageHashes.add(imageHash);
});

console.log(`[special-ability-audit] OK total:${abilities.length} affinities:${JSON.stringify(counts)} type-affinity-combinations:${typeAffinityCombinationCount} rounds:${ROUNDS.length} images:${actualImageNames.length}`);
