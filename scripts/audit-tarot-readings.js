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
const RED_FLAGS = {
    love: ['仕事', '職場', '業務', '事業', '会社', '売上', '利益', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '人間関係', 'コミュニティ', 'グループ', '人脈'],
    work: ['恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談', 'ワンナイト', '愛情', '伴侶'],
    relation: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談'],
    future: ['仕事', '職場', '業務', '事業', '会社', '売上', '案件', '取引先', 'クライアント', '部下', '上司', '会議', '現場', '予算', '納期', '投資', '市場', '競合', '経営', 'プロジェクト', 'タスク', '監査', '恋愛', '恋人', '片思い', '復縁', '告白', 'デート', '失恋', '浮気', '結婚', '縁談']
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
    '早めにに'
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

function loadTables() {
    const code = fs.readFileSync(SOURCE_PATH, 'utf8');
    const context = {
        window: {},
        document: {
            querySelectorAll: () => [],
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
  SIMPLE_MAJOR_TOPIC_THEMES,
  SIMPLE_MINOR_THEMES,
  STAFF_TOPIC_FRAMES,
  SUBTOPICS,
  SUBTOPIC_READING_FRAMES,
  MINOR_TOPIC_FOCUS,
  MAJOR_STAFF_GUIDANCE,
  MINOR_STAFF_GUIDANCE,
  MAJOR_WEATHER_LEVELS,
  MINOR_WEATHER_LEVELS,
  TOPICS,
  allCards,
  getWeatherStatus,
  getStaffTheme,
  getStaffGuidance,
  getSubtopicReadingFrame,
  getSpecialReadingBody,
  buildStaffReading,
  buildLineReading
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
                        staffText: String(tables.buildStaffReading(topic, card, orientation, subtopic) || '').trim(),
                        lineText: String(tables.buildLineReading(card, orientation, sourceText, topic, subtopic) || '').trim()
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
        MAJOR_KEYS.forEach((number) => {
            ORIENTATIONS.forEach((orientation) => {
                if (!String(tables.SIMPLE_MAJOR_TOPIC_THEMES?.[topicId]?.[number]?.[orientation] || '').trim()) {
                    gaps.push(`theme:${topicId}.major_${number}:${orientation}`);
                }
            });
        });
        SUITS.forEach((suit) => {
            if (!String(tables.MINOR_TOPIC_FOCUS?.[topicId]?.[suit] || '').trim()) {
                gaps.push(`focus:${topicId}.${suit}`);
            }
        });
        const expectedSubtopics = SUBTOPIC_IDS[topicId];
        const actualSubtopics = (tables.SUBTOPICS?.[topicId] || []).map((subtopic) => subtopic.id);
        if (actualSubtopics.join(',') !== expectedSubtopics.join(',')) {
            gaps.push(`subtopics:${topicId}:${actualSubtopics.join(',') || 'empty'}`);
        }
        expectedSubtopics.forEach((subtopicId) => {
            const frame = tables.SUBTOPIC_READING_FRAMES?.[topicId]?.[subtopicId];
            ['meaningContext', 'pointLead', 'actionLead', 'cautionLead', 'subject', 'target', 'evidence', 'step', 'resource', 'boundary', 'result', 'support'].forEach((field) => {
                if (!String(frame?.[field] || '').trim()) gaps.push(`subtopic-frame:${topicId}.${subtopicId}.${field}`);
            });
            ['major', ...SUITS].forEach((cardGroup) => {
                const focus = frame?.focus?.[cardGroup];
                if (!Array.isArray(focus) || focus.length !== 2 || focus.some((text) => !String(text || '').trim())) {
                    gaps.push(`subtopic-focus:${topicId}.${subtopicId}.${cardGroup}`);
                }
            });
        });
    });
    SUITS.forEach((suit) => {
        RANKS.forEach((rank) => {
            ORIENTATIONS.forEach((orientation) => {
                const weatherLevel = tables.MINOR_WEATHER_LEVELS?.[suit]?.[rank]?.[orientation];
                if (!Number.isInteger(weatherLevel) || weatherLevel < 1 || weatherLevel > 10) {
                    gaps.push(`weather:${suit}_${rank}:${orientation}`);
                }
                if (!String(tables.SIMPLE_MINOR_THEMES?.[suit]?.[rank]?.[orientation] || '').trim()) {
                    gaps.push(`theme:${suit}_${rank}:${orientation}`);
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

function main() {
    const tables = loadTables();
    const sourceReadings = collectSourceReadings(tables);
    const generated = collectGeneratedReadings(tables);
    const errors = [];
    const details = [];
    const expectedTopics = TOPIC_IDS.join(',');
    const actualTopics = tables.TOPICS.map((topic) => topic.id).join(',');

    if (actualTopics !== expectedTopics) errors.push(`store topics are ${actualTopics || 'empty'}, expected ${expectedTopics}`);
    if (sourceReadings.length !== 624) errors.push(`source readings: ${sourceReadings.length}, expected 624`);
    if (generated.length !== 3120) errors.push(`generated readings: ${generated.length}, expected 3120`);

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
    const uniquePoints = new Set(generatedSections.map((entry) => entry.sections['鑑定の要点'])).size;
    const uniqueActions = new Set(generatedSections.map((entry) => entry.sections['すすめる行動'])).size;
    const uniqueCautions = new Set(generatedSections.map((entry) => entry.sections['注意点'])).size;
    if (uniquePoints < 3000) errors.push(`staff points are too repetitive: ${uniquePoints} unique, expected at least 3000`);
    if (uniqueActions < 3000) errors.push(`staff actions are too repetitive: ${uniqueActions} unique, expected at least 3000`);
    if (uniqueCautions < 3000) errors.push(`staff cautions are too repetitive: ${uniqueCautions} unique, expected at least 3000`);

    const minorStateGroups = new Map();
    generatedSections.filter((entry) => !entry.loc.startsWith('major-')).forEach((entry) => {
        const key = `${entry.loc}:${entry.orientation}`;
        if (!minorStateGroups.has(key)) minorStateGroups.set(key, new Set());
        minorStateGroups.get(key).add(entry.sections['今の状態']);
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
        if (entry.lineText.length > 3200) details.push(`line-too-long:${identity}:${entry.lineText.length}`);
        if (!/^風向き: [^\n]+\n\n[^\n]/.test(entry.lineText)) details.push(`line-format:${identity}`);
        const forbiddenLine = LINE_FORBIDDEN_TEXT.filter((word) => entry.lineText.includes(word));
        if (forbiddenLine.length) details.push(`line-mixed:${identity} [${forbiddenLine.join(', ')}]`);
        const firstSourceSentence = entry.sourceText.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstSourceSentence && !entry.lineText.includes(firstSourceSentence)) details.push(`line-source:${identity}`);
        const forbiddenStaff = STAFF_FORBIDDEN_TEXT.filter((word) => entry.staffText.includes(word));
        if (forbiddenStaff.length) details.push(`staff-voice:${identity} [${forbiddenStaff.join(', ')}]`);
        if (entry.staffText.includes('今日') || entry.lineText.includes('今日')) details.push(`generated-today:${identity}`);
        if (entry.staffText.split(/\r?\n/).filter(Boolean).length !== 6) details.push(`staff-format:${identity}`);
        if (/\{[a-z]+\}/.test(entry.staffText)) details.push(`staff-placeholder:${identity}`);
        const subtopicFrame = tables.getSubtopicReadingFrame(entry.topicId, entry.subtopicId);
        if (!entry.staffText.includes(`【${tables.TOPICS.find((topic) => topic.id === entry.topicId)?.label}・${entry.subtopicLabel}鑑定】`)) {
            details.push(`staff-heading-subtopic:${identity}`);
        }
        if (!entry.staffText.includes(`このカードが持つ意味は、${subtopicFrame?.meaningContext}`)) {
            details.push(`staff-meaning-subtopic:${identity}`);
        }
        const card = tables.allCards.find((candidate) => candidate.id === entry.loc);
        const cardGroup = card?.kind === 'major' ? 'major' : card?.suitId;
        const staffFocus = subtopicFrame?.focus?.[cardGroup]?.[0];
        const lineFocus = subtopicFrame?.focus?.[cardGroup]?.[1];
        if (staffFocus && !entry.sections['今の状態']?.includes(staffFocus)) {
            details.push(`staff-focus-subtopic:${identity}`);
        }
        const firstLineFocusSentence = lineFocus?.match(/[^。！？!?]+[。！？!?]?/)?.[0]?.trim();
        if (firstLineFocusSentence && !entry.lineText.includes(firstLineFocusSentence)) {
            details.push(`line-focus-subtopic:${identity}`);
        }
        ['今の状態', '鑑定の要点', 'すすめる行動', '注意点'].forEach((label) => {
            if (String(entry.sections[label] || '').length < 12) details.push(`staff-section:${identity}:${label}`);
        });
        const staffBody = entry.staffText.split(/\r?\n/).slice(1).join('\n');
        const redFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => staffBody.includes(word));
        if (redFlags.length) details.push(`staff-category:${identity} [${redFlags.join(', ')}]`);
        const lineRedFlags = (RED_FLAGS[entry.topicId] || []).filter((word) => entry.lineText.includes(word));
        if (lineRedFlags.length) details.push(`line-category:${identity} [${lineRedFlags.join(', ')}]`);
        const qualityFlags = TEXT_QUALITY_FLAGS.filter((word) => `${entry.staffText}\n${entry.lineText}`.includes(word));
        if (qualityFlags.length) details.push(`generated-quality:${identity} [${qualityFlags.join(', ')}]`);
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
    console.log(`[tarot-audit] OK source:${sourceReadings.length} staff:${generated.length} line:${generated.length} topics:${actualTopics} levels:${levels.join(',')} unique:${uniquePoints}/${uniqueActions}/${uniqueCautions}`);
}

main();
