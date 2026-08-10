'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const animalInsights = require('./data/personality-animal-insights');
const speciesCatalog = require('../server/data/past-life-animal-species.json');
const {
    ARCHETYPES,
    ASSESSMENT_VERSION,
    AXES,
    CATEGORY_KEYS,
    MOTIFS,
    ROUNDS,
    TOTAL_ROUNDS,
    buildCompatibility,
    catalog,
    evaluateAnswers,
    getDestinyProfile,
    rankAnimalCandidates
} = require('../server/personalityAssessmentEngine');

const ROOT = path.resolve(__dirname, '..');
const ALLOW_MISSING_ANIMAL_IMAGES = process.argv.includes('--allow-missing-images');
const REQUIRED_TEXT = Object.freeze(['traits', 'pastLifeMemory', 'core', 'strength', 'weakness', 'relationships', 'advice']);
const INTERNAL_KEYS = Object.freeze([
    'selection', 'relationVector', 'compatibilityHooks', 'lineage', 'axisScores',
    'motifAffinities', 'archetypeAffinities', 'tempo', 'candidates', 'selectedFit',
    'targetType', 'typeCode', 'personalityType'
]);
const DATE_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const SPECIES_CATEGORIES = Object.freeze(['mammal', 'bird', 'reptile', 'amphibian', 'aquatic', 'invertebrate']);
const AMPHIBIAN_NAMES = new Set([
    'メキシコサラマンダー', 'オオサンショウウオ', 'アカハライモリ', 'ファイアサラマンダー',
    'ニホンアマガエル', 'ヤドクガエル', 'ウシガエル', 'ベルツノガエル', 'アカメアマガエル',
    'トノサマガエル', 'ニホンヒキガエル', 'ゴライアスガエル', 'トビガエル'
]);
const MALFORMED_TEXT = Object.freeze([
    /です日/u,
    /と決めてくださいと/u,
    /する関係ほど/u,
    /行き過ぎると.+すると/u,
    /最悪 of/u,
    /気づした/u,
    /中取り半端/u,
    /向向見ず/u,
    /たづな/u,
    /ます(?:うえ|ながら)/u,
    /ことがあります(?:点|ところ)/u,
    /なります(?:点|ところ)/u,
    /ことですこと/u
]);

function fail(message) {
    throw new Error(`[personality-audit] ${message}`);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

function uniqueCount(values) {
    return new Set(values).size;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readWebpDimensions(image, label) {
    const chunk = image.subarray(12, 16).toString('ascii');
    const dataOffset = 20;
    if (chunk === 'VP8X') {
        return {
            width: image.readUIntLE(dataOffset + 4, 3) + 1,
            height: image.readUIntLE(dataOffset + 7, 3) + 1
        };
    }
    if (chunk === 'VP8 ') {
        const signatureOffset = image.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), dataOffset);
        assert(signatureOffset >= 0, `${label} has an invalid VP8 frame`);
        return {
            width: image.readUInt16LE(signatureOffset + 3) & 0x3fff,
            height: image.readUInt16LE(signatureOffset + 5) & 0x3fff
        };
    }
    if (chunk === 'VP8L') {
        const bits = image.readUInt32LE(dataOffset + 1);
        return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >>> 14) & 0x3fff) + 1
        };
    }
    fail(`${label} has unsupported WebP chunk ${chunk}`);
}

function calendarDays() {
    const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthLengths.flatMap((length, monthIndex) => (
        Array.from({ length }, (_, dayIndex) => `${String(monthIndex + 1).padStart(2, '0')}-${String(dayIndex + 1).padStart(2, '0')}`)
    ));
}

function normalizedTrigrams(text) {
    const normalized = String(text || '').replace(/[\s。、，,.「」『』（）()・：:]/gu, '');
    const result = new Set();
    for (let index = 0; index <= normalized.length - 3; index += 1) {
        result.add(normalized.slice(index, index + 3));
    }
    return result;
}

function jaccard(left, right) {
    const leftSet = normalizedTrigrams(left);
    const rightSet = normalizedTrigrams(right);
    let intersection = 0;
    leftSet.forEach((value) => {
        if (rightSet.has(value)) intersection += 1;
    });
    const union = leftSet.size + rightSet.size - intersection;
    return union ? intersection / union : 1;
}

function assertVector(vector, keys, min, max, label) {
    keys.forEach((key) => {
        const value = Number(vector?.[key]);
        assert(Number.isFinite(value) && value >= min && value <= max, `${label}.${key} is outside ${min}..${max}`);
    });
}

function assertWebp(filePath, label, minimumBytes = 8_000, expectedSize = null) {
    assert(fs.existsSync(filePath), `missing image ${label}`);
    const image = fs.readFileSync(filePath);
    assert(image.length >= minimumBytes, `${label} is unexpectedly small (${image.length} bytes)`);
    assert(image.subarray(0, 4).toString('ascii') === 'RIFF' && image.subarray(8, 12).toString('ascii') === 'WEBP', `${label} is not WebP`);
    if (expectedSize) {
        const dimensions = readWebpDimensions(image, label);
        assert(dimensions.width === expectedSize && dimensions.height === expectedSize, `${label} must be ${expectedSize}x${expectedSize}, received ${dimensions.width}x${dimensions.height}`);
    }
}

assert(ASSESSMENT_VERSION === 2, `assessment version must be 2, received ${ASSESSMENT_VERSION}`);
assert(catalog.version === 3 && catalog.catalogVersion === 'personality-destiny-v3', 'catalog must use the V3 reading schema');
assert(Array.isArray(catalog.animals) && catalog.animals.length === 365, `expected 365 animals, received ${catalog.animals?.length || 0}`);
assert(Array.isArray(speciesCatalog.species) && speciesCatalog.species.length === 365, 'species seed must contain 365 animals');
assert(speciesCatalog.species.every((species) => SPECIES_CATEGORIES.includes(species.category)), 'species seed contains an unknown category');
assert(speciesCatalog.species.every((species) => AMPHIBIAN_NAMES.has(species.name) === (species.category === 'amphibian')), 'amphibian species must use the amphibian category');
assert(Object.keys(animalInsights).length === 365, 'individual insight table must contain 365 animals');
assert(uniqueCount(catalog.animals.map((animal) => animal.id)) === 365, 'animal IDs must be unique');
assert(uniqueCount(catalog.animals.map((animal) => animal.name)) === 365, 'animal names must be unique');
assert(uniqueCount(catalog.animals.map((animal) => animal.imageUrl)) === 365, 'animal image paths must be unique');
assert(catalog.animals.every((animal, index) => animal.name === speciesCatalog.species[index].name), 'generated animal order must match the species seed');
assert(catalog.animals.every((animal) => animalInsights[animal.name]), 'every generated animal must have an individual insight');

const serializedCatalog = JSON.stringify(catalog);
['targetType', 'typeSystem', 'typeCompatibility', 'typeCode', 'personalityType', 'epithet', 'why', 'guardianArcana'].forEach((obsoleteKey) => {
    assert(!serializedCatalog.includes(`"${obsoleteKey}"`), `catalog still contains obsolete key ${obsoleteKey}`);
});
assert(!Object.hasOwn(catalog, 'arcana'), 'catalog still contains the obsolete arcana list');

const expectedDates = calendarDays();
const actualDates = catalog.animals.map((animal) => animal.arcanaDay?.value).sort();
assert(uniqueCount(actualDates) === 365, 'arcana days must be unique');
assert(JSON.stringify(actualDates) === JSON.stringify([...expectedDates].sort()), 'arcana days must cover every non-leap calendar day exactly once');

const completeReadings = [];
const summaryProfiles = [];

catalog.animals.forEach((animal, index) => {
    const label = `${animal.id}/${animal.name}`;
    assert(animal.id === `animal-${String(index + 1).padStart(3, '0')}`, `${label} has an invalid sequential ID`);
    assert(animal.imageUrl === `/assets/personality-animals/${animal.id}.webp`, `${label} has an invalid image path`);
    REQUIRED_TEXT.forEach((field) => {
        const value = String(animal[field] || '').trim();
        const minimum = field === 'traits' || field === 'pastLifeMemory' ? 120 : 55;
        assert(value.length >= minimum && value.length <= 360, `${label}.${field} has unsuitable length ${value.length}`);
        assert(value.endsWith('。'), `${label}.${field} must end with Japanese punctuation`);
        assert(!/(今日|明日)/u.test(value), `${label}.${field} must remain timeless`);
        MALFORMED_TEXT.forEach((pattern) => assert(!pattern.test(value), `${label}.${field} contains malformed phrase ${pattern}`));
    });
    ['人との関わり方では', '情報の受け取り方は', '判断では', '物事の進め方は'].forEach((perspective) => {
        assert(animal.traits.includes(perspective), `${label}.traits does not explain ${perspective}`);
    });
    assert(animal.core.includes(animal.name), `${label}.core must identify the animal`);
    assert(animal.pastLifeMemory.includes(animal.name), `${label}.pastLifeMemory must identify the animal`);
    assert((animal.pastLifeMemory.match(/。/gu) || []).length === 2, `${label}.pastLifeMemory must contain exactly two sentences`);
    assert(animal.advice.includes(animalInsights[animal.name].action), `${label}.advice must use its individual action`);
    assertVector(animal.selection?.axes, AXES, -1, 1, `${label}.selection.axes`);
    assertVector(animal.selection?.motif, MOTIFS, 0, 1, `${label}.selection.motif`);
    assertVector(animal.selection?.archetype, ARCHETYPES, 0, 1, `${label}.selection.archetype`);
    assert(Number.isFinite(Number(animal.selection?.tempo)) && animal.selection.tempo >= 0 && animal.selection.tempo <= 1, `${label}.selection.tempo is invalid`);
    assertVector(animal.relationVector, ['warmth', 'independence', 'loyalty', 'energy', 'flexibility', 'directness', 'order', 'recovery'], -1, 1, `${label}.relationVector`);
    ['offers', 'needs', 'trusts', 'conflictPattern', 'repairNeed', 'workStyle'].forEach((field) => {
        const value = String(animal.compatibilityHooks?.[field] || '');
        assert(value.length >= 8, `${label}.compatibilityHooks.${field} is incomplete`);
        MALFORMED_TEXT.forEach((pattern) => assert(!pattern.test(value), `${label}.compatibilityHooks.${field} contains ${pattern}`));
    });
    assert(DATE_PATTERN.test(animal.arcanaDay?.value || ''), `${label} has an invalid arcana date`);
    assert(animal.arcanaDay.label === `${Number(animal.arcanaDay.value.slice(0, 2))}月${Number(animal.arcanaDay.value.slice(3))}日`, `${label} has a mismatched arcana date label`);
    assert(String(animal.arcanaDay.omen || '').length >= 35 && animal.arcanaDay.omen.endsWith('。'), `${label} has an incomplete public omen`);
    assert(String(animal.arcanaDay.prophecy || '').length >= 85 && animal.arcanaDay.prophecy.endsWith('。'), `${label} has an incomplete future prophecy`);
    assert(animal.arcanaDay.prophecy.startsWith(`${animal.arcanaDay.label}前後、`), `${label} prophecy must begin with its symbolic date`);
    assert((animal.arcanaDay.prophecy.match(/。/gu) || []).length === 1, `${label} prophecy must be one sentence`);

    const syntheticEvaluation = {
        axisScores: animal.selection.axes,
        motifAffinities: animal.selection.motif,
        archetypeAffinities: animal.selection.archetype,
        tempo: animal.selection.tempo
    };
    const winner = rankAnimalCandidates(syntheticEvaluation, 1)[0]?.animal;
    assert(winner?.id === animal.id, `${label} cannot win for its own semantic profile (winner: ${winner?.name || 'none'})`);

    const full = getDestinyProfile({ animalId: animal.id }, { detail: 'full' });
    const summary = getDestinyProfile({ animalId: animal.id }, { detail: 'summary' });
    assert(full?.animal?.pastLifeMemory === animal.pastLifeMemory && full?.arcanaDay?.prophecy === animal.arcanaDay.prophecy && full?.readingVersion === catalog.catalogVersion, `${label} cannot build a full owner profile`);
    assert(summary?.animal?.name === animal.name && !summary.animal.pastLifeMemory && !summary.arcanaDay?.prophecy && summary.arcanaDay?.omen === animal.arcanaDay.omen && !summary.readingVersion, `${label} summary leaks owner-only reading details`);
    const publicJson = JSON.stringify({ full, summary });
    INTERNAL_KEYS.forEach((key) => assert(!publicJson.includes(`"${key}"`), `${label} public profile leaks ${key}`));
    completeReadings.push([...REQUIRED_TEXT.map((field) => animal[field]), animal.arcanaDay.prophecy].join('\n'));
    summaryProfiles.push(JSON.stringify(summary));
});

assert(uniqueCount(completeReadings) === 365, 'all 365 complete readings must be unique');
assert(uniqueCount(catalog.animals.map((animal) => animal.pastLifeMemory)) === 365, 'all 365 past-life memories must be unique');
assert(uniqueCount(catalog.animals.map((animal) => animal.arcanaDay.prophecy)) === 365, 'all 365 future prophecies must be unique');
assert(uniqueCount(catalog.animals.map((animal) => animal.arcanaDay.omen)) === 365, 'all 365 public omens must be unique');
assert(uniqueCount(summaryProfiles) === 365, 'all 365 public summaries must be unique');

let closestPair = { similarity: 0, left: '', right: '' };
for (let leftIndex = 0; leftIndex < completeReadings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < completeReadings.length; rightIndex += 1) {
        const similarity = jaccard(completeReadings[leftIndex], completeReadings[rightIndex]);
        if (similarity > closestPair.similarity) {
            closestPair = {
                similarity,
                left: catalog.animals[leftIndex].name,
                right: catalog.animals[rightIndex].name
            };
        }
    }
}
assert(closestPair.similarity < 0.86, `readings for ${closestPair.left}/${closestPair.right} are too similar (${closestPair.similarity.toFixed(3)})`);

const compatibilityScores = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, new Set()]));
const compatibilitySummaries = new Set();
let pairCount = 0;
for (let leftIndex = 0; leftIndex < catalog.animals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex; rightIndex < catalog.animals.length; rightIndex += 1) {
        const left = catalog.animals[leftIndex];
        const right = catalog.animals[rightIndex];
        const forward = buildCompatibility({ animalId: left.id }, { animalId: right.id });
        const reverse = buildCompatibility({ animalId: right.id }, { animalId: left.id });
        assert(forward && JSON.stringify(forward) === JSON.stringify(reverse), `${left.id}/${right.id} compatibility must be symmetric`);
        assert(forward.overall >= 35 && forward.overall <= 98, `${left.id}/${right.id} overall compatibility is outside 35..98`);
        ['summary', 'strength', 'friction', 'advice'].forEach((field) => {
            assert(String(forward[field] || '').length >= 28 && forward[field].endsWith('。'), `${left.id}/${right.id}.${field} is incomplete`);
            MALFORMED_TEXT.forEach((pattern) => assert(!pattern.test(forward[field]), `${left.id}/${right.id}.${field} contains ${pattern}`));
        });
        CATEGORY_KEYS.forEach((category) => {
            const entry = forward.categories?.[category];
            assert(entry?.score >= 35 && entry.score <= 98, `${left.id}/${right.id}.${category} score is outside 35..98`);
            assert(String(entry.summary || '').length >= 45 && entry.summary.endsWith('。'), `${left.id}/${right.id}.${category} narrative is incomplete`);
            MALFORMED_TEXT.forEach((pattern) => assert(!pattern.test(entry.summary), `${left.id}/${right.id}.${category} contains ${pattern}`));
            compatibilityScores[category].add(entry.score);
            compatibilitySummaries.add(entry.summary);
        });
        pairCount += 1;
    }
}
assert(pairCount === 66_795, `expected 66,795 unordered pairs including self-pairs; received ${pairCount}`);
CATEGORY_KEYS.forEach((category) => assert(compatibilityScores[category].size >= 35, `${category} compatibility has insufficient score variation`));
assert(compatibilitySummaries.size >= 200_000, `compatibility narratives are insufficiently individualized (${compatibilitySummaries.size})`);

assert(ROUNDS.length === 12 && TOTAL_ROUNDS === 12, 'assessment must contain 12 rounds');
const creatureIds = [];
const creatureNames = [];
const assessmentImageHashes = [];
ROUNDS.forEach((round, roundIndex) => {
    assert(round.options.length === 4, `round ${roundIndex + 1} must contain four options`);
    assert(['symbolic', 'environmental', 'intricate'].includes(round.complexityTier), `round ${roundIndex + 1} has an invalid complexity tier`);
    round.options.forEach((option) => {
        creatureIds.push(option.creatureId);
        creatureNames.push(option.creatureName);
        assertVector(option.axisVector, AXES, -1, 1, `${option.id}.axisVector`);
        assertVector(option.motifVector, MOTIFS, 0, 1, `${option.id}.motifVector`);
        assertVector(option.archetypeVector, ARCHETYPES, 0, 1, `${option.id}.archetypeVector`);
        assert(Number.isFinite(option.tempo) && option.tempo >= 0 && option.tempo <= 1, `${option.id}.tempo is invalid`);
        const imagePath = path.join(ROOT, 'public', option.imageUrl.replace(/^\//u, ''));
        assertWebp(imagePath, option.imageUrl);
        assessmentImageHashes.push(sha256(imagePath));
    });
});
assert(uniqueCount(creatureIds) === 48, 'all 48 creature IDs must be distinct');
assert(uniqueCount(creatureNames) === 48, 'all 48 creature names must be distinct');
assert(uniqueCount(assessmentImageHashes) === 48, 'all 48 assessment images must be visually distinct files');

const deterministicWinners = new Set();
for (let code = 0; code < 4_096; code += 1) {
    let state = Math.imul(code + 1, 2_654_435_761) >>> 0;
    const answers = ROUNDS.map((round, roundIndex) => {
        state = (Math.imul(state ^ (roundIndex * 2_246_822_519), 1_664_525) + 1_013_904_223) >>> 0;
        const optionIndex = state >>> 30;
        return {
            roundId: round.id,
            optionId: round.options[optionIndex].id,
            seconds: 2 + ((state >>> 8) % 17)
        };
    });
    const evaluation = evaluateAnswers(answers);
    deterministicWinners.add(rankAnimalCandidates(evaluation, 1)[0].animal.id);
}
assert(deterministicWinners.size >= 110, `actual answer paths reach too few distinct animals (${deterministicWinners.size})`);

const animalImagePaths = catalog.animals.map((animal) => path.join(ROOT, 'public', animal.imageUrl.replace(/^\//u, '')));
const missingAnimalImages = animalImagePaths.filter((filePath) => !fs.existsSync(filePath));
if (!ALLOW_MISSING_ANIMAL_IMAGES) {
    assert(missingAnimalImages.length === 0, `${missingAnimalImages.length} of 365 animal images are missing`);
    const animalImageHashes = animalImagePaths.map((filePath, index) => {
        assertWebp(filePath, catalog.animals[index].imageUrl, 12_000, 768);
        return sha256(filePath);
    });
    assert(uniqueCount(animalImageHashes) === 365, 'all 365 animal images must be distinct files');
}

console.log(`[personality-audit] OK animals:${catalog.animals.length} memories:365 prophecies:365 dates:365 pairs:${pairCount} rounds:${ROUNDS.length} assessmentImages:48 animalImages:${365 - missingAnimalImages.length}/365 closestReading:${closestPair.similarity.toFixed(3)} answerWinners:${deterministicWinners.size}`);
