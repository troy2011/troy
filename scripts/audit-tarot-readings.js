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
const MAJOR_KEYS = Array.from({ length: 22 }, (_, index) => String(index));
const SUITS = ['wand', 'cup', 'sword', 'pentacle'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'page', 'knight', 'queen', 'king'];
const ORIENTATIONS = ['upright', 'reversed'];
const RED_FLAGS = {
    love: ['仕事', '職場', '業務', '事業', '会社', '売上', '利益', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '人間関係', 'コミュニティ', 'グループ', '人脈'],
    work: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', 'ワンナイト', '愛情', '伴侶'],
    relation: ['売上', '案件', '取引先', 'クライアント', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談'],
    future: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', '売上', '取引先', 'クライアント', '納期', '監査']
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
    'この場面のところ',
    'この流れの中は',
    '一日にする局面',
    '地味な一日'
];
const GENERATED_TOPIC_IDS = ['overall', 'love', 'work', 'relation', 'future', 'money', 'today'];
const SIMPLE_MEANING_RE = /^このカードの意味: .+では「.+」が出ているサイン。$/m;

function loadTables() {
    const code = fs.readFileSync(SOURCE_PATH, 'utf8');
    const context = {
        window: {
            addEventListener() {},
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
        },
        document: {
            addEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({})
        },
        console,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
  allCards,
  getWeatherStatus,
  getStanceId,
  READING_PROFILES,
  MAJOR_CARD_WORDS,
  SIMPLE_MAJOR_THEMES,
  SIMPLE_MAJOR_TOPIC_THEMES,
  SIMPLE_MINOR_THEMES,
  MINOR_CARD_WORDS,
  TOPICS,
  buildRichReading,
  buildStandardReading,
  getSpecialReadingBody
};`, context);
    return context.__tarotAudit;
}

function pushReading(readings, topicId, loc, orientation, text) {
    readings.push({
        topicId,
        loc,
        orientation,
        text: String(text || '').trim()
    });
}

function collectReadings(tables) {
    const readings = [];
    Object.entries(TOPIC_TABLES).forEach(([topicId, [majorName, minorName]]) => {
        const major = tables[majorName] || {};
        const minor = tables[minorName] || {};
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                pushReading(readings, topicId, `major_${number.padStart(2, '0')}`, orientation, major[number]?.[orientation]);
            });
        });
        SUITS.forEach((suit) => {
            RANKS.forEach((rank) => {
                ORIENTATIONS.forEach((orientation) => {
                    pushReading(readings, topicId, `${suit}_${rank}`, orientation, minor[suit]?.[rank]?.[orientation]);
                });
            });
        });
    });
    return readings;
}

function collectGeneratedReadings(tables) {
    const cards = Array.isArray(tables.allCards) ? tables.allCards : [];
    const topics = (tables.TOPICS || []).filter((topic) => GENERATED_TOPIC_IDS.includes(topic.id));
    const generated = [];
    topics.forEach((topic) => {
        cards.forEach((card) => {
            ORIENTATIONS.forEach((orientation) => {
                const meaning = card.meanings?.[orientation] || card.meanings?.upright;
                const specialBody = tables.getSpecialReadingBody?.(topic.id, card, orientation);
                const text = specialBody && RICH_TOPIC_IDS.includes(topic.id)
                    ? tables.buildRichReading?.(topic, card, orientation, meaning, specialBody)
                    : tables.buildStandardReading?.(topic, card, orientation, meaning);
                generated.push({
                    topicId: topic.id,
                    loc: card.id,
                    orientation,
                    text: String(text || '').trim()
                });
            });
        });
    });
    return generated;
}

function getAuditText(text) {
    return String(text || '')
        .split(/\r?\n/)
        .filter((line) => !line.startsWith('【'))
        .join('\n');
}

function collectWeatherStatuses(tables) {
    const cards = Array.isArray(tables.allCards) ? tables.allCards : [];
    const getWeatherStatus = tables.getWeatherStatus;
    if (typeof getWeatherStatus !== 'function') return [];
    return cards.flatMap((card) => ORIENTATIONS.map((orientation) => {
        const status = getWeatherStatus(card, orientation);
        return {
            cardId: card.id,
            orientation,
            status
        };
    }));
}

const PROFILE_TOPICS = ['overall', 'love', 'work', 'relation', 'future', 'money', 'today'];
const PROFILE_SECTIONS = ['conclusion', 'situation', 'action', 'taboo', 'closing'];
const STANCE_IDS = ['charge', 'advance', 'hold', 'guard', 'cut'];
const RICH_TOPIC_IDS = ['love', 'work', 'relation', 'future'];

function collectProfileGaps(tables) {
    const gaps = [];
    PROFILE_TOPICS.forEach((topicId) => {
        const profile = tables.READING_PROFILES?.[topicId];
        if (!profile) {
            gaps.push(`${topicId}: profile missing`);
            return;
        }
        PROFILE_SECTIONS.forEach((section) => {
            STANCE_IDS.forEach((stance) => {
                if (!String(profile[section]?.[stance] || '').trim()) {
                    gaps.push(`${topicId}.${section}.${stance}`);
                }
            });
        });
    });
    return gaps;
}

function collectStanceCoverage(tables) {
    const cards = Array.isArray(tables.allCards) ? tables.allCards : [];
    const getStanceId = tables.getStanceId;
    if (typeof getStanceId !== 'function') return { invalid: ['getStanceId missing'], used: [] };
    const invalid = [];
    const used = new Set();
    cards.forEach((card) => {
        ORIENTATIONS.forEach((orientation) => {
            const stance = getStanceId(card, orientation);
            if (!STANCE_IDS.includes(stance)) {
                invalid.push(`${card.id}:${orientation} -> ${stance}`);
            } else {
                used.add(stance);
            }
        });
    });
    return { invalid, used: [...used] };
}

function collectSimpleMeaningCoverage(tables) {
    const missing = [];
    MAJOR_KEYS.forEach((number) => {
        ORIENTATIONS.forEach((orientation) => {
            if (!String(tables.SIMPLE_MAJOR_THEMES?.[number]?.[orientation] || '').trim()) {
                missing.push(`major_${number.padStart(2, '0')}:${orientation}`);
            }
        });
    });
    RICH_TOPIC_IDS.forEach((topicId) => {
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                if (!String(tables.SIMPLE_MAJOR_TOPIC_THEMES?.[topicId]?.[number]?.[orientation] || '').trim()) {
                    missing.push(`${topicId}.major_${number.padStart(2, '0')}:${orientation}`);
                }
            });
        });
    });
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            ORIENTATIONS.forEach((orientation) => {
                if (!String(tables.SIMPLE_MINOR_THEMES?.[suit]?.[rank]?.[orientation] || '').trim()) {
                    missing.push(`${suit}_${rank}:${orientation}`);
                }
            });
        });
    });
    return missing;
}

function collectMinorCardWordCoverage(tables) {
    const missing = [];
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            ORIENTATIONS.forEach((orientation) => {
                if (!String(tables.MINOR_CARD_WORDS?.[suit]?.[rank]?.[orientation] || '').trim()) {
                    missing.push(`${suit}_${rank}:${orientation}`);
                }
            });
        });
    });
    return missing;
}

function collectMajorCardWordCoverage(tables) {
    const missing = [];
    MAJOR_KEYS.forEach((number) => {
        ORIENTATIONS.forEach((orientation) => {
            if (!String(tables.MAJOR_CARD_WORDS?.[Number(number)]?.[orientation] || '').trim()) {
                missing.push(`major_${number.padStart(2, '0')}:${orientation}`);
            }
        });
    });
    return missing;
}

function main() {
    const tables = loadTables();
    const readings = collectReadings(tables);
    const generatedReadings = collectGeneratedReadings(tables);
    const weatherStatuses = collectWeatherStatuses(tables);
    const missingSimpleMeanings = collectSimpleMeaningCoverage(tables);
    const missingMajorCardWords = collectMajorCardWordCoverage(tables);
    const missingMinorCardWords = collectMinorCardWordCoverage(tables);
    const profileGaps = collectProfileGaps(tables);
    const stanceCoverage = collectStanceCoverage(tables);
    const missing = readings.filter((entry) => !entry.text);
    const duplicates = [];
    const seen = new Map();
    const flagged = [];
    const generatedFlagged = [];
    const todayMisuse = [];
    const qualityFlagged = [];
    const invalidSimpleMeaningLines = [];
    const invalidWeather = weatherStatuses.filter((entry) => !Number.isInteger(entry.status?.level) || entry.status.level < 1 || entry.status.level > 10 || !entry.status.windLabel || !entry.status.verdict);

    readings.forEach((entry) => {
        if (!entry.text) return;
        const duplicateOf = seen.get(entry.text);
        if (duplicateOf) {
            duplicates.push([duplicateOf, `${entry.topicId}:${entry.loc}:${entry.orientation}`]);
        } else {
            seen.set(entry.text, `${entry.topicId}:${entry.loc}:${entry.orientation}`);
        }
        const auditText = getAuditText(entry.text);
        const hits = (RED_FLAGS[entry.topicId] || []).filter((word) => auditText.includes(word));
        if (hits.length) {
            flagged.push({ ...entry, hits });
        }
    });

    generatedReadings.forEach((entry) => {
        if (!entry.text) return;
        const auditText = getAuditText(entry.text);
        const hits = (RED_FLAGS[entry.topicId] || []).filter((word) => auditText.includes(word));
        if (hits.length) generatedFlagged.push({ ...entry, hits });
        const qualityHits = TEXT_QUALITY_FLAGS.filter((word) => entry.text.includes(word));
        if (qualityHits.length) qualityFlagged.push({ ...entry, hits: qualityHits });
        if (entry.topicId !== 'today' && entry.text.includes('今日')) todayMisuse.push(entry);
        if (!SIMPLE_MEANING_RE.test(entry.text)) invalidSimpleMeaningLines.push(entry);
    });

    const summary = readings.reduce((acc, entry) => {
        acc[entry.topicId] = (acc[entry.topicId] || 0) + 1;
        return acc;
    }, {});
    const errors = [];
    Object.entries(summary).forEach(([topicId, count]) => {
        if (count !== 156) errors.push(`${topicId} has ${count} readings, expected 156`);
    });
    if (missing.length) errors.push(`${missing.length} readings are missing`);
    if (duplicates.length) errors.push(`${duplicates.length} duplicate readings found`);
    if (flagged.length) errors.push(`${flagged.length} category red-flag readings found`);
    if (generatedReadings.length !== GENERATED_TOPIC_IDS.length * 156) errors.push(`generated has ${generatedReadings.length} readings, expected ${GENERATED_TOPIC_IDS.length * 156}`);
    if (generatedFlagged.length) errors.push(`${generatedFlagged.length} generated category red-flag readings found`);
    if (todayMisuse.length) errors.push(`${todayMisuse.length} non-today generated readings contain 今日`);
    if (qualityFlagged.length) errors.push(`${qualityFlagged.length} generated readings contain known typo/quality flags`);
    if (invalidSimpleMeaningLines.length) errors.push(`${invalidSimpleMeaningLines.length} generated readings have invalid simple meaning format`);
    if (weatherStatuses.length !== 156) errors.push(`weather has ${weatherStatuses.length} statuses, expected 156`);
    if (invalidWeather.length) errors.push(`${invalidWeather.length} invalid weather statuses found`);
    if (!weatherStatuses.some((entry) => entry.status?.level === 1)) errors.push('weather level 1 is missing');
    if (!weatherStatuses.some((entry) => entry.status?.level === 10)) errors.push('weather level 10 is missing');
    if (missingSimpleMeanings.length) errors.push(`${missingSimpleMeanings.length} simple card meanings are missing`);
    if (missingMajorCardWords.length) errors.push(`${missingMajorCardWords.length} major card words are missing`);
    if (missingMinorCardWords.length) errors.push(`${missingMinorCardWords.length} minor card words are missing`);
    if (profileGaps.length) errors.push(`${profileGaps.length} reading profile entries are missing`);
    if (stanceCoverage.invalid.length) errors.push(`${stanceCoverage.invalid.length} invalid stances found`);
    STANCE_IDS.forEach((stance) => {
        if (!stanceCoverage.used.includes(stance)) errors.push(`stance "${stance}" is never used`);
    });

    if (errors.length) {
        console.error('[tarot-audit] FAILED');
        errors.forEach((error) => console.error(`- ${error}`));
        missing.slice(0, 20).forEach((entry) => console.error(`missing: ${entry.topicId}:${entry.loc}:${entry.orientation}`));
        duplicates.slice(0, 20).forEach(([first, second]) => console.error(`duplicate: ${first} == ${second}`));
        flagged.slice(0, 20).forEach((entry) => console.error(`red-flag: ${entry.topicId}:${entry.loc}:${entry.orientation} [${entry.hits.join(', ')}]`));
        generatedFlagged.slice(0, 20).forEach((entry) => console.error(`generated-red-flag: ${entry.topicId}:${entry.loc}:${entry.orientation} [${entry.hits.join(', ')}]`));
        todayMisuse.slice(0, 20).forEach((entry) => console.error(`today-misuse: ${entry.topicId}:${entry.loc}:${entry.orientation}`));
        qualityFlagged.slice(0, 20).forEach((entry) => console.error(`quality: ${entry.topicId}:${entry.loc}:${entry.orientation} [${entry.hits.join(', ')}]`));
        invalidSimpleMeaningLines.slice(0, 20).forEach((entry) => console.error(`simple-format: ${entry.topicId}:${entry.loc}:${entry.orientation}`));
        invalidWeather.slice(0, 20).forEach((entry) => console.error(`weather: ${entry.cardId}:${entry.orientation} ${JSON.stringify(entry.status)}`));
        missingSimpleMeanings.slice(0, 20).forEach((entry) => console.error(`simple-meaning: ${entry}`));
        missingMajorCardWords.slice(0, 20).forEach((entry) => console.error(`major-card-word: ${entry}`));
        missingMinorCardWords.slice(0, 20).forEach((entry) => console.error(`minor-card-word: ${entry}`));
        profileGaps.slice(0, 20).forEach((entry) => console.error(`profile: ${entry}`));
        stanceCoverage.invalid.slice(0, 20).forEach((entry) => console.error(`stance: ${entry}`));
        process.exit(1);
    }

    const weatherLevels = [...new Set(weatherStatuses.map((entry) => entry.status.level))].sort((a, b) => a - b);
    console.log(`[tarot-audit] OK ${Object.entries(summary).map(([topicId, count]) => `${topicId}:${count}`).join(' ')} generated:${generatedReadings.length} weather:${weatherStatuses.length} simple:${44 + (RICH_TOPIC_IDS.length * 44) + 112} majorWords:44 minorWords:112 levels:${weatherLevels.join(',')} stances:${stanceCoverage.used.sort().join(',')}`);
}

main();
